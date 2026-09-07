/**
 * Foz domain model.
 *
 * Every provider (Slack, Gmail, WhatsApp, ...) is normalised into these
 * three shapes: an Account owns Conversations, a Conversation owns Messages.
 * The UI never sees provider-specific payloads.
 */

export type ProviderId = 'slack' | 'gmail' | 'whatsapp' | 'telegram' | 'discord' | 'demo';

export type ConversationKind = 'dm' | 'group' | 'channel' | 'thread';

export interface Participant {
  id: string;
  name: string;
  handle?: string;
  avatarUrl?: string;
}

export interface Account {
  id: string;
  provider: ProviderId;
  /** Human label, e.g. "Slack · acme" or "Gmail · marcus@…" */
  label: string;
  /** Provider that actually produced this account's data (demo accounts mimic others). */
  via: ProviderId;
  me?: Participant;
  status: 'connected' | 'connecting' | 'error' | 'disabled';
  error?: string;
}

export interface Conversation {
  id: string;
  accountId: string;
  provider: ProviderId;
  externalId: string;
  kind: ConversationKind;
  title: string;
  participants: Participant[];
  snippet: string;
  lastMessageAt: number;
  unreadCount: number;
  archived: boolean;
  starred: boolean;
  /** Provider-specific link to open the native client if ever needed. */
  url?: string;
}

export interface Attachment {
  id: string;
  name: string;
  mimeType?: string;
  size?: number;
  url?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  externalId: string;
  from: Participant;
  text: string;
  ts: number;
  isMine: boolean;
  attachments: Attachment[];
  /** For email: subject line when it differs from the thread title. */
  subject?: string;
  /** Delivery state for messages sent from Foz. */
  status?: 'sending' | 'sent' | 'failed';
}

export type ConversationFilter = {
  view?: 'inbox' | 'unread' | 'starred' | 'archived' | 'all';
  provider?: ProviderId;
  accountId?: string;
  q?: string;
  limit?: number;
};

/** Events pushed from server to UI over WebSocket. */
export type FozEvent =
  | { type: 'hello'; accounts: Account[] }
  | { type: 'account.updated'; account: Account }
  | { type: 'conversation.upserted'; conversation: Conversation }
  | { type: 'conversation.removed'; conversationId: string }
  | { type: 'message.new'; message: Message; conversation: Conversation }
  | { type: 'message.updated'; message: Message }
  | { type: 'sync.status'; accountId: string; syncing: boolean };

export interface SendMessageInput {
  text: string;
}

export interface AppState {
  accounts: Account[];
  version: string;
}
