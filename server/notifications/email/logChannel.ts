import { logger } from '../../lib/logger';
import type { NotificationChannel, RenderedMessage, SendResult } from '../channel';

/** Development and test transport: the message goes to the log and nowhere else. */
export class LogEmailChannel implements NotificationChannel {
  readonly channel = 'email' as const;
  readonly sent: RenderedMessage[] = [];

  send(message: RenderedMessage): Promise<SendResult> {
    this.sent.push(message);
    // The address is masked by the logger; the body stays out of the log unless debugging.
    logger.info('email (log channel)', {
      to: message.to,
      subject: message.subject,
      attachments: message.attachments.map((a) => a.filename),
    });
    logger.debug('email body (log channel)', { to: message.to, text: message.text });
    return Promise.resolve({ ok: true, providerId: `log-${message.idempotencyKey}` });
  }
}
