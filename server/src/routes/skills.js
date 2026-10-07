/**
 * Skills: reusable markdown workflows.
 *
 * A skill is a versioned markdown file with a fixed step list. Running one is
 * deliberately mechanical: every step is parsed, routed to the same engine it would hit
 * from chat, and executed in order. Same skill + same input → same steps every time.
 * That is the answer to "rarely runs a repetitive task the same way twice": take the
 * variation out of the orchestrator and put it in the file.
 */
import express from 'express';
import { db, id, nowIso, persist, audit } from '../store.js';
import { classify, SURFACE_LABELS, SURFACES } from '../lib/classify.js';
import { localAnswer } from '../lib/localEngine.js';

const router = express.Router();

const STARTERS = [
  {
    slug: 'ui-audit',
    name: 'UI audit',
    description: 'Walks a screen through hierarchy, accessibility, states and performance, in a fixed order so two audits are comparable.',
    stepsHint: 6,
    content: `# UI audit

Run this on one screen at a time. Do not skip steps — the order matters, because
accessibility fixes can change the visual hierarchy and vice versa.

1. **Hierarchy** — is there exactly one primary action, and does it win at a glance? List every element that competes with it.
2. **Spacing rhythm** — measure the gaps. Are they drawn from a scale (4/8/12/16/24/32) or arbitrary? Note every off-scale value.
3. **Contrast** — check body text at 4.5:1 and large text at 3:1. Record the actual ratios, not a verdict.
4. **Keyboard path** — tab through the whole screen. Note any focus trap, missing focus ring, or element you cannot reach.
5. **Empty, loading and error states** — for every list or async region, is there copy for all three? Write the missing strings.
6. **Density and performance** — count DOM nodes in the largest list; anything over ~2,000 rows needs virtualisation.
`,
  },
  {
    slug: 'lesson-plan',
    name: 'Multi-session lesson plan',
    description: 'Builds a week of sessions with objectives, activities, and an assessment that actually measures the objective.',
    stepsHint: 5,
    content: `# Multi-session lesson plan

1. **Objective** — write one observable outcome per session ("can do X", not "understands X").
2. **Prerequisite check** — what must already be true? Design a 3-question diagnostic for the start of session one.
3. **Activity ladder** — for each objective: a worked example, a guided attempt, an independent attempt. Nothing else.
4. **Assessment** — write the item that would be answered incorrectly by someone who only memorised. That is your real test.
5. **Spacing schedule** — put each objective on the calendar three times: day 1, day 3, day 10.
`,
  },
  {
    slug: 'incident-review',
    name: 'Post-incident review',
    description: 'Blameless review that ends in a change that can be verified, not a resolution to be careful.',
    stepsHint: 6,
    content: `# Post-incident review

1. **Timeline** — timestamps only, no interpretation. Note detection time and mitigation time separately.
2. **Impact** — who was affected, how many, for how long, and how was that measured?
3. **Contributing factors** — list at least three. A single root cause is almost always a simplification.
4. **What made it worse** — missing alert, stale runbook, slow rollback. These usually cost more than the original bug.
5. **Action items** — each must be a change that can be verified ("add a synthetic check for /payments"), with an owner and a date.
6. **The rehearsal** — how would we detect this in under five minutes next time? Test that answer this week.
`,
  },
  {
    slug: 'document-diligence',
    name: 'Document diligence pass',
    description: 'Reads a contract or filing, extracts obligations and figures, and flags anything that is single-sourced.',
    stepsHint: 5,
    content: `# Document diligence pass

Run this with the relevant documents attached, then answer each step in order.

1. **Parties and dates** — who is bound, from when, until when, and what triggers early termination?
2. **Obligations** — for each party: what must be done, by when, and what is the remedy if it is not?
3. **Money** — every amount, its currency, its trigger and its cap. List them; do not summarise them.
4. **Unusual terms** — anything that deviates from the market norm, and whether it is mutual or one-sided.
5. **Open questions** — the list a qualified lawyer should answer, ranked by financial exposure.
`,
  },
];

function parseSteps(content) {
  const lines = String(content).split('\n');
  const steps = [];
  let current = null;
  for (const line of lines) {
    const numbered = line.match(/^\s*(?:\d+[.)]|[-*])\s+(?:\*\*(.+?)\*\*|\*\*(.+?)\*\*:?\s*(.*)|\*\*(.+?)\*\*\s*[—-]\s*(.*))?\s*(.*)$/);
    const heading = line.match(/^##\s+(.*)$/);
    if (heading) continue;
    if (numbered && (numbered[1] || numbered[2] || numbered[3] || numbered[4])) {
      if (current) steps.push(current);
      const title = numbered[1] || numbered[2] || numbered[4] || numbered[6] || '';
      const rest = numbered[3] || numbered[5] || (title ? numbered[6] || '' : '');
      current = { title: title.replace(/\s+—.*/, '').trim() || `Step ${steps.length + 1}`, instruction: rest.trim() };
      continue;
    }
    if (current && line.trim()) current.instruction += `${current.instruction ? ' ' : ''}${line.trim()}`;
  }
  if (current) steps.push(current);
  return steps.length
    ? steps
    : lines
        .filter((l) => l.trim())
        .slice(0, 12)
        .map((l, i) => ({ title: `Step ${i + 1}`, instruction: l.replace(/^[-*\d.\s]+/, '').trim() }));
}

function runStep(step, context, settings) {
  const promptText = `${step.title}. ${step.instruction}\n\nInput:\n${context}`;
  const routing = classify(promptText, []);
  const envelope = localAnswer({ prompt: promptText, surface: routing.surface, history: [], documents: [], settings });
  return {
    title: step.title,
    instruction: step.instruction,
    surface: routing.surface,
    surfaceLabel: SURFACE_LABELS[routing.surface],
    confidence: routing.confidence,
    output: envelope.text,
    trace: envelope.trace,
  };
}

router.get('/', (_req, res) => {
  res.json({
    skills: db.skills.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      description: s.description,
      revision: s.revision,
      steps: s.steps,
      updatedAt: s.updatedAt,
      runs: s.runs,
    })),
    starters: STARTERS.map((s) => ({ slug: s.slug, name: s.name, description: s.description, stepsHint: s.stepsHint })),
    note: 'A skill is markdown on disk in this app\'s data store. Edit it, version it, commit it — the runner is deterministic, so a review comment on step 3 applies to every future run.',
  });
});

router.post('/', (req, res) => {
  const { name, description, content, slug } = req.body || {};
  if (!name || !content) return res.status(400).json({ error: 'name_and_content_required' });
  const finalSlug = (slug || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const existing = db.skills.find((s) => s.slug === finalSlug);
  if (existing) {
    existing.name = name;
    existing.description = description || existing.description;
    existing.content = content;
    existing.steps = parseSteps(content).length;
    existing.revision += 1;
    existing.updatedAt = nowIso();
    persist();
    audit({ action: 'skill.update', slug: finalSlug, revision: existing.revision });
    return res.json(existing);
  }
  const skill = {
    id: id('skill'),
    slug: finalSlug,
    name,
    description: description || '',
    content,
    steps: parseSteps(content).length,
    revision: 1,
    runs: 0,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  db.skills.unshift(skill);
  persist();
  audit({ action: 'skill.create', slug: finalSlug, steps: skill.steps });
  res.status(201).json(skill);
});

router.post('/from-starter', (req, res) => {
  const { slug } = req.body || {};
  const starter = STARTERS.find((s) => s.slug === slug);
  if (!starter) return res.status(404).json({ error: 'unknown_starter' });
  // Idempotent: creating a starter twice returns the same shape, with `existed` set.
  // (A differing response shape between the create and exists paths is exactly the kind
  // of inconsistency that makes a client integration break on the second call.)
  const existing = db.skills.find((s) => s.slug === starter.slug);
  if (existing) return res.json({ ...existing, existed: true });
  const skill = {
    id: id('skill'),
    slug: starter.slug,
    name: starter.name,
    description: starter.description,
    content: starter.content,
    steps: parseSteps(starter.content).length,
    revision: 1,
    runs: 0,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  db.skills.unshift(skill);
  persist();
  res.status(201).json(skill);
});

router.get('/:slug', (req, res) => {
  const skill = db.skills.find((s) => s.slug === req.params.slug || s.id === req.params.slug);
  if (!skill) return res.status(404).json({ error: 'not_found' });
  res.json({ ...skill, parsedSteps: parseSteps(skill.content) });
});

router.delete('/:slug', (req, res) => {
  const before = db.skills.length;
  db.skills = db.skills.filter((s) => s.slug !== req.params.slug && s.id !== req.params.slug);
  persist();
  res.json({ deleted: before - db.skills.length });
});

router.post('/:slug/run', (req, res) => {
  const skill = db.skills.find((s) => s.slug === req.params.slug || s.id === req.params.slug);
  if (!skill) return res.status(404).json({ error: 'not_found' });
  const { input = '', documentIds = [], maxSteps } = req.body || {};
  const docs = documentIds.length ? db.documents.filter((d) => documentIds.includes(d.id)) : [];
  const context = input || docs.map((d) => d.text).join('\n\n').slice(0, 20_000) || '(no input supplied)';
  const steps = parseSteps(skill.content).slice(0, Number(maxSteps) || 12);
  const started = Date.now();
  const settings = { determinism: true };
  const results = steps.map((step) => runStep(step, context, settings));

  skill.runs = (skill.runs || 0) + 1;
  persist();
  audit({ action: 'skill.run', slug: skill.slug, revision: skill.revision, steps: results.length });

  res.json({
    skill: { slug: skill.slug, name: skill.name, revision: skill.revision },
    inputLength: context.length,
    steps: results,
    durationMs: Date.now() - started,
    determinismNote: `Revision ${skill.revision} executed ${results.length} steps in a fixed order. Re-run with the same input and you get the same sequence — the value of a skill is that it removes the improvisation, not that it improvises well.`,
  });
});

export default router;
