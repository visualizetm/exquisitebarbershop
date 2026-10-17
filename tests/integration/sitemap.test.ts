import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { staffRepo } from '../../server/repos';
import { runSeed } from '../../server/services/seedService';
import { staffSeedId } from '../../seed/shop';
import { call, startTestServer, type TestServer } from '../helpers/bookingApi';
import { NOW, useTestDb } from '../helpers/db';

const { db } = useTestDb();
let server: TestServer;

describe('GET /sitemap.xml', () => {
  beforeAll(async () => {
    await runSeed(db(), NOW);
    server = await startTestServer();
  });
  afterAll(async () => {
    await server.close();
  });

  it('lists the public routes and one entry per listed chair, as XML', async () => {
    const res = await call(server.baseUrl, 'GET', '/api/sitemap.xml');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/xml; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
    const xml = String(res.body.text);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    for (const path of ['/', '/services', '/chairs', '/gallery', '/visit', '/book']) {
      expect(xml).toContain(`<loc>http://localhost:5173${path}</loc>`);
    }
    expect(xml).toContain('<loc>http://localhost:5173/chairs/marcus</loc>');
    expect(xml).not.toContain('/admin');
    expect(xml).not.toContain('/manage');
  });

  it('drops a chair that is removed or hidden from the website', async () => {
    await staffRepo.updateStaff(staffSeedId('marcus'), { showOnWebsite: false }, NOW);
    await staffRepo.softDeleteStaff(staffSeedId('tre'), NOW);
    const res = await call(server.baseUrl, 'GET', '/api/sitemap.xml');
    const xml = String(res.body.text);
    expect(xml).not.toContain('/chairs/marcus<');
    expect(xml).not.toContain('/chairs/tre<');
    expect(xml).toContain('/chairs/dee<');
  });
});
