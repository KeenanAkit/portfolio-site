// Content collection schemas.
// Astro 6 Content Layer API: defineCollection + loaders.

import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

// Ingest (scripts/lib/ingest-photo.mjs) scaffolds unfilled prose fields as
// "TODO. ..." placeholders so the author can't forget them. Until they're
// filled in, treat them as absent — otherwise the literal "TODO" string
// renders on the live site (captions, EXIF rows, OG descriptions). An empty
// string is treated the same way.
const blankIfTodo = z.preprocess((v) => {
  if (typeof v === 'string') {
    const t = v.trim();
    if (t === '' || /^TODO\b/i.test(t)) return undefined;
  }
  return v;
}, z.string().optional());

const photos = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/photos' }),
  schema: () =>
    z.object({
      title: z.string(),
      date: z.coerce.date(),
      location: blankIfTodo,
      camera: blankIfTodo,
      lens: blankIfTodo,
      // Film stock for analog scans, so Portra / HP5 / etc. survive in the
      // frontmatter instead of getting jammed into the camera field.
      film: blankIfTodo,
      settings: z
        .object({
          aperture: z.string().optional(),
          shutter: z.string().optional(),
          iso: z.number().optional(),
          focalLength: z.string().optional(),
        })
        .optional(),
      tags: z.array(z.string()).default([]),
      // Public R2 URL under photos.keenanakit.com. Astro pulls + transforms
      // at build via image.remotePatterns in astro.config.mjs. Originals live
      // in the kport-photos R2 bucket; ingest writes the URL via
      // scripts/lib/ingest-photo.mjs.
      image: z.url(),
      // Caption is optional; longer description goes in the markdown body.
      caption: blankIfTodo,
      featured: z.boolean().default(false),
    }),
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/projects' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      year: z.number().int(),
      role: z.string().optional(),
      stack: z.array(z.string()).default([]),
      summary: z.string(),
      image: image().optional(),
      links: z
        .array(
          z.object({
            label: z.string(),
            url: z.url(),
          })
        )
        .default([]),
      featured: z.boolean().default(false),
    }),
});

const posts = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    excerpt: z.string(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

// Featured categories on the mobile homepage. Each entry is a curated collection
// Keenan pins (Landscapes, a specific trip, a year, whatever). Routed at
// /photos/category/[slug].
//
// The `lighting` enum maps a category to the Gallery room's per-category mood:
//   dusk      cozy warm afternoon museum light (default / overview)
//   amber     golden hour (landscapes)
//   sodium    warm lantern night (street)
//   tungsten  tungsten warm interior (motorsports)
//   moon      moonlit silver (events)
const collections_ = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/collections' }),
  schema: () =>
    z.object({
      title: z.string(),
      // Same TODO-placeholder handling as photo prose: an unfilled
      // "TODO. Write a one-line..." description reads as absent so it never
      // renders on the category page or in meta tags.
      description: blankIfTodo,
      // Optional R2 URL. When unset, the gallery auto-picks the most recent
      // matching photo's thumbnail as the cover (see src/lib/desktop-data.ts).
      cover: z.url().optional(),
      // Match against photo frontmatter; either a tag or an explicit slug list.
      filter: z.union([
        z.object({ tag: z.string() }),
        z.object({ slugs: z.array(z.string()).min(1) }),
      ]),
      featured: z.boolean().default(false),
      order: z.number().int().default(0),
      // Gallery room lighting mode when this category is active.
      lighting: z
        .enum(['dusk', 'amber', 'sodium', 'tungsten', 'moon'])
        .default('dusk'),
    }),
});

export const collections = {
  photos,
  projects,
  posts,
  collections: collections_,
};
