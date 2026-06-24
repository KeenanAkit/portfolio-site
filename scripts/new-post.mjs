#!/usr/bin/env node
// scripts/new-post.mjs
//
// Scaffolds a new blog post under src/content/posts/.
//
// Usage:
//   npm run post:new -- "My Post Title"

import { writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { slugify } from './lib/slug.mjs';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');

const title = process.argv.slice(2).join(' ').trim();
if (!title) {
  console.error('Usage: npm run post:new -- "Your Post Title"');
  process.exit(1);
}

const slug = slugify(title);
const today = new Date().toISOString().split('T')[0];
const path = join(ROOT, 'src', 'content', 'posts', `${slug}.mdx`);

if (existsSync(path)) {
  console.error(`Post already exists: ${path}`);
  process.exit(1);
}

const frontmatter = `---
title: "${title.replace(/"/g, '\\"')}"
date: ${today}
excerpt: "TODO: one-line description that lands the point."
tags: []
draft: true
---

TODO: lead with the point. First sentence does the work.

`;

await writeFile(path, frontmatter, 'utf8');
console.log(`Created ${path}`);
console.log(`Draft: true. Remove that flag when ready to publish.`);
