import { createServer, type Server } from 'node:http';
import { getRouter } from './app';

/** Plain Node server exposing the same router for local development. */
export function createDevServer(): Server {
  const router = getRouter();
  return createServer((req, res) => {
    void router.handle(req, res);
  });
}
