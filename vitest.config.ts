import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  // The app project is listed so unit tests can import pure helpers from src/lib.
  plugins: [tsconfigPaths({ projects: ['./tsconfig.node.json', './tsconfig.app.json'] })],
  define: {
    __BUILD_SHA__: JSON.stringify('test'),
    __SHOP_PHONE__: JSON.stringify('(610) 555-0100'),
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/helpers/global-setup.ts'],
    pool: 'forks',
    testTimeout: 30_000,
    hookTimeout: 120_000,
    coverage: {
      provider: 'v8',
      include: ['server/**', 'shared/**', 'seed/**'],
      // The bundle is generated from the code above; scripts/test-vercel-function.mjs runs it.
      exclude: ['server/http/dev-adapter.ts', 'server/bundle/**'],
      reporter: ['text-summary', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 70,
      },
    },
  },
});
