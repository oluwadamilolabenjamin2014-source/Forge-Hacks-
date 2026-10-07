import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { groupTotals, overdueTotal, statusCounts, agingBuckets, loadAndTotal } from '../src/report.js';

const asOf = new Date('2026-10-07T00:00:00Z');
const entries = [
  { id: '1', amount: 1250.75, category: 'sales', status: 'paid', due: '2026-09-01' },
  { id: '2', amount: 90.5, category: 'services', status: 'pending', due: '2026-10-15' },
  { id: '3', amount: 1000, category: 'sales', status: 'pending', due: '2026-08-20' },
  { id: '4', amount: 50, category: null, status: 'pending', due: '2026-06-01' },
];

test('groupTotals sums by category and names the uncategorised bucket', () => {
  assert.deepEqual(groupTotals(entries), { sales: 2250.75, services: 90.5, uncategorised: 50 });
});

test('overdueTotal returns 0 for an empty ledger instead of throwing', () => {
  assert.equal(overdueTotal([], asOf), 0);
});

test('overdueTotal sums only entries past due', () => {
  assert.equal(overdueTotal(entries, asOf), 2300.75);
});

test('statusCounts counts each status', () => {
  assert.deepEqual(statusCounts(entries), { paid: 1, pending: 3 });
});

test('agingBuckets place receivables in the right age band', () => {
  const buckets = agingBuckets(entries, asOf);
  assert.deepEqual(buckets, { current: 90.5, '1-30': 0, '31-60': 2250.75, '60+': 50 });
});

test('loadAndTotal reads a file and totals it', async () => {
  const file = path.join(os.tmpdir(), `ledger-${process.pid}.json`);
  await fsp.writeFile(file, JSON.stringify([{ amount: 10 }, { amount: 32.5 }]));
  try {
    assert.equal(await loadAndTotal(file), 42.5);
  } finally {
    await fsp.rm(file, { force: true });
  }
});
