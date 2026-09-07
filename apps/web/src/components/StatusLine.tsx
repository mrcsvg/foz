import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { formatKeys } from '@foz/core';
import { useFoz } from '../store';

const MODE_LABEL: Record<string, string> = {
  normal: 'NORMAL',
  insert: 'INSERT',
  command: 'COMMAND',
  search: 'SEARCH',
  finder: 'FINDER',
  help: 'HELP',
};

export function StatusLine() {
  const { mode, helpOpen, cmdline, toast, pendingKeys, count, cursor, total, view, provider, selected, syncing, connected, openId } = useFoz(
    useShallow((s) => ({
      mode: s.mode,
      helpOpen: s.helpOpen,
      cmdline: s.cmdline,
      toast: s.toast,
      pendingKeys: s.pendingKeys,
      count: s.count,
      cursor: s.cursor,
      total: s.conversations.length,
      view: s.view,
      provider: s.provider,
      selected: s.selected.size,
      syncing: s.syncing.size > 0,
      connected: s.connected,
      openId: s.openId,
    })),
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const [, tick] = useState(0);
  const inCmd = mode === 'command' || mode === 'search';

  useEffect(() => {
    if (inCmd) inputRef.current?.focus();
  }, [inCmd]);

  // Fade toasts after a while.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => tick((n) => n + 1), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  const showToast = toast && Date.now() - toast.at < 6000;
  const effMode = helpOpen ? 'help' : mode;

  return (
    <footer className={`statusline mode-${effMode}`}>
      <div className="status-row">
        <span className={`mode-badge m-${effMode}`}>{MODE_LABEL[effMode] ?? effMode.toUpperCase()}</span>
        <span className="status-seg">{view}{provider ? `/${provider}` : ''}</span>
        {selected > 0 && <span className="status-seg accent">{selected} sel</span>}
        <span className={`status-msg ${showToast ? `toast-${toast!.kind}` : 'muted'}`}>
          {inCmd ? (
            <span className="cmdline">
              <span className="cmd-prefix">{cmdline.kind === 'command' ? ':' : '/'}</span>
              <input
                ref={inputRef}
                value={cmdline.text}
                onChange={(e) => useFoz.getState().setCmdlineText(e.target.value)}
                onBlur={() => {
                  // Keep focus while in command mode (clicks elsewhere cancel).
                  if (useFoz.getState().mode === cmdline.kind) useFoz.getState().closeCmdline();
                }}
                spellCheck={false}
                autoComplete="off"
              />
            </span>
          ) : showToast ? (
            toast!.text
          ) : (
            hint(effMode, Boolean(openId))
          )}
        </span>
        <span className="status-right">
          {syncing && <span className="spin">⟳</span>}
          {!connected && <span className="bad">offline</span>}
          {(pendingKeys.length > 0 || count) && (
            <span className="pending">{count ?? ''}{formatKeys(pendingKeys)}</span>
          )}
          <span className="pos">{total ? `${cursor + 1}/${total}` : '—'}</span>
        </span>
      </div>
    </footer>
  );
}

function hint(mode: string, hasThread: boolean): string {
  if (mode === 'insert') return 'Esc normal · ⌃Enter envia';
  if (mode === 'finder') return '↑↓ / ⌃j ⌃k navegar · Enter abrir · Esc fechar';
  if (mode === 'help') return 'q fecha';
  return hasThread ? 'h/l panes · J/K próxima/anterior · i responder · e arquivar · yy copiar' : 'j/k mover · Enter abrir · / buscar · ␣f localizar · ? ajuda';
}
