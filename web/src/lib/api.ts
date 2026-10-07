/** Thin typed API client. Everything the UI knows about the backend lives here. */

export type Capability = {
  id: string;
  group: string;
  title: string;
  claim: string;
  delivery: string;
  verification: string;
  limitations: string[];
};

export type Limitation = { id: string; title: string; honest: string };

export type CapabilityManifest = {
  engine: string;
  engineNote: string;
  capabilities: Capability[];
  limitations: Limitation[];
  counts: { codeLanguages: number; translateLanguages: number; appModels: number; contextWindow: number };
};

export type Citation = { ref: string; citation: string; score: number };

export type Artifact = { type: string; path: string; language: string; code: string };

export type Message = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  at: string;
  surface?: string;
  surfaceLabel?: string;
  engine?: string;
  trace?: string[];
  citations?: Citation[];
  artifacts?: Artifact[];
  warnings?: string[];
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
};

export type ContextReport = {
  window: number;
  used: number;
  remaining: number;
  pct: number;
  docTokens: number;
  msgTokens: number;
  fits: boolean;
};

export type DocumentRecord = {
  id: string;
  title: string;
  kind: string;
  tokens: number;
  chunks: number;
  chars: number;
  words: number;
  addedAt: string;
  outline: { level: number; title: string }[];
  summary: string[];
};

export type Skill = {
  id: string;
  slug: string;
  name: string;
  description: string;
  revision: number;
  steps: number;
  updatedAt: string;
  runs: number;
};

export type SkillRun = {
  skill: { slug: string; name: string; revision: number };
  inputLength: number;
  durationMs: number;
  determinismNote: string;
  steps: { title: string; instruction: string; surface: string; surfaceLabel: string; confidence: number; output: string; trace: string[] }[];
};

export type Project = {
  id: string;
  slug: string;
  name: string;
  description: string;
  prompt: string;
  entityKey: string | null;
  collection: string;
  fields: { name: string; label: string; type: string; required?: boolean; options?: string[] }[];
  port: number;
  dir: string;
  fileCount: number;
  files: { path: string; language: string; bytes: number }[];
  seedCount: number;
  createdAt: string;
  tests: { runner: string; passed: number; failed: number; ok: boolean; verifiedAt: string };
  deployed: boolean;
  url: string | null;
  running?: boolean;
  logs?: string[];
  fileList?: string[];
};

export type AuditEntry = {
  id: string;
  at: string;
  actor: string;
  action: string;
  [key: string]: unknown;
};

export type Workspace = {
  id: string;
  name: string;
  root: string;
  writable: boolean;
  description: string;
  fileCount: number;
  git: { available: boolean; dirty?: { state: string; file: string }[]; log?: string[]; diffStat?: string; reason?: string };
};

/** `body` here is a plain object that we serialise, not a BodyInit — hence the Omit. */
type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown };

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, ...rest } = options;
  const res = await fetch(path, {
    headers: body ? { 'content-type': 'application/json' } : undefined,
    ...rest,
    body: typeof body === 'string' ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }
  if (!res.ok) {
    const detail = (payload as { detail?: string; error?: string })?.detail || (payload as { error?: string })?.error || `HTTP ${res.status}`;
    throw Object.assign(new Error(detail), { status: res.status, payload });
  }
  return payload as T;
}

export const api = {
  health: () => request<Record<string, unknown>>('/api/system/health'),
  capabilities: () => request<CapabilityManifest>('/api/system/capabilities'),
  audit: (limit = 80) => request<{ total: number; entries: AuditEntry[] }>(`/api/system/audit?limit=${limit}`),
  languages: () => request<Record<string, unknown>>('/api/system/languages'),
  providers: () => request<{ active: string; label: string; contextLabel: string; note: string; providers: unknown[] }>('/api/chat/providers'),

  conversations: () => request<{ id: string; title: string; updatedAt: string; messageCount: number; lastSurface: string | null }[]>('/api/chat/conversations'),
  conversation: (id: string) => request<{ id: string; title: string; messages: Message[]; context: ContextReport }>(`/api/chat/conversations/${id}`),
  deleteConversation: (id: string) => request<{ deleted: number }>(`/api/chat/conversations/${id}`, { method: 'DELETE' }),

  chat: (body: { conversationId?: string; message: string; documentIds?: string[] }) =>
    request<{ conversationId: string; userMessage: Message; reply: Message; context: ContextReport; engineLabel: string }>('/api/chat', {
      method: 'POST',
      body,
    }),

  documents: () => request<DocumentRecord[]>('/api/documents'),
  addDocument: (body: { title?: string; text?: string; base64?: string; filename?: string }) =>
    request<{ id: string; title: string; tokens: number; chunks: number; warnings: string[]; outline: { level: number; title: string }[]; summary: string[] }>('/api/documents', {
      method: 'POST',
      body,
    }),
  deleteDocument: (id: string) => request<{ deleted: number }>(`/api/documents/${id}`, { method: 'DELETE' }),
  documentDetail: (id: string) =>
    request<{ id: string; title: string; tokens: number; outline: { level: number; title: string }[]; summary: string[]; facts: { values: string[]; sentence: string }[]; preview: string; chunks: { index: number; tokens: number; preview: string }[] }>(
      `/api/documents/${id}`,
    ),
  searchDocuments: (query: string, k = 8) =>
    request<{ indexedChunks: number; documents: number; hits: { citation: string; ref: string; score: number; matched: string[]; text: string }[]; note: string }>(
      '/api/documents/search',
      { method: 'POST', body: { query, k } },
    ),
  crossReference: (query: string) =>
    request<{
      documents: { ref: string; score: number; hits: unknown[] }[];
      sharedThemes: { term: string; documents: string[] }[];
      disagreements: { topic: string; value: string; ref: string; note: string }[];
      coverage: number;
      answer: string;
      confidence: string;
    }>('/api/documents/cross-reference', { method: 'POST', body: { query } }),

  planProject: (prompt: string, name?: string) => request<{ spec: Project; matchedLibraryEntity: boolean; files: string[]; note: string }>('/api/projects/plan', { method: 'POST', body: { prompt, name } }),
  projects: () => request<Project[]>('/api/projects'),
  createProject: (prompt: string, name?: string) =>
    request<{ project: Project; testRun: { runner: string; passed: number; failed: number; ok: boolean; failing: { test: string; error: string }[]; output: string; verdict: string } }>(
      '/api/projects',
      { method: 'POST', body: { prompt, name } },
    ),
  project: (slug: string) => request<Project>(`/api/projects/${slug}`),
  projectFile: (slug: string, path: string) => request<{ path: string; content: string; lines: number }>(`/api/projects/${slug}/file?path=${encodeURIComponent(path)}`),
  projectTest: (slug: string) => request<{ runner: string; passed: number; failed: number; ok: boolean; failing: { test: string; error: string }[]; stdout: string; verdict: string }>(`/api/projects/${slug}/test`, { method: 'POST' }),
  deployProject: (slug: string) =>
    request<{ deployed: boolean; port: number; pid: number; url: string; health: Record<string, unknown> | null; logs: string[]; verdict: string }>(`/api/projects/${slug}/deploy`, { method: 'POST' }),
  stopProject: (slug: string) => request<{ stopped: boolean }>(`/api/projects/${slug}/stop`, { method: 'POST' }),
  deleteProject: (slug: string) => request<{ deleted: boolean }>(`/api/projects/${slug}`, { method: 'DELETE' }),

  workspaces: () => request<Workspace[]>('/api/agent/workspaces'),
  resetWorkspace: () => request<{ reset: boolean; suite: { passed: number; failed: number; runner: string } }>('/api/agent/workspaces/reset', { method: 'POST' }),
  repoFiles: (workspace: string) => request<{ workspace: string; root: string; writable: boolean; files: string[] }>(`/api/agent/files?workspace=${workspace}`),
  repoFile: (workspace: string, path: string) => request<{ path: string; content: string; lines: number; bytes: number }>(`/api/agent/file?workspace=${workspace}&path=${encodeURIComponent(path)}`),
  locate: (workspace: string, query: string) =>
    request<{ indexedFiles: number; hits: { file: string; citation: string; score: number; excerpt: string }[]; note: string }>('/api/agent/locate', { method: 'POST', body: { workspace, query } }),
  suite: (workspace: string) =>
    request<{ ok: boolean; runner: string; passed: number; failed: number; failing: { test: string; error: string; location: string }[]; stdout: string }>(`/api/agent/suite?workspace=${workspace}`),
  changes: (workspace: string) => request<{ available: boolean; dirty: { state: string; file: string }[]; log: string[]; diffStat: string; audit: AuditEntry[] }>(`/api/agent/changes?workspace=${workspace}`),
  commit: (workspace: string, message: string) => request<{ ok: boolean; output: string }>('/api/agent/commit', { method: 'POST', body: { workspace, message } }),
  scaffold: (workspace: string, kind: string, target?: string, apply = false) =>
    request<{ applied: boolean; plan?: { path: string; content: string; rationale: string; diff: string }[]; files?: string[]; suite?: { passed: number; failed: number }; note?: string }>(
      '/api/agent/scaffold',
      { method: 'POST', body: { workspace, kind, target, apply } },
    ),

  runtimes: () => request<{ runtimes: { id: string; label: string; executable: string; capabilities: string[] }[]; limits: Record<string, unknown> }>('/api/sandbox/runtimes'),
  runCode: (body: { language: string; code: string; stdin?: string; timeoutMs?: number }) =>
    request<{
      ok: boolean;
      language: string;
      runtime: string;
      exitCode: number;
      stdout: string;
      stderr: string;
      durationMs: number;
      timedOut: boolean;
      stepCount: number;
      steps: { line: number; locals: Record<string, string> }[];
      staticStatus?: string;
      staticError?: string;
      verdict: string;
    }>('/api/sandbox/run', { method: 'POST', body }),
  generateAndRun: (prompt: string, language?: string, execute = true) =>
    request<{
      language: string;
      intent: string;
      filename: string;
      code: string;
      assumptions: string[];
      notes: string[];
      runCommand: string;
      tests: string;
      execution: Record<string, unknown>;
    }>('/api/sandbox/generate-and-run', { method: 'POST', body: { prompt, language, execute } }),

  skills: () => request<{ skills: Skill[]; starters: { slug: string; name: string; description: string; stepsHint: number }[]; note: string }>('/api/skills'),
  skill: (slug: string) => request<Skill & { content: string; parsedSteps: { title: string; instruction: string }[] }>(`/api/skills/${slug}`),
  saveSkill: (body: { name: string; description?: string; content: string; slug?: string }) => request<Skill>('/api/skills', { method: 'POST', body }),
  starterSkill: (slug: string) => request<Skill>('/api/skills/from-starter', { method: 'POST', body: { slug } }),
  deleteSkill: (slug: string) => request<{ deleted: number }>(`/api/skills/${slug}`, { method: 'DELETE' }),
  runSkill: (slug: string, body: { input?: string; documentIds?: string[] }) => request<SkillRun>(`/api/skills/${slug}/run`, { method: 'POST', body }),

  connections: () =>
    request<{
      catalog: { id: string; name: string; category: string; blurb: string; scopes: { id: string; label: string; risk: string }[]; actions: string[]; sideEffects: string; requiresApproval?: boolean }[];
      connections: { id: string; catalogId: string; label: string; scopes: { id: string; label: string; risk: string }[]; maxRisk: string; mode: string; invocations: number }[];
      policy: Record<string, unknown>;
    }>('/api/connections'),
  connect: (catalogId: string, scopes: string[]) => request<{ connection: { id: string }; custodyNote: string }>('/api/connections', { method: 'POST', body: { catalogId, scopes } }),
  disconnect: (id: string) => request<{ revoked: number }>(`/api/connections/${id}`, { method: 'DELETE' }),
  invoke: (id: string, action: string, args: Record<string, unknown>, approvedBy?: string) =>
    request<{ outcome?: string; detail?: string; wouldCall?: string; verdict?: string; mode?: string }>(`/api/connections/${id}/invoke`, { method: 'POST', body: { action, args, approvedBy } }),
};

export function streamChat(
  body: { conversationId?: string; message: string; documentIds?: string[] },
  handlers: {
    onRouting?: (data: { surface: string; label: string; confidence: number; reasons?: string[] }) => void;
    onToken?: (text: string) => void;
    onWarning?: (message: string) => void;
    onDone?: (data: { conversationId: string; userMessage: Message; reply: Message; context: ContextReport }) => void;
    onError?: (message: string) => void;
  },
): () => void {
  const controller = new AbortController();
  (async () => {
    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.body) throw new Error('no response body');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() || '';
        for (const frame of frames) {
          const eventMatch = frame.match(/^event: (.+)$/m);
          const dataMatch = frame.match(/^data: ([\s\S]+)$/m);
          if (!eventMatch || !dataMatch) continue;
          const event = eventMatch[1].trim();
          let data: any;
          try {
            data = JSON.parse(dataMatch[1]);
          } catch {
            continue;
          }
          if (event === 'routing') handlers.onRouting?.(data);
          else if (event === 'token') handlers.onToken?.(data.text);
          else if (event === 'warning') handlers.onWarning?.(data.message);
          else if (event === 'done') handlers.onDone?.(data);
          else if (event === 'error') handlers.onError?.(data.message);
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') handlers.onError?.((err as Error).message);
    }
  })();
  return () => controller.abort();
}

/** SSE for the agent repair loop. */
export function streamAgent(
  body: { workspace: string; instruction: string; maxRounds?: number },
  handlers: Record<string, (data: any) => void>,
): () => void {
  const controller = new AbortController();
  (async () => {
    try {
      const res = await fetch('/api/agent/run/stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.body) throw new Error('no response body');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() || '';
        for (const frame of frames) {
          const eventMatch = frame.match(/^event: (.+)$/m);
          const dataMatch = frame.match(/^data: ([\s\S]+)$/m);
          if (!eventMatch || !dataMatch) continue;
          try {
            handlers[eventMatch[1].trim()]?.(JSON.parse(dataMatch[1]));
          } catch {
            /* ignore malformed frame */
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') handlers.error?.({ message: (err as Error).message });
    }
  })();
  return () => controller.abort();
}
