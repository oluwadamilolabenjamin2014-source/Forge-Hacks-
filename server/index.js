import 'dotenv/config';
import express from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { createPatch } from 'diff';
import { createProject, fileSchema, safePath, approve } from './workspace.js';
import { runAgent } from './agent.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
await mkdir(dataDir, { recursive: true, mode: 0o700 });
let db;
try { db = JSON.parse(await readFile(path.join(dataDir, 'workspace.json'), 'utf8')); }
catch (e) { if (e.code !== 'ENOENT') throw e; db = { projects: [] }; }
let token = process.env.CYBER_DAVID_TOKEN;
if (!token) {
  try { token = (await readFile(path.join(dataDir, 'access-token'), 'utf8')).trim(); }
  catch (e) { if (e.code !== 'ENOENT') throw e; token = randomBytes(32).toString('hex'); await writeFile(path.join(dataDir, 'access-token'), token, { mode: 0o600 }); }
  console.log(`Workspace access code: ${token}`);
}
if (token.length < 24) throw new Error('CYBER_DAVID_TOKEN must be at least 24 characters.');
const skills = await Promise.all(['build', 'review', 'research'].map(async id => ({ id, name: { build: 'Build an app', review: 'Review code', research: 'Analyze a document' }[id], content: await readFile(path.join(root, 'skills', `${id}.md`), 'utf8') })));
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '300kb' }));
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  const supplied = Buffer.from(req.headers.authorization?.replace(/^Bearer /, '') || '');
  const expected = Buffer.from(token);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return res.status(401).json({ error: 'Enter your workspace access code to continue.' });
  // Bearer authentication (no cookies) and no CORS prevent cross-origin mutations.
  next();
});
let busy = false;
const mutate = handler => async (req, res, next) => {
  if (busy) return res.status(409).json({ error: 'Another workspace operation is running. Please wait.' });
  busy = true;
  const before = structuredClone(db);
  try {
    const result = await handler(req);
    await writeFile(path.join(dataDir, 'workspace.tmp'), JSON.stringify(db), { mode: 0o600 });
    await rename(path.join(dataDir, 'workspace.tmp'), path.join(dataDir, 'workspace.json'));
    res.json(result);
  } catch (e) { db = before; next(e); } finally { busy = false; }
};
const find = id => { const p = db.projects.find(p => p.id === id); if (!p) { const e = new Error('Project not found.'); e.status = 404; throw e; } return p; };
const publicProject = p => {
  const { history, ...visible } = p;
  return { ...visible, proposals: visible.proposals.map(p => ({ ...p, files: p.files.map(f => ({ ...f, diff: createPatch(f.path, f.before ?? '', f.content, 'Current', 'Proposed') })) })) };
};
app.get('/api/status', (req, res) => res.json({ configured: Boolean(process.env.OPENAI_API_KEY), model: process.env.OPENAI_MODEL || 'gpt-4.1-mini', busy, skills }));
app.get('/api/projects', (req, res) => res.json(db.projects.map(({ id, name, createdAt }) => ({ id, name, createdAt }))));
app.post('/api/projects', mutate(req => {
  if (db.projects.length >= 30) throw new Error('Project limit reached (30).');
  const { name } = z.object({ name: z.string().trim().min(1).max(80) }).parse(req.body);
  const p = createProject(name); db.projects.unshift(p); return publicProject(p);
}));
app.get('/api/projects/:id', (req, res) => res.json(publicProject(find(req.params.id))));
app.post('/api/projects/:id/files', mutate(req => {
  const p = find(req.params.id); const file = fileSchema.parse(req.body); safePath(file.path);
  if (Object.keys(p.files).some(k => k.toLowerCase() === file.path.toLowerCase() && k !== file.path)) throw new Error('Case-conflicting file path.');
  const files = { ...p.files, [file.path]: file.content };
  if (Object.keys(files).length > 100 || JSON.stringify(files).length > 1000000) throw new Error('Workspace limit: 100 files / 1 MB.');
  p.files = files;
  p.activity.push({ id: randomBytes(8).toString('hex'), text: `Imported ${file.path}`, time: new Date().toISOString() });
  return publicProject(p);
}));
app.post('/api/projects/:id/chat', mutate(async req => {
  if (!process.env.OPENAI_API_KEY) { const e = new Error('AI is not connected. Set OPENAI_API_KEY in the server .env file and restart. Never paste it in chat.'); e.status = 503; throw e; }
  const { text, skill } = z.object({ text: z.string().trim().min(1).max(60000), skill: z.enum(['build', 'review', 'research']) }).parse(req.body);
  const p = find(req.params.id);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180000);
  const onClose = () => { if (!req.res.writableEnded) controller.abort(); };
  req.res.on('close', onClose);
  try {
    const result = await runAgent(p, text, skills.find(s => s.id === skill).content, controller.signal);
    result.skill = skill; db.projects[db.projects.findIndex(x => x.id === p.id)] = result;
    return publicProject(result);
  } finally { clearTimeout(timer); req.res.off('close', onClose); }
}));
app.post('/api/projects/:id/proposals/:proposalId', mutate(req => {
  const { action, digest } = z.object({ action: z.enum(['approve', 'reject']), digest: z.string() }).parse(req.body);
  const p = find(req.params.id);
  if (action === 'approve') approve(p, req.params.proposalId, digest);
  else {
    const proposal = p.proposals.find(x => x.id === req.params.proposalId);
    if (!proposal || proposal.status !== 'pending') throw new Error('Proposal is no longer pending.');
    proposal.status = 'rejected';
    p.activity.push({ id: randomBytes(8).toString('hex'), text: `Rejected: ${proposal.summary}`, time: new Date().toISOString() });
  }
  return publicProject(p);
}));
app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));
app.use((e, req, res, next) => {
  if (req.path.startsWith('/api')) return res.status(e.status || 400).json({ error: e instanceof z.ZodError ? 'Invalid input. Check field lengths and values.' : e.name === 'AbortError' || e.name === 'TimeoutError' ? 'Agent run timed out or was cancelled. No partial changes were saved.' : e.message || 'Unexpected error.' });
  next(e);
});
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(root, 'dist')));
  app.get('/{*path}', (req, res) => res.sendFile(path.join(root, 'dist/index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ root, server: { middlewareMode: true, allowedHosts: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
app.listen(Number(process.env.PORT) || 3000, '0.0.0.0', () => console.log('Cyber David is listening on port ' + (process.env.PORT || 3000)));
