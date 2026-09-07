# Providers

A provider adapter turns one external account into Foz conversations and
messages. The interface is small on purpose
(`apps/server/src/providers/types.ts`):

```ts
interface ProviderAdapter {
  account: Account;
  tracksUnread?: boolean;               // provider reports unread itself (Gmail)
  start(ctx): Promise<void>;            // auth, warm caches, optional push
  stop(): Promise<void>;
  listConversations(): Promise<Conversation[]>;
  fetchMessages(conv, sinceTs): Promise<Message[]>;
  send(conv, text): Promise<Message>;
  markRead?(conv): Promise<void>;       // absent → Foz keeps the flag locally
  setArchived?(conv, archived): Promise<void>;
  setStarred?(conv, starred): Promise<void>;
}
```

The sync engine (`sync.ts`) polls `listConversations` every `FOZ_POLL_MS`
(30 s), calls `fetchMessages` only for conversations whose `lastMessageAt`
moved, persists to SQLite and fans out WebSocket events. Adapters can also
push (`ctx.onMessage`) for real-time sources.

Register new adapters in `providers/index.ts`.

## Slack (`providers/slack.ts`)

- Auth: a **user token** (`xoxp-…`) so `chat.postMessage` posts as you.
  `pnpm foz auth slack` prints the scopes:
  `channels:history channels:read groups:history groups:read im:history im:read mpim:history mpim:read users:read chat:write`.
- Config: `FOZ_SLACK_TOKEN` (+ optional `FOZ_SLACK_LABEL`) or
  `foz.config.json → slack: [{ token, label }]`. Multiple workspaces = multiple entries.
- Sync: `users.conversations` for membership, then `conversations.history`
  (`limit: 1`) round-robin over 20 channels per poll to find activity, then
  full history for changed ones. Mentions/links are rendered to plain text.
- Read state: `conversations.mark`. Archive/star are local only.
- Upgrade path: Socket Mode with an app-level token for instant delivery.

## Gmail (`providers/gmail.ts`)

- Auth: OAuth2 refresh token. `pnpm foz auth gmail --client-id … --client-secret …`
  runs the loopback flow (Desktop-app client, scope `gmail.modify`) and writes
  `data/gmail-credentials.json`, which the server picks up automatically.
  Env alternative: `FOZ_GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN`.
- Sync: `threads.list` (`in:inbox OR is:starred OR newer_than:3d`, 60 threads),
  `threads.get` only when a thread's `historyId` changed. Labels map to flags:
  `UNREAD` → unread count, `STARRED` → star, no `INBOX` → archived.
- Body: text/plain preferred, quoted replies trimmed, HTML stripped as fallback.
  Attachments are listed (download is a V1 item).
- Send: RFC 822 reply in the same thread with `In-Reply-To`/`References`.
- Read/archive/star call `threads.modify`, so Gmail stays in sync.

## Demo (`providers/demo.ts`)

Seeds four fake accounts (Slack, Gmail, WhatsApp, Telegram) with realistic
Portuguese conversations. Anything you send gets a reply in a few seconds.
`FOZ_DEMO_LIVE=0` turns off the random incoming messages (used by `pnpm e2e`).
`POST /api/demo/reset` re-seeds.

## Planned

- **WhatsApp** via Baileys (QR pairing, pure JS).
- **Telegram** via GramJS (user account, not a bot).
- **Discord** via discord.js user-facing gateway where allowed.
