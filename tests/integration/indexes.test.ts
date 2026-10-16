import { describe, expect, it } from 'vitest';
import { ensureIndexes, INDEXES } from '../../server/db/indexes';
import { useTestDb } from '../helpers/db';

const { db } = useTestDb();

describe('indexes', () => {
  it('creates every documented index and is idempotent', async () => {
    const first = await ensureIndexes(db());
    const second = await ensureIndexes(db());
    expect(first.created).toHaveLength(INDEXES.length);
    expect(second.created).toEqual(first.created);
  });

  it('every index exists on its collection with the documented name and options', async () => {
    for (const def of INDEXES) {
      const indexes = await db().collection(def.collection).indexes();
      const found = indexes.find((i) => i.name === def.options.name);
      expect(found, `${def.collection}.${def.options.name}`).toBeDefined();
      expect(found?.key).toEqual(def.keys);
      if (def.options.unique) expect(found?.unique).toBe(true);
      if (def.options.expireAfterSeconds !== undefined) {
        expect(found?.expireAfterSeconds).toBe(def.options.expireAfterSeconds);
      }
    }
  });

  it('has a reason for every index', () => {
    for (const def of INDEXES) expect(def.reason.length).toBeGreaterThan(10);
  });
});
