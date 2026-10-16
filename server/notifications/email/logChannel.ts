import { logger } from '../../lib/logger';
import type { NotificationChannel, RenderedMessage, SendResult } from '../channel';

/** Development and test transport: the message goes to the log and nowhere else. */
export class LogEmailChannel implements NotificationChannel {
  readonly channel = 'email' as const;
  readonly sent: RenderedMessage[] = [];

  send(message: RenderedMessage): Promise<SendResult> {
    this.sent.push(message);
    logger.info('email (log channel)', {
      to: message.to,
      subject: message.subject,
      attachments: message.attachments.map((a) => a.filename),
      text: message.text,
    });
    return Promise.resolve({ ok: true, providerId: `log-${message.idempotencyKey}` });
  }
}
