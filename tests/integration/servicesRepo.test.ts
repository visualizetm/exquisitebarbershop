import { describe, expect, it } from 'vitest';
import { servicesRepo } from '../../server/repos';
import { NOW, useTestDb } from '../helpers/db';
import { serviceInput } from '../helpers/fixtures';

useTestDb();

describe('servicesRepo', () => {
  it('inserts, finds by ids in request order, and lists public services grouped', async () => {
    const beauty = await servicesRepo.insertService(
      serviceInput({ name: 'Silk Press', group: 'Beauty', sortOrder: 5 }),
      NOW,
    );
    const barber = await servicesRepo.insertService(
      serviceInput({ name: 'Fade', sortOrder: 20 }),
      NOW,
    );
    const hidden = await servicesRepo.insertService(
      serviceInput({ name: 'Hidden', isActive: false }),
      NOW,
    );
    const ordered = await servicesRepo.findServicesByIds([
      barber._id,
      beauty._id,
      '64a1f2c3d4e5f60718293a4b',
    ]);
    expect(ordered.map((s) => s._id)).toEqual([barber._id, beauty._id]);
    const pub = await servicesRepo.listPublicServices();
    expect(pub.map((s) => s._id)).toEqual([barber._id, beauty._id]);
    expect(pub.some((s) => s._id === hidden._id)).toBe(false);
    expect(await servicesRepo.findServicesByIds([])).toEqual([]);
  });

  it('updates and soft deletes', async () => {
    const s = await servicesRepo.insertService(serviceInput(), NOW);
    const updated = await servicesRepo.updateService(
      s._id,
      { priceCents: 3500, priceFrom: true },
      NOW,
    );
    expect(updated.priceCents).toBe(3500);
    expect(updated.priceFrom).toBe(true);
    const deleted = await servicesRepo.softDeleteService(s._id, NOW);
    expect(deleted.deletedAt).toEqual(NOW);
    expect(deleted.isActive).toBe(false);
    expect((await servicesRepo.listServices()).some((x) => x._id === s._id)).toBe(false);
    expect(
      (await servicesRepo.listServices({ includeDeleted: true })).some((x) => x._id === s._id),
    ).toBe(true);
    expect((await servicesRepo.findServiceById(s._id))?.deletedAt).toEqual(NOW);
    await expect(servicesRepo.updateService(s._id, { name: 'x' }, NOW)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(servicesRepo.softDeleteService(s._id, NOW)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('rejects invalid money and durations', async () => {
    await expect(
      servicesRepo.insertService(serviceInput({ priceCents: 10.5 }), NOW),
    ).rejects.toThrow();
    await expect(
      servicesRepo.insertService(serviceInput({ durationMinutes: 7 }), NOW),
    ).rejects.toThrow();
  });
});
