import { useEffect, useRef } from 'react';
import { useWindowManager, type WinId } from '../../desktop/windowManager';
import { readPhotosState, type LightingCategory } from './types';
import { AmbientEffects } from './AmbientEffects';
import type { PhotoListEntry, CategoryListEntry } from '../PhotosApp';
import { gsap } from '../../../lib/gsap-plugins';
import { motionDuration, reducedMotion } from '../../../lib/motion';

interface Props {
  id: WinId;
  photos: PhotoListEntry[];
  categories: CategoryListEntry[];
}

/**
 * Photos.exe interior state — a cozy pixel-art gallery room: cream walls +
 * sage wainscoting + warm oak floor + sunlit side window + gilt frames +
 * potted fern + oak bench.
 *
 * Render branches (in order of precedence):
 *   1. selectedSlug set     → lightbox
 *   2. category === 'all'   → all-photos grid
 *   3. category set         → that category's filtered photo grid
 *   4. category === null    → CategoriesLanding (5 collections + All card)
 *
 * Per-category lighting is applied via `data-light` on the gallery root.
 * CSS reads the data-light value and propagates the right sub-palette
 * through the wall, wainscot, floor, and picture-light shadow tokens.
 */
export function PhotosGallery({ id, photos, categories }: Props) {
  const setAppState = useWindowManager((s) => s.setAppState);
  const rawState = useWindowManager((s) => s.perAppState[id]);
  const state = readPhotosState(rawState);

  const lighting = categoryToLighting(state.category, categories);

  // Entry fade-in pairs with the storefront's door-swing cross-fade so the
  // mount-swap doesn't snap. Reduced-motion skips it; the gallery renders at
  // full opacity from the start.
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (reducedMotion()) return;
    const root = rootRef.current;
    if (!root) return;
    const tween = gsap.from(root, {
      opacity: 0,
      duration: motionDuration(280) / 1000,
      ease: 'power2.out',
    });
    return () => {
      tween.kill();
    };
  }, []);

  const exitToStreet = () => {
    setAppState(id, {
      mode: 'exterior',
      category: null,
      selectedSlug: null,
    });
  };

  const backToCategories = () => {
    setAppState(id, { category: null, selectedSlug: null });
  };

  const selected = state.selectedSlug
    ? photos.find((p) => p.slug === state.selectedSlug) ?? null
    : null;

  // Lightbox view
  if (selected) {
    return (
      <div
        ref={rootRef}
        className="kport-room kport-gallery"
        data-light={lighting}
      >
        <div className="kport-gallery__lightbox">
          <button
            type="button"
            className="kport-photos-back"
            onClick={() => setAppState(id, { selectedSlug: null })}
          >
            ← Back to gallery
          </button>
          <img
            src={selected.imageSrc}
            alt={
              selected.caption ??
              (selected.titleIsPlaceholder
                ? 'Photograph by Keenan Akit'
                : selected.title)
            }
          />
          <dl className="kport-photos-meta">
            <Row label="Date" value={selected.date.slice(0, 10)} />
            <Row label="Location" value={selected.location} />
            <Row label="Camera" value={selected.camera} />
            <Row label="Film" value={selected.film} />
            <Row label="Caption" value={selected.caption} fullWidth />
          </dl>
        </div>
        <AmbientEffects winId={id} />
      </div>
    );
  }

  const inCategory = state.category !== null;
  const filteredPhotos = inCategory
    ? filterPhotos(photos, state.category!, categories)
    : photos;
  const activeCategoryMeta = inCategory
    ? categories.find((c) => c.slug === state.category) ?? null
    : null;

  // Plaque text: room name. Categories landing reads "MY PICTURES"; a category
  // overrides with its title (e.g. "LANDSCAPES"). "all" is a pseudo-category
  // that doesn't live in the collection.
  const plaqueText = !inCategory
    ? 'MY PICTURES'
    : state.category === 'all'
      ? 'ALL PHOTOS'
      : activeCategoryMeta?.title.toUpperCase() ?? 'MY PICTURES';

  return (
    <div
      ref={rootRef}
      className="kport-room kport-gallery"
      data-light={lighting}
    >
      {/*
        Pixel-art room layer stack, painted in pure CSS as placeholders so the
        Gunther-museum interior reads before real sprites land. Each div is
        decorative — aria-hidden + data-ornament for the Standard view bypass.
        See design doc §Cozy room descriptions.
      */}
      <div className="kport-gallery__wall" aria-hidden="true" data-ornament="wall" />
      <div
        className="kport-gallery__wainscot"
        aria-hidden="true"
        data-ornament="wainscot"
      />
      <div
        className="kport-gallery__floor"
        aria-hidden="true"
        data-ornament="floor"
      />
      <div
        className="kport-gallery__sunlight"
        aria-hidden="true"
        data-ornament="sunlight"
      />
      <div
        className="kport-gallery__side-window"
        aria-hidden="true"
        data-ornament="side-window"
      />
      <div className="kport-gallery__plaque" aria-hidden="true" data-ornament="plaque">
        {plaqueText}
      </div>
      <div className="kport-gallery__bench" aria-hidden="true" data-ornament="bench" />
      <div className="kport-gallery__fern" aria-hidden="true" data-ornament="fern" />

      {/* Context-aware nav. A standard 98.css chunky button reads as
          navigation where a tiny door sprite read as decoration. Inside a
          category, "Categories" steps up; at the landing, "← Street" steps
          out. */}
      {inCategory ? (
        <button
          type="button"
          className="kport-gallery__exit"
          onClick={backToCategories}
        >
          ← Categories
        </button>
      ) : (
        <button
          type="button"
          className="kport-gallery__exit"
          onClick={exitToStreet}
        >
          ← Street
        </button>
      )}

      {inCategory ? (
        filteredPhotos.length === 0 ? (
          <EmptyState category={state.category} />
        ) : (
          <ul className="kport-gallery__grid" role="list">
            {filteredPhotos.map((p) => (
              <li key={p.slug}>
                <button
                  type="button"
                  className="kport-gallery__frame"
                  onClick={() => setAppState(id, { selectedSlug: p.slug })}
                  aria-label={`Open ${p.titleIsPlaceholder ? 'photograph' : p.title}`}
                >
                  <img src={p.thumbSrc} alt="" loading="lazy" />
                  {!p.titleIsPlaceholder && (
                    <span className="kport-gallery__frame-label">{p.title}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <CategoriesLanding
          categories={categories}
          photos={photos}
          onPick={(catSlug) =>
            setAppState(id, { category: catSlug, selectedSlug: null })
          }
        />
      )}

      <AmbientEffects winId={id} />
    </div>
  );
}

/** The room's central exhibit: 6 framed cards (5 collections + an All card)
 *  the user picks one to enter. Each card carries a small lighting-tint hint
 *  so the user previews the room's mood before clicking. */
function CategoriesLanding({
  categories,
  photos,
  onPick,
}: {
  categories: CategoryListEntry[];
  photos: PhotoListEntry[];
  onPick: (slug: string) => void;
}) {
  // "All Photos" cover = newest photo's thumb so it always looks alive.
  // Falls back to the first category's cover if the photos array is empty.
  const allCoverSrc =
    photos[0]?.thumbSrc ?? categories[0]?.coverSrc ?? '';

  return (
    <ul className="kport-gallery__categories" role="list">
      <li>
        <button
          type="button"
          className="kport-gallery__frame kport-gallery__frame--category"
          data-light-hint="dusk"
          onClick={() => onPick('all')}
          aria-label="Open all photos"
        >
          {allCoverSrc ? (
            <img src={allCoverSrc} alt="" loading="lazy" />
          ) : (
            <span className="kport-gallery__frame-placeholder" aria-hidden="true" />
          )}
          <span className="kport-gallery__frame-label">All Photos</span>
        </button>
      </li>
      {categories.map((c) => (
        <li key={c.slug}>
          <button
            type="button"
            className="kport-gallery__frame kport-gallery__frame--category"
            data-light-hint={c.lighting}
            onClick={() => onPick(c.slug)}
            aria-label={`Open ${c.title}`}
          >
            {c.coverSrc ? (
              <img src={c.coverSrc} alt="" loading="lazy" />
            ) : (
              <span
                className="kport-gallery__frame-placeholder"
                aria-hidden="true"
              />
            )}
            <span className="kport-gallery__frame-label">{c.title}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ category }: { category: string | null }) {
  if (category && category !== 'all') {
    return (
      <div className="kport-gallery__empty" role="status">
        <p>This wall is waiting.</p>
        <p className="kport-gallery__empty-sub">
          No photos tagged <em>{category}</em> yet.
        </p>
      </div>
    );
  }
  return (
    <div className="kport-gallery__empty" role="status">
      <p>The gallery is empty.</p>
      <p className="kport-gallery__empty-sub">
        Drop your first photo into <code>~/Pictures/kport-inbox/</code> and
        run <code>npm run sync:photos</code>.
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  fullWidth,
}: {
  label: string;
  value: string | undefined;
  fullWidth?: boolean;
}) {
  if (!value) return null;
  return (
    <div className={`row ${fullWidth ? 'full' : ''}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** Apply a category's filter rule to the photos array. Mirrors the server-
 *  side filter logic in pages/photos/category/[slug]/index.astro so the
 *  React island and SSR DOM stay in sync. */
function filterPhotos(
  photos: PhotoListEntry[],
  categorySlug: string,
  categories: CategoryListEntry[]
): PhotoListEntry[] {
  if (categorySlug === 'all') return photos;
  const cat = categories.find((c) => c.slug === categorySlug);
  if (!cat) return [];
  const f = cat.filter;
  if ('tag' in f) {
    return photos.filter((p) => p.tags.includes(f.tag));
  }
  return photos.filter((p) => f.slugs.includes(p.slug));
}

/** Map a category slug to its lighting variant. The "all" pseudo-category
 *  reads the default `dusk` lighting; the 5 real categories read from their
 *  collection entry's `lighting` field. */
function categoryToLighting(
  category: string | null,
  categories: CategoryListEntry[]
): LightingCategory {
  if (!category || category === 'all') return 'dusk';
  const cat = categories.find((c) => c.slug === category);
  return cat?.lighting ?? 'dusk';
}
