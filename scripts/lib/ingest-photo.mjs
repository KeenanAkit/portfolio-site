// scripts/lib/ingest-photo.mjs
//
// Core ingestion: take a source photo file + extracted metadata, upload the
// binary to Cloudflare R2 (kport-photos bucket), and write the frontmatter
// .md into src/content/photos/. Idempotent: if the slug already exists, skip
// the upload entirely so author edits aren't clobbered.
//
// Shared by the bulk inbox importer (scripts/sync-folder.mjs) and the
// single-photo workflow.
//
// Outputs match the photos content collection schema (src/content.config.ts).
// The style linter scans the generated .md files, so prose stays clean.

import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { slugForFile, slugToTitle } from './slug.mjs';
import { uploadToR2 } from './r2-upload.mjs';
import { urlForKey } from './r2-config.mjs';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..', '..');
const CONTENT_DIR = join(ROOT, 'src', 'content', 'photos');

/**
 * Ingest one photo end-to-end: upload the binary to R2, then write the
 * frontmatter .md pointing at the public R2 URL.
 *
 * @param {Object} opts
 * @param {string} opts.sourcePath  Absolute path to the source image file.
 * @param {Object} opts.meta        Output of extractExif() for that file.
 * @param {boolean} [opts.dryRun]   Don't upload or write; report what would happen.
 * @param {string}  [opts.slugOverride]  Force a specific slug (default: derive from filename).
 * @param {string}  [opts.categoryTag]   Category tag from the inbox subfolder
 *                                        name (e.g. "landscapes"). Merged into
 *                                        the photo's tags ahead of EXIF keywords.
 *
 * @returns {Promise<{ status: 'added' | 'skipped' | 'failed', slug: string, reason?: string, url?: string, bytes?: number, contentPath?: string }>}
 */
export async function ingestPhoto({ sourcePath, meta, dryRun = false, slugOverride, categoryTag }) {
  const slug = slugOverride ?? slugForFile(sourcePath);
  if (!slug) {
    return { status: 'failed', slug: '', reason: 'could not derive a slug from filename' };
  }

  const ext = extname(sourcePath).toLowerCase() || '.jpg';
  const key = `${slug}${ext}`;
  const contentPath = join(CONTENT_DIR, `${slug}.md`);

  // Idempotency: if the frontmatter already exists, this photo has been
  // ingested before. Don't re-upload bytes (R2 PUT is free but pointless)
  // and don't overwrite author caption / location edits.
  if (existsSync(contentPath)) {
    return {
      status: 'skipped',
      slug,
      reason: 'content frontmatter already exists',
      url: urlForKey(key),
      contentPath,
    };
  }

  if (dryRun) {
    return {
      status: 'added',
      slug,
      reason: 'dry-run: would have uploaded to R2 + written frontmatter',
      url: urlForKey(key),
      contentPath,
    };
  }

  // Upload first. If R2 fails, we don't write the frontmatter — a record
  // pointing at a URL that's not actually populated is worse than no record.
  let uploadResult;
  try {
    uploadResult = await uploadToR2({ localPath: sourcePath, key });
  } catch (err) {
    return {
      status: 'failed',
      slug,
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  await mkdir(dirname(contentPath), { recursive: true });
  const frontmatter = buildFrontmatter({ slug, url: uploadResult.url, meta, categoryTag });
  await writeFile(contentPath, frontmatter, 'utf8');

  return {
    status: 'added',
    slug,
    url: uploadResult.url,
    bytes: uploadResult.bytes,
    contentPath,
  };
}

/**
 * Build the .md frontmatter body for a single photo, populating fields the
 * EXIF gave us and leaving slop-clean TODO markers for the rest.
 *
 * Schema reference: src/content.config.ts > photos collection.
 */
function buildFrontmatter({ slug, url, meta, categoryTag }) {
  const date = meta.date ?? new Date();
  // Format from LOCAL components, not toISOString() — converting to UTC first
  // rolls an evening capture in a negative-UTC zone forward a calendar day.
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  const title = sanitizeYamlString(meta.title) ?? slugToTitle(slug);
  const camera = sanitizeYamlString(meta.camera);
  const lens = sanitizeYamlString(meta.lens);
  const aperture = sanitizeYamlString(meta.aperture);
  const shutter = sanitizeYamlString(meta.shutter);
  const iso = meta.iso;
  const focalLength = sanitizeYamlString(meta.focalLength);
  const isFilmScan = meta.isFilmScan === true && meta.scannerBrand;

  // The inbox subfolder name is the authoritative category, so it leads the
  // tag list; EXIF keywords follow. De-dupe case-insensitively so a Lightroom
  // keyword that matches the folder doesn't double up.
  const keywords = Array.isArray(meta.keywords) ? meta.keywords : [];
  const tags = [];
  for (const t of [categoryTag, ...keywords]) {
    const v = sanitizeYamlString(t);
    if (v && !tags.some((existing) => existing.toLowerCase() === v.toLowerCase())) {
      tags.push(v);
    }
  }
  const tagYaml =
    tags.length === 0
      ? '[]'
      : '[' + tags.map((t) => yamlQuote(t)).join(', ') + ']';

  const lines = [];
  lines.push('---');
  lines.push(`title: ${yamlQuote(title)}`);
  lines.push(`date: ${dateStr}`);
  // Location is a human-readable string ("Big Sur, CA"). GPS gets noted in a
  // comment so the author can write the city/region by hand without
  // reverse-geocoding from build.
  if (meta.gps) {
    lines.push(`# GPS: ${meta.gps.lat.toFixed(5)}, ${meta.gps.lon.toFixed(5)}`);
  }
  lines.push(`location: ${yamlQuote('TODO. City and region.')}`);

  if (isFilmScan) {
    // The EXIF "camera" is the scanner, not the actual camera. Flag both
    // camera + film + lens for manual entry so the user can't forget.
    lines.push(
      `camera: ${yamlQuote(`TODO. Film scan via ${meta.scannerBrand}. Set to the actual camera.`)}`
    );
    lines.push(
      `lens: ${yamlQuote('TODO. Lens used to shoot the original frame.')}`
    );
    lines.push(`film: ${yamlQuote('TODO. Film stock, e.g. Portra 400 or HP5+.')}`);
  } else {
    if (camera) {
      lines.push(`camera: ${yamlQuote(camera)}`);
    }
    if (lens) {
      lines.push(`lens: ${yamlQuote(lens)}`);
    }
    // 'film' is manual (analog scans). Not in EXIF for digital captures.
    lines.push(`# film: "Portra 400"  # uncomment for analog scans`);
  }

  if (aperture || shutter || iso != null || focalLength) {
    lines.push('settings:');
    if (aperture) lines.push(`  aperture: ${yamlQuote(aperture)}`);
    if (shutter) lines.push(`  shutter: ${yamlQuote(shutter)}`);
    if (iso != null) lines.push(`  iso: ${iso}`);
    if (focalLength) lines.push(`  focalLength: ${yamlQuote(focalLength)}`);
  }

  lines.push(`tags: ${tagYaml}`);
  lines.push(`image: ${yamlQuote(url)}`);
  lines.push(`caption: ${yamlQuote('TODO. One sentence, where + when + what.')}`);
  lines.push(`featured: false`);
  lines.push('---');
  lines.push('');
  // No body needed; longer descriptions are optional. Leave a blank line so
  // editors see a clean caret position.

  return lines.join('\n');
}

function sanitizeYamlString(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}

/**
 * YAML double-quote a value. Escapes embedded double-quotes and backslashes.
 * Use for every string field so values with colons, hashes, or other YAML
 * special chars don't break parsing.
 */
function yamlQuote(v) {
  const s = String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${s}"`;
}
