import type { KeymapConfig } from './keymap.js';

/**
 * Default bindings. Users override/extend these in `foz.keymap.json` at the
 * repo root (same shape). Action names are resolved by the UI action registry.
 */
export const DEFAULT_KEYMAP: KeymapConfig = {
  leader: '<Space>',
  bindings: [
    // ── movement (pane-aware: list cursor, message cursor or sidebar) ──
    { mode: 'normal', keys: 'j', action: 'nav.down', desc: 'Down' },
    { mode: 'normal', keys: 'k', action: 'nav.up', desc: 'Up' },
    { mode: 'normal', keys: '<Down>', action: 'nav.down' },
    { mode: 'normal', keys: '<Up>', action: 'nav.up' },
    { mode: 'normal', keys: 'gg', action: 'nav.top', desc: 'Top' },
    { mode: 'normal', keys: 'G', action: 'nav.bottom', desc: 'Bottom' },
    { mode: 'normal', keys: '<C-d>', action: 'nav.pageDown', desc: 'Half page down' },
    { mode: 'normal', keys: '<C-u>', action: 'nav.pageUp', desc: 'Half page up' },
    { mode: 'normal', keys: 'zz', action: 'nav.center', desc: 'Center cursor' },

    // ── panes ──
    { mode: 'normal', keys: 'h', action: 'pane.left', desc: 'Focus pane to the left' },
    { mode: 'normal', keys: 'l', action: 'pane.right', desc: 'Focus pane to the right' },
    { mode: 'normal', keys: '<C-h>', action: 'pane.left' },
    { mode: 'normal', keys: '<C-l>', action: 'pane.right' },
    { mode: 'normal', keys: '<Left>', action: 'pane.left' },
    { mode: 'normal', keys: '<Right>', action: 'pane.right' },
    { mode: 'normal', keys: '<Leader>b', action: 'sidebar.toggle', desc: 'Toggle sidebar' },

    // ── conversations ──
    { mode: 'normal', keys: '<CR>', action: 'conv.open', desc: 'Open conversation' },
    { mode: 'normal', keys: 'J', action: 'conv.next', desc: 'Open next conversation' },
    { mode: 'normal', keys: 'K', action: 'conv.prev', desc: 'Open previous conversation' },
    { mode: 'normal', keys: 'e', action: 'conv.archive', desc: 'Archive' },
    { mode: 'normal', keys: 'dd', action: 'conv.archive', desc: 'Archive (delete-ish)' },
    { mode: 'normal', keys: 'u', action: 'conv.toggleUnread', desc: 'Toggle unread' },
    { mode: 'normal', keys: 's', action: 'conv.toggleStar', desc: 'Toggle star' },
    { mode: 'normal', keys: 'x', action: 'conv.toggleSelect', desc: 'Select / unselect' },
    { mode: 'normal', keys: 'V', action: 'conv.selectAll', desc: 'Select all visible' },
    { mode: 'normal', keys: '<Esc>', action: 'escape', desc: 'Back / clear' },
    { mode: 'normal', keys: 'q', action: 'escape' },
    { mode: 'normal', keys: 'yy', action: 'yank', desc: 'Yank message / link' },
    { mode: 'normal', keys: 'o', action: 'conv.openNative', desc: 'Open in native app' },

    // ── replying ──
    { mode: 'normal', keys: 'i', action: 'reply', desc: 'Reply (insert mode)' },
    { mode: 'normal', keys: 'r', action: 'reply' },
    { mode: 'normal', keys: 'a', action: 'reply' },
    { mode: 'normal', keys: 'c', action: 'compose', desc: 'Compose to…' },
    { mode: 'insert', keys: '<Esc>', action: 'insert.exit', desc: 'Back to normal' },
    { mode: 'insert', keys: '<C-c>', action: 'insert.exit' },
    { mode: 'insert', keys: '<C-CR>', action: 'compose.send', desc: 'Send' },
    { mode: 'insert', keys: '<C-s>', action: 'compose.send' },
    { mode: 'insert', keys: '<M-CR>', action: 'compose.send' },

    // ── go to ──
    { mode: 'normal', keys: 'gi', action: 'go.view', arg: 'inbox', desc: 'Inbox' },
    { mode: 'normal', keys: 'gu', action: 'go.view', arg: 'unread', desc: 'Unread' },
    { mode: 'normal', keys: 'gs', action: 'go.view', arg: 'starred', desc: 'Starred' },
    { mode: 'normal', keys: 'ga', action: 'go.view', arg: 'archived', desc: 'Archived' },
    { mode: 'normal', keys: 'ge', action: 'go.view', arg: 'all', desc: 'Everything' },
    { mode: 'normal', keys: 'g0', action: 'go.provider', arg: 0, desc: 'All providers' },
    { mode: 'normal', keys: 'g1', action: 'go.provider', arg: 1, desc: 'Provider 1' },
    { mode: 'normal', keys: 'g2', action: 'go.provider', arg: 2, desc: 'Provider 2' },
    { mode: 'normal', keys: 'g3', action: 'go.provider', arg: 3, desc: 'Provider 3' },
    { mode: 'normal', keys: 'g4', action: 'go.provider', arg: 4, desc: 'Provider 4' },
    { mode: 'normal', keys: 'g5', action: 'go.provider', arg: 5, desc: 'Provider 5' },
    { mode: 'normal', keys: '<Tab>', action: 'provider.cycle', arg: 1, desc: 'Next provider' },
    { mode: 'normal', keys: '<S-Tab>', action: 'provider.cycle', arg: -1, desc: 'Previous provider' },

    // ── search / command / finder ──
    { mode: 'normal', keys: '/', action: 'search.open', desc: 'Search' },
    { mode: 'normal', keys: 'n', action: 'search.next', desc: 'Next match' },
    { mode: 'normal', keys: 'N', action: 'search.prev', desc: 'Previous match' },
    { mode: 'normal', keys: ':', action: 'command.open', desc: 'Command line' },
    { mode: 'normal', keys: '<Leader>f', action: 'finder.open', desc: 'Find conversation' },
    { mode: 'normal', keys: '<C-p>', action: 'finder.open' },
    { mode: 'normal', keys: '<Leader>r', action: 'sync.now', desc: 'Sync now' },
    { mode: 'normal', keys: '?', action: 'help.toggle', desc: 'Help' },
    { mode: 'normal', keys: '<Leader>?', action: 'help.toggle' },

    // ── command line ──
    { mode: ['command', 'search'], keys: '<Esc>', action: 'cmdline.cancel' },
    { mode: ['command', 'search'], keys: '<C-c>', action: 'cmdline.cancel' },
    { mode: ['command', 'search'], keys: '<CR>', action: 'cmdline.submit' },
    { mode: 'command', keys: '<Tab>', action: 'cmdline.complete' },
    { mode: ['command', 'search'], keys: '<Up>', action: 'cmdline.historyPrev' },
    { mode: ['command', 'search'], keys: '<Down>', action: 'cmdline.historyNext' },
    { mode: ['command', 'search'], keys: '<C-p>', action: 'cmdline.historyPrev' },
    { mode: ['command', 'search'], keys: '<C-n>', action: 'cmdline.historyNext' },

    // ── finder (telescope-ish) ──
    { mode: 'finder', keys: '<Esc>', action: 'finder.cancel' },
    { mode: 'finder', keys: '<C-c>', action: 'finder.cancel' },
    { mode: 'finder', keys: '<CR>', action: 'finder.select' },
    { mode: 'finder', keys: '<C-j>', action: 'finder.down' },
    { mode: 'finder', keys: '<C-n>', action: 'finder.down' },
    { mode: 'finder', keys: '<Down>', action: 'finder.down' },
    { mode: 'finder', keys: '<Tab>', action: 'finder.down' },
    { mode: 'finder', keys: '<C-k>', action: 'finder.up' },
    { mode: 'finder', keys: '<C-p>', action: 'finder.up' },
    { mode: 'finder', keys: '<Up>', action: 'finder.up' },
    { mode: 'finder', keys: '<S-Tab>', action: 'finder.up' },

    // ── help ──
    { mode: 'help', keys: '<Esc>', action: 'help.toggle' },
    { mode: 'help', keys: 'q', action: 'help.toggle' },
    { mode: 'help', keys: '?', action: 'help.toggle' },
    { mode: 'help', keys: 'j', action: 'nav.down' },
    { mode: 'help', keys: 'k', action: 'nav.up' },
  ],
};
