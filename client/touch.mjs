// Touch controls for a phone or a tablet: a stick under the left thumb
// wherever it lands (WASD into the frontend's own held keys), a drag anywhere
// else to look (the frontend's own mouse look, as if the pointer were locked),
// and round buttons on the right, the first and biggest by the thumb. On a
// device whose main pointer is coarse, or with ?touch=1 (?touch=0: never).
// Drawn as a few elements over the page, removed with remove().

// screen pixels to a frontend's mouse units: a drag across 1.2 screens is a turn (1/16384 turns, at mouse sensitivity sens)
export const touchScale = (sens) => 16384 / (1.2 * Math.max(320, innerWidth) * sens);

export const touchWanted = (q) => (q.get('touch') === '1' ? true : q.get('touch') === '0' ? false
  : typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);

const CSS = `
.tc { position: fixed; inset: 0; z-index: 20; touch-action: none; user-select: none; -webkit-user-select: none; }
.tc-stick { position: fixed; width: 120px; height: 120px; margin: -60px 0 0 -60px; border-radius: 50%;
  background: rgba(20, 22, 30, 0.35); border: 2px solid rgba(255, 255, 255, 0.35); pointer-events: none; display: none; }
.tc-knob { position: absolute; left: 35px; top: 35px; width: 50px; height: 50px; border-radius: 50%;
  background: rgba(255, 255, 255, 0.55); }
.tc-b { position: fixed; width: 64px; height: 64px; border-radius: 50%; border: 2px solid rgba(255, 255, 255, 0.45);
  background: rgba(20, 22, 30, 0.45); color: #fff; font: 800 12px/1 system-ui, sans-serif; letter-spacing: 0.04em;
  display: flex; align-items: center; justify-content: center; touch-action: none; }
.tc-b.big { width: 88px; height: 88px; font-size: 15px; }
.tc-b.on { background: rgba(255, 255, 255, 0.35); }
`;

// held, writeKeys: the frontend's keys; look(dx, dy): its look, in screen
// pixels dragged; buttons: [{ label, code (held while down), hold(on), tap() }];
// wake(): called on every touch (the sound waits for one)
// keep a finger's moves on what it pressed, as far as the browser lets it
const capture = (el, e) => { try { el.setPointerCapture(e.pointerId); } catch { /* not a pointer it knows */ } };

export function touchControls({ held, writeKeys, look, buttons = [], wake = () => {} }) {
  if (!document.getElementById('tc-css')) {
    const st = document.createElement('style');
    st.id = 'tc-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const root = document.createElement('div');
  root.className = 'tc';
  const stick = document.createElement('div');
  stick.className = 'tc-stick';
  const knob = document.createElement('div');
  knob.className = 'tc-knob';
  stick.appendChild(knob);
  root.append(stick);
  document.body.appendChild(root);

  const R = 60, DEAD = 0.3;
  const STICK = ['KeyW', 'KeyS', 'KeyA', 'KeyD'];
  let stickId = -1, sx = 0, sy = 0, lookId = -1, lx = 0, ly = 0;
  const setStick = (dx, dy) => {
    const d = Math.hypot(dx, dy), k = d > R ? R / d : 1;
    knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    const x = dx / R, y = dy / R;
    const want = new Set();
    if (y < -DEAD) want.add('KeyW');
    if (y > DEAD) want.add('KeyS');
    if (x < -DEAD) want.add('KeyA');
    if (x > DEAD) want.add('KeyD');
    for (const c of STICK) { if (want.has(c)) held.add(c); else held.delete(c); }
    writeKeys();
  };
  const down = (e) => {
    if (e.target.closest('.tc-b')) return;
    wake();
    e.preventDefault();
    e.stopPropagation();
    if (e.clientX < innerWidth * 0.42 && stickId < 0) {
      stickId = e.pointerId; sx = e.clientX; sy = e.clientY;
      stick.style.display = 'block'; stick.style.left = `${sx}px`; stick.style.top = `${sy}px`;
      setStick(0, 0);
    } else if (lookId < 0) { lookId = e.pointerId; lx = e.clientX; ly = e.clientY; }
    capture(root, e);
  };
  const move = (e) => {
    if (e.pointerId === stickId) setStick(e.clientX - sx, e.clientY - sy);
    else if (e.pointerId === lookId) { look(e.clientX - lx, e.clientY - ly); lx = e.clientX; ly = e.clientY; }
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  const up = (e) => {
    if (e.pointerId === stickId) { stickId = -1; stick.style.display = 'none'; setStick(0, 0); }
    if (e.pointerId === lookId) lookId = -1;
  };
  root.addEventListener('pointerdown', down);
  root.addEventListener('pointermove', move);
  root.addEventListener('pointerup', up);
  root.addEventListener('pointercancel', up);
  root.addEventListener('contextmenu', (e) => e.preventDefault());

  // the first, big, in the corner; the rest round it, nearest first (right and bottom, px)
  const AT = [[18, 18], [118, 24], [28, 118], [112, 112], [202, 30], [40, 202], [196, 118], [124, 196]];
  buttons.slice(0, AT.length).forEach((b, i) => {
    const el = document.createElement('div');
    el.className = `tc-b${i === 0 ? ' big' : ''}`;
    el.textContent = b.label;
    el.style.right = `${AT[i][0]}px`;
    el.style.bottom = `${AT[i][1]}px`;
    const on = (yes) => {
      el.classList.toggle('on', yes);
      if (b.code) { if (yes) held.add(b.code); else held.delete(b.code); writeKeys(); }
      b.hold?.(yes);
      if (yes) b.tap?.();
    };
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); wake(); capture(el, e); on(true); });
    for (const t of ['pointerup', 'pointercancel']) el.addEventListener(t, (e) => { e.stopPropagation(); on(false); });
    root.appendChild(el);
  });

  return {
    remove() {
      for (const c of STICK) held.delete(c);
      for (const b of buttons) if (b.code) held.delete(b.code);
      writeKeys();
      root.remove();
    },
  };
}
