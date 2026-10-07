import React from 'react';
import { api, streamChat, type DocumentRecord, type Message } from '../lib/api';
import { Chip, CodeBlock, Empty, Markdown, Meter, Panel, SectionTitle, Spinner, TraceList, WarningBanner } from '../components/ui';
import { clockTime, formatNumber } from '../lib/markdown';

const SUGGESTIONS = [
  { label: 'Solve an equation', prompt: 'solve 3(x - 2) = 9 and show the working' },
  { label: 'Multi-step math', prompt: 'a = 3, b = 4, compute sqrt(a^2 + b^2)' },
  { label: 'Write code', prompt: 'write a python function called two_sum that finds the pair adding to a target, with tests' },
  { label: 'Summarise', prompt: 'summarise the key points and list every number and date' },
  { label: 'Translate', prompt: 'translate "please review the attached document" to Spanish' },
  { label: 'Reason', prompt: 'why does the effect disappear in the control group? Give me the discriminating experiment.' },
  { label: 'Draft a memo', prompt: 'write a short memo recommending we move the ledger to Postgres' },
  { label: 'Boundaries', prompt: 'can you book a flight for me?' },
];

export default function Chat({ onUseCode }: { onUseCode: (code: string, language: string) => void }) {
  const [conversations, setConversations] = React.useState<{ id: string; title: string; messageCount: number; updatedAt: string; lastSurface: string | null }[]>([]);
  const [conversationId, setConversationId] = React.useState<string | undefined>();
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [streaming, setStreaming] = React.useState('');
  const [routing, setRouting] = React.useState<{ label: string; confidence: number; reasons?: string[] } | null>(null);
  const [documents, setDocuments] = React.useState<DocumentRecord[]>([]);
  const [selectedDocs, setSelectedDocs] = React.useState<string[]>([]);
  const [context, setContext] = React.useState<{ used: number; window: number } | null>(null);
  const [engine, setEngine] = React.useState<{ label: string; contextLabel: string; note: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const cancelRef = React.useRef<(() => void) | null>(null);

  const loadConversations = React.useCallback(async () => {
    try {
      setConversations(await api.conversations());
    } catch {
      /* backend not up yet */
    }
  }, []);

  React.useEffect(() => {
    loadConversations();
    api
      .documents()
      .then((docs) => {
        setDocuments(docs);
        setSelectedDocs(docs.slice(0, 3).map((d) => d.id));
      })
      .catch(() => {});
    api
      .providers()
      .then((p) => setEngine({ label: p.label, contextLabel: p.contextLabel, note: p.note }))
      .catch(() => {});
  }, [loadConversations]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streaming]);

  const openConversation = async (id: string) => {
    const data = await api.conversation(id);
    setConversationId(id);
    setMessages(data.messages);
    setContext(data.context);
  };

  const newConversation = () => {
    setConversationId(undefined);
    setMessages([]);
    setRouting(null);
    setStreaming('');
  };

  const send = (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setError(null);
    setInput('');
    setBusy(true);
    setStreaming('');
    setRouting(null);
    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, role: 'user', text: message, at: new Date().toISOString() }]);

    cancelRef.current = streamChat(
      { conversationId, message, documentIds: selectedDocs },
      {
        onRouting: (data) => setRouting({ label: data.label, confidence: data.confidence, reasons: data.reasons }),
        onToken: (chunk) => setStreaming((prev) => prev + chunk),
        onWarning: (w) => setError(w),
        onError: (m) => {
          setError(m);
          setBusy(false);
        },
        onDone: (data) => {
          setConversationId(data.conversationId);
          // Replace the optimistic local echo with the server's authoritative records.
          setMessages((prev) => [...prev.filter((m) => !m.id.startsWith('local-')), data.userMessage, data.reply]);
          setContext(data.context);
          setStreaming('');
          setBusy(false);
          loadConversations();
        },
      },
    );
  };

  const stop = () => {
    cancelRef.current?.();
    setBusy(false);
    setStreaming('');
  };

  return (
    <div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <div className="flex flex-col gap-3">
        <Panel className="flex min-h-0 flex-1 flex-col">
          <SectionTitle
            title="Sessions"
            subtitle="Each new chat starts fresh — a deliberate limit, not a bug. Durable state lives in Documents and Projects."
            right={
              <button type="button" className="btn-ghost btn-xs" onClick={newConversation}>
                new
              </button>
            }
          />
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {conversations.length === 0 && <p className="px-2 py-3 text-[11.5px] text-mist">No sessions yet. Nothing is stored until you send a message.</p>}
            {conversations.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => openConversation(c.id)}
                className={`mb-1 block w-full rounded-lg px-2.5 py-2 text-left transition ${
                  c.id === conversationId ? 'bg-ink-700/80' : 'hover:bg-ink-700/40'
                }`}
              >
                <span className="block truncate text-[12.5px] text-chalk">{c.title}</span>
                <span className="mt-0.5 block text-[10.5px] text-mist">
                  {c.messageCount} messages · {c.lastSurface || 'mixed'}
                </span>
              </button>
            ))}
          </div>
        </Panel>

        <Panel>
          <SectionTitle title="Document scope" subtitle="Selected documents are retrieved from for every answer in this session." />
          <div className="max-h-52 overflow-y-auto p-2">
            {documents.length === 0 && <p className="px-2 py-2 text-[11.5px] text-mist">No documents loaded. Add them in the Documents tab.</p>}
            {documents.map((d) => (
              <label key={d.id} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-ink-700/40">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-[color:var(--color-forge)]"
                  checked={selectedDocs.includes(d.id)}
                  onChange={(e) => setSelectedDocs((prev) => (e.target.checked ? [...prev, d.id] : prev.filter((x) => x !== d.id)))}
                />
                <span className="min-w-0">
                  <span className="block truncate text-[12px] text-chalk">{d.title}</span>
                  <span className="block text-[10.5px] text-mist">
                    {formatNumber(d.tokens)} tok · {d.chunks} chunks
                  </span>
                </span>
              </label>
            ))}
          </div>
        </Panel>
      </div>

      <Panel className="flex min-h-0 flex-col">
        <SectionTitle
          title="Conversation"
          subtitle={engine?.note}
          right={
            <div className="flex flex-wrap items-center gap-2">
              {engine && <Chip tone="accent" title="Who answered the last message">{engine.label}</Chip>}
              {context && <Meter used={context.used} total={context.window} label={`context · ${engine?.contextLabel || ''}`} />}
            </div>
          }
        />

        <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {messages.length === 0 && !streaming && (
            <Empty
              title="Ask for something verifiable, or something written"
              body={
                <>
                  Every reply carries its own routing label and method. Numbers are parsed, code is executed where possible, retrieval always cites, and nothing claims to know what it has not read.
                </>
              }
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s.label} type="button" className="btn-ghost btn-xs" onClick={() => send(s.prompt)}>
                      {s.label}
                    </button>
                  ))}
                </div>
              }
            />
          )}

          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} onUseCode={onUseCode} />
          ))}

          {busy && (
            <div className="space-y-2">
              {routing && (
                <div className="flex items-center gap-2">
                  <Chip tone="info">routing → {routing.label}</Chip>
                  <span className="font-mono text-[11px] text-mist">confidence {routing.confidence}</span>
                </div>
              )}
              {streaming ? (
                <div className="prose-forge">
                  <Markdown text={streaming} />
                  <span className="blink" />
                </div>
              ) : (
                <Spinner label="thinking in the local engine (deterministic — no sampling)" />
              )}
            </div>
          )}

          {error && <WarningBanner items={[error]} />}
        </div>

        <div className="border-t border-line p-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex flex-col gap-2"
          >
            <textarea
              className="input min-h-[68px] resize-y"
              placeholder="Ask, build, solve, analyse… (⌘/Ctrl + Enter to send)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  send(input);
                }
              }}
            />
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTIONS.slice(0, 4).map((s) => (
                  <button key={s.label} type="button" className="chip hover:border-mist/40" onClick={() => setInput(s.prompt)}>
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                {busy && (
                  <button type="button" className="btn-ghost" onClick={stop}>
                    stop
                  </button>
                )}
                <button type="submit" className="btn-primary" disabled={busy || !input.trim()}>
                  Send
                </button>
              </div>
            </div>
          </form>
        </div>
      </Panel>
    </div>
  );
}

function MessageBubble({ message, onUseCode }: { message: Message; onUseCode: (code: string, language: string) => void }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm border border-line bg-ink-700/70 px-3.5 py-2.5">
          <p className="whitespace-pre-wrap text-[13.5px] text-chalk">{message.text}</p>
          <p className="mt-1 text-right text-[10.5px] text-mist">{clockTime(message.at)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {message.surfaceLabel && <Chip tone="info">{message.surfaceLabel}</Chip>}
        {message.engine && <Chip tone="accent">{message.engine}</Chip>}
        {message.outputTokens ? <Chip>{formatNumber(message.outputTokens)} tokens out</Chip> : null}
        {message.latencyMs !== undefined && <Chip>{message.latencyMs} ms</Chip>}
      </div>

      <WarningBanner items={message.warnings} />

      <Markdown text={message.text} />

      {message.artifacts?.map((a, i) => (
        <div key={i} className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11.5px] text-mist">{a.path}</span>
            <button type="button" className="btn-ghost btn-xs" onClick={() => onUseCode(a.code, a.language)}>
              open in sandbox →
            </button>
          </div>
          <CodeBlock code={a.code} language={a.language} maxHeight="26rem" />
        </div>
      ))}

      {message.citations && message.citations.length > 0 && (
        <div className="rounded-xl border border-line bg-ink-850/60 px-3 py-2">
          <p className="label mb-1.5">Sources — verbatim, with retrieval scores</p>
          <ul className="space-y-1">
            {message.citations.map((c, i) => (
              <li key={i} className="flex items-center gap-2 font-mono text-[11.5px] text-mist">
                <span className="text-sky">{c.citation}</span>
                <span className="h-1 w-16 overflow-hidden rounded-full bg-ink-700">
                  <span className="block h-full bg-sky/70" style={{ width: `${Math.min(100, c.score * 8)}%` }} />
                </span>
                <span>{c.score}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <TraceList trace={message.trace} />
    </div>
  );
}
