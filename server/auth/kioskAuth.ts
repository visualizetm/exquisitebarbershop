import { randomInt } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import type { KioskDeviceView } from '../../shared/api/kiosk';
import type { KioskDeviceDocument } from '../../shared/schemas/kioskDevice';
import type { Principal, RequestContext } from '../http/types';
import { AppError } from '../lib/errors';
import { newId, randomToken, sha256Hex } from '../lib/ids';
import { auditLogRepo, kioskDevicesRepo, loginThrottleRepo, rateLimitsRepo } from '../repos';
import type { RequestMeta } from './authService';
import { ipHashOf } from './authService';
import { clearKioskCookie, KIOSK_COOKIE_DAYS, readKioskCookie, setKioskCookie } from './cookies';
import { dummyPinHash, hashPin, verifyPin } from './pin';

/** The pairing code lives ten minutes; five wrong codes from one address stop pairing for 15. */
export const PAIR_CODE_MS = 10 * 60_000;
export const PAIR_IP_LIMIT = { limit: 5, windowMs: 15 * 60_000 };
/** The exit PIN: five wrong tries lock that tablet's exit for 15 minutes. */
export const EXIT_PIN_LOCKOUT = { threshold: 5, lockMinutes: [15] } as const;
const SESSION_MS = KIOSK_COOKIE_DAYS * 24 * 60 * 60_000;
/** The last-seen stamp (the sliding window) is written at most once an hour. */
const TOUCH_MS = 60 * 60_000;
export const DEMO_EXIT_PIN = '246810';

function retryAfter(windowMs: number, now: Date): number {
  return Math.ceil((windowMs - (now.getTime() % windowMs)) / 1000);
}

function sixDigits(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function kioskDeviceView(d: KioskDeviceDocument): KioskDeviceView {
  return {
    id: d._id,
    name: d.name,
    paired: d.tokenHash !== null,
    pairedAt: d.pairedAt?.toISOString() ?? null,
    lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
    codeExpiresAt: d.tokenHash === null ? (d.pairCodeExpiresAt?.toISOString() ?? null) : null,
  };
}

async function audit(
  action: string,
  device: KioskDeviceDocument,
  actor: Principal | null,
  meta: RequestMeta,
): Promise<void> {
  await auditLogRepo.appendAuditEntry(
    {
      actor: actor
        ? { type: actor.role, userId: actor.role === 'owner' ? actor.userId : null, staffId: null }
        : { type: 'system', userId: null, staffId: null },
      action,
      entityType: 'kioskDevice',
      entityId: device._id,
      before: null,
      after: { name: device.name },
      meta: { ipHash: ipHashOf(meta.ip) },
      requestId: meta.requestId,
    },
    meta.now,
  );
}

/** The owner names a tablet and picks its exit PIN; the answer carries the one-use code. */
export async function setupKioskDevice(
  owner: Principal,
  input: { name: string; exitPin: string },
  meta: RequestMeta,
): Promise<{ device: KioskDeviceView; code: string }> {
  const code = sixDigits();
  const id = newId();
  const device = await kioskDevicesRepo.insertKioskDevice(
    {
      name: input.name,
      exitPinHash: await hashPin(id, input.exitPin),
      pairCodeHash: await hashPin(`pair:${id}`, code),
      pairCodeExpiresAt: new Date(meta.now.getTime() + PAIR_CODE_MS),
      tokenHash: null,
      pairedAt: null,
      demo: false,
    },
    meta.now,
    { id },
  );
  await audit('kiosk.setup', device, owner, meta);
  return { device: kioskDeviceView(device), code };
}

async function startDevice(res: ServerResponse, device: KioskDeviceDocument, now: Date) {
  const token = randomToken(32);
  const paired = await kioskDevicesRepo.pairKioskDevice(device._id, sha256Hex(token), now);
  if (!paired) throw new AppError('INVALID_CREDENTIALS', 'That code is not valid');
  setKioskCookie(res, token);
}

/** The tablet types the code. Every unpaired device with a live code is tried, after the same hashing work. */
export async function pairKioskDevice(
  res: ServerResponse,
  code: string,
  meta: RequestMeta,
): Promise<{ name: string }> {
  const ipKey = `kiosk:pair:${meta.ip}`;
  const count = await rateLimitsRepo.peekRateLimit(ipKey, PAIR_IP_LIMIT, meta.now);
  if (count >= PAIR_IP_LIMIT.limit) {
    throw new AppError('RATE_LIMITED', 'Too many tries. Please wait and try again.', {
      retryAfterSeconds: retryAfter(PAIR_IP_LIMIT.windowMs, meta.now),
    });
  }
  const waiting = await kioskDevicesRepo.listKioskDevicesAwaitingCode(meta.now);
  let match: KioskDeviceDocument | null = null;
  for (const d of waiting) {
    if (d.pairCodeHash && (await verifyPin(d.pairCodeHash, `pair:${d._id}`, code))) match = d;
  }
  if (!match) {
    await verifyPin(await dummyPinHash(), 'pair:none', code);
    await rateLimitsRepo.hitRateLimit(ipKey, PAIR_IP_LIMIT, meta.now);
    throw new AppError('INVALID_CREDENTIALS', 'That code is not valid');
  }
  await startDevice(res, match, meta.now);
  await audit('kiosk.pair', match, null, meta);
  return { name: match.name };
}

/** The showcase: one tap pairs a demo tablet with the demo exit PIN. Cleared by the demo reset. */
export async function pairDemoKioskDevice(
  res: ServerResponse,
  meta: RequestMeta,
): Promise<{ name: string }> {
  const id = newId();
  const device = await kioskDevicesRepo.insertKioskDevice(
    {
      name: 'Demo tablet',
      exitPinHash: await hashPin(id, DEMO_EXIT_PIN),
      pairCodeHash: null,
      pairCodeExpiresAt: null,
      tokenHash: null,
      pairedAt: null,
      demo: true,
    },
    meta.now,
    { id },
  );
  await startDevice(res, device, meta.now);
  await audit('kiosk.pair', device, null, meta);
  return { name: device.name };
}

/**
 * The router's kiosk authenticator: the cookie names a paired, live device seen within the last
 * 180 days. Each use slides the window (written at most hourly). Anything else clears the cookie
 * and answers null, so the tablet goes back to its pairing screen.
 */
export async function authenticateKiosk(ctx: RequestContext): Promise<Principal | null> {
  const token = readKioskCookie(ctx.req);
  if (!token) return null;
  const device = await kioskDevicesRepo.findKioskDeviceByToken(sha256Hex(token));
  const seen = device?.lastSeenAt ?? device?.pairedAt ?? null;
  if (!device || !seen || seen.getTime() + SESSION_MS < ctx.now.getTime()) {
    clearKioskCookie(ctx.res);
    return null;
  }
  if (ctx.now.getTime() - seen.getTime() > TOUCH_MS) {
    await kioskDevicesRepo.touchKioskDevice(device._id, ctx.now);
  }
  return {
    userId: device._id,
    role: 'kiosk',
    staffId: null,
    sessionId: device._id,
    email: '',
    mustChangePassword: false,
  };
}

/** The exit PIN on the tablet: the hold on the logo, then the pad. Five wrong lock it for 15 minutes. */
export async function verifyKioskExitPin(
  principal: Principal,
  exitPin: string,
  meta: RequestMeta,
): Promise<void> {
  const device = await kioskDevicesRepo.findKioskDeviceById(principal.userId);
  if (!device || device.revokedAt) throw new AppError('AUTH_REQUIRED', 'Pair this tablet');
  const throttleKey = sha256Hex(`kiosk:exit:${device._id}`);
  const throttle = await loginThrottleRepo.getLoginThrottle(throttleKey);
  if (throttle?.lockedUntil && throttle.lockedUntil.getTime() > meta.now.getTime()) {
    throw new AppError('ACCOUNT_LOCKED', 'Too many wrong tries. Please wait before trying again.', {
      retryAfterSeconds: Math.ceil((throttle.lockedUntil.getTime() - meta.now.getTime()) / 1000),
    });
  }
  const ok = await verifyPin(device.exitPinHash, device._id, exitPin);
  if (!ok) {
    await loginThrottleRepo.recordLoginFailure(throttleKey, EXIT_PIN_LOCKOUT, meta.now);
    throw new AppError('INVALID_CREDENTIALS', 'That PIN is not right');
  }
  await loginThrottleRepo.clearLoginThrottle(throttleKey);
}

/** Unpair from the tablet itself (after the exit PIN) or from the owner's list. */
export async function unpairKioskDevice(
  res: ServerResponse | null,
  id: string,
  actor: Principal | null,
  meta: RequestMeta,
): Promise<void> {
  const device = await kioskDevicesRepo.findKioskDeviceById(id);
  if (!device) throw new AppError('NOT_FOUND', 'That tablet was not found');
  await kioskDevicesRepo.revokeKioskDevice(device._id, meta.now);
  if (res) clearKioskCookie(res);
  await audit('kiosk.unpair', device, actor, meta);
}

export async function listKioskDevices(): Promise<KioskDeviceView[]> {
  return (await kioskDevicesRepo.listKioskDevices()).map(kioskDeviceView);
}
