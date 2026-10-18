import { z } from 'zod';

/**
 * GET /api/health. `ok` is the one field to watch. While the deployment is
 * missing settings the body lists their names under `missing` (never values)
 * and `db` is absent, because nothing is tried until the settings are complete.
 */
export const healthResponseSchema = z.object({
  ok: z.boolean(),
  status: z.enum(['ok', 'degraded', 'config']),
  buildSha: z.string(),
  time: z.iso.datetime(),
  db: z
    .object({
      ok: z.boolean(),
      latencyMs: z.int().nullable(),
    })
    .optional(),
  missing: z.array(z.string()).optional(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
