// Chat, the page's half: one log and one input every game's page shares
// (client/host.mjs makes it; golf's own page, client/main.mjs, too). A line
// rides beside the ticks (net/wire.mjs T_CHAT): the relay cleans it,
// rate-limits its slot and sends it on with the slot, and nothing of it ever
// reaches the sim. The log shows the last LINES, each for SHOW_MS, in the
// band the HUDs leave clear on the left, under their top lines and over the
// arena's feed (19% to 49% of the height), the oldest cut off at its top;
// the input opens under it. / opens the input (free in the room and in
// every game: Enter sits you down on the couch and T turns the room's
// theme), Enter sends, Esc closes, and on a phone a CHAT button does both
// (client/touch.mjs). A speaker's line also stands over their head for
// BUBBLE_MS where a frontend draws bubbles (the arena, Party): it asks
// bubbles() each frame and puts them in its HUD.
//
// While the input is open the games must not hear the keys. Their handlers
// are on the document, so this one, on the window in the capture phase,
// stops each keydown before them; a window blur, which every frontend
// already answers by dropping its held keys and its trigger, is sent as the
// input opens; and while the pointer is locked the mouse's moves and
// presses stop here too, so the view holds still. The lock itself is kept,
// so Enter goes straight back to the game.
//
// The viewer can turn chat off (the input's own button, or the line /off;
// kept in this browser), and mute a speaker for the session by clicking
// their name in the log. A local room has no relay to say chat is open, so
// there the key does nothing and nothing shows.
import { CHAT } from '../net/wire.mjs';
import { cleanLine, bubbleLines, chatBucket, CHAT_MAX, CHAT_PER_S, CHAT_BURST } from '../net/chat.mjs';
import { slotColor } from './looks.mjs';
import { touchWanted, touchButton } from './touch.mjs';

export const CHAT_KEY = 'Slash';
const LINES = 6; // lines the log holds
const SHOW_MS = 12000; // how long a line stays up, the input closed
export const BUBBLE_MS = 5000; // and over its speaker's head
const OFF_KEY = 'fireplace.chat.off';

const CSS = `
#chat { position: fixed; left: 12px; top: 19%; height: 30%; width: min(340px, 62vw); z-index: 30; pointer-events: none;
  display: flex; flex-direction: column; justify-content: flex-end; font: 13px/1.35 system-ui, sans-serif; color: #f2f2f2; }
#chat .chat-log { display: flex; flex-direction: column; justify-content: flex-end; min-height: 0; overflow: hidden; }
#chat .chat-line { flex: none; margin-top: 2px; padding: 1px 6px; border-radius: 4px; background: rgba(10, 12, 18, 0.55); width: fit-content; max-width: 100%;
  box-sizing: border-box; overflow-wrap: anywhere; opacity: 0; transition: opacity 0.6s; text-shadow: 0 1px 1px #000; }
#chat .chat-line.on { opacity: 1; }
#chat .chat-line.sys { color: #b8c0d0; font-style: italic; }
#chat button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
#chat .chat-line.on button, #chat .chat-bar { pointer-events: auto; }
#chat .chat-who { font-weight: 700; margin-right: 5px; }
#chat .chat-who:hover, #chat .chat-undo:hover { text-decoration: underline; }
#chat .chat-undo { margin-left: 6px; text-decoration: underline; }
#chat .chat-bar { position: absolute; left: 0; right: 0; top: 100%; margin-top: 5px; padding: 6px; border-radius: 6px; background: rgba(10, 12, 18, 0.72); }
#chat .chat-in { box-sizing: border-box; width: 100%; margin-bottom: 4px; padding: 5px 8px; border: 1px solid rgba(255, 255, 255, 0.5); border-radius: 5px;
  background: rgba(10, 12, 18, 0.85); color: #fff; font: inherit; outline: none; }
#chat .chat-tip { font-size: 11px; color: #b8c0d0; }
#chat .chat-off { margin-left: 6px; text-decoration: underline; }
#chat[hidden], #chat [hidden] { display: none; }
`;

const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
};
const saved = () => { try { return localStorage.getItem(OFF_KEY) === '1'; } catch { return false; } };
const save = (off) => { try { if (off) localStorage.setItem(OFF_KEY, '1'); else localStorage.removeItem(OFF_KEY); } catch { /* a private window: this visit only */ } };

// Where a bubble's lines go in a HUD of text cells (4 x 6 HUD px each, hs
// screen px a HUD px, the text's corner at hudX, hudY): the last line a row
// over the point (x, y: screen px, the top of a head), centred on it, kept
// inside the text's columns. { col, row (its first line's), w (its widest
// line, in characters), rect: [x0, y0, x1, y1] screen px, the backing }, or
// null for one that would leave the rows.
export function bubbleAt(x, y, lines, { hudX = 0, hudY = 0, hs, cols, rows }) {
  const w = Math.max(...lines.map((l) => l.length));
  const col = Math.max(1, Math.min(cols - 1 - w, Math.round((x - hudX) / hs / 4 - w / 2)));
  const row = Math.floor((y - hudY) / hs / 6) - lines.length;
  // (the top two rows are the clock's and the scores')
  if (row < 2 || row + lines.length > rows) return null;
  return { col, row, w, rect: [hudX + (col * 4 - 2) * hs, hudY + (row * 6 - 2) * hs, hudX + ((col + w) * 4 + 1) * hs, hudY + ((row + lines.length) * 6) * hs] };
}

// send(text): a line to the relay (the net worker's { say }); label(p): what
// a slot goes by (host.label); me(): this page's slot, -1 for none; live(p):
// is slot p still in the room (a mute goes with whoever it was for).
export function createChat({ q = new URLSearchParams(), send = () => {}, label = (p) => `P${p + 1}`, me = () => -1, live = () => true } = {}) {
  if (!document.getElementById('chat-css')) document.head.append(el('style', { id: 'chat-css', textContent: CSS }));
  const log = el('div', { className: 'chat-log' });
  const input = el('input', { className: 'chat-in', type: 'text', maxLength: CHAT_MAX, autocomplete: 'off', spellcheck: false, enterKeyHint: 'send' });
  input.setAttribute('aria-label', 'Say something to the room');
  const toggle = el('button', { className: 'chat-off', type: 'button' });
  const tipText = el('span');
  const tip = el('div', { className: 'chat-tip' }, tipText, toggle);
  const bar = el('div', { className: 'chat-bar', hidden: true }, input, tip);
  const root = el('div', { id: 'chat', hidden: true }, log, bar);
  document.body.append(root);

  let status = ''; // '' until the relay says: 'open' (may speak), 'listen' (a spectator), 'off' (a room with none)
  let off = saved(); // the viewer's own switch
  let typing = false;
  const lines = []; // { slot (-1: the page's own word), text, born, node }
  const muted = new Set();
  const said = new Map(); // slot -> { lines, at }: what stands over its head
  const bucket = chatBucket(CHAT_PER_S * 0.8, CHAT_BURST); // a little under the relay's, so it never has to drop ours

  const show = () => {
    const now = performance.now();
    root.hidden = !status || status === 'off' || (off && !typing);
    for (const l of lines) l.node.classList.toggle('on', typing || now - l.born < SHOW_MS);
    log.hidden = off;
    toggle.textContent = off ? 'turn chat on' : 'turn chat off';
    input.hidden = off || status !== 'open';
    const says = off ? 'Chat is off. Enter turns it on.' : status === 'open' ? 'Enter sends · Esc closes · /off hides chat · click a name to mute' : 'You are watching: you hear the room.';
    if (tipText.textContent !== says) tipText.textContent = says;
  };
  const push = (slot, node) => {
    lines.push({ slot, born: performance.now(), node });
    log.append(node);
    while (lines.length > LINES) lines.shift().node.remove();
    // drawn at 0 first, so it fades in
    requestAnimationFrame(show);
  };
  const note = (text, ...more) => push(-1, el('div', { className: 'chat-line sys' }, text, ...more));
  const who = (p) => (p === me() ? 'YOU' : label(p));
  const css = (p) => `rgb(${slotColor(p).map((v) => Math.round(120 + 135 * Math.min(1, v))).join(',')})`;
  // a button that keeps the input's focus when pressed
  const button = (props, fn) => {
    const b = el('button', { type: 'button', ...props });
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    return b;
  };
  function mute(p, yes) {
    if (yes === muted.has(p) || p === me()) return;
    if (yes) muted.add(p); else muted.delete(p);
    for (const l of lines) if (l.slot === p) l.node.hidden = yes;
    if (yes) { said.delete(p); note(`${label(p)} muted.`, button({ className: 'chat-undo', textContent: 'unmute' }, () => mute(p, false))); }
    else note(`${label(p)} unmuted.`);
  }
  const line = (slot, text) => {
    const name = button({ className: 'chat-who', textContent: who(slot), title: slot === me() ? '' : 'Mute for this session' }, () => mute(slot, true));
    name.style.color = css(slot);
    push(slot, el('div', { className: 'chat-line' }, name, el('span', { textContent: text })));
    said.set(slot, { lines: bubbleLines(text), at: performance.now() });
  };

  const TOUCH = touchWanted(q);
  const chatBtn = TOUCH ? touchButton('CHAT', () => { if (typing) close(); else open(); }, { left: '12px', top: '64px', width: '48px', height: '48px', fontSize: '11px' }) : null;
  if (chatBtn) chatBtn.hidden = true;

  // the relay's messages, as the net worker hands them on: { kind, slot, text }
  function heard(m) {
    if (m.kind !== CHAT.LINE) {
      const was = status;
      status = m.kind === CHAT.OPEN ? 'open' : m.kind === CHAT.LISTEN ? 'listen' : 'off';
      if (chatBtn) chatBtn.hidden = status !== 'open';
      if (status === 'open' && was !== 'open' && !off) note(TOUCH ? 'Tap CHAT to talk to the room.' : 'Press / to talk to the room.');
      if (status === 'off' && typing) close();
      show();
      return;
    }
    if (off || muted.has(m.slot)) return;
    // cleaned again here: a relay that isn't ours may not have
    const text = cleanLine(m.text);
    if (text) line(m.slot, text);
  }
  // a new session (a failover's too) may not speak until its relay says so
  function reset() { status = ''; if (chatBtn) chatBtn.hidden = true; if (typing) close(); show(); }

  function open() {
    if (typing || !status || status === 'off') return;
    typing = true;
    // the games drop their held keys and triggers on a window blur, and typing is one
    dispatchEvent(new Event('blur'));
    bar.hidden = false;
    input.value = '';
    show();
    if (!input.hidden) input.focus({ preventScroll: true });
  }
  function close() {
    if (!typing) return;
    typing = false;
    bar.hidden = true;
    input.blur();
    show();
  }
  // the viewer's switch: the button, or with the pointer locked /off, and Enter to turn it back on
  function setOff(yes) {
    off = yes;
    save(off);
    if (off) said.clear();
    show();
    if (typing && !input.hidden) input.focus({ preventScroll: true });
  }
  function submit() {
    if (off) { setOff(false); return; }
    if (input.value.trim().toLowerCase() === '/off') { setOff(true); close(); return; }
    const text = cleanLine(input.value);
    if (text && status === 'open') {
      if (bucket.take(performance.now())) send(text);
      else note('Too fast: that line was not sent.');
    }
    close();
  }
  toggle.addEventListener('mousedown', (e) => e.preventDefault());
  toggle.addEventListener('click', (e) => { e.stopPropagation(); setOff(!off); });
  // clicking away closes it; a press on one of its own buttons keeps the focus (above)
  input.addEventListener('blur', () => { if (typing && !input.hidden) close(); });

  const editable = (t) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  const onKey = (e) => {
    if (typing) {
      e.stopImmediatePropagation();
      if (e.isComposing || e.keyCode === 229) return; // an input method's own Enter
      if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); submit(); }
      else if (e.code === 'Escape') { e.preventDefault(); close(); }
      else if (e.code === 'Tab') e.preventDefault();
      return;
    }
    if (e.code !== CHAT_KEY || e.repeat || e.ctrlKey || e.metaKey || e.altKey || editable(e.target)) return;
    if (!status || status === 'off') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    open();
  };
  // the mouse, while the pointer is locked: nothing turns or fires, and a press doesn't take the input's focus
  const onMouse = (e) => {
    if (!typing || !document.pointerLockElement) return;
    e.stopImmediatePropagation();
    if (e.type === 'mousedown') e.preventDefault();
  };
  // Esc with the pointer locked never reaches the page: the browser lets the pointer go instead
  const onLock = () => { if (typing && !document.pointerLockElement) close(); };
  const ac = new AbortController();
  const on = (t, type, fn) => t.addEventListener(type, fn, { capture: true, signal: ac.signal });
  on(window, 'keydown', onKey);
  for (const t of ['pointerrawupdate', 'pointermove', 'mousedown', 'wheel']) on(window, t, onMouse);
  on(document, 'pointerlockchange', onLock);
  const timer = setInterval(() => {
    show();
    for (const p of muted) if (!live(p)) muted.delete(p);
  }, 500);

  return {
    heard, reset, open, close,
    get typing() { return typing; },
    // what stands over heads now: [{ slot, lines }], lines in the HUD font's characters
    bubbles(now = performance.now()) {
      const out = [];
      if (off || !status || status === 'off') return out;
      for (const [slot, b] of said) { if (now - b.at > BUBBLE_MS) said.delete(slot); else out.push({ slot, lines: b.lines }); }
      return out;
    },
    // for the gates
    state: () => ({ status, off, typing, muted: [...muted], lines: lines.filter((l) => l.slot >= 0 && !l.node.hidden).map((l) => ({ slot: l.slot, who: l.node.firstChild.textContent, text: l.node.lastChild.textContent })),
      notes: lines.filter((l) => l.slot < 0).map((l) => l.node.textContent), shown: !root.hidden && lines.filter((l) => l.node.classList.contains('on')).length }),
    mute,
    remove() { ac.abort(); clearInterval(timer); root.remove(); chatBtn?.remove(); },
  };
}
