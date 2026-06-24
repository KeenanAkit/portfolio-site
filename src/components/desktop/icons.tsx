/**
 * Inline SVG desktop icons styled to look like classic Windows 98.
 *
 * Each icon is 32×32 viewBox with hard-edged shapes, 2-tone shading (light +
 * shadow), and the Win98 muted palette. No gradients, no soft shadows.
 *
 * Drawn from scratch to avoid licensing weirdness. Approximations of the
 * Win98 originals, not pixel-perfect copies. Good enough at 32px display
 * size; if you want real bitmap fidelity, swap to PNG sprites later.
 */

interface IconProps {
  className?: string;
  size?: number;
}

const ICON_SIZE = 32;

/** A yellow Win98-style folder. Used for My Pictures. */
export function FolderIcon({ className, size = ICON_SIZE }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden="true"
      style={{ shapeRendering: 'crispEdges', imageRendering: 'pixelated' }}
    >
      {/* Folder back tab */}
      <rect x="2" y="6" width="12" height="3" fill="#fdcf3a" />
      <rect x="2" y="6" width="12" height="1" fill="#fff094" />
      {/* Folder body */}
      <rect x="2" y="8" width="28" height="20" fill="#fdcf3a" />
      <rect x="2" y="8" width="28" height="1" fill="#fff094" />
      <rect x="2" y="8" width="1" height="20" fill="#fff094" />
      <rect x="2" y="27" width="28" height="1" fill="#a87b1c" />
      <rect x="29" y="8" width="1" height="20" fill="#a87b1c" />
      {/* Highlight stripe along the top */}
      <rect x="4" y="11" width="24" height="1" fill="#fff094" opacity="0.5" />
    </svg>
  );
}

/** A muted briefcase for My Projects. */
export function BriefcaseIcon({ className, size = ICON_SIZE }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden="true"
      style={{ shapeRendering: 'crispEdges' }}
    >
      {/* Handle */}
      <rect x="12" y="5" width="8" height="2" fill="#3b2a18" />
      <rect x="11" y="6" width="1" height="3" fill="#3b2a18" />
      <rect x="20" y="6" width="1" height="3" fill="#3b2a18" />
      {/* Body */}
      <rect x="3" y="9" width="26" height="18" fill="#7a5a36" />
      <rect x="3" y="9" width="26" height="1" fill="#a07d4f" />
      <rect x="3" y="9" width="1" height="18" fill="#a07d4f" />
      <rect x="28" y="9" width="1" height="18" fill="#3b2a18" />
      <rect x="3" y="26" width="26" height="1" fill="#3b2a18" />
      {/* Latch */}
      <rect x="14" y="15" width="4" height="3" fill="#d4b277" />
      <rect x="14" y="15" width="4" height="1" fill="#f0d4a0" />
      <rect x="15" y="16" width="2" height="1" fill="#3b2a18" />
    </svg>
  );
}

/** A spiral-bound notepad with lined pages. Used for the blog window. */
export function NotepadIcon({ className, size = ICON_SIZE }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden="true"
      style={{ shapeRendering: 'crispEdges' }}
    >
      {/* Page */}
      <rect x="6" y="4" width="22" height="25" fill="#fcfaf2" />
      <rect x="6" y="4" width="22" height="1" fill="#fff" />
      <rect x="27" y="4" width="1" height="25" fill="#9a987a" />
      <rect x="6" y="28" width="22" height="1" fill="#9a987a" />
      {/* Lines */}
      {[9, 12, 15, 18, 21, 24].map((y) => (
        <rect key={y} x="10" y={y} width="15" height="1" fill="#a8c8dc" />
      ))}
      {/* Margin line */}
      <rect x="8" y="4" width="1" height="25" fill="#d49d9d" />
      {/* Spiral binding */}
      <rect x="3" y="4" width="3" height="25" fill="#c0c0c0" />
      {[5, 9, 13, 17, 21, 25].map((y) => (
        <rect key={y} x="3" y={y} width="3" height="2" fill="#666" />
      ))}
    </svg>
  );
}

/** The Recycle Bin (empty state). Saved for a future easter-egg trash window. */
export function RecycleBinIcon({ className, size = ICON_SIZE }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden="true"
      style={{ shapeRendering: 'crispEdges' }}
    >
      {/* Lid */}
      <rect x="5" y="7" width="22" height="3" fill="#a8a8a8" />
      <rect x="5" y="7" width="22" height="1" fill="#d8d8d8" />
      <rect x="13" y="5" width="6" height="2" fill="#7a7a7a" />
      {/* Body */}
      <rect x="7" y="10" width="18" height="20" fill="#8e8e8e" />
      <rect x="7" y="10" width="18" height="1" fill="#c8c8c8" />
      <rect x="7" y="10" width="1" height="20" fill="#c8c8c8" />
      <rect x="24" y="10" width="1" height="20" fill="#5a5a5a" />
      <rect x="7" y="29" width="18" height="1" fill="#5a5a5a" />
      {/* Vertical ridges */}
      <rect x="11" y="12" width="1" height="16" fill="#5a5a5a" />
      <rect x="16" y="12" width="1" height="16" fill="#5a5a5a" />
      <rect x="21" y="12" width="1" height="16" fill="#5a5a5a" />
      {/* Recycle arrows (simplified triangle motif) */}
      <path
        d="M 13 15 L 16 13 L 19 15 L 17 15 L 17 18 L 15 18 L 15 15 Z"
        fill="#3ba33b"
      />
    </svg>
  );
}
