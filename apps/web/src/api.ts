import type { Account, Conversation, ConversationFilter, FozEvent, KeymapConfig, Message, Mode } from '@foz/core';

export interface StatePayload {
  version: string;
  accounts: Account[];
  keymap: KeymapConfig & { unbind: Array<{ mode: Mode; keys: string }> };
  counts: Counts;
  demo: boolean;
}

export interface Counts {
  inbox: number;
  unread: number;
  starred: number;
  archived: number;
  byProvider: Record<string, number>;
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { 'content-type': 'application/json' }, ...init });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export const api = {
  state: () => req<StatePayload>('/api/state'),
  counts: () => req<Counts>('/api/counts'),
  conversations: (f: ConversationFilter) => {
    const p = new URLSearchParams();
    if (f.view) p.set('view', f.view);
    if (f.provider) p.set('provider', f.provider);
    if (f.accountId) p.set('account', f.accountId);
    if (f.q) p.set('q', f.q);
    return req<Conversation[]>(`/api/conversations?${p}`);
  },
  messages: (id: string) => req<Message[]>(`/api/conversations/${encodeURIComponent(id)}/messages`),
  send: (id: string, text: string) => req<Message>(`/api/conversations/${encodeURIComponent(id)}/messages`, { method: 'POST', body: JSON.stringify({ text }) }),
  read: (id: string, read: boolean) => req<Conversation>(`/api/conversations/${encodeURIComponent(id)}/read`, { method: 'POST', body: JSON.stringify({ read }) }),
  archive: (id: string, archived: boolean) => req<Conversation>(`/api/conversations/${encodeURIComponent(id)}/archive`, { method: 'POST', body: JSON.stringify({ archived }) }),
  star: (id: string, starred: boolean) => req<Conversation>(`/api/conversations/${encodeURIComponent(id)}/star`, { method: 'POST', body: JSON.stringify({ starred }) }),
  sync: (account?: string) => req<{ ok: boolean }>(`/api/sync${account ? `?account=${encodeURIComponent(account)}` : ''}`, { method: 'POST' }),
};

/** Auto-reconnecting WebSocket feed of FozEvents. */
export function connectEvents(onEvent: (e: FozEvent) => void, onStatus: (connected: boolean) => void): () => void {
  let ws: WebSocket | undefined;
  let closed = false;
  let retry = 1000;
  const open = () => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => {
      retry = 1000;
      onStatus(true);
    };
    ws.onmessage = (ev) => {
      try {
        onEvent(JSON.parse(ev.data as string) as FozEvent);
      } catch {
        // ignore malformed frames
      }
    };
    ws.onclose = () => {
      onStatus(false);
      if (!closed) {
        setTimeout(open, retry);
        retry = Math.min(retry * 2, 15000);
      }
    };
    ws.onerror = () => ws?.close();
  };
  open();
  return () => {
    closed = true;
    ws?.close();
  };
}
