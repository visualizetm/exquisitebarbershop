import { createRouter, denyAllAuthenticator, type Router } from './router';
import { availabilityRoutes } from './routes/availability';
import { bookingRoutes } from './routes/bookings';
import { healthRoutes } from './routes/health';
import { internalRoutes } from './routes/internal';
import { publicRoutes } from './routes/public';
import type { RouteDefinition } from './types';

/** Every route in the API, in match order. Later prompts append auth, booking and admin routes. */
export const allRoutes: readonly RouteDefinition[] = [
  ...healthRoutes,
  ...publicRoutes,
  ...availabilityRoutes,
  ...bookingRoutes,
  ...internalRoutes,
];

let router: Router | null = null;

export function getRouter(): Router {
  router ??= createRouter(allRoutes, denyAllAuthenticator);
  return router;
}
