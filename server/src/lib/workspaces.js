/**
 * Workspace management.
 *
 * The agentic surface works on repositories *on disk* — not a chat transcript.
 * Two kinds of workspace exist:
 *   - `demo`  — a copy of the seeded ledger-api repo (writable). Reset any time.
 *   - `host`  — this application's own source tree, mounted READ-ONLY. It is genuinely
 *               useful to ask an agent "where is X handled?" about the app you are
 *               running; it is not useful to let it silently rewrite its own runtime.
 *               Writes are refused at the API layer, not just hidden in the UI.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import config from '../config.js';
import { audit, id, nowIso } from '../store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_TPL = path.join(__dirname, '..', 'templates', 'repo');

function git(args, cwd) {
  return new Promise((resolve) => {
    const child = spawn('git', args, { cwd, env: { PATH: process.env.PATH, HOME: cwd, GIT_AUTHOR_NAME: 'Forge Agent', GIT_AUTHOR_EMAIL: 'agent@forge.local', GIT_COMMITTER_NAME: 'Forge Agent', GIT_COMMITTER_EMAIL: 'agent@forge.local' } });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => {
      out += d;
    });
    child.stderr.on('data', (d) => {
      err += d;
    });
    child.on('close', (code) => resolve({ code, out: out.trim(), err: err.trim() }));
    child.on('error', (e) => resolve({ code: -1, out: '', err: e.message }));
  });
}

async function copyTree(from, to) {
  await fsp.mkdir(to, { recursive: true });
  for (const entry of await fsp.readdir(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) await copyTree(src, dst);
    else await fsp.copyFile(src, dst);
  }
}

const demoRoot = () => path.join(config.workspacesRoot, 'ledger-api');

export async function ensureWorkspaces({ reset = false } = {}) {
  const root = demoRoot();
  if (reset || !fs.existsSync(path.join(root, 'package.json'))) {
    await fsp.rm(root, { recursive: true, force: true });
    await copyTree(REPO_TPL, root);
    await fsp.writeFile(path.join(root, '.forge-seeded.json'), JSON.stringify({ seededAt: nowIso(), id: id('ws') }, null, 2));
    await git(['init', '-q', '-b', 'main'], root);
    await git(['add', '-A'], root);
    await git(['commit', '-q', '-m', 'chore: imported ledger-api (failing suite on purpose)'], root);
    audit({ action: 'workspace.reset', workspace: 'ledger-api', detail: 'seeded demo repository' });
  }
  return root;
}

export async function listWorkspaces() {
  await ensureWorkspaces();
  return [
    {
      id: 'ledger-api',
      name: 'ledger-api (demo)',
      root: demoRoot(),
      writable: true,
      description: 'Node ledger + reporting library with a deliberately failing suite. Reset restores it to the seeded state.',
    },
    {
      id: 'forge-host',
      name: 'Forge itself (this repo)',
      root: config.root,
      writable: false,
      description: 'The application you are using, mounted read-only. Ask it where things are handled — it will not rewrite its own runtime.',
    },
  ];
}

export async function resolveWorkspace(workspaceId) {
  const all = await listWorkspaces();
  const found = all.find((w) => w.id === workspaceId) || all[0];
  if (!fs.existsSync(found.root)) await ensureWorkspaces();
  return found;
}

export async function gitStatus(root) {
  const inside = await git(['rev-parse', '--is-inside-work-tree'], root);
  if (inside.code !== 0) return { available: false, reason: inside.err || 'not a git repository' };
  const [status, log, diffStat] = await Promise.all([
    git(['status', '--porcelain'], root),
    git(['log', '--oneline', '-5'], root),
    git(['diff', '--stat'], root),
  ]);
  return {
    available: true,
    dirty: status.out.split('\n').filter(Boolean).map((line) => ({ state: line.slice(0, 2).trim(), file: line.slice(3) })),
    log: log.out.split('\n').filter(Boolean),
    diffStat: diffStat.out,
  };
}

export async function gitCommit(root, message) {
  await git(['add', '-A'], root);
  const result = await git(['commit', '-q', '-m', message], root);
  audit({ action: 'agent.git.commit', message, ok: result.code === 0 });
  return result;
}
