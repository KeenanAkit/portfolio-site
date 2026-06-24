/**
 * Verifies the reduced-motion contract for the storefront → interior
 * door-swing: under `prefers-reduced-motion: reduce`, clicking the shop must
 * dispatch `mode = 'interior'` synchronously, with no GSAP timeline involved.
 *
 * No @testing-library/react in the project, so we render with react-dom/client
 * directly. happy-dom is enough for a button + click handler.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PhotosStorefront } from './PhotosStorefront';
import { useWindowManager } from '../../desktop/windowManager';
import { resetStorage, flushDebouncedWrites } from '../../../lib/storage';

function stubMatchMedia(matches: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string): MediaQueryList =>
      ({
        matches,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList
  );
}

function freshStore() {
  resetStorage();
  for (let i = window.localStorage.length - 1; i >= 0; i--) {
    const k = window.localStorage.key(i);
    if (k !== null) window.localStorage.removeItem(k);
  }
  flushDebouncedWrites();
  useWindowManager.getState()._reset();
}

describe('PhotosStorefront: door-swing transition', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    freshStore();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it('dispatches mode=interior synchronously under reduced motion', () => {
    stubMatchMedia(true);
    const id = useWindowManager.getState().open('photos');

    act(() => {
      root.render(<PhotosStorefront id={id} />);
    });

    const shop = container.querySelector<HTMLButtonElement>(
      '.kport-storefront__shop'
    );
    expect(shop).toBeTruthy();

    // Before click: storefront mode is the default ('exterior' per readPhotosState).
    expect(
      useWindowManager.getState().getAppState<{ mode?: string }>(id)?.mode
    ).toBeUndefined();

    act(() => {
      shop!.click();
    });

    // Reduced-motion path must mutate state on the same tick — no setTimeout,
    // no rAF, no awaited timeline. Read store state immediately.
    expect(
      useWindowManager.getState().getAppState<{ mode?: string }>(id)?.mode
    ).toBe('interior');
  });

  it('does not dispatch synchronously when motion is allowed', () => {
    // With motion allowed, the GSAP timeline runs and dispatch happens at
    // onComplete — NOT on the click tick. We assert the asymmetry.
    stubMatchMedia(false);
    const id = useWindowManager.getState().open('photos');

    act(() => {
      root.render(<PhotosStorefront id={id} />);
    });

    const shop = container.querySelector<HTMLButtonElement>(
      '.kport-storefront__shop'
    );

    act(() => {
      shop!.click();
    });

    // GSAP timeline is in flight; mode hasn't flipped yet.
    expect(
      useWindowManager.getState().getAppState<{ mode?: string }>(id)?.mode
    ).toBeUndefined();
  });
});
