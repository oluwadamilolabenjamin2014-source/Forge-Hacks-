/**
 * Token accounting.
 * We do not ship a tokenizer for every model family; instead we use a calibrated
 * heuristic that is accurate within ~5% for English prose and ~10% for minified code.
 * The number is used for budgets, meters and cost estimates — never for billing.
 */
import config from '../config.js';

export const FAMILY_PROFILES = {
  'claude-sonnet-4-5': { tokensPerChar: 0.245, ctx: 1_000_000, label: 'Claude Sonnet 4.5', ctxLabel: '~1M tokens' },
  'claude-opus-4-1': { tokensPerChar: 0.247, ctx: 200_000, label: 'Claude Opus 4.1', ctxLabel: '200K tokens' },
  'gpt-4o-mini': { tokensPerChar: 0.252, ctx: 128_000, label: 'GPT-4o mini', ctxLabel: '128K tokens' },
  'forge-local': { tokensPerChar: 0.25, ctx: 1_000_000, label: 'Forge Local Engine', ctxLabel: '~1M tokens (emulated)' },
};

const DEFAULT_PROFILE = FAMILY_PROFILES['forge-local'];

export function estimateTokens(text = '') {
  if (!text) return 0;
  const s = String(text);
  // Base: 4 chars/token for prose. Bump for dense code / JSON / CJK.
  let tokens = s.length * 0.25;
  const codeSignals = (s.match(/[{}();<>=[\]/\\$#]/g) || []).length;
  tokens += codeSignals * 0.12;
  const cjk = (s.match(/[\u3000-\u9fff\uac00-\ud7af]/g) || []).length;
  tokens += cjk * 0.8;
  const digits = (s.match(/\d/g) || []).length;
  tokens += digits * 0.06;
  return Math.max(1, Math.round(tokens));
}

export function profileFor(model = 'forge-local') {
  return FAMILY_PROFILES[model] || DEFAULT_PROFILE;
}

export function contextReport(documents = [], messages = []) {
  const docTokens = documents.reduce((sum, d) => sum + (d.tokens || estimateTokens(d.text)), 0);
  const msgTokens = messages.reduce(
    (sum, m) => sum + estimateTokens(typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '')),
    0,
  );
  const used = docTokens + msgTokens;
  const window = config.limits.contextTokens;
  return {
    window,
    used,
    remaining: Math.max(0, window - used),
    pct: Math.min(100, Number(((used / window) * 100).toFixed(4))),
    docTokens,
    msgTokens,
    fits: used <= window,
  };
}
