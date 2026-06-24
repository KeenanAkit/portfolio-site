// scripts/lib/r2-upload.mjs
//
// Thin wrapper around `wrangler r2 object put` for uploading photo binaries
// to the kport-photos bucket. Used by the ingest pipeline so every script
// that adds a photo (one-off skill, bulk sync, future Lightroom API) speaks
// to R2 the same way.
//
// Why shell out to wrangler instead of the AWS S3 SDK:
//   - Already an authenticated dependency. `wrangler login` covers it.
//   - No additional auth env vars to manage (S3 SDK would need access keys).
//   - Cloudflare-native; correct headers, content-type sniff, multipart, etc.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { stat } from 'node:fs/promises';
import { extname } from 'node:path';

import { R2_BUCKET, urlForKey } from './r2-config.mjs';

const exec = promisify(execFile);

/**
 * Upload one local file to R2 under the given object key.
 *
 * Uses execFile (not exec) so the file path is passed as an argv element and
 * never goes through the shell — no quoting required for spaces or special
 * characters in the source path.
 *
 * @param {Object} opts
 * @param {string} opts.localPath  Absolute path to the file on disk.
 * @param {string} opts.key        R2 object key, e.g. "big-sur-2023.jpg".
 * @param {boolean} [opts.dryRun]  If true, report what would happen, don't upload.
 * @param {boolean} [opts.overwrite] If true, allow replacing an existing key. Default false.
 * @returns {Promise<{ url: string, bytes: number, skipped?: boolean }>}
 */
export async function uploadToR2({
  localPath,
  key,
  dryRun = false,
  overwrite = false,
}) {
  const s = await stat(localPath);
  const bytes = s.size;
  const url = urlForKey(key);

  if (dryRun) {
    return { url, bytes, skipped: true };
  }

  const contentType = contentTypeFor(key);

  const args = [
    'wrangler',
    'r2',
    'object',
    'put',
    `${R2_BUCKET}/${key}`,
    '--file',
    localPath,
    '--content-type',
    contentType,
    '--remote',
  ];

  // Without --overwrite, wrangler errors if the key already exists; that's
  // the safe default — accidental re-runs shouldn't silently replace photos.
  // The ingest layer makes its own idempotency decision before we get here.
  if (overwrite) args.push('--overwrite');

  try {
    // --no-install: fail fast if wrangler isn't present rather than letting
    // npx prompt/auto-install and hang in a non-interactive shell.
    await exec('npx', ['--no-install', ...args], { maxBuffer: 10 * 1024 * 1024 });
  } catch (err) {
    // Surface wrangler's stderr to the caller — usually the most useful
    // signal (auth failed, key exists, bucket missing, etc.).
    const stderr = err && typeof err === 'object' && 'stderr' in err ? err.stderr : '';
    throw new Error(
      `wrangler upload failed for ${key}: ${stderr || err.message}`
    );
  }

  return { url, bytes };
}

/**
 * Map a filename extension to a sensible HTTP Content-Type. Wrangler will
 * sniff if we don't pass one, but explicit is cheap insurance.
 */
function contentTypeFor(key) {
  const ext = extname(key).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.heic':
      return 'image/heic';
    case '.tif':
    case '.tiff':
      return 'image/tiff';
    case '.webp':
      return 'image/webp';
    case '.avif':
      return 'image/avif';
    default:
      return 'application/octet-stream';
  }
}
