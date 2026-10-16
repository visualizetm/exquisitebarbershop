import type { NotificationChannel as ChannelName } from '../../shared/schemas/emailOutbox';

export interface Attachment {
  filename: string;
  contentType: string;
  /** Raw content; channels encode it as they need. */
  content: string;
}

export interface RenderedMessage {
  channel: ChannelName;
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments: Attachment[];
  /** Stable per outbox entry, passed to providers that support idempotency. */
  idempotencyKey: string;
}

export type SendResult =
  { ok: true; providerId: string } | { ok: false; error: string; retryable: boolean };

/**
 * One implementation per transport. Email exists today; SMS plugs in later by
 * implementing this with channel "sms" and registering it in getChannel.
 */
export interface NotificationChannel {
  readonly channel: ChannelName;
  send(message: RenderedMessage): Promise<SendResult>;
}
