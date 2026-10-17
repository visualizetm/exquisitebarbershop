import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { describe, expect, it } from 'vitest';
import {
  clearSessionCookie,
  readSessionCookie,
  SESSION_COOKIE,
  setSessionCookie,
} from '../../server/auth/cookies';
import {
  generateTemporaryPassword,
  getDummyHash,
  hashPassword,
  needsRehash,
  passwordProblems,
  verifyPassword,
} from '../../server/auth/password';

describe('password hashing', () => {
  it('hashes with argon2id at the documented cost and verifies', async () => {
    const hash = await hashPassword('a very long and unusual phrase');
    expect(hash.startsWith('$argon2id$v=19$m=19456,t=2,p=1$')).toBe(true);
    expect(await verifyPassword(hash, 'a very long and unusual phrase')).toBe(true);
    expect(await verifyPassword(hash, 'a very long and unusual phrasE')).toBe(false);
    expect(await verifyPassword('not-a-hash', 'anything')).toBe(false);
    expect(needsRehash(hash)).toBe(false);
    expect(needsRehash('$argon2id$v=19$m=4096,t=1,p=1$c2FsdHNhbHQ$aGFzaGhhc2hoYXNoaGFzaA')).toBe(
      true,
    );
    expect(needsRehash('garbage')).toBe(true);
    expect((await getDummyHash()).startsWith('$argon2id$')).toBe(true);
    expect(await getDummyHash()).toBe(await getDummyHash());
  });
});

describe('password policy', () => {
  it('accepts long, unusual passwords', () => {
    expect(passwordProblems('correct horse battery staple')).toEqual([]);
    expect(passwordProblems('k7mq-zt4b-r9xe-2hwp')).toEqual([]);
  });

  it('refuses short, repetitive, numeric, common or personal passwords', () => {
    expect(passwordProblems('short1!')).toContain('Use at least 12 characters.');
    expect(passwordProblems('a'.repeat(129)).join(' ')).toMatch(/at most 128/);
    expect(passwordProblems('aaaaaaaaaaaabbbb')).toContain('Use more different characters.');
    expect(passwordProblems('739204816527')).toContain('Do not use only numbers.');
    expect(passwordProblems('MyPassword2026!').join(' ')).toMatch(/common words/);
    expect(passwordProblems('exquisite-chair-2026').join(' ')).toMatch(/common words/);
    expect(passwordProblems('dontrise-likes-fades', { email: 'dontrise@example.com' })).toContain(
      'Do not include your email address.',
    );
    expect(passwordProblems('abc-likes-fades-today', { email: 'abc@example.com' })).toEqual([]);
  });

  it('temporary passwords are readable and pass the policy', () => {
    for (let i = 0; i < 50; i += 1) {
      const temp = generateTemporaryPassword();
      expect(temp).toMatch(/^[a-z2-9]{4}(-[a-z2-9]{4}){3}$/);
      expect(passwordProblems(temp)).toEqual([]);
    }
  });
});

describe('session cookie', () => {
  function request(cookie?: string): IncomingMessage {
    const req = new IncomingMessage(new Socket());
    if (cookie !== undefined) req.headers.cookie = cookie;
    return req;
  }
  const token = 'A'.repeat(43);

  it('reads only a well-formed token from the exact cookie name', () => {
    expect(readSessionCookie(request())).toBeNull();
    expect(readSessionCookie(request(`${SESSION_COOKIE}=${token}`))).toBe(token);
    expect(readSessionCookie(request(`other=1; ${SESSION_COOKIE}=${token}; x=2`))).toBe(token);
    expect(readSessionCookie(request(`exq_session=${token}`))).toBeNull();
    expect(readSessionCookie(request(`${SESSION_COOKIE}=short`))).toBeNull();
    expect(readSessionCookie(request(`${SESSION_COOKIE}=${token}'or'1'='1`))).toBeNull();
    expect(readSessionCookie(request('garbage-without-equals'))).toBeNull();
  });

  it('sets __Host- cookies that are Secure, HttpOnly, SameSite=Lax and Path=/', () => {
    const res = new ServerResponse(request());
    setSessionCookie(res, token, 3600.7);
    clearSessionCookie(res);
    const cookies = res.getHeader('Set-Cookie') as string[];
    expect(cookies[0]).toBe(
      `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=3600`,
    );
    expect(cookies[1]).toBe(
      `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    );
    expect(cookies[0]).not.toMatch(/Domain=/);
  });
});
