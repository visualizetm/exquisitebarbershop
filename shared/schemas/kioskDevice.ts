import { z } from 'zod';
import { idSchema, nonEmptyText } from './common';

/**
 * A front desk tablet paired by the owner. It holds nothing but a device token (hashed) and an
 * exit PIN (hashed); until it is paired it carries a one-use pairing code (hashed) that dies after
 * ten minutes. A revoked device is kept for the audit trail and never answers again.
 */
export const kioskDeviceDocumentSchema = z.object({
  _id: idSchema,
  name: nonEmptyText(40),
  /** sha256 of the device token in the cookie; null until the tablet pairs. */
  tokenHash: z.string().nullable(),
  exitPinHash: z.string(),
  /** The one-use pairing code, keyed hash; cleared on pairing. */
  pairCodeHash: z.string().nullable(),
  pairCodeExpiresAt: z.date().nullable(),
  pairedAt: z.date().nullable(),
  lastSeenAt: z.date().nullable(),
  revokedAt: z.date().nullable(),
  /** Paired by the showcase's "Use the demo tablet"; cleared by the demo reset. */
  demo: z.boolean().default(false),
  createdAt: z.date(),
});
export type KioskDeviceDocument = z.infer<typeof kioskDeviceDocumentSchema>;
