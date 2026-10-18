import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiErrorSchema } from '../../shared/api/errors';
import { healthResponseSchema } from '../../shared/api/health';
import {
  publicServicesResponseSchema,
  publicShopSchema,
  publicStaffListResponseSchema,
  publicStaffResponseSchema,
} from '../../shared/api/public';
import { createDevServer } from '../../server/http/dev-adapter';
import { staffRepo } from '../../server/repos';
import { runSeed } from '../../server/services/seedService';
import { NOW, useTestDb } from '../helpers/db';

const { db } = useTestDb();
let baseUrl = '';
const server = createDevServer();

beforeAll(async () => {
  await runSeed(db(), NOW);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((e) => {
      if (e) reject(e);
      else resolve();
    });
  });
});

async function get(path: string, init: RequestInit = {}) {
  const res = await fetch(`${baseUrl}${path}`, init);
  return { status: res.status, headers: res.headers, body: await res.json() };
}

describe('GET /api/health', () => {
  it('reports ok with a build sha and db latency', async () => {
    const { status, body, headers } = await get('/api/health');
    expect(status).toBe(200);
    const parsed = healthResponseSchema.parse(body);
    expect(parsed.ok).toBe(true);
    expect(parsed.status).toBe('ok');
    expect(parsed.missing).toBeUndefined();
    expect(parsed.db?.ok).toBe(true);
    expect(typeof parsed.db?.latencyMs).toBe('number');
    expect(headers.get('x-request-id')).toMatch(/^[0-9a-f]{16}$/);
    expect(headers.get('cache-control')).toBe('no-store');
  });
});

describe('public routes', () => {
  it('serves shop info with hours', async () => {
    const { status, body } = await get('/api/shop');
    expect(status).toBe(200);
    const shop = publicShopSchema.parse(body);
    expect(shop.name).toContain('Exquisite');
    expect(shop.hours.tue.length).toBeGreaterThan(0);
  });

  it('serves services and staff', async () => {
    const services = publicServicesResponseSchema.parse((await get('/api/services')).body);
    expect(services.services.length).toBeGreaterThan(5);
    expect(services.services.every((s) => Number.isInteger(s.priceCents))).toBe(true);
    const staff = publicStaffListResponseSchema.parse((await get('/api/staff')).body);
    expect(staff.staff.map((s) => s.slug)).toContain('dontrise');
    expect(JSON.stringify(staff)).not.toContain('slugKeys');
  });

  it('resolves a staff member by current slug and by alias with a canonical flag', async () => {
    const dee = await staffRepo.findStaffBySlug('dee');
    await staffRepo.renameStaffSlug(dee?._id ?? '', 'dee-the-barber', NOW);
    const current = publicStaffResponseSchema.parse((await get('/api/staff/dee-the-barber')).body);
    expect(current.canonical).toBe(true);
    const alias = publicStaffResponseSchema.parse((await get('/api/staff/DEE')).body);
    expect(alias.canonical).toBe(false);
    expect(alias.staff.slug).toBe('dee-the-barber');
    const missing = await get('/api/staff/nobody');
    expect(missing.status).toBe(404);
    expect(apiErrorSchema.parse(missing.body).error.code).toBe('NOT_FOUND');
  });

  it('hides soft-deleted staff from the slug route', async () => {
    const jay = await staffRepo.findStaffBySlug('jay');
    await staffRepo.softDeleteStaff(jay?._id ?? '', NOW);
    expect((await get('/api/staff/jay')).status).toBe(404);
  });
});

describe('router behaviour', () => {
  it('returns NOT_FOUND for unknown paths and METHOD_NOT_ALLOWED for wrong methods', async () => {
    const nf = await get('/api/nope');
    expect(nf.status).toBe(404);
    const mna = await get('/api/health', { method: 'DELETE' });
    expect(mna.status).toBe(405);
    expect(apiErrorSchema.parse(mna.body).error.code).toBe('METHOD_NOT_ALLOWED');
  });

  it('rejects cross-site mutating requests by Origin', async () => {
    const res = await get('/api/health', {
      method: 'POST',
      headers: { origin: 'https://evil.example' },
    });
    expect(res.status).toBe(403);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('ORIGIN_NOT_ALLOWED');
    const ok = await get('/api/health', {
      method: 'POST',
      headers: { origin: 'http://localhost:5173' },
    });
    // Allowed origin reaches routing, which has no POST /api/health.
    expect(ok.status).toBe(405);
    const fetchSite = await get('/api/health', {
      method: 'POST',
      headers: { 'sec-fetch-site': 'cross-site' },
    });
    expect(fetchSite.status).toBe(403);
  });

  it('denies every non-public route until auth exists', async () => {
    const { createRouter, denyAllAuthenticator } = await import('../../server/http/router');
    const router = createRouter(
      [
        {
          method: 'GET',
          path: '/api/admin/ping',
          auth: 'owner',
          handler: () => Promise.resolve({ body: { ok: true } }),
        },
      ],
      denyAllAuthenticator,
    );
    const { createServer } = await import('node:http');
    const s = createServer((req, res) => {
      void router.handle(req, res);
    });
    await new Promise<void>((resolve) => s.listen(0, '127.0.0.1', resolve));
    const port = (s.address() as AddressInfo).port;
    const res = await fetch(`http://127.0.0.1:${port}/api/admin/ping`);
    expect(res.status).toBe(401);
    await new Promise<void>((resolve) => {
      s.close(() => {
        resolve();
      });
    });
  });
});
