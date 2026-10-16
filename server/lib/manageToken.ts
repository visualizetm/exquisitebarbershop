import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { idSchema } from '../../shared/schemas/common';

/**
 * Customer manage link token.
 *
 * Format: v1.<payload>.<signature>
 *   payload   base64url(JSON { b: bookingId, v: manageTokenVersion, exp: unix seconds })
 *   signature base64url(HMAC-SHA256(secret, "v1." + payload))
 *
 * Properties:
 * - Stateless: verification needs only the secret and the booking's current
 *   manageTokenVersion. No token table.
 * - Revocable: bumping manageTokenVersion on the booking invalidates every link
 *   issued before (used on reschedule and cancel).
 * - Expiring: exp is the booking end plus a grace period, so a link cannot be used
 *   to poke at a long-finished booking.
 * - Scope: a valid token lets the holder view, cancel or reschedule that one
 *   booking, subject to the cutoff rules. Nothing else.
 */
const VERSION = 'v1';

const payloadSchema = z.object({
  b: idSchema,
  v: z.int().min(1),
  exp: z.int().min(0),
});
export type ManageTokenPayload = z.infer<typeof payloadSchema>;

export type ManageTokenResult =
  | { ok: true; payload: ManageTokenPayload }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' };

function sign(secret: string, signedPart: string): Buffer {
  return createHmac('sha256', secret).update(signedPart).digest();
}

export function createManageToken(
  secret: string,
  input: { bookingId: string; version: number; expiresAt: Date },
): string {
  const payload: ManageTokenPayload = {
    b: input.bookingId,
    v: input.version,
    exp: Math.floor(input.expiresAt.getTime() / 1000),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signedPart = `${VERSION}.${encoded}`;
  return `${signedPart}.${sign(secret, signedPart).toString('base64url')}`;
}

export function verifyManageToken(
  secret: string,
  token: string,
  now: Date = new Date(),
): ManageTokenResult {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== VERSION) return { ok: false, reason: 'malformed' };
  const [, encoded, signature] = parts as [string, string, string];
  const expected = sign(secret, `${VERSION}.${encoded}`);
  let provided: Buffer;
  try {
    provided = Buffer.from(signature, 'base64url');
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { ok: false, reason: 'bad_signature' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  const payload = payloadSchema.safeParse(parsed);
  if (!payload.success) return { ok: false, reason: 'malformed' };
  if (payload.data.exp * 1000 < now.getTime()) return { ok: false, reason: 'expired' };
  return { ok: true, payload: payload.data };
}

/** Path the customer opens. The token travels in the query string, never in the path. */
export function managePath(token: string): string {
  return `/manage?token=${encodeURIComponent(token)}`;
}
