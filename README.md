# KPort

Keenan Akit's personal portfolio. It's a **Windows 98 desktop** on a real computer
and a **clean, photo-first site** on a phone. Same URLs, two completely different
front ends.

**Live:** [keenanakit.com](https://keenanakit.com)

On desktop you get draggable windows, a taskbar, a boot sequence, and a few easter
eggs. On mobile you get a fast, accessible, photo-first site. The desktop chrome is
part of the work, not a gimmick layered on top.

## Features

- **Two UIs, one set of routes.** A synchronous script sets `data-ui` before first
  paint; the React desktop shell hydrates only on desktop, mobile stays static HTML.
- **A working Win98 desktop.** Draggable, resizable windows backed by a Zustand
  window manager, a taskbar, z-ordering, minimize/maximize, and `history`-based
  navigation between windows (no full page reloads).
- **Photos as a place, not a grid.** A side-scrolling street storefront you walk
  into, then a pixel-art gallery room with per-category lighting.
- **Easter eggs.** Boot sequence, a Blue Screen of Death 404, a screensaver, a
  Konami code, and a CRT-collapse "shutdown" on outbound links.
- **Photos hosted on Cloudflare R2.** Only the frontmatter (with EXIF) lives in git;
  the binaries live in R2 and are transformed at build time.
- **Accessibility built in.** A "standard view" bypass drops the pixel-art chrome
  for assistive tech, every window is a labeled `dialog`, and all motion respects
  `prefers-reduced-motion`.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Astro 6 (static + routing) |
| Interactive UI | React 19 islands |
| Motion + drag | GSAP 3.15 |
| State | Zustand 5 |
| Retro chrome | 98.css |
| Content | Astro Content Layer + MDX |
| Hosting | Cloudflare Pages |
| Photo storage | Cloudflare R2 |

## Getting started

Requires **Node >= 22.12** and npm.

```bash
git clone https://github.com/KeenanAkit/portfolio-site.git
cd portfolio-site
npm install
npm run dev          # http://localhost:4321
```

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server at http://localhost:4321 |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run check` | Type-check `.astro` and `.ts` files |
| `npm run check:slop` | Scan content for filler vocabulary and em dashes |
| `npm run check:a11y:full` | Build, then run axe-core against the output |
| `npm run test` | Run the unit tests (Vitest) |
| `npm run post:new -- "Title"` | Scaffold a new blog post |
| `npm run sync:photos` | Bulk-ingest photos from `~/Pictures/kport-inbox/` |

`npm run build` runs the style check, type check, and tests first (via `prebuild`);
all three must pass before a build succeeds.

## Project structure

```
src/
  components/
    desktop/        window manager, taskbar, draggable windows
    apps/           window contents (Photos, Projects, Notepad)
    easter-eggs/    boot sequence, BSOD, screensaver, shutdown
    mobile/         mobile page sections
  content/          photos, projects, posts, collections (frontmatter + MDX)
  layouts/          BaseLayout (head, data-ui script, opacity gate)
  pages/            routes (/, /photos, /projects, /blog, 404, rss)
  lib/              window-manager store, storage, motion, helpers
  styles/           global + room styles
scripts/            build and content tooling (photo ingest, linters)
public/             static assets (room sprites, favicons, og image)
```

`DESIGN.md` is the visual spec: every color, type size, spacing value, and component
spec lives there.

## Adding content

- **A single photo:** drop it in `~/Pictures/kport-inbox/` and run `npm run sync:photos`
  (it handles one file or a whole batch).
- **A batch from Lightroom:** see below.
- **A blog post:** `npm run post:new -- "Your Title"`.
- **A project:** add an `.mdx` file under `src/content/projects/`.

### Sync photos from Lightroom

Photo binaries never go in git. Originals live in Cloudflare R2 (`kport-photos`
bucket, served from `photos.keenanakit.com`); only the `.md` frontmatter lands in
the repo.

**One-time setup**

```bash
mkdir -p ~/Pictures/kport-inbox
npx wrangler login          # authorize R2 uploads (confirm with: npx wrangler whoami)
```

In Lightroom, make an Export Preset that writes JPEGs (long edge 2400px, sRGB,
"Copyright Only" metadata so EXIF survives but GPS is stripped) into
`~/Pictures/kport-inbox/`, using the original filename so slugs stay stable.

**Each time**

1. Export a batch from Lightroom into the inbox. Add keywords like `landscapes`,
   `street`, `portraits`, `black-and-white`, or `travel` to auto-populate category tags.
2. Run `npm run sync:photos`. It reads EXIF + keywords, uploads each binary to R2,
   writes `src/content/photos/<slug>.md` pointing at the public R2 URL, and moves the
   source into `~/Pictures/kport-inbox/processed/<date>/`. Re-running is idempotent.
3. Open the generated `.md`, write the caption, fill in the location, and add any tags
   the keywords missed.
4. `npm run check:slop`, then commit. Only the `.md` files change.

Useful flags: `--dry-run` (show what would happen), `--keep` (don't move sources),
`--inbox=<path>` (use a different folder).

For **film scans**, the EXIF camera is the scanner; edit the `.md` to set the real
camera and use the `# film:` line for the stock.

## Deployment

Cloudflare Pages. The build output in `dist/` deploys with:

```bash
npm run build
npx wrangler pages deploy dist
```

`public/_headers` sets caching and security headers; `public/_redirects` keeps legacy
photo URLs alive with 301s.

## Accessibility

The mobile DOM is the semantic baseline. Assistive-tech users can opt out of the
desktop shell entirely via a "Standard view" skip link (persisted in localStorage).
Every window is a `dialog` with an `aria-label`, never `role="application"`. The boot
sequence, screensaver, and window animations all check `prefers-reduced-motion`.
`npm run check:a11y:full` runs axe-core against the built site.

## License

Code is © Keenan Akit, shared here for reference. No license is granted for reuse
without permission. All photography is © Keenan Akit, all rights reserved; please
don't redistribute or repost the images.

## Status

Work in progress, built in public.
