import { createServer, type Server } from 'node:http';
import { serveLocalUploads } from '../storage/localHttp';
import { getRouter } from './app';

/** Plain Node server exposing the same router for local development. */
export function createDevServer(): Server {
  const router = getRouter();
  return createServer((req, res) => {
    void serveLocalUploads(req, res).then((handled) => {
      if (!handled) return router.handle(req, res);
      return undefined;
    });
  });
}
