import { z } from 'zod';

/**
 * Every error response from the API has this shape:
 * { "error": { "code": "...", "message": "...", "details": [...]?, "requestId": "..." } }
 * `code` is stable and meant for the client to branch on. `message` is safe to show.
 */
export const ERROR_CODES = {
  VALIDATION_ERROR: 400,
  BAD_REQUEST: 400,
  AUTH_REQUIRED: 401,
  INVALID_CREDENTIALS: 401,
  SESSION_EXPIRED: 401,
  FORBIDDEN: 403,
  ORIGIN_NOT_ALLOWED: 403,
  INVALID_TOKEN: 403,
  TOKEN_EXPIRED: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  SLOT_TAKEN: 409,
  SLUG_TAKEN: 409,
  IDEMPOTENCY_MISMATCH: 409,
  IDEMPOTENCY_IN_PROGRESS: 409,
  BOOKING_NOT_CANCELLABLE: 409,
  BOOKING_NOT_RESCHEDULABLE: 409,
  SHOP_CLOSED: 409,
  OUTSIDE_BOOKING_WINDOW: 409,
  STAFF_UNAVAILABLE: 409,
  SERVICE_UNAVAILABLE: 409,
  TOO_MANY_OPEN_BOOKINGS: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  ACCOUNT_LOCKED: 423,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  DATABASE_UNAVAILABLE: 503,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;
export const errorCodeSchema = z.enum(Object.keys(ERROR_CODES) as [ErrorCode, ...ErrorCode[]]);

export const errorDetailSchema = z.object({
  path: z.string(),
  message: z.string(),
});
export type ErrorDetail = z.infer<typeof errorDetailSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    details: z.array(errorDetailSchema).optional(),
    requestId: z.string(),
    /** Seconds until a rate-limited or locked client may retry. */
    retryAfterSeconds: z.int().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
