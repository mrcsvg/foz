/**
 * Keyboard-driven end-to-end smoke test.
 *   pnpm build && FOZ_DEMO=1 pnpm start   # in another terminal
 *   pnpm e2e                              # drives http://localhost:4321 with Playwright
 * Screenshots land in ./data/e2e/.
 */
import fs from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.FOZ_URL ?? 'http://localhost:4321';
const OUT = 'data/e2e';
fs.mkdirSync(OUT, { recursive: true });
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });

const browser = await chromium.launch().catch(async (err) => {
  // Fall back to any pre-installed Chromium (CI images often pin one).
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '';
  const candidates = root && fs.existsSync(root)
    ? fs.readdirSync(root).filter((d) => d.startsWith('chromium-')).map((d) => `${root}/${d}/chrome-linux/chrome`).filter((p) => fs.existsSync(p))
    : [];
  const executablePath = process.env.FOZ_CHROME ?? candidates[0];
  if (!executablePath) throw err;
  return chromium.launch({ executablePath });
});
const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

const status = async () => (await page.locator('.statusline').innerText()).replace(/\s+/g, ' ').trim();
const cursorTitle = async () => page.locator('.list .row.cursor .row-title').innerText();
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) process.exitCode = 1; };

// Fresh demo state so runs are independent (server must be in demo mode).
await fetch(`${BASE}/api/demo/reset`, { method: 'POST' }).catch(() => undefined);
await page.goto(`${BASE}/`);
await page.waitForSelector('.list .row');
await shot('shot-1-inbox');
const rows = await page.locator('.list .row').count();
check(rows >= 10, `inbox rendered ${rows} rows`);
check((await status()).includes('NORMAL'), 'statusline shows NORMAL');

const first = await cursorTitle();
await page.keyboard.press('j'); await page.keyboard.press('j');
check((await cursorTitle()) !== first, 'j moves cursor');
await page.keyboard.type('3k');
check((await cursorTitle()) === first, '3k count prefix returns to top');
await page.keyboard.press('G');
check((await status()).includes(`${rows}/${rows}`), 'G goes to bottom');
await page.keyboard.type('gg');
check((await status()).includes(`1/${rows}`), 'gg goes to top');

// open thread
await page.keyboard.press('Enter');
await page.waitForSelector('.thread .msg');
const msgs = await page.locator('.thread .msg').count();
check(msgs > 0, `Enter opens thread with ${msgs} messages`);
check(await page.locator('.thread.pane.focused').count() === 1, 'focus moved to thread');
await shot('shot-2-thread');

// message cursor + yank
await page.keyboard.press('k');
check(await page.locator('.thread .msg.cursor').count() === 1, 'k moves message cursor in thread');

// reply insert mode
await page.keyboard.press('i');
await page.waitForTimeout(100);
check((await status()).includes('INSERT'), 'i enters INSERT');
await page.keyboard.type('Fechado, subo o hotfix em 20 min');
await page.keyboard.press('Control+Enter');
await page.waitForFunction(() => document.querySelector('.statusline')?.textContent?.includes('enviado'));
check(true, 'Ctrl+Enter sends (statusline says enviado)');
const lastMsg = await page.locator('.thread .msg').last().innerText();
check(lastMsg.includes('Fechado, subo o hotfix'), 'sent message appears in thread');
await shot('shot-3-sent');
await page.keyboard.press('Escape');
await page.waitForTimeout(50);
check((await status()).includes('NORMAL'), 'Esc back to NORMAL');

// with FOZ_DEMO_LIVE (default on) the demo provider answers in a few seconds over the WebSocket
if (process.env.FOZ_LIVE !== '0') {
  const n = await page.locator('.thread .msg').count();
  await page.waitForFunction((n) => document.querySelectorAll('.thread .msg').length > n, n, { timeout: 15000 });
  check(true, 'live reply arrived over WebSocket and rendered in the open thread');
}

// J opens next conversation
const t1 = await page.locator('.thread .pane-title').innerText();
await page.keyboard.press('Shift+J');
await page.waitForTimeout(200);
const t2 = await page.locator('.thread .pane-title').innerText();
check(t1 !== t2, `J opens next conversation (${t1} -> ${t2})`);

// h back to list, e archives
await page.keyboard.press('h');
check(await page.locator('.list.pane.focused').count() === 1, 'h focuses list');
const before = await page.locator('.list .row').count();
await page.keyboard.press('e');
await page.waitForFunction((n) => document.querySelectorAll('.list .row').length === n - 1, before);
check(true, 'e archives current conversation');
await page.keyboard.type('ga');
await page.waitForFunction(() => document.querySelector('.list .pane-title')?.textContent?.includes('archived'));
check(true, 'ga shows archived view');
check((await page.locator('.list .row').count()) >= 3, 'archived view lists archived rows');
await page.keyboard.type('gi');
await page.waitForFunction(() => document.querySelector('.list .pane-title')?.textContent?.includes('inbox'));

// star + unread toggles
const starredBefore = await page.locator('.list .row.cursor .star').count();
await page.keyboard.press('s');
await page.waitForFunction((n) => document.querySelectorAll('.list .row.cursor .star').length !== n, starredBefore);
check(true, 's toggles star');
const unreadBefore = await page.locator('.list .row.cursor.unread').count();
await page.keyboard.press('u');
await page.waitForFunction((n) => document.querySelectorAll('.list .row.cursor.unread').length !== n, unreadBefore);
check(true, 'u toggles unread');

// provider cycle
await page.keyboard.press('Tab');
await page.waitForTimeout(150);
const pt = await page.locator('.list .pane-title').innerText();
check(pt.includes('·'), `Tab cycles provider filter (${pt})`);
await page.keyboard.type('g0');
await page.waitForTimeout(150);
check(!(await page.locator('.list .pane-title').innerText()).includes('·'), 'g0 clears provider');

// search
await page.keyboard.press('/');
await page.keyboard.type('nubank');
await page.waitForFunction(() => document.querySelectorAll('.list .row').length === 1);
await page.keyboard.press('Enter');
await page.waitForTimeout(100);
check((await cursorTitle()).includes('Nubank'), '/nubank filters to Nubank thread');
await page.keyboard.press('Escape');
await page.waitForFunction(() => document.querySelectorAll('.list .row').length > 5);
check(true, 'Esc clears search');

// finder
await page.keyboard.press('Control+p');
await page.waitForSelector('.finder');
await page.keyboard.type('trilha');
await page.waitForTimeout(100);
await shot('shot-4-finder');
await page.keyboard.press('Enter');
await page.waitForFunction(() => document.querySelector('.thread .pane-title')?.textContent?.includes('Trilha'));
check(true, 'Ctrl-p finder opens Trilha conversation');

// command line
await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
await page.keyboard.press(':');
await page.keyboard.type('unr');
await page.keyboard.press('Tab');
await page.keyboard.press('Enter');
await page.waitForFunction(() => document.querySelector('.list .pane-title')?.textContent?.includes('unread'));
check(true, ':unr<Tab><Enter> completes to :unread');
await page.keyboard.press(':');
await page.keyboard.type('map normal <Leader>z go.view inbox');
await page.keyboard.press('Enter');
await page.waitForTimeout(100);
await page.keyboard.press(' '); await page.keyboard.press('z');
await page.waitForFunction(() => document.querySelector('.list .pane-title')?.textContent?.includes('inbox'));
check(true, ':map at runtime works (<Leader>z -> inbox)');
await page.keyboard.press(':');
await page.keyboard.type('nope');
await page.keyboard.press('Enter');
await page.waitForTimeout(100);
check((await status()).includes('E492'), 'unknown command reports E492');

// help
await page.keyboard.press('?');
await page.waitForSelector('.help');
await shot('shot-5-help');
check((await status()).includes('HELP'), '? opens help');
await page.keyboard.press('q');
await page.waitForTimeout(100);
check(await page.locator('.help').count() === 0, 'q closes help');

// selection batch
await page.keyboard.type('gg');
await page.keyboard.press('x'); await page.keyboard.press('j'); await page.keyboard.press('x');
await page.waitForTimeout(50);
check(await page.locator('.list .row.selected').count() === 2, 'x selects two rows');
check((await status()).includes('2 sel'), 'statusline shows selection count');
await page.keyboard.press('Escape');
check(await page.locator('.list .row.selected').count() === 0, 'Esc clears selection');

// sidebar nav
await page.keyboard.press('h'); await page.keyboard.press('h');
check(await page.locator('.sidebar.pane.focused').count() === 1, 'h h focuses sidebar');
await page.keyboard.press('j'); await page.keyboard.press('j'); await page.keyboard.press('Enter');
await page.waitForFunction(() => document.querySelector('.list .pane-title')?.textContent?.includes('starred'));
check(true, 'sidebar j j Enter -> starred');
await page.keyboard.press('l');
await page.keyboard.type('gi');
await page.waitForTimeout(150);

// live event via API from another client
await page.keyboard.press('Space'); await page.keyboard.press('r');
await page.waitForTimeout(400);
check((await status()).includes('sync'), '<Leader>r triggers sync');

check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
await shot('shot-6-final');
await browser.close();
