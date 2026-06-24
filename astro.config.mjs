// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://keenanakit.com',
  integrations: [react(), mdx(), sitemap()],
  // /photos/gallery/[slug] is the canonical single-photo URL. public/_redirects
  // gives Cloudflare Pages a proper 301; this entry mirrors it so `astro dev`
  // and the static build emit a redirect too. Same source of truth in both
  // layers means no surprises when promoting from preview.
  redirects: {
    '/photos/[slug]': '/photos/gallery/[slug]',
  },
  image: {
    // Sharp is the default service in Astro 6. Listed for clarity.
    service: { entrypoint: 'astro/assets/services/sharp' },
    // Photo originals live in Cloudflare R2 and are served from this custom
    // domain. Whitelisting the host lets <Image> and getImage() pull from R2
    // during build and run them through sharp for AVIF variants. Override
    // for staging via env if we ever need a second bucket.
    remotePatterns: [
      { protocol: 'https', hostname: 'photos.keenanakit.com' },
    ],
  },
  vite: {
    ssr: {
      // 98.css ships CSS imports; pre-bundle for SSR.
      noExternal: ['98.css'],
    },
  },
});
