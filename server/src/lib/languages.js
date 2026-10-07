/**
 * Translation surface.
 *
 * Honest design note (and a direct nod to the "no certified professional / verify
 * high-stakes claims" limitation): the built-in engine performs *phrase-level*
 * translation from a curated, reviewable phrasebook plus locale conventions. It is
 * deterministic and traceable — every phrase maps to a table row with a confidence
 * flag. Free-text translation requires a connected model provider; when one is
 * configured (ANTHROPIC_API_KEY / OPENAI_API_KEY) Forge routes there instead.
 */

export const LANGUAGES = [
  { code: 'es', name: 'Spanish', locale: 'es-ES' },
  { code: 'fr', name: 'French', locale: 'fr-FR' },
  { code: 'de', name: 'German', locale: 'de-DE' },
  { code: 'pt', name: 'Portuguese', locale: 'pt-BR' },
  { code: 'sw', name: 'Swahili', locale: 'sw-KE' },
  { code: 'it', name: 'Italian', locale: 'it-IT' },
  { code: 'nl', name: 'Dutch', locale: 'nl-NL' },
  { code: 'ar', name: 'Arabic', locale: 'ar' },
];

/** Curated phrasebook — intentionally small, intentionally reviewable. */
export const PHRASEBOOK = {
  'good morning': { es: 'Buenos días', fr: 'Bonjour', de: 'Guten Morgen', pt: 'Bom dia', sw: 'Habari ya asubuhi', it: 'Buongiorno', nl: 'Goedemorgen', ar: 'صباح الخير' },
  'good evening': { es: 'Buenas noches', fr: 'Bonsoir', de: 'Guten Abend', pt: 'Boa noite', sw: 'Habari ya jioni', it: 'Buonasera', nl: 'Goedenavond', ar: 'مساء الخير' },
  'thank you': { es: 'Gracias', fr: 'Merci', de: 'Danke', pt: 'Obrigado', sw: 'Asante', it: 'Grazie', nl: 'Dank je', ar: 'شكرًا' },
  please: { es: 'Por favor', fr: "S'il vous plaît", de: 'Bitte', pt: 'Por favor', sw: 'Tafadhali', it: 'Per favore', nl: 'Alstublieft', ar: 'من فضلك' },
  'how are you': { es: '¿Cómo estás?', fr: 'Comment allez-vous ?', de: 'Wie geht es Ihnen?', pt: 'Como você está?', sw: 'Habari yako?', it: 'Come stai?', nl: 'Hoe gaat het?', ar: 'كيف حالك؟' },
  'my name is': { es: 'Me llamo', fr: "Je m'appelle", de: 'Ich heiße', pt: 'Meu nome é', sw: 'Jina langu ni', it: 'Mi chiamo', nl: 'Ik heet', ar: 'اسمي' },
  'i need help': { es: 'Necesito ayuda', fr: "J'ai besoin d'aide", de: 'Ich brauche Hilfe', pt: 'Preciso de ajuda', sw: 'Nahitaji msaada', it: 'Ho bisogno di aiuto', nl: 'Ik heb hulp nodig', ar: 'أحتاج المساعدة' },
  'where is the bathroom': { es: '¿Dónde está el baño?', fr: 'Où sont les toilettes ?', de: 'Wo ist die Toilette?', pt: 'Onde fica o banheiro?', sw: 'Choo kiko wapi?', it: 'Dov’è il bagno?', nl: 'Waar is het toilet?', ar: 'أين الحمام؟' },
  'how much does this cost': { es: '¿Cuánto cuesta esto?', fr: 'Combien ça coûte ?', de: 'Wie viel kostet das?', pt: 'Quanto custa isso?', sw: 'Hii ni bei gani?', it: 'Quanto costa?', nl: 'Hoeveel kost dit?', ar: 'كم يكلف هذا؟' },
  'i do not understand': { es: 'No entiendo', fr: 'Je ne comprends pas', de: 'Ich verstehe nicht', pt: 'Não entendo', sw: 'Sielewi', it: 'Non capisco', nl: 'Ik begrijp het niet', ar: 'لا أفهم' },
  goodbye: { es: 'Adiós', fr: 'Au revoir', de: 'Auf Wiedersehen', pt: 'Adeus', sw: 'Kwaheri', it: 'Arrivederci', nl: 'Tot ziens', ar: 'مع السلامة' },
  yes: { es: 'Sí', fr: 'Oui', de: 'Ja', pt: 'Sim', sw: 'Ndiyo', it: 'Sì', nl: 'Ja', ar: 'نعم' },
  no: { es: 'No', fr: 'Non', de: 'Nein', pt: 'Não', sw: 'Hapana', it: 'No', nl: 'Nee', ar: 'لا' },
  'the meeting is at nine': { es: 'La reunión es a las nueve', fr: 'La réunion est à neuf heures', de: 'Das Treffen ist um neun', pt: 'A reunião é às nove', sw: 'Mkutano ni saa tatu', it: 'La riunione è alle nove', nl: 'De vergadering is om negen uur', ar: 'الاجتماع في الساعة التاسعة' },
  'i will send the report tomorrow': { es: 'Enviaré el informe mañana', fr: 'J’enverrai le rapport demain', de: 'Ich schicke den Bericht morgen', pt: 'Enviarei o relatório amanhã', sw: 'Nitatuma ripoti kesho', it: 'Invierò il rapporto domani', nl: 'Ik stuur het rapport morgen', ar: 'سأرسل التقرير غدًا' },
  'please review the attached document': { es: 'Por favor revise el documento adjunto', fr: 'Veuillez examiner le document ci-joint', de: 'Bitte prüfen Sie das beigefügte Dokument', pt: 'Por favor, revise o documento em anexo', sw: 'Tafadhali angalia hati iliyoambatishwa', it: 'Si prega di rivedere il documento allegato', nl: 'Controleer het bijgevoegde document', ar: 'يرجى مراجعة المستند المرفق' },
};

const ALIAS = {
  spanish: 'es', español: 'es', espanol: 'es', castellano: 'es',
  french: 'fr', français: 'fr', francais: 'fr',
  german: 'de', deutsch: 'de',
  portuguese: 'pt', português: 'pt', portugues: 'pt', 'brazilian portuguese': 'pt',
  swahili: 'sw', kiswahili: 'sw',
  italian: 'it', italiano: 'it',
  dutch: 'nl', nederlands: 'nl',
  arabic: 'ar', العربية: 'ar',
};

function normalize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[¿¡?!.,;:"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectTarget(text) {
  const t = String(text).toLowerCase();
  for (const [alias, code] of Object.entries(ALIAS)) {
    if (t.includes(alias)) return code;
  }
  const toMatch = t.match(/\b(?:to|into|in)\s+([a-zà-ÿ]+)\b/);
  if (toMatch) {
    const code = ALIAS[toMatch[1]] || (LANGUAGES.find((l) => l.code === toMatch[1])?.code ?? null);
    if (code) return code;
  }
  const codeMatch = t.match(/\b(?:to|into|in)\s+(es|fr|de|pt|sw|it|nl|ar)\b/);
  return codeMatch ? codeMatch[1] : null;
}

export function extractPayload(text) {
  let out = String(text)
    .replace(/^(?:please\s+)?(?:can you\s+)?(?:translate|say)\b\s*/i, '')
    .replace(/^(?:the\s+)?(?:phrase|sentence|text|word)\s+/i, '')
    .replace(/\b(?:in|into|to)\s+[a-zà-ÿ]+/gi, ' ')
    .replace(/["“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return out;
}

/** Phrase-level translation with per-phrase provenance. */
export function translatePhrase(text, targetCode) {
  const target = LANGUAGES.find((l) => l.code === targetCode);
  if (!target) return { ok: false, reason: 'unsupported-target' };
  const payload = extractPayload(text);
  const norm = normalize(payload);
  const rows = [];
  let covered = 0;
  const tokens = payload.split(/[,;.]|\band\b/).map((s) => normalize(s)).filter(Boolean);
  const candidates = [...new Set([norm, ...tokens])];
  for (const key of candidates) {
    if (PHRASEBOOK[key] && PHRASEBOOK[key][targetCode]) {
      rows.push({ source: key, target: PHRASEBOOK[key][targetCode], confidence: 0.97 });
      covered += key.length;
    }
  }
  const coverage = payload.length ? Math.min(1, covered / Math.max(1, norm.length)) : 0;
  return {
    ok: rows.length > 0,
    target,
    payload,
    rows,
    coverage: Number(coverage.toFixed(2)),
    reason: rows.length ? null : 'no-phrasebook-match',
  };
}

export function phrasebookFor(code) {
  return Object.entries(PHRASEBOOK).map(([source, map]) => ({ source, target: map[code] }));
}
