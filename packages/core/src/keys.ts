/**
 * Key notation, vim-flavoured.
 *
 *   j  K  <C-d>  <S-Tab>  <CR>  <Esc>  <Space>  <BS>  <Tab>  <Up>  <M-x>
 *
 * `keyFromEvent` turns a browser KeyboardEvent-like object into one token.
 * Plain printable characters are kept as-is (case-sensitive, so `J` is
 * shift+j). Everything else is wrapped in angle brackets.
 */

export interface KeyEventLike {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}

const SPECIAL: Record<string, string> = {
  Enter: 'CR',
  Escape: 'Esc',
  ' ': 'Space',
  Backspace: 'BS',
  Tab: 'Tab',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Delete: 'Del',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
};

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Dead', 'Unidentified']);

export function keyFromEvent(e: KeyEventLike): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null;
  const special = SPECIAL[e.key];
  const mods = `${e.ctrlKey ? 'C-' : ''}${e.altKey || e.metaKey ? 'M-' : ''}`;
  if (special) {
    // Shift matters for non-printables (S-Tab, S-CR).
    const s = e.shiftKey ? 'S-' : '';
    return `<${mods}${s}${special}>`;
  }
  if (e.key.length === 1) {
    if (!mods) return e.key === '<' ? '<lt>' : e.key;
    return `<${mods}${e.key.toLowerCase()}>`;
  }
  // F-keys and friends
  return `<${mods}${e.shiftKey ? 'S-' : ''}${e.key}>`;
}

/** Split a vim-style binding string into key tokens: "gg" -> ["g","g"], "<C-d>" -> ["<C-d>"]. */
export function parseKeys(seq: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < seq.length) {
    const ch = seq[i]!;
    if (ch === '<') {
      const end = seq.indexOf('>', i);
      if (end > i) {
        out.push(normaliseToken(seq.slice(i, end + 1)));
        i = end + 1;
        continue;
      }
    }
    out.push(ch);
    i += 1;
  }
  return out;
}

function normaliseToken(tok: string): string {
  const inner = tok.slice(1, -1);
  const parts = inner.split('-');
  const name = parts.pop()!;
  const mods = new Set(parts.map((p) => p.toUpperCase()));
  const canonical: Record<string, string> = {
    cr: 'CR', enter: 'CR', return: 'CR', esc: 'Esc', escape: 'Esc', space: 'Space', bs: 'BS', backspace: 'BS',
    tab: 'Tab', up: 'Up', down: 'Down', left: 'Left', right: 'Right', del: 'Del', delete: 'Del', lt: 'lt',
    home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown', leader: 'Leader',
  };
  const n = canonical[name.toLowerCase()] ?? (name.length === 1 ? name.toLowerCase() : name);
  const order = ['C', 'M', 'S'].filter((m) => mods.has(m) || (m === 'M' && mods.has('A')));
  return `<${order.map((m) => `${m}-`).join('')}${n}>`;
}

export function formatKeys(tokens: string[]): string {
  return tokens.map((t) => (t === '<Space>' ? '␣' : t)).join('');
}
