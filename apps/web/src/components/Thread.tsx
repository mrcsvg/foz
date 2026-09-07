import { useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Message } from '@foz/core';
import { clock, initials, linkify, PROVIDER_META } from '../format';
import { useFoz } from '../store';

export function Thread() {
  const { openId, conversations, messages, msgCursor, focus, mode, drafts, sending } = useFoz(
    useShallow((s) => ({
      openId: s.openId,
      conversations: s.conversations,
      messages: s.messages,
      msgCursor: s.msgCursor,
      focus: s.focus,
      mode: s.mode,
      drafts: s.drafts,
      sending: s.sending,
    })),
  );
  const conv = conversations.find((c) => c.id === openId);
  const list = openId ? (messages[openId] ?? []) : [];
  const bodyRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const active = focus === 'thread';

  useEffect(() => {
    const el = bodyRef.current?.querySelector<HTMLElement>(`[data-mi="${msgCursor}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [msgCursor, list.length]);

  useEffect(() => {
    if (mode === 'insert') taRef.current?.focus();
    else taRef.current?.blur();
  }, [mode, openId]);

  if (!openId || !conv) {
    return (
      <section className="thread pane empty-thread">
        <div className="empty">
          <pre className="logo small-logo">{LOGO}</pre>
          <div className="muted">
            <kbd>j</kbd>/<kbd>k</kbd> navegar · <kbd>Enter</kbd> abrir · <kbd>i</kbd> responder · <kbd>?</kbd> ajuda
          </div>
        </div>
      </section>
    );
  }

  const meta = PROVIDER_META[conv.provider];
  const draft = drafts[openId] ?? '';

  return (
    <section className={`thread pane ${active ? 'focused' : ''}`}>
      <header className="pane-head">
        <span className="glyph" style={{ color: meta.color }}>{meta.glyph}</span>
        <span className="pane-title ellipsis">{conv.title}</span>
        <span className="pane-sub ellipsis">{conv.participants.map((p) => p.name).join(', ')}</span>
        <span className="pane-right muted">
          {conv.starred && <span className="star">★ </span>}
          {conv.kind}
        </span>
      </header>
      <div className="thread-body" ref={bodyRef}>
        {list.map((m, i) => (
          <MessageRow key={m.id} m={m} isCursor={i === msgCursor && active} index={i} prev={list[i - 1]} />
        ))}
        {!list.length && <div className="muted small" style={{ padding: 16 }}>carregando…</div>}
      </div>
      <div className={`composer ${mode === 'insert' ? 'insert' : ''}`}>
        <textarea
          ref={taRef}
          value={draft}
          placeholder={mode === 'insert' ? `responder em ${conv.title} · ⌃Enter envia · Esc volta` : 'i para responder'}
          onChange={(e) => useFoz.getState().setDraft(openId, e.target.value)}
          onFocus={() => {
            if (useFoz.getState().mode !== 'insert') useFoz.getState().setMode('insert');
          }}
          rows={Math.min(8, Math.max(2, draft.split('\n').length))}
          disabled={sending}
        />
        <div className="composer-foot muted small">
          {sending ? 'enviando…' : mode === 'insert' ? '-- INSERT --  ⌃Enter / ⌃s envia' : `${conv.provider} · ${draft ? 'rascunho salvo' : ''}`}
        </div>
      </div>
    </section>
  );
}

function MessageRow({ m, isCursor, index, prev }: { m: Message; isCursor: boolean; index: number; prev?: Message }) {
  const grouped = prev && prev.from.id === m.from.id && m.ts - prev.ts < 5 * 60_000 && !m.subject;
  return (
    <div className={`msg ${m.isMine ? 'mine' : ''} ${isCursor ? 'cursor' : ''} ${grouped ? 'grouped' : ''}`} data-mi={index} data-cursor={isCursor ? 'true' : undefined}>
      {!grouped && (
        <div className="msg-head">
          <span className="avatar" data-mine={m.isMine}>{initials(m.from.name)}</span>
          <span className="msg-from">{m.from.name}</span>
          {m.from.handle && <span className="muted small">{m.from.handle}</span>}
          <span className="msg-time muted">{clock(m.ts)}</span>
          {m.status === 'sending' && <span className="muted small">enviando…</span>}
          {m.status === 'failed' && <span className="bad small">falhou</span>}
        </div>
      )}
      {m.subject && index === 0 && <div className="msg-subject">{m.subject}</div>}
      <div className="msg-text">
        {linkify(m.text).map((seg, i) =>
          seg.t === 'link' ? (
            <a key={i} href={seg.v} target="_blank" rel="noreferrer noopener">{seg.v}</a>
          ) : (
            <span key={i}>{seg.v}</span>
          ),
        )}
      </div>
      {m.attachments.length > 0 && (
        <div className="attachments">
          {m.attachments.map((a) => (
            <span key={a.id} className="attachment">📎 {a.name}{a.size ? ` · ${Math.round(a.size / 1024)}k` : ''}</span>
          ))}
        </div>
      )}
    </div>
  );
}

const LOGO = String.raw`
  __
 / _| ___ ____
| |_ / _ \_  /
|  _| (_) / /
|_|  \___/___|
`;
