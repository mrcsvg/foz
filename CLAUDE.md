# foz — notes for agents

- pnpm workspace: `packages/core` (types + keymap engine), `apps/server` (Hono + SQLite + providers), `apps/web` (React).
- Run: `pnpm dev` (server :4321 + Vite :5173). Prod: `pnpm build && pnpm start`.
- Checks before pushing: `pnpm typecheck && pnpm test`, then `pnpm build`, start the server with
  `FOZ_DEMO_LIVE=0 pnpm start` and run `pnpm e2e` (Playwright, keyboard-only; Chromium fallback via `PLAYWRIGHT_BROWSERS_PATH`).
- Keybindings: defaults in `packages/core/src/default-keymap.ts`, actions in `apps/web/src/actions.ts`,
  `:` commands in `apps/web/src/commands.ts`. Keep `docs/KEYBINDINGS.md` in sync when changing them.
- New provider: implement `ProviderAdapter` (`apps/server/src/providers/types.ts`), register in `providers/index.ts`,
  document in `docs/PROVIDERS.md`.
- No credentials in the repo: `.env`, `foz.config.json` and `data/` are gitignored.
