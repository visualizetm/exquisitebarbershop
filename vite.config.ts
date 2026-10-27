import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type HtmlTagDescriptor, type Plugin } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { shopSettingsSeed } from './seed/shop';

/** The public origin for absolute URLs (Open Graph, the robots Sitemap line). Not a secret. */
function configuredSiteUrl(): string | null {
  const fromEnv = process.env.APP_BASE_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (!fromEnv) return null;
  return (fromEnv.startsWith('http') ? fromEnv : `https://${fromEnv}`).replace(/\/$/, '');
}

/** The showcase build: DEMO_MODE=true in the build environment. */
function demoBuild(): boolean {
  return process.env.DEMO_MODE === 'true';
}

function resolveSiteUrl(): string {
  return configuredSiteUrl() ?? 'http://localhost:5173';
}

/**
 * Fills %SITE_URL% in index.html, adds the demo noindex tag, and adds the Sitemap line to
 * robots.txt when the site URL is known. The Archivo preload is a static tag in index.html
 * (public/fonts, so the file name never changes).
 */
function headPlugin(): Plugin {
  let outDir = 'dist';
  return {
    name: 'exq-head',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const robots = resolve(outDir, 'robots.txt');
      if (!existsSync(robots)) return;
      // The showcase asks crawlers to stay out entirely.
      if (demoBuild()) {
        writeFileSync(robots, 'User-agent: *\nDisallow: /\n');
        return;
      }
      const site = configuredSiteUrl();
      if (!site) return;
      const text = readFileSync(robots, 'utf8').trimEnd();
      writeFileSync(robots, `${text}\nSitemap: ${site}/sitemap.xml\n`);
    },
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const tags: HtmlTagDescriptor[] = [];
        // DEMO_MODE at build time puts noindex in the static HTML, for crawlers that never run scripts.
        if (demoBuild()) {
          tags.push({
            tag: 'meta',
            injectTo: 'head',
            attrs: { name: 'robots', content: 'noindex, nofollow' },
          });
        }
        const phone = shopSettingsSeed.phone;
        const { line1, line2, city, state } = shopSettingsSeed.address;
        const address = [[line1, line2].filter(Boolean).join(', '), city, state].join(', ');
        return {
          html: html
            .replaceAll('%SITE_URL%', resolveSiteUrl())
            .replaceAll('%SHOP_PHONE_TEL%', phone.replace(/[^\d+]/g, ''))
            .replaceAll('%SHOP_PHONE%', phone)
            .replaceAll('%SHOP_ADDRESS%', address),
          tags,
        };
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), tsconfigPaths({ projects: ['./tsconfig.app.json'] }), headPlugin()],
  define: {
    // The placeholder stays in seed/shop.ts; the client only gets the value for the API-down message.
    __SHOP_PHONE__: JSON.stringify(shopSettingsSeed.phone),
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
