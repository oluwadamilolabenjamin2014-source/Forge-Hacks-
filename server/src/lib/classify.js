/**
 * Prompt routing.
 *
 * Rule-based, deterministic classification of an incoming prompt into one of the
 * capability surfaces. This is what lets Forge answer "which surface handles this?"
 * *before* any text is generated, so every response can declare its own provenance
 * (which engine produced it, whether it is model-backed or template-backed).
 */

export const SURFACES = {
  BUILD: 'build',
  CODE: 'code',
  REASON: 'reason',
  MATH: 'math',
  WRITE: 'write',
  TRANSLATE: 'translate',
  SUMMARIZE: 'summarize',
  ANALYZE_DOCS: 'analyze_docs',
  CHAT: 'chat',
};

const RULES = [
  {
    surface: SURFACES.TRANSLATE,
    weight: 3,
    test: (t) => /\btranslate\b/.test(t) || /\bin (spanish|french|german|swahili|portuguese|italian|dutch|arabic)\b/.test(t),
  },
  {
    surface: SURFACES.SUMMARIZE,
    weight: 2.6,
    test: (t) => /\b(summar(y|ise|ize)|tl;?dr|key points|condense|recap)\b/.test(t) && !/\bcode\b/.test(t),
  },
  {
    surface: SURFACES.ANALYZE_DOCS,
    weight: 2.4,
    test: (t) =>
      /\b(across|compare|reconcile|cross[- ]reference|which document|cite|cite sources|audit the|contract|10-?k|financial statement|due diligence|clause)\b/.test(t) ||
      /\b(analy[sz]e|review|read)\b.*\b(documents?|files?|pdfs?|contract|policy|paper|book|report)\b/.test(t),
  },
  {
    // Whole-app requests come before single-file code requests: "build an app that
    // tracks X" should produce a running project, not one function in a chat bubble.
    surface: SURFACES.BUILD,
    weight: 3.4,
    test: (t) =>
      /\b(build|create|make|generate|spin up|ship)\s+(?:me\s+)?(?:an?\s+|the\s+)?(?:app|application|dashboard|tracker|tool|website|site|service|crud|portal|planner|manager)\b/.test(
        t,
      ) ||
      /\b(app|application)\s+that\s+(?:tracks?|manages?|organis|organiz|logs?|records?|stores?|handles?)\b/.test(t),
  },
  {
    surface: SURFACES.CODE,
    weight: 2.5,
    test: (t) =>
      /\b(code|function|script|class|module|refactor|debug|stack ?trace|regex|unit test|api|endpoint|sql query|dockerfile|write a .*\.(py|js|ts|sql)|deploy|repository|repo|git)\b/.test(t),
  },
  {
    surface: SURFACES.MATH,
    weight: 3.2,
    test: (t) =>
      // bare arithmetic, e.g. "12 * (3 + 4)"
      /^[\s\d+\-*/^%().,=]+$/.test(t) ||
      // percentages and conversions are expressed with symbols far more often than words
      /\d(?:\.\d+)?\s*(?:%|(?:percent|percentile)\b)/.test(t) ||
      /\b\d+(?:\.\d+)?\s*(?:km|kilometers?|miles?|kg|kilograms?|pounds?|lbs?|°|degrees?|celsius|fahrenheit|c|f)\b/.test(t) ||
      /\b(sqrt|log|ln|sin|cos|tan|gcd|lcm|factorial)\s*\(/.test(t) ||
      /\b(calculate|compute|solve|what is \d|percent|percentage|compound interest|square root|derivative|integral|how many|how much is|convert \d|equation|\d+\s*[+\-*/^]\s*\d+)\b/.test(t),
  },
  {
    surface: SURFACES.REASON,
    weight: 2.2,
    test: (t) =>
      /\b(why|prove|derive|reason|hypothes|experiment|theor|physics|chemistr|biolog|mechanism|trade-?off|root cause|first principles|scientific|clinical|statistic)\b/.test(t),
  },
  {
    surface: SURFACES.WRITE,
    weight: 2.2,
    test: (t) =>
      /\b(write|draft|compose|essay|email|poem|poetry|blog|post|memo|letter|announcement|tweet|story|cover letter|proposal|resume|cv)\b/.test(t),
  },
];

const FOLLOWUPS = /\b(it|that|this|those|them|again|continue|more|shorter|longer|expand|rephrase|the (?:last|previous) one)\b/;

export function classify(prompt, history = []) {
  const raw = String(prompt || '').trim();
  const t = raw.toLowerCase();
  const scores = [];

  for (const rule of RULES) {
    if (rule.test(t)) scores.push({ surface: rule.surface, score: rule.weight, reason: `matched ${rule.surface} signals` });
  }

  // Short follow-ups inherit the previous surface — conversation context, not amnesia.
  if (raw.split(/\s+/).length <= 6 && FOLLOWUPS.test(t) && history.length) {
    const last = [...history].reverse().find((m) => m.role === 'assistant' && m.surface);
    if (last) scores.push({ surface: last.surface, score: 4, reason: `follow-up to the previous ${last.surface} answer` });
  }

  if (!scores.length) {
    const isDocish = raw.length > 700;
    return {
      surface: isDocish ? SURFACES.SUMMARIZE : SURFACES.CHAT,
      scores: [{ surface: isDocish ? SURFACES.SUMMARIZE : SURFACES.CHAT, score: 1, reason: isDocish ? 'long pasted payload' : 'open-ended conversation' }],
      confidence: isDocish ? 0.6 : 0.5,
    };
  }

  scores.sort((a, b) => b.score - a.score);
  const top = scores[0];
  const runnerUp = scores[1]?.score ?? 0;
  return {
    surface: top.surface,
    reasons: scores.map((s) => `${s.surface} (${s.score.toFixed(1)}) — ${s.reason}`),
    confidence: Number(Math.min(0.97, 0.45 + top.score / 6 + (top.score - runnerUp) / 8).toFixed(2)),
    margin: Number((top.score - runnerUp).toFixed(2)),
  };
}

export const SURFACE_LABELS = {
  [SURFACES.BUILD]: 'Vibe coding — app build',
  [SURFACES.CODE]: 'Code writing',
  [SURFACES.REASON]: 'Scientific reasoning',
  [SURFACES.MATH]: 'Math & logic',
  [SURFACES.WRITE]: 'Writing & communication',
  [SURFACES.TRANSLATE]: 'Translation',
  [SURFACES.SUMMARIZE]: 'Summarization',
  [SURFACES.ANALYZE_DOCS]: 'Long-context document analysis',
  [SURFACES.CHAT]: 'Conversation',
};
