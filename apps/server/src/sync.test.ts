import { describe, expect, it } from 'vitest';
import type { FozEvent } from '@foz/core';
import { Store } from './store.js';
import { SyncEngine } from './sync.js';
import { DemoAdapter, demoAccounts } from './providers/demo.js';
import { extractBody, htmlToText, parseAddress } from './providers/gmail.js';

async function boot() {
  const store = new Store(':memory:');
  const sync = new SyncEngine(store, 60_000);
  const events: FozEvent[] = [];
  sync.on('event', (e: FozEvent) => events.push(e));
  for (const acc of demoAccounts()) await sync.register(new DemoAdapter(acc, false));
  await sync.syncAll();
  return { store, sync, events };
}

describe('SyncEngine + Store', () => {
  it('seeds demo conversations and messages silently', async () => {
    const { store, events } = await boot();
    const inbox = store.listConversations({ view: 'inbox' });
    expect(inbox.length).toBeGreaterThan(10);
    expect(inbox[0]!.lastMessageAt).toBeGreaterThanOrEqual(inbox[1]!.lastMessageAt);
    expect(store.listMessages(inbox[0]!.id).length).toBeGreaterThan(0);
    expect(events.filter((e) => e.type === 'message.new')).toHaveLength(0);
    expect(store.listConversations({ view: 'archived' }).length).toBeGreaterThan(0);
    expect(store.listConversations({ provider: 'whatsapp' }).every((c) => c.provider === 'whatsapp')).toBe(true);
  });

  it('re-sync is idempotent', async () => {
    const { store, sync } = await boot();
    const before = store.listConversations({ view: 'all' }).length;
    const msgsBefore = store.listMessages(store.listConversations()[0]!.id).length;
    await sync.syncAll();
    expect(store.listConversations({ view: 'all' }).length).toBe(before);
    expect(store.listMessages(store.listConversations()[0]!.id).length).toBe(msgsBefore);
  });

  it('send appends a message, clears unread and emits message.new', async () => {
    const { store, sync, events } = await boot();
    const conv = store.listConversations({ view: 'unread' })[0]!;
    events.length = 0;
    const m = await sync.send(conv.id, 'olá');
    expect(m.isMine).toBe(true);
    const after = store.getConversation(conv.id)!;
    expect(after.unreadCount).toBe(0);
    expect(after.snippet).toBe('olá');
    expect(events.some((e) => e.type === 'message.new')).toBe(true);
  });

  it('flags: archive/star/unread round-trip and survive re-sync', async () => {
    const { store, sync } = await boot();
    const conv = store.listConversations()[0]!;
    await sync.setArchived(conv.id, true);
    await sync.setStarred(conv.id, true);
    await sync.markRead(conv.id, false);
    await sync.syncAll();
    const c = store.getConversation(conv.id)!;
    expect(c.archived).toBe(true);
    expect(c.starred).toBe(true);
    expect(c.unreadCount).toBeGreaterThan(0);
    expect(store.listConversations({ view: 'inbox' }).some((x) => x.id === conv.id)).toBe(false);
  });

  it('incoming message bumps unread, un-archives, emits', async () => {
    const { store, sync, events } = await boot();
    const conv = store.listConversations({ view: 'archived' })[0]!;
    events.length = 0;
    sync.ingestMessage(conv, {
      id: `${conv.id}:x1`, conversationId: conv.id, externalId: 'x1', from: { id: 'z', name: 'Z' },
      text: 'ping', ts: Date.now(), isMine: false, attachments: [],
    });
    const c = store.getConversation(conv.id)!;
    expect(c.archived).toBe(false);
    expect(c.unreadCount).toBe(conv.unreadCount + 1);
    expect(c.snippet).toBe('ping');
    expect(events.map((e) => e.type)).toContain('message.new');
  });

  it('search matches titles and message bodies', async () => {
    const { store } = await boot();
    expect(store.listConversations({ view: 'all', q: 'lasanha' })).toHaveLength(0);
    expect(store.listConversations({ view: 'all', q: 'EXPLAIN' }).map((c) => c.title)).toContain('#eng-platform');
    expect(store.listConversations({ view: 'all', q: 'nubank' }).length).toBe(1);
  });
});

describe('gmail helpers', () => {
  it('parses addresses', () => {
    expect(parseAddress('"Luiza Prado" <luiza@acme.com>')).toEqual({ id: 'luiza@acme.com', name: 'Luiza Prado', handle: 'luiza@acme.com' });
    expect(parseAddress('x@y.com')).toEqual({ id: 'x@y.com', name: 'x@y.com', handle: 'x@y.com' });
  });
  it('extracts text/plain over html and lists attachments', () => {
    const b64 = (s: string) => Buffer.from(s).toString('base64url');
    const r = extractBody({
      mimeType: 'multipart/mixed',
      parts: [
        { mimeType: 'text/html', body: { data: b64('<p>Oi <b>x</b></p>') } },
        { mimeType: 'text/plain', body: { data: b64('Oi x\n\nOn Mon, X wrote:\n> quoted') } },
        { filename: 'a.pdf', mimeType: 'application/pdf', body: { attachmentId: 'att1', size: 10 } },
      ],
    });
    expect(r.text).toBe('Oi x');
    expect(r.attachments).toEqual([{ id: 'att1', name: 'a.pdf', mimeType: 'application/pdf', size: 10 }]);
  });
  it('strips html', () => {
    expect(htmlToText('<div>a<br>b</div><p>c &amp; d</p>')).toBe('a\nb\nc & d\n');
  });
});
