import type { ServerResponse } from 'node:http';
import { pinProblem } from '../../shared/lib/pin';
import type { Actor } from '../../shared/schemas/timeBlock';
import type { Principal, RequestContext } from '../http/types';
import { AppError } from '../lib/errors';
import { randomToken, sha256Hex } from '../lib/ids';
import {
  auditLogRepo,
  loginThrottleRepo,
  rateLimitsRepo,
  setupTokensRepo,
  staffPinsRepo,
  staffRepo,
  teamSessionsRepo,
} from '../repos';
import { clearTeamCookie, readTeamCookie, setTeamCookie } from './cookies';
import { dummyPinHash, hashPin, verifyPin } from './pin';
import { withTransaction } from '../db/transaction';
import type { RequestMeta } from './authService';
import { ipHashOf } from './authService';

/** A barber's sign-in lasts 12 hours from the moment it starts, however busy the day. */
export const TEAM_SESSION_MS = 12 * 60 * 60_000;
/** A setup link works once, within 72 hours. */
export const SETUP_LINK_MS = 72 * 60 * 60_000;
/** Five wrong tries lock that barber for 15 minutes. Only failures count. */
export const PIN_LOCKOUT = { threshold: 5, lockMinutes: [15] } as const;
/** Thirty wrong tries from one address in 15 minutes, across all barbers. */
export const PIN_IP_LIMIT = { limit: 30, windowMs: 15 * 60_000 };

const GENERIC_FAILURE = 'That PIN did not work';
const SYSTEM: Actor = { type: 'system', userId: null, staffId: null };

/** The throttle key of one barber. Hashed like the owner login's, so the table holds no names. */
export function pinThrottleKey(staffId: string): string {
  return sha256Hex(`pin:${staffId}`);
}

function retryAfter(windowMs: number, now: Date): number {
  const windowEnd = (Math.floor(now.getTime() / windowMs) + 1) * windowMs;
  return Math.max(1, Math.ceil((windowEnd - now.getTime()) / 1000));
}

async function audit(
  action: string,
  staffId: string,
  actor: Actor,
  meta: RequestMeta,
  extra: Record<string, unknown> | null = null,
): Promise<void> {
  await auditLogRepo.appendAuditEntry(
    {
      actor,
      action,
      entityType: 'staff',
      entityId: staffId,
      before: null,
      after: null,
      meta: extra,
      requestId: meta.requestId,
    },
    meta.now,
  );
}

/** A barber who can sign in: on the team page and not removed. */
async function usableStaff(staffId: string) {
  const staff = await staffRepo.findStaffById(staffId);
  return staff?.deletedAt === null && staff.showOnWebsite ? staff : null;
}

function principalFor(staff: { _id: string }, sessionId: string): Principal {
  return {
    userId: staff._id,
    role: 'barber',
    staffId: staff._id,
    sessionId,
    email: '',
    mustChangePassword: false,
  };
}

async function startTeamSession(
  res: ServerResponse,
  staffId: string,
  meta: RequestMeta,
): Promise<string> {
  const token = randomToken(32);
  const session = await teamSessionsRepo.insertTeamSession(
    {
      tokenHash: sha256Hex(token),
      staffId,
      expiresAt: new Date(meta.now.getTime() + TEAM_SESSION_MS),
      ip: meta.ip.slice(0, 64),
      userAgent: meta.userAgent?.slice(0, 512) ?? null,
    },
    meta.now,
  );
  setTeamCookie(res, token, TEAM_SESSION_MS / 1000);
  return session._id;
}

/**
 * Signs a barber in. A wrong PIN, a barber with no PIN yet, a removed or hidden barber and an id
 * that does not exist all answer the same, after the same hashing work, so neither the message
 * nor the timing says which part was wrong. Only failures count: five on one real barber lock
 * that barber for 15 minutes, thirty from one address stop that address for 15 minutes.
 */
export async function teamLogin(
  res: ServerResponse,
  input: { staffId: string; pin: string },
  meta: RequestMeta,
): Promise<{ sessionId: string; expiresAt: Date }> {
  const ipKey = `pin:ip:${meta.ip}`;
  const ipCount = await rateLimitsRepo.peekRateLimit(ipKey, PIN_IP_LIMIT, meta.now);
  if (ipCount >= PIN_IP_LIMIT.limit) {
    throw new AppError('RATE_LIMITED', 'Too many tries. Please wait and try again.', {
      retryAfterSeconds: retryAfter(PIN_IP_LIMIT.windowMs, meta.now),
    });
  }
  const staff = await usableStaff(input.staffId);
  const throttleKey = staff ? pinThrottleKey(staff._id) : null;
  if (throttleKey) {
    const throttle = await loginThrottleRepo.getLoginThrottle(throttleKey);
    if (throttle?.lockedUntil && throttle.lockedUntil.getTime() > meta.now.getTime()) {
      throw new AppError(
        'ACCOUNT_LOCKED',
        'Too many wrong tries. Please wait before trying again.',
        {
          retryAfterSeconds: Math.ceil(
            (throttle.lockedUntil.getTime() - meta.now.getTime()) / 1000,
          ),
        },
      );
    }
  }
  const pinDoc = staff ? await staffPinsRepo.findPinByStaff(staff._id) : null;
  const ok = await verifyPin(pinDoc?.pinHash ?? (await dummyPinHash()), input.staffId, input.pin);
  if (!staff || !pinDoc || !ok) {
    await rateLimitsRepo.hitRateLimit(ipKey, PIN_IP_LIMIT, meta.now);
    if (throttleKey) await loginThrottleRepo.recordLoginFailure(throttleKey, PIN_LOCKOUT, meta.now);
    if (staff)
      await audit('auth.pin.failure', staff._id, SYSTEM, meta, { ipHash: ipHashOf(meta.ip) });
    throw new AppError('INVALID_CREDENTIALS', GENERIC_FAILURE);
  }
  await loginThrottleRepo.clearLoginThrottle(pinThrottleKey(staff._id));
  await staffPinsRepo.recordSignIn(staff._id, meta.now);
  const sessionId = await startTeamSession(res, staff._id, meta);
  await audit(
    'auth.pin.success',
    staff._id,
    { type: 'barber', userId: null, staffId: staff._id },
    meta,
  );
  return { sessionId, expiresAt: new Date(meta.now.getTime() + TEAM_SESSION_MS) };
}

/**
 * The barber cookie authenticator for the router. A missing, malformed, unknown, revoked or
 * expired session answers null (so 401), as does a barber who has since been removed or hidden.
 */
export async function authenticateTeam(ctx: RequestContext): Promise<Principal | null> {
  const token = readTeamCookie(ctx.req);
  if (!token) return null;
  const session = await teamSessionsRepo.findActiveTeamSession(sha256Hex(token), ctx.now);
  if (!session) {
    clearTeamCookie(ctx.res);
    return null;
  }
  const staff = await usableStaff(session.staffId);
  if (!staff) {
    clearTeamCookie(ctx.res);
    return null;
  }
  return principalFor(staff, session._id);
}

export async function endTeamSession(
  res: ServerResponse,
  principal: Principal,
  now: Date,
): Promise<void> {
  await teamSessionsRepo.revokeTeamSession(principal.sessionId, now);
  clearTeamCookie(res);
}

export function teamActor(principal: Principal): Actor {
  return { type: 'barber', userId: null, staffId: principal.staffId };
}

function pinError(pin: string): AppError | null {
  const problem = pinProblem(pin);
  return problem
    ? new AppError('VALIDATION_ERROR', 'Please choose a different PIN', {
        details: [{ path: 'pin', message: problem }],
      })
    : null;
}

/** The barber changes their own PIN. Needs the current one, ends their other sessions. */
export async function changePin(
  principal: Principal,
  input: { currentPin: string; newPin: string },
  meta: RequestMeta,
): Promise<void> {
  const staffId = principal.staffId ?? '';
  const ipKey = `pin:ip:${meta.ip}`;
  if ((await rateLimitsRepo.peekRateLimit(ipKey, PIN_IP_LIMIT, meta.now)) >= PIN_IP_LIMIT.limit) {
    throw new AppError('RATE_LIMITED', 'Too many tries. Please wait and try again.', {
      retryAfterSeconds: retryAfter(PIN_IP_LIMIT.windowMs, meta.now),
    });
  }
  const key = pinThrottleKey(staffId);
  const throttle = await loginThrottleRepo.getLoginThrottle(key);
  if (throttle?.lockedUntil && throttle.lockedUntil.getTime() > meta.now.getTime()) {
    throw new AppError('ACCOUNT_LOCKED', 'Too many wrong tries. Please wait before trying again.', {
      retryAfterSeconds: Math.ceil((throttle.lockedUntil.getTime() - meta.now.getTime()) / 1000),
    });
  }
  const doc = await staffPinsRepo.findPinByStaff(staffId);
  if (!doc || !(await verifyPin(doc.pinHash, staffId, input.currentPin))) {
    await rateLimitsRepo.hitRateLimit(ipKey, PIN_IP_LIMIT, meta.now);
    await loginThrottleRepo.recordLoginFailure(key, PIN_LOCKOUT, meta.now);
    throw new AppError('INVALID_CREDENTIALS', 'Your current PIN is not right');
  }
  const bad = pinError(input.newPin);
  if (bad) throw bad;
  if (input.newPin === input.currentPin) {
    throw new AppError('VALIDATION_ERROR', 'Please choose a different PIN', {
      details: [{ path: 'newPin', message: 'Choose a PIN different from the current one.' }],
    });
  }
  await loginThrottleRepo.clearLoginThrottle(key);
  await staffPinsRepo.upsertPin(staffId, await hashPin(staffId, input.newPin), meta.now);
  const ended = await teamSessionsRepo.revokeTeamSessionsForStaff(staffId, meta.now, {
    exceptId: principal.sessionId,
  });
  await audit('auth.pin.change', staffId, teamActor(principal), meta, {
    otherSessionsEnded: ended,
  });
}

// ---------------------------------------------------------------------------
// Setup links
// ---------------------------------------------------------------------------

export interface IssuedLink {
  token: string;
  expiresAt: Date;
}

/**
 * Makes a one-time setup link for a barber. This is also how a PIN is reset: the old PIN stops
 * working, every session of that barber ends, earlier links are retired and the lockout clears.
 * The token has 32 random bytes and only its hash is kept.
 */
export async function issueSetupLink(
  ownerActor: Actor,
  ownerUserId: string,
  staffId: string,
  meta: RequestMeta,
): Promise<IssuedLink> {
  const staff = await staffRepo.findStaffById(staffId);
  if (!staff || staff.deletedAt) throw new AppError('NOT_FOUND', 'Staff member was not found');
  const token = randomToken(32);
  const expiresAt = new Date(meta.now.getTime() + SETUP_LINK_MS);
  await withTransaction(async (session) => {
    await staffPinsRepo.deletePin(staffId, { session });
    await teamSessionsRepo.revokeTeamSessionsForStaff(staffId, meta.now, { session });
    await setupTokensRepo.retireTokensForStaff(staffId, meta.now, { session });
    await setupTokensRepo.insertSetupToken(
      { staffId, tokenHash: sha256Hex(token), createdByUserId: ownerUserId, expiresAt },
      meta.now,
      { session },
    );
  });
  await loginThrottleRepo.clearLoginThrottle(pinThrottleKey(staffId));
  await audit('auth.pin.setupLink', staffId, ownerActor, meta);
  return { token, expiresAt };
}

/** What the setup page may say before a PIN exists: whose link it is. Unknown links all look alike. */
export async function setupLinkInfo(token: string, now: Date): Promise<{ staffName: string }> {
  const found = await setupTokensRepo.findUsableToken(sha256Hex(token), now);
  const staff = found ? await usableStaff(found.staffId) : null;
  if (!found || !staff)
    throw new AppError('NOT_FOUND', 'This link has expired or was already used');
  return { staffName: staff.name };
}

/** Uses a setup link to choose a PIN, then signs the barber in. The link works exactly once. */
export async function completeSetup(
  res: ServerResponse,
  token: string,
  pin: string,
  meta: RequestMeta,
): Promise<{ sessionId: string; expiresAt: Date }> {
  const ipKey = `pin:ip:${meta.ip}`;
  if ((await rateLimitsRepo.peekRateLimit(ipKey, PIN_IP_LIMIT, meta.now)) >= PIN_IP_LIMIT.limit) {
    throw new AppError('RATE_LIMITED', 'Too many tries. Please wait and try again.', {
      retryAfterSeconds: retryAfter(PIN_IP_LIMIT.windowMs, meta.now),
    });
  }
  const found = await setupTokensRepo.findUsableToken(sha256Hex(token), meta.now);
  const staff = found ? await usableStaff(found.staffId) : null;
  if (!found || !staff) {
    await rateLimitsRepo.hitRateLimit(ipKey, PIN_IP_LIMIT, meta.now);
    throw new AppError('NOT_FOUND', 'This link has expired or was already used');
  }
  const bad = pinError(pin);
  if (bad) throw bad;
  const pinHash = await hashPin(staff._id, pin);
  await withTransaction(async (session) => {
    if (!(await setupTokensRepo.consumeToken(found._id, meta.now, { session }))) {
      throw new AppError('NOT_FOUND', 'This link has expired or was already used');
    }
    await staffPinsRepo.upsertPin(staff._id, pinHash, meta.now, { session });
  });
  await loginThrottleRepo.clearLoginThrottle(pinThrottleKey(staff._id));
  await staffPinsRepo.recordSignIn(staff._id, meta.now);
  const sessionId = await startTeamSession(res, staff._id, meta);
  await audit(
    'auth.pin.setup',
    staff._id,
    { type: 'barber', userId: null, staffId: staff._id },
    meta,
  );
  return { sessionId, expiresAt: new Date(meta.now.getTime() + TEAM_SESSION_MS) };
}

// ---------------------------------------------------------------------------
// The owner's view of a barber's access
// ---------------------------------------------------------------------------

export async function staffAccess(
  staffId: string,
  now: Date,
): Promise<{
  hasPin: boolean;
  lastSignInAt: Date | null;
  lockedUntil: Date | null;
  setupLinkActive: boolean;
}> {
  const staff = await staffRepo.findStaffById(staffId);
  if (!staff) throw new AppError('NOT_FOUND', 'Staff member was not found');
  const [pin, throttle, setupLinkActive] = await Promise.all([
    staffPinsRepo.findPinByStaff(staffId),
    loginThrottleRepo.getLoginThrottle(pinThrottleKey(staffId)),
    setupTokensRepo.hasUsableTokenForStaff(staffId, now),
  ]);
  const lockedUntil =
    throttle?.lockedUntil && throttle.lockedUntil.getTime() > now.getTime()
      ? throttle.lockedUntil
      : null;
  return {
    hasPin: pin !== null,
    lastSignInAt: pin?.lastSignInAt ?? null,
    lockedUntil,
    setupLinkActive,
  };
}

/** Clears a lockout, so a barber who mistyped five times need not wait out the 15 minutes. */
export async function unlockStaff(
  ownerActor: Actor,
  staffId: string,
  meta: RequestMeta,
): Promise<void> {
  const staff = await staffRepo.findStaffById(staffId);
  if (!staff) throw new AppError('NOT_FOUND', 'Staff member was not found');
  await loginThrottleRepo.clearLoginThrottle(pinThrottleKey(staffId));
  await audit('auth.pin.unlock', staffId, ownerActor, meta);
}
