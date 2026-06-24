/**
 * Desktop window manager.
 *
 * Single Zustand store. Owns:
 *   - list of open windows (each with id, kind, title, frame, z, minimized, maximized)
 *   - per-app sub-state keyed by window id (scrollY, selectedSlug, filterTag, etc.)
 *   - actions: open, close, focus, minimize, restore, maximize, updatePos,
 *     updateSize, setAppState
 *
 * Persistence: debounced writes through src/lib/storage.ts with schema versioning.
 * Per-app state is GC'd on close so closed windows don't leak.
 * Window-restoration policy (locked): URL wins absolutely on load for the
 * URL-matching window; localStorage restores other windows as last seen.
 *
 * See design doc §"Window-manager responsibilities" for the spec.
 */

import { create } from 'zustand';
import {
  readVersioned,
  debouncedWriteVersioned,
  writeVersioned,
  type Migrator,
} from '../../lib/storage';

// ---------- Types ----------

export type WindowKind =
  | 'photos'
  | 'projects'
  | 'notepad'
  | 'about'
  // Reserved for v1.1+ apps. Listed now so callers can typecheck against the
  // union, but the manager will accept them only when their handlers exist.
  | 'calculator'
  | 'solitaire';

export type WinId = string;

export interface WindowFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WindowState {
  id: WinId;
  kind: WindowKind;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Saved frame for restoring from maximize. Null when not maximized. */
  prevFrame: WindowFrame | null;
  z: number;
  minimized: boolean;
  maximized: boolean;
}

/**
 * Per-app transient state. Keyed by window id. Each app reads its own slice
 * via `setAppState(id, partial)` / `getAppState<T>(id)`. The store doesn't
 * enforce a schema per kind — apps own their data shapes.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AppState = Record<string, any>;

export interface PersistedShape {
  windows: WindowState[];
  perAppState: Record<WinId, AppState>;
  nextZ: number;
  nextId: number;
}

// ---------- Persistence ----------

const STORAGE_KEY = 'kport:windowManager';
const STORAGE_VERSION = 1;

/**
 * Migrators run when an older version is read off disk. v1 is the first
 * shipped version, so this table is empty for now. Future versions add an
 * entry per gap, e.g. `1: (old) => ({ ...old, newField: defaults })`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MIGRATORS: Record<number, Migrator<any, any>> = {};

function loadPersisted(): PersistedShape | null {
  return readVersioned<PersistedShape>(STORAGE_KEY, STORAGE_VERSION, MIGRATORS);
}

function persist(snap: PersistedShape): void {
  debouncedWriteVersioned(STORAGE_KEY, STORAGE_VERSION, snap);
}

/** Force a synchronous persist. Used before unload, in tests, etc. */
export function flushPersist(snap: PersistedShape): void {
  writeVersioned(STORAGE_KEY, STORAGE_VERSION, snap);
}

// ---------- Defaults ----------

const TITLES: Record<WindowKind, string> = {
  photos: 'My Pictures',
  projects: 'My Projects',
  notepad: 'Notepad',
  about: 'About',
  calculator: 'Calculator',
  solitaire: 'Solitaire',
};

const DEFAULT_FRAMES: Record<WindowKind, WindowFrame> = {
  // Photos is FIXED at this size (non-resizable; see RESIZABLE below).
  // 1280 wide cold-opens centered on the photo shop in the V2 panorama
  // (scale 1.0); the character walks left/right to reveal Sneaky Dee's,
  // the Porsche garage, DEFUSED ESPORTS, the COFFEE shop, and the TTC
  // streetcar. 680 tall anchors the scene (724px native) to the bottom so
  // the sidewalk and storefronts are framed with a thin sky letterbox up
  // top. Fits comfortably on 1440-1920px wide displays.
  photos: { x: 100, y: 60, w: 1280, h: 680 },
  projects: { x: 200, y: 140, w: 560, h: 460 },
  notepad: { x: 280, y: 100, w: 600, h: 500 },
  about: { x: 320, y: 180, w: 420, h: 320 },
  calculator: { x: 360, y: 200, w: 240, h: 320 },
  solitaire: { x: 100, y: 100, w: 600, h: 480 },
};

/** Per-kind minimum window dimensions for resize. The 240x160 floor stops
 *  resizable windows from collapsing into unusable slivers. Photos is fixed
 *  size (see RESIZABLE below) so its entry is never consulted by updateSize,
 *  but it's listed for completeness against the WindowKind union. */
const MIN_FRAMES: Record<WindowKind, { w: number; h: number }> = {
  photos: { w: 1280, h: 680 },
  projects: { w: 240, h: 160 },
  notepad: { w: 240, h: 160 },
  about: { w: 240, h: 160 },
  calculator: { w: 240, h: 160 },
  solitaire: { w: 240, h: 160 },
};

/** Whether a window kind can be resized or maximized. Photos.exe is locked
 *  to its DEFAULT_FRAMES size (1280x680): the storefront camera math and the
 *  gallery wall layout are both tuned for that frame, and letting the user
 *  resize distorts the painted scene and the photo grid. Fixed-size windows
 *  hide the resize grip and disable the maximize button (Window.tsx), and
 *  the store ignores updateSize / maximize for them as a backstop. */
const RESIZABLE: Record<WindowKind, boolean> = {
  photos: false,
  projects: true,
  notepad: true,
  about: true,
  calculator: true,
  solitaire: true,
};

/** Whether a window kind can be resized/maximized. Consumed by Window.tsx to
 *  gate the resize grip and maximize button. */
export function isResizable(kind: WindowKind): boolean {
  return RESIZABLE[kind];
}

/** Cascade offset when opening a window of a kind already on the desktop. */
const CASCADE_OFFSET = 24;

// ---------- Store ----------

export interface WindowManagerState {
  windows: WindowState[];
  perAppState: Record<WinId, AppState>;
  nextZ: number;
  nextId: number;
  /** id of the focused window, derived from highest z; null if none. */
  focusedId: WinId | null;

  // Lifecycle
  hydrate: () => void;
  open: (kind: WindowKind, initialState?: AppState) => WinId;
  close: (id: WinId) => void;
  focus: (id: WinId) => void;
  minimize: (id: WinId) => void;
  restore: (id: WinId) => void;
  maximize: (id: WinId) => void;
  updatePos: (id: WinId, x: number, y: number) => void;
  updateSize: (id: WinId, w: number, h: number) => void;
  setAppState: (id: WinId, partial: AppState) => void;
  getAppState: <T = AppState>(id: WinId) => T | undefined;

  // Test helpers
  _reset: () => void;
}

function derivedFocusedId(windows: WindowState[]): WinId | null {
  const visible = windows.filter((w) => !w.minimized);
  if (visible.length === 0) return null;
  let top = visible[0];
  for (const w of visible) if (w.z > top.z) top = w;
  return top.id;
}

/** Highest z across all windows, or 0 if none. Used by open/focus/restore
 *  to compute the next-on-top z so it's robust against persisted-state
 *  drift (e.g., nextZ falling behind the actual max z from older sessions). */
function topZ(windows: WindowState[]): number {
  let max = 0;
  for (const w of windows) if (w.z > max) max = w.z;
  return max;
}

function maybePersist(state: WindowManagerState): void {
  persist({
    windows: state.windows,
    perAppState: state.perAppState,
    nextZ: state.nextZ,
    nextId: state.nextId,
  });
}

export const useWindowManager = create<WindowManagerState>((set, get) => ({
  windows: [],
  perAppState: {},
  nextZ: 1,
  nextId: 1,
  focusedId: null,

  hydrate: () => {
    const persisted = loadPersisted();
    if (!persisted) return;
    // Photos.exe must cold-open on the storefront EVERY visit. perAppState is
    // persisted whole, so we strip the `mode` field on
    // restored Photos windows here. url-sync.ts then sets `mode` from the URL
    // (or leaves it at the 'exterior' default if the URL is just `/`).
    const photosWinIds = new Set(
      persisted.windows.filter((w) => w.kind === 'photos').map((w) => w.id)
    );
    const restoredPerApp: Record<WinId, AppState> = {};
    for (const [id, app] of Object.entries(persisted.perAppState ?? {})) {
      if (photosWinIds.has(id) && app && typeof app === 'object') {
        const { mode: _drop, ...rest } = app as AppState & { mode?: unknown };
        restoredPerApp[id] = rest;
      } else {
        restoredPerApp[id] = app;
      }
    }
    // Normalize restored window dimensions against the current frame rules.
    // Fixed-size kinds (Photos.exe) snap back to their DEFAULT_FRAMES size
    // and drop any persisted maximized state — a session saved before the
    // size was locked could otherwise restore at the wrong dimensions.
    // Resizable kinds are clamped up to the current per-kind minimum so a
    // window persisted below today's floor isn't stranded too small.
    const clampedWindows = persisted.windows.map((win) => {
      if (!RESIZABLE[win.kind]) {
        const def = DEFAULT_FRAMES[win.kind];
        return { ...win, w: def.w, h: def.h, maximized: false, prevFrame: null };
      }
      const min = MIN_FRAMES[win.kind];
      if (!min) return win;
      return {
        ...win,
        w: Math.max(win.w, min.w),
        h: Math.max(win.h, min.h),
      };
    });
    set({
      windows: clampedWindows,
      perAppState: restoredPerApp,
      nextZ: persisted.nextZ ?? 1,
      nextId: persisted.nextId ?? 1,
      focusedId: derivedFocusedId(persisted.windows),
    });
  },

  open: (kind, initialState) => {
    const state = get();
    const existing = state.windows.find((w) => w.kind === kind);
    if (existing) {
      // Same kind already open. Focus + restore if minimized.
      get().focus(existing.id);
      if (existing.minimized) get().restore(existing.id);
      return existing.id;
    }

    const id = `w${state.nextId}`;
    // Always compute z from the current max + 1, not from state.nextZ. This
    // protects against persisted-state drift where nextZ falls behind the
    // actual highest window z (e.g., from earlier sessions before a refactor,
    // or any corruption). Without this, a freshly opened window could end up
    // BEHIND an already-open one with a stale-high z.
    const z = topZ(state.windows) + 1;
    const defaults = DEFAULT_FRAMES[kind];
    // Cascade against any other windows so new ones aren't perfectly stacked.
    const cascade = state.windows.length * CASCADE_OFFSET;
    const newWindow: WindowState = {
      id,
      kind,
      title: TITLES[kind],
      x: defaults.x + cascade,
      y: defaults.y + cascade,
      w: defaults.w,
      h: defaults.h,
      prevFrame: null,
      z,
      minimized: false,
      maximized: false,
    };

    const next: Partial<WindowManagerState> = {
      windows: [...state.windows, newWindow],
      perAppState: initialState
        ? { ...state.perAppState, [id]: initialState }
        : state.perAppState,
      nextZ: z + 1,
      nextId: state.nextId + 1,
      focusedId: id,
    };
    set(next);
    maybePersist(get());
    return id;
  },

  close: (id) => {
    const state = get();
    const exists = state.windows.some((w) => w.id === id);
    if (!exists) return;

    const remainingWindows = state.windows.filter((w) => w.id !== id);
    // GC the per-app slice for the closed window.
    const remainingPerApp: Record<WinId, AppState> = {};
    for (const [k, v] of Object.entries(state.perAppState)) {
      if (k !== id) remainingPerApp[k] = v;
    }

    set({
      windows: remainingWindows,
      perAppState: remainingPerApp,
      focusedId: derivedFocusedId(remainingWindows),
    });
    maybePersist(get());
  },

  focus: (id) => {
    const state = get();
    const w = state.windows.find((x) => x.id === id);
    if (!w) return;
    // Skip if already focused AND already at the top of the stack.
    // (topZ short-circuits when window is already the max, so this guard
    // also catches the "click the focused window again" case cheaply.)
    const currentMaxZ = topZ(state.windows);
    if (state.focusedId === id && w.z === currentMaxZ) return;

    const newZ = currentMaxZ + 1;
    const nextWindows = state.windows.map((x) =>
      x.id === id ? { ...x, z: newZ } : x
    );
    set({
      windows: nextWindows,
      nextZ: newZ + 1,
      focusedId: id,
    });
    maybePersist(get());
  },

  minimize: (id) => {
    const state = get();
    const w = state.windows.find((x) => x.id === id);
    if (!w || w.minimized) return;
    const nextWindows = state.windows.map((x) =>
      x.id === id ? { ...x, minimized: true } : x
    );
    set({
      windows: nextWindows,
      focusedId: derivedFocusedId(nextWindows),
    });
    maybePersist(get());
  },

  restore: (id) => {
    const state = get();
    const w = state.windows.find((x) => x.id === id);
    if (!w) return;
    const newZ = topZ(state.windows) + 1;
    const nextWindows = state.windows.map((x) =>
      x.id === id ? { ...x, minimized: false, z: newZ } : x
    );
    set({
      windows: nextWindows,
      nextZ: newZ + 1,
      focusedId: id,
    });
    maybePersist(get());
  },

  maximize: (id) => {
    const state = get();
    const w = state.windows.find((x) => x.id === id);
    if (!w) return;
    // Fixed-size kinds (e.g. Photos.exe) can't maximize — no-op.
    if (!RESIZABLE[w.kind]) return;
    if (w.maximized) {
      // Toggle off: restore prevFrame if present.
      if (!w.prevFrame) return;
      const nextWindows = state.windows.map((x) =>
        x.id === id
          ? {
              ...x,
              maximized: false,
              x: x.prevFrame!.x,
              y: x.prevFrame!.y,
              w: x.prevFrame!.w,
              h: x.prevFrame!.h,
              prevFrame: null,
            }
          : x
      );
      set({ windows: nextWindows });
    } else {
      // Save current frame, set to viewport (consumer fills in actual viewport
      // size; we use 0,0 + a flag, the Window component handles via CSS).
      const nextWindows = state.windows.map((x) =>
        x.id === id
          ? {
              ...x,
              maximized: true,
              prevFrame: { x: x.x, y: x.y, w: x.w, h: x.h },
            }
          : x
      );
      set({ windows: nextWindows });
    }
    get().focus(id);
    maybePersist(get());
  },

  updatePos: (id, x, y) => {
    const state = get();
    const w = state.windows.find((win) => win.id === id);
    if (!w || w.maximized) return; // Position is ignored while maximized.
    if (w.x === x && w.y === y) return;
    set({
      windows: state.windows.map((win) =>
        win.id === id ? { ...win, x, y } : win
      ),
    });
    maybePersist(get());
  },

  updateSize: (id, w, h) => {
    const state = get();
    const win = state.windows.find((x) => x.id === id);
    if (!win || win.maximized) return;
    // Fixed-size kinds (e.g. Photos.exe) can't be resized — no-op.
    if (!RESIZABLE[win.kind]) return;
    if (win.w === w && win.h === h) return;
    // Per-kind minimum floor stops resizable windows collapsing to slivers.
    const min = MIN_FRAMES[win.kind];
    const safeW = Math.max(w, min.w);
    const safeH = Math.max(h, min.h);
    set({
      windows: state.windows.map((x) =>
        x.id === id ? { ...x, w: safeW, h: safeH } : x
      ),
    });
    maybePersist(get());
  },

  setAppState: (id, partial) => {
    const state = get();
    if (!state.windows.some((w) => w.id === id)) return;
    set({
      perAppState: {
        ...state.perAppState,
        [id]: { ...(state.perAppState[id] ?? {}), ...partial },
      },
    });
    maybePersist(get());
  },

  getAppState: <T = AppState>(id: WinId): T | undefined => {
    return get().perAppState[id] as T | undefined;
  },

  _reset: () => {
    set({
      windows: [],
      perAppState: {},
      nextZ: 1,
      nextId: 1,
      focusedId: null,
    });
  },
}));
