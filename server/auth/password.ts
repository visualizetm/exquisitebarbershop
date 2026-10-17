import { hash, parseOptions, verify, type Options } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';

/**
 * argon2id with the OWASP baseline: 19 MiB of memory, 2 passes, 1 lane. About
 * 75 ms per verify on a Vercel function, which is slow for an attacker and
 * invisible to a person signing in. Raise memoryCost before timeCost if the
 * hardware allows; needsRehash upgrades stored hashes at the next sign-in.
 */
/** The library's default algorithm is argon2id; tests assert the $argon2id$ prefix. */
export const ARGON2_OPTIONS: Options = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
};

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

/** False for a wrong password and for a malformed stored hash; never throws. */
export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await verify(storedHash, password);
  } catch {
    return false;
  }
}

/** True when a stored hash uses weaker parameters than the current policy. */
export function needsRehash(storedHash: string): boolean {
  try {
    const params = parseOptions(storedHash);
    return (
      params.memoryCost < (ARGON2_OPTIONS.memoryCost ?? 0) ||
      params.timeCost < (ARGON2_OPTIONS.timeCost ?? 0)
    );
  } catch {
    return true;
  }
}

let dummyHash: Promise<string> | null = null;

/**
 * A real argon2id hash of a random secret. Unknown emails are verified against it
 * so a wrong email costs the same time as a wrong password.
 */
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(32).toString('base64url'));
  return dummyHash;
}

const WEAK_FRAGMENTS = [
  'password',
  'passw0rd',
  'qwerty',
  'letmein',
  'welcome',
  'iloveyou',
  'admin',
  'abc123',
  '123456',
  '654321',
  'exquisite',
  'barber',
  'gifted',
  'brookhaven',
];

/**
 * Password policy. Returns problems in plain language; empty means acceptable.
 * Length matters most, so the rule is 12 or more characters with a few sanity
 * checks against the obvious, rather than character-class rules people work around.
 */
export function passwordProblems(
  password: string,
  context: { email?: string | null } = {},
): string[] {
  const problems: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) {
    problems.push(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    problems.push(`Use at most ${PASSWORD_MAX_LENGTH} characters.`);
  }
  if (new Set(password).size < 5) problems.push('Use more different characters.');
  if (/^\d+$/.test(password)) problems.push('Do not use only numbers.');
  const lower = password.toLowerCase();
  if (WEAK_FRAGMENTS.some((w) => lower.includes(w))) {
    problems.push('Avoid common words such as password, qwerty or the shop name.');
  }
  const local = context.email?.split('@')[0]?.toLowerCase() ?? '';
  if (local.length >= 4 && lower.includes(local))
    problems.push('Do not include your email address.');
  return problems;
}

const TEMP_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** Readable one-time password for a new or reset login, e.g. "k7mq-zt4b-r9xe-2hwp". */
export function generateTemporaryPassword(): string {
  for (;;) {
    const bytes = randomBytes(16);
    let raw = '';
    for (const byte of bytes) raw += TEMP_ALPHABET.charAt(byte % TEMP_ALPHABET.length);
    const candidate = raw.match(/.{4}/g)?.join('-') ?? raw;
    if (passwordProblems(candidate).length === 0) return candidate;
  }
}
