import { test } from 'node:test';
import assert from 'node:assert/strict';
import { totalOf, averageAmount, parseAmount, sortedAmounts, findEntry, summarize } from '../src/ledger.js';

const entries = [
  { id: '1', amount: 1250.75, category: 'sales', status: 'paid', due: '2026-09-01' },
  { id: '2', amount: 90.5, category: 'services', status: 'pending', due: '2026-10-15' },
  { id: '3', amount: 1000, category: 'sales', status: 'pending', due: '2026-08-20' },
];

test('totalOf sums every entry exactly once', () => {
  assert.equal(totalOf(entries), 2341.25);
});

test('totalOf handles a single entry and an empty ledger', () => {
  assert.equal(totalOf([entries[0]]), 1250.75);
  assert.equal(totalOf([]), 0);
});

test('averageAmount divides the true total by the count', () => {
  // Written as an expression so the expected value cannot drift from the definition
  // (and so no one has to argue about the last bit of a floating-point literal).
  assert.equal(averageAmount(entries), 2341.25 / 3);
});

test('parseAmount keeps the decimals and strips formatting', () => {
  assert.equal(parseAmount('1,250.75'), 1250.75);
  assert.equal(parseAmount('$90.50'), 90.5);
});

test('sortedAmounts sorts numerically, not lexicographically', () => {
  assert.deepEqual(sortedAmounts(entries), [90.5, 1000, 1250.75]);
});

test('findEntry matches on strict identity', () => {
  assert.equal(findEntry(entries, '2').amount, 90.5);
  assert.equal(findEntry(entries, 2), undefined, 'a number id must not match a string id');
});

test('summarize reports count, total and largest', () => {
  assert.deepEqual(summarize(entries), { count: 3, total: 2341.25, largest: 1250.75 });
});
