// scripts/lib/sprite-recipes.mjs
//
// Per-sprite post-processing recipes for the sprite ingest pipeline.
// Each entry maps an inbox ID (the prefix on the saved PNG name) to:
//
//   recipe:  the kind of cleanup needed (see scripts/lib/sprite-cleanup.mjs)
//   target:  [width, height] in pixels for the final output
//   output:  filename relative to public/assets/rooms/
//
// Recipe types:
//   'corner-strip'        flood-fill backdrop from 4 corners → alpha 0,
//                         then quantize. For solid-background props.
//   'frame'               flood-fill 4 corners AND center → alpha 0
//                         (frame cutout becomes transparent so a photo can
//                         show through). Trim, downscale, quantize.
//   'opaque-tile'         no flood-fill (sprite stays fully opaque).
//                         Downscale + quantize. For wall / floor tiles.
//   'prop'                flood-fill 4 corners only, trim transparent
//                         padding, downscale, quantize. For props like
//                         fern, bench, door.

export const SPRITE_RECIPES = {
  // ---------- A. Storefront (Photos.exe exterior) ----------
  // Unbuilt props kept as a plan for a possible future interactive storefront
  // overlay. Not generated yet; the shipped exterior is the V2 panorama below.
  'A6': { recipe: 'prop', target: [80, 30], output: 'shop-sign.png' },
  'A7': { recipe: 'prop', target: [56, 64], output: 'shop-door.png' },
  'A7-hover': { recipe: 'prop', target: [56, 64], output: 'shop-door-hover.png' },
  'A8': { recipe: 'prop', target: [18, 26], output: 'lantern-lit.png' },
  'A8-dim': { recipe: 'prop', target: [18, 26], output: 'lantern-dim.png' },
  'A9': { recipe: 'prop', target: [80, 24], output: 'flowerbox.png' },
  // Exterior ships as ONE painted panorama. The old per-layer sprites
  // (sky/skyline/neighbors/tree) and earlier multi-panel composites were
  // abandoned and their assets deleted once this single image replaced the
  // whole stack. Composition: 7 buildings + tree + TTC streetcar at the
  // right edge; PHOTOS shop at image center (~x=1085).
  'STREET-SCENE-V2': { recipe: 'opaque-tile', target: [2172, 724], output: 'street-scene-v2.png' },
  'A13': { recipe: 'prop', target: [16, 14], output: 'chicken.png' },
  'A14': { recipe: 'prop', target: [30, 40], output: 'newsbox.png' },

  // ---------- B. Gallery (Photos.exe interior) ----------
  'B1': { recipe: 'opaque-tile', target: [32, 32], output: 'wall-gallery-tile.png' },
  'B2': { recipe: 'opaque-tile', target: [64, 60], output: 'wainscot-sage.png' },
  'B3': { recipe: 'opaque-tile', target: [64, 24], output: 'floor-gallery.png' },
  // 110x60 preserves the source's natural plaque aspect ratio so the letterforms
  // stay readable. The original spec called for 110x24 but that came from a
  // tight CSS rectangle; with a real sprite, we can afford the extra height.
  'B4': { recipe: 'prop', target: [110, 60], output: 'plaque-wooden.png' },
  // B5 gilt frames and B6 picture-light were dropped: frames are now CSS
  // box-shadow layers and the per-photo light is a CSS halo, so those sprites
  // were deleted.
  'B7': { recipe: 'opaque-tile', target: [60, 90], output: 'side-window.png' },
  'B8': { recipe: 'prop', target: [28, 40], output: 'fern-potted.png' },
  'B9': { recipe: 'prop', target: [180, 24], output: 'bench-oak.png' },
  // B10 door-exit was dropped: the gallery exit is a Win98 button now, not a
  // sprite, so the door sprite was deleted.

  // ---------- C. Workshop (Projects.exe interior) ----------
  'C1': { recipe: 'opaque-tile', target: [32, 32], output: 'wall-workshop-tile.png' },
  'C2': { recipe: 'opaque-tile', target: [64, 24], output: 'floor-workshop.png' },
  'C3': { recipe: 'prop', target: [280, 64], output: 'workbench.png' },
  'C4-soldering': { recipe: 'prop', target: [32, 28], output: 'tool-soldering-iron.png' },
  'C4-oscilloscope': { recipe: 'prop', target: [32, 28], output: 'tool-oscilloscope.png' },
  'C4-camera': { recipe: 'prop', target: [32, 28], output: 'tool-camera.png' },
  'C4-lens': { recipe: 'prop', target: [32, 28], output: 'tool-lens.png' },
  'C4-multimeter': { recipe: 'prop', target: [32, 28], output: 'tool-multimeter.png' },
  'C5': { recipe: 'prop', target: [140, 100], output: 'blueprint-card.png' },
  'C6-mug': { recipe: 'prop', target: [22, 22], output: 'mug.png' },
  'C6-sticky': { recipe: 'prop', target: [22, 22], output: 'sticky.png' },
  'C6-clamp': { recipe: 'prop', target: [22, 22], output: 'clamp.png' },
  'C6-pcb': { recipe: 'prop', target: [22, 22], output: 'pcb.png' },
  'C7': { recipe: 'prop', target: [120, 30], output: 'sign-wood-projects.png' },
  'C8': { recipe: 'prop', target: [60, 40], output: 'shoplight.png' },

  // ---------- D. Study (Notepad.exe interior) ----------
  'D1': { recipe: 'opaque-tile', target: [80, 56], output: 'wall-bookshelf-tile.png' },
  'D2': { recipe: 'opaque-tile', target: [64, 24], output: 'floor-study.png' },
  'D3': { recipe: 'prop', target: [260, 60], output: 'desk-dark.png' },
  'D4-dim': { recipe: 'prop', target: [36, 40], output: 'lamp-bankers-dim.png' },
  'D4-normal': { recipe: 'prop', target: [36, 40], output: 'lamp-bankers-normal.png' },
  'D4-bright': { recipe: 'prop', target: [36, 40], output: 'lamp-bankers-bright.png' },
  'D5': { recipe: 'prop', target: [14, 34], output: 'inkwell-quill.png' },
  'D6': { recipe: 'prop', target: [110, 56], output: 'paper-legal.png' },
  'D7': { recipe: 'prop', target: [110, 24], output: 'plaque-wood-notepad.png' },
  'D8': { recipe: 'opaque-tile', target: [80, 40], output: 'window-peek-dusk.png' },
  'D9': { recipe: 'prop', target: [60, 80], output: 'armchair-blanket.png' },
  'D10': { recipe: 'prop', target: [18, 24], output: 'mug-tea.png' },
  'D11': { recipe: 'prop', target: [18, 26], output: 'potted-plant-small.png' },

  // ---------- E. UI ----------
  'E3': { recipe: 'prop', target: [14, 14], output: 'cursor-hand.png' },

  // ---------- F. Characters ----------
  // Side-scrolling visitor for the storefront. Sprite sheet: 4 walk-cycle
  // frames arranged horizontally, each 48 wide x 64 tall (total 192x64).
  // Corner-strip flood-fills the magenta backdrop from the 4 corners to
  // alpha 0 WITHOUT trimming, so the frame alignment is preserved for
  // CSS steps() animation. See PhotosStorefront.tsx and .kport-character
  // in rooms.css for the playback.
  'CHARACTER-VISITOR': { recipe: 'corner-strip', target: [192, 64], output: 'character-visitor.png' },
};

/** Look up a recipe by the inbox file's ID. Tolerates two filename shapes:
 *
 *    B5-md.png                       → matches "B5-md" directly
 *    B5-frame-gilt-md.png            → matches "B5-md" via first + variant
 *    A5-attempt-3.png                → matches "A5" (fallback, no variant)
 *    C4-camera.png                   → matches "C4-camera"
 *    C4-camera-attempt-2.png         → matches "C4-camera" via first + variant
 *    b1.png                          → matches "B1" (case-insensitive)
 *
 *  The first segment + each later segment combo is tried (variant suffixes
 *  are conventionally the last word). Falls back to the first segment alone.
 *  ID matching is case-insensitive — file naming is human-facing.
 */
export function recipeForInboxName(filename) {
  const stem = filename.replace(/\.(png|jpe?g)$/i, '');
  const parts = stem.split('-');
  if (parts.length === 0) return null;

  // Build an uppercase view of the recipe IDs for case-insensitive lookup.
  // Cached on the function so this isn't recomputed every call.
  if (!recipeForInboxName._upperIndex) {
    recipeForInboxName._upperIndex = Object.fromEntries(
      Object.keys(SPRITE_RECIPES).map((k) => [k.toUpperCase(), k])
    );
  }
  const upperIndex = recipeForInboxName._upperIndex;

  const tryLookup = (candidate) => {
    const upper = candidate.toUpperCase();
    const realKey = upperIndex[upper];
    return realKey ? { id: realKey, ...SPRITE_RECIPES[realKey] } : null;
  };

  // Exact-match check first.
  const exact = tryLookup(stem);
  if (exact) return exact;

  // Try <first>-<later> combinations, scanning from the END.
  const first = parts[0];
  for (let i = parts.length - 1; i >= 1; i--) {
    const tryId = `${first}-${parts[i]}`;
    const hit = tryLookup(tryId);
    if (hit) return hit;
  }

  // Fall back to just the first segment.
  return tryLookup(first);
}
