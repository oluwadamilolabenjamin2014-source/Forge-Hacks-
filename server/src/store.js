/**
 * Tiny JSON persistence layer.
 * Keeps a single JSON document in memory, writes through to disk (debounced + atomic).
 * Deliberately dependency-free so the server boots anywhere.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import config from './config.js';

const FILE = path.join(config.dataDir, 'db.json');

const DEFAULT_DB = {
  version: 1,
  conversations: [],
  documents: [],
  projects: [],
  skills: [],
  connections: [],
  audit: [],
  reviews: [],
  settings: {
    provider: 'local',
    determinism: true,
    highStakesReview: true,
    temperature: 0,
  },
};

function load() {
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...structuredClone(DEFAULT_DB), ...parsed };
  } catch {
    return structuredClone(DEFAULT_DB);
  }
}

export const db = load();

let flushTimer = null;
export function persist() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const tmp = `${FILE}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
      fs.renameSync(tmp, FILE);
    } catch (err) {
      console.error('[forge] failed to persist db:', err.message);
    }
  }, 120);
}

export const nowIso = () => new Date().toISOString();
export const id = (prefix = 'id') => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;

/** Append-only trail. Everything that touches the outside world lands here. */
export function audit(entry) {
  db.audit.unshift({
    id: id('aud'),
    at: nowIso(),
    actor: 'forge-agent',
    ...entry,
  });
  db.audit = db.audit.slice(0, 500);
  persist();
  return db.audit[0];
}

export function getSettings() {
  db.settings = { ...DEFAULT_DB.settings, ...(db.settings || {}) };
  return db.settings;
}

export function patchSettings(patch = {}) {
  db.settings = { ...getSettings(), ...patch };
  persist();
  return db.settings;
}
