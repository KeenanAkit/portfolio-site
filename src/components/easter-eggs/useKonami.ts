import { useEffect, useRef } from 'react';

/** Classic Konami code. Case-insensitive on b/a so capslock doesn't block it. */
const KONAMI: readonly string[] = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
] as const;

/**
 * Pure matcher for the Konami sequence. Tracks the last N keys pressed and
 * returns true on each press if the recent buffer matches the code. Useful
 * to unit test without spinning up DOM events.
 */
export function makeKonamiMatcher(target: readonly string[] = KONAMI) {
  let buffer: string[] = [];
  return (key: string): boolean => {
    // Normalize letters to lowercase so Shift+B still counts.
    const norm = key.length === 1 ? key.toLowerCase() : key;
    buffer.push(norm);
    if (buffer.length > target.length) {
      buffer = buffer.slice(-target.length);
    }
    if (buffer.length !== target.length) return false;
    for (let i = 0; i < target.length; i++) {
      const want = target[i].length === 1 ? target[i].toLowerCase() : target[i];
      if (buffer[i] !== want) return false;
    }
    buffer = []; // reset after a match so it doesn't immediately re-fire
    return true;
  };
}

/**
 * React hook: calls `onMatch` whenever the Konami sequence is typed.
 * Listens on window keydown so any focused window in the desktop shell
 * still triggers it (not blocked by focus inside a text field — that's
 * intentional, the sequence is unlikely to be typed accidentally).
 */
export function useKonami(onMatch: () => void): void {
  const callbackRef = useRef(onMatch);
  callbackRef.current = onMatch;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const matcher = makeKonamiMatcher();

    function onKeyDown(e: KeyboardEvent) {
      if (matcher(e.key)) callbackRef.current();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
