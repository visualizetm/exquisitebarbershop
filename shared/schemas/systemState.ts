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

/**
 * `_id: "demo"` marks a database that holds showcase data. Only that marker lets
 * "Clear demo data" wipe anything, so a real shop can never be cleared by mistake.
 */
export const demoRecordSchema = z.object({
  _id: z.literal('demo'),
  seededAt: z.date(),
  /** How many times the sample data was loaded (first setup plus every reset). */
  runs: z.int().min(1),
});
export type DemoRecord = z.infer<typeof demoRecordSchema>;

/** Held while one cold start seeds the demo, so two at once never double seed. */
export const demoLockSchema = z.object({
  _id: z.literal('demoLock'),
  lockedAt: z.date(),
  holder: z.string(),
});
export type DemoLock = z.infer<typeof demoLockSchema>;

export type SystemStateDocument = BootstrapRecord | DemoRecord | DemoLock;
