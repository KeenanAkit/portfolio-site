#!/usr/bin/env node
// scripts/sync-folder.mjs
//
// Bulk-ingest photos from a watched inbox folder (typically Lightroom CC
// Desktop's Export Preset target). Idempotent: re-running does nothing if
// no new files have landed in the inbox.
//
// Default inbox: ~/Pictures/kport-inbox/
// Override:     --inbox=/path/to/folder    OR    KPORT_INBOX=/path/to/folder
//
// Category folders:
//   Put each photo inside a subfolder named for its gallery category, e.g.
//     kport-inbox/landscapes/IMG_0001.jpg   →  tags: ["landscapes"]
//     kport-inbox/street/_DSF0233.jpg        →  tags: ["street"]
//   The subfolder name becomes the photo's category tag (it leads the tag
//   list; any Lightroom keywords follow). Valid categories are read from
//   src/content/collections/; an unknown folder still ingests but warns, so a
//   typo can't silently file photos under a category that has no gallery.
//   Files dropped loose in the inbox root ingest untagged with a warning.
//
// Usage:
//   npm run sync:photos
//   npm run sync:photos -- --dry-run
//   npm run sync:photos -- --inbox=~/Desktop/lr-export
//   npm run sync:photos -- --keep        # do NOT move source files after ingest
//
// Workflow, per file:
//   1. Extract EXIF + XMP via scripts/lib/exif-extract.mjs
//   2. Ingest via scripts/lib/ingest-photo.mjs (uploads to R2 + writes frontmatter)
//   3. Move the source into <inbox>/processed/YYYY-MM-DD/<category>/ (unless --keep)

import { readdir, mkdir, rename, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { extname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractExif } from './lib/exif-extract.mjs';
import { ingestPhoto } from './lib/ingest-photo.mjs';

// ---------- CLI args ----------

const args = parseArgs(process.argv.slice(2));
const inboxPath = resolveInbox(args.inbox);
const dryRun = args['dry-run'] === true;
const keepSource = args.keep === true;

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const COLLECTIONS_DIR = join(ROOT, 'src', 'content', 'collections');

const ACCEPTED_EXTS = new Set([
  '.jpg',
  '.jpeg',
  '.heic',
  '.tif',
  '.tiff',
  '.png',
  '.webp',
]);

// ---------- main ----------

async function main() {
  if (!existsSync(inboxPath)) {
    console.error(`Inbox folder does not exist: ${inboxPath}`);
    console.error('');
    console.error('Create it with:');
    console.error(`  mkdir -p "${inboxPath}"`);
    console.error('');
    console.error('Then point your Lightroom CC Desktop Export Preset at it.');
    console.error('See README.md > "Sync photos from Lightroom" for setup.');
    process.exit(1);
  }

  const knownCategories = await readKnownCategories();
  const work = await collectWork(knownCategories);

  if (work.length === 0) {
    console.log(`Inbox empty. ${inboxPath}`);
    console.log('Drop category folders in (or hit Export from Lightroom) and re-run.');
    return;
  }

  console.log(
    `${dryRun ? '[dry-run] ' : ''}Scanning ${work.length} file${work.length === 1 ? '' : 's'} in ${inboxPath}`
  );
  console.log('');

  const results = { added: 0, skipped: 0, failed: 0, items: [] };

  for (const { sourcePath, categoryTag } of work) {
    const name = basename(sourcePath);
    const tagLabel = categoryTag ? `[${categoryTag}] ` : '[uncategorized] ';
    try {
      const meta = await extractExif(sourcePath);
      const r = await ingestPhoto({ sourcePath, meta, dryRun, categoryTag });
      results.items.push({ name, categoryTag, ...r });

      if (r.status === 'added') {
        results.added++;
        const sizeKB = r.bytes ? ` (${Math.round(r.bytes / 1024)} KB)` : '';
        console.log(`  + ${tagLabel}${name}  →  ${r.slug}${sizeKB}  uploaded to R2`);
        if (!dryRun && !keepSource) {
          await moveToProcessed(sourcePath, categoryTag);
        }
      } else if (r.status === 'skipped') {
        results.skipped++;
        console.log(`  · ${tagLabel}${name}  →  ${r.slug}  (skipped: ${r.reason})`);
      } else {
        results.failed++;
        console.log(`  x ${tagLabel}${name}  (failed: ${r.reason})`);
      }
    } catch (err) {
      results.failed++;
      results.items.push({ name, status: 'failed', reason: err.message });
      console.log(`  x ${tagLabel}${name}  (failed: ${err.message})`);
    }
  }

  console.log('');
  console.log(
    `${dryRun ? '[dry-run] ' : ''}Done. ` +
      `${results.added} added, ${results.skipped} skipped, ${results.failed} failed.`
  );

  if (results.added > 0 && !dryRun) {
    console.log('');
    console.log('Next steps:');
    console.log('  1. Review the generated frontmatter under src/content/photos/');
    console.log('     Write captions in your voice and fill in location.');
    console.log('  2. Confirm each photo\'s category tag matches a collection');
    console.log('     (landscapes, street, motorsports, events, travel).');
    console.log('  3. Run `npm run check:slop` to verify slop linter passes.');
    console.log('  4. git add src/content/photos && commit + push to deploy.');
    console.log('     (Photo binaries are on R2 — only the .md frontmatter is committed.)');
  }
}

// ---------- helpers ----------

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq === -1) out[arg.slice(2)] = true;
      else out[arg.slice(2, eq)] = arg.slice(eq + 1);
    }
  }
  return out;
}

function resolveInbox(arg) {
  const raw = arg ?? process.env.KPORT_INBOX ?? join(homedir(), 'Pictures', 'kport-inbox');
  return raw.startsWith('~') ? join(homedir(), raw.slice(1).replace(/^\/+/, '')) : resolve(raw);
}

/** Read the set of valid category tags from the collections content. Each
 *  collection's `filter.tag` is the authoritative tag; the filename is a
 *  fallback. Used to flag mistyped inbox folder names before they create
 *  orphan tags no gallery filters on. */
async function readKnownCategories() {
  const known = new Set();
  if (!existsSync(COLLECTIONS_DIR)) return known;
  const files = (await readdir(COLLECTIONS_DIR)).filter((f) => f.endsWith('.md'));
  for (const f of files) {
    const body = await readFile(join(COLLECTIONS_DIR, f), 'utf8');
    const m = body.match(/^\s*tag:\s*["']?([^"'\n]+)["']?\s*$/m);
    known.add((m ? m[1] : basename(f, '.md')).trim().toLowerCase());
  }
  return known;
}

/** Walk the inbox into a flat worklist of { sourcePath, categoryTag }. One
 *  level deep: each subfolder is a category; loose root files are
 *  uncategorized. The `processed/` folder is always skipped. */
async function collectWork(knownCategories) {
  const work = [];
  const entries = await readdir(inboxPath, { withFileTypes: true });

  // Category subfolders.
  const dirs = entries.filter((e) => e.isDirectory() && e.name !== 'processed');
  for (const d of dirs) {
    const categoryTag = d.name.trim().toLowerCase();
    if (knownCategories.size > 0 && !knownCategories.has(categoryTag)) {
      console.warn(
        `  ! Folder "${d.name}" is not a known category ` +
          `(${[...knownCategories].join(', ')}). Ingesting with tag "${categoryTag}" anyway.`
      );
    }
    for (const file of await imageFilesIn(join(inboxPath, d.name))) {
      work.push({ sourcePath: file, categoryTag });
    }
  }

  // Loose files in the inbox root (back-compat with the flat workflow).
  const looseFiles = entries
    .filter((e) => e.isFile() && ACCEPTED_EXTS.has(extname(e.name).toLowerCase()))
    .map((e) => join(inboxPath, e.name))
    .sort();
  if (looseFiles.length > 0) {
    console.warn(
      `  ! ${looseFiles.length} file(s) sit loose in the inbox root with no ` +
        `category folder. Ingesting them uncategorized (no tag).`
    );
    for (const file of looseFiles) work.push({ sourcePath: file, categoryTag: null });
  }

  return work;
}

/** List accepted image files directly inside a directory, sorted. */
async function imageFilesIn(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && ACCEPTED_EXTS.has(extname(e.name).toLowerCase()))
    .map((e) => join(dir, e.name))
    .sort();
}

async function moveToProcessed(sourcePath, categoryTag) {
  const dateFolder = new Date().toISOString().split('T')[0];
  // Preserve the category under processed/ so a re-export keeps its structure
  // and a processed photo's origin category stays obvious.
  const processedDir = join(
    inboxPath,
    'processed',
    dateFolder,
    categoryTag ?? '_uncategorized'
  );
  await mkdir(processedDir, { recursive: true });

  const name = basename(sourcePath);
  let dest = join(processedDir, name);

  // If a same-name file already lives in the processed folder (rare, but
  // happens if a photo is re-exported twice on the same day), append a
  // small disambiguator.
  if (existsSync(dest)) {
    const ext = extname(name);
    const base = name.slice(0, name.length - ext.length);
    const stamp = String(Date.now()).slice(-6);
    dest = join(processedDir, `${base}-${stamp}${ext}`);
  }

  await rename(sourcePath, dest);
}

main().catch((err) => {
  console.error('Sync failed:', err);
  process.exit(1);
});
