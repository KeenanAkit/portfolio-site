import { describe, it, expect, vi, afterEach } from 'vitest';
import { reducedMotion, motionDuration } from './motion';

// happy-dom 20 provides window.matchMedia but always returns matches:false.
// We stub it so we can verify both branches.
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

describe('reducedMotion', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns true when the media query matches', () => {
    stubMatchMedia(true);
    expect(reducedMotion()).toBe(true);
  });

  it('returns false when the media query does not match', () => {
    stubMatchMedia(false);
    expect(reducedMotion()).toBe(false);
  });

  it('queries the prefers-reduced-motion: reduce media query specifically', () => {
    const spy = vi
      .spyOn(window, 'matchMedia')
      .mockImplementation(
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
    reducedMotion();
    expect(spy).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  });
});

describe('motionDuration', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns 0 when reduced motion is requested', () => {
    stubMatchMedia(true);
    expect(motionDuration(500)).toBe(0);
    expect(motionDuration(0)).toBe(0);
    expect(motionDuration(9999)).toBe(0);
  });

  it('returns the input ms when reduced motion is not requested', () => {
    stubMatchMedia(false);
    expect(motionDuration(500)).toBe(500);
    expect(motionDuration(0)).toBe(0);
    expect(motionDuration(280)).toBe(280);
  });
});
