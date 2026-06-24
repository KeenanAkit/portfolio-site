# DESIGN.md — KPort

The canonical visual spec for KPort. Read this before changing any visual.
Every color, type, spacing, or component decision should trace back to here.
If you need a value that isn't here, add it first.

---

## Changelog

- **Cozy pixel-art pivot.** The Rooms aesthetic shifted from late-90s PC-game
  vocabulary to cozy modern pixel art (Stardew Valley, Animal Crossing, A Short
  Hike, Eastward). Win98 chrome stays sharp 1998 silver; rooms inside warm to
  2016+ cozy. The era mismatch is intentional. Palette warms throughout. The
  storefront is a main-street block with a hand-painted wooden sign and lantern
  (no neon). The gallery is a cozy museum room (cream walls, sage wainscoting,
  warm oak floor, gilt frames).
- **Rooms system added** (Photos storefront + Gallery, Workshop, Study).
  Replaces the mobile-clean mandate with a pixel-art world rendered inside
  Win98 chrome. Three rooms in one building. Per-category lighting variants for
  the Gallery.
- **Initial system** documented from the approved homepage mockups.

---

## The thesis

KPort has three faces. All three are intentional. None of them is generic-retro.

- **Desktop**: a faithful Windows 98 desktop with one personal twist: the
  wallpaper is one of Keenan's hero landscape photos (subtle dark overlay
  for icon readability). The chrome stays 98. The personality comes from
  whose desktop it is.
- **Mobile**: a clean photo-first portfolio in light mode with grey
  outlines and a single Win98 teal accent. The retro nod is restrained.
  The photos are the work.
- **Inside each window**: a cozy pixel-art room in the modern Stardew Valley
  vocabulary (Stardew Valley, Animal Crossing, A Short Hike, Eastward, A Little
  to the Left, Cozy Grove, Spiritfarer). Photos.exe is a Stardew-style museum
  gallery (think Gunther's museum on a warm afternoon). Projects.exe is a cozy
  maker workshop. Notepad.exe is a warm study with a banker's lamp and a knit
  blanket. Photos.exe also has a Pelican Town main street exterior state where
  you click a photography shop's door to enter the gallery. The Win98 chrome
  stays sovereign (sharp 1998 silver), but the rooms inside it read 2016+ cozy.
  The era mismatch is intentional. Mobile inherits the rooms too, composed
  vertically. The "Standard view" skip link (`?ui=standard`) suppresses all
  pixel-art ornaments for AT users and anyone who wants the previous
  clean-white photo-first layout.

What makes it NOT generic-retro: the desktop is somebody's actual desktop,
not a Winamp-on-Wallpaper recreation. The mobile site is a photographer's
site that happens to have a 98 wink, not a 90s tribute trying to be a
portfolio. The rooms are a hand-built cozy pixel-art world inspired by
Stardew Valley and Animal Crossing, not corporate SaaS, not vaporwave, not
modern minimalist white-and-gradient.

---

## Color tokens

```css
/* Mobile + universal */
--color-bg:              #FFFFFF;     /* clean white, mobile background */
--color-bg-elevated:     #FAFAFA;     /* card backgrounds, subtle warmth */
--color-text-primary:    #1A1A1A;     /* body copy, headings */
--color-text-secondary:  #666666;     /* meta, dates, captions */
--color-text-tertiary:   #999999;     /* hints, placeholder text */
--color-border:          #E5E5E5;     /* card outlines on mobile */
--color-border-strong:   #D0D0D0;     /* dividers */
--color-accent:          #008080;     /* classic Win98 teal, sparingly */
--color-accent-hover:    #006666;     /* darker teal on hover */
--color-link:            var(--color-accent);

/* Desktop (Win98) */
--win98-desktop-bg:      #008080;     /* fallback if no wallpaper */
--win98-window-bg:       #C0C0C0;     /* classic silver */
--win98-window-border-light: #FFFFFF;
--win98-window-border-dark:  #808080;
--win98-window-border-shadow: #404040;
--win98-titlebar-active:     linear-gradient(90deg, #0A246A 0%, #A6CAF0 100%);
--win98-titlebar-inactive:   linear-gradient(90deg, #808080 0%, #B5B5B5 100%);
--win98-titlebar-text:       #FFFFFF;
--win98-text:                #000000;

/* State + alerts */
--color-success: #008000;             /* Win98 green, used in screensaver tweaks etc. */
--color-error:   #C00000;             /* used on BSOD */
--color-bsod-bg: #0000AA;             /* THE blue */
```

### Rooms palette

The pixel-art rooms use a strict 16-color palette. These tokens live alongside
the existing tokens; they don't replace anything. Rooms are bounded by Win98
chrome on desktop, and by the mobile page chrome (sticky header) on mobile.

The cozy pivot warmed every value below. Variable NAMES stay the same as the
original spec so code stays compatible; only the hex VALUES change.

```css
/* Default / Featured / Overview — warm afternoon Gunther museum */
--gallery-light-dusk-bg-a:        #F0DEAC;  /* cream wall high */
--gallery-light-dusk-bg-b:        #E4D2A0;  /* cream wall low (dither) */
--gallery-light-dusk-sconce:      rgba(255,232,160,0.45);  /* warm picture-light */
--gallery-light-dusk-floor-line:  rgba(106,64,32,0.55);    /* oak grain */
--gallery-light-dusk-wainscot:    #7A8A5A;                 /* sage */
--gallery-light-dusk-floor:       #8A5828;                 /* oak */

/* Landscapes — golden hour */
--gallery-light-amber-bg-a:       #F5C485;
--gallery-light-amber-bg-b:       #D89A6E;
--gallery-light-amber-sconce:     rgba(255,200,120,0.55);
--gallery-light-amber-floor-line: rgba(140,80,40,0.55);
--gallery-light-amber-wainscot:   #8A6850;
--gallery-light-amber-floor:      #6A4020;

/* Street — warm lantern night */
--gallery-light-sodium-bg-a:      #6A4828;
--gallery-light-sodium-bg-b:      #4A3020;
--gallery-light-sodium-sconce:    rgba(255,180,90,0.55);
--gallery-light-sodium-floor-line: rgba(180,100,40,0.50);
--gallery-light-sodium-wainscot:  #4A3828;
--gallery-light-sodium-floor:     #4A2810;

/* Portraits — tungsten warm interior */
--gallery-light-tungsten-bg-a:    #F0D8A8;
--gallery-light-tungsten-bg-b:    #D8B888;
--gallery-light-tungsten-sconce:  rgba(255,220,150,0.55);
--gallery-light-tungsten-floor-line: rgba(140,80,40,0.55);
--gallery-light-tungsten-wainscot: #B07840;
--gallery-light-tungsten-floor:   #8A5828;

/* Black-and-white — moonlit silver */
--gallery-light-moon-bg-a:        #D8D0C0;
--gallery-light-moon-bg-b:        #B0A898;
--gallery-light-moon-sconce:      rgba(220,220,200,0.50);
--gallery-light-moon-floor-line:  rgba(80,72,60,0.55);
--gallery-light-moon-wainscot:    #7A7060;
--gallery-light-moon-floor:       #5A5048;

/* Shared palette across all three rooms (cozy) */
--room-antique-gold:    #C49A3D;       /* gilt frames, brass tacks */
--room-brass-shadow:    #4A3608;
--room-brass-highlight: #E8C46A;
--room-oak-warm:        #B07840;       /* frame highlights, light wood */
--room-oak-mid:         #8A5828;       /* signs, plaque base */
--room-oak-dark:        #6A4020;       /* deeper wood, door */
--room-walnut:          #4A2810;       /* floor shadow, outlines */
--room-walnut-deep:     #2A1808;       /* deep outlines */
--room-cream-light:     #FFF3D0;       /* window glow, paper */
--room-cream-mid:       #F0DEAC;       /* Gallery walls */
--room-cream-deep:      #E4D2A0;       /* dithered wall low */
--room-sage-mid:        #7A8A5A;       /* wainscoting, distant hills */
--room-sage-deep:       #5A6E3A;       /* foreground hills */
--room-foliage-mid:     #4A6E2A;       /* potted fern */
--room-pine-dark:       #3A4A28;       /* pine silhouettes */
--room-paper:           #F5DC6A;       /* legal-pad sheets (Study) */
--room-paper-line:      #C8AC4A;       /* legal-pad horizontal rule */
--room-blueprint-bg:    #1A3A6E;       /* Workshop blueprint cards */
```

The Gallery's active category is set via `data-light="dusk|amber|sodium|tungsten|moon"` on the gallery root. CSS reads from that attribute and propagates the right
sub-palette into `--gallery-tint-color` and `--gallery-sconce-color`. The layer
stack and `mix-blend-mode` overlay rules live in `src/styles/rooms.css`.

**Usage rules:**
- White is the dominant color on mobile **only when `?ui=standard` is active**
  (the AT bypass). By default mobile pages now sit on the active section's
  pixel-art room background. White returns under the Standard view flag.
- Teal `#008080` is the ONLY mobile-chrome accent. Reserved for: links, the
  chunky Win98 CTAs, and the desktop background fallback. NEVER fills a button
  background on mobile. NEVER used as a gradient.
- Gallery dithered teal `#2A5555 → #0B1A1A` is NOT the mobile accent. It is
  the wall material for the Gallery room only.
- Greys form the structure of mobile chrome (sticky header, link separators).
  No drop shadows except on Win98 windows (where the inset 3D border is the
  shadow) and on Rooms props (where the pixel-art shadow is part of the sprite).
- Pure black `#000` is for Win98 body text only. Mobile body uses `#1A1A1A`
  for less eye strain. Rooms text on a dark wall uses `#F5DC6A` (room-paper)
  or `--room-brass-highlight`; pick whichever has WCAG AA contrast against
  the wall.

---

## Typography

```css
/* Heading stack — Tahoma family */
--font-heading: 'Tahoma', 'Microsoft Sans Serif', 'Segoe UI', sans-serif;

/* Body stack — modern system sans */
--font-body: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI',
             Roboto, Helvetica, Arial, sans-serif;

/* Win98 chrome — strict Tahoma */
--font-win98: 'Tahoma', 'Microsoft Sans Serif', 'MS Sans Serif', sans-serif;
```

### Mobile type scale (390px viewport baseline)

| Token | Size | Line height | Weight | Use |
|---|---|---|---|---|
| `--text-display`   | 32px / 2rem    | 1.15 | 700 | Wordmark on homepage |
| `--text-h1`        | 24px / 1.5rem  | 1.2  | 700 | Page titles (Photos, Projects, Blog) |
| `--text-h2`        | 20px / 1.25rem | 1.25 | 700 | Section headings (Featured Categories, Side Projects) |
| `--text-h3`        | 17px / 1.0625rem | 1.3 | 600 | Card titles, post titles |
| `--text-body`      | 16px / 1rem    | 1.55 | 400 | Default body |
| `--text-meta`      | 14px / 0.875rem | 1.45 | 400 | Dates, secondary info |
| `--text-caption`   | 13px / 0.8125rem | 1.4 | 400 | Photo captions, footer fine print |

Headings use Tahoma. Body uses system sans. Numbers in dates and metadata
use tabular-nums.

### Win98 type scale (desktop only)

| Token | Size | Use |
|---|---|---|
| `--text-titlebar`  | 11px Tahoma bold | Window title bars |
| `--text-menu`      | 11px Tahoma     | Menu items, taskbar tabs |
| `--text-icon`      | 11px Tahoma     | Desktop icon labels (white text + dark shadow on photo wallpaper) |
| `--text-body-win`  | 11px Tahoma     | Body text inside windows |

11px sounds small but it's accurate to Win98. The chunkiness of Tahoma
holds at that size.

---

## Spacing scale

```css
--space-1:  4px;
--space-2:  8px;
--space-3:  12px;
--space-4:  16px;   /* base unit */
--space-5:  24px;
--space-6:  32px;
--space-7:  48px;
--space-8:  64px;
--space-9:  96px;
```

Mobile section padding: `var(--space-5)` left/right, `var(--space-6)` top/bottom.
Card internal padding: `var(--space-4)`.
Window internal padding (Win98): `var(--space-3)`.

---

## Layout

### Mobile (390px baseline)

```
┌────────────────────────────────┐
│ Header (sticky, 56px tall)     │
│ Keenan Akit    /   contact     │
├────────────────────────────────┤
│                                │
│  Hero photo (edge-to-edge,     │
│  16:10 aspect ratio)           │
│                                │
├────────────────────────────────┤
│ Featured Categories            │  ← was "Recent Photos"
│ ┌───┬───┬───┬───┐              │     horizontal scroll cards
│ │ A │ B │ C │ D │              │     each with cover + label
│ └───┴───┴───┴───┘              │
│ → All photos                   │
├────────────────────────────────┤
│ Side Projects                  │
│ ┌────────────────────┐         │
│ │ Project title       │ [Open] │  ← chunky Win98 button
│ │ One-line summary    │        │
│ └────────────────────┘         │
│ ┌────────────────────┐         │
│ │ ...                 │ [Open] │
│ └────────────────────┘         │
├────────────────────────────────┤
│ Latest Posts                   │
│ Post title                     │
│ May 28, 2026 · 4 min read      │
│ Two-line excerpt...            │
│ ──────                         │
│ ...                            │
├────────────────────────────────┤
│ Contact                        │
│ keenanakit@gmail.com           │
│ Instagram · GitHub             │
└────────────────────────────────┘
```

Max width on tablet/desktop fallback (anyone hitting mobile UI on a wide
screen): 640px centered.

### Desktop (Windows 98, 1440x900 baseline)

```
┌──────────────────────────────────────────────────────────────────────┐
│ [Custom photo wallpaper — moody landscape with subtle dark overlay]  │
│                                                                       │
│ 📁                                                                    │
│ My Pictures        ┌─[ My Pictures - Featured              ─□×]─┐    │
│                    │                                              │    │
│ 💼                 │  [3x3 grid of photo thumbnails]              │    │
│ My Projects        │                                              │    │
│                    │                                              │    │
│ 📓                 └──────────────────────────────────────────────┘    │
│ Notepad                                                               │
│                                                                       │
│ 🗑                                                                    │
│ Recycle Bin                                                           │
│                                                                       │
│                                                                       │
├──────────────────────────────────────────────────────────────────────┤
│ [Start] │ ▣ My Pictures │ 💼 My Projects │      🔊 ◄ 4:32 PM        │
└──────────────────────────────────────────────────────────────────────┘
```

Wallpaper: a single chosen photo per session, with a `prefers-color-scheme:
dark` variant for night mode (darker overlay). Configurable in v1.1 via the
wallpaper picker easter egg. For v1, ship with one chosen image.

---

## Components

### Mobile

**Hero photo**: edge-to-edge, no border-radius. Aspect ratio 16:10. Uses
Astro's `<Image>` with LQIP blur placeholder.

**Category card** (in featured categories carousel): 140px square,
`var(--color-border)` 1px outline, `var(--space-2)` border-radius. Cover
image fills top 80%, label in `--text-meta` bottom 20% on white.

**Project card**: full-width, `var(--color-border)` 1px outline, no
border-radius (signals Win98 angularity). Internal padding `--space-4`.
Title in `--text-h3`, summary in `--text-body`. CTA on the right: chunky
Win98 button (see below).

**Blog post entry**: no card outline. Title, meta row, excerpt. Dividers
between entries (`--color-border-strong` 1px). No "read more" link — title
is the link.

**Chunky Win98 button**: this is the one place mobile leans into the bit.
Background `var(--win98-window-bg)` (silver), text `var(--color-text-primary)`,
beveled border using box-shadow (inset for pressed state, outset for resting),
Tahoma 12px, `--space-3` horizontal padding, 32px tall, no border-radius.

```css
.btn-win98 {
  background: #C0C0C0;
  color: #1A1A1A;
  border: 2px solid;
  border-color: #FFFFFF #808080 #808080 #FFFFFF;
  box-shadow: inset 1px 1px 0 #DFDFDF, inset -1px -1px 0 #404040;
  font-family: var(--font-win98);
  font-size: 12px;
  padding: 0 var(--space-4);
  height: 32px;
  cursor: pointer;
}
.btn-win98:active {
  border-color: #808080 #FFFFFF #FFFFFF #808080;
  box-shadow: inset 1px 1px 0 #404040, inset -1px -1px 0 #DFDFDF;
}
```

### Desktop (Win98)

All chrome comes from `98.css` plus the custom CSS budgeted in the design
doc (~250 lines). Specifically built:
- **Taskbar** (custom): gray gradient, Start button, running-app tabs.
- **Desktop icons** (custom): 32px icon + Tahoma label, double-click to open.
- **Clock** (custom): system tray, ticks live.
- **Focused/unfocused title bars** (custom CSS override on 98.css).
- **Wallpaper layer** (custom): full-bleed photo with `linear-gradient(rgba(0,0,0,0.35))` overlay.

---

## Iconography

Desktop icons use authentic-feel 32x32 PNG sprites (not SVG, the pixel
blockiness IS the point). Set:
- `my-pictures.png` — yellow folder with photo thumbnail peek
- `my-projects.png` — briefcase
- `notepad.png` — pad with pencil
- `recycle-bin-empty.png` / `recycle-bin-full.png` — the classic green bin
- `internet-explorer.png` — the blue e (easter egg, opens to fake links)
- `readme.png` — text doc

Mobile uses zero decorative icons. The text headings do the work. Exception:
contact footer uses tiny stroked SVG icons for email, Instagram, GitHub
(16px, `currentColor`).

---

## Motion

Visual summary:

- **Boot sequence** (first visit, desktop only): BIOS text fades in, then
  Windows splash, then desktop. 2 seconds total.
- **Window open**: GSAP Flip from icon to window position. 280ms ease.out.
- **Window minimize**: Flip down to taskbar tab.
- **Outbound link CRT collapse**: scaleY → 0 + flash + 300ms delay.
- **Idle Mystify screensaver**: starts after 60s of no input.

All motion respects `prefers-reduced-motion: reduce`.

---

## What this design system is NOT

- Not a SaaS template. No card grids of features with icon-in-circle. No
  centered hero text on a flat background. No "Unlock the power of..." copy.
- Not a vaporwave / synthwave site. The teal is functional, not nostalgic.
  No magenta. No grids. No chromatic aberration.
- Not a maximalist 1998 GeoCities tribute. The desktop is restrained: 4-5
  icons, one window open, no animated GIFs, no marquee tags (the marquee
  is reserved for the screensaver only).
- Not minimalist. The Win98 chrome is intentionally chunky. Don't soften
  the bevels.

---

## When you need a value that isn't here

Add it. Then update this file. Then commit. Design system drift is how
sites end up looking like they were made by 4 different people.
