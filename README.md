# Forge — an agentic AI workspace that shows its work

Built for the Forge hackathon. Forge implements the whole capability list from the brief —
**vibe coding, agentic repo work, code generation and execution, long-context analysis,
summarisation, writing, translation, skills, computer-use-style workflows and audited app
connections** — and it implements the limitation list too: every claim in the UI says how
it is actually delivered, and where it breaks.

The design rule behind all of it:

> Deterministic where correctness is checkable. Sampling only where plausibility is the requirement.
> Every answer carries the engine that produced it, and nothing is called "working" until it has been executed.

No API key is required. Forge runs its own engines locally; set `ANTHROPIC_API_KEY` or
`OPENAI_API_KEY` and generative surfaces route to a hosted model instead — the routing label
on each reply changes to match, so you always know what answered you.

---

## Quick start

Two commands, no API key, no database:

```bash
npm install
npm start              # → http://localhost:3001
```

`npm start` builds the React UI on first run if it is missing or stale (about 10 seconds,
once), then boots the API server, which serves the UI and reverse-proxies any deployed
generated apps. Nothing else to configure.

For development with HMR:

```bash
npm run dev            # Vite on :5173 (proxies /api and /generated) + API on :3001 with --watch
```

Verify everything actually works, end to end:

```bash
node scripts/smoke.js          # 37 live checks across every surface (needs the server running)
node scripts/agent-test.mjs    # watches the repo agent repair a real repository, step by step
```

Environment variables (all optional):

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | API port (binds `0.0.0.0`) |
| `FORGE_DATA_DIR` | `server/.forge` | Where conversations, documents, projects and the audit log live |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | — | Route generation to a hosted model |
| `FORGE_SANDBOX_TIMEOUT_MS` | `6000` | Wall-clock cap per sandboxed run |

---

## What each surface does

### 1. Build and code

**Vibe coding — `Build an app` tab, or just ask chat.**
Describe an app in plain English ("build an app that tracks my reading list with a rating").
Forge picks a curated data model or infers one, writes a **zero-dependency Node backend**
(hand-rolled `http`, validation, search, sort, pagination, aggregates, CSV export, atomic
JSON persistence, path-traversal guard, health endpoint), a **no-build dashboard**, a README,
seed data, and a **12-test integration suite**. It then *runs that suite* and reports the
interpreter's verdict. Deploying starts it as its **own OS process** on its own port behind
`/generated/<slug>/`, and the health check is what decides whether the word "deployed" is allowed.

**Agentic coding — `Repo agent` tab.**
A real repository on disk, a real tool loop: `scan → propose → apply → run the suite → keep or
revert`. Six defect classes are auto-fixable (off-by-one loop bound, missing `await`, `sort()`
without a comparator, unseeded `reduce`, loose equality, `parseInt` truncation on money); a
change is **kept only if the suite improves**, otherwise it is reverted and labelled. The seeded
demo repo starts at **3 passing / 10 failing** and ends **13 / 0, six verified fixes**. Every
edit is a unified diff in a ledger, the workspace is a git repo, and the app's own source is
mounted read-only so the agent cannot rewrite its own runtime.

**Code writing and execution — `Sandbox` tab.**
Templates across 8 languages (algorithm library plus API/CLI/validation/SQL/React/Docker
scaffolds). Python, Node and Bash are executed **for real** in a subprocess with a scrubbed
environment and a SIGKILL timeout — Python also returns a line-level execution trace with local
values. Generated code can be run immediately, and the exit code shown is the interpreter's.

### 2. Reason and analyse

**Long-context document analysis — `Documents` tab.**
Paste or upload text, markdown, CSV, JSON, code, or PDFs with a text layer (scanned PDFs are
rejected with the OCR instruction instead of being guessed at). Documents are chunked with
paragraph-aware overlap, indexed, and served through **BM25 retrieval with `DocRef §n`
citations**. Summaries are **extractive** — sentences are copied verbatim, so the summariser
cannot introduce a fact. Numbers and dates are pulled out with their surrounding sentence, and
cross-referencing surfaces shared themes plus **single-source figures** that deserve a second look.
A query with no term overlap returns "not in the corpus" rather than a plausible invention.

**Structured scientific reasoning.**
Domain frames (physics, bio-medicine, statistics, climate, engineering) produce hypotheses,
discriminating experiments, statistical discipline and the failure modes of the argument.
The evidence section is **deliberately empty** unless documents are attached: the local engine
refuses to manufacture citations, because a fabricated citation is the most damaging failure
mode in scientific writing.

**Math and logic.**
A real tokenizer and recursive-descent parser (no `eval`), a symbolic linear solver over
`(a, b)` pairs so `3(x - 2) = 9`, `4x/3 = 8` and `2x + 5 = 17` work, implicit multiplication,
multi-step variable tracking (`a = 3, b = 4, compute sqrt(a^2 + b^2)`), percentages, percent
change, unit conversion and temperature. Every answer ships with its worked steps, and
`x^2 = 9` is reported as nonlinear rather than mis-answered.

### 3. Write and communicate

Genre-structured drafting (email, memo, proposal, essay, poem) that encodes *argument*
structure — steelman, concession, falsifiable recommendation, out-of-scope list — with bracketed
placeholders for the facts Forge cannot know. Translation covers 8 languages through a
**reviewable phrasebook** with per-row confidence, and says plainly that phrase-level equivalence
is not sentence-level grammar; connect a provider for free text.

### 4. Automate and operate

**Skills — `Skills` tab.** Reusable markdown workflows, versioned on disk. The runner parses the
numbered step list and executes it **in order**, routing each step to the same engine chat uses,
so a review comment on step 3 applies to every future run. Four starters ship (UI audit,
multi-session lesson plan, post-incident review, document diligence).

**Computer-use-style workflows.** Real filesystem reads inside declared workspaces, real
subprocess execution, unified-diff previews before writing, an append-only audit log, and a
"locate code" retrieval pass over the whole tree.

**App connections — `Extensions` tab.** Five connectors with scope lists and risk tiers.
Nothing is connected by default; irreversible actions require a **named human approver**; every
invocation — including blocked ones — is an audit row. Every grant in this build is
**simulated**: the call is validated, policy-checked and logged, and no network request is made.
That is stated in the UI, because the alternative (an agent holding your payment credentials
silently) is the thing the brief's limitation list is actually warning about.

---

## Governance: the manifest is part of the API

`GET /api/system/capabilities` returns 11 capabilities **and 17 documented limitations**, each
with how it is delivered, how to verify it, and what it cannot do. The `Manifest` tab renders
that live, so the UI cannot overclaim relative to the backend. Also there:

- **Audit log** — every mutating request, edit, execution, generation and simulated outward action.
- **Design decisions** the build can be held to (deterministic where checkable, nothing claimed
  that was not executed, failures surfaced rather than smoothed, capability requires custody).

High-stakes prompts (medical, legal, financial, safety) append a review banner; questions about
consciousness, real-world agency, professional advice or memory get direct answers about what
the system is and is not, rather than a deflection.

---

## npm scripts

| Command | What it does |
| --- | --- |
| `npm start` | Builds the UI if needed, then serves API + UI on `:3001` |
| `npm run dev` | Vite with HMR on `:5173` + API with `--watch` on `:3001` |
| `npm run build` | Typecheck and build the React UI into `web/dist` |
| `npm run typecheck` | `tsc --noEmit` over the frontend |
| `npm run smoke` | 37 live end-to-end checks (needs the server running) |
| `npm run agent:demo` | Terminal view of the agentic repair loop |

## Architecture

```
.
├── server/                      Node 20+, ESM, Express — no other runtime dependencies
│   ├── src/index.js             app entry: routes, /generated/:slug reverse proxy, static UI
│   ├── src/store.js             single-file JSON persistence (conversations, documents, projects, skills, audit)
│   ├── src/lib/
│   │   ├── classify.js          deterministic prompt routing (build/code/math/write/translate/summarise/analyze/chat)
│   │   ├── localEngine.js       the deterministic "brain": every branch is a solver, a retriever or a template
│   │   ├── mathEngine.js        tokenizer + recursive-descent parser + symbolic linear solver
│   │   ├── text.js              chunking, BM25 retrieval, extractive summarisation, cross-referencing
│   │   ├── codeTemplates.js     algorithm library + baseline scaffolds across 8 languages
│   │   ├── appGenerator.js      curated entity models → full-stack project
│   │   ├── agent.js             repair rules (auto vs advisory) + apply/verify/revert loop
│   │   ├── sandbox.js           subprocess execution with timeout, caps and trace
│   │   ├── patch.js             LCS unified diffs
│   │   ├── languages.js         translation phrasebook
│   │   └── providers.js         optional Anthropic/OpenAI passthrough
│   ├── src/routes/              chat · documents · projects · agent · sandbox · skills · connections · system
│   └── src/templates/           generated-app templates + the seeded buggy demo repo
├── web/                         React 18 + Vite 6 + Tailwind 4 (typed, no UI framework)
│   ├── src/App.tsx              shell + navigation
│   ├── src/views/               Chat · Build · Agent · Sandbox · Documents · Skills · Connections · Capabilities
│   └── src/lib/api.ts           typed API client + SSE readers
└── scripts/
    ├── smoke.js                 37 end-to-end checks against a running server
    └── agent-test.mjs           watch the agent repair a repository from the terminal
```

Runtime state lives in `server/.forge/` (gitignored): `db.json`, `projects/<slug>/`,
`workspaces/ledger-api/`, `sandbox/`.

---

## What Forge deliberately does not do

Straight from the manifest, and enforced in code:

- **No fabricated citations or statistics.** Retrieval answers are extractive with citations;
  reasoning surfaces state the evidence gap instead of filling it.
- **No real-world agency.** Nothing is purchased, booked, sent or switched unless an explicit
  grant exists — and in this build all grants are simulated with zero network egress.
- **No professional advice.** Legal/medical/financial questions get concepts, a question list for
  a qualified professional, and a review banner.
- **No claims of consciousness.** Empathy is computed from patterns, and the UI says so.
- **No silent writes.** Agent edits are diffs that must survive the test suite; the host
  repository is read-only.
- **No overselling the sandbox.** Process isolation is documented as *not* a security boundary.

## Testing what you have built

```bash
npm run build            # typecheck the frontend + build it
npm start &              # serve (auto-builds the UI if it is missing)
node scripts/smoke.js    # 37 checks: routing, retrieval, execution, generation, agent, skills, extensions
npm run agent:demo       # watch the repo agent repair a repository, step by step
npm run typecheck        # tsc --noEmit
```

The generated apps and the demo repository carry their own suites (`npm test` inside each),
and those are the suites Forge itself runs before claiming success.
