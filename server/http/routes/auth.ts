import {
  changePasswordRequestSchema,
  loginRequestSchema,
  logoutAllResponseSchema,
  meResponseSchema,
  okResponseSchema,
  type MeResponse,
} from '../../../shared/api/auth';
import { changeOwnPassword, login } from '../../auth/authService';
import { endAllSessions, endSession } from '../../auth/sessions';
import { shopSettingsRepo, staffRepo, usersRepo } from '../../repos';
import { AppError } from '../../lib/errors';
import { toPublicStaff } from './public';
import { metaOf, NO_STORE, principalOf } from '../context';
import { parseBody } from '../request';
import type { RouteDefinition } from '../types';

async function meFor(userId: string): Promise<MeResponse> {
  const user = await usersRepo.findUserById(userId);
  if (!user) throw new AppError('AUTH_REQUIRED', 'Please sign in');
  const [staff, settings] = await Promise.all([
    user.staffId ? staffRepo.findStaffById(user.staffId) : Promise.resolve(null),
    shopSettingsRepo.requireShopSettings(),
  ]);
  return meResponseSchema.parse({
    user: {
      _id: user._id,
      email: user.email,
      role: user.role,
      staffId: user.staffId,
      isActive: user.isActive,
      mustChangePassword: user.mustChangePassword,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    },
    staff: staff && !staff.deletedAt ? toPublicStaff(staff) : null,
    permissions: { barbersCanBlockTime: settings.permissions.barbersCanBlockTime },
  });
}

export const authRoutes: RouteDefinition[] = [
  {
    method: 'POST',
    path: '/api/auth/login',
    auth: 'public',
    handler: async (ctx) => {
      const input = await parseBody(ctx, loginRequestSchema);
      const result = await login(ctx.res, input, metaOf(ctx));
      return { body: await meFor(result.user._id), headers: NO_STORE };
    },
  },
  {
    method: 'POST',
    path: '/api/auth/logout',
    auth: 'barber',
    allowDuringPasswordChange: true,
    handler: async (ctx) => {
      await endSession(ctx.res, principalOf(ctx), ctx.now);
      return { body: okResponseSchema.parse({ ok: true }), headers: NO_STORE };
    },
  },
  {
    method: 'POST',
    path: '/api/auth/logout-all',
    auth: 'barber',
    allowDuringPasswordChange: true,
    handler: async (ctx) => {
      const sessionsEnded = await endAllSessions(ctx.res, principalOf(ctx), ctx.now);
      return {
        body: logoutAllResponseSchema.parse({ ok: true, sessionsEnded }),
        headers: NO_STORE,
      };
    },
  },
  {
    method: 'GET',
    path: '/api/auth/me',
    auth: 'barber',
    allowDuringPasswordChange: true,
    handler: async (ctx) => ({ body: await meFor(principalOf(ctx).userId), headers: NO_STORE }),
  },
  {
    method: 'POST',
    path: '/api/me/password',
    auth: 'barber',
    allowDuringPasswordChange: true,
    handler: async (ctx) => {
      const input = await parseBody(ctx, changePasswordRequestSchema);
      await changeOwnPassword(principalOf(ctx), input, metaOf(ctx));
      return { body: await meFor(principalOf(ctx).userId), headers: NO_STORE };
    },
  },
];
