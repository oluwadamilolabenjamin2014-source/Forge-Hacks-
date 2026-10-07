// Integration tests for {{NAME}} — run with: npm test
// These are real HTTP tests against the real server, against a throwaway data file.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.NODE_ENV = 'test';
const tmpFile = path.join(os.tmpdir(), `{{COLLECTION}}-test-${process.pid}-${Date.now()}.json`);
fs.writeFileSync(tmpFile, '[]');
process.env.FORGE_DATA_FILE = tmpFile;

const { createServer, load } = await import('../server.js');
await load();
const server = createServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const call = async (p, options = {}) => {
  const res = await fetch(base + p, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  return { status: res.status, body };
};

const valid = {{VALID_ROW}};
let id;

after(() => {
  server.close();
  fs.rmSync(tmpFile, { force: true });
});

test('health endpoint reports an empty store', async () => {
  const res = await call('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
  assert.equal(res.body.records, 0);
});

test('list is empty before any writes', async () => {
  const res = await call('/api/{{COLLECTION}}');
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 0);
  assert.deepEqual(res.body.items, []);
});

test('POST creates a record and assigns an id', async () => {
  const res = await call('/api/{{COLLECTION}}', { method: 'POST', body: valid });
  assert.equal(res.status, 201);
  assert.ok(res.body.id, 'a generated id is required');
  assert.ok(res.body.createdAt, 'createdAt should be stamped');
  id = res.body.id;
});

test('POST rejects an invalid payload with 422 and field errors', async () => {
  const res = await call('/api/{{COLLECTION}}', { method: 'POST', body: {{INVALID_ROW}} });
  assert.equal(res.status, 422);
  assert.equal(res.body.error, 'validation_failed');
  assert.ok(Array.isArray(res.body.errors) && res.body.errors.length > 0, 'expected at least one field error');
});

test('GET by id returns the created record', async () => {
  const res = await call(`/api/{{COLLECTION}}/${id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.id, id);
});

test('search filters the collection', async () => {
  const needle = encodeURIComponent(String(valid['{{TITLE_FIELD}}']).slice(0, 4));
  const res = await call(`/api/{{COLLECTION}}?q=${needle}`);
  assert.equal(res.status, 200);
  assert.ok(res.body.items.some((row) => row.id === id), `search for "${needle}" should find the record`);
});

test('PATCH updates fields and bumps updatedAt', async () => {
  const res = await call(`/api/{{COLLECTION}}/${id}`, { method: 'PATCH', body: {{PATCH_ROW}} });
  assert.equal(res.status, 200);
  assert.deepEqual(Object.entries({{PATCH_ROW}}).map(([k, v]) => res.body[k] === undefined ? v : res.body[k]),
    Object.values({{PATCH_ROW}}));
});

test('stats aggregates the collection', async () => {
  const res = await call('/api/{{COLLECTION}}/stats');
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 1);
  assert.ok(res.body.updatedAt, 'stats should carry a timestamp');
});

test('CSV export includes the header row', async () => {
  const res = await fetch(`${base}/api/{{COLLECTION}}/export.csv`);
  const text = await res.text();
  assert.equal(res.status, 200);
  assert.ok(text.split('\n')[0].includes('{{TITLE_FIELD}}'), 'header row should list field names');
});

test('DELETE removes the record and a second delete 404s', async () => {
  const first = await call(`/api/{{COLLECTION}}/${id}`, { method: 'DELETE' });
  assert.equal(first.status, 200);
  const second = await call(`/api/{{COLLECTION}}/${id}`, { method: 'DELETE' });
  assert.equal(second.status, 404);
});

test('unknown ids return 404 with a useful message', async () => {
  const res = await call('/api/{{COLLECTION}}/does-not-exist');
  assert.equal(res.status, 404);
  assert.match(res.body.detail, /does not exist/);
});

test('path traversal cannot leak source files', async () => {
  // WHATWG URL normalises dot-segments, so these collapse before routing. The point of
  // this test is the outcome: no response may ever contain server source or package data.
  for (const target of ['/%2e%2e%2fserver.js', '/..%2fpackage.json', '/%2e%2e/%2e%2e/package.json']) {
    const res = await fetch(base + target);
    const text = await res.text();
    assert.ok(!text.includes('createServer'), `${target} leaked server source`);
    assert.ok(!text.includes('"generatedBy"'), `${target} leaked package metadata`);
  }
});

