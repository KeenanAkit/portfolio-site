/**
 * Idempotent GSAP plugin registration.
 *
 * React 19 StrictMode double-mounts in dev. Without a guard,
 * gsap.registerPlugin(Draggable) would run twice and create two sets
 * of plugin instances. The flag below makes the call a no-op after the
 * first successful registration.
 *
 * Also SSR-safe: returns without touching gsap on the server.
 */

import { gsap } from 'gsap';
import { Draggable } from 'gsap/Draggable';

let registered = false;

export function registerGsapPlugins(): void {
  if (registered) return;
  if (typeof window === 'undefined') return; // SSR safety
  gsap.registerPlugin(Draggable);
  registered = true;
}

export { gsap, Draggable };
