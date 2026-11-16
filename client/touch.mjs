// Touch controls for a phone or a tablet, a few elements over a game's screen
// (removed with remove()). A stick under the left thumb wherever it lands,
// which follows the thumb past its rim and holds W, A, S and D in the
// frontend's own keys: eight equal directions, nothing in the middle fifth.
// Between touches a faint ring shows where it usually goes. A drag anywhere
// else looks, through the frontend's own mouse look as if the pointer were
// locked, and a quick tap there is the frontend's tap(). Round buttons sit in
// the bottom right corner, the first and biggest by the thumb and the rest in
// two rings round it, clear of the corner's HUD; a drag that starts on one of
// them looks too, so one thumb fires and aims at once. Small buttons go down
// the left edge under the way back to the shelf and the chat: what is pressed
// now and then (the view, the board), the whole screen where the browser has
// it, and the settings: how fast a drag turns, whether up looks down, a buzz on
// each press, kept in this browser. A button's label and whether it shows may
// be functions, read again a few times a second. Everything held lets go when
// the page loses the screen. On a device whose main pointer is coarse, or with
// ?touch=1 (?touch=0: never).

export const touchWanted = (q) => (q.get('touch') === '1' ? true : q.get('touch') === '0' ? false
  : typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);

// ---- the player's settings, kept in this browser: look (how fast a drag turns, times the default), invert (up looks
// down), buzz (a short vibration on each press, where the browser has one)
const SETTINGS = 'fireplace.touch';
export const TOUCH_DEFAULTS = Object.freeze({ look: 1, invert: false, buzz: true });
export const LOOK_RANGE = [0.4, 2.5];
export function cleanSettings(s) {
  const look = Number(s?.look);
  return {
    look: Number.isFinite(look) ? Math.round(Math.max(LOOK_RANGE[0], Math.min(LOOK_RANGE[1], look)) * 10) / 10 : TOUCH_DEFAULTS.look,
    invert: s?.invert === true,
    buzz: s?.buzz !== false,
  };
}
let settings = null;
export function touchSettings() {
  if (!settings) { try { settings = cleanSettings(JSON.parse(localStorage.getItem(SETTINGS) || '{}')); } catch { settings = { ...TOUCH_DEFAULTS }; } }
  return settings;
}
export function saveTouchSettings(s) {
  settings = cleanSettings(s);
  try { localStorage.setItem(SETTINGS, JSON.stringify(settings)); } catch { /* this visit only */ }
  return settings;
}

// screen px to a frontend's mouse units: a drag across 1.2 screens is a turn at the default speed (1/16384 turns, at mouse sensitivity sens)
export const touchScale = (sens) => 16384 / (1.2 * Math.max(320, innerWidth) * sens) * touchSettings().look;

// What a HUD says about the keys and the mouse, in a phone's words: a tap for a click, a drag for the mouse, and for
// Space party's hop, whose button says HOP.
export const touchWords = (s) => String(s).replace(/WITH THE MOUSE/g, 'BY DRAGGING').replace(/\bCLICK\b/g, 'TAP').replace(/\bSPACE\b/g, 'HOP');

// ---- the stick's arithmetic
// The keys a thumb (dx, dy) px from the stick's centre holds, as the frontends' MOVES bits (W 1, S 2, A 4, D 8): none
// inside dead of its reach R, else one of eight equal directions (screen y runs down, so up is W).
export const STICK_CODES = ['KeyW', 'KeyS', 'KeyA', 'KeyD'];
const SECTOR = [8, 8 | 2, 2, 2 | 4, 4, 4 | 1, 1, 1 | 8]; // right, down right, down, ... by 45 degrees from +x
export function stickBits(dx, dy, R, dead = 0.2) {
  if (!(Math.hypot(dx, dy) >= dead * R)) return 0;
  return SECTOR[Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) & 7];
}
// The stick's centre once the thumb at (x, y) has pulled it along: never more than R behind.
export function follow(cx, cy, x, y, R) {
  const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
  if (d <= R) return [cx, cy];
  const k = (d - R) / d;
  return [cx + dx * k, cy + dy * k];
}

// ---- where things go. A button's centre, px from the screen's right and bottom edges (inside the safe area): the
// big one by the thumb, a ring round it (above, above left, left) and a wider one (left of those, upward). The ring's
// low spot keeps above the bottom 60 px, where the arena's guns and golf's distances are drawn.
export const BIG = 84, MID = 58, SMALL = 44;
const C0 = [70, 90];
const ring = (r, deg) => [Math.round(C0[0] + r * Math.cos(deg * Math.PI / 180)), Math.round(C0[1] + r * Math.sin(deg * Math.PI / 180))];
export const SPOTS = [C0, ring(84, 90), ring(84, 45), ring(84, 0), ring(152, 78), ring(152, 50), ring(152, 22)];
// the small ones: down the left edge, under the shelf's link (client/shelf-link.mjs) and the chat's button
// (client/chat.mjs, CHAT_SPOT), short of the bottom left corner, where party's map and the arena's tracker are
const LEFT_X = 12, LEFT_STEP = 52, LEFT_TOP = 112;
export const CHAT_SPOT = { left: `calc(${LEFT_X}px + env(safe-area-inset-left, 0px))`, top: `calc(${LEFT_TOP - LEFT_STEP}px + env(safe-area-inset-top, 0px))`, width: `${SMALL}px`, height: `${SMALL}px` };
// the stick's reach, and where its ring shows until a thumb has used it (its centre, px from the left and bottom)
export const STICK_R = 58;
const REST = [150, 120];
// what this page has been shown once and used: the stick's ring and the look's word go once each has been
const taught = { stick: false, look: false };
// a touch further right than this fraction of the screen looks; one nearer the left edge moves
const STICK_SIDE = 0.45;

const CSS = `
.tc { position: fixed; inset: 0; z-index: 20; touch-action: none; user-select: none; -webkit-user-select: none;
  -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }
.tc-stick { position: fixed; width: ${2 * STICK_R}px; height: ${2 * STICK_R}px; margin: -${STICK_R}px 0 0 -${STICK_R}px; border-radius: 50%;
  background: rgba(20, 22, 30, 0.3); border: 2px solid rgba(255, 255, 255, 0.4); pointer-events: none; box-sizing: border-box; }
.tc-stick.rest { background: none; border-color: rgba(255, 255, 255, 0.3); }
.tc-stick.rest .tc-knob { opacity: 0.35; }
.tc-stick.gone { display: none; }
.tc-stick b, .tc-hint { position: absolute; color: rgba(255, 255, 255, 0.75); font: 800 11px/1 system-ui, sans-serif; letter-spacing: 0.12em;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7); pointer-events: none; }
.tc-stick b { left: 0; right: 0; bottom: -18px; text-align: center; }
.tc-stick:not(.rest) b { display: none; }
.tc-hint { position: fixed; right: 24%; top: 30%; padding: 6px 10px; border: 1px dashed rgba(255, 255, 255, 0.4); border-radius: 14px; }
.tc-hint[hidden] { display: none; }
.tc-knob { position: absolute; left: ${STICK_R - 25}px; top: ${STICK_R - 25}px; width: 50px; height: 50px; border-radius: 50%;
  margin: -2px 0 0 -2px; background: rgba(255, 255, 255, 0.55); }
.tc-b { position: fixed; box-sizing: border-box; border-radius: 50%; border: 2px solid rgba(255, 255, 255, 0.45);
  background: rgba(20, 22, 30, 0.42); color: #fff; font: 800 12px/1 system-ui, sans-serif; letter-spacing: 0.04em;
  display: flex; align-items: center; justify-content: center; text-align: center; touch-action: none;
  user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6); }
.tc-b.big { font-size: 15px; }
.tc-b.small { font-size: 10px; border-width: 1.5px; background: rgba(20, 22, 30, 0.5); }
.tc-b.lit { border-color: #ffcf6a; color: #ffcf6a; }
.tc-b.on { background: rgba(255, 255, 255, 0.35); }
.tc-b[hidden] { display: none; }
.tc-set { position: fixed; z-index: 40; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(340px, calc(100vw - 32px));
  box-sizing: border-box; padding: 14px 16px; border-radius: 10px; background: rgba(16, 12, 9, 0.94); border: 1px solid rgba(232, 214, 192, 0.3);
  color: #e8d6c0; font: 13px/1.4 ui-monospace, monospace; box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5); touch-action: manipulation;
  user-select: none; -webkit-user-select: none; }
.tc-set h3 { margin: 0 0 10px; font-size: 13px; letter-spacing: 2px; color: #ffcf6a; }
.tc-set label { display: flex; align-items: center; gap: 10px; min-height: 40px; }
.tc-set input[type=range] { flex: 1; min-width: 0; height: 32px; accent-color: #ffcf6a; }
.tc-set input[type=checkbox] { width: 22px; height: 22px; accent-color: #ffcf6a; }
.tc-set button { margin-top: 10px; width: 100%; min-height: 44px; border: 0; border-radius: 8px; background: #ffcf6a; color: #1a1208;
  font: 700 14px ui-monospace, monospace; letter-spacing: 1px; }
.tc-set button.tc-full { background: none; color: #e8d6c0; border: 1px solid rgba(232, 214, 192, 0.45); }
.tc-set[hidden] { display: none; }
`;

function css() {
  if (document.getElementById('tc-css')) return;
  const st = document.createElement('style');
  st.id = 'tc-css';
  st.textContent = CSS;
  document.head.appendChild(st);
}

// A button's place as CSS: a centre (x, y) px in from the right and bottom edges, or with left, from the left and top.
const place = (el, [x, y], size, left = false) => {
  Object.assign(el.style, { width: `${size}px`, height: `${size}px` });
  if (left) Object.assign(el.style, { left: `calc(${x - size / 2}px + env(safe-area-inset-left, 0px))`, top: `calc(${y - size / 2}px + env(safe-area-inset-top, 0px))` });
  else Object.assign(el.style, { right: `calc(${x - size / 2}px + env(safe-area-inset-right, 0px))`, bottom: `calc(${y - size / 2}px + env(safe-area-inset-bottom, 0px))` });
};

// a short buzz on a press, once the page may (Chrome refuses one before the first tap) and the player wants it
const buzz = () => { if (touchSettings().buzz && navigator.userActivation?.hasBeenActive !== false) navigator.vibrate?.(8); };

// The whole screen, where the browser has it (not an iPhone's): in, turned sideways where it can be, or out.
export const canFullscreen = () => typeof document !== 'undefined' && !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
export function toggleFullscreen() {
  const d = document, el = d.documentElement;
  if (d.fullscreenElement || d.webkitFullscreenElement) return (d.exitFullscreen || d.webkitExitFullscreen).call(d)?.catch?.(() => {});
  const go = el.requestFullscreen?.({ navigationUI: 'hide' }) ?? el.webkitRequestFullscreen?.();
  return Promise.resolve(go).then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
}

// One round button of the page's own, over the controls and whatever else is
// up (chat's, client/chat.mjs): tap() on a press, style its place and size.
export function touchButton(label, tap, style = {}) {
  css();
  const b = document.createElement('div');
  b.className = 'tc-b small';
  b.textContent = label;
  b.setAttribute('role', 'button');
  Object.assign(b.style, { zIndex: 31, ...style });
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); buzz(); tap(); });
  b.addEventListener('contextmenu', (e) => e.preventDefault());
  document.body.appendChild(b);
  return b;
}

// The settings, as a panel over the game: how fast a drag turns, up looking down, the buzz, and the whole screen
// (where the browser has it) in or out. Its own touches are its.
function settingsPanel(onClose) {
  const s = touchSettings();
  const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
  const speed = el('input', { type: 'range', min: LOOK_RANGE[0], max: LOOK_RANGE[1], step: 0.1, value: s.look });
  const shown = el('b', { textContent: `${s.look.toFixed(1)}x` });
  const invert = el('input', { type: 'checkbox', checked: s.invert });
  const shake = el('input', { type: 'checkbox', checked: s.buzz });
  const done = el('button', { type: 'button', textContent: 'DONE' });
  const whole = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  const full = el('button', { type: 'button', className: 'tc-full', textContent: whole() ? 'LEAVE FULL SCREEN' : 'FULL SCREEN' });
  full.addEventListener('click', () => { toggleFullscreen(); panel.remove(); onClose(); });
  const panel = el('div', { className: 'tc-set' }, el('h3', { textContent: 'TOUCH' }),
    el('label', {}, 'LOOK SPEED', speed, shown),
    el('label', {}, invert, 'DRAG UP TO LOOK DOWN'),
    ...(navigator.vibrate ? [el('label', {}, shake, 'BUZZ ON A PRESS')] : []),
    ...(canFullscreen() ? [full] : []),
    done);
  const save = () => { const n = saveTouchSettings({ look: Number(speed.value), invert: invert.checked, buzz: shake.checked }); shown.textContent = `${n.look.toFixed(1)}x`; };
  speed.addEventListener('input', save);
  invert.addEventListener('change', save);
  shake.addEventListener('change', save);
  done.addEventListener('click', () => { panel.remove(); onClose(); });
  for (const ev of ['pointerdown', 'pointerup', 'click', 'contextmenu']) panel.addEventListener(ev, (e) => e.stopPropagation());
  document.body.appendChild(panel);
  return panel;
}

// keep a finger's moves on what it pressed, as far as the browser lets it
const capture = (el, e) => { try { el.setPointerCapture(e.pointerId); } catch { /* not a pointer it knows */ } };
// a label, a show or a lit as the game has it now; one that can't be read yet (the game not there) stays as it was
const read = (v, was) => { try { return typeof v === 'function' ? v() : v; } catch { return was; } };

// held, writeKeys: the frontend's keys; look(dx, dy): its look, in screen px dragged (the settings' speed and invert
// applied); tap(): a quick tap on the screen away from the stick and the buttons; wake(): called on every touch
// (the sound waits for one). buttons: [{ label, code (held while down), hold(on), tap() (on the press), up() (on
// the release, after any drag: a shot aimed before it goes), show (whether it is there), lit (drawn lit), aim (false:
// a drag on it doesn't look), spot (its place in SPOTS, by default its turn among the corner's), small (down the
// left edge instead) }]; label, show and lit may be functions.
export function touchControls({ held, writeKeys, look, buttons = [], wake = () => {}, tap: onTap = null }) {
  css();
  const root = document.createElement('div');
  root.className = 'tc';
  const stick = document.createElement('div');
  stick.className = 'tc-stick rest';
  const knob = document.createElement('div');
  knob.className = 'tc-knob';
  stick.append(knob, Object.assign(document.createElement('b'), { textContent: 'MOVE' }));
  const hint = Object.assign(document.createElement('div'), { className: 'tc-hint', textContent: 'DRAG TO LOOK', hidden: taught.look });
  root.append(stick, hint);
  document.body.appendChild(root);

  let stickId = -1, cx = 0, cy = 0; // the stick's finger and its centre now
  let lookId = -1, lx = 0, ly = 0, lookAt = 0, lookFrom = [0, 0], lookMoved = 0;
  let bits = -1;
  const restAt = () => [REST[0], innerHeight - REST[1]];
  const drawStick = (x, y, dx, dy, rest) => {
    stick.classList.toggle('rest', rest);
    stick.classList.toggle('gone', rest && taught.stick);
    stick.style.left = `calc(${x}px + ${rest ? 'env(safe-area-inset-left, 0px)' : '0px'})`;
    stick.style.top = `calc(${y}px - ${rest ? 'env(safe-area-inset-bottom, 0px)' : '0px'})`;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  const setKeys = (b) => {
    if (b === bits) return;
    bits = b;
    STICK_CODES.forEach((c, k) => { if (b & (1 << k)) held.add(c); else held.delete(c); });
    writeKeys();
  };
  const stickTo = (x, y) => {
    [cx, cy] = follow(cx, cy, x, y, STICK_R);
    drawStick(cx, cy, x - cx, y - cy, false);
    setKeys(stickBits(x - cx, y - cy, STICK_R));
  };
  const stickOff = () => { stickId = -1; drawStick(...restAt(), 0, 0, true); setKeys(0); };
  stickOff();
  // a drag's look, the settings' speed and direction on it
  const turn = (dx, dy) => {
    if (!taught.look && Math.hypot(dx, dy) > 0) { taught.look = true; hint.hidden = true; }
    look(dx, touchSettings().invert ? -dy : dy);
  };

  const down = (e) => {
    if (e.target.closest('.tc-b')) return;
    wake();
    e.preventDefault();
    e.stopPropagation();
    if (e.clientX < innerWidth * STICK_SIDE && stickId < 0) {
      stickId = e.pointerId;
      // the stick's centre where the thumb lands, all of it on the screen
      cx = Math.max(STICK_R, Math.min(innerWidth - STICK_R, e.clientX));
      cy = Math.max(STICK_R, Math.min(innerHeight - STICK_R, e.clientY));
      taught.stick = true;
      stickTo(e.clientX, e.clientY);
    } else if (lookId < 0) {
      lookId = e.pointerId; lx = e.clientX; ly = e.clientY; lookAt = performance.now(); lookFrom = [lx, ly]; lookMoved = 0;
    }
    capture(root, e);
  };
  const move = (e) => {
    if (e.pointerId === stickId) stickTo(e.clientX, e.clientY);
    else if (e.pointerId === lookId) {
      turn(e.clientX - lx, e.clientY - ly);
      lx = e.clientX; ly = e.clientY;
      lookMoved = Math.max(lookMoved, Math.hypot(lx - lookFrom[0], ly - lookFrom[1]));
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };
  const up = (e) => {
    wake(); // a touch's end is what lets a page make sound (or go fullscreen)
    if (e.pointerId === stickId) stickOff();
    if (e.pointerId === lookId) {
      lookId = -1;
      if (e.type === 'pointerup' && onTap && lookMoved < 12 && performance.now() - lookAt < 300) onTap();
    }
  };
  root.addEventListener('pointerdown', down);
  root.addEventListener('pointermove', move);
  root.addEventListener('pointerup', up);
  root.addEventListener('pointercancel', up);
  root.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---- the buttons: the corner's, in SPOTS's order unless a spot is named; the small ones down the left edge,
  // into a second column where the screen is too short for them
  const made = [];
  let corner = 0;
  let panel = null;
  const extra = [{ label: '⚙', small: true, aim: false, tap: () => { panel ??= settingsPanel(() => { panel = null; }); } }];
  for (const b of [...buttons, ...extra]) {
    const small = !!b.small;
    const at = small ? null : SPOTS[b.spot ?? corner++];
    if (!small && !at) continue;
    const size = small ? SMALL : at === SPOTS[0] ? BIG : MID;
    const el = document.createElement('div');
    el.className = `tc-b${small ? ' small' : size === BIG ? ' big' : ''}`;
    el.setAttribute('role', 'button');
    if (typeof b.label === 'string') el.textContent = b.label;
    if (at) place(el, at, size);
    let pid = -1, px = 0, py = 0, moved = 0;
    const on = (yes) => {
      el.classList.toggle('on', yes);
      if (b.code) { if (yes) held.add(b.code); else held.delete(b.code); writeKeys(); }
      b.hold?.(yes);
      if (yes) b.tap?.();
    };
    const release = (fire) => {
      if (pid < 0) return;
      pid = -1;
      on(false);
      if (fire) b.up?.();
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      wake();
      if (pid >= 0) return;
      pid = e.pointerId; px = e.clientX; py = e.clientY; moved = 0;
      capture(el, e);
      buzz();
      on(true);
    });
    // a drag from a button looks once it has gone 6 px, so a thumb settling on it doesn't
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pid || b.aim === false) return;
      e.preventDefault();
      e.stopPropagation();
      moved += Math.hypot(e.clientX - px, e.clientY - py);
      if (moved > 6) turn(e.clientX - px, e.clientY - py);
      px = e.clientX; py = e.clientY;
    });
    el.addEventListener('pointerup', (e) => { e.stopPropagation(); wake(); if (e.pointerId === pid) release(true); });
    el.addEventListener('pointercancel', (e) => { e.stopPropagation(); if (e.pointerId === pid) release(false); });
    el.addEventListener('lostpointercapture', (e) => { if (e.pointerId === pid) release(false); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    root.appendChild(el);
    made.push({ b, el, release, small, label: null, show: null, lit: null });
  }
  // the small ones that show, down the left edge and on into a second column
  const column = () => {
    const rows = Math.max(1, Math.floor((innerHeight - 16 - LEFT_TOP + LEFT_STEP - SMALL) / LEFT_STEP));
    let k = 0;
    for (const m of made) if (m.small && m.show !== false) { place(m.el, [LEFT_X + SMALL / 2 + LEFT_STEP * Math.floor(k / rows), LEFT_TOP + SMALL / 2 + LEFT_STEP * (k % rows)], SMALL, true); k++; }
  };
  column();
  // labels, showing and lighting as the game has them now, a few times a second
  let raf = 0, readAt = -1e9;
  const refresh = (now) => {
    raf = requestAnimationFrame(refresh);
    if (now - readAt < 120) return;
    readAt = now;
    let moved = false;
    for (const m of made) {
      const label = String(read(m.b.label, m.label) ?? ''), show = m.b.show === undefined ? true : !!read(m.b.show, m.show ?? true), lit = !!read(m.b.lit, m.lit);
      if (label !== m.label) { m.label = label; m.el.textContent = label; m.el.style.fontSize = label.length > 6 ? (m.el.classList.contains('big') ? '12px' : '10px') : ''; }
      if (show !== m.show) { m.show = show; m.el.hidden = !show; if (!show) m.release(false); moved ||= m.small; }
      if (lit !== m.lit) { m.lit = lit; m.el.classList.toggle('lit', lit); }
    }
    if (moved) column();
  };
  raf = requestAnimationFrame(refresh);

  // the page losing the screen (another app, the screen off, a dialog) lets go of everything held
  const letGo = () => { if (stickId >= 0) stickOff(); lookId = -1; for (const m of made) m.release(false); };
  const hidden = () => { if (document.hidden) letGo(); };
  addEventListener('blur', letGo);
  addEventListener('pagehide', letGo);
  document.addEventListener('visibilitychange', hidden);
  const placeRest = () => { if (stickId < 0) drawStick(...restAt(), 0, 0, true); column(); };
  addEventListener('resize', placeRest);

  return {
    remove() {
      cancelAnimationFrame(raf);
      removeEventListener('blur', letGo);
      removeEventListener('pagehide', letGo);
      removeEventListener('resize', placeRest);
      document.removeEventListener('visibilitychange', hidden);
      letGo();
      for (const c of STICK_CODES) held.delete(c);
      for (const b of buttons) if (b.code) held.delete(b.code);
      writeKeys();
      panel?.remove();
      root.remove();
    },
  };
}
