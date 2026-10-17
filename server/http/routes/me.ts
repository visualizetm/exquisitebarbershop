import { z } from 'zod';
import {
  bookingDetailResponseSchema,
  bookingResponseSchema,
  conflictOnlyResponseSchema,
  myScheduleQuerySchema,
  myScheduleResponseSchema,
  ownTimeBlockRequestSchema,
  resolutionsBodySchema,
  statusChangeRequestSchema,
  timeBlockResponseSchema,
} from '../../../shared/api/admin';
import { idSchema } from '../../../shared/schemas/common';
import { chairScope } from '../../services/access';
import { bookingDetail, changeBookingStatus, mySchedule } from '../../services/adminBookings';
import { createTimeBlock, deleteTimeBlock } from '../../services/adminSchedule';
import { metaOf, NO_STORE, principalOf } from '../context';
import { scheduleDelivery } from '../delivery';
import { parseBody, parseParams, parseQuery } from '../request';
import type { RequestContext, RouteDefinition } from '../types';

const idParams = z.object({ id: idSchema });

/**
 * The barber API. Every handler works in the caller's chair scope, which the
 * service layer checks against each record. Another chair's ids answer
 * NOT_FOUND, exactly like ids that do not exist.
 */
function own(ctx: RequestContext) {
  const principal = principalOf(ctx);
  return { principal, scope: chairScope(principal) };
}

export const meRoutes: RouteDefinition[] = [
  {
    method: 'GET',
    path: '/api/me/schedule',
    auth: 'barber',
    handler: async (ctx) => {
      const { scope } = own(ctx);
      const query = parseQuery(ctx, myScheduleQuerySchema);
      return {
        body: myScheduleResponseSchema.parse(await mySchedule(scope, query, ctx.now)),
        headers: NO_STORE,
      };
    },
  },
  {
    method: 'GET',
    path: '/api/me/bookings/:id',
    auth: 'barber',
    handler: async (ctx) => {
      const { principal, scope } = own(ctx);
      const { id } = parseParams(ctx, idParams);
      return {
        body: bookingDetailResponseSchema.parse(await bookingDetail(principal, scope, id, ctx.now)),
        headers: NO_STORE,
      };
    },
  },
  {
    method: 'POST',
    path: '/api/me/bookings/:id/status',
    auth: 'barber',
    handler: async (ctx) => {
      const { principal, scope } = own(ctx);
      const { id } = parseParams(ctx, idParams);
      const input = await parseBody(ctx, statusChangeRequestSchema);
      const done = await changeBookingStatus(principal, scope, id, input, metaOf(ctx));
      scheduleDelivery(done.outboxIds);
      return { body: bookingResponseSchema.parse(done.body) };
    },
  },
  {
    method: 'POST',
    path: '/api/me/time-blocks',
    auth: 'barber',
    handler: async (ctx) => {
      const { principal, scope } = own(ctx);
      const input = await parseBody(ctx, ownTimeBlockRequestSchema);
      const done = await createTimeBlock(
        principal,
        scope,
        { ...input, staffId: scope.staffId },
        metaOf(ctx),
      );
      return { status: 201, body: timeBlockResponseSchema.parse(done.body) };
    },
  },
  {
    method: 'DELETE',
    path: '/api/me/time-blocks/:id',
    auth: 'barber',
    handler: async (ctx) => {
      const { principal, scope } = own(ctx);
      const { id } = parseParams(ctx, idParams);
      const { resolutions } = await parseBody(ctx, resolutionsBodySchema);
      const done = await deleteTimeBlock(principal, scope, id, resolutions, metaOf(ctx));
      return { body: conflictOnlyResponseSchema.parse(done.body) };
    },
  },
];
