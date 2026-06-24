import { useWindowManager, type WinId } from '../desktop/windowManager';
import { PhotosStorefront } from './photos/PhotosStorefront';
import { PhotosGallery } from './photos/PhotosGallery';
import { readPhotosState } from './photos/types';

/**
 * Shape of a photo entry the desktop hands the React island. The Astro
 * page extracts these at build time from the content collection (since the
 * collection API is build-time only) and passes them in as props.
 */
export interface PhotoListEntry {
  slug: string;
  title: string;
  /** True when `title` is the filename-derived placeholder (no real title set
   *  yet). Visible labels/headings suppress it; see src/lib/photo-display.ts. */
  titleIsPlaceholder: boolean;
  /** Full-resolution image URL for the lightbox (e.g. /_astro/...avif). */
  imageSrc: string;
  /** Thumbnail-sized URL used in the grid. */
  thumbSrc: string;
  /** ISO date string. */
  date: string;
  location?: string;
  camera?: string;
  film?: string;
  caption?: string;
  featured: boolean;
  /** Tags from frontmatter — used for client-side category filtering so the
   *  React island doesn't need to re-read the content collection. */
  tags: string[];
}

/**
 * Shape of a category entry. Carries enough metadata for the landing room's
 * exhibit cards (cover, title, lighting tint) plus the filter rule so the
 * React island can filter the photos array client-side.
 */
export interface CategoryListEntry {
  slug: string;
  title: string;
  description?: string;
  coverSrc: string;
  lighting: 'dusk' | 'amber' | 'sodium' | 'tungsten' | 'moon';
  order: number;
  /** Mirrors the content schema. Tag rule OR explicit slug list. */
  filter: { tag: string } | { slugs: string[] };
}

interface Props {
  id: WinId;
  photos: PhotoListEntry[];
  categories: CategoryListEntry[];
}

/**
 * "My Pictures.exe" — dispatches between the storefront exterior and the
 * gallery interior based on `mode` in the window's perAppState slice.
 *
 * Cold-load default is `mode = 'exterior'` (every-visit
 * storefront). The mode field deliberately does NOT persist; Desktop
 * hydration resets it on cold load.
 *
 * URL routing in url-sync.ts reflects the active mode + category + slug
 * into the URL via pushState/replaceState. See url-sync.ts header comment
 * for the full hierarchy.
 *
 * Each substate (PhotosStorefront, PhotosGallery) owns its own pixel-art
 * sprite layers; this dispatcher stays thin so swapping subcomponents
 * doesn't ripple.
 */
export function PhotosApp({ id, photos, categories }: Props) {
  const rawState = useWindowManager((s) => s.perAppState[id]);
  const { mode } = readPhotosState(rawState);

  if (mode === 'exterior') {
    return <PhotosStorefront id={id} />;
  }
  return <PhotosGallery id={id} photos={photos} categories={categories} />;
}
