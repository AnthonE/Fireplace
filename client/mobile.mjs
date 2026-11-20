// A page that plays, on a phone or a tablet: what it needs beside the touch
// controls a game puts over its screen (client/touch.mjs). The page held
// still: no pinch or double-tap zoom, no pull to refresh or rubber band, no
// text picked up and no callout under a long press. The end of the first
// touch on the game (only a person's gesture may start these) wakes the
// sound, takes the whole screen turned sideways where the browser can
// (Android's Chrome; an iPhone's page gets there from the home screen, as
// client/manifest.webmanifest has it) and keeps the screen awake while the
// page is in view. While the phone is upright a card asks for it sideways,
// with a way to play upright anyway. And the size the game is drawn at:
// refit(current, fn) calls fn([w, h]) once the window has settled at a size
// that wants another canvas (the phone turned, the whole screen in or out,
// the browser's bars), and frame(now) watches the frame rate, asking for the
// game at 0.8 of the size, and then 0.64, where it runs under 40 a second.
// On a device whose main pointer is coarse, or with ?touch=1, as the controls.
//   ?fullscreen=0 never takes the whole screen by itself; ?res=WxH draws at one size, never refit
import { touchWanted, canFullscreen, toggleFullscreen } from './touch.mjs';
import { fitSize } from './host.mjs';

const UPRIGHT = 'fireplace.upright'; // this tab plays upright: the card stays away

const CSS = `
html, body { overscroll-behavior: none; touch-action: none; -webkit-tap-highlight-color: transparent; -webkit-text-size-adjust: 100%; }
body { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
button, a, [role=button], label { touch-action: manipulation; }
input, textarea { -webkit-user-select: text; user-select: text; touch-action: manipulation; }
#wardrobe .wd-scroll, .chat-log { touch-action: pan-y; }
#chat { left: calc(64px + env(safe-area-inset-left, 0px)); }
#turn-card { position: fixed; inset: 0; z-index: 50; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 14px; padding: 24px; background: rgba(8, 9, 14, 0.9); color: #e8d6c0; font: 13px/1.4 ui-monospace, monospace; text-align: center; }
#turn-card[hidden] { display: none; }
#turn-card b { font-size: 16px; letter-spacing: 2px; color: #ffcf6a; }
#turn-card .turn-phone { width: 46px; height: 78px; border: 3px solid #e8d6c0; border-radius: 9px; box-sizing: border-box;
  animation: turn-it 2.4s ease-in-out infinite; }
#turn-card button { min-height: 44px; padding: 0 18px; border: 1px solid rgba(232, 214, 192, 0.45); border-radius: 22px; background: none;
  color: #e8d6c0; font: 700 12px ui-monospace, monospace; letter-spacing: 1px; }
@keyframes turn-it { 0%, 25% { transform: rotate(0deg); } 55%, 100% { transform: rotate(-90deg); } }
`;

// The frame rate the game is drawn at a smaller size below: the median gap between frames, in a window of
// this long once the size has settled, over GAP_MS; at most STEPS steps of STEP each.
const WINDOW_MS = 2500, SETTLE_MS = 2500, GAP_MS = 25, STEP = 0.8, STEPS = 2;
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
// Whether two sizes differ enough to draw at the new one: by more than 6% either way.
export const refitWanted = ([w, h], [w2, h2]) => Math.abs(w2 - w) > w * 0.06 || Math.abs(h2 - h) > h * 0.06;
// A window's median frame gap says the game is drawn too large for this device: 40 frames a second or fewer.
export const tooSlow = (gaps) => gaps.length >= 20 && median(gaps) > GAP_MS;

// q: the page's query; wake(): the sound's (client/sound.mjs), max: the canvas's largest size as fitSize takes it
export function phonePage(q, { wake = () => {}, max } = {}) {
  if (!touchWanted(q)) return { on: false, scale: 1, size: () => fitSize(q, max), refit() {}, frame() {} };
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);
  // pinches and double taps: Safari's own gestures, and a second finger's moves anywhere the page didn't already stop them
  for (const t of ['gesturestart', 'gesturechange', 'dblclick']) document.addEventListener(t, (e) => e.preventDefault());
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 && e.cancelable) e.preventDefault(); }, { passive: false });

  // ---- the screen kept awake while the page is in view, once someone has touched the game
  let awake = null, asking = false, wantAwake = false;
  const stayAwake = async () => {
    if (!navigator.wakeLock || document.hidden || awake || asking) return;
    asking = true;
    try { awake = await navigator.wakeLock.request('screen'); awake.addEventListener('release', () => { awake = null; }); } catch { /* refused: the screen may sleep */ }
    asking = false;
  };
  document.addEventListener('visibilitychange', () => { if (!document.hidden && wantAwake) stayAwake(); });

  // ---- the first touch's end on the game: the sound, the screen awake, the whole screen sideways (once by itself)
  let whole = q.get('fullscreen') !== '0' && canFullscreen();
  const touched = (e) => {
    wake();
    if (!e.target?.closest?.('.tc, #stage, canvas, .wd-play')) return; // the page's own buttons and panels are theirs, but PLAY
    wantAwake = true;
    stayAwake();
    if (whole && !document.fullscreenElement && !document.webkitFullscreenElement) { whole = false; toggleFullscreen(); }
  };
  addEventListener('pointerup', touched, true);
  addEventListener('touchend', touched, true);

  // ---- upright: a card asking for the phone sideways, until it is (or the player says upright is fine)
  const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
  const upright = el('button', { type: 'button', textContent: 'PLAY UPRIGHT' });
  const card = el('div', { id: 'turn-card', hidden: true }, el('div', { className: 'turn-phone' }), el('b', { textContent: 'TURN YOUR PHONE SIDEWAYS' }),
    el('span', { textContent: 'The games are wide. Rotation lock off, or the whole screen turns it for you.' }), upright);
  document.body.appendChild(card);
  let keepUpright = (() => { try { return sessionStorage.getItem(UPRIGHT) === '1'; } catch { return false; } })();
  const showCard = () => { card.hidden = keepUpright || innerHeight <= innerWidth * 1.1; };
  upright.addEventListener('click', () => { keepUpright = true; try { sessionStorage.setItem(UPRIGHT, '1'); } catch { /* this page only */ } showCard(); });
  card.addEventListener('pointerup', (e) => { if (e.target !== upright) { wake(); if (whole) { whole = false; toggleFullscreen(); } } });
  showCard();

  // ---- the size: the window settled at another, or the frame rate too low at this one
  let scale = 1, steps = 0;
  let current = null, fit = null, fitting = null, settleAt = 0;
  const want = () => fitSize(q, max, scale);
  // typing (the chat's input) has the keyboard up: the window is that much shorter until it goes
  const typing = () => /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '');
  const check = async () => {
    if (!fit || fitting || q.has('res') || typing()) return;
    const to = want();
    if (!refitWanted(current(), to)) return;
    fitting = (async () => { try { await fit(to); } catch (e) { console.error(e); } })();
    await fitting;
    fitting = null;
    settleAt = performance.now();
    check(); // the window may have moved on meanwhile
  };
  let quiet = 0;
  const changed = () => { showCard(); clearTimeout(quiet); quiet = setTimeout(check, 300); settleAt = performance.now() + 300; };
  addEventListener('resize', changed);
  screen.orientation?.addEventListener?.('change', changed);
  document.addEventListener('fullscreenchange', changed);
  document.addEventListener('webkitfullscreenchange', changed);
  visualViewport?.addEventListener('resize', changed);
  document.addEventListener('focusout', changed);

  let gaps = [], lastAt = 0, windowAt = 0;
  return {
    on: true,
    get scale() { return scale; },
    // the canvas's size now, as this device draws it
    size: () => (q.has('res') ? fitSize(q, max) : want()),
    // current(): the canvas's size now; fn([w, h]) draws the game at a new one (async; the next waits for it)
    refit(cur, fn) { current = cur; fit = fn; settleAt = performance.now(); },
    // each drawn frame's time: under 40 a second for a whole window, the next size down
    frame(now) {
      if (document.hidden || fitting || now < settleAt + SETTLE_MS || steps >= STEPS || !fit || q.has('res')) { lastAt = 0; gaps = []; windowAt = now; return; }
      if (lastAt) gaps.push(now - lastAt);
      lastAt = now;
      if (now - windowAt < WINDOW_MS) return;
      const slow = tooSlow(gaps);
      gaps = [];
      windowAt = now;
      if (!slow) return;
      steps++;
      scale *= STEP;
      console.info(`touch: drawing at ${Math.round(scale * 100)}% for the frame rate`);
      check();
    },
  };
}

// One game's own page (party.html, arena.html, ...): the game mount() gives, and on a phone drawn again at the
// size refit asks for, unmounted and mounted afresh on a new renderer (h.renderers' key). Its frame(now) draws
// the game and times it; game the one mounted now.
export async function fitted(h, phone, { canvas, key, mount }) {
  if (phone.on) canvas.style.imageRendering = 'auto'; // a phone's canvas is shown at no whole multiple of its pixels
  let game = await mount(), busy = false;
  phone.refit(() => [canvas.width, canvas.height], async ([w, hh]) => {
    busy = true;
    try {
      game.unmount();
      const r = h.renderers.get(key);
      h.renderers.delete(key);
      // (kept as the promise of it: client/host.mjs renderer())
      Promise.resolve(r).then((x) => x?.destroy?.(), () => {});
      [canvas.width, canvas.height] = [w, hh];
      game = await mount();
    } finally { busy = false; }
  });
  return {
    get game() { return game; },
    frame(now, target) { if (busy) return; game.frame(now, target); phone.frame(now); },
    capture: (...a) => game.capture(...a),
    state: () => game.state(),
  };
}
