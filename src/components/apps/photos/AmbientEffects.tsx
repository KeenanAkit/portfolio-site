import { useEffect, useRef } from 'react';
import { useWindowManager, type WinId } from '../../desktop/windowManager';
import { reducedMotion } from '../../../lib/motion';

interface Props {
  winId: WinId;
}

/**
 * Canvas overlay for per-room ambient effects (dust motes drifting through
 * sunlight). One instance lives inside each room.
 *
 * RAF lifecycle gate: only animate when ALL THREE are true:
 *   1. document.visibilityState === 'visible'
 *   2. The owning window is the focused window in the manager
 *   3. The owning window is not minimized
 *
 * Under `prefers-reduced-motion: reduce`, paint once with static motes and
 * never schedule a frame. Always paint at least once on mount so a
 * minimized-then-restored window doesn't show a blank canvas.
 *
 * See src/components/desktop/StarField.tsx for the established pattern.
 */
export function AmbientEffects({ winId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const focused = useWindowManager(
    (s) => s.focusedId === winId && !s.windows.find((w) => w.id === winId)?.minimized
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = reducedMotion();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Mote sprite state. Density tuned to feel like sunlit dust — sparse.
    const MOTE_COUNT = 7;
    type Mote = { x: number; y: number; vy: number; size: number; alpha: number };
    const motes: Mote[] = [];

    function sizeToParent() {
      const parent = canvas?.parentElement;
      if (!canvas || !parent) return;
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      if (ctx) ctx.scale(dpr, dpr);
    }

    function spawnMotes() {
      if (!canvas) return;
      motes.length = 0;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      for (let i = 0; i < MOTE_COUNT; i++) {
        motes.push({
          x: Math.random() * w,
          y: Math.random() * h,
          // Slow drift downward. Reduced-motion path freezes these.
          vy: 0.05 + Math.random() * 0.15,
          size: 1 + Math.random() * 1.5,
          alpha: 0.25 + Math.random() * 0.35,
        });
      }
    }

    function paint() {
      if (!canvas || !ctx) return;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      ctx.clearRect(0, 0, w, h);
      // Read sconce color from CSS so motes echo the active lighting
      // variant. Falls back to a warm default.
      const computed = getComputedStyle(canvas.parentElement ?? canvas);
      const tint =
        computed.getPropertyValue('--gallery-light-dusk-sconce').trim() ||
        'rgba(255,232,160,0.45)';
      ctx.fillStyle = tint;
      for (const m of motes) {
        ctx.globalAlpha = m.alpha;
        ctx.fillRect(Math.round(m.x), Math.round(m.y), m.size, m.size);
      }
      ctx.globalAlpha = 1;
    }

    function tick() {
      if (!canvas) return;
      const h = canvas.height / dpr;
      const w = canvas.width / dpr;
      for (const m of motes) {
        m.y += m.vy;
        if (m.y > h) {
          m.y = -m.size;
          m.x = Math.random() * w;
        }
      }
      paint();
      rafRef.current = requestAnimationFrame(tick);
    }

    function start() {
      if (reduced) {
        // Static render: paint once and stay parked.
        paint();
        return;
      }
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(tick);
    }

    function stop() {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    }

    sizeToParent();
    spawnMotes();
    paint();
    if (focused) start();

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') stop();
      else if (focused) start();
    };
    const onResize = () => {
      sizeToParent();
      spawnMotes();
      paint();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('resize', onResize);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', onResize);
    };
  }, [focused, winId]);

  return (
    <canvas
      ref={canvasRef}
      className="kport-room__ambient"
      aria-hidden="true"
      data-ornament="ambient"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 8,
      }}
    />
  );
}
