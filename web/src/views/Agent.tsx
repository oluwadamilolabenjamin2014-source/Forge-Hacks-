import React from 'react';
import { api, streamAgent, type Workspace } from '../lib/api';
import { Chip, CodeBlock, DiffView, Empty, Panel, SectionTitle, Spinner, Stat } from '../components/ui';

type LedgerEntry = {
  rule: string;
  file: string;
  line: number;
  status: string;
  rationale: string;
  diff: string;
  before?: { passed: number; failed: number };
  after?: { passed: number; failed: number };
};

type Event = { type: string; [key: string]: any };

export default function Agent() {
  const [workspaces, setWorkspaces] = React.useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = React.useState('ledger-api');
  const [files, setFiles] = React.useState<string[]>([]);
  const [openFile, setOpenFile] = React.useState<{ path: string; content: string } | null>(null);
  const [events, setEvents] = React.useState<Event[]>([]);
  const [running, setRunning] = React.useState(false);
  const [ledger, setLedger] = React.useState<LedgerEntry[]>([]);
  const [summary, setSummary] = React.useState<any>(null);
  const [suite, setSuite] = React.useState<any>(null);
  const [instruction, setInstruction] = React.useState('diagnose and repair the failing test suite');
  const [locateQuery, setLocateQuery] = React.useState('');
  const [locate, setLocate] = React.useState<{ hits: { file: string; score: number; excerpt: string }[]; note: string } | null>(null);
  const [changes, setChanges] = React.useState<any>(null);
  const [error, setError] = React.useState<string | null>(null);
  const logRef = React.useRef<HTMLDivElement>(null);
  const cancelRef = React.useRef<(() => void) | null>(null);

  const ws = workspaces.find((w) => w.id === workspaceId);

  const loadWorkspaces = React.useCallback(async () => {
    try {
      const list = await api.workspaces();
      setWorkspaces(list);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  React.useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  React.useEffect(() => {
    api
      .repoFiles(workspaceId)
      .then((r) => setFiles(r.files))
      .catch((err) => setError((err as Error).message));
    api.suite(workspaceId).then(setSuite).catch(() => {});
    api.changes(workspaceId).then(setChanges).catch(() => {});
    setLedger([]);
    setSummary(null);
    setEvents([]);
  }, [workspaceId]);

  React.useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [events]);

  const push = (event: Event) => setEvents((prev) => [...prev, event]);

  const run = () => {
    setRunning(true);
    setError(null);
    setEvents([]);
    setLedger([]);
    setSummary(null);
    cancelRef.current = streamAgent(
      { workspace: workspaceId, instruction, maxRounds: 8 },
      {
        meta: (d) => push({ type: 'meta', ...d }),
        step: (d) => push(d),
        baseline: (d) => push(d),
        advisory: (d) => push(d),
        propose: (d) => push(d),
        diff: (d) => push(d),
        verify: (d) => push(d),
        skip: (d) => push(d),
        locate: (d) => push({ type: 'locate', ...d }),
        note: (d) => push({ type: 'note', ...d }),
        summary: (d) => {
          push(d);
          setSummary(d.summary);
          setLedger(d.ledger || []);
        },
        done: () => {
          setRunning(false);
          api.suite(workspaceId).then(setSuite);
          api.changes(workspaceId).then(setChanges);
        },
        error: (d) => {
          setError(d.message);
          setRunning(false);
        },
      },
    );
  };

  const doReset = async () => {
    const res = await api.resetWorkspace();
    setSuite({ passed: res.suite.passed, failed: res.suite.failed, runner: res.suite.runner, failing: [] });
    setLedger([]);
    setSummary(null);
    setEvents([{ type: 'step', message: `Workspace reset to the seeded state — ${res.suite.passed} passing, ${res.suite.failed} failing.` }]);
    api.changes(workspaceId).then(setChanges);
  };

  const doLocate = async () => {
    if (!locateQuery.trim()) return;
    setLocate(await api.locate(workspaceId, locateQuery));
  };

  return (
    <div className="grid h-full grid-cols-1 gap-4 xl:grid-cols-[240px_minmax(0,1.2fr)_minmax(0,1fr)]">
      {/* file tree */}
      <Panel className="flex min-h-0 flex-col">
        <SectionTitle
          title="Workspace"
          right={
            ws?.writable ? (
              <button type="button" className="btn-ghost btn-xs" onClick={doReset} title="Restore the seeded bugs">
                reset
              </button>
            ) : (
              <Chip tone="warn">read-only</Chip>
            )
          }
        />
        <div className="border-b border-line p-2">
          <select className="input py-1.5 text-xs" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)}>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <p className="mt-2 text-[10.5px] leading-snug text-mist">{ws?.description}</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {files.map((f) => (
            <button
              key={f}
              type="button"
              onClick={async () => setOpenFile(await api.repoFile(workspaceId, f))}
              className={`block w-full truncate rounded-md px-2 py-1.5 text-left font-mono text-[11.5px] transition ${
                openFile?.path === f ? 'bg-ink-700 text-chalk' : 'text-mist hover:bg-ink-700/50'
              }`}
            >
              {f}
            </button>
          ))}
          {files.length === 0 && <p className="px-2 py-2 text-[11.5px] text-mist">No readable files.</p>}
        </div>
        {suite && (
          <div className="border-t border-line p-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-mist">suite</span>
              <Chip tone={suite.failed === 0 ? 'ok' : 'bad'}>
                {suite.passed} pass / {suite.failed} fail
              </Chip>
            </div>
            {suite.failing?.slice(0, 6).map((f: any, i: number) => (
              <p key={i} className="mt-1 truncate text-[10.5px] text-rose" title={f.error}>
                ✗ {f.test}
              </p>
            ))}
          </div>
        )}
      </Panel>

      {/* run column */}
      <div className="flex min-h-0 flex-col gap-4">
        <Panel>
          <SectionTitle
            title="Agentic repair loop"
            subtitle="scan → propose → apply → run the suite → keep or revert. A change survives only if the interpreter agrees; reverts are recorded too."
            right={<Chip tone={ws?.writable ? 'info' : 'warn'}>{ws?.writable ? 'writable' : 'read-only'}</Chip>}
          />
          <div className="space-y-3 p-4">
            <input className="input" value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="what should the agent do?" />
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary" onClick={run} disabled={running}>
                {running ? 'running…' : 'Run agent'}
              </button>
              {running && (
                <button type="button" className="btn-ghost" onClick={() => { cancelRef.current?.(); setRunning(false); }}>
                  stop
                </button>
              )}
              <button type="button" className="btn-ghost" onClick={() => api.scaffold(workspaceId, 'ci', undefined, false).then((r) => push({ type: 'plan', plan: r.plan }))}>
                preview CI workflow
              </button>
              <button type="button" className="btn-ghost" onClick={() => api.scaffold(workspaceId, 'gitignore', undefined, false).then((r) => push({ type: 'plan', plan: r.plan }))}>
                preview .gitignore
              </button>
            </div>
            {error && <p className="rounded-lg border border-rose/40 bg-rose/5 px-3 py-2 text-xs text-rose">{error}</p>}
          </div>
        </Panel>

        <Panel className="flex min-h-0 flex-1 flex-col">
          <SectionTitle title="Run log" subtitle="Streamed live over SSE — this is the agent narrating its own verification, including the changes it threw away." />
          <div ref={logRef} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3" style={{ maxHeight: '30rem' }}>
            {events.length === 0 && <Empty title="No run yet" body="Press Run agent. With the seeded revision, expect a red suite, six verified repairs, and a green suite at the end." />}
            {events.map((e, i) => (
              <LogLine key={i} event={e} />
            ))}
            {running && <Spinner label="working" />}
          </div>
        </Panel>

        {changes?.available && (
          <Panel>
            <SectionTitle
              title="Repository state"
              subtitle="Real git: the workspace is a repo, so every agent edit is a reviewable diff you can commit or discard."
              right={
                <button
                  type="button"
                  className="btn-ghost btn-xs"
                  onClick={async () => {
                    await api.commit(workspaceId, 'fix: repairs verified by the test suite');
                    setChanges(await api.changes(workspaceId));
                  }}
                >
                  commit changes
                </button>
              }
            />
            <div className="space-y-2 p-3">
              <div className="flex flex-wrap gap-1.5">
                {(changes.dirty || []).length === 0 ? <Chip tone="ok">working tree clean</Chip> : (changes.dirty || []).map((d: any) => (
                  <span key={d.file} className="chip font-mono">
                    {d.state} {d.file}
                  </span>
                ))}
              </div>
              {(changes.log || []).map((l: string) => (
                <p key={l} className="font-mono text-[11px] text-mist">
                  {l}
                </p>
              ))}
              {changes.diffStat && <CodeBlock code={changes.diffStat} language="git diff --stat" maxHeight="8rem" />}
            </div>
          </Panel>
        )}
      </div>

      {/* right column */}
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
        {summary && (
          <Panel>
            <SectionTitle title="Result" subtitle={summary.kept !== undefined ? `${summary.kept} change(s) kept · ${summary.reverted} reverted` : 'run summary'} />
            <div className="space-y-3 p-4">
              {summary.baseline ? (
                <div className="card-grid">
                  <Stat label="before" value={`${summary.baseline.passed} / ${summary.baseline.passed + summary.baseline.failed}`} hint="tests passing" />
                  <Stat
                    label="after"
                    value={`${summary.final.passed} / ${summary.final.passed + summary.final.failed}`}
                    tone={summary.final.failed === 0 ? 'ok' : 'bad'}
                    hint={summary.final.failed === 0 ? 'suite green' : `${summary.final.failed} still failing`}
                  />
                  <Stat label="runtime" value={`${(summary.durationMs / 1000).toFixed(1)}s`} hint={`runner: ${summary.runner}`} />
                </div>
              ) : (
                <CodeBlock code={JSON.stringify(summary, null, 2)} language="json" />
              )}
              <p className="text-[11.5px] leading-relaxed text-mist">
                Honest failure is a feature: when a candidate fix does not move the suite, it is reverted and labelled. That is the whole difference between an agent and a code generator with a confident tone.
              </p>
            </div>
          </Panel>
        )}

        {ledger.length > 0 && (
          <Panel>
            <SectionTitle title="Change ledger" subtitle="Every applied edit, with the before/after test counts and the reasoning that produced it." />
            <div className="space-y-3 p-3">
              {ledger.map((entry, i) => (
                <details key={i} className="panel-tight px-3 py-2" open={i < 3}>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-[12.5px]">
                    <Chip tone={entry.status === 'kept' ? 'ok' : 'bad'}>{entry.status}</Chip>
                    <span className="font-mono text-chalk">{entry.rule}</span>
                    <span className="font-mono text-[11px] text-mist">
                      {entry.file}:{entry.line}
                    </span>
                    {entry.before && entry.after && (
                      <span className="ml-auto font-mono text-[11px] text-mist">
                        {entry.before.failed} fail → {entry.after.failed} fail
                      </span>
                    )}
                  </summary>
                  <p className="mt-2 text-[12px] leading-relaxed text-mist">{entry.rationale}</p>
                  {entry.diff && <div className="mt-2">
                    <DiffView diff={entry.diff} maxHeight="14rem" />
                  </div>}
                </details>
              ))}
            </div>
          </Panel>
        )}

        <Panel>
          <SectionTitle title="Locate code" subtitle="BM25 over every indexed file — the 'where is this handled?' question, answered with citations instead of a guess." />
          <div className="space-y-3 p-3">
            <div className="flex gap-2">
              <input className="input" value={locateQuery} onChange={(e) => setLocateQuery(e.target.value)} placeholder="e.g. where do we sum totals?" onKeyDown={(e) => e.key === 'Enter' && doLocate()} />
              <button type="button" className="btn-ghost" onClick={doLocate}>
                find
              </button>
            </div>
            {locate && (
              <div className="space-y-2">
                <p className="text-[11px] text-mist">{locate.note}</p>
                {locate.hits.map((h, i) => (
                  <div key={i} className="panel-tight px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11.5px] text-sky">{h.file}</span>
                      <span className="font-mono text-[11px] text-mist">score {h.score.toFixed(2)}</span>
                    </div>
                    <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] text-chalk/80">{h.excerpt.slice(0, 320)}</pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Panel>

        {openFile && (
          <Panel className="flex min-h-0 flex-col">
            <SectionTitle title={openFile.path} subtitle={`${openFile.content.split('\n').length} lines · ${ws?.writable ? 'writable workspace' : 'read-only mount'}`} />
            <div className="p-3">
              <CodeBlock code={openFile.content} language={openFile.path.split('.').pop()} maxHeight="28rem" />
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

function LogLine({ event }: { event: Event }) {
  const { type } = event;
  if (type === 'meta') {
    return (
      <p className="font-mono text-[11px] text-mist">
        workspace <span className="text-sky">{event.workspace}</span> · {event.root}
      </p>
    );
  }
  if (type === 'baseline') {
    return (
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <Chip tone="bad">baseline</Chip>
        <span className="text-chalk">{event.message}</span>
      </div>
    );
  }
  if (type === 'propose') {
    return (
      <div className="rounded-lg border border-sky/25 bg-sky/5 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <Chip tone="info">propose</Chip>
          <span className="font-mono text-chalk">{event.rule}</span>
          <span className="font-mono text-[11px] text-mist">
            {event.file}:{event.line}
          </span>
          <span className="font-mono text-[11px] text-mist">conf {event.confidence}</span>
        </div>
        <p className="mt-1 text-[11.5px] leading-relaxed text-mist">{event.rationale}</p>
      </div>
    );
  }
  if (type === 'verify') {
    const kept = event.verdict === 'kept';
    return (
      <div className={`rounded-lg border px-3 py-2 ${kept ? 'border-mint/30 bg-mint/5' : 'border-rose/30 bg-rose/5'}`}>
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <Chip tone={kept ? 'ok' : 'bad'}>{kept ? 'kept' : 'reverted'}</Chip>
          <span className="font-mono text-chalk">{event.rule}</span>
          <span className="ml-auto font-mono text-[11px] text-mist">
            {event.passed} pass / {event.failed} fail
          </span>
        </div>
        <p className="mt-1 text-[11.5px] leading-relaxed text-mist">{event.message}</p>
      </div>
    );
  }
  if (type === 'diff') {
    return (
      <details className="panel-tight px-3 py-2">
        <summary className="cursor-pointer text-[11.5px] text-mist">
          diff · <span className="font-mono text-chalk">{event.file}</span>
        </summary>
        <div className="mt-2">
          <DiffView diff={event.diff} maxHeight="12rem" />
        </div>
      </details>
    );
  }
  if (type === 'advisory') {
    return (
      <details className="rounded-lg border border-forge/30 bg-forge/5 px-3 py-2">
        <summary className="cursor-pointer text-[12px] text-forge-soft">{event.items.length} item(s) needing a human decision (not auto-applied)</summary>
        <ul className="mt-2 space-y-1">
          {event.items.map((it: any, i: number) => (
            <li key={i} className="text-[11.5px] text-mist">
              <span className="font-mono text-chalk">{it.rule}</span> — {it.file}: {it.rationale}
            </li>
          ))}
        </ul>
      </details>
    );
  }
  if (type === 'summary') {
    return (
      <div className="rounded-lg border border-mint/30 bg-mint/5 px-3 py-2 text-[12px] text-chalk">
        <Chip tone="ok">summary</Chip> <span className="ml-2">{event.message}</span>
      </div>
    );
  }
  if (type === 'plan') {
    return (
      <details className="panel-tight px-3 py-2">
        <summary className="cursor-pointer text-[11.5px] text-mist">scaffold preview (nothing written)</summary>
        <div className="mt-2 space-y-2">
          {(event.plan || []).map((p: any) => (
            <div key={p.path}>
              <p className="font-mono text-[11.5px] text-chalk">{p.path}</p>
              <p className="text-[11px] text-mist">{p.rationale}</p>
              <CodeBlock code={p.content} language={p.path.split('.').pop()} maxHeight="10rem" />
            </div>
          ))}
        </div>
      </details>
    );
  }
  return <p className="font-mono text-[11.5px] leading-relaxed text-mist">{event.message}</p>;
}
