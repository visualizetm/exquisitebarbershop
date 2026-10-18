import { authenticateFromCookie } from '../auth/sessions';
import { authenticateTeam } from '../auth/teamAuth';
import { createRouter, type Router } from './router';
import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import { availabilityRoutes } from './routes/availability';
import { bookingRoutes } from './routes/bookings';
import { demoRoutes } from './routes/demo';
import { healthRoutes } from './routes/health';
import { internalRoutes } from './routes/internal';
import { mediaRoutes } from './routes/media';
import { photosRoutes } from './routes/photos';
import { publicRoutes } from './routes/public';
import { teamRoutes } from './routes/team';
import type { RouteDefinition } from './types';

/**
 * Every route in the API, in match order. Each declares its auth level; the
 * authorization matrix test fails for any route it does not know about.
 */
export const allRoutes: readonly RouteDefinition[] = [
  ...healthRoutes,
  ...publicRoutes,
  ...availabilityRoutes,
  ...bookingRoutes,
  ...authRoutes,
  ...teamRoutes,
  ...adminRoutes,
  ...photosRoutes,
  ...mediaRoutes,
  ...demoRoutes,
  ...internalRoutes,
];

let router: Router | null = null;

export function getRouter(): Router {
  router ??= createRouter(allRoutes, (ctx, level) =>
    level === 'team' ? authenticateTeam(ctx) : authenticateFromCookie(ctx),
  );
  return router;
}
