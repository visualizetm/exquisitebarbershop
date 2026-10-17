import type { AuditEntryView, OutboxMessageView } from '../../shared/api/admin';
import type { AuditLogDocument } from '../../shared/schemas/auditLog';
import type { EmailOutboxDocument } from '../../shared/schemas/emailOutbox';

export function toAuditView(entry: AuditLogDocument): AuditEntryView {
  return {
    id: entry._id,
    at: entry.at.toISOString(),
    actor: entry.actor,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    before: entry.before,
    after: entry.after,
    meta: entry.meta,
    requestId: entry.requestId,
  };
}

/** The payload is left out: it holds customer details the list does not need. */
export function toOutboxView(message: EmailOutboxDocument): OutboxMessageView {
  return {
    id: message._id,
    channel: message.channel,
    to: message.to,
    template: message.template,
    status: message.status,
    attempts: message.attempts,
    maxAttempts: message.maxAttempts,
    lastError: message.lastError,
    nextAttemptAt: message.nextAttemptAt.toISOString(),
    sentAt: message.sentAt?.toISOString() ?? null,
    bookingId: message.bookingId,
    createdAt: message.createdAt.toISOString(),
  };
}
