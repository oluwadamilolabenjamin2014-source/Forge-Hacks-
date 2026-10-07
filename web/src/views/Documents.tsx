import React from 'react';
import { api, type DocumentRecord } from '../lib/api';
import { Chip, Empty, Markdown, Meter, Panel, SectionTitle, Spinner, Stat } from '../components/ui';
import { formatNumber } from '../lib/markdown';

export default function Documents() {
  const [documents, setDocuments] = React.useState<DocumentRecord[]>([]);
  const [title, setTitle] = React.useState('');
  const [text, setText] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<{ kind: 'ok' | 'warn'; message: string } | null>(null);
  const [query, setQuery] = React.useState('key figures and obligations');
  const [hits, setHits] = React.useState<{ citation: string; ref: string; score: number; matched: string[]; text: string }[] | null>(null);
  const [searchNote, setSearchNote] = React.useState('');
  const [xref, setXref] = React.useState<any>(null);
  const [context, setContext] = React.useState<{ used: number; window: number; pct: number } | null>(null);
  const [detail, setDetail] = React.useState<any>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const refresh = React.useCallback(async () => {
    try {
      const docs = await api.documents();
      setDocuments(docs);
      const total = docs.reduce((sum, d) => sum + d.tokens, 0);
      setContext({ used: total, window: 1_000_000, pct: (total / 1_000_000) * 100 });
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const addText = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await api.addDocument({ title: title || undefined, text });
      setNotice({ kind: res.warnings.length ? 'warn' : 'ok', message: res.warnings.join(' ') || `Indexed "${res.title}": ${formatNumber(res.tokens)} tokens across ${res.chunks} chunks.` });
      setText('');
      setTitle('');
      refresh();
    } catch (err) {
      setNotice({ kind: 'warn', message: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    setBusy(true);
    setNotice(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = () => reject(new Error('could not read the file'));
        reader.readAsDataURL(file);
      });
      const res = await api.addDocument({ base64, filename: file.name, title: file.name });
      setNotice({ kind: res.warnings.length ? 'warn' : 'ok', message: res.warnings.join(' ') || `Indexed ${file.name}: ${formatNumber(res.tokens)} tokens, ${res.chunks} chunks.` });
      refresh();
    } catch (err) {
      setNotice({ kind: 'warn', message: (err as Error).message });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const search = async () => {
    const res = await api.searchDocuments(query, 8);
    setHits(res.hits);
    setSearchNote(res.note);
  };

  return (
    <div className="grid h-full grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
        <Panel>
          <SectionTitle
            title="Load documents"
            subtitle="Text, markdown, CSV, JSON, code and PDFs with a text layer. Scanned PDFs are rejected with the reason rather than OCR-guessed."
            right={context && <Meter used={context.used} total={context.window} label="context window" />}
          />
          <div className="space-y-3 p-4">
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="title (optional)" />
            <textarea className="input min-h-[140px] resize-y" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the article, contract, filing or meeting notes…" />
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn-primary" onClick={addText} disabled={busy || !text.trim()}>
                {busy ? 'indexing…' : 'Index text'}
              </button>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept=".txt,.md,.csv,.json,.log,.yml,.yaml,.ts,.js,.py,.sql,.pdf"
                onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
              />
              <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()} disabled={busy}>
                Upload a file
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  const sample = `MASTER SERVICES AGREEMENT (excerpt)

1. TERM. This agreement commences on 2026-01-15 and continues for 24 months, renewing automatically for successive 12-month terms unless either party gives 90 days' written notice.

2. FEES. Customer shall pay USD 12,500 per month, invoiced in arrears. Late payments accrue interest at 1.5% per month. Annual uplift is capped at 4%.

3. DATA PROTECTION. Supplier shall notify Customer of any personal data breach within 72 hours of becoming aware. Supplier's aggregate liability for breach of this clause is capped at USD 250,000.

4. LIABILITY. Except for gross negligence, each party's total aggregate liability is limited to the fees paid in the 12 months preceding the claim. Neither party is liable for indirect or consequential loss. The cap does not apply to breach of confidentiality.

5. TERMINATION. Either party may terminate immediately for material breach not cured within 30 days of written notice. Customer may terminate for convenience on 60 days' notice, subject to a termination fee equal to 3 months of fees.

STATEMENT OF WORK 1

Deliverables: platform migration, data reconciliation, and 40 hours of training. Acceptance testing period is 15 business days. Milestone 1 payment of USD 45,000 is due on acceptance. Milestone 2 payment of USD 45,000 is due 30 days after go-live.`;
                  setText(sample);
                  setTitle('Master Services Agreement (sample)');
                }}
              >
                load a sample contract
              </button>
            </div>
            {notice && (
              <p className={`rounded-lg border px-3 py-2 text-xs ${notice.kind === 'ok' ? 'border-mint/40 bg-mint/5 text-mint' : 'border-forge/40 bg-forge/5 text-forge-soft'}`}>
                {notice.message}
              </p>
            )}
          </div>
        </Panel>

        <Panel>
          <SectionTitle title="Corpus" subtitle="Chunked with paragraph-aware overlap — nothing falls between chunks, so nothing falls out of an answer." />
          <div className="divide-y divide-line">
            {documents.length === 0 && <Empty title="No documents" body="Index something and the analysis surface comes alive: retrieval with citations, cross-referencing, and uncoerced summarisation." />}
            {documents.map((d) => (
              <div key={d.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => api.documentDetail(d.id).then(setDetail)}>
                  <span className="block truncate text-[13px] font-medium text-chalk">{d.title}</span>
                  <span className="block text-[11.5px] text-mist">
                    {formatNumber(d.tokens)} tokens · {d.chunks} chunks · {formatNumber(d.words)} words · {d.kind}
                  </span>
                </button>
                <div className="flex items-center gap-2">
                  {d.outline?.length > 0 && <Chip>{d.outline.length} headings</Chip>}
                  <button type="button" className="btn-danger btn-xs" onClick={() => api.deleteDocument(d.id).then(refresh)}>
                    remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {detail && (
          <Panel>
            <SectionTitle
              title={`Detail — ${detail.title}`}
              subtitle={`${formatNumber(detail.tokens)} tokens · first ${detail.chunks.length} chunks previewed`}
              right={
                <button type="button" className="btn-ghost btn-xs" onClick={() => setDetail(null)}>
                  close
                </button>
              }
            />
            <div className="space-y-3 p-4">
              {detail.summary?.length > 0 && (
                <div>
                  <p className="label mb-1">Extractive summary — sentences copied verbatim from your document</p>
                  <ul className="space-y-1">
                    {detail.summary.map((s: string, i: number) => (
                      <li key={i} className="text-[12px] leading-relaxed text-chalk/85">
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {detail.facts?.length > 0 && (
                <div>
                  <p className="label mb-1">Numbers and dates on the record</p>
                  {detail.facts.map((f: any, i: number) => (
                    <p key={i} className="text-[11.5px] text-mist">
                      <span className="font-mono text-forge-soft">{f.values.join(' · ')}</span> — {f.sentence}
                    </p>
                  ))}
                </div>
              )}
              {detail.outline?.length > 0 && (
                <div>
                  <p className="label mb-1">Structure detected</p>
                  {detail.outline.map((o: any, i: number) => (
                    <p key={i} className="font-mono text-[11.5px] text-mist" style={{ paddingLeft: `${(o.level - 1) * 12}px` }}>
                      {o.title}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </Panel>
        )}
      </div>

      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
        <Panel>
          <SectionTitle
            title="Retrieval — the ground truth"
            subtitle="BM25 over paragraph-aware chunks. Every hit is a verbatim excerpt with a DocRef citation; a miss is reported as a miss."
            right={
              <button type="button" className="btn-primary btn-xs" onClick={search}>
                search
              </button>
            }
          />
          <div className="space-y-3 p-4">
            <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
            {searchNote && <p className="text-[11.5px] text-mist">{searchNote}</p>}
            {hits?.map((h, i) => (
              <div key={i} className="panel-tight px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-[11.5px] text-sky">{h.citation}</span>
                  <span className="flex items-center gap-2">
                    {h.matched.slice(0, 4).map((m) => (
                      <span key={m} className="chip px-1.5 py-0 text-[10px]">
                        {m}
                      </span>
                    ))}
                    <span className="font-mono text-[11px] text-mist">score {h.score.toFixed(2)}</span>
                  </span>
                </div>
                <p className="mt-1.5 text-[12px] leading-relaxed text-chalk/85">{h.text.slice(0, 700)}…</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <SectionTitle
            title="Cross-reference"
            subtitle="Which documents speak to the same terms, and which figures appear exactly once — the single-source numbers that deserve a second look."
            right={
              <button
                type="button"
                className="btn-ghost btn-xs"
                onClick={async () => setXref(await api.crossReference(query))}
              >
                run
              </button>
            }
          />
          <div className="space-y-3 p-4">
            {!xref && <p className="text-[12px] text-mist">Run it with two or more documents loaded and the cross-document overlaps become visible.</p>}
            {xref && (
              <>
                <div className="card-grid">
                  <Stat label="documents touched" value={xref.documents?.length || 0} hint={`coverage ${(xref.coverage * 100).toFixed(0)}%`} />
                  <Stat label="shared themes" value={xref.sharedThemes?.length || 0} hint="terms appearing in 2+ documents" tone="accent" />
                  <Stat label="single-source figures" value={xref.disagreements?.length || 0} hint="not corroborated by another document" />
                </div>
                {xref.sharedThemes?.length > 0 && (
                  <div>
                    <p className="label mb-1">Shared themes</p>
                    {xref.sharedThemes.map((t: any, i: number) => (
                      <p key={i} className="text-[12px] text-chalk/85">
                        <span className="font-mono text-forge-soft">{t.term}</span> — {t.documents.join(', ')}
                      </p>
                    ))}
                  </div>
                )}
                {xref.disagreements?.length > 0 && (
                  <div>
                    <p className="label mb-1">Uncorroborated figures</p>
                    {xref.disagreements.map((d: any, i: number) => (
                      <p key={i} className="text-[12px] text-mist">
                        <span className="font-mono text-rose">{d.value}</span> on <span className="font-mono">{d.topic}</span> in {d.ref} — {d.note}
                      </p>
                    ))}
                  </div>
                )}
                {xref.answer && (
                  <div>
                    <p className="label mb-1">Sourced answer — every statement traceable</p>
                    <Markdown text={xref.answer} />
                  </div>
                )}
              </>
            )}
          </div>
        </Panel>

        <Panel>
          <SectionTitle title="How the analysis surface works" subtitle="No magic, no black box — you can reproduce every step by hand." />
          <div className="grid gap-2 p-4 text-[12px] text-mist sm:grid-cols-2">
            {[
              'Paragraph-aware chunks with 200-char overlap',
              'BM25 scoring (k1 = 1.4, b = 0.72) — a real retrieval score',
              'Phrase-boost re-ranking for near-exact matches',
              'Extractive summaries: sentences copied, never paraphrased',
              'Numbers and dates extracted verbatim, with their sentence',
              'Zero-term matches reported as misses, not filled in',
            ].map((s) => (
              <div key={s} className="flex items-start gap-2">
                <span className="mt-0.5 text-sky">◆</span>
                <span>{s}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
