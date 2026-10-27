import {
  kioskDeviceDocumentSchema,
  type KioskDeviceDocument,
} from '../../shared/schemas/kioskDevice';
import { collection } from '../db/collections';
import { newId } from '../lib/ids';
import { sessionOf, type RepoOptions } from './types';

export async function insertKioskDevice(
  input: {
    name: string;
    exitPinHash: string;
    pairCodeHash: string | null;
    pairCodeExpiresAt: Date | null;
    tokenHash: string | null;
    pairedAt: Date | null;
    demo: boolean;
  },
  now: Date,
  options?: RepoOptions & { id?: string },
): Promise<KioskDeviceDocument> {
  const doc = kioskDeviceDocumentSchema.parse({
    _id: options?.id ?? newId(),
    ...input,
    lastSeenAt: input.pairedAt,
    revokedAt: null,
    createdAt: now,
  });
  const col = await collection('kioskDevices');
  await col.insertOne(doc, sessionOf(options));
  return doc;
}

export async function findKioskDeviceById(id: string): Promise<KioskDeviceDocument | null> {
  const col = await collection('kioskDevices');
  return col.findOne({ _id: id });
}

/** Devices still waiting for their code: unpaired, not revoked, code not yet expired. */
export async function listKioskDevicesAwaitingCode(now: Date): Promise<KioskDeviceDocument[]> {
  const col = await collection('kioskDevices');
  return col.find({ tokenHash: null, revokedAt: null, pairCodeExpiresAt: { $gt: now } }).toArray();
}

/** A paired, live device by the cookie's token hash. */
export async function findKioskDeviceByToken(
  tokenHash: string,
): Promise<KioskDeviceDocument | null> {
  const col = await collection('kioskDevices');
  return col.findOne({ tokenHash, revokedAt: null });
}

/** Every device that is paired or still waiting, newest first; revoked ones are history. */
export async function listKioskDevices(): Promise<KioskDeviceDocument[]> {
  const col = await collection('kioskDevices');
  return col.find({ revokedAt: null }).sort({ createdAt: -1 }).toArray();
}

/** The pairing: stores the token, clears the one-use code. False when the code was used meanwhile. */
export async function pairKioskDevice(id: string, tokenHash: string, now: Date): Promise<boolean> {
  const col = await collection('kioskDevices');
  const result = await col.updateOne(
    { _id: id, tokenHash: null, revokedAt: null },
    {
      $set: {
        tokenHash,
        pairedAt: now,
        lastSeenAt: now,
        pairCodeHash: null,
        pairCodeExpiresAt: null,
      },
    },
  );
  return result.modifiedCount === 1;
}

export async function touchKioskDevice(id: string, now: Date): Promise<void> {
  const col = await collection('kioskDevices');
  await col.updateOne({ _id: id }, { $set: { lastSeenAt: now } });
}

export async function revokeKioskDevice(id: string, now: Date): Promise<boolean> {
  const col = await collection('kioskDevices');
  const result = await col.updateOne(
    { _id: id, revokedAt: null },
    { $set: { revokedAt: now, tokenHash: null, pairCodeHash: null, pairCodeExpiresAt: null } },
  );
  return result.modifiedCount === 1;
}

export async function deleteDemoKioskDevices(): Promise<number> {
  const col = await collection('kioskDevices');
  const result = await col.deleteMany({ demo: true });
  return result.deletedCount;
}
