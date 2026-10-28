// Flight's frontend (src/flight.wat): the arena's client turned into a
// cockpit, mounted on a host (client/host.mjs) that owns the memory, the
// workers and the GPU. The mouse aims and the ship's nose follows it, so the
// camera rides behind the ship looking where you aim; two reticles show where
// the nose (and so the lasers) points, a ring where you aim. Raw mouse and
// keys into the input slots; a frame per display refresh drawn from shared
// memory by client/flight-render.mjs: your ship from the prediction, lasers
// as bolts flying out from the wingtips, charge shots and bombs, blasts,
// engine trails, markers on the ships about you, a radar, shields and hull,
// the boost meter, bombs, the charge, a kill feed and the board, each as the
// match's mode has them (layout.mjs FLIGHT_MODES: a free-for-all, red
// against blue, the juggernaut). flight.html mounts it alone; Fireplace
// mounts it while the room plays Dogfight.
//   opts: { canvas, lockTarget, bot, skill, sens, fixed (a spectator's held camera: x, y, z, yaw, pitch in degrees), present, showGraph,
//           external (the slots are driven from outside, as Fireplace's guest does: the camera follows them) }
//
// Controls: the mouse aims; left click fires lasers (held, as fast as they
// go); right click or Space held builds the charge shot, let go fires it;
// W or Shift boosts, S or Ctrl brakes; Q and E (or A and D twice quickly)
// barrel-roll left and right; G, B or the middle button drops a bomb; Tab
// the board, F fullscreen, N the net graph.
import * as L from '../src/layout.mjs';
import * as F from '../src/flight.mjs';
import { flightWord, modeName } from '../src/flight-view.mjs';
import { unpackArena } from '../src/arena-view.mjs';
import { createRenderer, COLS, MAX_RECT, project, basis } from './flight-render.mjs';
import { AMC, newsOf, SIDE, SIDE_C, SIDE_RGB, sideOf } from './am/index.mjs';
import { put, C } from './font.mjs';
import { readClock } from './clock.mjs';
import { NetGraph } from './netgraph.mjs';
import { Pilot } from './flight-bot.mjs';
import { predict, corrector, capturePng, listeners } from './host.mjs';
import { tintsOf } from './looks.mjs';

const TURN = 16384;
const AIM_MAX = Math.round(F.PITCH_MAX / TURN * 2 * 1024); // the aim's pitch either side of level, word units
export const CAUSE = { [F.KILL_LASER]: 'LASER', [F.KILL_CHARGE]: 'CHARGE', [F.KILL_BOMB]: 'BOMB', [F.KILL_CRASH]: 'CRASHED' };
const MEDALS = ['', '', 'DOUBLE KILL', 'TRIPLE KILL', 'QUAD KILL', 'HIGH FIVE', 'SIX PACK', 'LUCKY SEVEN'];
const SPREES = { 5: 'ACE', 10: 'DOUBLE ACE', 15: 'TRIPLE ACE', 20: 'SKY KING' };
const LASER = [0.45, 1, 0.45];
const NOSE = Number(F.FL_NOSE);
const MARKS = 32; // ships marked on screen at most, the nearest

// How a pilot stands under the match's mode, higher is better (the sim's $a_key while play goes on).
function standing(m, o, teamWin = 0) {
  if (m < 32 && (1 << m) & L.TEAMED) return (teamWin && teamWin === o.team + 1 ? 2 ** 31 : 0) + Math.min(o.points, 0x7fff) * 65536 + Math.min(o.kills, 0xffff);
  // Ring Race's gates passed are its points
  if (m === L.M_JUGGERNAUT || m === F.M_RACE) return o.points * 65536 + o.kills;
  return o.kills * 65536 - o.deaths;
}

export async function mount(host, { canvas, lockTarget = canvas, bot: BOT = false, skill = 0.7, sens: SENS = 3, fixed: FIXED = null, present = true, showGraph: graphOn = false, external = false } = {}) {
  const { u8, i32, f32, f64, view, pview, set, get, press, sound, memory, hashes, keys } = host;
  const WATCH = host.watch || !!FIXED;
  const W = canvas.width, H = canvas.height;
  const renderer = host.renderers.get('flight') || await createRenderer(canvas, { present, device: host.device });
  host.renderers.set('flight', renderer);
  const { on, off } = listeners();
  const epoch = () => performance.timeOrigin + performance.now();

  // ---- input
  let yaw = get(L.CL_YAW), pitch = 512;
  let trigger = false, charging = false, rollLeftUntil = 0;
  const held = new Set();
  const tapped = {}; // A and D: when each was last pressed, for a double tap
  const MOVES = { KeyW: 1, ShiftLeft: 1, ShiftRight: 1, ArrowUp: 1, KeyS: 2, ControlLeft: 2, ArrowDown: 2, KeyA: 4, ArrowLeft: 4, KeyD: 8, ArrowRight: 8, Space: 16 };
  const writeKeys = () => {
    let m = 0;
    for (const k of held) m |= MOVES[k] || 0;
    // a roll left: the left bit held while the roll's press goes out
    if (performance.now() < rollLeftUntil) m = (m & ~8) | 4;
    else if (held.has('KeyE')) m &= ~4;
    if (charging) m |= 16;
    set(L.CL_MOVE, m);
  };
  const aim = () => { set(L.CL_YAW, Math.round(yaw) & 0x3fff); set(L.CL_PITCH, Math.round(pitch)); };
  const roll = (left) => {
    rollLeftUntil = left ? performance.now() + 160 : 0;
    writeKeys();
    press(L.CL_MELEE);
    if (left) setTimeout(writeKeys, 170);
  };
  let locked = document.pointerLockElement === lockTarget;
  let watched = -1;
  let showGraph = graphOn;
  let bot = null;
  const nextLive = (from, step) => {
    for (let k = 1; k <= L.NPLAYER; k++) {
      const p = (((from + step * k) % L.NPLAYER) + L.NPLAYER) % L.NPLAYER;
      if (view.player(p).live) return p;
    }
    return -1;
  };
  if (WATCH) {
    const turn = (step) => { watched = nextLive(watched, step); };
    on(canvas, 'click', () => turn(1));
    on(document, 'keydown', (e) => {
      if (e.code === 'ArrowRight' || e.code === 'Space') turn(1);
      if (e.code === 'ArrowLeft') turn(-1);
      if (e.code === 'Tab') { e.preventDefault(); held.add('Tab'); }
      if (e.code === 'KeyN' && !e.repeat) showGraph = !showGraph;
    });
    on(document, 'keyup', (e) => held.delete(e.code));
  } else if (BOT) {
    if (!external) bot = new Pilot(0, (Math.random() * 1e9) | 0, skill);
    on(document, 'keydown', (e) => {
      if (e.code === 'Tab') { e.preventDefault(); held.add('Tab'); }
      if (e.code === 'KeyN' && !e.repeat) showGraph = !showGraph;
    });
    on(document, 'keyup', (e) => held.delete(e.code));
  } else {
    on(canvas, 'click', () => {
      sound.wake();
      if (!locked) lockTarget.requestPointerLock({ unadjustedMovement: true }).catch(() => lockTarget.requestPointerLock());
    });
    on(document, 'pointerlockchange', () => {
      locked = document.pointerLockElement === lockTarget;
      if (!locked) { held.clear(); trigger = false; charging = false; writeKeys(); set(L.CL_AUTO, 0); }
    });
    const look = (e) => {
      if (!locked) return;
      yaw += e.movementX * SENS;
      pitch = Math.max(512 - AIM_MAX, Math.min(512 + AIM_MAX, pitch - e.movementY * SENS / 8));
      aim();
    };
    on(document, 'onpointerrawupdate' in window ? 'pointerrawupdate' : 'pointermove', look);
    on(document, 'mousedown', (e) => {
      if (!locked) return;
      if (e.button === 0) { press(L.CL_PRESSES); trigger = true; }
      if (e.button === 2) { charging = true; writeKeys(); }
      if (e.button === 1) { e.preventDefault(); press(L.CL_GREN); }
    });
    on(document, 'mouseup', (e) => {
      if (e.button === 0) { trigger = false; set(L.CL_AUTO, 0); }
      if (e.button === 2) { charging = false; writeKeys(); }
    });
    on(document, 'contextmenu', (e) => e.preventDefault());
    on(document, 'keydown', (e) => {
      if (e.code === 'KeyQ' && !e.repeat) roll(true);
      else if (e.code === 'KeyE' && !e.repeat) roll(false);
      else if ((e.code === 'KeyA' || e.code === 'KeyD') && !e.repeat) {
        const now = performance.now();
        if (now - (tapped[e.code] ?? -1e9) < 250) { roll(e.code === 'KeyA'); tapped[e.code] = -1e9; } else tapped[e.code] = now;
      } else if ((e.code === 'KeyG' || e.code === 'KeyB') && !e.repeat) press(L.CL_GREN);
      else if (e.code === 'Space' && !e.repeat) charging = true;
      else if (e.code === 'KeyN' && !e.repeat) showGraph = !showGraph;
      else if (e.code === 'KeyF' && !e.repeat) {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen().then(() => navigator.keyboard?.lock?.()).catch(() => {});
      }
      if (MOVES[e.code] || e.code === 'Tab') e.preventDefault();
      held.add(e.code);
      writeKeys();
    });
    on(document, 'keyup', (e) => { held.delete(e.code); if (e.code === 'Space') charging = false; writeKeys(); });
    on(window, 'blur', () => { held.clear(); trigger = false; charging = false; writeKeys(); set(L.CL_AUTO, 0); });
  }

  // ---- the prediction, with the word in progress
  const live = () => {
    const sent = get(L.CL_SENT), mv = get(L.CL_MOVE);
    const room = get(L.CL_ROOM), next = get(L.CL_NEXT);
    const ahead = (a, s) => ((get(a) - get(s)) > 0 ? get(s) + 1 : get(s)) & 1;
    return flightWord({ yaw: get(L.CL_YAW), pitch: get(L.CL_PITCH), boost: mv & 1, brake: mv & 2, left: mv & 4, right: mv & 8, charge: (mv >> 4) & 1,
      shot: (get(L.CL_PRESSES) - sent) > 0 || get(L.CL_AUTO) ? sent + 1 : sent, roll: ahead(L.CL_MELEE, L.CL_MSENT), bomb: ahead(L.CL_GREN, L.CL_GSENT),
      serial: (get(L.CL_FRAME) >> ((next - room) & 7)) & 1 });
  };
  const corr = corrector(host);

  // ---- what happened: FX into bolts, blasts, the feed and sounds
  const text = new Uint32Array(COLS * renderer.rows);
  const netGraph = new NetGraph(memory, { watch: WATCH });
  const glows = []; // { pos, size, color, kind, born, life, grow }
  const bolts = []; // { a, b, born, life, color }: a laser flying out along a to b
  const feed = [];
  const trails = new Map(); // slot -> [[x, y, z, ms]...], newest last
  let banner = { text: '', until: 0, color: C.YELLOW };
  let medal = { text: '', until: 0 };
  let marker = 0, hurt = 0;
  let fxSeen = 0, seed = -1, lastKill = -1e9, multi = 0, spree = 0, matchSeen = -1, dealt = false;
  const played = {};
  const newer = (a, b) => { const d = (a - b) & 0xffff; return d > 0 && d < 0x8000; };
  let frames = 0, fpsAt = performance.now(), fps = 0, lastFrame = performance.now();
  let me = null, pme = null;
  // a ship as drawn: its centre, nose and right wing (from its record, the confirmed world's extrapolated by dt)
  const shipOf = (v, p, dt) => {
    const s = v.ship(p);
    const [yw, pt] = s.heading;
    const r = [-Math.sin(yw), 0, Math.cos(yw)];
    return { s, pos: s.pos.map((x, k) => x + s.vel[k] * dt), nose: s.nose, right: r };
  };
  const wingtips = (sh) => [-1, 1].map((k) => [0, 1, 2].map((i) => sh.pos[i] + sh.right[i] * 1.9 * k + sh.nose[i] * 0.4));
  const say = (t, color, now) => { feed.push({ text: t, color, born: now }); if (feed.length > 5) feed.shift(); };
  const name = (p, slot) => (p === slot ? 'YOU' : host.label(p));

  function show(f, slot, cam, now, mine, dt) {
    const d = Math.hypot(f.pos[0] - cam[0], f.pos[1] - cam[1], f.pos[2] - cam[2]);
    switch (f.kind) {
      case L.FX_SHOT:
        sound.gun(f.size === F.KILL_LASER ? L.W_PLASMA : L.W_ROCKET, mine ? 0 : d);
        if (f.size === F.KILL_CHARGE) glows.push({ pos: f.pos, size: 2.2, color: [0.6, 1, 0.5, 1], kind: 3, born: now, life: 250 });
        break;
      case L.FX_TRACER: {
        // twin bolts from the wingtips, meeting at the end
        const sh = mine && pme ? { pos: myPos, nose: pme.nose, right: [-Math.sin(pme.heading[0]), 0, Math.cos(pme.heading[0])] } : shipOf(view, f.owner, dt);
        const len = Math.hypot(...[0, 1, 2].map((k) => f.pos[k] - sh.pos[k]));
        for (const a of wingtips(sh)) bolts.push({ a, b: f.pos, born: now, life: Math.max(60, len / 0.45), color: LASER });
        if (len < F.LASER_RANGE - 1) glows.push({ pos: f.pos, size: 0.5, color: [0.7, 1, 0.6, 0.9], kind: 5, born: now + len / 0.45, life: 140 });
        break;
      }
      case L.FX_HIT: {
        const deflect = f.size === F.HIT_DEFLECT;
        glows.push({ pos: f.pos, size: deflect ? 2.4 : 1.1, color: deflect ? [0.6, 0.85, 1, 0.9] : f.size === 1 ? [0.5, 0.75, 1, 0.9] : [1, 0.5, 0.2, 0.9], kind: deflect ? 6 : 5, born: now, life: deflect ? 260 : 180 });
        if (f.owner === slot && slot >= 0) { marker = 1; sound.hit(false); }
        if (f.shot === slot && f.owner !== slot && !deflect) { hurt = Math.min(1, hurt + 0.4); sound.hurt(f.size === 1); }
        break;
      }
      case L.FX_KILL: {
        const md = view.mode();
        const other = md.teamed ? SIDE_C[sideOf(view, f.owner)] : C.WHITE;
        const cause = CAUSE[f.size] || '?';
        say(f.owner === f.shot ? `${name(f.shot, slot)} ${f.size === F.KILL_CRASH ? 'CRASHED' : 'BLEW UP'}` : `${name(f.owner, slot)} [${cause}] ${name(f.shot, slot)}`,
          f.owner === slot ? C.GREEN : f.shot === slot ? C.RED : other, now);
        // a fireball, and sparks thrown out
        glows.push({ pos: f.pos, size: 6, color: [1, 0.55, 0.15, 1], kind: 3, born: now, life: 700, grow: true });
        glows.push({ pos: f.pos, size: 9, color: [1, 0.8, 0.5, 0.5], kind: 6, born: now, life: 450, grow: true });
        for (let k = 0; k < 10; k++) {
          const a = k * 2.4, b = (k % 3 - 1) * 0.6;
          glows.push({ pos: [f.pos[0] + Math.cos(a) * 3, f.pos[1] + b * 3, f.pos[2] + Math.sin(a) * 3], size: 0.8, color: [1, 0.7, 0.3, 1], kind: 5, born: now + k * 20, life: 500 });
        }
        sound.blast(d, 6);
        if (f.owner === slot && f.shot !== slot) {
          multi = now - lastKill < 4500 ? multi + 1 : 1;
          lastKill = now;
          spree++;
          sound.kill();
          const m = SPREES[spree] || MEDALS[Math.min(multi, MEDALS.length - 1)] || (f.size === F.KILL_CHARGE ? 'LOCKED ON' : f.size === F.KILL_BOMB ? 'BOMBS AWAY' : '');
          if (m) medal = { text: m, until: now + 2500 };
          banner = { text: `YOU SHOT DOWN P${f.shot + 1}`, until: now + 1800, color: C.GREEN };
        }
        if (f.shot === slot) {
          spree = 0; multi = 0;
          banner = { text: f.owner === slot ? (f.size === F.KILL_CRASH ? 'YOU CRASHED' : 'YOU BLEW UP') : `SHOT DOWN BY P${f.owner + 1}`, until: now + 3000, color: C.RED };
        }
        break;
      }
      case L.FX_MODE: {
        const own = f.owner === slot;
        const kit = newsOf(f.size);
        if (kit) {
          const team = (p) => sideOf(view, p);
          kit.news(f, { slot, me, name: (p) => name(p, slot), team, feed: (t, color) => say(t, color, now), banner: (t, color, ms = 2500) => { banner = { text: t, until: now + ms, color }; },
            glow: (g) => glows.push({ ...g, born: now, life: g.life ?? 400 }), sound, dist: d, C, now, view });
          break;
        }
        // Ring Race: a gate (your own: a tick), a lap begun or the race finished
        if (f.size === F.MX_GATE) { if (own) sound.tick(); break; }
        if (f.size === F.MX_LAP) {
          const done = f.shot >= F.LAPS;
          say(`${name(f.owner, slot)} ${done ? 'FINISHED' : `LAP ${f.shot + 1}`}`, own ? C.GREEN : C.WHITE, now);
          if (own) { banner = { text: done ? 'FINISHED' : f.shot + 1 === F.LAPS ? 'LAST LAP' : `LAP ${f.shot + 1} OF ${F.LAPS}`, until: now + 2000, color: done ? C.YELLOW : C.CYAN }; sound.pickup(); }
          break;
        }
        if (f.size === L.MX_JUGG) { say(`${name(f.owner, slot)} ${own ? 'ARE' : 'IS'} THE JUGGERNAUT`, C.ORANGE, now); if (own) banner = { text: 'YOU ARE THE JUGGERNAUT', until: now + 2500, color: C.ORANGE }; }
        else if (f.size === L.MX_WIN) say(`${name(f.owner, slot)} ${own ? 'WIN' : 'WINS'}`, C.YELLOW, now);
        else if (f.size === L.MX_TEAMWIN) {
          const won = f.shot === 1 || f.shot === 2 ? f.shot - 1 : -1;
          const t = won < 0 ? 'A DRAW' : `${SIDE[won]} WINS`;
          say(t, won < 0 ? C.YELLOW : SIDE_C[won], now);
          banner = { text: t, until: now + 4000, color: won < 0 ? C.YELLOW : SIDE_C[won] };
          sound.holed();
        }
        break;
      }
      case L.FX_BLAST:
        if (f.size < 1) { glows.push({ pos: f.pos, size: 1.4, color: [1, 0.8, 0.4, 1], kind: 5, born: now, life: 250 }); if (mine || f.owner === slot) sound.land(20); }
        else {
          glows.push({ pos: f.pos, size: f.size, color: f.size > 10 ? [1, 0.45, 0.2, 1] : [0.6, 1, 0.5, 1], kind: 3, born: now, life: 650, grow: true });
          glows.push({ pos: f.pos, size: f.size * 1.3, color: [1, 1, 0.9, 0.4], kind: 6, born: now, life: 350, grow: true });
          sound.blast(d, f.size);
        }
        break;
      case L.FX_SPAWN: {
        const o = view.player(f.owner).pos;
        glows.push({ pos: o, size: 4, color: [0.4, 0.7, 1, 0.8], kind: 6, born: now, life: 600, grow: true });
        if (f.owner === slot) { spree = 0; dealt = true; }
        break;
      }
      default:
    }
  }

  // ---- HUD pieces, in 320 x 200 units scaled to the screen
  const S = W / 320;
  function hudRects(f, now, cv, cam) {
    const out = [];
    const r = (x0, y0, x1, y1, c, a = 1) => out.push([x0 * S, y0 * S, x1 * S, y1 * S, c[0], c[1], c[2], a]);
    // shields over the hull, top centre under the clock
    const sh = Math.min(100, f.sh);
    const low = f.sh < 25 && Math.floor(now / 150) % 2;
    r(109, 8, 211, 15, [0.05, 0.08, 0.12], 0.7);
    r(110, 9, 110 + sh, 14, low ? [1, 0.3, 0.2] : [0.35, 0.7, 1]);
    if (f.sh > 100) r(110, 9, 110 + Math.min(100, f.sh - 100), 14, [1, 0.72, 0.15]);
    for (let k = 0; k < 8; k++) r(110 + k * 12.6, 17, 110 + k * 12.6 + 11, 20, f.hp > k * 12.5 ? (f.hp < 35 ? [1, 0.3, 0.2] : [0.4, 0.9, 0.4]) : [0.15, 0.15, 0.15], 0.85);
    // bottom left: the boost meter, the charge, the bombs
    const boost = f.boost / F.BOOST_MAX;
    r(8, 170, 82, 176, [0.05, 0.08, 0.12], 0.7);
    r(9, 171, 9 + 72 * boost, 175, f.spent ? (Math.floor(now / 200) % 2 ? [1, 0.3, 0.2] : [0.5, 0.2, 0.15]) : [1, 0.75, 0.2]);
    const ch = f.charge / F.CHARGE_TICKS;
    if (ch > 0) { r(8, 179, 82, 183, [0.05, 0.08, 0.12], 0.7); r(9, 180, 9 + 72 * ch, 182, ch >= 1 ? (Math.floor(now / 100) % 2 ? [0.7, 1, 0.5] : [1, 1, 1]) : [0.5, 0.9, 0.4]); }
    for (let k = 0; k < f.bombs; k++) { r(10 + k * 9, 187, 16 + k * 9, 193, [1, 0.35, 0.2]); r(12 + k * 9, 185, 14 + k * 9, 187, [0.8, 0.8, 0.8]); }
    // where the nose points: a small square 30 m out and a bigger one 90 m out
    const hot = onNose(f);
    const col = hot ? [1, 0.3, 0.25] : [0.45, 1, 0.45];
    for (const [dist, half] of [[30, 3.5], [90, 6]]) {
      const [x, y, z] = project(cv, W, H, [0, 1, 2].map((k) => f.drawn[k] + f.nose[k] * dist));
      if (z < 1) continue;
      const X = x / S, Y = y / S, t = 0.8;
      r(X - half, Y - half, X + half, Y - half + t, col, 0.9); r(X - half, Y + half - t, X + half, Y + half, col, 0.9);
      r(X - half, Y - half, X - half + t, Y + half, col, 0.9); r(X + half - t, Y - half, X + half, Y + half, col, 0.9);
    }
    // the ships about you: brackets on the nearest (enemies red, your side's blue), the charge's lock in yellow
    const lock = f.charge >= F.CHARGE_TICKS ? lockOn(f) : -1;
    const near = [];
    for (let p = 0; p < L.NPLAYER; p++) {
      if (p === f.slot) continue;
      const o = view.player(p);
      if (!o.live || u8[L.PLAYERS + p * L.PSIZE + L.P_FL] & L.PF_DEAD) continue;
      const dd = Math.hypot(o.pos[0] - cam[0], o.pos[1] - cam[1], o.pos[2] - cam[2]);
      if (dd < 600) near.push([dd, p, o]);
    }
    near.sort((a, b) => a[0] - b[0]);
    const md = view.mode();
    for (const [dd, p, o] of near.slice(0, MARKS)) {
      const at = o.pos.map((x, k) => x + o.vel[k] * cv.dt);
      const [x, y, z] = project(cv, W, H, at);
      if (z < 1 || x < 0 || x > W || y < 0 || y > H) continue;
      const ally = view.ally(f.slot, p);
      const c = p === lock ? [1, 0.9, 0.2] : ally ? [0.35, 0.6, 1] : md.teamed ? SIDE_RGB[sideOf(view, p)] : view.ship(p).jugg ? [1, 0.72, 0.15] : [1, 0.3, 0.25];
      const X = x / S, Y = y / S, half = Math.max(3, Math.min(10, 600 / Math.max(dd, 1) / S)), t = 0.8, k = half * 0.45;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        const cx = X + sx * half, cy = Y + sy * half;
        r(Math.min(cx, cx - sx * k), cy - t / 2, Math.max(cx, cx - sx * k), cy + t / 2, c, 0.9);
        r(cx - t / 2, Math.min(cy, cy - sy * k), cx + t / 2, Math.max(cy, cy - sy * k), c, 0.9);
      }
      if (p === lock) r(X - 1, Y - 1, X + 1, Y + 1, c, Math.floor(now / 100) % 2 ? 1 : 0.3);
    }
    // Ring Race: the next gate's waypoint, a diamond and its distance (pulled in to the screen's edge off it)
    const gates = md.mode === F.M_RACE ? view.race() : [];
    if (gates.length && f.slot >= 0) {
      const g = gates[view.racer(f.slot, gates.length).next];
      let [x, y, z] = project(cv, W, H, g.pos);
      if (z < 0.3) { x = x < W / 2 ? 0 : W; y = H / 2; }
      // kept over the radar (bottom right) and the bars (bottom left)
      const X = Math.max(8, Math.min(312, x / S)), Y = Math.max(30, Math.min(150, y / S)), c = [1, 0.85, 0.25];
      r(X - 1, Y - 5, X + 1, Y + 5, c, 0.95); r(X - 5, Y - 1, X + 5, Y + 1, c, 0.95); r(X - 3, Y - 3, X + 3, Y + 3, c, 0.5);
      gateAt = [X, Y, Math.round(Math.hypot(g.pos[0] - f.drawn[0], g.pos[1] - f.drawn[1], g.pos[2] - f.drawn[2]))];
    }
    // the radar, bottom right: 300 m about you, your heading up
    const R = 26, cx = W - 34 * S, cy = H - 34 * S;
    const fy = Math.cos(f.heading[0]), fz = Math.sin(f.heading[0]);
    const blips = [];
    for (const [, p, o] of near) {
      const dx = o.pos[0] - f.pos[0], dz = o.pos[2] - f.pos[2];
      const dist = Math.hypot(dx, dz);
      if (dist > 300) continue;
      const fwd = dx * fy + dz * fz, right = -dx * fz + dz * fy;
      const x = cx / S + right / 300 * R, y = cy / S - fwd / 300 * R;
      const ally = view.ally(f.slot, p);
      const c = ally ? [0.35, 0.6, 1] : md.teamed ? SIDE_RGB[sideOf(view, p)] : [1, 0.3, 0.25];
      const above = o.pos[1] - f.pos[1];
      blips.push([(x - 1.5) * S, (y - 1.5) * S, (x + 1.5) * S, (y + 1.5) * S, ...c, 1]);
      if (Math.abs(above) > 15) blips.push([(x - 0.5) * S, (y + (above > 0 ? -4 : 1.5)) * S, (x + 0.5) * S, (y + (above > 0 ? -1.5 : 4)) * S, ...c, 0.8]);
    }
    return { rects: out, blips, radar: [cx, cy, R * S] };
  }

  // Is an enemy close to the nose's line within the lasers' range? For the red reticles.
  function onNose(f) {
    for (let p = 0; p < L.NPLAYER; p++) {
      if (p === f.slot || view.ally(f.slot, p)) continue;
      const o = view.player(p);
      if (!o.live || u8[L.PLAYERS + p * L.PSIZE + L.P_FL] & L.PF_DEAD) continue;
      const c = [o.pos[0] - f.drawn[0], o.pos[1] - f.drawn[1], o.pos[2] - f.drawn[2]];
      const t = c[0] * f.nose[0] + c[1] * f.nose[1] + c[2] * f.nose[2];
      if (t < 0 || t > F.LASER_RANGE) continue;
      if (Math.hypot(c[0] - f.nose[0] * t, c[1] - f.nose[1] * t, c[2] - f.nose[2] * t) < Number(F.FL_HIT) * 1.2) return true;
    }
    return false;
  }

  // The ship a charge shot let go now would lock on to (the sim's $f_launch), or -1.
  function lockOn(f) {
    let who = -1, best = Number(F.FL_LOCK);
    const e = f.drawn.map((x, k) => x + f.nose[k] * NOSE);
    for (let p = 0; p < L.NPLAYER; p++) {
      if (p === f.slot || view.ally(f.slot, p)) continue;
      const o = view.player(p);
      if (!o.live || u8[L.PLAYERS + p * L.PSIZE + L.P_FL] & L.PF_DEAD) continue;
      const d = [o.pos[0] - e[0], o.pos[1] - e[1], o.pos[2] - e[2]];
      const dist = Math.hypot(...d) || 1e-3;
      const cos = (d[0] * f.nose[0] + d[1] * f.nose[1] + d[2] * f.nose[2]) / dist;
      if (cos > best && dist < Number(F.FL_LOCK_RANGE)) { best = cos; who = p; }
    }
    return who;
  }

  let myPos = [0, 0, 0];
  let gateAt = null; // Ring Race: the next gate's waypoint on screen [x, y (320 x 200 units), metres away], for its text
  let camState = null; // the spectator's and the dead's eased camera: { pos, f }
  let last = null;
  const mine = new Uint8Array(L.PSIZE);
  function frame(now, target) {
    frames++;
    if (now - fpsAt > 1000) { fps = frames; frames = 0; fpsAt = now; }
    const ms = Math.min(100, now - lastFrame);
    lastFrame = now;
    const nowE = epoch();
    const st = get(L.CL_STATE);
    const slot = get(L.CL_SLOT);
    const h = view.hole();
    if (st >= 1 && view.dv.getUint32(L.HDR_SEED, true) !== seed && host.welcome) {
      seed = view.dv.getUint32(L.HDR_SEED, true);
      renderer.setTerrain(u8);
      renderer.setMap(view.map());
    }
    const ceiling = view.dv.getFloat32(L.MAP_CEILING, true) || 200;
    const room = get(L.CL_ROOM);
    const dt = Math.max(0, Math.min(3, readClock(i32, f64, L.CL_PLAY, nowE) - room - h.tick)) * 0.008;
    me = slot >= 0 ? view.ship(slot) : null;
    pme = null;
    let tgt = null;
    if (WATCH && st >= 1) {
      if (watched < 0 || !view.player(watched).live) watched = nextLive(watched, 1);
      tgt = watched >= 0 ? view.ship(watched) : null;
    }
    // the pilot flies the slot as the keys and mouse would
    if (external) { yaw = get(L.CL_YAW); pitch = get(L.CL_PITCH); }
    if (bot && me?.live && st === 2) {
      bot.slot = slot;
      const w = unpackArena(bot.think(view, h.tick, Math.round(readClock(i32, f64, L.CL_PRED, nowE) - readClock(i32, f64, L.CL_PLAY, nowE))));
      yaw = w.yaw; pitch = w.pitch;
      aim();
      set(L.CL_MOVE, w.move | (w.jump << 4));
      if (w.shot !== (bot.lastShot ?? w.shot)) press(L.CL_PRESSES);
      if (w.melee !== (bot.lastMelee ?? w.melee)) press(L.CL_MELEE);
      if (w.gren !== (bot.lastGren ?? w.gren)) press(L.CL_GREN);
      Object.assign(bot, { lastShot: w.shot, lastMelee: w.melee, lastGren: w.gren });
    }
    let dtPred = dt;
    if (me?.live && st === 2) {
      const n = predict(host, slot, live);
      if (n >= 0) {
        pme = pview.ship(slot);
        dtPred = Math.max(-2.5, Math.min(1, readClock(i32, f64, L.CL_PRED, nowE) - room - pview.tick)) * 0.008;
        corr.update(n, ms);
        for (const k of [L.FX_SHOT, L.FX_TRACER, L.FX_BLAST]) if (played[k] === undefined) played[k] = me.shots;
      }
    }
    // lasers keep asking while the trigger is held (not while charging)
    if (!BOT && !WATCH) set(L.CL_AUTO, trigger && locked && !charging ? 1 : 0);
    // a new match: aim along the nose you came in with
    if (me?.live && h.hole !== matchSeen) { matchSeen = h.hole; if (!BOT) { yaw = (me.heading[0] / (2 * Math.PI) * TURN) & (TURN - 1); pitch = 512; aim(); } }
    if (dealt && me?.live && !me.dead) {
      dealt = false;
      const md = view.mode();
      const t = me.jugg ? 'JUGGERNAUT' : md.teamed ? `${SIDE[me.team]} SQUADRON` : modeName(md.mode).name;
      if (banner.until < now + 500) banner = { text: t, until: now + 2000, color: me.team >= 0 ? SIDE_C[me.team] : C.CYAN };
    }
    const f = tgt || pme || me;
    // where your ship is drawn: the prediction's, eased by its corrections
    if (pme) myPos = [0, 1, 2].map((k) => pme.pos[k] + pme.vel[k] * dtPred + corr.off[k]);
    else if (me?.live) myPos = me.pos.map((x, k) => x + me.vel[k] * dt);
    // the camera: behind your ship looking where you aim; a spectator's
    // behind the watched ship's nose, eased; over the wreck while you're dead
    let cam, cf;
    const aimYaw = yaw / TURN * 2 * Math.PI, aimPitch = (pitch - 512) / 1024 * Math.PI;
    if (me?.live && !WATCH && !me.dead) {
      cf = [Math.cos(aimPitch) * Math.cos(aimYaw), Math.sin(aimPitch), Math.cos(aimPitch) * Math.sin(aimYaw)];
      cam = [myPos[0] - cf[0] * 11, myPos[1] - cf[1] * 11 + 2.8, myPos[2] - cf[2] * 11];
      camState = { pos: cam, f: cf };
    } else if (f?.live && !f.dead) {
      const at = f === me ? myPos : f.pos.map((x, k) => x + f.vel[k] * dt);
      const want = [at[0] - f.nose[0] * 12, at[1] - f.nose[1] * 12 + 3, at[2] - f.nose[2] * 12];
      const k = 1 - Math.exp(-ms / 180);
      camState = camState ? { pos: camState.pos.map((x, i) => x + (want[i] - x) * k), f: f.nose.map((x, i) => camState.f[i] + (x - camState.f[i]) * k) } : { pos: want, f: f.nose };
      cam = camState.pos; cf = camState.f;
    } else if (f?.dead) {
      // slowly round where it went down
      const a = now / 4000;
      const c = f.pos;
      cam = [c[0] - Math.cos(a) * 30, c[1] + 12, c[2] - Math.sin(a) * 30];
      cf = [c[0] - cam[0], c[1] - cam[1], c[2] - cam[2]];
    } else {
      const [x0, x1, z0, z1] = view.map().bounds;
      cam = [x0 + 20, view.height(x0 + 20, (z0 + z1) / 2) + 60, (z0 + z1) / 2];
      cf = [(x1 - x0) / 2, -40, 0];
    }
    if (FIXED) {
      cam = FIXED.slice(0, 3);
      const a = FIXED[3] / 180 * Math.PI, e = FIXED[4] / 180 * Math.PI;
      cf = [Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)];
    }
    cam[1] = Math.max(cam[1], view.height(cam[0], cam[2]) + 0.6);
    const fl = Math.hypot(...cf) || 1;
    const cv = { cam, basis: basis(Math.atan2(cf[2], cf[0]), Math.asin(Math.max(-1, Math.min(1, cf[1] / fl)))), zoom: 1, dt };

    // FX: mine from the prediction first, then the confirmed ring
    const mineKinds = new Set([L.FX_SHOT, L.FX_TRACER, L.FX_BLAST]);
    const isMine = (x) => x.owner === slot && slot >= 0 && mineKinds.has(x.kind) && (x.kind !== L.FX_BLAST || x.shot !== 0);
    if (pme) {
      const best = {};
      for (let k = 0; k < pview.fxCount(); k++) {
        const x = pview.fx(k);
        if (isMine(x) && newer(x.shot, played[x.kind])) { show(x, slot, cam, now, true, dt); best[x.kind] = newer(x.shot, best[x.kind] ?? played[x.kind]) ? x.shot : best[x.kind]; }
      }
      Object.assign(played, best);
    }
    const nfx = view.fxCount();
    if (nfx - fxSeen > L.FX_MAX) fxSeen = nfx - L.FX_MAX;
    for (; fxSeen < nfx; fxSeen++) {
      const x = view.fx(fxSeen);
      if (h.tick - x.tick > 60) continue;
      if (isMine(x)) { if (played[x.kind] !== undefined && !newer(x.shot, played[x.kind])) continue; played[x.kind] = x.shot; show(x, slot, cam, now, true, dt); continue; }
      show(x, slot, cam, now, false, dt);
    }
    marker *= Math.exp(-ms / 120);
    hurt *= Math.exp(-ms / 400);

    // what glows: blasts, sparks, the charge on the nose
    const glow = [];
    for (let k = glows.length - 1; k >= 0; k--) {
      const g = glows[k];
      const a = (now - g.born) / g.life;
      if (a >= 1) { glows.splice(k, 1); continue; }
      if (a < 0) continue;
      const grow = g.grow ? 0.35 + 0.65 * Math.min(1, a / 0.4) : 1;
      glow.push({ pos: g.pos, size: g.size * grow, color: [g.color[0], g.color[1], g.color[2], (g.color[3] ?? 1) * (1 - a)], kind: g.kind, minpx: 1 });
    }
    // Ring Race's gates: the next one yours bright and pulsing, the one after it fainter, the rest a glimmer
    if (view.dv.getUint32(L.AH_MODE, true) === F.M_RACE) {
      const gates = view.race();
      const who = tgt ? watched : slot;
      const next = who >= 0 ? view.racer(who, gates.length).next : -1;
      gates.forEach((g, k) => {
        const lead = k === next, after = gates.length && k === (next + 1) % gates.length;
        glow.push({ pos: g.pos, size: g.r * (lead ? 1 + 0.06 * Math.sin(now / 120) : 1), color: lead ? [1, 0.85, 0.25, 0.9] : after ? [1, 0.85, 0.25, 0.4] : [0.6, 0.8, 1, 0.18], kind: 6, minpx: 3 });
      });
    }
    // every ship's charge building on its nose
    for (let p = 0; p < L.NPLAYER; p++) {
      const o = p === slot && pme ? pme : null;
      const b = L.PLAYERS + p * L.PSIZE;
      if (!o && (u8[b + L.P_FL] & (L.PF_LIVE | L.PF_DEAD)) !== L.PF_LIVE) continue;
      const ch = o ? o.charge : u8[b + F.F_CHARGE];
      if (!ch) continue;
      const s = o || view.ship(p);
      const at = (p === slot ? myPos : s.pos).map((x, k) => x + s.nose[k] * (NOSE + 0.5));
      const full = ch >= F.CHARGE_TICKS;
      glow.push({ pos: at, size: 0.3 + 0.9 * ch / F.CHARGE_TICKS, color: full ? [0.7, 1, 0.5, Math.floor(now / 80) % 2 ? 1 : 0.6] : [0.5, 0.9, 0.4, 0.8], kind: 3, minpx: 1 });
    }
    const beams = [];
    for (let k = bolts.length - 1; k >= 0; k--) {
      const b = bolts[k];
      const a = (now - b.born) / b.life;
      if (a >= 1) { bolts.splice(k, 1); continue; }
      // a bolt 7 m long flying from a to b
      const len = Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1], b.b[2] - b.a[2]) || 1;
      const t1 = Math.min(1, a + 7 / len * 0.5), t0 = Math.max(0, a - 7 / len * 0.5);
      beams.push({ a: b.a.map((x, i) => x + (b.b[i] - x) * t0), b: b.a.map((x, i) => x + (b.b[i] - x) * t1), width: 0.12, color: [...b.color, 0.95] });
    }
    // engine trails: the nearest ships' last half second
    const md = view.mode();
    const trailNear = [];
    for (let p = 0; p < L.NPLAYER; p++) {
      const b = L.PLAYERS + p * L.PSIZE;
      const fl8 = u8[b + L.P_FL];
      if ((fl8 & (L.PF_LIVE | L.PF_DEAD)) !== L.PF_LIVE) { trails.delete(p); continue; }
      const at = p === slot && me?.live ? myPos : view.player(p).pos;
      const dd = Math.hypot(at[0] - cam[0], at[1] - cam[1], at[2] - cam[2]);
      if (dd < 260) trailNear.push([dd, p, at]);
    }
    trailNear.sort((a, b) => a[0] - b[0]);
    for (const [, p, at] of trailNear.slice(0, 48)) {
      let tr = trails.get(p);
      if (!tr) trails.set(p, (tr = []));
      const lastPt = tr[tr.length - 1];
      if (lastPt && Math.hypot(at[0] - lastPt[0], at[1] - lastPt[1], at[2] - lastPt[2]) > 40) tr.length = 0;
      if (!lastPt || now - lastPt[3] > 35) tr.push([at[0], at[1], at[2], now]);
      while (tr.length && now - tr[0][3] > 500) tr.shift();
      const s = p === slot && pme ? pme : view.ship(p);
      const boosting = (s.input >>> L.AW_MOVE) & 1 && !s.spent && s.boost > 0;
      const tail = at.map((x, k) => x - s.nose[k] * 2.1);
      let prev = tail;
      for (let k = tr.length - 1; k >= 0; k--) {
        const q = [tr[k][0] - s.nose[0] * 2.1, tr[k][1] - s.nose[1] * 2.1, tr[k][2] - s.nose[2] * 2.1];
        const a = 1 - (now - tr[k][3]) / 500;
        beams.push({ a: prev, b: q, width: boosting ? 0.35 : 0.18, color: boosting ? [1, 0.85, 0.6, 0.5 * a] : [0.5, 0.8, 1, 0.3 * a] });
        prev = q;
      }
    }

    let rects = [], blips = [], radar = null;
    const playing = st === 2 && f?.live;
    gateAt = null;
    if (playing && !f.dead && !FIXED) {
      const hr = hudRects({ ...f, drawn: f === pme || f === me ? myPos : f.pos }, now, cv, cam);
      rects = hr.rects; blips = hr.blips; radar = hr.radar;
    }
    hudText(text, { h, f, slot: tgt ? watched : slot, st, now, fps, md, ceiling });
    rects = rects.concat(blips).slice(0, MAX_RECT);
    if (FIXED) { rects = []; radar = null; text.fill(0); }
    netGraph.sample(now, hashes, keys);
    const graph = showGraph && st > 0 ? netGraph.build((x, y, s, c) => put(text, COLS, x, y, s, c), C) : null;
    // my ship as the prediction has it, corrected
    let meRec = null;
    if (pme) {
      mine.set(u8.subarray(L.PLAYERS + L.PRED_D + slot * L.PSIZE, L.PLAYERS + L.PRED_D + (slot + 1) * L.PSIZE));
      const dv = new DataView(mine.buffer);
      for (let k = 0; k < 3; k++) dv.setFloat32(L.P_PX + 4 * k, pme.pos[k] + corr.off[k], true);
      meRec = mine;
    }
    last = {
      cam, basis: cv.basis, zoom: 1, time: now / 1000, dt, dtPred, proj: pme ? L.PROJ + L.PRED_D : L.PROJ, slot: meRec ? slot : -1, me: meRec, ceiling,
      glow, beams, rects, radar, text, graph, marker, hurt, crosshair: playing && !WATCH && !f.dead && !FIXED ? 1 : 0,
      sides: md.teamed ? 2 : ((1 << md.mode) & L.TEAM_MODES) !== 0 ? 1 : 0, tints: tintsOf(host),
    };
    renderer.frame(u8, last, target);
  }

  function hudText(t, { h, f, slot, st, now, fps, md, ceiling }) {
    t.fill(0);
    const rows = renderer.rows;
    const right = (y, s, c) => put(t, COLS, COLS - 1 - String(s).length, y, s, c);
    const centre = (y, s, c) => put(t, COLS, Math.floor((COLS - String(s).length) / 2), y, s, c);
    if (st !== 2 || (!f?.live && !WATCH)) centre(Math.floor(rows / 2) - 3, host.error ? 'ERROR: ' + host.error.slice(0, 64) : ['CONNECTING', 'CATCHING UP', '', 'DISCONNECTED'][st] || 'JOINING', host.error ? C.RED : C.YELLOW);
    const m = md.mode;
    const mn = modeName(m);
    const list = [];
    for (let p = 0; p < L.NPLAYER; p++) { const o = view.ship(p); if (o.live) list.push(o); }
    if (m && h.state === L.H_OVER) list.sort((a, b) => (a.place || 999) - (b.place || 999) || a.slot - b.slot);
    else list.sort((a, b) => standing(m, b, md.teamWin) - standing(m, a, md.teamWin) || a.slot - b.slot);
    const clock = (n) => `${Math.floor(n / 125 / 60)}:${String(Math.floor(n / 125) % 60).padStart(2, '0')}`;
    const left = Math.max(0, h.until - h.tick);
    const team = md.teamed && f?.live ? f.team : -1;
    if (h.state === L.H_COUNT) {
      centre(4, `${mn.name}  STARTS IN ${Math.ceil(left / 125)}`, C.YELLOW); centre(5, mn.rules, C.WHITE);
      if (team >= 0) centre(7, WATCH ? `WATCHING P${slot + 1} ON ${SIDE[team]}  < >` : `YOU FLY FOR ${SIDE[team]}`, SIDE_C[team]);
      if (!WATCH && !BOT) centre(9, 'MOUSE AIMS  CLICK LASERS  HOLD RIGHT TO CHARGE  W BOOST  S BRAKE  Q E ROLL  G BOMB', C.GREY);
    }
    if (h.state === L.H_PLAY) centre(0, clock(left), left < 30 * 125 ? C.RED : C.WHITE);
    const who = WATCH ? host.label(slot) : 'YOU';
    const board = h.state === L.H_OVER || (held.has('Tab') && h.live);
    if (md.teamed && h.state === L.H_PLAY && !board) {
      const [rs, bs] = md.score;
      centre(4, `${SIDE[0]} ${rs}  ${md.target || ''}  ${bs} ${SIDE[1]}`, team >= 0 ? SIDE_C[team] : C.WHITE);
    }
    if (f?.live) {
      if (md.teamed) {
        put(t, COLS, 1, 0, `${who}: ${SIDE[team] ?? ''}`, SIDE_C[team] ?? C.YELLOW);
        put(t, COLS, 1, 1, `${f.kills} KILL${f.kills === 1 ? '' : 'S'}  ${f.deaths} DEATH${f.deaths === 1 ? '' : 'S'}`, C.GREY);
        AMC[m]?.hud(view, { put: (x, y, s, c) => put(t, COLS, x, y, s, c), centre, right, rect: () => {}, rows, C, slot, me: f, team, now, t: 0 });
      } else if (m === F.M_RACE) {
        // your gate and lap, and who leads
        const n = view.race().length;
        const rc = view.racer(f.slot, n);
        put(t, COLS, 1, 0, rc.done ? `${who}: FINISHED` : `${who}: GATE ${rc.next + 1} OF ${n}  LAP ${rc.lap + 1} OF ${F.LAPS}`, C.YELLOW);
        const lead = list[0];
        if (lead && lead.slot !== f.slot) { const lr = view.racer(lead.slot, n); put(t, COLS, 1, 1, `${host.label(lead.slot)} ${lr.done ? 'FINISHED' : `LAP ${lr.lap + 1} GATE ${lr.next + 1}`}`, C.GREY); }
        if (gateAt && !f.dead) {
          const col = Math.max(0, Math.min(COLS - 6, Math.round(gateAt[0] * S / 4) - 2)), row = Math.round(gateAt[1] * S / 6);
          put(t, COLS, col, Math.min(rows - 1, row + 2), `${gateAt[2]}M`, C.YELLOW);
        }
      } else if (m === L.M_JUGGERNAUT) {
        put(t, COLS, 1, 0, `${who} ${f.points} POINT${f.points === 1 ? '' : 'S'}${f.jugg ? '  JUGGERNAUT' : ''}`, f.jugg ? C.ORANGE : C.YELLOW);
        const j = md.leader >= 0 ? view.ship(md.leader) : null;
        if (j && j.slot !== f.slot) put(t, COLS, 1, 1, `JUGGERNAUT P${j.slot + 1}  ${j.points} OF ${L.JUGG_POINTS}`, C.ORANGE);
      } else {
        const leader = list[0];
        put(t, COLS, 1, 0, `${who} ${f.kills}`, C.YELLOW);
        if (leader && leader.slot !== f.slot) put(t, COLS, 1, 1, `${host.label(leader.slot)} ${leader.kills}`, C.GREY);
        else if (list[1]) put(t, COLS, 1, 1, `${host.label(list[1].slot)} ${list[1].kills}`, C.GREY);
      }
      if (f.dead) centre(Math.floor(rows / 2) + 2, `BACK IN ${Math.ceil(f.respawn / 125)}`, C.YELLOW);
      else {
        // bottom left: what the bars are; warnings over the middle
        put(t, COLS, 22, rows - 5, f.spent ? 'BOOST EMPTY' : 'BOOST', f.spent ? C.RED : C.GREY);
        if (f.charge) put(t, COLS, 22, rows - 4, f.charge >= F.CHARGE_TICKS ? 'CHARGED' : 'CHARGE', f.charge >= F.CHARGE_TICKS ? C.GREEN : C.GREY);
        if (f.roll) centre(Math.floor(rows / 2) + 8, 'BARREL ROLL', C.CYAN);
        const pos = f === pme || f === me ? myPos : f.pos;
        const alt = pos[1] - view.height(pos[0], pos[2]);
        if (h.state === L.H_PLAY && ((alt < 12 && f.vel[1] < -2) || alt < 5) && Math.floor(now / 250) % 2) centre(Math.floor(rows / 2) + 5, 'PULL UP', C.RED);
        if (pos[1] > ceiling - 6) centre(Math.floor(rows / 2) + 5, 'CEILING', C.ORANGE);
        const [x0, x1, z0, z1] = view.map().bounds;
        if (Math.min(pos[0] - x0, x1 - pos[0], pos[2] - z0, z1 - pos[2]) < 25) centre(Math.floor(rows / 2) + 6, 'TURN BACK', C.ORANGE);
        right(rows - 1, `${Math.round(Math.hypot(...f.vel) * 3.6)} KM/H  ${Math.max(0, Math.round(alt))} M`, C.GREY);
      }
      feed.forEach((e, k) => { if (now - e.born < 6000) put(t, COLS, 1, rows - 12 - (feed.length - 1 - k), e.text, e.color); });
    }
    if (banner.until > now) centre(Math.floor(rows / 2) - 6, banner.text, banner.color);
    if (medal.until > now) centre(Math.floor(rows / 2) - 8, medal.text, C.ORANGE);
    if (st === 2 && !BOT && !WATCH && !locked) centre(Math.floor(rows / 2) + 7, 'CLICK TO FLY', C.WHITE);
    if (WATCH && st === 2 && !(h.state === L.H_COUNT && team >= 0)) put(t, COLS, 1, md.teamed ? 5 : 3, f?.live ? `WATCHING P${slot + 1}  < >` : 'NOBODY TO WATCH', C.CYAN);
    if (showGraph) put(t, COLS, 1, rows - 2, `${fps} FPS  LEAD ${f32[L.CL_LEAD >> 2].toFixed(1)}  DELAY ${f32[L.CL_DELAY >> 2].toFixed(1)}  LAG ${f?.lag ?? 0}`, C.GREY);
    if (!board) return;
    const y0 = 6;
    const over = h.state === L.H_OVER;
    const n = m === F.M_RACE ? view.race().length : 0;
    const cols = m === L.M_JUGGERNAUT ? ['POINTS', 'KILLS', 'DEATHS'] : m === F.M_RACE ? ['GATES', 'LAP', 'KILLS'] : ['KILLS', 'DEATHS'];
    const cells = (o) => (m === L.M_JUGGERNAUT ? [o.points, o.kills, o.deaths]
      : m === F.M_RACE ? [o.points, view.racer(o.slot, n).done ? 'DONE' : `${view.racer(o.slot, n).lap + 1}/${F.LAPS}`, o.kills] : [o.kills, o.deaths]);
    const row = (rank, nm, xs) => `${String(rank).padStart(4)}  ${String(nm).padEnd(8)}${xs.map((x, k) => '  ' + String(x).padStart(Math.max(6, cols[k].length))).join('')}`;
    const nameOf = (o) => (o.slot === slot && !WATCH ? 'YOU ' : 'P') + String(o.slot + 1);
    if (md.teamed) {
      const [rs, bs] = md.score;
      centre(y0, !over ? `${mn.name}  ${SIDE[0]} ${rs}  ${SIDE[1]} ${bs}` : md.teamWin === 3 || (!md.teamWin && rs === bs) ? `GAME OVER  A DRAW ${rs} ALL`
        : `GAME OVER  ${SIDE[(md.teamWin || (rs > bs ? 1 : 2)) - 1]} WINS ${Math.max(rs, bs)} TO ${Math.min(rs, bs)}`, C.YELLOW);
      centre(y0 + 2, row('RANK', 'PILOT', cols), C.GREY);
      let y = y0 + 3;
      const fit = Math.floor((rows - y0 - 8) / 2);
      for (const k of [0, 1]) {
        const all = list.filter((o) => o.team === k);
        centre(y++, row(SIDE[k], md.score[k], cols.map(() => '')), SIDE_C[k]);
        for (const o of all.slice(0, fit)) {
          const rank = over && o.place ? o.place : list.findIndex((x) => standing(m, x, md.teamWin) === standing(m, o, md.teamWin)) + 1;
          centre(y++, row(rank, nameOf(o), cells(o)), o.slot === slot ? C.YELLOW : C.WHITE);
        }
        if (all.length > fit) centre(y++, `+${all.length - fit} MORE`, C.GREY);
      }
      return;
    }
    const top = list[0];
    centre(y0, over ? `GAME OVER  ${top ? (top.slot === slot ? 'YOU WIN' : `${host.label(top.slot)} WINS`) : ''}` : `${mn.name}  ${list.length} PILOTS`, C.YELLOW);
    centre(y0 + 2, row('RANK', 'PILOT', cols), C.GREY);
    const fit = rows - y0 - 6;
    const at = list.findIndex((o) => o.slot === slot);
    const shown = at >= fit ? [...list.slice(0, fit - 1), list[at]] : list.slice(0, fit);
    shown.forEach((o, k) => {
      const rank = m && over && o.place ? o.place : list.findIndex((x) => standing(m, x) === standing(m, o)) + 1;
      centre(y0 + 3 + k, row(rank, nameOf(o), cells(o)), o.slot === slot ? C.YELLOW : C.WHITE);
    });
  }

  return {
    frame,
    unmount() { off(); held.clear(); set(L.CL_MOVE, 0); set(L.CL_AUTO, 0); if (document.pointerLockElement === lockTarget && lockTarget === canvas) document.exitPointerLock(); },
    capture: (scale = 2) => (last ? capturePng(renderer, u8, last, scale) : null),
    state: () => ({ slot: get(L.CL_SLOT), clState: get(L.CL_STATE), me, aim: [get(L.CL_YAW), get(L.CL_PITCH)], keys: get(L.CL_MOVE), rolls: get(L.CL_MELEE), error: host.error, welcome: host.welcome, match: view.hole(), mode: view.mode(), feed: feed.map((x) => x.text), team: me?.team ?? -1 }),
    get locked() { return locked; },
  };
}
