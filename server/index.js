import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApi } from './api.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = await createApi();
if (process.env.API_ONLY !== 'true' && process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(root, 'dist')));
  app.get('/{*path}', (req, res) => res.sendFile(path.join(root, 'dist/index.html')));
} else if (process.env.API_ONLY !== 'true') {
  const { createServer } = await import('vite');
  const vite = await createServer({ root, server: { middlewareMode: true, allowedHosts: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
app.listen(Number(process.env.PORT) || 3000, '0.0.0.0', () => console.log('Cyber David is listening on port ' + (process.env.PORT || 3000)));
