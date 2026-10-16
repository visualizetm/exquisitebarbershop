import { describe, expect, it } from 'vitest';
import { usersRepo } from '../../server/repos';
import { newId } from '../../server/lib/ids';
import { NOW, useTestDb } from '../helpers/db';

useTestDb();
const rule = { maxFailures: 3, lockMinutes: 15 };

describe('usersRepo', () => {
  it('inserts, normalizes email, and finds by email or id', async () => {
    const u = await usersRepo.insertUser(
      { email: 'Owner@Example.com', passwordHash: 'hash', role: 'owner', staffId: null },
      NOW,
    );
    expect(u.email).toBe('owner@example.com');
    expect((await usersRepo.findUserByEmail('  OWNER@example.com '))?._id).toBe(u._id);
    expect((await usersRepo.findUserById(u._id))?.role).toBe('owner');
    expect(await usersRepo.listUsers()).toHaveLength(1);
  });

  it('unique email and unique staffId indexes reject duplicates, null staffId allowed many times', async () => {
    const staffId = newId();
    await usersRepo.insertUser(
      { email: 'a@example.com', passwordHash: 'h', role: 'barber', staffId },
      NOW,
    );
    await expect(
      usersRepo.insertUser(
        { email: 'A@example.com', passwordHash: 'h', role: 'barber', staffId: newId() },
        NOW,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      usersRepo.insertUser(
        { email: 'b@example.com', passwordHash: 'h', role: 'barber', staffId },
        NOW,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await usersRepo.insertUser(
      { email: 'c@example.com', passwordHash: 'h', role: 'owner', staffId: null },
      NOW,
    );
    await usersRepo.insertUser(
      { email: 'd@example.com', passwordHash: 'h', role: 'owner', staffId: null },
      NOW,
    );
  });

  it('locks after repeated failures and clears on success', async () => {
    const u = await usersRepo.insertUser(
      { email: 'lock@example.com', passwordHash: 'h', role: 'barber', staffId: null },
      NOW,
    );
    await usersRepo.recordFailedLogin(u._id, rule, NOW);
    const second = await usersRepo.recordFailedLogin(u._id, rule, NOW);
    expect(second.failedLoginCount).toBe(2);
    expect(second.lockedUntil).toBeNull();
    const third = await usersRepo.recordFailedLogin(u._id, rule, NOW);
    expect(third.lockedUntil?.toISOString()).toBe(
      new Date(NOW.getTime() + 15 * 60_000).toISOString(),
    );
    expect(third.failedLoginCount).toBe(0);
    await usersRepo.recordSuccessfulLogin(u._id, NOW);
    const after = await usersRepo.findUserById(u._id);
    expect(after?.lockedUntil).toBeNull();
    expect(after?.lastLoginAt).toEqual(NOW);
    await expect(usersRepo.recordFailedLogin(newId(), rule, NOW)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('changes password hash and active flag', async () => {
    const u = await usersRepo.insertUser(
      { email: 'pw@example.com', passwordHash: 'old', role: 'barber', staffId: null },
      NOW,
    );
    const later = new Date(NOW.getTime() + 1000);
    await usersRepo.setUserPasswordHash(u._id, 'new', later);
    await usersRepo.setUserActive(u._id, false, later);
    const after = await usersRepo.findUserById(u._id);
    expect(after?.passwordHash).toBe('new');
    expect(after?.passwordChangedAt).toEqual(later);
    expect(after?.isActive).toBe(false);
    await expect(usersRepo.setUserPasswordHash(newId(), 'x', NOW)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(usersRepo.setUserActive(newId(), true, NOW)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
