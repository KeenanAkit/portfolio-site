#!/usr/bin/env node
// scripts/make-og-default.mjs
//
// Generates public/og-default.png from an inline SVG. Used as the fallback
// link-preview image for pages without their own hero (blog index, projects
// index, /). Re-run this script when the brand changes:
//
//   node scripts/make-og-default.mjs

import sharp from 'sharp';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const OUTPUT = resolve(ROOT, 'public', 'og-default.png');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <pattern id="pixel" x="0" y="0" width="2" height="2" patternUnits="userSpaceOnUse">
      <rect width="1" height="1" fill="rgba(255,255,255,0.04)"/>
    </pattern>
  </defs>

  <!-- Win98 teal background -->
  <rect width="1200" height="630" fill="#008080"/>
  <rect width="1200" height="630" fill="url(#pixel)"/>

  <!-- Window chrome -->
  <g transform="translate(120 100)">
    <!-- Window outer -->
    <rect x="0" y="0" width="960" height="430" fill="#c0c0c0"/>
    <!-- Top bevel -->
    <rect x="0" y="0" width="960" height="2" fill="#ffffff"/>
    <rect x="0" y="0" width="2" height="430" fill="#ffffff"/>
    <rect x="0" y="428" width="960" height="2" fill="#404040"/>
    <rect x="958" y="0" width="2" height="430" fill="#404040"/>

    <!-- Title bar -->
    <rect x="4" y="4" width="952" height="28" fill="#0a246a"/>
    <rect x="4" y="4" width="952" height="28" fill="url(#titlebar-grad)" opacity="0.7"/>

    <!-- Close / min / max boxes -->
    <rect x="894" y="9" width="18" height="18" fill="#c0c0c0" stroke="#000" stroke-width="1"/>
    <rect x="916" y="9" width="18" height="18" fill="#c0c0c0" stroke="#000" stroke-width="1"/>
    <rect x="938" y="9" width="18" height="18" fill="#c0c0c0" stroke="#000" stroke-width="1"/>
    <text x="947" y="23" font-family="Tahoma, Arial" font-size="14" font-weight="700" fill="#000" text-anchor="middle">×</text>

    <!-- Title text -->
    <text x="16" y="24" font-family="Tahoma, Arial, sans-serif" font-size="14" font-weight="700" fill="#ffffff">KPort.exe</text>

    <!-- Body content -->
    <text x="60" y="160" font-family="Tahoma, Arial, sans-serif" font-size="86" font-weight="700" fill="#000000" letter-spacing="-2">Keenan Akit</text>
    <text x="62" y="220" font-family="Tahoma, Arial, sans-serif" font-size="28" font-weight="400" fill="#333333">Photography &amp; side projects</text>

    <!-- Beveled button -->
    <g transform="translate(60 290)">
      <rect x="0" y="0" width="180" height="46" fill="#c0c0c0"/>
      <rect x="0" y="0" width="180" height="2" fill="#ffffff"/>
      <rect x="0" y="0" width="2" height="46" fill="#ffffff"/>
      <rect x="0" y="44" width="180" height="2" fill="#404040"/>
      <rect x="178" y="0" width="2" height="46" fill="#404040"/>
      <text x="90" y="30" font-family="Tahoma, Arial" font-size="16" fill="#000" text-anchor="middle">keenanakit.com</text>
    </g>

    <!-- Footer note -->
    <text x="60" y="395" font-family="Tahoma, Arial, sans-serif" font-size="14" fill="#666666">Personal site. Windows 98 on desktop, photo-first on mobile.</text>
  </g>

  <!-- Bottom-right decoration: ::1998 -->
  <text x="1140" y="595" font-family="'Lucida Console', 'Courier New', monospace" font-size="14" fill="rgba(255,255,255,0.4)" text-anchor="end">// 1998</text>
</svg>`;

await sharp(Buffer.from(svg))
  .png({ compressionLevel: 9 })
  .toFile(OUTPUT);

console.log(`Wrote ${OUTPUT}`);
