import type { HealthResponse } from '../../../shared/api/health';
import { healthResponseSchema } from '../../../shared/api/health';
import { pingDb } from '../../db/client';
import { getBuildSha } from '../../env';
import type { RouteDefinition } from '../types';

export const healthRoutes: RouteDefinition[] = [
  {
    method: 'GET',
    path: '/api/health',
    auth: 'public',
    alwaysOn: true,
    handler: async (ctx) => {
      const db = await pingDb();
      const body: HealthResponse = healthResponseSchema.parse({
        status: db.ok ? 'ok' : 'degraded',
        buildSha: getBuildSha(),
        time: ctx.now.toISOString(),
        db,
      });
      return { status: db.ok ? 200 : 503, body };
    },
  },
];
