// GLASS BRIDGE, as drawn and as the AI ball sees it. A wooden start deck, the
// bridges' glass panels in pairs on steel rails over the sea, a chequered
// finish deck with a glowing line. Glass is the renderer's ice, clear and
// faintly green; tempered glass someone has stood on is smudged; cracked
// glass whitens and trembles through its GB_HOLD, then goes in shards that
// tumble and fade. The panels are read straight from the sim
// (src/mg/glass.mjs's layout): 1 whole, 2 stood on, else the tick it stops
// holding, so what a panel does on any tick, drawn or asked about, is a
// comparison with that tick.
//
// The brain sees what a player sees: which glass has broken and which a ball
// has stood on (the panels' states), and the balls. It never reads the side
// that shatters (GB_BAD). It follows the trail of known glass, and at the
// front, where the next row is anyone's guess, waits a little for someone
// else to try, then guesses.
import * as L from '../../src/layout.mjs';
import * as MC from '../../src/mg/glass.mjs'; // GB_*: the minigame's own constants
import { PLAT_Y } from '../../src/party-view.mjs';
import { LOOK, SPRITE } from '../party-render.mjs';
import { C } from '../font.mjs';

const TICK = 0.008;
const PITCH = MC.GB_LP + MC.GB_G; // a row and its gap, along
const BP = 2 * MC.GB_WP + MC.GB_GIN + MC.GB_GB; // a bridge and its gap, across
const HH = 0.08; // a panel's half thickness, m
const FALL = 1.4; // s a broken panel's shards are drawn falling
const GLASS = [0.72, 0.9, 0.88];
const STEEL = [0.5, 0.53, 0.58];
const DECK = [0.55, 0.4, 0.26];
const N = (k) => Math.fround(Number(L.BPHYS[k]));
const ACC = N('B_ACC_DT'), AIR = N('B_AIR_DT'), AIR_DRAG = N('B_AIR_DRAG');
const GRAV = Number(L.PHYS.GP_DT);
const ordinal = (n) => `${n}${[, 'ST', 'ND', 'RD'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || 'TH'}`;

// ---- the stage

// This round's layout on the view's bank, or null before one is laid.
export function stage(view) {
  const dv = view.dv, o = view.bank || 0;
  const nb = dv.getUint32(L.PG_H + MC.GB_NB + o, true), nr = dv.getUint32(L.PG_H + MC.GB_NR + o, true);
  if (!(nb > 0 && nb <= MC.GB_NBMAX && nr > 0 && nr <= MC.GB_NRMAX)) return null;
  const f = (k) => dv.getFloat32(L.PG_H + k + o, true);
  return { nb, nr, x0: f(MC.GB_X0), zl: f(MC.GB_ZL), zr: f(MC.GB_ZR), fx: f(MC.GB_FX), fin: dv.getUint32(L.PG_H + MC.GB_FIN + o, true), n: 2 * nb * nr };
}
const CELL0 = (L.PG_S + MC.GB_CELLS) >> 2;
// Panel c's state (the confirmed world's: PG_S has no prediction's copy).
export const cellOf = (view, c) => view.i32[CELL0 + c] >>> 0;
// Does a panel holding v hold on tick t (t may be fractional)? As $gb_ground has it.
export const holds = (v, t) => v === 1 || v === 2 || (v > 2 && t < v);
export const panelIndex = (S, b, k, s) => (b * S.nr + k) * 2 + s;
// Panel c's bridge, row and side, and its box [x0, x1, z0, z1].
export function panelOf(S, c) {
  const q = c >> 1, b = Math.floor(q / S.nr), k = q % S.nr, s = c & 1;
  const x0 = S.x0 + MC.GB_G + k * PITCH, z0 = S.zl + b * BP + s * (MC.GB_WP + MC.GB_GIN);
  return { c, b, k, s, x0, x1: x0 + MC.GB_LP, z0, z1: z0 + MC.GB_WP, cx: x0 + MC.GB_LP / 2, cz: z0 + MC.GB_WP / 2 };
}
// Bridge b's stretch across, [z0, z1], and its middle.
const bridgeZ = (S, b) => { const z0 = S.zl + b * BP; return [z0, z0 + 2 * MC.GB_WP + MC.GB_GIN, z0 + MC.GB_WP + MC.GB_GIN / 2]; };
// What holds (x, z) up, as $gb_panel: a panel index, -1 nothing, -2 the start deck, -3 the finish deck.
export function supportAt(S, x, z) {
  const u = x - S.x0, uf = S.fx - S.x0, w = z - S.zl;
  if (u <= 0 || u >= uf) {
    if (z < S.zl - MC.GB_EDGE || z > S.zr + MC.GB_EDGE || u < -MC.GB_DS || u > uf + MC.GB_DF) return -1;
    return u <= 0 ? -2 : -3;
  }
  const a = u - MC.GB_G;
  if (a < 0 || w < 0) return -1;
  const k = Math.floor(a / PITCH);
  if (a - k * PITCH > MC.GB_LP || k >= S.nr) return -1;
  const b = Math.floor(w / BP);
  if (b >= S.nb) return -1;
  const e = w - b * BP;
  const s = e <= MC.GB_WP ? 0 : e >= MC.GB_WP + MC.GB_GIN && e <= 2 * MC.GB_WP + MC.GB_GIN ? 1 : -1;
  return s < 0 ? -1 : panelIndex(S, b, k, s);
}
// The nearest bridge to z.
const bridgeNear = (S, z) => Math.max(0, Math.min(S.nb - 1, Math.round((z - S.zl - (BP - MC.GB_GB) / 2) / BP)));
// What anyone can tell of row k of bridge b: the side that holds (0 or 1), or -1 if nobody knows yet.
// Glass that broke says the other holds; glass a ball stood on holds.
export function known(view, S, b, k) {
  const v0 = cellOf(view, panelIndex(S, b, k, 0)), v1 = cellOf(view, panelIndex(S, b, k, 1));
  if (v0 === 2 || v1 > 2) return 0;
  if (v1 === 2 || v0 > 2) return 1;
  return -1;
}
// The prediction's own cracks, from its FX ring (rebuilt every run, as
// $gb_state reads it): panel -> the tick it stops holding.
function ownCracks(pview) {
  const m = new Map();
  const n = pview.fxCount();
  for (let i = Math.max(0, n - L.FX_MAX); i < n; i++) { const f = pview.fx(i); if (f.kind === MC.GB_FX_CRACK) m.set(f.shot, f.tick + MC.GB_HOLD); }
  return m;
}
const rowOf = (m) => (m & MC.GB_M_HOME ? -1 : m & 255);

// Every ball's standing as the end will place it: home by its order, then the
// row reached, one still out there ahead of one fallen from it.
export function standings(view) {
  const list = [];
  for (let p = 0; p < L.NPLAYER; p++) {
    const a = L.PLAYERS + view.bank + p * L.PSIZE;
    const fl = view.u8[a + L.P_FL];
    if (!(fl & L.PF_LIVE)) continue;
    const m = view.dv.getUint32(a + L.PG_M, true);
    const home = !!(m & MC.GB_M_HOME);
    const fell = !home && !!(fl & (L.PF_DEAD | L.PF_FALL));
    const row = home ? 0 : m & 255;
    list.push({ slot: p, home, fell, row, order: home ? m & 0xffff : 0, key: home ? MC.GB_SFIN - ((m & 0xffff) - 1) : 2 * row + (fell ? 0 : 1) });
  }
  list.sort((a, b) => b.key - a.key || a.slot - b.slot);
  for (let i = 0; i < list.length; i++) list[i].rank = i && list[i].key === list[i - 1].key ? list[i - 1].rank : i + 1;
  return list;
}

// ---- the brain

// Where a hop now lands: bumper's move a tick at a time, pushing (ux, uz) (0 0: no keys), the round's hop.
function landing(g, x, z, vx, vz, ux, uz) {
  let vy = g.hop, y = 0, n = 0;
  const wish = ux || uz ? 1 : 0;
  vx = ux * ACC * g.acc * wish + vx * (wish ? g.drag : g.idle);
  vz = uz * ACC * g.acc * wish + vz * (wish ? g.drag : g.idle);
  do {
    if (n) { vx = ux * AIR * g.acc + vx * AIR_DRAG; vz = uz * AIR * g.acc + vz * AIR_DRAG; }
    vy -= GRAV;
    x += vx * TICK; z += vz * TICK; y += vy * TICK;
    n++;
  } while (y > 0 && n < 400);
  return [x, z, n];
}
// The box a ball on support c stands on: a panel's, or its bridge's stretch of a deck.
function boxOf(S, c, b) {
  if (c >= 0) return panelOf(S, c);
  const [z0, z1] = bridgeZ(S, b);
  if (c === -2) return { x0: S.x0 - MC.GB_DS, x1: S.x0, z0, z1, cz: (z0 + z1) / 2 };
  return { x0: S.fx, x1: S.fx + MC.GB_DF, z0, z1, cz: (z0 + z1) / 2 };
}
// Balls in on the stage, by bridge, once per world tick.
function crowd(view, S) {
  if (view._gb?.tick === view.tick) return view._gb.by;
  const by = Array.from({ length: S.nb }, () => []);
  for (let p = 0; p < L.NPLAYER; p++) {
    const a = L.PLAYERS + view.bank + p * L.PSIZE;
    if ((view.u8[a + L.P_FL] & (L.PF_LIVE | L.PF_DEAD | L.PF_FALL)) !== L.PF_LIVE) continue;
    const x = view.dv.getFloat32(a + L.P_PX, true), z = view.dv.getFloat32(a + L.P_PZ, true);
    by[bridgeNear(S, z)].push({ slot: p, x, z, y: view.dv.getFloat32(a + L.P_PY, true), vx: view.dv.getFloat32(a + L.P_VX, true), vz: view.dv.getFloat32(a + L.P_VZ, true), ground: !!(view.u8[a + L.P_FL] & L.PF_GROUND) });
  }
  view._gb = { tick: view.tick, by };
  return by;
}
const ROOM = 2.4; // m it likes between its centre and a rival's while it waits
const LAND = 2; // m past a panel's near edge it means to come down
const RUN = 4.2; // m of run-up to a hop: about 7.5 m/s at the edge, coming down LAND past the gap
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// The word: where it stands (a panel, or a deck), the next row's glass it
// will hop to (the side known to hold, or at the front its guess once it has
// waited), and the hop: to a spot RUN back from the edge, then, when nobody
// is in the way, a run at the target, hopping when a hop now comes down well
// inside it.
function think(view, me, bot, t) {
  const S = stage(view);
  const g = view.party();
  if (!S || !me.live || me.out || g.state !== L.H_PLAY) return null;
  const mem = bot?.mem || {};
  const slot = me.slot;
  const [x, z] = bot?.pos ?? [me.pos[0], me.pos[2]];
  const [vx, vz] = bot?.vel ?? [me.vel[0], me.vel[2]];
  const rand = () => (bot ? bot.rand() : 0.5);
  const skill = bot?.skill ?? 0.6;
  const ground = me.ground && !me.falling && Math.abs(me.pos[1] - PLAT_Y) < 0.06;
  const c = supportAt(S, x, z);
  if (ground && c !== -1) {
    mem.c = c;
    if (c !== -2) mem.b = c >= 0 ? panelOf(S, c).b : bridgeNear(S, z);
  }
  const b = mem.b ?? bridgeNear(S, z);
  mem.b = b;
  const on = mem.c ?? -2;
  if (on === -3) return null;
  const row = on >= 0 ? panelOf(S, on).k : -1;
  const P = boxOf(S, on, b);
  // in the air: keep pushing at the glass it's going for
  if (!ground) {
    const T = mem.T;
    if (!T) return { yaw: Math.atan2(vz, vx), move: 0 };
    return { yaw: Math.atan2(T[1] - z, T[0] - x), move: 1 };
  }
  // the next row's glass: the finish, the side known to hold, or a guess
  const next = row + 1;
  let Q = null;
  if (next >= S.nr) Q = boxOf(S, -3, b);
  else {
    let side = known(view, S, b, next);
    if (side < 0) {
      // the front: wait for someone else to try (and for whoever is in the air to land), then guess
      const fr = mem.front;
      if (!fr || fr.row !== row) mem.front = { row, since: t, wait: Math.round((40 + rand() * 260) * (1.2 - 0.5 * skill)), side: rand() < 0.5 ? 0 : 1 };
      const F = mem.front;
      const others = crowd(view, S)[b];
      const ahead = others.some((o) => o.slot !== slot && !o.ground && o.x > P.x1 - 0.5 && o.x < P.x1 + PITCH && o.y > PLAT_Y - 0.5);
      if (ahead) F.since = Math.max(F.since, t - F.wait + 40);
      const left = g.until - t;
      if (t - F.since >= F.wait || left < (S.nr - next + 1) * 250) side = F.side;
    }
    if (side >= 0) Q = panelOf(S, panelIndex(S, b, next, side));
    // glass with a ball still on its near half, where this one would come down, or a crowd on it: wait for room
    if (Q && !mem.run) {
      const on = crowd(view, S)[b].filter((o) => o.slot !== slot && o.ground && o.x > Q.x0 && o.x < Q.x1 && o.z > Q.z0 - 0.5 && o.z < Q.z1 + 0.5);
      if (on.length >= 4 || on.some((o) => o.x < Q.x0 + LAND + 1.4)) Q = null;
    }
  }
  if (!Q) { mem.run = false; mem.T = null; return wait(view, S, P, b, x, z, vx, vz, slot); }
  // where to come down: LAND in from its near edge, across as near straight on as it can
  const T = [Q.x0 + LAND, clamp(z, Q.z0 + 0.9, Q.z1 - 0.9)];
  mem.T = T;
  // the run-up: RUN back from the edge, across as near the target as it may
  const run = Math.min(RUN, P.x1 - P.x0 - 1);
  const Sx = P.x1 - run, Sz = clamp(T[1], P.z0 + 1, P.z1 - 1);
  const sp = Math.hypot(vx, vz);
  if (!mem.run) {
    // from the spot, or up to 2.2 short of the edge's side of it (a ball on the spot sends it no further)
    if (x < Sx - 1 || x > Sx + 2.2 || Math.abs(z - Sz) > 1.2 || sp > 2.5) return goTo(Sx, Sz, x, z, vx, vz, 5);
    // one at a time: not while another ball on this glass is on the move or in the way to its edge,
    // nor while one is in the air over to the row it's going for
    const busy = crowd(view, S)[b].some((o) => {
      if (o.slot === slot) return false;
      if (!o.ground) return o.y > PLAT_Y - 0.5 && o.x > P.x1 - 2 && o.x < Q.x1;
      if (o.x < P.x0 - 0.5 || o.x > P.x1 + 0.5 || o.z < P.z0 - 0.5 || o.z > P.z1 + 0.5) return false;
      if (Math.hypot(o.vx, o.vz) > 2.5) return true;
      const k = clamp((o.x - x) / Math.max(0.1, T[0] - x), 0, 1);
      // ahead in its way; or alongside, the lower slot first
      return (o.x > x + 1 || (o.x > x - 1 && o.slot < slot)) && Math.abs(o.z - (z + (T[1] - z) * k)) < 2.2;
    });
    if (busy) return goTo(Sx, Sz, x, z, vx, vz, 5);
    mem.run = true;
  }
  // the run: the push, of a fan of them, that rolled to the edge and hopped comes down nearest T, on the glass all the way
  const a = planRun(g, P, Q, T, x, z, vx, vz);
  const ux = Math.cos(a), uz = Math.sin(a);
  const [lx, lz] = landing(g, x, z, vx, vz, ux, uz);
  const inside = (m, far = Q.x1 - m) => lx > Q.x0 + m && lx < far && lz > Q.z0 + m * 0.55 && lz < Q.z1 - m * 0.55;
  const edge = P.x1 - x < 0.35 || z < P.z0 + 0.25 || z > P.z1 - 0.25;
  if (inside(0.9, Math.min(Q.x1 - 0.7, Q.x0 + LAND + 2.5)) || (edge && inside(0.05))) { mem.run = false; return { yaw: a, move: 1, hop: 1 }; }
  // at the edge with no hop that comes down well on it: one that comes down on it at all, else brake
  if (edge) { mem.run = false; return lx > Q.x0 && lx < Q.x1 ? { yaw: a, move: 1, hop: 1 } : { yaw: Math.atan2(-vz, -vx), move: 1 }; }
  return { yaw: a, move: 1 };
}
// The heading of the push for a run from (x, z) at (vx, vz) on P: of FAN, the one that keeps it on P to
// its edge and, hopping there, comes down nearest T (short or long of Q's window counting double).
const FAN = [0, 0.14, -0.14, 0.28, -0.28, 0.42, -0.42, 0.56, -0.56, 0.7, -0.7];
function planRun(g, P, Q, T, x, z, vx, vz) {
  let best = 0, err = Infinity;
  for (const a of FAN) {
    const ux = Math.cos(a), uz = Math.sin(a);
    let px = x, pz = z, pvx = vx, pvz = vz, ok = true;
    for (let n = 0; n < 160 && px < P.x1 - 0.35; n++) {
      pvx = ux * ACC * g.acc + pvx * g.drag; pvz = uz * ACC * g.acc + pvz * g.drag;
      px += pvx * TICK; pz += pvz * TICK;
      if (pz < P.z0 + 0.3 || pz > P.z1 - 0.3) { ok = false; break; }
    }
    if (!ok) continue;
    const [lx, lz] = landing(g, px, pz, pvx, pvz, ux, uz);
    const e = Math.abs(lz - T[1]) + 2 * Math.max(0, Q.x0 + 0.9 - lx) + 2 * Math.max(0, lx - Q.x1 + 0.7) + 0.05 * Math.abs(a);
    if (e < err) { err = e; best = a; }
  }
  return best;
}
// Steer to (tx, tz), arriving slow: the velocity wanted, and the keys toward what's missing (none when it's there).
function goTo(tx, tz, x, z, vx, vz, vmax) {
  const dx = tx - x, dz = tz - z, d = Math.hypot(dx, dz);
  const v = Math.min(vmax, 2.2 * d);
  const wx = d > 1e-6 ? (dx / d) * v - vx : -vx, wz = d > 1e-6 ? (dz / d) * v - vz : -vz;
  if (Math.hypot(wx, wz) < 0.6) return { yaw: Math.atan2(vz, vx), move: 0 };
  return { yaw: Math.atan2(wz, wx), move: 1 };
}
// Waiting: past where the next ball comes down and behind the run-up to the edge, spread out by slot, room
// kept from the rest.
function wait(view, S, P, b, x, z, vx, vz, slot) {
  const lanes = Math.max(1, Math.floor((P.z1 - P.z0 - 0.2) / 2.15));
  const back = P.x0 + (P.x1 - P.x0 > MC.GB_LP ? 1 : LAND + 1.4); // the deck's back, or past where a panel's next ball lands
  const rows = P.x1 - RUN - 4.4 >= back ? 2 : 1;
  let tx = P.x1 - RUN - 2.2 - ((slot % rows) * 2.2), tz = P.z0 + (P.z1 - P.z0) * ((((slot >> 1) % lanes) + 0.5) / lanes);
  for (const o of crowd(view, S)[b]) {
    if (o.slot === slot) continue;
    const ox = x - o.x, oz = z - o.z, od = Math.hypot(ox, oz);
    if (od < ROOM && od > 1e-6) { tx += (ox / od) * (ROOM - od); tz += (oz / od) * (ROOM - od); }
  }
  return goTo(clamp(tx, back, P.x1 - RUN - 1.6), clamp(tz, P.z0 + 1, P.z1 - 1), x, z, vx, vz, 3);
}

export default {
  id: L.MG_GLASS, key: 'glass', name: 'GLASS BRIDGE',
  hint: 'HOP PANEL TO PANEL  OF EACH PAIR ONE HOLDS AND ONE SHATTERS',
  rules: 'FIRST ACROSS WINS  THE REST BY THE ROW THEY GOT TO',
  env: 'sunset',
  ownScore: true,
  outForGood: true,

  draw(view, ctx, out) {
    const S = stage(view);
    if (!S) return;
    const sc = out.scene;
    // on the prediction's clock, with its own cracks: glass goes as your own ball drops through it
    const now = ctx.ptick ?? ctx.tick + (ctx.dt ?? 0) / TICK;
    const mine = ctx.pme && ctx.pview ? ownCracks(ctx.pview) : null;
    const zl = S.zl - MC.GB_EDGE, zr = S.zr + MC.GB_EDGE;
    // the decks: wood to start from, a hazard strip on its lip; a chequered finish and its line
    sc.box(S.x0 - MC.GB_DS / 2, PLAT_Y - 0.6, (zl + zr) / 2, MC.GB_DS / 2, 0.6, (zr - zl) / 2, 0, DECK[0], DECK[1], DECK[2], LOOK.WOOD);
    sc.box(S.x0 - 0.2, PLAT_Y + 0.01, (zl + zr) / 2, 0.2, 0.01, (zr - zl) / 2, 0, 1, 0.8, 0.1, LOOK.HAZARD, 0.5);
    sc.box(S.fx + MC.GB_DF / 2, PLAT_Y - 0.6, (zl + zr) / 2, MC.GB_DF / 2, 0.6, (zr - zl) / 2, 0, 0.85, 0.85, 0.85, LOOK.CHECKER, 1, 0.2);
    sc.box(S.fx + 0.3, PLAT_Y + 0.02, (zl + zr) / 2, 0.3, 0.02, (zr - zl) / 2, 0, 0.3, 1, 0.5, LOOK.GLOW, 1.2, 0.5);
    for (let b = 0; b < S.nb; b++) {
      const [z0, z1, zm] = bridgeZ(S, b);
      // the rails along either side, a cross tie under every row's ends
      for (const zz of [z0 - 0.2, z1 + 0.2]) sc.box((S.x0 + S.fx) / 2, PLAT_Y - 0.3, zz, (S.fx - S.x0) / 2, 0.22, 0.16, 0, STEEL[0], STEEL[1], STEEL[2], LOOK.METAL);
      for (let k = 0; k <= S.nr; k++) {
        const xt = S.x0 + MC.GB_G / 2 + k * PITCH;
        sc.box(xt, PLAT_Y - 0.36, zm, 0.12, 0.12, (z1 - z0) / 2 + 0.3, 0, STEEL[0] * 0.8, STEEL[1] * 0.8, STEEL[2] * 0.8, LOOK.METAL);
      }
      for (let k = 0; k < S.nr; k++) for (let s = 0; s < 2; s++) {
        const c = panelIndex(S, b, k, s);
        let v = cellOf(view, c);
        if (v === 1 && mine?.size) v = mine.get(c) ?? 1;
        const p = panelOf(S, c);
        if (v === 1 || v === 2) {
          sc.box(p.cx, PLAT_Y - HH, p.cz, MC.GB_LP / 2 - 0.04, HH, MC.GB_WP / 2 - 0.04, 0, GLASS[0], GLASS[1], GLASS[2], LOOK.ICE, 0, v === 2 ? 0.22 : 0.02, 0.85, c);
          continue;
        }
        if (now < v) {
          // cracked: lines at once, spreading, whitening, sinking a little and trembling as it gives
          const k2 = Math.min(1, Math.max(0, 0.3 + 0.7 * (now - (v - MC.GB_HOLD)) / MC.GB_HOLD));
          const shake = 0.03 * k2 * Math.sin(now * 2.3 + c * 5);
          const w = k2 * 0.4;
          sc.box(p.cx + shake, PLAT_Y - HH - 0.05 * k2, p.cz, MC.GB_LP / 2 - 0.04, HH, MC.GB_WP / 2 - 0.04, 0,
            GLASS[0] + (1 - GLASS[0]) * w, GLASS[1] + (1 - GLASS[1]) * w, GLASS[2] + (1 - GLASS[2]) * w, LOOK.ICE, k2, 0.1, 0.9, c);
          continue;
        }
        // gone: six shards falling, tumbling, fading
        const fall = (now - v) * TICK;
        if (fall >= FALL) continue;
        for (let i = 0; i < 6; i++) {
          const sx = p.x0 + MC.GB_LP * (((i % 3) + 0.5) / 3), sz = p.z0 + MC.GB_WP * (((i >> 1 & 1) * 0.5 + (i < 3 ? 0.25 : 0.5)));
          const spin = fall * (2 + ((c * 7 + i * 3) % 5)) * (i & 1 ? 1 : -1);
          sc.box(sx + (sx - p.cx) * fall * 0.6, PLAT_Y - HH - 10 * fall * fall - fall * (i % 2), sz + (sz - p.cz) * fall * 0.6,
            MC.GB_LP / 7, HH, MC.GB_WP / 6, spin, 0.9, 0.97, 0.97, LOOK.ICE, 1, 0, 1 - fall / FALL, c * 8 + i, spin * 0.7);
        }
      }
    }
  },

  frame(view) {
    const S = stage(view), g = view.party();
    if (!S) return { centre: [g.cx, PLAT_Y, g.cx], radius: g.size, shape: 'square' };
    return { centre: [(S.x0 - MC.GB_DS + S.fx + MC.GB_DF) / 2, PLAT_Y, (S.zl + S.zr) / 2], radius: g.size, shape: 'square' };
  },

  // a new round faces you down the bridges
  facing() { return 0; },

  fx(f, ctx) {
    const d = typeof ctx.dist === 'function' ? ctx.dist(f.pos) : ctx.dist ?? 0;
    const mine = f.owner === ctx.slot;
    if (f.kind === MC.GB_FX_CRACK) {
      if (mine || d < 30) for (let i = 0; i < 3; i++) ctx.sound?.crackle?.(mine ? 1.6 : Math.min(1.2, 10 / (d + 8)));
      if (mine) ctx.banner?.('IT CRACKS!', C.RED, 900);
      for (let i = 0; i < 5; i++) {
        const a = i * 1.2566 + f.shot;
        ctx.glow?.({ pos: [f.pos[0] + Math.cos(a) * 1.4, f.pos[1] + 0.1, f.pos[2] + Math.sin(a) * 1.2], size: 0.7, color: [0.9, 1, 1, 0.8], kind: SPRITE.SPARK, life: 300 });
      }
    } else if (f.kind === MC.GB_FX_DROP) {
      // the shards are draw's: a burst of glitter and the smash
      if (d < 60) ctx.sound?.blast?.(d, 3);
      if (d < 30) for (let i = 0; i < 4; i++) ctx.sound?.crackle?.(Math.min(1.4, 12 / (d + 8)));
      for (let i = 0; i < 8; i++) {
        const a = i * 0.785 + f.shot * 0.3;
        ctx.glow?.({ pos: [f.pos[0] + Math.cos(a) * 2, f.pos[1] - 0.3 - (i & 1), f.pos[2] + Math.sin(a) * 1.6], size: 0.5 + 0.2 * (i % 3), color: [0.85, 1, 1, 0.9], kind: SPRITE.SPARK, life: 600 });
      }
      ctx.glow?.({ pos: [f.pos[0], f.pos[1], f.pos[2]], size: 3, color: [0.8, 1, 1, 0.35], kind: SPRITE.FLASH, life: 300, grow: true });
    } else if (f.kind === MC.GB_FX_SAFE) {
      if (mine) { ctx.banner?.('TEMPERED!', C.GREEN, 900); ctx.sound?.pickup?.(); } else if (d < 25) ctx.sound?.tick?.();
      ctx.glow?.({ pos: [f.pos[0], f.pos[1] + 0.05, f.pos[2]], size: 2.6, color: [0.5, 1, 0.7, 0.5], kind: SPRITE.RING, life: 500, grow: true });
    } else if (f.kind === MC.GB_FX_HOME) {
      const place = f.shot;
      if (mine) { ctx.banner?.(`ACROSS ${ordinal(place)}!`, place === 1 ? C.YELLOW : C.GREEN, 3000); ctx.sound?.holed?.(); }
      else if (place === 1) { ctx.banner?.(`${ctx.name?.(f.owner) ?? `P${f.owner + 1}`} IS ACROSS FIRST`, C.YELLOW, 2500); ctx.sound?.count?.(0); }
      else ctx.feed?.(`${ctx.name?.(f.owner) ?? `P${f.owner + 1}`} ACROSS ${ordinal(place)}`, C.WHITE);
      for (let i = 0; i < 6; i++) {
        const a = i * 1.047 + f.owner;
        ctx.glow?.({ pos: [f.pos[0] + Math.cos(a) * 1.5, f.pos[1] + 2 + (i & 1), f.pos[2] + Math.sin(a) * 1.5], size: 0.9, color: [[1, 0.85, 0.2], [0.4, 1, 0.6], [0.7, 1, 1]][i % 3].concat(1), kind: SPRITE.SPARK, life: 700 });
      }
    }
  },

  // the feed's line for a fall: from which row
  sink(f, name, view) {
    const m = view?.partier(f.owner).m ?? 0;
    const row = rowOf(m);
    const by = f.shot !== 255 && f.shot !== f.owner ? ` PUSHED BY ${name(f.shot)}` : '';
    return row > 0 ? `${name(f.owner)} FELL AT ROW ${row}${by}` : `${name(f.owner)} FELL${by}`;
  },

  // Where you stand (rows 0 and 1, which ownScore leaves to it): the row
  // you're on and your place as the end would give it, or home; what's known
  // of the next row; how many are across.
  hud(view, ctx) {
    const S = stage(view), g = view.party();
    if (!S || g.state !== L.H_PLAY) return;
    const list = standings(view);
    const me = ctx.me ?? (ctx.slot >= 0 ? view.partier(ctx.slot) : null);
    const mine = me?.live ? list.find((e) => e.slot === me.slot) : null;
    if (mine) {
      if (mine.home) {
        ctx.put(1, 0, `ACROSS ${ordinal(mine.order)} OF ${list.length}`, C.GREEN);
        ctx.put(1, 1, mine.order === 1 ? 'YOU MADE IT FIRST' : 'WAIT FOR THE REST', C.GREY);
      } else {
        ctx.put(1, 0, mine.fell ? `FELL AT ROW ${mine.row}` : mine.row ? `ROW ${mine.row} OF ${S.nr}` : `${S.nr} ROWS TO CROSS`, mine.fell ? C.RED : C.WHITE);
        ctx.put(1, 1, `${ordinal(mine.rank)} OF ${list.length}`, mine.rank === 1 ? C.YELLOW : C.GREY);
        if (!mine.fell) {
          const b = bridgeNear(S, me.pos[2]);
          const next = mine.row;
          if (next >= S.nr) ctx.right(2, 'HOP TO THE FINISH', C.GREEN);
          else {
            const side = known(view, S, b, next);
            ctx.right(2, side < 0 ? `ROW ${next + 1}: NOBODY KNOWS` : `ROW ${next + 1}: THE ${side ? 'RIGHT' : 'LEFT'} HOLDS`, side < 0 ? C.ORANGE : C.CYAN);
          }
        }
      }
    } else if (list[0]) ctx.put(1, 0, list[0].home ? `P${list[0].slot + 1} WON IT` : `LEADER P${list[0].slot + 1}`, C.WHITE);
    const home = list.filter((e) => e.home).length;
    if (home) ctx.right(3, `${home} OF ${list.length} ACROSS`, C.CYAN);
  },

  brain: {
    // at (x, z) on tick t: nothing under it, a fall; glass nobody knows, a gamble; known glass and the decks, fine
    danger(view, x, z, tick) {
      const S = stage(view);
      if (!S) return 0;
      const c = supportAt(S, x, z);
      if (c === -1) return 1;
      if (c < 0) return 0;
      const v = cellOf(view, c);
      if (!holds(v, tick)) return 1;
      if (v > 2) return 0.9;
      if (v === 2) return 0;
      const p = panelOf(S, c);
      return known(view, S, p.b, p.k) === p.s ? 0 : 0.6;
    },
    goal(view, me, bot) { return bot?.mem?.T ?? null; },
    hop() { return false; },
    think,
  },
};
