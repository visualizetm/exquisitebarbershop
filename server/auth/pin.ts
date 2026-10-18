import { createHmac } from 'node:crypto';
import { getEnv } from '../env';
import { hashPassword, verifyPassword, getDummyHash } from './password';

/**
 * A PIN has only a million values, so the argon2id hash alone would fall to an offline guess in
 * minutes if the database leaked. The PIN is first run through an HMAC keyed with a server secret
 * (and the barber's id, so equal PINs hash differently), which an attacker with only the database
 * cannot reproduce. The lockout and the address limit protect the online side.
 */
function keyed(staffId: string, pin: string): string {
  return createHmac('sha256', getEnv().MANAGE_LINK_SECRET)
    .update(`pin:${staffId}:${pin}`)
    .digest('hex');
}

export function hashPin(staffId: string, pin: string): Promise<string> {
  return hashPassword(keyed(staffId, pin));
}

/** False for a wrong PIN and for a malformed hash; never throws. */
export function verifyPin(storedHash: string, staffId: string, pin: string): Promise<boolean> {
  return verifyPassword(storedHash, keyed(staffId, pin));
}

/** A real argon2id hash to check against when there is nothing to check, so every try costs the same. */
export function dummyPinHash(): Promise<string> {
  return getDummyHash();
}
