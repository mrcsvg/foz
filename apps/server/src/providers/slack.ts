import { WebClient } from '@slack/web-api';
import type { Account, Conversation, Message, Participant } from '@foz/core';
import type { SlackConfig } from '../config.js';
import { convId, msgId, type ProviderAdapter, type ProviderContext } from './types.js';

/**
 * Slack via the Web API with a user token (xoxp-…) so messages are sent as
 * you. Polling only for V0 — no Socket Mode app needed. Latest activity is
 * discovered round-robin (`HISTORY_BUDGET` history calls per poll) to stay
 * well inside rate limits.
 */
const HISTORY_BUDGET = 20;

interface SlackChannel {
  id: string;
  name?: string;
  is_im?: boolean;
  is_mpim?: boolean;
  is_private?: boolean;
  is_archived?: boolean;
  user?: string;
  is_member?: boolean;
}

export class SlackAdapter implements ProviderAdapter {
  readonly account: Account;
  readonly tracksUnread = false;
  private client: WebClient;
  private ctx?: ProviderContext;
  private users = new Map<string, Participant>();
  private myId = '';
  private teamUrl = '';
  private latest = new Map<string, number>();
  private cursor = 0;

  constructor(id: string, private cfg: SlackConfig) {
    this.client = new WebClient(cfg.token);
    this.account = { id, provider: 'slack', via: 'slack', label: cfg.label ?? 'Slack', status: 'connecting' };
  }

  async start(ctx: ProviderContext) {
    this.ctx = ctx;
    const auth = await this.client.auth.test();
    this.myId = auth.user_id as string;
    this.teamUrl = (auth.url as string) ?? '';
    const me = await this.user(this.myId);
    const label = this.cfg.label ?? `Slack · ${auth.team as string}`;
    ctx.onAccount({ ...this.account, label, me, status: 'connected' });
    (this.account as Account).label = label;
    (this.account as Account).me = me;
  }

  async stop() {}

  private async user(id: string): Promise<Participant> {
    const cached = this.users.get(id);
    if (cached) return cached;
    try {
      const res = await this.client.users.info({ user: id });
      const u = res.user!;
      const p: Participant = {
        id,
        name: u.profile?.display_name || u.real_name || u.name || id,
        handle: u.name ? `@${u.name}` : undefined,
        avatarUrl: u.profile?.image_48,
      };
      this.users.set(id, p);
      return p;
    } catch {
      const p = { id, name: id };
      this.users.set(id, p);
      return p;
    }
  }

  async listConversations(): Promise<Conversation[]> {
    const channels: SlackChannel[] = [];
    let cursor: string | undefined;
    do {
      const res = await this.client.users.conversations({
        types: 'public_channel,private_channel,mpim,im',
        exclude_archived: true,
        limit: 200,
        cursor,
      });
      channels.push(...((res.channels as SlackChannel[]) ?? []));
      cursor = res.response_metadata?.next_cursor || undefined;
    } while (cursor);

    // Refresh "latest activity" for a slice of channels each poll.
    const unknown = channels.filter((c) => !this.latest.has(c.id));
    const slice = unknown.length
      ? unknown.slice(0, HISTORY_BUDGET)
      : channels.slice(this.cursor, this.cursor + HISTORY_BUDGET);
    if (!unknown.length) this.cursor = (this.cursor + HISTORY_BUDGET) % Math.max(1, channels.length);
    await Promise.all(
      slice.map(async (c) => {
        try {
          const h = await this.client.conversations.history({ channel: c.id, limit: 1 });
          const ts = h.messages?.[0]?.ts ? Number(h.messages[0].ts) * 1000 : 0;
          this.latest.set(c.id, ts);
        } catch (err) {
          this.ctx?.log(`history ${c.id} failed: ${String(err)}`);
          this.latest.set(c.id, 0);
        }
      }),
    );

    const out: Conversation[] = [];
    for (const c of channels) {
      const last = this.latest.get(c.id) ?? 0;
      if (!last && c.is_im) continue; // never-used DMs are noise
      let title = c.name ? `#${c.name}` : c.id;
      let participants: Participant[] = [];
      let kind: Conversation['kind'] = 'channel';
      if (c.is_im && c.user) {
        const u = await this.user(c.user);
        title = u.name;
        participants = [u];
        kind = 'dm';
      } else if (c.is_mpim) {
        kind = 'group';
        title = (c.name ?? '').replace(/^mpdm-/, '').replace(/--/g, ', ').replace(/-\d+$/, '');
      }
      out.push({
        id: convId(this.account.id, c.id),
        accountId: this.account.id,
        provider: 'slack',
        externalId: c.id,
        kind,
        title,
        participants,
        snippet: '',
        lastMessageAt: last,
        unreadCount: 0,
        archived: false,
        starred: false,
        url: this.teamUrl ? `${this.teamUrl}archives/${c.id}` : undefined,
      });
    }
    return out.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  }

  async fetchMessages(conversation: Conversation, sinceTs: number): Promise<Message[]> {
    const res = await this.client.conversations.history({
      channel: conversation.externalId,
      oldest: sinceTs ? String(sinceTs / 1000) : undefined,
      inclusive: false,
      limit: 100,
    });
    const msgs: Message[] = [];
    for (const m of (res.messages ?? []).reverse()) {
      if (!m.ts) continue;
      const from: Participant = m.user
        ? await this.user(m.user)
        : { id: m.bot_id ?? 'bot', name: (m as { username?: string }).username ?? 'bot' };
      msgs.push({
        id: msgId(conversation.id, m.ts),
        conversationId: conversation.id,
        externalId: m.ts,
        from,
        text: await this.render(m.text ?? ''),
        ts: Number(m.ts) * 1000,
        isMine: m.user === this.myId,
        attachments: ((m as { files?: Array<{ id: string; name?: string; mimetype?: string; size?: number; url_private?: string }> }).files ?? []).map((f) => ({
          id: f.id,
          name: f.name ?? f.id,
          mimeType: f.mimetype,
          size: f.size,
          url: f.url_private,
        })),
      });
    }
    return msgs;
  }

  async send(conversation: Conversation, text: string): Promise<Message> {
    const res = await this.client.chat.postMessage({ channel: conversation.externalId, text });
    const ts = (res.ts as string) ?? String(Date.now() / 1000);
    this.latest.set(conversation.externalId, Number(ts) * 1000);
    return {
      id: msgId(conversation.id, ts),
      conversationId: conversation.id,
      externalId: ts,
      from: this.account.me ?? { id: this.myId, name: 'me' },
      text,
      ts: Number(ts) * 1000,
      isMine: true,
      attachments: [],
      status: 'sent',
    };
  }

  async markRead(conversation: Conversation) {
    const last = this.latest.get(conversation.externalId);
    if (!last) return;
    await this.client.conversations.mark({ channel: conversation.externalId, ts: String(last / 1000) }).catch(() => undefined);
  }

  /** Turn Slack mrkdwn tokens (<@U…>, <#C…|name>, <url|label>) into plain text. */
  private async render(text: string): Promise<string> {
    const mentions = [...text.matchAll(/<@([A-Z0-9]+)>/g)].map((m) => m[1]!);
    for (const id of new Set(mentions)) {
      const u = await this.user(id);
      text = text.replaceAll(`<@${id}>`, `@${u.name}`);
    }
    return text
      .replace(/<#[A-Z0-9]+\|([^>]+)>/g, '#$1')
      .replace(/<([^|>]+)\|([^>]+)>/g, '$2 ($1)')
      .replace(/<([^>]+)>/g, '$1')
      .replace(/&gt;/g, '>')
      .replace(/&lt;/g, '<')
      .replace(/&amp;/g, '&');
  }
}
