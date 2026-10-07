#!/usr/bin/env node
/**
 * `npm start` entry point.
 *
 * The React UI is a build artifact and is deliberately not committed, so a fresh
 * download needs one build step. This script does it for you: if web/dist is missing
 * (or stale), it builds it, then boots the API server (which serves the built UI).
 *
 * Falls back gracefully: if the frontend dependencies are missing it still starts the
 * API and tells you exactly what to run — a server that refuses to boot because an
 * optional build step failed would be a worse failure mode than one that explains itself.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distIndex = path.join(ROOT, 'web', 'dist', 'index.html');
const viteBin = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
const hasVite = fs.existsSync(viteBin);

function newestSourceMtime(dir, newest = 0) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return newest;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', '.vite'].includes(entry.name)) continue;
      newest = newestSourceMtime(full, newest);
    } else {
      const stat = fs.statSync(full);
      if (stat.mtimeMs > newest) newest = stat.mtimeMs;
    }
  }
  return newest;
}

function needsBuild() {
  if (!fs.existsSync(distIndex)) return 'the UI has not been built yet';
  const built = fs.statSync(distIndex).mtimeMs;
  const sources = newestSourceMtime(path.join(ROOT, 'web', 'src'));
  if (sources > built) return 'the UI source is newer than the last build';
  return null;
}

const reason = needsBuild();

if (reason && hasVite) {
  console.log(`\n  Forge: ${reason} — building the frontend now (about 10 seconds)…\n`);
  const built = spawnSync(process.execPath, [viteBin, 'build'], {
    cwd: path.join(ROOT, 'web'),
    stdio: 'inherit',
    env: process.env,
  });
  if (built.status !== 0) {
    console.error('\n  Forge: the frontend build failed. The API will still start so you can inspect it.\n');
  }
} else if (reason && !hasVite) {
  console.error(`
  Forge: the frontend is not built and its dependencies are not installed.

      npm install          # installs the server and web workspaces
      npm start            # this script then builds the UI and starts everything

  The API will start now regardless; open /api/system/capabilities to check it.
`);
}

// Hand off to the real server, in-process-adjacent so signals propagate cleanly.
const server = spawn(process.execPath, [path.join(ROOT, 'server', 'src', 'index.js')], {
  stdio: 'inherit',
  env: process.env,
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.kill(signal));
}
server.on('exit', (code) => process.exit(code ?? 0));
