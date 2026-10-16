import type { IncomingMessage, ServerResponse } from 'node:http';

export type AuthLevel = 'public' | 'barber' | 'owner' | 'internal';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Who is calling. Filled by the auth middleware in a later prompt; public routes see null. */
export interface Principal {
  userId: string;
  role: 'owner' | 'barber';
  staffId: string | null;
  sessionId: string;
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
  handler: RouteHandler;
}
