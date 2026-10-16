import type { IncomingMessage, ServerResponse } from 'node:http';
import { getRouter } from '../server/http/app';

/**
 * The only serverless function. Vercel routes every /api/* request here; the
 * router in server/http dispatches by path. Keeping one function means one warm
 * database connection and no per-plan function count limits.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await getRouter().handle(req, res);
}
