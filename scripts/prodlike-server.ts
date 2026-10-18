import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { createServer as createHttpsServer, type Server } from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { extname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { PRODLIKE_OWNER } from './e2e-accounts';

/**
 * Production, as close as a laptop gets: the built bundle served over https
 * with the headers from vercel.json, the API behind it with NODE_ENV and
 * VERCEL_ENV set to production, and exactly the variables Rob sets in Vercel
 * for a launch without R2. A second server on the next port runs with
 * MONGODB_URI missing, so the tests can see what a broken deployment shows.
 *
 *   npm run e2e:prod-server            builds, then serves on 4174 (and 4175 broken)
 *   npm run e2e:prod-server -- --port=4176 --profile=demo
 *                                      the showcase: DEMO_MODE=true, STORAGE_DRIVER=mongo and
 *                                      nothing else, on an empty database
 *   PRODLIKE_SKIP_BUILD=1 ...          reuses the last build
 */
const PORT = Number(process.argv.find((a) => a.startsWith('--port='))?.slice(7) ?? '4174');
const MISSING = process.argv.find((a) => a.startsWith('--missing='))?.slice(10) ?? null;
const PROFILE = process.argv.find((a) => a.startsWith('--profile='))?.slice(10) ?? 'launch';
const DIST = resolve('dist');
const SECRETS = {
  MANAGE_LINK_SECRET: 'prodlike-manage-link-secret-0123456789abcdef',
  CRON_SECRET: 'prodlike-cron-secret-0123456789abcdef01234',
  BOOTSTRAP_SECRET: 'prodlike-bootstrap-secret-0123456789abcdef',
};

/** The Production variable list from DEPLOY.md for the chosen profile, nothing more. */
function productionEnv(mongoUri: string | null): Record<string, string> {
  const shared = {
    ...(mongoUri === null ? {} : { MONGODB_URI: mongoUri }),
    MONGODB_DB_NAME: 'exquisite_production',
    APP_BASE_URL: `https://127.0.0.1:${PORT}`,
    MANAGE_LINK_SECRET: SECRETS.MANAGE_LINK_SECRET,
    CRON_SECRET: SECRETS.CRON_SECRET,
    // Vercel sets these itself.
    NODE_ENV: 'production',
    VERCEL_ENV: 'production',
  };
  if (PROFILE === 'demo') {
    // The showcase, exactly: six variables and the two switches. No setup, no seed, no R2.
    return { ...shared, DEMO_MODE: 'true', STORAGE_DRIVER: 'mongo' };
  }
  return {
    ...shared,
    EMAIL_PROVIDER: 'log',
    EMAIL_DISABLED_ACK: 'true',
    BOOTSTRAP_SECRET: SECRETS.BOOTSTRAP_SECRET,
    SEED_OWNER_EMAIL: PRODLIKE_OWNER.email,
    SEED_OWNER_PASSWORD: PRODLIKE_OWNER.password,
    STORAGE_DRIVER: 'none',
    STORAGE_DISABLED_ACK: 'true',
  };
}

/** Every variable the server knows about is cleared first, so nothing leaks in from a shell. */
const KNOWN = [
  'NODE_ENV',
  'VERCEL_ENV',
  'VERCEL_URL',
  'VERCEL_GIT_COMMIT_SHA',
  'MONGODB_URI',
  'MONGODB_DB_NAME',
  'APP_BASE_URL',
  'MANAGE_LINK_SECRET',
  'EMAIL_PROVIDER',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'EMAIL_DISABLED_ACK',
  'CRON_SECRET',
  'BOOTSTRAP_SECRET',
  'SEED_OWNER_EMAIL',
  'SEED_OWNER_PASSWORD',
  'MAINTENANCE_MODE',
  'OUTBOX_AFTER_RESPONSE',
  'LOG_LEVEL',
  'STORAGE_DRIVER',
  'STORAGE_DISABLED_ACK',
  'DEMO_MODE',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'R2_PUBLIC_BASE_URL',
  'R2_KEY_PREFIX',
];

function applyEnv(values: Record<string, string>): void {
  const clean = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !KNOWN.includes(name)),
  );
  process.env = { ...clean, ...values };
}

interface HeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}

/** The response headers Vercel adds, read from vercel.json so the two never drift. */
function headerRules(): { all: HeaderRule['headers']; assets: HeaderRule['headers'] } {
  const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as { headers: HeaderRule[] };
  const find = (source: string) => config.headers.find((h) => h.source === source)?.headers ?? [];
  return { all: find('/(.*)'), assets: find('/assets/(.*)') };
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

/** A self-signed certificate for 127.0.0.1, made once per run with openssl. */
function certificate(): { key: Buffer; cert: Buffer } {
  const dir = process.env.PRODLIKE_CERT_DIR ?? mkdtempSync(join(tmpdir(), 'exq-prodlike-'));
  process.env.PRODLIKE_CERT_DIR = dir;
  const key = join(dir, 'key.pem');
  const cert = join(dir, 'cert.pem');
  if (!existsSync(key) || !existsSync(cert)) {
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '2',
        '-subj',
        '/CN=127.0.0.1',
        '-addext',
        'subjectAltName=IP:127.0.0.1',
        '-keyout',
        key,
        '-out',
        cert,
      ],
      { stdio: 'ignore' },
    );
  }
  return { key: readFileSync(key), cert: readFileSync(cert) };
}

async function createSite(): Promise<Server> {
  // The function exactly as Vercel runs it: api/index.js loading the committed bundle, not the
  // TypeScript source through tsx. The bundle is rebuilt first (scripts/build-api.mjs).
  const entry = pathToFileURL(resolve('api/index.js')).href;
  const { default: handler } = (await import(entry)) as {
    default: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  };
  const router = { handle: handler };
  const rules = headerRules();
  const index = readFileSync(join(DIST, 'index.html'));

  // Vercel's edge compresses text with brotli or gzip; so does this, or the numbers are worse than live.
  const compressed = new Map<string, Buffer>();
  const send = (req: IncomingMessage, res: ServerResponse, key: string, body: Buffer): void => {
    const header = req.headers['accept-encoding'];
    const accept = typeof header === 'string' ? header : '';
    const type = String(res.getHeader('Content-Type') ?? '');
    if (!/text|javascript|json|svg/.test(type)) {
      res.end(body);
      return;
    }
    const encoding = /\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gzip' : null;
    if (!encoding) {
      res.end(body);
      return;
    }
    const id = `${encoding}:${key}`;
    let out = compressed.get(id);
    if (!out) {
      out = encoding === 'br' ? brotliCompressSync(body) : gzipSync(body);
      compressed.set(id, out);
    }
    res.setHeader('Content-Encoding', encoding);
    res.setHeader('Vary', 'Accept-Encoding');
    res.end(out);
  };

  const serve = (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'https://localhost');
    for (const h of rules.all) res.setHeader(h.key, h.value);
    if (url.pathname.startsWith('/api/')) return router.handle(req, res);
    if (url.pathname === '/sitemap.xml') {
      req.url = `/api/sitemap.xml${url.search}`;
      return router.handle(req, res);
    }
    const file = resolve(DIST, `.${url.pathname}`);
    if (file.startsWith(`${DIST}${sep}`) && existsSync(file) && statSync(file).isFile()) {
      if (url.pathname.startsWith('/assets/'))
        for (const h of rules.assets) res.setHeader(h.key, h.value);
      res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
      send(req, res, file, readFileSync(file));
      return Promise.resolve();
    }
    // Every other path is the app shell, as the vercel.json rewrite does.
    res.setHeader('Content-Type', TYPES['.html'] ?? 'text/html');
    send(req, res, 'index', index);
    return Promise.resolve();
  };

  return createHttpsServer(certificate(), (req, res) => {
    void serve(req, res);
  });
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolveListen) => server.listen(port, '127.0.0.1', resolveListen));
}

async function waitFor(url: string, tries = 60): Promise<void> {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  for (let i = 0; i < tries; i += 1) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`${url} did not come up`);
}

/** The broken twin: the same bundle and variables, minus one. No database is started. */
async function childMain(missing: string): Promise<void> {
  const values = Object.fromEntries(
    Object.entries(productionEnv(null)).filter(([name]) => name !== missing),
  );
  applyEnv(values);
  const site = await createSite();
  await listen(site, PORT);
  console.log(`prod-like site without ${missing} on https://127.0.0.1:${PORT}`);
}

async function main(): Promise<void> {
  if (MISSING) return childMain(MISSING);

  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  const values = productionEnv(replSet.getUri());
  execFileSync('node', ['scripts/build-api.mjs'], { stdio: 'inherit' });
  if (process.env.PRODLIKE_SKIP_BUILD !== '1') {
    console.log('building the production bundle');
    execFileSync('npx', ['vite', 'build'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        APP_BASE_URL: values.APP_BASE_URL ?? '',
        // The showcase build carries noindex in its HTML and a closed robots.txt.
        ...(values.DEMO_MODE ? { DEMO_MODE: values.DEMO_MODE } : {}),
      },
    });
  }
  applyEnv(values);
  // Made once here, then shared with the broken twin through PRODLIKE_CERT_DIR.
  certificate();

  // The broken twin comes up first so the tests can rely on both (launch profile only).
  const brokenPort = PORT + 1;
  let child: ChildProcess | null = null;
  if (PROFILE !== 'demo') {
    child = spawn(
      'npx',
      ['tsx', 'scripts/prodlike-server.ts', `--port=${brokenPort}`, '--missing=MONGODB_URI'],
      {
        stdio: 'inherit',
        env: {
          PATH: process.env.PATH ?? '',
          HOME: process.env.HOME ?? '',
          PRODLIKE_CERT_DIR: process.env.PRODLIKE_CERT_DIR ?? '',
        },
      },
    );
    await waitFor(`https://127.0.0.1:${brokenPort}/api/health`);
  }

  const site = await createSite();
  await listen(site, PORT);
  console.log(`prod-like ${PROFILE} site on https://127.0.0.1:${PORT}`);

  const { closeMongoClient } = await import('../server/db/client');
  const shutdown = async () => {
    child?.kill('SIGTERM');
    await new Promise<void>((r) =>
      site.close(() => {
        r();
      }),
    );
    await closeMongoClient();
    await replSet.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
  child?.on('exit', () => void shutdown());
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
