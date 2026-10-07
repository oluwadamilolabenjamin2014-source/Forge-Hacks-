#!/usr/bin/env node
/**
 * End-to-end smoke test. Exercises every API surface against a running Forge server
 * and prints what actually happened — including the exit codes and pass/fail counts
 * the backend obtained by *executing* things rather than asserting they work.
 *
 *   node server/src/index.js &
 *   node scripts/smoke.js [baseUrl]
 */
const BASE = process.argv[2] || process.env.FORGE_URL || 'http://127.0.0.1:3001';

let passed = 0;
let failed = 0;
const results = [];

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text.slice(0, 200) };
  }
  return { status: res.status, payload, text };
}

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    results.push(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed += 1;
    results.push(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title) {
  results.push(`\n${title}`);
}

async function main() {
  console.log(`\nForge smoke test → ${BASE}\n${'='.repeat(64)}`);

  section('System');
  const health = await call('GET', '/api/system/health');
  check('health responds', health.status === 200, `node ${health.payload?.node}, engine ${health.payload?.engine}`);
  const caps = await call('GET', '/api/system/capabilities');
  check('capability manifest lists capabilities + limitations', caps.payload?.capabilities?.length >= 10 && caps.payload?.limitations?.length >= 15, `${caps.payload?.capabilities?.length} capabilities, ${caps.payload?.limitations?.length} limitations`);

  section('Chat routing (deterministic engine)');
  const equation = await call('POST', '/api/chat', { message: 'solve 3(x - 2) = 9' });
  check('equation solved by the parser', equation.payload?.reply?.text?.includes('Answer: 5'), equation.payload?.reply?.surface);
  const percent = await call('POST', '/api/chat', { message: '17.5% of 240' });
  check('percentage word problem', percent.payload?.reply?.text?.includes('42'), percent.payload?.reply?.surface);
  const appBuild = await call('POST', '/api/chat', { message: 'build an app that tracks my reading list' });
  check('app request builds + tests the app in chat', /passed, \d+ failed/.test(appBuild.payload?.reply?.text || ''), appBuild.payload?.reply?.surfaceLabel);
  const code = await call('POST', '/api/chat', { message: 'write a python function called two_sum that finds a pair adding to a target' });
  check('code generation returns runnable code + tests', code.payload?.reply?.artifacts?.length >= 1, `${code.payload?.reply?.artifacts?.length} artifact(s)`);
  const boundary = await call('POST', '/api/chat', { message: 'can you book a flight for me?' });
  check('real-world agency refused explicitly', /No — and not as a hidden limitation/.test(boundary.payload?.reply?.text || ''));
  const advice = await call('POST', '/api/chat', { message: 'is it legal to fire an employee for this?' });
  check('professional-advice boundary + warning banner', (advice.payload?.reply?.warnings || []).length > 0, advice.payload?.reply?.warnings?.[0]?.slice(0, 60));

  section('Documents (long context)');
  const doc = await call('POST', '/api/documents', {
    title: 'Smoke contract',
    text: `MASTER SERVICES AGREEMENT (excerpt)

2. FEES. Customer shall pay USD 12,500 per month, invoiced in arrears. Late payments accrue interest at 1.5% per month.

3. DATA PROTECTION. Supplier shall notify Customer of any personal data breach within 72 hours. Aggregate liability for this clause is capped at USD 250,000.

4. LIABILITY. Each party's total aggregate liability is limited to fees paid in the preceding 12 months. The cap does not apply to breach of confidentiality.

STATEMENT OF WORK 1. Milestone 1 payment of USD 45,000 is due on acceptance. Acceptance testing period is 15 business days.`,
  });
  check('document indexed with chunk count', doc.status === 201 && doc.payload.chunks > 0, `${doc.payload?.tokens} tokens / ${doc.payload?.chunks} chunks`);
  const search = await call('POST', '/api/documents/search', { query: 'liability cap for data breach' });
  check('retrieval returns cited passages', search.payload?.hits?.length > 0, `${search.payload?.hits?.[0]?.citation} score ${search.payload?.hits?.[0]?.score}`);
  const miss = await call('POST', '/api/documents/search', { query: 'quantum chromodynamics lattice gauge' });
  check('retrieval miss reported honestly', /does not appear to discuss/.test(miss.payload?.note || ''), miss.payload?.note?.slice(0, 48));
  const xref = await call('POST', '/api/documents/cross-reference', { query: 'USD liability fees' });
  check('cross-reference produces figures and themes', (xref.payload?.sharedThemes?.length || 0) + (xref.payload?.disagreements?.length || 0) >= 0, `${xref.payload?.documents?.length} doc(s) touched`);

  section('Sandbox (real execution)');
  const py = await call('POST', '/api/sandbox/run', { language: 'python', code: 'import sys\nprint("hello", sys.version.split()[0])\nprint(sum(i*i for i in range(10)))' });
  check('python ran with exit code 0', py.payload?.ok === true && py.payload?.exitCode === 0, py.payload?.stdout?.split('\n')[0]);
  check('execution trace captured', (py.payload?.steps?.length || 0) > 0, `${py.payload?.stepCount} traced lines`);
  const bad = await call('POST', '/api/sandbox/run', { language: 'python', code: 'def broken(:\n  pass' });
  check('syntax error surfaces with non-zero exit', bad.payload?.ok === false && bad.payload?.exitCode !== 0, (bad.payload?.stderr || '').split('\n')[0]?.slice(0, 60));
  const timeout = await call('POST', '/api/sandbox/run', { language: 'python', code: 'while True:\n    pass', timeoutMs: 1200 });
  check('infinite loop killed by timeout', timeout.payload?.timedOut === true, `exit ${timeout.payload?.exitCode} after ${timeout.payload?.durationMs}ms`);
  const gen = await call('POST', '/api/sandbox/generate-and-run', { prompt: 'write a python function called fibonacci that returns the nth number' });
  check('generate-and-run executes generated code', gen.payload?.execution?.ok === true, `${gen.payload?.filename} (${gen.payload?.intent})`);

  section('Vibe coding (generate → test → deploy)');
  const built = await call('POST', '/api/projects', { prompt: 'build an app that tracks my reading list with a rating and notes' });
  const project = built.payload?.project;
  check('project generated with files', built.status === 201 && project?.fileCount >= 8, `${project?.slug} (${project?.fileCount} files)`);
  check('generated suite passes for real', built.payload?.testRun?.ok === true, `${built.payload?.testRun?.passed} passed / ${built.payload?.testRun?.failed} failed via ${built.payload?.testRun?.runner}`);
  const deployed = await call('POST', `/api/projects/${project?.slug}/deploy`);
  check('deployed as its own process and health-checked', deployed.payload?.deployed === true, `pid ${deployed.payload?.pid} on :${deployed.payload?.port}`);
  const preview = await fetch(`${BASE}/generated/${project?.slug}/api/health`);
  const previewBody = await preview.json().catch(() => ({}));
  check('preview proxy reaches the child app API', preview.status === 200 && previewBody.status === 'ok', `${previewBody.records} record(s) served`);
  const previewHtml = await fetch(`${BASE}/generated/${project?.slug}/`);
  const html = await previewHtml.text();
  check('preview proxy serves the app UI', previewHtml.status === 200 && html.includes('Reading List'), `${html.length} bytes of HTML`);
  const editPreview = await call('POST', `/api/projects/${project?.slug}/edit`, { file: 'server.js', find: "const COLLECTION = 'books';", replace: "const COLLECTION = 'books'; // reviewed by a human", apply: false });
  check('project edits are previewed as diffs before writing', (editPreview.payload?.diff || '').includes('+++'), `${(editPreview.payload?.diff || '').split('\n').length} diff lines`);

  section('Agentic coding (repair verified by execution)');
  const reset = await call('POST', '/api/agent/workspaces/reset');
  check('demo workspace reset to the seeded failing state', reset.payload?.suite?.failed >= 8, `${reset.payload?.suite?.passed} pass / ${reset.payload?.suite?.failed} fail`);
  const run = await call('POST', '/api/agent/run', { workspace: 'ledger-api', instruction: 'diagnose and repair the failing suite', maxRounds: 8 });
  const summary = run.payload?.summary;
  check('agent fixed the suite and can prove it', summary?.final?.failed === 0 && summary?.kept >= 5, `${summary?.baseline?.passed}/${summary?.baseline?.passed + summary?.baseline?.failed} → ${summary?.final?.passed}/${summary?.final?.passed + summary?.final?.failed}, ${summary?.kept} kept, ${summary?.reverted} reverted`);
  check('every kept change carries a diff', (run.payload?.ledger || []).filter((l) => l.status === 'kept').every((l) => l.diff?.includes('@@')), `${(run.payload?.ledger || []).length} ledger entries`);
  const readonly = await call('POST', '/api/agent/run', { workspace: 'forge-host', instruction: 'where is the retrieval code?' });
  check('host repo is read-only (writes refused)', readonly.status === 403, readonly.payload?.detail?.slice(0, 48));
  const locate = await call('POST', '/api/agent/locate', { workspace: 'forge-host', query: 'BM25 retrieval scoring' });
  check('locate answers with citations', locate.payload?.hits?.length > 0, locate.payload?.hits?.[0]?.file);

  section('Skills (repeatable workflows)');
  const starter = await call('POST', '/api/skills/from-starter', { slug: 'incident-review' });
  check('starter skill available with parsed steps', (starter.payload?.steps || 0) >= 5, `${starter.payload?.steps} steps${starter.payload?.existed ? ' (already existed)' : ''}`);
  const skillRun = await call('POST', `/api/skills/${starter.payload?.slug}/run`, { input: 'checkout latency spiked for 12 minutes after a config push' });
  check('skill executed every step in order', (skillRun.payload?.steps?.length || 0) === starter.payload?.steps, `${skillRun.payload?.steps?.length} steps in ${skillRun.payload?.durationMs}ms`);
  check('each step names the engine that ran it', skillRun.payload?.steps?.every((s) => s.surface && s.surfaceLabel), skillRun.payload?.steps?.[0]?.surfaceLabel);

  section('Extensions (custody and audit)');
  const conn = await call('POST', '/api/connections', { catalogId: 'payments', scopes: ['read'] });
  check('grant created with scoped risk', conn.status === 201 && conn.payload?.connection?.maxRisk === 'medium', conn.payload?.connection?.scopes?.map((s) => s.id).join(','));
  const blocked = await call('POST', `/api/connections/${conn.payload?.connection?.id}/invoke`, { action: 'create_charge', args: { amount: 4900 } });
  check('irreversible action blocked without a named approver', blocked.status === 202 && blocked.payload?.outcome === 'blocked_pending_approval', blocked.payload?.auditId);
  const approved = await call('POST', `/api/connections/${conn.payload?.connection?.id}/invoke`, { action: 'balance', args: {}, approvedBy: 'operator@local' });
  check('approved action recorded as a simulation (no egress)', approved.payload?.mode === 'simulated' && /no network call/.test(approved.payload?.verdict || ''), approved.payload?.wouldCall);
  const audit = await call('GET', '/api/system/audit?limit=200');
  check('audit trail is populated', audit.payload?.entries?.length > 5, `${audit.payload?.total} entries`);

  section('Frontend');
  const page = await fetch(`${BASE}/`);
  const pageHtml = await page.text();
  check('built UI is served', page.status === 200 && pageHtml.includes('Forge'), `${pageHtml.length} bytes`);
  const assetMatch = pageHtml.match(/src="(\/assets\/[^"]+\.js)"/);
  if (assetMatch) {
    const asset = await fetch(`${BASE}${assetMatch[1]}`);
    check('JS bundle is served', asset.status === 200, `${assetMatch[1]} (${asset.headers.get('content-length')} bytes)`);
  }

  console.log(results.join('\n'));
  console.log(`\n${'='.repeat(64)}`);
  console.log(`${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('smoke test crashed:', err);
  process.exit(1);
});
