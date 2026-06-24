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
// Usage:
//   npm run sync:photos
//   npm run sync:photos -- --dry-run
//   npm run sync:photos -- --inbox=~/Desktop/lr-export
//   npm run sync:photos -- --keep        # do NOT move source files after ingest
//
// Workflow:
//   1. Scan the inbox for .jpg/.jpeg/.heic/.tif/.tiff/.png/.webp files.
//   2. For each new file:
//      a. Extract EXIF + XMP via scripts/lib/exif-extract.mjs
//      b. Ingest via scripts/lib/ingest-photo.mjs (writes asset + frontmatter)
//      c. Move the source into <inbox>/processed/YYYY-MM-DD/ (unless --keep)
//   3. Report added / skipped / failed counts.

import { readdir, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { extname, join, resolve, basename } from 'node:path';

import { extractExif } from './lib/exif-extract.mjs';
import { ingestPhoto } from './lib/ingest-photo.mjs';

// ---------- CLI args ----------

const args = parseArgs(process.argv.slice(2));
const inboxPath = resolveInbox(args.inbox);
const dryRun = args['dry-run'] === true;
const keepSource = args.keep === true;

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

  const entries = await readdir(inboxPath, { withFileTypes: true });
  const photos = entries
    .filter((e) => e.isFile())
    .map((e) => join(inboxPath, e.name))
    .filter((p) => ACCEPTED_EXTS.has(extname(p).toLowerCase()))
    .sort();

  if (photos.length === 0) {
    console.log(`Inbox empty. ${inboxPath}`);
    console.log('Drop files in (or hit Export from Lightroom) and re-run.');
    return;
  }

  console.log(
    `${dryRun ? '[dry-run] ' : ''}Scanning ${photos.length} file${photos.length === 1 ? '' : 's'} in ${inboxPath}`
  );
  console.log('');

  const results = { added: 0, skipped: 0, failed: 0, items: [] };

  for (const sourcePath of photos) {
    const name = basename(sourcePath);
    try {
      const meta = await extractExif(sourcePath);
      const r = await ingestPhoto({ sourcePath, meta, dryRun });
      results.items.push({ name, ...r });

      if (r.status === 'added') {
        results.added++;
        const sizeKB = r.bytes ? ` (${Math.round(r.bytes / 1024)} KB)` : '';
        console.log(`  + ${name}  →  ${r.slug}${sizeKB}  uploaded to R2`);
        if (!dryRun && !keepSource) {
          await moveToProcessed(sourcePath);
        }
      } else if (r.status === 'skipped') {
        results.skipped++;
        console.log(`  · ${name}  →  ${r.slug}  (skipped: ${r.reason})`);
      } else {
        results.failed++;
        console.log(`  x ${name}  (failed: ${r.reason})`);
      }
    } catch (err) {
      results.failed++;
      results.items.push({ name, status: 'failed', reason: err.message });
      console.log(`  x ${name}  (failed: ${err.message})`);
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
    console.log('  2. Tag photos with category keywords if Lightroom didn\'t');
    console.log('     (landscapes, street, portraits, black-and-white, travel).');
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

async function moveToProcessed(sourcePath) {
  const dateFolder = new Date().toISOString().split('T')[0];
  const processedDir = join(inboxPath, 'processed', dateFolder);
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
