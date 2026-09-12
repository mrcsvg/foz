import type { Mode, ProviderId } from '@foz/core';
import { providerList, useFoz, type View } from './store';
import { keymapRuntime } from './keys';

/**
 * `:` commands. Keep them tiny and composable, like ex commands.
 */
type Command = (args: string[]) => void | Promise<void>;

const VIEWS: View[] = ['inbox', 'unread', 'starred', 'archived', 'all'];
const PROVIDERS: ProviderId[] = ['slack', 'gmail', 'whatsapp', 'telegram', 'discord', 'demo'];

export const COMMAND_NAMES: Record<string, string> = {
  q: 'close thread / clear filters',
  quit: 'same as :q',
  sync: 'sync all accounts now',
  help: 'toggle help',
  inbox: 'go to inbox',
  unread: 'go to unread',
  starred: 'go to starred',
  archived: 'go to archived',
  all: 'go to everything',
  provider: 'provider <slack|gmail|…|all>',
  slack: 'filter: slack',
  gmail: 'filter: gmail',
  whatsapp: 'filter: whatsapp',
  telegram: 'filter: telegram',
  clear: 'clear search, selection and provider filter',
  compose: 'compose: pick a conversation to write to',
  find: 'find conversation (fuzzy)',
  archive: 'archive current/selected',
  unarchive: 'unarchive current/selected',
  star: 'toggle star',
  read: 'mark read',
  markunread: 'mark unread',
  open: 'open in native app',
  sidebar: 'toggle sidebar',
  map: 'map <mode> <keys> <action> [arg]',
  unmap: 'unmap <mode> <keys>',
  accounts: 'list accounts and status',
  version: 'show version',
};

const COMMANDS: Record<string, Command> = {
  q: () => {
    const s = useFoz.getState();
    if (s.openId) s.closeConversation();
    else {
      s.setQuery('');
      s.setProvider(undefined);
    }
  },
  sync: () => useFoz.getState().syncNow(),
  help: () => useFoz.getState().toggleHelp(),
  provider: ([name]) => {
    const s = useFoz.getState();
    if (!name || name === 'all') s.setProvider(undefined);
    else if (PROVIDERS.includes(name as ProviderId)) s.setProvider(name as ProviderId);
    else s.say(`provider desconhecido: ${name}`, 'error');
  },
  clear: () => {
    const s = useFoz.getState();
    s.clearSelection();
    s.setQuery('');
    s.setProvider(undefined);
  },
  compose: () => useFoz.getState().openFinder('compose'),
  find: () => useFoz.getState().openFinder('open'),
  archive: () => useFoz.getState().archive(true),
  unarchive: () => useFoz.getState().archive(false),
  star: () => useFoz.getState().toggleStar(),
  read: async () => {
    const s = useFoz.getState();
    for (const c of s.targets()) await s.markRead(c.id);
  },
  markunread: () => {
    const s = useFoz.getState();
    if (s.targets().every((c) => c.unreadCount === 0)) return s.toggleUnread();
  },
  open: () => {
    const c = useFoz.getState().targets()[0];
    if (c?.url) window.open(c.url, '_blank', 'noopener');
  },
  sidebar: () => useFoz.getState().toggleSidebar(),
  map: ([mode, keys, action, arg]) => {
    if (!mode || !keys || !action) return useFoz.getState().say('uso: :map <mode> <keys> <action> [arg]', 'error');
    keymapRuntime.add({ mode: mode as Mode, keys, action, arg: parseArg(arg) });
    useFoz.getState().say(`mapped ${keys} → ${action} (${mode})`, 'ok');
  },
  unmap: ([mode, keys]) => {
    if (!mode || !keys) return useFoz.getState().say('uso: :unmap <mode> <keys>', 'error');
    keymapRuntime.remove(mode as Mode, keys);
    useFoz.getState().say(`unmapped ${keys} (${mode})`, 'ok');
  },
  accounts: () => {
    const s = useFoz.getState();
    s.say(s.accounts.map((a) => `${a.label}: ${a.status}${a.error ? ` (${a.error})` : ''}`).join(' · ') || 'nenhuma conta');
  },
  version: () => {
    const s = useFoz.getState();
    s.say(`foz ${s.version} · providers: ${providerList(s.accounts).join(', ') || 'none'}`);
  },
};
COMMANDS.quit = COMMANDS.q!;
for (const v of VIEWS) COMMANDS[v] = () => useFoz.getState().setView(v);
for (const p of PROVIDERS) if (!COMMANDS[p]) COMMANDS[p] = () => COMMANDS.provider!([p]);

export async function runCommand(line: string) {
  const [name = '', ...args] = line.trim().split(/\s+/);
  if (!name) return;
  const cmd = COMMANDS[name];
  if (!cmd) {
    useFoz.getState().say(`E492: Not an editor command: ${name}`, 'error');
    return;
  }
  try {
    await cmd(args);
  } catch (err) {
    useFoz.getState().say(`erro: ${(err as Error).message}`, 'error');
  }
}

function parseArg(a?: string): unknown {
  if (a == null) return undefined;
  if (/^-?\d+$/.test(a)) return Number(a);
  return a;
}
