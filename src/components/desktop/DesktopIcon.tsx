import { useState, useEffect, useRef, type ReactNode } from 'react';
import type { WindowKind } from './windowManager';
import { setPendingOpen } from './openAnimation';

interface Props {
  kind: WindowKind;
  label: string;
  /** ReactNode rendered inside the .glyph slot. Pass an inline SVG component
   *  (preferred) or a string emoji (fallback). */
  glyph: ReactNode;
  /** Position on the desktop, in pixels. */
  x: number;
  y: number;
  onOpen: () => void;
}

/**
 * Desktop icon. Single-click selects (highlights), double-click opens.
 * Win98 spacing: ~80px wide cells, label wraps to 2 lines if needed.
 *
 * Custom PNG sprites are deferred (icons live in the custom-CSS budget, not
 * 98.css proper). The emoji glyph is a usable placeholder until then.
 */
export function DesktopIcon({ kind, label, glyph, x, y, onOpen }: Props) {
  const [selected, setSelected] = useState(false);
  const rootRef = useRef<HTMLButtonElement | null>(null);

  // Click outside deselects.
  useEffect(() => {
    if (!selected) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setSelected(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [selected]);

  /**
   * Capture this icon's bounding rect before opening, so the Window
   * component can Flip-animate from this position. The rect lives in the
   * openAnimation module's pending map keyed by kind; the next Window of
   * that kind to mount consumes it.
   */
  function handleOpen() {
    if (rootRef.current) {
      setPendingOpen(kind, rootRef.current.getBoundingClientRect());
    }
    onOpen();
  }

  return (
    <button
      ref={rootRef}
      type="button"
      className={`kport-desktop-icon ${selected ? 'selected' : ''}`}
      style={{ left: x, top: y }}
      data-kind={kind}
      onClick={() => setSelected(true)}
      onDoubleClick={handleOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') handleOpen();
      }}
      aria-label={`Open ${label}`}
    >
      <span className="glyph" aria-hidden="true">
        {glyph}
      </span>
      <span className="label">{label}</span>
    </button>
  );
}
