import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runSeed } from '../../server/services/seedService';
import { staffSeedId } from '../../seed/shop';
import { apiErrorSchema } from '../../shared/api/errors';
import { OWNER_PASSWORD, createLogin, sessionCookie } from '../helpers/auth';
import { call, startTestServer, type TestServer } from '../helpers/bookingApi';
import { NOW, useTestDb } from '../helpers/db';

const { db } = useTestDb();
let server: TestServer;
let cookie: string;
let ownerId: string;

const post = (body: unknown) =>
  call(server.baseUrl, 'POST', '/api/me/email', { headers: { cookie }, body });

beforeAll(async () => {
  await runSeed(db(), NOW);
  server = await startTestServer();
  const owner = await createLogin({
    role: 'owner',
    staffId: staffSeedId('dontrise'),
    email: 'first@example.com',
  });
  ownerId = owner._id;
  cookie = await sessionCookie(owner._id);
  await createLogin({ role: 'owner', staffId: null, email: 'taken@example.com' });
});
afterAll(async () => {
  await server.close();
});

describe('changing the owner email', () => {
  it('needs the current password, refuses a taken address and keeps the session', async () => {
    const wrong = await post({
      currentPassword: 'not-the-password-123',
      newEmail: 'new@example.com',
    });
    expect(wrong.status).toBe(401);
    expect(apiErrorSchema.parse(wrong.body).error.code).toBe('INVALID_CREDENTIALS');
    const taken = await post({ currentPassword: OWNER_PASSWORD, newEmail: 'Taken@Example.com' });
    expect(taken.status).toBe(409);
    const same = await post({ currentPassword: OWNER_PASSWORD, newEmail: 'first@example.com' });
    expect(same.status).toBe(400);
    const ok = await post({ currentPassword: OWNER_PASSWORD, newEmail: 'New.Owner@Example.com' });
    expect(ok.status).toBe(200);
    expect((ok.body as { user: { email: string } }).user.email).toBe('new.owner@example.com');
    // Still signed in, and the change is in the audit log.
    expect(
      (await call(server.baseUrl, 'GET', '/api/auth/me', { headers: { cookie } })).status,
    ).toBe(200);
    expect(
      await db()
        .collection('auditLog')
        .countDocuments({ action: 'user.email.change', entityId: ownerId }),
    ).toBe(1);
  });
});
