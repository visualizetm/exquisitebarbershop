import type { ZodError } from 'zod';
import { ERROR_CODES, type ErrorCode, type ErrorDetail } from '../../shared/api/errors';

/**
 * The one error type thrown by server code. Routes never build error responses by
 * hand; they throw AppError (or let a ZodError or driver error bubble) and the
 * response helper turns it into the standard error body.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: ErrorDetail[] | undefined;
  readonly retryAfterSeconds: number | undefined;
  /** Internal context for logs only. Never sent to the client. */
  readonly context: Record<string, unknown> | undefined;
  /** Extra public fields merged into the error body, such as SLOT_TAKEN alternatives. */
  readonly extra: Record<string, unknown> | undefined;

  constructor(
    code: ErrorCode,
    message: string,
    options: {
      details?: ErrorDetail[];
      retryAfterSeconds?: number;
      context?: Record<string, unknown>;
      extra?: Record<string, unknown>;
      cause?: unknown;
    } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_CODES[code];
    this.details = options.details;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.context = options.context;
    this.extra = options.extra;
  }

  static fromZod(error: ZodError, message = 'Some fields are invalid'): AppError {
    const details = error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    }));
    return new AppError('VALIDATION_ERROR', message, { details });
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/** MongoDB duplicate key error (E11000). */
export function isDuplicateKeyError(error: unknown): error is Error & { code: 11000 } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

export function notFound(what: string): AppError {
  return new AppError('NOT_FOUND', `${what} was not found`);
}
