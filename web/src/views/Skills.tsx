import React from 'react';
import { api, type Skill, type SkillRun } from '../lib/api';
import { Chip, Empty, Markdown, Panel, SectionTitle, Spinner, Toggle } from '../components/ui';
import { timeAgo } from '../lib/markdown';

const TEMPLATE = `# My workflow

1. **Step one** — what to look at first, and what a good answer looks like.
2. **Step two** — the check that catches the mistake a rushed pass would make.
3. **Step three** — the output, in the exact shape you want to paste somewhere.
`;

export default function Skills() {
  const [skills, setSkills] = React.useState<Skill[]>([]);
  const [starters, setStarters] = React.useState<{ slug: string; name: string; description: string; stepsHint: number }[]>([]);
  const [active, setActive] = React.useState<(Skill & { content: string; parsedSteps: { title: string; instruction: string }[] }) | null>(null);
  const [editing, setEditing] = React.useState({ name: '', description: '', content: TEMPLATE });
  const [input, setInput] = React.useState('');
  const [run, setRun] = React.useState<SkillRun | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [useDocs, setUseDocs] = React.useState(true);

  const refresh = React.useCallback(async () => {
    try {
      const data = await api.skills();
      setSkills(data.skills);
      setStarters(data.starters);
      if (data.skills.length && !active) {
        const first = await api.skill(data.skills[0].slug);
        setActive(first);
        setEditing({ name: first.name, description: first.description, content: first.content });
      }
    } catch {
      /* ignore */
    }
  }, [active]);

  React.useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open = async (slug: string) => {
    const skill = await api.skill(slug);
    setActive(skill);
    setEditing({ name: skill.name, description: skill.description, content: skill.content });
    setRun(null);
  };

  const save = async () => {
    setBusy(true);
    try {
      const saved = await api.saveSkill(editing);
      await refresh();
      await open(saved.slug);
    } finally {
      setBusy(false);
    }
  };

  const runSkill = async () => {
    if (!active) return;
    setBusy(true);
    setRun(null);
    try {
      const docs = useDocs ? (await api.documents()).slice(0, 3).map((d) => d.id) : [];
      setRun(await api.runSkill(active.slug, { input, documentIds: docs }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid h-full grid-cols-1 gap-4 xl:grid-cols-[260px_minmax(0,1fr)_minmax(0,1.1fr)]">
      <Panel className="flex min-h-0 flex-col">
        <SectionTitle title="Skills" subtitle="Reusable markdown workflows. A skill is a file, so a review comment on step 3 applies to every future run." right={<button type="button" className="btn-ghost btn-xs" onClick={() => { setActive(null); setEditing({ name: '', description: '', content: TEMPLATE }); setRun(null); }}>new</button>} />
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {skills.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => open(s.slug)}
              className={`mb-1 block w-full rounded-lg px-2.5 py-2 text-left transition ${active?.slug === s.slug ? 'bg-ink-700/80' : 'hover:bg-ink-700/40'}`}
            >
              <span className="block truncate text-[12.5px] text-chalk">{s.name}</span>
              <span className="mt-0.5 block text-[10.5px] text-mist">
                rev {s.revision} · {s.steps} steps · {s.runs} run{s.runs === 1 ? '' : 's'}
              </span>
            </button>
          ))}
          {skills.length === 0 && <p className="px-2 py-2 text-[11.5px] text-mist">No skills yet — start from a template on the right.</p>}
        </div>
        <div className="border-t border-line p-2">
          <p className="label mb-2 px-1">Starters</p>
          {starters.map((s) => (
            <button
              key={s.slug}
              type="button"
              className="mb-1 block w-full rounded-lg border border-line px-2.5 py-2 text-left transition hover:border-forge/40"
              onClick={async () => {
                await api.starterSkill(s.slug);
                await refresh();
                await open(s.slug);
              }}
            >
              <span className="block text-[12px] text-chalk">{s.name}</span>
              <span className="mt-0.5 block text-[10.5px] leading-snug text-mist">{s.description}</span>
            </button>
          ))}
        </div>
      </Panel>

      <div className="flex min-h-0 flex-col gap-4">
        <Panel className="flex min-h-0 flex-1 flex-col">
          <SectionTitle
            title={active ? `Edit — ${active.name}` : 'New skill'}
            subtitle="Markdown with a numbered step list. The runner parses the list and executes the steps in order — that fixed order is the whole point."
            right={
              <div className="flex items-center gap-2">
                {active && <Chip tone="info">revision {active.revision}</Chip>}
                <button type="button" className="btn-primary btn-xs" onClick={save} disabled={busy || !editing.name || !editing.content}>
                  {busy ? 'saving…' : 'save'}
                </button>
              </div>
            }
          />
          <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="skill name" />
              <input className="input" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="one-line description" />
            </div>
            <textarea
              className="input min-h-[320px] flex-1 resize-none font-mono text-[12.5px] leading-relaxed"
              value={editing.content}
              spellCheck={false}
              onChange={(e) => setEditing({ ...editing, content: e.target.value })}
            />
            {active && (
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="btn-danger btn-xs" onClick={() => api.deleteSkill(active.slug).then(() => { setActive(null); refresh(); })}>
                  delete
                </button>
                <span className="text-[11px] text-mist">last edited {timeAgo(active.updatedAt)}</span>
                {active.parsedSteps?.length > 0 && <Chip tone="ok">{active.parsedSteps.length} steps parsed</Chip>}
              </div>
            )}
          </div>
        </Panel>

        {active && (
          <Panel>
            <SectionTitle
              title="Run this skill"
              subtitle="Deterministic: each step is routed to the same engine it would hit from chat, in the order written. Same input → same step sequence."
              right={
                <button type="button" className="btn-primary btn-xs" onClick={runSkill} disabled={busy}>
                  {busy ? 'running…' : 'run'}
                </button>
              }
            />
            <div className="space-y-3 p-4">
              <textarea className="input min-h-[80px] resize-y" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Input for this run — the screen you are auditing, the lesson topic, the document question…" />
              <Toggle checked={useDocs} onChange={setUseDocs} label="Include the first three loaded documents as context" hint="Useful for the diligence skill; irrelevant for a lesson plan." />
              {run && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Chip tone="ok">rev {run.skill.revision}</Chip>
                    <Chip>{run.steps.length} steps</Chip>
                    <Chip>{run.durationMs} ms</Chip>
                    <Chip>{(run.inputLength / 1000).toFixed(1)}k input chars</Chip>
                  </div>
                  <p className="rounded-lg border border-line bg-ink-850/60 px-3 py-2 text-[11.5px] leading-relaxed text-mist">{run.determinismNote}</p>
                </div>
              )}
            </div>
          </Panel>
        )}
      </div>

      <Panel className="flex min-h-0 flex-col">
        <SectionTitle title="Step-by-step output" subtitle="Each step's answer, with the engine that produced it and the confidence of the routing decision." />
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {!run && <Empty title="Nothing run yet" body="Pick a skill, give it an input, and the fixed step list will execute in order." />}
          {busy && !run && <Spinner label="executing steps" />}
          {run?.steps.map((step, i) => (
            <div key={i} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11.5px] text-forge">step {i + 1}</span>
                <span className="text-[13px] font-semibold text-chalk">{step.title}</span>
                <Chip tone="info">{step.surfaceLabel}</Chip>
                <Chip>conf {step.confidence}</Chip>
              </div>
              <p className="text-[11.5px] italic leading-relaxed text-mist">{step.instruction}</p>
              <div className="border-l-2 border-line pl-3">
                <Markdown text={step.output} />
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
