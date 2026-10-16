import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { withTransaction } from '../../server/db/transaction';
import { newId } from '../../server/lib/ids';
import type {
  NotificationChannel,
  RenderedMessage,
  SendResult,
} from '../../server/notifications/channel';
import { deliverOutboxIds, deliverPendingOutbox } from '../../server/notifications/deliver';
import { LogEmailChannel } from '../../server/notifications/email/logChannel';
import { ResendEmailChannel } from '../../server/notifications/email/resendChannel';
import { setChannel } from '../../server/notifications/registry';
import { bookingsRepo, emailOutboxRepo, shopSettingsRepo, slotLocksRepo } from '../../server/repos';
import { enqueueBookingNotifications } from '../../server/services/bookingNotifications';
import { toBookingView } from '../../server/services/bookingView';
import { runSeed } from '../../server/services/seedService';
import { staffSeedId } from '../../seed/shop';
import { NOW, useTestDb } from '../helpers/db';
import { call, startTestServer, type TestServer } from '../helpers/bookingApi';
import { bookingInput } from '../helpers/fixtures';

const CRON = 'cron-secret-0123456789abcdef0123456789';
process.env.CRON_SECRET = CRON;
process.env.OUTBOX_AFTER_RESPONSE = 'off';
const { db } = useTestDb();
let server: TestServer;

beforeAll(async () => {
  await runSeed(db(), NOW);
  server = await startTestServer();
});
afterAll(async () => {
  await server.close();
  setChannel('email', null);
});
beforeEach(async () => {
  await db().collection('emailOutbox').deleteMany({});
  setChannel('email', null);
});

const staffStub = { _id: staffSeedId('dee'), name: 'Dee', slug: 'dee' };

async function enqueueFor(
  event: 'confirmed' | 'cancelled',
  email: string | null = 'sam@example.com',
) {
  const settings = await shopSettingsRepo.requireShopSettings();
  return withTransaction(async (session) => {
    const booking = await bookingsRepo.insertBooking(
      bookingInput({
        staffId: staffStub._id,
        customer: { name: 'Sam', phone: '+12155550123', email },
      }),
      NOW,
      { session },
    );
    const ids = await enqueueBookingNotifications(
      {
        event,
        view: toBookingView(booking, staffStub),
        settings,
        managePath: '/manage?token=x',
        previousStartAt: null,
        cancelReason: null,
      },
      NOW,
      session,
    );
    return { booking, ids };
  });
}

describe('outbox', () => {
  it('rows are written in the booking transaction and vanish when it rolls back', async () => {
    const settings = await shopSettingsRepo.requireShopSettings();
    await expect(
      withTransaction(async (session) => {
        const booking = await bookingsRepo.insertBooking(
          bookingInput({ staffId: staffStub._id }),
          NOW,
          { session },
        );
        await enqueueBookingNotifications(
          {
            event: 'confirmed',
            view: toBookingView(booking, staffStub),
            settings,
            managePath: null,
            previousStartAt: null,
            cancelReason: null,
          },
          NOW,
          session,
        );
        // A lock conflict on a block that is already held aborts everything.
        await slotLocksRepo.acquireSlotLocks(
          staffStub._id,
          { start: booking.startAt, end: booking.endAt },
          { holderType: 'booking', holderId: booking._id },
          NOW,
          { session },
        );
        await slotLocksRepo.acquireSlotLocks(
          staffStub._id,
          { start: booking.startAt, end: booking.endAt },
          { holderType: 'booking', holderId: newId() },
          NOW,
          { session },
        );
      }),
    ).rejects.toMatchObject({ code: 'SLOT_TAKEN' });
    expect(await db().collection('emailOutbox').countDocuments()).toBe(0);
  });

  it('dedupe keys stop a second copy of the same event', async () => {
    const { booking, ids } = await enqueueFor('confirmed');
    expect(ids).toHaveLength(2);
    const settings = await shopSettingsRepo.requireShopSettings();
    const again = await withTransaction((session) =>
      enqueueBookingNotifications(
        {
          event: 'confirmed',
          view: toBookingView(booking, staffStub),
          settings,
          managePath: null,
          previousStartAt: null,
          cancelReason: null,
        },
        NOW,
        session,
      ),
    );
    expect(again).toEqual([]);
    expect(await emailOutboxRepo.listOutboxForBooking(booking._id)).toHaveLength(2);
  });

  it('delivery is idempotent: running it twice sends each message once, with the ics attached', async () => {
    const log = new LogEmailChannel();
    setChannel('email', log);
    const { ids } = await enqueueFor('confirmed');
    const first = await deliverOutboxIds(ids);
    const second = await deliverOutboxIds(ids);
    expect(first).toEqual({ sent: 2, failed: 0, remaining: 0 });
    expect(second).toEqual({ sent: 0, failed: 0, remaining: 0 });
    expect(log.sent).toHaveLength(2);
    expect(log.sent.map((m) => m.to).sort()).toEqual([
      'owner@exquisitebarberbeauty.com',
      'sam@example.com',
    ]);
    expect(log.sent.every((m) => m.attachments[0]?.content.includes('BEGIN:VCALENDAR'))).toBe(true);
    const rows = await emailOutboxRepo.listOutboxByStatus('sent');
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.attempts === 1)).toBe(true);
    expect(await deliverPendingOutbox()).toEqual({ sent: 0, failed: 0, remaining: 0 });
  });

  it('retryable failures back off and park after maxAttempts; non-retryable park at once', async () => {
    const failing: NotificationChannel = {
      channel: 'email',
      send: (): Promise<SendResult> =>
        Promise.resolve({ ok: false, error: 'provider down', retryable: true }),
    };
    setChannel('email', failing);
    const { ids } = await enqueueFor('confirmed', null);
    const id = ids[0] ?? '';
    await db()
      .collection('emailOutbox')
      .updateOne({ _id: id } as never, { $set: { maxAttempts: 2 } });
    const t0 = NOW;
    expect(await deliverOutboxIds([id], t0)).toEqual({ sent: 0, failed: 1, remaining: 0 });
    let row = await db()
      .collection<{
        _id: string;
        status: string;
        attempts: number;
        nextAttemptAt: Date;
        lastError: string;
      }>('emailOutbox')
      .findOne({ _id: id });
    expect(row?.status).toBe('pending');
    expect(row?.attempts).toBe(1);
    expect(row?.nextAttemptAt.getTime()).toBe(t0.getTime() + 2 * 60_000);
    expect(row?.lastError).toBe('provider down');
    // Not due yet.
    expect(await deliverPendingOutbox({ now: new Date(t0.getTime() + 60_000) })).toEqual({
      sent: 0,
      failed: 0,
      remaining: 0,
    });
    const t1 = new Date(t0.getTime() + 3 * 60_000);
    expect(await deliverPendingOutbox({ now: t1 })).toMatchObject({ failed: 1 });
    row = await db()
      .collection<{
        _id: string;
        status: string;
        attempts: number;
        nextAttemptAt: Date;
        lastError: string;
      }>('emailOutbox')
      .findOne({ _id: id });
    expect(row?.status).toBe('failed');
    expect(row?.attempts).toBe(2);

    const rejecting: NotificationChannel = {
      channel: 'email',
      send: (): Promise<SendResult> =>
        Promise.resolve({ ok: false, error: 'bad address', retryable: false }),
    };
    setChannel('email', rejecting);
    const second = await enqueueFor('cancelled', 'x@example.com');
    await deliverOutboxIds(second.ids, t0);
    const parked = await db()
      .collection<{ _id: string; status: string }>('emailOutbox')
      .findOne({ _id: second.ids[0] ?? '' });
    expect(parked?.status).toBe('failed');
  });

  it('a message stuck in sending is reclaimed once stale', async () => {
    const log = new LogEmailChannel();
    setChannel('email', log);
    const { ids } = await enqueueFor('confirmed', null);
    await db()
      .collection('emailOutbox')
      .updateOne({ _id: ids[0] } as never, {
        $set: { status: 'sending', updatedAt: new Date(NOW.getTime() - 11 * 60_000) },
      });
    expect(await deliverPendingOutbox({ now: NOW })).toMatchObject({ sent: 1 });
  });

  it('a malformed payload is parked as failed rather than retried forever', async () => {
    setChannel('email', new LogEmailChannel());
    const row = await emailOutboxRepo.enqueueOutboxMessage(
      {
        channel: 'email',
        to: 'x@example.com',
        template: 'bookingConfirmed',
        payload: { nothing: true },
        dedupeKey: null,
        bookingId: null,
      },
      NOW,
    );
    expect(await deliverOutboxIds([row?._id ?? ''], NOW)).toEqual({
      sent: 0,
      failed: 1,
      remaining: 0,
    });
    const parked = await db()
      .collection<{ _id: string; status: string }>('emailOutbox')
      .findOne({ _id: row?._id ?? '' });
    expect(parked?.status).toBe('failed');
  });

  it('the Resend channel maps provider responses to results', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const make = (status: number, bodyText: string) =>
      new ResendEmailChannel({
        apiKey: 'k',
        from: 'Shop <b@example.com>',
        fetchImpl: (url, init) => {
          calls.push({
            url: typeof url === 'string' ? url : url instanceof URL ? url.href : url.url,
            init: init ?? {},
          });
          return Promise.resolve(
            new Response(bodyText, { status, headers: { 'content-type': 'application/json' } }),
          );
        },
      });
    const message: RenderedMessage = {
      channel: 'email',
      to: 'x@example.com',
      subject: 'S',
      text: 'T',
      html: '<p>T</p>',
      attachments: [
        { filename: 'a.ics', contentType: 'text/calendar', content: 'BEGIN:VCALENDAR' },
      ],
      idempotencyKey: 'k1',
    };
    expect(await make(200, '{"id":"re_123"}').send(message)).toEqual({
      ok: true,
      providerId: 're_123',
    });
    expect(await make(500, 'boom').send(message)).toMatchObject({ ok: false, retryable: true });
    expect(await make(422, 'bad').send(message)).toMatchObject({ ok: false, retryable: false });
    const sent = JSON.parse(calls[0]?.init.body as string) as {
      attachments: { content: string }[];
      to: string[];
    };
    expect(sent.to).toEqual(['x@example.com']);
    expect(Buffer.from(sent.attachments[0]?.content ?? '', 'base64').toString()).toBe(
      'BEGIN:VCALENDAR',
    );
    expect((calls[0]?.init.headers as Record<string, string>)['Idempotency-Key']).toBe('k1');
    const network = new ResendEmailChannel({
      apiKey: 'k',
      from: 'a@b.c',
      fetchImpl: () => Promise.reject(new Error('offline')),
    });
    expect(await network.send(message)).toMatchObject({
      ok: false,
      retryable: true,
      error: 'offline',
    });
  });

  it('the internal delivery route needs the cron secret and drains pending messages', async () => {
    setChannel('email', new LogEmailChannel());
    await enqueueFor('confirmed');
    const denied = await call(server.baseUrl, 'GET', '/api/internal/outbox/deliver');
    expect(denied.status).toBe(403);
    const wrong = await call(server.baseUrl, 'GET', '/api/internal/outbox/deliver', {
      headers: { authorization: `Bearer ${'x'.repeat(CRON.length)}` },
    });
    expect(wrong.status).toBe(403);
    const ok = await call(server.baseUrl, 'POST', '/api/internal/outbox/deliver', {
      headers: { authorization: `Bearer ${CRON}` },
    });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ sent: 2, failed: 0, remaining: 0 });
  });

  it('bookings made through the API deliver after the response when enabled', async () => {
    const log = new LogEmailChannel();
    setChannel('email', log);
    process.env.OUTBOX_AFTER_RESPONSE = 'on';
    const { resetEnvCache } = await import('../../server/env');
    resetEnvCache();
    try {
      const { nextDate, slotAt, idemKey, phone } = await import('../helpers/bookingApi');
      const { serviceSeedId } = await import('../../seed/shop');
      const res = await call(server.baseUrl, 'POST', '/api/bookings', {
        headers: { 'idempotency-key': idemKey() },
        body: {
          serviceIds: [serviceSeedId('classic-cut')],
          staff: 'jay',
          startAt: slotAt(nextDate(5, 3), '10:00'),
          customer: { name: 'After', phone: phone(), email: 'after@example.com' },
        },
      });
      expect(res.status).toBe(201);
      const deadline = Date.now() + 5000;
      while (log.sent.length < 2 && Date.now() < deadline)
        await new Promise((r) => setTimeout(r, 50));
      expect(log.sent.map((m) => m.to).sort()).toEqual([
        'after@example.com',
        'owner@exquisitebarberbeauty.com',
      ]);
    } finally {
      process.env.OUTBOX_AFTER_RESPONSE = 'off';
      resetEnvCache();
    }
  });
});
