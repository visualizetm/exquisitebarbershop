import type { NotificationChannel as ChannelName } from '../../shared/schemas/emailOutbox';
import { getEnv } from '../env';
import { AppError } from '../lib/errors';
import type { NotificationChannel } from './channel';
import { LogEmailChannel } from './email/logChannel';
import { ResendEmailChannel } from './email/resendChannel';

const channels = new Map<ChannelName, NotificationChannel>();

/** Returns the transport for a channel, building it from the environment on first use. */
export function getChannel(name: ChannelName): NotificationChannel {
  const existing = channels.get(name);
  if (existing) return existing;
  if (name !== 'email') {
    throw new AppError('NOT_IMPLEMENTED', `No transport is configured for ${name}`);
  }
  const env = getEnv();
  const channel: NotificationChannel =
    env.EMAIL_PROVIDER === 'resend'
      ? new ResendEmailChannel({ apiKey: env.RESEND_API_KEY ?? '', from: env.EMAIL_FROM ?? '' })
      : new LogEmailChannel();
  channels.set(name, channel);
  return channel;
}

/** Tests swap transports in and out. */
export function setChannel(name: ChannelName, channel: NotificationChannel | null): void {
  if (channel) channels.set(name, channel);
  else channels.delete(name);
}
