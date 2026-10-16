import type { NotificationChannel, RenderedMessage, SendResult } from '../channel';

export interface ResendChannelOptions {
  apiKey: string;
  from: string;
  fetchImpl?: typeof fetch;
  endpoint?: string;
}

/** Production transport through the Resend HTTP API. */
export class ResendEmailChannel implements NotificationChannel {
  readonly channel = 'email' as const;
  private readonly options: ResendChannelOptions;

  constructor(options: ResendChannelOptions) {
    this.options = options;
  }

  async send(message: RenderedMessage): Promise<SendResult> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const body = {
      from: this.options.from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: message.attachments.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content, 'utf8').toString('base64'),
        content_type: a.contentType,
      })),
    };
    let response: Response;
    try {
      response = await fetchImpl(this.options.endpoint ?? 'https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': message.idempotencyKey,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'network error',
        retryable: true,
      };
    }
    if (response.ok) {
      const data = (await response.json().catch(() => ({}))) as { id?: string };
      return { ok: true, providerId: data.id ?? 'unknown' };
    }
    const text = await response.text().catch(() => '');
    const retryable = response.status === 429 || response.status >= 500;
    return { ok: false, error: `Resend ${response.status}: ${text.slice(0, 300)}`, retryable };
  }
}
