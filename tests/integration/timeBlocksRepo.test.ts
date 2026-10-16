import { describe, expect, it } from 'vitest';
import { timeBlocksRepo } from '../../server/repos';
import { newId } from '../../server/lib/ids';
import { NOW, useTestDb } from '../helpers/db';

useTestDb();
const actor = { type: 'owner' as const, userId: newId(), staffId: null };

describe('timeBlocksRepo', () => {
  it('inserts and finds overlapping blocks per staff and shop-wide', async () => {
    const staffA = newId();
    const staffB = newId();
    const lunch = await timeBlocksRepo.insertTimeBlock(
      {
        staffId: staffA,
        kind: 'block',
        startAt: new Date('2026-03-12T16:00:00Z'),
        endAt: new Date('2026-03-12T17:00:00Z'),
        reason: 'Lunch',
        createdBy: actor,
      },
      NOW,
    );
    await timeBlocksRepo.insertTimeBlock(
      {
        staffId: staffB,
        kind: 'dayOff',
        startAt: new Date('2026-03-12T05:00:00Z'),
        endAt: new Date('2026-03-13T05:00:00Z'),
        reason: null,
        createdBy: actor,
      },
      NOW,
    );
    const forA = await timeBlocksRepo.listTimeBlocksForStaff(staffA, {
      start: new Date('2026-03-12T16:30:00Z'),
      end: new Date('2026-03-12T18:00:00Z'),
    });
    expect(forA.map((b) => b._id)).toEqual([lunch._id]);
    const none = await timeBlocksRepo.listTimeBlocksForStaff(staffA, {
      start: new Date('2026-03-12T17:00:00Z'),
      end: new Date('2026-03-12T18:00:00Z'),
    });
    expect(none).toEqual([]);
    const all = await timeBlocksRepo.listTimeBlocksBetween({
      start: new Date('2026-03-12T00:00:00Z'),
      end: new Date('2026-03-13T00:00:00Z'),
    });
    expect(all).toHaveLength(2);
    expect((await timeBlocksRepo.findTimeBlockById(lunch._id))?.reason).toBe('Lunch');
    expect(await timeBlocksRepo.deleteTimeBlock(lunch._id)).toBe(true);
    expect(await timeBlocksRepo.deleteTimeBlock(lunch._id)).toBe(false);
  });

  it('rejects an inverted range', async () => {
    await expect(
      timeBlocksRepo.insertTimeBlock(
        {
          staffId: newId(),
          kind: 'block',
          startAt: new Date('2026-03-12T17:00:00Z'),
          endAt: new Date('2026-03-12T16:00:00Z'),
          reason: null,
          createdBy: actor,
        },
        NOW,
      ),
    ).rejects.toThrow();
  });
});
