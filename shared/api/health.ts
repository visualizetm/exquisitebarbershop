import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  buildSha: z.string(),
  time: z.iso.datetime(),
  db: z.object({
    ok: z.boolean(),
    latencyMs: z.int().nullable(),
  }),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
