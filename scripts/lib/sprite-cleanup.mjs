// scripts/lib/sprite-cleanup.mjs
//
// Recipe implementations for the sprite ingest pipeline. Each function
// takes a source PNG path + target [width, height] and returns a Buffer
// ready to write as PNG.
//
// Common operations:
//   - floodFillCorners: 4-corner backdrop strip → alpha 0
//   - floodFillCenter:  inner cutout strip (for frames with photo holes)
//   - trim: crop transparent padding around the subject
//   - downscale: nearest-neighbor resize to preserve pixel edges
//   - quantize: palette PNG (8-bit indexed) for tiny file size
//
// Tuned for the cozy palette (cream / sage / oak / brass / walnut). If a
// sprite is generated against a wildly different palette, the flood-fill
// tolerance and quantize colors may need a one-off override.

import sharp from 'sharp';

/** Squared Euclidean color distance threshold for flood-fill seeding.
 *  130² catches anti-aliased edge gradients without bleeding into adjacent
 *  subject colors that share hue with the backdrop. */
const FLOOD_DISTANCE_SQ = 130 * 130;

/** PNG palette quantization options. 32 colors covers the cozy palette plus
 *  a little headroom for the AI's gilt-gold gradients. Anything tighter
 *  starts losing the brass-highlight detail. */
const QUANTIZE_OPTS = {
  palette: true,
  quality: 90,
  effort: 8,
  colors: 32,
  compressionLevel: 9,
};

/** Stack-based 4-way flood-fill. Reaches every pixel "close enough" in
 *  color to the seed and sets alpha 0. Mutates the buffer in place. */
function flood(buf, w, h, sx, sy, visited) {
  const seedIdx = (sy * w + sx) * 4;
  const sr = buf[seedIdx];
  const sg = buf[seedIdx + 1];
  const sb = buf[seedIdx + 2];

  const stack = [sx, sy];
  while (stack.length > 0) {
    const y = stack.pop();
    const x = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const pi = y * w + x;
    if (visited[pi]) continue;
    const ri = pi * 4;
    const dr = buf[ri] - sr;
    const dg = buf[ri + 1] - sg;
    const db = buf[ri + 2] - sb;
    if (dr * dr + dg * dg + db * db > FLOOD_DISTANCE_SQ) continue;
    visited[pi] = 1;
    buf[ri + 3] = 0;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
}

/** Load a PNG as raw RGBA with dims. */
async function loadRaw(srcPath) {
  const { data, info } = await sharp(srcPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { buffer: Buffer.from(data), width: info.width, height: info.height };
}

/** Re-wrap a raw RGBA buffer in a sharp pipeline for further ops. */
function fromRaw({ buffer, width, height }) {
  return sharp(buffer, { raw: { width, height, channels: 4 } });
}

/** Strip backdrop from 4 corners. */
function stripCorners({ buffer, width, height }) {
  const visited = new Uint8Array(width * height);
  flood(buffer, width, height, 0, 0, visited);
  flood(buffer, width, height, width - 1, 0, visited);
  flood(buffer, width, height, 0, height - 1, visited);
  flood(buffer, width, height, width - 1, height - 1, visited);
  return { buffer, width, height };
}

/** Strip the center cutout too (for frames). Seeds from the geometric
 *  center; if the center is non-backdrop (e.g. already opaque), no-op. */
function stripCornersAndCenter(raw) {
  const r = stripCorners(raw);
  const visited = new Uint8Array(r.width * r.height);
  flood(r.buffer, r.width, r.height, Math.floor(r.width / 2), Math.floor(r.height / 2), visited);
  return r;
}

/** Resize with nearest-neighbor (preserves pixel edges). Returns a Buffer
 *  ready for further pipeline ops. */
async function downscale(raw, [tw, th]) {
  return fromRaw(raw)
    .resize(tw, th, { kernel: 'nearest', fit: 'fill' })
    .png()
    .toBuffer();
}

/** Trim transparent padding around the subject. Returns a sharp pipeline. */
function trim(rawBuffer) {
  return sharp(rawBuffer).trim({ threshold: 1 });
}

/** Quantize to palette PNG. Writes the final file. */
async function quantizeToFile(pipeline, outPath) {
  await pipeline.png(QUANTIZE_OPTS).toFile(outPath);
}

// ---------- Public recipe entry points ----------

/** No background strip; trim away uniform padding around the subject (the
 *  AI tends to center subjects on a generously-padded canvas), then
 *  downscale + quantize. For wall / floor tiles that should fill the
 *  output dimensions edge-to-edge. */
export async function runOpaqueTile(srcPath, target, outPath) {
  // sharp.trim() with a threshold auto-detects the background color from
  // the corners and crops everything that matches within tolerance. 40
  // catches the AI's slight color variations in "uniform" padding.
  const trimmed = await sharp(srcPath).trim({ threshold: 40 }).png().toBuffer();
  const raw = {
    buffer: (await sharp(trimmed).ensureAlpha().raw().toBuffer({ resolveWithObject: true })).data,
    width: (await sharp(trimmed).metadata()).width,
    height: (await sharp(trimmed).metadata()).height,
  };
  const resized = await downscale(raw, target);
  await quantizeToFile(sharp(resized), outPath);
}

/** Corner-only flood strip + downscale + quantize. For props with one
 *  enclosed subject and a solid backdrop. */
export async function runCornerStrip(srcPath, target, outPath) {
  const raw = await loadRaw(srcPath);
  const stripped = stripCorners(raw);
  const resized = await downscale(stripped, target);
  await quantizeToFile(sharp(resized), outPath);
}

/** Corners + center flood strip. For frames where the cutout should also
 *  be transparent so a photo / element can show through. */
export async function runFrame(srcPath, target, outPath) {
  const raw = await loadRaw(srcPath);
  const stripped = stripCornersAndCenter(raw);
  const resized = await downscale(stripped, target);
  await quantizeToFile(sharp(resized), outPath);
}

/** Corner strip + trim padding + downscale + quantize. For props that
 *  benefit from edge-cropping (small isolated subjects with lots of
 *  backdrop padding). */
export async function runProp(srcPath, target, outPath) {
  const raw = await loadRaw(srcPath);
  const stripped = stripCorners(raw);
  // Round-trip through PNG so sharp's trim can find the alpha edges.
  const strippedPng = await fromRaw(stripped).png().toBuffer();
  const trimmed = await trim(strippedPng).png().toBuffer();
  const resized = await sharp(trimmed)
    .resize(target[0], target[1], { kernel: 'nearest', fit: 'fill' })
    .png()
    .toBuffer();
  await quantizeToFile(sharp(resized), outPath);
}

/** Dispatch by recipe name. */
export async function runRecipe(recipe, srcPath, target, outPath) {
  switch (recipe) {
    case 'opaque-tile':
      return runOpaqueTile(srcPath, target, outPath);
    case 'corner-strip':
      return runCornerStrip(srcPath, target, outPath);
    case 'frame':
      return runFrame(srcPath, target, outPath);
    case 'prop':
      return runProp(srcPath, target, outPath);
    default:
      throw new Error(`unknown recipe: ${recipe}`);
  }
}
