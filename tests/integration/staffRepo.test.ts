import { describe, expect, it } from 'vitest';
import { staffRepo } from '../../server/repos';
import { AppError } from '../../server/lib/errors';
import { NOW, useTestDb } from '../helpers/db';
import { staffInput } from '../helpers/fixtures';

useTestDb();

describe('staffRepo', () => {
  it('inserts with slugKeys derived and lists public staff in order', async () => {
    const a = await staffRepo.insertStaff(
      staffInput({ slug: 'alpha', name: 'Alpha', sortOrder: 20 }),
      NOW,
    );
    const b = await staffRepo.insertStaff(
      staffInput({ slug: 'bravo', name: 'Bravo', sortOrder: 10 }),
      NOW,
    );
    expect(a.slugKeys).toEqual(['alpha']);
    const list = await staffRepo.listPublicStaff();
    expect(list.map((s) => s._id)).toEqual([b._id, a._id]);
  });

  it('rejects a duplicate slug through the unique index', async () => {
    await staffRepo.insertStaff(staffInput({ slug: 'dupe' }), NOW);
    await expect(staffRepo.insertStaff(staffInput({ slug: 'dupe' }), NOW)).rejects.toMatchObject({
      code: 'SLUG_TAKEN',
    });
  });

  it('renames a slug, keeps the old one as an alias, and resolves both', async () => {
    const created = await staffRepo.insertStaff(staffInput({ slug: 'old-name' }), NOW);
    const renamed = await staffRepo.renameStaffSlug(created._id, 'new-name', NOW);
    expect(renamed.slug).toBe('new-name');
    expect(renamed.slugAliases).toEqual(['old-name']);
    expect(renamed.slugKeys).toEqual(['new-name', 'old-name']);
    expect((await staffRepo.findStaffBySlug('old-name'))?._id).toBe(created._id);
    expect((await staffRepo.findStaffBySlug('new-name'))?._id).toBe(created._id);
  });

  it('an alias can never be claimed by someone else, and a rename to the same slug is a no-op', async () => {
    const first = await staffRepo.insertStaff(staffInput({ slug: 'first-slug' }), NOW);
    await staffRepo.renameStaffSlug(first._id, 'first-renamed', NOW);
    await expect(
      staffRepo.insertStaff(staffInput({ slug: 'first-slug' }), NOW),
    ).rejects.toMatchObject({
      code: 'SLUG_TAKEN',
    });
    const other = await staffRepo.insertStaff(staffInput({ slug: 'other' }), NOW);
    await expect(staffRepo.renameStaffSlug(other._id, 'first-slug', NOW)).rejects.toMatchObject({
      code: 'SLUG_TAKEN',
    });
    const same = await staffRepo.renameStaffSlug(other._id, 'other', NOW);
    expect(same.slugAliases).toEqual([]);
  });

  it('reclaiming a former slug keeps every slug in slugKeys', async () => {
    const s = await staffRepo.insertStaff(staffInput({ slug: 'one' }), NOW);
    await staffRepo.renameStaffSlug(s._id, 'two', NOW);
    const back = await staffRepo.renameStaffSlug(s._id, 'one', NOW);
    expect(back.slug).toBe('one');
    expect(back.slugKeys.sort()).toEqual(['one', 'two']);
  });

  it('updates fields but refuses slug changes through update', async () => {
    const s = await staffRepo.insertStaff(staffInput({ slug: 'upd' }), NOW);
    const updated = await staffRepo.updateStaff(
      s._id,
      { title: 'Master Barber', chairNumber: 7 },
      NOW,
    );
    expect(updated.title).toBe('Master Barber');
    expect(updated.chairNumber).toBe(7);
    await expect(staffRepo.updateStaff(s._id, { slug: 'nope' }, NOW)).rejects.toBeInstanceOf(
      AppError,
    );
    await expect(
      staffRepo.updateStaff('64a1f2c3d4e5f60718293a4b', { title: 'x' }, NOW),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('soft deletes: hidden from public lists, still resolvable by slug and id', async () => {
    const s = await staffRepo.insertStaff(staffInput({ slug: 'gone' }), NOW);
    const deleted = await staffRepo.softDeleteStaff(s._id, NOW);
    expect(deleted.deletedAt).toEqual(NOW);
    expect(deleted.showOnWebsite).toBe(false);
    expect((await staffRepo.listPublicStaff()).some((x) => x._id === s._id)).toBe(false);
    expect((await staffRepo.listStaff()).some((x) => x._id === s._id)).toBe(false);
    expect((await staffRepo.listStaff({ includeDeleted: true })).some((x) => x._id === s._id)).toBe(
      true,
    );
    expect(await staffRepo.findStaffBySlug('gone')).not.toBeNull();
    await expect(staffRepo.softDeleteStaff(s._id, NOW)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    const byIds = await staffRepo.findStaffByIds([s._id]);
    expect(byIds).toHaveLength(1);
    expect(await staffRepo.findStaffByIds([])).toEqual([]);
  });

  it('validates input with zod before touching the database', async () => {
    await expect(staffRepo.insertStaff(staffInput({ slug: 'Bad Slug' }), NOW)).rejects.toThrow();
    await expect(
      staffRepo.renameStaffSlug('64a1f2c3d4e5f60718293a4b', 'fine', NOW),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
