# Architecture

```
┌──────────────┐   HTTP /api/*   ┌──────────────────────┐   adapters   ┌────────┐
│  apps/web    │◄───────────────►│  apps/server (Hono)  │◄────────────►│ Slack  │
│  React + vim │   WS  /ws       │  SyncEngine + SQLite │              │ Gmail  │
│  keymap      │◄────────────────│  events fan-out      │              │ Demo…  │
└──────────────┘                 └──────────────────────┘              └────────┘
        ▲
        │ packages/core: types, key notation, Keymap engine, default keymap
```

## packages/core

- `types.ts` — `Account`, `Conversation`, `Message`, `FozEvent`. Every provider
  is normalised into these; the UI never sees provider payloads.
- `keys.ts` — vim key notation (`<C-d>`, `<Leader>`…) and `keyFromEvent` for
  browser `KeyboardEvent`s.
- `keymap.ts` — a trie-based modal keymap: chords, count prefixes, ambiguous
  prefix timeouts (`flush`), runtime `add`/`remove`. Pure, unit-tested.
- `default-keymap.ts` — the defaults shown by `?`.

## apps/server

- `config.ts` — defaults ← `foz.config.json` ← env/.env. Demo auto-enables
  when no real account is configured.
- `store.ts` — better-sqlite3, three tables (`conversations`, `messages`,
  `sync_state`), filter queries for views/providers/search.
- `sync.ts` — owns adapters; polls, diffs, persists, emits `FozEvent`s.
  Local flags (archive/star/unread) survive re-syncs for providers that have
  no server-side notion of them.
- `api.ts` — REST: `/api/state`, `/api/conversations`, messages, read/archive/
  star, `/api/sync`, `/api/demo/reset`. `main.ts` adds the WebSocket at `/ws`
  and serves `apps/web/dist` when present.
- `keymap.ts` — merges `foz.keymap.json` (bindings + unbind) with the defaults.
- `cli.ts` — `pnpm foz status | auth gmail | auth slack`.

## apps/web

- `store.ts` (zustand) — all UI state: mode, focus pane, view/provider/query,
  cursor, selection, open thread, messages, drafts, cmdline, finder, toast.
  `handleEvent` applies WebSocket events incrementally.
- `keys.ts` — one capturing `keydown` listener feeds the `Keymap`; matched
  keys run an action, pending chords show in the statusline, everything else
  falls through to the browser (typing in INSERT, Cmd-C…).
- `actions.ts` — action registry (`nav.*`, `conv.*`, `go.*`, `finder.*`…).
  Navigation is pane-aware.
- `commands.ts` — `:` commands incl. `:map`/`:unmap` at runtime.
- `components/` — `Sidebar`, `ConversationList`, `Thread` (+ composer),
  `StatusLine` (mode badge, cmdline, toast, pending keys), `Finder`, `Help`.

## Testing

- `pnpm test` — vitest: keymap engine, store + sync with the demo adapter,
  Gmail MIME/address parsing.
- `pnpm e2e` — Playwright drives the built app purely by keyboard (38 checks)
  against a demo server started with `FOZ_DEMO_LIVE=0`.
