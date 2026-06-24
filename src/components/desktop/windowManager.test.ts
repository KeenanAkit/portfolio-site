import { describe, it, expect, beforeEach } from 'vitest';
import { useWindowManager, flushPersist } from './windowManager';
import { resetStorage, flushDebouncedWrites } from '../../lib/storage';

function clearLS(): void {
  try {
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const k = window.localStorage.key(i);
      if (k !== null) window.localStorage.removeItem(k);
    }
  } catch {
    /* noop */
  }
}

function freshStore() {
  // Reset everything between tests so we get a clean slate.
  resetStorage();
  clearLS();
  flushDebouncedWrites();
  useWindowManager.getState()._reset();
  return useWindowManager.getState();
}

describe('windowManager: open', () => {
  beforeEach(() => freshStore());

  it('opens a new window when none of that kind exists', () => {
    const id = useWindowManager.getState().open('photos');
    const state = useWindowManager.getState();
    expect(id).toBeTruthy();
    expect(state.windows).toHaveLength(1);
    expect(state.windows[0].kind).toBe('photos');
    expect(state.windows[0].title).toBe('My Pictures');
    expect(state.focusedId).toBe(id);
  });

  it('focuses an existing window of the same kind instead of duplicating', () => {
    const id1 = useWindowManager.getState().open('photos');
    const id2 = useWindowManager.getState().open('photos');
    expect(id2).toBe(id1);
    expect(useWindowManager.getState().windows).toHaveLength(1);
  });

  it('restores a minimized window when opening its kind again', () => {
    const id = useWindowManager.getState().open('photos');
    useWindowManager.getState().minimize(id);
    expect(useWindowManager.getState().windows[0].minimized).toBe(true);
    useWindowManager.getState().open('photos');
    expect(useWindowManager.getState().windows[0].minimized).toBe(false);
  });

  it('cascades position when opening multiple kinds', () => {
    useWindowManager.getState().open('photos');
    useWindowManager.getState().open('projects');
    const [photos, projects] = useWindowManager.getState().windows;
    // Projects opened second so it should be offset from its defaults.
    expect(projects.x).toBeGreaterThan(photos.x - 1000); // sanity
    expect(projects.x).not.toBe(photos.x);
  });

  it('persists initial app state when provided', () => {
    const id = useWindowManager
      .getState()
      .open('photos', { selectedSlug: 'four-o-nine-toronto' });
    expect(useWindowManager.getState().getAppState(id)).toEqual({
      selectedSlug: 'four-o-nine-toronto',
    });
  });
});

describe('windowManager: close', () => {
  beforeEach(() => freshStore());

  it('removes the window from windows[]', () => {
    const id = useWindowManager.getState().open('photos');
    useWindowManager.getState().close(id);
    expect(useWindowManager.getState().windows).toHaveLength(0);
    expect(useWindowManager.getState().focusedId).toBeNull();
  });

  it('GCs per-app state for the closed window', () => {
    const id = useWindowManager.getState().open('photos', { foo: 'bar' });
    expect(useWindowManager.getState().getAppState(id)).toEqual({ foo: 'bar' });
    useWindowManager.getState().close(id);
    expect(useWindowManager.getState().getAppState(id)).toBeUndefined();
    expect(useWindowManager.getState().perAppState).toEqual({});
  });

  it('refocuses the next-most-recent window when closing the focused one', () => {
    const id1 = useWindowManager.getState().open('photos');
    const id2 = useWindowManager.getState().open('projects'); // focused
    useWindowManager.getState().close(id2);
    expect(useWindowManager.getState().focusedId).toBe(id1);
  });

  it('no-ops gracefully for non-existent ids', () => {
    useWindowManager.getState().close('does-not-exist');
    expect(useWindowManager.getState().windows).toEqual([]);
  });
});

describe('windowManager: focus', () => {
  beforeEach(() => freshStore());

  it('brings a backgrounded window to the front', () => {
    const id1 = useWindowManager.getState().open('photos');
    useWindowManager.getState().open('projects'); // takes focus
    expect(useWindowManager.getState().focusedId).not.toBe(id1);
    useWindowManager.getState().focus(id1);
    expect(useWindowManager.getState().focusedId).toBe(id1);
    const photos = useWindowManager
      .getState()
      .windows.find((w) => w.id === id1)!;
    const projects = useWindowManager
      .getState()
      .windows.find((w) => w.kind === 'projects')!;
    expect(photos.z).toBeGreaterThan(projects.z);
  });

  it('no-ops on the already-focused window', () => {
    const id = useWindowManager.getState().open('photos');
    const z1 = useWindowManager.getState().nextZ;
    useWindowManager.getState().focus(id);
    expect(useWindowManager.getState().nextZ).toBe(z1);
  });
});

describe('windowManager: minimize / restore', () => {
  beforeEach(() => freshStore());

  it('minimize hides from focus computation', () => {
    const id1 = useWindowManager.getState().open('photos');
    const id2 = useWindowManager.getState().open('projects'); // focused
    useWindowManager.getState().minimize(id2);
    expect(useWindowManager.getState().focusedId).toBe(id1);
  });

  it('restore brings minimized window back and focuses it', () => {
    const id = useWindowManager.getState().open('photos');
    useWindowManager.getState().minimize(id);
    useWindowManager.getState().restore(id);
    const w = useWindowManager.getState().windows.find((x) => x.id === id)!;
    expect(w.minimized).toBe(false);
    expect(useWindowManager.getState().focusedId).toBe(id);
  });
});

describe('windowManager: maximize', () => {
  beforeEach(() => freshStore());

  it('saves prevFrame on first maximize, returns to it on toggle', () => {
    const id = useWindowManager.getState().open('projects');
    const before = useWindowManager
      .getState()
      .windows.find((x) => x.id === id)!;
    const ox = before.x;
    const oy = before.y;
    const ow = before.w;
    const oh = before.h;
    useWindowManager.getState().maximize(id);
    const maxed = useWindowManager.getState().windows.find((x) => x.id === id)!;
    expect(maxed.maximized).toBe(true);
    expect(maxed.prevFrame).toEqual({ x: ox, y: oy, w: ow, h: oh });
    useWindowManager.getState().maximize(id);
    const restored = useWindowManager
      .getState()
      .windows.find((x) => x.id === id)!;
    expect(restored.maximized).toBe(false);
    expect(restored.prevFrame).toBeNull();
    expect(restored.x).toBe(ox);
    expect(restored.y).toBe(oy);
    expect(restored.w).toBe(ow);
    expect(restored.h).toBe(oh);
  });
});

describe('windowManager: updatePos / updateSize', () => {
  beforeEach(() => freshStore());

  it('updates position', () => {
    const id = useWindowManager.getState().open('photos');
    useWindowManager.getState().updatePos(id, 500, 300);
    const w = useWindowManager.getState().windows.find((x) => x.id === id)!;
    expect(w.x).toBe(500);
    expect(w.y).toBe(300);
  });

  it('ignores updatePos while maximized', () => {
    const id = useWindowManager.getState().open('projects');
    useWindowManager.getState().maximize(id);
    const before = useWindowManager
      .getState()
      .windows.find((x) => x.id === id)!;
    useWindowManager.getState().updatePos(id, 999, 999);
    const after = useWindowManager
      .getState()
      .windows.find((x) => x.id === id)!;
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
  });

  it('enforces a minimum size floor', () => {
    const id = useWindowManager.getState().open('projects');
    useWindowManager.getState().updateSize(id, 10, 10);
    const w = useWindowManager.getState().windows.find((x) => x.id === id)!;
    expect(w.w).toBeGreaterThanOrEqual(240);
    expect(w.h).toBeGreaterThanOrEqual(160);
  });
});

describe('windowManager: fixed-size kinds (Photos.exe)', () => {
  beforeEach(() => freshStore());

  it('ignores updateSize for a fixed-size kind', () => {
    const id = useWindowManager.getState().open('photos');
    const before = useWindowManager
      .getState()
      .windows.find((x) => x.id === id)!;
    useWindowManager.getState().updateSize(id, 400, 400);
    const after = useWindowManager.getState().windows.find((x) => x.id === id)!;
    expect(after.w).toBe(before.w);
    expect(after.h).toBe(before.h);
  });

  it('ignores maximize for a fixed-size kind', () => {
    const id = useWindowManager.getState().open('photos');
    useWindowManager.getState().maximize(id);
    const w = useWindowManager.getState().windows.find((x) => x.id === id)!;
    expect(w.maximized).toBe(false);
    expect(w.prevFrame).toBeNull();
  });

  it('snaps a fixed-size kind back to its default frame on hydrate', () => {
    // A session persisted before the size was locked could hold an oddly
    // sized or maximized Photos window. Hydrate must normalize it.
    const id = useWindowManager.getState().open('photos');
    const before = useWindowManager
      .getState()
      .windows.find((x) => x.id === id)!;
    // Simulate a stale persisted frame: wrong size + maximized.
    flushPersist({
      windows: [
        { ...before, w: 640, h: 480, maximized: true, prevFrame: null },
      ],
      perAppState: {},
      nextZ: useWindowManager.getState().nextZ,
      nextId: useWindowManager.getState().nextId,
    });
    useWindowManager.getState()._reset();
    useWindowManager.getState().hydrate();

    const w = useWindowManager.getState().windows[0];
    expect(w.kind).toBe('photos');
    expect(w.w).toBe(1280);
    expect(w.h).toBe(680);
    expect(w.maximized).toBe(false);
  });
});

describe('windowManager: setAppState / getAppState', () => {
  beforeEach(() => freshStore());

  it('merges partials into the existing per-app slice', () => {
    const id = useWindowManager
      .getState()
      .open('photos', { scrollY: 0, selectedSlug: null });
    useWindowManager.getState().setAppState(id, { scrollY: 240 });
    expect(useWindowManager.getState().getAppState(id)).toEqual({
      scrollY: 240,
      selectedSlug: null,
    });
  });

  it('refuses to write state for a non-existent window', () => {
    useWindowManager.getState().setAppState('not-a-real-id', { x: 1 });
    expect(useWindowManager.getState().perAppState).toEqual({});
  });
});

describe('windowManager: persistence (round-trip)', () => {
  beforeEach(() => freshStore());

  it('hydrates from a previous session', () => {
    // Session 1: open windows, write app state.
    const id = useWindowManager
      .getState()
      .open('photos', { selectedSlug: 'four-o-nine-toronto' });
    useWindowManager.getState().updatePos(id, 250, 150);
    // Force a synchronous write so the next hydrate sees it.
    const snap = useWindowManager.getState();
    const persistedShape = {
      windows: snap.windows,
      perAppState: snap.perAppState,
      nextZ: snap.nextZ,
      nextId: snap.nextId,
    };
    // Direct sync write via the module export bypasses the debounce.
    // (Tests don't need to wait for the 200ms debounce timer.)
    flushPersist(persistedShape);

    // Session 2: blank state, then hydrate.
    useWindowManager.getState()._reset();
    expect(useWindowManager.getState().windows).toHaveLength(0);
    useWindowManager.getState().hydrate();

    const w = useWindowManager.getState().windows[0];
    expect(w).toBeTruthy();
    expect(w.kind).toBe('photos');
    expect(w.x).toBe(250);
    expect(w.y).toBe(150);
    expect(useWindowManager.getState().getAppState(w.id)).toEqual({
      selectedSlug: 'four-o-nine-toronto',
    });
  });

  it('strips Photos.exe mode on hydrate so cold loads land on the storefront', () => {
    // mode is transient. Even if a previous session ended with the Photos
    // window in interior mode, the next cold load must return to the
    // exterior storefront.
    const id = useWindowManager.getState().open('photos', {
      mode: 'interior',
      category: 'landscapes',
      selectedSlug: 'four-o-nine-toronto',
    });

    const snap = useWindowManager.getState();
    flushPersist({
      windows: snap.windows,
      perAppState: snap.perAppState,
      nextZ: snap.nextZ,
      nextId: snap.nextId,
    });

    useWindowManager.getState()._reset();
    useWindowManager.getState().hydrate();

    const restored = useWindowManager.getState().getAppState<{
      mode?: string;
      category?: string;
      selectedSlug?: string;
    }>(id);
    expect(restored).toBeTruthy();
    expect(restored!.mode).toBeUndefined();
    // The other fields survive — only `mode` is stripped.
    expect(restored!.category).toBe('landscapes');
    expect(restored!.selectedSlug).toBe('four-o-nine-toronto');
  });

  it('leaves non-Photos perAppState untouched on hydrate', () => {
    const projId = useWindowManager.getState().open('projects', {
      selectedSlug: 'kport',
      scrollY: 240,
    });

    const snap = useWindowManager.getState();
    flushPersist({
      windows: snap.windows,
      perAppState: snap.perAppState,
      nextZ: snap.nextZ,
      nextId: snap.nextId,
    });

    useWindowManager.getState()._reset();
    useWindowManager.getState().hydrate();

    expect(
      useWindowManager.getState().getAppState<{ selectedSlug?: string; scrollY?: number }>(
        projId
      )
    ).toEqual({ selectedSlug: 'kport', scrollY: 240 });
  });
});

describe('windowManager: z-stacking robustness', () => {
  beforeEach(() => freshStore());

  it('new windows open on top even when nextZ has drifted below existing z', () => {
    // Simulate persisted-state drift: stuff a window with a high z value
    // into the store, then leave nextZ low. open/focus should still raise
    // newer windows above the stale-high one. Without the topZ() fix this
    // would put Notepad behind Pictures because z=2 < z=99.
    const photosId = useWindowManager.getState().open('photos');
    // Forcibly bump Pictures' z to something nextZ doesn't know about.
    useWindowManager.setState((s) => ({
      windows: s.windows.map((w) =>
        w.id === photosId ? { ...w, z: 99 } : w
      ),
    }));
    expect(useWindowManager.getState().windows.find((w) => w.id === photosId)?.z).toBe(99);

    const notepadId = useWindowManager.getState().open('notepad');
    const notepadZ = useWindowManager.getState().windows.find((w) => w.id === notepadId)?.z ?? 0;
    const photosZ = useWindowManager.getState().windows.find((w) => w.id === photosId)?.z ?? 0;

    expect(notepadZ).toBeGreaterThan(photosZ);
    expect(useWindowManager.getState().focusedId).toBe(notepadId);
  });

  it('focus on a buried window raises it above whatever was on top', () => {
    const photosId = useWindowManager.getState().open('photos');
    const notepadId = useWindowManager.getState().open('notepad');
    // Notepad just opened — it's on top. Now click Pictures.
    useWindowManager.getState().focus(photosId);

    const photosZ = useWindowManager.getState().windows.find((w) => w.id === photosId)?.z ?? 0;
    const notepadZ = useWindowManager.getState().windows.find((w) => w.id === notepadId)?.z ?? 0;

    expect(photosZ).toBeGreaterThan(notepadZ);
    expect(useWindowManager.getState().focusedId).toBe(photosId);
  });

  it('restoring a minimized window puts it on top of the stack', () => {
    const photosId = useWindowManager.getState().open('photos');
    const notepadId = useWindowManager.getState().open('notepad');
    useWindowManager.getState().minimize(notepadId);
    // Pictures is on top now (the only visible window). Restore Notepad.
    useWindowManager.getState().restore(notepadId);

    const photosZ = useWindowManager.getState().windows.find((w) => w.id === photosId)?.z ?? 0;
    const notepadZ = useWindowManager.getState().windows.find((w) => w.id === notepadId)?.z ?? 0;

    expect(notepadZ).toBeGreaterThan(photosZ);
    expect(useWindowManager.getState().focusedId).toBe(notepadId);
  });
});
