import { execSync } from 'node:child_process';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

function resolveBuildSha(): string {
  const fromVercel = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA;
  if (fromVercel) return fromVercel;
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

export default defineConfig({
  plugins: [react(), tsconfigPaths({ projects: ['./tsconfig.app.json'] })],
  define: {
    __BUILD_SHA__: JSON.stringify(resolveBuildSha()),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${process.env.API_PORT ?? '3001'}`,
        changeOrigin: false,
      },
      // Local photo storage (STORAGE_DRIVER=local) is served by the API process.
      '/uploads': {
        target: `http://127.0.0.1:${process.env.API_PORT ?? '3001'}`,
        changeOrigin: false,
      },
    },
  },
  build: {
    sourcemap: false,
    target: 'es2022',
  },
});
