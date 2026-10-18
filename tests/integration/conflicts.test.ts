import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { withTransaction } from '../../server/db/transaction';
import {
  bookingsRepo,
  emailOutboxRepo,
  scheduleGuardsRepo,
  servicesRepo,
  slotLocksRepo,
  staffRepo,
  timeBlocksRepo,
  usersRepo,
  weeklyHoursRepo,
} from '../../server/repos';
import { runSeed } from '../../server/services/seedService';
import { serviceSeedId, shopHoursSeed, staffSeed, staffSeedId } from '../../seed/shop';
import { generateReferenceCode } from '../../shared/lib/referenceCode';
import { addMinutes } from '../../shared/lib/time';
import type { WeekHours } from '../../shared/schemas/common';
import { apiErrorSchema } from '../../shared/api/errors';
import { createLogin, sessionCookie } from '../helpers/auth';
import {
  call,
  nextDate,
  phone,
  slotAt,
  startTestServer,
  type TestServer,
} from '../helpers/bookingApi';
import { NOW, useTestDb } from '../helpers/db';

process.env.OUTBOX_AFTER_RESPONSE = 'off';
const { db } = useTestDb();
let server: TestServer;
let ownerCookie: string;
const THU = nextDate(4, 3);
const marcus = staffSeedId('marcus');
const tre = staffSeedId('tre');
const cut = serviceSeedId('classic-cut');

const asOwner = (method: string, path: string, body?: unknown) =>
  call(server.baseUrl, method, path, {
    headers: { cookie: ownerCookie },
    ...(body === undefined ? {} : { body }),
  });

/** A confirmed booking with its locks, written directly so tests control the exact time. */
async function seedBooking(
  staffId: string,
  hhmm: string,
  opts: { serviceId?: string; email?: string | null } = {},
) {
  const startAt = new Date(slotAt(THU, hhmm));
  const service = await servicesRepo.findServiceById(opts.serviceId ?? cut);
  if (!service) throw new Error('missing service');
  const endAt = addMinutes(startAt, service.durationMinutes);
  return withTransaction(async (session) => {
    const booking = await bookingsRepo.insertBooking(
      {
        referenceCode: generateReferenceCode(),
        staffId,
        staffRequested: true,
        services: [
          {
            serviceId: service._id,
            name: service.name,
            group: service.group,
            priceCents: service.priceCents,
            priceFrom: service.priceFrom,
            durationMinutes: service.durationMinutes,
          },
        ],
        startAt,
        endAt,
        durationMinutes: service.durationMinutes,
        bufferMinutes: 10,
        totalPriceCents: service.priceCents,
        customer: {
          name: `Customer ${hhmm}`,
          phone: phone(),
          email: opts.email === undefined ? 'c@example.com' : opts.email,
        },
        status: 'confirmed',
        source: 'online',
        notes: null,
        cancellation: null,
        rescheduledFromId: null,
        manageTokenVersion: 1,
      },
      new Date(),
      { session },
    );
    await slotLocksRepo.acquireSlotLocks(
      staffId,
      { start: startAt, end: addMinutes(endAt, 10) },
      { holderType: 'booking', holderId: booking._id },
      new Date(),
      { session },
    );
    return booking;
  });
}

function affectedIds(body: Record<string, unknown>): string[] {
  return (apiErrorSchema.parse(body).error.affected ?? []).map((a) => a.bookingId).sort();
}

async function statusOf(id: string): Promise<string | undefined> {
  return (await bookingsRepo.findBookingById(id))?.status;
}

const thuOnly = (intervals: WeekHours['thu']): WeekHours => ({ ...shopHoursSeed, thu: intervals });

beforeAll(async () => {
  await runSeed(db(), NOW);
  server = await startTestServer();
  const owner = await createLogin({ role: 'owner', staffId: staffSeedId('dontrise') });
  ownerCookie = await sessionCookie(owner._id);
});
afterAll(async () => {
  await server.close();
});
beforeEach(async () => {
  for (const name of [
    'bookings',
    'slotLocks',
    'timeBlocks',
    'closures',
    'emailOutbox',
    'auditLog',
  ]) {
    await db().collection(name).deleteMany({});
  }
  await weeklyHoursRepo.setShopHours(shopHoursSeed, new Date());
  for (const member of staffSeed)
    await weeklyHoursRepo.setStaffHours(staffSeedId(member.key), member.hours, new Date());
});

describe('conflict rule: weekly hours', () => {
  it('shop hours: 409 lists the booking and changes nothing; keep applies it and is not asked again', async () => {
    const booking = await seedBooking(marcus, '16:00');
    const conflict = await asOwner('PUT', '/api/admin/hours', {
      days: thuOnly([{ start: '09:00', end: '15:00' }]),
    });
    expect(conflict.status).toBe(409);
    expect(apiErrorSchema.parse(conflict.body).error.code).toBe('SCHEDULE_CONFLICT');
    expect(affectedIds(conflict.body)).toEqual([booking._id]);
    const summary = apiErrorSchema.parse(conflict.body).error.affected?.[0];
    expect(summary).toMatchObject({
      referenceCode: booking.referenceCode,
      staffName: 'Marcus',
      customerName: 'Customer 16:00',
      hasEmail: true,
    });
    expect((await weeklyHoursRepo.getShopHours())?.days.thu).toEqual(shopHoursSeed.thu);

    const kept = await asOwner('PUT', '/api/admin/hours', {
      days: thuOnly([{ start: '09:00', end: '15:00' }]),
      resolutions: [{ bookingId: booking._id, action: 'keep' }],
    });
    expect(kept.status).toBe(200);
    expect(kept.body).toEqual({ ok: true, kept: [booking._id], moved: [], cancelled: [] });
    expect(await statusOf(booking._id)).toBe('confirmed');
    expect(
      await db()
        .collection('auditLog')
        .countDocuments({ action: 'booking.keepException', entityId: booking._id }),
    ).toBe(1);

    // The kept booking was already outside the hours, so an unrelated change does not ask again.
    const later = await asOwner('PUT', '/api/admin/hours', {
      days: {
        ...thuOnly([{ start: '09:00', end: '15:00' }]),
        wed: [{ start: '10:00', end: '19:00' }],
      },
    });
    expect(later.status).toBe(200);
  });

  it('cancel with and without notifying the customer, releasing locks; partial answers are refused', async () => {
    const a = await seedBooking(marcus, '16:00');
    const b = await seedBooking(tre, '16:30');
    const partial = await asOwner('PUT', '/api/admin/hours', {
      days: thuOnly([{ start: '09:00', end: '15:00' }]),
      resolutions: [{ bookingId: a._id, action: 'cancelAndNotify' }],
    });
    expect(partial.status).toBe(409);
    expect(await statusOf(a._id)).toBe('confirmed');
    const done = await asOwner('PUT', '/api/admin/hours', {
      days: thuOnly([{ start: '09:00', end: '15:00' }]),
      resolutions: [
        { bookingId: a._id, action: 'cancelAndNotify' },
        { bookingId: b._id, action: 'cancel' },
      ],
    });
    expect(done.status).toBe(200);
    expect((done.body as { cancelled: string[] }).cancelled.sort()).toEqual([a._id, b._id].sort());
    expect(await statusOf(a._id)).toBe('cancelled');
    expect(await statusOf(b._id)).toBe('cancelled');
    expect(await slotLocksRepo.listSlotLocksForHolder(a._id)).toEqual([]);
    expect(await slotLocksRepo.listSlotLocksForHolder(b._id)).toEqual([]);
    const aMail = (await emailOutboxRepo.listOutboxForBooking(a._id)).map((m) => m.template);
    const bMail = (await emailOutboxRepo.listOutboxForBooking(b._id)).map((m) => m.template);
    expect(aMail).toEqual(['bookingCancelled']);
    expect(bMail).toEqual([]);
    expect((await bookingsRepo.findBookingById(a._id))?.cancellation).toMatchObject({
      by: 'owner',
    });
  });

  it('chair hours: only that chair is checked', async () => {
    const mine = await seedBooking(marcus, '10:00');
    await seedBooking(tre, '10:00');
    const res = await asOwner('PUT', `/api/admin/staff/${marcus}/hours`, { days: thuOnly([]) });
    expect(res.status).toBe(409);
    expect(affectedIds(res.body)).toEqual([mine._id]);
  });

  it('a change that strands nobody applies directly', async () => {
    await seedBooking(marcus, '10:00');
    const res = await asOwner('PUT', '/api/admin/hours', {
      days: thuOnly([{ start: '09:00', end: '18:00' }]),
    });
    expect(res.body).toEqual({ ok: true, kept: [], moved: [], cancelled: [] });
  });

  it('a choice for a booking that is not affected is ignored, never cancelled', async () => {
    const safe = await seedBooking(marcus, '10:00');
    const res = await asOwner('PUT', '/api/admin/hours', {
      days: thuOnly([{ start: '09:00', end: '18:00' }]),
      resolutions: [{ bookingId: safe._id, action: 'cancel' }],
    });
    expect(res.body).toEqual({ ok: true, kept: [], moved: [], cancelled: [] });
    expect(await statusOf(safe._id)).toBe('confirmed');
  });
});

describe('conflict rule: closures', () => {
  it('closing a day lists the bookings of every chair that day', async () => {
    const a = await seedBooking(marcus, '10:00');
    const b = await seedBooking(tre, '12:00');
    const res = await asOwner('PUT', '/api/admin/closures', {
      date: THU,
      kind: 'closed',
      label: 'Holiday',
    });
    expect(res.status).toBe(409);
    expect(affectedIds(res.body)).toEqual([a._id, b._id].sort());
    const ok = await asOwner('PUT', '/api/admin/closures', {
      date: THU,
      kind: 'closed',
      label: 'Holiday',
      resolutions: [
        { bookingId: a._id, action: 'keep' },
        { bookingId: b._id, action: 'keep' },
      ],
    });
    expect(ok.status).toBe(200);
  });

  it('removing longer special hours shortens the day and is checked too', async () => {
    await weeklyHoursRepo.setStaffHours(
      marcus,
      thuOnly([{ start: '07:00', end: '21:00' }]),
      new Date(),
    );
    const created = await asOwner('PUT', '/api/admin/closures', {
      date: THU,
      kind: 'specialHours',
      intervals: [{ start: '07:00', end: '21:00' }],
      label: 'Late night',
    });
    expect(created.status).toBe(200);
    const late = await seedBooking(marcus, '20:00');
    const id = (created.body as { closure: { id: string } }).closure.id;
    const res = await asOwner('DELETE', `/api/admin/closures/${id}`, {});
    expect(res.status).toBe(409);
    expect(affectedIds(res.body)).toEqual([late._id]);
    const ok = await asOwner('DELETE', `/api/admin/closures/${id}`, {
      resolutions: [{ bookingId: late._id, action: 'cancel' }],
    });
    expect(ok.body).toEqual({ ok: true, kept: [], moved: [], cancelled: [late._id] });
  });
});

describe('conflict rule: time blocks and days', () => {
  it('time off over a booking is refused until answered', async () => {
    const booking = await seedBooking(marcus, '13:00');
    const res = await asOwner('POST', '/api/admin/time-blocks', {
      staffId: marcus,
      kind: 'timeOff',
      startAt: slotAt(THU, '12:00'),
      endAt: slotAt(THU, '19:00'),
      reason: 'Off early',
    });
    expect(res.status).toBe(409);
    expect(affectedIds(res.body)).toEqual([booking._id]);
    expect(
      await timeBlocksRepo.listTimeBlocksBetween({
        start: new Date(slotAt(THU, '00:00')),
        end: new Date(slotAt(THU, '23:59')),
      }),
    ).toEqual([]);
  });

  it('a blocked period shares slots only with a kept booking, and takes them back when it is cancelled', async () => {
    const booking = await seedBooking(marcus, '13:00'); // 13:00 to 13:30, buffer to 13:40: locks 13:00, 13:15, 13:30
    const res = await asOwner('POST', '/api/admin/time-blocks', {
      staffId: marcus,
      kind: 'block',
      startAt: slotAt(THU, '13:00'),
      endAt: slotAt(THU, '14:00'),
      resolutions: [{ bookingId: booking._id, action: 'keep' }],
    });
    expect(res.status).toBe(201);
    const blockId = (res.body as { timeBlock: { id: string } }).timeBlock.id;
    expect(
      (await slotLocksRepo.listSlotLocksForHolder(blockId)).map((l) => l.slotStart.toISOString()),
    ).toEqual([slotAt(THU, '13:45')]);
    const cancel = await asOwner('POST', `/api/admin/bookings/${booking._id}/cancel`, {
      notify: false,
    });
    expect(cancel.status).toBe(200);
    expect((await slotLocksRepo.listSlotLocksForHolder(blockId)).length).toBe(4);
  });

  it('marking someone out for the day is checked; marking them in again restores the day', async () => {
    const booking = await seedBooking(tre, '11:00');
    const out = await asOwner('POST', `/api/admin/staff/${tre}/day`, { date: THU, status: 'out' });
    expect(out.status).toBe(409);
    const kept = await asOwner('POST', `/api/admin/staff/${tre}/day`, {
      date: THU,
      status: 'out',
      resolutions: [{ bookingId: booking._id, action: 'keep' }],
    });
    expect(kept.status).toBe(200);
    expect((kept.body as { entry: { status: string; dayOff: boolean } }).entry).toMatchObject({
      status: 'out',
      dayOff: true,
    });
    const back = await asOwner('POST', `/api/admin/staff/${tre}/day`, { date: THU, status: 'in' });
    expect((back.body as { entry: { status: string; dayOff: boolean } }).entry).toMatchObject({
      status: 'in',
      dayOff: false,
    });
  });

  it('removing extra hours that hold a booking is checked', async () => {
    const jay = staffSeedId('jay'); // off on Thursdays
    const added = await asOwner('POST', `/api/admin/staff/${jay}/day`, {
      date: THU,
      status: 'in',
      start: '10:00',
      end: '14:00',
    });
    expect((added.body as { entry: { status: string; extraHours: boolean } }).entry).toMatchObject({
      status: 'in',
      extraHours: true,
    });
    const booking = await seedBooking(jay, '11:00');
    const blocks = await timeBlocksRepo.listTimeBlocksForStaff(jay, {
      start: new Date(slotAt(THU, '00:00')),
      end: new Date(slotAt(THU, '23:59')),
    });
    const extra = blocks.find((b) => b.kind === 'extraHours');
    const res = await asOwner('DELETE', `/api/admin/time-blocks/${extra?._id ?? ''}`, {});
    expect(res.status).toBe(409);
    expect(affectedIds(res.body)).toEqual([booking._id]);
  });
});

describe('conflict rule: removing chairs and services', () => {
  it('removing a chair lists its bookings; cancelling them also disables its login', async () => {
    const created = await asOwner('POST', '/api/admin/staff', {
      slug: 'temp-chair',
      name: 'Temp',
      role: 'barber',
      title: 'Barber',
      specialty: '',
      bio: '',
      chairNumber: 9,
      serviceIds: [cut],
      photoUrl: null,
      instagramHandle: null,
      sortOrder: 99,
      acceptsOnlineBooking: true,
      showOnWebsite: true,
    });
    expect(created.status).toBe(201);
    const id = (created.body as { staff: { id: string } }).staff.id;
    await asOwner('PUT', `/api/admin/staff/${id}/hours`, { days: shopHoursSeed });
    const login = await createLogin({ role: 'barber', staffId: id });
    const cookie = await sessionCookie(login._id);
    const booking = await seedBooking(id, '10:00');
    const res = await asOwner('DELETE', `/api/admin/staff/${id}`, {});
    expect(res.status).toBe(409);
    expect(affectedIds(res.body)).toEqual([booking._id]);
    expect((await staffRepo.findStaffById(id))?.deletedAt).toBeNull();
    const ok = await asOwner('DELETE', `/api/admin/staff/${id}`, {
      resolutions: [{ bookingId: booking._id, action: 'cancelAndNotify' }],
    });
    expect(ok.body).toEqual({ ok: true, kept: [], moved: [], cancelled: [booking._id] });
    expect((await staffRepo.findStaffById(id))?.deletedAt).not.toBeNull();
    expect((await usersRepo.findUserById(login._id))?.isActive).toBe(false);
    expect(
      (await call(server.baseUrl, 'GET', '/api/me/schedule', { headers: { cookie } })).status,
    ).toBe(401);
  });

  it('removing a service lists upcoming bookings that include it, even inside working time', async () => {
    const created = await asOwner('POST', '/api/admin/services', {
      name: 'Temporary Special',
      group: 'Barber',
      description: '',
      priceCents: 1000,
      priceFrom: false,
      durationMinutes: 30,
      bufferMinutes: null,
      sortOrder: 99,
      isActive: true,
    });
    const serviceId = (created.body as { service: { id: string } }).service.id;
    const withIt = await seedBooking(marcus, '10:00', { serviceId });
    await seedBooking(marcus, '11:00');
    const res = await asOwner('DELETE', `/api/admin/services/${serviceId}`, {});
    expect(res.status).toBe(409);
    expect(affectedIds(res.body)).toEqual([withIt._id]);
    const ok = await asOwner('DELETE', `/api/admin/services/${serviceId}`, {
      resolutions: [{ bookingId: withIt._id, action: 'keep' }],
    });
    expect(ok.body).toEqual({ ok: true, kept: [withIt._id], moved: [], cancelled: [] });
    expect((await servicesRepo.findServiceById(serviceId))?.deletedAt).not.toBeNull();
  });

  it("dropping a service from a chair lists that chair's bookings for it", async () => {
    const booking = await seedBooking(marcus, '10:00');
    const staff = await staffRepo.findStaffById(marcus);
    const without = (staff?.serviceIds ?? []).filter((s) => s !== cut);
    const res = await asOwner('PATCH', `/api/admin/staff/${marcus}`, { serviceIds: without });
    expect(res.status).toBe(409);
    expect(affectedIds(res.body)).toEqual([booking._id]);
    const ok = await asOwner('PATCH', `/api/admin/staff/${marcus}`, {
      serviceIds: without,
      resolutions: [{ bookingId: booking._id, action: 'keep' }],
    });
    expect(ok.status).toBe(200);
    await asOwner('PATCH', `/api/admin/staff/${marcus}`, { serviceIds: staff?.serviceIds ?? [] });
  });
});

describe('schedule guards', () => {
  it('bookings and schedule changes both bump the chair guard', async () => {
    const before = await scheduleGuardsRepo.getScheduleGuardVersion(marcus);
    await asOwner('PUT', `/api/admin/staff/${marcus}/hours`, { days: shopHoursSeed });
    const afterChange = await scheduleGuardsRepo.getScheduleGuardVersion(marcus);
    expect(afterChange).toBe(before + 1);
    const { bookPublic } = await import('../helpers/bookingApi');
    await bookPublic(server.baseUrl, {
      staff: 'marcus',
      serviceIds: [cut],
      startAt: slotAt(THU, '15:00'),
    });
    expect(await scheduleGuardsRepo.getScheduleGuardVersion(marcus)).toBe(afterChange + 1);
  });

  it('race: a schedule change and bookings on the same chair never strand a booking silently', async () => {
    const { bookPublic } = await import('../helpers/bookingApi');
    const { isWithinWorkingTime } = await import('../../server/services/availability');
    const { loadScheduleData } = await import('../../server/services/scheduleData');
    const times = ['14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30'];
    const results = await Promise.allSettled([
      asOwner('PUT', `/api/admin/staff/${marcus}/hours`, {
        days: thuOnly([{ start: '09:00', end: '13:00' }]),
      }),
      ...times.map((t) =>
        bookPublic(server.baseUrl, { staff: 'marcus', serviceIds: [cut], startAt: slotAt(THU, t) }),
      ),
    ]);
    const change = results[0];
    expect(change.status).toBe('fulfilled');
    const changeStatus = change.status === 'fulfilled' ? change.value.status : 0;
    expect([200, 409]).toContain(changeStatus);
    const data = await loadScheduleData(THU, THU);
    const staff = data.staff.find((x) => x._id === marcus);
    const confirmed = await bookingsRepo.listBookingsBetween(
      { start: new Date(slotAt(THU, '00:00')), end: new Date(slotAt(THU, '23:59')) },
      { staffId: marcus, statuses: ['confirmed'] },
    );
    // Either the change won (no afternoon bookings exist) or bookings won (the change was refused).
    for (const booking of confirmed)
      expect(isWithinWorkingTime(booking, staff, data.source)).toBe(true);
    if (changeStatus === 200) expect(confirmed).toEqual([]);
  });
});
