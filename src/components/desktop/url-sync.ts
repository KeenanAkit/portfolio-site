/**
 * URL <-> window-manager sync.
 *
 * Routing model:
 * - Desktop is a single-page React island at every route. No Astro view
 *   transitions on desktop. The shell never unmounts during a session.
 * - URL routing inside the shell uses history.pushState / replaceState only.
 * - URL precedence on load: URL wins. The matching window opens at the
 *   stored slug; other windows from localStorage restore in their last state
 *   but don't override the focused window.
 *
 * Photos.exe URL hierarchy:
 *   /photos/                        exterior storefront (cold-open default)
 *   /photos/gallery/                interior overview (Featured)
 *   /photos/gallery/{slug}          interior with lightbox
 *   /photos/category/{cat}/         category overview (lighting shifted)
 *   /photos/category/{cat}/{slug}   category + lightbox
 *
 * pushState vs replaceState policy:
 * - Opening / focusing a window: pushState({ winId })
 * - Photos mode change (exterior <-> interior): pushState
 * - Photos category change: pushState (new category = navigation)
 * - First photo click inside Photos (selectedSlug null -> "<slug>"): replaceState
 * - Next/prev photo (slug -> different slug): pushState
 * - Closing lightbox (slug -> null): replaceState
 * - Filter / tag changes: replaceState (not implemented yet, no filters wired)
 *
 * popstate: read state.winId. If matches an open window, focus it and apply
 * its persisted state (mode + category + slug). Otherwise close the focused
 * window. Hitting back from `/` with no windows leaves the site.
 *
 * pageshow: when the browser restores from bfcache, re-sync. Late debounced
 * writes from before the user navigated may have been lost; we read the
 * URL and re-apply it as the source of truth.
 *
 * iOS Safari swipe-back: detect gesture-driven popstate via `e.timeStamp`
 * proximity to a recent touchend on the left edge. Skip the close-flip
 * animation when the native swipe is already animating (handled in Window.tsx
 * by checking the gesturePending flag we set here).
 */

import { useEffect, useRef } from 'react';
import {
  useWindowManager,
  type WindowKind,
  type WindowState,
  type AppState,
  type WinId,
} from './windowManager';

// ---------- Pure path parsing / building ----------

export type PhotosMode = 'exterior' | 'interior';

export interface ParsedPath {
  kind: WindowKind;
  /** 'exterior' only applies to photos; for other kinds always 'interior'. */
  mode: PhotosMode;
  /** Photos category slug ('landscapes' etc.) or null. Non-photos always null. */
  category: string | null;
  /** Lightbox / detail slug, or null. */
  slug: string | null;
}

type PathExtract = (m: RegExpMatchArray) => Omit<ParsedPath, 'kind'>;

interface RouteDef {
  kind: WindowKind;
  pattern: RegExp;
  extract: PathExtract;
}

/**
 * Routes try-list. Order matters: more-specific patterns first so the
 * `/photos/category/foo/bar` pattern wins over `/photos/{slug}` and
 * `/photos/gallery/{slug}` wins over `/photos/{slug}`.
 */
const ROUTES: readonly RouteDef[] = [
  // Photos.exe — 5 patterns from most-specific to least.
  {
    kind: 'photos',
    pattern: /^\/photos\/category\/([^/?#]+)\/([^/?#]+)\/?$/,
    extract: (m) => ({
      mode: 'interior',
      category: decodeURIComponent(m[1]),
      slug: decodeURIComponent(m[2]),
    }),
  },
  {
    kind: 'photos',
    pattern: /^\/photos\/category\/([^/?#]+)\/?$/,
    extract: (m) => ({
      mode: 'interior',
      category: decodeURIComponent(m[1]),
      slug: null,
    }),
  },
  {
    kind: 'photos',
    pattern: /^\/photos\/gallery\/([^/?#]+)\/?$/,
    extract: (m) => ({
      mode: 'interior',
      category: null,
      slug: decodeURIComponent(m[1]),
    }),
  },
  {
    kind: 'photos',
    pattern: /^\/photos\/gallery\/?$/,
    extract: () => ({ mode: 'interior', category: null, slug: null }),
  },
  {
    kind: 'photos',
    pattern: /^\/photos\/?$/,
    extract: () => ({ mode: 'exterior', category: null, slug: null }),
  },
  // Projects.exe — interior only, single-segment slug.
  {
    kind: 'projects',
    pattern: /^\/projects(?:\/([^/?#]+))?\/?$/,
    extract: (m) => ({
      mode: 'interior',
      category: null,
      slug: m[1] ? decodeURIComponent(m[1]) : null,
    }),
  },
  // Notepad.exe (Blog) — interior only, single-segment slug.
  {
    kind: 'notepad',
    pattern: /^\/blog(?:\/([^/?#]+))?\/?$/,
    extract: (m) => ({
      mode: 'interior',
      category: null,
      slug: m[1] ? decodeURIComponent(m[1]) : null,
    }),
  },
] as const;

/** Match a pathname against the known routes. Returns null if no match. */
export function parsePath(pathname: string): ParsedPath | null {
  for (const r of ROUTES) {
    const m = pathname.match(r.pattern);
    if (m) return { kind: r.kind, ...r.extract(m) };
  }
  return null;
}

/** Build the canonical URL path for a window + its app state. */
export function pathFor(
  win: Pick<WindowState, 'kind'>,
  appState?: AppState | undefined
): string {
  const slug = appState?.selectedSlug;
  const slugStr = typeof slug === 'string' && slug.length > 0 ? slug : null;

  if (win.kind === 'photos') {
    const mode = (appState?.mode as PhotosMode | undefined) ?? 'exterior';
    const category = appState?.category;
    const categoryStr =
      typeof category === 'string' && category.length > 0 ? category : null;

    if (mode === 'exterior') return '/photos';
    if (categoryStr) {
      return slugStr
        ? `/photos/category/${categoryStr}/${slugStr}`
        : `/photos/category/${categoryStr}`;
    }
    return slugStr ? `/photos/gallery/${slugStr}` : '/photos/gallery';
  }

  if (win.kind === 'projects') {
    return slugStr ? `/projects/${slugStr}` : '/projects';
  }

  if (win.kind === 'notepad') {
    return slugStr ? `/blog/${slugStr}` : '/blog';
  }

  return '/';
}

/** Internal: opaque state we stuff into history entries. */
interface HistoryEntryState {
  winId: WinId | null;
  mode: PhotosMode | null;
  category: string | null;
  selectedSlug: string | null;
}

function readHistoryState(): HistoryEntryState | null {
  if (typeof history === 'undefined') return null;
  const s = history.state as HistoryEntryState | null | undefined;
  if (!s || typeof s !== 'object') return null;
  if (!('winId' in s)) return null;
  return s;
}

// ---------- Snapshot used to diff push vs replace decisions ----------

interface UrlSnapshot {
  focusedId: WinId | null;
  mode: PhotosMode | null;
  category: string | null;
  selectedSlug: string | null;
  path: string;
}

function captureSnapshot(): UrlSnapshot {
  const state = useWindowManager.getState();
  const focused = state.windows.find((w) => w.id === state.focusedId);
  const app = focused ? state.perAppState[focused.id] : undefined;
  return {
    focusedId: state.focusedId,
    mode: focused?.kind === 'photos'
      ? ((app?.mode as PhotosMode | undefined) ?? null)
      : null,
    category: focused?.kind === 'photos'
      ? ((app?.category as string | undefined) ?? null)
      : null,
    selectedSlug: (app?.selectedSlug as string | undefined) ?? null,
    path: focused ? pathFor(focused, app) : '/',
  };
}

// ---------- React hook ----------

/**
 * Install URL sync on mount. Idempotent: re-mounting under StrictMode is safe.
 *
 * Call once from <Desktop>. Do not call from individual app components.
 */
export function useUrlSync(): void {
  const mounted = useRef(false);
  const lastSnapshot = useRef<UrlSnapshot>({
    focusedId: null,
    mode: null,
    category: null,
    selectedSlug: null,
    path: '/',
  });
  /** When set, the next focused-window change is from popstate, not from a
   *  user action, so we must NOT pushState in response. */
  const fromPopstate = useRef(false);

  // ----- Initial load: parse URL, open matching window if any. -----
  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    if (typeof window === 'undefined') return;

    const parsed = parsePath(window.location.pathname);
    if (parsed) {
      const id = useWindowManager.getState().open(parsed.kind);
      const initState: AppState = {
        selectedSlug: parsed.slug,
      };
      if (parsed.kind === 'photos') {
        initState.mode = parsed.mode;
        initState.category = parsed.category;
      }
      useWindowManager.getState().setAppState(id, initState);

      // Replace the initial history entry with our state shape so popstate
      // handlers later can read winId off it.
      history.replaceState(
        {
          winId: id,
          mode: parsed.kind === 'photos' ? parsed.mode : null,
          category: parsed.category,
          selectedSlug: parsed.slug,
        } satisfies HistoryEntryState,
        '',
        pathFor({ kind: parsed.kind }, initState)
      );
    }
    lastSnapshot.current = captureSnapshot();
  }, []);

  // ----- Watch the store for URL-relevant changes. -----
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const unsubscribe = useWindowManager.subscribe((state, prev) => {
      const focused = state.windows.find((w) => w.id === state.focusedId);
      const prevFocused = prev.windows.find((w) => w.id === prev.focusedId);

      const focusedChanged = state.focusedId !== prev.focusedId;

      const currentSlug =
        (focused && (state.perAppState[focused.id]?.selectedSlug as string | undefined)) ??
        null;
      const prevSlug =
        (prevFocused &&
          (prev.perAppState[prevFocused.id]?.selectedSlug as string | undefined)) ??
        null;

      const currentMode =
        focused?.kind === 'photos'
          ? ((state.perAppState[focused.id]?.mode as PhotosMode | undefined) ?? null)
          : null;
      const prevMode =
        prevFocused?.kind === 'photos'
          ? ((prev.perAppState[prevFocused.id]?.mode as PhotosMode | undefined) ?? null)
          : null;

      const currentCategory =
        focused?.kind === 'photos'
          ? ((state.perAppState[focused.id]?.category as string | undefined) ?? null)
          : null;
      const prevCategory =
        prevFocused?.kind === 'photos'
          ? ((prev.perAppState[prevFocused.id]?.category as string | undefined) ?? null)
          : null;

      const slugChanged = currentSlug !== prevSlug;
      const modeChanged = currentMode !== prevMode;
      const categoryChanged = currentCategory !== prevCategory;

      if (!focusedChanged && !slugChanged && !modeChanged && !categoryChanged) {
        return;
      }

      // From popstate? Don't push, the URL is already what triggered us.
      if (fromPopstate.current) {
        fromPopstate.current = false;
        lastSnapshot.current = captureSnapshot();
        return;
      }

      const nextPath = focused
        ? pathFor(focused, state.perAppState[focused.id])
        : '/';

      // No real path change? skip.
      if (nextPath === lastSnapshot.current.path) {
        lastSnapshot.current = captureSnapshot();
        return;
      }

      // Decision tree:
      // - focused window changed -> pushState
      // - mode changed (exterior <-> interior) -> pushState
      // - category changed -> pushState
      // - slug changed only:
      //   - null -> string: replaceState (first photo click)
      //   - string -> string: pushState (next/prev photo)
      //   - string -> null: replaceState (closing lightbox)
      let action: 'push' | 'replace' = 'push';
      if (!focusedChanged && !modeChanged && !categoryChanged && slugChanged) {
        if (prevSlug === null || currentSlug === null) action = 'replace';
        else action = 'push';
      }

      const newState: HistoryEntryState = {
        winId: state.focusedId,
        mode: currentMode,
        category: currentCategory,
        selectedSlug: currentSlug,
      };

      if (action === 'push') {
        history.pushState(newState, '', nextPath);
      } else {
        history.replaceState(newState, '', nextPath);
      }
      lastSnapshot.current = {
        focusedId: state.focusedId,
        mode: currentMode,
        category: currentCategory,
        selectedSlug: currentSlug,
        path: nextPath,
      };
    });

    return unsubscribe;
  }, []);

  // ----- popstate: user hit back/forward. Resync from URL + state. -----
  useEffect(() => {
    if (typeof window === 'undefined') return;

    function onPopState(_e: PopStateEvent) {
      fromPopstate.current = true;
      const entryState = readHistoryState();
      const parsed = parsePath(window.location.pathname);

      const mgr = useWindowManager.getState();

      // Case 1: history state names a still-open window. Focus + restore.
      if (entryState?.winId) {
        const target = mgr.windows.find((w) => w.id === entryState.winId);
        if (target) {
          mgr.focus(target.id);
          if (target.kind !== 'about' && parsed) {
            const restore: AppState = {
              selectedSlug: entryState.selectedSlug ?? parsed.slug ?? null,
            };
            if (target.kind === 'photos') {
              restore.mode = entryState.mode ?? parsed.mode;
              restore.category = entryState.category ?? parsed.category;
            }
            mgr.setAppState(target.id, restore);
          }
          return;
        }
      }

      // Case 2: path resolves to a known kind. Open it.
      if (parsed) {
        const id = mgr.open(parsed.kind);
        const next: AppState = { selectedSlug: parsed.slug };
        if (parsed.kind === 'photos') {
          next.mode = parsed.mode;
          next.category = parsed.category;
        }
        mgr.setAppState(id, next);
        return;
      }

      // Case 3: at "/" with nothing matching. Close the focused window.
      if (mgr.focusedId) mgr.close(mgr.focusedId);
    }

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // ----- pageshow: bfcache restoration. Re-hydrate from localStorage and
  //       align with the current URL just in case writes were lost. -----
  useEffect(() => {
    if (typeof window === 'undefined') return;

    function onPageShow(e: PageTransitionEvent) {
      if (!e.persisted) return;
      const mgr = useWindowManager.getState();
      mgr.hydrate();
      // After hydrate, align with the URL. Same logic as initial load.
      const parsed = parsePath(window.location.pathname);
      if (!parsed) return;
      const existing = mgr.windows.find((w) => w.kind === parsed.kind);
      if (existing) {
        mgr.focus(existing.id);
        const restore: AppState = { selectedSlug: parsed.slug };
        if (parsed.kind === 'photos') {
          restore.mode = parsed.mode;
          restore.category = parsed.category;
        }
        mgr.setAppState(existing.id, restore);
      } else {
        const id = mgr.open(parsed.kind);
        const init: AppState = { selectedSlug: parsed.slug };
        if (parsed.kind === 'photos') {
          init.mode = parsed.mode;
          init.category = parsed.category;
        }
        mgr.setAppState(id, init);
      }
    }

    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);
}
