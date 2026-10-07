import React from 'react';
import { api } from '../lib/api';
import { Chip, Empty, Panel, SectionTitle, Stat } from '../components/ui';
import { riskColor, timeAgo } from '../lib/markdown';

type Catalog = {
  id: string;
  name: string;
  category: string;
  blurb: string;
  scopes: { id: string; label: string; risk: string }[];
  actions: string[];
  sideEffects: string;
  requiresApproval?: boolean;
};

type Connection = { id: string; catalogId: string; label: string; scopes: { id: string; label: string; risk: string }[]; maxRisk: string; mode: string; invocations: number };

export default function Connections() {
  const [catalog, setCatalog] = React.useState<Catalog[]>([]);
  const [connections, setConnections] = React.useState<Connection[]>([]);
  const [policy, setPolicy] = React.useState<any>(null);
  const [pending, setPending] = React.useState<Record<string, string[]>>({});
  const [log, setLog] = React.useState<{ text: string; tone: 'ok' | 'warn' | 'bad' }[]>([]);
  const [audit, setAudit] = React.useState<{ id: string; at: string; action: string; detail?: string; connector?: string; requested?: string; outcome?: string; approvedBy?: string }[]>([]);

  const refresh = React.useCallback(async () => {
    const data = await api.connections();
    setCatalog(data.catalog);
    setConnections(data.connections);
    setPolicy(data.policy);
    const a = await api.audit(40);
    setAudit(a.entries.filter((e) => e.action.startsWith('connection.')) as any);
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const connect = async (id: string) => {
    const scopes = pending[id] || [];
    try {
      const res = await api.connect(id, scopes);
      setLog((l) => [{ text: res.custodyNote, tone: 'ok' }, ...l]);
      await refresh();
    } catch (err) {
      setLog((l) => [{ text: (err as Error).message, tone: 'bad' }, ...l]);
    }
  };

  const invoke = async (conn: Connection, action: string) => {
    const approver = conn.maxRisk === 'critical' || conn.catalogId === 'payments' || conn.catalogId === 'device' ? 'operator@local (human, named in the audit log)' : undefined;
    const res = await api.invoke(conn.id, action, { reason: 'demo invocation from the Extensions panel' }, approver);
    if (res.outcome === 'blocked_pending_approval') setLog((l) => [{ text: res.detail || 'blocked', tone: 'warn' }, ...l]);
    else setLog((l) => [{ text: res.verdict || 'invoked', tone: 'ok' }, ...l]);
    await refresh();
  };

  return (
    <div className="grid h-full grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
        <Panel>
          <SectionTitle
            title="The custody model"
            subtitle="An AI cannot act in the world. Something has to hold the credential — and whoever holds it owns the outcome. So grants are explicit, scoped, and every call is logged."
            right={<Chip tone="warn">simulated mode</Chip>}
          />
          <div className="card-grid p-4">
            <Stat label="connectors available" value={catalog.length} hint="nothing is connected by default" />
            <Stat label="active grants" value={connections.length} hint="scoped, revocable, listed below" tone={connections.length ? 'accent' : 'default'} />
            <Stat label="network egress" value="0 requests" hint="no live action is taken in this build" tone="ok" />
          </div>
          <div className="border-t border-line px-4 py-3">
            <p className="text-[12px] leading-relaxed text-mist">
              {policy?.note ||
                'Every grant is simulated: the call is validated, policy-checked and audit-logged, then reported as "would have called X" with no network egress.'}
            </p>
          </div>
        </Panel>

        <Panel>
          <SectionTitle title="Catalog" subtitle="Pick scopes deliberately — the risk column is the honest part: the more an action can do, the less reversible it is." />
          <div className="divide-y divide-line">
            {catalog.map((c) => (
              <div key={c.id} className="space-y-2.5 px-4 py-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[13.5px] font-semibold text-chalk">{c.name}</p>
                    <p className="text-[11.5px] text-mist">{c.blurb}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {c.requiresApproval && <Chip tone="warn">needs a named approver</Chip>}
                    <span className="chip">{c.category}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {c.scopes.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() =>
                        setPending((prev) => {
                          const current = prev[c.id] || [];
                          return { ...prev, [c.id]: current.includes(s.id) ? current.filter((x) => x !== s.id) : [...current, s.id] };
                        })
                      }
                      className={`chip border transition ${(pending[c.id] || []).includes(s.id) ? 'border-forge/60 bg-forge/10 text-forge-soft' : riskColor(s.risk)}`}
                    >
                      {s.label} · {s.risk}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] italic leading-snug text-mist">⚠ {c.sideEffects}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="btn-ghost btn-xs" onClick={() => connect(c.id)} disabled={!(pending[c.id] || []).length}>
                    Grant {(pending[c.id] || []).length || ''} scope{(pending[c.id] || []).length === 1 ? '' : 's'}
                  </button>
                  <span className="font-mono text-[10.5px] text-mist">actions: {c.actions.join(', ')}</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
        <Panel>
          <SectionTitle title="Active grants" subtitle="Each grant lists exactly what the agent may propose. Revoke is one click, and it is logged." />
          <div className="divide-y divide-line">
            {connections.length === 0 && <Empty title="Nothing connected" body="This is the default state, on purpose: no ambient credentials, no silent capability." />}
            {connections.map((conn) => {
              const cat = catalog.find((c) => c.id === conn.catalogId);
              return (
                <div key={conn.id} className="space-y-2 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold text-chalk">{conn.label}</span>
                    <div className="flex items-center gap-2">
                      <span className={`chip ${riskColor(conn.maxRisk)}`}>max risk {conn.maxRisk}</span>
                      <Chip>{conn.mode}</Chip>
                      <Chip>{conn.invocations} invocation(s)</Chip>
                      <button type="button" className="btn-danger btn-xs" onClick={() => api.disconnect(conn.id).then(refresh)}>
                        revoke
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {conn.scopes.map((s) => (
                      <span key={s.id} className={`chip ${riskColor(s.risk)}`}>
                        {s.label}
                      </span>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(cat?.actions || []).map((a) => (
                      <button key={a} type="button" className="btn-ghost btn-xs font-mono" onClick={() => invoke(conn, a)}>
                        invoke {a}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        {log.length > 0 && (
          <Panel>
            <SectionTitle title="Action log (this session)" />
            <div className="space-y-2 p-4">
              {log.map((l, i) => (
                <p key={i} className={`text-[12px] leading-relaxed ${l.tone === 'ok' ? 'text-mint' : l.tone === 'warn' ? 'text-forge-soft' : 'text-rose'}`}>
                  {l.text}
                </p>
              ))}
            </div>
          </Panel>
        )}

        <Panel>
          <SectionTitle title="Audit trail" subtitle="Append-only, including blocked and simulated calls. The log is the accountability mechanism — it is the only part of this system that can be held to account." />
          <div className="max-h-[26rem] overflow-y-auto p-3">
            {audit.length === 0 && <p className="px-1 py-2 text-[11.5px] text-mist">No connection activity yet.</p>}
            {audit.map((e) => (
              <div key={e.id} className="border-b border-line/60 py-2 last:border-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] text-sky">{e.action}</span>
                  {e.outcome && <span className={`chip ${e.outcome === 'simulated_ok' ? 'text-mint border-mint/40' : 'text-forge-soft border-forge/40'}`}>{e.outcome}</span>}
                  <span className="ml-auto text-[10.5px] text-mist">{timeAgo(e.at)}</span>
                </div>
                <p className="mt-1 font-mono text-[11px] text-chalk/80">{e.detail || e.requested || ''}</p>
                {e.approvedBy && <p className="text-[10.5px] text-forge-soft">approved by {e.approvedBy}</p>}
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
