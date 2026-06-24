/**
 * Desktop-wide keyboard shortcuts.
 *
 * Bound at the Desktop component level (window keydown listener). Active only
 * when a desktop visitor is present and at least one window is open or the
 * desktop region is focused.
 *
 * Bindings:
 *   Alt+F4    Close focused window
 *   Escape    Close focused window (alternative to Alt+F4 which is captured
 *             by the browser on some platforms)
 *   Alt+Space (reserved, decorative — would open the system menu in real
 *             Win98; we just preventDefault so the browser doesn't steal it)
 *   Cmd/Ctrl+W  Close focused window (modern web convention)
 *
 * These deliberately bypass focus-trap rules so they work even if the user
 * is typing inside a window control. That matches Win98 behavior — Alt+F4
 * works regardless of what's focused.
 */

import { useEffect } from 'react';
import { useWindowManager } from './windowManager';

/** Pure matcher, exposed for tests. Returns the intended action or null. */
export type ShortcutAction = 'close' | 'system-menu' | null;

export function classifyKey(e: {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}): ShortcutAction {
  // Alt+F4 — but the browser on some platforms (Windows) captures this and
  // closes the tab. We still listen for it so Linux / macOS browsers honor it.
  if (e.altKey && (e.key === 'F4' || e.key === 'f4')) return 'close';
  // Cmd+W / Ctrl+W — also captured by some browsers (closes the tab). Same
  // deal: try anyway.
  if ((e.metaKey || e.ctrlKey) && (e.key === 'w' || e.key === 'W')) return 'close';
  // Escape on a focused window
  if (e.key === 'Escape' && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
    return 'close';
  }
  // Alt+Space — placeholder for future system menu
  if (e.altKey && e.key === ' ') return 'system-menu';
  return null;
}

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    function onKeyDown(e: KeyboardEvent) {
      const action = classifyKey(e);
      if (!action) return;

      const mgr = useWindowManager.getState();
      const focusedId = mgr.focusedId;

      switch (action) {
        case 'close': {
          if (focusedId) {
            e.preventDefault();
            mgr.close(focusedId);
          }
          return;
        }
        case 'system-menu': {
          // Reserved. Prevent the browser default but don't act yet.
          if (focusedId) e.preventDefault();
          return;
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
