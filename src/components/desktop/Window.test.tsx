/**
 * Regression test for the resize-grip bug.
 *
 * Original bug: the resize useEffect depended on `win.w` / `win.h`. The very
 * first `pointermove` called `updateSize`, which mutated the store, which
 * re-ran the effect, which cleaned up the old listeners (with `dragging =
 * true` in their closure) and attached new ones (with `dragging = false`).
 * Every subsequent move bailed at `if (!dragging) return;` and the window
 * stopped at +1 pixel.
 *
 * This test fires a multi-step drag and asserts the cumulative size lands
 * where it should. If anyone re-introduces the closure-state pattern or
 * adds `win.w/win.h` back into the effect deps, this fails.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window, computeDragBounds } from './Window';
import { useWindowManager } from './windowManager';
import { resetStorage, flushDebouncedWrites } from '../../lib/storage';

function freshStore() {
  resetStorage();
  for (let i = window.localStorage.length - 1; i >= 0; i--) {
    const k = window.localStorage.key(i);
    if (k !== null) window.localStorage.removeItem(k);
  }
  flushDebouncedWrites();
  useWindowManager.getState()._reset();
}

function pointer(type: string, x: number, y: number): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    buttons: 1,
    pointerId: 7,
    pointerType: 'mouse',
    isPrimary: true,
    view: window,
  });
}

describe('Window: resize grip', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    freshStore();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    // happy-dom: matchMedia returns matches=false by default, which is what
    // we want here (we don't care about reduced-motion for the resize test).
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (q: string): MediaQueryList =>
        ({
          matches: false,
          media: q,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it('accumulates size across a multi-step drag', () => {
    const id = useWindowManager.getState().open('projects');

    act(() => {
      root.render(
        <Window id={id}>
          <div>content</div>
        </Window>
      );
    });

    const grip = container.querySelector<HTMLDivElement>('.kport-resize-grip');
    expect(grip).toBeTruthy();

    const startW = useWindowManager.getState().windows[0].w;
    const startH = useWindowManager.getState().windows[0].h;

    // happy-dom doesn't compute layout, so getBoundingClientRect returns
    // zeros. The handler reads e.clientX/Y directly and computes deltas
    // against the starting window size from the store, so we can drive the
    // drag with abstract coordinates.
    act(() => {
      grip!.dispatchEvent(pointer('pointerdown', 100, 100));
    });

    // Three moves, +50 / +30 each step. If the closure-state bug returns,
    // only the first move lands; the rest no-op because dragging flips false.
    act(() => {
      grip!.dispatchEvent(pointer('pointermove', 150, 130));
    });
    act(() => {
      grip!.dispatchEvent(pointer('pointermove', 200, 160));
    });
    act(() => {
      grip!.dispatchEvent(pointer('pointermove', 250, 190));
    });
    act(() => {
      grip!.dispatchEvent(pointer('pointerup', 250, 190));
    });

    const finalWin = useWindowManager.getState().windows[0];
    expect(finalWin.w).toBe(startW + 150);
    expect(finalWin.h).toBe(startH + 90);
  });

  it('respects the per-kind minimum size floor on shrink-drag', () => {
    // Notepad has the legacy 240x160 floor (no special storefront
    // constraint), so shrink-drag should clamp there.
    const id = useWindowManager.getState().open('notepad');

    act(() => {
      root.render(
        <Window id={id}>
          <div>content</div>
        </Window>
      );
    });

    const grip = container.querySelector<HTMLDivElement>('.kport-resize-grip');
    expect(grip).toBeTruthy();

    act(() => {
      grip!.dispatchEvent(pointer('pointerdown', 500, 500));
    });
    act(() => {
      grip!.dispatchEvent(pointer('pointermove', 0, 0));
    });
    act(() => {
      grip!.dispatchEvent(pointer('pointerup', 0, 0));
    });

    const finalWin = useWindowManager.getState().windows[0];
    expect(finalWin.w).toBe(240);
    expect(finalWin.h).toBe(160);
  });

  it('renders no resize grip and disables maximize for fixed-size Photos.exe', () => {
    // Photos is locked to its default frame (non-resizable). The grip is
    // absent and the maximize button is disabled so the size can't change.
    // See RESIZABLE in windowManager.ts.
    const id = useWindowManager.getState().open('photos');

    act(() => {
      root.render(
        <Window id={id}>
          <div>content</div>
        </Window>
      );
    });

    const grip = container.querySelector<HTMLDivElement>('.kport-resize-grip');
    expect(grip).toBeNull();

    const maximize = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Maximize"]'
    );
    expect(maximize).toBeTruthy();
    expect(maximize!.disabled).toBe(true);
  });
});

describe('Window: computeDragBounds', () => {
  // GSAP Draggable interprets {minX,minY,maxX,maxY} as deltas from the
  // element's position at drag-start, NOT absolute viewport coords. A prior
  // bug shipped `minY: 0` literally, which meant "cannot move upward by any
  // amount" — every window was pinned at its initial Y.
  // These tests assert the delta math is right so the regression can't
  // sneak back.

  it('allows dragging upward from a window not already at the top', () => {
    const b = computeDragBounds({
      x: 200,
      y: 150,
      width: 720,
      viewportW: 1440,
      viewportH: 900,
    });
    // minY is negative -> dragging upward by up to |minY| is allowed.
    expect(b.minY).toBe(-150);
    expect(b.minY).toBeLessThan(0);
  });

  it('zeros minY for a window already at the top', () => {
    const b = computeDragBounds({
      x: 100,
      y: 0,
      width: 720,
      viewportW: 1440,
      viewportH: 900,
    });
    // No upward room when already at y=0.
    expect(b.minY).toBe(0);
  });

  it('keeps an 80px sliver of the title bar visible on either horizontal edge', () => {
    const b = computeDragBounds({
      x: 200,
      y: 150,
      width: 720,
      viewportW: 1440,
      viewportH: 900,
    });
    // Furthest LEFT: title bar's right edge stops 80px from viewport left.
    // window's right edge starts at x + width = 920. Allowed leftward delta
    // is -(x + width - 80) = -840. After drag: final left = 200 - 840 = -640,
    // right = -640 + 720 = 80. Sliver visible — good.
    expect(b.minX).toBe(-(200 + 720 - 80));
    // Furthest RIGHT: window's left edge stops 80px from viewport right.
    // Allowed rightward delta = viewportW - 80 - x = 1440 - 80 - 200 = 1160.
    // Final left = 200 + 1160 = 1360. Sliver = 1440 - 1360 = 80. Good.
    expect(b.maxX).toBe(1440 - 80 - 200);
  });

  it('reserves 60px of viewport headroom under the title bar', () => {
    const b = computeDragBounds({
      x: 100,
      y: 100,
      width: 720,
      viewportW: 1440,
      viewportH: 900,
    });
    // maxY delta: 900 - 60 - 100 = 740. Final y = 100 + 740 = 840.
    // Title bar at the bottom of the viewport (taskbar lives at 900-y span).
    expect(b.maxY).toBe(900 - 60 - 100);
  });

  it('scales with window width — wider windows can drag further left', () => {
    const narrow = computeDragBounds({
      x: 0,
      y: 0,
      width: 300,
      viewportW: 1440,
      viewportH: 900,
    });
    const wide = computeDragBounds({
      x: 0,
      y: 0,
      width: 1000,
      viewportW: 1440,
      viewportH: 900,
    });
    expect(wide.minX).toBeLessThan(narrow.minX);
  });
});
