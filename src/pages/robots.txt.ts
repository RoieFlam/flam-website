import type { APIRoute } from 'astro';

// Staging/preview builds (no SITE_URL) are kept out of search engines entirely.
export const GET: APIRoute = ({ site }) => {
  const live = Boolean(import.meta.env.SITE_URL);
  const body = live
    ? `User-agent: *\nAllow: /\n\nSitemap: ${new URL('/sitemap.xml', site)}\n`
    : 'User-agent: *\nDisallow: /\n';
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
