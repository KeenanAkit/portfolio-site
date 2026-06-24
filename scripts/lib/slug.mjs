// scripts/lib/slug.mjs
//
// Filename / title slugification. URL-safe, all lowercase, hyphen-separated.
// Strips extensions; collapses runs of non-alphanumerics; trims leading/trailing
// hyphens. Stable across re-runs so the same source file always lands at the
// same slug (and the same content collection entry).

import { basename, extname } from 'node:path';

/**
 * Turn a string into a URL-safe slug.
 *
 *   slugify('My Big Sur Trip!') → 'my-big-sur-trip'
 *   slugify('Big_Sur 2026-03.JPG') → 'big-sur-2026-03'
 *   slugify('IMG_4231') → 'img-4231'
 */
export function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Derive a slug from a file path, stripping the extension first so
 * 'big-sur.jpg' and 'big-sur.JPG' produce the same 'big-sur'.
 */
export function slugForFile(filePath) {
  const name = basename(filePath, extname(filePath));
  return slugify(name);
}

/**
 * Turn a slug into a default title, capitalizing each word.
 *
 *   slugToTitle('big-sur-dawn') → 'Big Sur Dawn'
 *
 * Used as a placeholder when no XMP title is available. The author edits the
 * frontmatter before commit anyway, so this just gets a sensible default.
 */
export function slugToTitle(slug) {
  return slug
    .split('-')
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
