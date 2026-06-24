/**
 * Photos.exe per-window state shape. Lives in windowManager's perAppState
 * slice, keyed by window id. The schema is owned here, not in the window
 * manager — the manager treats AppState as Record<string, unknown> and
 * trusts apps to declare their own shapes.
 */

import type { PhotosMode } from '../../desktop/url-sync';

export type LightingCategory = 'dusk' | 'amber' | 'sodium' | 'tungsten' | 'moon';

export interface PhotosAppState {
  /** 'exterior' (city street + storefront) or 'interior' (Gallery room).
   *  Cold-load default is 'exterior' so Photos.exe opens on the storefront
   *  every visit.
   *  This field MUST NOT persist across reloads; reset in Desktop hydration. */
  mode: PhotosMode;
  /** Active category slug, e.g. 'landscapes', or null for Featured/overview. */
  category: string | null;
  /** Lightbox slug, or null when the grid is open. */
  selectedSlug: string | null;
  /** Restored scroll position for the gallery grid. */
  scrollY?: number;
}

/** Type-safe accessor: cast perAppState's any-shaped slice into PhotosAppState
 *  with sensible defaults so the storefront-by-default invariant holds. */
export function readPhotosState(
  raw: Record<string, unknown> | undefined
): PhotosAppState {
  const r = raw ?? {};
  const mode =
    r.mode === 'interior' ? 'interior' : ('exterior' as PhotosMode);
  return {
    mode,
    category: typeof r.category === 'string' ? r.category : null,
    selectedSlug: typeof r.selectedSlug === 'string' ? r.selectedSlug : null,
    scrollY: typeof r.scrollY === 'number' ? r.scrollY : undefined,
  };
}
