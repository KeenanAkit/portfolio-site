import { describe, it, expect } from 'vitest';
import { shouldFireShutdown } from './useShutdownAnimation';

// Minimal shapes that satisfy the function's structural typing.
function anchor(opts: {
  host?: string;
  target?: string;
  download?: boolean;
}): Pick<HTMLAnchorElement, 'host' | 'target'> & {
  hasAttribute: (name: string) => boolean;
} {
  return {
    host: opts.host ?? 'external.example.com',
    target: opts.target ?? '',
    hasAttribute: (name) => name === 'download' && !!opts.download,
  };
}

function event(opts: Partial<MouseEvent> = {}): Pick<
  MouseEvent,
  'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'defaultPrevented'
> {
  return {
    button: opts.button ?? 0,
    metaKey: opts.metaKey ?? false,
    ctrlKey: opts.ctrlKey ?? false,
    shiftKey: opts.shiftKey ?? false,
    altKey: opts.altKey ?? false,
    defaultPrevented: opts.defaultPrevented ?? false,
  };
}

const HOST = 'keenanakit.com';

describe('shouldFireShutdown', () => {
  it('fires on a plain left-click to a cross-origin link', () => {
    expect(shouldFireShutdown(event(), anchor({}), HOST)).toBe(true);
  });

  it('does not fire on same-origin links', () => {
    expect(shouldFireShutdown(event(), anchor({ host: HOST }), HOST)).toBe(false);
  });

  it('does not fire on middle-click', () => {
    expect(shouldFireShutdown(event({ button: 1 }), anchor({}), HOST)).toBe(false);
  });

  it('does not fire on cmd-click (meta)', () => {
    expect(shouldFireShutdown(event({ metaKey: true }), anchor({}), HOST)).toBe(false);
  });

  it('does not fire on ctrl-click', () => {
    expect(shouldFireShutdown(event({ ctrlKey: true }), anchor({}), HOST)).toBe(false);
  });

  it('does not fire on shift-click', () => {
    expect(shouldFireShutdown(event({ shiftKey: true }), anchor({}), HOST)).toBe(false);
  });

  it('does not fire on alt-click', () => {
    expect(shouldFireShutdown(event({ altKey: true }), anchor({}), HOST)).toBe(false);
  });

  it('does not fire on target="_blank"', () => {
    expect(
      shouldFireShutdown(event(), anchor({ target: '_blank' }), HOST)
    ).toBe(false);
  });

  it('does not fire on download links', () => {
    expect(
      shouldFireShutdown(event(), anchor({ download: true }), HOST)
    ).toBe(false);
  });

  it('does not fire when the event was already preventDefaulted', () => {
    expect(
      shouldFireShutdown(event({ defaultPrevented: true }), anchor({}), HOST)
    ).toBe(false);
  });

  it('does not fire on anchors without a host (relative, javascript:, etc.)', () => {
    expect(shouldFireShutdown(event(), anchor({ host: '' }), HOST)).toBe(false);
  });
});
