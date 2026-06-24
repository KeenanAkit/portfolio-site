/**
 * Vitest setup: install a minimal localStorage shim into the test global.
 *
 * happy-dom 20 doesn't provide a working localStorage out of the box. We need
 * a real Storage-like implementation for the storage wrapper tests; that's
 * fine, the tests only verify our wrapper's behavior on TOP of the shim.
 */

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  key(i: number): string | null {
    return Array.from(this.map.keys())[i] ?? null;
  }
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, String(v));
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  clear(): void {
    this.map.clear();
  }
}

Object.defineProperty(window, 'localStorage', {
  value: new MemoryStorage(),
  writable: true,
  configurable: true,
});

Object.defineProperty(window, 'sessionStorage', {
  value: new MemoryStorage(),
  writable: true,
  configurable: true,
});
