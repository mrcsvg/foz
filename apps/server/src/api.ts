import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { ConversationFilter, ProviderId } from '@foz/core';
import type { Store } from './store.js';
import type { SyncEngine } from './sync.js';
import type { FozConfig } from './config.js';
import { loadKeymap } from './keymap.js';

export const VERSION = '0.1.0';

export function createApi(store: Store, sync: SyncEngine, config: FozConfig) {
  const app = new Hono();
  app.use('/api/*', cors());

  app.get('/api/health', (c) => c.json({ ok: true, version: VERSION }));

  app.get('/api/state', (c) =>
    c.json({
      version: VERSION,
      accounts: sync.listAccounts(),
      keymap: loadKeymap(config.rootDir),
      counts: store.counts(),
      demo: config.demo,
    }),
  );

  app.get('/api/counts', (c) => c.json(store.counts()));

  app.get('/api/conversations', (c) => {
    const q = c.req.query();
    const filter: ConversationFilter = {
      view: (q.view as ConversationFilter['view']) ?? 'inbox',
      provider: (q.provider as ProviderId) || undefined,
      accountId: q.account || undefined,
      q: q.q || undefined,
      limit: q.limit ? Number(q.limit) : undefined,
    };
    return c.json(store.listConversations(filter));
  });

  app.get('/api/conversations/:id', (c) => {
    const conv = store.getConversation(c.req.param('id'));
    return conv ? c.json(conv) : c.json({ error: 'not found' }, 404);
  });

  app.get('/api/conversations/:id/messages', (c) => {
    const id = c.req.param('id');
    if (!store.getConversation(id)) return c.json({ error: 'not found' }, 404);
    return c.json(store.listMessages(id, Number(c.req.query('limit') ?? 200)));
  });

  app.post('/api/conversations/:id/messages', async (c) => {
    const id = c.req.param('id');
    const body = (await c.req.json().catch(() => ({}))) as { text?: string };
    const text = (body.text ?? '').trim();
    if (!text) return c.json({ error: 'text is required' }, 400);
    try {
      const message = await sync.send(id, text);
      return c.json(message, 201);
    } catch (err) {
      return c.json({ error: String((err as Error).message ?? err) }, 400);
    }
  });

  app.post('/api/conversations/:id/read', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { read?: boolean };
    await sync.markRead(c.req.param('id'), body.read ?? true);
    return c.json(store.getConversation(c.req.param('id')) ?? null);
  });

  app.post('/api/conversations/:id/archive', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { archived?: boolean };
    await sync.setArchived(c.req.param('id'), body.archived ?? true);
    return c.json(store.getConversation(c.req.param('id')) ?? null);
  });

  app.post('/api/conversations/:id/star', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { starred?: boolean };
    await sync.setStarred(c.req.param('id'), body.starred ?? true);
    return c.json(store.getConversation(c.req.param('id')) ?? null);
  });

  // Demo only: wipe local state and re-seed. Used by `pnpm e2e`.
  app.post('/api/demo/reset', async (c) => {
    if (!config.demo) return c.json({ error: 'not in demo mode' }, 403);
    for (const acc of sync.listAccounts()) store.deleteAccountData(acc.id);
    await sync.syncAll();
    return c.json({ ok: true, counts: store.counts() });
  });

  app.post('/api/sync', async (c) => {
    const account = c.req.query('account');
    if (account) await sync.syncAccount(account);
    else await sync.syncAll();
    return c.json({ ok: true });
  });

  return app;
}
