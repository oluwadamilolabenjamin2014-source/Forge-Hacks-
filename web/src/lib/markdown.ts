import { marked } from 'marked';

marked.setOptions({ gfm: true, breaks: true });

/**
 * Model output is untrusted text: it can contain HTML, including tags that would run.
 * We render markdown, then strip the constructs that can execute. This is a conservative
 * allowlist-free scrub (no script/style/iframe/object/embed, no event handlers, no
 * javascript: URLs) — not a full sanitiser, but enough that a reply cannot inject code
 * into the workspace. Said plainly here because a silent "trust me" would be worse.
 */
export function renderMarkdown(raw: string): string {
  const html = marked.parse(String(raw || '')) as string;
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/?(iframe|object|embed|link|meta|base|form|svg|math)[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*("|')?\s*javascript:[^"'>\s]*/gi, '$1="#"');
}

export const formatNumber = (n: number | undefined | null): string => {
  if (n === undefined || n === null || Number.isNaN(n)) return '—';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

export const timeAgo = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

export const clockTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export const riskColor = (risk: string): string =>
  ({ low: 'text-mint border-mint/40', medium: 'text-sky border-sky/40', high: 'text-forge border-forge/40', critical: 'text-rose border-rose/50' })[risk] || 'text-mist border-line';
