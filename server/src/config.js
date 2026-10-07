/**
 * Forge — centralized configuration.
 * Everything is env-overridable so the same build runs locally, in CI and in a sandbox.
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** repo root = one level above /server */
export const ROOT = path.resolve(__dirname, '..', '..');

export const config = {
  port: Number(process.env.PORT || 3001),
  host: process.env.HOST || '0.0.0.0',
  root: ROOT,

  /** All mutable runtime state lives here. Gitignored. */
  dataDir: process.env.FORGE_DATA_DIR || path.join(ROOT, 'server', '.forge'),

  /** Root that vibe-coded projects are written into and generated apps served from. */
  get projectsDir() {
    return path.join(this.dataDir, 'projects');
  },

  /** Scratch space for the python/js sandbox. */
  get sandboxDir() {
    return path.join(this.dataDir, 'sandbox');
  },

  /** Workspaces that the agentic coder is allowed to read/write. */
  get workspacesRoot() {
    return path.join(this.dataDir, 'workspaces');
  },

  /** Static build of the React frontend. */
  get webDist() {
    return path.join(ROOT, 'web', 'dist');
  },

  /** Optional live model providers. When absent, Forge uses the built-in local engine. */
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
  openaiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',

  limits: {
    /** Nominal context window advertised for the analysis surface. */
    contextTokens: 1_000_000,
    maxBodyBytes: 12 * 1024 * 1024,
    sandboxTimeoutMs: Number(process.env.FORGE_SANDBOX_TIMEOUT_MS || 6000),
    agentMaxSteps: 14,
    agentMaxRepairs: 3,
  },
};

export function ensureDirs() {
  for (const dir of [config.dataDir, config.projectsDir, config.sandboxDir, config.workspacesRoot]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

ensureDirs();
export default config;
