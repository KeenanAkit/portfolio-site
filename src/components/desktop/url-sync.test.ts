import { describe, it, expect } from 'vitest';
import { parsePath, pathFor } from './url-sync';

// The ParsedPath shape carries `mode` and `category` fields; the Photos URL
// hierarchy is:
//   /photos/                      → exterior
//   /photos/gallery/              → interior overview
//   /photos/gallery/{slug}        → interior + lightbox
//   /photos/category/{cat}/       → interior + category
//   /photos/category/{cat}/{slug} → interior + category + lightbox
// The old /photos/{slug} pattern is intentionally NOT matched anymore. The
// Cloudflare _headers file 301-redirects legacy URLs to /photos/gallery/{slug}.

describe('parsePath — photos exterior', () => {
  it('matches /photos as exterior', () => {
    expect(parsePath('/photos')).toEqual({
      kind: 'photos',
      mode: 'exterior',
      category: null,
      slug: null,
    });
  });

  it('matches /photos/ (trailing slash) as exterior', () => {
    expect(parsePath('/photos/')).toEqual({
      kind: 'photos',
      mode: 'exterior',
      category: null,
      slug: null,
    });
  });
});

describe('parsePath — photos interior (gallery overview)', () => {
  it('matches /photos/gallery as interior overview', () => {
    expect(parsePath('/photos/gallery')).toEqual({
      kind: 'photos',
      mode: 'interior',
      category: null,
      slug: null,
    });
  });

  it('matches /photos/gallery/ (trailing slash) as interior overview', () => {
    expect(parsePath('/photos/gallery/')).toEqual({
      kind: 'photos',
      mode: 'interior',
      category: null,
      slug: null,
    });
  });

  it('matches /photos/gallery/<slug> as interior + lightbox', () => {
    expect(parsePath('/photos/gallery/four-o-nine-toronto')).toEqual({
      kind: 'photos',
      mode: 'interior',
      category: null,
      slug: 'four-o-nine-toronto',
    });
  });

  it('matches /photos/gallery/<slug>/ (trailing slash)', () => {
    expect(parsePath('/photos/gallery/four-o-nine-toronto/')).toEqual({
      kind: 'photos',
      mode: 'interior',
      category: null,
      slug: 'four-o-nine-toronto',
    });
  });
});

describe('parsePath — photos category', () => {
  it('matches /photos/category/<cat> as interior + category', () => {
    expect(parsePath('/photos/category/landscapes')).toEqual({
      kind: 'photos',
      mode: 'interior',
      category: 'landscapes',
      slug: null,
    });
  });

  it('matches /photos/category/<cat>/ (trailing slash)', () => {
    expect(parsePath('/photos/category/landscapes/')).toEqual({
      kind: 'photos',
      mode: 'interior',
      category: 'landscapes',
      slug: null,
    });
  });

  it('matches /photos/category/<cat>/<slug> as interior + category + lightbox', () => {
    expect(parsePath('/photos/category/landscapes/big-sur')).toEqual({
      kind: 'photos',
      mode: 'interior',
      category: 'landscapes',
      slug: 'big-sur',
    });
  });
});

describe('parsePath — projects + notepad (unchanged routes, new shape)', () => {
  it('matches /projects as interior with null slug', () => {
    expect(parsePath('/projects')).toEqual({
      kind: 'projects',
      mode: 'interior',
      category: null,
      slug: null,
    });
  });

  it('matches /projects/<slug>', () => {
    expect(parsePath('/projects/kport')).toEqual({
      kind: 'projects',
      mode: 'interior',
      category: null,
      slug: 'kport',
    });
  });

  it('matches /blog (mapped to notepad)', () => {
    expect(parsePath('/blog')).toEqual({
      kind: 'notepad',
      mode: 'interior',
      category: null,
      slug: null,
    });
  });

  it('matches /blog/<slug>', () => {
    expect(parsePath('/blog/hello-kport')).toEqual({
      kind: 'notepad',
      mode: 'interior',
      category: null,
      slug: 'hello-kport',
    });
  });
});

describe('parsePath — URI decoding', () => {
  it('decodes URI components in the lightbox slug', () => {
    expect(parsePath('/photos/gallery/big%20sur')).toEqual({
      kind: 'photos',
      mode: 'interior',
      category: null,
      slug: 'big sur',
    });
  });

  it('decodes URI components in the category', () => {
    expect(parsePath('/photos/category/black%20and%20white')).toEqual({
      kind: 'photos',
      mode: 'interior',
      category: 'black and white',
      slug: null,
    });
  });

  it('decodes URI components in both category and slug', () => {
    expect(parsePath('/photos/category/black%20and%20white/big%20sur')).toEqual({
      kind: 'photos',
      mode: 'interior',
      category: 'black and white',
      slug: 'big sur',
    });
  });
});

describe('parsePath — non-matches', () => {
  it('returns null for /', () => {
    expect(parsePath('/')).toBeNull();
  });

  it('returns null for unknown paths', () => {
    expect(parsePath('/about/me')).toBeNull();
    expect(parsePath('/random')).toBeNull();
  });

  it('returns null for the legacy /photos/<slug> pattern (redirected at the edge)', () => {
    // The legacy /photos/<slug> path is intentionally not matched in-app.
    // The Cloudflare _headers entry rewrites /photos/<slug> to
    // /photos/gallery/<slug> via 301; this test pins the in-app behavior.
    expect(parsePath('/photos/four-o-nine-toronto')).toBeNull();
  });

  it('returns null for /photos/category/ with no category slug', () => {
    expect(parsePath('/photos/category/')).toBeNull();
    expect(parsePath('/photos/category')).toBeNull();
  });

  it('returns null for unsupported deep nesting', () => {
    expect(parsePath('/photos/category/landscapes/foo/extra')).toBeNull();
    expect(parsePath('/photos/gallery/foo/extra')).toBeNull();
  });
});

describe('pathFor — photos (exterior + interior + category)', () => {
  it('returns /photos for exterior (default when mode unset)', () => {
    expect(pathFor({ kind: 'photos' })).toBe('/photos');
    expect(pathFor({ kind: 'photos' }, {})).toBe('/photos');
    expect(pathFor({ kind: 'photos' }, { mode: 'exterior' })).toBe('/photos');
  });

  it('returns /photos/gallery for interior overview', () => {
    expect(pathFor({ kind: 'photos' }, { mode: 'interior' })).toBe(
      '/photos/gallery'
    );
  });

  it('returns /photos/gallery/<slug> for interior + lightbox', () => {
    expect(
      pathFor({ kind: 'photos' }, { mode: 'interior', selectedSlug: 'foo' })
    ).toBe('/photos/gallery/foo');
  });

  it('returns /photos/category/<cat> for interior + category', () => {
    expect(
      pathFor({ kind: 'photos' }, { mode: 'interior', category: 'landscapes' })
    ).toBe('/photos/category/landscapes');
  });

  it('returns /photos/category/<cat>/<slug> for category + lightbox', () => {
    expect(
      pathFor(
        { kind: 'photos' },
        { mode: 'interior', category: 'landscapes', selectedSlug: 'big-sur' }
      )
    ).toBe('/photos/category/landscapes/big-sur');
  });

  it('exterior mode ignores category + slug (storefront state is canonical)', () => {
    expect(
      pathFor(
        { kind: 'photos' },
        { mode: 'exterior', category: 'landscapes', selectedSlug: 'foo' }
      )
    ).toBe('/photos');
  });

  it('ignores empty-string slug + empty-string category', () => {
    expect(
      pathFor(
        { kind: 'photos' },
        { mode: 'interior', category: '', selectedSlug: '' }
      )
    ).toBe('/photos/gallery');
  });
});

describe('pathFor — projects + notepad', () => {
  it('returns base path when no slug', () => {
    expect(pathFor({ kind: 'projects' })).toBe('/projects');
    expect(pathFor({ kind: 'notepad' })).toBe('/blog');
  });

  it('appends the slug when present', () => {
    expect(pathFor({ kind: 'projects' }, { selectedSlug: 'kport' })).toBe(
      '/projects/kport'
    );
    expect(pathFor({ kind: 'notepad' }, { selectedSlug: 'hello-kport' })).toBe(
      '/blog/hello-kport'
    );
  });

  it('ignores empty-string slugs', () => {
    expect(pathFor({ kind: 'projects' }, { selectedSlug: '' })).toBe('/projects');
  });

  it('ignores null slugs', () => {
    expect(pathFor({ kind: 'projects' }, { selectedSlug: null })).toBe('/projects');
  });
});

describe('pathFor — defensive', () => {
  it('returns / for unknown kinds', () => {
    // Casting to silence the union type; this guards against future bugs
    // where a new kind is added without a route entry.
    // reason: defensive coverage for unmapped WindowKind values.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(pathFor({ kind: 'about' as any })).toBe('/');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(pathFor({ kind: 'calculator' as any })).toBe('/');
  });
});

describe('parsePath <-> pathFor round-trips', () => {
  const cases: { path: string; appState?: Record<string, unknown> }[] = [
    { path: '/photos' },
    {
      path: '/photos/gallery',
      appState: { mode: 'interior', category: null, selectedSlug: null },
    },
    {
      path: '/photos/gallery/four-o-nine-toronto',
      appState: {
        mode: 'interior',
        category: null,
        selectedSlug: 'four-o-nine-toronto',
      },
    },
    {
      path: '/photos/category/landscapes',
      appState: {
        mode: 'interior',
        category: 'landscapes',
        selectedSlug: null,
      },
    },
    {
      path: '/photos/category/landscapes/big-sur',
      appState: {
        mode: 'interior',
        category: 'landscapes',
        selectedSlug: 'big-sur',
      },
    },
    { path: '/projects' },
    { path: '/projects/kport', appState: { selectedSlug: 'kport' } },
    { path: '/blog' },
    { path: '/blog/hello-kport', appState: { selectedSlug: 'hello-kport' } },
  ];

  it.each(cases)('round-trips $path', ({ path }) => {
    const parsed = parsePath(path);
    expect(parsed).not.toBeNull();

    const appState: Record<string, unknown> = {};
    if (parsed!.kind === 'photos') {
      appState.mode = parsed!.mode;
      appState.category = parsed!.category;
    }
    if (parsed!.slug !== null) appState.selectedSlug = parsed!.slug;

    const back = pathFor({ kind: parsed!.kind }, appState);
    expect(back).toBe(path);
  });
});
