import { useEffect, useRef, useState } from 'react';

const IDLE_MS = 60_000;

interface Props {
  /** Override the idle timeout. Test-only. */
  idleMs?: number;
}

/**
 * Win98-style Mystify screensaver. After IDLE_MS of no input the canvas
 * fades in and starts drawing a few polygons whose vertices bounce off the
 * canvas edges, leaving fading trails (achieved by drawing a translucent
 * black rect over the whole canvas each frame instead of clearing).
 *
 * Dismissed on any input (mousemove, mousedown, keydown, touchstart, wheel).
 * Skipped entirely under prefers-reduced-motion.
 *
 * 2D not 3D — the 3D Pipes version is in the beyond-v1 queue.
 */
export function Screensaver({ idleMs = IDLE_MS }: Props) {
  const [active, setActive] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // Idle timer
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    function reset() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setActive(true), idleMs);
    }

    // Dismiss handler lives in the active-state effect below (see useEffect
    // on [active]). The idle-tracker only needs to reset the timer.
    function onInputWhileIdle() {
      reset();
    }

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel'];
    function attach(handler: EventListener) {
      events.forEach((ev) =>
        window.addEventListener(ev, handler, { passive: true })
      );
      return () =>
        events.forEach((ev) =>
          window.removeEventListener(ev, handler, { capture: false })
        );
    }

    let detach = attach(onInputWhileIdle as EventListener);
    reset();

    // When `active` flips, we re-bind to a dismiss handler.
    // Since we can't conditionally re-run inside this effect, the parent
    // pattern works: keep the same effect, but the handlers check `active`
    // via a ref captured from state below.
    return () => {
      if (timer) clearTimeout(timer);
      detach();
    };
    // We intentionally do NOT depend on `active` here — see useEffect below
    // for the dismiss logic.
  }, [idleMs]);

  // When active, install dismiss listeners and start the canvas loop.
  useEffect(() => {
    if (!active) return;
    if (typeof window === 'undefined') return;

    function dismiss() {
      setActive(false);
    }
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel'];
    events.forEach((ev) =>
      window.addEventListener(ev, dismiss, { once: true, passive: true })
    );

    // Canvas drawing
    const canvas = canvasRef.current;
    if (!canvas) {
      return () => {
        events.forEach((ev) =>
          window.removeEventListener(ev, dismiss, { capture: false })
        );
      };
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return () => {
        events.forEach((ev) =>
          window.removeEventListener(ev, dismiss, { capture: false })
        );
      };
    }
    ctx.scale(dpr, dpr);

    const polygons = makePolygons(window.innerWidth, window.innerHeight, 3);
    let lastFrame = performance.now();

    function frame(now: number) {
      const dt = Math.min(40, now - lastFrame); // clamp to avoid huge steps
      lastFrame = now;

      // Fading trail effect: paint translucent black over the canvas.
      ctx!.fillStyle = 'rgba(0, 0, 0, 0.08)';
      ctx!.fillRect(0, 0, window.innerWidth, window.innerHeight);

      for (const poly of polygons) {
        stepPolygon(poly, dt, window.innerWidth, window.innerHeight);
        drawPolygon(ctx!, poly);
      }

      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      events.forEach((ev) =>
        window.removeEventListener(ev, dismiss, { capture: false })
      );
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [active]);

  if (!active) return null;

  return (
    <div className="kport-screensaver" role="presentation" aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}

// ---------- Polygon math ----------

interface Vec {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Polygon {
  verts: Vec[];
  hue: number;
  hueSpeed: number; // degrees per ms
}

function makePolygons(w: number, h: number, count: number): Polygon[] {
  const polys: Polygon[] = [];
  for (let i = 0; i < count; i++) {
    const verts: Vec[] = [];
    const vertCount = 4 + Math.floor(Math.random() * 3); // 4-6 vertices
    for (let v = 0; v < vertCount; v++) {
      verts.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
      });
    }
    polys.push({
      verts,
      hue: Math.random() * 360,
      hueSpeed: (Math.random() - 0.5) * 0.05,
    });
  }
  return polys;
}

function stepPolygon(poly: Polygon, dt: number, w: number, h: number): void {
  for (const v of poly.verts) {
    v.x += v.vx * dt;
    v.y += v.vy * dt;
    if (v.x <= 0) {
      v.x = 0;
      v.vx = Math.abs(v.vx);
    } else if (v.x >= w) {
      v.x = w;
      v.vx = -Math.abs(v.vx);
    }
    if (v.y <= 0) {
      v.y = 0;
      v.vy = Math.abs(v.vy);
    } else if (v.y >= h) {
      v.y = h;
      v.vy = -Math.abs(v.vy);
    }
  }
  poly.hue = (poly.hue + poly.hueSpeed * dt + 360) % 360;
}

function drawPolygon(ctx: CanvasRenderingContext2D, poly: Polygon): void {
  if (poly.verts.length < 2) return;
  ctx.strokeStyle = `hsl(${poly.hue.toFixed(0)}, 75%, 60%)`;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(poly.verts[0].x, poly.verts[0].y);
  for (let i = 1; i < poly.verts.length; i++) {
    ctx.lineTo(poly.verts[i].x, poly.verts[i].y);
  }
  ctx.closePath();
  ctx.stroke();
}
