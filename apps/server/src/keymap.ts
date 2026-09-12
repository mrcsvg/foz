import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_KEYMAP, type Binding, type KeymapConfig, type Mode } from '@foz/core';

interface UserKeymap extends Partial<KeymapConfig> {
  unbind?: Array<{ mode: Mode; keys: string }>;
}

/** Merge the built-in keymap with the user's `foz.keymap.json`. */
export function loadKeymap(rootDir: string): KeymapConfig & { unbind: Array<{ mode: Mode; keys: string }> } {
  let user: UserKeymap = {};
  const file = path.join(rootDir, 'foz.keymap.json');
  try {
    user = JSON.parse(fs.readFileSync(file, 'utf8')) as UserKeymap;
  } catch {
    // no user keymap, fine
  }
  const bindings: Binding[] = [...DEFAULT_KEYMAP.bindings, ...(user.bindings ?? [])];
  return {
    leader: user.leader ?? DEFAULT_KEYMAP.leader,
    bindings,
    unbind: user.unbind ?? [],
  };
}
