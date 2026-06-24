import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  resetStorage,
  getBackend,
  kvGet,
  kvSet,
  kvRemove,
  readVersioned,
  writeVersioned,
  debouncedWriteVersioned,
  _setBackendForTests,
} from './storage';

/**
 * happy-dom doesn't ship a working `clear()` on its Storage shim in every
 * version. Iterate and remove instead, so the suite isolates cleanly.
 */
function clearLS(): void {
  try {
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const k = window.localStorage.key(i);
      if (k !== null) window.localStorage.removeItem(k);
    }
  } catch {
    // localStorage was mocked broken by a previous test; nothing to clear.
  }
}

describe('storage backend detection', () => {
  beforeEach(() => {
    resetStorage();
    clearLS();
  });

  it('uses localStorage when it works normally', () => {
    expect(getBackend()).toBe('localStorage');
  });

  it('falls back to memory when localStorage.setItem throws', () => {
    const setItemSpy = vi.spyOn(window.localStorage, 'setItem');
    setItemSpy.mockImplementation(() => {
      throw new DOMException('QuotaExceeded', 'QuotaExceededError');
    });
    resetStorage();
    expect(getBackend()).toBe('memory');
    setItemSpy.mockRestore();
  });

  it('detects iOS 17+ silent-drop: setItem succeeds but getItem returns null', () => {
    const setItemSpy = vi.spyOn(window.localStorage, 'setItem');
    const getItemSpy = vi.spyOn(window.localStorage, 'getItem');
    setItemSpy.mockImplementation(() => {
      // Pretend the write happened
    });
    getItemSpy.mockImplementation(() => null);
    resetStorage();
    expect(getBackend()).toBe('memory');
    setItemSpy.mockRestore();
    getItemSpy.mockRestore();
  });
});

describe('kvGet/kvSet/kvRemove', () => {
  beforeEach(() => {
    resetStorage();
    clearLS();
  });

  it('round-trips a value', () => {
    kvSet('a', '1');
    expect(kvGet('a')).toBe('1');
    kvRemove('a');
    expect(kvGet('a')).toBeNull();
  });

  it('returns null for missing keys', () => {
    expect(kvGet('nothing-here')).toBeNull();
  });

  it('round-trips a value via in-memory backend', () => {
    _setBackendForTests('memory');
    kvSet('a', '1');
    expect(kvGet('a')).toBe('1');
    kvRemove('a');
    expect(kvGet('a')).toBeNull();
  });

  it('degrades to memory mid-session if a write throws', () => {
    kvSet('a', '1');
    expect(getBackend()).toBe('localStorage');

    const setItemSpy = vi.spyOn(window.localStorage, 'setItem');
    setItemSpy.mockImplementation(() => {
      throw new DOMException('QuotaExceeded', 'QuotaExceededError');
    });
    kvSet('b', '2');
    expect(getBackend()).toBe('memory');
    expect(kvGet('b')).toBe('2');
    setItemSpy.mockRestore();
  });
});

describe('readVersioned / writeVersioned', () => {
  beforeEach(() => {
    resetStorage();
    clearLS();
  });

  it('round-trips structured data', () => {
    writeVersioned('w', 1, { foo: 'bar', n: 42 });
    expect(readVersioned<{ foo: string; n: number }>('w', 1)).toEqual({
      foo: 'bar',
      n: 42,
    });
  });

  it('returns null for missing keys', () => {
    expect(readVersioned('missing', 1)).toBeNull();
  });

  it('wipes and returns null on corrupted JSON', () => {
    kvSet('w', '{not valid json');
    expect(readVersioned('w', 1)).toBeNull();
    expect(kvGet('w')).toBeNull();
  });

  it('wipes and returns null on missing version field', () => {
    kvSet('w', JSON.stringify({ data: { foo: 1 } }));
    expect(readVersioned('w', 1)).toBeNull();
    expect(kvGet('w')).toBeNull();
  });

  it('wipes and returns null when persisted version is newer than current', () => {
    writeVersioned('w', 5, { foo: 'future' });
    // Current build only knows about v2:
    expect(readVersioned('w', 2)).toBeNull();
    expect(kvGet('w')).toBeNull();
  });

  it('applies a chain of migrators v1 → v2 → v3', () => {
    writeVersioned('w', 1, { name: 'alice' });
    const result = readVersioned<{ fullName: string; age: number }>('w', 3, {
      1: (old: { name: string }) => ({ fullName: old.name }),
      2: (old: { fullName: string }) => ({ ...old, age: 0 }),
    });
    expect(result).toEqual({ fullName: 'alice', age: 0 });
  });

  it('wipes and warns when no migrator covers a gap', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    writeVersioned('w', 1, { name: 'alice' });
    const result = readVersioned('w', 3, {
      // No migrator from 1 → 2
    });
    expect(result).toBeNull();
    expect(kvGet('w')).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});

describe('debouncedWriteVersioned', () => {
  beforeEach(() => {
    resetStorage();
    clearLS();
    vi.useFakeTimers();
  });

  it('coalesces rapid writes; only the last one lands', () => {
    debouncedWriteVersioned('w', 1, { n: 1 }, 200);
    debouncedWriteVersioned('w', 1, { n: 2 }, 200);
    debouncedWriteVersioned('w', 1, { n: 3 }, 200);
    expect(readVersioned('w', 1)).toBeNull(); // nothing written yet
    vi.advanceTimersByTime(199);
    expect(readVersioned('w', 1)).toBeNull(); // still nothing
    vi.advanceTimersByTime(2);
    expect(readVersioned<{ n: number }>('w', 1)).toEqual({ n: 3 });
  });
});
