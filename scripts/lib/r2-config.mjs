// scripts/lib/r2-config.mjs
//
// One source of truth for the R2 bucket name and the public URL prefix used
// to serve uploaded photos. Every script that touches R2 imports from here so
// "kport-photos" and "https://photos.keenanakit.com" never get hard-coded in
// more than one place.
//
// Env overrides let CI / staging / a fork point at a different bucket
// without code changes:
//   KPORT_R2_BUCKET=kport-photos-staging
//   KPORT_R2_PUBLIC_BASE=https://photos-staging.keenanakit.com

/** R2 bucket name. Matches the bucket Keenan created in the dashboard. */
export const R2_BUCKET = process.env.KPORT_R2_BUCKET ?? 'kport-photos';

/** Public URL prefix for objects in the bucket. The custom domain binding in
 *  the Cloudflare dashboard maps this host onto the bucket. */
export const R2_PUBLIC_BASE =
  process.env.KPORT_R2_PUBLIC_BASE ?? 'https://photos.keenanakit.com';

/** Build the public URL for an R2 object key (e.g. "big-sur-2023.jpg"). */
export function urlForKey(key) {
  return `${R2_PUBLIC_BASE}/${key}`;
}
