import type { ProviderId } from '@foz/core';

export const PROVIDER_META: Record<ProviderId, { glyph: string; label: string; color: string }> = {
  slack: { glyph: '#', label: 'Slack', color: 'var(--slack)' },
  gmail: { glyph: '@', label: 'Gmail', color: 'var(--gmail)' },
  whatsapp: { glyph: 'W', label: 'WhatsApp', color: 'var(--whatsapp)' },
  telegram: { glyph: 'T', label: 'Telegram', color: 'var(--telegram)' },
  discord: { glyph: 'D', label: 'Discord', color: 'var(--discord)' },
  demo: { glyph: '~', label: 'Demo', color: 'var(--muted)' },
};

export function relTime(ts: number, now = Date.now()): string {
  const d = Math.max(0, now - ts);
  const m = Math.floor(d / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d`;
  const date = new Date(ts);
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function clock(ts: number): string {
  const d = new Date(ts);
  const sameDay = new Date().toDateString() === d.toDateString();
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return sameDay ? hm : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${hm}`;
}

const URL_RE = /(https?:\/\/[^\s<>)]+)/g;

/** Split text into plain and link segments for rendering. */
export function linkify(text: string): Array<{ t: 'text' | 'link'; v: string }> {
  const out: Array<{ t: 'text' | 'link'; v: string }> = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    if (m.index! > last) out.push({ t: 'text', v: text.slice(last, m.index) });
    out.push({ t: 'link', v: m[0] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ t: 'text', v: text.slice(last) });
  return out;
}

export function initials(name: string): string {
  const parts = name.replace(/^[#@]/, '').split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}
