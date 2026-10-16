import type { IncomingMessage } from 'node:http';
import { getEnv } from '../env';
import { AppError } from '../lib/errors';
import { headerValue } from './request';

/**
 * Origins allowed to make mutating requests: the configured site URL, the current
 * Vercel deployment URL (preview deployments) and localhost during development.
 */
export function allowedOrigins(): Set<string> {
  const env = getEnv();
  const origins = new Set<string>([new URL(env.APP_BASE_URL).origin]);
  if (env.VERCEL_URL) origins.add(`https://${env.VERCEL_URL}`);
  if (env.NODE_ENV !== 'production') {
    origins.add('http://localhost:5173');
    origins.add('http://127.0.0.1:5173');
    origins.add('http://localhost:3001');
    origins.add('http://127.0.0.1:3001');
  }
  return origins;
}

/**
 * CSRF guard for cookie-authenticated and public mutating routes. Browsers always
 * send Origin on cross-site POSTs; a missing Origin is accepted only when Sec-Fetch-Site
 * says the request is same-origin or came from a non-browser client.
 */
export function assertAllowedOrigin(req: IncomingMessage): void {
  const origin = headerValue(req, 'origin');
  if (origin === null) {
    const fetchSite = headerValue(req, 'sec-fetch-site');
    if (fetchSite === null || fetchSite === 'same-origin' || fetchSite === 'none') return;
    throw new AppError('ORIGIN_NOT_ALLOWED', 'Cross-site requests are not allowed');
  }
  if (!allowedOrigins().has(origin)) {
    throw new AppError('ORIGIN_NOT_ALLOWED', 'Cross-site requests are not allowed', {
      context: { origin },
    });
  }
}
