import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { getRouter } from './http/app';
import { toAppError } from './http/respond';
import { logger } from './lib/logger';

/**
 * The real function body, bundled by scripts/build-api.mjs into server/bundle/app.mjs.
 * Vercel runs plain Node ESM, which cannot resolve extensionless imports, so nothing under
 * server/ ever ships as separate files: the bundle is one file, and api/index.js (a
 * hand-written file with no imports of ours) loads it.
 *
 * Every request ends in JSON with an error code, whatever goes wrong: the router already turns
 * its own errors into the standard body, and this last catch covers anything outside it, so
 * the site's down screen can always show a code instead of a Vercel error page.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    await getRouter().handle(req, res);
  } catch (error) {
    const appError = toAppError(error);
    const requestId = randomBytes(8).toString('hex');
    try {
      logger.error('function failed outside the router', {
        requestId,
        code: appError.code,
        error: appError.cause instanceof Error ? appError.cause.name : appError.name,
      });
    } catch {
      // Logging must never be the reason a request has no answer.
    }
    if (res.headersSent) {
      res.end();
      return;
    }
    res.statusCode = appError.status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(
      JSON.stringify({
        ok: false,
        error: { code: appError.code, message: appError.message, requestId },
      }),
    );
  }
}
