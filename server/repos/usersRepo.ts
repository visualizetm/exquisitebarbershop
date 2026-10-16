import { userDocumentSchema, type UserDocument } from '../../shared/schemas/user';
import { collection } from '../db/collections';
import { AppError, isDuplicateKeyError } from '../lib/errors';
import { newId } from '../lib/ids';
import { sessionOf, type RepoOptions } from './types';

export interface UserInput {
  email: string;
  passwordHash: string;
  role: UserDocument['role'];
  staffId: string | null;
}

export async function insertUser(
  input: UserInput,
  now: Date,
  options?: RepoOptions & { id?: string },
): Promise<UserDocument> {
  const doc = userDocumentSchema.parse({
    _id: options?.id ?? newId(),
    ...input,
    isActive: true,
    failedLoginCount: 0,
    lockedUntil: null,
    lastLoginAt: null,
    passwordChangedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  const col = await collection('users');
  try {
    await col.insertOne(doc, sessionOf(options));
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new AppError('CONFLICT', 'A login with that email or staff member already exists', {
        cause: error,
      });
    }
    throw error;
  }
  return doc;
}

export async function findUserByEmail(
  email: string,
  options?: RepoOptions,
): Promise<UserDocument | null> {
  const col = await collection('users');
  return col.findOne({ email: email.trim().toLowerCase() }, sessionOf(options));
}

export async function findUserById(
  id: string,
  options?: RepoOptions,
): Promise<UserDocument | null> {
  const col = await collection('users');
  return col.findOne({ _id: id }, sessionOf(options));
}

export async function listUsers(options?: RepoOptions): Promise<UserDocument[]> {
  const col = await collection('users');
  return col.find({}, sessionOf(options)).sort({ role: 1, email: 1 }).toArray();
}

/** Increments the failure counter and locks the account when the threshold is hit. */
export async function recordFailedLogin(
  id: string,
  rule: { maxFailures: number; lockMinutes: number },
  now: Date,
  options?: RepoOptions,
): Promise<UserDocument> {
  const col = await collection('users');
  const user = await col.findOneAndUpdate(
    { _id: id },
    { $inc: { failedLoginCount: 1 }, $set: { updatedAt: now } },
    { returnDocument: 'after', ...sessionOf(options) },
  );
  if (!user) throw new AppError('NOT_FOUND', 'User was not found');
  if (user.failedLoginCount >= rule.maxFailures) {
    const lockedUntil = new Date(now.getTime() + rule.lockMinutes * 60_000);
    const locked = await col.findOneAndUpdate(
      { _id: id },
      { $set: { lockedUntil, failedLoginCount: 0, updatedAt: now } },
      { returnDocument: 'after', ...sessionOf(options) },
    );
    return locked ?? user;
  }
  return user;
}

export async function recordSuccessfulLogin(
  id: string,
  now: Date,
  options?: RepoOptions,
): Promise<void> {
  const col = await collection('users');
  await col.updateOne(
    { _id: id },
    { $set: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now, updatedAt: now } },
    sessionOf(options),
  );
}

export async function setUserPasswordHash(
  id: string,
  passwordHash: string,
  now: Date,
  options?: RepoOptions,
): Promise<void> {
  const col = await collection('users');
  const result = await col.updateOne(
    { _id: id },
    {
      $set: {
        passwordHash,
        passwordChangedAt: now,
        failedLoginCount: 0,
        lockedUntil: null,
        updatedAt: now,
      },
    },
    sessionOf(options),
  );
  if (result.matchedCount === 0) throw new AppError('NOT_FOUND', 'User was not found');
}

export async function setUserActive(
  id: string,
  isActive: boolean,
  now: Date,
  options?: RepoOptions,
): Promise<void> {
  const col = await collection('users');
  const result = await col.updateOne(
    { _id: id },
    { $set: { isActive, updatedAt: now } },
    sessionOf(options),
  );
  if (result.matchedCount === 0) throw new AppError('NOT_FOUND', 'User was not found');
}
