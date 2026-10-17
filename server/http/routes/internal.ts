import { z } from 'zod';
import { getPartialEnv } from '../../env';
import { logger } from '../../lib/logger';
import { deliverPendingOutbox } from '../../notifications/deliver';
import { pruneBackups, runBackup } from '../../services/backup';
import { bootstrap } from '../../services/bootstrap';
import { runDoctor } from '../../services/doctor';
import { parseBody } from '../request';
import { purgeDeletedPhotos, sweepAbandonedUploads } from '../../services/photosService';
import { storageEnabled } from '../../storage';
import type { RouteDefinition, RouteHandler } from '../types';

const STORAGE_STEPS = ['photosPurged', 'uploadsSwept', 'backup', 'backupsPruned'] as const;

/** Vercel Cron calls with GET; operators may POST. Both need the CRON_SECRET bearer token. */
const deliver: RouteHandler = async (ctx) => {
  const summary = await deliverPendingOutbox({ now: ctx.now });
  const photosPurged = await purgeDeletedPhotos(ctx.now);
  const uploadsSwept = await sweepAbandonedUploads(ctx.now);
  return {
    body: { ...summary, photosPurged, uploadsSwept },
    headers: { 'Cache-Control': 'no-store' },
  };
};

/**
 * The one daily job (Vercel Hobby allows one run a day): email backstop, photo
 * cleanup, backup. Without photo storage only the outbox runs; the rest is
 * reported as skipped so the log says why there is no backup.
 */
const daily: RouteHandler = async (ctx) => {
  const outbox = await deliverPendingOutbox({ now: ctx.now });
  if (!storageEnabled()) {
    logger.warn('daily job: photo purge, upload sweep and backup skipped', {
      reason: 'STORAGE_DRIVER is none',
    });
    return {
      body: {
        outbox,
        photosPurged: 0,
        uploadsSwept: 0,
        backup: null,
        backupsPruned: 0,
        skipped: [...STORAGE_STEPS],
      },
      headers: { 'Cache-Control': 'no-store' },
    };
  }
  const photosPurged = await purgeDeletedPhotos(ctx.now);
  const uploadsSwept = await sweepAbandonedUploads(ctx.now);
  const backup = await runBackup(ctx.now);
  const backupsPruned = await pruneBackups(ctx.now);
  return {
    body: {
      outbox,
      photosPurged,
      uploadsSwept,
      backup: {
        date: backup.date,
        documents: backup.collections.reduce((n, c) => n + c.count, 0),
        bytes: backup.collections.reduce((n, c) => n + c.bytes, 0),
      },
      backupsPruned,
      skipped: [],
    },
    headers: { 'Cache-Control': 'no-store' },
  };
};

const bootstrapBodySchema = z.object({ force: z.boolean().default(false) });

export const internalRoutes: RouteDefinition[] = [
  { method: 'GET', path: '/api/internal/outbox/deliver', auth: 'internal', handler: deliver },
  { method: 'POST', path: '/api/internal/outbox/deliver', auth: 'internal', handler: deliver },
  { method: 'GET', path: '/api/internal/cron/daily', auth: 'internal', handler: daily },
  { method: 'POST', path: '/api/internal/cron/daily', auth: 'internal', handler: daily },
  {
    // The checklist for a deployment. Takes CRON_SECRET or BOOTSTRAP_SECRET; answers while settings are missing.
    method: 'GET',
    path: '/api/internal/doctor',
    auth: 'internal',
    bootstrap: true,
    alwaysOn: true,
    handler: async (ctx) => ({
      body: await runDoctor({ now: ctx.now }),
      headers: { 'Cache-Control': 'no-store' },
    }),
  },
  {
    // First setup from the browser: indexes, seed, the owner login. 404 while BOOTSTRAP_SECRET is unset.
    method: 'POST',
    path: '/api/internal/bootstrap',
    auth: 'internal',
    bootstrap: true,
    alwaysOn: true,
    handler: async (ctx) => {
      const { force } = await parseBody(ctx, bootstrapBodySchema);
      const result = await bootstrap({ force, requestId: ctx.requestId }, ctx.now);
      return { status: 201, body: result, headers: { 'Cache-Control': 'no-store' } };
    },
  },
  {
    // Lets the /setup page know whether setup exists at all. No secrets, no values.
    // Reads the partial environment so the page still works while a variable is missing.
    method: 'GET',
    path: '/api/setup',
    auth: 'public',
    alwaysOn: true,
    handler: () =>
      Promise.resolve({
        body: { enabled: Boolean(getPartialEnv().BOOTSTRAP_SECRET) },
        headers: { 'Cache-Control': 'no-store' },
      }),
  },
];
