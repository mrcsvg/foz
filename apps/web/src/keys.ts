import { Keymap, keyFromEvent, type KeymapConfig, type Mode } from '@foz/core';
import { useFoz } from './store';
import { ACTIONS } from './actions';

/**
 * Global key dispatcher. Every keydown goes through the vim-style Keymap for
 * the current mode. Matched/pending keys are swallowed; anything else falls
 * through to the browser (so typing in insert mode, Cmd-C, etc. still work).
 */
const CHORD_TIMEOUT_MS = 900;

class KeymapRuntime {
  keymap = new Keymap({ bindings: [] });
  private timer?: number;

  load(config: KeymapConfig & { unbind?: Array<{ mode: Mode; keys: string }> }) {
    this.keymap = new Keymap(config);
    for (const u of config.unbind ?? []) this.keymap.remove(u.mode, u.keys);
  }

  add(binding: Parameters<Keymap['add']>[0]) {
    this.keymap.add(binding);
  }

  remove(mode: Mode, keys: string) {
    this.keymap.remove(mode, keys);
  }

  handle(e: KeyboardEvent) {
    const key = keyFromEvent(e);
    if (!key) return;
    const s = useFoz.getState();
    const mode: Mode = s.helpOpen ? 'help' : s.mode;
    const result = this.keymap.press(mode, key);
    window.clearTimeout(this.timer);

    if (result.status === 'matched') {
      e.preventDefault();
      e.stopPropagation();
      s.setPending([], null);
      const handler = ACTIONS[result.action];
      if (!handler) {
        s.say(`ação desconhecida: ${result.action}`, 'error');
        return;
      }
      void handler({ count: result.count, arg: result.arg });
      return;
    }
    if (result.status === 'pending') {
      // In text modes, a pending single key would swallow typing; only
      // chords starting with non-printables are allowed to pend there.
      if ((mode === 'insert' || mode === 'command' || mode === 'search' || mode === 'finder') && key.length === 1) {
        this.keymap.reset();
        return;
      }
      e.preventDefault();
      s.setPending(result.buffer, result.count);
      this.timer = window.setTimeout(() => {
        const flushed = this.keymap.flush(mode);
        useFoz.getState().setPending([], null);
        if (flushed?.status === 'matched') void ACTIONS[flushed.action]?.({ count: flushed.count, arg: flushed.arg });
      }, CHORD_TIMEOUT_MS);
      return;
    }
    // nomatch: let the browser have it in text modes; swallow in normal mode
    // only for keys that would scroll the page or trigger quick-find.
    s.setPending([], null);
    if (mode === 'normal' || mode === 'help') {
      if (key === '<Space>' || key === "'" || key === '/') e.preventDefault();
    }
  }
}

export const keymapRuntime = new KeymapRuntime();

export function installKeyHandler(): () => void {
  const fn = (e: KeyboardEvent) => keymapRuntime.handle(e);
  window.addEventListener('keydown', fn, { capture: true });
  return () => window.removeEventListener('keydown', fn, { capture: true });
}
