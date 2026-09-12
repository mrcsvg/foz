import fs from 'node:fs';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { WebSocketServer, WebSocket } from 'ws';
import type { FozEvent } from '@foz/core';
import { loadConfig } from './config.js';
import { Store } from './store.js';
import { SyncEngine } from './sync.js';
import { createApi } from './api.js';
import { buildAdapters } from './providers/index.js';

const log = (m: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${m}`);

async function main() {
  const config = loadConfig();
  const store = new Store(path.join(config.dataDir, 'foz.db'));
  const sync = new SyncEngine(store, config.pollIntervalMs, log);

  const adapters = buildAdapters(config);
  for (const a of adapters) await sync.register(a);
  // Drop data from accounts that are no longer configured (e.g. demo turned off).
  const known = new Set(adapters.map((a) => a.account.id));
  for (const c of store.listConversations({ view: 'all', limit: 100000 })) {
    if (!known.has(c.accountId)) store.deleteAccountData(c.accountId);
  }
  sync.start();

  const app = createApi(store, sync, config);

  // Serve the built UI in production (apps/web/dist).
  const dist = path.join(config.rootDir, 'apps', 'web', 'dist');
  if (fs.existsSync(dist)) {
    const rel = path.relative(process.cwd(), dist);
    app.use('/*', serveStatic({ root: rel }));
    app.get('*', serveStatic({ root: rel, path: 'index.html' }));
  }

  const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
    log(`foz server on http://localhost:${info.port}  (demo=${config.demo}, accounts=${adapters.map((a) => a.account.id).join(',') || 'none'})`);
    if (!fs.existsSync(dist)) log('UI not built: run `pnpm dev` for Vite, or `pnpm build` then `pnpm start`.');
  });

  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    if (req.url?.startsWith('/ws')) {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    } else {
      socket.destroy();
    }
  });
  wss.on('connection', (ws) => {
    const hello: FozEvent = { type: 'hello', accounts: sync.listAccounts() };
    ws.send(JSON.stringify(hello));
  });
  sync.on('event', (e: FozEvent) => {
    const payload = JSON.stringify(e);
    for (const client of wss.clients) if (client.readyState === WebSocket.OPEN) client.send(payload);
  });

  const shutdown = async () => {
    log('shutting down');
    await sync.stop();
    store.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
