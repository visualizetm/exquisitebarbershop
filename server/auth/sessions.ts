import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SessionDocument } from '../../shared/schemas/session';
import type { UserDocument } from '../../shared/schemas/user';
import type { RequestContext, Principal } from '../http/types';
import { randomToken, sha256Hex } from '../lib/ids';
import { getEnv } from '../env';
import { sessionsRepo, usersRepo } from '../repos';
import {
  clearSessionCookie,
  readSessionCookie,
  readTabletCookie,
  setSessionCookie,
  setTabletCookie,
} from './cookies';

/** A session lives 14 days past its last use and never more than 60 days in total. */
export const SESSION_IDLE_MS = 14 * 24 * 60 * 60_000;
/** On the front desk tablet (its device flag set), the idle window is 30 days (the 60 day cap stays). */
export const SESSION_TABLET_IDLE_MS = 30 * 24 * 60 * 60_000;
export const SESSION_ABSOLUTE_MS = 60 * 24 * 60 * 60_000;
/** Activity refreshes the expiry at most this often, to keep writes rare. */
export const SESSION_TOUCH_MS = 60 * 60_000;

function expiryFor(createdAt: Date, now: Date, idleMs: number): Date {
  return new Date(Math.min(now.getTime() + idleMs, createdAt.getTime() + SESSION_ABSOLUTE_MS));
}

/** The device flag's value: derived from the server secret, so a made-up cookie does nothing. */
export function tabletFlagValue(): string {
  return sha256Hex(`tablet-device:${getEnv().MANAGE_LINK_SECRET}`);
}

/** Marks this device as the front desk tablet: its owner session idles out after 30 days. */
export function markTablet(res: ServerResponse): void {
  setTabletCookie(res, tabletFlagValue());
}

/** 30 days on the tablet (a valid device flag on the request), 14 days anywhere else. */
function idleWindowMs(req: IncomingMessage): number {
  return readTabletCookie(req) === tabletFlagValue() ? SESSION_TABLET_IDLE_MS : SESSION_IDLE_MS;
}

function maxAgeSeconds(expiresAt: Date, now: Date): number {
  return (expiresAt.getTime() - now.getTime()) / 1000;
}

/**
 * Starts a session: a fresh 32-byte token for the cookie, only its SHA-256 stored.
 * Every sign-in gets a new token, so a token planted before sign-in is useless.
 */
export async function startSession(
  res: ServerResponse,
  user: Pick<UserDocument, '_id'>,
  meta: { ip: string | null; userAgent: string | null; now: Date },
): Promise<SessionDocument> {
  const token = randomToken(32);
  const session = await sessionsRepo.insertSession(
    {
      tokenHash: sha256Hex(token),
      userId: user._id,
      // The first window is the plain one; the tablet's flag lengthens it on the next touch.
      expiresAt: expiryFor(meta.now, meta.now, SESSION_IDLE_MS),
      ip: meta.ip?.slice(0, 64) ?? null,
      userAgent: meta.userAgent?.slice(0, 512) ?? null,
    },
    meta.now,
  );
  setSessionCookie(res, token, maxAgeSeconds(session.expiresAt, meta.now));
  return session;
}

/**
 * The cookie authenticator for the router. Returns null (and the router answers
 * 401) for a missing, malformed, unknown, revoked, idle-expired or over-age
 * session, and for a disabled login.
 */
export async function authenticateFromCookie(ctx: RequestContext): Promise<Principal | null> {
  const token = readSessionCookie(ctx.req);
  if (!token) return null;
  const session = await sessionsRepo.findActiveSession(sha256Hex(token), ctx.now);
  if (!session) {
    clearSessionCookie(ctx.res);
    return null;
  }
  if (ctx.now.getTime() >= session.createdAt.getTime() + SESSION_ABSOLUTE_MS) {
    await sessionsRepo.revokeSession(session._id, ctx.now);
    clearSessionCookie(ctx.res);
    return null;
  }
  const user = await usersRepo.findUserById(session.userId);
  // Barbers sign in at /team with a PIN; a barber login record can no longer open the dashboard.
  if (!user?.isActive || user.role !== 'owner') {
    clearSessionCookie(ctx.res);
    return null;
  }
  if (ctx.now.getTime() - session.lastSeenAt.getTime() >= SESSION_TOUCH_MS) {
    const expiresAt = expiryFor(session.createdAt, ctx.now, idleWindowMs(ctx.req));
    await sessionsRepo.touchSession(session._id, ctx.now, expiresAt);
    setSessionCookie(ctx.res, token, maxAgeSeconds(expiresAt, ctx.now));
  }
  return {
    userId: user._id,
    role: user.role,
    staffId: user.staffId,
    sessionId: session._id,
    email: user.email,
    mustChangePassword: user.mustChangePassword,
  };
}

export async function endSession(
  res: ServerResponse,
  principal: Principal,
  now: Date,
): Promise<void> {
  await sessionsRepo.revokeSession(principal.sessionId, now);
  clearSessionCookie(res);
}

export async function endAllSessions(
  res: ServerResponse,
  principal: Principal,
  now: Date,
): Promise<number> {
  const count = await sessionsRepo.revokeAllSessionsForUser(principal.userId, now);
  clearSessionCookie(res);
  return count;
}
