// TRAP RUN, as drawn and as the AI ball sees it. The course is read straight
// from the sim (src/mg/trap.mjs's layout: the traps in PG_S, the lines in
// the header) and its fixed parts built once into a list of solids: the
// start pad and the pen, the floor between traps, the rails, the wall and
// the trappers' walkway past it, the pillars, the finish arch. Each frame the
// traps go in as their clocks stand on the prediction's clock (an armed
// trap's parts flash for the last 0.88 s before it fires), and the pads on
// the walkway glow green ready, orange armed, red live, grey cooling. The
// traps' clocks and shapes are worked again here as the sim works them: the
// brains read them to time runs and arm traps, nothing is fed back.
import * as L from '../../src/layout.mjs';
import * as MC from '../../src/mg/trap.mjs'; // TR_*: the minigame's own constants
import { PLAT_Y } from '../../src/party-view.mjs';
import { LOOK, SPRITE, DECAL, COLS } from '../party-render.mjs';
import { C } from '../font.mjs';

const TICK = 0.008;
const SLAB = 0.6; // the course's slab, half its depth
const SEA = -12; // where the pillars stand
const BAND = 8; // m of floor a tone
const WALK_Y = PLAT_Y + MC.TR_WH;
const f32 = Math.fround;
export const KIND_NAME = ['TRAPDOOR', 'PISTONS', 'SWEEPER', 'CRUSHER', 'AIR JETS', 'TIPPER'];
const KIND_VERB = ['DROPPED', 'SHOVED OFF', 'SWEPT OFF', 'CRUSHED', 'BLOWN OFF', 'TIPPED OFF'];
const KIND_COL = [[1, 0.55, 0.15], [0.35, 0.6, 1], [0.75, 0.4, 0.95], [0.95, 0.22, 0.18], [0.3, 0.9, 1], [1, 0.85, 0.2]];
export const PHASE = { IDLE: MC.TR_IDLEP, WARN: MC.TR_WARN, LIVE: MC.TR_LIVE, COOL: MC.TR_COOLP };

// ---- the course, read once a layout; the traps' arming once a tick

const ta = (k) => L.PG_S + MC.TR_TRAPS + k * MC.TR_TRSZ;
let memo = null;
// This round's course as the confirmed world has it, or null: the lines, the walkway, the traps (each with
// its arming as of this tick: arm 1 + the tick into play, 0 never; by; the panels that drop).
export function course(view) {
  const dv = view.dv;
  const u = (a) => dv.getUint32(a, true), f = (a) => dv.getFloat32(a, true);
  if (!(memo && view._trMemo === memo && view._trTick === view.tick)) {
    const nt = u(L.PG_H + MC.TR_NT), nc = u(L.PG_H + MC.TR_NCOL);
    if (u(L.PG_GAME) !== L.MG_TRAP || !nt || nt > MC.TR_NTMAX || nc < MC.TR_NCMIN || nc > MC.TR_NCMAX) return null;
    const key = `${nt} ${nc} ${f(L.PG_H + MC.TR_W)} ${f(L.PG_H + MC.TR_X0)} ${f(L.PG_H + MC.TR_FIN)} ${f(L.PG_H + MC.TR_WWID)} ${f(ta(0))} ${u(ta(0) + MC.TR_T_KIND)} ${u(L.HDR_SEED)} ${u(L.HDR_HOLE)}`;
    if (memo?.key !== key) {
      const cx = f(L.PG_CX), w = f(L.PG_H + MC.TR_W), zw = f(L.PG_H + MC.TR_ZW);
      const traps = [];
      for (let k = 0; k < nt; k++) {
        const a = ta(k), kind = u(a + MC.TR_T_KIND);
        traps.push({ k, kind, x0: f(a + MC.TR_T_X0), x1: f(a + MC.TR_T_X1), pad: f(a + MC.TR_T_PAD), live: MC.TR_LIVES[kind], arm: 0, by: 0, m0: 0, m1: 0 });
      }
      for (const T of traps) T.xc = (T.x0 + T.x1) / 2;
      memo = { key, nt, cx, w, zl: cx - w, zr: cx + w, zw, ww: f(L.PG_H + MC.TR_WWID), zpad: zw + MC.TR_PADIN, nc, cw: f(L.PG_H + MC.TR_CW),
        xa: f(L.PG_H + MC.TR_XA), x0: f(L.PG_H + MC.TR_X0), fin: f(L.PG_H + MC.TR_FIN), xb: f(L.PG_H + MC.TR_XB), traps, geom: null, flashes: [] };
    }
    for (const T of memo.traps) {
      const a = ta(T.k);
      T.arm = u(a + MC.TR_T_ARM); T.by = u(a + MC.TR_T_BY); T.m0 = u(a + MC.TR_T_M0); T.m1 = u(a + MC.TR_T_M1);
    }
    view._trMemo = memo;
    view._trTick = view.tick;
  }
  return memo;
}

// Is a ball with this score a trapper? (As $tr_walker: set as play starts for those on the walkway.)
export const trapper = (score) => score >= MC.TR_TRAP0 && score < MC.TR_WIN;
// The trap whose section holds x, or null.
export const trapAt = (c, x) => c.traps.find((T) => x >= T.x0 && x < T.x1) ?? null;

// ---- the clocks (t: ticks into play), as the sim works them

// $tr_phase: trap T's phase on tick t and the ticks into it.
export function phase(T, t) {
  if (!T.arm) return { ph: PHASE.IDLE, e: 0 };
  let e = Math.floor(t) - (T.arm - 1);
  if (e < 0) return { ph: PHASE.IDLE, e: 0 };
  if (e < MC.TR_DELAY) return { ph: PHASE.WARN, e };
  e -= MC.TR_DELAY;
  if (e < T.live) return { ph: PHASE.LIVE, e };
  e -= T.live;
  if (e < MC.TR_COOL) return { ph: PHASE.COOL, e };
  return { ph: PHASE.IDLE, e: e - MC.TR_COOL };
}
// Ticks into its live time on tick t, or -1.
export const liveAt = (T, t) => { const p = phase(T, t); return p.ph === PHASE.LIVE ? p.e : -1; };
// When it fires and when it's done, in ticks into play (Infinity if it isn't armed).
export const fireAt = (T) => (T.arm ? T.arm - 1 + MC.TR_DELAY : Infinity);
export const doneAt = (T) => fireAt(T) + T.live;
// $tr_cell: the panel under (x, z) in T's section, or -1.
export function cellAt(c, T, x, z) {
  const row = Math.floor(f32(f32(x - T.x0) / MC.TR_CELL));
  if (row < 0 || row >= MC.TR_DROWS) return -1;
  const col = Math.max(0, Math.min(c.nc - 1, Math.floor(f32(f32(z - c.zl) / c.cw))));
  return row * c.nc + col;
}
export const drops = (T, cell) => ((cell < 32 ? T.m0 >>> cell : T.m1 >>> (cell - 32)) & 1) === 1;
// $tr_tilt: the tipping floor's angle in radians e ticks into its live time.
export function tiltAt(e) {
  if (e < 0) return 0;
  const m = Math.min(e + 1, MC.TR_TRAMP, MC.TR_LIVES[MC.TR_K_TIP] - e);
  return Math.trunc((m * MC.TR_TILT) / MC.TR_TRAMP) / 16384 * 2 * Math.PI;
}
// $tr_bar: the sweeper's angle in radians on tick t.
export function barAt(T, t) {
  const e = liveAt(T, t);
  return e < 0 ? 0 : Math.trunc(((e + 1) * 8192) / T.live) / 16384 * 2 * Math.PI;
}
// $tr_crush_b: the crusher's bottom over the floor e ticks into its live time.
export function crushB(e) {
  if (e < 0) return MC.TR_CH;
  if (e < MC.TR_CFALL) { const s = (e + 1) / MC.TR_CFALL; return MC.TR_CH * (1 - s * s); }
  if (e < MC.TR_CUP) return 0;
  return (e - MC.TR_CUP + 1) * (MC.TR_CH / (MC.TR_LIVES[MC.TR_K_CRUSH] - MC.TR_CUP));
}
// $tr_ext: how far out the pistons are, 0 to 1.
export function extAt(e) {
  if (e < 0) return 0;
  if (e < MC.TR_PEXT) return (e + 1) / MC.TR_PEXT;
  if (e < MC.TR_PHOLD) return 1;
  return (MC.TR_LIVES[MC.TR_K_PIST] - e) / (MC.TR_LIVES[MC.TR_K_PIST] - MC.TR_PHOLD);
}
// The pistons' faces at full reach.
export const faceMin = (c) => c.zr - 2 * c.w * MC.TR_PREACH;
// The jets' vents in T's section: [x, z].
export function vents(c, T) {
  const out = [];
  for (let row = 0; row < 2; row++) {
    const x = row ? T.x1 - MC.TR_VROW : T.x0 + MC.TR_VROW;
    for (let col = row & 1; col < c.nc; col += 2) out.push([x, c.zl + (col + 0.5) * c.cw]);
  }
  return out;
}

// Ticks into play to draw at (fractional): the prediction's clock, frozen through the result.
function playTime(view, ctx) {
  const g = view.party();
  if (g.state !== L.H_PLAY && g.state !== L.H_OVER) return 0;
  let t = ctx?.ptick !== undefined ? ctx.ptick - g.start : g.t + (ctx?.dt || 0) / TICK;
  if (g.state === L.H_OVER) t = Math.min(t, (g.until - L.P_OVER - g.start) | 0);
  return Math.max(0, t);
}

// ---- the race: who is where

// Every ball in, ranked as $p_end places them, by score: the runners home, then the trappers, then the
// runners out on the course; ties shared.
export function standings(view) {
  if (view._tr?.tick === view.tick) return view._tr.list;
  const c = course(view);
  const list = [];
  for (let p = 0; p < L.NPLAYER; p++) {
    const a = L.PLAYERS + p * L.PSIZE;
    if (!(view.u8[a + L.P_FL] & L.PF_LIVE)) continue;
    const score = view.dv.getUint16(a + L.PG_SCORE, true);
    const x = view.dv.getFloat32(a + L.P_PX, true), z = view.dv.getFloat32(a + L.P_PZ, true);
    list.push({ slot: p, score, trapper: trapper(score), home: score >= MC.TR_WIN, out: (view.u8[a + L.P_FL] & L.PF_DEAD) !== 0, dist: c ? Math.max(0, x - c.x0) : 0,
      taken: view.u8[L.PG_S + MC.TR_KILLS + p] });
  }
  list.sort((a, b) => (b.score - a.score) || a.slot - b.slot);
  list.forEach((e, i) => { e.rank = i > 0 && list[i - 1].score === e.score ? list[i - 1].rank : i + 1; });
  view._tr = { tick: view.tick, list };
  return list;
}
export const ordinal = (n) => `${n}${[, 'ST', 'ND', 'RD'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || 'TH'}`;

// The balls still in play (live, not out, not falling), runners not yet home and trappers apart:
// { runners: [{ slot, x, z, vx }], trappers: [{ slot, x }] }.
function crowd(view, c) {
  if (view._trR?.tick === view.tick) return view._trR;
  const runners = [], trappers = [];
  for (let p = 0; p < L.NPLAYER; p++) {
    const a = L.PLAYERS + view.bank + p * L.PSIZE;
    if ((view.u8[a + L.P_FL] & (L.PF_LIVE | L.PF_DEAD | L.PF_FALL)) !== L.PF_LIVE) continue;
    const x = view.dv.getFloat32(a + L.P_PX, true), z = view.dv.getFloat32(a + L.P_PZ, true);
    const score = view.dv.getUint16(a + L.PG_SCORE, true);
    if (trapper(score)) trappers.push({ slot: p, x });
    else if (score < MC.TR_WIN) runners.push({ slot: p, x, z, vx: view.dv.getFloat32(a + L.P_VX, true) });
  }
  view._trR = { tick: view.tick, runners, trappers };
  return view._trR;
}

// ---- the AI ball

// A number in [0, 1) for slot p and k, the same on every machine that asks.
const luck = (p, k) => (((Math.imul(p + 1, 0x9e3779b1) ^ Math.imul(k + 7, 0x85ebca6b)) >>> 0) % 10007) / 10007;
const HOLD = 2.5; // m short of a trap's section a runner waits at
const ZONE = 7; // m short of a section to 0.4 of the way in: where a trapper wants runners as it arms the trap
const STAGE = 2.6; // m short of its pad a trapper waits, off it, for runners to come into the zone
// Seconds a ball rolling on at v0, keys held (bumper's push against its drag), takes to cover s metres.
const VMAX = Number(L.BPHYS.B_ACC_DT) / (1 - Number(L.BPHYS.B_DRAG)), K = -Math.log(Number(L.BPHYS.B_DRAG)) / TICK;
export function eta(s, v0) {
  if (s <= 0) return 0;
  v0 = Math.max(0, Math.min(VMAX, v0));
  const x = (t) => VMAX * t - (VMAX - v0) * (1 - Math.exp(-K * t)) / K;
  let lo = 0, hi = s / Math.max(0.5, v0) + 1;
  for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (x(m) < s) lo = m; else hi = m; }
  return hi;
}
// A runner's reaction: the ticks after a trap is armed (as the world it sees has it) before it takes it in.
// Watching the pads (the more skilled, the more often), its reaction time, longer for a less skilled ball;
// else that from when the trap starts to flash. Its own for each trap and round.
export function react(slot, skill, k, round = 0) {
  const r = Math.round((0.15 + 0.55 * (1 - skill)) * (0.6 + 0.8 * luck(slot, k + 11 + 64 * round)) / TICK);
  return luck(slot, k + 23 + 64 * round) < 0.25 + 0.6 * skill ? r : MC.TR_DELAY - MC.TR_FLASH + r;
}
// Trap T as a runner reacting in `lag` ticks sees it on tick tp: unarmed until then.
const noticed = (T, tp, lag) => (T.arm && tp - (T.arm - 1) < lag ? { ...T, arm: 0 } : T);

// How deadly (x, z) is for a runner on tick tp into play, from trap T (its section holds x): what its clock
// says it does there then, the last moments before it fires counted as live. Which trapdoors drop shows
// only once the trap flashes: till `now` is in its flash, any of them might.
function trapDanger(c, T, x, z, tp, r, now) {
  let e = liveAt(T, tp);
  const f = fireAt(T);
  if (e < 0 && tp >= f - 25 && tp < f) e = 0;
  if (e < 0) return 0;
  switch (T.kind) {
    case MC.TR_K_DROP: {
      const cell = cellAt(c, T, x, z);
      return cell < 0 ? 0 : now < f - MC.TR_FLASH ? 0.6 : drops(T, cell) ? 1 : 0;
    }
    case MC.TR_K_PIST: return z > c.zr - 2 * c.w * MC.TR_PREACH - r - 0.4 ? 1 : 0;
    case MC.TR_K_SWEEP: {
      const a = barAt(T, tp + 6), ca = Math.cos(a), sa = Math.sin(a), dx = x - T.xc, dz = z - c.cx;
      return Math.abs(dz * ca - dx * sa) < r + 1.2 ? 0.9 : 0;
    }
    case MC.TR_K_CRUSH: return e < MC.TR_CUP + 20 && Math.abs(x - T.xc) < MC.TR_CL / 2 + r + 0.3 ? 1 : 0;
    case MC.TR_K_JET: return vents(c, T).some(([vx, vz]) => Math.hypot(x - vx, z - vz) < MC.TR_VR + MC.TR_VIN + 0.6) ? 0.8 : 0;
    case MC.TR_K_TIP: return 0.4 + 0.5 * (c.zr - z) / (2 * c.w);
    default: return 0;
  }
}

// How deadly (x, z) is on tick `tick`. A runner: off the course's open edge, near it, a trap's doing (as far
// as it has taken the trap in); a trapper: the pads but the one it means to arm.
function danger(view, x, z, tick, me) {
  const c = course(view);
  if (!c || !me) return 0;
  const r = me.radius ?? 1;
  if (trapper(me.score)) {
    const goal = me._trGoal;
    for (const T of c.traps) {
      if (goal && goal[2] === T.k) continue;
      if (Math.hypot(x - T.pad, z - c.zpad) < MC.TR_PADR + 0.4) return 1;
    }
    return 0;
  }
  const T = trapAt(c, x);
  let d = 0;
  if (T) {
    if (z < c.zl + 0.2) return 1;
    if (z < c.zl + r + 0.6) d = 0.4;
    const g = view.party();
    const now = (me._trAt ?? view.tick) - g.start;
    d = Math.max(d, trapDanger(c, noticed(T, now, me._trReact?.[T.k] ?? 0), x, z, tick - g.start, r, now));
  }
  return d;
}

// A runner's plan, worked out once a think (kept in bot.mem): the next trap; whether it can be past it before
// it fires; if not, where it waits short of it, or, already in it, the refuge its kind leaves.
function runnerPlan(view, me, bot, c) {
  const mem = bot?.mem || {};
  const when = bot?.at ?? view.tick;
  if (mem.plan && mem.planAt === when) return mem.plan;
  const g = view.party();
  const x = bot?.pos?.[0] ?? me.pos[0], z = bot?.pos?.[1] ?? me.pos[2];
  const vx = bot?.vel?.[0] ?? me.vel[0];
  const r = me.radius ?? 1;
  const tp = when - g.start;
  const lane = Math.max(c.zl + r + 0.8, Math.min(c.zr - r - 0.4, c.cx + (luck(me.slot ?? 0, 1) - 0.4) * 1.2 * c.w));
  const T0 = c.traps.find((Q) => Q.x1 + r > x);
  const T = T0 && noticed(T0, tp, react(me.slot ?? 0, bot?.skill ?? 0.6, T0.k, g.round));
  let out;
  if (!T) out = { mode: 'go', goal: [c.fin + 10, lane] };
  else {
    const fire = fireAt(T), done = doneAt(T);
    const s = T.x0 - r - x;
    const clear = tp + eta(T.x1 + r + 0.6 - x, vx) / TICK;
    const arrive = tp + eta(Math.max(0, s), vx) / TICK;
    const busy = phase(T, tp).ph === PHASE.WARN || phase(T, tp).ph === PHASE.LIVE;
    // the nerve to cut it fine: a less skilled ball gambles on a few tenths more than it has
    const nerve = (1 - (bot?.skill ?? 0.6)) * 130 * (0.3 + luck(me.slot ?? 0, T.k + 3));
    if (!busy || clear + 20 - nerve < fire || arrive > done + 4 - nerve || T.kind === MC.TR_K_SWEEP || T.kind === MC.TR_K_JET) out = { mode: 'go', T, goal: [Math.max(T.x1 + 8, x + 12), lane] };
    else if (s > 0) out = { mode: 'hold', T, s, goal: [T.x0 - r - HOLD, lane] };
    else {
      // in it: out the nearer end if that's in time, else the refuge
      const back = x - (T.x0 - r - 0.6), fwd = T.x1 + r + 0.6 - x;
      let goal;
      if (tp + eta(fwd, vx) / TICK + 10 < fire) goal = [T.x1 + r + 2, z];
      else if (tp + eta(back, -vx) / TICK + 10 < fire && back < fwd) goal = [T.x0 - r - 2, z];
      else switch (T.kind) {
        case MC.TR_K_PIST: goal = [x, Math.max(faceMin(c) - r - 0.8, c.zl + r + 0.6)]; break;
        case MC.TR_K_TIP: goal = [x, c.zr]; break;
        case MC.TR_K_JET: goal = [T.xc, Math.max(c.zl + r + 0.5, z)]; break;
        case MC.TR_K_CRUSH: goal = [back < fwd ? T.xc - MC.TR_CL / 2 - r - 1.5 : T.xc + MC.TR_CL / 2 + r + 1.5, z]; break;
        case MC.TR_K_DROP: {
          // which panels hold shows once it flashes; till then, out the nearer end
          if (tp < fire - MC.TR_FLASH) { goal = [fwd < back ? T.x1 + r + 2 : T.x0 - r - 2, z]; break; }
          let best = null;
          for (let row = 0; row < MC.TR_DROWS; row++) for (let col = 0; col < c.nc; col++) {
            if (drops(T, row * c.nc + col)) continue;
            const px = T.x0 + (row + 0.5) * MC.TR_CELL, pz = c.zl + (col + 0.5) * c.cw, d = Math.hypot(px - x, pz - z);
            if (!best || d < best.d) best = { d, p: [px, pz] };
          }
          goal = best ? best.p : [fwd < back ? T.x1 + r + 2 : T.x0 - r - 2, z];
          break;
        }
        default: goal = [T.x1 + r + 2, z];
      }
      out = { mode: 'refuge', T, goal };
    }
  }
  mem.plan = out;
  mem.planAt = when;
  return out;
}

// Runners in trap T's zone on tick A into play, each reckoned on at its speed (4 to 10 m/s) from tick tp,
// and those coming up to it within 30 m.
function inZone(list, T, tp, A) {
  let n = 0, soon = 0;
  for (const R of list) {
    const xa = R.x + Math.max(4, Math.min(10, R.vx)) * (A - tp) * TICK;
    if (xa > T.x0 - ZONE && xa < T.x0 + 0.4 * (T.x1 - T.x0)) n++;
    else if (xa > T.x0 - 30 && xa <= T.x0 - ZONE) soon++;
  }
  return { n, soon };
}

// A trapper's plan: the trap whose zone will hold the most runners by the tick it could be armed (it rolls
// to the pad, the trap done with its last firing), those coming counted a quarter, the further off it is the
// less, and the less for every other trapper nearer its pad. It waits STAGE short of the pad, off it, and
// rolls on when a runner is in the zone; with no runner coming to any, it waits by the next trap ahead of
// the leading runner.
function trapperPlan(view, me, bot, c) {
  const mem = bot?.mem || {};
  const when = bot?.at ?? view.tick;
  if (mem.plan && mem.planAt === when) return mem.plan;
  const g = view.party();
  const x = bot?.pos?.[0] ?? me.pos[0];
  const tp = when - g.start;
  const { runners: list, trappers } = crowd(view, c);
  let best = null;
  for (const T of c.traps) {
    const dx = T.pad - STAGE - x;
    const travel = (dx >= 0 ? eta(dx, 0) * 0.8 : eta(-dx, 0) * 1.6) / TICK + 30;
    let A = tp + travel;
    const ph = phase(T, A);
    if (ph.ph === PHASE.WARN || ph.ph === PHASE.LIVE) A = doneAt(T) + MC.TR_COOL;
    else if (ph.ph === PHASE.COOL) A += MC.TR_COOL - ph.e;
    const { n, soon } = inZone(list, T, tp, A);
    const rivals = trappers.filter((Q) => Q.slot !== me.slot && Math.abs(Q.x - T.pad) < Math.abs(x - T.pad)).length;
    const score = (n + 0.25 * soon) / (1 + (A - tp) / 300) / (1 + rivals);
    if (n + soon && (!best || score > best.score + 1e-9)) best = { T, score };
  }
  let out;
  if (best) {
    const T = best.T;
    const here = Math.abs(x - (T.pad - STAGE)) < 2.5;
    const go = here && phase(T, tp + 30).ph === PHASE.IDLE && inZone(list, T, tp, tp + 30).n > 0;
    out = go ? { mode: 'arm', T, goal: [T.pad, c.zpad, T.k] } : { mode: 'stage', T, goal: [T.pad - STAGE, c.zpad, -1] };
  } else {
    const lead = list.reduce((m, R) => Math.max(m, R.x), c.x0);
    const T = c.traps.find((Q) => Q.x0 > lead + 12) ?? c.traps.at(-1);
    out = { mode: 'wait', T, goal: [T.pad - STAGE, c.zpad, -1] };
  }
  mem.plan = out;
  mem.planAt = when;
  return out;
}

function goal(view, me, bot) {
  const c = course(view);
  if (!c || !me?.live || me.out) return null;
  const role = trapper(me.score);
  const p = role ? trapperPlan(view, me, bot, c) : runnerPlan(view, me, bot, c);
  me._trGoal = p.goal;
  if (!role) {
    // what its danger reads the traps by: the tick it thinks for and how slow it is to take each one in
    me._trAt = bot?.at ?? view.tick;
    const m = bot?.mem ?? {};
    m.react ??= c.traps.map((T) => react(me.slot ?? 0, bot?.skill ?? 0.6, T.k, view.party().round));
    me._trReact = m.react;
  }
  return [p.goal[0], p.goal[1]];
}

// The word a runner wants outright, or null for the planner: holding short of an armed trap (braking to
// stop on the spot, as Gate Crash's balls wait at a gate), heading for a refuge, home and stopped.
function think(view, me, bot) {
  const c = course(view);
  if (!c || !me?.live || me.out || trapper(me.score)) return null;
  const p = runnerPlan(view, me, bot, c);
  const x = bot?.pos?.[0] ?? me.pos[0], z = bot?.pos?.[1] ?? me.pos[2];
  const vx = bot?.vel?.[0] ?? me.vel[0], vz = bot?.vel?.[1] ?? me.vel[2];
  if (!p.T && x > c.fin + 4) return { yaw: 0, move: 0 };
  if (p.mode === 'hold') {
    const hold = p.goal[0] - x, ez = p.goal[1] - z;
    if (hold > 0.5) {
      const vt = Math.sqrt(2 * 7 * hold);
      if (vx > vt + 0.5) return { yaw: 0, move: 2 };
      if (vx < vt - 0.5) return { yaw: Math.atan2(ez, hold + 1), move: 1 };
      return { yaw: Math.atan2(ez, 2), move: Math.abs(ez) > 0.5 ? 1 : 0 };
    }
    if (hold < -0.5) return { yaw: Math.PI - Math.atan2(ez, 2), move: 1 };
    if (vx > 0.6) return { yaw: 0, move: 2 };
    return { yaw: 0, move: 0 };
  }
  if (p.mode === 'refuge') {
    const dx = p.goal[0] - x, dz = p.goal[1] - z;
    if (p.T.kind === MC.TR_K_TIP && liveAt(p.T, (bot?.at ?? view.tick) - view.party().start) >= 0) return { yaw: Math.PI / 2, move: 1 };
    if (Math.hypot(dx, dz) < 0.6) return Math.hypot(vx, vz) > 0.8 ? { yaw: Math.atan2(-vz, -vx), move: 1 } : { yaw: 0, move: 0 };
    return { yaw: Math.atan2(dz, dx), move: 1 };
  }
  return null;
}

// A runner hops a sweeper's bar about to reach it.
function hop(view, me, bot) {
  const c = course(view);
  if (!c || trapper(me.score)) return false;
  const x = bot?.pos?.[0] ?? me.pos[0], z = bot?.pos?.[1] ?? me.pos[2];
  const T = c.traps.find((Q) => Q.kind === MC.TR_K_SWEEP && x > Q.x0 - 1 && x < Q.x1 + 1);
  if (!T) return false;
  const tp = (bot?.at ?? view.tick) - view.party().start;
  const vx = bot?.vel?.[0] ?? me.vel[0], vz = bot?.vel?.[1] ?? me.vel[2];
  for (const dt of [14, 18, 22, 26]) {
    if (liveAt(T, tp + dt) < 0) continue;
    const a = barAt(T, tp + dt), px = x + vx * dt * TICK - T.xc, pz = z + vz * dt * TICK - c.cx;
    if (Math.abs(pz * Math.cos(a) - px * Math.sin(a)) < 1.5 && Math.abs(px * Math.cos(a) + pz * Math.sin(a)) < c.w) return true;
  }
  return false;
}

// ---- the solids that never move, built once a course

const TONES = [[[0.36, 0.62, 0.92], [0.3, 0.55, 0.85]], [[0.45, 0.78, 0.45], [0.38, 0.7, 0.4]], [[0.8, 0.45, 0.85], [0.72, 0.38, 0.78]], [[0.95, 0.62, 0.25], [0.88, 0.55, 0.2]]];

function build(c) {
  const out = []; // [shape, x, y, z, hx, hy, hz, yaw, r, g, b, look, a, b2, alpha, roll]
  const box = (x, y, z, hx, hy, hz, rgb, look = LOOK.PLASTIC, a = 0, b = 0, alpha = 1) => out.push([0, x, y, z, hx, hy, hz, 0, ...rgb, look, a, b, alpha, 0]);
  const cyl = (x, y, z, r, hh, rgb, look = LOOK.MATTE, a = 0, b = 0, alpha = 1) => out.push([1, x, y, z, r, hh, r, 0, ...rgb, look, a, b, alpha, 0]);
  const { cx, w, zl, zr, zw, ww, xa, x0, fin, xb } = c;
  // the start pad and the pen, checkered
  box((xa + x0) / 2, PLAT_Y - SLAB, cx, (x0 - xa) / 2, SLAB, w, [0.92, 0.92, 0.94], LOOK.CHECKER, 2, 0.35);
  box((fin + xb) / 2, PLAT_Y - SLAB, cx, (xb - fin) / 2, SLAB, w, [0.95, 0.85, 0.3], LOOK.CHECKER, 2, 0.35);
  // the floor between traps, in bands; the rail along it on the open side
  const stretches = [];
  let at = x0;
  for (const T of c.traps) { stretches.push([at, T.x0]); at = T.x1; }
  stretches.push([at, fin]);
  stretches.forEach(([a0, a1], i) => {
    const tones = TONES[i % TONES.length];
    const n = Math.max(1, Math.round((a1 - a0) / BAND));
    for (let j = 0; j < n; j++) {
      const a = a0 + ((a1 - a0) * j) / n, b = a0 + ((a1 - a0) * (j + 1)) / n;
      box((a + b) / 2, PLAT_Y - SLAB, cx, (b - a) / 2 + 0.01, SLAB, w, tones[j & 1], LOOK.PLASTIC);
    }
    box((a0 + a1) / 2, PLAT_Y + MC.TR_RAIL / 2, zl - 0.15, (a1 - a0) / 2, MC.TR_RAIL / 2, 0.15, [0.96, 0.96, 0.98], LOOK.GLOW, 0.25, 0, 0.5);
    box((a0 + a1) / 2, PLAT_Y + MC.TR_RAIL + 0.08, zl - 0.15, (a1 - a0) / 2, 0.08, 0.2, [0.85, 0.2, 0.2], LOOK.PLASTIC);
  });
  for (const [a0, a1] of [[xa, x0], [fin, xb]]) box((a0 + a1) / 2, PLAT_Y + MC.TR_RAIL / 2, zl - 0.15, (a1 - a0) / 2, MC.TR_RAIL / 2, 0.15, [0.96, 0.96, 0.98], LOOK.GLOW, 0.25, 0, 0.5);
  // each trap's floor, but the panels' and the tipping floor's (drawn as they move); hazard stripes at its ends
  for (const T of c.traps) {
    const col = KIND_COL[T.kind];
    if (T.kind !== MC.TR_K_DROP && T.kind !== MC.TR_K_TIP) {
      const rgb = T.kind === MC.TR_K_SWEEP ? [0.42, 0.36, 0.5] : T.kind === MC.TR_K_PIST ? [0.5, 0.55, 0.62] : [0.4, 0.42, 0.46];
      box(T.xc, PLAT_Y - SLAB, cx, (T.x1 - T.x0) / 2, SLAB, w, rgb, T.kind === MC.TR_K_PIST ? LOOK.METAL : LOOK.MATTE);
    }
    for (const x of [T.x0, T.x1]) box(x, PLAT_Y + 0.006, cx, 0.25, 0.02, w, col, LOOK.HAZARD, 0.5);
    // its sign on the wall, its kind's colour
    box(T.xc, PLAT_Y + MC.TR_WH - 0.6, zr + 0.02, Math.min(3, (T.x1 - T.x0) / 2 - 0.5), 0.45, 0.04, col, LOOK.GLOW, 0.5, 0.4);
    if (T.kind === MC.TR_K_CRUSH) {
      // the crusher's frame: posts either side and the beam it hangs from
      for (const s of [-1, 1]) box(T.xc, PLAT_Y + (MC.TR_CH + 3.6) / 2, cx + s * (w + 0.5), MC.TR_CL / 2 + 0.3, (MC.TR_CH + 3.6) / 2, 0.3, [0.3, 0.32, 0.36], LOOK.METAL);
      box(T.xc, PLAT_Y + MC.TR_CH + 3.4, cx, MC.TR_CL / 2 + 0.3, 0.3, w + 0.8, [0.3, 0.32, 0.36], LOOK.METAL);
    }
    if (T.kind === MC.TR_K_JET) for (const [vx, vz] of vents(c, T)) cyl(vx, PLAT_Y + 0.01, vz, MC.TR_VR, 0.02, [0.12, 0.13, 0.15], LOOK.METAL);
  }
  // the wall up to the walkway and its rail; the walkway; its outer rail
  box((xa + xb) / 2, (PLAT_Y - 2 * SLAB + WALK_Y + MC.TR_RAIL) / 2, zr + MC.TR_WALL / 2, (xb - xa) / 2, (WALK_Y + MC.TR_RAIL - PLAT_Y + 2 * SLAB) / 2, MC.TR_WALL / 2, [0.55, 0.57, 0.62], LOOK.MATTE);
  box((xa + xb) / 2, WALK_Y - SLAB, zw + ww / 2, (xb - xa) / 2, SLAB, ww / 2, [0.16, 0.16, 0.18], LOOK.RUBBER);
  box((xa + xb) / 2, WALK_Y + MC.TR_RAIL / 2, zw + ww + 0.15, (xb - xa) / 2, MC.TR_RAIL / 2, 0.15, [0.96, 0.96, 0.98], LOOK.GLOW, 0.25, 0, 0.5);
  box((xa + xb) / 2, WALK_Y + MC.TR_RAIL + 0.08, zw + ww + 0.15, (xb - xa) / 2, 0.08, 0.2, [0.85, 0.2, 0.2], LOOK.PLASTIC);
  for (const x of [xa - 0.15, xb + 0.15]) {
    box(x, PLAT_Y + MC.TR_RAIL / 2, cx, 0.15, MC.TR_RAIL / 2, w + 0.3, [0.96, 0.96, 0.98], LOOK.GLOW, 0.25, 0, 0.5);
    box(x, WALK_Y + MC.TR_RAIL / 2, zw + ww / 2, 0.15, MC.TR_RAIL / 2, ww / 2, [0.96, 0.96, 0.98], LOOK.GLOW, 0.25, 0, 0.5);
  }
  // pillars down to the sea
  const legs = Math.max(2, Math.round((xb - xa) / 24));
  for (let i = 0; i < legs; i++) {
    const x = xa + ((i + 0.5) * (xb - xa)) / legs;
    for (const z of [cx - w * 0.6, cx + w * 0.6, zw + ww / 2]) {
      const top = z > zr ? WALK_Y : PLAT_Y;
      cyl(x, (top - 2 * SLAB + SEA) / 2, z, 1.4, (top - 2 * SLAB - SEA) / 2, [0.86, 0.85, 0.82], LOOK.MATTE);
    }
  }
  // the start gate's frame, the finish arch over the line and the line
  for (const s of [-1, 1]) cyl(x0, PLAT_Y + 3.7, cx + s * (w + 0.7), 0.45, 3.7, [0.2, 0.75, 0.3], LOOK.PLASTIC);
  box(x0, PLAT_Y + 7.4, cx, 0.3, 0.3, w + 1.1, [0.2, 0.75, 0.3], LOOK.GLOW, 0.6, 0.5);
  for (const s of [-1, 1]) cyl(fin, PLAT_Y + 3.8, cx + s * (w + 0.9), 0.55, 3.8, [0.95, 0.95, 0.95], LOOK.PLASTIC);
  box(fin, PLAT_Y + 7.8, cx, 0.5, 0.8, w + 1.4, [0.15, 0.15, 0.15], LOOK.CHECKER, 0.8);
  box(fin, PLAT_Y + 0.02, cx, 0.3, 0.03, w, [0.1, 0.1, 0.1], LOOK.CHECKER, 0.3);
  return out;
}

// ---- drawing a trap as its clock stands

function drawTrap(c, T, tp, sc, out, now, blink) {
  const { ph, e } = phase(T, tp);
  const warn = ph === PHASE.WARN, live = ph === PHASE.LIVE;
  // armed, only its pad and sign say so; the last TR_FLASH ticks the trap itself flashes
  const late = warn && e >= MC.TR_DELAY - MC.TR_FLASH;
  const col = KIND_COL[T.kind];
  const flash = late && blink;
  const lit = late ? (blink ? 2.2 : 0.4) : warn ? 0.8 : live ? 1.6 : 0.3;
  const hz = (T.x1 - T.x0) / 2;
  switch (T.kind) {
    case MC.TR_K_DROP: {
      const k = live ? Math.min(1, (e + 1) / 25) : 0;
      for (let row = 0; row < MC.TR_DROWS; row++) for (let col2 = 0; col2 < c.nc; col2++) {
        const cell = row * c.nc + col2;
        const goes = (late || live) && drops(T, cell);
        const x = T.x0 + (row + 0.5) * MC.TR_CELL, z = c.zl + (col2 + 0.5) * c.cw;
        const tone = (row + col2) & 1 ? [0.95, 0.72, 0.4] : [0.88, 0.62, 0.32];
        if (live && goes) {
          // gone: falling away, fading
          if (k < 1) sc.box(x, PLAT_Y - SLAB * 0.3 - 6 * k * k, z, MC.TR_CELL / 2 - 0.04, SLAB * 0.3, c.cw / 2 - 0.04, 0, 0.6, 0.2, 0.12, LOOK.HAZARD, 0.5, 0, 1 - k, cell);
          continue;
        }
        const rgb = goes && flash ? [1, 0.2, 0.12] : tone;
        sc.box(x, PLAT_Y - SLAB * 0.3, z, MC.TR_CELL / 2 - 0.04, SLAB * 0.3, c.cw / 2 - 0.04, 0, ...rgb, goes ? LOOK.HAZARD : LOOK.PLASTIC, 0.5, 0, 1, cell);
      }
      break;
    }
    case MC.TR_K_PIST: {
      const ext = extAt(live ? e : -1);
      const face = c.zr - ext * 2 * c.w * MC.TR_PREACH;
      const n = Math.max(1, Math.round((T.x1 - T.x0) / MC.TR_PHEAD));
      const hx = (T.x1 - T.x0) / n / 2;
      for (let i = 0; i < n; i++) {
        const x = T.x0 + (2 * i + 1) * hx;
        const depth = c.zr - face + 0.25;
        sc.box(x, PLAT_Y + MC.TR_PH / 2, face + depth / 2, hx - 0.06, MC.TR_PH / 2, depth / 2, 0, ...(flash ? [1, 0.25, 0.15] : col), LOOK.HAZARD, 0.5, 0, 1, T.k * 16 + i);
        sc.box(x, PLAT_Y + MC.TR_PH / 2, face - 0.05, hx - 0.15, MC.TR_PH / 2 - 0.1, 0.06, 0, 1, 0.5, 0.3, LOOK.GLOW, lit, 0.6, 1, T.k * 16 + i + 8);
      }
      break;
    }
    case MC.TR_K_SWEEP: {
      const a = barAt(T, tp), len = c.w - MC.TR_BIN;
      sc.cyl(T.xc, PLAT_Y + 1, c.cx, MC.TR_POST, 1, 0.3, 0.3, 0.34, LOOK.METAL);
      sc.sphere(T.xc, PLAT_Y + 2.4, c.cx, 0.5, ...col, LOOK.GLOW, lit);
      // at rest sunk in its slot, its top flush with the floor; live, up at ball height
      sc.box(T.xc, live ? PLAT_Y + MC.TR_BY : PLAT_Y - MC.TR_BW + 0.03, c.cx, len, MC.TR_BW, MC.TR_BW, a, ...(flash ? [1, 0.25, 0.15] : col), LOOK.HAZARD, 0.6, 0, 1, T.k * 16);
      if (late || live) sc.box(T.xc, PLAT_Y + 0.02, c.cx, len, 0.02, MC.TR_BW + 0.6, a, ...col, LOOK.GLOW, lit, 0.6, 0.35);
      break;
    }
    case MC.TR_K_CRUSH: {
      const b = crushB(live ? e : -1);
      sc.box(T.xc, PLAT_Y + b + 1.6, c.cx, MC.TR_CL / 2, 1.6, c.w, 0, ...(flash ? [1, 0.25, 0.15] : [0.5, 0.52, 0.56]), LOOK.METAL, 0, 0, 1, T.k * 16);
      sc.box(T.xc, PLAT_Y + b + 0.1, c.cx, MC.TR_CL / 2 + 0.02, 0.1, c.w + 0.02, 0, ...col, LOOK.HAZARD, 0.6, 0, 1, T.k * 16 + 1);
      if (late || live) out.decals?.push({ pos: [T.xc, PLAT_Y + 0.03, c.cx], radius: Math.min(MC.TR_CL / 2, c.w), width: 0.4, color: [...col, late ? (blink ? 0.9 : 0.3) : 0.6], kind: DECAL.TARGET });
      break;
    }
    case MC.TR_K_JET: {
      for (const [vx, vz] of vents(c, T)) {
        if (late) out.decals?.push({ pos: [vx, PLAT_Y + 0.04, vz], radius: MC.TR_VR + MC.TR_VIN, width: 0.3, color: [...col, blink ? 0.95 : 0.35], kind: DECAL.RING });
        if (live) {
          for (let i = 0; i < 3; i++) out.glow.push({ pos: [vx, PLAT_Y + 1 + i * 2 + ((now / 60 + i) % 2), vz], size: 1.4 + 0.3 * i, color: [0.75, 0.95, 1, 0.55 - 0.12 * i], kind: SPRITE.FLASH, minpx: 2 });
        }
      }
      break;
    }
    case MC.TR_K_TIP: {
      const th = tiltAt(live ? e : -1);
      const HH = SLAB * 0.4;
      const cz = c.cx + HH * Math.sin(th), cy = PLAT_Y - c.w * Math.tan(th) - HH * Math.cos(th);
      sc.box(T.xc, cy, cz, hz, HH, c.w / Math.cos(th), 0, ...(flash ? [1, 0.3, 0.15] : [0.98, 0.82, 0.3]), LOOK.HAZARD, 1.2, 0, 1, T.k * 16, -th);
      // the hinge along the wall
      sc.cyl(T.xc, PLAT_Y - 0.25, c.zr - 0.1, 0.3, hz, 0.35, 0.35, 0.38, LOOK.METAL, 0, 0, 1, T.k * 16 + 1, Math.PI / 2, Math.PI / 2);
      break;
    }
    default:
  }
  // its pad on the walkway: green ready, orange armed (flashing as the trap does), red live, grey cooling
  const pad = ph === PHASE.IDLE ? [0.25, 1, 0.35] : warn ? (late && !blink ? [0.6, 0.3, 0.05] : [1, 0.6, 0.1]) : live ? [1, 0.15, 0.1] : [0.35, 0.35, 0.38];
  sc.cyl(T.pad, WALK_Y + 0.03, c.zpad, MC.TR_PADR, 0.06, ...pad, LOOK.GLOW, ph === PHASE.COOL ? 0.2 : 1.2, 0.5);
  sc.cyl(T.pad, WALK_Y + 0.05, c.zpad, MC.TR_PADR * 0.45, 0.06, ...col, LOOK.GLOW, 1, 0.3);
  // the light over its sign
  sc.sphere(T.xc, PLAT_Y + MC.TR_WH + 0.2, c.zr + 0.1, 0.3, ...pad, LOOK.GLOW, warn ? lit : 1.2);
}


export default {
  id: L.MG_TRAP, key: 'trap', name: 'TRAP RUN',
  hint: 'RUNNERS RACE THE TRAPS  TRAPPERS ROLL ONTO PADS TO SPRING THEM',
  rules: 'FIRST HOME WINS  A TRAPPER PLACES BY THE RUNNERS IT TAKES',
  env: 'day',
  // a runner taken or fallen stays out; home, it waits in the pen
  outForGood: true,

  draw(view, ctx, out) {
    const c = course(view);
    if (!c) return;
    if (!c.geom) c.geom = build(c);
    const sc = out.scene;
    for (const s of c.geom) sc.put(s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7], s[8], s[9], s[10], s[11], s[12], s[13], s[14], undefined, s[15]);
    const g = view.party();
    const tp = playTime(view, ctx);
    const now = ctx?.now ?? 0, secs = now / 1000;
    const cam = ctx?.cam ?? [c.xa, 60, c.cx];
    const blink = Math.floor(now / 90) & 1;
    for (const T of c.traps) drawTrap(c, T, tp, sc, out, now, blink);
    // the walkway's belt from the start line: stripes running on down the course near the camera
    const gap = 3, off = (secs * MC.TR_BELT) % gap;
    for (let x = Math.max(c.x0, cam[0] - 80) - ((Math.max(c.x0, cam[0] - 80) - c.x0) % gap) + off; x < Math.min(c.xb, cam[0] + 80); x += gap) {
      sc.box(x, WALK_Y + 0.01, c.zw + c.ww / 2, 0.12, 0.01, c.ww / 2 - 0.1, 0, 0.9, 0.9, 0.95, LOOK.GLOW, 0.3, 0, 0.6);
    }
    // flashes where traps fired
    c.flashes = c.flashes.filter((F) => now - F.at < 500);
    for (const F of c.flashes) {
      const k = (now - F.at) / 500;
      out.glow.push({ pos: F.pos, size: 2 + 4 * k, color: [...F.col, 0.8 * (1 - k)], kind: SPRITE.RING, minpx: 2 });
    }
    // a star over the leading runner still out on the course
    if (g.state === L.H_PLAY) {
      const lead = standings(view).find((e) => !e.home && !e.trapper && !e.out);
      const b = lead && view.bumper(lead.slot);
      if (b && !b.out) {
        const dt = ctx?.dt || 0;
        out.glow.push({ pos: [b.pos[0] + b.vel[0] * dt, b.pos[1] + 2 * b.radius + 2.5 + 0.15 * Math.sin(secs * 4), b.pos[2] + b.vel[2] * dt], size: 0.75, color: [1, 0.85, 0.2, 0.95], kind: SPRITE.SPARK, minpx: 3 });
      }
    }
    // the start gate: down through the countdown, up and away at GO
    const up = g.state === L.H_COUNT || g.state === L.H_IDLE ? 0 : Math.min(1, tp / 60);
    if (up < 1) sc.box(c.x0, PLAT_Y + 0.9 + up * 5, c.cx, 0.15, 0.9, c.w, 0, 0.2, 0.75, 0.3, LOOK.GLOW, 0.4, 0.6, 0.85 * (1 - up));
  },

  // the whole course and the walkway, from above
  frame(view) {
    const c = course(view);
    const g = view.party();
    if (!c) return { centre: [g.cx, PLAT_Y, g.cx], radius: g.size, shape: 'square' };
    return { centre: [(c.xa + c.xb) / 2, PLAT_Y, (c.zl + c.zw + c.ww) / 2], radius: Math.max(c.xb - c.xa, c.zw + c.ww - c.zl) / 2, shape: 'square' };
  },

  // a new round faces you down the course
  facing() { return 0; },

  fx(f, ctx) {
    const d = typeof ctx.dist === 'function' ? ctx.dist(f.pos) : ctx.dist ?? 0;
    const mine = f.owner === ctx.slot;
    const c = course(ctx.view);
    const name = (p) => ctx.name?.(p) ?? `P${p + 1}`;
    if (f.kind === MC.TR_FX_TRAP) {
      const T = c?.traps[f.shot & 255];
      if (!T) return;
      if (f.shot & 256) {
        c.flashes.push({ pos: [T.xc, PLAT_Y + 1.5, c.cx], col: KIND_COL[T.kind], at: ctx.now ?? 0 });
        if (d < 60) ctx.sound?.blast?.(d, T.kind === MC.TR_K_CRUSH ? 3 : 1.5);
      } else {
        if (mine) { ctx.banner?.(`${KIND_NAME[T.kind]} ARMED`, C.ORANGE, 1500); ctx.sound?.count?.(1); }
        ctx.glow?.({ pos: [f.pos[0], f.pos[1] + 0.6, f.pos[2]], size: 2.4, color: [1, 0.6, 0.1, 0.9], kind: SPRITE.RING, life: 500, grow: true });
      }
    } else if (f.kind === MC.TR_FX_HIT) {
      const kind = f.shot >> 8;
      ctx.glow?.({ pos: [f.pos[0], f.pos[1] + 1, f.pos[2]], size: 2.4, color: [...KIND_COL[kind] ?? [1, 1, 1], 0.9], kind: SPRITE.FLASH, life: 300, grow: true });
      if (mine || d < 30) ctx.sound?.boing?.(Math.min(24, f.size), mine ? 0 : d);
      if (mine) ctx.banner?.(['', 'SHOVED!', 'SWEPT!', 'CRUSHED!', 'BLOWN BACK!', ''][kind] || 'HIT!', C.ORANGE, 900);
    } else if (f.kind === MC.TR_FX_HOME) {
      const place = Math.round(f.size);
      if (mine) { ctx.banner?.(`HOME ${ordinal(place)}!`, place === 1 ? C.YELLOW : C.GREEN, 3000); ctx.sound?.holed?.(); }
      else ctx.feed?.(`${name(f.owner)} HOME ${ordinal(place)}`, place === 1 ? C.YELLOW : C.WHITE);
      if (f.shot) ctx.banner?.(`${mine ? 'YOU WIN THE RUN' : `${name(f.owner)} IS HOME`}  ${f.shot} S TO FINISH`, C.YELLOW, 3000);
      for (let i = 0; i < 6; i++) {
        const a = i * 1.047 + f.owner;
        ctx.glow?.({ pos: [f.pos[0] + Math.cos(a) * 1.5, f.pos[1] + 2 + (i & 1), f.pos[2] + Math.sin(a) * 1.5], size: 0.9, color: [[1, 0.85, 0.2], [0.3, 0.9, 1], [1, 0.35, 0.5]][i % 3].concat(1), kind: SPRITE.SPARK, life: 700 });
      }
    } else if (f.kind === MC.TR_FX_TAKEN) {
      if (f.shot === ctx.slot) { ctx.banner?.(`YOUR ${KIND_NAME[Math.round(f.size)] ?? 'TRAP'} GOT ${name(f.owner)}`, C.GREEN, 2000); ctx.sound?.kill?.(); }
    }
  },

  // A runner a trap had: taken by its trapper ("P3 CRUSHED BY P5").
  sink(f, name, view) {
    const c = course(view);
    if (!c) return null;
    const a = L.PLAYERS + f.owner * L.PSIZE;
    if (trapper(view.dv.getUint16(a + L.PG_SCORE, true))) return null;
    const m = view.dv.getUint32(a + L.PG_M, true);
    const T = c.traps[(m & 255) - 1];
    if (!T || f.tick - view.party().start - (m >>> 8) >= MC.TR_CREDIT) return null;
    return `${name(f.owner)} ${KIND_VERB[T.kind]} BY ${name(T.by)}`;
  },

  // A runner: its place and how far to go, over the frontend's score lines, the next trap and its state, the
  // course as a line. A trapper: the runners it has taken, the pad ahead and its trap's state, the course with
  // the runners on it.
  hud(view, ctx) {
    const c = course(view);
    const g = view.party();
    if (!c || g.state !== L.H_PLAY) return;
    const list = standings(view);
    const me = ctx.me ?? (ctx.slot >= 0 ? view.partier(ctx.slot) : null);
    const mine = me?.live ? list.find((e) => e.slot === me.slot) : null;
    const total = c.fin - c.x0;
    const blank = ' '.repeat(26);
    ctx.put(1, 0, blank, C.WHITE);
    ctx.put(1, 1, blank, C.WHITE);
    const secs = (k) => `${Math.max(0, k * TICK).toFixed(1)} S`;
    const state = (T) => {
      const p = phase(T, g.t);
      if (p.ph === PHASE.WARN && p.e < MC.TR_DELAY - MC.TR_FLASH) return [`${KIND_NAME[T.kind]} ARMED`, C.ORANGE];
      if (p.ph === PHASE.WARN) return [`${KIND_NAME[T.kind]} FIRES IN ${secs(MC.TR_DELAY - p.e)}`, (Math.floor((ctx.now ?? 0) / 120) & 1) ? C.RED : C.ORANGE];
      if (p.ph === PHASE.LIVE) return [`${KIND_NAME[T.kind]} LIVE`, C.RED];
      if (p.ph === PHASE.COOL) return [`${KIND_NAME[T.kind]} COOLING ${secs(MC.TR_COOL - p.e)}`, C.GREY];
      return [`${KIND_NAME[T.kind]} READY`, C.GREEN];
    };
    const runners = list.filter((e) => !e.trapper);
    if (mine?.trapper) {
      ctx.put(1, 0, `TRAPPER  ${mine.taken} TAKEN  ${ordinal(mine.rank)} OF ${list.length}`, C.ORANGE);
      ctx.put(1, 1, 'ROLL ONTO A PAD TO ARM ITS TRAP', C.GREY);
      const T = c.traps.find((Q) => Q.pad + 1 > me.pos[0]) ?? c.traps.at(-1);
      const [msg, col] = state(T);
      ctx.right(2, `PAD ${T.k + 1} OF ${c.nt}  ${msg}`, col);
      const racing = runners.filter((e) => !e.home && !e.out).length;
      ctx.right(3, `${racing} RUNNERS ON THE COURSE`, C.CYAN);
    } else if (mine) {
      ctx.put(1, 0, mine.home ? `HOME ${ordinal(mine.rank)} OF ${list.length}` : `${ordinal(mine.rank)} OF ${list.length}`, mine.home ? C.GREEN : mine.rank === 1 ? C.YELLOW : C.WHITE);
      if (!mine.home && !mine.out) {
        ctx.put(1, 1, `${Math.max(0, Math.ceil(total - mine.dist))} M TO GO`, C.GREY);
        const T = c.traps.find((Q) => Q.x1 + 1 > me.pos[0]);
        if (T) {
          const [msg, col] = state(T);
          ctx.right(2, `TRAP ${T.k + 1} OF ${c.nt}  ${msg}`, col);
          const N = c.traps[T.k + 1];
          if (N) ctx.right(3, `THEN ${KIND_NAME[N.kind]}`, C.GREY);
        } else ctx.right(2, 'THE LINE: GO GO GO', C.GREEN);
      }
    }
    // the course as a line: its traps (their state's colour), the runners or the leader, you
    const n = 36, x = COLS - 2 - n;
    const cell = (dist) => Math.max(0, Math.min(n - 1, Math.floor((dist / total) * n)));
    ctx.put(x - 1, 5, '[', C.GREY);
    ctx.put(x, 5, '-'.repeat(n), C.GREY);
    for (const T of c.traps) {
      const p = phase(T, g.t).ph;
      ctx.put(x + cell(T.xc - c.x0), 5, 'T', p === PHASE.LIVE ? C.RED : p === PHASE.WARN ? C.ORANGE : p === PHASE.COOL ? C.GREY : C.GREEN);
    }
    ctx.put(x + n, 5, ']', C.WHITE);
    if (mine?.trapper) for (const e of runners) { if (!e.home && !e.out) ctx.put(x + cell(e.dist), 5, '*', C.YELLOW); }
    else {
      const lead = runners.find((e) => !e.home && !e.out);
      if (lead) ctx.put(x + cell(lead.dist), 5, '*', C.YELLOW);
      if (mine && !mine.home && !mine.out) ctx.put(x + cell(mine.dist), 5, '>', C.GREEN);
    }
    const home = runners.filter((e) => e.home).length, taken = runners.filter((e) => e.out).length;
    if (home || taken) ctx.right(6, `${home} HOME  ${taken} OUT OF ${runners.length}`, C.CYAN);
  },

  brain: { danger, goal, think, hop },
};
