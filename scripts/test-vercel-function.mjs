import { spawn, execFileSync } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { nodeFileTrace } from '@vercel/nft';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

/**
 * Runs the API the way Vercel runs it, which no other test does.
 *
 * Vitest, Playwright and the production-like e2e all run the server through tsx or Vite, which
 * resolve extensionless imports, so none of them could see the crash that took the live site
 * down (ERR_MODULE_NOT_FOUND on '../server/http/app'), nor that Vercel's file routing sent only
 * one-segment API paths to the function.
 *
 *   1. Builds the function exactly as it ships (scripts/build-api.mjs).
 *   2. Ships it two ways and runs each with plain `node` (no tsx, Vite, Vitest, loader or flag),
 *      in a temp directory that holds nothing else of the repository:
 *        a. the files @vercel/nft traces from api/index.js, the tracer Vercel uses;
 *        b. the output of Vercel's own `vercel build` (needs no token; skipped with a note when
 *           it cannot run, unless REQUIRE_VERCEL_BUILD=1, which CI sets).
 *   3. Calls the handler over HTTP: no env (JSON that names what is missing), the showcase env
 *      on an empty in-memory database (auto setup, demo sign-in, GridFS upload and read), and a
 *      deploy whose bundle cannot load (JSON FUNCTION_LOAD_FAILED, never a crash).
 *   4. Replays Vercel's generated routing table (.vercel/output/config.json) for page and API
 *      paths of every depth: all of /api must reach the function, everything else index.html.
 */
const ROOT = process.cwd();
const ENTRY = 'api/index.js';
const VERCEL_CLI = 'vercel@64.5.0';
const FORBIDDEN = [
  'mongodb-memory-server',
  'vitest',
  'tsx',
  'vite',
  'esbuild',
  'playwright',
  '@vercel/nft',
];
const SITE = 'https://exquisitebarbershop.visualizeclients.com';
const results = [];

function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
}

/** Starts plain node in a shipped directory with exactly this environment. */
async function withFunction(dir, env, run) {
  const child = spawn('node', ['invoke.mjs'], {
    cwd: dir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });
  try {
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`no PORT line; stderr: ${stderr.slice(0, 400)}`)),
        20_000,
      );
      child.stdout.on('data', (chunk) => {
        const match = /PORT=(\d+)/.exec(String(chunk));
        if (match) {
          clearTimeout(timer);
          resolve(Number(match[1]));
        }
      });
      child.on('exit', (code) => {
        clearTimeout(timer);
        reject(
          new Error(
            `node exited with ${String(code)} before listening; stderr: ${stderr.slice(0, 400)}`,
          ),
        );
      });
    });
    const base = `http://127.0.0.1:${String(port)}`;
    const call = async (method, path, { body, headers = {}, raw } = {}) => {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
        body: raw ?? (body ? JSON.stringify(body) : undefined),
      });
      const buffer = Buffer.from(await res.arrayBuffer());
      const type = res.headers.get('content-type') ?? '';
      const json = type.includes('json') ? JSON.parse(buffer.toString('utf8')) : null;
      return { status: res.status, headers: res.headers, json, buffer, type };
    };
    await run(call, base);
  } finally {
    child.kill('SIGKILL');
  }
}

/** The tiny server that stands in for Vercel's platform: real node http, our handler. */
async function addInvoker(dir) {
  await writeFile(
    join(dir, 'invoke.mjs'),
    `import { createServer } from 'node:http';
const { default: handler } = await import('./${ENTRY}');
const server = createServer((req, res) => {
  handler(req, res).catch(() => res.end());
});
server.listen(0, '127.0.0.1', () => console.log('PORT=' + server.address().port));
`,
  );
}

async function suite(label, dir, dbName, replSet) {
  const p = `${label}:`;
  // 3a. No environment at all: JSON that names what is missing, never a crash.
  await withFunction(dir, { PATH: process.env.PATH ?? '' }, async (call) => {
    const health = await call('GET', '/api/health');
    check(
      `${p} no env: /api/health answers JSON`,
      health.type.includes('application/json'),
      health.type,
    );
    check(`${p} no env: ok is false`, health.json?.ok === false && health.status === 503);
    const names = health.json?.missing ?? [];
    check(
      `${p} no env: missing names the variables`,
      names.includes('MONGODB_URI') && names.includes('MANAGE_LINK_SECRET'),
      names.join(', '),
    );
    check(
      `${p} no env: no value in the answer`,
      !JSON.stringify(health.json).includes('mongodb://'),
    );
    const shop = await call('GET', '/api/shop');
    check(
      `${p} no env: /api/shop answers JSON CONFIG_ERROR`,
      shop.json?.error?.code === 'CONFIG_ERROR',
      shop.json?.error?.code,
    );
  });

  // 3b. The showcase environment, exactly the variables Rob sets, on an empty database.
  const env = {
    PATH: process.env.PATH ?? '',
    NODE_ENV: 'production',
    VERCEL_ENV: 'production',
    MONGODB_URI: replSet.getUri(),
    MONGODB_DB_NAME: dbName,
    APP_BASE_URL: SITE,
    MANAGE_LINK_SECRET: 'vercel-test-manage-link-secret-0123456789abcdef',
    CRON_SECRET: 'vercel-test-cron-secret-0123456789abcdef01234',
    DEMO_MODE: 'true',
    STORAGE_DRIVER: 'mongo',
    LOG_LEVEL: 'warn',
  };
  await withFunction(dir, env, async (call, base) => {
    const health = await call('GET', '/api/health');
    check(
      `${p} demo env: /api/health is ok`,
      health.status === 200 && health.json?.ok === true,
      String(health.status),
    );

    // The first request that needs the shop sets it up on the empty database.
    const shop = await call('GET', '/api/shop');
    check(
      `${p} demo env: /api/shop is 200 with the seeded shop`,
      shop.status === 200 && /Exquisite/.test(shop.json?.name ?? ''),
      shop.json?.name ?? shop.json?.error?.code,
    );
    check(`${p} demo env: the shop says demo`, shop.json?.demo === true);
    check(
      `${p} demo env: the answer says noindex`,
      shop.headers.get('x-robots-tag') === 'noindex, nofollow',
    );
    const staff = await call('GET', '/api/staff');
    check(
      `${p} demo env: five chairs were seeded`,
      staff.json?.staff?.length === 5,
      String(staff.json?.staff?.length),
    );
    // Vercel may add a query of its own to a rewritten request; the router must not mind.
    const withQuery = await call('GET', '/api/staff/lee?path=staff%2Flee');
    check(
      `${p} demo env: a nested path with an extra query works`,
      withQuery.status === 200 && withQuery.json?.staff?.slug === 'lee',
      String(withQuery.status),
    );

    // Demo sign-in: a normal owner session.
    const login = await call('POST', '/api/auth/demo-login', { body: {} });
    const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0];
    check(
      `${p} demo env: the demo login answers 200 with a session cookie`,
      login.status === 200 && cookie.startsWith('__Host-exq_session='),
      String(login.status),
    );
    const me = await call('GET', '/api/auth/me', { headers: { cookie } });
    check(
      `${p} demo env: the session is the owner`,
      me.json?.user?.role === 'owner' && me.json?.features?.demo === true,
    );
    const bookings = await call('GET', '/api/admin/bookings', { headers: { cookie } });
    check(
      `${p} demo env: the dashboard has sample bookings`,
      (bookings.json?.bookings?.length ?? 0) >= 5,
      String(bookings.json?.bookings?.length),
    );

    // A GridFS upload through the same function, then its public address.
    const bytes = Buffer.concat([Buffer.from('RIFF....WEBPVP8 '), Buffer.alloc(2000, 7)]);
    const issued = await call('POST', '/api/admin/photos/upload-url', {
      headers: { cookie },
      body: { kind: 'hero', contentType: 'image/webp', size: bytes.length },
    });
    check(
      `${p} demo env: an upload address is issued`,
      issued.status === 200 && issued.json?.uploadUrl?.startsWith(SITE),
      String(issued.status),
    );
    const local = (url) => url.replace(SITE, base).slice(base.length);
    const put = await call('PUT', local(issued.json.uploadUrl), {
      headers: { 'content-type': 'application/octet-stream' },
      raw: bytes,
    });
    check(
      `${p} demo env: the PUT stores the photo in GridFS`,
      put.status === 200,
      String(put.status),
    );
    const confirmed = await call('POST', '/api/admin/photos/confirm', {
      headers: { cookie },
      body: { ticket: issued.json.ticket, width: 1600, height: 900, alt: 'The shop floor' },
    });
    check(
      `${p} demo env: the photo is confirmed`,
      confirmed.status === 201,
      String(confirmed.status),
    );
    const shop2 = await call('GET', '/api/shop');
    const photoUrl = shop2.json?.heroPhoto?.url ?? '';
    check(
      `${p} demo env: the hero photo is in the shop answer`,
      photoUrl.startsWith(`${SITE}/api/media/`),
      photoUrl,
    );
    const media = await call('GET', local(photoUrl));
    check(
      `${p} demo env: GET /api/media/:id serves the same bytes`,
      media.status === 200 && media.buffer.equals(bytes),
      `${String(media.status)} ${media.type}`,
    );
    check(
      `${p} demo env: the photo is image/webp with a year of cache`,
      media.type === 'image/webp' && /immutable/.test(media.headers.get('cache-control') ?? ''),
    );

    // The daily job and an unknown path answer JSON too.
    const cron = await call('GET', '/api/internal/cron/daily', {
      headers: { authorization: `Bearer ${env.CRON_SECRET}` },
    });
    check(
      `${p} demo env: the daily job runs and skips the backup`,
      cron.status === 200 && cron.json?.skipped?.includes('backup'),
      String(cron.status),
    );
    const unknown = await call('GET', '/api/nothing-here');
    check(
      `${p} demo env: an unknown path is JSON NOT_FOUND`,
      unknown.status === 404 && unknown.json?.error?.code === 'NOT_FOUND',
    );
    const after = await call('GET', '/api/health');
    check(`${p} demo env: still healthy at the end`, after.json?.ok === true);
  });

  // 3c. A deploy whose bundle cannot load still answers JSON, never Vercel's error page.
  const broken = await mkdtemp(join(tmpdir(), 'exq-vercel-broken-'));
  await cp(dir, broken, { recursive: true, dereference: true });
  await rm(join(broken, 'server/bundle/app.mjs'));
  await withFunction(broken, env, async (call) => {
    const health = await call('GET', '/api/health');
    check(
      `${p} missing bundle: /api/health is JSON FUNCTION_LOAD_FAILED`,
      health.status === 503 &&
        health.json?.ok === false &&
        health.json?.error?.code === 'FUNCTION_LOAD_FAILED',
      health.json?.error?.code ?? health.type,
    );
    check(
      `${p} missing bundle: the answer leaks no path`,
      !JSON.stringify(health.json).includes(broken),
    );
  });
  await rm(broken, { recursive: true, force: true });
}

/** Replays Vercel's routing table (from `vercel build`) for one path. Enough of the rules for ours. */
function route(config, has, pathname) {
  const routes = config.routes;
  const filesystem = routes.findIndex((r) => r.handle === 'filesystem');
  let path = pathname;
  let i = 0;
  for (let hops = 0; i < routes.length && hops < 20;) {
    const r = routes[i];
    if (r.handle) {
      if (r.handle === 'filesystem') {
        if (has.static(path)) return { kind: 'static', path };
        if (has.fn(path)) return { kind: 'function', path };
      } else {
        break;
      }
      i += 1;
      continue;
    }
    const m = new RegExp(r.src).exec(path);
    if (!m || r.continue) {
      i += 1;
      continue;
    }
    if (r.dest) {
      path = r.dest.replace(/\$(\d+)/g, (_, n) => m[Number(n)] ?? '').split('?')[0];
      hops += 1;
      if (r.check) {
        i = filesystem;
        continue;
      }
      return has.fn(path) ? { kind: 'function', path } : { kind: 'static', path };
    }
    if (r.status) return { kind: 'status', status: r.status };
    i += 1;
  }
  return { kind: 'none', path };
}

async function filesUnder(dir, prefix = '') {
  const out = [];
  for (const entry of await readdir(join(dir, prefix), { withFileTypes: true })) {
    const rel = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) out.push(...(await filesUnder(dir, rel)));
    else out.push(rel);
  }
  return out;
}

// 1. Build exactly as it ships.
execFileSync('node', ['scripts/build-api.mjs'], { stdio: 'inherit' });

const replSet = await MongoMemoryReplSet.create({
  replSet: { count: 1, storageEngine: 'wiredTiger' },
});
const cleanup = [];
try {
  // 2a. Trace what Vercel would ship and run only that.
  const { fileList, warnings } = await nodeFileTrace([ENTRY], { base: ROOT, processCwd: ROOT });
  const files = [...fileList].sort();
  check('trace: includes the bundle', files.includes('server/bundle/app.mjs'));
  check('trace: includes mongodb', files.includes('node_modules/mongodb/package.json'));
  const argon = files.filter((f) => /node_modules\/@node-rs\/argon2-[a-z0-9-]+\/.*\.node$/.test(f));
  check('trace: includes the argon2 native binary', argon.length > 0, argon[0] ?? 'none');
  const dev = files.filter((f) => FORBIDDEN.some((name) => f.startsWith(`node_modules/${name}/`)));
  check('trace: includes no dev-only package', dev.length === 0, dev.slice(0, 3).join(', '));
  const source = files.filter(
    (f) => /^(server|shared|seed|src)\//.test(f) && !f.startsWith('server/bundle/'),
  );
  check('trace: no loose source file ships', source.length === 0, source.slice(0, 3).join(', '));
  const data = files.filter((f) => f.startsWith('.data/'));
  check('trace: no local upload data ships', data.length === 0, data[0] ?? '');
  // nft also reports optional add-ons it cannot resolve (other platforms' argon2 binaries,
  // mongodb's optional kerberos, snappy and so on). Those are expected.
  console.log(
    `(${String(warnings.size)} optional imports for other platforms were not resolvable, as expected)`,
  );

  const traced = await mkdtemp(join(tmpdir(), 'exq-vercel-nft-'));
  cleanup.push(traced);
  for (const file of new Set([...files, 'package.json'])) {
    const target = join(traced, file);
    await mkdir(dirname(target), { recursive: true });
    await cp(join(ROOT, file), target, { dereference: true });
  }
  await addInvoker(traced);
  await suite('nft', traced, 'exquisite_production_nft', replSet);

  // 2b. Vercel's own build.
  const vercelDir = join(ROOT, '.vercel');
  let built = false;
  try {
    await mkdir(vercelDir, { recursive: true });
    if (!existsSync(join(vercelDir, 'project.json'))) {
      await writeFile(
        join(vercelDir, 'project.json'),
        JSON.stringify({
          projectId: 'prj_local_test',
          orgId: 'team_local_test',
          settings: { framework: 'vite', nodeVersion: '22.x' },
        }),
      );
    }
    await rm(join(vercelDir, 'output'), { recursive: true, force: true });
    execFileSync('npx', ['--yes', VERCEL_CLI, 'build', '--yes'], {
      stdio: 'ignore',
      env: { ...process.env, VERCEL_TELEMETRY_DISABLED: '1' },
    });
    built = existsSync(join(vercelDir, 'output/functions/api/index.func'));
  } catch (error) {
    built = false;
    console.log(`(vercel build could not run here: ${String(error.message).split('\n')[0]})`);
  }
  if (!built) {
    if (process.env.REQUIRE_VERCEL_BUILD === '1')
      check('vercel build ran', false, 'REQUIRE_VERCEL_BUILD=1');
    else
      console.log(
        'SKIP  vercel build output: needs the Vercel CLI from npm and no token; not available here',
      );
  } else {
    const output = join(vercelDir, 'output');
    const fn = join(output, 'functions/api/index.func');
    const vcConfig = JSON.parse(await readFile(join(fn, '.vc-config.json'), 'utf8'));
    check(
      'vercel build: the handler is api/index.js on node 22',
      vcConfig.handler === ENTRY && /^nodejs22/.test(vcConfig.runtime),
      `${vcConfig.handler} ${vcConfig.runtime}`,
    );
    const shipped = await filesUnder(fn);
    check('vercel build: the bundle ships', shipped.includes('/server/bundle/app.mjs'));
    check(
      'vercel build: no local upload data ships',
      !shipped.some((f) => f.startsWith('/.data/')),
    );
    check(
      'vercel build: no dev-only package ships',
      !shipped.some((f) => FORBIDDEN.some((n) => f.startsWith(`/node_modules/${n}/`))),
    );
    check(
      'vercel build: no loose source ships',
      !shipped.some(
        (f) => /^\/(server|shared|seed|src)\//.test(f) && !f.startsWith('/server/bundle/'),
      ),
    );

    // 4. Vercel's routing table for page and API paths of every depth.
    const config = JSON.parse(await readFile(join(output, 'config.json'), 'utf8'));
    const staticFiles = new Set(await filesUnder(output, 'static'));
    const has = {
      static: (p) => staticFiles.has(`static${p === '/' ? '/index.html' : p}`),
      fn: (p) => p === '/api' || p === '/api/index',
    };
    const expectFn = [
      '/api',
      '/api/health',
      '/api/shop',
      '/api/staff/lee',
      '/api/staff/lee/openings',
      '/api/auth/login',
      '/api/auth/demo-login',
      '/api/admin/bookings/abc/cancel',
      '/api/admin/photos/upload-url',
      '/api/bookings/manage/cancel',
      '/api/internal/cron/daily',
      '/api/internal/outbox/deliver',
      '/api/media/0f8fad5b-d9cb-469f-a165-70867728950e.webp',
      '/api/sitemap.xml',
      '/sitemap.xml',
    ];
    for (const path of expectFn) {
      const r = route(config, has, path);
      check(
        `routing: ${path} reaches the function`,
        r.kind === 'function',
        `${r.kind} ${r.path ?? r.status ?? ''}`,
      );
    }
    for (const path of [
      '/',
      '/services',
      '/chairs/lee',
      '/book',
      '/manage',
      '/setup',
      '/admin',
      '/admin/photos',
      '/gallery',
      '/visit',
    ]) {
      const r = route(config, has, path);
      check(
        `routing: ${path} serves the app shell`,
        r.kind === 'static' && (r.path === '/index.html' || r.path === '/'),
        `${r.kind} ${r.path ?? ''}`,
      );
    }
    for (const path of ['/robots.txt', '/favicon.svg', '/brand/exq-primary-white.svg']) {
      const r = route(config, has, path);
      check(
        `routing: ${path} is the static file`,
        r.kind === 'static' && r.path === path,
        `${r.kind} ${r.path ?? ''}`,
      );
    }

    // Run Vercel's own function directory, copied out so nothing else of the repository is near.
    const copy = await mkdtemp(join(tmpdir(), 'exq-vercel-out-'));
    cleanup.push(copy);
    await cp(fn, copy, { recursive: true, dereference: true });
    await addInvoker(copy);
    await suite('vercel build', copy, 'exquisite_production_vc', replSet);
  }
} finally {
  await replSet.stop();
  for (const dir of cleanup) await rm(dir, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${String(results.length - failed)} passed, ${String(failed)} failed`);
