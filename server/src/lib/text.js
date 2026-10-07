/**
 * Long-context analysis toolkit: chunking, retrieval (BM25), extractive
 * summarization and cross-referencing. All deterministic — same input, same output —
 * which is what makes it safe to run a document pass twice and diff the result.
 */

const STOP = new Set(
  `a an the and or but if then than that this those these of for to in on at by with from as is are was were be been being it its it's not no do does did done can could should would may might must will shall have has had i you he she they we them his her their our your my me us about into over under again more most other some such only own same so too very s t just don now also there here what which who whom when where why how all any both each few other own`.split(
    /\s+/,
  ),
);

export function sentences(text) {
  const clean = String(text || '').replace(/\r/g, '');
  const rough = clean
    .split(/(?<=[.!?])[\s\n]+|(?<=[.!?]["')\]])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out = [];
  for (const s of rough) {
    if (s.length <= 600) {
      out.push(s);
      continue;
    }
    // Split monster sentences on clause boundaries so retrieval stays granular.
    let buf = '';
    for (const part of s.split(/(?<=[,;:])\s+/)) {
      if ((buf + ' ' + part).length > 400 && buf) {
        out.push(buf.trim());
        buf = part;
      } else {
        buf = buf ? `${buf} ${part}` : part;
      }
    }
    if (buf.trim()) out.push(buf.trim());
  }
  return out;
}

export function words(text) {
  return (String(text || '').toLowerCase().match(/[a-z0-9][a-z0-9'’._-]*/g) || []).filter((w) => w.length > 1 && !STOP.has(w));
}

/** Chunk a document into overlapping, paragraph-aware windows. */
export function chunkText(text, { targetChars = 1400, overlapChars = 200 } = {}) {
  const paras = String(text || '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks = [];
  let buf = '';
  let start = 0;
  let cursor = 0;

  const push = () => {
    if (!buf.trim()) return;
    chunks.push({ text: buf.trim(), start, end: start + buf.length });
    const keep = buf.slice(-overlapChars);
    start = start + buf.length - keep.length;
    buf = keep;
  };

  for (const p of paras.length ? paras : [String(text || '')]) {
    if (buf.length + p.length + 2 > targetChars && buf.length > targetChars * 0.4) push();
    if (!buf) start = cursor;
    buf += (buf ? '\n\n' : '') + p;
    cursor += p.length + 2;
  }
  if (buf.trim()) chunks.push({ text: buf.trim(), start, end: start + buf.length });

  return chunks.map((c, i) => ({ ...c, index: i, tokens: Math.round(c.text.length / 4) }));
}

/** Build headings outline for structural summarization. */
export function outline(text) {
  const lines = String(text || '').split(/\n/);
  const items = [];
  for (const line of lines) {
    const md = line.match(/^(#{1,6})\s+(.*\S)\s*$/);
    if (md) {
      items.push({ level: md[1].length, title: md[2].replace(/[*_`]/g, '').trim() });
      continue;
    }
    const upper = line.trim();
    if (upper.length > 3 && upper.length < 90 && /^[A-Z0-9][A-Z0-9 \-_:'&,.()/]+$/.test(upper) && upper.split(' ').length <= 12) {
      items.push({ level: 1, title: upper.replace(/\s+/g, ' ') });
    }
  }
  return items.slice(0, 60);
}

/** BM25 over chunked documents. Deterministic, no external services. */
export class Retriever {
  constructor(docs = []) {
    this.chunks = [];
    for (const doc of docs) {
      const pieces = doc.chunks?.length ? doc.chunks : chunkText(doc.text || '');
      for (const piece of pieces) {
        this.chunks.push({
          docId: doc.id,
          docTitle: doc.title || 'Untitled',
          ref: doc.ref || (doc.title || 'Document').slice(0, 28),
          text: piece.text,
          start: piece.start,
          index: piece.index,
          tf: termFreq(piece.text),
          len: words(piece.text).length || 1,
        });
      }
    }
    this.avgLen = this.chunks.reduce((s, c) => s + c.len, 0) / Math.max(1, this.chunks.length);
    this.df = new Map();
    for (const c of this.chunks) {
      for (const term of new Set(c.tf.keys())) this.df.set(term, (this.df.get(term) || 0) + 1);
    }
  }

  search(query, k = 8) {
    const q = [...new Set(words(query))];
    if (!q.length || !this.chunks.length) return [];
    const N = this.chunks.length;
    const k1 = 1.4;
    const b = 0.72;
    const scored = this.chunks.map((c) => {
      let score = 0;
      const matched = [];
      for (const term of q) {
        const f = c.tf.get(term) || 0;
        if (!f) continue;
        matched.push(term);
        const df = this.df.get(term) || 0;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * c.len) / this.avgLen)));
      }
      // small boost for near-exact phrase hits
      const phrase = query.trim().toLowerCase();
      if (phrase.length > 6 && c.text.toLowerCase().includes(phrase)) score *= 1.35;
      return { ...c, score: Number(score.toFixed(4)), matched };
    });
    return scored
      .filter((c) => c.score > 0)
      .sort((a, b2) => b2.score - a.score || a.chunkIndex - b2.chunkIndex)
      .slice(0, k)
      .map((c) => ({ ...c, citation: `${c.ref} §${(c.index ?? 0) + 1}` }));
  }
}

function termFreq(text) {
  const tf = new Map();
  for (const w of words(text)) tf.set(w, (tf.get(w) || 0) + 1);
  return tf;
}

/**
 * Extractive summarizer: position bias + TF-IDF salience + numeric/cue bonuses,
 * then MMR-style de-duplication so bullets don't repeat themselves.
 */
export function summarize(text, { ratio = 0.18, maxSentences = 14, minSentences = 3 } = {}) {
  const sents = sentences(text);
  if (!sents.length) return { summary: '', keyPoints: [], sentences: 0, compression: 0 };
  if (sents.length <= minSentences) {
    return { summary: sents.join(' '), keyPoints: sents, sentences: sents.length, compression: 1 };
  }

  const freq = new Map();
  for (const s of sents) for (const w of words(s)) freq.set(w, (freq.get(w) || 0) + 1);
  const maxFreq = Math.max(...freq.values());
  const cue = /(conclusion|therefore|in summary|result|finding|recommend|risk|key|important|however|must|should|critical|finding)/i;

  const scored = sents.map((s, i) => {
    const ws = words(s);
    if (!ws.length) return { s, i, score: 0 };
    const density = ws.reduce((sum, w) => sum + (freq.get(w) || 0) / maxFreq, 0) / Math.sqrt(ws.length);
    const position = i === 0 ? 1.35 : i < sents.length * 0.15 ? 1.15 : i > sents.length * 0.85 ? 1.1 : 1;
    const lengthFit = s.length < 40 ? 0.7 : s.length > 400 ? 0.75 : 1;
    const numbers = (s.match(/\b\d[\d,.]*%?\b/g) || []).length ? 1.08 : 1;
    const cueBoost = cue.test(s) ? 1.12 : 1;
    return { s, i, score: density * position * lengthFit * numbers * cueBoost };
  });

  const target = Math.max(minSentences, Math.min(maxSentences, Math.round(sents.length * ratio)));
  const picked = [];
  const pool = [...scored].sort((a, b) => b.score - a.score);
  while (picked.length < target && pool.length) {
    const cand = pool.shift();
    const dup = picked.some((p) => jaccard(new Set(words(p.s)), new Set(words(cand.s))) > 0.55);
    if (!dup) picked.push(cand);
  }
  picked.sort((a, b) => a.i - b.i);

  const keyPoints = picked.map((p) => p.s.replace(/\s+/g, ' ').trim());
  const summary = keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n');
  return {
    summary,
    keyPoints,
    sentences: sents.length,
    compression: Number((1 - keyPoints.length / sents.length).toFixed(3)),
  };
}

export function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  return inter / (a.size + b.size - inter);
}

/** Pull out quotable numeric facts with their sentence context — useful for finance/legal docs. */
export function extractFacts(text, { limit = 12 } = {}) {
  const money = /(?:\$|USD|EUR|GBP|KES|€|£)\s?\d[\d,.]*(?:\s?(?:million|billion|bn|m|k))?|\b\d[\d,.]*\s?(?:%|percent|basis points|bps)\b/g;
  const dates = /\b(?:\d{1,2}\/\d{1,2}\/\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|FY\s?\d{2,4})\b/g;
  const out = [];
  const seen = new Set();
  for (const s of sentences(text)) {
    const hits = [...(s.match(money) || []), ...(s.match(dates) || [])];
    if (!hits.length) continue;
    const key = hits.join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ values: hits.slice(0, 6), sentence: s.replace(/\s+/g, ' ').trim().slice(0, 320) });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Cross-reference pass: which documents speak to the same query terms, and where do
 * numbers disagree. This is the "reads, cross-references and summarizes in one prompt"
 * surface — deterministic, and every statement is traceable to a chunk.
 */
export function crossReference(docs, query) {
  const retriever = new Retriever(docs);
  const hits = retriever.search(query, 14);
  const byDoc = new Map();
  for (const h of hits) {
    const entry = byDoc.get(h.docId) || { docId: h.docId, title: h.docTitle, ref: h.ref, hits: [], score: 0 };
    entry.hits.push(h);
    entry.score += h.score;
    byDoc.set(h.docId, entry);
  }
  const themes = new Map();
  for (const h of hits) {
    for (const term of h.matched) {
      const set = themes.get(term) || new Set();
      set.add(h.ref);
      themes.set(term, set);
    }
  }
  const shared = [...themes.entries()]
    .filter(([, refs]) => refs.size > 1)
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 8)
    .map(([term, refs]) => ({ term, documents: [...refs] }));

  // numeric disagreement detector
  const numbersByTopic = new Map();
  for (const h of hits) {
    for (const s of sentences(h.text)) {
      const nums = s.match(/\b\d[\d,.]*\s?%|\b\d[\d,.]{2,}\b/g) || [];
      for (const term of h.matched) {
        const key = `${term}`;
        const arr = numbersByTopic.get(key) || [];
        for (const n of nums.slice(0, 2)) arr.push({ value: n.trim(), ref: h.citation, sentence: s.slice(0, 180) });
        numbersByTopic.set(key, arr);
      }
    }
  }
  const disagreements = [];
  for (const [topic, arr] of numbersByTopic) {
    const distinct = new Map();
    for (const a of arr) {
      const set = distinct.get(a.value) || new Set();
      set.add(a.ref);
      distinct.set(a.value, set);
    }
    const refs = new Set(arr.map((a) => a.ref));
    if (distinct.size > 1 && refs.size > 1) {
      for (const [value, cites] of distinct) {
        if (cites.size === 1 && arr.filter((x) => x.value === value).length === 1) {
          disagreements.push({ topic, value, ref: [...cites][0], note: 'single-source figure — not corroborated' });
          break;
        }
      }
    }
    if (disagreements.length >= 6) break;
  }

  return {
    hits,
    documents: [...byDoc.values()].sort((a, b) => b.score - a.score),
    sharedThemes: shared,
    disagreements,
    coverage: byDoc.size ? Number((byDoc.size / Math.max(1, docs.length)).toFixed(2)) : 0,
  };
}

/** Answer a question from documents, with citations. Extractive + templated framing. */
export function answerFromDocuments(docs, question, { k = 6 } = {}) {
  const retriever = new Retriever(docs);
  const hits = retriever.search(question, k);
  if (!hits.length) {
    return {
      answer:
        'No passage in the supplied documents matches that query. Retrieval found zero overlapping terms, so Forge will not guess — the honest answer is "not in the provided corpus".',
      citations: [],
      confidence: 'none',
      hits: [],
    };
  }
  const grouped = new Map();
  for (const h of hits) {
    const arr = grouped.get(h.ref) || [];
    arr.push(h);
    grouped.set(h.ref, arr);
  }
  const topSentenceTerms = words(question);
  const lines = [];
  for (const [ref, arr] of grouped) {
    const best = arr[0];
    const bestSents = sentences(best.text)
      .map((s) => ({ s, score: words(s).filter((w) => topSentenceTerms.includes(w)).length + (s.length > 60 ? 1 : 0) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)
      .map((x) => x.s.replace(/\s+/g, ' ').trim());
    lines.push({ ref, citation: best.citation, score: best.score, sentences: bestSents });
  }
  const answer = lines
    .map((l, i) => `**${i + 1}. ${l.ref}** — ${l.sentences.join(' ')}\n   - source: \`${l.citation}\` (relevance ${l.score.toFixed(2)})`)
    .join('\n\n');
  const corroborated = lines.length > 1;
  return {
    answer,
    citations: lines.map((l) => ({ ref: l.ref, citation: l.citation, score: l.score })),
    confidence: corroborated ? 'sourced+corroborated' : 'single-source',
    hits,
  };
}
