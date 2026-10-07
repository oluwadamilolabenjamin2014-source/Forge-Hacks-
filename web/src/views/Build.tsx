import React from 'react';
import { api, type Project } from '../lib/api';
import { Chip, CodeBlock, Empty, Markdown, Panel, SectionTitle, Spinner, Stat } from '../components/ui';
import { formatBytes, timeAgo } from '../lib/markdown';

const EXAMPLES = [
  'build an app that tracks my reading list with a rating and notes',
  'build an expense tracker with a category, amount and reimbursable flag',
  'build an app to track job applications with stage, applied date and salary',
  'build a workout log with duration, load and effort',
  'build a CRM for contacts with company, stage and last contact date',
  'build an app to track inventory with sku, quantity and reorder threshold',
];

export default function Build() {
  const [prompt, setPrompt] = React.useState(EXAMPLES[0]);
  const [name, setName] = React.useState('');
  const [plan, setPlan] = React.useState<{ spec: any; matchedLibraryEntity: boolean; files: string[]; note: string } | null>(null);
  const [busy, setBusy] = React.useState<'plan' | 'build' | null>(null);
  const [result, setResult] = React.useState<{
    project: Project;
    testRun: { runner: string; passed: number; failed: number; ok: boolean; failing: { test: string; error: string }[]; output: string; verdict: string };
  } | null>(null);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [selected, setSelected] = React.useState<Project | null>(null);
  const [file, setFile] = React.useState<{ path: string; content: string; lines: number } | null>(null);
  const [deploy, setDeploy] = React.useState<{ verdict: string; port: number; pid: number; logs: string[] } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [previewKey, setPreviewKey] = React.useState(0);

  const refresh = React.useCallback(async () => {
    try {
      setProjects(await api.projects());
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 8000);
    return () => clearInterval(timer);
  }, [refresh]);

  const doPlan = async () => {
    setBusy('plan');
    setError(null);
    try {
      setPlan(await api.planProject(prompt, name || undefined));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const doBuild = async () => {
    setBusy('build');
    setError(null);
    setDeploy(null);
    try {
      const res = await api.createProject(prompt, name || undefined);
      setResult(res);
      setSelected(res.project);
      await refresh();
      const first = res.project.files.find((f) => f.path === 'server.js') || res.project.files[0];
      if (first) setFile(await api.projectFile(res.project.slug, first.path));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const openProject = async (slug: string) => {
    const p = await api.project(slug);
    setSelected(p);
    const first = p.fileList?.find((f) => f.endsWith('server.js')) || p.fileList?.[0];
    if (first) setFile(await api.projectFile(slug, first));
  };

  const deployProject = async (slug: string) => {
    setBusy('build');
    try {
      setDeploy(await api.deployProject(slug));
      setPreviewKey((k) => k + 1);
      await refresh();
      await openProject(slug);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid h-full grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
        <Panel>
          <SectionTitle
            title="Describe the app"
            subtitle="Forge picks a data model, generates a zero-dependency Node backend with a no-build dashboard, writes real integration tests, then runs them and shows the interpreter's verdict."
            right={<Chip tone="accent">plain English in → running software out</Chip>}
          />
          <div className="space-y-3 p-4">
            <textarea className="input min-h-[86px] resize-y" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="build an app that…" />
            <div className="flex flex-wrap items-center gap-2">
              <input className="input max-w-[220px]" value={name} onChange={(e) => setName(e.target.value)} placeholder="app name (optional)" />
              <button type="button" className="btn-ghost" onClick={doPlan} disabled={busy !== null}>
                {busy === 'plan' ? <Spinner label="planning" /> : 'preview data model'}
              </button>
              <button type="button" className="btn-primary" onClick={doBuild} disabled={busy !== null || !prompt.trim()}>
                {busy === 'build' ? 'building…' : 'Build it'}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((e) => (
                <button key={e} type="button" className="chip hover:border-mist/40" onClick={() => setPrompt(e)}>
                  {e.replace(/^build an? /, '')}
                </button>
              ))}
            </div>
            {error && <p className="rounded-lg border border-rose/40 bg-rose/5 px-3 py-2 text-xs text-rose">{error}</p>}
          </div>
        </Panel>

        {plan && (
          <Panel>
            <SectionTitle title="Plan" subtitle={plan.note} right={plan.matchedLibraryEntity ? <Chip tone="ok">curated model match</Chip> : <Chip tone="warn">inferred model</Chip>} />
            <div className="space-y-3 p-4">
              <div className="flex flex-wrap gap-1.5">
                {plan.files.map((f) => (
                  <span key={f} className="chip font-mono">{f}</span>
                ))}
              </div>
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr className="text-mist">
                    <th className="border-b border-line px-2 py-1 text-left">field</th>
                    <th className="border-b border-line px-2 py-1 text-left">type</th>
                    <th className="border-b border-line px-2 py-1 text-left">required</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.spec.fields.map((f: any) => (
                    <tr key={f.name}>
                      <td className="border-b border-line/60 px-2 py-1 font-mono text-chalk/90">{f.name}</td>
                      <td className="border-b border-line/60 px-2 py-1 text-mist">
                        {f.type}
                        {f.options ? ` (${f.options.join(' / ')})` : ''}
                      </td>
                      <td className="border-b border-line/60 px-2 py-1 text-mist">{f.required ? 'yes' : 'no'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        {result && (
          <Panel>
            <SectionTitle
              title="Verification"
              subtitle="These are the results of actually running the generated suite (`node --test`) against the generated server — not a claim that it should work."
              right={result.testRun.ok ? <Chip tone="ok">green</Chip> : <Chip tone="bad">failing</Chip>}
            />
            <div className="space-y-3 p-4">
              <div className="card-grid">
                <Stat label="tests passed" value={result.testRun.passed} tone="ok" hint={`runner: ${result.testRun.runner}`} />
                <Stat label="tests failed" value={result.testRun.failed} tone={result.testRun.failed ? 'bad' : 'default'} hint="real assertions, real HTTP calls" />
                <Stat label="files written" value={result.project.fileCount} hint={`${result.project.seedCount} seed rows`} />
              </div>
              <p className="rounded-lg border border-line bg-ink-850/60 px-3 py-2 text-xs text-mist">{result.testRun.verdict}</p>
              {result.testRun.failing.length > 0 && (
                <ul className="space-y-1">
                  {result.testRun.failing.map((f, i) => (
                    <li key={i} className="font-mono text-[11.5px] text-rose">
                      ✗ {f.test} — {f.error}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-primary" onClick={() => deployProject(result.project.slug)}>
                  Deploy as its own process
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={async () => {
                    const suite = await api.projectTest(result.project.slug);
                    setResult({ ...result, testRun: { ...result.testRun, ...suite, output: suite.stdout } });
                  }}
                >
                  Re-run the suite
                </button>
              </div>
              <CodeBlock code={result.testRun.output.slice(-1800) || '(no runner output)'} language="test output" maxHeight="14rem" />
            </div>
          </Panel>
        )}

        {deploy && (
          <Panel>
            <SectionTitle title="Deployment" subtitle={deploy.verdict} right={<Chip tone="ok">pid {deploy.pid}</Chip>} />
            <div className="space-y-2 p-4">
              <CodeBlock code={deploy.logs.join('\n') || '(no logs)'} language="process logs" maxHeight="10rem" />
              <p className="text-[11.5px] text-mist">
                The preview pane on the right loads <span className="font-mono text-chalk">{selected?.url}</span> — Forge reverse-proxies it to
                <span className="font-mono text-chalk"> 127.0.0.1:{deploy.port}</span>, so you are looking at the real child process.
              </p>
            </div>
          </Panel>
        )}

        <Panel>
          <SectionTitle title="Projects" subtitle="Everything Forge has generated, on disk under server/.forge/projects." />
          <div className="divide-y divide-line">
            {projects.length === 0 && <Empty title="No projects yet" body="Build one above — it will appear here with its test results and deployment state." />}
            {projects.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <button type="button" className="min-w-0 text-left" onClick={() => openProject(p.slug)}>
                  <span className="block text-[13px] font-medium text-chalk">{p.name}</span>
                  <span className="block truncate text-[11.5px] text-mist">
                    {p.collection} · {p.fileCount} files · {timeAgo(p.createdAt)}
                  </span>
                </button>
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone={p.tests.ok ? 'ok' : 'bad'}>
                    {p.tests.passed}/{p.tests.passed + p.tests.failed} tests
                  </Chip>
                  {p.running ? <Chip tone="info">running :{p.port}</Chip> : <Chip>stopped</Chip>}
                  {p.running ? (
                    <button type="button" className="btn-danger btn-xs" onClick={() => api.stopProject(p.slug).then(refresh)}>
                      stop
                    </button>
                  ) : (
                    <button type="button" className="btn-ghost btn-xs" onClick={() => deployProject(p.slug)}>
                      deploy
                    </button>
                  )}
                  <button type="button" className="btn-ghost btn-xs" onClick={() => openProject(p.slug)}>
                    files
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="flex min-h-0 flex-col gap-4">
        {selected?.running && selected.url && (
          <Panel className="flex min-h-[320px] flex-1 flex-col overflow-hidden">
            <SectionTitle
              title={`Live preview — ${selected.name}`}
              subtitle={`Proxied to the child process on port ${selected.port}. It is a real app: data persists to its own JSON store.`}
              right={
                <div className="flex items-center gap-2">
                  <button type="button" className="btn-ghost btn-xs" onClick={() => setPreviewKey((k) => k + 1)}>
                    reload
                  </button>
                  <a className="btn-ghost btn-xs" href={selected.url} target="_blank" rel="noreferrer">
                    open ↗
                  </a>
                </div>
              }
            />
            <iframe key={previewKey} src={selected.url} className="min-h-0 flex-1 border-0 bg-ink-950" title={`${selected.name} preview`} />
          </Panel>
        )}

        {file && (
          <Panel className="flex min-h-0 flex-1 flex-col">
            <SectionTitle
              title={file.path}
              subtitle={`${file.lines} lines — generated source, no build step, no dependencies.`}
              right={
                <select
                  className="input max-w-[240px] py-1 text-xs"
                  value={file.path}
                  onChange={async (e) => selected && setFile(await api.projectFile(selected.slug, e.target.value))}
                >
                  {(selected?.fileList || selected?.files.map((f) => f.path) || []).map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              }
            />
            <div className="min-h-0 flex-1 overflow-auto p-3">
              <CodeBlock code={file.content} language={file.path.split('.').pop()} maxHeight="none" />
            </div>
          </Panel>
        )}

        {!file && !selected?.running && (
          <Panel className="flex flex-1 items-center justify-center">
            <Empty
              title="Nothing selected"
              body={
                <>
                  Build an app to see its generated source here. Everything is ordinary code you can edit: the API is a hand-rolled Node
                  <span className="font-mono"> http </span> server, the UI is plain DOM with no framework, and the tests are <span className="font-mono">node:test</span>.
                </>
              }
            />
          </Panel>
        )}

        {selected && (
          <Panel>
            <SectionTitle title="Generated files" subtitle={selected.description} />
            <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
              {(selected.fileList || selected.files.map((f) => f.path)).map((f) => (
                <button
                  key={f}
                  type="button"
                  className="panel-tight px-2.5 py-2 text-left text-[11.5px] text-chalk transition hover:border-forge/40"
                  onClick={async () => setFile(await api.projectFile(selected.slug, f))}
                >
                  <span className="block truncate font-mono">{f}</span>
                  <span className="block text-[10.5px] text-mist">
                    {formatBytes(selected.files.find((x) => x.path === f)?.bytes || 0)}
                  </span>
                </button>
              ))}
            </div>
          </Panel>
        )}

        <Panel>
          <SectionTitle title="What the generated app includes" subtitle="Every generated project ships these, wired up and tested." />
          <div className="grid gap-2 p-3 text-[12px] text-mist sm:grid-cols-2">
            {[
              'CRUD API with field-level validation (422 + error list)',
              'Search, filtering, sorting and pagination',
              'Aggregates: sum / mean / min / max + breakdowns',
              'CSV export of the current filter',
              'Atomic JSON persistence (no half-written files)',
              'Path-traversal guard + size limits',
              'Dashboard with live health pill and stats cards',
              '12 integration tests run with node --test',
            ].map((f) => (
              <div key={f} className="flex items-start gap-2">
                <span className="mt-0.5 text-mint">✓</span>
                <span>{f}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
