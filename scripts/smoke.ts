/**
 * Smoke test against a deployed site: `npm run smoke -- --url=https://example.com`.
 * Read-only: it never creates a booking. Exits 1 when any check fails.
 */
interface Check {
  label: string;
  ok: boolean;
  detail: string;
}

const urlArg = process.argv.find((a) => a.startsWith('--url='))?.slice('--url='.length);
if (!urlArg) {
  console.error('Usage: npm run smoke -- --url=https://your-site.vercel.app');
  process.exit(2);
}
const base = urlArg.replace(/\/$/, '');
const checks: Check[] = [];
const record = (label: string, ok: boolean, detail: string) => {
  checks.push({ label, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: ${detail}`);
};

async function get(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${base}${path}`, { redirect: 'manual', ...init });
}

async function main(): Promise<void> {
  // Health and the build.
  try {
    const res = await get('/api/health');
    const body = (await res.json()) as {
      ok?: boolean;
      status?: string;
      buildSha?: string;
      db?: { ok: boolean };
      missing?: string[];
    };
    record(
      'Health',
      res.status === 200 && body.ok === true,
      `${res.status}, status ${body.status ?? '?'}, build ${body.buildSha ?? '?'}, db ${body.db?.ok ? 'ok' : 'down'}${
        body.missing?.length ? `, missing ${body.missing.join(', ')}` : ''
      }`,
    );
    record(
      'Build sha',
      Boolean(body.buildSha && body.buildSha !== 'unknown'),
      body.buildSha ?? 'none',
    );
  } catch (error) {
    record('Health', false, error instanceof Error ? error.message : String(error));
  }

  // Every public page serves the app shell.
  for (const path of ['/', '/services', '/chairs', '/gallery', '/visit', '/book']) {
    try {
      const res = await get(path);
      const html = await res.text();
      const renders = html.includes('id="root"') && html.includes('<script type="module"');
      record(
        `Page ${path}`,
        res.status === 200 && renders,
        `${res.status}${renders ? ', app shell present' : ', app shell missing'}`,
      );
    } catch (error) {
      record(`Page ${path}`, false, error instanceof Error ? error.message : String(error));
    }
  }

  // The public data the pages need.
  for (const [path, expect] of [
    ['/api/shop', (b: unknown) => typeof (b as { name?: unknown }).name === 'string'],
    ['/api/staff', (b: unknown) => Array.isArray((b as { staff?: unknown }).staff)],
    ['/api/availability/next', (b: unknown) => Array.isArray((b as { chairs?: unknown }).chairs)],
  ] as const) {
    try {
      const res = await get(path);
      const body: unknown = await res.json();
      record(`API ${path}`, res.status === 200 && expect(body), `${res.status}`);
    } catch (error) {
      record(`API ${path}`, false, error instanceof Error ? error.message : String(error));
    }
  }

  // Sitemap and robots.
  try {
    const res = await get('/sitemap.xml');
    const xml = await res.text();
    record(
      'Sitemap',
      res.status === 200 && xml.includes('<urlset'),
      `${res.status}, ${(xml.match(/<url>/g) ?? []).length} urls`,
    );
  } catch (error) {
    record('Sitemap', false, error instanceof Error ? error.message : String(error));
  }
  try {
    const res = await get('/robots.txt');
    const text = await res.text();
    record(
      'robots.txt',
      res.status === 200 && text.includes('Disallow: /admin'),
      `${res.status}${text.includes('Sitemap:') ? ', has Sitemap line' : ', no Sitemap line'}`,
    );
  } catch (error) {
    record('robots.txt', false, error instanceof Error ? error.message : String(error));
  }

  // Security headers on the page.
  try {
    const res = await get('/');
    const wanted = [
      'content-security-policy',
      'x-content-type-options',
      'x-frame-options',
      'referrer-policy',
      'permissions-policy',
      ...(base.startsWith('https://') ? ['strict-transport-security'] : []),
    ];
    const missing = wanted.filter((h) => !res.headers.get(h));
    record(
      'Security headers',
      missing.length === 0,
      missing.length === 0 ? 'all present' : `missing ${missing.join(', ')}`,
    );
  } catch (error) {
    record('Security headers', false, error instanceof Error ? error.message : String(error));
  }

  // A cross-site POST is refused before it reaches any logic (no booking is made).
  try {
    const res = await get('/api/bookings', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      body: '{}',
    });
    record('Cross-site POST rejected', res.status === 403, `${res.status}`);
  } catch (error) {
    record(
      'Cross-site POST rejected',
      false,
      error instanceof Error ? error.message : String(error),
    );
  }

  // Staff routes need a session.
  for (const path of ['/api/admin/today', '/api/me/schedule', '/api/admin/photos']) {
    try {
      const res = await get(path);
      record(`Signed out ${path}`, res.status === 401, `${res.status}`);
    } catch (error) {
      record(`Signed out ${path}`, false, error instanceof Error ? error.message : String(error));
    }
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(
    `\n${checks.length - failed.length} of ${checks.length} checks passed against ${base}`,
  );
  if (failed.length > 0) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
