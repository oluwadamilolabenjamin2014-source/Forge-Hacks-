/**
 * Model provider routing.
 *
 * Forge ships a deterministic local engine, but the surfaces are provider-agnostic:
 * set ANTHROPIC_API_KEY or OPENAI_API_KEY and generation routes there, with the same
 * envelope (trace, citations, artifacts, warnings). The routing label on every reply
 * changes accordingly — you always know what answered you.
 */
import config from '../config.js';

export function activeProviders() {
  const list = [];
  if (config.anthropicKey) {
    list.push({ id: 'anthropic', model: config.anthropicModel, label: `Anthropic ${config.anthropicModel}`, contextLabel: '~1M tokens (Sonnet class)' });
  }
  if (config.openaiKey) {
    list.push({ id: 'openai', model: config.openaiModel, label: `OpenAI ${config.openaiModel}`, contextLabel: '128K tokens' });
  }
  return list;
}

export function preferredProvider() {
  const list = activeProviders();
  return list[0] || null;
}

/** Build the shared system prompt that keeps every provider honest. */
export function systemPrompt({ surface, settings = {}, documents = [] }) {
  const docList = documents.length
    ? `\n\nThe user attached ${documents.length} document(s): ${documents.map((d) => `"${d.title}"`).join(', ')}. Cite them as [DocRef §n] when you use them. If the documents do not contain the answer, say so plainly instead of answering from memory.`
    : '';
  return [
    'You are Forge, an agentic workspace assistant. You are precise, terse and honest about uncertainty.',
    `Active surface: ${surface}.`,
    'Rules you must follow:',
    '1. Never fabricate a citation, statistic, date or quotation. If you do not know, say "I do not know" and state what would settle it.',
    '2. Distinguish what you were given (retrieved/attached) from what you recall. Mark recalled facts as unverified.',
    '3. You have no real-world agency. You cannot purchase, book, send or control devices. Say so if asked.',
    '4. You have no consciousness or feelings; do not claim otherwise.',
    '5. You are not a licensed professional in any field. Explain concepts, then refer out for legal/medical/financial decisions.',
    '6. Prefer structure: state assumptions, then the answer, then how to verify it.',
    settings.determinism ? '7. Determinism requested: avoid unnecessary variation; the same prompt should yield substantially the same answer.' : '',
    docList,
  ]
    .filter(Boolean)
    .join('\n');
}

async function postJson(url, headers, body, timeoutMs = 120_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 400)}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

export async function callProvider({ provider, system, messages, maxTokens = 2048, temperature = 0 }) {
  if (provider.id === 'anthropic') {
    const data = await postJson(
      'https://api.anthropic.com/v1/messages',
      {
        'content-type': 'application/json',
        'x-api-key': config.anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      { model: provider.model, max_tokens: maxTokens, temperature, system, messages },
    );
    return {
      text: (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n'),
      usage: { input: data.usage?.input_tokens, output: data.usage?.output_tokens },
      raw: data,
    };
  }
  if (provider.id === 'openai') {
    const data = await postJson(
      'https://api.openai.com/v1/chat/completions',
      { 'content-type': 'application/json', authorization: `Bearer ${config.openaiKey}` },
      {
        model: provider.model,
        temperature,
        max_tokens: maxTokens,
        messages: [{ role: 'system', content: system }, ...messages],
      },
    );
    return {
      text: data.choices?.[0]?.message?.content || '',
      usage: { input: data.usage?.prompt_tokens, output: data.usage?.completion_tokens },
      raw: data,
    };
  }
  throw new Error(`Unknown provider: ${provider.id}`);
}
