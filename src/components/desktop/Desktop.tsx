import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useWindowManager, type WindowKind } from './windowManager';
import { DesktopIcon } from './DesktopIcon';
import { Window } from './Window';
import { Taskbar } from './Taskbar';
import {
  PhotosApp,
  type PhotoListEntry,
  type CategoryListEntry,
} from '../apps/PhotosApp';
import { ProjectsApp, type ProjectListEntry } from '../apps/ProjectsApp';
import { NotepadApp, type PostListEntry } from '../apps/NotepadApp';
import { useUrlSync } from './url-sync';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { FolderIcon, BriefcaseIcon, NotepadIcon } from './icons';
import { StarField } from './StarField';
import { BootSequence, bootHasBeenSeen } from '../easter-eggs/BootSequence';
import { Screensaver } from '../easter-eggs/Screensaver';
import { useShutdownAnimation } from '../easter-eggs/useShutdownAnimation';
import { useKonami } from '../easter-eggs/useKonami';
import { kvGet, kvSet } from '../../lib/storage';

interface Props {
  /** Photos passed in from the Astro island so the React tree doesn't try
   *  to read content collections at runtime (those are build-time only). */
  photos: PhotoListEntry[];
  projects: ProjectListEntry[];
  posts: PostListEntry[];
  /** Category metadata for the gallery's landing room. Ordered by `order`. */
  categories: CategoryListEntry[];
}

interface IconSpec {
  kind: WindowKind;
  label: string;
  glyph: ReactNode;
  x: number;
  y: number;
}

const ICONS: IconSpec[] = [
  { kind: 'photos', label: 'My Pictures', glyph: <FolderIcon />, x: 24, y: 32 },
  {
    kind: 'projects',
    label: 'My Projects',
    glyph: <BriefcaseIcon />,
    x: 24,
    y: 128,
  },
  { kind: 'notepad', label: 'Notepad', glyph: <NotepadIcon />, x: 24, y: 224 },
];

const WALLPAPER_MODE_KEY = 'kport:wallpaperMode';

/**
 * Default desktop wallpaper is a drifting starfield (canvas-driven, classic
 * Win95 "Starfield Simulation" vibe). Konami code cycles through photos as
 * alternatives — once you hit the end of the photo list, it loops back to
 * the starfield. Choice persists across reloads.
 */
type WallpaperMode = 'starfield' | { kind: 'photo'; idx: number };

function readStoredMode(): WallpaperMode {
  const raw = kvGet(WALLPAPER_MODE_KEY);
  if (raw === null || raw === 'starfield') return 'starfield';
  const m = raw.match(/^photo:(\d+)$/);
  if (m) return { kind: 'photo', idx: parseInt(m[1], 10) };
  return 'starfield';
}

function writeStoredMode(mode: WallpaperMode): void {
  if (mode === 'starfield') {
    kvSet(WALLPAPER_MODE_KEY, 'starfield');
  } else {
    kvSet(WALLPAPER_MODE_KEY, `photo:${mode.idx}`);
  }
}

/**
 * The Windows 98 desktop. Renders the wallpaper layer, the desktop icons,
 * open windows, the taskbar, and the easter-egg overlays.
 *
 *   ┌─────────────────────────────────────────────┐
 *   │  Wallpaper (photo + dark overlay)           │
 *   │                                             │
 *   │  [Icons]    ╭─ Windows ──╮                  │
 *   │             │            │                  │
 *   │             ╰────────────╯                  │
 *   │                                             │
 *   │  ┌─[Taskbar]──────────── clock ─┐           │
 *   ╰─────────────────────────────────────────────╯
 *
 * Optional overlays mounted via easter-eggs/*:
 *   - BootSequence (first visit only, gated, fires onDone → unmounts)
 *   - Screensaver (after 60s idle, dismissed on input)
 *
 * Outbound link CRT collapse and the Konami wallpaper-cycle are hooks
 * attached to the Desktop component but don't render anything themselves.
 */
export function Desktop({ photos, projects, posts, categories }: Props) {
  const windows = useWindowManager((s) => s.windows);
  const open = useWindowManager((s) => s.open);
  const hydrate = useWindowManager((s) => s.hydrate);

  const rootRef = useRef<HTMLDivElement | null>(null);

  // Hydrate persisted window state once on mount.
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Bidirectional URL <-> window state sync. See url-sync.ts.
  useUrlSync();

  // Outbound-link CRT collapse animation. Filters to plain left-click on
  // cross-origin <a> tags only (see useShutdownAnimation.ts).
  useShutdownAnimation(rootRef);

  // Alt+F4, Cmd+W, Escape -> close focused window. See useKeyboardShortcuts.
  useKeyboardShortcuts();

  // ----- Wallpaper state. Default = starfield. Konami cycles through modes
  //       (starfield → photo[0] → photo[1] → ... → starfield). Choice persists.
  const [wallpaperMode, setWallpaperMode] = useState<WallpaperMode>(readStoredMode);

  useKonami(() => {
    setWallpaperMode((mode) => {
      let next: WallpaperMode;
      if (mode === 'starfield') {
        next = photos.length > 0 ? { kind: 'photo', idx: 0 } : 'starfield';
      } else {
        const nextIdx = mode.idx + 1;
        next =
          nextIdx >= photos.length ? 'starfield' : { kind: 'photo', idx: nextIdx };
      }
      writeStoredMode(next);
      return next;
    });
  });

  const wallpaperPhoto =
    wallpaperMode !== 'starfield' && photos[wallpaperMode.idx]
      ? photos[wallpaperMode.idx]
      : null;

  // ----- Boot sequence. Skipped on second+ visit, mobile, or non-/ paths. -----
  // We intentionally don't gate on path here — this component only mounts on
  // desktop visitors who landed on /. (URL-driven deep links to /photos/...
  // also don't boot — bootHasBeenSeen returns false the first time but
  // useUrlSync immediately opens the window, so we suppress boot when there's
  // a URL match by checking location.pathname.)
  const [bootDone, setBootDone] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    if (bootHasBeenSeen()) return true;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return true;
    if (window.location.pathname !== '/') return true;
    return false;
  });

  return (
    <>
      {!bootDone && <BootSequence onDone={() => setBootDone(true)} />}

      <div
        ref={rootRef}
        className="kport-desktop"
        style={{
          // When a photo wallpaper is chosen, layer it under a dark overlay so
          // icon labels stay readable. Starfield draws its own teal bg in the
          // canvas, so we don't set backgroundImage for that mode.
          backgroundImage: wallpaperPhoto
            ? `linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.35)), url(${wallpaperPhoto.imageSrc})`
            : undefined,
        }}
        data-wallpaper-mode={wallpaperMode === 'starfield' ? 'starfield' : 'photo'}
      >
        {wallpaperMode === 'starfield' && <StarField />}

        {ICONS.map((icon) => (
          <DesktopIcon
            key={icon.kind}
            kind={icon.kind}
            label={icon.label}
            glyph={icon.glyph}
            x={icon.x}
            y={icon.y}
            onOpen={() => open(icon.kind)}
          />
        ))}

        {windows.map((w) => {
          switch (w.kind) {
            case 'photos':
              return (
                <Window key={w.id} id={w.id}>
                  <PhotosApp id={w.id} photos={photos} categories={categories} />
                </Window>
              );
            case 'projects':
              return (
                <Window key={w.id} id={w.id}>
                  <ProjectsApp id={w.id} projects={projects} />
                </Window>
              );
            case 'notepad':
              return (
                <Window key={w.id} id={w.id}>
                  <NotepadApp id={w.id} posts={posts} />
                </Window>
              );
            default:
              return (
                <Window key={w.id} id={w.id}>
                  <div style={{ padding: 12, fontSize: 12 }}>
                    {w.title} is queued for v1.1.
                  </div>
                </Window>
              );
          }
        })}

        <Taskbar />
      </div>

      <Screensaver />
    </>
  );
}
