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
  const stored = (doc as Partial<UserDocument>).mustChangePassword;
  return { ...doc, mustChangePassword: stored ?? false };
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
