import type { ServerResponse } from 'node:http';
import { ZodError } from 'zod';
import type { ApiError } from '../../shared/api/errors';
import { AppError, isDuplicateKeyError } from '../lib/errors';
import { describeError, logger } from '../lib/logger';

export function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  // A string body with its own Content-Type (the sitemap) is sent as is.
  const payload =
    typeof body === 'string' && headers['Content-Type'] !== undefined ? body : JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.end(payload);
}

/**
 * Turns any thrown value into the standard error body. AppError maps directly.
 * A raw ZodError here means a server-built document failed its own schema, which
 * is a bug, so it is reported as INTERNAL_ERROR rather than a client error.
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) {
    return new AppError('INTERNAL_ERROR', 'The server produced an invalid document', {
      cause: error,
    });
  }
  if (isDuplicateKeyError(error)) {
    return new AppError('CONFLICT', 'That record already exists', { cause: error });
  }
  if (error instanceof Error && /MongoServerSelectionError|MongoNetworkError/.test(error.name)) {
    return new AppError('DATABASE_UNAVAILABLE', 'The database is not reachable right now', {
      cause: error,
    });
  }
  return new AppError('INTERNAL_ERROR', 'Something went wrong on our side', { cause: error });
}

export function sendError(res: ServerResponse, error: unknown, requestId: string): void {
  const appError = toAppError(error);
  const fields: Record<string, unknown> = {
    requestId,
    code: appError.code,
    status: appError.status,
    ...(appError.context ?? {}),
  };
  if (appError.status >= 500) {
    logger.error('request failed', { ...fields, error: describeError(appError.cause ?? appError) });
  } else {
    logger.info('request rejected', { ...fields, message: appError.message });
  }
  const body: ApiError = {
    error: {
      code: appError.code,
      message: appError.message,
      requestId,
      ...(appError.details ? { details: appError.details } : {}),
      ...(appError.retryAfterSeconds !== undefined
        ? { retryAfterSeconds: appError.retryAfterSeconds }
        : {}),
      ...(appError.extra ?? {}),
    },
  };
  const headers: Record<string, string> = {};
  if (appError.retryAfterSeconds !== undefined)
    headers['Retry-After'] = String(appError.retryAfterSeconds);
  sendJson(res, appError.status, body, headers);
}
