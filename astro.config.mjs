// @ts-check
import { defineConfig } from 'astro/config';

// Where the site is served from.
// - Cloudflare Pages (it sets CF_PAGES during builds): at the root of the
//   project's address. Set SITE_URL in the project's environment variables to
//   the site's address (e.g. https://trutech.pages.dev or a custom domain);
//   without it, the address of the build itself is used.
// - GitHub Pages: under /<repo-name>/. The deploy workflow passes the
//   repository's current name, so renaming the repo can't break the site.
// BASE_PATH and SITE_URL override both.
const cloudflare = Boolean(process.env.CF_PAGES);
const site = process.env.SITE_URL ?? (cloudflare ? process.env.CF_PAGES_URL : undefined) ?? 'https://ridgevalley111243.github.io';
const base = process.env.BASE_PATH ?? (cloudflare ? '/' : '/trutechwebsite');

export default defineConfig({
  site,
  base,
  trailingSlash: 'ignore',
  // CSS in the page itself, so it doesn't hold up the first paint.
  build: { inlineStylesheets: 'always' },
  // Photos uploaded in the admin and files already on the live site are
  // resized at build time (src/lib/images.ts).
  image: {
    remotePatterns: [
      { protocol: 'https', hostname: 'ypliibgdetwgbdlxjirg.supabase.co', pathname: '/storage/v1/object/public/**' },
      { protocol: 'https', hostname: new URL(site).hostname },
    ],
  },
});
