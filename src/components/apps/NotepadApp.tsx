import { useWindowManager, type WinId } from '../desktop/windowManager';

export interface PostListEntry {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  tags: string[];
  /** Pre-rendered MDX body HTML from build time. */
  bodyHtml: string;
}

interface AppState {
  selectedSlug: string | null;
}

interface Props {
  id: WinId;
  posts: PostListEntry[];
}

/**
 * "Notepad.exe" — the blog reader window.
 *
 * Notepad's UI is intentionally spare: a menu-bar strip, a monospace-ish
 * text area, no toolbar fluff. The index lists posts as filename-like rows
 * (title plus date). Clicking a post replaces the index with a "document"
 * view of its content.
 *
 * Same per-window state pattern as the other apps: `selectedSlug` toggles
 * between list and detail.
 */
export function NotepadApp({ id, posts }: Props) {
  const appState =
    useWindowManager((s) => s.perAppState[id]) ?? ({} as AppState);
  const setAppState = useWindowManager((s) => s.setAppState);
  const selectedSlug = appState.selectedSlug ?? null;

  const selected = selectedSlug
    ? posts.find((p) => p.slug === selectedSlug) ?? null
    : null;

  // Header is shared between list and detail view.
  const header = (
    <div className="kport-notepad-menu" role="menubar">
      <span role="menuitem">File</span>
      <span role="menuitem">Edit</span>
      <span role="menuitem">Search</span>
      <span role="menuitem">Help</span>
    </div>
  );

  if (selected) {
    return (
      <div className="kport-notepad-app">
        {header}
        <div className="kport-notepad-toolbar">
          <button
            type="button"
            className="kport-notepad-back"
            onClick={() => setAppState(id, { selectedSlug: null })}
          >
            ← Index
          </button>
          <span className="kport-notepad-doc-title">
            {selected.slug}.txt
          </span>
        </div>
        <article className="kport-notepad-doc">
          <h1>{selected.title}</h1>
          <p className="kport-notepad-doc-meta">
            <time className="tnum" dateTime={selected.date}>
              {fmtDate(selected.date)}
            </time>
            {selected.tags.length > 0 && (
              <span className="tags">{selected.tags.map((t) => `#${t}`).join(' ')}</span>
            )}
          </p>
          <div
            className="kport-notepad-doc-body"
            dangerouslySetInnerHTML={{ __html: selected.bodyHtml }}
          />
        </article>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="kport-notepad-app">
        {header}
        <div className="kport-notepad-empty">
          <p>First post is on its way.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="kport-notepad-app">
      {header}
      <div className="kport-notepad-toolbar">
        <span className="kport-notepad-doc-title">posts/</span>
      </div>
      <ul className="kport-notepad-list">
        {posts.map((p) => (
          <li key={p.slug}>
            <button
              type="button"
              className="kport-notepad-row"
              onClick={() => setAppState(id, { selectedSlug: p.slug })}
            >
              <span className="row-filename">{p.slug}.txt</span>
              <time className="row-date tnum" dateTime={p.date}>
                {fmtDate(p.date)}
              </time>
              <span className="row-excerpt">{p.excerpt}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
