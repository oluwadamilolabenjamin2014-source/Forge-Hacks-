# ledger-api

A small double-entry-ish ledger with reporting helpers. Used as the Forge agentic-coding
demo repository: `npm test` fails on a clean checkout, and the agent is expected to
diagnose and repair it **without being told which lines are wrong**.

## Layout

```
src/ledger.js    totals, parsing, lookup, summarising
src/report.js    grouping, overdue/aging, status counts, async loading
src/server.js    tiny HTTP wrapper around the ledger
test/            node:test suites (the specification)
```

## Run

```bash
npm test      # the specification — currently red
npm start     # http://localhost:4200/api/summary
```

## Known-good expectations (from the suite)

| Function | Expected |
| --- | --- |
| `totalOf(entries)` | exact sum of `amount` (no `NaN`, no skipped rows) |
| `sortedAmounts(entries)` | numeric ascending order, not lexicographic |
| `findEntry(entries, id)` | strict identity match — `"1"` is not `1` |
| `parseAmount(str)` | decimal-aware — `"1,250.75"` → `1250.75` |
| `overdueTotal(entries, asOf)` | `0` for an empty list, never a throw |
| `loadAndTotal(path)` | awaits the file read before parsing |

Do not "fix" the tests. The tests encode the contract.
