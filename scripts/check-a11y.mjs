#!/usr/bin/env node
// scripts/check-a11y.mjs
//
// Runs axe-core against the built site. Boots `astro preview` in the
// background, polls until it responds, runs axe against the main routes,
// then kills the preview process and exits with axe's status code.
//
// Replaces the bare `axe http://localhost:4321 --exit` command, which
// required a separately-running server.
//
// Usage:
//   npm run build && npm run check:a11y
//
// Or as a one-shot:
//   npm run check:a11y:full   (runs build first)

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4321;
const HOST = `http://localhost:${PORT}`;
const ROUTES = [
  '/',
  '/photos',
  '/projects',
  '/blog',
];

const READY_RE = /Local\s+\S+:\d+/;
const READY_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 300;

async function waitForServer(child) {
  // Either match the "Local http://..." line in stdout, or fall back to
  // probing the port. Either way we time out after 30s.
  let resolvedReady = false;

  return new Promise((resolve, reject) => {
    let timer;
    const onData = (data) => {
      const s = data.toString();
      process.stdout.write(s);
      if (!resolvedReady && READY_RE.test(s)) {
        resolvedReady = true;
        clearTimeout(timer);
        resolve();
      }
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', onData);

    timer = setTimeout(() => {
      if (!resolvedReady) reject(new Error('astro preview did not become ready within 30s'));
    }, READY_TIMEOUT_MS);

    child.on('exit', (code) => {
      if (!resolvedReady) reject(new Error(`astro preview exited early with code ${code}`));
    });
  });
}

async function probeReady() {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(HOST + '/', { signal: AbortSignal.timeout(1000) });
      if (r.ok) return;
    } catch {
      // Server not up yet; loop.
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error('astro preview port never opened');
}

async function runAxe(route) {
  return new Promise((resolve, reject) => {
    const args = [HOST + route, '--exit', '--tags', 'wcag2a,wcag2aa'];
    const proc = spawn('npx', ['axe', ...args], {
      stdio: 'inherit',
      shell: false,
    });
    proc.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`axe failed for ${route} with code ${code}`));
    });
    proc.on('error', reject);
  });
}

async function main() {
  // Start `astro preview` on the standard port (4321). If something else is
  // already there (e.g. a dev server), the preview will pick a different port
  // and we'd miss it; warn loud.
  console.log('Starting astro preview...');
  const preview = spawn('npx', ['astro', 'preview', '--port', String(PORT)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });

  let killed = false;
  const cleanup = () => {
    if (killed) return;
    killed = true;
    try {
      preview.kill('SIGTERM');
    } catch {
      /* noop */
    }
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => {
    cleanup();
    process.exit(130);
  });

  try {
    // Race: either the log line matches OR the port opens.
    await Promise.race([waitForServer(preview), probeReady()]);
    console.log(`Server up at ${HOST}. Running axe against ${ROUTES.length} routes...`);

    let failures = 0;
    for (const route of ROUTES) {
      console.log(`\n--- ${route} ---`);
      try {
        await runAxe(route);
        console.log(`✓ ${route}`);
      } catch (err) {
        failures++;
        console.error(`✗ ${route}: ${err.message}`);
      }
    }

    if (failures > 0) {
      console.error(`\n${failures} route(s) failed accessibility checks`);
      cleanup();
      process.exit(1);
    }

    console.log('\n✓ All routes passed accessibility checks');
    cleanup();
    process.exit(0);
  } catch (err) {
    console.error(err);
    cleanup();
    process.exit(2);
  }
}

main();
