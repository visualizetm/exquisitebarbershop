import { ServerResponse, IncomingMessage } from 'node:http';
import { Socket } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z, ZodError } from 'zod';
import { AppError, isDuplicateKeyError, notFound } from '../../server/lib/errors';
import { sendError, toAppError } from '../../server/http/respond';

process.env.LOG_LEVEL = 'error';

function fakeResponse(): {
  res: ServerResponse;
  read: () => { status: number; body: unknown; headers: Record<string, string> };
} {
  const req = new IncomingMessage(new Socket());
  const res = new ServerResponse(req);
  let payload = '';
  const append = (chunk: unknown): void => {
    if (typeof chunk === 'string') payload += chunk;
    else if (Buffer.isBuffer(chunk)) payload += chunk.toString('utf8');
  };
  res.write = ((chunk: unknown) => {
    append(chunk);
    return true;
  }) as typeof res.write;
  res.end = ((chunk?: unknown) => {
    append(chunk);
    return res;
  }) as typeof res.end;
  return {
    res,
    read: () => ({
      status: res.statusCode,
      body: JSON.parse(payload) as unknown,
      headers: Object.fromEntries(Object.entries(res.getHeaders()).map(([k, v]) => [k, String(v)])),
    }),
  };
}

describe('AppError', () => {
  it('maps codes to HTTP statuses', () => {
    expect(new AppError('NOT_FOUND', 'x').status).toBe(404);
    expect(new AppError('SLOT_TAKEN', 'x').status).toBe(409);
    expect(new AppError('RATE_LIMITED', 'x', { retryAfterSeconds: 30 }).retryAfterSeconds).toBe(30);
    expect(notFound('Booking').message).toBe('Booking was not found');
  });

  it('converts zod issues into field details', () => {
    const result = z
      .object({ name: z.string().min(1), age: z.int() })
      .safeParse({ name: '', age: 1.5 });
    if (result.success) throw new Error('expected failure');
    const err = AppError.fromZod(result.error);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.details?.map((d) => d.path)).toEqual(['name', 'age']);
  });

  it('recognizes duplicate key errors', () => {
    expect(isDuplicateKeyError({ code: 11000 })).toBe(true);
    expect(isDuplicateKeyError(new Error('nope'))).toBe(false);
    expect(isDuplicateKeyError(null)).toBe(false);
  });
});

describe('toAppError and sendError', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes AppError through and wraps unknown errors as INTERNAL_ERROR', () => {
    const original = new AppError('FORBIDDEN', 'no');
    expect(toAppError(original)).toBe(original);
    expect(toAppError(new Error('boom')).code).toBe('INTERNAL_ERROR');
    expect(toAppError('string').code).toBe('INTERNAL_ERROR');
  });

  it('treats a raw ZodError as a server bug, not a client error', () => {
    const result = z.string().safeParse(1);
    if (result.success) throw new Error('expected failure');
    expect(result.error).toBeInstanceOf(ZodError);
    expect(toAppError(result.error).code).toBe('INTERNAL_ERROR');
  });

  it('maps duplicate keys to CONFLICT and connection failures to DATABASE_UNAVAILABLE', () => {
    expect(toAppError({ code: 11000 }).code).toBe('CONFLICT');
    const netError = new Error('down');
    netError.name = 'MongoServerSelectionError';
    expect(toAppError(netError).code).toBe('DATABASE_UNAVAILABLE');
  });

  it('writes the standard error body with request id and retry header', () => {
    const { res, read } = fakeResponse();
    sendError(res, new AppError('RATE_LIMITED', 'Slow down', { retryAfterSeconds: 12 }), 'req-1');
    const out = read();
    expect(out.status).toBe(429);
    expect(out.headers['retry-after']).toBe('12');
    expect(out.body).toEqual({
      error: {
        code: 'RATE_LIMITED',
        message: 'Slow down',
        requestId: 'req-1',
        retryAfterSeconds: 12,
      },
    });
  });

  it('never leaks internal messages for 500s', () => {
    const { res, read } = fakeResponse();
    sendError(res, new Error('secret stack detail'), 'req-2');
    const out = read();
    expect(out.status).toBe(500);
    expect(JSON.stringify(out.body)).not.toContain('secret stack detail');
  });
});
