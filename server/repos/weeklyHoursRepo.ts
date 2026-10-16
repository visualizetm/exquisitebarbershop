import type { WeekHours } from '../../shared/schemas/common';
import { weekHoursSchema } from '../../shared/schemas/common';
import {
  weeklyHoursDocumentSchema,
  type WeeklyHoursDocument,
} from '../../shared/schemas/weeklyHours';
import { collection } from '../db/collections';
import { newId } from '../lib/ids';
import { sessionOf, type RepoOptions } from './types';

export async function getShopHours(options?: RepoOptions): Promise<WeeklyHoursDocument | null> {
  const col = await collection('weeklyHours');
  return col.findOne({ subjectType: 'shop', staffId: null }, sessionOf(options));
}

export async function getStaffHours(
  staffId: string,
  options?: RepoOptions,
): Promise<WeeklyHoursDocument | null> {
  const col = await collection('weeklyHours');
  return col.findOne({ subjectType: 'staff', staffId }, sessionOf(options));
}

export async function listStaffHours(options?: RepoOptions): Promise<WeeklyHoursDocument[]> {
  const col = await collection('weeklyHours');
  return col.find({ subjectType: 'staff' }, sessionOf(options)).toArray();
}

async function upsertHours(
  subject: { subjectType: 'shop'; staffId: null } | { subjectType: 'staff'; staffId: string },
  days: WeekHours,
  now: Date,
  options?: RepoOptions,
): Promise<WeeklyHoursDocument> {
  const parsedDays = weekHoursSchema.parse(days);
  weeklyHoursDocumentSchema.parse({ _id: newId(), ...subject, days: parsedDays, updatedAt: now });
  const col = await collection('weeklyHours');
  const updated = await col.findOneAndUpdate(
    { subjectType: subject.subjectType, staffId: subject.staffId },
    { $set: { days: parsedDays, updatedAt: now }, $setOnInsert: { _id: newId(), ...subject } },
    { upsert: true, returnDocument: 'after', ...sessionOf(options) },
  );
  if (!updated) throw new Error('upsert returned no document');
  return updated;
}

export function setShopHours(
  days: WeekHours,
  now: Date,
  options?: RepoOptions,
): Promise<WeeklyHoursDocument> {
  return upsertHours({ subjectType: 'shop', staffId: null }, days, now, options);
}

export function setStaffHours(
  staffId: string,
  days: WeekHours,
  now: Date,
  options?: RepoOptions,
): Promise<WeeklyHoursDocument> {
  return upsertHours({ subjectType: 'staff', staffId }, days, now, options);
}

/** Only used when hard-removing seed or test data. Staff deletion keeps hours. */
export async function deleteStaffHours(staffId: string, options?: RepoOptions): Promise<void> {
  const col = await collection('weeklyHours');
  await col.deleteOne({ subjectType: 'staff', staffId }, sessionOf(options));
}
