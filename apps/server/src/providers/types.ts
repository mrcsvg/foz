import type { Account, Conversation, Message } from '@foz/core';

/**
 * A provider adapter turns one external account into Foz conversations and
 * messages. Adapters are deliberately dumb: they fetch and send; the sync
 * engine (sync.ts) owns persistence, diffing and event fan-out.
 *
 * To add a provider: implement this interface, register it in providers/index.ts.
 */
export interface ProviderContext {
  /** Push a message that arrived outside of a poll (websocket, simulation…). */
  onMessage(conversation: Conversation, message: Message): void;
  onConversation(conversation: Conversation): void;
  onAccount(account: Account): void;
  log(msg: string): void;
}

export interface ProviderAdapter {
  readonly account: Account;
  /** True when the provider itself reports unread counts (Gmail). Otherwise Foz counts locally. */
  readonly tracksUnread?: boolean;
  start(ctx: ProviderContext): Promise<void>;
  stop(): Promise<void>;
  /** Full or incremental list of conversations, newest first. */
  listConversations(): Promise<Conversation[]>;
  /** Messages newer than `sinceTs` (ms). Return in ascending order. */
  fetchMessages(conversation: Conversation, sinceTs: number): Promise<Message[]>;
  send(conversation: Conversation, text: string): Promise<Message>;
  markRead?(conversation: Conversation): Promise<void>;
  setArchived?(conversation: Conversation, archived: boolean): Promise<void>;
  setStarred?(conversation: Conversation, starred: boolean): Promise<void>;
}

export function convId(accountId: string, externalId: string): string {
  return `${accountId}:${externalId}`;
}

export function msgId(conversationId: string, externalId: string): string {
  return `${conversationId}:${externalId}`;
}
