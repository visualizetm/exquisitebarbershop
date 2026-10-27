import { z } from 'zod';
import {
  teamBlockTimeRequestSchema,
  teamChangePinRequestSchema,
  teamDayResponseSchema,
  teamDaysOffRequestSchema,
  teamDaysOffResponseSchema,
  teamLoginRequestSchema,
  teamMeResponseSchema,
  teamNoteRequestSchema,
  teamOutTodayResponseSchema,
  teamSetupInfoResponseSchema,
  teamSetupRequestSchema,
  teamStatusRequestSchema,
  teamStatusResponseSchema,
  teamTimeOffResponseSchema,
  teamWalkInRequestSchema,
  teamWalkInResponseSchema,
  teamWeekResponseSchema,
} from '../../../shared/api/team';
import {
  conflictOnlyResponseSchema,
  seatResponseSchema,
  timeBlockResponseSchema,
} from '../../../shared/api/admin';
import { okResponseSchema } from '../../../shared/api/auth';
import {
  lineAddRequestSchema,
  lineResponseSchema,
  walkInResponseSchema,
} from '../../../shared/api/line';
import { chairScope } from '../../services/access';
import { addToLine, lineView, seatFromLine } from '../../services/line';
import { idSchema } from '../../../shared/schemas/common';
import {
  changePin,
  completeSetup,
  endTeamSession,
  setupLinkInfo,
  teamLogin,
} from '../../auth/teamAuth';
import {
  addWalkIn,
  blockTime,
  outToday,
  removeBlock,
  requestDaysOff,
  setBookingNote,
  setBookingStatus,
  teamDay,
  teamMe,
  teamTimeOff,
  teamWeek,
} from '../../services/teamPortal';
import { idempotencyKeyOf, metaOf, NO_STORE, principalOf } from '../context';
import { parseBody, parseParams } from '../request';
import type { RouteDefinition } from '../types';

const idParams = z.object({ id: idSchema });
const tokenParams = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });

/**
 * The barber portal API. Signing in and the setup link are public (they are how a session
 * starts); everything else needs a PIN session and works on that barber's own chair only.
 */
export const teamRoutes: RouteDefinition[] = [
  {
    method: 'POST',
    path: '/api/team/login',
    auth: 'public',
    handler: async (ctx) => {
      const input = await parseBody(ctx, teamLoginRequestSchema);
      await teamLogin(ctx.res, input, metaOf(ctx));
      return { body: okResponseSchema.parse({ ok: true }), headers: NO_STORE };
    },
  },
  {
    method: 'GET',
    path: '/api/team/setup/:token',
    auth: 'public',
    handler: async (ctx) => {
      const { token } = parseParams(ctx, tokenParams);
      return {
        body: teamSetupInfoResponseSchema.parse(await setupLinkInfo(token, ctx.now)),
        headers: NO_STORE,
      };
    },
  },
  {
    method: 'POST',
    path: '/api/team/setup/:token',
    auth: 'public',
    handler: async (ctx) => {
      const { token } = parseParams(ctx, tokenParams);
      const input = await parseBody(ctx, teamSetupRequestSchema);
      await completeSetup(ctx.res, token, input.pin, metaOf(ctx));
      return { body: okResponseSchema.parse({ ok: true }), headers: NO_STORE };
    },
  },
  {
    method: 'POST',
    path: '/api/team/logout',
    auth: 'team',
    handler: async (ctx) => {
      await endTeamSession(ctx.res, principalOf(ctx), ctx.now);
      return { body: okResponseSchema.parse({ ok: true }), headers: NO_STORE };
    },
  },
  {
    method: 'GET',
    path: '/api/team/me',
    auth: 'team',
    handler: async (ctx) => ({
      body: teamMeResponseSchema.parse(await teamMe(principalOf(ctx))),
      headers: NO_STORE,
    }),
  },
  {
    method: 'POST',
    path: '/api/team/pin',
    auth: 'team',
    handler: async (ctx) => {
      const input = await parseBody(ctx, teamChangePinRequestSchema);
      await changePin(principalOf(ctx), input, metaOf(ctx));
      return { body: okResponseSchema.parse({ ok: true }), headers: NO_STORE };
    },
  },
  {
    method: 'GET',
    path: '/api/team/today',
    auth: 'team',
    handler: async (ctx) => ({
      body: teamDayResponseSchema.parse(await teamDay(principalOf(ctx), ctx.now)),
      headers: NO_STORE,
    }),
  },
  {
    method: 'GET',
    path: '/api/team/week',
    auth: 'team',
    handler: async (ctx) => ({
      body: teamWeekResponseSchema.parse(await teamWeek(principalOf(ctx), ctx.now)),
      headers: NO_STORE,
    }),
  },
  {
    method: 'POST',
    path: '/api/team/bookings/:id/status',
    auth: 'team',
    handler: async (ctx) => {
      const { id } = parseParams(ctx, idParams);
      const input = await parseBody(ctx, teamStatusRequestSchema);
      const booking = await setBookingStatus(principalOf(ctx), id, input.status, metaOf(ctx));
      return { body: teamStatusResponseSchema.parse({ booking }), headers: NO_STORE };
    },
  },
  {
    method: 'POST',
    path: '/api/team/bookings/:id/note',
    auth: 'team',
    handler: async (ctx) => {
      const { id } = parseParams(ctx, idParams);
      const input = await parseBody(ctx, teamNoteRequestSchema);
      const booking = await setBookingNote(principalOf(ctx), id, input.notes, metaOf(ctx));
      return { body: teamStatusResponseSchema.parse({ booking }), headers: NO_STORE };
    },
  },
  {
    method: 'POST',
    path: '/api/team/walk-ins',
    auth: 'team',
    handler: async (ctx) => {
      const key = idempotencyKeyOf(ctx);
      const input = await parseBody(ctx, teamWalkInRequestSchema);
      const done = await addWalkIn(principalOf(ctx), input, {
        ...metaOf(ctx),
        idempotencyKey: key,
      });
      return { status: 201, body: teamWalkInResponseSchema.parse(done), headers: NO_STORE };
    },
  },
  // The walk-in line: see it, add to it, seat into this chair.
  {
    method: 'GET',
    path: '/api/team/line',
    auth: 'team',
    handler: async (ctx) => {
      chairScope(principalOf(ctx));
      return { body: lineResponseSchema.parse(await lineView(ctx.now)), headers: NO_STORE };
    },
  },
  {
    method: 'POST',
    path: '/api/team/line',
    auth: 'team',
    handler: async (ctx) => {
      const principal = principalOf(ctx);
      chairScope(principal);
      const input = await parseBody(ctx, lineAddRequestSchema);
      return {
        status: 201,
        body: walkInResponseSchema.parse({
          walkIn: await addToLine(principal, input, metaOf(ctx)),
        }),
        headers: NO_STORE,
      };
    },
  },
  {
    method: 'POST',
    path: '/api/team/line/:id/seat',
    auth: 'team',
    handler: async (ctx) => {
      const principal = principalOf(ctx);
      const scope = chairScope(principal);
      const { id } = parseParams(ctx, idParams);
      return {
        status: 201,
        body: seatResponseSchema.parse(
          await seatFromLine(principal, scope, id, scope.staffId, metaOf(ctx)),
        ),
      };
    },
  },
  {
    method: 'GET',
    path: '/api/team/time-off',
    auth: 'team',
    handler: async (ctx) => ({
      body: teamTimeOffResponseSchema.parse(await teamTimeOff(principalOf(ctx), ctx.now)),
      headers: NO_STORE,
    }),
  },
  {
    method: 'POST',
    path: '/api/team/time-blocks',
    auth: 'team',
    handler: async (ctx) => {
      const input = await parseBody(ctx, teamBlockTimeRequestSchema);
      const done = await blockTime(principalOf(ctx), input, metaOf(ctx));
      return { status: 201, body: timeBlockResponseSchema.parse(done.body), headers: NO_STORE };
    },
  },
  {
    method: 'DELETE',
    path: '/api/team/time-blocks/:id',
    auth: 'team',
    handler: async (ctx) => {
      const { id } = parseParams(ctx, idParams);
      const done = await removeBlock(principalOf(ctx), id, metaOf(ctx));
      return { body: conflictOnlyResponseSchema.parse(done.body), headers: NO_STORE };
    },
  },
  {
    method: 'POST',
    path: '/api/team/out-today',
    auth: 'team',
    handler: async (ctx) => ({
      body: teamOutTodayResponseSchema.parse(await outToday(principalOf(ctx), metaOf(ctx))),
      headers: NO_STORE,
    }),
  },
  {
    method: 'POST',
    path: '/api/team/days-off',
    auth: 'team',
    handler: async (ctx) => {
      const input = await parseBody(ctx, teamDaysOffRequestSchema);
      const done = await requestDaysOff(principalOf(ctx), input, metaOf(ctx));
      return { status: 201, body: teamDaysOffResponseSchema.parse(done), headers: NO_STORE };
    },
  },
];
