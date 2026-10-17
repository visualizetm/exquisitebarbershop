import { afterEach, describe, expect, it } from 'vitest';
import {
  describeEnv,
  environmentOf,
  envProblems,
  getPartialEnv,
  resetEnvCache,
  type Env,
} from '../../server/env';

const base: Env = {
  NODE_ENV: 'development',
  MONGODB_URI: 'mongodb://127.0.0.1:27017',
  MONGODB_DB_NAME: 'exquisite',
  APP_BASE_URL: 'http://localhost:5173',
  MANAGE_LINK_SECRET: 'm'.repeat(40),
  EMAIL_PROVIDER: 'log',
  EMAIL_DISABLED_ACK: 'false',
  MAINTENANCE_MODE: 'false',
  OUTBOX_AFTER_RESPONSE: 'on',
  LOG_LEVEL: 'info',
  STORAGE_DRIVER: 'local',
  STORAGE_DISABLED_ACK: 'false',
};
const r2 = {
  STORAGE_DRIVER: 'r2' as const,
  R2_ACCOUNT_ID: 'a',
  R2_ACCESS_KEY_ID: 'k',
  R2_SECRET_ACCESS_KEY: 's',
  R2_BUCKET: 'b',
  R2_PUBLIC_BASE_URL: 'https://photos.example.com',
};
const names = (env: Env, environment?: Parameters<typeof envProblems>[1]) =>
  envProblems(env, environment).map((p) => p.name);

describe('environmentOf', () => {
  it('follows Vercel first, then NODE_ENV', () => {
    expect(environmentOf({ NODE_ENV: 'production', VERCEL_ENV: 'preview' })).toBe('preview');
    expect(environmentOf({ NODE_ENV: 'development', VERCEL_ENV: 'production' })).toBe('production');
    expect(environmentOf({ NODE_ENV: 'production' })).toBe('production');
    expect(environmentOf({ NODE_ENV: 'test' })).toBe('test');
  });
});

describe('envProblems', () => {
  it('needs nothing more in development and test', () => {
    expect(names(base)).toEqual([]);
    expect(names({ ...base, NODE_ENV: 'test' })).toEqual([]);
  });

  it('refuses production without the database name, https address, secrets, R2 and an email choice', () => {
    expect(names({ ...base, NODE_ENV: 'production' })).toEqual([
      'MONGODB_DB_NAME',
      'APP_BASE_URL',
      'CRON_SECRET',
      'STORAGE_DRIVER',
      'EMAIL_DISABLED_ACK',
    ]);
    const ready: Env = {
      ...base,
      NODE_ENV: 'production',
      MONGODB_DB_NAME: 'exquisite_production',
      APP_BASE_URL: 'https://example.com',
      CRON_SECRET: 'c'.repeat(40),
      ...r2,
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 're_x',
      EMAIL_FROM: 'Shop <bookings@example.com>',
    };
    expect(names(ready)).toEqual([]);
    expect(names({ ...ready, R2_BUCKET: undefined })).toEqual(['R2_BUCKET']);
    expect(names({ ...ready, RESEND_API_KEY: undefined, EMAIL_FROM: undefined })).toEqual([
      'RESEND_API_KEY',
      'EMAIL_FROM',
    ]);
  });

  it('allows log email in production only with EMAIL_DISABLED_ACK=true', () => {
    const noEmail: Env = {
      ...base,
      NODE_ENV: 'production',
      MONGODB_DB_NAME: 'exquisite_production',
      APP_BASE_URL: 'https://example.com',
      CRON_SECRET: 'c'.repeat(40),
      ...r2,
    };
    expect(names(noEmail)).toEqual(['EMAIL_DISABLED_ACK']);
    expect(names({ ...noEmail, EMAIL_DISABLED_ACK: 'true' })).toEqual([]);
  });

  it('allows no photo storage in production only with STORAGE_DISABLED_ACK=true', () => {
    const noStorage: Env = {
      ...base,
      NODE_ENV: 'production',
      MONGODB_DB_NAME: 'exquisite_production',
      APP_BASE_URL: 'https://example.com',
      CRON_SECRET: 'c'.repeat(40),
      STORAGE_DRIVER: 'none',
      EMAIL_DISABLED_ACK: 'true',
    };
    expect(names(noStorage)).toEqual(['STORAGE_DISABLED_ACK']);
    expect(names({ ...noStorage, STORAGE_DISABLED_ACK: 'true' })).toEqual([]);
    // The local disk is never an option on Vercel; the message names both real choices.
    const local = envProblems({ ...noStorage, STORAGE_DRIVER: 'local' });
    expect(local.map((p) => p.name)).toEqual(['STORAGE_DRIVER']);
    expect(local[0]?.fix).toContain('none');
    // A preview without storage needs no acknowledgement and no key prefix.
    expect(
      names({
        ...noStorage,
        NODE_ENV: 'development',
        VERCEL_ENV: 'preview',
        MONGODB_DB_NAME: 'exquisite_preview',
        EMAIL_DISABLED_ACK: 'false',
      }),
    ).toEqual([]);
  });

  it('asks previews for R2 and a key prefix, and never for the email acknowledgement', () => {
    const preview: Env = {
      ...base,
      VERCEL_ENV: 'preview',
      MONGODB_DB_NAME: 'exquisite_preview',
      APP_BASE_URL: 'https://preview.example.com',
      CRON_SECRET: 'c'.repeat(40),
      ...r2,
    };
    expect(names(preview)).toEqual(['R2_KEY_PREFIX']);
    expect(names({ ...preview, R2_KEY_PREFIX: 'preview/' })).toEqual([]);
  });

  it('writes every fix for a person, never a value', () => {
    const problems = envProblems({ ...base, NODE_ENV: 'production' });
    for (const p of problems) {
      expect(p.fix.length).toBeGreaterThan(20);
      expect(p.message).not.toContain('mongodb://');
    }
  });
});

describe('describeEnv and getPartialEnv', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    resetEnvCache();
  });

  it('names a missing or short variable instead of throwing, and still reads the rest', () => {
    process.env = {
      PATH: saved.PATH ?? '',
      NODE_ENV: 'test',
      MANAGE_LINK_SECRET: 'short',
      BOOTSTRAP_SECRET: 'b'.repeat(40),
    };
    resetEnvCache();
    const { env, problems } = describeEnv();
    expect(env).toBeNull();
    expect(problems.map((p) => p.name)).toEqual(['MONGODB_URI', 'MANAGE_LINK_SECRET']);
    for (const p of problems) {
      expect(p.fix).toContain(p.name);
      expect(p.fix).not.toContain('short');
    }
    const partial = getPartialEnv();
    expect(partial.MONGODB_URI).toBeUndefined();
    expect(partial.MANAGE_LINK_SECRET).toBeUndefined();
    expect(partial.BOOTSTRAP_SECRET).toBe('b'.repeat(40));
    expect(partial.STORAGE_DRIVER).toBe('local');
  });

  it('agrees with envProblems once every variable parses', () => {
    process.env = {
      PATH: saved.PATH ?? '',
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb://127.0.0.1:27017',
      MANAGE_LINK_SECRET: 'm'.repeat(40),
    };
    resetEnvCache();
    const { env, problems } = describeEnv();
    expect(env?.MONGODB_DB_NAME).toBe('exquisite');
    expect(problems.map((p) => p.name)).toEqual([
      'MONGODB_DB_NAME',
      'APP_BASE_URL',
      'CRON_SECRET',
      'STORAGE_DRIVER',
      'EMAIL_DISABLED_ACK',
    ]);
  });
});
