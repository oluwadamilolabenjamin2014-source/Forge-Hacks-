import React from 'react';
import { api } from './lib/api';
import Chat from './views/Chat';
import Build from './views/Build';
import Agent from './views/Agent';
import Sandbox from './views/Sandbox';
import Documents from './views/Documents';
import Skills from './views/Skills';
import Connections from './views/Connections';
import Capabilities from './views/Capabilities';
import { Chip } from './components/ui';

type ViewId = 'chat' | 'build' | 'agent' | 'sandbox' | 'documents' | 'skills' | 'connections' | 'capabilities';

const NAV: { id: ViewId; label: string; hint: string; group: string }[] = [
  { id: 'chat', label: 'Chat', hint: 'One surface, eight capability routes', group: 'Work' },
  { id: 'build', label: 'Build an app', hint: 'Plain English → running software', group: 'Build and code' },
  { id: 'agent', label: 'Repo agent', hint: 'Multi-file repair, verified by execution', group: 'Build and code' },
  { id: 'sandbox', label: 'Sandbox', hint: 'Run code for real, see the exit code', group: 'Build and code' },
  { id: 'documents', label: 'Documents', hint: 'Long-context analysis with citations', group: 'Reason and analyse' },
  { id: 'skills', label: 'Skills', hint: 'Fixed workflows that repeat exactly', group: 'Automate and operate' },
  { id: 'connections', label: 'Extensions', hint: 'Scoped grants, audited, simulated', group: 'Automate and operate' },
  { id: 'capabilities', label: 'Manifest', hint: 'Capabilities, limits, audit log', group: 'Governance' },
];

export default function App() {
  const [view, setView] = React.useState<ViewId>('chat');
  const [health, setHealth] = React.useState<{ status: string; engine: string; counts: Record<string, number>; node: string } | null>(null);
  const [online, setOnline] = React.useState<boolean | null>(null);
  const [sandboxSeed, setSandboxSeed] = React.useState<{ code?: string; language?: string }>({});
  const [navOpen, setNavOpen] = React.useState(false);

  React.useEffect(() => {
    const check = () =>
      api
        .health()
        .then((h: any) => {
          setHealth(h);
          setOnline(true);
        })
        .catch(() => setOnline(false));
    check();
    const timer = setInterval(check, 15000);
    return () => clearInterval(timer);
  }, []);

  const groups = [...new Set(NAV.map((n) => n.group))];

  const openInSandbox = (code: string, language: string) => {
    setSandboxSeed({ code, language });
    setView('sandbox');
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-line bg-ink-900/80 px-4 py-3 backdrop-blur">
        <button type="button" className="btn-ghost btn-xs lg:hidden" onClick={() => setNavOpen((o) => !o)}>
          {navOpen ? 'close' : 'menu'}
        </button>
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-forge to-violet text-sm font-black text-ink-950">F</span>
          <div>
            <h1 className="text-[15px] font-bold leading-tight tracking-tight text-chalk">Forge</h1>
            <p className="text-[11px] leading-tight text-mist">An agentic workspace that shows its work</p>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Chip tone={online === false ? 'bad' : online ? 'ok' : 'default'}>
            <span className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-mint' : online === false ? 'bg-rose' : 'bg-mist'}`} />
            {online === false ? 'API offline' : online ? 'API live' : 'connecting'}
          </Chip>
          {health && <Chip tone="accent">{health.engine}</Chip>}
          {health && <Chip>{health.node}</Chip>}
          {health && (
            <Chip title="conversations · documents · projects · skills · connections">
              {health.counts.conversations}·{health.counts.documents}·{health.counts.projects}·{health.counts.skills}·{health.counts.connections}
            </Chip>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className={`${navOpen ? 'block' : 'hidden'} w-[248px] shrink-0 overflow-y-auto border-r border-line bg-ink-900/60 p-3 lg:block`}>
          {groups.map((group) => (
            <div key={group} className="mb-4">
              <p className="label px-2 pb-1.5">{group}</p>
              {NAV.filter((n) => n.group === group).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setView(item.id);
                    setNavOpen(false);
                  }}
                  className={`mb-0.5 block w-full rounded-lg px-2.5 py-2 text-left transition ${
                    view === item.id ? 'bg-ink-700/90 text-chalk' : 'text-mist hover:bg-ink-800/70 hover:text-chalk'
                  }`}
                >
                  <span className="block text-[12.5px] font-medium">{item.label}</span>
                  <span className="block text-[10.5px] leading-snug text-mist/80">{item.hint}</span>
                </button>
              ))}
            </div>
          ))}

          <div className="mt-6 rounded-xl border border-line bg-ink-850/60 p-3">
            <p className="label mb-1">How to read any answer</p>
            <p className="text-[11px] leading-relaxed text-mist">
              Each reply carries an <span className="text-violet">engine</span> chip (who produced it) and a{' '}
              <span className="text-sky">surface</span> chip (which route it took). If a number appears, it was parsed. If a source appears, it was retrieved.
              If something could not be done, it says so.
            </p>
          </div>
        </nav>

        <main className="min-h-0 flex-1 overflow-hidden p-4">
          {view === 'chat' && <Chat onUseCode={openInSandbox} />}
          {view === 'build' && <Build />}
          {view === 'agent' && <Agent />}
          {view === 'sandbox' && <Sandbox initialCode={sandboxSeed.code} initialLanguage={sandboxSeed.language} />}
          {view === 'documents' && <Documents />}
          {view === 'skills' && <Skills />}
          {view === 'connections' && <Connections />}
          {view === 'capabilities' && <Capabilities />}
        </main>
      </div>
    </div>
  );
}
