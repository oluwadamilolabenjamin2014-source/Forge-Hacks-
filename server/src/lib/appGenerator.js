/**
 * Vibe coding: plain English → a working, tested, deployable application.
 *
 * The generator is deterministic and template-driven, so two runs of the same
 * description produce byte-identical projects (diffable, reviewable). It writes a
 * zero-dependency Node backend, a no-build frontend, seed data, a README and a real
 * integration test suite — then the caller actually *runs* the tests and reports the
 * interpreter's verdict rather than claiming success.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../config.js';
import { toSnake, toPascal, toCamel } from './codeTemplates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TPL_DIR = path.join(__dirname, '..', 'templates', 'app');

const F = {
  text: (name, label, required = false) => ({ name, label, type: 'text', required }),
  long: (name, label, required = false) => ({ name, label, type: 'text', required }),
  number: (name, label) => ({ name, label, type: 'number', required: false }),
  money: (name, label) => ({ name, label, type: 'currency', required: false }),
  date: (name, label, required = false) => ({ name, label, type: 'date', required }),
  select: (name, label, options, required = false) => ({ name, label, type: 'select', options, required }),
  bool: (name, label) => ({ name, label, type: 'boolean', required: false }),
};

/** Curated entity library: each entry is a domain-shaped data model plus seed rows. */
export const ENTITIES = {
  books: {
    trigger: /\b(book|reading|library|read(?:ing)? list|novel|author|isbn)\b/,
    name: 'Reading List', collection: 'books', singular: 'Book',
    description: 'Track what you are reading, finished, or want to read next.',
    fields: [
      F.text('title', 'Title', true),
      F.text('author', 'Author', true),
      F.select('status', 'Status', ['to-read', 'reading', 'finished', 'abandoned'], true),
      F.number('pages', 'Pages'),
      F.number('rating', 'Rating (1-5)'),
      F.date('finished_on', 'Finished on'),
      F.text('notes', 'Notes'),
    ],
    numeric: ['pages', 'rating'], groups: ['status', 'author'],
    seed: [
      ['The Pragmatic Programmer', 'Hunt & Thomas', 'reading', 352, 5, null, 'Chapter 4 — tracer bullets'],
      ['Thinking in Systems', 'Donella Meadows', 'finished', 240, 5, '2026-06-02', 'Leverage points chapter is the best part'],
      ['Designing Data-Intensive Applications', 'Martin Kleppmann', 'to-read', 616, null, null, null],
      ['The Mom Test', 'Rob Fitzpatrick', 'finished', 136, 4, '2026-05-11', 'Talk about their life, not your idea'],
    ],
  },
  tasks: {
    trigger: /\b(task|todo|to-do|checklist|project board|kanban|sprint|backlog|chore)\b/,
    name: 'Task Board', collection: 'tasks', singular: 'Task',
    description: 'A focused task tracker with status, priority and due dates.',
    fields: [
      F.text('title', 'Task', true),
      F.select('status', 'Status', ['todo', 'in-progress', 'blocked', 'done'], true),
      F.select('priority', 'Priority', ['low', 'medium', 'high', 'urgent']),
      F.date('due_on', 'Due'),
      F.number('estimate', 'Estimate (h)'),
      F.text('owner', 'Owner'),
      F.text('notes', 'Notes'),
    ],
    numeric: ['estimate'], groups: ['status', 'priority', 'owner'],
    seed: [
      ['Wire up the payments webhook', 'in-progress', 'high', '2026-10-12', 4, 'ada', 'Retries after 24h need a test'],
      ['Draft Q4 roadmap', 'todo', 'medium', '2026-10-20', 6, 'grace', null],
      ['Fix flaky auth test', 'blocked', 'urgent', '2026-10-09', 2, 'ada', 'Waiting on a staging secret'],
      ['Archive old feature flags', 'done', 'low', null, 1, 'sam', null],
    ],
  },
  expenses: {
    trigger: /\b(expense|budget|spend|receipt|finance|money|cost track|invoice|cash ?flow)\b/,
    name: 'Expense Tracker', collection: 'expenses', singular: 'Expense',
    description: 'Log spending by category, see totals and the money flow at a glance.',
    fields: [
      F.text('description', 'Description', true),
      F.money('amount', 'Amount'),
      F.select('category', 'Category', ['food', 'transport', 'housing', 'software', 'health', 'travel', 'other'], true),
      F.select('method', 'Paid with', ['card', 'cash', 'transfer', 'invoice']),
      F.date('spent_on', 'Date', true),
      F.bool('reimbursable', 'Reimbursable'),
      F.text('notes', 'Notes'),
    ],
    numeric: ['amount'], groups: ['category', 'method', 'reimbursable'],
    seed: [
      ['Team lunch', 84.5, 'food', 'card', '2026-10-01', false, null],
      ['Rail pass', 220, 'travel', 'card', '2026-10-03', true, 'Submit before the 15th'],
      ['Cloud hosting', 145.2, 'software', 'invoice', '2026-10-04', false, 'Monthly'],
      ['Pharmacy', 32.75, 'health', 'cash', '2026-10-05', false, null],
    ],
  },
  contacts: {
    trigger: /\b(contact|crm|lead list|clients?|people|network|sales pipeline|relationship)\b/,
    name: 'Contacts', collection: 'contacts', singular: 'Contact',
    description: 'A lightweight CRM: who they are, where you met, when you last spoke.',
    fields: [
      F.text('name', 'Name', true),
      F.text('company', 'Company'),
      F.text('email', 'Email'),
      F.select('stage', 'Stage', ['lead', 'contacted', 'call-booked', 'customer', 'dormant'], true),
      F.date('last_contact', 'Last contact'),
      F.text('notes', 'Notes'),
    ],
    numeric: [], groups: ['stage', 'company'],
    seed: [
      ['Amara Osei', 'Northwind Labs', 'amara@northwind.dev', 'call-booked', '2026-10-02', 'Wants the audit before EOY'],
      ['Ben Katz', 'Fundwise', 'ben@fundwise.io', 'lead', null, 'Met at the fintech meetup'],
      ['Chiara Rossi', 'Rossi & Co', 'chiara@rossico.it', 'customer', '2026-09-28', 'Renewal in January'],
    ],
  },
  recipes: {
    trigger: /\b(recipe|meal|cook|kitchen|menu|dinner|pantry)\b/,
    name: 'Recipe Box', collection: 'recipes', singular: 'Recipe',
    description: 'Collect recipes with timing, servings and what is in the pantry.',
    fields: [
      F.text('name', 'Recipe', true),
      F.select('meal', 'Meal', ['breakfast', 'lunch', 'dinner', 'snack', 'dessert'], true),
      F.number('minutes', 'Time (min)'),
      F.number('servings', 'Servings'),
      F.text('ingredients', 'Key ingredients'),
      F.select('difficulty', 'Difficulty', ['easy', 'medium', 'hard']),
      F.text('notes', 'Notes'),
    ],
    numeric: ['minutes', 'servings'], groups: ['meal', 'difficulty'],
    seed: [
      ['Braised lentils', 'dinner', 55, 4, 'lentils, tomato, cumin, garlic', 'easy', 'Better the next day'],
      ['Shakshuka', 'breakfast', 25, 2, 'eggs, peppers, harissa', 'easy', null],
      ['Focaccia', 'snack', 240, 8, 'flour, olive oil, rosemary', 'medium', 'Rise overnight for the crumb'],
    ],
  },
  workouts: {
    trigger: /\b(workout|gym|exercise|fitness|training log|run|lift|steps|health ?track)\b/,
    name: 'Training Log', collection: 'workouts', singular: 'Session',
    description: 'Log training sessions with volume, duration and how they felt.',
    fields: [
      F.text('session', 'Session', true),
      F.select('kind', 'Type', ['strength', 'cardio', 'mobility', 'sport', 'rest'], true),
      F.number('minutes', 'Duration (min)'),
      F.number('load', 'Load (kg total)'),
      F.number('rpe', 'Effort (1-10)'),
      F.date('performed_on', 'Date', true),
      F.text('notes', 'Notes'),
    ],
    numeric: ['minutes', 'load', 'rpe'], groups: ['kind'],
    seed: [
      ['Squat + accessory', 'strength', 65, 4200, 7, '2026-10-01', 'Felt strong, depth good'],
      ['Zone 2 run', 'cardio', 45, null, 5, '2026-10-03', null],
      ['Mobility circuit', 'mobility', 20, null, 3, '2026-10-04', 'Hips still tight'],
    ],
  },
  habits: {
    trigger: /\b(habit|streak|daily routine|tracker|routine|journal habit)\b/,
    name: 'Habit Tracker', collection: 'habits', singular: 'Habit',
    description: 'Daily habits with streaks and a completion target.',
    fields: [
      F.text('habit', 'Habit', true),
      F.select('cadence', 'Cadence', ['daily', 'weekdays', 'weekly'], true),
      F.number('streak', 'Current streak'),
      F.number('target', 'Weekly target'),
      F.bool('done_today', 'Done today'),
      F.date('started_on', 'Started'),
      F.text('notes', 'Notes'),
    ],
    numeric: ['streak', 'target'], groups: ['cadence', 'done_today'],
    seed: [
      ['Read 20 pages', 'daily', 12, 7, true, '2026-09-20', null],
      ['Zone 2 cardio', 'weekly', 3, 4, false, '2026-09-01', 'Tuesdays and Saturdays'],
      ['Inbox zero', 'weekdays', 8, 5, true, '2026-10-01', null],
    ],
  },
  inventory: {
    trigger: /\b(inventory|stock|warehouse|sku|product list|parts|supplies|asset)\b/,
    name: 'Inventory', collection: 'inventory', singular: 'Item',
    description: 'Stock levels, reorder thresholds and supplier details in one table.',
    fields: [
      F.text('item', 'Item', true),
      F.text('sku', 'SKU', true),
      F.number('quantity', 'Quantity'),
      F.money('unit_cost', 'Unit cost'),
      F.number('reorder_at', 'Reorder at'),
      F.text('supplier', 'Supplier'),
      F.select('location', 'Location', ['main', 'annex', 'in-transit']),
    ],
    numeric: ['quantity', 'unit_cost', 'reorder_at'], groups: ['supplier', 'location'],
    seed: [
      ['Nitrile gloves (M)', 'GLV-M-100', 42, 8.4, 30, 'MedSupply', 'main'],
      ['Thermal labels 50mm', 'LBL-50', 12, 21.9, 20, 'PrintWorks', 'annex'],
      ['Shipping boxes L', 'BOX-L', 180, 1.35, 60, 'PackCo', 'main'],
    ],
  },
  notes: {
    trigger: /\b(note|journal|diary|log ?book|knowledge base|wiki|scratchpad)\b/,
    name: 'Notes', collection: 'notes', singular: 'Note',
    description: 'Fast capture with tags, so nothing good gets lost in a chat scroll.',
    fields: [
      F.text('title', 'Title', true),
      F.text('body', 'Body'),
      F.select('tag', 'Tag', ['idea', 'meeting', 'decision', 'reference', 'personal'], true),
      F.select('status', 'Status', ['inbox', 'actioned', 'archived']),
      F.date('created_on', 'Date'),
      F.bool('pinned', 'Pinned'),
    ],
    numeric: [], groups: ['tag', 'status', 'pinned'],
    seed: [
      ['Pricing experiment idea', 'Try usage-based tier for teams above 20 seats', 'idea', 'inbox', '2026-10-02', true],
      ['Standup 02/10', 'Blocked on the staging secret; escalation sent', 'meeting', 'actioned', '2026-10-02', false],
      ['Decision: Postgres over Mongo', 'Ledger integrity beats schema flexibility here', 'decision', 'actioned', '2026-09-29', true],
    ],
  },
  movies: {
    trigger: /\b(movie|film|watchlist|tv|series|show|anime|documentar)\b/,
    name: 'Watchlist', collection: 'movies', singular: 'Title',
    description: 'Queue what to watch next and rate what you finished.',
    fields: [
      F.text('title', 'Title', true),
      F.select('kind', 'Type', ['film', 'series', 'documentary', 'short'], true),
      F.select('status', 'Status', ['to-watch', 'watching', 'finished', 'dropped'], true),
      F.number('year', 'Year'),
      F.number('rating', 'Rating (1-10)'),
      F.text('where', 'Where to watch'),
      F.text('notes', 'Notes'),
    ],
    numeric: ['year', 'rating'], groups: ['kind', 'status'],
    seed: [
      ['Perfect Days', 'film', 'to-watch', 2023, null, 'Mubi', null],
      ['The Bear', 'series', 'watching', 2022, 9, 'Disney+', 'Season 3'],
      ['The Social Dilemma', 'documentary', 'finished', 2020, 6, 'Netflix', 'Good framing, light on solutions'],
    ],
  },
  applications: {
    trigger: /\b(job|application|apply|vacanc|career|interview|hire|recruit)\b/,
    name: 'Job Applications', collection: 'applications', singular: 'Application',
    description: 'Every application, its stage, and the follow-up you owe someone.',
    fields: [
      F.text('company', 'Company', true),
      F.text('role', 'Role', true),
      F.select('stage', 'Stage', ['saved', 'applied', 'screen', 'interview', 'offer', 'rejected'], true),
      F.date('applied_on', 'Applied on'),
      F.date('follow_up_on', 'Follow up on'),
      F.money('salary', 'Salary band'),
      F.text('notes', 'Notes'),
    ],
    numeric: ['salary'], groups: ['stage', 'company'],
    seed: [
      ['Northwind Labs', 'Senior Engineer', 'interview', '2026-09-18', '2026-10-08', 95000, 'Panel next Tuesday'],
      ['Fundwise', 'Platform Engineer', 'applied', '2026-10-01', '2026-10-10', 88000, 'Referred by Ben'],
      ['Rossi & Co', 'Tech Lead', 'saved', null, null, 105000, 'Draft cover letter'],
    ],
  },
  subscriptions: {
    trigger: /\b(subscription|recurring|saas spend|renewal|licence|license|monthly bills?)\b/,
    name: 'Subscriptions', collection: 'subscriptions', singular: 'Subscription',
    description: 'What you pay for, how often, and when it renews next.',
    fields: [
      F.text('service', 'Service', true),
      F.money('amount', 'Amount'),
      F.select('cycle', 'Billing', ['monthly', 'quarterly', 'annual'], true),
      F.date('next_renewal', 'Next renewal'),
      F.select('owner', 'Owner', ['me', 'team', 'finance']),
      F.bool('essential', 'Essential'),
      F.text('notes', 'Notes'),
    ],
    numeric: ['amount'], groups: ['cycle', 'owner', 'essential'],
    seed: [
      ['Cloud hosting', 145.2, 'monthly', '2026-11-04', 'team', true, 'Scales with traffic'],
      ['Design tool', 480, 'annual', '2026-12-01', 'me', false, 'Three seats, two unused'],
      ['Domain + TLS', 32, 'annual', '2027-02-14', 'me', true, null],
    ],
  },
  events: {
    trigger: /\b(event|conference|meetup|calendar|schedule|talk|workshop|festival)\b/,
    name: 'Events', collection: 'events', singular: 'Event',
    description: 'Upcoming events, where they are and whether you registered.',
    fields: [
      F.text('title', 'Event', true),
      F.date('starts_on', 'Starts', true),
      F.text('location', 'Location'),
      F.select('status', 'Status', ['interested', 'registered', 'attending', 'done', 'skipped'], true),
      F.money('ticket_price', 'Ticket price'),
      F.bool('travel_booked', 'Travel booked'),
      F.text('notes', 'Notes'),
    ],
    numeric: ['ticket_price'], groups: ['status', 'location'],
    seed: [
      ['Forge Hack Weekend', '2026-10-17', 'Nairobi', 'registered', 0, false, 'Bring the demo laptop'],
      ['Systems Reading Group', '2026-10-22', 'Online', 'interested', null, false, null],
      ['InfraCon', '2026-11-14', 'Berlin', 'attending', 420, true, 'Hotel booked'],
    ],
  },
  tickets: {
    trigger: /\b(ticket|issue|bug|support|helpdesk|backlog|incident|request)\b/,
    name: 'Issue Tracker', collection: 'tickets', singular: 'Ticket',
    description: 'Support tickets with severity, state and time-to-resolution.',
    fields: [
      F.text('summary', 'Summary', true),
      F.select('severity', 'Severity', ['low', 'medium', 'high', 'critical'], true),
      F.select('state', 'State', ['new', 'triaged', 'in-progress', 'waiting', 'resolved'], true),
      F.text('reporter', 'Reporter'),
      F.date('opened_on', 'Opened'),
      F.number('hours_open', 'Hours open'),
      F.text('notes', 'Notes'),
    ],
    numeric: ['hours_open'], groups: ['severity', 'state', 'reporter'],
    seed: [
      ['Login loop on Safari 17', 'high', 'in-progress', 'amara@northwind.dev', '2026-10-03', 19, 'Reproduced once, needs a cookie trace'],
      ['Invoice PDF missing VAT', 'medium', 'triaged', 'finance@northwind.dev', '2026-10-04', 11, null],
      ['Typos on pricing page', 'low', 'resolved', 'ben@fundwise.io', '2026-09-29', 4, 'Shipped in 1.4.2'],
    ],
  },
};

export const ENTITY_KEYS = Object.keys(ENTITIES);

export function matchEntity(prompt) {
  const t = String(prompt).toLowerCase();
  for (const [key, entity] of Object.entries(ENTITIES)) {
    if (entity.trigger.test(t)) return { key, ...entity };
  }
  return null;
}

/** Parse declared fields out of "with fields a, b and c". */
export function fieldsFromPrompt(prompt) {
  const m = String(prompt).match(/\bfields?\s*(?:are|of|:)?\s*([a-z0-9_,\s]+?)(?:\.|$|\bwith\b|\band\s+(?:a|an)\b)/i);
  if (!m) return [];
  return m[1]
    .split(/,|\band\b/)
    .map((s) => s.trim().replace(/[^a-z0-9_\s]/gi, ''))
    .filter((s) => s && s.length > 1 && s.length < 24 && !/^(a|an|the|with)$/.test(s))
    .slice(0, 10)
    .map((label) => F.text(toSnake(label), label.replace(/\b\w/g, (c) => c.toUpperCase()), false));
}

const NUMERIC_HINTS = /\b(amount|price|cost|total|quantity|count|score|rating|minutes|hours|days|budget|salary|weight|distance|value|percent|percentage|size|length|duration)\b/;

function inferField(label) {
  const name = toSnake(label);
  const nice = label.replace(/\b\w/g, (c) => c.toUpperCase());
  if (/(^|_)(date|day|on|at)$/.test(name) || /\b(date|deadline|due)\b/.test(label)) return F.date(name, nice);
  if (/\b(amount|price|cost|budget|salary|fee|spend|revenue|value)\b/.test(label)) return F.money(name, nice);
  if (NUMERIC_HINTS.test(label)) return F.number(name, nice);
  if (/\b(status|state|stage|category|type|priority|owner|tag)\b/.test(label)) {
    return F.select(name, nice, inferOptions(label), name === 'status' || name === 'stage' || name === 'priority');
  }
  if (/\b(done|complete|active|pinned|paid|reimbursable|essential|booked|archived)\b/.test(label)) return F.bool(name, nice);
  return F.text(name, nice);
}

function inferOptions(label) {
  if (/priority/.test(label)) return ['low', 'medium', 'high', 'urgent'];
  if (/status|state|stage/.test(label)) return ['open', 'in-progress', 'done'];
  if (/category|tag/.test(label)) return ['general', 'work', 'personal', 'other'];
  if (/type|kind/.test(label)) return ['type-a', 'type-b'];
  return ['option-a', 'option-b', 'option-c'];
}

/** Turn free text into a concrete app specification. */
export function specFromPrompt(prompt, { name } = {}) {
  const text = String(prompt || '').trim();
  const entity = matchEntity(text);
  const explicit = fieldsFromPrompt(text);

  let spec;
  if (entity) {
    const fields = [...(explicit.length ? explicit.map((f) => (f.name === 'name' ? F.text('name', 'Name', true) : inferField(f.label))) : entity.fields)];
    // Guarantee a required title field so validation has teeth.
    if (!fields.some((f) => f.required)) {
      fields[0] = { ...fields[0], required: true };
    }
    spec = {
      entityKey: entity.key,
      entity,
      name: name || entity.name,
      collection: entity.collection,
      singular: entity.singular,
      description: entity.description,
      fields,
      numeric: fields.filter((f) => f.type === 'number' || f.type === 'currency').map((f) => f.name),
      groups: fields.filter((f) => f.type === 'select' || f.type === 'boolean').map((f) => f.name).slice(0, 4),
      seed: entity.seed,
      matched: true,
    };
  } else {
    const titleMatch = text.match(/\b(?:track|tracking|manage|managing|organise|organize|log|logging|record|records? of|list of)\s+(?:my\s+|our\s+|the\s+)?([a-z][a-z0-9\s-]{2,40})/i);
    const rawNoun = (titleMatch?.[1] || 'items').trim().replace(/\s+(with|and|that|which|for)\b.*$/i, '');
    const base = toSnake(rawNoun.split(/\s+/).slice(0, 3).join('_')) || 'items';
    const collection = base.endsWith('s') ? base : `${base}s`;
    const fields = explicit.length ? explicit.map((f) => (f.name === 'name' ? F.text('name', 'Name', true) : inferField(f.label))) : null;
    const finalFields = fields?.length
      ? fields
      : [
          F.text('name', 'Name', true),
          F.select('category', 'Category', ['general', 'work', 'personal', 'other']),
          F.select('status', 'Status', ['active', 'on-hold', 'done'], true),
          F.money('amount', 'Amount'),
          F.date('date', 'Date'),
          F.text('notes', 'Notes'),
        ];
    if (!finalFields.some((f) => f.required)) finalFields[0] = { ...finalFields[0], required: true };
    spec = {
      entityKey: null,
      entity: null,
      name: name || rawNoun.replace(/\b\w/g, (c) => c.toUpperCase()) || 'Tracker',
      collection,
      singular: rawNoun.split(/\s+/)[0].replace(/s$/, '') || 'Item',
      description: `Track ${rawNoun} with search, filters, aggregates and CSV export.`,
      fields: finalFields,
      numeric: finalFields.filter((f) => f.type === 'number' || f.type === 'currency').map((f) => f.name),
      groups: finalFields.filter((f) => f.type === 'select' || f.type === 'boolean').map((f) => f.name).slice(0, 4),
      seed: [],
      matched: false,
    };
  }

  spec.slug = toSnake(spec.name).replace(/_+/g, '-').replace(/^-|-$/g, '') || 'app';
  spec.includes = detectIncludes(text);
  spec.port = 4100 + (hash(spec.slug) % 400);
  return spec;
}

function detectIncludes(text) {
  const t = text.toLowerCase();
  return {
    csvExport: !/\b(no csv|without csv|skip csv)\b/.test(t),
    analytics: !/\b(no (?:stats|analytics|dashboard))\b/.test(t),
    darkMode: true,
    search: !/\bno search\b/.test(t),
  };
}

const hash = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 100000, 7);

/* --------------------------------------------------------------- render */

const readTpl = (name) => fs.readFileSync(path.join(TPL_DIR, name), 'utf8');
const fill = (tpl, vars) =>
  tpl.replace(/\{\{([A-Z_0-9]+)\}\}/g, (match, key) => (vars[key] === undefined ? match : String(vars[key])));

function jsArray(fields) {
  return `[\n${fields
    .map(
      (f) =>
        `  { name: ${JSON.stringify(f.name)}, label: ${JSON.stringify(f.label)}, type: ${JSON.stringify(f.type)}, required: ${Boolean(
          f.required,
        )}${f.options ? `, options: ${JSON.stringify(f.options)}` : ''} }`,
    )
    .join(',\n')}\n]`;
}

function validationBlock(fields) {
  return `const FIELDS = ${jsArray(fields)};

const SELECT_VALUES = Object.fromEntries(FIELDS.filter((f) => f.type === 'select').map((f) => [f.name, f.options]));

/** Coerce + validate a payload. Returns { value, errors } — never throws on user input. */
function validate(body, { partial = false } = {}) {
  const value = {};
  const errors = [];
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { value, errors: ['body must be a JSON object'] };
  }
  for (const key of Object.keys(body)) {
    if (!FIELDS.some((f) => f.name === key)) errors.push(\`\${key} is not a known field\`);
  }
  for (const field of FIELDS) {
    const has = Object.prototype.hasOwnProperty.call(body, field.name);
    if (!has || body[field.name] === undefined) {
      if (!partial && field.required) errors.push(\`\${field.name} is required\`);
      continue;
    }
    const raw = body[field.name];
    if (raw === null || raw === '') {
      if (field.required) errors.push(\`\${field.name} must not be empty\`);
      else value[field.name] = null;
      continue;
    }
    if (field.type === 'number' || field.type === 'currency') {
      const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[^0-9.eE-]/g, ''));
      if (!Number.isFinite(n)) errors.push(\`\${field.name} must be a number\`);
      else if (field.type === 'currency' && n < 0) errors.push(\`\${field.name} must not be negative\`);
      else value[field.name] = n;
      continue;
    }
    if (field.type === 'boolean') {
      value[field.name] = raw === true || raw === 'true' || raw === 1 || raw === '1';
      continue;
    }
    if (field.type === 'date') {
      const d = new Date(String(raw));
      if (Number.isNaN(d.getTime())) errors.push(\`\${field.name} must be a valid date (YYYY-MM-DD)\`);
      else value[field.name] = String(raw).slice(0, 10);
      continue;
    }
    if (field.type === 'select') {
      const allowed = SELECT_VALUES[field.name] || [];
      if (!allowed.includes(String(raw))) errors.push(\`\${field.name} must be one of: \${allowed.join(', ')}\`);
      else value[field.name] = String(raw);
      continue;
    }
    const text = String(raw).trim();
    if (text.length > 2000) errors.push(\`\${field.name} must be 2000 characters or fewer\`);
    else value[field.name] = text;
  }
  if (!partial && !Object.keys(value).length && !errors.length) errors.push('at least one field is required');
  return { value, errors };
}`;
}

function seedRows(spec) {
  if (!spec.seed.length) {
    const sample = {};
    for (const f of spec.fields) {
      sample[f.name] =
        f.type === 'number' ? 12 : f.type === 'currency' ? 24.5 : f.type === 'date' ? '2026-10-01' : f.type === 'boolean' ? true : f.type === 'select' ? f.options[0] : `Sample ${f.label.toLowerCase()}`;
    }
    return [
      { id: '0001', ...sample, createdAt: '2026-10-01T09:00:00.000Z', updatedAt: '2026-10-01T09:00:00.000Z' },
      { id: '0002', ...sample, [spec.fields[0].name]: `Sample ${spec.fields[0].label.toLowerCase()} 2`, createdAt: '2026-10-02T09:00:00.000Z', updatedAt: '2026-10-02T09:00:00.000Z' },
    ];
  }
  return spec.seed.map((row, index) => {
    const record = { id: String(index + 1).padStart(4, '0') };
    spec.fields.forEach((field, i) => {
      const raw = row[i];
      record[field.name] = raw === undefined ? null : raw;
    });
    const stamp = new Date(Date.UTC(2026, 9, 1 + index, 9, 0, 0)).toISOString();
    record.createdAt = stamp;
    record.updatedAt = stamp;
    return record;
  });
}

function curlExample(spec, rows) {
  const row = rows[0] || {};
  const body = {};
  for (const f of spec.fields) {
    if (row[f.name] === null || row[f.name] === undefined) continue;
    body[f.name] = row[f.name];
  }
  return JSON.stringify(body).replace(/'/g, "'\\''").slice(0, 400);
}

function limitsSection(spec) {
  const numeric = spec.numeric.length ? spec.numeric.join(', ') : 'none';
  return [
    `- **Storage** is a single JSON file (\`data/${spec.collection}.json\`) written atomically. That is right for thousands of rows and wrong for millions — swap in SQLite/Postgres when you outgrow it (the route handlers are the only place that touches \`rows\`).`,
    '- **Authentication is not included.** Everything is open by design for a first build; add a session or API-key check in `createServer()` before exposing it publicly.',
    `- **Validation** covers types, required fields, select domains, date parseability and 2000-character text limits. Numeric fields aggregated in \`/stats\`: ${numeric}.`,
    `- **Aggregates** are computed in-process on every request. Fine at this size; add caching if the collection grows past ~10k rows.`,
    spec.matched
      ? '- **Seed data is illustrative** — replace it with your own rows (the shape is the contract, the values are placeholders).'
      : '- **The data model was inferred** from your description. Open `server.js` and edit `FIELDS` to change it — the frontend reads the same list, so the form and table update automatically.',
  ].join('\n');
}

function validRow(spec, seed) {
  const row = seed[0] || {};
  const out = {};
  for (const f of spec.fields) {
    if (row[f.name] === null || row[f.name] === undefined) continue;
    out[f.name] = row[f.name];
  }
  if (!Object.keys(out).length) {
    for (const f of spec.fields) out[f.name] = f.type === 'number' ? 1 : f.type === 'currency' ? 1.5 : f.type === 'date' ? '2026-10-01' : f.type === 'boolean' ? true : f.type === 'select' ? f.options[0] : 'value';
  }
  return out;
}

/** Produce the complete project: { spec, files, tests } . */
export function generateApp(prompt, { name } = {}) {
  const spec = specFromPrompt(prompt, { name });
  const seed = seedRows(spec);
  const accent = ['#f97316', '#38bdf8', '#a78bfa', '#34d399', '#f472b6'][hash(spec.slug) % 5];
  const titleField = spec.fields.find((f) => f.required)?.name || spec.fields[0].name;
  const titleLabel = spec.fields.find((f) => f.name === titleField)?.label || titleField;
  const titleFieldMeta = spec.fields.find((f) => f.name === titleField) || spec.fields[0];
  const sortPref = spec.numeric.includes('amount') ? 'amount' : spec.fields.find((f) => f.type === 'date')?.name || titleField;

  const vars = {
    NAME: spec.name,
    SLUG: spec.slug,
    DESCRIPTION: spec.description,
    DESCRIPTION_JSON: JSON.stringify(spec.description),
    KEYWORDS_JSON: JSON.stringify([spec.collection, 'forge', 'crud', 'json-api']),
    INITIALS: spec.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(),
    ACCENT: accent,
    CURRENCY: 'USD',
    PORT: spec.port,
    COLLECTION: spec.collection,
    SINGULAR_LABEL: spec.singular,
    TITLE_FIELD: titleField,
    TITLE_FIELD_LABEL: titleLabel,
    SORT_FIELD: sortPref,
    VALIDATION: validationBlock(spec.fields),
    NUMERIC_FIELDS: JSON.stringify(spec.numeric),
    GROUP_FIELDS: JSON.stringify(spec.groups),
    FIELDS: jsArray(spec.fields),
    FIELD_TABLE: spec.fields
      .map((f) => `| \`${f.name}\` | ${f.type}${f.options ? ` (${f.options.join(' / ')})` : ''} | ${f.required ? 'yes' : 'no'} |`)
      .join('\n'),
    CURL_EXAMPLE: curlExample(spec, seed),
    LIMITS: limitsSection(spec),
    GENERATED_AT: new Date().toISOString().slice(0, 10),
    VALID_ROW: JSON.stringify(validRow(spec, seed)),
    INVALID_ROW: JSON.stringify(invalidBody(spec)),
    PATCH_ROW: JSON.stringify(patchBody(spec, titleField, titleFieldMeta)),
  };

  const files = [
    { path: 'package.json', language: 'json', content: `${fill(readTpl('package.json.tpl'), vars)}\n` },
    { path: 'server.js', language: 'javascript', content: fill(readTpl('server.js.tpl'), vars), entry: true },
    { path: 'public/index.html', language: 'html', content: fill(readTpl('index.html.tpl'), vars) },
    { path: 'public/app.js', language: 'javascript', content: fill(readTpl('app.js.tpl'), vars) },
    { path: 'public/styles.css', language: 'css', content: fill(readTpl('styles.css.tpl'), vars) },
    { path: 'test/api.test.js', language: 'javascript', content: fill(readTpl('api.test.js.tpl'), vars), test: true },
    { path: 'README.md', language: 'markdown', content: fill(readTpl('README.md.tpl'), vars) },
    { path: `data/${spec.collection}.json`, language: 'json', content: `${JSON.stringify(seed, null, 2)}\n` },
    { path: '.gitignore', language: 'text', content: 'node_modules/\n*.log\n' },
  ];

  return { spec, files, accent, seedCount: seed.length };
}

function invalidBody(spec) {
  const body = {};
  for (const f of spec.fields) {
    if (f.required) continue; // omit the required field → must 422
    body[f.name] = f.type === 'number' || f.type === 'currency' ? 1 : f.type === 'date' ? '2026-10-01' : f.type === 'boolean' ? false : f.type === 'select' ? f.options[0] : 'x';
  }
  return body;
}

function patchBody(spec, titleField, meta) {
  if (meta.type === 'select') return { [titleField]: meta.options[meta.options.length - 1] };
  if (meta.type === 'number' || meta.type === 'currency') return { [titleField]: 42 };
  if (meta.type === 'date') return { [titleField]: '2026-11-30' };
  if (meta.type === 'boolean') return { [titleField]: true };
  return { [titleField]: 'Updated by the test suite' };
}

/** Write a generated project to disk under the configured projects dir. */
export function writeProject(spec, files) {
  const dir = path.join(config.projectsDir, spec.slug);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const file of files) {
    const target = path.join(dir, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content);
  }
  return dir;
}

export { toPascal, toCamel, toSnake };
