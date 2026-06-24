/**
 * Coordinates the icon-to-window Flip animation across two unrelated
 * components (DesktopIcon, Window).
 *
 * Flow: DesktopIcon's onDoubleClick reads its own bounding rect and stashes
 * it here, keyed by window kind. Then it calls `open(kind)`. The new Window
 * component mounts and on layout-effect reads (and consumes) the rect via
 * `consumePendingOpen(kind)`. If found, it animates from that rect to the
 * final window position. If not found (URL-driven open, popstate restore,
 * localStorage hydrate), it falls back to a simple fade-in.
 *
 * Module-level state is fine here: only one open animation can be queued
 * per kind at a time, and we delete on consume.
 */

import type { WindowKind } from './windowManager';

const pending = new Map<WindowKind, DOMRect>();

export function setPendingOpen(kind: WindowKind, rect: DOMRect): void {
  pending.set(kind, rect);
}

export function consumePendingOpen(kind: WindowKind): DOMRect | null {
  const rect = pending.get(kind);
  pending.delete(kind);
  return rect ?? null;
}

export function _resetPendingOpensForTests(): void {
  pending.clear();
}
