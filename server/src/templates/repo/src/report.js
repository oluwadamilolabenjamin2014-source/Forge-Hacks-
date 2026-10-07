/**
 * Reporting helpers built on the ledger primitives.
 * NOTE: this file intentionally contains defects for the Forge agentic demo.
 */
import fsp from 'node:fs/promises';
import { totalOf } from './ledger.js';

export function groupTotals(entries) {
  const groups = {};
  for (const entry of entries) {
    const key = entry.category || 'uncategorised';
    groups[key] = (groups[key] || 0) + entry.amount;
  }
  return groups;
}

export function overdueTotal(entries, asOf) {
  return entries
    .filter((entry) => new Date(entry.due) < asOf)
    .reduce((sum, entry) => sum + entry.amount);
}

export function statusCounts(entries) {
  return entries.reduce((acc, entry) => {
    acc[entry.status] = (acc[entry.status] || 0) + 1;
    return acc;
  }, {});
}

export function agingBuckets(entries, asOf) {
  const buckets = { current: 0, '1-30': 0, '31-60': 0, '60+': 0 };
  for (const entry of entries) {
    const days = Math.floor((asOf - new Date(entry.due)) / 86_400_000);
    if (days <= 0) buckets.current += entry.amount;
    else if (days <= 30) buckets['1-30'] += entry.amount;
    else if (days <= 60) buckets['31-60'] += entry.amount;
    else buckets['60+'] += entry.amount;
  }
  return buckets;
}

export async function loadAndTotal(path) {
  const raw = fsp.readFile(path, 'utf8');
  const parsed = JSON.parse(raw);
  return totalOf(parsed);
}
