import { ensureWorkspaces, resolveWorkspace } from '../server/src/lib/workspaces.js';
import { runAgent } from '../server/src/lib/agent.js';
const ws = await resolveWorkspace('ledger-api');
await ensureWorkspaces({ reset: true });
console.log('workspace:', ws.root);
for await (const e of runAgent({ root: ws.root, instruction: 'fix the failing tests', maxRounds: 8 })) {
  if (e.type === 'step') console.log('STEP    ', e.message);
  else if (e.type === 'baseline') console.log('BASELINE', e.passed, 'pass /', e.failed, 'fail');
  else if (e.type === 'propose') console.log('PROPOSE ', e.rule, '→', e.file + ':' + e.line);
  else if (e.type === 'verify') console.log('VERIFY  ', e.verdict.padEnd(8), e.rule, '|', e.passed, 'pass /', e.failed, 'fail');
  else if (e.type === 'skip') console.log('SKIP    ', e.rule, '|', e.message);
  else if (e.type === 'advisory') console.log('ADVISORY', e.items.map(i => i.rule).join(', '));
  else if (e.type === 'summary') console.log('SUMMARY ', JSON.stringify(e.summary), '\nMESSAGE ', e.message);
}
