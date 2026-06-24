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

export async function loadDesktopData(): Promise<DesktopData> {
  const allPhotos = (await getCollection('photos')).sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime()
  );

  const photos: PhotoListEntry[] = await Promise.all(
    allPhotos.map(async (p) => {
      // getImage on remote photos: pass widths array (responsive set) so
      // sharp resizes each variant proportionally from the inferred
      // original. With a single `width` value sharp constrains width
      // correctly but leaves height at the original, producing broken
      // sliver-shaped AVIFs. The widths array path goes through Astro's
      // responsive pipeline which preserves aspect ratio per variant.
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
        widths: [320],
      });
      return {
        slug: p.id,
        title: p.data.title,
        titleIsPlaceholder: isPlaceholderTitle(p.data.title, p.id),
        imageSrc: full.src,
        thumbSrc: thumb.src,
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
