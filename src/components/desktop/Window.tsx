import {
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type MouseEvent,
} from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useWindowManager, isResizable, type WinId } from './windowManager';
import { consumePendingOpen } from './openAnimation';
import { registerGsapPlugins, gsap, Draggable } from '../../lib/gsap-plugins';

interface Props {
  id: WinId;
  children: ReactNode;
}

/**
 * Generic Win98 window. Pulls its frame from the window-manager store and
 * mounts the children inside the chrome.
 *
 * Drag: GSAP Draggable on the title bar updates `updatePos` on the store.
 * Resize: pointer drag on the bottom-right grip updates `updateSize`.
 * Open animation: GSAP Flip from a parent-injected source rect (currently
 * just a fade-in scale; the full icon-to-window Flip is a later enhancement
 * once the icon component dispatches the source rect).
 *
 * Lifecycle: Draggable instances live in refs and are .kill()'d on unmount.
 * Plugin registration is idempotent for React 19 StrictMode (see gsap-plugins.ts).
 * useLayoutEffect runs the animation setup synchronously before paint to
 * avoid the concurrent-rendering preempt issue.
 */
export function Window({ id, children }: Props) {
  registerGsapPlugins();

  const win = useWindowManager(
    useShallow((s) => s.windows.find((w) => w.id === id))
  );
  const focusedId = useWindowManager((s) => s.focusedId);
  const focus = useWindowManager((s) => s.focus);
  const close = useWindowManager((s) => s.close);
  const minimize = useWindowManager((s) => s.minimize);
  const maximize = useWindowManager((s) => s.maximize);
  const updatePos = useWindowManager((s) => s.updatePos);
  const updateSize = useWindowManager((s) => s.updateSize);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const titleBarRef = useRef<HTMLDivElement | null>(null);
  const resizeGripRef = useRef<HTMLDivElement | null>(null);
  const draggableRef = useRef<Draggable | null>(null);
  const mountedOnce = useRef(false);

  // Move keyboard focus into the window's root on first mount so Tab cycling
  // and Escape land on the right thing. Done as a separate effect (not inside
  // the GSAP timeline) so it fires synchronously after the DOM commits.
  useEffect(() => {
    if (!rootRef.current) return;
    if (!win || win.minimized) return;
    // Only auto-focus the FIRST time this id mounts; subsequent re-renders
    // shouldn't steal focus from whatever the user is interacting with.
    if (!mountedOnce.current) {
      rootRef.current.focus({ preventScroll: true });
    }
  }, [id, win?.minimized]);

  // Open animation. Two paths:
  //   1. If a desktop icon stashed a source rect (user double-clicked an
  //      icon to open this window), Flip-animate FROM that icon position
  //      TO the final window position. Big screen-real-estate motion that
  //      sells the OS feel.
  //   2. Otherwise (URL-driven open, localStorage restore, hydrate), just
  //      fade + scale in place. No phantom rect to animate from.
  //
  // Both paths are skipped under prefers-reduced-motion; the window appears
  // instantly with no transform.
  //
  // useLayoutEffect (not useEffect) so the animation setup runs synchronously
  // before paint — avoids the React 19 concurrent-rendering preempt issue.
  useLayoutEffect(() => {
    if (!rootRef.current || !win) return;
    if (mountedOnce.current) return;
    mountedOnce.current = true;

    const target = rootRef.current;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced) {
      gsap.set(target, { opacity: 1, x: 0, y: 0, scale: 1 });
      return;
    }

    const sourceRect = consumePendingOpen(win.kind);
    const targetRect = target.getBoundingClientRect();

    if (sourceRect && targetRect.width > 0) {
      // Animate from the icon's rect to the window's rect.
      gsap.set(target, {
        x: sourceRect.left - targetRect.left,
        y: sourceRect.top - targetRect.top,
        scaleX: sourceRect.width / targetRect.width,
        scaleY: sourceRect.height / targetRect.height,
        opacity: 0.35,
        transformOrigin: 'top left',
      });
      gsap.to(target, {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        opacity: 1,
        duration: 0.32,
        ease: 'power2.out',
      });
    } else {
      gsap.fromTo(
        target,
        { opacity: 0, scale: 0.96 },
        { opacity: 1, scale: 1, duration: 0.24, ease: 'power2.out' }
      );
    }
  }, [win?.kind, win]);

  // Draggable on the title bar. Updates position via the store on drag end
  // (and continuously during drag for live feedback).
  useEffect(() => {
    if (!titleBarRef.current || !rootRef.current || !win) return;
    if (win.maximized) {
      // Disable dragging while maximized.
      if (draggableRef.current) {
        draggableRef.current.kill();
        draggableRef.current = null;
      }
      return;
    }

    const target = rootRef.current;
    const titleBar = titleBarRef.current;

    const inst = Draggable.create(target, {
      type: 'x,y',
      trigger: titleBar,
      bounds: computeDragBounds({
        x: win.x,
        y: win.y,
        width: target.offsetWidth,
        viewportW: window.innerWidth,
        viewportH: window.innerHeight,
      }),
      onPress() {
        focus(id);
      },
      onDrag() {
        // Keep store roughly in sync during drag for taskbar tab feedback.
        // Final commit happens in onDragEnd.
      },
      onDragEnd() {
        // Reset the transform GSAP applied, write the new position into the
        // store, let React re-render with the absolute coords.
        const t = this as Draggable;
        const newX = win.x + t.x;
        const newY = win.y + t.y;
        gsap.set(target, { x: 0, y: 0 });
        updatePos(id, newX, newY);
      },
    })[0];

    draggableRef.current = inst;

    return () => {
      if (draggableRef.current) {
        draggableRef.current.kill();
        draggableRef.current = null;
      }
      // Belt-and-suspenders: clear any leftover transforms.
      gsap.killTweensOf(target);
      gsap.set(target, { clearProps: 'transform' });
    };
  }, [id, win?.x, win?.y, win?.maximized, focus, updatePos, win]);

  // Resize grip — vanilla pointer events, no GSAP needed for the geometry.
  //
  // Drag state lives in refs (not closure locals) so this effect can ignore
  // win.w / win.h in its deps. Otherwise the effect would re-mount on every
  // updateSize tick mid-drag, blowing away the in-flight listener and
  // stranding the user mid-resize (the original bug — first move resized,
  // every subsequent move did nothing because the fresh closure had
  // dragging=false).
  //
  // The starting window size is read from the store at pointerdown time via
  // useWindowManager.getState(), so we don't capture stale w/h either.
  const resizeStateRef = useRef({
    dragging: false,
    startX: 0,
    startY: 0,
    startW: 0,
    startH: 0,
  });

  useEffect(() => {
    if (!resizeGripRef.current || !win || win.maximized) return;
    const grip = resizeGripRef.current;
    const state = resizeStateRef.current;

    const onDown = (e: PointerEvent) => {
      const current = useWindowManager.getState().windows.find((w) => w.id === id);
      if (!current) return;
      state.dragging = true;
      state.startX = e.clientX;
      state.startY = e.clientY;
      state.startW = current.w;
      state.startH = current.h;
      try {
        grip.setPointerCapture(e.pointerId);
      } catch {
        /* ignore — pointer capture isn't critical, just helps Safari */
      }
      focus(id);
    };
    const onMove = (e: PointerEvent) => {
      if (!state.dragging) return;
      const nw = state.startW + (e.clientX - state.startX);
      const nh = state.startH + (e.clientY - state.startY);
      updateSize(id, nw, nh);
    };
    const onUp = (e: PointerEvent) => {
      state.dragging = false;
      try {
        grip.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    grip.addEventListener('pointerdown', onDown);
    grip.addEventListener('pointermove', onMove);
    grip.addEventListener('pointerup', onUp);
    grip.addEventListener('pointercancel', onUp);

    return () => {
      grip.removeEventListener('pointerdown', onDown);
      grip.removeEventListener('pointermove', onMove);
      grip.removeEventListener('pointerup', onUp);
      grip.removeEventListener('pointercancel', onUp);
    };
  }, [id, win?.maximized, focus, updateSize]);

  if (!win || win.minimized) return null;

  const isFocused = focusedId === id;
  const resizable = isResizable(win.kind);

  // Maximized windows pin to the viewport; otherwise use the stored frame.
  const style: React.CSSProperties = win.maximized
    ? {
        position: 'fixed',
        inset: 0,
        zIndex: win.z,
        width: '100vw',
        height: '100vh',
      }
    : {
        position: 'absolute',
        left: win.x,
        top: win.y,
        width: win.w,
        height: win.h,
        zIndex: win.z,
      };

  const handleClose = (e: MouseEvent) => {
    e.stopPropagation();
    close(id);
  };
  const handleMinimize = (e: MouseEvent) => {
    e.stopPropagation();
    minimize(id);
  };
  const handleMaximize = (e: MouseEvent) => {
    e.stopPropagation();
    maximize(id);
  };

  return (
    <div
      ref={rootRef}
      className={`window kport-window ${isFocused ? 'focused' : 'unfocused'}`}
      style={style}
      role="dialog"
      aria-label={win.title}
      tabIndex={-1}
      onMouseDown={() => focus(id)}
    >
      <div
        ref={titleBarRef}
        className="title-bar"
        style={{ touchAction: 'none' }}
      >
        <div className="title-bar-text">{win.title}</div>
        <div className="title-bar-controls">
          <button
            aria-label="Minimize"
            onClick={handleMinimize}
            type="button"
          />
          <button
            aria-label={win.maximized ? 'Restore' : 'Maximize'}
            onClick={handleMaximize}
            type="button"
            disabled={!resizable}
          />
          <button aria-label="Close" onClick={handleClose} type="button" />
        </div>
      </div>
      <div className="window-body kport-window-body">{children}</div>
      {resizable && !win.maximized && (
        <div
          ref={resizeGripRef}
          className="kport-resize-grip"
          aria-hidden="true"
        />
      )}
    </div>
  );
}

/**
 * Bounds for GSAP Draggable's title-bar drag, expressed as deltas from the
 * window's current absolute position. (Draggable's `{minX,minY,maxX,maxY}`
 * are interpreted relative to drag-start, not absolute viewport coords —
 * the cause of the "windows pin at initial Y" regression we hit in 2026-06.)
 *
 * Affordances:
 *   - Keep an 80px sliver of horizontal title bar visible for re-grab
 *   - Keep the entire title bar visible (60px of vertical headroom above
 *     the taskbar so dragging never hides it)
 *
 * Exported for unit tests so the math stays honest.
 */
export function computeDragBounds({
  x,
  y,
  width,
  viewportW,
  viewportH,
}: {
  x: number;
  y: number;
  width: number;
  viewportW: number;
  viewportH: number;
}): { minX: number; minY: number; maxX: number; maxY: number } {
  // Normalize -0 → 0 on minY for the y=0 case; JS produces negative zero
  // from `-0` and that trips strict equality checks (and could theoretically
  // confuse downstream consumers).
  return {
    minX: -(x + width - 80),
    minY: y === 0 ? 0 : -y,
    maxX: viewportW - 80 - x,
    maxY: viewportH - 60 - y,
  };
}
