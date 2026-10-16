import { describe, expect, it } from 'vitest';

type RawDoc = { _id: string } & Record<string, unknown>;
import { withTransaction } from '../../server/db/transaction';
import { newId } from '../../server/lib/ids';
import { useTestDb } from '../helpers/db';

const { db } = useTestDb();

describe('withTransaction', () => {
  it('commits writes across collections', async () => {
    const id = newId();
    await withTransaction(async (session) => {
      await db().collection<RawDoc>('txA').insertOne({ _id: id, value: 1 }, { session });
      await db().collection<RawDoc>('txB').insertOne({ _id: id, value: 2 }, { session });
    });
    expect(await db().collection<RawDoc>('txA').countDocuments({ _id: id })).toBe(1);
    expect(await db().collection<RawDoc>('txB').countDocuments({ _id: id })).toBe(1);
  });

  it('rolls back every write when the callback throws', async () => {
    const id = newId();
    await expect(
      withTransaction(async (session) => {
        await db().collection<RawDoc>('txA').insertOne({ _id: id, value: 1 }, { session });
        await db().collection<RawDoc>('txB').insertOne({ _id: id, value: 2 }, { session });
        throw new Error('abort on purpose');
      }),
    ).rejects.toThrow('abort on purpose');
    expect(await db().collection<RawDoc>('txA').countDocuments({ _id: id })).toBe(0);
    expect(await db().collection<RawDoc>('txB').countDocuments({ _id: id })).toBe(0);
  });

  it('rolls back when a unique index rejects a later write in the same transaction', async () => {
    await db().collection<RawDoc>('txUnique').createIndex({ key: 1 }, { unique: true });
    await db().collection<RawDoc>('txUnique').insertOne({ _id: newId(), key: 'taken' });
    const id = newId();
    await expect(
      withTransaction(async (session) => {
        await db().collection<RawDoc>('txA').insertOne({ _id: id, value: 1 }, { session });
        await db()
          .collection<RawDoc>('txUnique')
          .insertOne({ _id: newId(), key: 'taken' }, { session });
      }),
    ).rejects.toMatchObject({ code: 11000 });
    expect(await db().collection<RawDoc>('txA').countDocuments({ _id: id })).toBe(0);
  });

  it('returns the callback result', async () => {
    const result = await withTransaction(() => Promise.resolve({ answer: 42 }));
    expect(result).toEqual({ answer: 42 });
  });
});
