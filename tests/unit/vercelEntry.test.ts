import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import handler from '../../server/vercel-entry';

/** A response object that records what the handler wrote. */
function fakeResponse() {
  const state = {
    statusCode: 0,
    headers: new Map<string, string>(),
    body: '',
    headersSent: false,
  };
  const res = {
    get statusCode() {
      return state.statusCode;
    },
    set statusCode(value: number) {
      state.statusCode = value;
    },
    get headersSent() {
      return state.headersSent;
    },
    setHeader(name: string, value: string) {
      state.headers.set(name.toLowerCase(), value);
    },
    end(chunk?: string) {
      state.body += chunk ?? '';
      state.headersSent = true;
    },
  } as unknown as ServerResponse;
  return { res, state };
}

describe('the function body', () => {
  it('answers JSON with an error code when something throws outside the router', async () => {
    // A request address that cannot be parsed throws before the router's own try block.
    const req = { url: 'http://[', method: 'GET', headers: {} } as unknown as IncomingMessage;
    const { res, state } = fakeResponse();
    await handler(req, res);
    expect(state.statusCode).toBe(500);
    expect(state.headers.get('content-type')).toContain('application/json');
    expect(state.headers.get('cache-control')).toBe('no-store');
    const body = JSON.parse(state.body) as {
      ok: boolean;
      error: { code: string; requestId: string };
    };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.requestId).toMatch(/^[0-9a-f]{16}$/);
    // Nothing from the error itself reaches the caller.
    expect(state.body).not.toContain('Invalid URL');
  });

  it('never writes twice when the answer has already started', async () => {
    const req = { url: 'http://[', method: 'GET', headers: {} } as unknown as IncomingMessage;
    const { res, state } = fakeResponse();
    state.headersSent = true;
    await handler(req, res);
    expect(state.body).toBe('');
    expect(state.statusCode).toBe(0);
  });
});
