import { useEffect, useState } from 'react';
import { PROVIDER_META } from '../format';
import { getSidebarIndex, onSidebarChange, setSidebarIndex, SIDEBAR_VIEWS } from '../actions';
import { providerList, useFoz } from '../store';
import { useShallow } from 'zustand/react/shallow';

const VIEW_LABEL: Record<string, string> = { inbox: 'Inbox', unread: 'Não lidas', starred: 'Favoritas', archived: 'Arquivadas', all: 'Tudo' };
const VIEW_KEY: Record<string, string> = { inbox: 'gi', unread: 'gu', starred: 'gs', archived: 'ga', all: 'ge' };

export function Sidebar() {
  const { accounts, counts, view, provider, focus, syncing, connected, demo } = useFoz(useShallow((s) => ({
    accounts: s.accounts,
    counts: s.counts,
    view: s.view,
    provider: s.provider,
    focus: s.focus,
    syncing: s.syncing,
    connected: s.connected,
    demo: s.demo,
  })));
  const [idx, setIdx] = useState(getSidebarIndex());
  useEffect(() => onSidebarChange(() => setIdx(getSidebarIndex())), []);
  const providers = providerList(accounts);
  const active = focus === 'sidebar';

  return (
    <aside className={`sidebar pane ${active ? 'focused' : ''}`}>
      <div className="brand">
        <span className="brand-name">foz</span>
        <span className={`dot ${connected ? 'ok' : 'bad'}`} title={connected ? 'conectado' : 'reconectando'} />
        {demo && <span className="tag">demo</span>}
      </div>

      <div className="section-title">Views</div>
      {SIDEBAR_VIEWS.map((v, i) => {
        const n = v === 'inbox' ? counts.inbox : v === 'unread' ? counts.unread : v === 'starred' ? counts.starred : v === 'archived' ? counts.archived : undefined;
        return (
          <div
            key={v}
            className={`side-item ${view === v ? 'current' : ''} ${active && idx === i ? 'cursor' : ''}`}
            data-cursor={active && idx === i ? 'true' : undefined}
            onClick={() => {
              setSidebarIndex(i);
              useFoz.getState().setView(v);
            }}
          >
            <span className="side-label">{VIEW_LABEL[v]}</span>
            <span className="side-count">{n != null && n > 0 ? n : ''}</span>
            <kbd>{VIEW_KEY[v]}</kbd>
          </div>
        );
      })}

      <div className="section-title">Providers</div>
      <div
        className={`side-item ${!provider ? 'current' : ''} ${active && idx === SIDEBAR_VIEWS.length ? 'cursor' : ''}`}
        data-cursor={active && idx === SIDEBAR_VIEWS.length ? 'true' : undefined}
        onClick={() => {
          setSidebarIndex(SIDEBAR_VIEWS.length);
          useFoz.getState().setProvider(undefined);
        }}
      >
        <span className="side-label">Todos</span>
        <span className="side-count" />
        <kbd>g0</kbd>
      </div>
      {providers.map((p, i) => {
        const meta = PROVIDER_META[p];
        const unread = counts.byProvider[p] ?? 0;
        const rowIdx = SIDEBAR_VIEWS.length + 1 + i;
        return (
          <div
            key={p}
            className={`side-item ${provider === p ? 'current' : ''} ${active && idx === rowIdx ? 'cursor' : ''}`}
            data-cursor={active && idx === rowIdx ? 'true' : undefined}
            onClick={() => {
              setSidebarIndex(rowIdx);
              useFoz.getState().setProvider(p);
            }}
          >
            <span className="glyph" style={{ color: meta.color }}>{meta.glyph}</span>
            <span className="side-label">{meta.label}</span>
            <span className="side-count">{unread > 0 ? unread : ''}</span>
            <kbd>g{i + 1}</kbd>
          </div>
        );
      })}

      <div className="section-title">Accounts</div>
      {accounts.map((a) => (
        <div key={a.id} className="side-account" title={a.error ?? a.status}>
          <span className={`dot ${a.status === 'connected' ? 'ok' : a.status === 'error' ? 'bad' : 'warn'} ${syncing.has(a.id) ? 'pulse' : ''}`} />
          <span className="side-label ellipsis">{a.label}</span>
        </div>
      ))}
      {!accounts.length && <div className="muted small">nenhuma conta · veja .env.example</div>}

      <div className="sidebar-foot muted small">
        <kbd>?</kbd> ajuda · <kbd>:</kbd> comandos
      </div>
    </aside>
  );
}
