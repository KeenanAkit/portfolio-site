#!/usr/bin/env node
// scripts/ingest-sprite.mjs
//
// Pull sprite source images out of the inbox, post-process them according
// to the recipe matched on filename ID, and drop the result in
// public/assets/rooms/ under the canonical name from the asset manifest
// (see scripts/lib/sprite-recipes.mjs).
//
// Default inbox: ~/Pictures/kport-sprite-inbox/
// Override:     KPORT_SPRITE_INBOX=/path/to/folder
//
// Filename convention: <ID>-<anything>.png
//   B5-md-frame-gilt.png          → recipe for B5-md, output frame-gilt-md.png
//   B5.png                        → recipe for B5 (no sub-variant)
//   A5-attempt-3.png              → recipe for A5
//
// IDs and recipes live in scripts/lib/sprite-recipes.mjs. Add new IDs there
// as the design doc grows.
//
// Usage:
//   npm run sync:sprites
//   npm run sync:sprites -- --dry-run
//   npm run sync:sprites -- --id=B5-md         # process only the matching file
//   npm run sync:sprites -- --keep             # don't move processed files

import { readdir, mkdir, rename, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { recipeForInboxName } from './lib/sprite-recipes.mjs';
import { runRecipe } from './lib/sprite-cleanup.mjs';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const ROOMS_DIR = resolve(__dirname, '..', 'public', 'assets', 'rooms');

const args = parseArgs(process.argv.slice(2));
const inboxPath = resolveInbox(args.inbox);
const dryRun = args['dry-run'] === true;
const keepSource = args.keep === true;
const idFilter = args.id;

async function main() {
  if (!existsSync(inboxPath)) {
    console.error(`Sprite inbox doesn't exist: ${inboxPath}`);
    console.error(`Create it: mkdir -p "${inboxPath}"`);
    process.exit(1);
  }
  await mkdir(ROOMS_DIR, { recursive: true });

  const entries = (await readdir(inboxPath, { withFileTypes: true }))
    .filter((e) => e.isFile() && /\.png$/i.test(e.name))
    .map((e) => e.name)
    .sort();

  if (entries.length === 0) {
    console.log(`Inbox empty. ${inboxPath}`);
    console.log('Generate a sprite, save it as <ID>-something.png, re-run.');
    return;
  }

  const results = { processed: 0, skipped: 0, failed: 0 };

  for (const name of entries) {
    const match = recipeForInboxName(name);
    if (!match) {
      results.skipped++;
      console.log(`  · ${name}  (no recipe — filename should start with a sprite ID like B5-)`);
      continue;
    }
    if (idFilter && match.id !== idFilter) {
      continue;
    }

    const src = join(inboxPath, name);
    const dst = join(ROOMS_DIR, match.output);
    const srcSize = (await stat(src)).size;

    if (dryRun) {
      console.log(
        `  → ${name} (${match.id}, ${match.recipe}, ${match.target.join('x')})  →  ${match.output}`
      );
      continue;
    }

    try {
      await runRecipe(match.recipe, src, match.target, dst);
      const dstSize = (await stat(dst)).size;
      results.processed++;
      const pct = Math.round((1 - dstSize / srcSize) * 100);
      console.log(
        `  + ${name}  →  ${match.output}  (${srcSize} → ${dstSize} bytes, -${pct}%)`
      );
      if (!keepSource) await moveToProcessed(src);
    } catch (err) {
      results.failed++;
      console.log(`  x ${name}  (failed: ${err instanceof Error ? err.message : err})`);
    }
  }

  console.log('');
  console.log(
    `Done. ${results.processed} processed, ${results.skipped} skipped, ${results.failed} failed.`
  );

  if (results.processed > 0 && !dryRun) {
    console.log('');
    console.log('Next: npm run dev — open the gallery and verify the sprite renders.');
  }
}

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq === -1) out[a.slice(2)] = true;
      else out[a.slice(2, eq)] = a.slice(eq + 1);
    }
  }
  return out;
}

function resolveInbox(arg) {
  const raw =
    arg ?? process.env.KPORT_SPRITE_INBOX ?? join(homedir(), 'Pictures', 'kport-sprite-inbox');
  return raw.startsWith('~') ? join(homedir(), raw.slice(1).replace(/^\/+/, '')) : resolve(raw);
}

async function moveToProcessed(srcPath) {
  const dateFolder = new Date().toISOString().split('T')[0];
  const processedDir = join(inboxPath, 'processed', dateFolder);
  await mkdir(processedDir, { recursive: true });

  const name = basename(srcPath);
  let dest = join(processedDir, name);
  if (existsSync(dest)) {
    const ext = extname(name);
    const base = name.slice(0, name.length - ext.length);
    dest = join(processedDir, `${base}-${String(Date.now()).slice(-6)}${ext}`);
  }
  await rename(srcPath, dest);
}

main().catch((err) => {
  console.error('Sprite sync failed:', err);
  process.exit(1);
});
