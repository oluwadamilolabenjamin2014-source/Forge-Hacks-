/**
 * Diffing and patching.
 *
 * The agentic surface never writes a file silently: every edit is expressed as a
 * find/replace operation, converted into a unified diff, and shown to a human before
 * (and after) it is applied. Unified diffs are also how a rejected change is reverted —
 * apply the reverse patch.
 */

/** Classic LCS-based line diff → unified diff hunks. */
export function unifiedDiff(oldText = '', newText = '', { file = 'file', context = 3 } = {}) {
  const a = String(oldText).split('\n');
  const b = String(newText).split('\n');
  const ops = diffOps(a, b);
  if (!ops.some((op) => op.type !== 'equal')) return '';

  const hunks = [];
  let current = null;
  ops.forEach((op, index) => {
    if (op.type === 'equal') return;
    const start = Math.max(0, index - context);
    const end = Math.min(ops.length, index + context + 1);
    if (!current || start > current.end) {
      if (current) hunks.push(current);
      current = { start, end, items: [] };
    }
    current.end = Math.max(current.end, end);
  });
  if (current) hunks.push(current);

  const lines = [`--- a/${file}`, `+++ b/${file}`];
  for (const hunk of hunks) {
    const slice = ops.slice(hunk.start, hunk.end);
    const aStart = countBefore(ops, hunk.start) + 1;
    const bStart = countBefore(ops, hunk.start, 'new') + 1;
    const aCount = slice.filter((o) => o.type !== 'add').length;
    const bCount = slice.filter((o) => o.type !== 'remove').length;
    lines.push(`@@ -${aStart},${aCount} +${bStart},${bCount} @@`);
    for (const op of slice) {
      lines.push(op.type === 'add' ? `+${op.line}` : op.type === 'remove' ? `-${op.line}` : ` ${op.line}`);
    }
  }
  return lines.join('\n');
}

function countBefore(ops, index, side = 'old') {
  let n = 0;
  for (let i = 0; i < index; i += 1) {
    if (side === 'old' && ops[i].type !== 'add') n += 1;
    if (side === 'new' && ops[i].type !== 'remove') n += 1;
  }
  return n;
}

function diffOps(a, b) {
  const n = a.length;
  const m = b.length;
  // LCS table capped so a huge file cannot blow memory (falls back to whole-file replace).
  if (n * m > 4_000_000) {
    return [...a.map((line) => ({ type: 'remove', line })), ...b.map((line) => ({ type: 'add', line }))];
  }
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: 'equal', line: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'remove', line: a[i] });
      i += 1;
    } else {
      ops.push({ type: 'add', line: b[j] });
      j += 1;
    }
  }
  while (i < n) ops.push({ type: 'remove', line: a[i++] });
  while (j < m) ops.push({ type: 'add', line: b[j++] });
  return ops;
}

export async function readText(filePath, fs) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

export function summarizeDiff(diff) {
  let added = 0;
  let removed = 0;
  for (const line of String(diff).split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) added += 1;
    if (line.startsWith('-')) removed += 1;
  }
  return { added, removed, files: (String(diff).match(/^\+\+\+ /gm) || []).length };
}
