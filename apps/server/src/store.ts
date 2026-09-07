import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { Account, Conversation, ConversationFilter, Message } from '@foz/core';

/**
 * SQLite-backed store. One file, three tables, no ORM.
 * Accounts are held in memory (they come from config) but their status is
 * persisted so the UI can show last-known state on boot.
 */
export class Store {
  private db: Database.Database;

  constructor(file: string) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        external_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        participants TEXT NOT NULL,
        snippet TEXT NOT NULL DEFAULT '',
        last_message_at INTEGER NOT NULL DEFAULT 0,
        unread_count INTEGER NOT NULL DEFAULT 0,
        archived INTEGER NOT NULL DEFAULT 0,
        starred INTEGER NOT NULL DEFAULT 0,
        url TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_conv_last ON conversations(last_message_at DESC);
      CREATE INDEX IF NOT EXISTS idx_conv_account ON conversations(account_id);

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        external_id TEXT NOT NULL,
        sender TEXT NOT NULL,
        text TEXT NOT NULL,
        ts INTEGER NOT NULL,
        is_mine INTEGER NOT NULL DEFAULT 0,
        attachments TEXT NOT NULL DEFAULT '[]',
        subject TEXT,
        status TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, ts);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_msg_ext ON messages(conversation_id, external_id);

      CREATE TABLE IF NOT EXISTS sync_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  // ── conversations ──────────────────────────────────────────────

  upsertConversation(c: Conversation): Conversation {
    const existing = this.getConversation(c.id);
    const merged: Conversation = existing
      ? {
          ...existing,
          ...c,
          // Local-only flags survive provider re-syncs unless provider says otherwise.
          archived: c.archived ?? existing.archived,
          starred: c.starred ?? existing.starred,
        }
      : c;
    this.db
      .prepare(
        `INSERT INTO conversations (id, account_id, provider, external_id, kind, title, participants, snippet, last_message_at, unread_count, archived, starred, url)
         VALUES (@id, @accountId, @provider, @externalId, @kind, @title, @participants, @snippet, @lastMessageAt, @unreadCount, @archived, @starred, @url)
         ON CONFLICT(id) DO UPDATE SET
           title=excluded.title, participants=excluded.participants, snippet=excluded.snippet,
           last_message_at=excluded.last_message_at, unread_count=excluded.unread_count,
           archived=excluded.archived, starred=excluded.starred, url=excluded.url, kind=excluded.kind`,
      )
      .run({
        ...merged,
        participants: JSON.stringify(merged.participants),
        archived: merged.archived ? 1 : 0,
        starred: merged.starred ? 1 : 0,
        url: merged.url ?? null,
      });
    return merged;
  }

  getConversation(id: string): Conversation | undefined {
    const row = this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as Row | undefined;
    return row ? rowToConversation(row) : undefined;
  }

  listConversations(filter: ConversationFilter = {}): Conversation[] {
    const where: string[] = [];
    const params: Record<string, unknown> = {};
    switch (filter.view ?? 'inbox') {
      case 'inbox':
        where.push('archived = 0');
        break;
      case 'unread':
        where.push('archived = 0 AND unread_count > 0');
        break;
      case 'starred':
        where.push('starred = 1');
        break;
      case 'archived':
        where.push('archived = 1');
        break;
      case 'all':
        break;
    }
    if (filter.provider) {
      where.push('provider = @provider');
      params.provider = filter.provider;
    }
    if (filter.accountId) {
      where.push('account_id = @accountId');
      params.accountId = filter.accountId;
    }
    if (filter.q) {
      where.push(`(title LIKE @q OR snippet LIKE @q OR participants LIKE @q OR id IN (SELECT conversation_id FROM messages WHERE text LIKE @q))`);
      params.q = `%${filter.q}%`;
    }
    const sql = `SELECT * FROM conversations ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY last_message_at DESC LIMIT @limit`;
    params.limit = filter.limit ?? 500;
    return (this.db.prepare(sql).all(params) as Row[]).map(rowToConversation);
  }

  setConversationFlags(id: string, flags: Partial<Pick<Conversation, 'archived' | 'starred' | 'unreadCount'>>): Conversation | undefined {
    const c = this.getConversation(id);
    if (!c) return undefined;
    const next = { ...c, ...flags };
    this.db
      .prepare('UPDATE conversations SET archived = ?, starred = ?, unread_count = ? WHERE id = ?')
      .run(next.archived ? 1 : 0, next.starred ? 1 : 0, next.unreadCount, id);
    return next;
  }

  removeConversation(id: string) {
    this.db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(id);
    this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
  }

  deleteAccountData(accountId: string) {
    const ids = (this.db.prepare('SELECT id FROM conversations WHERE account_id = ?').all(accountId) as { id: string }[]).map((r) => r.id);
    const tx = this.db.transaction(() => ids.forEach((id) => this.removeConversation(id)));
    tx();
  }

  // ── messages ───────────────────────────────────────────────────

  /** Insert or update a message. Returns true when the message is new. */
  upsertMessage(m: Message): boolean {
    const existed = this.db
      .prepare('SELECT id FROM messages WHERE conversation_id = ? AND external_id = ?')
      .get(m.conversationId, m.externalId) as { id: string } | undefined;
    this.db
      .prepare(
        `INSERT INTO messages (id, conversation_id, external_id, sender, text, ts, is_mine, attachments, subject, status)
         VALUES (@id, @conversationId, @externalId, @sender, @text, @ts, @isMine, @attachments, @subject, @status)
         ON CONFLICT(conversation_id, external_id) DO UPDATE SET
           text=excluded.text, ts=excluded.ts, attachments=excluded.attachments, status=excluded.status, sender=excluded.sender`,
      )
      .run({
        id: existed?.id ?? m.id,
        conversationId: m.conversationId,
        externalId: m.externalId,
        sender: JSON.stringify(m.from),
        text: m.text,
        ts: m.ts,
        isMine: m.isMine ? 1 : 0,
        attachments: JSON.stringify(m.attachments ?? []),
        subject: m.subject ?? null,
        status: m.status ?? null,
      });
    return !existed;
  }

  getMessage(id: string): Message | undefined {
    const row = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as MsgRow | undefined;
    return row ? rowToMessage(row) : undefined;
  }

  deleteMessage(id: string) {
    this.db.prepare('DELETE FROM messages WHERE id = ?').run(id);
  }

  listMessages(conversationId: string, limit = 200): Message[] {
    const rows = this.db
      .prepare('SELECT * FROM (SELECT * FROM messages WHERE conversation_id = ? ORDER BY ts DESC LIMIT ?) ORDER BY ts ASC')
      .all(conversationId, limit) as MsgRow[];
    return rows.map(rowToMessage);
  }

  lastMessageTs(conversationId: string): number {
    const r = this.db.prepare('SELECT MAX(ts) AS ts FROM messages WHERE conversation_id = ?').get(conversationId) as { ts: number | null };
    return r.ts ?? 0;
  }

  // ── sync state ─────────────────────────────────────────────────

  getState(key: string): string | undefined {
    const r = this.db.prepare('SELECT value FROM sync_state WHERE key = ?').get(key) as { value: string } | undefined;
    return r?.value;
  }

  setState(key: string, value: string) {
    this.db.prepare('INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
  }

  counts(): { inbox: number; unread: number; starred: number; archived: number; byProvider: Record<string, number> } {
    const one = (sql: string) => (this.db.prepare(sql).get() as { n: number }).n;
    const byProvider: Record<string, number> = {};
    for (const r of this.db.prepare('SELECT provider, SUM(unread_count) AS n FROM conversations WHERE archived = 0 GROUP BY provider').all() as { provider: string; n: number }[]) {
      byProvider[r.provider] = r.n;
    }
    return {
      inbox: one('SELECT COUNT(*) AS n FROM conversations WHERE archived = 0'),
      unread: one('SELECT COUNT(*) AS n FROM conversations WHERE archived = 0 AND unread_count > 0'),
      starred: one('SELECT COUNT(*) AS n FROM conversations WHERE starred = 1'),
      archived: one('SELECT COUNT(*) AS n FROM conversations WHERE archived = 1'),
      byProvider,
    };
  }

  close() {
    this.db.close();
  }
}

interface Row {
  id: string;
  account_id: string;
  provider: string;
  external_id: string;
  kind: string;
  title: string;
  participants: string;
  snippet: string;
  last_message_at: number;
  unread_count: number;
  archived: number;
  starred: number;
  url: string | null;
}

interface MsgRow {
  id: string;
  conversation_id: string;
  external_id: string;
  sender: string;
  text: string;
  ts: number;
  is_mine: number;
  attachments: string;
  subject: string | null;
  status: string | null;
}

function rowToConversation(r: Row): Conversation {
  return {
    id: r.id,
    accountId: r.account_id,
    provider: r.provider as Conversation['provider'],
    externalId: r.external_id,
    kind: r.kind as Conversation['kind'],
    title: r.title,
    participants: JSON.parse(r.participants),
    snippet: r.snippet,
    lastMessageAt: r.last_message_at,
    unreadCount: r.unread_count,
    archived: r.archived === 1,
    starred: r.starred === 1,
    url: r.url ?? undefined,
  };
}

function rowToMessage(r: MsgRow): Message {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    externalId: r.external_id,
    from: JSON.parse(r.sender),
    text: r.text,
    ts: r.ts,
    isMine: r.is_mine === 1,
    attachments: JSON.parse(r.attachments),
    subject: r.subject ?? undefined,
    status: (r.status as Message['status']) ?? undefined,
  };
}

export type { Account };
