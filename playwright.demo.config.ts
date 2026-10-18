import { defineConfig, devices } from '@playwright/test';

/**
 * The showcase run: the built bundle over https with the Vercel headers,
 * the API in production mode with only the demo variables set (DEMO_MODE and STORAGE_DRIVER=mongo).
 * Started by scripts/prodlike-server.ts; see tests/e2e/demo/.
 */
const baseURL = 'https://127.0.0.1:4176';

export default defineConfig({
  testDir: './tests/e2e/demo',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    ...(process.env.PW_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
      : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run e2e:prod-server -- --port=4176 --profile=demo',
    url: `${baseURL}/api/health`,
    ignoreHTTPSErrors: true,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
