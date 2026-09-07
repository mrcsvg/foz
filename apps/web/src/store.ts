import { create } from 'zustand';
import type { Account, Conversation, ConversationFilter, FozEvent, Message, Mode, ProviderId } from '@foz/core';
import { api, type Counts, type StatePayload } from './api';

export type Pane = 'sidebar' | 'list' | 'thread';
export type View = NonNullable<ConversationFilter['view']>;

export interface Toast {
  text: string;
  kind: 'info' | 'error' | 'ok';
  at: number;
}

export interface FozState {
  ready: boolean;
  connected: boolean;
  demo: boolean;
  version: string;
  accounts: Account[];
  counts: Counts;
  keymap?: StatePayload['keymap'];

  mode: Mode;
  focus: Pane;
  sidebarVisible: boolean;
  view: View;
  provider?: ProviderId;
  query: string;

  conversations: Conversation[];
  cursor: number;
  selected: Set<string>;
  openId?: string;
  messages: Record<string, Message[]>;
  msgCursor: number;
  drafts: Record<string, string>;
  sending: boolean;

  cmdline: { kind: 'command' | 'search'; text: string; history: string[]; hIndex: number };
  finder: { open: boolean; query: string; index: number; purpose: 'open' | 'compose' };
  helpOpen: boolean;
  pendingKeys: string[];
  count: number | null;
  toast?: Toast;
  syncing: Set<string>;

  // ── actions ──
  boot(): Promise<void>;
  handleEvent(e: FozEvent): void;
  setConnected(c: boolean): void;
  refresh(): Promise<void>;
  setView(view: View): void;
  setProvider(p?: ProviderId): void;
  setQuery(q: string, opts?: { commit?: boolean }): void;
  moveCursor(delta: number): void;
  setCursor(i: number): void;
  openConversation(id: string, opts?: { focus?: boolean }): Promise<void>;
  closeConversation(): void;
  setFocus(p: Pane): void;
  setMode(m: Mode): void;
  toggleSidebar(): void;
  toggleSelect(id?: string): void;
  selectAll(): void;
  clearSelection(): void;
  targets(): Conversation[];
  archive(archived?: boolean): Promise<void>;
  toggleUnread(): Promise<void>;
  toggleStar(): Promise<void>;
  markRead(id: string): Promise<void>;
  setDraft(id: string, text: string): void;
  send(): Promise<void>;
  syncNow(): Promise<void>;
  say(text: string, kind?: Toast['kind']): void;
  setPending(keys: string[], count: number | null): void;
  moveMsgCursor(delta: number): void;
  setMsgCursor(i: number): void;
  openCmdline(kind: 'command' | 'search'): void;
  setCmdlineText(t: string): void;
  cmdlineHistory(dir: 1 | -1): void;
  closeCmdline(): void;
  pushHistory(kind: 'command' | 'search', text: string): void;
  openFinder(purpose: 'open' | 'compose'): void;
  setFinder(patch: Partial<FozState['finder']>): void;
  closeFinder(): void;
  toggleHelp(): void;
}

const EMPTY_COUNTS: Counts = { inbox: 0, unread: 0, starred: 0, archived: 0, byProvider: {} };

function matchesFilter(c: Conversation, s: Pick<FozState, 'view' | 'provider' | 'query'>): boolean {
  if (s.provider && c.provider !== s.provider) return false;
  if (s.query) {
    const q = s.query.toLowerCase();
    if (!`${c.title} ${c.snippet} ${c.participants.map((p) => p.name).join(' ')}`.toLowerCase().includes(q)) return false;
  }
  switch (s.view) {
    case 'inbox':
      return !c.archived;
    case 'unread':
      return !c.archived && c.unreadCount > 0;
    case 'starred':
      return c.starred;
    case 'archived':
      return c.archived;
    default:
      return true;
  }
}

function upsertSorted(list: Conversation[], c: Conversation, keep: boolean): Conversation[] {
  const rest = list.filter((x) => x.id !== c.id);
  if (!keep) return rest;
  rest.push(c);
  return rest.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
}

export const useFoz = create<FozState>((set, get) => ({
  ready: false,
  connected: false,
  demo: false,
  version: '',
  accounts: [],
  counts: EMPTY_COUNTS,
  mode: 'normal',
  focus: 'list',
  sidebarVisible: true,
  view: 'inbox',
  provider: undefined,
  query: '',
  conversations: [],
  cursor: 0,
  selected: new Set(),
  messages: {},
  msgCursor: -1,
  drafts: {},
  sending: false,
  cmdline: { kind: 'command', text: '', history: [], hIndex: -1 },
  finder: { open: false, query: '', index: 0, purpose: 'open' },
  helpOpen: false,
  pendingKeys: [],
  count: null,
  syncing: new Set(),

  async boot() {
    const s = await api.state();
    set({ accounts: s.accounts, keymap: s.keymap, counts: s.counts, demo: s.demo, version: s.version, ready: true });
    await get().refresh();
  },

  setConnected(connected) {
    set({ connected });
  },

  handleEvent(e) {
    const s = get();
    switch (e.type) {
      case 'hello':
        set({ accounts: e.accounts });
        break;
      case 'account.updated':
        set({ accounts: [...s.accounts.filter((a) => a.id !== e.account.id), e.account].sort((a, b) => a.id.localeCompare(b.id)) });
        break;
      case 'sync.status': {
        const syncing = new Set(s.syncing);
        e.syncing ? syncing.add(e.accountId) : syncing.delete(e.accountId);
        set({ syncing });
        if (!e.syncing) void api.counts().then((counts) => set({ counts })).catch(() => undefined);
        break;
      }
      case 'conversation.upserted': {
        const current = s.conversations[s.cursor];
        const conversations = upsertSorted(s.conversations, e.conversation, matchesFilter(e.conversation, s));
        const cursor = current ? Math.max(0, conversations.findIndex((c) => c.id === current.id)) : 0;
        set({ conversations, cursor: Math.min(cursor, Math.max(0, conversations.length - 1)) });
        void api.counts().then((counts) => set({ counts })).catch(() => undefined);
        break;
      }
      case 'conversation.removed':
        set({ conversations: s.conversations.filter((c) => c.id !== e.conversationId) });
        break;
      case 'message.new': {
        const list = s.messages[e.conversation.id];
        const messages = list ? { ...s.messages, [e.conversation.id]: [...list.filter((m) => m.id !== e.message.id), e.message] } : s.messages;
        const current = s.conversations[s.cursor];
        const conversations = upsertSorted(s.conversations, e.conversation, matchesFilter(e.conversation, s));
        const cursor = current ? Math.max(0, conversations.findIndex((c) => c.id === current.id)) : 0;
        set({ messages, conversations, cursor });
        if (!e.message.isMine) {
          if (s.openId === e.conversation.id && s.focus === 'thread') {
            void get().markRead(e.conversation.id);
          } else {
            get().say(`${e.message.from.name} · ${e.conversation.title}: ${e.message.text.slice(0, 60)}`);
          }
        }
        void api.counts().then((counts) => set({ counts })).catch(() => undefined);
        break;
      }
      case 'message.updated': {
        const list = s.messages[e.message.conversationId];
        if (list) set({ messages: { ...s.messages, [e.message.conversationId]: list.map((m) => (m.id === e.message.id ? e.message : m)) } });
        break;
      }
    }
  },

  async refresh() {
    const { view, provider, query, cursor } = get();
    try {
      const [conversations, counts] = await Promise.all([api.conversations({ view, provider, q: query || undefined }), api.counts()]);
      set({ conversations, counts, cursor: Math.min(cursor, Math.max(0, conversations.length - 1)) });
    } catch (err) {
      get().say(`erro: ${(err as Error).message}`, 'error');
    }
  },

  setView(view) {
    set({ view, cursor: 0, selected: new Set() });
    void get().refresh();
  },

  setProvider(provider) {
    set({ provider, cursor: 0, selected: new Set() });
    void get().refresh();
  },

  setQuery(query, opts) {
    set({ query, cursor: 0 });
    void get().refresh();
    if (opts?.commit && query) get().say(`/${query} · ${get().conversations.length} resultado(s)`);
  },

  moveCursor(delta) {
    const { conversations, cursor } = get();
    if (!conversations.length) return;
    set({ cursor: Math.max(0, Math.min(conversations.length - 1, cursor + delta)) });
  },

  setCursor(i) {
    const n = get().conversations.length;
    set({ cursor: n ? Math.max(0, Math.min(n - 1, i)) : 0 });
  },

  async openConversation(id, opts) {
    const s = get();
    const idx = s.conversations.findIndex((c) => c.id === id);
    set({ openId: id, msgCursor: -1, focus: opts?.focus === false ? s.focus : 'thread', cursor: idx >= 0 ? idx : s.cursor });
    try {
      const messages = await api.messages(id);
      set((st) => ({ messages: { ...st.messages, [id]: messages }, msgCursor: messages.length - 1 }));
      const conv = get().conversations.find((c) => c.id === id);
      if (conv?.unreadCount) void get().markRead(id);
    } catch (err) {
      get().say(`erro: ${(err as Error).message}`, 'error');
    }
  },

  closeConversation() {
    set({ openId: undefined, focus: 'list', mode: 'normal' });
  },

  setFocus(focus) {
    set({ focus });
  },

  setMode(mode) {
    set({ mode });
  },

  toggleSidebar() {
    set((s) => ({ sidebarVisible: !s.sidebarVisible, focus: s.sidebarVisible && s.focus === 'sidebar' ? 'list' : s.focus }));
  },

  toggleSelect(id) {
    const s = get();
    const target = id ?? s.conversations[s.cursor]?.id;
    if (!target) return;
    const selected = new Set(s.selected);
    selected.has(target) ? selected.delete(target) : selected.add(target);
    set({ selected });
  },

  selectAll() {
    set((s) => ({ selected: new Set(s.conversations.map((c) => c.id)) }));
  },

  clearSelection() {
    set({ selected: new Set() });
  },

  targets() {
    const s = get();
    if (s.selected.size) return s.conversations.filter((c) => s.selected.has(c.id));
    const cur = s.focus === 'thread' && s.openId ? s.conversations.find((c) => c.id === s.openId) : s.conversations[s.cursor];
    return cur ? [cur] : [];
  },

  async archive(archived) {
    const targets = get().targets();
    if (!targets.length) return;
    const value = archived ?? !targets[0]!.archived;
    try {
      await Promise.all(targets.map((c) => api.archive(c.id, value)));
      const { openId } = get();
      if (openId && targets.some((c) => c.id === openId) && value) get().closeConversation();
      get().clearSelection();
      get().say(`${targets.length > 1 ? `${targets.length} conversas` : targets[0]!.title} ${value ? 'arquivada' : 'restaurada'}${targets.length > 1 ? 's' : ''}`, 'ok');
    } catch (err) {
      get().say(`erro: ${(err as Error).message}`, 'error');
    }
  },

  async toggleUnread() {
    const targets = get().targets();
    if (!targets.length) return;
    const read = targets[0]!.unreadCount > 0;
    try {
      await Promise.all(targets.map((c) => api.read(c.id, read)));
      get().clearSelection();
      get().say(read ? 'marcada como lida' : 'marcada como não lida');
    } catch (err) {
      get().say(`erro: ${(err as Error).message}`, 'error');
    }
  },

  async toggleStar() {
    const targets = get().targets();
    if (!targets.length) return;
    const value = !targets[0]!.starred;
    try {
      await Promise.all(targets.map((c) => api.star(c.id, value)));
      get().clearSelection();
      get().say(value ? '★ favoritada' : '☆ favorito removido');
    } catch (err) {
      get().say(`erro: ${(err as Error).message}`, 'error');
    }
  },

  async markRead(id) {
    await api.read(id, true).catch(() => undefined);
  },

  setDraft(id, text) {
    set((s) => ({ drafts: { ...s.drafts, [id]: text } }));
  },

  async send() {
    const { openId, drafts, sending } = get();
    if (!openId || sending) return;
    const text = (drafts[openId] ?? '').trim();
    if (!text) {
      get().say('nada para enviar');
      return;
    }
    set({ sending: true });
    try {
      await api.send(openId, text);
      set((s) => ({ drafts: { ...s.drafts, [openId]: '' }, sending: false }));
      get().say('enviado ✓', 'ok');
    } catch (err) {
      set({ sending: false });
      get().say(`falha ao enviar: ${(err as Error).message}`, 'error');
    }
  },

  async syncNow() {
    get().say('sincronizando…');
    try {
      await api.sync();
      await get().refresh();
      get().say('sync concluído', 'ok');
    } catch (err) {
      get().say(`sync falhou: ${(err as Error).message}`, 'error');
    }
  },

  say(text, kind = 'info') {
    set({ toast: { text, kind, at: Date.now() } });
  },

  setPending(pendingKeys, count) {
    set({ pendingKeys, count });
  },

  moveMsgCursor(delta) {
    const { openId, messages, msgCursor } = get();
    const list = openId ? (messages[openId] ?? []) : [];
    if (!list.length) return;
    set({ msgCursor: Math.max(0, Math.min(list.length - 1, (msgCursor < 0 ? list.length - 1 : msgCursor) + delta)) });
  },

  setMsgCursor(i) {
    const { openId, messages } = get();
    const n = openId ? (messages[openId] ?? []).length : 0;
    set({ msgCursor: n ? Math.max(0, Math.min(n - 1, i)) : -1 });
  },

  openCmdline(kind) {
    set((s) => ({ mode: kind, cmdline: { ...s.cmdline, kind, text: kind === 'search' ? s.query : '', hIndex: -1 } }));
  },

  setCmdlineText(text) {
    set((s) => ({ cmdline: { ...s.cmdline, text } }));
    if (get().cmdline.kind === 'search') {
      set({ query: text, cursor: 0 });
      void get().refresh();
    }
  },

  cmdlineHistory(dir) {
    const { cmdline } = get();
    const hist = cmdline.history.filter((h) => h.startsWith(cmdline.kind === 'command' ? ':' : '/')).map((h) => h.slice(1));
    if (!hist.length) return;
    const next = cmdline.hIndex < 0 ? (dir === -1 ? hist.length - 1 : -1) : Math.max(-1, Math.min(hist.length - 1, cmdline.hIndex + dir));
    set({ cmdline: { ...cmdline, hIndex: next, text: next >= 0 ? hist[next]! : '' } });
  },

  closeCmdline() {
    set((s) => ({ mode: 'normal', cmdline: { ...s.cmdline, text: '' } }));
  },

  pushHistory(kind, text) {
    if (!text) return;
    set((s) => ({ cmdline: { ...s.cmdline, history: [...s.cmdline.history.filter((h) => h !== `${kind === 'command' ? ':' : '/'}${text}`), `${kind === 'command' ? ':' : '/'}${text}`].slice(-50) } }));
  },

  openFinder(purpose) {
    set({ mode: 'finder', finder: { open: true, query: '', index: 0, purpose } });
  },

  setFinder(patch) {
    set((s) => ({ finder: { ...s.finder, ...patch } }));
  },

  closeFinder() {
    set((s) => ({ mode: 'normal', finder: { ...s.finder, open: false, query: '' } }));
  },

  toggleHelp() {
    set((s) => ({ helpOpen: !s.helpOpen, mode: s.helpOpen ? 'normal' : 'help' }));
  },
}));

/** Distinct providers across configured accounts, in a stable order. */
export function providerList(accounts: Account[]): ProviderId[] {
  const order: ProviderId[] = ['slack', 'gmail', 'whatsapp', 'telegram', 'discord', 'demo'];
  const present = new Set(accounts.map((a) => a.provider));
  return order.filter((p) => present.has(p));
}
