import {
  cancelBookingRequestSchema,
  createBookingRequestSchema,
  createBookingResponseSchema,
  manageBookingResponseSchema,
  manageTokenQuerySchema,
  rescheduleBookingRequestSchema,
  rescheduleBookingResponseSchema,
} from '../../../shared/api/bookings';
import { getEnv } from '../../env';
import { runAfterResponse } from '../../lib/afterResponse';
import { AppError } from '../../lib/errors';
import { deliverOutboxIds } from '../../notifications/deliver';
import {
  cancelViaToken,
  createBooking,
  enforceManageRateLimit,
  getManagedBooking,
  rescheduleViaToken,
} from '../../services/bookingService';
import { clientIp, headerValue, parseBody, parseQuery } from '../request';
import type { RouteDefinition } from '../types';

/** Emails go out right after the response unless tests asked to drive delivery by hand. */
function scheduleDelivery(outboxIds: string[]): void {
  if (outboxIds.length === 0 || getEnv().OUTBOX_AFTER_RESPONSE === 'off') return;
  runAfterResponse('outbox.deliver', () => deliverOutboxIds(outboxIds));
}

const NO_STORE = { 'Cache-Control': 'no-store' };

export const bookingRoutes: RouteDefinition[] = [
  {
    method: 'POST',
    path: '/api/bookings',
    auth: 'public',
    handler: async (ctx) => {
      const idempotencyKey = headerValue(ctx.req, 'idempotency-key');
      if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128) {
        throw new AppError(
          'BAD_REQUEST',
          'An Idempotency-Key header of 8 to 128 characters is required',
        );
      }
      const input = await parseBody(ctx, createBookingRequestSchema);
      const outcome = await createBooking(input, {
        ip: clientIp(ctx.req),
        requestId: ctx.requestId,
        now: ctx.now,
        idempotencyKey,
      });
      scheduleDelivery(outcome.outboxIds);
      return {
        status: outcome.status,
        body: createBookingResponseSchema.parse(outcome.body),
        headers: { ...NO_STORE, 'Idempotent-Replayed': outcome.replayed ? 'true' : 'false' },
      };
    },
  },
  {
    method: 'GET',
    path: '/api/bookings/manage',
    auth: 'public',
    handler: async (ctx) => {
      await enforceManageRateLimit(clientIp(ctx.req), ctx.now);
      const { token } = parseQuery(ctx, manageTokenQuerySchema);
      const body = manageBookingResponseSchema.parse(await getManagedBooking(token, ctx.now));
      return { body, headers: NO_STORE };
    },
  },
  {
    method: 'POST',
    path: '/api/bookings/manage/cancel',
    auth: 'public',
    handler: async (ctx) => {
      await enforceManageRateLimit(clientIp(ctx.req), ctx.now);
      const input = await parseBody(ctx, cancelBookingRequestSchema);
      const outcome = await cancelViaToken(input, {
        ip: clientIp(ctx.req),
        requestId: ctx.requestId,
        now: ctx.now,
      });
      scheduleDelivery(outcome.outboxIds);
      return {
        status: outcome.status,
        body: manageBookingResponseSchema.parse(outcome.body),
        headers: NO_STORE,
      };
    },
  },
  {
    method: 'POST',
    path: '/api/bookings/manage/reschedule',
    auth: 'public',
    handler: async (ctx) => {
      await enforceManageRateLimit(clientIp(ctx.req), ctx.now);
      const input = await parseBody(ctx, rescheduleBookingRequestSchema);
      const outcome = await rescheduleViaToken(input, {
        ip: clientIp(ctx.req),
        requestId: ctx.requestId,
        now: ctx.now,
      });
      scheduleDelivery(outcome.outboxIds);
      return {
        status: outcome.status,
        body: rescheduleBookingResponseSchema.parse(outcome.body),
        headers: NO_STORE,
      };
    },
  },
];
