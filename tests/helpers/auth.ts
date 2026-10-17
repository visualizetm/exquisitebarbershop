import { hashPassword } from '../../server/auth/password';
import { SESSION_COOKIE } from '../../server/auth/cookies';
import { SESSION_IDLE_MS } from '../../server/auth/sessions';
import { randomToken, sha256Hex } from '../../server/lib/ids';
import { sessionsRepo, usersRepo } from '../../server/repos';
import type { UserDocument } from '../../shared/schemas/user';

export const OWNER_PASSWORD = 'owner-test-phrase-correct-91';
export const BARBER_PASSWORD = 'barber-test-phrase-correct-37';

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
