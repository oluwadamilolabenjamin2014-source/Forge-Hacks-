import React from 'react';
import { api, type CapabilityManifest, type AuditEntry } from '../lib/api';
import { Chip, Panel, SectionTitle, Spinner, Stat } from '../components/ui';
import { clockTime, formatNumber, timeAgo } from '../lib/markdown';

export default function Capabilities() {
  const [manifest, setManifest] = React.useState<CapabilityManifest | null>(null);
  const [audit, setAudit] = React.useState<AuditEntry[]>([]);
  const [summary, setSummary] = React.useState<{ total: number } | null>(null);
  const [tab, setTab] = React.useState<'capabilities' | 'limitations' | 'audit'>('capabilities');
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    Promise.all([api.capabilities(), api.audit(120)])
      .then(([m, a]) => {
        setManifest(m);
        setAudit(a.entries);
        setSummary({ total: a.total });
      })
      .finally(() => setLoading(false));
    const timer = setInterval(() => api.audit(120).then((a) => { setAudit(a.entries); setSummary({ total: a.total }); }), 10000);
    return () => clearInterval(timer);
  }, []);

  if (loading) return <Spinner label="loading the manifest" />;
  if (!manifest) return <p className="text-sm text-mist">Could not load the manifest — is the API running on :3001?</p>;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1">
      <Panel>
        <SectionTitle
          title="Capability manifest"
          subtitle="Every feature, how it is actually delivered, how you can verify it, and what it cannot do. This is served from the API, so the UI cannot overclaim relative to the backend."
          right={
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone="accent">{manifest.engine}</Chip>
              <Chip>{manifest.counts.codeLanguages} code languages</Chip>
              <Chip>{manifest.counts.translateLanguages} translate languages</Chip>
              <Chip>{formatNumber(manifest.counts.contextWindow)} token window</Chip>
            </div>
          }
        />
        <div className="border-b border-line px-4 py-3">
          <p className="text-[12px] leading-relaxed text-mist">{manifest.engineNote}</p>
        </div>
        <div className="flex gap-1 border-b border-line px-3 pt-2">
          {(['capabilities', 'limitations', 'audit'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-t-lg px-3 py-2 text-[12.5px] font-medium transition ${
                tab === t ? 'border border-b-0 border-line bg-ink-800 text-chalk' : 'text-mist hover:text-chalk'
              }`}
            >
              {t === 'audit' ? `audit log (${summary?.total ?? audit.length})` : t}
            </button>
          ))}
        </div>

        {tab === 'capabilities' && (
          <div className="divide-y divide-line">
            {manifest.capabilities.map((c) => (
              <div key={c.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                <div>
                  <span className="chip mb-2 inline-block">{c.group}</span>
                  <h3 className="text-[14px] font-semibold text-chalk">{c.title}</h3>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-chalk/85">{c.claim}</p>
                </div>
                <div className="space-y-2">
                  <div>
                    <p className="label mb-0.5">How it is delivered</p>
                    <p className="text-[12px] leading-relaxed text-mist">{c.delivery}</p>
                  </div>
                  <div>
                    <p className="label mb-0.5">How to verify</p>
                    <p className="font-mono text-[11.5px] leading-relaxed text-sky">{c.verification}</p>
                  </div>
                  <div>
                    <p className="label mb-0.5">Honest limits</p>
                    <ul className="space-y-1">
                      {c.limitations.map((l, i) => (
                        <li key={i} className="text-[11.5px] leading-relaxed text-forge-soft">
                          — {l}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'limitations' && (
          <div>
            <div className="border-b border-line bg-forge/5 px-4 py-3">
              <p className="text-[12.5px] leading-relaxed text-forge-soft">
                These are the failure modes of the underlying models, written down in the product rather than buried in a disclaimer. Each row says what it actually means in practice — and, where the code does something structural about it, which surface to look at.
              </p>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
              {manifest.limitations.map((l) => (
                <div key={l.id} className="panel-tight p-3.5">
                  <p className="text-[13px] font-semibold text-chalk">{l.title}</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-mist">{l.honest}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'audit' && (
          <div className="p-3">
            <p className="mb-2 text-[11.5px] text-mist">
              Every mutating API call, agent edit, execution, project generation and (simulated) outward action lands here. Append-only, newest first.
            </p>
            <div className="max-h-[34rem] overflow-y-auto">
              {audit.map((e) => (
                <div key={e.id} className="flex flex-wrap items-start gap-2 border-b border-line/60 py-2 font-mono text-[11px] last:border-0">
                  <span className="text-mist">{clockTime(e.at)}</span>
                  <span className="text-sky">{e.action}</span>
                  <span className="text-chalk/80">
                    {Object.entries(e)
                      .filter(([k]) => !['id', 'at', 'action', 'actor'].includes(k))
                      .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
                      .join(' ')}
                  </span>
                </div>
              ))}
              {audit.length === 0 && <p className="py-3 text-[12px] text-mist">Nothing logged yet.</p>}
            </div>
          </div>
        )}
      </Panel>

      <Panel>
        <SectionTitle title="Design decisions you can hold this build to" subtitle="Four rules the code follows, which is why the behaviour is boring and predictable in exactly the way you want." />
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          {[
            {
              title: 'Verifiable work goes to deterministic engines',
              body: 'Math is a parser, retrieval is BM25, code generation is templated, execution is a subprocess. Sampling is reserved for prose, where being plausible is the requirement.',
            },
            {
              title: 'Nothing is claimed that was not executed',
              body: 'The generated app is called working only after its suite passes. An agent edit is kept only if the suite improves. A deployment is called live only after /api/health answers.',
            },
            {
              title: 'Failures are surfaced, not smoothed',
              body: 'A retrieval miss says "not in the corpus". A failed fix is reverted and labelled. A scanned PDF is rejected with the OCR instruction. A 503 preview page names the command to fix it.',
            },
            {
              title: 'Capability requires custody',
              body: 'Real-world actions need an explicit grant with scopes and risk tiers, a named human approver where the action is irreversible, and an audit row either way. Default state: nothing connected.',
            },
          ].map((r) => (
            <div key={r.title} className="panel-tight p-3.5">
              <p className="text-[13px] font-semibold text-chalk">{r.title}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-mist">{r.body}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-line px-4 py-3">
          <p className="text-[11.5px] text-mist">
            Manifest loaded {timeAgo(new Date().toISOString())} · {manifest.limitations.length} documented limitations · {manifest.capabilities.length} capabilities
          </p>
        </div>
      </Panel>
    </div>
  );
}
