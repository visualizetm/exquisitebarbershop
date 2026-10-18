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

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function readCookie(req: IncomingMessage, wanted: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    if (name !== wanted) continue;
    const value = part.slice(index + 1).trim();
    return TOKEN_PATTERN.test(value) ? value : null;
  }
  return null;
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
