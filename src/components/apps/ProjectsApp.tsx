import { useWindowManager, type WinId } from '../desktop/windowManager';

export interface ProjectListEntry {
  slug: string;
  title: string;
  year: number;
  role?: string;
  stack: string[];
  summary: string;
  links: { label: string; url: string }[];
  /** Pre-rendered MDX body HTML, prepared at build time in index.astro. */
  bodyHtml: string;
  featured: boolean;
}

interface AppState {
  selectedSlug: string | null;
  scrollY: number;
}

interface Props {
  id: WinId;
  projects: ProjectListEntry[];
}

/**
 * "My Projects.exe" — side projects browser. Same shape as PhotosApp:
 * list view → detail view via per-window selectedSlug. The MDX body is
 * pre-rendered at build (collections are build-time only); we set it via
 * dangerouslySetInnerHTML and style it via the .kport-projects-body class
 * in desktop.css.
 */
export function ProjectsApp({ id, projects }: Props) {
  const appState =
    useWindowManager((s) => s.perAppState[id]) ?? ({} as AppState);
  const setAppState = useWindowManager((s) => s.setAppState);
  const selectedSlug = appState.selectedSlug ?? null;

  const selected = selectedSlug
    ? projects.find((p) => p.slug === selectedSlug) ?? null
    : null;

  if (selected) {
    return (
      <div className="kport-projects-app">
        <div className="kport-projects-toolbar">
          <button
            type="button"
            className="kport-projects-back"
            onClick={() => setAppState(id, { selectedSlug: null })}
          >
            ← Back to list
          </button>
          <span className="kport-projects-title">
            {selected.title}{' '}
            <span className="year tnum">({selected.year})</span>
          </span>
        </div>
        <div className="kport-projects-detail">
          <p className="summary">{selected.summary}</p>
          {selected.stack.length > 0 && (
            <ul className="stack">
              {selected.stack.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          )}
          {selected.links.length > 0 && (
            <ul className="links">
              {selected.links.map((l) => (
                <li key={l.url}>
                  <a href={l.url} target="_blank" rel="noopener">
                    {l.label} ↗
                  </a>
                </li>
              ))}
            </ul>
          )}
          <div
            className="kport-projects-body"
            dangerouslySetInnerHTML={{ __html: selected.bodyHtml }}
          />
        </div>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="kport-projects-app">
        <div className="kport-projects-empty">
          <p>No projects yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="kport-projects-app">
      <div className="kport-projects-toolbar">
        <span className="kport-projects-title">My Projects</span>
        <span className="kport-projects-count tnum">
          {projects.length} {projects.length === 1 ? 'item' : 'items'}
        </span>
      </div>
      <ul className="kport-projects-list">
        {projects.map((p) => (
          <li key={p.slug}>
            <button
              type="button"
              className="kport-projects-row"
              onClick={() => setAppState(id, { selectedSlug: p.slug })}
            >
              <span className="row-title">{p.title}</span>
              <span className="row-meta tnum">{p.year}</span>
              <span className="row-summary">{p.summary}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
