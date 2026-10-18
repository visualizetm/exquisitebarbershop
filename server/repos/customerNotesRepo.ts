import {
  customerNoteDocumentSchema,
  type CustomerNoteDocument,
} from '../../shared/schemas/customerNote';
import { collection } from '../db/collections';
import { newId } from '../lib/ids';
import { sessionOf, type RepoOptions } from './types';

export async function getNote(
  phone: string,
  options?: RepoOptions,
): Promise<CustomerNoteDocument | null> {
  const col = await collection('customerNotes');
  return col.findOne({ phone }, sessionOf(options));
}

export async function listNotesFor(
  phones: readonly string[],
  options?: RepoOptions,
): Promise<CustomerNoteDocument[]> {
  if (phones.length === 0) return [];
  const col = await collection('customerNotes');
  return col.find({ phone: { $in: [...phones] } }, sessionOf(options)).toArray();
}

/** Saves the note for a phone; an empty note removes it. */
export async function saveNote(
  phone: string,
  notes: string,
  now: Date,
  options?: RepoOptions,
): Promise<CustomerNoteDocument | null> {
  const col = await collection('customerNotes');
  if (notes.trim() === '') {
    await col.deleteOne({ phone }, sessionOf(options));
    return null;
  }
  const doc = customerNoteDocumentSchema.parse({
    _id: newId(),
    phone,
    notes,
    createdAt: now,
    updatedAt: now,
  });
  await col.updateOne(
    { phone },
    {
      $set: { notes: doc.notes, updatedAt: now },
      $setOnInsert: { _id: doc._id, phone, createdAt: now },
    },
    { upsert: true, ...sessionOf(options) },
  );
  return (await col.findOne({ phone }, sessionOf(options))) ?? doc;
}
