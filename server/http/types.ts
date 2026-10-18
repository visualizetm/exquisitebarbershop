import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Who may call a route. Every route must declare one; there is no default.
 * - public: anyone
 * - barber: any signed-in login (barber or owner); services scope barbers to their chair
 * - owner: owner logins only
 * - internal: the cron bearer token only
 */
export type AuthLevel = 'public' | 'barber' | 'owner' | 'internal';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Who is calling. Filled by the cookie authenticator; public routes see null. */
export interface Principal {
  userId: string;
  role: 'owner' | 'barber';
  /** The staff record a login acts for. Barbers can only ever touch this chair. */
  staffId: string | null;
  sessionId: string;
  email: string;
  /** A temporary password is in use; only the password change and sign-out routes answer. */
  mustChangePassword: boolean;
}

export interface RequestContext {
  req: IncomingMessage & { body?: unknown };
  res: ServerResponse;
  method: HttpMethod;
  url: URL;
  params: Record<string, string>;
  requestId: string;
  principal: Principal | null;
  now: Date;
}

export interface RouteResult {
  status?: number;
  body: unknown;
  headers?: Record<string, string>;
}

export type RouteHandler = (ctx: RequestContext) => Promise<RouteResult>;

export interface RouteDefinition {
  method: HttpMethod;
  /** Path pattern relative to the origin, for example "/api/staff/:slug". */
  path: string;
  auth: AuthLevel;
  /** Reachable while a temporary password is still in use (sign out, me, password change). */
  allowDuringPasswordChange?: boolean;
  /**
   * Internal routes that the /setup page may call with BOOTSTRAP_SECRET as well as
   * the cron secret. They answer 404 while BOOTSTRAP_SECRET is unset and the
   * caller is not the cron.
   */
  bootstrap?: boolean;
  /** Keeps answering in maintenance mode and while the environment is incomplete. */
  alwaysOn?: boolean;
  /**
   * Exists only while DEMO_MODE=true. With the mode off the router never matches the
   * route, so it answers 404 exactly like an address that was never built.
   */
  demoOnly?: boolean;
  handler: RouteHandler;
}
