/**
 * Real execution sandbox.
 *
 * "Writes code well but runs it only in separate sandboxes" — so Forge ships the
 * sandbox, and makes it obvious that execution happened outside the model.
 * Python is the executed language (CPython 3.11 here); JavaScript is executed with
 * Node when present and syntax-checked otherwise.
 *
 * Isolation: fresh temp dir per run, scrubbed environment, hard wall-clock timeout,
 * capped stdout/stderr, no network expectations, child killed on timeout (SIGKILL).
 * This is process isolation, NOT a security boundary — run untrusted code in a
 * container/VM. The UI states that plainly so nobody mistakes it for one.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import config from '../config.js';
import { id } from '../store.js';

const MAX_OUTPUT = 64 * 1024;

const DRIVER = `import json, runpy, sys, traceback, io, os

TARGET = sys.argv[1]
TRACE = sys.argv[2]
steps = []
stdout = io.StringIO()

def tracer(frame, event, arg):
    if event == "line" and frame.f_code.co_filename == TARGET and len(steps) < 400:
        loc = {k: repr(v)[:80] for k, v in frame.f_locals.items() if not k.startswith("__")}
        steps.append({"line": frame.f_lineno, "locals": loc})
    return tracer

real_stdout = sys.stdout
sys.stdout = stdout
status, error = "ok", None
sys.settrace(tracer)
try:
    runpy.run_path(TARGET, run_name="__main__")
except SystemExit as exc:
    status = "exit"
    if exc.code not in (0, None):
        error = f"SystemExit({exc.code})"
except BaseException as exc:
    status, error = "error", "".join(traceback.format_exception_only(type(exc), exc)).strip()
finally:
    sys.settrace(None)
    sys.stdout = real_stdout

with open(TRACE, "w", encoding="utf-8") as fh:
    json.dump({"status": status, "error": error, "steps": steps}, fh)
print(stdout.getvalue())
if error:
    print(error, file=sys.stderr)
    # The driver caught the exception, but the *user's program* failed — say so with a
    # non-zero status instead of exiting 0 and letting "ok" read as success.
    if status == "error":
        sys.exit(1)
`;

function runProcess(cmd, args, { cwd, timeoutMs, stdin = '' }) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(cmd, args, {
      cwd,
      env: {
        PATH: process.env.PATH,
        HOME: cwd,
        LANG: 'C.UTF-8',
        PYTHONIOENCODING: 'utf-8',
        PYTHONDONTWRITEBYTECODE: '1',
        NODE_OPTIONS: '--max-old-space-size=256',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (d) => {
      if (stdout.length < MAX_OUTPUT) stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      if (stderr.length < MAX_OUTPUT) stderr += d.toString();
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ exitCode: -1, stdout, stderr: `${stderr}\nspawn error: ${err.message}`, durationMs: Date.now() - started, killed });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({
        exitCode: killed ? -9 : code ?? -1,
        signal,
        stdout: stdout.slice(0, MAX_OUTPUT),
        stderr: stderr.slice(0, MAX_OUTPUT),
        durationMs: Date.now() - started,
        killed,
      });
    });
    if (stdin) child.stdin.write(stdin);
    child.stdin.end();
  });
}

export async function runSandbox({ language = 'python', code = '', stdin = '', timeoutMs = config.limits.sandboxTimeoutMs, trace = true }) {
  const runId = id('run');
  const dir = path.join(config.sandboxDir, runId);
  fs.mkdirSync(dir, { recursive: true });

  try {
    if (language === 'javascript' || language === 'typescript') {
      const file = path.join(dir, language === 'typescript' ? 'main.js' : 'main.mjs');
      fs.writeFileSync(file, code);
      const result = await runProcess(process.execPath, [file], { cwd: dir, timeoutMs, stdin });
      return envelope({
        language,
        runtime: `node ${process.version}`,
        result,
        timeoutMs,
        note: language === 'typescript' ? 'TypeScript was stripped to plain JS shape — TS-only syntax will error.' : null,
      });
    }

    if (language === 'bash') {
      const file = path.join(dir, 'main.sh');
      fs.writeFileSync(file, code);
      const result = await runProcess('bash', [file], { cwd: dir, timeoutMs, stdin });
      return envelope({ language, runtime: 'bash', result, timeoutMs });
    }

    // default: python
    const target = path.join(dir, 'main.py');
    const driver = path.join(dir, '_forge_driver.py');
    const traceFile = path.join(dir, 'trace.json');
    fs.writeFileSync(target, code);
    fs.writeFileSync(driver, DRIVER);
    const result = await runProcess('python3', trace ? [driver, target, traceFile] : [target], { cwd: dir, timeoutMs, stdin });

    let meta = { status: 'ok', error: null, steps: [] };
    try {
      meta = JSON.parse(fs.readFileSync(traceFile, 'utf8'));
    } catch {
      if (result.exitCode !== 0 && /SyntaxError/.test(result.stderr)) meta.status = 'syntax-error';
    }
    if (/SyntaxError/.test(result.stderr)) meta.status = 'syntax-error';
    const pythonVersion = (await runProcess('python3', ['-V'], { cwd: dir, timeoutMs: 4000 })).stdout.trim();
    return envelope({
      language: 'python',
      runtime: pythonVersion || 'python3',
      result,
      timeoutMs,
      steps: meta.steps || [],
      staticStatus: meta.status,
      staticError: meta.error,
    });
  } finally {
    fs.rm(dir, { recursive: true, force: true }, () => {});
  }
}

function envelope({ language, runtime, result, timeoutMs, steps = [], staticStatus, staticError, note }) {
  const ok = !result.killed && result.exitCode === 0;
  return {
    ok,
    language,
    runtime,
    exitCode: result.exitCode,
    signal: result.signal ?? null,
    stdout: result.stdout,
    stderr: result.stderr,
    durationMs: result.durationMs,
    timedOut: Boolean(result.killed),
    timeoutMs,
    steps: steps.slice(0, 200),
    stepCount: steps.length,
    staticStatus,
    staticError,
    note,
    verdict: ok
      ? `Executed for real: ${runtime}, exit code 0 in ${result.durationMs}ms.`
      : result.killed
        ? `Killed after ${timeoutMs}ms — likely an infinite loop or blocking I/O. Exit code -9 (SIGKILL).`
        : `Exited with code ${result.exitCode}. stderr is the actual interpreter/process output, not a summary.`,
  };
}

/** Quick syntax/runtime health check used by the agent before it claims a fix worked. */
export async function checkFile(filePath) {
  const ext = path.extname(filePath);
  if (ext === '.py') return runSandbox({ language: 'python', code: fs.readFileSync(filePath, 'utf8'), timeoutMs: 8000 });
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
    return runSandbox({ language: 'javascript', code: fs.readFileSync(filePath, 'utf8'), timeoutMs: 8000 });
  }
  if (ext === '.json') {
    try {
      JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return { ok: true, language: 'json', stdout: 'valid JSON', stderr: '', exitCode: 0, durationMs: 0, verdict: 'Parsed as JSON.' };
    } catch (err) {
      return { ok: false, language: 'json', stdout: '', stderr: err.message, exitCode: 1, durationMs: 0, verdict: `Invalid JSON: ${err.message}` };
    }
  }
  return { ok: true, language: 'static', stdout: '', stderr: '', exitCode: 0, durationMs: 0, verdict: 'No executor for this file type — checked statically only.' };
}
