import { describe, expect, it } from 'vitest';
import { closuresRepo } from '../../server/repos';
import { NOW, useTestDb } from '../helpers/db';

useTestDb();

describe('closuresRepo', () => {
  it('inserts, lists by range and deletes', async () => {
    const xmas = await closuresRepo.insertClosure(
      { date: '2026-12-25', kind: 'closed', label: 'Christmas' },
      NOW,
    );
    await closuresRepo.insertClosure(
      {
        date: '2026-12-24',
        kind: 'specialHours',
        intervals: [{ start: '09:00', end: '13:00' }],
        label: 'Eve',
      },
      NOW,
    );
    await closuresRepo.insertClosure(
      { date: '2027-01-01', kind: 'closed', label: 'New Year' },
      NOW,
    );
    const december = await closuresRepo.listClosuresBetween('2026-12-01', '2026-12-31');
    expect(december.map((c) => c.date)).toEqual(['2026-12-24', '2026-12-25']);
    expect((await closuresRepo.findClosureByDate('2026-12-25'))?._id).toBe(xmas._id);
    expect(await closuresRepo.deleteClosure(xmas._id)).toBe(true);
    expect(await closuresRepo.deleteClosure(xmas._id)).toBe(false);
  });

  it('the unique date index rejects a second exception for the same day', async () => {
    await closuresRepo.insertClosure({ date: '2026-07-04', kind: 'closed', label: 'Fourth' }, NOW);
    await expect(
      closuresRepo.insertClosure({ date: '2026-07-04', kind: 'closed', label: 'Again' }, NOW),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('upsert replaces the exception for a date', async () => {
    const a = await closuresRepo.upsertClosure(
      { date: '2026-09-07', kind: 'closed', label: 'Labor Day' },
      NOW,
    );
    const b = await closuresRepo.upsertClosure(
      {
        date: '2026-09-07',
        kind: 'specialHours',
        intervals: [{ start: '10:00', end: '14:00' }],
        label: 'Short day',
      },
      NOW,
    );
    expect(b._id).toBe(a._id);
    expect(b.kind).toBe('specialHours');
  });

  it('validates the shape', async () => {
    await expect(
      closuresRepo.insertClosure({ date: '2026-02-30', kind: 'closed', label: 'x' }, NOW),
    ).rejects.toThrow();
  });
});
