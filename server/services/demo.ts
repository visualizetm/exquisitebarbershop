import { randomUUID } from 'node:crypto';
import type { Db } from 'mongodb';
import { DEMO_PIN } from '../../shared/lib/pin';
import { shopDateOf, shopDayStart, toShopTime } from '../../shared/lib/time';
import type { Actor } from '../../shared/schemas/timeBlock';
import { serviceSeedId, staffSeedId, type staffSeed } from '../../seed/shop';
import { getDb } from '../db/client';
import { COLLECTIONS } from '../db/indexes';
import { getPartialEnv } from '../env';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { hashPin } from '../auth/pin';
import {
  photosRepo,
  setupTokensRepo,
  shopSettingsRepo,
  staffPinsRepo,
  staffRepo,
  systemStateRepo,
  usersRepo,
} from '../repos';
import { dropMedia } from '../storage/mongo';
import { getStorage, storageEnabled } from '../storage';
import { computeAvailability, workingRangesFor } from './availability';
import { loadAvailabilityContext } from './availabilityData';
import { createBooking, createManualBooking } from './bookingService';

const SYSTEM: Actor = { type: 'system', userId: null, staffId: null };

/** How long a seeding lock holds before a crashed cold start's lock may be taken over. */
export const DEMO_LOCK_STALE_MS = 60_000;
/** How long a request waits for another cold start that is seeding. */
const WAIT_FOR_SEED_MS = 25_000;
const POLL_MS = 250;
/** The "ready" answer is trusted this long before the database is asked again. */
const READY_TTL_MS = 60_000;

export function demoEnabled(): boolean {
  return getPartialEnv().DEMO_MODE === 'true';
}

export function assertDemoEnabled(): void {
  if (!demoEnabled()) throw new AppError('NOT_FOUND', 'No such endpoint');
}

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

/** Obviously fictional customers, with phone numbers in the 555-01XX block that is never assigned. */
const SAMPLE_CUSTOMERS = [
  { name: 'Pat Placeholder', phone: '+12155550101' },
  { name: 'Sam Sample', phone: '+12155550102' },
  { name: 'Terry Testcase', phone: '+12155550103' },
  { name: 'Jamie Demo', phone: '+12155550104' },
  { name: 'Alex Example', phone: '+12155550105' },
  { name: 'Riley Fictional', phone: '+12155550106' },
  { name: 'Casey Mockup', phone: '+12155550107' },
  { name: 'Morgan Makebelieve', phone: '+12155550108' },
  { name: 'Quinn Notreal', phone: '+12155550109' },
] as const;

interface SamplePlan {
  chair: (typeof staffSeed)[number]['key'];
  service: string;
  /** Days from today. */
  day: number;
  /** Preferred hour of day (shop time); the closest open slot at or after it is used. */
  hour: number;
  source: 'online' | 'phone' | 'walkIn';
  customer: number;
}

const PLAN: readonly SamplePlan[] = [
  { chair: 'lee', service: 'haircut', day: 0, hour: 15, source: 'online', customer: 0 },
  { chair: 'drew', service: 'cut-beard', day: 0, hour: 16, source: 'online', customer: 1 },
  { chair: 'dontrise', service: 'cut-design', day: 0, hour: 14, source: 'phone', customer: 2 },
  { chair: 'nelly', service: 'steam-fade', day: 1, hour: 10, source: 'online', customer: 3 },
  { chair: 'lee', service: 'lineup', day: 1, hour: 13, source: 'online', customer: 4 },
  { chair: 'dontrise', service: 'kids-cut', day: 1, hour: 15, source: 'phone', customer: 5 },
  { chair: 'drew', service: 'haircut', day: 2, hour: 14, source: 'online', customer: 6 },
  { chair: 'nelly', service: 'haircut', day: 2, hour: 11, source: 'online', customer: 7 },
  { chair: 'dontrise', service: 'haircut', day: 3, hour: 12, source: 'online', customer: 8 },
  { chair: 'nelly', service: 'kids-cut', day: 0, hour: 0, source: 'walkIn', customer: 3 },
  { chair: 'lee', service: 'lineup', day: 0, hour: 0, source: 'walkIn', customer: 5 },
];

/** How many days ahead a sample looks for an open day. The seed hours close Mondays, and Drew's Sundays. */
const LOOKAHEAD_DAYS = 14;

/**
 * The start of a sample booking: the `plan.day`-th day this chair is open (0 is the first open
 * day, today included), at the open time closest after `plan.hour`. The availability is
 * loaded fresh for every sample, so a chair's earlier samples are already in the way.
 */
async function openStart(plan: SamplePlan, now: Date): Promise<Date | null> {
  const today = shopDateOf(now);
  const toDate = shopDayStart(today).plus({ days: LOOKAHEAD_DAYS }).toISODate() ?? today;
  const staffId = staffSeedId(plan.chair);
  const ctx = await loadAvailabilityContext({
    fromDate: today,
    toDate,
    serviceIds: [serviceSeedId(plan.service)],
    now,
  });
  const result = computeAvailability({ fromDate: today, toDate, staff: staffId }, ctx);
  const openDays = result.days
    .map((d) => d.slots.filter((slot) => slot.staffId === staffId && slot.startAt >= now))
    .filter((slots) => slots.length > 0);
  const slots = openDays[plan.day] ?? openDays[openDays.length - 1];
  if (!slots) return null;
  return (
    (slots.find((slot) => toShopTime(slot.startAt).hour >= plan.hour) ?? slots[0])?.startAt ?? null
  );
}

/** True when the chair is working right now, so a walk-in sample does not land in the dead of night. */
async function workingNow(chair: string, now: Date): Promise<boolean> {
  const today = shopDateOf(now);
  const ctx = await loadAvailabilityContext({
    fromDate: today,
    toDate: today,
    serviceIds: [serviceSeedId('haircut')],
    now,
  });
  const { ranges } = workingRangesFor(staffSeedId(chair), today, ctx);
  return ranges.some((r) => r.start <= now && now < r.end);
}

/**
 * A handful of bookings and walk-ins so Today and Schedule look alive. They go through
 * the real booking code, so every sample holds its slot locks like a real booking.
 * One that cannot be placed (the shop is closed that day) is skipped, never fatal.
 */
export async function seedSampleBookings(now: Date): Promise<number> {
  let placed = 0;
  for (const [index, plan] of PLAN.entries()) {
    try {
      const customer = SAMPLE_CUSTOMERS[plan.customer];
      if (!customer) continue;
      const base = {
        serviceIds: [serviceSeedId(plan.service)],
        staff: staffSeedId(plan.chair),
        customer: { name: customer.name, phone: customer.phone, email: null },
      };
      const meta = {
        ip: 'demo-seed',
        requestId: `demo-seed-${String(index)}`,
        now,
        idempotencyKey: `demo-seed-${randomUUID()}`,
        limits: { ipPer10Minutes: 1000, phonePerDay: 1000 },
      };
      if (plan.source === 'walkIn') {
        if (!(await workingNow(plan.chair, now))) continue;
        await createManualBooking({ ...base, source: 'walkIn', override: false }, SYSTEM, meta);
      } else {
        const startAt = await openStart(plan, now);
        if (!startAt) continue;
        if (plan.source === 'online') {
          await createBooking({ ...base, startAt: startAt.toISOString() }, meta);
        } else {
          await createManualBooking(
            {
              ...base,
              source: 'phone',
              startAt: startAt.toISOString(),
              override: false,
              notifyCustomer: false,
            },
            SYSTEM,
            meta,
          );
        }
      }
      placed += 1;
    } catch (error) {
      logger.warn('demo sample booking skipped', {
        index,
        reason: error instanceof AppError ? error.code : 'unexpected',
      });
    }
  }
  return placed;
}

/**
 * Gives every barber the demo PIN, so the showcase's /team screen opens with one known number.
 * Only barbers without a PIN get one. Real shops never run this: it is reached in demo mode only.
 */
export async function seedDemoPins(now: Date): Promise<number> {
  let seeded = 0;
  for (const staff of await staffRepo.listStaff({})) {
    if (await staffPinsRepo.findPinByStaff(staff._id)) continue;
    await staffPinsRepo.upsertPin(staff._id, await hashPin(staff._id, DEMO_PIN), now);
    seeded += 1;
  }
  return seeded;
}

/**
 * A demo seeded before barber PINs existed has none. Give them out once: when no PIN and no setup
 * link exists at all. After the owner starts handing out real links, this never runs again.
 */
async function ensureDemoPins(now: Date): Promise<void> {
  if ((await staffPinsRepo.countPins()) > 0 || (await setupTokensRepo.countTokens()) > 0) return;
  await seedDemoPins(now);
}

// ---------------------------------------------------------------------------
// Wiping
// ---------------------------------------------------------------------------

/** Removes the objects behind every photo record, whatever the driver, before the records go. */
async function purgePhotoObjects(): Promise<void> {
  if (getPartialEnv().STORAGE_DRIVER === 'mongo') {
    await dropMedia();
    return;
  }
  if (!storageEnabled()) return;
  for (const photo of await photosRepo.listPhotos({})) {
    await getStorage()
      .delete(photo.key)
      .catch(() => undefined);
  }
}

/** Empties the business collections. `keepOwner` leaves the owner login and its sessions, for a reset. */
async function wipe(db: Db, keepOwner: boolean): Promise<void> {
  await purgePhotoObjects();
  const owners = keepOwner ? await usersRepo.findOwnerUser() : null;
  for (const name of Object.values(COLLECTIONS)) {
    if (name === 'systemState') continue;
    if (keepOwner && name === 'users') {
      await db.collection(name).deleteMany({ role: { $ne: 'owner' } });
    } else if (keepOwner && name === 'sessions') {
      await db.collection(name).deleteMany({ userId: { $ne: owners?._id ?? '' } });
    } else {
      await db.collection(name).deleteMany({});
    }
  }
}

// ---------------------------------------------------------------------------
// Public operations
// ---------------------------------------------------------------------------

let readyUntil = 0;

/** Forgets that the demo was ready, so the next request checks the database again. */
export function resetDemoReadyCache(): void {
  readyUntil = 0;
}

async function seedWithLock(setup: (now: Date) => Promise<unknown>, now: Date): Promise<void> {
  const holder = randomUUID();
  const deadline = Date.now() + WAIT_FOR_SEED_MS;
  for (;;) {
    if (await shopSettingsRepo.getShopSettings()) return;
    if (await systemStateRepo.tryAcquireDemoLock(holder, new Date(), DEMO_LOCK_STALE_MS)) {
      try {
        // Another start may have finished between the check and the lock.
        if (!(await shopSettingsRepo.getShopSettings())) await setup(now);
        return;
      } finally {
        await systemStateRepo.releaseDemoLock(holder);
      }
    }
    if (Date.now() > deadline) {
      throw new AppError('CONFIG_ERROR', 'The demo is still setting itself up. Please retry.');
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

/**
 * The first request of a fresh demo deployment sets everything up: indexes, the
 * placeholder shop, an owner login and the sample bookings. A lock document keeps
 * two cold starts from seeding twice; the loser waits for the winner.
 * `setup` is the bootstrap function (passed in, so this file has no import cycle with it).
 */
export async function ensureDemoReady(
  setup: (now: Date) => Promise<unknown>,
  now: Date = new Date(),
): Promise<void> {
  if (!demoEnabled()) return;
  if (Date.now() < readyUntil) return;
  if (!(await shopSettingsRepo.getShopSettings())) await seedWithLock(setup, now);
  await ensureDemoPins(now);
  readyUntil = Date.now() + READY_TTL_MS;
}

/**
 * "Reset demo data": wipes the shop, photos and sample bookings and loads the seed
 * again from scratch, the photos in seed/photos included (bootstrap runs the seed photo
 * loader). The owner login (and its session) stays, so the person who
 * pressed the button is still signed in.
 */
export async function resetDemoData(
  setup: (now: Date) => Promise<unknown>,
  now: Date = new Date(),
): Promise<void> {
  assertDemoEnabled();
  const db = await getDb();
  const runs = (await systemStateRepo.getDemoRecord())?.runs ?? 0;
  await wipe(db, true);
  await systemStateRepo.clearDemoRecord();
  resetDemoReadyCache();
  // Clearing the marker is what makes setup load the sample bookings again; the count carries over.
  await setup(now);
  await systemStateRepo.recordDemoSeed(now, runs);
  resetDemoReadyCache();
}

/**
 * Leaves demo mode for a real launch: wipes every collection, including the logins, but
 * only on a database the demo itself marked. A real shop's data can never be cleared here.
 */
export async function clearDemoData(): Promise<{ cleared: true }> {
  if (!(await systemStateRepo.getDemoRecord())) {
    throw new AppError('CONFLICT', 'This database holds no demo data, so nothing was cleared.');
  }
  const db = await getDb();
  await wipe(db, false);
  await db.collection(COLLECTIONS.systemState).deleteMany({});
  resetDemoReadyCache();
  return { cleared: true };
}
