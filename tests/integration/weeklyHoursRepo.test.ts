import { describe, expect, it } from 'vitest';

type RawDoc = { _id: string } & Record<string, unknown>;
import { weeklyHoursRepo } from '../../server/repos';
import { newId } from '../../server/lib/ids';
import { NOW, useTestDb } from '../helpers/db';

const { db } = useTestDb();
const days = {
  mon: [],
  tue: [{ start: '09:00', end: '17:00' }],
  wed: [
    { start: '09:00', end: '12:00' },
    { start: '13:00', end: '17:00' },
  ],
  thu: [],
  fri: [],
  sat: [],
  sun: [],
};

describe('weeklyHoursRepo', () => {
  it('upserts shop hours as a single document', async () => {
    expect(await weeklyHoursRepo.getShopHours()).toBeNull();
    const first = await weeklyHoursRepo.setShopHours(days, NOW);
    const second = await weeklyHoursRepo.setShopHours(
      { ...days, mon: [{ start: '10:00', end: '14:00' }] },
      NOW,
    );
    expect(second._id).toBe(first._id);
    expect((await weeklyHoursRepo.getShopHours())?.days.mon).toHaveLength(1);
    expect(
      await db().collection<RawDoc>('weeklyHours').countDocuments({ subjectType: 'shop' }),
    ).toBe(1);
  });

  it('keeps one document per staff member and deletes on request', async () => {
    const staffId = newId();
    await weeklyHoursRepo.setStaffHours(staffId, days, NOW);
    await weeklyHoursRepo.setStaffHours(staffId, days, NOW);
    expect(await weeklyHoursRepo.listStaffHours()).toHaveLength(1);
    expect((await weeklyHoursRepo.getStaffHours(staffId))?.staffId).toBe(staffId);
    await weeklyHoursRepo.deleteStaffHours(staffId);
    expect(await weeklyHoursRepo.getStaffHours(staffId)).toBeNull();
  });

  it('the unique subject index rejects a second shop document', async () => {
    await weeklyHoursRepo.setShopHours(days, NOW);
    await expect(
      db()
        .collection<RawDoc>('weeklyHours')
        .insertOne({ _id: newId(), subjectType: 'shop', staffId: null, days, updatedAt: NOW }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('validates intervals', async () => {
    await expect(
      weeklyHoursRepo.setShopHours({ ...days, mon: [{ start: '17:00', end: '09:00' }] }, NOW),
    ).rejects.toThrow();
  });
});
