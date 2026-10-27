import { z } from 'zod';
import {
  checkInArrivedResponseSchema,
  checkInLookupQuerySchema,
  checkInLookupResponseSchema,
} from '../../../shared/api/checkIn';
import {
  kioskBoardResponseSchema,
  kioskExitRequestSchema,
  kioskNowRequestSchema,
  kioskNowResponseSchema,
  kioskPairRequestSchema,
  kioskPairResponseSchema,
} from '../../../shared/api/kiosk';
import {
  pairDemoKioskDevice,
  pairKioskDevice,
  unpairKioskDevice,
  verifyKioskExitPin,
} from '../../auth/kioskAuth';
import { AppError } from '../../lib/errors';
import { rateLimitsRepo } from '../../repos';
import { arriveFromCheckIn, lookupToday } from '../../services/checkIn';
import { kioskBoard, kioskNow } from '../../services/line';
import { idempotencyKeyOf, metaOf, NO_STORE, principalOf } from '../context';
import { parseBody, parseParams, parseQuery } from '../request';
import type { RequestContext, RouteDefinition } from '../types';

const idParams = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/) });
const okResponseSchema = z.object({ ok: z.literal(true) });
/** The room-facing lookups and walk ins: generous for a shop, far too low for a scan. */
const KIOSK_IP_LIMIT = { limit: 120, windowMs: 60_000 };

async function limited(ctx: RequestContext): Promise<void> {
  const meta = metaOf(ctx);
  const hit = await rateLimitsRepo.hitRateLimit(`kiosk:ip:${meta.ip}`, KIOSK_IP_LIMIT, meta.now);
  if (!hit.allowed) {
    throw new AppError('RATE_LIMITED', 'Too many requests. Please wait a moment.', {
      retryAfterSeconds: hit.retryAfterSeconds,
    });
  }
}

/**
 * The locked front desk tablet. It pairs once with the owner's code and from then on reaches
 * exactly these routes: the board, the masked lookup, the arrived tap, and NOW through the one
 * booking path. Nothing here ever returns a phone, an email or a full name.
 */
export const kioskRoutes: RouteDefinition[] = [
  {
    method: 'POST',
    path: '/api/kiosk/pair',
    auth: 'public',
    handler: async (ctx) => {
      const { code } = await parseBody(ctx, kioskPairRequestSchema);
      const device = await pairKioskDevice(ctx.res, code, metaOf(ctx));
      return { body: kioskPairResponseSchema.parse({ device }), headers: NO_STORE };
    },
  },
  {
    method: 'POST',
    path: '/api/kiosk/pair-demo',
    auth: 'public',
    demoOnly: true,
    handler: async (ctx) => {
      const device = await pairDemoKioskDevice(ctx.res, metaOf(ctx));
      return { body: kioskPairResponseSchema.parse({ device }), headers: NO_STORE };
    },
  },
  {
    method: 'GET',
    path: '/api/kiosk/board',
    auth: 'kiosk',
    handler: async (ctx) => ({
      body: kioskBoardResponseSchema.parse(await kioskBoard(ctx.now)),
      headers: NO_STORE,
    }),
  },
  {
    method: 'GET',
    path: '/api/kiosk/lookup',
    auth: 'kiosk',
    handler: async (ctx) => {
      await limited(ctx);
      const { q } = parseQuery(ctx, checkInLookupQuerySchema);
      return {
        body: checkInLookupResponseSchema.parse({
          matches: await lookupToday({ kind: 'all' }, q, ctx.now),
        }),
        headers: NO_STORE,
      };
    },
  },
  {
    method: 'POST',
    path: '/api/kiosk/bookings/:id/arrived',
    auth: 'kiosk',
    handler: async (ctx) => {
      await limited(ctx);
      const { id } = parseParams(ctx, idParams);
      const match = await arriveFromCheckIn(principalOf(ctx), { kind: 'all' }, id, metaOf(ctx));
      return { body: checkInArrivedResponseSchema.parse({ match }), headers: NO_STORE };
    },
  },
  {
    method: 'POST',
    path: '/api/kiosk/now',
    auth: 'kiosk',
    handler: async (ctx) => {
      await limited(ctx);
      const key = idempotencyKeyOf(ctx);
      const input = await parseBody(ctx, kioskNowRequestSchema);
      const done = await kioskNow(
        principalOf(ctx),
        { ...input, customer: { ...input.customer, email: null } },
        { ...metaOf(ctx), idempotencyKey: key },
      );
      return { status: 201, body: kioskNowResponseSchema.parse(done), headers: NO_STORE };
    },
  },
  {
    method: 'POST',
    path: '/api/kiosk/exit',
    auth: 'kiosk',
    handler: async (ctx) => {
      const { exitPin } = await parseBody(ctx, kioskExitRequestSchema);
      await verifyKioskExitPin(principalOf(ctx), exitPin, metaOf(ctx));
      return { body: okResponseSchema.parse({ ok: true }), headers: NO_STORE };
    },
  },
  {
    method: 'POST',
    path: '/api/kiosk/unpair',
    auth: 'kiosk',
    handler: async (ctx) => {
      const principal = principalOf(ctx);
      const { exitPin } = await parseBody(ctx, kioskExitRequestSchema);
      await verifyKioskExitPin(principal, exitPin, metaOf(ctx));
      await unpairKioskDevice(ctx.res, principal.userId, principal, metaOf(ctx));
      return { body: okResponseSchema.parse({ ok: true }), headers: NO_STORE };
    },
  },
];
