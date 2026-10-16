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
