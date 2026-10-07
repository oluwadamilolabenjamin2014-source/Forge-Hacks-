/**
 * Tiny HTTP wrapper so the ledger can be exercised over the wire.
 * Run: node src/server.js   →   GET /api/summary, /api/entries
 */
import http from 'node:http';
import { summarize, sortedAmounts } from './ledger.js';
import { agingBuckets, groupTotals, statusCounts } from './report.js';

const entries = [
  { id: '1', amount: 1250.75, category: 'sales', status: 'paid', due: '2026-09-01' },
  { id: '2', amount: 90.5, category: 'services', status: 'pending', due: '2026-10-15' },
  { id: '3', amount: 1000, category: 'sales', status: 'pending', due: '2026-08-20' },
];

const PORT = Number(process.env.PORT || 4200);

export function createServer() {
  return http.createServer((req, res) => {
    const send = (status, payload) => {
      const body = JSON.stringify(payload);
      res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
      res.end(body);
    };
    if (req.url === '/api/summary') {
      return send(200, {
        ...summarize(entries),
        byCategory: groupTotals(entries),
        byStatus: statusCounts(entries),
        aging: agingBuckets(entries, new Date()),
      });
    }
    if (req.url === '/api/entries') return send(200, { items: entries, amounts: sortedAmounts(entries) });
    return send(404, { error: 'not_found' });
  });
}

if (process.env.NODE_ENV !== 'test') {
  createServer().listen(PORT, '0.0.0.0', () => console.log(`ledger-api on http://0.0.0.0:${PORT}`));
}
