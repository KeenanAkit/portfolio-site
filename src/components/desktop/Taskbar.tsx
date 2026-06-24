import { useWindowManager } from './windowManager';
import { Clock } from './Clock';

/**
 * Win98 taskbar pinned to the bottom.
 *
 *   [Start]  [ App tab 1 ]  [ App tab 2 ]  ...        [ tray | clock ]
 *
 * Start button is decorative in v1 (a Start menu lands in Beyond v1 per the
 * design doc). Clicking a taskbar tab focuses or restores the matching window.
 */
export function Taskbar() {
  const windows = useWindowManager((s) => s.windows);
  const focusedId = useWindowManager((s) => s.focusedId);
  const focus = useWindowManager((s) => s.focus);
  const restore = useWindowManager((s) => s.restore);
  const minimize = useWindowManager((s) => s.minimize);

  const onTabClick = (id: string, minimized: boolean) => {
    if (minimized) {
      restore(id);
      return;
    }
    if (focusedId === id) {
      // Already focused — clicking the tab minimizes (classic Win98 behavior).
      minimize(id);
      return;
    }
    focus(id);
  };

  return (
    <footer className="kport-taskbar" aria-label="Taskbar">
      <button type="button" className="kport-start-button" aria-label="Start">
        <span className="logo" aria-hidden="true">⊞</span>
        <span className="label">Start</span>
      </button>

      <div className="kport-taskbar-tabs" role="list">
        {windows.map((w) => (
          <button
            key={w.id}
            type="button"
            role="listitem"
            className={`kport-taskbar-tab ${focusedId === w.id ? 'active' : ''} ${
              w.minimized ? 'minimized' : ''
            }`}
            onClick={() => onTabClick(w.id, w.minimized)}
          >
            {w.title}
          </button>
        ))}
      </div>

      <div className="kport-tray">
        <Clock />
      </div>
    </footer>
  );
}
