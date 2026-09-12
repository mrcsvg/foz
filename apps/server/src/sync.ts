import { EventEmitter } from 'node:events';
import type { Account, Conversation, FozEvent, Message } from '@foz/core';
import type { Store } from './store.js';
import type { ProviderAdapter, ProviderContext } from './providers/types.js';

/**
 * The sync engine owns every adapter: it boots them, polls them, persists
 * what they return and emits FozEvents that the WebSocket layer forwards
 * to the UI. Adapters never touch the store directly.
 */
export class SyncEngine extends EventEmitter {
  private adapters = new Map<string, ProviderAdapter>();
  private timer?: NodeJS.Timeout;
  private syncing = new Set<string>();
  private accounts = new Map<string, Account>();

  constructor(private store: Store, private pollIntervalMs: number, private log: (m: string) => void = () => {}) {
    super();
  }

  emitEvent(e: FozEvent) {
    this.emit('event', e);
  }

  listAccounts(): Account[] {
    return [...this.accounts.values()];
  }

  adapterFor(accountId: string): ProviderAdapter | undefined {
    return this.adapters.get(accountId);
  }

  async register(adapter: ProviderAdapter) {
    const { account } = adapter;
    this.adapters.set(account.id, adapter);
    this.accounts.set(account.id, { ...account, status: 'connecting' });
    const ctx: ProviderContext = {
      onMessage: (conversation, message) => this.ingestMessage(conversation, message),
      onConversation: (conversation) => this.ingestConversation(conversation),
      onAccount: (acc) => this.updateAccount(acc),
      log: (m) => this.log(`[${account.id}] ${m}`),
    };
    try {
      await adapter.start(ctx);
      this.updateAccount({ ...account, status: 'connected' });
    } catch (err) {
      this.updateAccount({ ...account, status: 'error', error: String((err as Error).message ?? err) });
      this.log(`[${account.id}] failed to start: ${String(err)}`);
    }
  }

  async unregister(accountId: string) {
    const a = this.adapters.get(accountId);
    if (!a) return;
    await a.stop();
    this.adapters.delete(accountId);
    this.accounts.delete(accountId);
  }

  updateAccount(account: Account) {
    this.accounts.set(account.id, account);
    this.emitEvent({ type: 'account.updated', account });
  }

  start() {
    void this.syncAll();
    this.timer = setInterval(() => void this.syncAll(), this.pollIntervalMs);
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    await Promise.all([...this.adapters.values()].map((a) => a.stop()));
  }

  async syncAll() {
    await Promise.all([...this.adapters.keys()].map((id) => this.syncAccount(id)));
  }

  async syncAccount(accountId: string) {
    const adapter = this.adapters.get(accountId);
    if (!adapter || this.syncing.has(accountId)) return;
    this.syncing.add(accountId);
    this.emitEvent({ type: 'sync.status', accountId, syncing: true });
    try {
      const conversations = await adapter.listConversations();
      for (const conv of conversations) {
        const existing = this.store.getConversation(conv.id);
        // Only pull messages when something changed or we never synced it.
        const since = this.store.lastMessageTs(conv.id);
        const changed = !existing || conv.lastMessageAt > since;
        const merged = this.ingestConversation({
          ...conv,
          // Preserve user-driven flags for providers without server-side state.
          archived: adapter.setArchived ? conv.archived : (existing?.archived ?? conv.archived),
          starred: adapter.setStarred ? conv.starred : (existing?.starred ?? conv.starred),
          unreadCount: existing && !adapter.markRead ? Math.min(existing.unreadCount, conv.unreadCount) : conv.unreadCount,
        }, !changed);
        if (changed) {
          const msgs = await adapter.fetchMessages(merged, since);
          // First sync of a conversation is silent; later polls notify and
          // bump unread unless the provider reports unread itself.
          const notify = Boolean(existing);
          for (const m of msgs) this.ingestMessage(merged, m, { notify, bumpUnread: notify && !adapter.tracksUnread });
          if (msgs.length) this.emitEvent({ type: 'conversation.upserted', conversation: this.store.getConversation(merged.id)! });
        }
      }
      const acc = this.accounts.get(accountId);
      if (acc && acc.status !== 'connected') this.updateAccount({ ...acc, status: 'connected', error: undefined });
    } catch (err) {
      const acc = this.accounts.get(accountId);
      if (acc) this.updateAccount({ ...acc, status: 'error', error: String((err as Error).message ?? err) });
      this.log(`[${accountId}] sync failed: ${String(err)}`);
    } finally {
      this.syncing.delete(accountId);
      this.emitEvent({ type: 'sync.status', accountId, syncing: false });
    }
  }

  ingestConversation(conversation: Conversation, quiet = false): Conversation {
    const merged = this.store.upsertConversation(conversation);
    if (!quiet) this.emitEvent({ type: 'conversation.upserted', conversation: merged });
    return merged;
  }

  ingestMessage(conversation: Conversation, message: Message, opts: { notify?: boolean; bumpUnread?: boolean } = { notify: true, bumpUnread: true }) {
    const existing = this.store.getConversation(conversation.id);
    const isNew = this.store.upsertMessage(message);
    const base = existing ?? conversation;
    const bump = isNew && !message.isMine && (opts.bumpUnread ?? true);
    const conv = this.store.upsertConversation({
      ...base,
      snippet: message.ts >= base.lastMessageAt ? firstLine(message.text) : base.snippet,
      lastMessageAt: Math.max(base.lastMessageAt, message.ts),
      unreadCount: bump ? base.unreadCount + 1 : base.unreadCount,
      // A fresh incoming message resurfaces an archived conversation, like Gmail.
      archived: isNew && !message.isMine && (opts.notify ?? true) ? false : base.archived,
    });
    if (isNew && (opts.notify ?? true)) {
      this.emitEvent({ type: 'message.new', message, conversation: conv });
    } else if (!isNew) {
      this.emitEvent({ type: 'message.updated', message });
    }
    return conv;
  }

  // ── user actions ───────────────────────────────────────────────

  async send(conversationId: string, text: string): Promise<Message> {
    const conv = this.store.getConversation(conversationId);
    if (!conv) throw new Error('conversation not found');
    const adapter = this.adapters.get(conv.accountId);
    if (!adapter) throw new Error('account not connected');
    const message = await adapter.send(conv, text);
    this.store.upsertMessage(message);
    const updated = this.store.upsertConversation({ ...conv, snippet: firstLine(text), lastMessageAt: message.ts, unreadCount: 0 });
    this.emitEvent({ type: 'message.new', message, conversation: updated });
    return message;
  }

  async markRead(conversationId: string, read = true) {
    const conv = this.store.getConversation(conversationId);
    if (!conv) return;
    const next = this.store.setConversationFlags(conversationId, { unreadCount: read ? 0 : Math.max(1, conv.unreadCount) })!;
    this.emitEvent({ type: 'conversation.upserted', conversation: next });
    if (read) await this.adapters.get(conv.accountId)?.markRead?.(conv).catch((e) => this.log(`markRead failed: ${e}`));
  }

  async setArchived(conversationId: string, archived: boolean) {
    const conv = this.store.getConversation(conversationId);
    if (!conv) return;
    const next = this.store.setConversationFlags(conversationId, { archived })!;
    this.emitEvent({ type: 'conversation.upserted', conversation: next });
    await this.adapters.get(conv.accountId)?.setArchived?.(conv, archived).catch((e) => this.log(`archive failed: ${e}`));
  }

  async setStarred(conversationId: string, starred: boolean) {
    const conv = this.store.getConversation(conversationId);
    if (!conv) return;
    const next = this.store.setConversationFlags(conversationId, { starred })!;
    this.emitEvent({ type: 'conversation.upserted', conversation: next });
    await this.adapters.get(conv.accountId)?.setStarred?.(conv, starred).catch((e) => this.log(`star failed: ${e}`));
  }
}

function firstLine(s: string): string {
  return s.split('\n').find((l) => l.trim())?.trim().slice(0, 140) ?? '';
}
