// Fireplace: the living room, the fire going, the TV on. Click and you sit
// down: the camera closes in on the TV until its glass fills the screen and
// you are in the game, whatever the room is playing. Between games it pulls
// back to the room, and the TV shows the marshmallows and what's on next;
// then it closes in again. One host (client/host.mjs) on Fireplace's sim,
// every game's frontend mounted in turn on its own canvas (golf, the arena,
// bumper balls, party, Dogfight); while the room is in view, the game draws into a
// texture the TV shows. B and H, while the room is in view, change your ball
// and hat (client/looks.mjs), which everyone in the room sees; L lists your
// achievements (client/achievements.mjs). Both are kept in this browser.
//   ?theme=<id> the room in client/themes/<id>.json (T cycles them while the room is in view)
//   ?bot=1 sits a guest (client/fireplace-bot.mjs) at the controls, and sits down at once
//   ?look=<word> wears that look (client/looks.mjs packLook) for this visit, earned or not, and keeps nothing
//   ?watch=1 spectates; ?url=, ?hash=, ?impair=, ?sens=, ?res=, ?music=0 as the games'
//   ?room=<id> joins the kit pool's room <id> (client/kit.mjs): where play online with friends goes, the link copy invite link copies
//   ?replay=<url> plays a replay file (net/replay.mjs) as a spectator
//   ?film=<seconds> with ?replay=: no clock of its own; tools/film.mjs steps it a frame at a time (window.__film)
import * as L from '../src/layout.mjs';
import { unpackArena, modeName } from '../src/arena-view.mjs';
import '../src/bumper-view.mjs';
import '../src/party-view.mjs';
import { modeName as flightMode } from '../src/flight-view.mjs';
import { createHost, epoch, fitSize } from './host.mjs';
import { createRoom, SCREEN, COUCH, cardText, cardFire } from './room-render.mjs';
import { loadTheme, themeList, savedTheme, saveTheme, FALLBACK, DEFAULT } from './themes.mjs';
import { Guest } from './fireplace-bot.mjs';
import { GOLFER } from './brain.mjs';
import { readClock } from './clock.mjs';
import { BALLS, HATS, BODIES, packLook, unpackLook, savedLook, saveLook, nextOpen, wearable, isOpen, drawLook, lookName } from './looks.mjs';
import { ACHIEVEMENTS, loadTally, saveTally, emptyTally, record, readResult, gotSet } from './achievements.mjs';
import { filmClock, filmSound, scoreTrack, compose } from './film.mjs';
import { kit, room as pool, canGoOnline, goOnline } from './kit.mjs';
import { touchWanted } from './touch.mjs';

const q = new URLSearchParams(location.search);
const TOUCH = touchWanted(q); // a phone: no pointer lock, buttons for the couch's keys (client/touch.mjs)
const stage = document.getElementById('stage');
const note = document.getElementById('note');
const roomCanvas = document.getElementById('room');
// The page's half of each game in layout.mjs's FP_SETS, by G_*: its frontend
// (mount(host, opts), client/host.mjs), the size it draws at (320 x 200 for
// golf's look, null for the window's) and what its picture lights the room
// with. A game added to FP_SETS adds its row here.
const PAGES = [
  { frontend: './golf-game.mjs', size: [320, 200], light: [0.45, 0.7, 0.45] }, // golf's grass
  { frontend: './arena-game.mjs', size: [320, 200], light: [0.6, 0.65, 0.6] }, // the arena's grey
  { frontend: './bumper-game.mjs', size: null, light: [1, 0.85, 0.5] }, // the cheese
  { frontend: './party-game.mjs', size: null, light: [0.55, 0.75, 1] }, // party's sky
  { frontend: './flight-game.mjs', size: [320, 200], light: [0.5, 0.65, 0.95] }, // Dogfight's bluer sky
];
if (PAGES.length !== L.FP_SETS.length) throw new Error(`client/fireplace.mjs knows ${PAGES.length} games and FP_SETS has ${L.FP_SETS.length}`);
// a canvas a game, fireplace.html's or made here
const canvases = L.GAMES.map((_, k) => document.getElementById(`g${k}`) ?? stage.appendChild(Object.assign(document.createElement('canvas'), { id: `g${k}`, className: PAGES[k].size ? 'lo' : '' })));
const BOT = q.get('bot') === '1';
const FILM = q.has('film') && q.has('replay') ? Number(q.get('film')) : 0;
const WATCH = q.get('watch') === '1' || q.has('replay');
const SENS = Number(q.get('sens') || 3);
const ZOOM_MS = 1700;
const LOOK_MS = 5000; // how long B or H keeps your look on the TV
const LIST_MS = 12000; // and L your achievements
const PER_PAGE = 6; // achievements a page, in type the TV can show from the couch
const TV_LIGHT = PAGES.map((p) => p.light);
const FRONTENDS = PAGES.map((p) => p.frontend);
const WASM = '../build/fireplace/game.wasm';
// the title card's name and line, client/kit.json's (node tools/kit.mjs init writes them)
const TITLE = String(kit.name || 'Fireplace').toUpperCase();
const TAGLINE = String(kit.tagline ?? 'A roomful of games, come and go as you like').toUpperCase();
const ease = (x) => x * x * (3 - 2 * x);
const lerp = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);

async function main() {
  const [W, H] = fitSize(q, [1600, 1000]);
  roomCanvas.width = W;
  roomCanvas.height = H;
  // golf, the arena and Dogfight are drawn at their 320 x 200, bumper balls and party at the window's size
  canvases.forEach((c, k) => { [c.width, c.height] = PAGES[k].size ?? [W, H]; });
  const clock = FILM ? filmClock() : null;
  const host = await createHost({ wasm: WASM, q, watch: WATCH, fireplace: true, connect: false });
  const track = FILM ? filmSound(FILM, { music: q.get('music') !== '0' }) : null;
  if (track) host.sound = track.sound;
  const { view, get, set, press, sound, i32, f64 } = host;
  // the room's theme: ?theme=, else this viewer's last pick, else Grandma's (client/themes.mjs)
  const theme = await loadTheme(q.get('theme') || savedTheme() || DEFAULT).catch((e) => { console.warn(e.message); return FALLBACK; });
  const room = await createRoom(roomCanvas, host.device, { present: q.get('present') !== '0', theme });
  const tvTex = canvases.map((c) => room.tvTexture(c.width, c.height));
  const guest = BOT ? new Guest(0, (Math.random() * 1e9) | 0, Number(q.get('skill') || 0.8), GOLFER) : null;

  // ---- your look and your achievements, kept in this browser; a guest at the controls or a spectator keeps neither
  const KEEP = !BOT && !WATCH;
  let tally = KEEP ? loadTally() : emptyTally();
  let got = gotSet(tally);
  let look = q.has('look') ? Number(q.get('look')) >>> 0 : KEEP ? wearable(savedLook(), got) : 0;
  set(L.CL_LOOK, look);
  let lookAt = -1e9, listAt = -1e9, listPage = 0; // when B, H or P, and L, last put their card on the TV; the list's page
  let heldKey = '', opened = []; // the game held now, and what its end opened
  const wear = (w) => { look = w; set(L.CL_LOOK, w); saveLook(w); lookAt = performance.now(); listAt = -1e9; };
  // the looks an achievement opens
  const opens = (id) => [...BALLS, ...HATS, ...BODIES].filter((x) => x.unlock === id).map(lookName);
  // what this slot did in the game just held, counted once
  function tallyUp() {
    const slot = get(L.CL_SLOT);
    if (!KEEP || slot < 0) return;
    const r = readResult(view, slot, get(L.CL_ROOM));
    if (r.key !== heldKey) { heldKey = r.key; opened = []; }
    const next = record(tally, r);
    if (next.tally === tally) return;
    tally = next.tally;
    saveTally(tally);
    got = gotSet(tally);
    opened = next.opened;
  }

  // ---- the scene: on the couch, closing in on the TV, in the game, pulling back
  let scene = 'couch'; // couch -> tuning -> in <-> out
  let zoom = 0, zoomFrom = 0, zoomTo = 0, zoomAt = 0;
  let cardMix = 1, cardTo = 1;
  let tvOn = 0;
  let card = '';
  let game = -1, frontend = null, mounting = null;
  let gamesSeen = 0;
  let last = null;
  const zoomBy = (to, now) => { zoomFrom = zoom; zoomTo = to; zoomAt = now; };
  const show = (canvas) => { for (const c of [roomCanvas, ...canvases]) c.classList.toggle('on', c === canvas); };

  const sitDown = () => {
    if (scene !== 'couch') return;
    sound.wake();
    scene = 'tuning';
    if (!BOT && !WATCH && !TOUCH) stage.requestPointerLock?.({ unadjustedMovement: true })?.catch?.(() => stage.requestPointerLock());
    host.connect();
  };
  stage.addEventListener('click', () => { if (scene === 'couch') sitDown(); else if (!document.pointerLockElement && !BOT && !WATCH && !TOUCH) stage.requestPointerLock(); });
  addEventListener('keydown', (e) => {
    if (scene === 'couch' && (e.code === 'Enter' || e.code === 'Space')) sitDown();
    const roomInView = !(scene === 'in' && zoom >= 0.999);
    if (e.code === 'KeyT' && !e.repeat && roomInView) nextTheme();
    if (KEEP && roomInView && !e.repeat) {
      const { ball, hat, body } = unpackLook(look);
      if (e.code === 'KeyB') wear(packLook(nextOpen(BALLS, ball, got), hat, body));
      if (e.code === 'KeyH') wear(packLook(ball, nextOpen(HATS, hat, got), body));
      if (e.code === 'KeyP') wear(packLook(ball, hat, nextOpen(BODIES, body, got)));
      // L: the list's first page, then its next, then away
      if (e.code === 'KeyL') {
        const open = performance.now() - listAt < LIST_MS;
        listPage = open ? listPage + 1 : 0;
        listAt = listPage < LIST_PAGES ? performance.now() : -1e9;
        lookAt = -1e9;
      }
    }
    if (e.code === 'KeyF' && !e.repeat) {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().then(() => navigator.keyboard?.lock?.()).catch(() => {});
    }
  });
  // on a phone, the couch's keys as buttons: the look, the theme, the list, fullscreen (client/touch.mjs)
  if (KEEP && TOUCH) {
    const bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;top:10px;right:10px;z-index:30;display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;max-width:70vw';
    for (const [label, code] of [['BALL', 'KeyB'], ['HAT', 'KeyH'], ['BODY', 'KeyP'], ['ROOM', 'KeyT'], ['LIST', 'KeyL'], ['FULL', 'KeyF']]) {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = 'min-width:56px;min-height:40px;border-radius:20px;border:2px solid rgba(255,255,255,.45);background:rgba(20,22,30,.55);color:#fff;font:800 12px system-ui,sans-serif';
      b.addEventListener('click', (e) => { e.stopPropagation(); dispatchEvent(new KeyboardEvent('keydown', { code })); });
      bar.appendChild(b);
    }
    document.body.appendChild(bar);
  }

  // T, while the room is in view: the next theme the build bundled, kept for next time
  let themeAt = -1e9;
  async function nextTheme() {
    const ids = await themeList();
    const id = ids[(ids.indexOf(room.theme.id) + 1) % ids.length];
    try { room.setTheme(await loadTheme(id)); saveTheme(id); themeAt = performance.now(); } catch (e) { console.warn(e.message); }
  }

  // the game the room is on, mounted on its own canvas; the last one put away
  async function mountGame(g) {
    if (mounting) return;
    mounting = (async () => {
      frontend?.unmount();
      frontend = null;
      const { mount } = await import(FRONTENDS[g]);
      frontend = await mount(host, { canvas: canvases[g], lockTarget: stage, bot: BOT, external: BOT, sens: SENS, present: q.get('present') !== '0' });
      game = g;
      gamesSeen++;
    })();
    try { await mounting; } finally { mounting = null; }
  }

  // ---- the guest at the controls (?bot=1): its word into the slots, as keys and a mouse would
  let lastWord = 0;
  function drive() {
    const slot = get(L.CL_SLOT);
    if (!guest || slot < 0 || get(L.CL_STATE) !== 2) return;
    guest.slot = guest.golfer.slot = guest.fighter.slot = guest.roller.slot = guest.partier.slot = guest.pilot.slot = slot;
    const nowE = epoch();
    const lag = Math.round(readClock(i32, f64, L.CL_PRED, nowE) - readClock(i32, f64, L.CL_PLAY, nowE));
    const w = guest.think(view, view.tick, lag);
    // the arena's word, for the arena and Dogfight alike
    if (Guest.game(view) === L.G_ARENA || Guest.game(view) === L.G_FLIGHT) {
      const a = unpackArena(w), b = unpackArena(lastWord);
      set(L.CL_YAW, a.yaw); set(L.CL_PITCH, a.pitch); set(L.CL_MOVE, a.move | (a.jump << 4)); set(L.CL_WEAPON, a.slot);
      if (a.shot !== b.shot) press(L.CL_PRESSES);
      if (a.melee !== b.melee) press(L.CL_MELEE);
      if (a.gren !== b.gren) press(L.CL_GREN);
      if (Guest.game(view) === L.G_ARENA && guest.fighter.wantUse) press(L.CL_USE);
    } else {
      set(L.CL_YAW, w & 0x3fff); set(L.CL_PITCH, (w >>> 14) & 0x3ff); set(L.CL_MOVE, ((w >>> 24) & 15) | (((w >>> 28) & 1) << 4)); set(L.CL_WEAPON, w >>> 31);
      if (((w >>> 29) & 3) !== ((lastWord >>> 29) & 3)) press(L.CL_PRESSES);
    }
    lastWord = w;
  }

  // ---- the TV's cards, drawn in the games' own 3x5 font
  const g2 = room.card.getContext('2d');
  const text = (s, x, y, px, color, align) => cardText(g2, s, x, y, px, color, align);
  const pixelFire = (cx, cy, s, t) => cardFire(g2, cx, cy, s, t);
  // the room's theme and who made it: on the title, and for a while after T changes it
  const roomLine = () => {
    const s = `ROOM: ${room.theme.name} BY ${room.theme.by}  -  T FOR ANOTHER`;
    text(s, 320, 372, s.length * 12 <= 620 ? 3 : 2, '#8ea0b8', 'center');
  };
  function drawCard(kind, now) {
    const t = now / 1000;
    g2.fillStyle = '#10141f';
    g2.fillRect(0, 0, 640, 400);
    text('CH 3', 620, 18, 3, '#7fbf7f', 'right');
    if (kind === 'title' || now - themeAt < 4000) roomLine();
    if (kind === 'look') return lookCard(t);
    if (kind === 'list') return listCard();
    if (kind === 'title' || kind === 'tuning') {
      pixelFire(320, 150, 9, t);
      text(TITLE, 320, 178, Math.min(11, Math.floor(620 / (4 * TITLE.length - 1))), '#ffcf6a', 'center');
      text(TAGLINE, 320, 250, TAGLINE.length * 12 <= 620 ? 3 : 2, '#c9b89a', 'center');
      text(GAMES_LINE, 320, 275, GAMES_LINE.length * 12 <= 620 ? 3 : 2, '#8ea0b8', 'center');
      if (KEEP) {
        drawLook(g2, 578, 128, 22, Math.max(0, get(L.CL_SLOT)), look, t, host.avatar(get(L.CL_SLOT)));
        const { ball, hat, body } = unpackLook(look);
        const s = `B: ${BALLS[ball].name}  H: ${HATS[hat].name}  P: ${BODIES[body].name}  L: ACHIEVEMENTS ${Object.keys(tally.got).length}/${ACHIEVEMENTS.length}`;
        text(s, 320, 300, s.length * 12 <= 620 ? 3 : 2, '#8ea0b8', 'center');
      }
      if (kind === 'tuning') text(host.error ? 'NO SIGNAL' : 'TUNING IN...', 320, 330, 5, host.error ? '#ff6a5a' : '#ffffff', 'center');
      else if (Math.floor(t * 1.5) % 2) text(BOT ? 'A GUEST SITS DOWN' : 'CLICK TO SIT DOWN', 320, 330, 5, '#ffffff', 'center');
      return;
    }
    // the standings: everyone in the room by marshmallows, your row lit, and what's next
    const slot = get(L.CL_SLOT);
    const list = [];
    for (let p = 0; p < L.NPLAYER; p++) {
      if (!view.player(p).live) continue;
      list.push({ p, m: view.dv.getUint16(L.FP_MALLOWS + 2 * p, true), got: view.u8[L.FP_GOT + p], place: view.u8[L.FP_LAST + p] });
    }
    list.sort((a, b) => b.m - a.m || (a.place || 999) - (b.place || 999) || a.p - b.p);
    const g = view.dv.getUint32(L.FP_GAME, true);
    text(`${gameName(g, view.dv.getUint32(L.HDR_SEED, true))} IS OVER`, 320, 28, 4, '#ffcf6a', 'center');
    text('MARSHMALLOWS', 320, 60, 5, '#ffffff', 'center');
    const mine = list.findIndex((x) => x.p === slot);
    const most = opened.length ? 6 : 7; // a row less when there's news under them
    const rows = mine >= most ? [...list.slice(0, most - 1), list[mine]] : list.slice(0, most);
    rows.forEach((x, k) => {
      const y = 104 + k * 30;
      const you = x.p === slot;
      if (you) { g2.fillStyle = '#3a2c14'; g2.fillRect(70, y - 6, 500, 28); }
      text(`${list.indexOf(x) + 1}`, 110, y, 4, you ? '#ffcf6a' : '#c9b89a', 'right');
      text(you ? 'YOU' : host.label(x.p).slice(0, 9), 130, y, 4, you ? '#ffcf6a' : '#ffffff'); // 9 of the font's 16 px reach the marshmallows at 290
      for (let i = 0; i < Math.min(x.m, 12); i++) { g2.fillStyle = '#f4ecdc'; g2.fillRect(290 + i * 18, y, 12, 14); g2.fillStyle = '#d9cbb0'; g2.fillRect(290 + i * 18, y + 10, 12, 4); }
      if (x.m > 12) text(`+${x.m - 12}`, 290 + 12 * 18 + 4, y, 3, '#c9b89a');
      if (x.got) text(`+${x.got}`, 560, y, 4, '#7fdf7f', 'right');
    });
    // what this game's end opened for you
    const fit = (s) => (s.length * 12 <= 620 ? 3 : 2);
    if (opened.length) {
      const news = `NEW: ${opened.map((id) => ACHIEVEMENTS.find((a) => a.id === id).name).join(', ')}`;
      text(news, 320, 286, fit(news), '#7fdf7f', 'center');
      const looks = opened.flatMap(opens);
      const s = `${looks.join(', ')} ${looks.length > 1 ? 'ARE' : 'IS'} YOURS: B OR H TO WEAR IT`;
      if (looks.length) text(s, 320, 308, fit(s), '#c9e8a0', 'center');
    }
    const left = Math.max(0, Math.ceil((view.dv.getUint32(L.FP_AT, true) - view.tick) / 125));
    const next = `NEXT: ${gameName(nextGame(), view.dv.getUint32(L.FP_NEXT, true))}${left ? `  IN ${left}` : ''}`;
    text(next, 320, 340, next.length * 20 <= 620 ? 5 : 4, '#ffffff', 'center');
  }
  // your look, as B, H and P left it, and the next one to earn
  function lookCard(t) {
    const { ball, hat, body } = unpackLook(look);
    text('YOUR LOOK', 320, 26, 5, '#ffcf6a', 'center');
    drawLook(g2, 170, 246, 50, Math.max(0, get(L.CL_SLOT)), look, t, host.avatar(get(L.CL_SLOT)));
    text('BALL', 330, 80, 3, '#8ea0b8');
    text(BALLS[ball].name, 330, 98, 5, '#ffffff');
    text('B FOR ANOTHER', 330, 126, 3, '#c9b89a');
    text('HAT', 330, 160, 3, '#8ea0b8');
    text(HATS[hat].name, 330, 178, 5, '#ffffff');
    text('H FOR ANOTHER', 330, 206, 3, '#c9b89a');
    text('BODY', 330, 240, 3, '#8ea0b8');
    text(BODIES[body].name, 330, 258, 5, '#ffffff');
    text('P FOR ANOTHER', 330, 286, 3, '#c9b89a');
    text('EVERYONE IN THE ROOM SEES IT', 320, 310, 3, '#8ea0b8', 'center');
    text('IN A GAME, 1 TO 4: WAVE, CHEER, DANCE, SPIN', 320, 331, 3, '#8ea0b8', 'center');
    const shut = [...BALLS, ...HATS, ...BODIES].find((x) => !isOpen(x, got));
    if (shut) {
      const s = `EARN ${lookName(shut)}: ${ACHIEVEMENTS.find((a) => a.id === shut.unlock).about}`;
      text(s, 320, 352, s.length * 12 <= 620 ? 3 : 2, '#7fdf7f', 'center');
    }
  }
  // the achievements, a page at a time: earned lit, the rest with how far along, and the look each opens
  function listCard() {
    const n = Object.keys(tally.got).length;
    text(`ACHIEVEMENTS  ${n} OF ${ACHIEVEMENTS.length}`, 320, 16, 5, '#ffcf6a', 'center');
    ACHIEVEMENTS.slice(listPage * PER_PAGE, (listPage + 1) * PER_PAGE).forEach((a, k) => {
      const y = 58 + k * 48, have = !!tally.got[a.id];
      g2.fillStyle = have ? '#ffcf6a' : '#3a3f4f';
      g2.fillRect(30, y + 2, 16, 16);
      text(a.name, 58, y, 4, have ? '#ffffff' : '#8ea0b8');
      const [x, of] = a.have?.(tally) ?? [0, 0];
      const far = !have && of ? `  ${Math.min(x, of)}/${of}` : '';
      const about = a.about + far;
      text(about, 58, y + 24, about.length * 12 <= 560 ? 3 : 2, have ? '#c9b89a' : '#7f8aa0');
      const o = opens(a.id);
      if (o.length) text(o.join(', '), 610, y + 4, 2, have ? '#7fdf7f' : '#5f8a60', 'right');
    });
    text(listPage + 1 < LIST_PAGES ? 'L FOR MORE' : 'L TO PUT IT AWAY', 320, 360, 3, '#8ea0b8', 'center');
  }
  const LIST_PAGES = Math.ceil(ACHIEVEMENTS.length / PER_PAGE);

  // the playlist goes by position: entry (games played) % length is next
  const nextGame = () => L.PLAYLIST[view.dv.getUint16(L.FP_COUNT + 2, true) % L.PLAYLIST.length];
  // a game as the TV names it: the arena and Dogfight by the mode its seed forces
  const gameName = (g, seed) => {
    if (g === L.G_ARENA && modeName(seed) !== null) return `ARENA ${modeName(seed)}`;
    if (g === L.G_FLIGHT && modeName(seed) !== null) { const n = flightMode((seed >>> 16) & 0xff).name; return n.includes('DOGFIGHT') ? n : `DOGFIGHT ${n}`; }
    return L.GAMES[g];
  };
  const GAMES_LINE = L.PLAYLIST.map((g) => L.GAMES[g]).join(' . ');

  // ---- one quiet line under the room. In a local room, on a page with no
  // relay of its own and a pool to ask: play online with friends, which asks
  // the kit's pool for a room and reloads into it (the address is the invite).
  // In the pool's room: its id, and copy invite link. Nothing otherwise.
  const line = document.getElementById('line');
  const [invite, online] = ['invite', 'online'].map((id) => document.getElementById(id));
  const offer = !WATCH && !FILM && (await canGoOnline(q).catch(() => false));
  let lineText = null;
  invite.addEventListener('click', (e) => {
    e.stopPropagation();
    const done = (ok) => { invite.textContent = ok ? 'copied' : pool.invite; setTimeout(() => { invite.textContent = 'copy invite link'; }, ok ? 2000 : 15000); };
    navigator.clipboard?.writeText(pool.invite).then(() => done(true), () => done(false)) ?? done(false);
  });
  online.addEventListener('click', (e) => {
    e.stopPropagation();
    if (online.disabled) return;
    online.disabled = true;
    online.textContent = 'finding a room…';
    goOnline(q, { wasm: WASM, bytes: host.bytes }).then((to) => { location.href = to; }, (err) => {
      pool.why = String(err.message || err);
      online.disabled = false;
      online.textContent = 'play online with friends';
    });
  });
  const showLine = (roomInView) => {
    // local: as the room turned out, or before it opens, unless an invite will take it online
    const local = host.connected ? host.local === true : !q.get('room');
    const offering = !pool.id && offer && local;
    const text = pool.id ? `online room ${pool.id}${pool.why ? ` (${pool.why})` : ''}`
      : offering || pool.why ? `playing here with AI players${pool.why ? `: ${pool.why}` : ''}` : '';
    if (text !== lineText) { lineText = text; line.firstElementChild.textContent = text; }
    invite.hidden = !pool.id;
    online.hidden = !offering;
    line.hidden = !text || !roomInView;
  };

  // ---- the frame
  let crackleAt = 0;
  let flick = 1;
  function frame(now) {
    if (!FILM) requestAnimationFrame(frame);
    const st = get(L.CL_STATE);
    const g = view.dv.getUint32(L.FP_GAME, true);
    const held = view.dv.getUint32(L.FP_STAGE, true) === 1;
    if (held) tallyUp();
    if (st >= 1 && g !== game && !mounting) mountGame(g);
    drive();
    showLine(!(scene === 'in' && zoom >= 0.999));
    // where the scene goes next
    if (scene === 'tuning' && st === 2 && frontend && game === g) { scene = 'in'; zoomBy(1, now); cardTo = 0; }
    if (scene === 'in' && held) { scene = 'out'; zoomBy(0, now); }
    if (scene === 'out') cardTo = now - zoomAt > ZOOM_MS * 0.6 ? 1 : 0;
    if (scene === 'out' && !held && frontend && game === g) { scene = 'in'; zoomBy(1, now); cardTo = 0; }
    const a = Math.min(1, (now - zoomAt) / ZOOM_MS);
    zoom = zoomFrom + (zoomTo - zoomFrom) * ease(a);
    cardMix += (cardTo - cardMix) * Math.min(1, (16 / 300));
    tvOn = Math.min(1, tvOn + 0.02);
    // the fire: a flicker for the light, and now and then a pop
    flick += ((0.8 + 0.35 * Math.random()) - flick) * 0.25;
    if (now > crackleAt) { sound.crackle(zoom > 0.9 ? 0.25 : 1); crackleAt = now + 80 + Math.random() * 900; }

    const inside = scene === 'in' && zoom >= 0.999;
    if (inside && frontend) {
      show(canvases[game]);
      frontend.frame(now);
      last = null;
      return;
    }
    // the room, the game (or a card) on the TV
    if (frontend && game === g) frontend.frame(now, tvTex[game]);
    const kind = now - listAt < LIST_MS ? 'list' : now - lookAt < LOOK_MS ? 'look' : scene === 'couch' ? 'title' : scene === 'tuning' ? 'tuning' : 'standings';
    if (cardMix > 0.01 || scene === 'couch' || scene === 'tuning') { drawCard(kind, now); room.updateCard(); card = kind; }
    show(roomCanvas);
    const focal = H * 1.05;
    const mid = [(SCREEN.x0 + SCREEN.x1) / 2, (SCREEN.y0 + SCREEN.y1) / 2, SCREEN.z];
    const d = Math.min((SCREEN.x1 - SCREEN.x0) * focal / W, (SCREEN.y1 - SCREEN.y0) * focal / H) * 0.995;
    const z = ease(zoom);
    last = {
      cam: lerp(COUCH.cam(now), [mid[0], mid[1], mid[2] - d], z), look: lerp(COUCH.look, mid, z), focal, time: now / 1000, zoom: z,
      cardMix: scene === 'couch' || scene === 'tuning' ? 1 : cardMix, flicker: flick, tvOn: scene === 'couch' ? 1 : tvOn,
      tvLight: (game >= 0 && cardMix < 0.5 ? TV_LIGHT[game] : [0.35, 0.4, 0.6]).map((v) => v * (0.85 + 0.15 * Math.random())), tvBright: 1, game: game >= 0 ? tvTex[game] : null,
    };
    room.frame(last);
  }

  window.__qa = {
    hashes: host.hashes, keys: host.keys, desyncs: host.desyncs,
    state: () => {
      const g = view.dv.getUint32(L.FP_GAME, true);
      const slot = get(L.CL_SLOT);
      return { slot, clState: get(L.CL_STATE), error: host.error, theme: room.theme.id, game: g, gameName: gameName(g, view.dv.getUint32(L.HDR_SEED, true)), mg: g === L.G_PARTY ? L.MINIGAMES[view.dv.getUint32(L.PG_GAME, true)]?.name ?? null : null, state: view.hole().state, scene, zoom, games: gamesSeen,
        mallows: slot >= 0 ? view.dv.getUint16(L.FP_MALLOWS + 2 * slot, true) : 0, card, me: frontend?.state?.().me ?? null,
        look, achievements: Object.keys(tally.got), opened,
        pool: { ...pool, local: !!host.local },
        // the room's looks as the relay last sent them (this slot's own included, once it has gone round)
        relayLooks: [...Array(L.NPLAYER).keys()].filter((p) => host.u32[(L.CL_LOOKS >> 2) + p]).map((p) => [p, host.u32[(L.CL_LOOKS >> 2) + p]]) };
    },
    // a PNG of what's on the screen: the room, or the game
    capture: async () => {
      if (!last) return frontend?.capture(1) ?? null;
      const { width, height, rgba } = await room.capture(last);
      const c = new OffscreenCanvas(width, height);
      c.getContext('2d').putImageData(new ImageData(rgba, width, height), 0, 0);
      const out = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
      let bin = '';
      for (let i = 0; i < out.length; i += 0x8000) bin += String.fromCharCode(...out.subarray(i, i + 0x8000));
      return btoa(bin);
    },
  };
  note.remove();
  if (!BOT && !WATCH) signinButton(host);
  if (FILM) {
    // tools/film.mjs: the replay paused, moved a tick at a time, a frame drawn at the film's time
    const pause = (async () => {
      while (!host.replay) await new Promise((ok) => setTimeout(ok, 20));
      host.net.postMessage({ pause: true });
      return host.replay;
    })();
    const settle = async () => { while (mounting) await mounting.catch(() => {}); };
    window.__film = {
      // sit down: the replay opens, paused at its start; its span in sim ticks
      async sit() { sitDown(); const r = await pause; return { first: r.first - r.roomStart, end: r.end - r.roomStart }; },
      // the sim stepped to tick t (fractional: the frame between ticks), never back
      async seek(t) {
        host.net.postMessage({ to: t });
        const t0 = Date.now();
        while (view.tick < Math.floor(t) && !host.error) {
          if (Date.now() - t0 > 60000) throw new Error(`the sim did not reach tick ${t} (at ${view.tick})`);
          await new Promise((ok) => setTimeout(ok, 5));
        }
      },
      // one frame at film time ms; out: its time in the cut (seconds), or -1 while the film skips
      async frame(ms, out = -1) {
        clock.at(ms);
        track.at(Math.max(0, out), out >= 0);
        frame(ms);
        await settle();
      },
      shot: async (W, H, caption) => compose(await window.__qa.capture(), W, H, caption),
      async theme(id) { room.setTheme(await loadTheme(id)); },
      // back on the couch, the TV's title up (the film's last shot)
      couch() { scene = 'couch'; zoomBy(0, performance.now()); },
      // a cut: straight into the game on now, the zoom done, unless its end is
      // held (the room's standings are what is on then)
      snap() {
        if (scene === 'couch' || view.dv.getUint32(L.FP_STAGE, true) === 1) return;
        scene = 'in'; zoom = zoomFrom = zoomTo = 1; zoomAt = -1e9; cardMix = cardTo = 0;
      },
      audio: () => track.render(),
      // one tune for the whole cut, under every room's sound (a cut with "score")
      score: (key, seconds) => scoreTrack(key, seconds),
    };
  } else {
    if (BOT || WATCH || q.get('auto') === '1') { scene = 'couch'; setTimeout(sitDown, 1500); }
    requestAnimationFrame(frame);
  }
}

main().catch((e) => {
  note.textContent = String(e?.message || e);
  window.__qa = { error: String(e?.stack || e) };
});

// Sign in to be rated: once the relay offers a sign-in (net/elo.mjs), a button
// loads the Elo Pros web SDK, the player's wallet signs the relay's nonce, and
// the games they play from then on are rated on Elo Pros. Guests play the same.
const ELO_SDK = 'https://elopros.com/sdk/elo-3.js';
const ELO_SDK_SRI = 'sha384-pKOcdX/DZSGO11b/QS2tFdcm6YFqcVCl0xc6IHDJKFBYRJCvY2JBNjbaVA3jIih/';
let sdk = null;
const loadSdk = () => (sdk ??= new Promise((ok, no) => {
  const s = document.createElement('script');
  Object.assign(s, { src: ELO_SDK, integrity: ELO_SDK_SRI, crossOrigin: 'anonymous', onload: () => ok(window.Elo), onerror: () => { sdk = null; no(new Error('the sign-in kit did not load')); } });
  document.head.append(s);
}));
function signinButton(host) {
  const b = document.getElementById('signin');
  const short = (a) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a).toUpperCase();
  const said = { 1: () => `RATED AS ${short(host.signin.address)}`, 2: () => "SIGN-IN DIDN'T TAKE · TRY AGAIN", 3: () => "COULDN'T CHECK · TRY AGAIN", 5: () => 'THAT WALLET IS IN ANOTHER SEAT' };
  let busy = false;
  b.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (busy || host.signin.status === 1) return;
    busy = true;
    b.textContent = 'SIGNING IN…';
    try { await host.signIn(await loadSdk()); } catch (err) { b.textContent = String(err?.message || err).toUpperCase().slice(0, 48); }
    busy = false;
  });
  setInterval(() => {
    const { nonce, status } = host.signin;
    b.classList.toggle('on', !!nonce && status !== 4);
    b.disabled = status === 1;
    if (!busy && said[status]) b.textContent = said[status]();
  }, 500);
}
