import { z } from 'zod';

/** One-off records about the deployment itself. `_id: "bootstrap"` says the first setup ran. */
export const bootstrapRecordSchema = z.object({
  _id: z.literal('bootstrap'),
  completedAt: z.date(),
  runs: z.int().min(1),
  /** What the last run created, counts only. */
  summary: z.record(z.string(), z.union([z.boolean(), z.int(), z.string()])),
});
export type BootstrapRecord = z.infer<typeof bootstrapRecordSchema>;
