/**
 * Documents: the corpus for long-context analysis.
 * Text is extracted locally (including a best-effort PDF text-layer extractor), chunked,
 * tokenised and indexed — and the index is what the analysis surface retrieves from.
 */
import express from 'express';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { db, id, nowIso, persist, audit } from '../store.js';
import { chunkText, outline, summarize, extractFacts, Retriever, answerFromDocuments, crossReference } from '../lib/text.js';
import { estimateTokens, contextReport } from '../lib/tokens.js';

const router = express.Router();

/**
 * Best-effort PDF text extraction for PDFs that carry a text layer.
 * Compressed content streams are inflated with zlib; text is pulled from the `Tj`/`TJ`
 * operators. Scanned PDFs have no text layer — that case is reported, never guessed at.
 */
function extractPdfText(buffer) {
  const warnings = [];
  const raw = buffer.toString('latin1');
  const streams = [...raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map((m) => m[1]);
  let text = '';
  let inflated = 0;
  for (const stream of streams) {
    let content = stream;
    try {
      const buf = Buffer.from(stream, 'latin1');
      content = zlib.inflateSync(buf).toString('latin1');
      inflated += 1;
    } catch {
      // not a Flate stream — try the raw bytes as-is
    }
    if (!/(Tj|TJ)/.test(content)) continue;
    for (const line of content.split(/\n/)) {
      if (!/(Tj|TJ)/.test(line)) continue;
      const strings = [...line.matchAll(/\((?:\\.|[^\\()])*\)/g)].map((m) =>
        m[0]
          .slice(1, -1)
          .replace(/\\([()\\])/g, '$1')
          .replace(/\\n/g, '\n'),
      );
      if (strings.length) text += `${strings.join('')} `;
      if (/\)\s*Tj|T\*\s*$|\bTd\b|\bTD\b/.test(line)) text += '\n';
    }
  }
  text = text.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) warnings.push('No text layer found — this PDF is most likely a scan. Run OCR (e.g. ocrmypdf) and re-upload; Forge will not invent content it cannot read.');
  else if (inflated === 0) warnings.push('PDF was not Flate-compressed; extraction may be partial.');
  return { text, warnings };
}

function indexDocument(doc) {
  doc.tokens = estimateTokens(doc.text);
  doc.chunks = chunkText(doc.text);
  doc.outline = outline(doc.text);
  doc.wordCount = doc.text.split(/\s+/).filter(Boolean).length;
  doc.charCount = doc.text.length;
  doc.summary = summarize(doc.text, { ratio: 0.2, maxSentences: 10 }).keyPoints;
  doc.facts = extractFacts(doc.text, { limit: 6 });
  return doc;
}

router.get('/', (_req, res) => {
  res.json(
    db.documents.map((d) => ({
      id: d.id,
      title: d.title,
      kind: d.kind,
      tokens: d.tokens,
      chunks: d.chunks?.length || 0,
      chars: d.charCount,
      words: d.wordCount,
      addedAt: d.addedAt,
      outline: (d.outline || []).slice(0, 8),
      summary: (d.summary || []).slice(0, 3),
    })),
  );
});

router.get('/context', (_req, res) => {
  res.json({ ...contextReport(db.documents, []), documents: db.documents.length });
});

router.post('/', (req, res) => {
  const { title, text, base64, filename } = req.body || {};
  let content = typeof text === 'string' ? text : '';
  let kind = 'text';
  const warnings = [];

  if (!content && base64) {
    const buffer = Buffer.from(String(base64).replace(/^data:[^;]+;base64,/, ''), 'base64');
    const name = String(filename || 'upload');
    if (/\.pdf$/i.test(name) || buffer.slice(0, 4).toString() === '%PDF') {
      const extracted = extractPdfText(buffer);
      content = extracted.text;
      warnings.push(...extracted.warnings);
      kind = 'pdf';
    } else if (/\.(txt|md|csv|json|log|yml|yaml|ts|js|py|sql)$/i.test(name)) {
      content = buffer.toString('utf8');
      kind = name.split('.').pop().toLowerCase();
    } else {
      return res.status(415).json({
        error: 'unsupported_type',
        detail: `Cannot read ${name}. Supported: text, markdown, CSV, JSON, code and PDFs with a text layer. Convert other formats (DOCX/XLSX) to text or PDF first.`,
      });
    }
  }

  if (!content.trim()) return res.status(400).json({ error: 'empty_document', detail: 'No extractable text found.' });
  if (content.length > 8_000_000) return res.status(413).json({ error: 'too_large', detail: 'Documents are capped at 8 MB of extracted text.' });

  const doc = indexDocument({
    id: id('doc'),
    title: (title || filename || content.slice(0, 42).replace(/\s+/g, ' ')).slice(0, 120),
    kind,
    text: content,
    addedAt: nowIso(),
    warnings,
  });
  db.documents.unshift(doc);
  db.documents = db.documents.slice(0, 40);
  persist();
  audit({ action: 'document.index', title: doc.title, tokens: doc.tokens, chunks: doc.chunks.length });

  res.status(201).json({
    id: doc.id,
    title: doc.title,
    tokens: doc.tokens,
    chunks: doc.chunks.length,
    warnings,
    outline: doc.outline.slice(0, 10),
    summary: doc.summary,
  });
});

router.delete('/:id', (req, res) => {
  const before = db.documents.length;
  db.documents = db.documents.filter((d) => d.id !== req.params.id);
  persist();
  res.json({ deleted: before - db.documents.length });
});

router.get('/:id', (req, res) => {
  const doc = db.documents.find((d) => d.id === req.params.id);
  if (!doc) return res.status(404).json({ error: 'not_found' });
  res.json({
    id: doc.id,
    title: doc.title,
    tokens: doc.tokens,
    outline: doc.outline,
    summary: doc.summary,
    facts: doc.facts,
    preview: doc.text.slice(0, 4000),
    chunks: doc.chunks.slice(0, 20).map((c) => ({ index: c.index, tokens: c.tokens, preview: c.text.slice(0, 200) })),
  });
});

/** Retrieval-only: passages + citations, no prose. The ground-truth view. */
router.post('/search', (req, res) => {
  const { query, k = 8 } = req.body || {};
  if (!query) return res.status(400).json({ error: 'query_required' });
  const retriever = new Retriever(db.documents);
  const hits = retriever.search(query, Math.min(Number(k) || 8, 25));
  res.json({
    query,
    indexedChunks: retriever.chunks.length,
    documents: db.documents.length,
    hits: hits.map((h) => ({ citation: h.citation, ref: h.ref, score: h.score, matched: h.matched, text: h.text.slice(0, 900) })),
    note: hits.length
      ? 'BM25 scores over paragraph-aware chunks. Every hit is a verbatim excerpt — nothing is paraphrased at this layer.'
      : 'Zero overlapping terms. The corpus does not appear to discuss this — a retrieval miss is reported as a miss, not filled in with a guess.',
  });
});

router.post('/cross-reference', (req, res) => {
  const { query = 'key figures and obligations' } = req.body || {};
  const cr = crossReference(db.documents, query);
  const answer = answerFromDocuments(db.documents, query);
  res.json({ ...cr, answer: answer.answer, confidence: answer.confidence });
});

export default router;
