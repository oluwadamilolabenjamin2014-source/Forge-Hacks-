import React from 'react';
import { renderMarkdown } from '../lib/markdown';

export function Panel({ children, className = '', as: Tag = 'section' }: { children: React.ReactNode; className?: string; as?: any }) {
  return <Tag className={`panel ${className}`}>{children}</Tag>;
}

export function SectionTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
      <div>
        <h2 className="text-sm font-semibold tracking-wide text-chalk">{title}</h2>
        {subtitle && <p className="mt-0.5 max-w-3xl text-xs leading-relaxed text-mist">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function Chip({ children, tone = 'default', title }: { children: React.ReactNode; tone?: 'default' | 'ok' | 'warn' | 'bad' | 'info' | 'accent'; title?: string }) {
  const tones: Record<string, string> = {
    default: 'border-line text-mist',
    ok: 'border-mint/40 text-mint bg-mint/5',
    warn: 'border-forge/40 text-forge-soft bg-forge/5',
    bad: 'border-rose/40 text-rose bg-rose/5',
    info: 'border-sky/40 text-sky bg-sky/5',
    accent: 'border-violet/40 text-violet bg-violet/5',
  };
  return (
    <span className={`chip ${tones[tone]}`} title={title}>
      {children}
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-mist">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-mist/30 border-t-forge" />
      {label}
    </span>
  );
}

export function Empty({ title, body, action }: { title: string; body?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="text-sm font-semibold text-chalk">{title}</p>
      {body && <div className="max-w-xl text-xs leading-relaxed text-mist">{body}</div>}
      {action}
    </div>
  );
}

export function Markdown({ text, className = '' }: { text: string; className?: string }) {
  const html = React.useMemo(() => renderMarkdown(text), [text]);
  return <div className={`prose-forge ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function CodeBlock({ code, language = '', maxHeight = '22rem' }: { code: string; language?: string; maxHeight?: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-ink-950/90">
      <div className="flex items-center justify-between border-b border-line/70 px-3 py-1.5">
        <span className="font-mono text-[11px] text-mist">{language || 'plain'}</span>
        <button
          type="button"
          className="text-[11px] text-mist transition hover:text-chalk"
          onClick={() => {
            navigator.clipboard?.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          }}
        >
          {copied ? 'copied ✓' : 'copy'}
        </button>
      </div>
      <pre className="overflow-auto p-3.5 text-[12.5px] leading-relaxed" style={{ maxHeight }}>
        <code className="font-mono text-chalk/90">{code}</code>
      </pre>
    </div>
  );
}

export function DiffView({ diff, maxHeight = '20rem' }: { diff: string; maxHeight?: string }) {
  const lines = String(diff || '').split('\n');
  return (
    <div className="overflow-auto rounded-xl border border-line bg-ink-950/90 font-mono text-[12px]" style={{ maxHeight }}>
      {lines.map((line, i) => {
        const tone = line.startsWith('+++') || line.startsWith('---')
          ? 'text-mist'
          : line.startsWith('@@')
            ? 'text-violet'
            : line.startsWith('+')
              ? 'bg-mint/10 text-mint'
              : line.startsWith('-')
                ? 'bg-rose/10 text-rose'
                : 'text-chalk/75';
        return (
          <div key={i} className={`whitespace-pre px-3 py-[1px] ${tone}`}>
            {line || ' '}
          </div>
        );
      })}
    </div>
  );
}

export function Meter({ used, total, label }: { used: number; total: number; label?: string }) {
  const pct = Math.min(100, (used / Math.max(1, total)) * 100);
  return (
    <div className="min-w-[180px]">
      <div className="mb-1 flex items-center justify-between text-[11px] text-mist">
        <span>{label || 'context'}</span>
        <span className="font-mono">
          {used.toLocaleString()} / {total.toLocaleString()}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-700">
        <div className="h-full rounded-full bg-gradient-to-r from-forge to-sky transition-all" style={{ width: `${Math.max(pct, 1.5)}%` }} />
      </div>
    </div>
  );
}

export function Stat({ label, value, hint, tone = 'default' }: { label: string; value: React.ReactNode; hint?: string; tone?: string }) {
  return (
    <div className="panel-tight px-3.5 py-3">
      <p className="label">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${tone === 'ok' ? 'text-mint' : tone === 'bad' ? 'text-rose' : tone === 'accent' ? 'text-forge' : 'text-chalk'}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] leading-snug text-mist">{hint}</p>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`mt-0.5 h-5 w-9 shrink-0 rounded-full border transition ${checked ? 'border-forge bg-forge/30' : 'border-line bg-ink-700'}`}
      >
        <span className={`block h-3.5 w-3.5 rounded-full bg-chalk transition ${checked ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
      </button>
      <span>
        <span className="block text-xs font-medium text-chalk">{label}</span>
        {hint && <span className="block text-[11px] leading-snug text-mist">{hint}</span>}
      </span>
    </label>
  );
}

export function WarningBanner({ items }: { items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="rounded-xl border border-forge/40 bg-forge/5 px-3.5 py-2.5">
      {items.map((w, i) => (
        <p key={i} className="text-[12.5px] leading-relaxed text-forge-soft">
          ⚠ {w}
        </p>
      ))}
    </div>
  );
}

export function TraceList({ trace, title = 'How this answer was produced' }: { trace?: string[]; title?: string }) {
  const [open, setOpen] = React.useState(false);
  if (!trace?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-ink-850/60">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-3 py-2 text-left">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-mist">{title}</span>
        <span className="text-[11px] text-mist">{open ? 'hide' : `${trace.length} step${trace.length === 1 ? '' : 's'}`}</span>
      </button>
      {open && (
        <ol className="space-y-1 border-t border-line px-3 py-2">
          {trace.map((t, i) => (
            <li key={i} className="font-mono text-[11.5px] leading-relaxed text-mist">
              <span className="text-forge">{String(i + 1).padStart(2, '0')}</span> · {t}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
