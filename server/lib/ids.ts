import { createHash, randomBytes } from 'node:crypto';
import { ObjectId } from 'mongodb';

/** New document id: an ObjectId as a 24 character hex string (time ordered, unique). */
export function newId(): string {
  return new ObjectId().toHexString();
}

/** Deterministic id for seed data so re-running the seed never creates duplicates. */
export function seedId(kind: string, key: string): string {
  return createHash('sha256').update(`${kind}:${key}`).digest('hex').slice(0, 24);
}

export function sha256Hex(input: string | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Opaque token for sessions and similar: 256 bits, base64url. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function randomRequestId(): string {
  return randomBytes(8).toString('hex');
}
