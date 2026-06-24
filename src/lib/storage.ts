/**
 * Persistence wrapper for the desktop shell.
 *
 * Three pieces of robustness over raw localStorage:
 *   1. In-memory fallback when localStorage throws (Safari private classical mode,
 *      embedded webviews, quota exceeded).
 *   2. Silent-drop detection (iOS 17+ Safari private silently no-ops setItem when
 *      its tiny per-origin cap is hit). We write a canary on first use and re-read
 *      it; if reads come back stale, swap to in-memory.
 *   3. Schema versioning. Persisted blobs carry a `version` field; mismatched
 *      versions trigger a registered migrator or wipe-with-warning.
 *
 * The desktop shell calls `kvGet`, `kvSet`, `kvRemove`. Tests can call `resetStorage`
 * to wipe and re-detect.
 *
 * See design doc §"src/lib/storage.ts" for the rationale and constraints.
 */

const CANARY_KEY = '__kport_storage_canary__';
const CANARY_VALUE = '1';

type Backend = 'localStorage' | 'memory';

let backend: Backend | null = null;
const memory = new Map<string, string>();

function detectBackend(): Backend {
  if (typeof window === 'undefined') return 'memory'; // SSR safety
  try {
    window.localStorage.setItem(CANARY_KEY, CANARY_VALUE);
    if (window.localStorage.getItem(CANARY_KEY) !== CANARY_VALUE) {
      // Silent-drop detected (write succeeded but read came back stale).
      return 'memory';
    }
    window.localStorage.removeItem(CANARY_KEY);
    return 'localStorage';
  } catch {
    // Setting threw — Safari private classical mode, quota exceeded, etc.
    return 'memory';
  }
}

function ensureBackend(): Backend {
  if (backend === null) backend = detectBackend();
  return backend;
}

/** Reset detection. Tests call this between cases; production code never does. */
export function resetStorage(): void {
  backend = null;
  memory.clear();
}

/** Force a specific backend. Only for tests. */
export function _setBackendForTests(b: Backend, mem?: Map<string, string>): void {
  backend = b;
  if (mem) {
    memory.clear();
    for (const [k, v] of mem) memory.set(k, v);
  }
}

/** Which backend ended up active. UI can surface a "session-only" hint if needed. */
export function getBackend(): Backend {
  return ensureBackend();
}

export function kvGet(key: string): string | null {
  const b = ensureBackend();
  if (b === 'memory') return memory.get(key) ?? null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Backend degrades mid-session (rare). Fall back gracefully.
    backend = 'memory';
    return memory.get(key) ?? null;
  }
}

export function kvSet(key: string, value: string): void {
  const b = ensureBackend();
  if (b === 'memory') {
    memory.set(key, value);
    return;
  }
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Quota exceeded or similar. Drop to memory and keep the write.
    backend = 'memory';
    memory.set(key, value);
  }
}

export function kvRemove(key: string): void {
  const b = ensureBackend();
  if (b === 'memory') {
    memory.delete(key);
    return;
  }
  try {
    window.localStorage.removeItem(key);
  } catch {
    backend = 'memory';
    memory.delete(key);
  }
}

// ---------- Versioned JSON helpers ----------

export interface VersionedBlob<T> {
  version: number;
  data: T;
}

export type Migrator<TOld, TNew> = (old: TOld) => TNew;

/**
 * Read a versioned JSON blob. If parse fails, returns null. If the stored
 * version is older than `currentVersion`, applies the registered migrator chain
 * (one step at a time); if no migrator covers a gap, returns null and the
 * caller should treat it as cold-start.
 *
 * Migrators are passed as a map keyed by "fromVersion". So to migrate v1 → v3
 * you register migrators[1] (v1→v2) and migrators[2] (v2→v3).
 */
export function readVersioned<T>(
  key: string,
  currentVersion: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  migrators: Record<number, Migrator<any, any>> = {}
): T | null {
  const raw = kvGet(key);
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Corrupted blob. Wipe and cold-start.
    kvRemove(key);
    return null;
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('version' in parsed) ||
    !('data' in parsed)
  ) {
    kvRemove(key);
    return null;
  }
  const blob = parsed as VersionedBlob<unknown>;
  if (typeof blob.version !== 'number') {
    kvRemove(key);
    return null;
  }
  if (blob.version > currentVersion) {
    // The persisted blob is from a NEWER build than this one. We refuse to
    // downgrade silently. Wipe and cold-start so the user's session is sane.
    // (e.g. user opens the site after rolling back from a Cloudflare canary.)
    kvRemove(key);
    return null;
  }
  let { version, data } = blob;
  while (version < currentVersion) {
    const migrator = migrators[version];
    if (!migrator) {
      // No migrator covers this gap. Surface and bail.
      // eslint-disable-next-line no-console
      console.warn(
        `[kport] storage: no migrator from v${version} → v${version + 1} for key "${key}". Wiping.`
      );
      kvRemove(key);
      return null;
    }
    data = migrator(data);
    version = version + 1;
  }
  return data as T;
}

export function writeVersioned<T>(key: string, version: number, data: T): void {
  const blob: VersionedBlob<T> = { version, data };
  try {
    kvSet(key, JSON.stringify(blob));
  } catch {
    // JSON.stringify can throw on circular refs. Fail loud in dev; in prod
    // we silently drop the write rather than crashing the desktop session.
    // eslint-disable-next-line no-console
    console.error(`[kport] storage: failed to serialize blob for key "${key}"`);
  }
}

// ---------- Debounced writes ----------

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Coalesce rapid writes (drag-to-position fires 60+ times/sec). All callers
 * for the same key share a single timer, only the last value lands.
 */
export function debouncedWriteVersioned<T>(
  key: string,
  version: number,
  data: T,
  delayMs = 200
): void {
  const existing = debounceTimers.get(key);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    debounceTimers.delete(key);
    writeVersioned(key, version, data);
  }, delayMs);
  debounceTimers.set(key, timer);
}

/** Flush all pending debounced writes immediately. Useful before unload. */
export function flushDebouncedWrites(): void {
  for (const [, timer] of debounceTimers) clearTimeout(timer);
  debounceTimers.clear();
  // Note: this clears the pending writes WITHOUT executing them. The caller
  // should already have invoked writeVersioned directly. Used in tests to
  // ensure no orphaned timers leak between cases.
}
