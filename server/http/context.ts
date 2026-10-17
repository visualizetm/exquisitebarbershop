import { AppError } from '../lib/errors';
import { clientIp, headerValue } from './request';
import type { Principal, RequestContext } from './types';

/** The signed-in caller. The router guarantees it on non-public routes; this narrows the type. */
export function principalOf(ctx: RequestContext): Principal {
  if (!ctx.principal) throw new AppError('AUTH_REQUIRED', 'Please sign in');
  return ctx.principal;
}

export function metaOf(ctx: RequestContext) {
  return {
    ip: clientIp(ctx.req),
    userAgent: headerValue(ctx.req, 'user-agent'),
    requestId: ctx.requestId,
    now: ctx.now,
  };
}

export function idempotencyKeyOf(ctx: RequestContext): string {
  const key = headerValue(ctx.req, 'idempotency-key');
  if (!key || key.length < 8 || key.length > 128) {
    throw new AppError(
      'BAD_REQUEST',
      'An Idempotency-Key header of 8 to 128 characters is required',
    );
  }
  return key;
}

export const NO_STORE = { 'Cache-Control': 'no-store' };
