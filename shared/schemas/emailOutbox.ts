import { z } from 'zod';
import { emailSchema, idSchema, timestampsSchema } from './common';

/** Only "email" exists today. "sms" is reserved so the same outbox can carry texts later. */
export const notificationChannelSchema = z.enum(['email', 'sms']);
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;

export const outboxStatusSchema = z.enum(['pending', 'sending', 'sent', 'failed']);
export type OutboxStatus = z.infer<typeof outboxStatusSchema>;

export const outboxTemplateSchema = z.enum([
  'bookingConfirmed',
  'bookingRescheduled',
  'bookingCancelled',
  'ownerNewBooking',
  'ownerBookingCancelled',
  'ownerBookingRescheduled',
  'passwordReset',
]);
export type OutboxTemplate = z.infer<typeof outboxTemplateSchema>;

export const emailOutboxDocumentSchema = z
  .object({
    _id: idSchema,
    channel: notificationChannelSchema,
    to: emailSchema,
    template: outboxTemplateSchema,
    /** Template data. Rendering happens at send time so templates can be fixed later. */
    payload: z.record(z.string(), z.unknown()),
    status: outboxStatusSchema,
    attempts: z.int().min(0),
    maxAttempts: z.int().min(1),
    lastError: z.string().max(1000).nullable(),
    nextAttemptAt: z.date(),
    sentAt: z.date().nullable(),
    /** Unique when present: prevents sending the same notification twice. */
    dedupeKey: z.string().max(120).nullable(),
    bookingId: idSchema.nullable(),
  })
  .extend(timestampsSchema.shape);
export type EmailOutboxDocument = z.infer<typeof emailOutboxDocumentSchema>;
