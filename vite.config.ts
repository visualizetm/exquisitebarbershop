import { execSync } from 'node:child_process';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
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

/** The public origin for absolute URLs in index.html (Open Graph needs them). Not a secret. */
function resolveSiteUrl(): string {
  const fromEnv = process.env.APP_BASE_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (!fromEnv) return 'http://localhost:5173';
  return (fromEnv.startsWith('http') ? fromEnv : `https://${fromEnv}`).replace(/\/$/, '');
}

/**
 * Fills %SITE_URL% in index.html and preloads the three Jost files so text renders in the
 * right font from the first paint (otherwise the swap shifts the whole page below the hero).
 */
function headPlugin(): Plugin {
  return {
    name: 'exq-head',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const fonts = Object.keys(ctx.bundle ?? {}).filter((file) =>
          /jost-latin-(400|500|700)-normal.*\.woff2$/.test(file),
        );
        return {
          html: html.replaceAll('%SITE_URL%', resolveSiteUrl()),
          tags: fonts.map((href) => ({
            tag: 'link',
            injectTo: 'head',
            attrs: {
              rel: 'preload',
              as: 'font',
              type: 'font/woff2',
              crossorigin: '',
              href: `/${href}`,
            },
          })),
        };
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), tsconfigPaths({ projects: ['./tsconfig.app.json'] }), headPlugin()],
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
      // The sitemap is built by the API from the live chair list (vercel.json rewrites it too).
      '/sitemap.xml': {
        target: `http://127.0.0.1:${process.env.API_PORT ?? '3001'}`,
        changeOrigin: false,
        rewrite: () => '/api/sitemap.xml',
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
