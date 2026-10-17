import { createServer, type Server } from 'node:http';
import { serveLocalUploads } from '../storage/localHttp';
import { getRouter } from './app';

import type { IncomingMessage, ServerResponse } from 'node:http';

export interface DevServerOptions {
  /** Runs first; returning true means the request was answered (the e2e server's reset hook). */
  before?: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;
}

/** Plain Node server exposing the same router for local development. */
export function createDevServer(options: DevServerOptions = {}): Server {
  const router = getRouter();
  return createServer((req, res) => {
    void (options.before ? options.before(req, res) : Promise.resolve(false)).then((done) => {
      if (done) return undefined;
      return serveLocalUploads(req, res).then((handled) => {
        if (!handled) return router.handle(req, res);
        return undefined;
      });
    });
  });
}
