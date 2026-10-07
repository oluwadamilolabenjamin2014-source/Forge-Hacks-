import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';

export const fileSchema = z.object({ path: z.string().max(160), content: z.string().max(60000) }).strict();
export function safePath(value) {
  if (typeof value !== 'string' || value.length > 160 || !value.length || value !== value.normalize('NFC')) throw new Error('Invalid file path.');
  const segments = value.split('/');
  if (segments.some(s => !/^[a-zA-Z0-9_][a-zA-Z0-9_. -]*$/.test(s) || /[. ]$/.test(s) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i.test(s))) throw new Error('Use a relative path with no hidden files or traversal.');
  if (!/\.(tsx?|jsx?|mjs|cjs|json|md|txt|html|css|scss|py|sql|yaml|yml|toml|svg|gitignore)$/i.test(value)) throw new Error('Unsupported file type. Only text source files are supported.');
  return value;
}
export const hash = content => createHash('sha256').update(content ?? '\u0000absent').digest('hex');
export function propose(project, args) {
  const parsed = z.object({ summary: z.string().min(1).max(1000), files: z.array(fileSchema).min(1).max(12) }).strict().parse(args);
  const paths = parsed.files.map(f => safePath(f.path));
  if (new Set(paths.map(p => p.toLowerCase())).size !== paths.length) throw new Error('Duplicate file paths.');
  for (const p of paths) if (Object.keys(project.files).some(k => k.toLowerCase() === p.toLowerCase() && k !== p)) throw new Error('Case-conflicting file path.');
  if (JSON.stringify(parsed.files).length > 180000) throw new Error('Proposal exceeds 180 KB.');
  if (project.proposals.filter(p => p.status === 'pending').length >= 8) throw new Error('Review pending changes before requesting more.');
  const merged = { ...project.files, ...Object.fromEntries(parsed.files.map(f => [f.path, f.content])) };
  if (Object.keys(merged).length > 100 || JSON.stringify(merged).length > 1000000) throw new Error('Workspace limit: 100 files / 1 MB.');
  const proposal = { id: randomUUID(), summary: parsed.summary, files: parsed.files.map(f => ({ ...f, before: project.files[f.path] ?? null, baseHash: hash(project.files[f.path]) })), status: 'pending', createdAt: new Date().toISOString() };
  proposal.digest = hash(JSON.stringify(proposal.files));
  project.proposals.push(proposal);
  return proposal;
}
export function approve(project, id, digest) {
  const p = project.proposals.find(p => p.id === id);
  if (!p || p.status !== 'pending') throw new Error('This proposal is no longer pending.');
  if (p.digest !== digest) throw new Error('Proposal does not match the reviewed content.');
  if (Date.now() - Date.parse(p.createdAt) > 24 * 60 * 60 * 1000) throw new Error('Proposal expired. Ask for a fresh proposal.');
  for (const f of p.files) if (hash(project.files[f.path]) !== f.baseHash) throw new Error(`Stale proposal: ${f.path} changed. Ask for a new proposal.`);
  const merged = { ...project.files, ...Object.fromEntries(p.files.map(f => [f.path, f.content])) };
  if (Object.keys(merged).length > 100 || JSON.stringify(merged).length > 1000000) throw new Error('Workspace limit exceeded.');
  project.files = merged;
  p.status = 'approved';
  p.resolvedAt = new Date().toISOString();
  project.activity.push({ id: randomUUID(), text: `Approved: ${p.summary}`, time: p.resolvedAt });
  return p;
}
export function createProject(name) {
  return { id: randomUUID(), name, createdAt: new Date().toISOString(), files: {}, messages: [], proposals: [], plan: [], activity: [], skill: 'build' };
}
