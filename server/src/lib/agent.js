/**
 * Agentic coding: a real tool loop over a real repository on disk.
 *
 * The loop is: scan → propose → apply → **execute the suite** → keep or revert.
 * Nothing is "fixed" because the model said so; a change is kept only when the
 * interpreter's verdict improves, and reverts are recorded too. That is the difference
 * between an agent and an autocomplete: it has a feedback signal that can tell it no.
 *
 * Rules are split in two:
 *   - `auto`    — narrow, mechanically verifiable transformations (off-by-one, missing
 *                 await, unseeded reduce, loose equality, sort without comparator,
 *                 parseInt truncation). Applied only if the suite improves.
 *   - `advisory`— things a human must decide (hardcoded secrets, wildcard CORS, bare
 *                 except, mutable defaults). Reported, never auto-applied.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import config from '../config.js';
import { unifiedDiff, summarizeDiff } from './patch.js';
import { testsFor } from './codeTemplates.js';
import { audit } from '../store.js';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.venv', '__pycache__']);
const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.json', '.md', '.yml', '.yaml', '.sql', '.sh', '.css', '.html']);

/* ------------------------------------------------------------ file access */

export async function listFiles(root, { max = 400 } = {}) {
  const out = [];
  async function walk(dir) {
    if (out.length >= max) return;
    let entries = [];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= max) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
        await walk(full);
      } else if (TEXT_EXT.has(path.extname(entry.name))) {
        const stat = await fsp.stat(full);
        if (stat.size > 512 * 1024) continue;
        out.push(path.relative(root, full));
      }
    }
  }
  await walk(root);
  return out.sort();
}

/** Resolve a repo-relative path, refusing anything that escapes the root. */
export function safeJoin(root, rel) {
  const resolved = path.resolve(root, rel);
  const normalizedRoot = path.resolve(root) + path.sep;
  if (!resolved.startsWith(normalizedRoot)) throw new Error(`path escapes the workspace: ${rel}`);
  return resolved;
}

export async function readRepoFile(root, rel) {
  return fsp.readFile(safeJoin(root, rel), 'utf8');
}

/* -------------------------------------------------------------- execution */

function run(cmd, args, { cwd, timeoutMs = 60_000 } = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(cmd, args, {
      cwd,
      env: { PATH: process.env.PATH, HOME: cwd, NODE_ENV: 'test', LANG: 'C.UTF-8', PYTHONDONTWRITEBYTECODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', (d) => {
      if (stdout.length < 400_000) stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      if (stderr.length < 200_000) stderr += d.toString();
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: `${stderr}${err.message}`, durationMs: Date.now() - started, killed });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: killed ? -9 : code ?? -1, stdout, stderr, durationMs: Date.now() - started, killed });
    });
  });
}

/** Run the repository's own test suite and parse the machine-readable result. */
export async function runSuite(root) {
  const has = (f) => fs.existsSync(path.join(root, f));
  const isPython = has('pyproject.toml') || has('pytest.ini') || has('tests') || has('test');
  const pyTests = isPython && (fs.existsSync(path.join(root, 'tests')) || fs.existsSync(path.join(root, 'test')));

  if (has('package.json')) {
    let pkg = {};
    try {
      pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    } catch {
      /* ignore */
    }
    const hasTestScript = Boolean(pkg.scripts?.test);
    if (!hasTestScript) {
      const files = await listFiles(root);
      if (!files.some((f) => /\.test\.|_test\./.test(f))) {
        return { ok: true, runner: 'none', passed: 0, failed: 0, failing: [], stdout: '', stderr: '', note: 'No test suite and no test script — nothing to verify against.' };
      }
    }
    const result = await run('npm', ['test', '--silent'], { cwd: root, timeoutMs: 90_000 });
    return parseNodeTest(result, 'npm test');
  }

  if (pyTests) {
    const result = await run('python3', ['-m', 'pytest', '-q', '--no-header', '-p', 'no:cacheprovider'], { cwd: root, timeoutMs: 90_000 });
    return parsePytest(result);
  }

  return { ok: true, runner: 'none', passed: 0, failed: 0, failing: [], stdout: '', stderr: '', note: 'No recognised test runner.' };
}

function parseNodeTest(result, runner) {
  const text = `${result.stdout}\n${result.stderr}`;
  const passMatch = text.match(/^# pass (\d+)$/m);
  const failMatch = text.match(/^# fail (\d+)$/m);
  const failing = [];
  let current = null;
  for (const line of text.split('\n')) {
    const notOk = line.match(/^not ok \d+ - (.*)$/);
    if (notOk) {
      current = { test: notOk[1].trim(), error: '', location: '' };
      failing.push(current);
      continue;
    }
    if (current && /^\s+error:/.test(line)) current.error = line.replace(/^\s+error:\s*/, '').replace(/^["']|["']$/g, '').slice(0, 300);
    if (current && /^\s+location:/.test(line)) current.location = line.split("'")[1] || '';
  }
  const passed = passMatch ? Number(passMatch[1]) : 0;
  const failed = failMatch ? Number(failMatch[1]) : failing.length;
  return {
    ok: failed === 0 && result.code === 0,
    runner,
    passed,
    failed,
    failing,
    stdout: result.stdout.slice(-8000),
    stderr: result.stderr.slice(-4000),
    exitCode: result.code,
    durationMs: result.durationMs,
  };
}

function parsePytest(result) {
  const text = `${result.stdout}\n${result.stderr}`;
  const failing = [...text.matchAll(/^FAILED ([^\s]+) ?-? ?(.*)$/gm)].map((m) => ({ test: m[1], error: m[2].slice(0, 300), location: m[1] }));
  const summary = text.match(/(\d+) passed(?:, (\d+) failed)?/);
  return {
    ok: result.code === 0,
    runner: 'pytest',
    passed: summary ? Number(summary[1]) : 0,
    failed: summary?.[2] ? Number(summary[2]) : failing.length,
    failing,
    stdout: text.slice(-8000),
    stderr: '',
    exitCode: result.code,
    durationMs: result.durationMs,
  };
}

/* ------------------------------------------------------------------ rules */

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

function jsRules(rel, text) {
  const out = [];
  const lines = text.split('\n');

  // 1. off-by-one: `i <= arr.length` inside a for-loop header
  lines.forEach((line, i) => {
    const m = line.match(/for\s*\(\s*let\s+(\w+)\s*=\s*0\s*;\s*(\w+)\s*<=\s*([\w.$\[\]]+)\.length\s*;/);
    if (m) {
      out.push({
        rule: 'off-by-one-loop',
        file: rel,
        line: i + 1,
        confidence: 0.97,
        find: `${m[2]} <= ${m[3]}.length`,
        replace: `${m[2]} < ${m[3]}.length`,
        rationale: `Loop bound \`${m[2]} <= ${m[3]}.length\` runs one past the end; the final iteration reads \`undefined\` and poisons any accumulator (here \`total\`). Fix: strict \`<\`.`,
      });
    }
  });

  // 2. sort() without a comparator
  const sortMatches = [...text.matchAll(/\.sort\(\)/g)];
  for (const m of sortMatches) {
    out.push({
      rule: 'sort-without-comparator',
      file: rel,
      line: lineOf(text, m.index),
      confidence: 0.9,
      find: '.sort()',
      replace: ".sort((a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true })))",
      rationale: '`Array.prototype.sort()` without a comparator stringifies elements, so `[1000, 90.5]` sorts as `["1000", "90.5"]`. A numeric-aware comparator preserves the intended order and still works for strings.',
    });
  }

  // 3. loose equality
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*)/.test(line)) return;
    for (const [find, replace] of [[' == ', ' === '], [' != ', ' !== ']]) {
      let idx = line.indexOf(find);
      while (idx !== -1) {
        const rhs = line.slice(idx + find.length, idx + find.length + 12);
        if (/^\s*(null|undefined)\b/.test(rhs)) {
          idx = line.indexOf(find, idx + 1);
          continue;
        }
        out.push({
          rule: 'loose-equality',
          file: rel,
          line: i + 1,
          confidence: 0.82,
          find: line.slice(0, idx + find.length),
          replace: line.slice(0, idx) + replace,
          rationale: `Loose \`${find.trim()}\` coerces types, so \`"1" == 1\` is true and a lookup by string id matches numeric ids. Strict \`${replace.trim()}\` matches the contract.`,
          once: true,
        });
        idx = -1;
      }
    }
  });

  // 4. reduce without an initial value
  lines.forEach((line, i) => {
    const m = line.match(/\.reduce\(\((\w+),\s*(\w+)\)\s*=>\s*([^()]*)\)/);
    if (m) {
      out.push({
        rule: 'reduce-without-seed',
        file: rel,
        line: i + 1,
        confidence: 0.88,
        find: `.reduce((${m[1]}, ${m[2]}) => ${m[3]})`,
        replace: `.reduce((${m[1]}, ${m[2]}) => ${m[3]}, 0)`,
        rationale: 'A reducer with no seed uses the first element as the accumulator, so an empty list throws `Reduce of empty array with no initial value` and a non-numeric first element corrupts the type. Seed it with `0`.',
      });
    }
  });

  // 5. missing await on a promise-returning call inside an async function
  const asyncRanges = [];
  lines.forEach((line, i) => {
    if (/(?:export\s+)?async\s+function\s+\w+/.test(line)) {
      let depth = 0;
      let end = i;
      for (let j = i; j < lines.length; j += 1) {
        depth += (lines[j].match(/{/g) || []).length - (lines[j].match(/}/g) || []).length;
        if (depth <= 0 && j > i) {
          end = j;
          break;
        }
      }
      asyncRanges.push([i, end]);
    }
  });
  lines.forEach((line, i) => {
    const inAsync = asyncRanges.some(([start, end]) => i >= start && i <= end);
    if (!inAsync) return;
    const m = line.match(/(=\s*)(\w+)\.(readFile|readFileSync|readdir|stat|fetch|json|text|writeFile)\(/);
    if (m && !/await\s/.test(line.slice(0, m.index + m[0].length))) {
      out.push({
        rule: 'missing-await',
        file: rel,
        line: i + 1,
        confidence: 0.93,
        find: `${m[2]}.${m[3]}(`,
        replace: `await ${m[2]}.${m[3]}(`,
        rationale: `\`${m[2]}.${m[3]}()\` returns a promise; without \`await\` the next line operates on a Promise object rather than the resolved value (which is why \`JSON.parse\` sees \`[object Promise]\`).`,
      });
    }
  });

  // 6. parseInt truncating money values
  if (/(amount|price|cost|total|money|fee|balance|cash|revenue|salary)/i.test(text) && /\bparseInt\(/.test(text)) {
    const m = text.match(/\bparseInt\(/);
    out.push({
      rule: 'integer-truncation',
      file: rel,
      line: lineOf(text, m.index),
      confidence: 0.85,
      find: 'parseInt(',
      replace: 'parseFloat(',
      rationale: '`parseInt` truncates at the decimal point, so `parseInt("1250.75")` is `1250` — wrong for any monetary value. `parseFloat` keeps the cents.',
    });
  }

  return out;
}

function pyRules(rel, text) {
  const out = [];
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    const m = line.match(/for\s+\w+\s+in\s+range\(len\((\w+)\)\s*\+\s*1\)\s*:/);
    if (m) {
      out.push({
        rule: 'off-by-one-loop',
        file: rel,
        line: i + 1,
        confidence: 0.95,
        find: `range(len(${m[1]}) + 1)`,
        replace: `range(len(${m[1]}))`,
        rationale: `\`range(len(x) + 1)\` iterates one past the end and raises IndexError on the last pass.`,
      });
    }
  });
  if (/def\s+\w+\([^)]*=\s*(\[\]|\{\})\s*[,)]/.test(text)) {
    out.push({
      rule: 'mutable-default-argument',
      file: rel,
      line: 1,
      confidence: 0.99,
      advisory: true,
      rationale: 'A mutable default argument (`=[]` / `={}`) is created once and shared across every call. Use `None` and build the container inside the function.',
    });
  }
  if (/except\s*:/.test(text)) {
    out.push({ rule: 'bare-except', file: rel, line: 1, confidence: 0.99, advisory: true, rationale: 'A bare `except:` swallows KeyboardInterrupt and SystemExit as well as bugs. Catch the specific exception type.' });
  }
  if (/==\s*None/.test(text)) {
    out.push({ rule: 'equality-with-none', file: rel, line: 1, confidence: 0.95, advisory: true, rationale: 'Compare to None with `is` / `is not`; `==` can be overridden by a custom `__eq__`.' });
  }
  return out;
}

const SECRET_RE = /(sk-[A-Za-z0-9]{10,}|AKIA[0-9A-Z]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:password|passwd|secret|api[_-]?key|token)\s*[:=]\s*['"][^'"]{8,}['"])/i;
const RISKY_RE = [/\beval\(/, /child_process\.exec\([^)]*\$\{/, /new Function\(/];

function generalRules(rel, text) {
  const out = [];
  if (SECRET_RE.test(text)) {
    out.push({ rule: 'possible-secret-in-source', file: rel, line: lineOf(text, text.search(SECRET_RE)), confidence: 0.8, advisory: true, rationale: 'A high-entropy string or a literal credential appears in source. Move it to an environment variable and rotate it — assume it is already leaked.' });
  }
  for (const re of RISKY_RE) {
    if (re.test(text)) {
      out.push({ rule: 'dynamic-code-execution', file: rel, line: lineOf(text, text.search(re)), confidence: 0.85, advisory: true, rationale: `\`${re.source}\` executes a dynamically built string. With any user input in the path this is remote code execution; prefer a data structure over generated code.` });
      break;
    }
  }
  if (/(allow_origins=\["\*"\]|origin:\s*['"]\*['"]|Access-Control-Allow-Origin['"]?\s*[:,]\s*['"]\*)/.test(text)) {
    out.push({ rule: 'wildcard-cors', file: rel, line: lineOf(text, text.search(/allow_origins|origin:|Access-Control/)), confidence: 0.9, advisory: true, rationale: 'Wildcard CORS lets any origin read authenticated responses. Enumerate the origins you actually serve.' });
  }
  const todos = [...text.matchAll(/\b(TODO|FIXME|HACK|XXX)\b[^\n]{0,120}/g)].map((m) => m[0].trim());
  for (const todo of todos.slice(0, 5)) {
    out.push({ rule: 'unresolved-marker', file: rel, line: lineOf(text, text.indexOf(todo)), confidence: 0.3, advisory: true, rationale: `Unresolved marker: ${todo}` });
  }
  return out;
}

/** Static scan across the repo → candidates (auto) + advisories (human). */
export async function scanRepo(root, files) {
  const auto = [];
  const advisory = [];
  for (const rel of files) {
    let text = '';
    try {
      text = await readRepoFile(root, rel);
    } catch {
      continue;
    }
    const ext = path.extname(rel);
    const candidates = ext === '.py' ? pyRules(rel, text) : ext === '.js' || ext === '.mjs' || ext === '.cjs' ? jsRules(rel, text) : [];
    for (const c of [...candidates, ...generalRules(rel, text)]) {
      if (c.advisory) advisory.push(c);
      else auto.push({ ...c, target: rel });
    }
  }
  return { auto, advisory };
}

/* ------------------------------------------------------------ apply/revert */

export async function applyCandidate(root, candidate) {
  const abs = safeJoin(root, candidate.file);
  const before = await fsp.readFile(abs, 'utf8');
  const occurrences = before.split(candidate.find).length - 1;
  if (!occurrences) return { applied: false, reason: `pattern no longer present (already fixed?)` };
  if (occurrences > 1 && candidate.once) return { applied: false, reason: `pattern appears ${occurrences} times — ambiguous, needs a human` };
  const after = before.split(candidate.find).join(candidate.replace);
  const diff = unifiedDiff(before, after, { file: candidate.file });
  await fsp.writeFile(abs, after);
  return { applied: true, before, after, diff, bytes: after.length - before.length };
}

export async function revert(root, candidate, before) {
  const abs = safeJoin(root, candidate.file);
  await fsp.writeFile(abs, before);
}

/* -------------------------------------------------------------- main loop */

/**
 * Repair loop. Yields SSE-ready events. Every keep/revert is audit-logged.
 */
export async function* runAgent({ root, instruction, maxRounds = 3, onEvent }) {
  const emit = (event) => {
    onEvent?.(event);
    return event;
  };
  const ledger = [];
  const started = Date.now();

  yield emit({ type: 'step', phase: 'scan', message: `Scanning ${root.replace(config.workspacesRoot, '…')} for text files` });
  const files = await listFiles(root);
  yield emit({ type: 'step', phase: 'scan', done: true, message: `${files.length} files indexed (node_modules, .git and binaries skipped)` });

  yield emit({ type: 'step', phase: 'baseline', message: 'Running the repository test suite to establish a baseline' });
  let result = await runSuite(root);
  const baseline = { passed: result.passed, failed: result.failed };
  yield emit({
    type: 'baseline',
    runner: result.runner,
    passed: result.passed,
    failed: result.failed,
    failing: result.failing.slice(0, 12),
    message: result.runner === 'none' ? 'No suite found — falling back to static analysis only.' : `Baseline: ${result.passed} passing · ${result.failed} failing`,
  });

  const { auto, advisory } = await scanRepo(root, files);
  yield emit({ type: 'step', phase: 'analyse', message: `Static pass found ${auto.length} auto-fixable defect(s) and ${advisory.length} item(s) that need a human decision` });

  if (advisory.length) {
    yield emit({ type: 'advisory', items: advisory.slice(0, 24) });
  }

  const ranked = [...auto].sort((a, b) => b.confidence - a.confidence);
  let round = 0;
  for (const candidate of ranked) {
    if (round >= maxRounds) {
      yield emit({ type: 'step', phase: 'limit', message: `Stopping at the ${maxRounds}-change budget; ${ranked.length - ranked.indexOf(candidate)} candidate(s) left unapplied.` });
      break;
    }
    yield emit({
      type: 'propose',
      rule: candidate.rule,
      file: candidate.file,
      line: candidate.line,
      confidence: candidate.confidence,
      rationale: candidate.rationale,
      message: `Proposing \`${candidate.rule}\` in ${candidate.file}:${candidate.line} — ${candidate.rationale}`,
    });

    const applied = await applyCandidate(root, candidate);
    if (!applied.applied) {
      yield emit({ type: 'skip', rule: candidate.rule, file: candidate.file, message: `Skipped: ${applied.reason}` });
      continue;
    }
    yield emit({ type: 'diff', file: candidate.file, diff: applied.diff, message: `Applied candidate — ${summarizeDiff(applied.diff).added} line(s) added, ${summarizeDiff(applied.diff).removed} removed` });

    yield emit({ type: 'step', phase: 'verify', message: 'Re-running the suite to verify the change (this is the only thing that counts as evidence)' });
    const after = await runSuite(root);
    const improved = after.failed < result.failed || (after.failed === result.failed && after.passed > result.passed);
    const regressed = after.failed > result.failed;

    if (improved) {
      ledger.push({
        rule: candidate.rule,
        file: candidate.file,
        line: candidate.line,
        status: 'kept',
        before: { passed: result.passed, failed: result.failed },
        after: { passed: after.passed, failed: after.failed },
        rationale: candidate.rationale,
        diff: applied.diff,
      });
      result = after;
      round += 1;
      audit({ action: 'agent.edit.keep', file: candidate.file, rule: candidate.rule, passed: after.passed, failed: after.failed });
      yield emit({
        type: 'verify',
        verdict: 'kept',
        rule: candidate.rule,
        file: candidate.file,
        passed: after.passed,
        failed: after.failed,
        message: `Verified: ${after.passed} passing, ${after.failed} failing (was ${ledger[ledger.length - 1].before.passed}/${ledger[ledger.length - 1].before.failed}). Change kept.`,
      });
    } else {
      await revert(root, candidate, applied.before);
      ledger.push({ rule: candidate.rule, file: candidate.file, line: candidate.line, status: regressed ? 'reverted-regression' : 'reverted-no-effect', rationale: candidate.rationale, diff: applied.diff });
      audit({ action: 'agent.edit.revert', file: candidate.file, rule: candidate.rule, reason: regressed ? 'regression' : 'no measurable effect' });
      yield emit({
        type: 'verify',
        verdict: 'reverted',
        rule: candidate.rule,
        file: candidate.file,
        passed: after.passed,
        failed: after.failed,
        message: regressed
          ? `Reverted: the suite got worse (${after.failed} failing vs ${result.failed}). The agent does not keep a change on the strength of its own opinion.`
          : `Reverted: no measurable effect on the suite (${after.passed} passing, ${after.failed} failing). Unexplained changes do not ship.`,
      });
    }
  }

  yield emit({ type: 'step', phase: 'final', message: 'Final verification run' });
  const finalResult = await runSuite(root);
  const summary = {
    runner: finalResult.runner,
    baseline,
    final: { passed: finalResult.passed, failed: finalResult.failed },
    kept: ledger.filter((l) => l.status === 'kept').length,
    reverted: ledger.filter((l) => l.status !== 'kept').length,
    durationMs: Date.now() - started,
  };
  yield emit({
    type: 'summary',
    summary,
    ledger,
    remaining: finalResult.failing.slice(0, 12),
    stdout: finalResult.stdout,
    message:
      finalResult.failed === 0
        ? `Suite is green: ${finalResult.passed} passing, 0 failing. ${summary.kept} change(s) kept, ${summary.reverted} reverted.`
        : `${finalResult.failed} test(s) still failing after ${ledger.length} attempt(s) — reported honestly rather than papered over.`,
  });
}

/* ------------------------------------------------------------- scaffolding */

export function scaffoldPlan(kind, { root, files = [] } = {}) {
  const ci = {
    path: '.github/workflows/ci.yml',
    language: 'yaml',
    content: `name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
      - run: npm ci
      - run: npm test --silent
`,
    rationale: 'Runs the suite on every push and PR. A test that only runs on your laptop is documentation, not a gate.',
  };
  const gitignore = {
    path: '.gitignore',
    language: 'text',
    content: `node_modules/
dist/
build/
coverage/
*.log
.env
.env.local
.DS_Store
__pycache__/
.venv/
.pytest_cache/
`,
    rationale: 'Keeps build output and secrets out of the repository.',
  };
  const editorconfig = {
    path: '.editorconfig',
    language: 'text',
    content: `root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
trim_trailing_whitespace = true

[*.py]
indent_size = 4
`,
    rationale: 'Ends whitespace debates in code review — editors follow the file automatically.',
  };
  const map = { ci, gitignore, editorconfig };
  return map[kind] ? [map[kind]] : [];
}

export function testScaffoldFor(root, files, targetName) {
  const rel = files.find((f) => f.includes(targetName));
  if (!rel) return null;
  const isPython = rel.endsWith('.py');
  return {
    path: isPython ? `test_${path.basename(rel)}` : `${rel.replace(/^src\//, 'test/').replace(/\.js$/, '')}.test.js`,
    language: isPython ? 'python' : 'javascript',
    content: testsFor(isPython ? 'python' : 'javascript', path.basename(rel).replace(/\.\w+$/, ''), null),
    rationale: 'Generated from the same contract template the code surface uses — edit the assertions to match your real spec.',
  };
}
