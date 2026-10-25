import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runSeed } from '../../server/services/seedService';
import { staffSeedId } from '../../seed/shop';
import { apiErrorSchema } from '../../shared/api/errors';
import { createLogin, sessionCookie } from '../helpers/auth';
import { call, startTestServer, type TestServer } from '../helpers/bookingApi';
import { NOW, useTestDb } from '../helpers/db';

process.env.OUTBOX_AFTER_RESPONSE = 'off';
const { db } = useTestDb();
let server: TestServer;
let cookie: string;

const owner = (method: string, path: string, body?: unknown) =>
  call(server.baseUrl, method, path, {
    headers: { cookie },
    ...(body === undefined ? {} : { body }),
  });

beforeAll(async () => {
  await runSeed(db(), NOW);
  server = await startTestServer();
  cookie = await sessionCookie(
    (await createLogin({ role: 'owner', staffId: staffSeedId('dontrise') }))._id,
  );
});
afterAll(async () => {
  await server.close();
});

describe('a barber removed from the schedule', () => {
  it('keeps the old address working: renamed slugs resolve, removed ones answer STAFF_REMOVED', async () => {
    const id = staffSeedId('iniya');
    expect((await owner('POST', `/api/admin/staff/${id}/slug`, { slug: 'iniyah' })).status).toBe(
      200,
    );
    // The old slug still resolves, and says which one is current.
    const old = await call(server.baseUrl, 'GET', '/api/staff/iniya');
    expect(old.status).toBe(200);
    expect(old.body).toMatchObject({ canonical: false, staff: { slug: 'iniyah' } });

    const removed = await owner('DELETE', `/api/admin/staff/${id}`, {});
    expect(removed.status).toBe(200);
    // Both the current slug and the alias now say "removed", never a 404 and never the profile.
    for (const slug of ['iniyah', 'iniya']) {
      const res = await call(server.baseUrl, 'GET', `/api/staff/${slug}`);
      expect(res.status, slug).toBe(410);
      expect(apiErrorSchema.parse(res.body).error.code).toBe('STAFF_REMOVED');
    }
    // A name that never existed is still a plain 404.
    const unknown = await call(server.baseUrl, 'GET', '/api/staff/never-existed');
    expect(unknown.status).toBe(404);
    // And the removed barber is gone from the public list.
    const list = await call(server.baseUrl, 'GET', '/api/staff');
    expect(JSON.stringify(list.body)).not.toContain('iniyah');
  });
});
