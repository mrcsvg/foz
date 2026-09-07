import { google, type gmail_v1 } from 'googleapis';
import type { Account, Attachment, Conversation, Message, Participant } from '@foz/core';
import type { GmailConfig } from '../config.js';
import { convId, msgId, type ProviderAdapter, type ProviderContext } from './types.js';

/**
 * Gmail via the REST API and an OAuth refresh token (get one with
 * `pnpm foz auth gmail`). Threads become conversations; the INBOX, UNREAD
 * and STARRED labels map to archived / unread / starred.
 */
const LIST_QUERY = 'in:inbox OR is:starred OR newer_than:3d';
const MAX_THREADS = 60;

export class GmailAdapter implements ProviderAdapter {
  readonly account: Account;
  readonly tracksUnread = true;
  private gmail: gmail_v1.Gmail;
  private ctx?: ProviderContext;
  private email = '';
  private cache = new Map<string, { historyId: string; conversation: Conversation }>();

  constructor(id: string, private cfg: GmailConfig) {
    const auth = new google.auth.OAuth2(cfg.clientId, cfg.clientSecret);
    auth.setCredentials({ refresh_token: cfg.refreshToken });
    this.gmail = google.gmail({ version: 'v1', auth });
    this.account = { id, provider: 'gmail', via: 'gmail', label: cfg.label ?? 'Gmail', status: 'connecting' };
  }

  async start(ctx: ProviderContext) {
    this.ctx = ctx;
    const profile = await this.gmail.users.getProfile({ userId: 'me' });
    this.email = profile.data.emailAddress ?? '';
    const label = this.cfg.label ?? `Gmail · ${this.email}`;
    const me: Participant = { id: this.email, name: 'me', handle: this.email };
    (this.account as Account).label = label;
    (this.account as Account).me = me;
    ctx.onAccount({ ...this.account, label, me, status: 'connected' });
  }

  async stop() {}

  async listConversations(): Promise<Conversation[]> {
    const list = await this.gmail.users.threads.list({ userId: 'me', q: LIST_QUERY, maxResults: MAX_THREADS });
    const threads = list.data.threads ?? [];
    const out: Conversation[] = [];
    for (const t of threads) {
      if (!t.id) continue;
      const cached = this.cache.get(t.id);
      if (cached && cached.historyId === t.historyId) {
        out.push(cached.conversation);
        continue;
      }
      try {
        const full = await this.gmail.users.threads.get({
          userId: 'me',
          id: t.id,
          format: 'metadata',
          metadataHeaders: ['Subject', 'From', 'To', 'Date'],
        });
        const conv = this.toConversation(full.data, t.snippet ?? '');
        this.cache.set(t.id, { historyId: t.historyId ?? '', conversation: conv });
        out.push(conv);
      } catch (err) {
        this.ctx?.log(`thread ${t.id} failed: ${String(err)}`);
      }
    }
    return out.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  }

  private toConversation(thread: gmail_v1.Schema$Thread, snippet: string): Conversation {
    const msgs = thread.messages ?? [];
    const first = msgs[0];
    const subject = header(first, 'Subject') || '(sem assunto)';
    const participants = new Map<string, Participant>();
    let lastAt = 0;
    let unread = 0;
    let starred = false;
    let inInbox = false;
    for (const m of msgs) {
      const from = parseAddress(header(m, 'From'));
      if (from && from.id !== this.email) participants.set(from.id, from);
      lastAt = Math.max(lastAt, Number(m.internalDate ?? 0));
      const labels = m.labelIds ?? [];
      if (labels.includes('UNREAD')) unread += 1;
      if (labels.includes('STARRED')) starred = true;
      if (labels.includes('INBOX')) inInbox = true;
    }
    return {
      id: convId(this.account.id, thread.id!),
      accountId: this.account.id,
      provider: 'gmail',
      externalId: thread.id!,
      kind: 'thread',
      title: subject.replace(/^(re|fwd?|enc):\s*/i, ''),
      participants: [...participants.values()],
      snippet: decodeEntities(snippet),
      lastMessageAt: lastAt,
      unreadCount: unread,
      archived: !inInbox,
      starred,
      url: `https://mail.google.com/mail/u/0/#inbox/${thread.id}`,
    };
  }

  async fetchMessages(conversation: Conversation, sinceTs: number): Promise<Message[]> {
    const full = await this.gmail.users.threads.get({ userId: 'me', id: conversation.externalId, format: 'full' });
    const out: Message[] = [];
    for (const m of full.data.messages ?? []) {
      const ts = Number(m.internalDate ?? 0);
      if (ts <= sinceTs || !m.id) continue;
      const from = parseAddress(header(m, 'From')) ?? { id: 'unknown', name: 'unknown' };
      const { text, attachments } = extractBody(m.payload);
      out.push({
        id: msgId(conversation.id, m.id),
        conversationId: conversation.id,
        externalId: m.id,
        from,
        text: text || m.snippet || '',
        ts,
        isMine: from.id === this.email,
        attachments,
        subject: header(m, 'Subject') || undefined,
      });
    }
    return out.sort((a, b) => a.ts - b.ts);
  }

  async send(conversation: Conversation, text: string): Promise<Message> {
    const thread = await this.gmail.users.threads.get({ userId: 'me', id: conversation.externalId, format: 'metadata',
      metadataHeaders: ['Subject', 'From', 'To', 'Cc', 'Message-ID', 'References', 'Reply-To'] });
    const msgs = thread.data.messages ?? [];
    const last = [...msgs].reverse().find((m) => parseAddress(header(m, 'From'))?.id !== this.email) ?? msgs[msgs.length - 1];
    if (!last) throw new Error('empty thread');
    const to = header(last, 'Reply-To') || header(last, 'From');
    const subjectRaw = header(last, 'Subject');
    const subject = /^re:/i.test(subjectRaw) ? subjectRaw : `Re: ${subjectRaw}`;
    const messageId = header(last, 'Message-ID');
    const references = [header(last, 'References'), messageId].filter(Boolean).join(' ');
    const raw = [
      `From: ${this.email}`,
      `To: ${to}`,
      `Subject: ${encodeHeader(subject)}`,
      messageId ? `In-Reply-To: ${messageId}` : '',
      references ? `References: ${references}` : '',
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(text, 'utf8').toString('base64'),
    ]
      .filter((l) => l !== '')
      .join('\r\n');
    const res = await this.gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: Buffer.from(raw).toString('base64url'), threadId: conversation.externalId },
    });
    const id = res.data.id ?? `sent-${Date.now()}`;
    this.cache.delete(conversation.externalId);
    return {
      id: msgId(conversation.id, id),
      conversationId: conversation.id,
      externalId: id,
      from: this.account.me ?? { id: this.email, name: 'me' },
      text,
      ts: Date.now(),
      isMine: true,
      attachments: [],
      subject,
      status: 'sent',
    };
  }

  async markRead(conversation: Conversation) {
    await this.modify(conversation, { removeLabelIds: ['UNREAD'] });
  }

  async setArchived(conversation: Conversation, archived: boolean) {
    await this.modify(conversation, archived ? { removeLabelIds: ['INBOX'] } : { addLabelIds: ['INBOX'] });
  }

  async setStarred(conversation: Conversation, starred: boolean) {
    await this.modify(conversation, starred ? { addLabelIds: ['STARRED'] } : { removeLabelIds: ['STARRED'] });
  }

  private async modify(conversation: Conversation, body: gmail_v1.Schema$ModifyThreadRequest) {
    await this.gmail.users.threads.modify({ userId: 'me', id: conversation.externalId, requestBody: body });
    this.cache.delete(conversation.externalId);
  }
}

// ── helpers ──────────────────────────────────────────────────────

function header(m: gmail_v1.Schema$Message | undefined, name: string): string {
  return m?.payload?.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
}

export function parseAddress(raw: string): Participant | undefined {
  if (!raw) return undefined;
  const m = raw.match(/^\s*(?:"?([^"<]*)"?\s*)?<([^>]+)>\s*$/);
  if (m) {
    const email = m[2]!.trim().toLowerCase();
    return { id: email, name: (m[1] ?? '').trim() || email, handle: email };
  }
  const email = raw.trim().toLowerCase();
  return { id: email, name: email, handle: email };
}

export function extractBody(payload: gmail_v1.Schema$MessagePart | undefined): { text: string; attachments: Attachment[] } {
  const attachments: Attachment[] = [];
  let plain = '';
  let html = '';
  const walk = (p: gmail_v1.Schema$MessagePart | undefined) => {
    if (!p) return;
    if (p.filename && p.body?.attachmentId) {
      attachments.push({ id: p.body.attachmentId, name: p.filename, mimeType: p.mimeType ?? undefined, size: p.body.size ?? undefined });
    } else if (p.mimeType === 'text/plain' && p.body?.data && !plain) {
      plain = Buffer.from(p.body.data, 'base64url').toString('utf8');
    } else if (p.mimeType === 'text/html' && p.body?.data && !html) {
      html = Buffer.from(p.body.data, 'base64url').toString('utf8');
    }
    p.parts?.forEach(walk);
  };
  walk(payload);
  const text = plain ? stripQuoted(plain) : htmlToText(html);
  return { text: text.trim(), attachments };
}

function stripQuoted(text: string): string {
  // Drop trailing "On … wrote:" quotes and lines starting with ">".
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const cut = lines.findIndex((l, i) => /^(On .+ wrote:|Em .+ escreveu:)\s*$/.test(l.trim()) || (l.startsWith('>') && i > 0 && lines[i - 1]!.trim() === ''));
  return (cut > 0 ? lines.slice(0, cut) : lines).join('\n').trimEnd();
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n'),
  );
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function encodeHeader(s: string): string {
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;
}
