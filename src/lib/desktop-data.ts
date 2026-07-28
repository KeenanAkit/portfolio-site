/**
 * Build-time loader for the props the Desktop React island needs.
 *
 * Astro content collections live inside the build, not the runtime, so the
 * React shell can't read them itself. Every Astro page that mounts <Desktop>
 * calls this helper to extract photos, projects, and posts (with MDX bodies
 * pre-rendered to HTML) and hands the result down as props.
 *
 * Lives here instead of inside each page so /, /photos, /photos/gallery,
 * /photos/gallery/{slug}, /photos/category/{cat}, and the cat+slug variant
 * stay in sync without copy-paste drift.
 */

import { getCollection } from 'astro:content';
import { getImage } from 'astro:assets';
import { inferRemoteSize } from 'astro/assets/utils';
import { marked } from 'marked';

import { isPlaceholderTitle } from './photo-display';

import type {
  PhotoListEntry,
  CategoryListEntry,
} from '../components/apps/PhotosApp';
import type { ProjectListEntry } from '../components/apps/ProjectsApp';
import type { PostListEntry } from '../components/apps/NotepadApp';

// GFM matches the writing voice in src/content. `breaks: false` keeps single
// newlines from turning into <br>, so the prose flows the way it's written.
//
// TRUST BOUNDARY: marked output is injected via dangerouslySetInnerHTML in
// ProjectsApp/NotepadApp WITHOUT sanitization. That is safe ONLY because the
// markdown source is local content files authored by the repo owner and baked
// at build time — there is no user-supplied or remote markdown. If a CMS,
// comments, or any third-party markdown source is ever wired in here, pipe
// this through DOMPurify (or enable a sanitizer) before it reaches the DOM.
marked.setOptions({ gfm: true, breaks: false });

export interface DesktopData {
  photos: PhotoListEntry[];
  projects: ProjectListEntry[];
  posts: PostListEntry[];
  categories: CategoryListEntry[];
}

// The static build emits one page per photo (gallery + "all" + per-category
// slug routes) plus the index and category landings — 400+ pages, and every
// one mounts <Desktop> and calls loadDesktopData(). The data is identical on
// each, but each call re-runs `getImage` twice and a remote `inferRemoteSize`
// probe for all ~142 photos, so an un-memoized load fires tens of thousands of
// redundant R2 round-trips per build. Compute it once and share the result
// across every page in the same build process.
//
// Only cached under PROD (the static build). `astro dev` re-runs page
// frontmatter per request and must see content edits live, so dev skips the
// cache and always recomputes.
let cachedDesktopData: Promise<DesktopData> | null = null;

export function loadDesktopData(): Promise<DesktopData> {
  if (import.meta.env.PROD) {
    return (cachedDesktopData ??= computeDesktopData());
  }
  return computeDesktopData();
}

async function computeDesktopData(): Promise<DesktopData> {
  const allPhotos = (await getCollection('photos')).sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime()
  );

  // Each photo needs three remote round-trips to R2 (two getImage transforms +
  // a dimension probe). `Promise.all` over the whole library fires all ~142 at
  // once, and 15MB originals + Cloudflare's connection ceiling mean the burst
  // reliably drops a connection — and one `FailedToFetchRemoteImageDimensions`
  // aborts the entire build. Bound the concurrency and retry transient
  // failures so a single dropped socket doesn't kill a multi-minute build.
  const photos: PhotoListEntry[] = await mapWithConcurrency(
    allPhotos,
    PHOTO_BUILD_CONCURRENCY,
    (p) =>
      withRetry(async () => {
        // getImage on remote photos: pass a widths array (responsive set) so
        // sharp resizes each variant proportionally from the inferred
        // original. A single `width` value leaves the height at the original,
        // producing broken sliver-shaped AVIFs; the widths path preserves
        // aspect ratio per variant.
        //
        // CAUTION: with `widths`, `.src` is the untouched multi-megapixel
        // ORIGINAL (the no-srcset fallback). The resized variants live only in
        // `.srcSet`. Always serve from the srcSet (see `smallestVariant` +
        // the `srcSet`/`sizes` on the grid img) or the grid downloads 5000px
        // originals for 200px frames.
        const full = await getImage({
          src: p.data.image,
          inferSize: true,
          format: 'avif',
          quality: 82,
          widths: [1600],
        });
        const thumb = await getImage({
          src: p.data.image,
          inferSize: true,
          format: 'avif',
          quality: 70,
          widths: [240, 480, 720],
        });
        // The justified gallery grid packs each row to a shared height, so it
        // needs every photo's native aspect ratio up front to size frames
        // without a layout shift. Probe the remote original's dimensions
        // (header bytes only, no extra image emitted). A failed probe falls
        // back to 3:2, the dominant 35mm frame in this library.
        const aspectRatio = await inferPhotoAspectRatio(p.data.image);
        return {
          slug: p.id,
          title: p.data.title,
          titleIsPlaceholder: isPlaceholderTitle(p.data.title, p.id),
          imageSrc: smallestVariant(full),
          thumbSrc: smallestVariant(thumb),
          thumbSrcSet: thumb.srcSet.attribute,
          aspectRatio,
          date: p.data.date.toISOString(),
          location: p.data.location,
          camera: p.data.camera,
          film: p.data.film,
          caption: p.data.caption,
          featured: p.data.featured,
          tags: p.data.tags,
        };
      })
  );

  const allCategories = (await getCollection('collections')).sort(
    (a, b) => a.data.order - b.data.order
  );

  const categories: CategoryListEntry[] = allCategories.map((c) => {
    const coverSrc = pickCategoryCoverSrc(c.data, photos);
    return {
      slug: c.id,
      title: c.data.title,
      description: c.data.description,
      coverSrc,
      lighting: c.data.lighting,
      order: c.data.order,
      filter: c.data.filter,
    };
  });

  const allProjects = (await getCollection('projects')).sort(
    (a, b) => b.data.year - a.data.year
  );

  const projects: ProjectListEntry[] = await Promise.all(
    allProjects.map(async (p) => ({
      slug: p.id,
      title: p.data.title,
      year: p.data.year,
      role: p.data.role,
      stack: p.data.stack,
      summary: p.data.summary,
      links: p.data.links,
      bodyHtml: await marked.parse(p.body ?? ''),
      featured: p.data.featured,
    }))
  );

  const allPosts = (
    await getCollection('posts', (post) => !post.data.draft)
  ).sort((a, b) => b.data.date.getTime() - a.data.date.getTime());

  const posts: PostListEntry[] = await Promise.all(
    allPosts.map(async (post) => ({
      slug: post.id,
      title: post.data.title,
      date: post.data.date.toISOString(),
      excerpt: post.data.excerpt,
      tags: post.data.tags,
      bodyHtml: await marked.parse(post.body ?? ''),
    }))
  );

  return { photos, projects, posts, categories };
}

// How many photos to process against R2 at once during the build. Sharp
// decodes 15MB+ originals, so this also caps peak memory. Tuned to stay under
// Cloudflare's per-client connection ceiling while keeping the build parallel
// enough to finish in a couple of minutes. Bump cautiously — too high and the
// dropped-connection failures return.
const PHOTO_BUILD_CONCURRENCY = 12;

/** Map over `items` running at most `limit` async `fn`s at a time, preserving
 *  input order in the result. A bounded pool instead of Promise.all so the
 *  build doesn't open 142 sockets to R2 in one burst. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  const pool = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(pool);
  return results;
}

/** Retry an async op a few times with linear backoff. R2/Cloudflare drop the
 *  odd connection under load; a transient `FailedToFetchRemoteImageDimensions`
 *  should cost a retry, not the whole build. Re-throws after the last attempt
 *  so a genuinely broken image (bad URL, 404) still surfaces. */
async function withRetry<R>(fn: () => Promise<R>, attempts = 3): Promise<R> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < attempts) await sleep(attempt * 500);
    }
  }
  throw lastErr;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Pull the smallest resized URL out of a getImage result. Used as the `src`
 *  fallback because the result's own `.src` is the full-size original (see the
 *  CAUTION note at the call site). Falls back to `.src` only if the srcSet is
 *  somehow empty. */
function smallestVariant(img: Awaited<ReturnType<typeof getImage>>): string {
  return img.srcSet.values[0]?.url ?? img.src;
}

/** Default aspect ratio when a remote probe fails: 3:2, the dominant 35mm
 *  film frame in this library, so a fallback frame still sits in a row
 *  without distorting it. */
const DEFAULT_ASPECT_RATIO = 3 / 2;

/** Probe a remote photo's native dimensions and return width / height. Any
 *  probe failure (network, unsupported format) degrades to the 3:2 default
 *  rather than failing the whole build over one bad image. */
async function inferPhotoAspectRatio(image: string): Promise<number> {
  try {
    const { width, height } = await inferRemoteSize(image);
    if (width > 0 && height > 0) return width / height;
  } catch {
    // fall through to the default
  }
  return DEFAULT_ASPECT_RATIO;
}

/** Pick the cover image for a category. Honours an explicit `cover` URL if
 *  set; otherwise auto-picks the most recent photo whose tags match the
 *  category's filter rule. Returns empty string if nothing matches — the
 *  card renders a placeholder slot in that case. */
function pickCategoryCoverSrc(
  category: {
    cover?: string;
    filter: { tag: string } | { slugs: string[] };
  },
  photos: PhotoListEntry[]
): string {
  if (category.cover) return category.cover;
  const f = category.filter;
  const match =
    'tag' in f
      ? photos.find((p) => p.tags.includes(f.tag))
      : photos.find((p) => f.slugs.includes(p.slug));
  return match?.thumbSrc ?? '';
}
