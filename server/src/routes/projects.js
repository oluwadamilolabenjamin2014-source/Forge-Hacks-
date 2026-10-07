/**
 * Vibe coding: generate a project, write it to disk, run its test suite for real,
 * then deploy it as its own OS process behind Forge's preview proxy.
 */
import express from 'express';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import config from '../config.js';
import { db, id, nowIso, persist, audit } from '../store.js';
import { generateApp, writeProject, specFromPrompt, ENTITY_KEYS } from '../lib/appGenerator.js';
import { runSuite, listFiles } from '../lib/agent.js';
import { unifiedDiff } from '../lib/patch.js';

const router = express.Router();

function projectBySlug(slug) {
  return db.projects.find((p) => p.slug === slug);
}

function isAlive(proc) {
  return proc && proc.exitCode === null && !proc.killed;
}

async function freePort(preferred) {
  const tryBind = (port) =>
    new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => server.close(() => resolve(true)));
      server.listen(port, '0.0.0.0');
    });
  if (await tryBind(preferred)) return preferred;
  for (let port = preferred + 1; port < preferred + 60; port += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (await tryBind(port)) return port;
  }
  return 0;
}

router.get('/', (_req, res) => {
  res.json(
    db.projects.map((p) => ({
      ...p,
      running: isAlive(processes.get(p.slug)),
      uptimeSeconds: processes.get(p.slug)?.startedAt ? Math.round((Date.now() - processes.get(p.slug).startedAt) / 1000) : 0,
    })),
  );
});

router.get('/entities', (_req, res) => {
  res.json({ entities: ENTITY_KEYS.length, keys: ENTITY_KEYS });
});

/** Dry run: what would Forge build? Useful before generating anything. */
router.post('/plan', (req, res) => {
  const { prompt, name } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt_required' });
  const spec = specFromPrompt(String(prompt), { name });
  res.json({
    spec,
    matchedLibraryEntity: Boolean(spec.entityKey),
    files: ['package.json', 'server.js', 'public/index.html', 'public/app.js', 'public/styles.css', 'test/api.test.js', 'README.md', `data/${spec.collection}.json`],
    note: spec.entityKey
      ? `Matched the curated "${spec.entityKey}" model. Any field list you typed overrides it.`
      : 'No curated model matched, so Forge inferred the data shape from your wording. Open server.js afterwards and edit FIELDS — the UI reads the same list.',
  });
});

router.post('/', async (req, res) => {
  const { prompt, name } = req.body || {};
  if (!prompt || !String(prompt).trim()) return res.status(400).json({ error: 'prompt_required' });
  try {
    const { spec, files, seedCount } = generateApp(String(prompt), { name });
    const dir = writeProject(spec, files);
    const suite = await runSuite(dir);

    const project = {
      id: id('proj'),
      slug: spec.slug,
      name: spec.name,
      description: spec.description,
      prompt: String(prompt).slice(0, 400),
      entityKey: spec.entityKey,
      collection: spec.collection,
      fields: spec.fields,
      port: spec.port,
      dir,
      fileCount: files.length,
      files: files.map((f) => ({ path: f.path, language: f.language, bytes: Buffer.byteLength(f.content) })),
      seedCount,
      createdAt: nowIso(),
      tests: { runner: suite.runner, passed: suite.passed, failed: suite.failed, ok: suite.ok, verifiedAt: nowIso() },
      deployed: false,
      url: null,
    };
    db.projects = db.projects.filter((p) => p.slug !== spec.slug);
    db.projects.unshift(project);
    persist();
    audit({ action: 'project.generate', slug: spec.slug, files: files.length, tests: `${suite.passed}/${suite.passed + suite.failed}` });

    res.status(201).json({
      project,
      spec,
      testRun: {
        runner: suite.runner,
        passed: suite.passed,
        failed: suite.failed,
        ok: suite.ok,
        failing: suite.failing.slice(0, 6),
        output: suite.stdout.slice(-2500),
        verdict: suite.ok
          ? `Generated and verified: ${suite.passed} integration tests passed against the real server (npm test, node:test).`
          : `${suite.failed} test(s) failed — reported rather than hidden. Open the files and inspect the failing assertions.`,
      },
      next: [
        `POST /api/projects/${spec.slug}/deploy to run it as its own process`,
        `GET  /api/projects/${spec.slug}/files to read the generated source`,
      ],
    });
  } catch (err) {
    res.status(500).json({ error: 'generation_failed', detail: err.message });
  }
});

router.get('/:slug', async (req, res) => {
  const project = projectBySlug(req.params.slug);
  if (!project) return res.status(404).json({ error: 'not_found' });
  const files = await listFiles(project.dir).catch(() => []);
  const proc = processes.get(project.slug);
  res.json({ ...project, running: isAlive(proc), fileList: files, logs: proc?.logs?.slice(-60) || [] });
});

router.get('/:slug/files', async (req, res) => {
  const project = projectBySlug(req.params.slug);
  if (!project) return res.status(404).json({ error: 'not_found' });
  const files = await listFiles(project.dir);
  res.json({
    slug: project.slug,
    files: files.map((rel) => {
      const abs = path.join(project.dir, rel);
      return { path: rel, bytes: fs.statSync(abs).size };
    }),
  });
});

router.get('/:slug/file', async (req, res) => {
  const project = projectBySlug(req.params.slug);
  if (!project) return res.status(404).json({ error: 'not_found' });
  const rel = String(req.query.path || '');
  const abs = path.resolve(project.dir, rel);
  if (!abs.startsWith(path.resolve(project.dir) + path.sep)) return res.status(403).json({ error: 'forbidden' });
  try {
    const content = await fsp.readFile(abs, 'utf8');
    res.json({ path: rel, content, lines: content.split('\n').length });
  } catch {
    res.status(404).json({ error: 'not_found', detail: `${rel} is not in this project` });
  }
});

router.post('/:slug/test', async (req, res) => {
  const project = projectBySlug(req.params.slug);
  if (!project) return res.status(404).json({ error: 'not_found' });
  const suite = await runSuite(project.dir);
  project.tests = { runner: suite.runner, passed: suite.passed, failed: suite.failed, ok: suite.ok, verifiedAt: nowIso() };
  persist();
  audit({ action: 'project.test', slug: project.slug, passed: suite.passed, failed: suite.failed });
  res.json({
    ...suite,
    verdict: suite.ok ? `Green: ${suite.passed} passing, 0 failing (runner: ${suite.runner}).` : `${suite.failed} failing.`,
  });
});

const processes = new Map();

router.post('/:slug/deploy', async (req, res) => {
  const project = projectBySlug(req.params.slug);
  if (!project) return res.status(404).json({ error: 'not_found' });
  const existing = processes.get(project.slug);
  if (isAlive(existing)) {
    // Same response shape as a fresh deploy — including a live health check, because
    // "the process exists" and "the app answers" are different claims.
    let health = null;
    try {
      const response = await fetch(`http://127.0.0.1:${project.port}/api/health`);
      if (response.ok) health = await response.json();
    } catch {
      /* fall through with health = null */
    }
    return res.json({
      deployed: Boolean(health),
      alreadyRunning: true,
      port: project.port,
      url: `/generated/${project.slug}/`,
      pid: existing.pid,
      health,
      logs: existing.logs?.slice(-40) || [],
      verdict: health
        ? `Already running (pid ${existing.pid}) and healthy on port ${project.port} — reusing it rather than starting a second copy.`
        : `A process for ${project.slug} exists (pid ${existing.pid}) but /api/health is not answering. Stop it and deploy again.`,
    });
  }

  const port = await freePort(project.port || 4200);
  const logs = [];
  const child = spawn(process.execPath, ['server.js'], {
    cwd: project.dir,
    env: { PATH: process.env.PATH, HOME: project.dir, PORT: String(port), NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => logs.push(`[out] ${d.toString().trim()}`));
  child.stderr.on('data', (d) => logs.push(`[err] ${d.toString().trim()}`));
  child.on('exit', (code, signal) => logs.push(`[exit] code=${code} signal=${signal}`));
  child.startedAt = Date.now();
  child.logs = logs;
  processes.set(project.slug, child);

  // Wait until it actually answers, rather than assuming the spawn worked.
  let health = null;
  for (let i = 0; i < 30; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) {
        health = await response.json();
        break;
      }
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  project.deployed = true;
  project.port = port;
  project.url = `/generated/${project.slug}/`;
  project.pid = child.pid;
  project.deployedAt = nowIso();
  persist();
  audit({ action: 'project.deploy', slug: project.slug, port, pid: child.pid, healthy: Boolean(health) });

  res.json({
    deployed: Boolean(health),
    port,
    pid: child.pid,
    url: project.url,
    health,
    logs,
    verdict: health
      ? `Running as its own process (pid ${child.pid}) on port ${port}. Its health endpoint answered with ${health.records} record(s) — the deployment is verified, not assumed.`
      : `The process started (pid ${child.pid}) but /api/health did not answer within 4.5s. Check the logs.`,
  });
});

router.post('/:slug/stop', (req, res) => {
  const project = projectBySlug(req.params.slug);
  if (!project) return res.status(404).json({ error: 'not_found' });
  const child = processes.get(project.slug);
  if (!isAlive(child)) return res.json({ stopped: false, detail: 'not running' });
  child.kill('SIGTERM');
  setTimeout(() => isAlive(child) && child.kill('SIGKILL'), 2000);
  project.deployed = false;
  persist();
  audit({ action: 'project.stop', slug: project.slug });
  res.json({ stopped: true });
});

router.post('/:slug/edit', async (req, res) => {
  const project = projectBySlug(req.params.slug);
  if (!project) return res.status(404).json({ error: 'not_found' });
  const { file, find, replace, apply = false } = req.body || {};
  if (!file) return res.status(400).json({ error: 'file_required' });
  const abs = path.resolve(project.dir, file);
  if (!abs.startsWith(path.resolve(project.dir) + path.sep)) return res.status(403).json({ error: 'forbidden' });
  const before = await fsp.readFile(abs, 'utf8').catch(() => null);
  if (before === null) return res.status(404).json({ error: 'not_found', detail: `${file} does not exist in this project` });
  const after = find ? before.split(find).join(replace ?? '') : String(req.body.content ?? before);
  const diff = unifiedDiff(before, after, { file });
  if (apply) {
    await fsp.writeFile(abs, after);
    const suite = await runSuite(project.dir);
    audit({ action: 'project.edit.apply', slug: project.slug, file, tests: `${suite.passed}/${suite.passed + suite.failed}` });
    return res.json({ applied: true, diff, suite: { passed: suite.passed, failed: suite.failed, ok: suite.ok } });
  }
  res.json({ applied: false, diff, note: 'Preview only — pass apply: true to write it.' });
});

router.delete('/:slug', (req, res) => {
  const project = projectBySlug(req.params.slug);
  if (!project) return res.status(404).json({ error: 'not_found' });
  const child = processes.get(project.slug);
  if (isAlive(child)) child.kill('SIGKILL');
  processes.delete(project.slug);
  fs.rm(project.dir, { recursive: true, force: true }, () => {});
  db.projects = db.projects.filter((p) => p.slug !== project.slug);
  persist();
  audit({ action: 'project.delete', slug: project.slug });
  res.json({ deleted: true });
});

export const projectRuntime = {
  isAlive,
  get: (slug) => processes.get(slug),
  all: () => processes,
  async stopAll() {
    for (const [slug, child] of processes) {
      if (isAlive(child)) child.kill('SIGKILL');
      processes.delete(slug);
    }
  },
};

export { config };
export default router;
