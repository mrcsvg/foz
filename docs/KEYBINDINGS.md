# Keybindings

Foz is modal. The statusline shows the mode; `?` shows this table live,
including anything you remapped.

Notation is vim's: `<C-d>` control, `<S-Tab>` shift, `<M-x>` alt/meta,
`<CR>` enter, `<Esc>`, `<Space>`, `<Leader>` (space by default).
Counts work in normal mode: `3j`, `5x`, `2J`.

## Normal

| Keys | Action | Notes |
| --- | --- | --- |
| `j` / `k` / `<Down>` / `<Up>` | `nav.down` / `nav.up` | pane-aware: list rows, thread messages, or sidebar items |
| `gg` / `G` | `nav.top` / `nav.bottom` | |
| `<C-d>` / `<C-u>` | `nav.pageDown` / `nav.pageUp` | 10 rows |
| `zz` | `nav.center` | scroll cursor to center |
| `h` / `l` / `<C-h>` / `<C-l>` / `<Left>` / `<Right>` | `pane.left` / `pane.right` | sidebar ⇄ list ⇄ thread; `l` on a row opens it |
| `<Leader>b` | `sidebar.toggle` | |
| `<CR>` | `conv.open` | in the sidebar: activate the item |
| `J` / `K` | `conv.next` / `conv.prev` | open next / previous without leaving the thread |
| `e` / `dd` | `conv.archive` | toggles: un-archives in the archived view |
| `u` | `conv.toggleUnread` | |
| `s` | `conv.toggleStar` | |
| `x` / `V` | `conv.toggleSelect` / `conv.selectAll` | then `e` `u` `s` act on the selection |
| `<Esc>` / `q` | `escape` | close help → clear selection → clear search → back to list → close thread → clear provider |
| `yy` | `yank` | message text in the thread, link/title in the list |
| `o` | `conv.openNative` | opens the provider's own URL |
| `i` / `r` / `a` | `reply` | enters INSERT in the composer (opens the row first if needed) |
| `c` | `compose` | finder in "write to…" mode |
| `gi` `gu` `gs` `ga` `ge` | `go.view` inbox/unread/starred/archived/all | |
| `g0` … `g5` | `go.provider` | 0 = all; 1… follow the sidebar order |
| `<Tab>` / `<S-Tab>` | `provider.cycle` | |
| `/` | `search.open` | live filter; `<CR>` keeps it, `<Esc>` clears |
| `n` / `N` | `search.next` / `search.prev` | move through results |
| `:` | `command.open` | |
| `<Leader>f` / `<C-p>` | `finder.open` | fuzzy, across every view |
| `<Leader>r` | `sync.now` | |
| `?` / `<Leader>?` | `help.toggle` | |

## Insert (composer)

| Keys | Action |
| --- | --- |
| `<Esc>` / `<C-c>` | `insert.exit` (draft is kept per conversation) |
| `<C-CR>` / `<C-s>` / `<M-CR>` | `compose.send` |

## Command / Search line

| Keys | Action |
| --- | --- |
| `<CR>` | `cmdline.submit` |
| `<Esc>` / `<C-c>` | `cmdline.cancel` |
| `<Tab>` | `cmdline.complete` (command names) |
| `<Up>` / `<Down>` / `<C-p>` / `<C-n>` | history |

### Commands

`:q` `:sync` `:help` `:inbox` `:unread` `:starred` `:archived` `:all`
`:provider <name|all>` `:slack` `:gmail` `:whatsapp` `:telegram` `:clear`
`:compose` `:find` `:archive` `:unarchive` `:star` `:read` `:markunread`
`:open` `:sidebar` `:accounts` `:version`
`:map <mode> <keys> <action> [arg]` `:unmap <mode> <keys>`

Example: `:map normal <Leader>z go.view inbox`.

## Finder

`<C-j>` / `<C-n>` / `<Down>` / `<Tab>` down · `<C-k>` / `<C-p>` / `<Up>` / `<S-Tab>` up ·
`<CR>` select · `<Esc>` close.

## Customising

`foz.keymap.json` at the repo root is merged over the defaults on every load:

```json
{
  "leader": "<Space>",
  "unbind": [{ "mode": "normal", "keys": "dd" }],
  "bindings": [
    { "mode": "normal", "keys": "<Leader>a", "action": "conv.archive", "desc": "Archive" },
    { "mode": "normal", "keys": "gw", "action": "go.provider", "arg": 3, "desc": "WhatsApp" }
  ]
}
```

Action names are the ones in the tables above (`apps/web/src/actions.ts`
is the registry). Defaults live in `packages/core/src/default-keymap.ts`.
