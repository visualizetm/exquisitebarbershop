import { z } from 'zod';

/**
 * Server-side environment. Parsed lazily on first use so importing modules in
 * tests never requires a full environment. Nothing here is ever sent to the client.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  VERCEL_ENV: z.enum(['production', 'preview', 'development']).optional(),
  VERCEL_URL: z.string().optional(),
  VERCEL_GIT_COMMIT_SHA: z.string().optional(),
  GITHUB_SHA: z.string().optional(),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  MONGODB_DB_NAME: z.string().min(1).default('exquisite'),
  APP_BASE_URL: z.url().default('http://localhost:5173'),
  MANAGE_LINK_SECRET: z.string().min(32, 'MANAGE_LINK_SECRET must be at least 32 characters'),
  EMAIL_PROVIDER: z.enum(['log', 'resend']).default('log'),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  CRON_SECRET: z.string().min(32).optional(),
  /** "off" lets tests drive outbox delivery by hand instead of right after the response. */
  OUTBOX_AFTER_RESPONSE: z.enum(['on', 'off']).default('on'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  /** Where photos live: Cloudflare R2 in production, the local disk in dev and tests. */
  STORAGE_DRIVER: z.enum(['local', 'r2']).default('local'),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_BASE_URL: z.url().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid server environment: ${problems}`);
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.EMAIL_PROVIDER !== 'log') {
    if (!parsed.data.RESEND_API_KEY || !parsed.data.EMAIL_FROM) {
      throw new Error('EMAIL_PROVIDER=resend requires RESEND_API_KEY and EMAIL_FROM');
    }
  }
  if (parsed.data.STORAGE_DRIVER === 'r2') {
    const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL } =
      parsed.data;
    if (
      !R2_ACCOUNT_ID ||
      !R2_ACCESS_KEY_ID ||
      !R2_SECRET_ACCESS_KEY ||
      !R2_BUCKET ||
      !R2_PUBLIC_BASE_URL
    ) {
      throw new Error(
        'STORAGE_DRIVER=r2 requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET and R2_PUBLIC_BASE_URL',
      );
    }
  }
  cached = parsed.data;
  return cached;
}

/** Test helper: forget the cached environment so the next call re-reads process.env. */
export function resetEnvCache(): void {
  cached = null;
}

export function getBuildSha(): string {
  return process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? 'unknown';
}

export function isProduction(): boolean {
  return getEnv().NODE_ENV === 'production' || getEnv().VERCEL_ENV === 'production';
}
