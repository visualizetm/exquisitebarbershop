import type { HealthResponse } from '../../../shared/api/health';
import { healthResponseSchema } from '../../../shared/api/health';
import { pingDb } from '../../db/client';
import { currentEnvProblems, getBuildSha } from '../../env';
import type { RouteDefinition } from '../types';

export const healthRoutes: RouteDefinition[] = [
  {
    method: 'GET',
    path: '/api/health',
    auth: 'public',
    alwaysOn: true,
    handler: async (ctx) => {
      const missing = currentEnvProblems().map((p) => p.name);
      if (missing.length > 0) {
        // The gate refuses to serve: say which variables, by name only, so the fix is obvious.
        const body: HealthResponse = healthResponseSchema.parse({
          ok: false,
          status: 'config',
          buildSha: getBuildSha(),
          time: ctx.now.toISOString(),
          missing,
        });
        return { status: 503, body, headers: { 'Cache-Control': 'no-store' } };
      }
      const db = await pingDb();
      const body: HealthResponse = healthResponseSchema.parse({
        ok: db.ok,
        status: db.ok ? 'ok' : 'degraded',
        buildSha: getBuildSha(),
        time: ctx.now.toISOString(),
        db,
      });
      return { status: db.ok ? 200 : 503, body, headers: { 'Cache-Control': 'no-store' } };
    },
  },
];
