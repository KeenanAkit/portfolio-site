import { useEffect, useRef, useState } from 'react';
import { useWindowManager, type WinId } from '../../desktop/windowManager';
import { readPhotosState } from './types';
import { gsap } from '../../../lib/gsap-plugins';
import { motionDuration, reducedMotion } from '../../../lib/motion';

interface Props {
  id: WinId;
}

/* -----------------------------------------------------------------------------
 * World coordinates (single merged-image pixel space, at scale 1.0)
 *
 * The storefront uses a SINGLE painted panorama (street-scene-v2.png,
 * 2172x724) instead of a multi-panel composite. The Sneaky Dee's, Victorian,
 * PHOTOS shop, garage, DEFUSED ESPORTS, COFFEE shop, and TTC streetcar all
 * live in this one image. (rooms.css is the source of truth for the path.)
 *
 * The PHOTOS shop's painted center is at image-x = 1062 — that's the
 * character's spawn point and the focal interaction zone.
 * -------------------------------------------------------------------------- */
const WORLD_WIDTH = 2172;          // V2 panorama native width
const WORLD_MIN_X = 60;            // padding from the left edge of the world
const WORLD_MAX_X = WORLD_WIDTH - 60;
const SHOP_DOOR_X = 1085;          // shop center in image x (V2 spawn point)
const SHOP_INTERACT_RADIUS = 80;   // character within ±80px of shop = interactable
                                    // (a bit wider than v1 since V2 shop is 310 px
                                    // wide vs old 170, so the natural "in front of
                                    // shop" zone is correspondingly larger)
const WALK_SPEED_PX_PER_SEC = 200; // source-px per second at scale 1.0 — slower
                                    // than the old 320 because the world is now
                                    // ~43% the width, so 200 gives a similar
                                    // wall-to-wall traversal time (~10s)
const DEFAULT_SCENE_SCALE = 1.0;   // fallback if CSS var lookup fails on first render

/**
 * Photos.exe exterior state — a side-scrolling Toronto block at sunset.
 *
 * The user controls a small character with the keyboard (←/→ or A/D to walk,
 * ↑ or E to enter the shop when standing in the doorway). The painted scene
 * scrolls horizontally to keep the character at the window's horizontal
 * center; the character itself is rendered at a fixed window position. World
 * bounds clamp movement at the edges of the panorama (2172px wide at scale
 * 1.0; scaled by --storefront-scale).
 *
 * Standing in the shop's interaction zone shows a floating "↑ ENTER" prompt
 * above the character. Pressing ↑ or E (or, via the mobile/AT fallback
 * button below the canvas) runs the door-swing GSAP timeline: the shop
 * scales up briefly and the whole storefront cross-fades out. At animation
 * end we dispatch `mode = 'interior'`, swapping to <PhotosGallery>.
 *
 * Under `prefers-reduced-motion: reduce`, the walk animation is skipped
 * (character snaps frame-by-frame instead) and the door transition is
 * dispatched immediately.
 */
export function PhotosStorefront({ id }: Props) {
  const setAppState = useWindowManager((s) => s.setAppState);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const transitioning = useRef(false);

  // Character state: world x (composite pixels at scale 1.0), facing direction,
  // and whether currently walking (controls the walk-cycle animation play state).
  const [charX, setCharX] = useState(SHOP_DOOR_X);
  const [facing, setFacing] = useState<'left' | 'right'>('right');
  const [walking, setWalking] = useState(false);
  // Mirror of `walking` so the RAF loop only calls setWalking on transitions,
  // not every idle frame (each call costs a render-bailout pass otherwise).
  const walkingRef = useRef(false);

  // Storefront width tracked via ResizeObserver. Required for the camera
  // clamp math — without knowing the visible window width we can't decide
  // when to stop scrolling and let the character drift to the window edge.
  const [storefrontWidth, setStorefrontWidth] = useState(1280);

  // Scene zoom from the --storefront-scale CSS var. Read into state after mount
  // (and on resize) — reading it in the render body returns the fallback on
  // first paint because the ref hasn't attached yet, leaving the camera math
  // stuck at 1.0 until an unrelated re-render.
  const [sceneScale, setSceneScale] = useState(DEFAULT_SCENE_SCALE);

  // Held-key state — updated by the keyboard handler, read by the RAF loop.
  // Refs (not state) so changing them doesn't re-render the component.
  const heldKeys = useRef({ left: false, right: false });
  const charXRef = useRef(charX);
  charXRef.current = charX;

  // Camera clamp: don't scroll past the painted world's edges. When the
  // character walks within half-a-window of either world edge, the camera
  // stops following and the character drifts toward the window's edge
  // instead — the classic side-scroller convention.
  //
  // Math (everything in composite x, scale 1.0):
  //   halfWindowInWorld = window pixels / 2 / sceneScale
  //   minCamera = halfWindowInWorld
  //   maxCamera = WORLD_WIDTH - halfWindowInWorld
  //   cameraX   = clamp(charX, minCamera, maxCamera)
  //   charOffset (screen px) = (charX - cameraX) * sceneScale
  //
  // If the window is wider than the painted world (windowPx > WORLD*scale),
  // maxCamera < minCamera; we collapse to centering the world (camera at
  // world midpoint), which letterboxes both edges with the gradient.
  const halfWindowInWorld = storefrontWidth / (2 * sceneScale);
  const minCameraX = halfWindowInWorld;
  const maxCameraX = Math.max(minCameraX, WORLD_WIDTH - halfWindowInWorld);
  const cameraX = clamp(charX, minCameraX, maxCameraX);
  const charOffsetPx = (charX - cameraX) * sceneScale;

  // Whether the character is currently within the shop's interaction zone.
  // Derived from charX each render; used to show the floating prompt and to
  // gate the [↑] / [E] interaction key.
  const inInteractZone = Math.abs(charX - SHOP_DOOR_X) <= SHOP_INTERACT_RADIUS;

  useEffect(() => {
    return () => {
      const root = rootRef.current;
      if (root) gsap.killTweensOf(root);
    };
  }, []);

  // Track the storefront's rendered width. Drives the camera clamp math
  // above so the camera stops scrolling at the world's edges rather than
  // revealing the gradient letterbox.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // Initialize from the current rect so the first paint uses real dims
    // instead of the default fallback.
    setStorefrontWidth(root.getBoundingClientRect().width);
    setSceneScale(readSceneScale(root) ?? DEFAULT_SCENE_SCALE);
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setStorefrontWidth(e.contentRect.width);
      }
      // --storefront-scale may shift via media queries as the window resizes.
      setSceneScale(readSceneScale(root) ?? DEFAULT_SCENE_SCALE);
    });
    ro.observe(root);
    return () => ro.disconnect();
  }, []);

  const enterGallery = () => {
    if (transitioning.current) return;

    if (reducedMotion() || !rootRef.current) {
      setAppState(id, { mode: 'interior' });
      return;
    }

    transitioning.current = true;
    const root = rootRef.current;
    const shop = root.querySelector<HTMLElement>('.kport-storefront__shop');

    const tl = gsap.timeline({
      defaults: { ease: 'power2.in' },
      onComplete: () => {
        gsap.set(root, { clearProps: 'opacity' });
        if (shop) gsap.set(shop, { clearProps: 'transform' });
        transitioning.current = false;
        setAppState(id, { mode: 'interior' });
      },
    });

    if (shop) {
      tl.to(shop, {
        scale: 1.12,
        duration: motionDuration(200) / 1000,
      });
    }
    tl.to(
      root,
      {
        opacity: 0,
        duration: motionDuration(200) / 1000,
      },
      '<+0.05'
    );
  };

  // Keyboard input. Listener on the storefront root (which is focusable via
  // tabIndex=0) so the game only responds when the storefront window is
  // focused — prevents arrows from controlling the character while the user
  // is interacting with another Win98 window or typing in a form elsewhere.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // Don't intercept keys while a modal/transition is running, or while
      // a modifier is held (e.g., Alt+F4 close-window must still work).
      if (transitioning.current) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;

      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          heldKeys.current.left = true;
          setFacing('left');
          e.preventDefault();
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          heldKeys.current.right = true;
          setFacing('right');
          e.preventDefault();
          break;
        case 'ArrowUp':
        case 'e':
        case 'E':
        case 'Enter':
          // Interact key — only fires if currently in the shop interaction zone.
          if (Math.abs(charXRef.current - SHOP_DOOR_X) <= SHOP_INTERACT_RADIUS) {
            enterGallery();
            e.preventDefault();
          }
          break;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          heldKeys.current.left = false;
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          heldKeys.current.right = false;
          break;
      }
    };

    root.addEventListener('keydown', onKeyDown);
    root.addEventListener('keyup', onKeyUp);
    // Auto-focus on mount so arrow keys work without an explicit click.
    root.focus();

    return () => {
      root.removeEventListener('keydown', onKeyDown);
      root.removeEventListener('keyup', onKeyUp);
    };
    // enterGallery is stable across renders within this component's lifetime
    // (no deps change it); intentionally excluded to keep the handler stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Movement loop. requestAnimationFrame so movement is smooth and frame-rate
  // independent (delta-time based, not per-frame). Walking flag drives the
  // sprite's walk-cycle animation play state.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); // clamp to 50ms to avoid huge jumps after tab-away
      last = now;

      const keys = heldKeys.current;
      const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);

      if (dir !== 0) {
        setCharX((prev) => {
          const next = prev + dir * WALK_SPEED_PX_PER_SEC * dt;
          return Math.max(WORLD_MIN_X, Math.min(WORLD_MAX_X, next));
        });
      }
      // Only flip walk state on transitions so standing still doesn't re-render
      // the storefront 60×/sec.
      const nextWalking = dir !== 0;
      if (nextWalking !== walkingRef.current) {
        walkingRef.current = nextWalking;
        setWalking(nextWalking);
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // CSS variables that drive the camera (background-position) and the
  // character/prompt's horizontal drift when the camera is clamped at
  // world edges. rooms.css consumes:
  //   --cam-x       : composite-x the camera centers on (clamped)
  //   --char-offset : screen-px offset of the character from window center
  //                   (0 in the middle, positive when camera is left-clamped,
  //                   negative when right-clamped)
  const sceneStyle = {
    '--cam-x': String(cameraX),
    '--char-offset': `${charOffsetPx}px`,
  } as React.CSSProperties;

  return (
    <div
      className="kport-storefront"
      ref={rootRef}
      tabIndex={0}
      style={sceneStyle}
      data-walking={walking ? 'true' : 'false'}
      data-facing={facing}
      data-can-interact={inInteractZone ? 'true' : 'false'}
    >
      {/*
        Side-scrolling Toronto block (2026-06-22): the painted panorama
        scrolls horizontally to follow the visitor character. Character
        spawns in front of the photo shop. Keyboard: ←/→ or A/D to walk,
        ↑/E to enter when in the shop's interaction zone.

        See rooms.css for the camera math driven by --cam-x / --char-offset.
      */}

      <div
        className="kport-character"
        aria-hidden="true"
        data-walking={walking ? 'true' : 'false'}
        data-facing={facing}
      />

      <div className="kport-storefront__interact-prompt" aria-hidden="true">
        ↑ ENTER
      </div>

      {/*
        Hidden transparent overlay over the painted shop. Kept for AT users
        who navigate via tab/click (gets focus + clickable area). Hidden
        visually so the painted shop is unobstructed.
      */}
      <button
        type="button"
        className="kport-storefront__shop"
        aria-label="Enter the photography gallery"
        onClick={enterGallery}
      />

      {/*
        AT / mobile fallback: visible chunky Win98 button so users who don't
        play the keyboard game (screen reader, touch, reduced-motion + no
        keyboard) still have an obvious path into the gallery.
      */}
      <button
        type="button"
        className="kport-storefront__enter-button"
        onClick={enterGallery}
      >
        Enter the gallery →
      </button>
    </div>
  );
}

/** Read the current --storefront-scale CSS variable on the storefront root.
 *  Returns null on the first render before refs attach, so callers should
 *  fall back to DEFAULT_SCENE_SCALE. The value lives in CSS so designers
 *  can tune the scene zoom by editing one rule, but the camera-clamp math
 *  needs it in JS — this is the bridge. */
function readSceneScale(root: HTMLElement | null): number | null {
  if (!root) return null;
  const raw = getComputedStyle(root).getPropertyValue('--storefront-scale').trim();
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Clamp a number to [min, max], permissive about min > max (defaults to min). */
function clamp(v: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.max(min, Math.min(max, v));
}

/** Re-export so PhotosApp can dispatch without leaking the readPhotosState
 *  helper to consumers. */
export { readPhotosState };
