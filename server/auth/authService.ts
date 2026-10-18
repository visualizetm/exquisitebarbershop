import type { ServerResponse } from 'node:http';
import type { Actor } from '../../shared/schemas/timeBlock';
import type { UserDocument } from '../../shared/schemas/user';
import type { Principal } from '../http/types';
import { getEnv } from '../env';
import { AppError } from '../lib/errors';
import { sha256Hex } from '../lib/ids';
import {
  auditLogRepo,
  loginThrottleRepo,
  rateLimitsRepo,
  sessionsRepo,
  staffRepo,
  usersRepo,
} from '../repos';
import {
  generateTemporaryPassword,
  getDummyHash,
  hashPassword,
  needsRehash,
  passwordProblems,
  verifyPassword,
} from './password';
import { startSession } from './sessions';

/** Per IP: 20 sign-in attempts per 15 minutes, any email. */
export const LOGIN_IP_LIMIT = { limit: 20, windowMs: 15 * 60_000 };
/** Per email, existing or not: 10 attempts per 15 minutes. */
export const LOGIN_ACCOUNT_LIMIT = { limit: 10, windowMs: 15 * 60_000 };
/** Five failures in a row lock the email; each lockout in a row lasts longer. */
export const LOCKOUT_RULE = { threshold: 5, lockMinutes: [5, 15, 60, 240] } as const;
/** Password changes per login: 10 per 15 minutes. */
export const PASSWORD_CHANGE_LIMIT = { limit: 10, windowMs: 15 * 60_000 };

const GENERIC_FAILURE = 'Email or password is incorrect';

export interface RequestMeta {
  ip: string;
  userAgent: string | null;
  requestId: string;
  now: Date;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Throttle key for an email. Hashed so the throttle table holds no addresses. */
export function emailKey(email: string): string {
  return sha256Hex(`login:${normalizeEmail(email)}`);
}

/** Seconds until the current fixed window of a limit ends. */
function retryAfter(windowMs: number, now: Date): number {
  const windowEnd = (Math.floor(now.getTime() / windowMs) + 1) * windowMs;
  return Math.max(1, Math.ceil((windowEnd - now.getTime()) / 1000));
}

/** A keyed hash of the client address, so the stored list holds no addresses. */
export function ipHashOf(ip: string): string {
  return sha256Hex(`ip:${ip}:${getEnv().MANAGE_LINK_SECRET}`);
}

function actorOf(principal: Principal): Actor {
  return { type: principal.role, userId: principal.userId, staffId: principal.staffId };
}

const SYSTEM: Actor = { type: 'system', userId: null, staffId: null };

async function auditLogin(
  outcome: 'success' | 'failure',
  input: { email: string; userId: string | null; reason: string | null },
  meta: RequestMeta,
): Promise<void> {
  await auditLogRepo.appendAuditEntry(
    {
      actor: input.userId ? { type: 'system', userId: input.userId, staffId: null } : SYSTEM,
      action: outcome === 'success' ? 'auth.login.success' : 'auth.login.failure',
      entityType: 'user',
      entityId: input.userId ?? 'unknown',
      before: null,
      after: null,
      meta: { email: normalizeEmail(input.email).slice(0, 254), ip: meta.ip, reason: input.reason },
      requestId: meta.requestId,
    },
    meta.now,
  );
}

/** A login may act only if it is active and, for barbers, linked to a live staff record. */
async function loginIsUsable(user: UserDocument): Promise<boolean> {
  if (!user.isActive) return false;
  if (user.role === 'owner') return true;
  if (!user.staffId) return false;
  const staff = await staffRepo.findStaffById(user.staffId);
  return staff !== null && staff.deletedAt === null;
}

export interface LoginResult {
  user: UserDocument;
  sessionId: string;
}

/**
 * Signs in. Wrong passwords, unknown emails, disabled logins and unlinked
 * barbers all get the same INVALID_CREDENTIALS after the same argon2 work, and
 * the throttle is keyed by email whether or not an account exists, so neither
 * the message, the timing nor the lockout reveals which emails have accounts.
 * The password is never logged.
 */
export async function login(
  res: ServerResponse,
  input: { email: string; password: string },
  meta: RequestMeta,
): Promise<LoginResult> {
  const email = normalizeEmail(input.email);
  // Only failed attempts count toward the address limit; it is read first and written on failure.
  const ipKey = `login:ip:${meta.ip}`;
  const ipCount = await rateLimitsRepo.peekRateLimit(ipKey, LOGIN_IP_LIMIT, meta.now);
  if (ipCount >= LOGIN_IP_LIMIT.limit) {
    await auditLogin('failure', { email, userId: null, reason: 'ipRateLimited' }, meta);
    throw new AppError('RATE_LIMITED', 'Too many sign-in attempts. Please wait and try again.', {
      retryAfterSeconds: retryAfter(LOGIN_IP_LIMIT.windowMs, meta.now),
    });
  }
  const key = emailKey(email);
  // The same rule per email: a guess is a failure, a sign-in from a known phone is not an attempt.
  const accountKey = `login:account:${key}`;
  const accountCount = await rateLimitsRepo.peekRateLimit(
    accountKey,
    LOGIN_ACCOUNT_LIMIT,
    meta.now,
  );
  if (accountCount >= LOGIN_ACCOUNT_LIMIT.limit) {
    await auditLogin('failure', { email, userId: null, reason: 'accountRateLimited' }, meta);
    throw new AppError('RATE_LIMITED', 'Too many sign-in attempts. Please wait and try again.', {
      retryAfterSeconds: retryAfter(LOGIN_ACCOUNT_LIMIT.windowMs, meta.now),
    });
  }
  const ipHash = ipHashOf(meta.ip);
  const throttle = await loginThrottleRepo.getLoginThrottle(key);
  const lockedUntil = throttle?.lockedUntil ?? null;
  const locked = lockedUntil !== null && lockedUntil.getTime() > meta.now.getTime();
  // An address this login succeeded from recently may pass a lockout someone else caused.
  const known = locked ? await usersRepo.findUserByEmail(email) : null;
  const bypass = locked && known !== null && usersRepo.hasRecentLoginIp(known, ipHash, meta.now);
  if (locked && !bypass) {
    await auditLogin('failure', { email, userId: null, reason: 'locked' }, meta);
    throw new AppError(
      'ACCOUNT_LOCKED',
      'Too many failed attempts. Please wait before trying again.',
      {
        retryAfterSeconds: Math.ceil((lockedUntil.getTime() - meta.now.getTime()) / 1000),
      },
    );
  }

  const user = await usersRepo.findUserByEmail(email);
  const passwordOk = await verifyPassword(
    user?.passwordHash ?? (await getDummyHash()),
    input.password,
  );
  // Barbers sign in with a PIN at /team. Said only after the right password, so it reveals nothing.
  if (user && passwordOk && user.role === 'barber') {
    await auditLogin('failure', { email, userId: user._id, reason: 'barberUsesTeam' }, meta);
    throw new AppError('FORBIDDEN', 'Barbers sign in with a PIN at /team', {
      extra: { signInAt: '/team' },
    });
  }
  const usable = user !== null && passwordOk && (await loginIsUsable(user));
  if (!user || !usable) {
    await rateLimitsRepo.hitRateLimit(ipKey, LOGIN_IP_LIMIT, meta.now);
    await rateLimitsRepo.hitRateLimit(accountKey, LOGIN_ACCOUNT_LIMIT, meta.now);
    await loginThrottleRepo.recordLoginFailure(key, LOCKOUT_RULE, meta.now);
    const reason = !user ? 'unknownEmail' : !passwordOk ? 'badPassword' : 'disabled';
    await auditLogin('failure', { email, userId: user?._id ?? null, reason }, meta);
    throw new AppError('INVALID_CREDENTIALS', GENERIC_FAILURE);
  }

  // A sign-in that passed a lockout leaves it in place, so the guesser stays locked out.
  if (!bypass) await loginThrottleRepo.clearLoginThrottle(key);
  await usersRepo.recordSuccessfulLogin(user._id, meta.now, ipHash);
  if (needsRehash(user.passwordHash)) {
    await usersRepo.setUserPasswordHash(user._id, await hashPassword(input.password), meta.now, {
      mustChangePassword: user.mustChangePassword,
    });
  }
  const session = await startSession(res, user, {
    ip: meta.ip,
    userAgent: meta.userAgent,
    now: meta.now,
  });
  await auditLogin('success', { email, userId: user._id, reason: null }, meta);
  return { user, sessionId: session._id };
}

/** Demo sign-ins per address: enough to show the dashboard on a phone and a laptop, not to spray sessions. */
export const DEMO_LOGIN_LIMIT = { limit: 30, windowMs: 15 * 60_000 };

/**
 * Demo mode only: a normal session for the seeded owner without a password, so the
 * showcase opens in one click. The caller (the demo-only route) has already checked the mode.
 */
export async function loginAsDemoOwner(
  res: ServerResponse,
  meta: RequestMeta,
): Promise<LoginResult> {
  const hit = await rateLimitsRepo.hitRateLimit(
    `demo-login:ip:${meta.ip}`,
    DEMO_LOGIN_LIMIT,
    meta.now,
  );
  if (!hit.allowed) {
    throw new AppError('RATE_LIMITED', 'Too many attempts. Please wait and try again.', {
      retryAfterSeconds: hit.retryAfterSeconds,
    });
  }
  const owner = await usersRepo.findOwnerUser();
  if (!owner?.isActive) throw new AppError('NOT_FOUND', 'No such endpoint');
  await usersRepo.recordSuccessfulLogin(owner._id, meta.now, ipHashOf(meta.ip));
  const session = await startSession(res, owner, {
    ip: meta.ip,
    userAgent: meta.userAgent,
    now: meta.now,
  });
  await auditLogin('success', { email: owner.email, userId: owner._id, reason: 'demo' }, meta);
  return { user: owner, sessionId: session._id };
}

function weakPasswordError(problems: string[], path: string): AppError {
  return new AppError('VALIDATION_ERROR', 'Please choose a stronger password', {
    details: problems.map((message) => ({ path, message })),
  });
}

/**
 * Changes the caller's own password. Requires the current one, ends every other
 * session of this login and clears the temporary-password flag.
 */
export async function changeOwnPassword(
  principal: Principal,
  input: { currentPassword: string; newPassword: string },
  meta: RequestMeta,
): Promise<void> {
  const hit = await rateLimitsRepo.hitRateLimit(
    `password:user:${principal.userId}`,
    PASSWORD_CHANGE_LIMIT,
    meta.now,
  );
  if (!hit.allowed) {
    throw new AppError('RATE_LIMITED', 'Too many attempts. Please wait and try again.', {
      retryAfterSeconds: hit.retryAfterSeconds,
    });
  }
  const user = await usersRepo.findUserById(principal.userId);
  if (!user) throw new AppError('AUTH_REQUIRED', 'Please sign in');
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw new AppError('INVALID_CREDENTIALS', 'Your current password is incorrect');
  }
  if (input.newPassword === input.currentPassword) {
    throw weakPasswordError(['Choose a password different from the current one.'], 'newPassword');
  }
  const problems = passwordProblems(input.newPassword, { email: user.email });
  if (problems.length > 0) throw weakPasswordError(problems, 'newPassword');
  await usersRepo.setUserPasswordHash(user._id, await hashPassword(input.newPassword), meta.now);
  const ended = await sessionsRepo.revokeOtherSessions(user._id, principal.sessionId, meta.now);
  await auditLogRepo.appendAuditEntry(
    {
      actor: actorOf(principal),
      action: 'user.password.change',
      entityType: 'user',
      entityId: user._id,
      before: null,
      after: null,
      meta: { otherSessionsEnded: ended, wasTemporary: user.mustChangePassword },
      requestId: meta.requestId,
    },
    meta.now,
  );
}

/** Changes the signed-in login's email. Asks for the current password, like a password change. */
export async function changeOwnEmail(
  principal: Principal,
  input: { currentPassword: string; newEmail: string },
  meta: RequestMeta,
): Promise<void> {
  const hit = await rateLimitsRepo.hitRateLimit(
    `password:user:${principal.userId}`,
    PASSWORD_CHANGE_LIMIT,
    meta.now,
  );
  if (!hit.allowed) {
    throw new AppError('RATE_LIMITED', 'Too many attempts. Please wait and try again.', {
      retryAfterSeconds: hit.retryAfterSeconds,
    });
  }
  const user = await usersRepo.findUserById(principal.userId);
  if (!user) throw new AppError('AUTH_REQUIRED', 'Please sign in');
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw new AppError('INVALID_CREDENTIALS', 'Your current password is incorrect');
  }
  if (input.newEmail === user.email)
    throw new AppError('BAD_REQUEST', 'That is already your email');
  await usersRepo.setUserEmail(user._id, input.newEmail, meta.now);
  await auditLogRepo.appendAuditEntry(
    {
      actor: actorOf(principal),
      action: 'user.email.change',
      entityType: 'user',
      entityId: user._id,
      before: { email: user.email },
      after: { email: input.newEmail },
      meta: null,
      requestId: meta.requestId,
    },
    meta.now,
  );
}

/**
 * Creates the owner login during seeding, once. Refuses a weak password rather
 * than creating an account that is easy to take over.
 */
export async function ensureOwnerLogin(
  input: { email: string; password: string; staffId: string | null },
  now: Date,
): Promise<{ created: boolean }> {
  if (await usersRepo.findOwnerUser()) return { created: false };
  const problems = passwordProblems(input.password, { email: input.email });
  if (problems.length > 0) {
    throw new Error(`SEED_OWNER_PASSWORD is too weak: ${problems.join(' ')}`);
  }
  const user = await usersRepo.insertUser(
    {
      email: normalizeEmail(input.email),
      passwordHash: await hashPassword(input.password),
      role: 'owner',
      staffId: input.staffId,
    },
    now,
  );
  await auditLogRepo.appendAuditEntry(
    {
      actor: SYSTEM,
      action: 'user.create',
      entityType: 'user',
      entityId: user._id,
      before: null,
      after: { email: user.email, role: user.role },
      meta: { source: 'seed' },
      requestId: null,
    },
    now,
  );
  return { created: true };
}

/**
 * Operator reset from the server shell (npm run user:reset). Sets a new password,
 * temporary unless one is supplied, ends every session and clears the lockout.
 */
export async function operatorResetPassword(
  input: { email: string; password: string | null },
  now: Date,
): Promise<{ user: UserDocument; password: string; temporary: boolean }> {
  const user = await usersRepo.findUserByEmail(input.email);
  if (!user) throw new Error(`No login exists for ${normalizeEmail(input.email)}`);
  const temporary = input.password === null;
  const password = input.password ?? generateTemporaryPassword();
  const problems = passwordProblems(password, { email: user.email });
  if (problems.length > 0) throw new Error(`Password is too weak: ${problems.join(' ')}`);
  await usersRepo.setUserPasswordHash(user._id, await hashPassword(password), now, {
    mustChangePassword: temporary,
  });
  await usersRepo.setUserActive(user._id, true, now);
  await sessionsRepo.revokeAllSessionsForUser(user._id, now);
  await loginThrottleRepo.clearLoginThrottle(emailKey(user.email));
  await auditLogRepo.appendAuditEntry(
    {
      actor: SYSTEM,
      action: 'user.password.reset',
      entityType: 'user',
      entityId: user._id,
      before: null,
      after: null,
      meta: { source: 'cli', temporary },
      requestId: null,
    },
    now,
  );
  return { user, password, temporary };
}
