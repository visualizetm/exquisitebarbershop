import { deliverPendingOutbox } from '../../notifications/deliver';
import type { RouteDefinition, RouteHandler } from '../types';

/** Vercel Cron calls with GET; operators may POST. Both need the CRON_SECRET bearer token. */
const deliver: RouteHandler = async (ctx) => {
  const summary = await deliverPendingOutbox({ now: ctx.now });
  return { body: summary, headers: { 'Cache-Control': 'no-store' } };
};

export const internalRoutes: RouteDefinition[] = [
  { method: 'GET', path: '/api/internal/outbox/deliver', auth: 'internal', handler: deliver },
  { method: 'POST', path: '/api/internal/outbox/deliver', auth: 'internal', handler: deliver },
];
