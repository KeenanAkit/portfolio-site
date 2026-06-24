/**
 * Motion gating utility. Centralizes the `prefers-reduced-motion` check so
 * every animation entry point (CSS-driven AND GSAP-driven) consults the same
 * source of truth.
 *
 * Background: CSS variables can resolve to 0ms when reduce is set, but
 * GSAP-driven imperative animations (door swing, sconce stagger, etc.) and
 * canvas RAF loops need an explicit JS check. Use these helpers wherever
 * animation duration matters.
 */

/**
 * True if the user has set the OS-level "Reduce motion" preference.
 *
 * Safe to call in SSR contexts; returns false when `window` is undefined.
 */
export function reducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Returns `ms` normally, or 0 if the user prefers reduced motion. Use this at
 * every duration / delay site so animations collapse to instant transforms
 * without scattering `if (reducedMotion()) ...` blocks across the codebase.
 *
 * @example
 *   gsap.to(el, { x: 100, duration: motionDuration(280) / 1000, ease: 'power2.out' });
 */
export function motionDuration(ms: number): number {
  return reducedMotion() ? 0 : ms;
}
