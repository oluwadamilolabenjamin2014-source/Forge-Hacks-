import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, ArrowUpRight, Plus, Command, Sparkles, Code2, FileText, Layers, ChevronDown, ChevronRight, Check, X, Folder, PanelLeftClose, ShieldCheck, Settings2, Activity, Download, Upload, LoaderCircle, LockKeyhole, MessageSquare, Circle, LogOut, Terminal, BookOpen, Copy } from 'lucide-react';

const suggestions = [
  { icon: Code2, title: 'Build something great', text: 'Turn an idea into your next app.', prompt: 'Help me build a polished personal portfolio website with a project gallery, about section, and contact form. Use plain HTML, CSS, and JavaScript.' },
  { icon: Terminal, title: 'Make your code better', text: 'Find bugs. Get a fresh perspective.', prompt: 'Review the files in my workspace for correctness, accessibility, and security. Explain the most important issues and propose focused fixes.', skill: 'review' },
  { icon: FileText, title: 'Find the signal', text: 'Make sense of a complex document.', prompt: 'Analyze the document files in my workspace. Summarize the key findings, assumptions, contradictions, and questions that need further research.', skill: 'research' },
  { icon: Sparkles, title: 'Put thoughts into words', text: 'Draft, refine, and get your point across.', prompt: 'Help me write a warm, concise launch announcement for my new AI coding assistant, Cyber David. Ask me for the audience and the features before writing.' }
];
export default function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem('cd-token') || '');
  const [entry, setEntry] = useState('');
  const [status, setStatus] = useState(null);
  const [projects, setProjects] = useState([]);
  const [project, setProject] = useState(null);
  const [text, setText] = useState('');
  const [skill, setSkill] = useState('build');
  const [tab, setTab] = useState('chat');
  const [modal, setModal] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedFile, setSelectedFile] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [sidebar, setSidebar] = useState(false);
  const end = useRef(null);
  const upload = useRef(null);
  async function api(route, options = {}) {
    const res = await fetch('/api' + route, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers } });
    const data = await res.json();
    if (!res.ok) { if (res.status === 401) setStatus(null); throw new Error(data.error || 'Request failed.'); }
    return data;
  }
  const post = (route, body) => api(route, { method: 'POST', body: JSON.stringify(body) });
  useEffect(() => {
    if (!token) return;
    let alive = true;
    Promise.all([api('/status'), api('/projects')]).then(([s, p]) => {
      if (!alive) return;
      setStatus(s); setProjects(p); setError(''); sessionStorage.setItem('cd-token', token);
    }).catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [token]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [project?.messages.length, busy]);
  async function act(fn) {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function loadProject(id) {
    if (busy) return;
    await act(async () => { const p = await api('/projects/' + id); setProject(p); setSkill(p.skill); setText(''); setTab('chat'); setSidebar(false); });
  }
  async function newProject(name) {
    const p = await post('/projects', { name });
    setProjects(prev => [{ id: p.id, name: p.name, createdAt: p.createdAt }, ...prev]);
    setProject(p); setTab('chat'); setModal(null); setSidebar(false); return p;
  }
  async function send(e) {
    e?.preventDefault();
    if (!text.trim() || busy) return;
    if (!status.configured) { setModal('settings'); return; }
    const message = text.trim();
    await act(async () => {
      const p = project || await newProject(message.slice(0, 55));
      const result = await post(`/projects/${p.id}/chat`, { text: message, skill });
      setProject(result); setText('');
    });
  }
  async function importFile(event) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    await act(async () => {
      if (file.size > 60000) throw new Error('Please choose a text file smaller than 60 KB.');
      const content = await file.text();
      if (content.includes('\u0000')) throw new Error('Binary files are not supported.');
      const p = project || await newProject(file.name.replace(/\.[^.]+$/, ''));
      const result = await post(`/projects/${p.id}/files`, { path: file.name, content });
      setProject(result); setSelectedFile(file.name); setTab('files');
    });
  }
  function download(name, content) {
    const a = document.createElement('a'); const url = URL.createObjectURL(new Blob([content], { type: 'text/plain' })); a.href = url; a.download = name.split('/').pop(); a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const pending = project?.proposals.filter(p => p.status === 'pending') || [];
  const files = Object.keys(project?.files || {});
  const chosenFile = files.includes(selectedFile) ? selectedFile : files[0];
  function logout() { sessionStorage.removeItem('cd-token'); setToken(''); setStatus(null); setProject(null); setProjects([]); setError(''); }
  if (!status) return <div className="login"><div className="login-art"><div className="brand"><Logo/><span>cyber david<span className="brand-dot">.</span></span></div><div><div className="eyebrow">YOUR IDEAS. IN MOTION.</div><h1>A little less friction.<br/>A lot more possibility.</h1><p>Your space to think, build, and create with AI.<br/>Thoughtful assistance. You stay in control.</p></div><span className="login-foot">BUILT FOR THE WAY YOU WORK</span></div><form className="login-form" onSubmit={e => { e.preventDefault(); if (entry === token) { setToken(''); queueMicrotask(() => setToken(entry.trim())); } else setToken(entry.trim()); }}><div className="login-icon"><LockKeyhole size={25}/></div><h2>Welcome to Cyber David</h2><p>Enter your workspace access code to get started.</p><label htmlFor="access">Workspace access code</label><input id="access" type="password" autoComplete="current-password" value={entry} onChange={e => setEntry(e.target.value)} placeholder="Your private access code" required/><button className="primary">Open workspace <ArrowUpRight size={17}/></button>{error && <div className="inline-error" role="alert">{error}</div>}<div className="login-help">Find your code in the server startup output or <code>data/access-token</code>. This is not your AI provider API key.</div></form></div>;
  return <div className="app">
    <aside className={'sidebar ' + (sidebar ? 'open' : '')}>
      <div className="brand"><Logo/><span>cyber david<span className="brand-dot">.</span></span><button className="icon-btn close-sidebar" title="Close sidebar" onClick={() => setSidebar(false)}><X size={18}/></button></div>
      <button className="new-project" disabled={busy} onClick={() => setModal('new')}><Plus size={17}/> New project <span>＋</span></button>
      <nav><button className={!project && tab === 'chat' ? 'active' : ''} disabled={busy} onClick={() => { setProject(null); setText(''); setTab('chat'); setSidebar(false); }}><Command size={18}/> Workspace <span className="nav-dot"/></button><button className={tab === 'skills' ? 'active' : ''} onClick={() => { setTab('skills'); setSidebar(false); }}><Layers size={18}/> Skills <span className="small-tag">3</span></button></nav>
      <div className="section-label">YOUR PROJECTS <button className="icon-btn" title="New project" disabled={busy} onClick={() => setModal('new')}><Plus size={14}/></button></div>
      <div className="project-list">{projects.length ? projects.map(p => <button disabled={busy} className={p.id === project?.id ? 'selected' : ''} key={p.id} onClick={() => loadProject(p.id)}><MessageSquare size={15}/><span>{p.name}</span></button>) : <div className="no-projects">A fresh start.<br/>Your projects will live here.</div>}</div>
      <div className="sidebar-bottom"><div className="control-note"><ShieldCheck size={18}/><div><strong>Capable. Not unchecked.</strong><p>You approve every file change.</p></div></div><button className="settings" onClick={() => setModal('settings')}><Settings2 size={17}/> Settings & connection <span className={'connection-dot ' + (status.configured ? 'connected' : '')}/></button><div className="profile"><div className="avatar">Y</div><div><strong>Your workspace</strong><span>Personal · Local storage</span></div><button disabled={busy} className="icon-btn" onClick={logout} title="Lock workspace"><LogOut size={17}/></button></div></div>
    </aside>
    {sidebar && <button className="sidebar-overlay" aria-label="Close sidebar" onClick={() => setSidebar(false)}/>}
    <main>
      <header><div className="breadcrumb"><button className="icon-btn mobile-menu" aria-label="Open navigation" onClick={() => setSidebar(true)}><Command size={20}/></button><span>Workspace</span><ChevronRight size={14}/><strong>{tab === 'skills' ? 'Skills library' : project?.name || 'Overview'}</strong></div><div className="header-right"><span className="version">EARLY ACCESS</span><button className="model-button" onClick={() => setModal('settings')}><span className={'connection-dot ' + (status.configured ? 'connected' : '')}/>{status.configured ? status.model : 'Connect AI'}<ChevronDown size={13}/></button></div></header>
      {error && <div className="error-banner" role="alert"><span>{error}</span><button className="icon-btn" onClick={() => setError('')} aria-label="Dismiss error"><X size={16}/></button></div>}
      {tab === 'skills' ? <section className="skills-page"><div className="eyebrow">A LITTLE STRUCTURE. BETTER RESULTS.</div><h1>Good workflows, on repeat.</h1><p className="subtitle">Reusable instructions that give David a focused way to work.</p><div className="skill-grid">{status.skills.map((s, i) => <article key={s.id}><div className="skill-card-top"><div className="card-icon">{i === 0 ? <Code2/> : i === 1 ? <Terminal/> : <BookOpen/>}</div><span className="small-tag">MARKDOWN</span></div><h3>{s.name}</h3><p>{s.content.replace(/^#.*\n/, '')}</p><div className="skill-card-bottom"><code>skills/{s.id}.md</code><button onClick={() => { setSkill(s.id); setTab('chat'); }} className="text-button">Use skill <ArrowUpRight size={15}/></button></div></article>)}</div><div className="info-strip"><Layers size={18}/><span>Make it your own. Edit the Markdown files in <code>skills/</code> and restart the server to load your workflows.</span></div></section> : <>
      {project && <div className="project-toolbar"><div className="tabs">{[['chat', 'Conversation', MessageSquare], ['files', `Files${files.length ? ' · ' + files.length : ''}`, Folder], ['activity', 'Activity', Activity]].map(([id, title, Icon]) => <button key={id} onClick={() => setTab(id)} className={tab === id ? 'active' : ''}><Icon size={15}/>{title}</button>)}</div><button className={'review-button ' + (pending.length ? 'has-pending' : '')} onClick={() => setModal('proposals')}><ShieldCheck size={15}/>{pending.length ? `${pending.length} to review` : 'Change review'}</button></div>}
      {tab === 'files' && project ? <section className="files-page"><div className="page-title"><div><h2>Project files</h2><p>A virtual workspace. Nothing touches the host repository.</p></div><button className="secondary" disabled={busy} onClick={() => upload.current.click()}><Upload size={15}/> Import file</button></div>{files.length ? <div className="file-browser"><div className="file-list">{files.map(f => <button className={f === chosenFile ? 'selected' : ''} key={f} onClick={() => setSelectedFile(f)}><FileText size={15}/>{f}</button>)}</div><div className="file-content"><div><span><Code2 size={15}/>{chosenFile}</span><button className="icon-btn" title="Download file" onClick={() => download(chosenFile, project.files[chosenFile])}><Download size={16}/></button></div><pre>{project.files[chosenFile]}</pre></div></div> : <Empty icon={Folder} title="Room for your next idea" text="Import a text or code file, or ask David to propose new files. Approved changes appear here."/>}</section> : tab === 'activity' && project ? <section className="activity-page"><h2>A clear trail of what happened.</h2><p>Real tool actions, not simulated progress.</p>{project.activity.length ? <div className="activity-list">{project.activity.slice().reverse().map(a => <div key={a.id}><div className="activity-marker"><Check size={14}/></div><span>{a.text}</span><time>{new Date(a.time).toLocaleString()}</time></div>)}</div> : <Empty icon={Activity} title="Nothing behind the scenes" text="Agent tool calls and your approvals will be recorded here."/>}</section> : <div className={'chat-page ' + (project?.messages.length ? 'has-messages' : '')}>
      {!project?.messages.length ? <div className="welcome"><div className="welcome-label"><span/> YOUR PERSONAL AI WORKSPACE</div><h1>Big ideas.<br/><span>Meet your new right hand.</span></h1><p>I’m David. Let’s turn your “what if” into what’s next.<br/>Build, explore, write — we’ll work through it together.</p><div className="suggestions">{suggestions.map((s, i) => <button key={s.title} disabled={busy} onClick={() => { setText(s.prompt); setSkill(s.skill || 'build'); document.getElementById('prompt')?.focus(); }}><div className={'card-icon tone-' + i}><s.icon size={21}/></div><h3>{s.title}<ArrowUpRight size={16}/></h3><p>{s.text}</p></button>)}</div><div className="welcome-bottom"><span><ShieldCheck size={14}/> You’re always in control</span><span><Layers size={14}/> Reusable skills</span><span><Code2 size={14}/> Built to build</span></div></div> : <div className="messages">{project.messages.map(m => <div key={m.id} className={'message ' + m.role}><div className={'message-avatar ' + m.role}>{m.role === 'assistant' ? <Logo/> : 'Y'}</div><div className="message-body"><div className="message-name">{m.role === 'assistant' ? 'Cyber David' : 'You'}<time>{new Date(m.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div><MessageContent text={m.content}/></div></div>)}{busy && <div className="message assistant"><div className="message-avatar"><Logo/></div><div className="thinking"><LoaderCircle className="spin" size={16}/> David is working through your request<span>Planning and using workspace tools. This can take a moment.</span></div></div>}{pending.length > 0 && <button className="proposal-inline" onClick={() => setModal('proposals')}><div className="card-icon"><ShieldCheck size={20}/></div><div><strong>Something to look over</strong><span>{pending.length} proposed change{pending.length > 1 ? 's' : ''}. Review the exact diff before applying.</span></div><ArrowUpRight size={18}/></button>}<div ref={end}/></div>}
      <div className="composer-area">{project?.plan.length > 0 && <div className="plan"><button onClick={() => setExpanded(expanded === 'plan' ? null : 'plan')}><Layers size={14}/><span>Task plan</span><span className="plan-count">{project.plan.filter(s => s.status === 'done').length}/{project.plan.length}</span><ChevronDown size={14}/></button>{expanded === 'plan' && <ol>{project.plan.map((s, i) => <li key={i}>{s.status === 'done' ? <Check size={14}/> : s.status === 'active' ? <Circle size={12} className="active-step"/> : <Circle size={12}/>}<span>{s.title}</span><small>{s.status}</small></li>)}</ol>}</div>}<form className="composer" onSubmit={send}><label className="sr-only" htmlFor="prompt">Message Cyber David</label><textarea id="prompt" value={text} onChange={e => setText(e.target.value)} disabled={busy} maxLength={60000} placeholder="What are we making happen today?" onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}/><div className="composer-tools"><div><button type="button" className="icon-btn attach" title="Import a text file (up to 60 KB)" disabled={busy} onClick={() => upload.current.click()}><Plus size={20}/></button><div className="composer-divider"/><Layers size={14}/><label className="sr-only" htmlFor="skill">Workflow skill</label><select id="skill" disabled={busy} value={skill} onChange={e => setSkill(e.target.value)}>{status.skills.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div><div><span className="enter-hint">Enter to send</span><button className="send-button" disabled={!text.trim() || busy} title="Send message" aria-label="Send message">{busy ? <LoaderCircle className="spin" size={18}/> : <ArrowUp size={19}/>}</button></div></div></form><div className="composer-foot"><span>David can make mistakes. Check important details.</span><span><ShieldCheck size={12}/> Approval-first workspace</span></div></div>
      </div>}
      </>}
    </main>
    <input ref={upload} type="file" className="sr-only" accept=".js,.jsx,.ts,.tsx,.py,.md,.txt,.html,.css,.json,.sql,.yaml,.yml,.toml,.scss,.svg,.mjs,.cjs" onChange={importFile}/>
    {modal && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !busy) setModal(null); }}><section className={'modal ' + (modal === 'proposals' ? 'wide' : '')} role="dialog" aria-modal="true" aria-labelledby="modal-title"><button disabled={busy} className="modal-close icon-btn" aria-label="Close dialog" onClick={() => setModal(null)}><X size={20}/></button>{modal === 'new' ? <NewProject busy={busy} onCreate={name => act(() => newProject(name))}/> : modal === 'settings' ? <><div className="card-icon"><Settings2 size={23}/></div><h2 id="modal-title">Make the connection.</h2><p>Cyber David uses a real AI provider. Credentials stay on the server — never in the browser or chat.</p><div className="settings-status"><span className={'connection-dot ' + (status.configured ? 'connected' : '')}/><strong>{status.configured ? 'Provider key configured' : 'No provider key configured'}</strong><span>{status.model}</span></div><h4>Connect your model</h4><ol className="setup-list"><li>Copy <code>.env.example</code> to <code>.env</code> in the project root.</li><li>Set <code>OPENAI_API_KEY</code> and optionally <code>OPENAI_MODEL</code>. Do not share or commit your key.</li><li>Restart the server, then refresh this page.</li></ol><div className="info-strip">This environment restricts outbound hosts. Live AI calls need a deployment with access to your provider endpoint.</div><h4>Know the boundaries</h4><p className="small-copy">Chat, workspace reads, plans, and approval-gated file proposals are available. Code execution, deployment, web browsing, desktop control, purchases, and external app connections are not enabled. Context is capped; it is not a one-million-token workspace. Workspace content is sent to your configured model when used in a conversation.</p></> : <><div className="card-icon"><ShieldCheck size={23}/></div><h2 id="modal-title">Your code. Your call.</h2><p>Review the exact changes. Approval writes only to this virtual workspace, not to your host repository.</p>{project?.proposals.length ? project.proposals.slice().reverse().map(p => <article className="proposal" key={p.id}><div className="proposal-heading"><strong>{p.summary}</strong><span className={'status-tag ' + p.status}>{p.status}</span></div>{p.files.map(f => <details key={f.path}><summary><FileText size={14}/>{f.path}<span>{f.before === null ? 'New file' : 'Modified'}</span></summary><pre className="diff">{f.diff.split('\n').map((line, i) => <span className={line.startsWith('+') ? 'added' : line.startsWith('-') ? 'removed' : line.startsWith('@') ? 'hunk' : ''} key={i}>{line}{'\n'}</span>)}</pre></details>)}{p.status === 'pending' && <div className="proposal-actions"><button className="secondary" disabled={busy} onClick={() => act(async () => setProject(await post(`/projects/${project.id}/proposals/${p.id}`, { action: 'reject', digest: p.digest })))}><X size={15}/> Reject</button><button className="primary" disabled={busy} onClick={() => act(async () => setProject(await post(`/projects/${project.id}/proposals/${p.id}`, { action: 'approve', digest: p.digest })))}><Check size={15}/> Approve changes</button></div>}</article>) : <Empty icon={ShieldCheck} title="All clear" text="When David proposes a file change, you’ll see a reviewable diff here."/>}</>}{error && <div className="inline-error" role="alert">{error}</div>}</section></div>}
  </div>;
}
function Logo() { return <div className="logo-mark"><span/><span/><span/></div>; }
function Empty({ icon: Icon, title, text }) { return <div className="empty"><Icon size={30}/><h3>{title}</h3><p>{text}</p></div>; }
function NewProject({ onCreate, busy }) { const [name, setName] = useState(''); return <form onSubmit={e => { e.preventDefault(); onCreate(name.trim()); }}><div className="card-icon"><Folder size={24}/></div><h2 id="modal-title">Start something new.</h2><p>Give your idea a home. Conversations, files, and plans stay together in a project.</p><label htmlFor="project-name">Project name</label><input id="project-name" autoFocus value={name} maxLength={80} onChange={e => setName(e.target.value)} placeholder="My next big idea" required/><button className="primary" disabled={busy || !name.trim()}><Plus size={16}/> Create project</button></form>; }
function MessageContent({ text }) {
  return <div className="message-text">{text.split(/(```[\s\S]*?```)/g).map((part, i) => part.startsWith('```') ? <CodeBlock key={i} part={part}/> : <div className="prose" key={i}>{part.split('\n').map((line, j) => /^#{1,3} /.test(line) ? <h3 key={j}>{line.replace(/^#+ /, '')}</h3> : <div key={j}>{line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((piece, k) => piece.startsWith('**') ? <strong key={k}>{piece.slice(2, -2)}</strong> : piece.startsWith('`') ? <code key={k}>{piece.slice(1, -1)}</code> : <React.Fragment key={k}>{piece || '\u00a0'}</React.Fragment>)}</div>)}</div>)}</div>;
}
function CodeBlock({ part }) {
  const [copied, setCopied] = useState(false);
  const code = part.replace(/^```[^\n]*\n?/, '').replace(/```$/, '');
  return <div className="code-block"><div><span>{part.match(/^```([^\n]*)/)?.[1] || 'Code'}</span><button className="icon-btn" title="Copy code" onClick={async () => { try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { setCopied(false); } }}>{copied ? <Check size={14}/> : <Copy size={14}/>}</button></div><pre>{code}</pre></div>;
}
