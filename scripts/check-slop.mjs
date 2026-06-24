#!/usr/bin/env node
// scripts/check-slop.mjs
//
// Prose style linter for KPort content.
//
// Scans .md, .mdx, .astro, README.md, and the public-facing pages for banned
// vocabulary, banned phrases, and em dashes. Frontmatter blocks are skipped
// (image paths and tags shouldn't be policed).
//
// Exit codes:
//   0 — clean
//   1 — findings; commit / build should fail
//   2 — script error
//
// Usage:
//   node scripts/check-slop.mjs              # scan default targets
//   node scripts/check-slop.mjs path1 path2  # scan specific paths
//   node scripts/check-slop.mjs --strict     # also fail on warnings

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');

const DEFAULT_TARGETS = [
  'src/content',
  'src/pages',
  'src/components',
  'src/layouts',
  'README.md',
];

// This linter is exempt from itself — it has to list the banned terms.
const EXEMPT = new Set(['scripts/check-slop.mjs']);

const BANNED_WORDS = [
  'delve',
  'crucial',
  'robust',
  'comprehensive',
  'nuanced',
  'multifaceted',
  'furthermore',
  'moreover',
  'additionally',
  'pivotal',
  'tapestry',
  'foster',
  'intricate',
  'vibrant',
  'fundamental',
  'interplay',
  'ever-evolving',
  'leveraging',
  'seamless',
  'streamlined',
  'transformative',
  'revolutionary',
  'game-changing',
  'cutting-edge',
  'state-of-the-art',
  'unleash',
  'plethora',
  'myriad',
  'paramount',
  'demystify',
];

const BANNED_PHRASES = [
  "here's the kicker",
  "here's the thing",
  'plot twist',
  'let me break this down',
  'the bottom line',
  'make no mistake',
  "can't stress this enough",
  "it's worth noting",
  "it's important to note",
  'in conclusion',
  'to sum up',
  'at the end of the day',
  'without further ado',
  "in today's digital age",
  'in the realm of',
  'navigate the complexities',
  'testament to',
];

const EM_DASH = '—';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const targets =
  args.filter((a) => !a.startsWith('--')).length > 0
    ? args.filter((a) => !a.startsWith('--'))
    : DEFAULT_TARGETS;

/** @type {Array<{file: string, line: number, kind: string, match: string, content: string}>} */
const findings = [];
let filesScanned = 0;

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(path);
    } else if (/\.(md|mdx|astro)$/i.test(entry.name)) {
      yield path;
    }
  }
}

async function scanFile(filePath) {
  const rel = relative(ROOT, filePath).split(sep).join('/');
  if (EXEMPT.has(rel)) return;
  filesScanned++;

  const text = await readFile(filePath, 'utf8');
  const lines = text.split('\n');

  // Skip YAML frontmatter blocks.
  let inFrontmatter = false;
  let frontmatterCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim() === '---') {
      frontmatterCount++;
      if (frontmatterCount === 1) inFrontmatter = true;
      else if (frontmatterCount === 2) inFrontmatter = false;
      continue;
    }
    if (inFrontmatter) continue;

    const lower = line.toLowerCase();

    for (const word of BANNED_WORDS) {
      // Word boundary on both sides; tolerate hyphenation (e.g. "ever-evolving").
      const re = new RegExp(
        `(?:^|[^\\w-])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^\\w-]|$)`,
        'i'
      );
      if (re.test(line)) {
        findings.push({
          file: rel,
          line: i + 1,
          kind: 'word',
          match: word,
          content: line.trim(),
        });
      }
    }

    for (const phrase of BANNED_PHRASES) {
      if (lower.includes(phrase)) {
        findings.push({
          file: rel,
          line: i + 1,
          kind: 'phrase',
          match: phrase,
          content: line.trim(),
        });
      }
    }

    if (line.includes(EM_DASH)) {
      findings.push({
        file: rel,
        line: i + 1,
        kind: 'em-dash',
        match: EM_DASH,
        content: line.trim(),
      });
    }
  }
}

async function processTarget(target) {
  const fullPath = resolve(ROOT, target);
  let s;
  try {
    s = await stat(fullPath);
  } catch {
    return; // target doesn't exist yet — fine on Weekend 1
  }
  if (s.isDirectory()) {
    for await (const file of walk(fullPath)) {
      await scanFile(file);
    }
  } else if (s.isFile()) {
    await scanFile(fullPath);
  }
}

async function main() {
  for (const target of targets) await processTarget(target);

  if (findings.length === 0) {
    console.log(`✓ Slop check passed (${filesScanned} file${filesScanned === 1 ? '' : 's'} scanned)`);
    process.exit(0);
  }

  const byFile = new Map();
  for (const f of findings) {
    if (!byFile.has(f.file)) byFile.set(f.file, []);
    byFile.get(f.file).push(f);
  }

  for (const [file, items] of byFile) {
    console.log(`\n${file}`);
    for (const f of items) {
      const tag = f.kind === 'em-dash' ? 'em-dash' : f.kind;
      console.log(`  ${file}:${f.line}  [${tag}]  ${f.match}`);
      console.log(`    ${f.content}`);
    }
  }

  console.log(
    `\n✗ Found ${findings.length} slop instance${findings.length === 1 ? '' : 's'} in ${byFile.size} file${byFile.size === 1 ? '' : 's'} (${filesScanned} files scanned)`
  );
  console.log('  Rewrite the lines flagged above.');

  process.exit(strict || findings.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('check-slop crashed:', err);
  process.exit(2);
});
