import type { ProviderId } from '@foz/core';
import { providerList, useFoz, type View } from './store';
import { COMMAND_NAMES, runCommand } from './commands';

export type ActionHandler = (ctx: { count: number | null; arg?: unknown }) => void | Promise<void>;

/**
 * Action registry: maps the action names used by the keymap (and `:map`) to
 * behaviour. Pane-aware navigation lives here so the same `j` moves the
 * list cursor, the message cursor or the sidebar depending on focus.
 */
export const ACTIONS: Record<string, ActionHandler> = {
  'nav.down': ({ count }) => nav(count ?? 1),
  'nav.up': ({ count }) => nav(-(count ?? 1)),
  'nav.top': () => {
    const s = useFoz.getState();
    if (s.focus === 'thread') s.setMsgCursor(0);
    else if (s.focus === 'sidebar') sidebarNav(-99);
    else s.setCursor(0);
  },
  'nav.bottom': () => {
    const s = useFoz.getState();
    if (s.focus === 'thread') s.setMsgCursor(1e9);
    else if (s.focus === 'sidebar') sidebarNav(99);
    else s.setCursor(1e9);
  },
  'nav.pageDown': () => nav(10),
  'nav.pageUp': () => nav(-10),
  'nav.center': () => {
    document.querySelector('[data-cursor="true"]')?.scrollIntoView({ block: 'center' });
  },

  'pane.left': () => {
    const s = useFoz.getState();
    if (s.focus === 'thread') s.setFocus('list');
    else if (s.focus === 'list' && s.sidebarVisible) s.setFocus('sidebar');
  },
  'pane.right': () => {
    const s = useFoz.getState();
    if (s.focus === 'sidebar') s.setFocus('list');
    else if (s.focus === 'list') {
      const cur = s.conversations[s.cursor];
      if (s.openId) s.setFocus('thread');
      else if (cur) void s.openConversation(cur.id);
    }
  },
  'sidebar.toggle': () => useFoz.getState().toggleSidebar(),

  'conv.open': () => {
    const s = useFoz.getState();
    if (s.focus === 'sidebar') {
      sidebarActivate();
      return;
    }
    const cur = s.conversations[s.cursor];
    if (cur) void s.openConversation(cur.id);
  },
  'conv.next': ({ count }) => openRelative(count ?? 1),
  'conv.prev': ({ count }) => openRelative(-(count ?? 1)),
  'conv.archive': () => void useFoz.getState().archive(),
  'conv.toggleUnread': () => void useFoz.getState().toggleUnread(),
  'conv.toggleStar': () => void useFoz.getState().toggleStar(),
  'conv.toggleSelect': ({ count }) => {
    const s = useFoz.getState();
    for (let i = 0; i < (count ?? 1); i += 1) {
      s.toggleSelect();
      if (i < (count ?? 1) - 1) s.moveCursor(1);
    }
  },
  'conv.selectAll': () => useFoz.getState().selectAll(),
  'conv.openNative': () => {
    const c = useFoz.getState().targets()[0];
    if (c?.url) window.open(c.url, '_blank', 'noopener');
    else useFoz.getState().say('sem link nativo para esta conversa');
  },

  escape: () => {
    const s = useFoz.getState();
    if (s.helpOpen) s.toggleHelp();
    else if (s.selected.size) s.clearSelection();
    else if (s.query) s.setQuery('');
    else if (s.focus === 'thread') s.setFocus('list');
    else if (s.openId) s.closeConversation();
    else if (s.provider) s.setProvider(undefined);
  },

  yank: async () => {
    const s = useFoz.getState();
    let text = '';
    if (s.focus === 'thread' && s.openId) {
      const m = (s.messages[s.openId] ?? [])[s.msgCursor];
      text = m?.text ?? '';
    } else {
      const c = s.conversations[s.cursor];
      text = c?.url ?? c?.title ?? '';
    }
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      s.say(`yank: ${text.slice(0, 50)}${text.length > 50 ? '…' : ''}`, 'ok');
    } catch {
      s.say('clipboard indisponível', 'error');
    }
  },

  reply: () => {
    const s = useFoz.getState();
    if (!s.openId) {
      const cur = s.conversations[s.cursor];
      if (!cur) return;
      void s.openConversation(cur.id).then(() => useFoz.getState().setMode('insert'));
      return;
    }
    s.setFocus('thread');
    s.setMode('insert');
  },
  compose: () => useFoz.getState().openFinder('compose'),
  'insert.exit': () => useFoz.getState().setMode('normal'),
  'compose.send': () => void useFoz.getState().send(),

  'go.view': ({ arg }) => useFoz.getState().setView(arg as View),
  'go.provider': ({ arg }) => {
    const s = useFoz.getState();
    const n = Number(arg);
    const list = providerList(s.accounts);
    s.setProvider(n === 0 ? undefined : list[n - 1]);
  },
  'provider.cycle': ({ arg }) => {
    const s = useFoz.getState();
    const list: Array<ProviderId | undefined> = [undefined, ...providerList(s.accounts)];
    const i = list.indexOf(s.provider);
    const next = list[(i + Number(arg ?? 1) + list.length) % list.length];
    s.setProvider(next);
  },

  'search.open': () => useFoz.getState().openCmdline('search'),
  'search.next': ({ count }) => nav(count ?? 1),
  'search.prev': ({ count }) => nav(-(count ?? 1)),
  'command.open': () => useFoz.getState().openCmdline('command'),
  'cmdline.cancel': () => {
    const s = useFoz.getState();
    if (s.cmdline.kind === 'search') s.setQuery('');
    s.closeCmdline();
  },
  'cmdline.submit': () => {
    const s = useFoz.getState();
    const { kind, text } = s.cmdline;
    s.pushHistory(kind, text);
    s.closeCmdline();
    if (kind === 'command') void runCommand(text);
    else s.setQuery(text, { commit: true });
  },
  'cmdline.complete': () => {
    const s = useFoz.getState();
    const completed = completeCommand(s.cmdline.text);
    if (completed) s.setCmdlineText(completed);
  },
  'cmdline.historyPrev': () => useFoz.getState().cmdlineHistory(-1),
  'cmdline.historyNext': () => useFoz.getState().cmdlineHistory(1),

  'finder.open': () => useFoz.getState().openFinder('open'),
  'finder.cancel': () => useFoz.getState().closeFinder(),
  'finder.down': () => useFoz.getState().setFinder({ index: useFoz.getState().finder.index + 1 }),
  'finder.up': () => useFoz.getState().setFinder({ index: Math.max(0, useFoz.getState().finder.index - 1) }),
  'finder.select': () => {
    // The Finder component resolves the highlighted item; it listens for this signal.
    window.dispatchEvent(new CustomEvent('foz:finder-select'));
  },

  'sync.now': () => void useFoz.getState().syncNow(),
  'help.toggle': () => useFoz.getState().toggleHelp(),
};

function nav(delta: number) {
  const s = useFoz.getState();
  if (s.helpOpen) {
    document.querySelector('.help-body')?.scrollBy({ top: delta * 40 });
    return;
  }
  if (s.focus === 'thread') s.moveMsgCursor(delta);
  else if (s.focus === 'sidebar') sidebarNav(delta);
  else s.moveCursor(delta);
}

function openRelative(delta: number) {
  const s = useFoz.getState();
  const base = s.openId ? s.conversations.findIndex((c) => c.id === s.openId) : s.cursor;
  const idx = Math.max(0, Math.min(s.conversations.length - 1, (base < 0 ? s.cursor : base) + delta));
  const target = s.conversations[idx];
  if (target) void s.openConversation(target.id, { focus: false });
}

// ── sidebar keyboard model ───────────────────────────────────────
export const SIDEBAR_VIEWS: View[] = ['inbox', 'unread', 'starred', 'archived', 'all'];
let sidebarIndex = 0;
export const getSidebarIndex = () => sidebarIndex;
const listeners = new Set<() => void>();
export const onSidebarChange = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

function sidebarItems(): Array<{ kind: 'view'; value: View } | { kind: 'provider'; value?: ProviderId }> {
  const s = useFoz.getState();
  return [
    ...SIDEBAR_VIEWS.map((v) => ({ kind: 'view' as const, value: v })),
    { kind: 'provider' as const, value: undefined },
    ...providerList(s.accounts).map((p) => ({ kind: 'provider' as const, value: p })),
  ];
}

function sidebarNav(delta: number) {
  const n = sidebarItems().length;
  sidebarIndex = Math.max(0, Math.min(n - 1, sidebarIndex + delta));
  listeners.forEach((l) => l());
}

function sidebarActivate() {
  const item = sidebarItems()[sidebarIndex];
  const s = useFoz.getState();
  if (!item) return;
  if (item.kind === 'view') s.setView(item.value);
  else s.setProvider(item.value);
}

export function setSidebarIndex(i: number) {
  sidebarIndex = i;
  listeners.forEach((l) => l());
}

function completeCommand(text: string): string | null {
  const [head = '', ...rest] = text.split(/\s+/);
  if (rest.length) return null;
  const names = Object.keys(COMMAND_NAMES).filter((n) => n.startsWith(head));
  if (!names.length) return null;
  if (names.length === 1) return `${names[0]} `;
  // Longest common prefix.
  let prefix = names[0]!;
  for (const n of names) while (!n.startsWith(prefix)) prefix = prefix.slice(0, -1);
  useFoz.getState().say(names.join('  '));
  return prefix;
}

