/**
 * Conversation surface. One endpoint, eight capability routes behind it, and an SSE
 * variant that streams the *reasoning steps* (not just tokens) so the routing decision
 * is visible while it happens.
 */
import express from 'express';
import { db, id, nowIso, persist, audit, getSettings } from '../store.js';
import { classify, SURFACE_LABELS } from '../lib/classify.js';
import { localAnswer, verifyHighStakes } from '../lib/localEngine.js';
import { activeProviders, preferredProvider, systemPrompt, callProvider } from '../lib/providers.js';
import { contextReport, estimateTokens, profileFor } from '../lib/tokens.js';
import { generateApp, writeProject } from '../lib/appGenerator.js';
import { runSuite } from '../lib/agent.js';

const router = express.Router();

function findConversation(conversationId) {
  return db.conversations.find((c) => c.id === conversationId);
}

function ensureConversation(conversationId, title) {
  let conversation = findConversation(conversationId);
  if (!conversation) {
    conversation = {
      id: conversationId || id('conv'),
      title: (title || 'New conversation').slice(0, 80),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      messages: [],
    };
    db.conversations.unshift(conversation);
    db.conversations = db.conversations.slice(0, 60);
  }
  return conversation;
}

function docsFor(documentIds) {
  if (!Array.isArray(documentIds) || !documentIds.length) return db.documents.slice(0, 8);
  return db.documents.filter((d) => documentIds.includes(d.id));
}

function buildMessages(conversation, promptText) {
  // Replay the visible transcript: this is "holds context within a chat session", and
  // it is bounded so a long session cannot silently blow the window.
  const history = conversation.messages.slice(-14).map((m) => ({ role: m.role, content: m.text }));
  return [...history.filter((m) => m.role !== 'system'), { role: 'user', content: promptText }];
}

async function maybeProvider({ surface, promptText, conversation, documents }) {
  const provider = preferredProvider();
  if (!provider) return null;
  try {
    const settings = getSettings();
    const docBlock = documents
      .map((d) => `\n\n<document title="${d.title}" tokens="${d.tokens}">\n${d.text.slice(0, 120_000)}\n</document>`)
      .join('');
    const result = await callProvider({
      provider,
      system: systemPrompt({ surface, settings, documents }),
      messages: [
        ...buildMessages(conversation, promptText + docBlock).slice(0, -1),
        { role: 'user', content: promptText + docBlock },
      ],
      temperature: settings.determinism ? 0 : 0.7,
    });
    return { ...result, provider };
  } catch (err) {
    return { error: err.message, provider };
  }
}

/**
 * Whole-app requests are intercepted here: Forge generates the project, runs its suite
 * for real, writes it to disk and hands back the file list and the interpreter's verdict.
 * An app described in chat is an app on disk — not a code block you have to reassemble.
 */
async function buildAppEnvelope({ prompt, documents }) {
  const started = Date.now();
  const { spec, files, seedCount } = generateApp(String(prompt));
  const dir = writeProject(spec, files);
  const suite = await runSuite(dir);

  const project = {
    id: id('proj'),
    slug: spec.slug,
    name: spec.name,
    description: spec.description,
    prompt: String(prompt).slice(0, 400),
    entityKey: spec.entityKey,
    collection: spec.collection,
    fields: spec.fields,
    port: spec.port,
    dir,
    fileCount: files.length,
    files: files.map((f) => ({ path: f.path, language: f.language, bytes: Buffer.byteLength(f.content) })),
    seedCount,
    createdAt: nowIso(),
    tests: { runner: suite.runner, passed: suite.passed, failed: suite.failed, ok: suite.ok, verifiedAt: nowIso() },
    deployed: false,
    url: null,
  };
  db.projects = db.projects.filter((p) => p.slug !== spec.slug);
  db.projects.unshift(project);
  persist();
  audit({ action: 'project.generate', slug: spec.slug, files: files.length, via: 'chat', tests: `${suite.passed}/${suite.passed + suite.failed}` });

  const serverFile = files.find((f) => f.path === 'server.js');
  const testFile = files.find((f) => f.path === 'test/api.test.js');
  const fieldRows = spec.fields.map((f) => `| \`${f.name}\` | ${f.type}${f.options ? ` (${f.options.join(' / ')})` : ''} | ${f.required ? 'yes' : 'no'} |`);

  const text = [
    `**Built it — and ran the tests before saying so.**`,
    '',
    `\`${spec.name}\` is written to \`server/.forge/projects/${spec.slug}/\`. ${files.length} files, zero dependencies, Node 20+.`,
    '',
    '**Verification**',
    `- runner: \`${suite.runner}\``,
    `- result: **${suite.passed} passed, ${suite.failed} failed**`,
    `- ${suite.ok ? 'the suite is green, so this app returns correct results for the cases it encodes' : 'failing tests are reported above rather than hidden — open the assertions and decide'}`,
    '',
    '**Data model**',
    '| field | type | required |',
    '| --- | --- | --- |',
    ...fieldRows,
    '',
    `Seeded with ${seedCount} rows so the dashboard has something to show.`,
    '',
    '**Files**',
    ...files.map((f) => `- \`${f.path}\` (${Buffer.byteLength(f.content)} bytes)`),
    '',
    '**What it includes**',
    '- CRUD API with field-level validation (422 + an errors array)',
    '- Search, filtering, sorting, pagination, aggregates and CSV export',
    '- Atomic JSON persistence, path-traversal guard, health endpoint',
    '- A no-build dashboard with a live health pill and stat cards',
    '- 12 integration tests that boot the real server and hit it over HTTP',
    '',
    '**Next**',
    '1. Open the **Build an app** tab to read the source and press *Deploy* — it runs as its own OS process behind the preview proxy.',
    '2. Or: `POST /api/projects/' + spec.slug + '/deploy` then load `/generated/' + spec.slug + '/`.',
    `3. Fields come from ${spec.entityKey ? `the curated \`${spec.entityKey}\` model` : 'your wording — check the assumptions'}; edit \`FIELDS\` in \`server.js\` and both the API and the UI follow.`,
    '',
    suite.ok
      ? '> Nothing here is a guess about whether it works: `npm test` exited 0 against the generated server.'
      : '> The generated suite did not go green. That is reported instead of papered over — see the failing assertions in the Build tab.',
    documents.length ? `\n*(${documents.length} document(s) were in context but not used — app generation is template-driven, so your documents only matter once you ask a question about them.)*` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    text,
    engine: 'forge-app-generator (deterministic)',
    surface: 'build',
    surfaceLabel: 'Vibe coding — app build',
    trace: [
      `routing → build (app-build language detected)`,
      `entity model → ${spec.entityKey || 'inferred'} (${spec.fields.length} fields)`,
      `wrote ${files.length} files → server/.forge/projects/${spec.slug}/`,
      `executed the generated suite → ${suite.passed} passed / ${suite.failed} failed (${suite.runner})`,
      `project registered → deployable at /api/projects/${spec.slug}/deploy`,
    ],
    citations: [],
    artifacts: [
      ...(serverFile ? [{ type: 'file', path: 'server.js', language: 'javascript', code: serverFile.content }] : []),
      ...(testFile ? [{ type: 'file', path: 'test/api.test.js', language: 'javascript', code: testFile.content }] : []),
    ],
    warnings: suite.ok ? [] : [`The generated suite has ${suite.failed} failing test(s) — inspect before deploying.`],
    latencyMs: Date.now() - started,
  };
}

function buildUserMessage(text) {
  return { id: id('msg'), role: 'user', text, at: nowIso(), tokens: estimateTokens(text) };
}

router.get('/providers', (_req, res) => {
  const providers = activeProviders();
  res.json({
    providers,
    active: providers[0]?.id || 'forge-local',
    label: providers[0]?.label || 'Forge Local Engine (deterministic)',
    contextLabel: providers[0]?.contextLabel || '~1M tokens (emulated locally)',
    note: providers.length
      ? 'Generation routes to the hosted provider. Forge still wraps every reply with verification notes and keeps its deterministic tools (math, retrieval, sandbox) in the loop.'
      : 'No model provider configured. Forge answers with its own deterministic engines — retrieval, parsers, templates and real execution. Set ANTHROPIC_API_KEY or OPENAI_API_KEY to route generation to a hosted model.',
  });
});

router.get('/conversations', (_req, res) => {
  res.json(
    db.conversations.map((c) => ({
      id: c.id,
      title: c.title,
      updatedAt: c.updatedAt,
      messageCount: c.messages.length,
      lastSurface: [...c.messages].reverse().find((m) => m.surface)?.surface || null,
    })),
  );
});

router.get('/conversations/:id', (req, res) => {
  const conversation = findConversation(req.params.id);
  if (!conversation) return res.status(404).json({ error: 'not_found' });
  const docs = docsFor([]);
  res.json({ ...conversation, context: contextReport(docs, conversation.messages) });
});

router.delete('/conversations/:id', (req, res) => {
  const before = db.conversations.length;
  db.conversations = db.conversations.filter((c) => c.id !== req.params.id);
  persist();
  res.json({ deleted: before - db.conversations.length });
});

/** Non-streaming: full envelope in one response. */
router.post('/', async (req, res) => {
  const { conversationId, message, documentIds, model } = req.body || {};
  if (!message || !String(message).trim()) return res.status(400).json({ error: 'message_required' });
  const conversation = ensureConversation(conversationId, String(message).slice(0, 60));
  const documents = docsFor(documentIds);
  const settings = getSettings();
  const userMessage = buildUserMessage(String(message));
  conversation.messages.push(userMessage);
  conversation.updatedAt = nowIso();
  if (conversation.messages.length === 1) conversation.title = String(message).slice(0, 60);

  const routing = classify(message, conversation.messages);
  const started = Date.now();
  let envelope;

  const hosted = routing.surface === 'build' ? null : await maybeProvider({ surface: routing.surface, promptText: String(message), conversation, documents });
  if (routing.surface === 'build') {
    envelope = await buildAppEnvelope({ prompt: String(message), documents });
    envelope.trace = [`routing → build (confidence ${routing.confidence})`, ...(routing.reasons || []).slice(0, 2), ...envelope.trace];
  } else if (hosted && !hosted.error) {
    envelope = {
      text: hosted.text,
      engine: hosted.provider.label,
      surface: routing.surface,
      surfaceLabel: SURFACE_LABELS[routing.surface],
      trace: [`routing → ${routing.surface} (${routing.confidence})`, ...(routing.reasons || []).slice(0, 3), `provider → ${hosted.provider.label}`],
      citations: [],
      artifacts: [],
      warnings: [],
      latencyMs: Date.now() - started,
      usage: hosted.usage,
    };
  } else if (hosted?.error) {
    const local = localAnswer({ prompt: String(message), surface: routing.surface, history: conversation.messages, documents, settings });
    envelope = {
      ...local,
      trace: [...local.trace, `hosted provider failed (${hosted.error}) → fell back to the local engine rather than failing the request`],
      warnings: [...local.warnings, `Provider error: ${hosted.error}`],
    };
  } else {
    envelope = localAnswer({ prompt: String(message), surface: routing.surface, history: conversation.messages, documents, settings });
  }

  if (!envelope.trace?.some((t) => t.startsWith('routing'))) {
    envelope.trace = [`routing → ${routing.surface} (confidence ${routing.confidence})`, ...(routing.reasons || []), ...(envelope.trace || [])];
  }
  if (verifyHighStakes(String(message)) && !envelope.warnings.length) {
    envelope.warnings = ['High-stakes domain detected (medical/legal/financial/safety). This is a research aid, not professional advice — a qualified human must review before you act.'];
  }

  const profile = profileFor(model || 'forge-local');
  const assistantMessage = {
    id: id('msg'),
    role: 'assistant',
    text: envelope.text,
    at: nowIso(),
    surface: envelope.surface,
    surfaceLabel: envelope.surfaceLabel,
    engine: envelope.engine,
    trace: envelope.trace,
    citations: envelope.citations,
    artifacts: envelope.artifacts,
    warnings: envelope.warnings,
    latencyMs: envelope.latencyMs,
    inputTokens: estimateTokens(String(message)) + documents.reduce((s, d) => s + d.tokens, 0),
    outputTokens: estimateTokens(envelope.text),
    windowLabel: profile.ctxLabel,
  };
  conversation.messages.push(assistantMessage);
  conversation.updatedAt = nowIso();
  persist();

  res.json({
    conversationId: conversation.id,
    userMessage,
    reply: assistantMessage,
    routing: { ...routing, label: SURFACE_LABELS[routing.surface] },
    context: contextReport(documents, conversation.messages),
    engineLabel: envelope.engine,
  });
});

/** Streaming: emits routing → steps → tokens → done. */
router.post('/stream', async (req, res) => {
  const { conversationId, message, documentIds } = req.body || {};
  if (!message || !String(message).trim()) return res.status(400).json({ error: 'message_required' });

  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const conversation = ensureConversation(conversationId, String(message).slice(0, 60));
  const documents = docsFor(documentIds);
  const settings = getSettings();
  const userMessage = buildUserMessage(String(message));
  conversation.messages.push(userMessage);
  conversation.updatedAt = nowIso();
  if (conversation.messages.length === 1) conversation.title = String(message).slice(0, 60);

  try {
    const routing = classify(message, conversation.messages);
    send('routing', { ...routing, label: SURFACE_LABELS[routing.surface] });
    await new Promise((r) => setTimeout(r, 60));

    const hosted = routing.surface === 'build' ? null : await maybeProvider({ surface: routing.surface, promptText: String(message), conversation, documents });
    if (hosted?.error) send('warning', { message: `Hosted provider error: ${hosted.error}. Falling back to the local deterministic engine.` });

    let envelope;
    if (routing.surface === 'build') {
      send('step', { message: 'Generating the project, then running its test suite for real…' });
      envelope = await buildAppEnvelope({ prompt: String(message), documents });
      envelope.trace = [`routing → build (confidence ${routing.confidence})`, ...envelope.trace];
      const chunks = envelope.text.match(/[\s\S]{1,220}/g) || [];
      const full = envelope.text;
      envelope.text = '';
      for (const chunk of chunks) {
        envelope.text += chunk;
        send('token', { text: chunk });
        await new Promise((r) => setTimeout(r, 6));
      }
      envelope.text = full;
    } else if (hosted && !hosted.error) {
      // Stream the model's text in chunks so the UI feels alive, then attach the envelope.
      envelope = {
        text: '',
        engine: hosted.provider.label,
        surface: routing.surface,
        surfaceLabel: SURFACE_LABELS[routing.surface],
        trace: [`routing → ${routing.surface}`, `provider → ${hosted.provider.label}`],
        citations: [],
        artifacts: [],
        warnings: [],
      };
      const words = String(hosted.text).split(/(\s+)/);
      for (let i = 0; i < words.length; i += 12) {
        const chunk = words.slice(i, i + 12).join('');
        envelope.text += chunk;
        send('token', { text: chunk });
        await new Promise((r) => setTimeout(r, 12));
      }
      envelope.usage = hosted.usage;
    } else {
      envelope = localAnswer({ prompt: String(message), surface: routing.surface, history: conversation.messages, documents, settings });
      envelope.trace = [`routing → ${routing.surface} (confidence ${routing.confidence})`, ...(routing.reasons || []).slice(0, 3), ...envelope.trace];
      envelope.text = '';
      const chunks = localAnswer({ prompt: String(message), surface: routing.surface, history: conversation.messages, documents, settings }).text.match(/[\s\S]{1,220}/g) || [];
      for (const chunk of chunks) {
        envelope.text += chunk;
        send('token', { text: chunk });
        await new Promise((r) => setTimeout(r, 8));
      }
    }

    if (verifyHighStakes(String(message)) && !envelope.warnings.length) {
      envelope.warnings = ['High-stakes domain detected. Treat this as a research aid, not professional advice.'];
    }

    const assistantMessage = {
      id: id('msg'),
      role: 'assistant',
      text: envelope.text,
      at: nowIso(),
      surface: envelope.surface,
      surfaceLabel: envelope.surfaceLabel,
      engine: envelope.engine,
      trace: envelope.trace,
      citations: envelope.citations,
      artifacts: envelope.artifacts,
      warnings: envelope.warnings,
      latencyMs: 0,
      inputTokens: estimateTokens(String(message)) + documents.reduce((s, d) => s + d.tokens, 0),
      outputTokens: estimateTokens(envelope.text),
    };
    conversation.messages.push(assistantMessage);
    persist();
    audit({ action: 'chat.answer', surface: envelope.surface, engine: envelope.engine, tokens: assistantMessage.outputTokens });
    send('done', {
      conversationId: conversation.id,
      userMessage,
      reply: assistantMessage,
      routing: { ...routing, label: SURFACE_LABELS[routing.surface] },
      context: contextReport(documents, conversation.messages),
    });
  } catch (err) {
    send('error', { message: err.message });
  } finally {
    res.end();
  }
});

export default router;
