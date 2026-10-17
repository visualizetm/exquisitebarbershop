import { describe, expect, it } from 'vitest';
import { servicesSeed, staffSeed, staffSeedId } from '../../seed/shop';
import { servicesRepo, staffRepo, usersRepo, weeklyHoursRepo } from '../../server/repos';
import { runSeed } from '../../server/services/seedService';
import { NOW, useTestDb } from '../helpers/db';

const { db } = useTestDb();

describe('seed', () => {
  it('loads the placeholder shop and is idempotent', async () => {
    const first = await runSeed(db(), NOW);
    expect(first).toEqual({
      settingsCreated: true,
      shopHoursCreated: true,
      servicesCreated: servicesSeed.length,
      staffCreated: staffSeed.length,
      staffHoursCreated: staffSeed.length,
      ownerLogin: 'skipped',
    });
    const second = await runSeed(db(), NOW);
    expect(second).toEqual({
      settingsCreated: false,
      shopHoursCreated: false,
      servicesCreated: 0,
      staffCreated: 0,
      staffHoursCreated: 0,
      ownerLogin: 'skipped',
    });
    expect(await servicesRepo.listPublicServices()).toHaveLength(servicesSeed.length);
    expect(await staffRepo.listPublicStaff()).toHaveLength(6);
  });

  it('seeded staff reference seeded services and have hours', async () => {
    const services = await servicesRepo.listServices();
    const serviceIds = new Set(services.map((s) => s._id));
    for (const member of staffSeed) {
      const doc = await staffRepo.findStaffById(staffSeedId(member.key));
      expect(doc?.slug).toBe(member.input.slug);
      for (const id of doc?.serviceIds ?? []) expect(serviceIds.has(id)).toBe(true);
      expect(await weeklyHoursRepo.getStaffHours(staffSeedId(member.key))).not.toBeNull();
    }
    const owner = await staffRepo.findStaffBySlug('dontrise');
    expect(owner?.role).toBe('owner');
  });

  it('does not clobber owner edits', async () => {
    const marcus = staffSeedId('marcus');
    await staffRepo.updateStaff(marcus, { name: 'Real Name' }, NOW);
    await runSeed(db(), NOW);
    expect((await staffRepo.findStaffById(marcus))?.name).toBe('Real Name');
  });

  it('creates the owner login once, linked to the owner chair, and refuses weak passwords', async () => {
    await expect(runSeed(db(), NOW, { ownerPassword: 'password123456' })).rejects.toThrow(
      /too weak/,
    );
    const first = await runSeed(db(), NOW, { ownerPassword: 'long-and-unusual-phrase-42' });
    expect(first.ownerLogin).toBe('created');
    const again = await runSeed(db(), NOW, { ownerPassword: 'another-unusual-phrase-77' });
    expect(again.ownerLogin).toBe('exists');
    const owner = await usersRepo.findOwnerUser();
    expect(owner?.email).toBe('owner@exquisitebarberbeauty.com');
    expect(owner?.staffId).toBe(staffSeedId('dontrise'));
    expect(owner?.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(owner?.mustChangePassword).toBe(false);
  });
});
