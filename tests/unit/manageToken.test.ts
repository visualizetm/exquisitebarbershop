import { describe, expect, it } from 'vitest';
import { createManageToken, managePath, verifyManageToken } from '../../server/lib/manageToken';

const secret = 'unit-test-secret-which-is-long-enough-123456';
const bookingId = '64a1f2c3d4e5f60718293a4b';

describe('manage tokens', () => {
  it('round trips a valid token', () => {
    const token = createManageToken(secret, {
      bookingId,
      version: 2,
      expiresAt: new Date('2027-01-01T00:00:00Z'),
    });
    const result = verifyManageToken(secret, token, new Date('2026-06-01T00:00:00Z'));
    expect(result).toEqual({ ok: true, payload: { b: bookingId, v: 2, exp: 1798761600 } });
  });

  it('rejects a tampered payload', () => {
    const token = createManageToken(secret, {
      bookingId,
      version: 1,
      expiresAt: new Date('2027-01-01T00:00:00Z'),
    });
    const [v, payload, sig] = token.split('.') as [string, string, string];
    const forged = Buffer.from(JSON.stringify({ b: bookingId, v: 99, exp: 1798761600 })).toString(
      'base64url',
    );
    expect(verifyManageToken(secret, `${v}.${forged}.${sig}`)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
    expect(verifyManageToken(secret, `${v}.${payload}.${sig.slice(0, -2)}xx`)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it('rejects a token signed with another secret', () => {
    const token = createManageToken('another-secret-that-is-also-long-enough-xyz', {
      bookingId,
      version: 1,
      expiresAt: new Date('2027-01-01T00:00:00Z'),
    });
    expect(verifyManageToken(secret, token)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects expired and malformed tokens', () => {
    const token = createManageToken(secret, {
      bookingId,
      version: 1,
      expiresAt: new Date('2026-01-01T00:00:00Z'),
    });
    expect(verifyManageToken(secret, token, new Date('2026-06-01T00:00:00Z'))).toEqual({
      ok: false,
      reason: 'expired',
    });
    expect(verifyManageToken(secret, 'not-a-token')).toEqual({ ok: false, reason: 'malformed' });
    expect(verifyManageToken(secret, 'v2.a.b')).toEqual({ ok: false, reason: 'malformed' });
  });

  it('builds the manage path with the token in the query string', () => {
    expect(managePath('a.b.c')).toBe('/manage?token=a.b.c');
  });
});
