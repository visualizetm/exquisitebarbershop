import { bootstrapRecordSchema, type BootstrapRecord } from '../../shared/schemas/systemState';
import { collection } from '../db/collections';

export async function getBootstrapRecord(): Promise<BootstrapRecord | null> {
  const col = await collection('systemState');
  return col.findOne({ _id: 'bootstrap' });
}

export async function recordBootstrap(
  summary: BootstrapRecord['summary'],
  now: Date,
): Promise<BootstrapRecord> {
  const col = await collection('systemState');
  const previous = await col.findOne({ _id: 'bootstrap' });
  const doc = bootstrapRecordSchema.parse({
    _id: 'bootstrap',
    completedAt: now,
    runs: (previous?.runs ?? 0) + 1,
    summary,
  });
  await col.replaceOne({ _id: 'bootstrap' }, doc, { upsert: true });
  return doc;
}
