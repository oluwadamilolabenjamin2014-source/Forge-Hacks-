/**
 * Code execution surface. Real subprocesses, real exit codes, real trace.
 */
import express from 'express';
import { runSandbox, checkFile } from '../lib/sandbox.js';
import { db, audit } from '../store.js';
import { buildModule, detectLanguage, detectIntent, extractIdentifiers, testsFor } from '../lib/codeTemplates.js';

const router = express.Router();

export const RUNTIMES = [
  { id: 'python', label: 'Python 3.11', executable: 'python3', capabilities: ['trace', 'stdin', 'timeout'] },
  { id: 'javascript', label: 'Node.js 22', executable: 'node', capabilities: ['stdin', 'timeout'] },
  { id: 'bash', label: 'Bash', executable: 'bash', capabilities: ['stdin', 'timeout'] },
];

router.get('/runtimes', (_req, res) => {
  res.json({
    runtimes: RUNTIMES,
    limits: {
      timeoutMs: 6000,
      maxOutputBytes: 64 * 1024,
      isolation: 'process isolation (fresh temp dir, scrubbed env, SIGKILL on timeout)',
      caveat:
        'This is process isolation, not a security boundary. Untrusted code should run in a container or VM with no network and a read-only filesystem. Forge says this rather than implying a sandbox is a jail.',
    },
  });
});

/** Execute pasted code. */
router.post('/run', async (req, res) => {
  const { language = 'python', code = '', stdin = '', timeoutMs } = req.body || {};
  if (!String(code).trim()) return res.status(400).json({ error: 'code_required' });
  if (String(code).length > 400_000) return res.status(413).json({ error: 'too_large' });
  const result = await runSandbox({ language, code: String(code), stdin: String(stdin || ''), timeoutMs: Math.min(Number(timeoutMs) || 6000, 20_000) });
  audit({ action: 'sandbox.run', language, ok: result.ok, exitCode: result.exitCode, durationMs: result.durationMs });
  res.json(result);
});

/** Generate code for a prompt, then optionally execute it in one call. */
router.post('/generate-and-run', async (req, res) => {
  const { prompt, language, execute = true } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt_required' });
  const lang = language || detectLanguage(prompt);
  const intent = detectIntent(prompt);
  const built = buildModule({ language: lang, intent, prompt, ids: extractIdentifiers(prompt) });
  const runnable = ['python', 'javascript', 'bash'].includes(lang) && execute;
  const run = runnable ? await runSandbox({ language: lang, code: built.code, timeoutMs: 8000 }) : null;
  const tests = testsFor(lang === 'javascript' ? 'javascript' : 'python', extractIdentifiers(prompt).snake || 'solution');
  audit({ action: 'sandbox.generate', language: lang, intent, ok: run?.ok ?? null });
  res.json({
    language: lang,
    intent,
    filename: built.filename,
    code: built.code,
    assumptions: built.assumptions,
    notes: built.notes,
    runCommand: built.run,
    tests,
    execution: run
      ? {
          ...run,
          note: run.ok
            ? 'Executed in a real subprocess. The exit code above is the interpreter\'s, not a claim about it.'
            : 'The interpreter rejected this. That is useful information — read stderr and iterate.',
        }
      : { skipped: true, reason: runnable ? 'execute:false' : `No executor for ${lang} in this sandbox (Python, Node and Bash are supported).` },
  });
});

/** Verify a file inside a generated project. */
router.post('/check-file', async (req, res) => {
  const { projectSlug, file } = req.body || {};
  const project = db.projects.find((p) => p.slug === projectSlug);
  if (!project) return res.status(404).json({ error: 'project_not_found' });
  const path = `${project.dir}/${file}`;
  const result = await checkFile(path);
  res.json({ file, ...result });
});

export default router;
