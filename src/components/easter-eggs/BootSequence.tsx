import { useEffect, useState } from 'react';
import { kvGet, kvSet } from '../../lib/storage';

const BOOT_SEEN_KEY = 'kport:bootSeen';

interface Props {
  /** Called when the sequence finishes (or is skipped). */
  onDone: () => void;
}

/**
 * First-visit boot sequence. BIOS POST text scrolls in, fades to a Win98
 * splash, then resolves to onDone() so the parent can fade in the desktop.
 *
 * Gated by the parent. We assume the parent checked path === '/', that we're
 * on desktop, that bootSeen is false, and that reduced motion isn't requested.
 * The component itself just runs the animation timeline.
 *
 * Total runtime ~2 seconds, then onDone fires and the parent unmounts us.
 */
export function BootSequence({ onDone }: Props) {
  const [phase, setPhase] = useState<'post' | 'splash'>('post');

  useEffect(() => {
    const postTimer = setTimeout(() => setPhase('splash'), 1100);
    const doneTimer = setTimeout(() => {
      kvSet(BOOT_SEEN_KEY, 'true');
      onDone();
    }, 2300);
    return () => {
      clearTimeout(postTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone]);

  const skip = () => {
    kvSet(BOOT_SEEN_KEY, 'true');
    onDone();
  };

  return (
    <div
      className="kport-boot"
      role="status"
      aria-live="polite"
      aria-label="Booting KPort"
      onClick={skip}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') skip();
      }}
      tabIndex={0}
    >
      {phase === 'post' ? <BiosPost /> : <Win98Splash />}
      <p className="kport-boot-skip">click anywhere to skip</p>
    </div>
  );
}

function BiosPost() {
  // Lines that scroll in one at a time, each ~80ms apart. The whole block
  // is visible at ~640ms; we hold for another ~460ms before swapping to the
  // splash phase.
  const lines = [
    'KPORT BIOS v1.0',
    'Copyright (C) 1998-2026, Keenan Akit Co., Ltd.',
    '',
    'Detecting drives... OK',
    'Detecting wallpaper... OK',
    'Detecting visitors... 1 found',
    'Memory test: 64K OK',
    'Press DEL to enter SETUP',
    '',
    'Loading Windows 98...',
  ];

  return (
    <pre className="kport-boot-bios">
      {lines.map((line, i) => (
        <span key={i} style={{ animationDelay: `${i * 80}ms` }}>
          {line || ' '}
          {'\n'}
        </span>
      ))}
    </pre>
  );
}

function Win98Splash() {
  return (
    <div className="kport-boot-splash">
      <div className="kport-boot-splash-flag" aria-hidden="true">
        <div className="pane red" />
        <div className="pane green" />
        <div className="pane blue" />
        <div className="pane yellow" />
      </div>
      <p className="kport-boot-splash-title">Windows 98</p>
      <p className="kport-boot-splash-subtitle">KPort Edition</p>
    </div>
  );
}

/** Skip the boot sequence if it has already played in a previous session. */
export function bootHasBeenSeen(): boolean {
  return kvGet(BOOT_SEEN_KEY) === 'true';
}

export { BOOT_SEEN_KEY };
