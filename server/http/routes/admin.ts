import { z } from 'zod';
import {
  auditListQuerySchema,
  auditListResponseSchema,
  bookingDetailResponseSchema,
  bookingListQuerySchema,
  bookingListResponseSchema,
  bookingTableQuerySchema,
  bookingTableResponseSchema,
  bookingNotesRequestSchema,
  bookingResponseSchema,
  closureListQuerySchema,
  closureListResponseSchema,
  closureResponseSchema,
  closureUpsertRequestSchema,
  conflictOnlyResponseSchema,
  customerQuerySchema,
  customerResponseSchema,
  dateQuerySchema,
  dayStatusRequestSchema,
  dayStatusResponseSchema,
  hoursRequestSchema,
  hoursResponseSchema,
  issuedPasswordResponseSchema,
  loginCreateRequestSchema,
  loginListResponseSchema,
  loginResponseSchema,
  manualBookingRequestSchema,
  manualBookingResponseSchema,
  outboxListQuerySchema,
  outboxListResponseSchema,
  overviewResponseSchema,
  ownerCancelRequestSchema,
  ownerRescheduleRequestSchema,
  resolutionsBodySchema,
  scheduleQuerySchema,
  searchQuerySchema,
  searchResponseSchema,
  scheduleResponseSchema,
  serviceCreateRequestSchema,
  serviceListResponseSchema,
  serviceResponseSchema,
  serviceUpdateRequestSchema,
  settingsRequestSchema,
  settingsResponseSchema,
  staffCreateRequestSchema,
  staffListResponseSchema,
  staffMutationResponseSchema,
  staffResponseSchema,
  staffSlugRequestSchema,
  staffUpdateRequestSchema,
  statusChangeRequestSchema,
  timeBlockCreateRequestSchema,
  timeBlockListQuerySchema,
  timeBlockListResponseSchema,
  timeBlockResponseSchema,
  todayResponseSchema,
  whoIsInResponseSchema,
} from '../../../shared/api/admin';
import { createBookingResponseSchema } from '../../../shared/api/bookings';
import { idSchema } from '../../../shared/schemas/common';
import { shopDateOf } from '../../../shared/lib/time';
import { createStaffLogin, resetLoginPassword, setLoginActive } from '../../auth/authService';
import { runAfterResponse } from '../../lib/afterResponse';
import { deliverOutboxIds } from '../../notifications/deliver';
import { ownerScope, actorOf } from '../../services/access';
import {
  bookingDetail,
  changeBookingStatus,
  customerByPhone,
  listBookings,
  ownerReschedule,
  resendConfirmation,
  scheduleForDay,
  todaySummary,
  updateBookingNotes,
  whoIsIn,
} from '../../services/adminBookings';
import {
  createService,
  createStaff,
  deleteService,
  deleteStaff,
  getSettings,
  listAudit,
  listLogins,
  listOutbox,
  listServices,
  listStaff,
  putSettings,
  renameStaffSlug,
  retryOutboxMessage,
  staffMap,
  toLoginView,
  updateService,
  updateStaff,
} from '../../services/adminCatalog';
import {
  createTimeBlock,
  deleteClosure,
  deleteTimeBlock,
  getAllHours,
  listClosures,
  listTimeBlocks,
  setDayStatus,
  setShopHours,
  setStaffHours,
  upsertClosure,
} from '../../services/adminSchedule';
import { bookingTable, overview } from '../../services/adminDashboard';
import { adminSearch } from '../../services/adminSearch';
import { createManualBooking } from '../../services/bookingService';
import { idempotencyKeyOf, metaOf, NO_STORE, principalOf } from '../context';
import { scheduleDelivery } from '../delivery';
import { parseBody, parseParams, parseQuery } from '../request';
import type { RequestContext, RouteDefinition, RouteHandler } from '../types';

const idParams = z.object({ id: idSchema });

/**
 * Every route here is owner only. The router checks the role, and each handler
 * asks the service layer for the owner scope again, so a route that was ever
 * registered with the wrong level would still refuse a barber.
 */
function owner(
  method: RouteDefinition['method'],
  path: string,
  handler: RouteHandler,
): RouteDefinition {
  return { method, path, auth: 'owner', handler };
}

function ctxScope(ctx: RequestContext) {
  const principal = principalOf(ctx);
  return { principal, scope: ownerScope(principal) };
}

export const adminRoutes: RouteDefinition[] = [
  // Today, schedule, who is in --------------------------------------------
  owner('GET', '/api/admin/today', async (ctx) => {
    ctxScope(ctx);
    const { date } = parseQuery(ctx, dateQuerySchema);
    return {
      body: todayResponseSchema.parse(await todaySummary(date, ctx.now)),
      headers: NO_STORE,
    };
  }),
  owner('GET', '/api/admin/schedule', async (ctx) => {
    const { scope } = ctxScope(ctx);
    const query = parseQuery(ctx, scheduleQuerySchema);
    return {
      body: scheduleResponseSchema.parse(await scheduleForDay(scope, query, ctx.now)),
      headers: NO_STORE,
    };
  }),
  owner('GET', '/api/admin/whos-in', async (ctx) => {
    ctxScope(ctx);
    const { date } = parseQuery(ctx, dateQuerySchema);
    return { body: whoIsInResponseSchema.parse(await whoIsIn(date, ctx.now)), headers: NO_STORE };
  }),

  // Overview and the bookings table -----------------------------------------
  owner('GET', '/api/admin/overview', async (ctx) => {
    ctxScope(ctx);
    return { body: overviewResponseSchema.parse(await overview(ctx.now)), headers: NO_STORE };
  }),
  owner('GET', '/api/admin/booking-table', async (ctx) => {
    ctxScope(ctx);
    const query = parseQuery(ctx, bookingTableQuerySchema);
    return {
      body: bookingTableResponseSchema.parse(await bookingTable(query, ctx.now)),
      headers: NO_STORE,
    };
  }),

  // Search ----------------------------------------------------------------
  owner('GET', '/api/admin/search', async (ctx) => {
    ctxScope(ctx);
    const { q } = parseQuery(ctx, searchQuerySchema);
    return { body: searchResponseSchema.parse(await adminSearch(q)), headers: NO_STORE };
  }),

  // Bookings --------------------------------------------------------------
  owner('GET', '/api/admin/bookings', async (ctx) => {
    const { scope } = ctxScope(ctx);
    const query = parseQuery(ctx, bookingListQuerySchema);
    return {
      body: bookingListResponseSchema.parse(await listBookings(scope, query)),
      headers: NO_STORE,
    };
  }),
  owner('POST', '/api/admin/bookings', async (ctx) => {
    const { principal } = ctxScope(ctx);
    const key = idempotencyKeyOf(ctx);
    const input = await parseBody(ctx, manualBookingRequestSchema);
    const outcome = await createManualBooking(input, actorOf(principal), {
      ...metaOf(ctx),
      idempotencyKey: key,
    });
    scheduleDelivery(outcome.outboxIds);
    return {
      status: outcome.status,
      body: manualBookingResponseSchema.parse(outcome.body),
      headers: { ...NO_STORE, 'Idempotent-Replayed': outcome.replayed ? 'true' : 'false' },
    };
  }),
  owner('GET', '/api/admin/bookings/:id', async (ctx) => {
    const { principal, scope } = ctxScope(ctx);
    const { id } = parseParams(ctx, idParams);
    return {
      body: bookingDetailResponseSchema.parse(await bookingDetail(principal, scope, id, ctx.now)),
      headers: NO_STORE,
    };
  }),
  owner('PATCH', '/api/admin/bookings/:id', async (ctx) => {
    const { principal, scope } = ctxScope(ctx);
    const { id } = parseParams(ctx, idParams);
    const { notes } = await parseBody(ctx, bookingNotesRequestSchema);
    return {
      body: bookingResponseSchema.parse(
        await updateBookingNotes(principal, scope, id, notes, metaOf(ctx)),
      ),
    };
  }),
  owner('POST', '/api/admin/bookings/:id/status', async (ctx) => {
    const { principal, scope } = ctxScope(ctx);
    const { id } = parseParams(ctx, idParams);
    const input = await parseBody(ctx, statusChangeRequestSchema);
    const done = await changeBookingStatus(principal, scope, id, input, metaOf(ctx));
    scheduleDelivery(done.outboxIds);
    return { body: bookingResponseSchema.parse(done.body) };
  }),
  owner('POST', '/api/admin/bookings/:id/cancel', async (ctx) => {
    const { principal, scope } = ctxScope(ctx);
    const { id } = parseParams(ctx, idParams);
    const input = await parseBody(ctx, ownerCancelRequestSchema);
    const done = await changeBookingStatus(
      principal,
      scope,
      id,
      { status: 'cancelled', notify: input.notify, reason: input.reason },
      metaOf(ctx),
    );
    scheduleDelivery(done.outboxIds);
    return { body: bookingResponseSchema.parse(done.body) };
  }),
  owner('POST', '/api/admin/bookings/:id/resend', async (ctx) => {
    const { principal, scope } = ctxScope(ctx);
    const { id } = parseParams(ctx, idParams);
    const done = await resendConfirmation(principal, scope, id, metaOf(ctx));
    scheduleDelivery(done.outboxIds);
    return { body: { ok: true } };
  }),
  owner('POST', '/api/admin/bookings/:id/reschedule', async (ctx) => {
    const { principal, scope } = ctxScope(ctx);
    const { id } = parseParams(ctx, idParams);
    const input = await parseBody(ctx, ownerRescheduleRequestSchema);
    const done = await ownerReschedule(principal, scope, id, input, metaOf(ctx));
    scheduleDelivery(done.outboxIds);
    return {
      body: createBookingResponseSchema
        .extend({ booking: bookingResponseSchema.shape.booking })
        .parse(done.body),
    };
  }),

  // Customers -------------------------------------------------------------
  owner('GET', '/api/admin/customers', async (ctx) => {
    ctxScope(ctx);
    const { phone } = parseQuery(ctx, customerQuerySchema);
    return {
      body: customerResponseSchema.parse(await customerByPhone(phone, ctx.now)),
      headers: NO_STORE,
    };
  }),

  // Time blocks and day status -------------------------------------------
  owner('GET', '/api/admin/time-blocks', async (ctx) => {
    ctxScope(ctx);
    const query = parseQuery(ctx, timeBlockListQuerySchema);
    return {
      body: timeBlockListResponseSchema.parse(await listTimeBlocks(query)),
      headers: NO_STORE,
    };
  }),
  owner('POST', '/api/admin/time-blocks', async (ctx) => {
    const { principal, scope } = ctxScope(ctx);
    const input = await parseBody(ctx, timeBlockCreateRequestSchema);
    const done = await createTimeBlock(principal, scope, input, metaOf(ctx));
    scheduleDelivery(done.outboxIds);
    return { status: 201, body: timeBlockResponseSchema.parse(done.body) };
  }),
  owner('DELETE', '/api/admin/time-blocks/:id', async (ctx) => {
    const { principal, scope } = ctxScope(ctx);
    const { id } = parseParams(ctx, idParams);
    const { resolutions } = await parseBody(ctx, resolutionsBodySchema);
    const done = await deleteTimeBlock(principal, scope, id, resolutions, metaOf(ctx));
    scheduleDelivery(done.outboxIds);
    return { body: conflictOnlyResponseSchema.parse(done.body) };
  }),
  owner('POST', '/api/admin/staff/:id/day', async (ctx) => {
    const { principal } = ctxScope(ctx);
    const { id } = parseParams(ctx, idParams);
    const input = await parseBody(ctx, dayStatusRequestSchema);
    const done = await setDayStatus(principal, id, input, metaOf(ctx));
    scheduleDelivery(done.outboxIds);
    return { body: dayStatusResponseSchema.parse(done.body) };
  }),

  // Services --------------------------------------------------------------
  owner('GET', '/api/admin/services', async (ctx) => {
    ctxScope(ctx);
    return { body: serviceListResponseSchema.parse(await listServices()), headers: NO_STORE };
  }),
  owner('POST', '/api/admin/services', async (ctx) => {
    const { principal } = ctxScope(ctx);
    const input = await parseBody(ctx, serviceCreateRequestSchema);
    return {
      status: 201,
      body: serviceResponseSchema.parse(await createService(principal, input, metaOf(ctx))),
    };
  }),
  owner('PATCH', '/api/admin/services/:id', async (ctx) => {
    const { principal } = ctxScope(ctx);
    const { id } = parseParams(ctx, idParams);
    const input = await parseBody(ctx, serviceUpdateRequestSchema);
    return {
      body: serviceResponseSchema.parse(await updateService(principal, id, input, metaOf(ctx))),
    };
  }),
  owner('DELETE', '/api/admin/services/:id', async (ctx) => {
    const { principal } = ctxScope(ctx);
    const { id } = parseParams(ctx, idParams);
    const { resolutions } = await parseBody(ctx, resolutionsBodySchema);
    const done = await deleteService(principal, id, resolutions, metaOf(ctx));
    scheduleDelivery(done.outboxIds);
    return { body: conflictOnlyResponseSchema.parse(done.body) };
  }),

  // Staff -----------------------------------------------------------------
  owner('GET', '/api/admin/staff', async (ctx) => {
    ctxScope(ctx);
    return { body: staffListResponseSchema.parse(await listStaff()), headers: NO_STORE };
  }),
  owner('POST', '/api/admin/staff', async (ctx) => {
    const { principal } = ctxScope(ctx);
    const input = await parseBody(ctx, staffCreateRequestSchema);
    return {
      status: 201,
      body: staffResponseSchema.parse(await createStaff(principal, input, metaOf(ctx))),
    };
  }),
  owner('PATCH', '/api/admin/staff/:id', async (ctx) => {
    const { principal } = ctxScope(ctx);
    const { id } = parseParams(ctx, idParams);
    const input = await parseBody(ctx, staffUpdateRequestSchema);
    const done = await updateStaff(principal, id, input, metaOf(ctx));
    scheduleDelivery(done.outboxIds);
    return { body: staffMutationResponseSchema.parse(done.body) };
  }),
  owner('POST', '/api/admin/staff/:id/slug', async (ctx) => {
    const { principal } = ctxScope(ctx);
    const { id } = parseParams(ctx, idParams);
    const { slug } = await parseBody(ctx, staffSlugRequestSchema);
    return {
      body: staffResponseSchema.parse(await renameStaffSlug(principal, id, slug, metaOf(ctx))),
    };
  }),
  owner('DELETE', '/api/admin/staff/:id', async (ctx) => {
    const { principal } = ctxScope(ctx);
    const { id } = parseParams(ctx, idParams);
    const { resolutions } = await parseBody(ctx, resolutionsBodySchema);
    const done = await deleteStaff(principal, id, resolutions, metaOf(ctx));
    scheduleDelivery(done.outboxIds);
    return { body: conflictOnlyResponseSchema.parse(done.body) };
  }),
  owner('PUT', '/api/admin/staff/:id/hours', async (ctx) => {
    const { principal } = ctxScope(ctx);
    const { id } = parseParams(ctx, idParams);
    const input = await parseBody(ctx, hoursRequestSchema);
    const done = await setStaffHours(principal, id, input, metaOf(ctx));
    scheduleDelivery(done.outboxIds);
    return { body: conflictOnlyResponseSchema.parse(done.body) };
  }),

  // Hours, closures, settings --------------------------------------------
  owner('GET', '/api/admin/hours', async (ctx) => {
    ctxScope(ctx);
    return { body: hoursResponseSchema.parse(await getAllHours()), headers: NO_STORE };
  }),
  owner('PUT', '/api/admin/hours', async (ctx) => {
    const { principal } = ctxScope(ctx);
    const input = await parseBody(ctx, hoursRequestSchema);
    const done = await setShopHours(principal, input, metaOf(ctx));
    scheduleDelivery(done.outboxIds);
    return { body: conflictOnlyResponseSchema.parse(done.body) };
  }),
  owner('GET', '/api/admin/closures', async (ctx) => {
    ctxScope(ctx);
    const query = parseQuery(ctx, closureListQuerySchema);
    return {
      body: closureListResponseSchema.parse(await listClosures(query, shopDateOf(ctx.now))),
      headers: NO_STORE,
    };
  }),
  owner('PUT', '/api/admin/closures', async (ctx) => {
    const { principal } = ctxScope(ctx);
    const input = await parseBody(ctx, closureUpsertRequestSchema);
    const done = await upsertClosure(principal, input, metaOf(ctx));
    scheduleDelivery(done.outboxIds);
    return { body: closureResponseSchema.parse(done.body) };
  }),
  owner('DELETE', '/api/admin/closures/:id', async (ctx) => {
    const { principal } = ctxScope(ctx);
    const { id } = parseParams(ctx, idParams);
    const { resolutions } = await parseBody(ctx, resolutionsBodySchema);
    const done = await deleteClosure(principal, id, resolutions, metaOf(ctx));
    scheduleDelivery(done.outboxIds);
    return { body: conflictOnlyResponseSchema.parse(done.body) };
  }),
  owner('GET', '/api/admin/settings', async (ctx) => {
    ctxScope(ctx);
    return { body: settingsResponseSchema.parse(await getSettings()), headers: NO_STORE };
  }),
  owner('PUT', '/api/admin/settings', async (ctx) => {
    const { principal } = ctxScope(ctx);
    const input = await parseBody(ctx, settingsRequestSchema);
    return { body: settingsResponseSchema.parse(await putSettings(principal, input, metaOf(ctx))) };
  }),

  // Logins ----------------------------------------------------------------
  owner('GET', '/api/admin/users', async (ctx) => {
    ctxScope(ctx);
    return { body: loginListResponseSchema.parse(await listLogins()), headers: NO_STORE };
  }),
  owner('POST', '/api/admin/users', async (ctx) => {
    const { principal } = ctxScope(ctx);
    const input = await parseBody(ctx, loginCreateRequestSchema);
    const issued = await createStaffLogin(principal, input, metaOf(ctx));
    return {
      status: 201,
      body: issuedPasswordResponseSchema.parse({
        user: toLoginView(issued.user, await staffMap()),
        temporaryPassword: issued.temporaryPassword,
      }),
      headers: NO_STORE,
    };
  }),
  owner('POST', '/api/admin/users/:id/reset-password', async (ctx) => {
    const { principal } = ctxScope(ctx);
    const { id } = parseParams(ctx, idParams);
    const issued = await resetLoginPassword(principal, id, metaOf(ctx));
    return {
      body: issuedPasswordResponseSchema.parse({
        user: toLoginView(issued.user, await staffMap()),
        temporaryPassword: issued.temporaryPassword,
      }),
      headers: NO_STORE,
    };
  }),
  owner('POST', '/api/admin/users/:id/disable', async (ctx) => {
    const { principal } = ctxScope(ctx);
    const { id } = parseParams(ctx, idParams);
    const user = await setLoginActive(principal, id, false, metaOf(ctx));
    return { body: loginResponseSchema.parse({ user: toLoginView(user, await staffMap()) }) };
  }),
  owner('POST', '/api/admin/users/:id/enable', async (ctx) => {
    const { principal } = ctxScope(ctx);
    const { id } = parseParams(ctx, idParams);
    const user = await setLoginActive(principal, id, true, metaOf(ctx));
    return { body: loginResponseSchema.parse({ user: toLoginView(user, await staffMap()) }) };
  }),

  // Audit and outbox ------------------------------------------------------
  owner('GET', '/api/admin/audit', async (ctx) => {
    ctxScope(ctx);
    const query = parseQuery(ctx, auditListQuerySchema);
    return { body: auditListResponseSchema.parse(await listAudit(query)), headers: NO_STORE };
  }),
  owner('GET', '/api/admin/outbox', async (ctx) => {
    ctxScope(ctx);
    const query = parseQuery(ctx, outboxListQuerySchema);
    return { body: outboxListResponseSchema.parse(await listOutbox(query)), headers: NO_STORE };
  }),
  owner('POST', '/api/admin/outbox/:id/retry', async (ctx) => {
    const { principal } = ctxScope(ctx);
    const { id } = parseParams(ctx, idParams);
    const queued = await retryOutboxMessage(principal, id, metaOf(ctx));
    runAfterResponse('outbox.retry', () => deliverOutboxIds([queued]));
    return { body: { ok: true } };
  }),
];
