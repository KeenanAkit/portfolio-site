import { useEffect, useRef } from 'react';
import { gsap } from '../../lib/gsap-plugins';

/**
 * Pure trigger-condition check, extracted for testability.
 * Returns true ONLY for the kind of click that should fire the shutdown animation:
 * - plain left-click (button 0)
 * - no modifier keys (meta/ctrl/shift/alt)
 * - the anchor's host differs from window.location.host (cross-origin)
 * - no target="_blank" (would open in a new tab)
 * - no `download` attribute
 *
 * Middle-click and cmd-click must not trigger it — those mean "open in a new
 * tab", and collapsing the desktop would break that intent.
 */
export function shouldFireShutdown(
  e: Pick<
    MouseEvent,
    'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'defaultPrevented'
  >,
  anchor: Pick<HTMLAnchorElement, 'host' | 'target'> & {
    hasAttribute: (name: string) => boolean;
  },
  currentHost: string
): boolean {
  if (e.button !== 0) return false;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  if (e.defaultPrevented) return false;
  if (anchor.target === '_blank') return false;
  if (anchor.hasAttribute('download')) return false;
  if (!anchor.host) return false;
  if (anchor.host === currentHost) return false;
  return true;
}

/**
 * Install document-level click handler that intercepts qualifying outbound
 * anchor clicks and runs a CRT collapse animation on the supplied target
 * element (the desktop root) before navigating.
 *
 * Skipped under prefers-reduced-motion: in that mode anchors navigate
 * normally with no animation.
 */
export function useShutdownAnimation(
  desktopRef: React.RefObject<HTMLElement | null>
): void {
  const animatingRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    // Tracked so we can tear down a half-run collapse: the flash node must be
    // removed and the desktop transform cleared, or the desktop is left
    // invisible and click-dead.
    let activeTl: ReturnType<typeof gsap.timeline> | null = null;
    let flashNode: HTMLDivElement | null = null;

    function teardown() {
      activeTl?.kill();
      activeTl = null;
      if (flashNode) {
        flashNode.remove();
        flashNode = null;
      }
      const root = desktopRef.current;
      if (root) gsap.set(root, { clearProps: 'transform,opacity' });
      animatingRef.current = false;
    }

    function onClick(e: MouseEvent) {
      if (animatingRef.current) return; // already collapsing; ignore re-clicks
      // Walk up from the click target looking for the nearest <a>.
      const target = e.target as Element | null;
      const anchor =
        target && 'closest' in target
          ? (target.closest('a') as HTMLAnchorElement | null)
          : null;
      if (!anchor || !anchor.href) return;

      if (!shouldFireShutdown(e, anchor, window.location.host)) return;

      e.preventDefault();
      animatingRef.current = true;

      const root = desktopRef.current;
      const href = anchor.href;
      const tl = gsap.timeline({
        onComplete: () => {
          if (flashNode) {
            flashNode.remove();
            flashNode = null;
          }
          window.location.href = href;
        },
      });
      activeTl = tl;

      if (root) {
        // CRT collapse: shrink Y to a hairline, flash white, fade to black.
        tl.to(root, {
          scaleY: 0.003,
          duration: 0.22,
          ease: 'power3.in',
          transformOrigin: 'center center',
        });
        tl.to(
          root,
          {
            scaleX: 0,
            opacity: 0,
            duration: 0.16,
            ease: 'power2.out',
          },
          '+=0.05'
        );
        // White flash overlay.
        const flash = document.createElement('div');
        flash.style.cssText =
          'position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:99999;';
        document.body.appendChild(flash);
        flashNode = flash;
        tl.fromTo(
          flash,
          { opacity: 0 },
          { opacity: 1, duration: 0.08, ease: 'none' },
          0.22
        );
        tl.to(flash, { opacity: 0, duration: 0.1, ease: 'none' }, 0.35);
      } else {
        // Fallback: just a short delay if there's no desktop root.
        tl.to({}, { duration: 0.3 });
      }
    }

    // The collapse navigates cross-origin, so the page is normally torn down.
    // But if the user hits Back, the browser restores this page from bfcache
    // mid-collapse (desktop scaled to a hairline, animatingRef stuck true).
    // Reset everything so the restored desktop is usable. (TODOS: bfcache.)
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) teardown();
    }

    document.addEventListener('click', onClick, { capture: true });
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('click', onClick, { capture: true });
      window.removeEventListener('pageshow', onPageShow);
      teardown();
    };
  }, [desktopRef]);
}
