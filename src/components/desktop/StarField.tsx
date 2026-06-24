import { useEffect, useRef } from 'react';

/**
 * Win95 "Starfield Simulation" vibe as the desktop wallpaper.
 *
 * Each star has a fixed 2D direction from the center and a growing distance.
 * As distance grows, the star moves outward, accelerates (closer = faster),
 * grows in size, and brightens — the parallax illusion that you're flying
 * through space. When a star leaves the viewport it respawns at the center
 * with a new random direction.
 *
 * Performance:
 *   - Canvas sized once on mount + on resize via ResizeObserver.
 *   - DPR clamped to 2 to avoid huge canvases on 3x retina displays.
 *   - Paused via `requestAnimationFrame` cancellation when the document is
 *     hidden (tab in background) and when the active screensaver is up
 *     (no point running two animations on top of each other).
 *   - Reduced-motion: stars are drawn ONCE at random positions, then we exit
 *     the loop. Static field, no animation.
 *
 * Visual:
 *   - Deep Win98 teal background (#006666 — slightly darker than the bare
 *     teal so the stars pop without the wallpaper feeling muddy)
 *   - White + cyan stars, brightness scales with depth.
 */
export function StarField() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const canvasMaybe = canvasRef.current;
    if (!canvasMaybe) return;
    const canvas: HTMLCanvasElement = canvasMaybe;
    const ctxMaybe = canvas.getContext('2d');
    if (!ctxMaybe) return;
    const ctx: CanvasRenderingContext2D = ctxMaybe;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let width = 0;
    let height = 0;
    let cx = 0;
    let cy = 0;

    interface Star {
      // Direction (unit vector) from center
      dx: number;
      dy: number;
      // Distance from center (in canvas pixels), grows over time
      dist: number;
      // Speed multiplier per star (a little variety)
      speed: number;
      // Hue (white-ish vs cyan-ish)
      hue: 'white' | 'cyan';
    }

    const STAR_COUNT = 220;
    const stars: Star[] = [];

    function freshStar(maxDist: number): Star {
      const angle = Math.random() * Math.PI * 2;
      return {
        dx: Math.cos(angle),
        dy: Math.sin(angle),
        // Spawn at a random starting distance so the field is full immediately
        // instead of fading in from a black center for the first 5 seconds.
        dist: Math.random() * maxDist,
        speed: 0.5 + Math.random() * 1.0,
        hue: Math.random() < 0.18 ? 'cyan' : 'white',
      };
    }

    function fit() {
      width = window.innerWidth;
      height = window.innerHeight;
      cx = width / 2;
      cy = height / 2;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(document.documentElement);

    const maxDist = Math.hypot(width, height) / 2 + 50;
    for (let i = 0; i < STAR_COUNT; i++) stars.push(freshStar(maxDist));

    function drawBackground() {
      ctx.fillStyle = '#006666';
      ctx.fillRect(0, 0, width, height);
    }

    function drawStars() {
      for (const s of stars) {
        const sx = cx + s.dx * s.dist;
        const sy = cy + s.dy * s.dist;
        if (sx < -4 || sx > width + 4 || sy < -4 || sy > height + 4) continue;
        // Size and brightness scale with distance from center (perspective).
        const t = Math.min(1, s.dist / maxDist);
        const size = 0.6 + t * 2.4;
        const alpha = 0.25 + t * 0.7;
        if (s.hue === 'cyan') {
          ctx.fillStyle = `rgba(170, 255, 255, ${alpha})`;
        } else {
          ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        }
        ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
      }
    }

    if (reduced) {
      // Static field. Place stars at random distances and stop.
      for (const s of stars) {
        s.dist = Math.random() * maxDist;
      }
      drawBackground();
      drawStars();
      return () => {
        ro.disconnect();
      };
    }

    let lastFrame = performance.now();
    let paused = document.hidden;

    function frame(now: number) {
      if (paused) {
        rafRef.current = requestAnimationFrame(frame);
        return;
      }
      const dt = Math.min(40, now - lastFrame); // clamp at 40ms to avoid huge jumps
      lastFrame = now;

      drawBackground();

      const localMaxDist = Math.hypot(width, height) / 2 + 50;

      for (const s of stars) {
        // Perspective acceleration: speed scales with distance so stars
        // appear to rush outward as they approach the edges.
        const accel = 1 + (s.dist / localMaxDist) * 3.5;
        s.dist += s.speed * accel * (dt / 16);
        if (s.dist > localMaxDist) {
          // Respawn at center with new direction
          const angle = Math.random() * Math.PI * 2;
          s.dx = Math.cos(angle);
          s.dy = Math.sin(angle);
          s.dist = 0;
          s.speed = 0.5 + Math.random() * 1.0;
          s.hue = Math.random() < 0.18 ? 'cyan' : 'white';
        }
      }

      drawStars();
      rafRef.current = requestAnimationFrame(frame);
    }

    function onVisibilityChange() {
      paused = document.hidden;
      lastFrame = performance.now();
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="kport-starfield"
      aria-hidden="true"
    />
  );
}
