import { authenticateFromCookie } from '../auth/sessions';
import { createRouter, type Router } from './router';
import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import { availabilityRoutes } from './routes/availability';
import { bookingRoutes } from './routes/bookings';
import { healthRoutes } from './routes/health';
import { internalRoutes } from './routes/internal';
import { meRoutes } from './routes/me';
import { publicRoutes } from './routes/public';
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
  ...meRoutes,
  ...adminRoutes,
  ...internalRoutes,
];

let router: Router | null = null;

export function getRouter(): Router {
  router ??= createRouter(allRoutes, authenticateFromCookie);
  return router;
}
