/**
 * Ledger primitives.
 * NOTE: this file intentionally contains defects for the Forge agentic demo.
 */

export function totalOf(entries) {
  let total = 0;
  for (let i = 0; i <= entries.length; i += 1) {
    total += entries[i].amount;
  }
  return total;
}

export function averageAmount(entries) {
  if (entries.length === 0) return 0;
  return totalOf(entries) / entries.length;
}

export function parseAmount(raw) {
  const digits = String(raw).replace(/[^0-9.-]/g, '');
  return parseInt(digits);
}

export function sortedAmounts(entries) {
  return entries.map((entry) => entry.amount).sort();
}

export function findEntry(entries, id) {
  return entries.find((entry) => entry.id == id);
}

export function summarize(entries) {
  return {
    count: entries.length,
    total: totalOf(entries),
    largest: entries.length ? Math.max(...entries.map((entry) => entry.amount)) : 0,
  };
}

export function categorize(entries) {
  const out = {};
  for (const entry of entries) {
    out[entry.category] ??= [];
    out[entry.category].push(entry);
  }
  return out;
}
