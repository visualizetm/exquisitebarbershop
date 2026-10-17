import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ZodType } from 'zod';

/**
 * A small signed, expiring token for short-lived server state that need not
 * be stored, such as an issued upload. Format: <prefix>.<payload>.<signature>,
 * payload base64url JSON with an `exp` in unix seconds, signature HMAC-SHA256.
 */
function sign(secret: string, prefix: string, encoded: string): string {
  return createHmac('sha256', secret).update(`${prefix}.${encoded}`).digest('base64url');
}

export function signPayload(
  secret: string,
  prefix: string,
  payload: Record<string, unknown> & { exp: number },
): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${prefix}.${encoded}.${sign(secret, prefix, encoded)}`;
}

export function verifyPayload<T extends { exp: number }>(
  secret: string,
  prefix: string,
  token: string,
  schema: ZodType<T>,
  now: Date = new Date(),
): T | null {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== prefix) return null;
  const [, encoded = '', signature = ''] = parts;
  const expected = sign(secret, prefix, encoded);
  if (
    expected.length !== signature.length ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  ) {
    return null;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return null;
  if (parsed.data.exp * 1000 < now.getTime()) return null;
  return parsed.data;
}
