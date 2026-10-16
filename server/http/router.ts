import type { IncomingMessage, ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { getEnv } from '../env';
import { AppError } from '../lib/errors';
import { randomRequestId } from '../lib/ids';
import { logger } from '../lib/logger';
import { assertAllowedOrigin } from './origin';
import { sendError, sendJson } from './respond';
import type { HttpMethod, Principal, RequestContext, RouteDefinition } from './types';

const METHODS: ReadonlySet<string> = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const MUTATING: ReadonlySet<HttpMethod> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

interface CompiledRoute extends RouteDefinition {
  segments: string[];
}

export type Authenticator = (ctx: RequestContext) => Promise<Principal | null>;

/** Until the auth prompt lands, every non-public route is denied. Deny by default is the safe choice. */
export const denyAllAuthenticator: Authenticator = () => Promise.resolve(null);

export interface Router {
  handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
  routes: readonly RouteDefinition[];
}

function matchSegments(pattern: string[], actual: string[]): Record<string, string> | null {
  if (pattern.length !== actual.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i += 1) {
    const p = pattern[i] ?? '';
    const a = actual[i] ?? '';
    if (p.startsWith(':')) {
      try {
        params[p.slice(1)] = decodeURIComponent(a);
      } catch {
        return null;
      }
    } else if (p !== a) {
      return null;
    }
  }
  return params;
}

/** Internal routes (cron, maintenance) carry `Authorization: Bearer <CRON_SECRET>`. */
function assertCronSecret(req: IncomingMessage): void {
  const secret = getEnv().CRON_SECRET;
  const header = req.headers.authorization ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!secret) throw new AppError('FORBIDDEN', 'Not allowed');
  if (
    provided.length !== secret.length ||
    !timingSafeEqual(Buffer.from(provided), Buffer.from(secret))
  ) {
    throw new AppError('FORBIDDEN', 'Not allowed');
  }
}

export function createRouter(
  definitions: readonly RouteDefinition[],
  authenticate: Authenticator,
): Router {
  const compiled: CompiledRoute[] = definitions.map((d) => ({
    ...d,
    segments: d.path.split('/').filter(Boolean),
  }));

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const requestId = randomRequestId();
    res.setHeader('X-Request-Id', requestId);
    const started = Date.now();
    const url = new URL(req.url ?? '/', 'http://localhost');
    const methodRaw = (req.method ?? 'GET').toUpperCase();
    try {
      if (methodRaw === 'HEAD' || methodRaw === 'OPTIONS') {
        throw new AppError('METHOD_NOT_ALLOWED', 'Method not allowed');
      }
      if (!METHODS.has(methodRaw)) throw new AppError('METHOD_NOT_ALLOWED', 'Method not allowed');
      const method = methodRaw as HttpMethod;
      // CSRF guard runs before routing so a cross-site request learns nothing about the API.
      if (MUTATING.has(method)) assertAllowedOrigin(req);
      const actual = url.pathname.split('/').filter(Boolean);

      let matchedPath = false;
      let route: CompiledRoute | null = null;
      let params: Record<string, string> = {};
      for (const candidate of compiled) {
        const m = matchSegments(candidate.segments, actual);
        if (!m) continue;
        matchedPath = true;
        if (candidate.method === method) {
          route = candidate;
          params = m;
          break;
        }
      }
      if (!route) {
        if (matchedPath) throw new AppError('METHOD_NOT_ALLOWED', 'Method not allowed');
        throw new AppError('NOT_FOUND', 'No such endpoint');
      }

      const ctx: RequestContext = {
        req,
        res,
        method,
        url,
        params,
        requestId,
        principal: null,
        now: new Date(),
      };

      if (route.auth === 'internal') {
        assertCronSecret(req);
      } else if (route.auth !== 'public') {
        const principal = await authenticate(ctx);
        if (!principal) throw new AppError('AUTH_REQUIRED', 'Please sign in');
        if (route.auth === 'owner' && principal.role !== 'owner') {
          throw new AppError('FORBIDDEN', 'Owner access is required');
        }
        ctx.principal = principal;
      }

      const result = await route.handler(ctx);
      sendJson(res, result.status ?? 200, result.body, result.headers);
      logger.info('request', {
        requestId,
        method,
        path: url.pathname,
        status: result.status ?? 200,
        ms: Date.now() - started,
      });
    } catch (error) {
      sendError(res, error, requestId);
    }
  }

  return { handle, routes: definitions };
}
