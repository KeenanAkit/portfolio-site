// Display helpers for photo titles.
//
// When a photo is ingested without a real title in its EXIF/XMP, the pipeline
// (scripts/lib/ingest-photo.mjs) derives a placeholder from the filename via
// slugToTitle — e.g. "Img 3820", "Dsf0315". Those are scaffolding, not real
// titles, and shouldn't render as visible labels or headings on the live site.
// We detect them by reproducing the slug→title transform and comparing.
//
// Keep slugToTitle in sync with scripts/lib/slug.mjs (the ingest side). The
// logic is trivial and duplicated rather than shared because the ingest is an
// .mjs build script and this is TS in the Astro/React build.

export function slugToTitle(slug: string): string {
  return slug
    .split('-')
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** True when `title` is just the filename-derived placeholder for `slug`. */
export function isPlaceholderTitle(title: string, slug: string): boolean {
  return title.trim() === slugToTitle(slug);
}

/** The title to show, or null when it's a placeholder the author hasn't set. */
export function displayTitle(title: string, slug: string): string | null {
  return isPlaceholderTitle(title, slug) ? null : title;
}
