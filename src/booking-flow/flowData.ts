import { useEffect, useState } from 'react';
import {
  manualBookingResponseSchema,
  nowResponseSchema,
  serviceListResponseSchema,
  staffListResponseSchema,
  type NowResponse,
} from '@shared/api/admin';
import {
  lineResponseSchema,
  type ChairEstimate,
  type LineResponse,
  type NowGateView,
} from '@shared/api/line';
import { publicServicesResponseSchema, publicStaffListResponseSchema } from '@shared/api/public';
import type { ServicePrice } from '@shared/schemas/staff';
import { apiRequest } from '@/lib/api';

/** Who is booking: the owner (any chair), a barber on their own chair, or the locked front desk tablet. */
export type FlowSession = 'owner' | 'team' | 'kiosk';

/** The API each session books through; the kiosk's answers carry no client details. */
export const FLOW_API: Record<FlowSession, { line: string; now: string }> = {
  owner: { line: '/api/admin/line', now: '/api/admin/now' },
  team: { line: '/api/team/line', now: '/api/team/now' },
  // The board is shaped like the line response (chairs, now, firstAvailable, an empty line).
  kiosk: { line: '/api/kiosk/board', now: '/api/kiosk/now' },
};

export interface FlowService {
  id: string;
  name: string;
  group: string;
  priceCents: number;
  priceFrom: boolean;
  durationMinutes: number;
}

export interface FlowChair {
  id: string;
  slug: string;
  name: string;
  chairNumber: number | null;
  sortOrder: number;
  serviceIds: readonly string[];
  servicePrices: readonly ServicePrice[];
  acceptsOnlineBooking: boolean;
  showOnWebsite: boolean;
}

export interface FlowData {
  services: FlowService[];
  chairs: FlowChair[];
}

/** The menu and the chairs, from the admin API for the owner and the public API for a barber. */
export function useFlowData(session: FlowSession, open: boolean): FlowData | 'loading' | 'error' {
  const [state, setState] = useState<FlowData | 'loading' | 'error'>('loading');
  useEffect(() => {
    if (!open) return;
    let gone = false;
    setState('loading');
    const load = async (): Promise<FlowData> => {
      if (session === 'owner') {
        const [services, staff] = await Promise.all([
          apiRequest('/api/admin/services', serviceListResponseSchema),
          apiRequest('/api/admin/staff', staffListResponseSchema),
        ]);
        return {
          services: services.services
            .filter((s) => s.isActive && !s.deletedAt)
            .map((s) => ({
              id: s.id,
              name: s.name,
              group: s.group,
              priceCents: s.priceCents,
              priceFrom: s.priceFrom,
              durationMinutes: s.durationMinutes,
            })),
          chairs: staff.staff
            .filter((s) => !s.deletedAt)
            .map((s) => ({
              id: s.id,
              slug: s.slug,
              name: s.name,
              chairNumber: s.chairNumber,
              sortOrder: s.sortOrder,
              serviceIds: s.serviceIds,
              servicePrices: s.servicePrices,
              acceptsOnlineBooking: s.acceptsOnlineBooking,
              showOnWebsite: s.showOnWebsite,
            })),
        };
      }
      const [services, staff] = await Promise.all([
        apiRequest('/api/services', publicServicesResponseSchema),
        apiRequest('/api/staff', publicStaffListResponseSchema),
      ]);
      return {
        services: services.services.map((s) => ({
          id: s.id,
          name: s.name,
          group: s.group,
          priceCents: s.priceCents,
          priceFrom: s.priceFrom,
          durationMinutes: s.durationMinutes,
        })),
        chairs: staff.staff.map((s) => ({
          id: s.id,
          slug: s.slug,
          name: s.name,
          chairNumber: s.chairNumber,
          sortOrder: s.sortOrder,
          serviceIds: s.serviceIds,
          servicePrices: s.servicePrices,
          acceptsOnlineBooking: s.acceptsOnlineBooking,
          showOnWebsite: true,
        })),
      };
    };
    load()
      .then((data) => {
        if (!gone) setState(data);
      })
      .catch(() => {
        if (!gone) setState('error');
      });
    return () => {
      gone = true;
    };
  }, [session, open]);
  return state;
}

/** Each chair's wait right now, refreshed when `tick` changes. */
export function useChairEstimates(
  session: FlowSession,
  open: boolean,
  tick: number,
): {
  chairs: ChairEstimate[];
  line: LineResponse['line'];
  now: string | null;
  firstAvailable: NowGateView | null;
} {
  const [data, setData] = useState<LineResponse | null>(null);
  useEffect(() => {
    if (!open) return;
    let gone = false;
    apiRequest(FLOW_API[session].line, lineResponseSchema, { fresh: true })
      .then((d) => {
        if (!gone) setData(d);
      })
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  }, [session, open, tick]);
  return {
    chairs: data?.chairs ?? [],
    line: data?.line ?? [],
    now: data?.now ?? null,
    firstAvailable: data?.firstAvailable ?? null,
  };
}

export const nowSchema = nowResponseSchema;
export type { NowResponse };
export const bookedSchema = manualBookingResponseSchema;
