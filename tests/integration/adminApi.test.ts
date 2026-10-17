import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emailOutboxRepo, sessionsRepo, usersRepo } from '../../server/repos';

async function liveSessions(userId: string): Promise<number> {
  const now = new Date();
  return (await sessionsRepo.listSessionsForUser(userId)).filter(
    (s) => s.revokedAt === null && s.expiresAt > now,
  ).length;
}
import { runSeed } from '../../server/services/seedService';
import { serviceSeedId, servicesSeed, shopSettingsSeed, staffSeedId } from '../../seed/shop';
import {
  auditListResponseSchema,
  bookingDetailResponseSchema,
  bookingListResponseSchema,
  bookingResponseSchema,
  customerResponseSchema,
  issuedPasswordResponseSchema,
  loginListResponseSchema,
  loginResponseSchema,
  myScheduleResponseSchema,
  outboxListResponseSchema,
  scheduleResponseSchema,
  serviceListResponseSchema,
  serviceResponseSchema,
  settingsResponseSchema,
  staffListResponseSchema,
  staffResponseSchema,
  todayResponseSchema,
  whoIsInResponseSchema,
} from '../../shared/api/admin';
import { apiErrorSchema } from '../../shared/api/errors';
import { createLogin, sessionCookie } from '../helpers/auth';
import {
  bookPublic,
  call,
  nextDate,
  slotAt,
  startTestServer,
  type TestServer,
} from '../helpers/bookingApi';
import { NOW, useTestDb } from '../helpers/db';

process.env.OUTBOX_AFTER_RESPONSE = 'off';
const { db } = useTestDb();
let server: TestServer;
let ownerCookie: string;
let marcusCookie: string;
const cut = serviceSeedId('classic-cut');
const cutPrice = servicesSeed.find((s) => s.key === 'classic-cut')?.input.priceCents ?? 0;
const marcus = staffSeedId('marcus');
const dee = staffSeedId('dee');
// Different weekdays per area so the tests do not share chairs or times.
const WED = nextDate(3, 3);
const THU = nextDate(4, 3);
const FRI = nextDate(5, 3);

function as(cookie: string) {
  return (method: string, path: string, body?: unknown) =>
    call(server.baseUrl, method, path, {
      headers: { cookie },
      ...(body === undefined ? {} : { body }),
    });
}
const owner = (method: string, path: string, body?: unknown) => as(ownerCookie)(method, path, body);
const barber = (method: string, path: string, body?: unknown) =>
  as(marcusCookie)(method, path, body);
const codeOf = (body: unknown) => apiErrorSchema.parse(body).error.code;

beforeAll(async () => {
  await runSeed(db(), NOW);
  server = await startTestServer();
  const ownerLogin = await createLogin({ role: 'owner', staffId: staffSeedId('dontrise') });
  ownerCookie = await sessionCookie(ownerLogin._id);
  const marcusLogin = await createLogin({ role: 'barber', staffId: marcus });
  marcusCookie = await sessionCookie(marcusLogin._id);
});
afterAll(async () => {
  await server.close();
});

describe('status changes', () => {
  it('moves along the allowed paths, undoes back to confirmed, and audits each step', async () => {
    const b = await bookPublic(server.baseUrl, {
      staff: 'marcus',
      serviceIds: [cut],
      startAt: slotAt(WED, '10:00'),
    });
    const done = await owner('POST', `/api/admin/bookings/${b.id}/status`, { status: 'completed' });
    expect(bookingResponseSchema.parse(done.body).booking.status).toBe('completed');
    const detail = bookingDetailResponseSchema.parse(
      (await owner('GET', `/api/admin/bookings/${b.id}`)).body,
    );
    expect(detail.transitions).toEqual(['confirmed']);
    const wrong = await owner('POST', `/api/admin/bookings/${b.id}/status`, { status: 'noShow' });
    expect(wrong.status).toBe(409);
    expect(codeOf(wrong.body)).toBe('INVALID_TRANSITION');
    const undo = await owner('POST', `/api/admin/bookings/${b.id}/status`, { status: 'confirmed' });
    expect(bookingResponseSchema.parse(undo.body).booking.status).toBe('confirmed');
    const audit = await db()
      .collection<{ action: string }>('auditLog')
      .find({ entityId: b.id, action: 'booking.status' })
      .toArray();
    expect(audit).toHaveLength(2);
  });

  it('restores a cancelled booking, and refuses when the slot was taken meanwhile', async () => {
    const first = await bookPublic(server.baseUrl, {
      staff: 'marcus',
      serviceIds: [cut],
      startAt: slotAt(WED, '12:00'),
      email: 'restore@example.com',
    });
    const cancelled = await owner('POST', `/api/admin/bookings/${first.id}/cancel`, {
      notify: true,
      reason: 'Owner called',
    });
    expect(bookingResponseSchema.parse(cancelled.body).booking.status).toBe('cancelled');
    const mail = (await emailOutboxRepo.listOutboxForBooking(first.id)).map((m) => m.template);
    expect(mail).toContain('bookingCancelled');
    expect(mail).not.toContain('ownerBookingCancelled');

    const restored = await owner('POST', `/api/admin/bookings/${first.id}/status`, {
      status: 'confirmed',
    });
    expect(bookingResponseSchema.parse(restored.body).booking.status).toBe('confirmed');

    await owner('POST', `/api/admin/bookings/${first.id}/cancel`, { notify: false });
    await bookPublic(server.baseUrl, {
      staff: 'marcus',
      serviceIds: [cut],
      startAt: slotAt(WED, '12:00'),
    });
    const taken = await owner('POST', `/api/admin/bookings/${first.id}/status`, {
      status: 'confirmed',
    });
    expect(taken.status).toBe(409);
    expect(codeOf(taken.body)).toBe('SLOT_TAKEN');
  });

  it('a barber completes and marks no show on their own bookings, with undo, but never cancels', async () => {
    const b = await bookPublic(server.baseUrl, {
      staff: 'marcus',
      serviceIds: [cut],
      startAt: slotAt(WED, '14:00'),
    });
    const noShow = await barber('POST', `/api/me/bookings/${b.id}/status`, { status: 'noShow' });
    expect(bookingResponseSchema.parse(noShow.body).booking.status).toBe('noShow');
    const undo = await barber('POST', `/api/me/bookings/${b.id}/status`, { status: 'confirmed' });
    expect(undo.status).toBe(200);
    const cancel = await barber('POST', `/api/me/bookings/${b.id}/status`, { status: 'cancelled' });
    expect(cancel.status).toBe(409);
    expect(codeOf(cancel.body)).toBe('INVALID_TRANSITION');
    const detail = bookingDetailResponseSchema.parse(
      (await barber('GET', `/api/me/bookings/${b.id}`)).body,
    );
    expect(detail.transitions).toEqual(['completed', 'noShow']);
    // The barber view never carries the audit trail or email history.
    expect(detail.audit).toEqual([]);
    expect(detail.outbox).toEqual([]);
  });
});

describe('today, schedule and who is in', () => {
  it('counts the day, sums revenue and shows who is next per chair', async () => {
    const a = await bookPublic(server.baseUrl, {
      staff: 'marcus',
      serviceIds: [cut],
      startAt: slotAt(THU, '10:00'),
    });
    await bookPublic(server.baseUrl, {
      staff: 'dee',
      serviceIds: [cut],
      startAt: slotAt(THU, '11:00'),
    });
    await owner('POST', `/api/admin/bookings/${a.id}/status`, { status: 'completed' });
    const today = todayResponseSchema.parse(
      (await owner('GET', `/api/admin/today?date=${THU}`)).body,
    );
    expect(today.counts).toMatchObject({ total: 2, completed: 1, confirmed: 1 });
    expect(today.chairsBooked).toBe(2);
    expect(today.expectedRevenueCents).toBe(2 * cutPrice);
    expect(today.completedRevenueCents).toBe(cutPrice);
    const deeNext = today.nextUp.find((n) => n.staff.id === dee);
    expect(deeNext?.booking?.startAt).toBe(slotAt(THU, '11:00'));
    expect(today.nextUp.find((n) => n.staff.id === marcus)?.booking).toBeNull();
    expect(today.whoIsIn.length).toBeGreaterThan(0);
  });

  it('shows all chairs or one chair for a day', async () => {
    const all = scheduleResponseSchema.parse(
      (await owner('GET', `/api/admin/schedule?date=${THU}`)).body,
    );
    expect(all.chairs.length).toBeGreaterThan(1);
    const one = scheduleResponseSchema.parse(
      (await owner('GET', `/api/admin/schedule?date=${THU}&staffId=${dee}`)).body,
    );
    expect(one.chairs.map((c) => c.staff.id)).toEqual([dee]);
    expect(one.chairs[0]?.bookings).toHaveLength(1);
  });

  it('who is in follows the weekly hours and the day toggle', async () => {
    const before = whoIsInResponseSchema.parse(
      (await owner('GET', `/api/admin/whos-in?date=${THU}`)).body,
    );
    // Jay does not work Thursdays in the seed.
    expect(before.entries.find((e) => e.staff.id === staffSeedId('jay'))?.status).toBe('out');
    const extra = await owner('POST', `/api/admin/staff/${staffSeedId('jay')}/day`, {
      date: THU,
      status: 'in',
      start: '12:00',
      end: '16:00',
    });
    expect(extra.status).toBe(200);
    const after = whoIsInResponseSchema.parse(
      (await owner('GET', `/api/admin/whos-in?date=${THU}`)).body,
    );
    expect(after.entries.find((e) => e.staff.id === staffSeedId('jay'))).toMatchObject({
      status: 'in',
      extraHours: true,
    });
  });
});

describe('bookings list and detail', () => {
  it('filters, searches by name, phone and code, and pages with a cursor', async () => {
    const created = [];
    for (const hhmm of ['09:00', '10:00', '11:00']) {
      created.push(
        await bookPublic(server.baseUrl, {
          staff: 'dee',
          serviceIds: [cut],
          startAt: slotAt(FRI, hhmm),
          name: `Zelda Listing ${hhmm}`,
        }),
      );
    }
    const page1 = bookingListResponseSchema.parse(
      (await owner('GET', `/api/admin/bookings?from=${FRI}&to=${FRI}&staffId=${dee}&limit=2`)).body,
    );
    expect(page1.bookings).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = bookingListResponseSchema.parse(
      (
        await owner(
          'GET',
          `/api/admin/bookings?from=${FRI}&to=${FRI}&staffId=${dee}&limit=2&cursor=${page1.nextCursor ?? ''}`,
        )
      ).body,
    );
    expect(page2.bookings.map((b) => b.id)).toEqual([created[2]?.id]);
    expect(page2.nextCursor).toBeNull();

    const byName = bookingListResponseSchema.parse(
      (await owner('GET', `/api/admin/bookings?q=${encodeURIComponent('zelda listing')}`)).body,
    );
    expect(byName.bookings).toHaveLength(3);
    const code = created[1]?.referenceCode ?? '';
    const byCode = bookingListResponseSchema.parse(
      (await owner('GET', `/api/admin/bookings?q=${code.toLowerCase()}`)).body,
    );
    expect(byCode.bookings.map((b) => b.id)).toEqual([created[1]?.id]);
    const phone = byCode.bookings[0]?.customer.phone ?? '';
    const byPhone = bookingListResponseSchema.parse(
      (await owner('GET', `/api/admin/bookings?q=${encodeURIComponent(phone.slice(-7))}`)).body,
    );
    expect(byPhone.bookings.map((b) => b.id)).toContain(created[1]?.id);

    const bad = await owner('GET', '/api/admin/bookings?cursor=not-a-cursor');
    expect(bad.status).toBe(400);
    const noShows = bookingListResponseSchema.parse(
      (await owner('GET', `/api/admin/bookings?from=${FRI}&to=${FRI}&status=noShow`)).body,
    );
    expect(noShows.bookings).toEqual([]);
  });

  it('a new online booking is flagged until the owner opens it', async () => {
    const b = await bookPublic(server.baseUrl, {
      staff: 'dee',
      serviceIds: [cut],
      startAt: slotAt(FRI, '15:00'),
    });
    const listed = bookingListResponseSchema.parse(
      (await owner('GET', `/api/admin/bookings?q=${b.referenceCode}`)).body,
    );
    expect(listed.bookings[0]?.isNew).toBe(true);
    const unseenBefore = todayResponseSchema.parse((await owner('GET', '/api/admin/today')).body)
      .counts.newOnline;
    const detail = bookingDetailResponseSchema.parse(
      (await owner('GET', `/api/admin/bookings/${b.id}`)).body,
    );
    expect(detail.audit.map((a) => a.action)).toContain('booking.create');
    expect(detail.outbox.map((m) => m.template)).toContain('ownerNewBooking');
    const after = bookingListResponseSchema.parse(
      (await owner('GET', `/api/admin/bookings?q=${b.referenceCode}`)).body,
    );
    expect(after.bookings[0]?.isNew).toBe(false);
    const unseenAfter = todayResponseSchema.parse((await owner('GET', '/api/admin/today')).body)
      .counts.newOnline;
    expect(unseenAfter).toBe(unseenBefore - 1);
    // A barber opening their own booking does not clear the owner's flag.
    const mine = await bookPublic(server.baseUrl, {
      staff: 'marcus',
      serviceIds: [cut],
      startAt: slotAt(FRI, '16:00'),
    });
    await barber('GET', `/api/me/bookings/${mine.id}`);
    const stillNew = bookingListResponseSchema.parse(
      (await owner('GET', `/api/admin/bookings?q=${mine.referenceCode}`)).body,
    );
    expect(stillNew.bookings[0]?.isNew).toBe(true);
  });

  it('edits notes and looks up a customer by phone with history', async () => {
    const b = await bookPublic(server.baseUrl, {
      staff: 'dee',
      serviceIds: [cut],
      startAt: slotAt(FRI, '17:00'),
      name: 'History Person',
    });
    const notes = await owner('PATCH', `/api/admin/bookings/${b.id}`, {
      notes: 'Prefers scissors',
    });
    expect(bookingResponseSchema.parse(notes.body).booking.notes).toBe('Prefers scissors');
    const phone = bookingListResponseSchema.parse(
      (await owner('GET', `/api/admin/bookings?q=${b.referenceCode}`)).body,
    ).bookings[0]?.customer.phone;
    const customer = customerResponseSchema.parse(
      (await owner('GET', `/api/admin/customers?phone=${encodeURIComponent(phone ?? '')}`)).body,
    );
    expect(customer.names).toEqual(['History Person']);
    expect(customer.counts).toMatchObject({ total: 1, upcoming: 1 });
  });
});

describe('catalog and settings', () => {
  it('creates, edits and soft deletes a service', async () => {
    const created = await owner('POST', '/api/admin/services', {
      name: 'Eyebrow Shape',
      group: 'Barber',
      description: 'Clean up',
      priceCents: 1000,
      priceFrom: false,
      durationMinutes: 15,
      bufferMinutes: null,
      sortOrder: 99,
      isActive: true,
    });
    expect(created.status).toBe(201);
    const id = serviceResponseSchema.parse(created.body).service.id;
    const edited = await owner('PATCH', `/api/admin/services/${id}`, { priceCents: 1200 });
    expect(serviceResponseSchema.parse(edited.body).service.priceCents).toBe(1200);
    const bad = await owner('PATCH', `/api/admin/services/${id}`, { priceCents: 12.5 });
    expect(bad.status).toBe(400);
    expect((await owner('DELETE', `/api/admin/services/${id}`, {})).status).toBe(200);
    const list = serviceListResponseSchema.parse((await owner('GET', '/api/admin/services')).body);
    expect(list.services.find((s) => s.id === id)?.deletedAt).not.toBeNull();
    expect(
      await db()
        .collection('services')
        .countDocuments({ _id: id } as never),
    ).toBe(1);
  });

  it('renames a slug and keeps the old one as an alias that still resolves', async () => {
    const res = await owner('POST', `/api/admin/staff/${dee}/slug`, { slug: 'dee-styles' });
    const staff = staffResponseSchema.parse(res.body).staff;
    expect(staff.slug).toBe('dee-styles');
    expect(staff.slugAliases).toContain('dee');
    expect((await call(server.baseUrl, 'GET', '/api/staff/dee')).status).toBe(200);
    const list = staffListResponseSchema.parse((await owner('GET', '/api/admin/staff')).body);
    expect(list.staff.find((s) => s.id === marcus)?.hasLogin).toBe(true);
  });

  it('turns on barber time blocking through the shop settings', async () => {
    const own = { kind: 'block', startAt: slotAt(FRI, '18:00'), endAt: slotAt(FRI, '18:30') };
    const refused = await barber('POST', '/api/me/time-blocks', own);
    expect(refused.status).toBe(403);
    const settings = settingsResponseSchema.parse((await owner('GET', '/api/admin/settings')).body);
    expect(settings.settings.permissions.barbersCanBlockTime).toBe(false);
    const put = await owner('PUT', '/api/admin/settings', {
      ...shopSettingsSeed,
      permissions: { barbersCanBlockTime: true },
    });
    expect(put.status).toBe(200);
    const allowed = await barber('POST', '/api/me/time-blocks', own);
    expect(allowed.status).toBe(201);
    const week = myScheduleResponseSchema.parse(
      (await barber('GET', `/api/me/schedule?date=${WED}&days=7`)).body,
    );
    expect(week.canBlockTime).toBe(true);
    expect(week.days).toHaveLength(7);
    expect(week.days.every((d) => d.bookings.every((b) => b.staff.id === marcus))).toBe(true);
    expect(week.days.flatMap((d) => d.blocks).map((b) => b.startAt)).toContain(own.startAt);
  });
});

describe('logins', () => {
  it('issues a temporary password, resets it, disables and enables the login', async () => {
    const tre = staffSeedId('tre');
    const created = await owner('POST', '/api/admin/users', {
      email: 'tre.login@example.com',
      staffId: tre,
    });
    expect(created.status).toBe(201);
    const issued = issuedPasswordResponseSchema.parse(created.body);
    expect(issued.user.mustChangePassword).toBe(true);
    expect(issued.temporaryPassword).toMatch(/^[a-z2-9]{4}(-[a-z2-9]{4}){3}$/);
    const dup = await owner('POST', '/api/admin/users', {
      email: 'other@example.com',
      staffId: tre,
    });
    expect(dup.status).toBe(409);

    const login = await call(server.baseUrl, 'POST', '/api/auth/login', {
      body: { email: 'tre.login@example.com', password: issued.temporaryPassword },
    });
    expect(login.status).toBe(200);
    const userId = issued.user._id;
    expect(await liveSessions(userId)).toBe(1);

    const reset = issuedPasswordResponseSchema.parse(
      (await owner('POST', `/api/admin/users/${userId}/reset-password`)).body,
    );
    expect(reset.temporaryPassword).not.toBe(issued.temporaryPassword);
    expect(await liveSessions(userId)).toBe(0);

    const disabled = loginResponseSchema.parse(
      (await owner('POST', `/api/admin/users/${userId}/disable`)).body,
    );
    expect(disabled.user.isActive).toBe(false);
    const refused = await call(server.baseUrl, 'POST', '/api/auth/login', {
      body: { email: 'tre.login@example.com', password: reset.temporaryPassword },
    });
    expect(refused.status).toBe(401);
    await owner('POST', `/api/admin/users/${userId}/enable`);
    expect((await usersRepo.findUserById(userId))?.isActive).toBe(true);
    const list = loginListResponseSchema.parse((await owner('GET', '/api/admin/users')).body);
    expect(list.users.find((u) => u._id === userId)?.staffName).toBeTruthy();
    expect(JSON.stringify(list)).not.toContain('passwordHash');
  });
});

describe('audit and outbox viewers', () => {
  it('filters the audit log by action prefix and pages through it', async () => {
    const first = auditListResponseSchema.parse(
      (await owner('GET', '/api/admin/audit?action=booking.&limit=2')).body,
    );
    expect(first.entries).toHaveLength(2);
    expect(first.entries.every((e) => e.action.startsWith('booking.'))).toBe(true);
    const second = auditListResponseSchema.parse(
      (
        await owner(
          'GET',
          `/api/admin/audit?action=booking.&limit=2&cursor=${first.nextCursor ?? ''}`,
        )
      ).body,
    );
    const ids = new Set(first.entries.map((e) => e.id));
    expect(second.entries.some((e) => ids.has(e.id))).toBe(false);
    const logins = auditListResponseSchema.parse(
      (await owner('GET', '/api/admin/audit?action=auth.login')).body,
    );
    expect(JSON.stringify(logins)).not.toMatch(/password"?\s*:/i);
  });

  it('lists the outbox and retries only failed messages', async () => {
    const all = outboxListResponseSchema.parse((await owner('GET', '/api/admin/outbox')).body);
    const target = all.messages[0];
    expect(target).toBeDefined();
    const id = target?.id ?? '';
    const notFailed = await owner('POST', `/api/admin/outbox/${id}/retry`);
    expect(notFailed.status).toBe(409);
    await db()
      .collection('emailOutbox')
      .updateOne({ _id: id } as never, { $set: { status: 'failed', lastError: 'boom' } });
    const failed = outboxListResponseSchema.parse(
      (await owner('GET', '/api/admin/outbox?status=failed')).body,
    );
    expect(failed.messages.map((m) => m.id)).toContain(id);
    expect((await owner('POST', `/api/admin/outbox/${id}/retry`)).status).toBe(200);
    expect((await emailOutboxRepo.findOutboxMessageById(id))?.status).toBe('pending');
  });
});
