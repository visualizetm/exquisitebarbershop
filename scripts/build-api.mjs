import { build } from 'esbuild';
import { statSync } from 'node:fs';

/**
 * Bundles the whole API into one ESM file, server/bundle/app.mjs, which is committed.
 *
 * Why: Vercel compiles api/*.ts file by file and runs the result with plain Node ESM, where
 * `import '../server/http/app'` (no extension) does not resolve, so the function died before
 * running any of our code. One bundle has no relative imports left to resolve.
 *
 * Why committed: Vercel finds functions and traces their files from the repository, before
 * or beside the build command, so a file the build writes might not be there when it traces.
 * CI rebuilds it and fails if the committed copy is stale (git diff --exit-code).
 *
 * External (resolved from node_modules at runtime, traced into the function by Vercel):
 * mongodb and @node-rs/argon2, which ship native code or optional native add-ons. Everything
 * else is plain JavaScript and is bundled. Nothing dev-only can end up here: the entry
 * imports only server code, and the result is checked for forbidden packages below.
 */
const OUTFILE = 'server/bundle/app.mjs';
const EXTERNAL = ['mongodb', '@node-rs/argon2'];
const FORBIDDEN = ['mongodb-memory-server', 'vitest', 'tsx', 'vite', 'esbuild', 'playwright'];

const result = await build({
  entryPoints: ['server/vercel-entry.ts'],
  outfile: OUTFILE,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  external: EXTERNAL,
  tsconfig: 'tsconfig.node.json',
  // Bundled CommonJS code (if any dependency has some) may call require().
  banner: {
    js: "import { createRequire as __exqCreateRequire } from 'node:module';\nconst require = __exqCreateRequire(import.meta.url);",
  },
  legalComments: 'none',
  sourcemap: false,
  minify: false,
  metafile: true,
  logLevel: 'error',
});

const inputs = Object.keys(result.metafile.inputs);
const bad = inputs.filter((file) =>
  FORBIDDEN.some((name) => file.startsWith(`node_modules/${name}/`)),
);
if (bad.length > 0) {
  console.error(`The API bundle pulled in dev-only packages:\n${bad.slice(0, 10).join('\n')}`);
  process.exit(1);
}
const externals = new Set();
for (const out of Object.values(result.metafile.outputs)) {
  for (const imp of out.imports)
    if (imp.external && !imp.path.startsWith('node:')) externals.add(imp.path);
}
const kb = Math.round(statSync(OUTFILE).size / 1024);
console.log(`API bundle: ${OUTFILE}, ${String(kb)} KB, ${String(inputs.length)} source files`);
console.log(`External packages: ${[...externals].sort().join(', ')}`);
