import { useEffect, useState } from 'react';

/**
 * Ticking clock for the Win98 system tray. Updates once per second.
 *
 * Format follows the Win98 convention: hours:minutes, no seconds, 12-hour
 * with am/pm. Configurable via the `format24` prop if anyone ever asks.
 */
export function Clock({ format24 = false }: { format24?: boolean }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    // Tick on the boundary of the next minute so the clock changes when it
    // visibly should, not 1s off.
    let cancelled = false;
    function scheduleNext() {
      const next = 60_000 - (Date.now() % 60_000);
      const t = setTimeout(() => {
        if (cancelled) return;
        setNow(new Date());
        scheduleNext();
      }, next + 100);
      return () => clearTimeout(t);
    }
    const cleanup = scheduleNext();
    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  const opts: Intl.DateTimeFormatOptions = format24
    ? { hour: '2-digit', minute: '2-digit', hour12: false }
    : { hour: 'numeric', minute: '2-digit', hour12: true };
  const label = now.toLocaleTimeString('en-US', opts);

  return (
    <time
      className="kport-clock tnum"
      dateTime={now.toISOString()}
      aria-label={`Current time: ${label}`}
    >
      {label}
    </time>
  );
}
