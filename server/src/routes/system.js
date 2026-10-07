/**
 * System surface: capability manifest, audit log, settings, health.
 *
 * The capability manifest is the honesty layer: every claim on it is tagged with how it
 * is actually delivered and what it cannot do. If a surface is template-backed or
 * advisory, the manifest says so — in the API, not just in the marketing copy.
 */
import express from 'express';
import os from 'node:os';
import { db, getSettings, patchSettings, persist } from '../store.js';
import config from '../config.js';
import { activeProviders } from '../lib/providers.js';
import { LANGUAGES as CODE_LANGUAGES } from '../lib/codeTemplates.js';
import { LANGUAGES as TRANSLATE_LANGUAGES } from '../lib/languages.js';
import { ENTITY_KEYS } from '../lib/appGenerator.js';

const router = express.Router();

export const CAPABILITIES = [
  {
    id: 'vibe-coding',
    group: 'Build and code',
    title: 'Vibe coding / app building',
    claim: 'Describe an app in plain English; Forge generates a working full-stack project and runs it.',
    delivery: 'Deterministic generator (curated entity models + template rendering), then a real `node --test` run against the generated server before it is called working.',
    verification: 'GET /api/projects → tests.passed/failed from the actual runner.',
    limitations: [
      'The data shape comes from a curated library or is inferred from your wording — check the assumption list on every generation.',
      'Generated apps are single-tenant with no auth: add a session check before exposing one publicly.',
    ],
  },
  {
    id: 'agentic-coding',
    group: 'Build and code',
    title: 'Agentic coding in a local repo',
    claim: 'Multi-file edits, automated debugging and repairs verified by execution.',
    delivery: 'Static rule set (off-by-one, missing await, unseeded reduce, loose equality, sort without comparator, parseInt truncation) + propose/apply/revert loop gated by the test suite.',
    verification: 'GET /api/agent/changes shows kept vs reverted edits, each with before/after pass counts.',
    limitations: [
      'The rule set is finite and deliberately narrow: it fixes defect classes it can verify, and reports the rest as advisory for a human.',
      'No novel feature implementation without a model provider — scaffolding and repairs, not greenfield architecture.',
      'Global architecture decisions are a human job; the ledger exists so a human can review every change.',
    ],
  },
  {
    id: 'code-writing',
    group: 'Build and code',
    title: 'Code writing across languages',
    claim: 'Generates code in JavaScript, TypeScript, Python, SQL, Bash, Go, Rust, HTML/CSS.',
    delivery: 'Curated template library with a real algorithm set, plus baseline scaffolding patterns.',
    verification: 'POST /api/sandbox/generate-and-run executes the output for real and returns the interpreter exit code.',
    limitations: ['Executable sandbox covers Python, Node and Bash. Go/Rust output is written, not compiled here.'],
  },
  {
    id: 'reasoning',
    group: 'Reason and analyse',
    title: 'Structured scientific reasoning',
    claim: 'Decomposes a hard problem into hypotheses, discriminating experiments and failure modes.',
    delivery: 'Domain frames (physics, bio-med, statistics, climate, engineering) + falsification discipline + explicit evidence gap statement.',
    verification: 'Every claim in the reply is either retrieved from an attached document with a citation, or labelled as a structural scaffold.',
    limitations: [
      'Not a knowledge base: the local engine refuses to produce empirical claims from memory, and says so inline.',
      'No literature search. Attach the sources or connect a provider.',
      'Not a substitute for domain expertise — no accountability, no licence, no duty of care.',
    ],
  },
  {
    id: 'long-context',
    group: 'Reason and analyse',
    title: 'Long-context analysis',
    claim: 'Reads, cross-references and summarises whole books, filings and contract sets in one pass.',
    delivery: 'Paragraph-aware overlapping chunking + BM25 retrieval (k1=1.4, b=0.72) + extractive summarisation with sentence-level provenance.',
    verification: 'POST /api/documents/search returns passages, scores and `DocRef §n` citations.',
    limitations: [
      'Soft context target ~1M tokens by tokenizer estimate; local retrieval quality degrades on adversarial or highly repetitive text.',
      'Extractive summaries are faithful but can drop the qualifier that changes a sentence\'s meaning.',
      'Scanned PDFs without a text layer are rejected, with the reason, rather than OCR-guessed.',
    ],
  },
  {
    id: 'writing',
    group: 'Write and communicate',
    title: 'Writing and communication',
    claim: 'Essays, emails, memos, proposals and poetry with defensible structure.',
    delivery: 'Genre templates that encode argument structure — steelman, concession, falsifiable recommendation — with the topic substituted in.',
    verification: 'Output is markdown you can edit; placeholders are bracketed so nothing is silently asserted.',
    limitations: ['Structure is reusable; voice is yours.', 'No factual claims about the world are generated — placeholders mark where your specifics go.'],
  },
  {
    id: 'translation',
    group: 'Write and communicate',
    title: 'Translation',
    claim: `Phrase-level translation with provenance across ${TRANSLATE_LANGUAGES.length} languages.`,
    delivery: 'Curated phrasebook lookup with per-row confidence. Routes to a provider for free text when a key is configured.',
    verification: 'GET /api/system/languages lists the phrasebook, which lives in one reviewable file.',
    limitations: ['Phrase-level equivalence only: word order, gender agreement and register are not modelled by a lookup table.'],
  },
  {
    id: 'math',
    group: 'Write and communicate',
    title: 'Math and logic',
    claim: 'Equations, multi-step variable tracking, percentages, unit and temperature conversion.',
    delivery: 'Tokenizer + recursive-descent parser (no eval), linear solver with a worked step trace, word-problem handlers.',
    verification: 'Every answer ships with the steps, so the arithmetic can be checked by hand.',
    limitations: ['Linear single-variable equations and arithmetic. Not a CAS: no symbolic calculus or systems of equations.'],
  },
  {
    id: 'skills',
    group: 'Automate and operate',
    title: 'Skills',
    claim: 'Reusable markdown workflows that run identically every time.',
    delivery: 'Versioned markdown on disk, parsed into a fixed step list, each step routed through the same engines chat uses.',
    verification: 'Re-run any skill: the step list and order are derived from the file, and `revision` increments on edit.',
    limitations: ['Steps execute against the engines available; without a provider, steps are deterministic rather than generative.'],
  },
  {
    id: 'agentic-workflows',
    group: 'Automate and operate',
    title: 'Computer use / agentic workflows',
    claim: 'Reads files, navigates a repository, executes code, proposes and verifies edits.',
    delivery: 'Real filesystem access inside declared workspaces, unified-diff previews, subprocess execution with hard timeouts.',
    verification: 'Append-only audit log at GET /api/system/audit.',
    limitations: ['No arbitrary desktop/GUI control, and no browser automation.', 'Writes are refused outside declared workspaces; the host repo is mounted read-only.'],
  },
  {
    id: 'connections',
    group: 'Automate and operate',
    title: 'App connections',
    claim: 'Structured, scoped, auditable actions against external services.',
    delivery: 'Explicit grants with scope lists and risk tiers. Simulated execution in this build; high-risk connectors require a named human approver.',
    verification: 'Every invocation is one audit row, including blocked ones.',
    limitations: ['No real-world agency by default. Live execution requires an operator-held credential, and the operator owns the outcome.'],
  },
];

export const LIMITATIONS = [
  { id: 'hallucination', title: 'Hallucinations', honest: 'A probabilistic model states false facts, wrong dates and fabricated citations with full confidence. Fluency and correctness come from the same machinery, so there is no felt difference between a supported answer and a guess.' },
  { id: 'nondeterminism', title: 'Not deterministic', honest: 'Sampled generation means the same prompt can produce different answers. Forge routes verifiable work (math, retrieval, code generation, execution) to deterministic engines and labels which engine answered.' },
  { id: 'inconsistency', title: 'Process inconsistency', honest: 'The same repetitive task is rarely done identically twice unless the process is externalised. That is exactly what Skills are: a fixed step list in a file, executed in order.' },
  { id: 'math', title: 'Math and logic', honest: 'Multi-step logic and spatial reasoning degrade. Forge computes instead of generating: answers come with steps you can check.' },
  { id: 'nuance', title: 'Nuance', honest: 'Sarcasm, irony, humour and local idioms are frequently misread. Text-only input removes tone entirely.' },
  { id: 'bias', title: 'Bias', honest: 'Training data bias is reproduced. Outputs are not audited for demographic fairness, and no automatic detector is claimed here.' },
  { id: 'images', title: 'No native image generation', honest: 'Text and code only. Forge will describe a visual or emit editable SVG rather than pretend to render a photo.' },
  { id: 'agency', title: 'No real-world agency', honest: 'Cannot purchase, book, send, or control a device. Only an explicitly connected extension can act, and the credential holder owns the consequence.' },
  { id: 'sandbox', title: 'Simulates, not executes (usually)', honest: 'Models write code well and run it only in a sandbox. Forge ships the sandbox and runs the code for real, then shows the exit code.' },
  { id: 'memory', title: 'Memory', honest: 'Sessions start fresh by default. Durable state here is explicit and inspectable — documents, projects, skills — not hidden conversational memory.' },
  { id: 'limits', title: 'Usage limits', honest: 'Hosted providers enforce rolling caps that bite during peak demand. Local deterministic surfaces have no such cap because they do not call a model.' },
  { id: 'architecture', title: 'Large architecture', honest: 'Components are handled better than global state, migrations and long-term maintainability. The agent ledger plus human diff review exists for precisely this failure mode.' },
  { id: 'accountability', title: 'No accountability', honest: 'No moral or legal agency. Unauthorised purchases and data exposure are not things a model can be held responsible for; a human holds the credentials and the consequence.' },
  { id: 'governance', title: 'No self-governance', honest: 'Cannot set or re-evaluate its own guardrails. Policy lives in code you can read, and every outward action is written to an append-only log.' },
  { id: 'safety', title: 'Safety filters', honest: 'Refuses explicit violence, hate speech, illegal activity and adult content.' },
  { id: 'advice', title: 'No professional advice', honest: 'Explains legal, medical and financial concepts but is not certified in any of them, and refers critical decisions out. High-stakes prompts trip a review banner.' },
  { id: 'consciousness', title: 'No consciousness or feeling', honest: 'Empathy and opinions are computed from training patterns. There is no persistent self, no stake in the outcome and no experience.' },
];

router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    node: process.version,
    platform: `${os.platform()} ${os.arch()}`,
    memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    engine: activeProviders()[0]?.label || 'forge-local (deterministic)',
    counts: {
      conversations: db.conversations.length,
      documents: db.documents.length,
      projects: db.projects.length,
      skills: db.skills.length,
      connections: db.connections.length,
    },
  });
});

router.get('/capabilities', (_req, res) => {
  const providers = activeProviders();
  res.json({
    engine: providers[0]?.label || 'Forge Local Engine (deterministic)',
    engineNote: providers.length
      ? 'Generation routes to the configured provider. Deterministic tools (retrieval, math, sandbox, generator) stay in the loop regardless.'
      : 'No provider key configured, so every surface is answered by Forge\'s own deterministic engines. That is why the answers look structural rather than conversational — and why they do not hallucinate.',
    capabilities: CAPABILITIES,
    limitations: LIMITATIONS,
    counts: {
      codeLanguages: CODE_LANGUAGES.length,
      translateLanguages: TRANSLATE_LANGUAGES.length,
      appModels: ENTITY_KEYS.length,
      contextWindow: config.limits.contextTokens,
    },
  });
});

router.get('/audit', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 80, 500);
  const filter = req.query.action ? String(req.query.action) : null;
  const rows = filter ? db.audit.filter((a) => a.action?.includes(filter)) : db.audit;
  res.json({ total: rows.length, entries: rows.slice(0, limit) });
});

router.get('/settings', (_req, res) => {
  res.json({ ...getSettings(), providers: activeProviders() });
});

router.patch('/settings', (req, res) => {
  res.json(patchSettings(req.body || {}));
});

router.get('/languages', (_req, res) => {
  res.json({
    code: CODE_LANGUAGES,
    translate: TRANSLATE_LANGUAGES,
    appModels: ENTITY_KEYS,
  });
});

router.post('/reset', (req, res) => {
  const { scope = 'conversations' } = req.body || {};
  const removed = {};
  if (scope === 'conversations' || scope === 'all') {
    removed.conversations = db.conversations.length;
    db.conversations = [];
  }
  if (scope === 'documents' || scope === 'all') {
    removed.documents = db.documents.length;
    db.documents = [];
  }
  if (scope === 'audit' || scope === 'all') {
    removed.audit = db.audit.length;
    db.audit = [];
  }
  persist();
  res.json({ reset: scope, removed });
});

export default router;
