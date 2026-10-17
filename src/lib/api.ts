import type { ZodType } from 'zod';
import { apiErrorSchema, type ApiError } from '@shared/api/errors';

/** Thrown for any non-2xx response. Carries the standard error body. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: ApiError['error']['code'];
  readonly details: ApiError['error']['details'];
  readonly requestId: string;
  readonly alternatives: ApiError['error']['alternatives'];
  /** Bookings a schedule change would strand (SCHEDULE_CONFLICT only). */
  readonly affected: ApiError['error']['affected'];

  constructor(status: number, body: ApiError) {
    super(body.error.message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = body.error.code;
    this.details = body.error.details;
    this.requestId = body.error.requestId;
    this.alternatives = body.error.alternatives;
    this.affected = body.error.affected;
  }
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** Bypass the browser cache, for example right after a conflict. */
  fresh?: boolean;
}

/**
 * Same-origin JSON client. Every response is validated against its zod schema so
 * the UI never renders a shape the server did not promise.
 */
export async function apiRequest<T>(
  path: string,
  schema: ZodType<T>,
  options: ApiRequestOptions = {},
): Promise<T> {
  const init: RequestInit = {
    method: options.method ?? 'GET',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  };
  if (options.body !== undefined) init.body = JSON.stringify(options.body);
  if (options.signal) init.signal = options.signal;
  if (options.fresh) init.cache = 'reload';
  const response = await fetch(path, init);
  const text = await response.text();
  const json: unknown = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(json);
    if (parsed.success) throw new ApiRequestError(response.status, parsed.data);
    throw new ApiRequestError(response.status, {
      error: { code: 'INTERNAL_ERROR', message: 'Unexpected response', requestId: 'unknown' },
    });
  }
  return schema.parse(json);
}
