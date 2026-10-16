import { describe, expect, it } from 'vitest';
import { sessionsRepo } from '../../server/repos';
import { newId, randomToken, sha256Hex } from '../../server/lib/ids';
import { NOW, useTestDb } from '../helpers/db';

const { db } = useTestDb();

function input(userId = newId()) {
  return {
    tokenHash: sha256Hex(randomToken()),
    userId,
    expiresAt: new Date(NOW.getTime() + 3600_000),
    ip: '127.0.0.1',
    userAgent: 'test',
  };
}

describe('sessionsRepo', () => {
  it('finds only live sessions', async () => {
    const s = await sessionsRepo.insertSession(input(), NOW);
    expect((await sessionsRepo.findActiveSession(s.tokenHash, NOW))?._id).toBe(s._id);
    expect(
      await sessionsRepo.findActiveSession(s.tokenHash, new Date(NOW.getTime() + 2 * 3600_000)),
    ).toBeNull();
    expect(await sessionsRepo.revokeSession(s._id, NOW)).toBe(true);
    expect(await sessionsRepo.revokeSession(s._id, NOW)).toBe(false);
    expect(await sessionsRepo.findActiveSession(s.tokenHash, NOW)).toBeNull();
  });

  it('touch extends expiry and revokeAll covers a user', async () => {
    const userId = newId();
    const a = await sessionsRepo.insertSession(input(userId), NOW);
    const b = await sessionsRepo.insertSession(input(userId), NOW);
    const later = new Date(NOW.getTime() + 7200_000);
    await sessionsRepo.touchSession(a._id, NOW, later);
    expect(
      (await sessionsRepo.findActiveSession(a.tokenHash, new Date(NOW.getTime() + 5000_000)))?._id,
    ).toBe(a._id);
    expect(await sessionsRepo.revokeAllSessionsForUser(userId, NOW)).toBe(2);
    expect(await sessionsRepo.findActiveSession(b.tokenHash, NOW)).toBeNull();
    expect(await sessionsRepo.listSessionsForUser(userId)).toHaveLength(2);
  });

  it('the unique token hash index rejects a duplicate', async () => {
    const s = await sessionsRepo.insertSession(input(), NOW);
    await expect(
      sessionsRepo.insertSession({ ...input(), tokenHash: s.tokenHash }, NOW),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('has a TTL index on expiresAt', async () => {
    const indexes = await db().collection('sessions').indexes();
    expect(indexes.find((i) => i.name === 'ttl_expiresAt')?.expireAfterSeconds).toBe(0);
  });
});
