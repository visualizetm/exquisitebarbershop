import type { IncomingMessage } from 'node:http';
import type { ZodType } from 'zod';
import { AppError } from '../lib/errors';
import type { RequestContext } from './types';

const MAX_BODY_BYTES = 64 * 1024;

/**
 * Reads and parses a JSON body. Vercel pre-parses JSON bodies onto req.body; a
 * plain Node server (local dev, tests) leaves the stream untouched. Both work.
 */
export async function readJsonBody(req: IncomingMessage & { body?: unknown }): Promise<unknown> {
  if (req.body !== undefined) {
    if (typeof req.body === 'string') return parseJsonText(req.body);
    return req.body;
  }
  const contentType = req.headers['content-type'] ?? '';
  if (contentType && !contentType.toLowerCase().startsWith('application/json')) {
    throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'Send JSON with Content-Type: application/json');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new AppError('PAYLOAD_TOO_LARGE', 'Request body is too large');
    chunks.push(buffer);
  }
  if (size === 0) return undefined;
  return parseJsonText(Buffer.concat(chunks).toString('utf8'));
}

/**
 * Reads a raw binary body up to `maxBytes`. Vercel hands an octet-stream body over as a
 * Buffer on req.body; a plain Node server leaves the stream untouched. Both work.
 */
export async function readRawBody(
  req: IncomingMessage & { body?: unknown },
  maxBytes: number,
): Promise<Buffer> {
  const declared = Number(req.headers['content-length'] ?? '0');
  if (declared > maxBytes) throw new AppError('PAYLOAD_TOO_LARGE', 'The file is too large');
  const pre = req.body;
  if (pre !== undefined) {
    if (!Buffer.isBuffer(pre)) {
      throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'Send the file as application/octet-stream');
    }
    if (pre.length > maxBytes) throw new AppError('PAYLOAD_TOO_LARGE', 'The file is too large');
    return pre;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer);
    size += buffer.length;
    if (size > maxBytes) throw new AppError('PAYLOAD_TOO_LARGE', 'The file is too large');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function parseJsonText(text: string): unknown {
  if (text.trim() === '') return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError('BAD_REQUEST', 'Request body is not valid JSON');
  }
}

/** Validates the body with a schema. Failures become VALIDATION_ERROR with field details. */
export async function parseBody<T>(ctx: RequestContext, schema: ZodType<T>): Promise<T> {
  const raw = await readJsonBody(ctx.req);
  const result = schema.safeParse(raw ?? {});
  if (!result.success) throw AppError.fromZod(result.error);
  return result.data;
}

/** Validates query string parameters. Repeated keys keep the first value. */
export function parseQuery<T>(ctx: RequestContext, schema: ZodType<T>): T {
  const raw: Record<string, string> = {};
  for (const [key, value] of ctx.url.searchParams) if (!(key in raw)) raw[key] = value;
  const result = schema.safeParse(raw);
  if (!result.success) throw AppError.fromZod(result.error, 'Some query parameters are invalid');
  return result.data;
}

/** Validates path parameters. */
export function parseParams<T>(ctx: RequestContext, schema: ZodType<T>): T {
  const result = schema.safeParse(ctx.params);
  if (!result.success) throw AppError.fromZod(result.error, 'The address is not valid');
  return result.data;
}

export function headerValue(req: IncomingMessage, name: string): string | null {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** Best-effort client IP for rate limiting. Vercel sets x-forwarded-for; the first entry is the client. */
export function clientIp(req: IncomingMessage): string {
  const forwarded = headerValue(req, 'x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? 'unknown';
  const realIp = headerValue(req, 'x-real-ip');
  if (realIp) return realIp;
  return req.socket.remoteAddress ?? 'unknown';
}
