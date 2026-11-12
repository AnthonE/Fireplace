#!/usr/bin/env node
// Chat online: a relay on Party's sim (or with --arena the arena's), AI
// players through its native door who never ask for chat, three sessions at
// that door who do (two players and a spectator: net/gate.mjs chatter), and
// Chrome pages with an AI at the controls and the chat's own keys pressed.
// Passes when a line one session says reaches every session that asked, the
// speaker's own included, with its slot; a line typed in a page (/, the
// words, Enter) reaches the other page's log and the sessions at the door;
// control characters, a line past 120 bytes and a listed word come out
// cleaned; of twelve lines sent at once three go on and the relay drops
// nine; the spectator hears the room and its own line goes nowhere; a page
// that mutes a slot stops showing it while the other still does; a room
// started with --no-chat says so and carries nothing; in Party a line was
// drawn over a ball; and every interval hash the referee checked was equal,
// every bot in. traces/chat.png is a page's frame with its log over it.
//   node net/run-chat.mjs [--arena] [--bots 6] [--chrome 2] [--seconds 45] [--res 640x400] [--port 4433: the relay's, its native door the next, the --no-chat room's the two after]
//                         [--web 0: the page server's port, any free one by default]
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { serve } from '../tools/serve.mjs';
import * as W from './wire.mjs';
import { CHAT_MAX } from './chat.mjs';
import { argv, opt, sleep, setup, relay, botHost, chatter, finish } from './gate.mjs';

const game = argv.includes('--arena') ? 'arena' : 'party';
const nbots = Number(opt('bots', 6));
const chrome = Number(opt('chrome', 2));
const seconds = Number(opt('seconds', 45));
const res = opt('res', '640x400');
const port = Number(opt('port', 4433));
const LOCAL_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const hash = setup('.');
const wasm = `build/${game}/game.wasm`;
const prefix = await W.wasmPrefix(readFileSync(wasm));
const room = relay('traces/chat.relay.json', ['--port', String(port), '--native-port', String(port + 1), '--seed', '7', '--wasm', wasm, '--duration', String(seconds + 60)]);
const quiet = relay('traces/chat.quiet.json', ['--port', String(port + 2), '--native-port', String(port + 3), '--wasm', wasm, '--no-chat', '--duration', String(seconds + 60)]);
await sleep(1500);
const bots = nbots ? botHost('traces/chat.bots.json', [`--${game}`, '--relay', `127.0.0.1:${port + 1}`, '--bots', String(nbots), '--seconds', String(seconds + 30)]) : null;

const report = { game, bots: nbots, chrome, seconds, errors: [] };
const t0 = Date.now();
const until = async (fn, ms = 5000) => { for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(100)) if (await fn()) return true; return false; };
const has = (list, slot, text) => list.some((l) => l.slot === slot && l.text === text);

let browser = null, server = null;
const pages = [];
const sessions = [];
const check = {};
try {
  if (chrome) {
    const require = createRequire(import.meta.url);
    const { chromium } = (() => { for (const n of ['playwright', 'playwright-core']) { try { return require(n); } catch { /* next */ } } throw new Error('playwright not found'); })();
    let webPort;
    ({ server, port: webPort } = await serve({ port: Number(opt('web', 0)) }));
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || (existsSync(LOCAL_CHROMIUM) ? LOCAL_CHROMIUM : undefined),
      args: ['--no-sandbox', '--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--autoplay-policy=no-user-gesture-required'],
    });
    const q = new URLSearchParams({ bot: '1', present: '0', url: `https://127.0.0.1:${port}/`, hash, skill: '0.9', res });
    for (let k = 0; k < chrome; k++) {
      const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
      page.on('console', (m) => { if (m.type() === 'error') { report.errors.push(m.text()); process.stderr.write(`[chrome ${k}] ${m.text()}\n`); } });
      page.on('pageerror', (e) => { report.errors.push(e.message); process.stderr.write(`[chrome ${k}] ${e.message}\n`); });
      await page.goto(`http://127.0.0.1:${webPort}/client/${game}.html?${q}`);
      pages.push(page);
    }
  }
  const state = (p) => p.evaluate(() => ({ ...window.__qa?.state?.(), chat: window.__qa?.chat?.state() ?? null }));
  const logs = () => Promise.all(pages.map(async (p) => (await state(p)).chat.lines));
  // a line through the page's own input, as a person sends one: the input opened, the words in it, Enter
  const sayIn = async (p, text) => {
    await p.evaluate((t) => { window.__qa.chat.open(); document.querySelector('.chat-in').value = t; }, text);
    await p.keyboard.press('Enter');
  };
  check.pagesIn = await until(async () => (await Promise.all(pages.map(state))).every((s) => s.clState === 2 && s.me && s.chat?.status === 'open'), 60000);
  if (!chrome) await sleep(3000);
  const slots = await Promise.all(pages.map(async (p) => (await state(p)).slot));

  // two players and a spectator at the native door, each asking for chat
  const a = await chatter(port + 1, prefix), b = await chatter(port + 1, prefix), watcher = await chatter(port + 1, prefix, { watch: true });
  sessions.push(a, b, watcher);
  check.told = await until(() => a.status === W.CHAT.OPEN && b.status === W.CHAT.OPEN && watcher.status === W.CHAT.LISTEN);

  // a line reaches everyone who asked, its speaker too, with its slot
  const hello = 'hello from the door';
  a.say(hello);
  check.heard = await until(async () => [a, b, watcher].every((s) => has(s.heard, a.slot, hello)) && (await logs()).every((l) => has(l, a.slot, hello)));

  // typed in a page: /, the words, Enter
  if (chrome) {
    const typed = 'typed with the keys';
    await pages[0].bringToFront();
    await pages[0].keyboard.press('Slash');
    report.typing = await pages[0].evaluate(() => window.__qa.chat.typing);
    await pages[0].keyboard.type(typed);
    await pages[0].keyboard.press('Enter');
    check.typed = report.typing && await until(async () => [a, b, watcher].every((s) => has(s.heard, slots[0], typed)) && (await logs()).every((l) => has(l, slots[0], typed)));
  }

  // the spectator's own line goes nowhere
  const hush = 'a spectator speaks';
  watcher.say(hush);

  // twelve at once from b: the first three go on, cleaned; the rest are dropped
  const dirty = ['bells\u0007 and ‮turns\n\tgo ', 'é'.repeat(200), 'what a Bastard of a shot'];
  const clean = ['bells and turns go', 'é'.repeat(CHAT_MAX / 2), 'what a ******* of a shot'];
  for (const d of dirty) b.say(d);
  for (let k = 0; k < 9; k++) b.say(`flood ${k}`);
  await sleep(1500);
  const fromB = a.heard.filter((l) => l.slot === b.slot).map((l) => l.text);
  report.fromFlood = fromB.map((t) => (t.length > 40 ? `${t.slice(0, 40)}… (${Buffer.byteLength(t)} B)` : t));
  check.cleaned = clean.every((t, k) => fromB[k] === t);
  check.floodDropped = fromB.length === 3 && (await logs()).every((l) => l.filter((x) => x.slot === b.slot).length <= 3);
  check.spectatorSilent = ![a, b, watcher].some((s) => s.heard.some((l) => l.text === hush));

  // muted in one page, the other still shows it
  if (chrome >= 2) {
    await pages[1].evaluate((p) => window.__qa.chat.mute(p, true), a.slot);
    const after = 'after the mute';
    a.say(after);
    const got = await until(async () => has((await logs())[0], a.slot, after));
    const there = (await logs())[1];
    check.muted = got && !there.some((l) => l.slot === a.slot);
  }

  // a room with no chat says so, and carries nothing
  const shut = await chatter(port + 3, prefix);
  sessions.push(shut);
  await until(() => shut.status !== -1);
  shut.say('anyone?');
  await sleep(500);
  check.noChatRoom = shut.status === W.CHAT.OFF && shut.heard.length === 0;

  // the rest of the run: each page says a line now and then, and the first frame with one drawn over a head is kept
  let n = 0;
  while (Date.now() - t0 < seconds * 1000) {
    for (const [k, p] of pages.entries()) await sayIn(p, `line ${++n} from page ${k + 1}`);
    for (let k = 0; k < 12 && !report.picture; k++) {
      await sleep(200);
      const st = await Promise.all(pages.map(state));
      const at = st.findIndex((s) => s.said > 0);
      if (at < 0) continue;
      const png = await pages[at].evaluate(() => window.__qa.capture(1));
      if (!png) continue;
      // headless Chrome can't present WebGPU: the frame, read back, goes under the page's own log for the picture
      await pages[at].evaluate((b64) => {
        const i = Object.assign(document.createElement('img'), { id: 'shot', src: `data:image/png;base64,${b64}` });
        i.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;object-fit:contain;z-index:1';
        document.body.append(i);
        window.__qa.chat.open();
        document.querySelector('.chat-in').value = 'typing here';
        return i.decode();
      }, png);
      await pages[at].screenshot({ path: 'traces/chat.png' });
      await pages[at].evaluate(() => { document.getElementById('shot').remove(); window.__qa.chat.close(); });
      report.picture = 'traces/chat.png';
    }
    await sleep(report.picture || !pages.length ? 2500 : 100);
  }
  if (chrome) {
    // playing at the end, give or take a catch-up on a busy machine
    check.pagesKeptUp = await until(async () => (await Promise.all(pages.map(state))).every((s) => s.clState === 2 && !s.error), 8000);
    const end = await Promise.all(pages.map(state));
    report.pages = end.map((s) => ({ slot: s.slot, behind: s.clState !== 2, lines: s.chat.lines.length, muted: s.chat.muted, error: s.error || null }));
    report.pageHashes = await Promise.all(pages.map((p) => p.evaluate(() => window.__qa.hashes.length)));
    if (game === 'party') check.aLineOverABall = !!report.picture;
  }
} finally {
  for (const s of sessions) s.close?.();
  await browser?.close();
  server?.close();
  await bots?.stop('SIGINT');
  await room.stop();
  await quiet.stop();
}
const r = room.result();
const h = bots?.result();
report.relay = r && { sessions: r.sessions, compared: r.compared, agreed: r.agreed, mismatches: r.mismatches, chat: r.chat };
report.gate = {
  ...check,
  relayDropped: !!r && r.chat.dropped >= 9,
  everyBotIn: !nbots || (!!h && h.joined === nbots && !h.errors.length),
  refereeChecked: !!r && r.compared >= 4 * (nbots + chrome),
  hashesAgree: !!r && r.mismatches.length === 0 && r.agreed === r.compared,
  noErrors: report.errors.length === 0,
};
finish('chat', report);
