import test from 'node:test';
import assert from 'node:assert/strict';
import { runAgent } from '../server/agent.js';
import { createProject } from '../server/workspace.js';
const toolCall = (name, args, id = 'call1') => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
const signal = () => new AbortController().signal;

test('multi-step agent reads files, plans, proposes, and never applies', async () => {
  const p = createProject('Demo'); p.files['readme.md'] = 'Build a portfolio';
  let round = 0;
  const mock = async messages => {
    round++;
    if (round === 1) return { tool_calls: [toolCall('list_files', {})] };
    if (round === 2) {
      assert.deepEqual(JSON.parse(messages.at(-1).content).files, ['readme.md']);
      return { tool_calls: [toolCall('read_file', { path: 'readme.md' }, 'read')] };
    }
    if (round === 3) {
      assert.equal(JSON.parse(messages.at(-1).content).content, 'Build a portfolio');
      return { tool_calls: [toolCall('set_plan', { steps: [{ title: 'Draft page', status: 'active' }] }, 'plan'), toolCall('propose_files', { summary: 'Add portfolio', files: [{ path: 'index.html', content: '<h1>Portfolio</h1>' }] }, 'write')] };
    }
    assert.equal(JSON.parse(messages.at(-1).content).status, 'pending');
    return { content: 'The page is ready for your review. It has not been applied.' };
  };
  const result = await runAgent(p, 'Build it', 'Inspect files first', signal(), mock);
  assert.equal(round, 4); assert.equal(result.proposals.length, 1); assert.equal(result.files['index.html'], undefined);
  assert.equal(result.plan[0].status, 'active'); assert.equal(result.messages.length, 2);
  assert.equal(p.messages.length, 0); assert.equal(p.proposals.length, 0);
  assert.equal(result.history.filter(m => m.role === 'tool').length, 4);
});
test('tool cannot bypass approval or invoke shell', async () => {
  let round = 0;
  const result = await runAgent(createProject('Test'), 'Try tools', '', signal(), async messages => {
    if (round++ === 0) return { tool_calls: [toolCall('propose_files', { summary: 'Malicious', files: [{ path: 'a.js', content: 'hi' }], status: 'approved' }), toolCall('execute_shell', { command: 'echo hi' }, 'exec')] };
    assert.equal(JSON.parse(messages.at(-1).content).error, 'Unknown tool.');
    assert.equal(JSON.parse(messages.at(-2).content).error, 'Invalid tool arguments.');
    return { content: 'These tools are unavailable.' };
  });
  assert.deepEqual(result.files, {}); assert.deepEqual(result.proposals, []);
});
test('failed run leaves all original state unchanged', async () => {
  const p = createProject('Test'); let round = 0;
  await assert.rejects(runAgent(p, 'Build', '', signal(), async () => {
    if (round++ === 0) return { tool_calls: [toolCall('propose_files', { summary: 'Change', files: [{ path: 'a.js', content: 'test' }] })] };
    throw new Error('Provider unavailable');
  }), /Provider unavailable/);
  assert.deepEqual(p.files, {}); assert.deepEqual(p.proposals, []); assert.deepEqual(p.messages, []);
});
test('agent terminates on round limit without persisting partial work', async () => {
  const p = createProject('Test'); let calls = 0;
  await assert.rejects(runAgent(p, 'Loop', '', signal(), async () => { calls++; return { tool_calls: [toolCall('list_files', {})] }; }), /eight-round limit/);
  assert.equal(calls, 8); assert.equal(p.messages.length, 0);
});
test('aborted provider cannot commit a late successful response', async () => {
  const p = createProject('Test'); const controller = new AbortController();
  await assert.rejects(runAgent(p, 'Build', '', controller.signal, async () => { controller.abort(); return { content: 'Late response' }; }));
  assert.equal(p.messages.length, 0);
});
test('oversized conversation is rejected before provider call', async () => {
  const p = createProject('Test'); p.history = [{ role: 'user', content: 'x'.repeat(250001) }];
  await assert.rejects(runAgent(p, 'Hello', '', signal(), async () => { assert.fail('Must not call provider'); }), /context is full/);
});
