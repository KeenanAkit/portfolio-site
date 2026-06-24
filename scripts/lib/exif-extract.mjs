// scripts/lib/exif-extract.mjs
//
// Extract photo metadata from a JPG (or HEIC, TIFF, RAW) using `exifr`.
// Normalizes the messy EXIF + XMP namespaces into the shape the photos
// content collection expects (see src/content.config.ts).
//
// Why exifr: pure-JS, handles JPG/HEIC/TIFF/RAW + XMP, no exiftool install
// required, ~80KB. Faster than shelling out for batch ingestion.

import exifr from 'exifr';

/**
 * Read EXIF + XMP from a file path and return a normalized metadata record.
 *
 * The returned object roughly mirrors the photos collection frontmatter, but
 * with everything optional (the ingest writer fills sane defaults / TODOs).
 *
 *   {
 *     date:       Date | null,           // DateTimeOriginal
 *     camera:     string | null,         // 'Canon EOS R5'
 *     lens:       string | null,         // 'RF 35mm F1.8 MACRO IS STM'
 *     aperture:   string | null,         // 'f/1.8'
 *     shutter:    string | null,         // '1/250'
 *     iso:        number | null,         // 400
 *     focalLength:string | null,         // '35mm'
 *     gps:        { lat: number, lon: number } | null,
 *     keywords:   string[],              // XMP subject / dc:subject
 *     title:      string | null,         // XMP title / dc:title
 *     caption:    string | null,         // XMP description / dc:description
 *     copyright:  string | null,         // EXIF/XMP rights
 *     orientation:number | null,         // 1..8
 *   }
 */
export async function extractExif(filePath) {
  const raw = await exifr.parse(filePath, {
    tiff: true,
    exif: true,
    gps: true,
    xmp: true,
    iptc: true,
    icc: false,
    // Pull a wider set of fields than the defaults; exifr's defaults skip
    // some XMP namespaces we want for keywords + title.
    pick: undefined,
  });

  if (!raw) {
    return emptyMeta();
  }

  const camera = pickCamera(raw);
  const scannerBrand = detectFilmScanner(camera);

  return {
    date: pickDate(raw),
    camera,
    lens: pickLens(raw),
    aperture: pickAperture(raw),
    shutter: pickShutter(raw),
    iso: pickISO(raw),
    focalLength: pickFocalLength(raw),
    gps: pickGPS(raw),
    keywords: pickKeywords(raw),
    title: pickXmpString(raw, ['title', 'Title']),
    caption:
      pickXmpString(raw, ['description', 'Description', 'ImageDescription']) ??
      pickXmpString(raw, ['Caption-Abstract']),
    copyright: pickXmpString(raw, ['Copyright', 'Rights', 'rights']),
    orientation:
      typeof raw.Orientation === 'number' ? raw.Orientation : null,
    /**
     * When the EXIF "camera" string matches a known film scanner (e.g. a
     * Fuji SP-3000 or Noritsu Koki HS-1800), this is the cleaned-up scanner
     * brand. The ingester uses it to flag the camera + film fields as
     * needing manual input, since film scans lose the original camera info.
     */
    scannerBrand,
    /** Convenience boolean for `if (meta.isFilmScan)` callsites. */
    isFilmScan: scannerBrand !== null,
  };
}

// ---------- film scanner detection ----------

/**
 * Known lab-grade and prosumer film scanners. When the EXIF Make+Model on
 * a JPG matches one of these, the file is almost certainly a scan of an
 * analog negative or slide. The "camera" EXIF field is the scanner's name,
 * NOT the camera that originally exposed the film — so the ingester should
 * flag both `camera` and `film` for manual entry.
 *
 * Patterns are case-insensitive substring matches against the combined
 * Make+Model string from pickCamera().
 *
 * Add more here as you encounter scanners in the wild. Order matters:
 * more-specific patterns should come before more-generic ones.
 */
const FILM_SCANNERS = [
  // Fuji Frontier / SP series — lab gold standard
  { pattern: /SP-?3000|FRONTIER/i, brand: 'Fuji Frontier SP-3000' },
  // Noritsu Koki HS-1800 / HS-1800S / EZ Controller (their lab software)
  { pattern: /NORITSU/i, brand: 'Noritsu HS-1800' },
  // EPSON Perfection V550 / V600 / V700 / V750 / V800 / V850 (flatbed)
  { pattern: /EPSON\s*Perfection/i, brand: 'Epson Perfection' },
  // Plustek OpticFilm 7000 / 8200 / 120 series
  { pattern: /Plustek|OpticFilm/i, brand: 'Plustek OpticFilm' },
  // Nikon Super CoolScan LS-5000 / LS-9000 (legendary, discontinued)
  { pattern: /CoolScan|Super\s*CoolScan|Nikon\s*LS-/i, brand: 'Nikon Super CoolScan' },
  // Hasselblad Flextight / Imacon Flextight (high-end)
  { pattern: /Flextight|Imacon/i, brand: 'Hasselblad Flextight' },
  // Minolta DiMAGE Scan Multi / Dual / Elite
  { pattern: /DiMAGE\s*Scan/i, brand: 'Minolta DiMAGE Scan' },
  // Reflecta variants (Pacific Image rebrands)
  { pattern: /Reflecta|Pacific\s*Image/i, brand: 'Reflecta' },
  // Canon CanoScan 8800F / 9000F (consumer flatbed with film holders)
  { pattern: /CanoScan\s*\d+F/i, brand: 'Canon CanoScan' },
];

function detectFilmScanner(makeModelStr) {
  if (!makeModelStr) return null;
  for (const { pattern, brand } of FILM_SCANNERS) {
    if (pattern.test(makeModelStr)) return brand;
  }
  return null;
}

// Export for tests / external callers.
export { detectFilmScanner };

// ---------- field pickers ----------

function emptyMeta() {
  return {
    date: null,
    camera: null,
    lens: null,
    aperture: null,
    shutter: null,
    iso: null,
    focalLength: null,
    gps: null,
    keywords: [],
    title: null,
    caption: null,
    copyright: null,
    orientation: null,
    scannerBrand: null,
    isFilmScan: false,
  };
}

function pickDate(raw) {
  // Prefer DateTimeOriginal (when the shutter fired). Fall back to CreateDate
  // (when the file was created — usually the same), then ModifyDate.
  const d = raw.DateTimeOriginal ?? raw.CreateDate ?? raw.ModifyDate;
  if (!d) return null;
  if (d instanceof Date) return Number.isNaN(d.getTime()) ? null : d;
  // Some namespaces return strings like '2026:03:14 17:42:08'. Normalize.
  const s = String(d).replace(
    /^(\d{4}):(\d{2}):(\d{2})/,
    '$1-$2-$3'
  );
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pickCamera(raw) {
  const make = sanitize(raw.Make);
  const model = sanitize(raw.Model);
  if (!make && !model) return null;
  if (!make) return model;
  if (!model) return make;
  // Avoid 'Canon Canon EOS R5' duplication; some cameras put the brand in
  // both Make and Model.
  if (model.toLowerCase().startsWith(make.toLowerCase())) return model;
  return `${make} ${model}`;
}

function pickLens(raw) {
  const lens =
    sanitize(raw.LensModel) ??
    sanitize(raw.Lens) ??
    sanitize(raw.LensInfo);
  if (!lens) return null;
  const make = sanitize(raw.LensMake);
  if (!make || lens.toLowerCase().includes(make.toLowerCase())) return lens;
  return `${make} ${lens}`;
}

function pickAperture(raw) {
  const f = numeric(raw.FNumber ?? raw.ApertureValue);
  if (f === null) return null;
  // Common photographer rendering. Quote so YAML treats it as a string.
  return `f/${formatFloat(f)}`;
}

function pickShutter(raw) {
  const t = numeric(raw.ExposureTime ?? raw.ShutterSpeedValue);
  // <= 0 guards malformed EXIF (e.g. ExposureTime 0), which would otherwise
  // divide to "1/Infinity" below.
  if (t === null || t <= 0) return null;
  if (t >= 1) return `${formatFloat(t)}s`;
  // 0.004 → 1/250. Round denominator to integer; nearest classic stop.
  const denom = Math.round(1 / t);
  return `1/${denom}`;
}

function pickISO(raw) {
  const iso = numeric(raw.ISO ?? raw.ISOSpeedRatings ?? raw.PhotographicSensitivity);
  if (iso === null) return null;
  return Math.round(iso);
}

function pickFocalLength(raw) {
  const mm = numeric(raw.FocalLength ?? raw.FocalLengthIn35mmFormat);
  if (mm === null) return null;
  return `${formatFloat(mm)}mm`;
}

function pickGPS(raw) {
  // exifr parses GPS into raw.latitude / raw.longitude when gps: true.
  const lat = numeric(raw.latitude ?? raw.GPSLatitude);
  const lon = numeric(raw.longitude ?? raw.GPSLongitude);
  if (lat === null || lon === null) return null;
  return { lat, lon };
}

function pickKeywords(raw) {
  // XMP keywords live in several places depending on the writer. Try each
  // common one and merge unique values.
  const candidates = [
    raw.subject,
    raw.Subject,
    raw.Keywords,
    raw['dc:subject'],
    raw.HierarchicalSubject,
  ];
  const flat = [];
  for (const c of candidates) {
    if (!c) continue;
    if (Array.isArray(c)) flat.push(...c);
    else if (typeof c === 'string') flat.push(...c.split(/[,;]\s*/));
  }
  const seen = new Set();
  const out = [];
  for (const k of flat) {
    const s = sanitize(k);
    if (!s) continue;
    const lower = s.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(s);
  }
  return out;
}

function pickXmpString(raw, fields) {
  for (const f of fields) {
    const v = raw[f];
    if (v == null) continue;
    if (typeof v === 'string') {
      const s = sanitize(v);
      if (s) return s;
    } else if (typeof v === 'object') {
      // XMP language-alternative arrays sometimes return { 'x-default': '...' }
      const def = v['x-default'] ?? v['x-default-text'] ?? Object.values(v)[0];
      const s = sanitize(def);
      if (s) return s;
    }
  }
  return null;
}

// ---------- small helpers ----------

function sanitize(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}

function numeric(v) {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatFloat(n) {
  // Trim trailing zeros and unneeded decimal point.
  // 1.8 → '1.8', 50 → '50', 35.0 → '35'.
  return Number(n.toFixed(2)).toString();
}
