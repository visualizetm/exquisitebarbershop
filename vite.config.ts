import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

/** The public origin for absolute URLs (Open Graph, the robots Sitemap line). Not a secret. */
function configuredSiteUrl(): string | null {
  const fromEnv = process.env.APP_BASE_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (!fromEnv) return null;
  return (fromEnv.startsWith('http') ? fromEnv : `https://${fromEnv}`).replace(/\/$/, '');
}

function resolveSiteUrl(): string {
  return configuredSiteUrl() ?? 'http://localhost:5173';
}

/**
 * Fills %SITE_URL% in index.html, preloads the three Jost files so text renders in the
 * right font from the first paint (otherwise the swap shifts the whole page below the
 * hero), and adds the Sitemap line to robots.txt when the site URL is known.
 */
function headPlugin(): Plugin {
  let outDir = 'dist';
  return {
    name: 'exq-head',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const site = configuredSiteUrl();
      const robots = resolve(outDir, 'robots.txt');
      if (!site || !existsSync(robots)) return;
      const text = readFileSync(robots, 'utf8').trimEnd();
      writeFileSync(robots, `${text}\nSitemap: ${site}/sitemap.xml\n`);
    },
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
