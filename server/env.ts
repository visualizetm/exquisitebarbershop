import { z } from 'zod';
import { KEY_PREFIX_PATTERN } from '../shared/schemas/photo';

/**
 * Server-side environment. Parsed lazily on first use so importing modules in
 * tests never requires a full environment. Nothing here is ever sent to the client.
 *
 * Two layers: the schema below checks shapes (an enum, a URL, a length) and
 * `envProblems` checks what each environment needs (production refuses to serve
 * without storage, email and the secrets). The doctor reports the same list.
 */
const secret = (name: string) =>
  z.string().min(32, `${name} must be at least 32 characters`).optional();

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
  /** Lets production launch with EMAIL_PROVIDER=log on purpose, before the email domain is verified. */
  EMAIL_DISABLED_ACK: z.enum(['true', 'false']).default('false'),
  CRON_SECRET: secret('CRON_SECRET'),
  /** Enables POST /api/internal/bootstrap and the /setup page. Unset means they do not exist. */
  BOOTSTRAP_SECRET: secret('BOOTSTRAP_SECRET'),
  SEED_OWNER_EMAIL: z.string().optional(),
  SEED_OWNER_PASSWORD: z.string().optional(),
  /** "true" answers every public route and page with the maintenance message; /admin and /api/health stay up. */
  MAINTENANCE_MODE: z.enum(['true', 'false']).default('false'),
  /** "off" lets tests drive outbox delivery by hand instead of right after the response. */
  OUTBOX_AFTER_RESPONSE: z.enum(['on', 'off']).default('on'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  /**
   * Where photos live: Cloudflare R2 in production, the local disk in dev and tests,
   * or "none" to run without photos and daily backups until R2 exists.
   */
  STORAGE_DRIVER: z.enum(['local', 'r2', 'none']).default('local'),
  /** Lets production launch with STORAGE_DRIVER=none on purpose, before R2 is set up. */
  STORAGE_DISABLED_ACK: z.enum(['true', 'false']).default('false'),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_BASE_URL: z.url().optional(),
  /** Folder every object key sits under, for example "preview/". Lets previews share a bucket. */
  R2_KEY_PREFIX: z
    .string()
    .regex(
      KEY_PREFIX_PATTERN,
      'R2_KEY_PREFIX must be lowercase letters, digits or hyphens ending in "/"',
    )
    .optional(),
});

export type Env = z.infer<typeof envSchema>;
export type Environment = 'development' | 'test' | 'preview' | 'production';

export interface EnvProblem {
  /** The variable, never its value. */
  name: string;
  message: string;
  /** What to do about it, written for the person setting the variables in Vercel. */
  fix: string;
}

let cached: Env | null = null;

/** Which rules apply: Vercel says preview or production; otherwise NODE_ENV. */
export function environmentOf(env: Pick<Env, 'NODE_ENV' | 'VERCEL_ENV'>): Environment {
  if (env.VERCEL_ENV === 'production') return 'production';
  if (env.VERCEL_ENV === 'preview') return 'preview';
  if (env.NODE_ENV === 'production') return 'production';
  return env.NODE_ENV;
}

/** Everything that is missing or wrong for the given environment. Empty means good to go. */
export function envProblems(env: Env, environment: Environment = environmentOf(env)): EnvProblem[] {
  const problems: EnvProblem[] = [];
  const need = (name: string, ok: boolean, message: string, fix: string) => {
    if (!ok) problems.push({ name, message, fix });
  };
  const deployed = environment === 'production' || environment === 'preview';

  // MONGODB_URI and MANAGE_LINK_SECRET are checked by the schema: nothing runs without them.
  if (deployed) {
    need(
      'MONGODB_DB_NAME',
      env.MONGODB_DB_NAME !== 'exquisite',
      'MONGODB_DB_NAME is still the default',
      'Set MONGODB_DB_NAME to a name that says which deployment it is, such as exquisite_production or exquisite_preview.',
    );
    need(
      'APP_BASE_URL',
      env.APP_BASE_URL.startsWith('https://'),
      'APP_BASE_URL must be the https address of this deployment',
      'Set APP_BASE_URL to the site address with https and no trailing slash. Emails and the sitemap use it.',
    );
    need(
      'CRON_SECRET',
      Boolean(env.CRON_SECRET),
      'CRON_SECRET is not set',
      'Generate a random string of at least 32 characters and set CRON_SECRET. Vercel Cron sends it with the daily job.',
    );
    need(
      'STORAGE_DRIVER',
      env.STORAGE_DRIVER !== 'local',
      'STORAGE_DRIVER must be r2 or none on Vercel',
      'Set STORAGE_DRIVER to r2 with the R2 variables, or to none (with STORAGE_DISABLED_ACK=true in Production) to run without photos for now. Vercel functions have no disk to keep photos on.',
    );
  }
  if (env.STORAGE_DRIVER === 'none' && environment === 'production') {
    need(
      'STORAGE_DISABLED_ACK',
      env.STORAGE_DISABLED_ACK === 'true',
      'STORAGE_DRIVER is none, so photos and daily backups are off',
      'Either set STORAGE_DRIVER=r2 with the R2 variables (see DEPLOY.md), or set STORAGE_DISABLED_ACK=true to launch without photos and backups on purpose.',
    );
  }
  if (env.STORAGE_DRIVER === 'r2') {
    for (const name of [
      'R2_ACCOUNT_ID',
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
      'R2_BUCKET',
      'R2_PUBLIC_BASE_URL',
    ] as const) {
      need(
        name,
        Boolean(env[name]),
        `${name} is not set`,
        `Set ${name} from the Cloudflare R2 bucket (R2, the bucket, Settings for the public URL; Manage R2 API Tokens for the keys).`,
      );
    }
  }
  if (environment === 'preview' && env.STORAGE_DRIVER === 'r2') {
    need(
      'R2_KEY_PREFIX',
      Boolean(env.R2_KEY_PREFIX),
      'R2_KEY_PREFIX is not set for preview deployments',
      'Set R2_KEY_PREFIX to preview/ in the Preview environment only, so preview uploads never touch production photos.',
    );
  }
  if (env.EMAIL_PROVIDER === 'resend') {
    need(
      'RESEND_API_KEY',
      Boolean(env.RESEND_API_KEY),
      'RESEND_API_KEY is not set',
      'Create an API key in Resend (API Keys) and set RESEND_API_KEY.',
    );
    need(
      'EMAIL_FROM',
      Boolean(env.EMAIL_FROM),
      'EMAIL_FROM is not set',
      'Set EMAIL_FROM to the sender, for example "Exquisite Barber & Beauty Lounge <bookings@yourdomain.com>", on a domain verified in Resend.',
    );
  } else if (environment === 'production') {
    need(
      'EMAIL_DISABLED_ACK',
      env.EMAIL_DISABLED_ACK === 'true',
      'EMAIL_PROVIDER is log, so no email is sent',
      'Either set EMAIL_PROVIDER=resend with RESEND_API_KEY and EMAIL_FROM, or set EMAIL_DISABLED_ACK=true to launch without email on purpose.',
    );
  }
  return problems;
}

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid server environment: ${problems}`);
  }
  cached = parsed.data;
  return cached;
}

/**
 * The environment as far as it parses: every variable that is valid on its own,
 * with the missing or wrong ones left out. For the few places that must work
 * while the deployment is incomplete (the health check, the setup secret).
 */
export function getPartialEnv(): Partial<Env> {
  if (cached) return cached;
  const partial: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(envSchema.shape)) {
    const value = field.safeParse(process.env[name]);
    if (value.success) partial[name] = value.data;
  }
  return partial;
}

/**
 * The environment and everything wrong with it, without throwing. A variable
 * the schema rejects (missing MONGODB_URI, a short secret) is listed as a
 * problem by name, so the health check and the doctor can say what to set.
 */
export function describeEnv(): { env: Env | null; problems: EnvProblem[] } {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const seen = new Set<string>();
    const problems: EnvProblem[] = [];
    for (const issue of parsed.error.issues) {
      const name = String(issue.path[0] ?? 'environment');
      if (seen.has(name)) continue;
      seen.add(name);
      problems.push({
        name,
        message: issue.message,
        fix: `Set ${name} in Vercel (Settings, Environment Variables; see DEPLOY.md), then redeploy.`,
      });
    }
    return { env: null, problems };
  }
  return { env: parsed.data, problems: envProblems(parsed.data) };
}

/** The deployment this process runs in. Works while other variables are still missing. */
export function currentEnvironment(): Environment {
  const env = getPartialEnv();
  return environmentOf({
    NODE_ENV: env.NODE_ENV ?? 'development',
    ...(env.VERCEL_ENV ? { VERCEL_ENV: env.VERCEL_ENV } : {}),
  });
}

/** The problems with this process's environment; the router refuses to serve while there are any. */
export function currentEnvProblems(): EnvProblem[] {
  return cached ? envProblems(cached) : describeEnv().problems;
}

/** Throws with every problem listed. Scripts call it before touching anything. */
export function requireEnv(): Env {
  const env = getEnv();
  const problems = envProblems(env);
  if (problems.length > 0) {
    throw new Error(
      `The environment is not ready:\n${problems.map((p) => `- ${p.message}. ${p.fix}`).join('\n')}`,
    );
  }
  return env;
}

/** Test helper: forget the cached environment so the next call re-reads process.env. */
export function resetEnvCache(): void {
  cached = null;
}

export function getBuildSha(): string {
  return process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? 'unknown';
}

export function isProduction(): boolean {
  return currentEnvironment() === 'production';
}
