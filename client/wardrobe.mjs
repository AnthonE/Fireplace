// The wardrobe: the couch's keys as a panel you can see and click. Your look
// (a ball, a hat, a body: client/looks.mjs) drawn big, every ball, hat and
// body as a tile under it (the shut ones dimmed, with what opens them; the
// priced ones with what they cost, and the purse over them), the room's
// theme, the achievements, and a button to sit down. A priced tile is tried
// on with a click, in the panel's own picture only, and bought with BUY
// (client/purse.mjs), then worn. It shows while
// the room is in view and the pointer is free: on the couch, and between
// games once Esc lets the mouse go. B, H, P, T, L and Enter do what they
// always did; the panel only says so. Drawing and picking only, like the look.
// The arena's, party's and Dogfight's own pages (pageWardrobe) show it while
// the mouse is free, with PLAY to take the controls again.

import * as L from '../src/layout.mjs';
import { BALLS, HATS, BODIES, packLook, unpackLook, isOpen, drawLook, lookName, lookId, saveLook, savedLook, wearable } from './looks.mjs';
import { ACHIEVEMENTS, loadTally } from './achievements.mjs';
import { balance, buy, openSet, loadPurse, freshPurse, savePurse } from './purse.mjs';
import { ownedLooks } from './shop.mjs';
import { touchWanted } from './touch.mjs';

const CSS = `
#wardrobe { position: fixed; top: 12px; right: 12px; bottom: 12px; width: 312px; z-index: 25; display: flex; flex-direction: column;
  background: rgba(16, 12, 9, 0.88); border: 1px solid rgba(232, 214, 192, 0.25); border-radius: 10px; color: #e8d6c0;
  font: 12px/1.35 ui-monospace, monospace; box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5); user-select: none; -webkit-user-select: none; }
#wardrobe[hidden], #wardrobe-pill[hidden] { display: none; }
#wardrobe .wd-scroll { flex: 1; overflow-y: auto; padding: 12px 14px 4px; }
#wardrobe h2 { margin: 0; font-size: 13px; letter-spacing: 2px; color: #ffcf6a; font-weight: 700; }
#wardrobe .wd-top { display: flex; align-items: center; gap: 8px; }
#wardrobe .wd-top h2 { flex: 1; }
#wardrobe .wd-mallow { display: inline-block; width: 9px; height: 10px; margin-right: 4px; vertical-align: -1px; border-radius: 2px;
  background: linear-gradient(#f4ecdc 0 68%, #d9cbb0 68%); }
#wardrobe .wd-purse { padding: 2px 8px; border: 1px solid rgba(232, 214, 192, 0.3); border-radius: 10px; color: #fff; font-weight: 700; white-space: nowrap; }
#wardrobe .wd-x { background: none; border: 0; color: #e8d6c0; font: inherit; font-size: 16px; cursor: pointer; padding: 0 4px; opacity: 0.7; }
#wardrobe .wd-x:hover { opacity: 1; }
#wardrobe .wd-me { display: block; margin: 6px auto 0; width: 150px; height: 150px; }
#wardrobe .wd-sees { text-align: center; font-size: 11px; opacity: 0.6; margin-bottom: 4px; }
#wardrobe .wd-part { margin-top: 10px; }
#wardrobe .wd-head { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; }
#wardrobe .wd-label { color: #8ea0b8; letter-spacing: 1px; }
#wardrobe .wd-name { color: #fff; font-weight: 700; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#wardrobe kbd, #wardrobe-pill kbd { display: inline-block; min-width: 14px; padding: 0 4px; border: 1px solid rgba(232, 214, 192, 0.45); border-bottom-width: 2px;
  border-radius: 3px; font: inherit; font-size: 10px; text-align: center; color: #e8d6c0; opacity: 0.8; }
#wardrobe .wd-tiles { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 5px; }
#wardrobe .wd-tile { position: relative; width: 44px; height: 56px; padding: 0; border: 2px solid rgba(232, 214, 192, 0.18); border-radius: 6px;
  background: #10141f; cursor: pointer; }
#wardrobe .wd-tile:hover { border-color: rgba(232, 214, 192, 0.6); }
#wardrobe .wd-tile[aria-pressed="true"] { border-color: #ffcf6a; box-shadow: 0 0 0 1px #ffcf6a; }
#wardrobe .wd-tile.shut canvas { opacity: 0.3; filter: grayscale(1); }
#wardrobe .wd-tile.shut::after { content: ""; position: absolute; left: 50%; top: 50%; width: 12px; height: 9px; margin: -2px 0 0 -6px;
  background: #c9b89a; border-radius: 2px; }
#wardrobe .wd-tile.shut::before { content: ""; position: absolute; left: 50%; top: 50%; width: 6px; height: 7px; margin: -9px 0 0 -5px;
  border: 2px solid #c9b89a; border-bottom: 0; border-radius: 5px 5px 0 0; }
#wardrobe .wd-tile canvas { display: block; width: 40px; height: 52px; }
#wardrobe .wd-tile .wd-price { position: absolute; left: 0; right: 0; bottom: 0; padding: 1px 0; border-radius: 0 0 4px 4px; background: rgba(8, 6, 4, 0.82);
  color: #ffcf6a; font-size: 10px; font-weight: 700; line-height: 12px; text-align: center; }
#wardrobe .wd-tile .wd-price .wd-mallow { width: 7px; height: 8px; margin-right: 2px; }
#wardrobe .wd-tile .wd-price[hidden] { display: none; }
#wardrobe .wd-tile.short canvas { opacity: 0.6; }
#wardrobe .wd-tile.short .wd-price { color: #a89c88; }
#wardrobe .wd-tile.trying { border-style: dashed; border-color: #ffcf6a; }
#wardrobe .wd-hint { display: flex; align-items: center; gap: 6px; min-height: 22px; margin-top: 3px; font-size: 11px; color: #7fdf7f; }
#wardrobe .wd-hint span { flex: 1; }
#wardrobe .wd-buy { padding: 2px 10px; border: 0; border-radius: 4px; background: #ffcf6a; color: #1a1108; font: inherit; font-weight: 800; letter-spacing: 1px; cursor: pointer; }
#wardrobe .wd-buy:hover { background: #ffdc8a; }
#wardrobe .wd-buy[hidden] { display: none; }
#wardrobe .wd-how { margin-top: 8px; font-size: 11px; opacity: 0.6; }
#wardrobe .wd-row { display: flex; align-items: center; gap: 6px; margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(232, 214, 192, 0.15); }
#wardrobe .wd-row .wd-grow { flex: 1; min-width: 0; }
#wardrobe .wd-row .wd-sub { font-size: 11px; opacity: 0.6; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#wardrobe .wd-btn { background: rgba(232, 214, 192, 0.08); border: 1px solid rgba(232, 214, 192, 0.35); border-radius: 5px; color: #e8d6c0;
  font: inherit; padding: 4px 8px; cursor: pointer; }
#wardrobe .wd-btn:hover { background: rgba(232, 214, 192, 0.18); }
#wardrobe .wd-list { margin: 6px 0 0; padding: 0; list-style: none; }
#wardrobe .wd-list li { display: grid; grid-template-columns: 14px 1fr; gap: 2px 8px; padding: 5px 0; border-bottom: 1px solid rgba(232, 214, 192, 0.08); }
#wardrobe .wd-list .wd-box { width: 10px; height: 10px; margin-top: 2px; background: #3a3f4f; border-radius: 2px; }
#wardrobe .wd-list .got .wd-box { background: #ffcf6a; }
#wardrobe .wd-list b { color: #8ea0b8; font-weight: 700; }
#wardrobe .wd-list .got b { color: #fff; }
#wardrobe .wd-list span { grid-column: 2; font-size: 11px; opacity: 0.7; }
#wardrobe .wd-list em { grid-column: 2; font-size: 10px; font-style: normal; color: #7fdf7f; opacity: 0.8; }
#wardrobe .wd-foot { padding: 10px 14px 12px; border-top: 1px solid rgba(232, 214, 192, 0.15); }
#wardrobe .wd-play { width: 100%; padding: 10px; border: 0; border-radius: 6px; background: #ffcf6a; color: #1a1108; font: inherit; font-size: 15px;
  font-weight: 800; letter-spacing: 2px; cursor: pointer; }
#wardrobe .wd-play:hover { background: #ffdc8a; }
#wardrobe .wd-keys { margin-top: 8px; font-size: 11px; opacity: 0.65; text-align: center; }
#wardrobe-pill { position: fixed; top: 12px; right: 12px; z-index: 25; padding: 8px 12px; border: 1px solid rgba(232, 214, 192, 0.45); border-radius: 18px;
  background: rgba(16, 12, 9, 0.88); color: #e8d6c0; font: 700 12px ui-monospace, monospace; letter-spacing: 1px; cursor: pointer; }
@media (max-width: 720px), (max-height: 520px) {
  #wardrobe { top: auto; left: 8px; right: 8px; bottom: 8px; width: auto; max-height: 52vh; }
  #wardrobe .wd-me { width: 84px; height: 84px; margin-top: 0; }
  #wardrobe .wd-scroll { padding-top: 8px; }
  #wardrobe .wd-foot { padding: 8px 14px; }
  #wardrobe .wd-full { display: none; }
}
`;

const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  for (const k of kids) e.append(k);
  return e;
};
const keyCap = (k) => el('kbd', { textContent: k });
const noCap = () => '';
const nice = (s) => s.charAt(0) + s.slice(1).toLowerCase();
const COLLAPSED = 'fireplace.wardrobe.closed';
// folded: what a browser that never said is shown (a phone: the pill, so the game stays clear)
const remembered = (folded) => { try { const v = localStorage.getItem(COLLAPSED); return v === null ? folded : v === '1'; } catch { return folded; } };
const remember = (v) => { try { localStorage.setItem(COLLAPSED, v ? '1' : '0'); } catch { /* this visit only */ } };

// s: what the page knows, read when drawn: look() the word worn, wear(w),
// got() what this browser holds (purse.mjs openSet: the open achievements and
// the bought looks), tally(), balance() the marshmallows left to spend,
// buy(look) which spends them ({ ok, short }), slot(), avatar(),
// theme() { name, by }, and what the buttons do: turn(dir) the theme (none:
// no room row), sit(), fullscreen(). keys: false on a page whose keys are the
// game's, so no key is named; play: the big button's word; folded: see remembered
export function createWardrobe(s) {
  const cap = s.keys === false ? noCap : keyCap;
  if (!document.getElementById('wardrobe-css')) document.head.append(el('style', { id: 'wardrobe-css', textContent: CSS }));
  const dpr = Math.min(2, devicePixelRatio || 1);
  const canvasOf = (w, h) => { const c = el('canvas', { width: w * dpr, height: h * dpr }); c.getContext('2d').scale(dpr, dpr); return c; };

  const me = canvasOf(150, 150);
  me.className = 'wd-me';
  const close = el('button', { className: 'wd-x', type: 'button', textContent: '×', title: 'Hide the wardrobe' });
  const mallow = () => el('i', { className: 'wd-mallow' });
  const purse = el('span');
  const sees = el('div', { className: 'wd-sees' });
  const scroll = el('div', { className: 'wd-scroll' },
    el('div', { className: 'wd-top' }, el('h2', { textContent: 'YOUR LOOK' }),
      el('span', { className: 'wd-purse', title: 'Marshmallows to spend' }, mallow(), purse), close),
    me, sees);
  // the priced tile being tried on: { p, t }, in the picture above only, until it is bought or another tile is clicked
  let trying = null;
  const plural = (n) => `${n} marshmallow${n === 1 ? '' : 's'}`;
  const priceLine = (x) => { const short = x.price - s.balance(); return `${nice(x.name)}: ${plural(x.price)}.${short > 0 ? ` ${short} more to go.` : ''}`; };

  // a part of the look: its name, a tile an entry, and a line for a shut one's how-to
  const PARTS = [
    // frame: [cy, r] for drawLook in a 40 x 52 tile, so the part fills it: the ball, the head, the whole rider
    { key: 'ball', label: 'BALL', list: BALLS, cap: 'B', frame: [33, 16], with: (w, k) => { const l = unpackLook(w); return packLook(k, l.hat, l.body); } },
    { key: 'hat', label: 'HAT', list: HATS, cap: 'H', frame: [90, 30], with: (w, k) => { const l = unpackLook(w); return packLook(l.ball, k, l.body); } },
    { key: 'body', label: 'BODY', list: BODIES, cap: 'P', frame: [36, 13], with: (w, k) => { const l = unpackLook(w); return packLook(l.ball, l.hat, k); } },
  ];
  // a part's line: what a shut tile takes, and BUY beside it for the one being tried on, if the purse reaches
  const say = (p, text, t = null) => { p.says.textContent = text; p.buy.hidden = !t || t.x.price > s.balance(); };
  const rest = (p) => (trying?.p === p ? say(p, priceLine(trying.t.x), trying.t) : say(p, ''));
  const tryOn = (v) => { const was = trying?.p; trying = v; drawn = ''; for (const p of new Set([was, v?.p])) if (p) rest(p); };
  for (const p of PARTS) {
    p.name = el('span', { className: 'wd-name' });
    p.says = el('span');
    p.buy = el('button', { className: 'wd-buy', type: 'button', textContent: 'BUY', hidden: true });
    p.hint = el('div', { className: 'wd-hint' }, p.says, p.buy);
    p.buy.addEventListener('click', () => {
      const t = trying?.p === p ? trying.t : null;
      p.buy.blur();
      if (!t) return;
      const r = s.buy(t.x);
      if (!r.ok) return rest(p); // the purse fell short since the tile was drawn (another tab spent it)
      tryOn(null);
      s.wear(p.with(s.look(), t.k));
      say(p, `${nice(t.x.name)} is yours.`);
    });
    p.tiles = p.list.map((x, k) => {
      const c = canvasOf(40, 52);
      const price = el('span', { className: 'wd-price', hidden: true }, mallow(), String(x.price ?? ''));
      const b = el('button', { className: 'wd-tile', type: 'button' }, c, price);
      const t = { b, c, x, k, price };
      b.addEventListener('click', () => {
        if (isOpen(x, s.got())) { tryOn(null); s.wear(p.with(s.look(), k)); say(p, ''); }
        else if (x.price) tryOn(trying?.t === t ? null : { p, t }); // a second click takes it off again
        else say(p, `Locked. Earn it: ${nice(about(x))}`);
        b.blur();
      });
      b.addEventListener('mouseenter', () => {
        if (isOpen(x, s.got()) || trying?.t === t) return;
        say(p, x.price ? priceLine(x) : `Locked. Earn it: ${nice(about(x))}`);
      });
      b.addEventListener('mouseleave', () => rest(p));
      return t;
    });
    scroll.append(el('div', { className: 'wd-part' },
      el('div', { className: 'wd-head' }, el('span', { className: 'wd-label' }, `${p.label} `, cap(p.cap)), p.name),
      el('div', { className: 'wd-tiles' }, ...p.tiles.map((t) => t.b)), p.hint));
  }
  scroll.append(el('div', { className: 'wd-how' }, mallow(), 'Marshmallows buy the priced ones: the top three of each game in Fireplace win 3, 2 and 1.'));
  const about = (x) => ACHIEVEMENTS.find((a) => a.id === x.unlock)?.about ?? '';

  // the room's theme
  const themeName = el('div', { className: 'wd-name', style: 'text-align:left' });
  const themeBy = el('div', { className: 'wd-sub' });
  const prev = el('button', { className: 'wd-btn', type: 'button', textContent: '◀', title: 'The theme before' });
  const next = el('button', { className: 'wd-btn', type: 'button', textContent: '▶', title: 'The next theme (T)' });
  prev.addEventListener('click', () => { s.turn(-1); prev.blur(); });
  next.addEventListener('click', () => { s.turn(1); next.blur(); });
  if (s.turn) scroll.append(el('div', { className: 'wd-row' }, el('div', { className: 'wd-grow' },
    el('div', { className: 'wd-label' }, 'ROOM ', cap('T')), themeName, themeBy), prev, next));

  // the achievements, folded until asked for
  const count = el('div', { className: 'wd-name', style: 'text-align:left' });
  const toggle = el('button', { className: 'wd-btn', type: 'button', textContent: 'Show' });
  const list = el('ul', { className: 'wd-list', hidden: true });
  toggle.addEventListener('click', () => { list.hidden = !list.hidden; toggle.textContent = list.hidden ? 'Show' : 'Hide'; drawn = ''; toggle.blur(); });
  scroll.append(el('div', { className: 'wd-row' }, el('div', { className: 'wd-grow' },
    el('div', { className: 'wd-label' }, 'ACHIEVEMENTS ', cap('L')), count), toggle), list);

  const play = el('button', { className: 'wd-play', type: 'button', textContent: s.play || 'SIT DOWN AND PLAY' });
  play.addEventListener('click', () => s.sit());
  const keys = el('div', { className: 'wd-keys' });
  const full = el('button', { className: 'wd-btn wd-full', type: 'button', style: 'margin-top:8px;width:100%' }, 'FULLSCREEN ', keyCap('F'));
  full.addEventListener('click', () => { s.fullscreen(); full.blur(); });
  const foot = el('div', { className: 'wd-foot' }, play, keys, full);
  const panel = el('div', { id: 'wardrobe', hidden: true }, scroll, foot);
  const pill = el('button', { id: 'wardrobe-pill', type: 'button', hidden: true }, 'YOUR LOOK');
  // nothing in the panel reaches the room under it (a click there sits you down)
  for (const n of [panel, pill]) for (const ev of ['click', 'pointerdown', 'mousedown']) n.addEventListener(ev, (e) => e.stopPropagation());
  let closed = remembered(!!s.folded);
  close.addEventListener('click', () => { closed = true; remember(true); tryOn(null); });
  pill.addEventListener('click', () => { closed = false; remember(false); pill.blur(); });
  document.body.append(panel, pill);

  let drawn = '';
  function redraw() {
    const w = s.look(), got = s.got(), slot = Math.max(0, s.slot()), av = s.avatar();
    const l = unpackLook(w), th = s.theme?.() ?? { name: '', by: '' }, tally = s.tally();
    const left = s.balance();
    const key = `${w}|${[...got].sort()}|${th.name}|${th.by}|${slot}|${av}|${list.hidden}|${left}|${trying ? lookId(trying.t.x) : ''}`;
    if (key === drawn) return;
    drawn = key;
    purse.textContent = String(left);
    sees.textContent = trying ? 'Trying it on: only you see it' : 'Everyone in the room sees it';
    for (const p of PARTS) {
      p.name.textContent = p.list[trying?.p === p ? trying.t.k : l[p.key]].name;
      if (trying?.p === p) rest(p); // the purse may have changed under it
      for (const t of p.tiles) {
        const open = isOpen(t.x, got), forSale = !open && !!t.x.price;
        t.b.classList.toggle('shut', !open && !forSale);
        t.b.classList.toggle('short', forSale && t.x.price > left);
        t.b.classList.toggle('trying', trying?.t === t);
        t.price.hidden = !forSale;
        t.b.setAttribute('aria-pressed', String(l[p.key] === t.k));
        t.b.setAttribute('aria-label', `${p.label.toLowerCase()}: ${t.x.name.toLowerCase()}${open ? '' : forSale ? ` (${plural(t.x.price)})` : ' (locked)'}`);
        t.b.title = open ? t.x.name : forSale ? `${t.x.name}: ${plural(t.x.price)}` : `${t.x.name}: ${nice(about(t.x))}`;
        const g = t.c.getContext('2d');
        g.clearRect(0, 0, 40, 52);
        drawLook(g, 20, ...p.frame, slot, p.with(w, t.k), 0, av);
      }
    }
    themeName.textContent = th.name;
    themeBy.textContent = th.by ? `by ${th.by}` : '';
    const n = Object.keys(tally.got).length;
    count.textContent = `${n} of ${ACHIEVEMENTS.length}`;
    if (!list.hidden) {
      list.replaceChildren(...ACHIEVEMENTS.map((a) => {
        const have = !!tally.got[a.id];
        const [x, of] = a.have?.(tally) ?? [0, 0];
        const opens = [...BALLS, ...HATS, ...BODIES].filter((y) => y.unlock === a.id).map(lookName);
        return el('li', { className: have ? 'got' : '' }, el('i', { className: 'wd-box' }), el('b', { textContent: a.name }),
          el('span', { textContent: nice(a.about) + (!have && of ? ` (${Math.min(x, of)}/${of})` : '') }),
          ...(opens.length ? [el('em', { textContent: `Opens ${opens.map((o) => nice(o)).join(', ')}` })] : []));
      }));
    }
  }

  return {
    // shown: the room is in view and the pointer is free; couch: not yet sat down
    frame(shown, couch, now) {
      panel.hidden = !shown || closed;
      pill.hidden = !shown || !closed;
      if (!shown && trying) tryOn(null);
      if (!shown || closed) return;
      play.hidden = !couch;
      keys.replaceChildren(...(s.note ? [s.note]
        : couch ? ['or click the TV, or press ', keyCap('Enter')]
        : ['Click the room to take the controls again']));
      redraw();
      const g = me.getContext('2d');
      g.clearRect(0, 0, 150, 150);
      drawLook(g, 75, 118, 30, Math.max(0, s.slot()), trying ? trying.p.with(s.look(), trying.t.k) : s.look(), now / 1000, s.avatar());
    },
    get element() { return panel; },
  };
}

// One game's own page (client/arena.mjs, party.mjs, flight.mjs): the look as
// host.mjs wears it, the achievements this browser keeps (read only: those
// pages count none, and hand out no marshmallows) and its purse, which buys
// here as in the room, shown while the mouse is free, PLAY clicking the game's
// canvas as a player would. None for a guest at the controls or a spectator.
export function pageWardrobe(h, { canvas, q, watch = false }) {
  if (watch || q.get('bot') === '1' || q.get('watch') === '1') return null;
  const tally = loadTally();
  let purse = loadPurse();
  // what this slot's wallet owns as items (client/shop.mjs), once the page has signed in
  const owned = () => ownedLooks(h.badges(h.get(L.CL_SLOT)));
  let got = openSet(tally, purse, owned()), ownedSeen = owned().join();
  const spend = (x) => {
    purse = freshPurse(purse);
    const r = buy(tally, purse, lookId(x), x.price);
    if (r.ok) { purse = r.purse; savePurse(purse); }
    got = openSet(tally, purse, owned());
    return r;
  };
  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().then(() => navigator.keyboard?.lock?.()).catch(() => {});
  };
  const w = createWardrobe({
    look: () => h.get(L.CL_LOOK) >>> 0, wear: (x) => { h.set(L.CL_LOOK, x); saveLook(x); }, got: () => got, tally: () => tally,
    balance: () => balance(tally, purse), buy: spend,
    slot: () => h.get(L.CL_SLOT), avatar: () => h.avatar(h.get(L.CL_SLOT)), sit: () => canvas.click(), fullscreen,
    keys: false, play: 'PLAY', note: 'or click the game', folded: touchWanted(q),
  });
  return {
    frame: (now) => {
      const o = owned().join();
      if (o !== ownedSeen) { ownedSeen = o; got = openSet(tally, purse, owned()); const w = wearable(savedLook(), got); if (!q.has('look') && w !== (h.get(L.CL_LOOK) >>> 0)) h.set(L.CL_LOOK, w); }
      w.frame(!document.pointerLockElement, true, now);
    },
  };
}
