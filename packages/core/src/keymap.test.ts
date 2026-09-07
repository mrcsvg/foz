import { describe, expect, it } from 'vitest';
import { Keymap } from './keymap.js';
import { keyFromEvent, parseKeys } from './keys.js';
import { DEFAULT_KEYMAP } from './default-keymap.js';

describe('parseKeys', () => {
  it('splits plain chords', () => {
    expect(parseKeys('gg')).toEqual(['g', 'g']);
    expect(parseKeys('dd')).toEqual(['d', 'd']);
  });
  it('keeps angle-bracket tokens intact and canonical', () => {
    expect(parseKeys('<C-d>')).toEqual(['<C-d>']);
    expect(parseKeys('<c-D>')).toEqual(['<C-d>']);
    expect(parseKeys('<S-Tab>')).toEqual(['<S-Tab>']);
    expect(parseKeys('<Space>f')).toEqual(['<Space>', 'f']);
    expect(parseKeys('<cr>')).toEqual(['<CR>']);
  });
});

describe('keyFromEvent', () => {
  it('maps browser events to vim notation', () => {
    expect(keyFromEvent({ key: 'j' })).toBe('j');
    expect(keyFromEvent({ key: 'J', shiftKey: true })).toBe('J');
    expect(keyFromEvent({ key: 'd', ctrlKey: true })).toBe('<C-d>');
    expect(keyFromEvent({ key: 'Enter' })).toBe('<CR>');
    expect(keyFromEvent({ key: 'Enter', ctrlKey: true })).toBe('<C-CR>');
    expect(keyFromEvent({ key: 'Tab', shiftKey: true })).toBe('<S-Tab>');
    expect(keyFromEvent({ key: ' ' })).toBe('<Space>');
    expect(keyFromEvent({ key: 'Shift' })).toBeNull();
    expect(keyFromEvent({ key: '<' })).toBe('<lt>');
  });
});

describe('Keymap', () => {
  const km = () => new Keymap(DEFAULT_KEYMAP);

  it('matches single keys', () => {
    const r = km().press('normal', 'j');
    expect(r).toMatchObject({ status: 'matched', action: 'nav.down', count: null });
  });

  it('waits on prefixes then matches chords', () => {
    const k = km();
    expect(k.press('normal', 'g').status).toBe('pending');
    expect(k.press('normal', 'i')).toMatchObject({ status: 'matched', action: 'go.view', arg: 'inbox' });
  });

  it('reports nomatch and resets', () => {
    const k = km();
    k.press('normal', 'g');
    expect(k.press('normal', 'Z').status).toBe('nomatch');
    expect(k.pending).toEqual([]);
  });

  it('handles count prefixes', () => {
    const k = km();
    expect(k.press('normal', '1').status).toBe('pending');
    expect(k.press('normal', '2').status).toBe('pending');
    expect(k.press('normal', 'j')).toMatchObject({ status: 'matched', action: 'nav.down', count: 12 });
  });

  it('treats digits after g as chord keys, not counts', () => {
    const k = km();
    k.press('normal', 'g');
    expect(k.press('normal', '1')).toMatchObject({ status: 'matched', action: 'go.provider', arg: 1 });
  });

  it('expands <Leader>', () => {
    const k = km();
    k.press('normal', '<Space>');
    expect(k.press('normal', 'f')).toMatchObject({ status: 'matched', action: 'finder.open' });
  });

  it('is mode-aware', () => {
    const k = km();
    expect(k.press('insert', 'j').status).toBe('nomatch');
    expect(k.press('insert', '<Esc>')).toMatchObject({ status: 'matched', action: 'insert.exit' });
  });

  it('supports user overrides via add/remove', () => {
    const k = km();
    k.remove('normal', 'e');
    expect(k.press('normal', 'e').status).toBe('nomatch');
    k.add({ mode: 'normal', keys: '<Leader>x', action: 'custom.thing' });
    k.press('normal', '<Space>');
    expect(k.press('normal', 'x')).toMatchObject({ status: 'matched', action: 'custom.thing' });
  });

  it('flush fires an ambiguous prefix binding on timeout', () => {
    const k = new Keymap({ bindings: [
      { mode: 'normal', keys: 'g', action: 'solo.g' },
      { mode: 'normal', keys: 'gg', action: 'top' },
    ] });
    expect(k.press('normal', 'g').status).toBe('pending');
    expect(k.flush('normal')).toMatchObject({ status: 'matched', action: 'solo.g' });
    k.press('normal', 'g');
    expect(k.press('normal', 'g')).toMatchObject({ status: 'matched', action: 'top' });
  });
});
