// @ts-check
import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';

// SITE_URL is the single place the production domain is configured.
// It drives canonical URLs, Open Graph URLs, robots.txt and the sitemap.
const { SITE_URL } = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), '');

export default defineConfig({
  site: SITE_URL || 'http://localhost:4321',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },
});
