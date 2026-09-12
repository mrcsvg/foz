import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Conversation } from '@foz/core';
import { api } from '../api';
import { fuzzyFilter } from '../fuzzy';
import { PROVIDER_META, relTime } from '../format';
import { useFoz } from '../store';

/** Telescope-style fuzzy finder over every conversation (all views). */
export function Finder() {
  const { finder } = useFoz(useShallow((s) => ({ finder: s.finder })));
  const [all, setAll] = useState<Conversation[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!finder.open) return;
    void api.conversations({ view: 'all', limit: 1000 }).then(setAll).catch(() => setAll([]));
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [finder.open]);

  const results = useMemo(
    () => fuzzyFilter(finder.query, all, (c) => `${c.title} ${c.participants.map((p) => p.name).join(' ')} ${c.provider}`).slice(0, 50),
    [finder.query, all],
  );
  const index = Math.min(finder.index, Math.max(0, results.length - 1));

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-fi="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  useEffect(() => {
    const onSelect = () => {
      const c = results[index];
      const s = useFoz.getState();
      if (!c) return;
      const purpose = s.finder.purpose;
      s.closeFinder();
      // Make sure the target is visible in the list: switch to "all" if needed.
      if (!s.conversations.some((x) => x.id === c.id)) {
        s.setProvider(undefined);
        s.setView(c.archived ? 'all' : 'inbox');
      }
      void s.openConversation(c.id).then(() => {
        if (purpose === 'compose') useFoz.getState().setMode('insert');
      });
    };
    window.addEventListener('foz:finder-select', onSelect);
    return () => window.removeEventListener('foz:finder-select', onSelect);
  }, [results, index]);

  if (!finder.open) return null;

  return (
    <div className="overlay" onClick={() => useFoz.getState().closeFinder()}>
      <div className="finder" onClick={(e) => e.stopPropagation()}>
        <div className="finder-input">
          <span className="cmd-prefix">{finder.purpose === 'compose' ? '✎ ' : '> '}</span>
          <input
            ref={inputRef}
            value={finder.query}
            placeholder={finder.purpose === 'compose' ? 'escrever para…' : 'conversas…'}
            onChange={(e) => useFoz.getState().setFinder({ query: e.target.value, index: 0 })}
            spellCheck={false}
          />
          <span className="muted small">{results.length}/{all.length}</span>
        </div>
        <div className="finder-list" ref={listRef}>
          {results.map((c, i) => {
            const meta = PROVIDER_META[c.provider];
            return (
              <div
                key={c.id}
                className={`finder-row ${i === index ? 'cursor' : ''}`}
                data-fi={i}
                onMouseEnter={() => useFoz.getState().setFinder({ index: i })}
                onClick={() => window.dispatchEvent(new CustomEvent('foz:finder-select'))}
              >
                <span className="glyph" style={{ color: meta.color }}>{meta.glyph}</span>
                <span className="finder-title ellipsis">{c.title}</span>
                <span className="muted small ellipsis">{c.participants.map((p) => p.name).join(', ')}</span>
                <span className="muted small">{c.archived ? 'arquivada · ' : ''}{relTime(c.lastMessageAt)}</span>
              </div>
            );
          })}
          {!results.length && <div className="muted small" style={{ padding: 12 }}>nenhum resultado</div>}
        </div>
      </div>
    </div>
  );
}
