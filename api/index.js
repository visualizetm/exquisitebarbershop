import { randomBytes } from 'node:crypto';

/**
 * The only serverless function. Vercel routes every /api/* request here and runs this file
 * with plain Node ESM, so it is plain JavaScript with no imports of ours except the bundle.
 * The bundle, server/bundle/app.mjs, is the whole API in one file (scripts/build-api.mjs,
 * committed, checked fresh in CI). It is loaded here, inside the handler, so a load failure
 * (a native add-on that will not load, a bad deploy) becomes a JSON answer with an error
 * code instead of Vercel's own FUNCTION_INVOCATION_FAILED page.
 *
 * The answers never carry the underlying message: it can hold paths or connection strings.
 */
let loading = null;

function load() {
  loading ??= import('../server/bundle/app.mjs');
  return loading;
}

function answer(res, status, code, message) {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(
    JSON.stringify({
      ok: false,
      error: { code, message, requestId: randomBytes(8).toString('hex') },
    }),
  );
}

function describe(error) {
  const text = error instanceof Error ? error.message : String(error);
  // A connection string must never reach a log line.
  return text.replace(/mongodb(\+srv)?:\/\/\S+/g, 'mongodb://...').slice(0, 300);
}

export default async function handler(req, res) {
  let app;
  try {
    app = await load();
  } catch (error) {
    loading = null;
    console.error(
      JSON.stringify({
        level: 'error',
        message: 'function failed to load',
        name: error instanceof Error ? error.name : 'Error',
        code: error?.code,
        detail: describe(error),
      }),
    );
    answer(res, 503, 'FUNCTION_LOAD_FAILED', 'The site could not start. Please call the shop.');
    return;
  }
  try {
    await app.default(req, res);
  } catch (error) {
    console.error(
      JSON.stringify({ level: 'error', message: 'function failed', detail: describe(error) }),
    );
    answer(res, 500, 'INTERNAL_ERROR', 'Something went wrong on our side');
  }
}
