import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * The session cookie. The __Host- prefix makes browsers refuse it unless it is
 * Secure, has Path=/ and no Domain, so it can never be set by a subdomain or sent
 * over plain HTTP. Browsers treat localhost as secure, so local development works.
 */
export const SESSION_COOKIE = '__Host-exq_session';

/**
 * The barber portal's own cookie, separate from the owner's so the two can never stand in for each
 * other: an owner route reads only the owner cookie, a barber route only this one.
 */
export const TEAM_COOKIE = '__Host-exq_team';

/**
 * The front desk tablet's device flag. Set once by the owner on that tablet ("Keep this tablet
 * signed in"); while it is present and valid, the owner session on that device idles out after 30
 * days instead of 14. It is a flag, not a credential: without a valid session it does nothing.
 */
export const TABLET_COOKIE = '__Host-exq_tablet';
export const TABLET_COOKIE_DAYS = 400;

/**
 * The locked front desk tablet's device cookie (prompt 13f). Strict: the tablet only ever talks to
 * the site from its own page, so no other site may ride on it. 180 days, slid forward on use.
 */
export const KIOSK_COOKIE = '__Host-exq_kiosk';
export const KIOSK_COOKIE_DAYS = 180;

export function readKioskCookie(req: IncomingMessage): string | null {
  return readCookie(req, KIOSK_COOKIE);
}

export function setKioskCookie(res: ServerResponse, token: string): void {
  appendSetCookie(
    res,
    `${KIOSK_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${String(KIOSK_COOKIE_DAYS * 24 * 60 * 60)}`,
  );
}

export function clearKioskCookie(res: ServerResponse): void {
  appendSetCookie(res, `${KIOSK_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const HEX_PATTERN = /^[a-f0-9]{64}$/;

function readCookie(req: IncomingMessage, wanted: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    if (name !== wanted) continue;
    const value = part.slice(index + 1).trim();
    return (wanted === TABLET_COOKIE ? HEX_PATTERN : TOKEN_PATTERN).test(value) ? value : null;
  }
  return null;
}

export function readTabletCookie(req: IncomingMessage): string | null {
  return readCookie(req, TABLET_COOKIE);
}

export function setTabletCookie(res: ServerResponse, value: string): void {
  appendSetCookie(
    res,
    `${TABLET_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${String(TABLET_COOKIE_DAYS * 24 * 60 * 60)}`,
  );
}

export function clearTabletCookie(res: ServerResponse): void {
  appendSetCookie(res, `${TABLET_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

/** Reads the session token, ignoring anything that is not a well-formed token. */
export function readSessionCookie(req: IncomingMessage): string | null {
  return readCookie(req, SESSION_COOKIE);
}

export function readTeamCookie(req: IncomingMessage): string | null {
  return readCookie(req, TEAM_COOKIE);
}

function appendSetCookie(res: ServerResponse, cookie: string): void {
  const existing = res.getHeader('Set-Cookie');
  const list = Array.isArray(existing) ? existing : existing ? [String(existing)] : [];
  res.setHeader('Set-Cookie', [...list, cookie]);
}

export function setSessionCookie(res: ServerResponse, token: string, maxAgeSeconds: number): void {
  appendSetCookie(
    res,
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
  );
}

export function clearSessionCookie(res: ServerResponse): void {
  appendSetCookie(res, `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

export function setTeamCookie(res: ServerResponse, token: string, maxAgeSeconds: number): void {
  appendSetCookie(
    res,
    `${TEAM_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
  );
}

export function clearTeamCookie(res: ServerResponse): void {
  appendSetCookie(res, `${TEAM_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}
