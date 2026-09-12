import { useEffect, useRef } from 'react';
import { PROVIDER_META, relTime } from '../format';
import { useFoz } from '../store';
import { useShallow } from 'zustand/react/shallow';

export function ConversationList() {
  const { conversations, cursor, selected, openId, focus, view, provider, query } = useFoz(useShallow((s) => ({
    conversations: s.conversations,
    cursor: s.cursor,
    selected: s.selected,
    openId: s.openId,
    focus: s.focus,
    view: s.view,
    provider: s.provider,
    query: s.query,
  })));
  const ref = useRef<HTMLDivElement>(null);
  const active = focus === 'list';

  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [cursor, conversations]);

  return (
    <section className={`list pane ${active ? 'focused' : ''}`}>
      <header className="pane-head">
        <span className="pane-title">{view}{provider ? ` · ${provider}` : ''}</span>
        {query && <span className="pane-sub">/{query}</span>}
        <span className="pane-right muted">{conversations.length ? `${cursor + 1}/${conversations.length}` : '0'}</span>
      </header>
      <div className="list-body" ref={ref}>
        {conversations.length === 0 && (
          <div className="empty">
            <div>nada por aqui</div>
            <div className="muted small">{query ? 'nenhum resultado' : 'inbox zero ✨'}</div>
          </div>
        )}
        {conversations.map((c, i) => {
          const meta = PROVIDER_META[c.provider];
          const isCursor = i === cursor;
          const cls = [
            'row',
            isCursor ? 'cursor' : '',
            c.id === openId ? 'open' : '',
            c.unreadCount ? 'unread' : '',
            selected.has(c.id) ? 'selected' : '',
          ].join(' ');
          return (
            <div
              key={c.id}
              className={cls}
              data-index={i}
              data-cursor={isCursor && active ? 'true' : undefined}
              onClick={() => {
                useFoz.getState().setCursor(i);
                void useFoz.getState().openConversation(c.id);
              }}
            >
              <span className="row-mark">{selected.has(c.id) ? '▎' : isCursor && active ? '›' : ' '}</span>
              <span className="glyph" style={{ color: meta.color }} title={meta.label}>{meta.glyph}</span>
              <div className="row-main">
                <div className="row-top">
                  <span className="row-title ellipsis">{c.title}</span>
                  {c.starred && <span className="star">★</span>}
                  <span className="row-time muted">{relTime(c.lastMessageAt)}</span>
                </div>
                <div className="row-bottom">
                  <span className="row-snippet ellipsis">{c.snippet || '—'}</span>
                  {c.unreadCount > 0 && <span className="badge">{c.unreadCount}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
