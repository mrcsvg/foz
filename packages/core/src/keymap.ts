import { parseKeys } from './keys.js';

/**
 * A tiny modal keymap engine in the spirit of vim.
 *
 * - modes: normal / insert / command / search / finder (anything string)
 * - multi-key chords with prefix resolution ("g" then "g" → gg; "gi" → go inbox)
 * - count prefixes ("3j")
 * - `<Leader>` expands to the configured leader key
 *
 * The engine is pure: feed it keys, it tells you what happened. The host
 * decides what an action name means and when to time-out pending chords.
 */

export type Mode = 'normal' | 'insert' | 'command' | 'search' | 'finder' | 'help';

export interface Binding {
  mode: Mode | Mode[];
  keys: string;
  action: string;
  desc?: string;
  /** Optional static argument passed along with the action. */
  arg?: unknown;
}

export interface KeymapConfig {
  leader?: string;
  bindings: Binding[];
}

export type PressResult =
  | { status: 'pending'; buffer: string[]; count: number | null }
  | { status: 'matched'; action: string; arg?: unknown; count: number | null; keys: string[] }
  | { status: 'nomatch'; buffer: string[] };

interface TrieNode {
  children: Map<string, TrieNode>;
  binding?: Binding;
}

export class Keymap {
  private tries = new Map<Mode, TrieNode>();
  private buffer: string[] = [];
  private countDigits = '';
  private leader: string;

  constructor(config: KeymapConfig) {
    this.leader = config.leader ?? '<Space>';
    for (const b of config.bindings) this.add(b);
  }

  add(binding: Binding): void {
    const modes = Array.isArray(binding.mode) ? binding.mode : [binding.mode];
    const tokens = this.tokens(binding.keys);
    for (const mode of modes) {
      let node: TrieNode | undefined = this.tries.get(mode);
      if (!node) {
        node = { children: new Map() };
        this.tries.set(mode, node);
      }
      for (const t of tokens) {
        let next: TrieNode | undefined = node.children.get(t);
        if (!next) {
          next = { children: new Map() };
          node.children.set(t, next);
        }
        node = next;
      }
      node.binding = binding;
    }
  }

  remove(mode: Mode, keys: string): void {
    const tokens = this.tokens(keys);
    const path: Array<[TrieNode, string]> = [];
    let node = this.tries.get(mode);
    for (const t of tokens) {
      if (!node) return;
      path.push([node, t]);
      node = node.children.get(t);
    }
    if (!node) return;
    delete node.binding;
    // Prune now-empty branches so the prefix no longer reads as "pending".
    for (let i = path.length - 1; i >= 0; i -= 1) {
      const [parent, key] = path[i]!;
      const child = parent.children.get(key)!;
      if (child.binding || child.children.size) break;
      parent.children.delete(key);
    }
  }

  bindings(mode: Mode): Binding[] {
    const out: Binding[] = [];
    const walk = (n: TrieNode | undefined) => {
      if (!n) return;
      if (n.binding) out.push(n.binding);
      for (const c of n.children.values()) walk(c);
    };
    walk(this.tries.get(mode));
    return out;
  }

  get pending(): string[] {
    return [...this.buffer];
  }

  get count(): number | null {
    return this.countDigits ? Number(this.countDigits) : null;
  }

  reset(): void {
    this.buffer = [];
    this.countDigits = '';
  }

  /** Feed one key token (see keys.ts) for the given mode. */
  press(mode: Mode, key: string): PressResult {
    const root = this.tries.get(mode);
    const allowCount = mode === 'normal';

    // Count prefix: digits before any chord starts (0 only after another digit).
    if (allowCount && this.buffer.length === 0 && /^[0-9]$/.test(key) && !(key === '0' && !this.countDigits)) {
      // Only treat as count if no binding starts with this digit.
      if (!root?.children.has(key) || this.countDigits) {
        this.countDigits += key;
        return { status: 'pending', buffer: [], count: this.count };
      }
    }

    this.buffer.push(key);
    let node = root;
    for (const t of this.buffer) {
      node = node?.children.get(t);
      if (!node) break;
    }

    if (!node || (!node.binding && node.children.size === 0)) {
      const buffer = this.buffer;
      this.reset();
      return { status: 'nomatch', buffer };
    }
    if (node.binding && node.children.size === 0) {
      const b = node.binding;
      const keys = this.buffer;
      const count = this.count;
      this.reset();
      return { status: 'matched', action: b.action, arg: b.arg, count, keys };
    }
    if (node.binding) {
      // Ambiguous (e.g. "g" bound and "gg" bound). Vim waits for timeout;
      // we resolve eagerly to the leaf on next key and let `flush()` fire it.
      return { status: 'pending', buffer: [...this.buffer], count: this.count };
    }
    return { status: 'pending', buffer: [...this.buffer], count: this.count };
  }

  /** Called on chord timeout: fire the binding sitting on the current prefix, if any. */
  flush(mode: Mode): PressResult | null {
    let node = this.tries.get(mode);
    for (const t of this.buffer) node = node?.children.get(t);
    if (node?.binding) {
      const b = node.binding;
      const keys = this.buffer;
      const count = this.count;
      this.reset();
      return { status: 'matched', action: b.action, arg: b.arg, count, keys };
    }
    const buffer = this.buffer;
    this.reset();
    return buffer.length ? { status: 'nomatch', buffer } : null;
  }

  private tokens(keys: string): string[] {
    return parseKeys(keys.replace(/<Leader>/gi, this.leader));
  }
}
