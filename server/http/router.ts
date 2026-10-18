import type { IncomingMessage, ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { currentEnvProblems, getEnv, getPartialEnv } from '../env';
import { AppError } from '../lib/errors';
import { randomRequestId } from '../lib/ids';
import { logger } from '../lib/logger';
import { ensureDemo } from '../services/bootstrap';
import { demoEnabled } from '../services/demo';
import { assertAllowedOrigin } from './origin';
import { sendError, sendJson } from './respond';
import type { HttpMethod, Principal, RequestContext, RouteDefinition } from './types';

const METHODS: ReadonlySet<string> = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const MUTATING: ReadonlySet<HttpMethod> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

interface CompiledRoute extends RouteDefinition {
  segments: string[];
}

/** Finds the caller for a protected route: the owner's session cookie or a barber's PIN session. */
export type Authenticator = (
  ctx: RequestContext,
  level: 'owner' | 'team',
) => Promise<Principal | null>;

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

function bearerOf(req: IncomingMessage): string {
  const header = req.headers.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

function sameSecret(provided: string, secret: string | undefined): boolean {
  if (!secret) return false;
  return (
    provided.length === secret.length && timingSafeEqual(Buffer.from(provided), Buffer.from(secret))
  );
}

/**
 * Internal routes (cron, maintenance) carry `Authorization: Bearer <CRON_SECRET>`.
 * Bootstrap routes also take BOOTSTRAP_SECRET, and do not exist while it is unset.
 */
function assertInternalSecret(req: IncomingMessage, route: RouteDefinition): void {
  // The partial environment, so the doctor can be called while a variable is missing.
  const env = getPartialEnv();
  const provided = bearerOf(req);
  if (sameSecret(provided, env.CRON_SECRET)) return;
  if (route.bootstrap === true && provided !== '') {
    if (!env.BOOTSTRAP_SECRET) throw new AppError('NOT_FOUND', 'No such endpoint');
    if (sameSecret(provided, env.BOOTSTRAP_SECRET)) return;
  }
  throw new AppError('FORBIDDEN', 'Not allowed');
}

let configWarned = false;

/**
 * A deployment with missing settings answers 503 everywhere except the health
 * check and the setup routes, which say what is missing. In maintenance mode
 * the public routes answer 503 too, while the staff area keeps working.
 */
async function assertServing(route: RouteDefinition, pathname: string, now: Date): Promise<void> {
  if (route.alwaysOn === true) return;
  const problems = currentEnvProblems();
  if (problems.length > 0) {
    if (!configWarned) {
      configWarned = true;
      logger.error('environment incomplete', { problems: problems.map((p) => p.message) });
    }
    throw new AppError('CONFIG_ERROR', 'The site is not set up yet. Run the doctor at /setup.');
  }
  // Showcase mode sets a fresh database up on the first request that needs it.
  await ensureDemo(now);
  if (getEnv().MAINTENANCE_MODE === 'true' && route.auth === 'public') {
    if (pathname === '/api/shop' || pathname.startsWith('/api/auth/')) return;
    throw new AppError('MAINTENANCE', 'Online booking is having a moment. Please call the shop.');
  }
}

const KNOWN_LEVELS: ReadonlySet<string> = new Set(['public', 'team', 'owner', 'internal']);

/** Deny by default: building a router with a route that has no valid auth level fails at startup. */
export function createRouter(
  definitions: readonly RouteDefinition[],
  authenticate: Authenticator,
): Router {
  for (const d of definitions) {
    if (!KNOWN_LEVELS.has(d.auth)) {
      throw new Error(`Route ${d.method} ${d.path} has no valid auth level`);
    }
  }
  const compiled: CompiledRoute[] = definitions.map((d) => ({
    ...d,
    segments: d.path.split('/').filter(Boolean),
  }));

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const requestId = randomRequestId();
    res.setHeader('X-Request-Id', requestId);
    // The sample shop must not be indexed. API answers carry the header; the pages carry the meta tag.
    if (demoEnabled()) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
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
        // A demo-only route does not exist while the mode is off: no match, so a plain 404.
        if (candidate.demoOnly === true && !demoEnabled()) continue;
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

      await assertServing(route, url.pathname, ctx.now);
      switch (route.auth) {
        case 'public':
          break;
        case 'internal':
          assertInternalSecret(req, route);
          break;
        case 'team': {
          const principal = await authenticate(ctx, 'team');
          if (principal?.role !== 'barber') throw new AppError('AUTH_REQUIRED', 'Please sign in');
          ctx.principal = principal;
          break;
        }
        case 'owner': {
          const principal = await authenticate(ctx, 'owner');
          if (!principal) throw new AppError('AUTH_REQUIRED', 'Please sign in');
          if (principal.mustChangePassword && route.allowDuringPasswordChange !== true) {
            throw new AppError('PASSWORD_CHANGE_REQUIRED', 'Please choose a new password first');
          }
          if (principal.role !== 'owner') {
            throw new AppError('FORBIDDEN', 'Owner access is required');
          }
          ctx.principal = principal;
          break;
        }
        default:
          // Unreachable for typed routes; a route cast past the type check is denied.
          throw new AppError('FORBIDDEN', 'Not allowed');
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
