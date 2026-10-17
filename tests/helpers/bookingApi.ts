import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomBytes } from 'node:crypto';
import { DateTime } from 'luxon';
import { getRouter } from '../../server/http/app';
import { SHOP_TIMEZONE } from '../../shared/lib/constants';
import { shopLocalToUtc } from '../../shared/lib/time';

export interface TestServer {
  baseUrl: string;
  close(): Promise<void>;
}

export async function startTestServer(): Promise<TestServer> {
  const router = getRouter();
  const server: Server = createServer((req, res) => {
    void router.handle(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    baseUrl,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
  };
}

export interface ApiResult {
  status: number;
  headers: Headers;
  body: Record<string, unknown>;
}

export async function call(
  baseUrl: string,
  method: string,
  path: string,
  options: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<ApiResult> {
  const init: RequestInit = {
    method,
    headers: {
      origin: 'http://localhost:5173',
      // Each call looks like a different client unless the test pins an address.
      'x-forwarded-for': `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
  };
  if (options.body !== undefined) init.body = JSON.stringify(options.body);
  const res = await fetch(`${baseUrl}${path}`, init);
  const text = await res.text();
  return {
    status: res.status,
    headers: res.headers,
    body: text ? (JSON.parse(text) as Record<string, unknown>) : {},
  };
}

export function idemKey(): string {
  return `test-${randomBytes(8).toString('hex')}`;
}

export function phone(): string {
  const n = 2000000 + Math.floor(Math.random() * 7_000_000);
  return `+1215${n}`;
}

/** The next shop-local date with the given ISO weekday (1 = Monday), at least `minDaysAhead` days out. */
export function nextDate(weekday: number, minDaysAhead = 3): string {
  let dt = DateTime.now().setZone(SHOP_TIMEZONE).startOf('day').plus({ days: minDaysAhead });
  while (dt.weekday !== weekday) dt = dt.plus({ days: 1 });
  return dt.toISODate() ?? '';
}

export function slotAt(date: string, hhmm: string): string {
  return shopLocalToUtc(date, hhmm).toISOString();
}

/** Books through the public API and returns the created booking id and manage token. */
export async function bookPublic(
  baseUrl: string,
  input: {
    staff: string;
    serviceIds: string[];
    startAt: string;
    email?: string | null;
    name?: string;
  },
): Promise<{ id: string; referenceCode: string; token: string; staffId: string }> {
  const res = await call(baseUrl, 'POST', '/api/bookings', {
    headers: { 'idempotency-key': idemKey() },
    body: {
      serviceIds: input.serviceIds,
      staff: input.staff,
      startAt: input.startAt,
      customer: { name: input.name ?? 'Test Customer', phone: phone(), email: input.email ?? null },
    },
  });
  if (res.status !== 201)
    throw new Error(`booking failed: ${res.status} ${JSON.stringify(res.body)}`);
  const body = res.body as {
    booking: { id: string; referenceCode: string; staff: { id: string } };
    managePath: string;
  };
  return {
    id: body.booking.id,
    referenceCode: body.booking.referenceCode,
    staffId: body.booking.staff.id,
    token: new URL(body.managePath, 'http://x').searchParams.get('token') ?? '',
  };
}
