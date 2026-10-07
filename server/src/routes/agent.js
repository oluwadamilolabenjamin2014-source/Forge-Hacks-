/**
 * Agentic coding surface: repositories on disk, real diffs, real test runs, SSE narration.
 */
import express from 'express';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { db, id, nowIso, persist, audit } from '../store.js';
import { listWorkspaces, resolveWorkspace, ensureWorkspaces, gitStatus, gitCommit } from '../lib/workspaces.js';
import { listFiles, scanRepo, readRepoFile, safeJoin, runSuite, scaffoldPlan, testScaffoldFor } from '../lib/agent.js';
import { unifiedDiff, summarizeDiff } from '../lib/patch.js';
import { Retriever } from '../lib/text.js';

const router = express.Router();

router.get('/workspaces', async (_req, res) => {
  const workspaces = await listWorkspaces();
  const enriched = await Promise.all(
    workspaces.map(async (w) => {
      const files = await listFiles(w.root).catch(() => []);
      return { ...w, fileCount: files.length, git: await gitStatus(w.root).catch(() => ({ available: false })) };
    }),
  );
  res.json(enriched);
});

router.post('/workspaces/reset', async (_req, res) => {
  await ensureWorkspaces({ reset: true });
  const ws = await resolveWorkspace('ledger-api');
  const suite = await runSuite(ws.root);
  res.json({ reset: true, workspace: ws.id, suite: { passed: suite.passed, failed: suite.failed, runner: suite.runner } });
});

router.get('/files', async (req, res) => {
  const ws = await resolveWorkspace(req.query.workspace);
  const files = await listFiles(ws.root);
  res.json({ workspace: ws.id, root: ws.root, writable: ws.writable, files });
});

router.get('/file', async (req, res) => {
  const ws = await resolveWorkspace(req.query.workspace);
  if (!req.query.path) return res.status(400).json({ error: 'path_required' });
  try {
    const content = await readRepoFile(ws.root, String(req.query.path));
    const stat = await fsp.stat(safeJoin(ws.root, String(req.query.path)));
    res.json({ workspace: ws.id, path: req.query.path, content, bytes: stat.size, lines: content.split('\n').length });
  } catch (err) {
    res.status(404).json({ error: 'not_readable', detail: err.message });
  }
});

/** Semantic-ish search over the repo — the "where is X handled?" question. */
router.post('/locate', async (req, res) => {
  const { workspace, query } = req.body || {};
  if (!query) return res.status(400).json({ error: 'query_required' });
  const ws = await resolveWorkspace(workspace);
  const files = await listFiles(ws.root);
  const docs = [];
  for (const rel of files) {
    try {
      const text = await readRepoFile(ws.root, rel);
      docs.push({ id: rel, title: rel, ref: rel, text });
    } catch {
      /* unreadable file — skip */
    }
  }
  const retriever = new Retriever(docs);
  const hits = retriever.search(query, 6);
  res.json({
    workspace: ws.id,
    query,
    indexedFiles: docs.length,
    hits: hits.map((h) => ({
      file: h.ref,
      citation: `${h.ref} §${(h.index ?? 0) + 1}`,
      score: h.score,
      excerpt: h.text.slice(0, 420),
    })),
    note: hits.length
      ? 'Ranked with BM25 over every indexed file. Excerpts are verbatim; open the file to confirm before changing it.'
      : 'No file in this workspace matches those terms. Say so rather than guessing at a location.',
  });
});

router.get('/suite', async (req, res) => {
  const ws = await resolveWorkspace(req.query.workspace);
  const result = await runSuite(ws.root);
  res.json(result);
});

/** SSE: the full repair loop. */
router.post('/run/stream', async (req, res) => {
  const { workspace, instruction = 'diagnose and repair the failing test suite', maxRounds = 3 } = req.body || {};
  const ws = await resolveWorkspace(workspace);

  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  send('meta', { workspace: ws.id, root: ws.root, writable: ws.writable, instruction });

  try {
    if (!ws.writable) {
      // Read-only workspace: answer the question, propose nothing destructive.
      const files = await listFiles(ws.root);
      const docs = [];
      for (const rel of files.slice(0, 200)) {
        try {
          docs.push({ id: rel, title: rel, ref: rel, text: await readRepoFile(ws.root, rel) });
        } catch {
          /* skip */
        }
      }
      const hits = new Retriever(docs).search(instruction, 6);
      send('note', { message: 'This workspace is mounted read-only. Forge will answer with citations and stop — it will not modify its own runtime.' });
      send('locate', { hits: hits.map((h) => ({ file: h.ref, score: h.score, excerpt: h.text.slice(0, 300) })) });
      send('summary', {
        summary: { mode: 'read-only', indexed: docs.length, hits: hits.length },
        message: 'Read-only pass complete.',
      });
      return res.end();
    }

    const { runAgent } = await import('../lib/agent.js');
    for await (const event of runAgent({ root: ws.root, instruction, maxRounds: Number(maxRounds) || 3 })) {
      send(event.type, event);
    }
    send('done', { message: 'Run complete.' });
  } catch (err) {
    send('error', { message: err.message });
  } finally {
    res.end();
  }
});

/** Non-streaming convenience wrapper (used by tests and by the CLI-ish smoke script). */
router.post('/run', async (req, res) => {
  const { workspace, instruction = 'diagnose and repair the failing test suite', maxRounds = 3 } = req.body || {};
  const ws = await resolveWorkspace(workspace);
  if (!ws.writable) return res.status(403).json({ error: 'read_only_workspace', detail: 'Writes are refused for the host workspace by design.' });
  const { runAgent } = await import('../lib/agent.js');
  const events = [];
  for await (const event of runAgent({ root: ws.root, instruction, maxRounds: Number(maxRounds) || 3 })) events.push(event);
  const summary = events.find((e) => e.type === 'summary');
  res.json({ workspace: ws.id, summary: summary?.summary, ledger: summary?.ledger || [], events });
});

/** Scaffolding: additive files only, always previewed as a diff first. */
router.post('/scaffold', async (req, res) => {
  const { workspace, kind, target, apply = false } = req.body || {};
  const ws = await resolveWorkspace(workspace);
  if (!ws.writable) return res.status(403).json({ error: 'read_only_workspace' });
  const files = await listFiles(ws.root);
  let plan = [];
  if (kind === 'tests') {
    const scaffold = testScaffoldFor(ws.root, files, String(target || 'ledger'));
    if (!scaffold) return res.status(404).json({ error: 'target_not_found', detail: `No file matching "${target}" in this workspace.` });
    plan = [scaffold];
  } else {
    plan = scaffoldPlan(String(kind || 'ci'));
  }
  if (!plan.length) return res.status(400).json({ error: 'unknown_scaffold', detail: 'Supported kinds: ci, gitignore, editorconfig, tests.' });

  const withDiffs = plan.map((item) => ({
    ...item,
    exists: fs.existsSync(safeJoin(ws.root, item.path)),
    diff: unifiedDiff('', item.content, { file: item.path }),
  }));

  if (apply) {
    for (const item of plan) {
      const target2 = safeJoin(ws.root, item.path);
      await fsp.mkdir(path.dirname(target2), { recursive: true });
      await fsp.writeFile(target2, item.content);
      audit({ action: 'agent.scaffold.apply', file: item.path, workspace: ws.id });
    }
    const suite = await runSuite(ws.root);
    return res.json({ applied: true, files: plan.map((p) => p.path), suite: { passed: suite.passed, failed: suite.failed } });
  }
  res.json({ applied: false, plan: withDiffs, note: 'Preview only. Nothing is written until you apply — review the diff first.' });
});

router.get('/changes', async (req, res) => {
  const ws = await resolveWorkspace(req.query.workspace || 'ledger-api');
  const status = await gitStatus(ws.root);
  res.json({ workspace: ws.id, ...status, audit: db.audit.filter((a) => a.action?.startsWith('agent.')).slice(0, 40) });
});

router.post('/commit', async (req, res) => {
  const { workspace, message = 'fix: repairs verified by the test suite' } = req.body || {};
  const ws = await resolveWorkspace(workspace);
  if (!ws.writable) return res.status(403).json({ error: 'read_only_workspace' });
  const result = await gitCommit(ws.root, message);
  const status = await gitStatus(ws.root);
  persist();
  res.json({ ok: result.code === 0, output: result.out || result.err, ...status });
});

/** Diff preview for an arbitrary proposed edit — writes nothing. */
router.post('/preview', async (req, res) => {
  const { workspace, file, find, replace } = req.body || {};
  const ws = await resolveWorkspace(workspace);
  const before = await readRepoFile(ws.root, file);
  const after = before.split(find).join(replace);
  const diff = unifiedDiff(before, after, { file });
  res.json({ diff, stats: summarizeDiff(diff), changed: before !== after });
});

export default router;
