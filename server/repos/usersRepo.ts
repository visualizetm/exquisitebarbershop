import type { Collection } from 'mongodb';
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
  /** True for temporary passwords handed out by the owner. */
  mustChangePassword?: boolean;
}

/** Fills fields added after a document was written, so older records read safely. */
function fill(doc: UserDocument): UserDocument {
  const stored = doc as Partial<UserDocument>;
  return {
    ...doc,
    mustChangePassword: stored.mustChangePassword ?? false,
    recentLoginIps: stored.recentLoginIps ?? [],
  };
}

function withDefaults(doc: UserDocument | null): UserDocument | null {
  return doc ? fill(doc) : null;
}

export async function insertUser(
  input: UserInput,
  now: Date,
  options?: RepoOptions & { id?: string },
): Promise<UserDocument> {
  const doc = userDocumentSchema.parse({
    _id: options?.id ?? newId(),
    email: input.email,
    passwordHash: input.passwordHash,
    role: input.role,
    staffId: input.staffId,
    isActive: true,
    mustChangePassword: input.mustChangePassword ?? false,
    failedLoginCount: 0,
    lockedUntil: null,
    lastLoginAt: null,
    passwordChangedAt: now,
    recentLoginIps: [],
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
  return withDefaults(await col.findOne({ email: email.trim().toLowerCase() }, sessionOf(options)));
}

export async function findUserById(
  id: string,
  options?: RepoOptions,
): Promise<UserDocument | null> {
  const col = await collection('users');
  return withDefaults(await col.findOne({ _id: id }, sessionOf(options)));
}

export async function findUserByStaffId(
  staffId: string,
  options?: RepoOptions,
): Promise<UserDocument | null> {
  const col = await collection('users');
  return withDefaults(await col.findOne({ staffId }, sessionOf(options)));
}

export async function findOwnerUser(options?: RepoOptions): Promise<UserDocument | null> {
  const col = await collection('users');
  return withDefaults(await col.findOne({ role: 'owner' }, sessionOf(options)));
}

export async function listUsers(options?: RepoOptions): Promise<UserDocument[]> {
  const col = await collection('users');
  const docs = await col.find({}, sessionOf(options)).sort({ role: 1, email: 1 }).toArray();
  return docs.map(fill);
}

/** How long a successful sign-in address is remembered. */
export const RECENT_LOGIN_IP_MS = 30 * 24 * 60 * 60_000;
export const RECENT_LOGIN_IP_MAX = 10;

export async function recordSuccessfulLogin(
  id: string,
  now: Date,
  ipHash: string | null = null,
  options?: RepoOptions,
): Promise<void> {
  const col = await collection('users');
  await col.updateOne(
    { _id: id },
    { $set: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now, updatedAt: now } },
    sessionOf(options),
  );
  if (!ipHash) return;
  // Forget expired entries and this address's older entry, then keep the newest ten.
  const raw = col as unknown as Collection<{
    _id: string;
    recentLoginIps: { ipHash: string; at: Date }[];
  }>;
  await raw.updateOne(
    { _id: id },
    {
      $pull: {
        // The driver types a pull condition as a partial entry; $or is valid MongoDB here.
        recentLoginIps: {
          $or: [{ ipHash }, { at: { $lt: new Date(now.getTime() - RECENT_LOGIN_IP_MS) } }],
        } as unknown as { ipHash: string },
      },
    },
    sessionOf(options),
  );
  await raw.updateOne(
    { _id: id },
    { $push: { recentLoginIps: { $each: [{ ipHash, at: now }], $slice: -RECENT_LOGIN_IP_MAX } } },
    sessionOf(options),
  );
}

/** True when this login succeeded from the address within the memory window. */
export function hasRecentLoginIp(user: UserDocument, ipHash: string, now: Date): boolean {
  const since = now.getTime() - RECENT_LOGIN_IP_MS;
  return user.recentLoginIps.some((e) => e.ipHash === ipHash && e.at.getTime() >= since);
}

/** Replaces the password hash. `mustChangePassword` marks a temporary password. */
export async function setUserPasswordHash(
  id: string,
  passwordHash: string,
  now: Date,
  options?: RepoOptions & { mustChangePassword?: boolean },
): Promise<void> {
  const col = await collection('users');
  const result = await col.updateOne(
    { _id: id },
    {
      $set: {
        passwordHash,
        passwordChangedAt: now,
        mustChangePassword: options?.mustChangePassword ?? false,
        failedLoginCount: 0,
        lockedUntil: null,
        updatedAt: now,
      },
    },
    sessionOf(options),
  );
  if (result.matchedCount === 0) throw new AppError('NOT_FOUND', 'User was not found');
}

/** Changes the sign in address. The unique index on email refuses one that is taken. */
export async function setUserEmail(
  id: string,
  email: string,
  now: Date,
  options?: RepoOptions,
): Promise<void> {
  const col = await collection('users');
  try {
    const result = await col.updateOne(
      { _id: id },
      { $set: { email, updatedAt: now } },
      sessionOf(options),
    );
    if (result.matchedCount === 0) throw new AppError('NOT_FOUND', 'User was not found');
  } catch (error) {
    if (isDuplicateKeyError(error)) throw new AppError('CONFLICT', 'That email is already in use');
    throw error;
  }
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
