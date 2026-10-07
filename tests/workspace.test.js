import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, safePath, propose, approve } from '../server/workspace.js';

const proposal = p => propose(p, { summary: 'Add a page', files: [{ path: 'index.html', content: '<h1>Hello</h1>' }] });
test('paths reject traversal, hidden files, absolute paths, controls and unsupported types', () => {
  for (const path of ['../test.js', '/test.js', 'a/../test.js', './test.js', 'a\\b.js', '.env', 'foo/.secret.js', 'nul.js', 'foo.js ', 'x\0.js', 'a//b.js', '__proto__', 'constructor', 'bad.exe', 'é.md']) assert.throws(() => safePath(path), undefined, path);
  assert.equal(safePath('src/app.test.jsx'), 'src/app.test.jsx');
});
test('proposal is pending and does not write until exact approval', () => {
  const p = createProject('Test'); const change = proposal(p);
  assert.deepEqual(p.files, {}); assert.equal(change.status, 'pending');
  assert.throws(() => approve(p, change.id, 'wrong'));
  assert.deepEqual(p.files, {});
  approve(p, change.id, change.digest);
  assert.equal(p.files['index.html'], '<h1>Hello</h1>'); assert.equal(change.status, 'approved');
  assert.throws(() => approve(p, change.id, change.digest));
});
test('stale proposal is rejected without partial writes', () => {
  const p = createProject('Test');
  const change = propose(p, { summary: 'Update', files: [{ path: 'a.js', content: 'first' }, { path: 'b.js', content: 'second' }] });
  p.files['b.js'] = 'human edit';
  assert.throws(() => approve(p, change.id, change.digest), /Stale/);
  assert.equal(p.files['a.js'], undefined); assert.equal(p.files['b.js'], 'human edit');
});
test('expired and malformed proposals rejected', () => {
  const p = createProject('Test'); const change = proposal(p);
  change.createdAt = '2000-01-01'; assert.throws(() => approve(p, change.id, change.digest), /expired/);
  assert.throws(() => propose(p, { summary: 'bad', files: [{ path: 'ok.js', content: 'x' }], status: 'approved' }));
  assert.throws(() => propose(p, { summary: 'bad', files: [{ path: 'A.js', content: '' }, { path: 'a.js', content: '' }] }));
});
test('parallel pending proposals cannot overwrite newly approved content', () => {
  const p = createProject('Test'); const first = proposal(p); const second = proposal(p);
  approve(p, first.id, first.digest);
  assert.throws(() => approve(p, second.id, second.digest), /Stale/);
});
test('workspace quota is enforced at approval against latest state', () => {
  const p = createProject('Test'); const change = proposal(p);
  for (let i = 0; i < 100; i++) p.files[`file${i}.js`] = '';
  assert.throws(() => approve(p, change.id, change.digest), /limit/);
  assert.equal(change.status, 'pending');
});
