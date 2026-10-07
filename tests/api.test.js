import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createApi } from '../server/api.js';

const token = 'test-workspace-token-never-a-real-secret';
async function fixture(t, options = {}) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'cyber-david-api-'));
  const app = await createApi({ dataDir, token, apiKey: '', ...options });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(dataDir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(route, method = 'GET', body, auth = token) {
    const response = await fetch(base + route, { method, headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  return { request, dataDir };
}

test('health exposes no credentials; all workspace routes require authentication', async t => {
  const { request } = await fixture(t);
  assert.deepEqual((await request('/healthz', 'GET', undefined, '')).body, { status: 'ok', service: 'cyber-david' });
  for (const route of ['/api/status', '/api/projects', '/api/projects/missing/export', '/api/projects/missing/activity']) {
    assert.equal((await request(route, 'GET', undefined, '')).status, 401);
  }
  const status = await request('/api/status');
  assert.equal(status.body.version, '0.2.0');
  assert.equal(status.body.configured, false);
  assert.equal(JSON.stringify(status.body).includes(token), false);
  assert.equal(status.headers.get('cache-control'), 'no-store');
});

test('project CRUD, export and activity use durable storage and exact deletion confirmation', async t => {
  const { request, dataDir } = await fixture(t);
  const { body: p } = await request('/api/projects', 'POST', { name: 'Portfolio' });
  const route = `/api/projects/${p.id}`;
  assert.equal((await request(route + '/rename', 'POST', { name: '' })).status, 400);
  assert.equal((await request(route + '/rename', 'POST', { name: 'New portfolio', extra: true })).status, 400);
  const renamed = await request(route + '/rename', 'POST', { name: 'New portfolio' });
  assert.equal(renamed.body.name, 'New portfolio');
  assert.equal((await request(route + '/files', 'POST', { path: '../escape.js', content: '' })).status, 400);
  assert.equal((await request(route + '/files', 'POST', { path: 'a.txt', content: '\u0000' })).status, 400);
  assert.equal((await request(route + '/files', 'POST', { path: 'brief.md', content: '# Build something' })).status, 200);
  const activity = await request(route + '/activity?limit=1');
  assert.equal(activity.body.total, 2); assert.equal(activity.body.items.length, 1);
  assert.equal(activity.body.items[0].text, 'Imported brief.md');
  assert.equal((await request(route + '/activity?limit=-1')).status, 400);
  const exported = await request(route + '/export');
  assert.equal(exported.body.project.files['brief.md'], '# Build something');
  assert.equal(exported.body.format, 'cyber-david-project');
  assert.equal('history' in exported.body.project, false);
  assert.ok(exported.headers.get('content-disposition').startsWith('attachment;'));
  const persisted = JSON.parse(await readFile(path.join(dataDir, 'workspace.json'), 'utf8'));
  assert.equal(persisted.projects[0].name, 'New portfolio');
  assert.equal((await request(route, 'DELETE', { confirmName: 'Portfolio' })).status, 409);
  assert.equal((await request(route, 'GET')).status, 200);
  assert.equal((await request(route, 'DELETE', { confirmName: 'New portfolio' })).status, 200);
  assert.equal((await request(route, 'GET')).status, 404);
  assert.deepEqual((await request('/api/projects')).body, []);
  assert.deepEqual(JSON.parse(await readFile(path.join(dataDir, 'workspace.json'), 'utf8')).projects, []);
});

test('HTTP chat and exact diff approval complete end to end through a mock provider', async t => {
  let round = 0;
  const { request } = await fixture(t, { apiKey: 'test-not-a-provider-key', callProvider: async () => {
    if (round++ === 0) return { tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'propose_files', arguments: JSON.stringify({ summary: 'Create page', files: [{ path: 'index.html', content: '<h1>Hello</h1>' }] }) } }] };
    return { content: 'Review this proposal before applying it.' };
  } });
  const { body: p } = await request('/api/projects', 'POST', { name: 'End-to-end' });
  const route = `/api/projects/${p.id}`;
  const chat = await request(route + '/chat', 'POST', { text: 'Build a page', skill: 'build' });
  assert.equal(chat.status, 200); assert.equal(chat.body.messages.length, 2);
  assert.deepEqual(chat.body.files, {});
  const proposal = chat.body.proposals[0];
  assert.ok(proposal.files[0].diff.includes('+<h1>Hello</h1>'));
  const approvalRoute = route + '/proposals/' + proposal.id;
  assert.equal((await request(approvalRoute, 'POST', { action: 'approve', digest: 'not-the-digest' })).status, 400);
  const approved = await request(approvalRoute, 'POST', { action: 'approve', digest: proposal.digest });
  assert.equal(approved.body.files['index.html'], '<h1>Hello</h1>');
  assert.equal(approved.body.proposals[0].status, 'approved');
  assert.equal((await request(approvalRoute, 'POST', { action: 'approve', digest: proposal.digest })).status, 400);
});

test('unconfigured AI and provider failures do not save partial conversations', async t => {
  const { request } = await fixture(t);
  const { body: p } = await request('/api/projects', 'POST', { name: 'No AI' });
  assert.equal((await request(`/api/projects/${p.id}/chat`, 'POST', { text: 'Hi', skill: 'build' })).status, 503);
  assert.deepEqual((await request(`/api/projects/${p.id}`)).body.messages, []);
  const failure = await fixture(t, { apiKey: 'mock', callProvider: async () => { throw new Error('Mock provider unavailable'); } });
  const { body: p2 } = await failure.request('/api/projects', 'POST', { name: 'Failure' });
  assert.equal((await failure.request(`/api/projects/${p2.id}/chat`, 'POST', { text: 'Hi', skill: 'build' })).status, 400);
  assert.deepEqual((await failure.request(`/api/projects/${p2.id}`)).body.messages, []);
});

test('in-flight agent runs reject concurrent mutations rather than overwriting data', async t => {
  let finish, started;
  const gate = new Promise(resolve => { finish = resolve; });
  const waiting = new Promise(resolve => { started = resolve; });
  const { request } = await fixture(t, { apiKey: 'mock', callProvider: async () => { started(); await gate; return { content: 'Done' }; } });
  const { body: p } = await request('/api/projects', 'POST', { name: 'Concurrent' });
  const run = request(`/api/projects/${p.id}/chat`, 'POST', { text: 'Hi', skill: 'build' });
  await waiting;
  try { assert.equal((await request(`/api/projects/${p.id}`, 'DELETE', { confirmName: p.name })).status, 409); }
  finally { finish(); }
  assert.equal((await run).status, 200);
  assert.equal((await request(`/api/projects/${p.id}`)).body.messages.length, 2);
});
