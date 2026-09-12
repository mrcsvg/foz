import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Binding, Mode } from '@foz/core';
import { useFoz } from '../store';
import { COMMAND_NAMES } from '../commands';

const MODES: Mode[] = ['normal', 'insert', 'command', 'search', 'finder', 'help'];

export function Help() {
  const { helpOpen, keymap } = useFoz(useShallow((s) => ({ helpOpen: s.helpOpen, keymap: s.keymap })));
  const grouped = useMemo(() => {
    const out = new Map<Mode, Map<string, { keys: string[]; desc?: string }>>();
    for (const b of keymap?.bindings ?? []) {
      const modes = Array.isArray(b.mode) ? b.mode : [b.mode];
      for (const m of modes) {
        const key = actionKey(b);
        const byAction = out.get(m) ?? new Map();
        const entry = byAction.get(key) ?? { keys: [], desc: b.desc };
        entry.keys.push(b.keys);
        entry.desc = entry.desc ?? b.desc;
        byAction.set(key, entry);
        out.set(m, byAction);
      }
    }
    return out;
  }, [keymap]);

  if (!helpOpen) return null;

  return (
    <div className="overlay" onClick={() => useFoz.getState().toggleHelp()}>
      <div className="help" onClick={(e) => e.stopPropagation()}>
        <div className="help-head">
          <span>foz · atalhos</span>
          <span className="muted small">edite foz.keymap.json ou use :map · q fecha</span>
        </div>
        <div className="help-body">
          {MODES.filter((m) => grouped.has(m)).map((m) => (
            <div key={m} className="help-mode">
              <div className="help-mode-title">{m}</div>
              {[...grouped.get(m)!.entries()].map(([action, e]) => (
                <div key={action} className="help-row">
                  <span className="help-keys">
                    {e.keys.map((k) => (
                      <kbd key={k}>{k.replace(/<Space>/g, '␣').replace(/<Leader>/g, '␣')}</kbd>
                    ))}
                  </span>
                  <span className="help-desc">{e.desc ?? action}</span>
                  <span className="muted small help-action">{action}</span>
                </div>
              ))}
            </div>
          ))}
          <div className="help-mode">
            <div className="help-mode-title">: commands</div>
            {Object.entries(COMMAND_NAMES).map(([name, desc]) => (
              <div key={name} className="help-row">
                <span className="help-keys"><kbd>:{name}</kbd></span>
                <span className="help-desc">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function actionKey(b: Binding): string {
  return b.arg === undefined ? b.action : `${b.action} ${String(b.arg)}`;
}
