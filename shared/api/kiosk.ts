import { z } from 'zod';
import { PIN_PATTERN } from '../lib/pin';
import { idSchema, nonEmptyText, phoneSchema } from '../schemas/common';
import { chairEstimateSchema, nowGateViewSchema, waitEstimateViewSchema } from './line';
import { photoViewSchema } from './photos';

/**
 * The locked front desk tablet. Every response here faces the room: first name and last initial
 * at most, never a phone, an email or a full name.
 */
export const kioskPairRequestSchema = z.object({ code: z.string().regex(/^\d{6}$/) });
export const kioskPairResponseSchema = z.object({ device: z.object({ name: z.string() }) });
export const kioskExitRequestSchema = z.object({ exitPin: z.string().regex(PIN_PATTERN) });

/** One barber on the board. The status words come from the hours rule and the chair's estimate. */
export const kioskTileSchema = z.object({
  staffId: idSchema,
  name: z.string(),
  chairNumber: z.int().nullable(),
  photo: photoViewSchema.nullable(),
  /** free (white), busy (red), away (steel: break, later start, done). */
  tone: z.enum(['free', 'busy', 'away']),
  status: z.string(),
  waiting: z.int().min(0),
});
export type KioskTile = z.infer<typeof kioskTileSchema>;

/** Shaped so the booking flow can read it as a line response (chairs, now, firstAvailable). */
export const kioskBoardResponseSchema = z.object({
  now: z.iso.datetime(),
  /** Always empty: the tablet never sees who is waiting, only how many. */
  line: z.array(z.never()),
  chairs: z.array(chairEstimateSchema),
  firstAvailable: nowGateViewSchema,
  shop: z.object({
    name: z.string(),
    /** "10 AM to 7 PM" or "Closed today". */
    hoursToday: z.string(),
    open: z.boolean(),
    /** "Closed now. Opens Wed 10 AM." while closed. */
    closedText: z.string().nullable(),
  }),
  tiles: z.array(kioskTileSchema),
  offToday: z.array(z.string()),
});
export type KioskBoardResponse = z.infer<typeof kioskBoardResponseSchema>;

/** A walk in from the tablet: the same request as NOW, answered without the client's details. */
export const kioskNowRequestSchema = z.object({
  serviceIds: z.array(idSchema).min(1).max(6),
  staffId: idSchema.nullable().optional(),
  customer: z.object({ name: nonEmptyText(80), phone: phoneSchema }),
});
export const kioskNowResponseSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('booking'),
    booking: z.object({
      id: idSchema,
      staff: z.object({ id: idSchema, name: z.string() }),
      chairNumber: z.int().nullable(),
    }),
  }),
  z.object({
    kind: z.literal('line'),
    walkIn: z.object({
      position: z.int().min(0),
      staffName: z.string(),
      estimate: waitEstimateViewSchema,
    }),
  }),
]);
export type KioskNowResponse = z.infer<typeof kioskNowResponseSchema>;

// The owner's side: Settings, Check in tablets.
export const kioskDeviceViewSchema = z.object({
  id: idSchema,
  name: z.string(),
  paired: z.boolean(),
  pairedAt: z.iso.datetime().nullable(),
  lastSeenAt: z.iso.datetime().nullable(),
  /** Still waiting for the tablet to type the code. */
  codeExpiresAt: z.iso.datetime().nullable(),
});
export type KioskDeviceView = z.infer<typeof kioskDeviceViewSchema>;
export const kioskDeviceListResponseSchema = z.object({ devices: z.array(kioskDeviceViewSchema) });
export const kioskDeviceCreateRequestSchema = z.object({
  name: nonEmptyText(40),
  exitPin: z.string().regex(PIN_PATTERN),
});
export const kioskDeviceCreateResponseSchema = z.object({
  device: kioskDeviceViewSchema,
  /** Shown once; the tablet types it within ten minutes. */
  code: z.string().regex(/^\d{6}$/),
});
