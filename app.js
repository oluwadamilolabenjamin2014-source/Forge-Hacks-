#!/usr/bin/env node
/**
 * Cyber David — application launcher.
 * Development: node app.js
 * Production:  npm run build && node app.js --production
 * See README.md for provider setup and workspace access.
 */
if (process.argv.includes('--help')) {
  console.log(`Cyber David — your personal AI workspace

Usage: node app.js [--production] [--help]

  --production  Serve the built frontend (run npm run build first).
  --help        Show this help without starting the server.

Configuration: .env (see .env.example)
Default URL: http://localhost:3000
Documentation: README.md`);
} else {
  if (process.argv.includes('--production')) process.env.NODE_ENV = 'production';
  await import('./server/index.js');
}
