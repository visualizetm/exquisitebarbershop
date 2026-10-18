import { hashPassword } from '../../server/auth/password';
import { SESSION_COOKIE, TEAM_COOKIE } from '../../server/auth/cookies';
import { hashPin } from '../../server/auth/pin';
import { TEAM_SESSION_MS } from '../../server/auth/teamAuth';
import { SESSION_IDLE_MS } from '../../server/auth/sessions';
import { randomToken, sha256Hex } from '../../server/lib/ids';
import { sessionsRepo, staffPinsRepo, teamSessionsRepo, usersRepo } from '../../server/repos';
import type { UserDocument } from '../../shared/schemas/user';

export const OWNER_PASSWORD = 'owner-test-phrase-correct-91';
export const BARBER_PASSWORD = 'barber-test-phrase-correct-37';
export const TEST_PIN = '482915';

let counter = 0;

/** A login with a real argon2id hash, without going through the API. */
export async function createLogin(input: {
  role: UserDocument['role'];
  staffId: string | null;
  password?: string;
  email?: string;
  mustChangePassword?: boolean;
}): Promise<UserDocument & { password: string }> {
  counter += 1;
  const password = input.password ?? (input.role === 'owner' ? OWNER_PASSWORD : BARBER_PASSWORD);
  const user = await usersRepo.insertUser(
    {
      email: input.email ?? `${input.role}${counter}-${Date.now()}@example.com`,
      passwordHash: await hashPassword(password),
      role: input.role,
      staffId: input.staffId,
      mustChangePassword: input.mustChangePassword ?? false,
    },
    new Date(),
  );
  return { ...user, password };
}

/** A fresh session for a user, as a Cookie header value. Skips the password check for speed. */
export async function sessionCookie(userId: string, now: Date = new Date()): Promise<string> {
  const token = randomToken(32);
  await sessionsRepo.insertSession(
    {
      tokenHash: sha256Hex(token),
      userId,
      expiresAt: new Date(now.getTime() + SESSION_IDLE_MS),
      ip: null,
      userAgent: null,
    },
    now,
  );
  return `${SESSION_COOKIE}=${token}`;
}

/** Pulls the session cookie pair out of a Set-Cookie header list. */
export function cookieFrom(headers: Headers): string | null {
  for (const value of headers.getSetCookie()) {
    const pair = value.split(';')[0] ?? '';
    if (pair.startsWith(`${SESSION_COOKIE}=`) && pair.length > SESSION_COOKIE.length + 1)
      return pair;
  }
  return null;
}

export function tokenHashOf(cookie: string): string {
  return sha256Hex(cookie.split('=')[1] ?? '');
}

/** Gives a barber a PIN without going through a setup link. */
export async function setPin(staffId: string, pin: string = TEST_PIN, now: Date = new Date()) {
  return staffPinsRepo.upsertPin(staffId, await hashPin(staffId, pin), now);
}

/** A fresh barber session for a staff member, as a Cookie header value. Skips the PIN check for speed. */
export async function teamCookie(staffId: string, now: Date = new Date()): Promise<string> {
  const token = randomToken(32);
  await teamSessionsRepo.insertTeamSession(
    {
      tokenHash: sha256Hex(token),
      staffId,
      expiresAt: new Date(now.getTime() + TEAM_SESSION_MS),
      ip: null,
      userAgent: null,
    },
    now,
  );
  return `${TEAM_COOKIE}=${token}`;
}

/** Pulls the barber cookie pair out of a Set-Cookie header list. */
export function teamCookieFrom(headers: Headers): string | null {
  for (const value of headers.getSetCookie()) {
    const pair = value.split(';')[0] ?? '';
    if (pair.startsWith(`${TEAM_COOKIE}=`) && pair.length > TEAM_COOKIE.length + 1) return pair;
  }
  return null;
}
