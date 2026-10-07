import React from 'react';
import { api } from '../lib/api';
import { Chip, CodeBlock, Panel, SectionTitle, Spinner, Stat } from '../components/ui';

const STARTERS: Record<string, string> = {
  python: `# Forge runs this in a real subprocess and reports the actual exit code.
def primes_up_to(limit: int) -> list[int]:
    sieve = bytearray([1]) * (limit + 1)
    sieve[0:2] = b"\\x00\\x00"
    for p in range(2, int(limit ** 0.5) + 1):
        if sieve[p]:
            sieve[p * p :: p] = bytearray(len(sieve[p * p :: p]))
    return [i for i, ok in enumerate(sieve) if ok]

print("primes under 50:", primes_up_to(50))

import sys
print("python:", sys.version.split()[0])
`,
  javascript: `// Node executes this for real; stderr is the runtime's, not a summary.
const entries = [
  { id: '1', amount: 1250.75 },
  { id: '2', amount: 90.5 },
];

const total = entries.reduce((sum, e) => sum + e.amount, 0);
console.log('total:', total.toFixed(2));
console.log('sorted:', entries.map((e) => e.amount).sort((a, b) => a - b));
console.log('node:', process.version);
`,
  bash: `#!/usr/bin/env bash
set -euo pipefail
echo "uname: $(uname -srm)"
echo "files here: $(ls -1 | wc -l)"
for i in 1 2 3; do echo "tick $i"; done
`,
};

type RunResult = {
  ok: boolean;
  language: string;
  runtime: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  steps: { line: number; locals: Record<string, string> }[];
  stepCount: number;
  staticStatus?: string;
  staticError?: string;
  verdict: string;
};

export default function Sandbox({
  initialCode,
  initialLanguage,
}: {
  initialCode?: string;
  initialLanguage?: string;
}) {
  const [language, setLanguage] = React.useState(initialLanguage && STARTERS[initialLanguage] ? initialLanguage : 'python');
  const [code, setCode] = React.useState(initialCode || STARTERS.python);
  const [stdin, setStdin] = React.useState('');
  const [result, setResult] = React.useState<RunResult | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [limits, setLimits] = React.useState<Record<string, any> | null>(null);
  const [genPrompt, setGenPrompt] = React.useState('write a python function that finds the longest palindromic substring');
  const [generated, setGenerated] = React.useState<any>(null);
  const [genBusy, setGenBusy] = React.useState(false);

  React.useEffect(() => {
    api.runtimes().then((r) => setLimits(r.limits)).catch(() => {});
  }, []);

  React.useEffect(() => {
    if (initialCode) {
      setCode(initialCode);
      if (initialLanguage && STARTERS[initialLanguage]) setLanguage(initialLanguage);
    }
  }, [initialCode, initialLanguage]);

  const run = async () => {
    setBusy(true);
    try {
      setResult(await api.runCode({ language, code, stdin }));
    } catch (err) {
      setResult(null);
      alert((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const generate = async () => {
    setGenBusy(true);
    try {
      const res = await api.generateAndRun(genPrompt);
      setGenerated(res);
      setCode(res.code);
      setLanguage(res.language === 'javascript' ? 'javascript' : 'python');
      if (res.execution && !res.execution.skipped) setResult(res.execution as unknown as RunResult);
    } finally {
      setGenBusy(false);
    }
  };

  return (
    <div className="grid h-full grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="flex min-h-0 flex-col gap-4">
        <Panel className="flex min-h-0 flex-1 flex-col">
          <SectionTitle
            title="Sandbox"
            subtitle="Executes in a fresh temp directory with a scrubbed environment, a hard wall-clock timeout, capped output, and SIGKILL if it runs long. Real exit codes."
            right={
              <div className="flex items-center gap-2">
                <select className="input max-w-[160px] py-1 text-xs" value={language} onChange={(e) => { setLanguage(e.target.value); setCode(STARTERS[e.target.value]); }}>
                  <option value="python">Python 3</option>
                  <option value="javascript">Node.js</option>
                  <option value="bash">Bash</option>
                </select>
                <button type="button" className="btn-primary btn-xs" onClick={run} disabled={busy}>
                  {busy ? 'running…' : 'Run ▶'}
                </button>
              </div>
            }
          />
          <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
            <textarea
              className="input min-h-[300px] flex-1 resize-none font-mono text-[12.5px] leading-relaxed"
              value={code}
              spellCheck={false}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Tab') {
                  e.preventDefault();
                  const el = e.currentTarget;
                  const start = el.selectionStart;
                  setCode(code.slice(0, start) + '    ' + code.slice(el.selectionEnd));
                  requestAnimationFrame(() => el.setSelectionRange(start + 4, start + 4));
                }
              }}
            />
            <details className="panel-tight px-3 py-2">
              <summary className="cursor-pointer text-[11.5px] text-mist">stdin (optional)</summary>
              <textarea className="input mt-2 min-h-[60px] font-mono text-[12px]" value={stdin} onChange={(e) => setStdin(e.target.value)} placeholder="lines fed to the process on stdin" />
            </details>
          </div>
        </Panel>

        <Panel>
          <SectionTitle
            title="Generate and run"
            subtitle="The code-writing surface: describe a function, Forge writes it from a template library and executes it immediately. The exit code below is the interpreter's, not an assertion."
            right={<Chip tone="accent">generate → execute → report</Chip>}
          />
          <div className="space-y-3 p-4">
            <div className="flex flex-wrap gap-2">
              <input className="input flex-1" value={genPrompt} onChange={(e) => setGenPrompt(e.target.value)} />
              <button type="button" className="btn-primary" onClick={generate} disabled={genBusy}>
                {genBusy ? 'generating…' : 'Generate + run'}
              </button>
            </div>
            {generated && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Chip tone="info">{generated.language}</Chip>
                  <Chip>intent: {generated.intent}</Chip>
                  <Chip>{generated.filename}</Chip>
                </div>
                <div>
                  <p className="label mb-1">Assumptions — check these first</p>
                  <ul className="space-y-1">
                    {generated.assumptions.map((a: string, i: number) => (
                      <li key={i} className="text-[11.5px] text-mist">
                        • {a}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-ghost btn-xs" onClick={() => setCode(generated.code)}>
                    load into editor
                  </button>
                  <button type="button" className="btn-ghost btn-xs" onClick={() => { setCode(generated.tests); setLanguage(generated.language === 'javascript' ? 'javascript' : 'python'); }}>
                    load the generated tests
                  </button>
                </div>
                <CodeBlock code={generated.runCommand} language="bash" maxHeight="4rem" />
              </div>
            )}
          </div>
        </Panel>
      </div>

      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
        {result && (
          <Panel>
            <SectionTitle
              title="Run result"
              subtitle={result.verdict}
              right={<Chip tone={result.ok ? 'ok' : result.timedOut ? 'warn' : 'bad'}>exit {result.exitCode}</Chip>}
            />
            <div className="space-y-3 p-4">
              <div className="card-grid">
                <Stat label="runtime" value={result.runtime} hint={`${result.durationMs} ms wall clock`} />
                <Stat label="steps traced" value={result.stepCount || '—'} hint="line-level trace, python only" />
                <Stat label="timeout" value={result.timedOut ? 'killed' : 'clean exit'} tone={result.timedOut ? 'bad' : 'ok'} hint={`limit ${limits?.timeoutMs ?? 6000} ms`} />
              </div>
              <div>
                <p className="label mb-1">stdout</p>
                <CodeBlock code={result.stdout || '(empty)'} language="stdout" maxHeight="16rem" />
              </div>
              {result.stderr && (
                <div>
                  <p className="label mb-1">stderr — the process's own output</p>
                  <CodeBlock code={result.stderr} language="stderr" maxHeight="12rem" />
                </div>
              )}
              {result.staticError && <p className="rounded-lg border border-rose/40 bg-rose/5 px-3 py-2 text-xs text-rose">{result.staticError}</p>}
              {result.steps?.length > 0 && (
                <details className="panel-tight px-3 py-2">
                  <summary className="cursor-pointer text-[11.5px] text-mist">execution trace — first {Math.min(result.steps.length, 40)} line(s) with local variables</summary>
                  <div className="mt-2 max-h-64 overflow-auto">
                    <table className="w-full text-[11px]">
                      <tbody>
                        {result.steps.slice(0, 40).map((s, i) => (
                          <tr key={i} className="border-b border-line/50">
                            <td className="py-1 pr-3 font-mono text-forge">L{s.line}</td>
                            <td className="py-1 font-mono text-chalk/80">
                              {Object.entries(s.locals)
                                .map(([k, v]) => `${k}=${v}`)
                                .join('  ') || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </div>
          </Panel>
        )}

        <Panel>
          <SectionTitle title="Isolation — what this is and is not" subtitle="Stated in the UI because a sandbox that oversells itself is a security bug waiting to happen." />
          <div className="space-y-2 p-4 text-[12px] leading-relaxed text-mist">
            <p>
              <strong className="text-chalk">What it is:</strong> process isolation. A fresh temp directory per run, a scrubbed environment (no inherited secrets), a hard timeout with SIGKILL, capped stdout/stderr, and no expectation of network access.
            </p>
            <p>
              <strong className="text-chalk">What it is not:</strong> a security boundary. A determined payload can still reach the filesystem the server can read. For untrusted code, run this inside a container or VM with a read-only filesystem and no network.
            </p>
            {limits && (
              <div className="flex flex-wrap gap-2 pt-1">
                <Chip>timeout {String(limits.timeoutMs)} ms</Chip>
                <Chip>max output 64 KB</Chip>
                <Chip>{String(limits.isolation)}</Chip>
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
