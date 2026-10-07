/**
 * Forge API server.
 *
 * Responsibilities:
 *   1. Serve the Forge frontend (built React app, with a dev-server-free fallback note).
 *   2. Mount the capability routes under /api.
 *   3. Reverse-proxy deployed generated apps under /generated/<slug>/ so the preview
 *      runs the *real* child process, not a mock of it.
 */
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import config from './config.js';
import { db, audit } from './store.js';
import { projectRuntime } from './routes/projects.js';

import chatRoutes from './routes/chat.js';
import documentRoutes from './routes/documents.js';
import projectRoutes from './routes/projects.js';
import agentRoutes from './routes/agent.js';
import sandboxRoutes from './routes/sandbox.js';
import skillRoutes from './routes/skills.js';
import connectionRoutes from './routes/connections.js';
import systemRoutes from './routes/system.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

// CORS is open because Forge is a local-first builder tool; the preview host also
// proxies requests, so nothing here depends on it. Tighten for a public deployment.
app.use(cors({ origin: true, credentials: false }));
app.use(express.json({ limit: config.limits.maxBodyBytes }));

app.use((req, _res, next) => {
  if (req.path.startsWith('/api') && req.method !== 'GET') {
    // Every mutating request is attributable in the audit trail.
    audit({ action: 'http.request', method: req.method, path: req.path, actor: 'user' });
  }
  next();
});

app.use('/api/chat', chatRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/sandbox', sandboxRoutes);
app.use('/api/skills', skillRoutes);
app.use('/api/connections', connectionRoutes);
app.use('/api/system', systemRoutes);

app.get('/api', (_req, res) => {
  res.json({
    name: 'Forge',
    version: '1.0.0',
    surfaces: ['/api/chat', '/api/documents', '/api/projects', '/api/agent', '/api/sandbox', '/api/skills', '/api/connections', '/api/system'],
    docs: '/api/system/capabilities',
  });
});

/* ------------------------------------------------- generated app preview proxy */

app.use('/generated/:slug', async (req, res) => {
  const project = db.projects.find((p) => p.slug === req.params.slug);
  if (!project) return res.status(404).type('text/plain').send(`No project named "${req.params.slug}". Generate one first: POST /api/projects`);
  const child = projectRuntime.get(project.slug);
  if (!projectRuntime.isAlive(child)) {
    return res
      .status(503)
      .type('html')
      .send(`<!doctype html><meta charset=utf-8><title>Not running</title>
      <body style="font:15px system-ui;background:#0b0f17;color:#e8edf7;padding:40px">
      <h1 style="margin:0 0 8px">${project.name} is deployed but not running</h1>
      <p style="color:#93a1bd">Start it from the Projects panel, or <code>curl -X POST /api/projects/${project.slug}/deploy</code>.</p>
      </body>`);
  }

  const upstreamPath = `${req.url.replace(/^\/+/, '')}`;
  const proxyReq = http.request(
    {
      host: '127.0.0.1',
      port: project.port,
      method: req.method,
      path: `/${upstreamPath}`,
      headers: { ...req.headers, host: `127.0.0.1:${project.port}` },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );
  proxyReq.on('error', (err) => {
    res.status(502).json({ error: 'upstream_unreachable', detail: err.message });
  });
  req.pipe(proxyReq);
});

/* --------------------------------------------------------------- frontend */

const dist = config.webDist;
const hasBuild = fs.existsSync(path.join(dist, 'index.html'));

if (hasBuild) {
  app.use(
    express.static(dist, {
      index: false,
      setHeaders: (res, filePath) => {
        if (/assets\//.test(filePath)) res.setHeader('cache-control', 'public, max-age=31536000, immutable');
        else res.setHeader('cache-control', 'no-cache');
      },
    }),
  );
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  app.get('*', (_req, res) => {
    res.status(200).type('html').send(`<!doctype html><meta charset=utf-8><title>Forge — frontend not built</title>
    <body style="font:15px/1.6 system-ui;background:#0b0f17;color:#e8edf7;padding:48px;max-width:720px;margin:auto">
      <h1 style="margin:0 0 4px">Forge API is running</h1>
      <p style="color:#93a1bd">The React frontend has not been built yet. Two options:</p>
      <pre style="background:#121826;border:1px solid #23304a;border-radius:12px;padding:16px;overflow:auto"><code>npm run build      # build the UI once, then reload this page
npm run dev        # or run Vite on :5173 with HMR (it proxies /api here)</code></pre>
      <p style="color:#93a1bd">API is live at <a style="color:#f97316" href="/api/system/capabilities">/api/system/capabilities</a>.</p>
    </body>`);
  });
}

/* ------------------------------------------------------------------ errors */

app.use((err, _req, res, _next) => {
  console.error('[forge] unhandled:', err);
  res.status(err.status || 500).json({ error: 'internal_error', detail: err.message });
});

const server = app.listen(config.port, config.host, () => {
  const base = `http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`;
  console.log(`\n  Forge is up — ${base}`);
  console.log(`  API manifest   ${base}/api/system/capabilities`);
  console.log(`  Data dir       ${config.dataDir}`);
  console.log(`  Frontend       ${hasBuild ? 'built (served from /web/dist)' : 'not built — run: npm run build'}\n`);
});

async function shutdown(signal) {
  console.log(`\n[forge] ${signal} received — stopping child processes`);
  await projectRuntime.stopAll();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export default app;
