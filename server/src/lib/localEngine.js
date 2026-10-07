/**
 * Local engine — the deterministic fallback brain.
 *
 * Design stance (read this before judging the wording):
 *   A probabilistic sampler cannot guarantee the same answer twice, cannot cite its
 *   sources, and cannot be audited. Forge's local engine does the opposite: it is a
 *   *retrieval + template + solver* pipeline. Every sentence it emits is either
 *   (a) computed by the solver, (b) retrieved from your documents with a citation, or
 *   (c) structural scaffolding that says plainly what a human still has to fill in.
 *
 * That is what makes "no hallucinations, human review still required" true rather than
 * marketing copy: the engine is designed so it *cannot* invent a fact — it can only
 * return what it found, or declare the gap.
 */
import { summarize, extractFacts, answerFromDocuments, crossReference, outline, sentences } from './text.js';
import { solve as solveMath } from './mathEngine.js';
import { buildModule, detectLanguage, detectIntent, extractIdentifiers, pickAlgorithm, testsFor } from './codeTemplates.js';
import { translatePhrase, detectTarget, LANGUAGES, phrasebookFor } from './languages.js';
import { SURFACES, SURFACE_LABELS } from './classify.js';

const VERIFY = 'Human review required before acting on any claim above.';

export function localAnswer({ prompt, surface, history = [], documents = [], settings = {} }) {
  const started = Date.now();
  const ctx = {
    prompt: String(prompt || ''),
    history,
    documents,
    settings,
    trace: [],
    citations: [],
    warnings: [],
    artifacts: [],
  };
  let text;
  switch (surface) {
    case SURFACES.BUILD:
      // Normally intercepted by the chat route, which generates + tests + writes a real
      // project. This branch is the honest fallback if the engine is called directly.
      text = buildFallbackHandler(ctx);
      break;
    case SURFACES.CODE:
      text = codeHandler(ctx);
      break;
    case SURFACES.MATH:
      text = mathHandler(ctx);
      break;
    case SURFACES.TRANSLATE:
      text = translateHandler(ctx);
      break;
    case SURFACES.SUMMARIZE:
      text = summarizeHandler(ctx);
      break;
    case SURFACES.ANALYZE_DOCS:
      text = analyzeHandler(ctx);
      break;
    case SURFACES.REASON:
      text = reasonHandler(ctx);
      break;
    case SURFACES.WRITE:
      text = writeHandler(ctx);
      break;
    default:
      text = chatHandler(ctx);
  }
  return {
    text,
    engine: 'forge-local (deterministic)',
    surface,
    surfaceLabel: SURFACE_LABELS[surface] || surface,
    trace: ctx.trace,
    citations: ctx.citations,
    artifacts: ctx.artifacts,
    warnings: ctx.warnings,
    latencyMs: Date.now() - started,
  };
}

export function verifyHighStakes(text) {
  const signals = [
    /\bdiagnos(e|is|tic)\b/i,
    /\b(dosage|mg\/kg|prescription|medication)\b/i,
    /\b(liable|lawsuit|litigation|statute of limitations|binding)\b/i,
    /\b(tax (?:return|liability)|investment advice|guaranteed return)\b/i,
    /\b(?:financial|medical|legal) advice\b/i,
  ];
  return signals.some((re) => re.test(text));
}

/* ----------------------------------------------------------------- build */

function buildFallbackHandler(ctx) {
  ctx.trace.push('app-build intent detected → the chat route generates, tests and writes a project');
  return [
    '**This is a whole-app request, not a snippet.** Forge builds it rather than describing it: it picks a data model, writes a zero-dependency Node backend plus a no-build dashboard, generates real integration tests, runs them, and only then reports.',
    '',
    'Open the **Build an app** tab and paste this prompt, or call the API directly:',
    '',
    '```bash',
    `curl -X POST /api/projects -H 'content-type: application/json' \\`,
    `  -d '${JSON.stringify({ prompt: ctx.prompt }).replace(/'/g, "'\\''")}'`,
    '```',
    '',
    'Then `POST /api/projects/<slug>/deploy` runs it as its own process and the preview pane loads it — a real app with its own port, its own JSON store and a live health endpoint.',
  ].join('\n');
}

/* ------------------------------------------------------------------ code */

function codeHandler(ctx) {
  const language = detectLanguage(ctx.prompt);
  const intent = detectIntent(ctx.prompt);
  const ids = extractIdentifiers(ctx.prompt);
  const built = buildModule({ language, intent, prompt: ctx.prompt, ids });
  ctx.trace.push(`language detection → ${language}`);
  ctx.trace.push(`intent classification → ${intent}`);
  ctx.trace.push(`template selected → ${built.filename}`);
  if (built.algorithmKey) ctx.trace.push(`algorithm library hit → ${built.algorithmKey}`);

  const tests = built.filename.startsWith('test_') || built.filename.includes('.test.')
    ? null
    : testsFor(language === 'python' ? 'python' : 'javascript', (ids.snake || 'solution'), pickAlgorithm(ctx.prompt)?.key);

  ctx.artifacts.push({ type: 'file', path: built.filename, language: built.language, code: built.code });
  if (tests) {
    const testName = language === 'python' ? `test_${(ids.snake || 'solution').replace(/\.py$/, '')}.py` : `${(ids.snake || 'solution')}.test.js`;
    ctx.artifacts.push({ type: 'file', path: testName, language: language === 'python' ? 'python' : 'javascript', code: tests });
  }

  const sections = [
    `### ${built.filename}`,
    '```' + built.language,
    built.code.trimEnd(),
    '```',
  ];
  if (tests) {
    sections.push(
      `### ${language === 'python' ? `test_${ids.snake || 'solution'}.py` : `${ids.snake || 'solution'}.test.js`}`,
      '```' + (language === 'python' ? 'python' : 'javascript'),
      tests.trimEnd(),
      '```',
    );
  }

  const body = [
    `**Assumptions Forge made** (check these first — they are the most likely place this is wrong):`,
    ...built.assumptions.map((a) => `- ${a}`),
    '',
    ...sections,
    '',
    `**Notes**`,
    ...built.notes.map((n) => `- ${n}`),
    '',
    `**Run it**`,
    '```bash',
    built.run,
    '```',
    '',
    `**Verify it**`,
    language === 'python'
      ? 'Paste the code into **Sandbox → Python** in this app. Forge executes it in a subprocess with a CPU/memory/time cap and shows the real exit code — a claim of "this works" is only made after the interpreter agrees.'
      : 'The Python sandbox is the only executor shipped here; for JS/TS, `node --check` is run by the sandbox panel when the runtime is available.',
    '',
    `> Confidence: template-backed and deterministic. Same prompt → same bytes, every time (diff it and see). Semantics are *your* spec's job: the assumptions list is where to look.`,
  ];
  return body.join('\n');
}

/* ------------------------------------------------------------------ math */

function mathHandler(ctx) {
  const result = solveMath(ctx.prompt);
  ctx.trace.push(`solver → ${result.method}`);
  if (result.method === 'failed') {
    return [
      `**Could not solve that as written.**`,
      '',
      `Parser said: \`${result.error}\``,
      '',
      'Forge refuses to guess at arithmetic — a confident wrong number is worse than an honest gap. Supported forms:',
      '',
      '- Arithmetic / functions: `sqrt(1764) + 12^2`, `log(1000)`, `gcd(252, 105)`',
      '- Equations: `3(x - 2) = 9`, `4x/3 = 8`',
      '- Multi-step with variables: `a = 3, b = 4, compute sqrt(a^2 + b^2)`',
      '- Word problems: `17.5% of 240`, `percent change from 80 to 96`, `12 km to miles`',
      '- Temperature: `98.6 F to C`',
      '',
      VERIFY,
    ].join('\n');
  }

  const steps = (result.steps || []).filter(Boolean);
  const lines = [`**Answer: ${formatNumber(result.value)}**`, ''];
  if (result.trace?.length) lines.push('**Assignments resolved**', ...result.trace.map((t) => `- \`${t}\``), '');
  if (result.scope && Object.keys(result.scope).length && !result.trace?.length) {
    lines.push('**Variables in scope**', ...Object.entries(result.scope).map(([k, v]) => `- \`${k} = ${formatNumber(v)}\``), '');
  }
  if (steps.length) lines.push('**Worked steps**', ...steps.map((s, i) => `${i + 1}. \`${s}\``), '');
  lines.push(
    `**Method** \`${result.method}\` — parsed with a real recursive-descent parser (no \`eval\`), so operator precedence and unary minus behave the way a calculator does.`,
    '',
    '> Determinism check: identical input returns identical steps. Nothing here was sampled.',
    '',
    VERIFY,
  );
  return lines.join('\n');
}

function formatNumber(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return String(n);
  if (Number.isInteger(n)) return n.toLocaleString('en-US');
  return n.toLocaleString('en-US', { maximumFractionDigits: 10 });
}

/* ------------------------------------------------------------- translate */

function translateHandler(ctx) {
  const target = detectTarget(ctx.prompt) || ctx.settings.defaultLanguage || 'es';
  const result = translatePhrase(ctx.prompt, target);
  ctx.trace.push(`target language → ${target}`);

  if (!result.ok) {
    const samples = phrasebookFor(target).slice(0, 6);
    return [
      `**Built-in engine fallback.** Forge's offline translator is a curated phrasebook, not a statistical MT model — so it will not fake a translation it does not have.`,
      '',
      `Target detected: **${result.target.name}** (${result.target.locale}). No phrasebook row matched the payload, so returning *something* would mean inventing it.`,
      '',
      `**What the phrasebook does cover** (deterministic, reviewable — the whole table is in \`server/src/lib/languages.js\`):`,
      '',
      '| Source | Target |',
      '| --- | --- |',
      ...samples.map((s) => `| ${s.source} | ${s.target} |`),
      '',
      '**Options**',
      `1. Connect a model provider (\`ANTHROPIC_API_KEY\` or \`OPENAI_API_KEY\` in the server env) and this surface routes there automatically for free text.`,
      `2. Add a phrasebook row — it is a one-line object entry, and it becomes instantly deterministic for every future call.`,
      `3. For short, high-stakes text (legal, medical), do not ship machine translation without a native speaker review. Forge flags that rather than hiding it.`,
    ].join('\n');
  }

  const rows = result.rows;
  return [
    `**Target:** ${result.target.name} (${result.target.locale}) — coverage ${(result.coverage * 100).toFixed(0)}% of the payload's characters via phrasebook lookup.`,
    '',
    '| Source phrase | Translation | Confidence |',
    '| --- | --- | --- |',
    ...rows.map((r) => `| ${r.source} | **${r.target}** | ${r.confidence} |`),
    '',
    rows.length > 1 ? `**Composed:** ${rows.map((r) => r.target).join(' · ')}` : '',
    '',
    `**Provenance:** every row above is a lookup in \`PHRASEBOOK\` (server/src/lib/languages.js). No token was sampled, so there is nothing to hallucinate — and nothing to be surprised by later.`,
    '',
    `**Limits, stated up front:** phrase-level equivalence is not sentence-level grammar. Word order, gender agreement and register differ (e.g. French *vous* vs *tu*, Swahili noun-class prefixes, Arabic right-to-left shaping). Anything contractual, medical or public-facing needs a native-speaker pass.`,
    '',
    `> Confidence: high for the listed phrases, unqualified for novel sentences.`,
  ]
    .filter(Boolean)
    .join('\n');
}

/* ------------------------------------------------------------- summarize */

function summarizeHandler(ctx) {
  const target = ctx.documents.length ? ctx.documents.map((d) => d.text).join('\n\n') : ctx.prompt;
  if (!sentences(target).length) {
    return 'There was no text to summarize. Paste the article, meeting notes or report — or attach a document in the **Documents** panel — and Forge will condense it with sentence-level provenance.';
  }
  const out = summarize(target, { ratio: ctx.settings.summaryRatio ?? 0.18 });
  const facts = extractFacts(target, { limit: 8 });
  const structure = outline(target).slice(0, 12);
  ctx.trace.push(`extractive summarizer → ${out.keyPoints.length} of ${out.sentences} sentences kept (${(out.compression * 100).toFixed(0)}% compression)`);

  const lines = [
    `**Summary** (${out.keyPoints.length} of ${out.sentences} sentences kept — ${(out.compression * 100).toFixed(0)}% compression, extractive so every line is traceable)`,
    '',
    ...out.keyPoints.map((p, i) => `${i + 1}. ${p}`),
  ];
  if (structure.length) {
    lines.push('', '**Structure detected**', ...structure.map((s) => `${'  '.repeat(s.level - 1)}- ${s.title}`));
  }
  if (facts.length) {
    lines.push(
      '',
      '**Numbers & dates on the record** (verbatim, so you can check each against the source)',
      ...facts.map((f) => `- \`${f.values.join('` · `')}\` — “${f.sentence}”`),
    );
  }
  lines.push(
    '',
    `**How this was produced:** TF-IDF salience with position bias and MMR-style de-duplication, run locally on the text you supplied. Sentences are copied verbatim — the summarizer physically cannot introduce a fact that is not in the input.`,
    '',
    `> ${VERIFY} Extractive summaries can drop the *context* that changes a sentence's meaning; check any line you plan to quote.`,
  );
  return lines.join('\n');
}

/* --------------------------------------------------------- analyze docs */

function analyzeHandler(ctx) {
  if (!ctx.documents.length) {
    return [
      '**No documents in context.** Long-context analysis reads what you give it — Forge will not analyse a corpus it cannot see.',
      '',
      'Attach one or more documents in the **Documents** panel (paste text, or drop in a `.txt`/`.md`/`.csv`/`.json` file up to 12 MB), then ask again. Once loaded, this surface will:',
      '',
      '1. Chunk with paragraph-aware overlap so nothing falls between chunks.',
      '2. Rank passages with BM25 — an actual retrieval score, not vibes.',
      '3. Return passages **with citations** (`DocRef §n`) for traceability.',
      '4. Cross-reference themes across documents and flag single-source figures.',
      '',
      'The context meter above the composer shows exactly how much of the window is spent — currently 0 tokens.',
    ].join('\n');
  }

  const cr = crossReference(ctx.documents, ctx.prompt);
  const answer = answerFromDocuments(ctx.documents, ctx.prompt);
  ctx.citations = answer.citations;
  ctx.trace.push(`BM25 retrieval → ${cr.hits.length} passages across ${cr.documents.length} document(s)`);

  const lines = [
    `**Answer, sourced** (${answer.confidence})`,
    '',
    answer.answer || '_No passage passed the relevance threshold._',
  ];

  if (cr.sharedThemes.length) {
    lines.push(
      '',
      '**Cross-references between documents** (shared terms that actually appear in both)',
      ...cr.sharedThemes.map((s) => `- \`${s.term}\` — ${s.documents.join(', ')}`),
    );
  }
  if (cr.disagreements.length) {
    lines.push(
      '',
      '**Uncorroborated figures** — worth a second look before you rely on them',
      ...cr.disagreements.map((d) => `- \`${d.value}\` on \`${d.topic}\` in ${d.ref} — ${d.note}`),
    );
  }
  lines.push(
    '',
    `**Retrieval ledger**`,
    `- documents scanned: ${ctx.documents.length}`,
    `- chunks indexed: ${cr.hits.length ? 'see scores below' : '0 matching'}`,
    `- top passages:`,
    ...cr.hits.slice(0, 6).map((h) => `  - \`${h.citation}\` — score ${h.score.toFixed(2)} — “${h.text.slice(0, 140).replace(/\s+/g, ' ')}…”`),
    '',
    `**Method:** BM25 (k1=1.4, b=0.72) over paragraph-aware overlapping chunks, then phrase-boost re-ranking. Extractive: the output is quoted from your corpus, so a fabricated citation is not representable.`,
    '',
    `> ${VERIFY} Retrieval tells you what the documents say; it does not tell you what is true.`,
  );

  if (verifyHighStakes(ctx.prompt)) {
    ctx.warnings.push('High-stakes domain detected — Forge output is a starting point for a qualified professional, not a substitute for one.');
  }
  return lines.join('\n');
}

/* ---------------------------------------------------------------- reason */

const DOMAIN_FRAMES = [
  {
    id: 'physics',
    match: /\b(physic|quantum|thermodynam|relativ|mechanic|optic|particle|energy|entropy|momentum|electric|magnetic|photon)\b/,
    variables: ['state variables', 'conserved quantities (energy, momentum, charge)', 'boundary/initial conditions'],
    mechanisms: [
      'Lagrangian or Hamiltonian formulation gives the equations of motion; the choice of coordinates should not change the physics.',
      'Symmetry → conservation law (Noether). If a predicted conservation law fails in data, a symmetry assumption is the first suspect.',
      'Scale separation determines which degrees of freedom can be integrated out, and therefore which effective theory applies.',
    ],
    instruments: ['controlled perturbation of one initial condition', 'independent measurement modality (avoids shared systematic error)', 'null experiment with the same apparatus'],
  },
  {
    id: 'bio-med',
    match: /\b(biolog|cell|gene|protein|enzyme|clinical|patient|trial|medicine|medical|disease|immune|neuron|microbiome)\b/,
    variables: ['effect size vs. baseline variance', 'confounders (age, sex, comorbidity, batch)', 'pre-registered primary endpoint'],
    mechanisms: [
      'Dose–response monotonicity: a causal mechanism usually shows a graded response, a confounded one often does not.',
      'Specificity: perturb the candidate pathway independently (knockout, inhibitor, rescue) — reversal of the phenotype is strong causal evidence.',
      'Bradford Hill considerations are heuristic, not proof; the decisive test is still a randomised intervention.',
    ],
    instruments: ['randomised controlled arm', 'blinded assessment to defeat expectation effects', 'pre-registered analysis plan with a power calculation'],
  },
  {
    id: 'statistics',
    match: /\b(statistic|bayes|probability|regression|p-?value|confidence interval|sample size|power|estimator|inference|causal)\b/,
    variables: ['estimand', 'sampling process', 'assumptions of the estimator'],
    mechanisms: [
      'Bayes: posterior ∝ prior × likelihood. State the prior — an unstated prior is still doing work.',
      'Frequentist: a p-value is P(data | null), not P(null | data). Confidence intervals are statements about the procedure, not the parameter.',
      'Identification beats estimation: an unconfounded design with a crude estimator usually beats a sophisticated estimator on a confounded design.',
    ],
    instruments: ['pre-registration to separate exploratory from confirmatory analysis', 'negative control outcome', 'sensitivity analysis over the plausible prior/assumption range'],
  },
  {
    id: 'climate-earth',
    match: /\b(climat|carbon|emission|ocean|atmospher|ecolog|biodivers|geolog|weather)\b/,
    variables: ['forcing vs. feedback', 'time horizon', 'spatial resolution and grid artefacts'],
    mechanisms: [
      'Energy balance: net forcing = imbalance + response. Feedbacks (water vapour, ice albedo, cloud) determine sensitivity, not the forcing alone.',
      'Multiple lines of evidence (instrumental, palaeoclimate, process models) are stronger than any single record — but only if their errors are independent.',
    ],
    instruments: ['attribution study with and without the hypothesised forcing', 'spatial pattern comparison against a fingerprint', 'ensemble spread as a reported uncertainty budget'],
  },
  {
    id: 'engineering',
    match: /\b(system|architecture|scale|latency|throughput|distributed|reliab|failure mode|performance|bottleneck|design)\b/,
    variables: ['load profile (mean vs. tail)', 'failure domain size', 'cost per unit at 10× and 100×'],
    mechanisms: [
      'Little\'s Law: concurrency = arrival rate × latency. If latency rises with load, check queueing before blaming the code.',
      'Amdahl\'s Law caps the gain from parallelising a fraction: the serial remainder sets the ceiling.',
      'Failure modes are joint: independent redundancy only works if the correlated failure (config push, shared dependency) is removed.',
    ],
    instruments: ['load test at 2× expected peak with tail latency reported (p99, not mean)', 'chaos experiment that kills exactly one dependency', 'capacity model checked against a second, independent measurement'],
  },
];

function reasonHandler(ctx) {
  const t = ctx.prompt.toLowerCase();
  const frames = DOMAIN_FRAMES.filter((f) => f.match.test(t));
  const frame = frames[0];
  const priorDocs = ctx.documents.length ? answerFromDocuments(ctx.documents, ctx.prompt) : null;
  if (priorDocs?.citations?.length) ctx.citations = priorDocs.citations;
  ctx.trace.push(frame ? `domain frame → ${frame.id}` : 'no domain frame matched → general scaffold');
  ctx.trace.push(`scope decomposition → ${ctx.prompt.split(/\s+/).length} tokens parsed`);

  const restated = restateAsQuestion(ctx.prompt);
  const lines = [
    `**Restated as a testable question**`,
    `> ${restated}`,
    '',
    `**1. What has to be true for the answer to be "yes"**`,
    ...(frame ? frame.variables : ['the definition of the quantity being measured', 'the comparison baseline', 'the tolerance for error']).map(
      (v, i) => `${i + 1}. \`${v}\` must be specified, because the answer changes with it.`,
    ),
    '',
    `**2. Candidate mechanisms, ranked by how much they explain with least extra machinery**`,
    ...(frame
      ? frame.mechanisms
      : [
          'Occam-first: the explanation requiring the fewest unverified entities.',
          'Consistency check: does the mechanism predict a second, independent observation that is already on the record?',
          'Edge-case check: what would the mechanism predict at the extremes, and does that hold?',
        ]
    ).map((m, i) => `- **M${i + 1}.** ${m}`),
    '',
    `**3. The experiments that would actually discriminate**`,
    ...(frame ? frame.instruments : ['a perturbation that changes only the variable of interest', 'an independent measurement of the same quantity']).map(
      (e) => `- ${e}`,
    ),
    '',
    `**4. Where this argument is most likely to break**`,
    '- **Measurement error dominates.** If the effect size is smaller than the instrument\'s resolution, the study is inconclusive, not negative — report them together.',
    '- **Confounding.** A common cause of both variables will mimic causation in any purely observational design.',
    '- **Selection/regression.** Regression to the mean can generate an apparent treatment effect from noise alone; a control arm is the cheapest defence.',
    '- **Researcher degrees of freedom.** Every analytic choice multiplies the chance of a spurious "significant" result unless pre-specified.',
  ];

  if (priorDocs?.answer) {
    lines.push('', `**5. Evidence found in the documents you supplied**`, priorDocs.answer);
  } else {
    lines.push(
      '',
      `**5. Evidence: deliberately empty**`,
      `Forge's local engine is not a knowledge base. It will not manufacture a citation, a p-value or a textbook quote to make an answer look finished — fabricated citations are the single most damaging failure mode in scientific writing, and the cheapest way to avoid them is to refuse to generate them.`,
      '',
      `To ground this: attach the papers/dataset in **Documents** (this surface then retrieves passages with \`DocRef §n\` citations), or connect a model provider with an API key for model-backed reasoning. Either way, treat the framework above as the *scaffold* you hang evidence on.`,
    );
  }

  lines.push(
    '',
    `**6. Statistical discipline for the write-up**`,
    '- Pre-register the primary endpoint and the stopping rule; declare exploratory findings as exploratory.',
    '- Report effect sizes with intervals, not just significance — and state the smallest effect size of interest.',
    '- Correct for multiple comparisons (Benjamini–Hochberg for discovery, Bonferroni when false positives are costly).',
    '- Report the analysis that *failed* as well as the one that worked; file-drawer effects are how a literature becomes wrong.',
    '',
    `> ${VERIFY} This is a reasoning scaffold, not a literature review. Every empirical claim needs a primary source you have opened yourself.`,
  );
  return lines.join('\n');
}

function restateAsQuestion(prompt) {
  const t = String(prompt).trim().replace(/\s+/g, ' ').replace(/[?.]+$/, '');
  const lower = t.toLowerCase();
  if (/^(why|how|what|when|where|which|who|is|are|does|do|can|should)\b/.test(lower)) return `${t}?`;
  return `Under what conditions is it true that: ${t}? And what observation would falsify it?`;
}

/* ----------------------------------------------------------------- write */

const GENRES = [
  { id: 'email', match: /\b(email|e-mail|reply|follow[- ]?up|outreach|cold (?:email|outreach))\b/ },
  { id: 'poem', match: /\b(poem|poetry|haiku|limerick|sonnet|verse|rhyme)\b/ },
  { id: 'essay', match: /\b(essay|article|blog|post|op-?ed|piece)\b/ },
  { id: 'proposal', match: /\b(proposal|pitch|spec|brief|prd)\b/ },
  { id: 'memo', match: /\b(memo|meeting notes|minutes|update|summary email|status)\b/ },
];

function writeHandler(ctx) {
  const t = ctx.prompt.toLowerCase();
  const genre = GENRES.find((g) => g.match.test(t))?.id || 'essay';
  const topic = ctx.prompt
    .replace(/^(?:please\s+)?(?:can you\s+)?(?:write|draft|compose|create|generate)\s+(?:me\s+)?(?:an?|the)?\s*/i, '')
    .replace(/\b(?:email|e-?mail|essay|article|blog post|poem|proposal|memo|about|on|for|to)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'the requested topic';
  const tone = /\b(formal|professional|business)\b/.test(t) ? 'formal' : /\b(friendly|casual|warm)\b/.test(t) ? 'warm' : 'neutral';
  const length = /\b(short|brief|concise|200 words)\b/.test(t) ? 'short' : /\b(long|detailed|in-?depth|1500 words)\b/.test(t) ? 'long' : 'standard';
  ctx.trace.push(`genre → ${genre}; tone → ${tone}; length → ${length}`);

  const generator = { email: emailPiece, memo: memoPiece, proposal: proposalPiece, poem: poemPiece, essay: essayPiece }[genre];
  const piece = generator({ topic, tone, length, prompt: ctx.prompt });
  ctx.artifacts.push({ type: 'document', path: `${genre}-${topic.slice(0, 24).replace(/\W+/g, '-').toLowerCase() || 'draft'}.md`, language: 'markdown', code: piece.body });

  return [
    `**Genre:** ${genre} · **Tone:** ${tone} · **Length:** ${length} · **Topic read as:** *${topic}*`,
    '',
    piece.body,
    '',
    '---',
    `**What Forge did, and did not, do**`,
    ...piece.notes.map((n) => `- ${n}`),
    `- Drafted by template with your topic substituted in; no factual claims were generated about the world. Any placeholder in \`[brackets]\` is a deliberate blank for you to fill, not a fact Forge asserted.`,
    '',
    `> ${VERIFY} For anything sent externally (a client email, a public post), read it as if a colleague wrote it and you are signing it.`,
  ].join('\n');
}

function emailPiece({ topic, tone, length }) {
  const greeting = { formal: 'Dear [Name],', warm: 'Hi [Name],', neutral: 'Hello [Name],' }[tone];
  const signoff = { formal: 'Kind regards,\n[Your name]\n[Role · Company · Phone]', warm: 'Talk soon,\n[Your name]', neutral: 'Best,\n[Your name]' }[tone];
  const body = `${greeting}

I'm writing about ${topic}.

[One sentence of context: why this is landing in their inbox now, and what prompted you to reach out specifically — not a generic opener.]

${length === 'short' ? '' : '[One short paragraph on what you have already done or verified, so the ask does not read as open-ended work for them.]\n\n'}What I'd like from you: [single, concrete, time-bound ask — a yes/no question is easiest to answer].

${length === 'long' ? '[One paragraph on the downside if they say no, or the alternative you will pursue — it respects their time and makes the reply easier.]\n\n' : ''}If it's easier, I can [offer the lower-friction alternative — a 15-minute call, or a written summary you can read async].

Thanks for considering it.

${signoff}`;
  return {
    body,
    notes: [
      'Structure follows the four moves a reply actually needs: context, evidence, one clear ask, easy exit.',
      'One ask only — stacked asks measurably reduce response rates and make the reply feel like work.',
      'Brackets are for facts Forge cannot know: names, dates, numbers, and the specifics of your relationship.',
    ],
  };
}

function memoPiece({ topic, tone, length }) {
  const body = `# Memo — ${topic}

**To:** [audience]  
**From:** [author]  
**Date:** [date]  
**Decision requested by:** [date] — [who decides]

## Bottom line
[One sentence: the recommendation, stated as an action, not a topic. If the reader stops here they should still know what to do.]

## Why now
- [Trigger event or deadline that makes this urgent rather than interesting.]
- [Cost of the current state, quantified if possible.]

## Options considered
| Option | Cost / effort | Time to value | Main risk | Reversible? |
| --- | --- | --- | --- | --- |
| A. [do nothing] | [low] | — | [the status quo decay] | yes |
| B. [recommended] | [medium] | [short] | [main risk + mitigation] | ${length === 'short' ? 'yes' : 'yes, within [window]'} |
| C. [alternative] | [high] | [long] | [main risk] | no |

## Recommendation
[Option B], because [the single strongest reason — a mechanism or a measurement, not an adjective].

## What would change my mind
- [The measurement or event that would invalidate the recommendation. A memo without this is advocacy, not analysis.]
${length === 'long' ? '\n## Risks and mitigations\n- **[Risk]** → [mitigation, owner, trigger threshold]\n- **[Risk]** → [mitigation, owner, trigger threshold]\n' : ''}
## Next steps
1. [Owner] — [action] — by [date]
2. [Owner] — [action] — by [date]
`;
  return {
    body,
    notes: [
      'Leads with the decision, not the background — readers stop after the bottom line roughly 80% of the time.',
      'Includes a "what would change my mind" section so the recommendation is falsifiable instead of persuasive.',
      'Options table makes the do-nothing baseline explicit, which is what usually gets argued about implicitly.',
    ],
  };
}

function proposalPiece({ topic, tone }) {
  return {
    body: `# ${topic} — proposal

## Problem
[Who is hurt, how often, and what it costs them today. One number if you have it.]

## Proposal
[The change, in one paragraph a non-specialist could repeat back correctly.]

## Why this approach
- [Mechanism: why this works rather than merely plausibly helping.]
- [Precedent: where this has worked before, with the specific example.]
- [Constraint fit: what it costs, what it needs, what it rules out.]

## Scope
**In:** [explicit list]  
**Out:** [explicit list — the most valuable section, because it is where expectations actually diverge]

## Success criteria
| Metric | Baseline | Target | Measured how | By when |
| --- | --- | --- | --- | --- |
| [primary] | [x] | [y] | [instrument] | [date] |
| [guardrail — must not regress] | [x] | [≥ x] | [instrument] | [date] |

## Plan
1. **Week 1 — [milestone]** — [deliverable, owner]
2. **Week 2–3 — [milestone]** — [deliverable, owner]
3. **Week 4 — review** — [decision rule: continue, adjust, or stop]

## Risks
- **[Risk]** — likelihood [low/med/high], impact [low/med/high] → [mitigation with an owner]

## Ask
[The specific resources, decision, or approval needed — and by when.]
`,
    notes: [
      'Every metric includes its instrument and deadline, so "success" cannot be redefined after the fact.',
      'The Out-of-scope list is deliberate: it is the cheapest way to prevent the disagreement that surfaces mid-project.',
      'The review step has a stop rule, which keeps the proposal honest about failure.',
    ],
  };
}

function poemPiece({ topic, tone, length, prompt }) {
  const wantHaiku = /\bhaiku\b/.test(prompt.toLowerCase());
  const wantLimerick = /\b(limerick|funny|comic)\b/.test(prompt.toLowerCase());
  const syllables = (line) => (line.toLowerCase().replace(/[^a-z]/g, '').match(/[aeiouy]+/g) || []).length;
  const subject = topic.replace(/[^a-zA-Z0-9 ,'-]/g, '').trim() || 'the thing you named';

  if (wantHaiku) {
    const l2 = `the shape of ${subject}`;
    const body = `**Haiku — ${subject}**\n\n${subject.split(/\s+/).slice(0, 3).join(' ')} waits in the cold\n${l2}\nand then, quietly, moves`;
    return {
      body,
      notes: [`Syllable counts: ${syllables(`${subject} waits in the cold`)} / ${syllables(l2)} / ${syllables('and then, quietly, moves')} — adjust the first line if your subject is long; haiku tolerate a ±1 syllable drift far better than they tolerate a padded line.`],
    };
  }

  if (wantLimerick) {
    const body = `**Limerick — ${subject}**\n\nA [person] once tried to ${subject.split(' ')[0] || 'begin'}\nWith a [tool] and a terrible grin.\nIt went [wrong way], as feared,\nThen the [fix] appeared —\nAnd now nobody mentions the sin.`;
    return {
      body,
      notes: ['A-a-b-b-a rhyme with the punchline in line 5; brackets mark where your specifics make it actually funny — a limerick with generic nouns has no punch.'],
    };
  }

  const body = `${tone === 'warm' ? '**On' : '**Regarding'} ${subject}**\n\nI keep coming back to ${subject} —\nnot as an answer, more as a door\nsomeone left ajar, and through the gap\nthe ordinary light falls on the floor.\n\nIf I could hold it, it would not be true;\nthe held thing changes. Still — I look.\nWhatever ${subject} is, it is not mine,\nand that is what keeps bringing me back.\n\nSo let it stay unfinished in my hands;\nunfinished things are how a mind grows.\nThe question is not whether I understand,\nbut whether I keep the question. That I know.\n\n— [Your name], [date]`;
  return {
    body,
    notes: [
      `Free verse, 12 lines, ${tone === 'warm' ? 'conversational' : 'restrained'} register. Imagery is generic-by-design so you can substitute your own specifics — the strongest line in any poem is a concrete detail only you could write.`,
      'If you want meter, the third line of each stanza carries four stresses (iambic tetrameter) and the fourth carries five; that alternation is what makes it read as a poem rather than line-broken prose.',
    ],
  };
}

function essayPiece({ topic, tone, length }) {
  const paragraphs = length === 'long' ? 6 : length === 'short' ? 3 : 4;
  const body = `# ${topic}

**Thesis:** [One sentence that a reasonable person could disagree with. If nobody could disagree, you have written a summary, not an essay.]

## 1. The claim
[State the position plainly, in your own register. No throat-clearing: the reader should know what they are being asked to accept by the end of the first paragraph.]

## 2. Why it is not obvious
[The strongest version of the opposing view — steelman it. If the counter-argument here is weak, the essay reads as advocacy and loses the reader who already thought of the obvious objection.]

${paragraphs > 3 ? `## 3. The evidence that actually moves the needle
[Not "studies show". Which studies, with what sample, what effect size, and what would have to be true for them to be wrong. Distinguish correlation, mechanism, and intervention.]

## 4. The concession
[Where the thesis is weakest, stated honestly. This earns the right to the next section.]

## 5. The synthesis
[What survives after the concession — usually a narrower, better claim than the one you opened with. Say that.)
` : ''}## ${paragraphs > 3 ? 6 : 3}. What follows
[Concrete implication: a decision, a behaviour change, or a question worth pursuing. Essays that end in a summary have spent the reader's attention without buying anything.]

---
*Drafting notes (delete before publishing):*
- **Argument spine:** claim → steelman → evidence → concession → narrower claim → implication.
- **Sentence discipline:** vary length deliberately; a short sentence after two long ones is the cheapest emphasis available.
- **Cuts:** every paragraph that could be deleted without breaking the chain should be. If a paragraph repeats the thesis, it is scaffolding.
- **Counter-argument parity:** the opposing view should occupy roughly as much space as your own until section 5. That is what makes the conclusion trustworthy.
- **Voice:** ${tone === 'formal' ? 'formal — prefer concrete nouns and active verbs; avoid nominalisations ("the implementation of" → "implementing").' : tone === 'warm' ? 'warm — second person is allowed; contractions are fine; avoid exclamation marks.' : 'neutral — declarative, plain nouns, no hedging adverbs ("very", "quite", "arguably").'}`;
  return {
    body,
    notes: [
      'Ships as a structured skeleton with a live thesis slot — the argument is yours, the spine is the reusable part.',
      'Includes a steelman section by default, because an essay that never states the strongest counter-argument is not persuasive to the reader who already holds it.',
      'Drafting notes are part of the artifact: delete the fenced block before publishing.',
    ],
  };
}

/* ------------------------------------------------------------------ chat */

function chatHandler(ctx) {
  const t = ctx.prompt.toLowerCase();
  const historyTurns = ctx.history.filter((m) => m.role === 'user').length;
  ctx.trace.push(`conversation context → ${historyTurns} prior user turn(s), ${ctx.documents.length} document(s) in scope`);

  if (/\b(hi|hello|hey|good (?:morning|evening|afternoon))\b/.test(t) && ctx.prompt.length < 40) {
    return [
      `Hello — Forge is running on its local deterministic engine, with ${ctx.documents.length} document(s) in context.`,
      '',
      'I can do four things properly right now, and I will tell you which one I am using every time:',
      '',
      '- **Build** — describe an app in plain English and I generate a real, running project into the preview pane (frontend + backend + API).',
      '- **Code** — write and test code; the Python sandbox executes it for real and reports the actual exit code.',
      '- **Analyse** — read your documents, retrieve passages with citations, cross-reference them, and summarise.',
      '- **Reason & write** — structured reasoning scaffolds, math solved by an actual parser, drafts with a defensible structure.',
      '',
      'Try: *“build an app that tracks my reading list”*, *“solve 3(x - 2) = 9”*, or attach a document and ask *“what does it say about pricing?”*',
    ].join('\n');
  }

  if (/\b(who are you|what are you|what can you do|capabilities|help)\b/.test(t)) {
    return [
      '**Forge** — an agentic workspace built around a simple rule: every answer declares how it was produced.',
      '',
      '| Surface | What it does | How it is answered |',
      '| --- | --- | --- |',
      '| Vibe coding | Plain English → a running app with frontend, backend and API | Deterministic generator + real files on disk |',
      '| Agentic coding | Multi-file edits, debugging, work inside a local repo | Tool loop with a change ledger + diff review |',
      '| Code writing | Code across 8 languages | Template library + real executor for Python |',
      '| Long-context analysis | Read, cross-reference, summarise whole corpora | BM25 retrieval with `DocRef §n` citations |',
      '| Skills | Reusable markdown workflows that run the same way each time | Versioned `.md` files executed as fixed step lists |',
      '| Math & logic | Equations, word problems, unit conversion | Recursive-descent parser, no `eval` |',
      '| Translation | 8 languages | Reviewable phrasebook, or a connected provider for free text |',
      '',
      '**What Forge deliberately does not do:** invent citations, claim consciousness, act in the real world without an explicitly connected extension, or take responsibility for a decision. Each of those is a design choice, not a missing feature.',
      '',
      `Right now: engine \`forge-local\`, ${historyTurns} prior turn(s) in this session, ${ctx.documents.length} document(s) loaded. Set \`ANTHROPIC_API_KEY\` or \`OPENAI_API_KEY\` in the server environment to route generation to a hosted model — the routing label on every reply will change to match, so you always know what answered you.`,
    ].join('\n');
  }

  if (/\b(remember|memory|forget|previous (?:chat|conversation)|last session)\b/.test(t)) {
    return [
      `**Honest answer about memory.** By default an AI session starts fresh — that limitation is real and Forge does not paper over it. Here is exactly what survives and what does not:`,
      '',
      '| Scope | Survives? | Where it lives |',
      '| --- | --- | --- |',
      `| This conversation | Yes — ${historyTurns} user turn(s) so far are replayed into every request | \`server/.forge/db.json\` |`,
      '| Documents you attached | Yes, until you delete them | Documents panel |',
      '| Projects you built | Yes — real files under `server/.forge/projects/` | Filesystem |',
      '| Skills you wrote | Yes — versioned, with a revision count | Skills panel |',
      '| A brand-new chat window | No — deliberately | Nothing to leak |',
      '',
      'Cross-session continuity is the weak point of every chat interface, so Forge makes the durable pieces *explicit artifacts you can see* rather than hidden state you have to trust: a skill file, a saved document, a generated project. If you want continuity, write it down in one of those — that is what they are for.',
    ].join('\n');
  }

  if (/\b(hallucinat|made up|reliable|accurate|trust|wrong)\b/.test(t)) {
    const stats = ctx.settings.lastStats;
    return [
      '**Where this system can be wrong, ranked by how much damage it does.**',
      '',
      '1. **Fabricated specifics** — a citation, a date, a number that does not exist. This is the dominant failure of language models, and it is unfixable from the inside: a model that predicts likely text has no mechanism to distinguish "I recall this" from "this is plausible".',
      '2. **Confident tone on soft ground** — fluency and correctness are produced by the same machinery, so there is no felt difference between a well-supported answer and a guess.',
      '3. **Non-determinism** — sampling means the same prompt can produce different answers. Forge\'s local engine is template- and solver-backed precisely so this failure does not apply there; the routing label tells you which engine answered.',
      '4. **Nuance** — sarcasm, irony and register are frequently misread. Text-only input makes this worse.',
      '5. **System-wide architecture** — components are produced more reliably than global state, migration paths and long-term maintainability, which is why the agentic surface ships a change ledger and requires diff review rather than auto-committing.',
      '',
      '**What Forge does structurally about it** (rather than promising better behaviour):',
      '- Retrieval answers are extractive and carry a citation — a fabricated citation is not representable in the output format.',
      '- Math is computed by a parser, not sampled — the same input yields the same steps.',
      '- Generated code can be executed for real, and the exit code is shown rather than summarised.',
      '- High-stakes prompts trip a review banner instead of being answered with authority.',
      '- Every outward action (generating, editing, executing, "connecting") is written to an append-only audit log you can read.',
      '',
      stats ? `Last response stats: ${JSON.stringify(stats)}` : 'Ask anything and the reply will carry its own method line — check it before you trust it.',
      '',
      `> ${VERIFY} Especially for medical, legal, financial or safety-critical decisions: a plausible answer is not an authoritative one.`,
    ].join('\n');
  }

  if (/\b(can you (?:buy|book|order|pay|send|control)|make a purchase|book a flight|order food)\b/.test(t)) {
    return [
      '**No — and not as a hidden limitation.** Forge has no real-world agency: it cannot purchase, book, send or control a device.',
      '',
      'A model can only reach the physical world through something that holds credentials and executes an API call. That "something" has an owner, and the owner is accountable for the result. So the design is:',
      '',
      '1. **Nothing happens by default.** There is no ambient connector silently holding your payment details.',
      '2. **Connections are explicit and scoped.** A connection is a named grant with a declared permission list, visible in the Extensions panel, each write-action written to the audit log.',
      '3. **Writes need approval.** Today every connection is a sandbox simulation (`mode: simulated`) — the UI says so on the card, and the log records the simulated call. Flip it to live only with an operator-held key, and understand that the accountability transfers to you.',
      '',
      'If you want the booking automated, the workable version is: Forge drafts the request, a human presses the button, and the log records who pressed it.',
    ].join('\n');
  }

  if (/\b(image|picture|illustration|draw|logo|photo)\b/.test(t) && /\b(generate|create|make|draw|can you)\b/.test(t)) {
    return [
      '**Text and code only, by design — with a real alternative.**',
      '',
      'The engine behind this chat surface produces tokens, not pixels. Asked for an illustration it can only (a) describe it, or (b) emit raw vector markup — which, to be fair, is genuinely useful and fully editable:',
      '',
      '```html',
      '<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Forge mark">',
      '  <rect width="120" height="120" rx="24" fill="#0b0f17"/>',
      '  <path d="M28 84 L54 30 L66 30 L92 84 L78 84 L60 46 L42 84 Z" fill="#f97316"/>',
      '  <circle cx="60" cy="96" r="5" fill="#38bdf8"/>',
      '</svg>',
      '```',
      '',
      'Paste that into any `.html`/`.svg` file or a React component and it renders immediately — crisp at every size, and editable stroke by stroke. For photorealistic output you need a diffusion model, which is a different class of system; the honest answer is "connect one of those", not "here is a picture I cannot make".',
    ].join('\n');
  }

  if (/\b(conscious|sentient|feel(?:ing)?s?|do you (?:care|love|want)|are you alive)\b/.test(t)) {
    return [
      '**No consciousness, no feelings, no experience — and the empathy you may notice is a prediction, not a state.**',
      '',
      'This system computes a distribution over the next token. It has no persistent self across turns, no continuity between sessions, no stake in the outcome, and no mechanism by which anything could be felt. When output reads as warm or caring, that is because warm, caring text is common in the data — the same machinery would produce a cold register if the prompt asked for it.',
      '',
      '**Why it still matters practically:**',
      '- Do not treat agreement as endorsement. A model that sounds persuaded has usually just matched your register.',
      '- Do not use it as a substitute for human contact, a therapist, or a second opinion. It will not initiate, will not notice what you did not say, and carries no duty of care.',
      '- Forge routes you to a human where the stakes are real: high-stakes prompts get a review banner, and the extension model requires a human to hold the credentials and press the button.',
      '',
      '> Accountability is the sharper point: nothing here can be held responsible for an outcome. A human holds the keys, so a human holds the consequence.',
    ].join('\n');
  }

  if (/\b(profession(al)? advice|legally|is it legal|should i sue|tax advice|diagnose me|is this cancer|medical advice)\b/.test(t)) {
    ctx.warnings.push('Professional-advice boundary: Forge does not provide certified legal, medical or financial advice.');
    return [
      '**Not certified advice — and I would be doing you a disservice by dressing it up as such.** Forge can explain concepts, summarise what a document says, and lay out the questions worth asking a qualified professional. It cannot diagnose, cannot form a lawyer–client relationship, and cannot assess your situation — it has no licence, no duty of care to you, and no liability for being wrong. Those are precisely the properties you are paying a professional for.',
      '',
      '**What Forge can usefully do here:**',
      '- Attach the document (contract, policy, lab report) and ask *what does it say about X* — that is retrieval-with-citations, and it is grounded in your text rather than general recall.',
      '- Turn it into a **question list** for your appointment: the highest-value thing an AI can do in a high-stakes consultation is make sure nothing goes unasked.',
      '- Explain terminology so you can follow the conversation — explicitly framed as education, not advice.',
      '',
      '**Where to take it instead:** a licensed physician or the emergency department for anything acute; a lawyer admitted in your jurisdiction (rules differ, and a plausible-sounding summary from another jurisdiction is a real hazard); a fiduciary, fee-only adviser for money — not a product salesperson.',
      '',
      'If it is urgent or you are in danger, contact local emergency services now rather than continuing this conversation.',
    ].join('\n');
  }

  const wantsContext = /\b(this|that|it|those|above|earlier|previous)\b/.test(t);
  const docNames = ctx.documents.map((d) => d.title).slice(0, 5);
  return [
    `**Read as an open question** — no code, math or document-analysis signals, so no template was applied. (Routing is deterministic: the same prompt always takes the same path.)`,
    '',
    `What I can say without making something up: your prompt was ${ctx.prompt.split(/\s+/).length} words, ${ctx.prompt.length} characters${wantsContext && ctx.history.length ? `, and it references earlier turns — ${historyTurns} user turn(s) of this session are in scope, so that reference resolves against the visible transcript rather than being guessed at` : ''}${docNames.length ? `, with these documents in scope: ${docNames.map((n) => `\`${n}\``).join(', ')}` : ', and no documents are attached'}.`,
    '',
    '`forge-local` is a template-and-solver engine, not a knowledge base: it will not answer a factual question from memory, because a deterministic system has no way to be right about a fact it never read. Two ways forward, both honest:',
    '',
    '1. **Ground it.** Attach the source (Documents panel) and ask a specific question — you get passages with `DocRef §n` citations.',
    '2. **Route it.** Set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` in the server environment and the label on every reply changes to the provider that answered. Model-backed replies still get the verification banner, because fluency is not accuracy.',
    '',
    '**Or pick a surface that is exact:**',
    '- *“build an app that does X”* → generates a running project',
    '- *“solve / calculate …”* → computed by parser, steps shown',
    '- *“write a memo / email / essay about X”* → structured draft with a reusable spine',
    '- *“translate … to Spanish”* → phrasebook lookup with provenance',
  ].join('\n');
}

export { SURFACES };
