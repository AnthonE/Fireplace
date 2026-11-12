// ROUND UP, as drawn and as the AI ball sees it. A meadow fenced off on a
// grassy island, the wooden fence rounded at the corners; behind each end a
// pen railed in its side's colour, its mouth a gap in the end fence between
// two tall posts, the ground about the mouth tinted where the other side is
// rolled away, a flag behind it. A
// sheep is a woolly body on four dark legs with a dark head, facing the way
// it runs and bobbing as it does; a ram is bigger, golden, with horns. Loose
// ones are drawn on from the confirmed tick by their velocity; a penned one
// walks from the mouth to its place in the pen's rows. A ram's coming is a
// pulsing ring in the middle from its call. A bark is a ring spreading from
// the barker (yours as predicted). The pens' scores are the HUD's.
import * as L from '../../src/layout.mjs';
import * as MC from '../../src/mg/herd.mjs'; // HD_*: the minigame's own constants
import { PLAT_Y, SIDES } from '../../src/party-view.mjs';
import { LOOK, SPRITE, SHAPE, DECAL } from '../party-render.mjs';
import { C } from '../font.mjs';
import { world } from '../party-world.mjs';

const TICK = 0.008;
const HH = 0.5; // the floor's half height, m
const GRASS = [0.4, 0.64, 0.28];
const FENCE = [0.62, 0.45, 0.3];
const WOOL = [0.96, 0.95, 0.9];
const FACE = [0.16, 0.14, 0.14];
const GOLD = [1, 0.76, 0.18];
const STRAW = [0.88, 0.74, 0.4];
const MARGIN = 9; // m of grass round the fence
const WALK = 60; // ticks a penned sheep takes from the mouth to its place
const f = Math.fround;
const mix = (a, b, k) => a.map((v, i) => v * (1 - k) + b[i] * k);
const wrap = (a) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

// ---- what the sim keeps, read

// The meadow on the view's bank.
export function meadow(view) {
  const dv = view.dv, o = view.bank || 0, h = (k) => dv.getFloat32(L.PG_H + k + o, true);
  return { hx: h(MC.HD_HX), hz: h(MC.HD_HZ), cr: h(MC.HD_CR), pw: h(MC.HD_PW), pd: h(MC.HD_PD), gw: h(MC.HD_GW), ar: h(MC.HD_AR), fr: h(MC.HD_FR),
    ns: dv.getUint32(L.PG_H + MC.HD_NS + o, true), nr: dv.getUint32(L.PG_H + MC.HD_NR + o, true), left: dv.getUint32(L.PG_H + MC.HD_LEFT + o, true), cx: dv.getFloat32(L.PG_CX + o, true) };
}
// Side s's way from the middle to its own pen, and its mouth's middle, world [x, z].
export const dir = (s) => (s ? 1 : -1);
export const mouthAt = (c, s) => [f(f(dir(s) * c.hx) + c.cx), c.cx];
// The flock (PG_S, the confirmed world's), the rams still to come included:
// { k, st, side, v, by, at, j, x, z, vx, vz }.
export function flock(view) {
  const dv = view.dv, u8 = view.u8, out = [];
  const n = Math.min(MC.HD_NMAX, dv.getUint32(L.PG_H + MC.HD_NS, true)) + Math.min(MC.HD_NRAM, dv.getUint32(L.PG_H + MC.HD_NR, true));
  for (let k = 0; k < n; k++) {
    const a = L.PG_S + k * MC.HD_SSIZE;
    out.push({ k, st: u8[a + MC.HD_ST], side: u8[a + MC.HD_SSIDE], v: u8[a + MC.HD_SV], by: u8[a + MC.HD_SBY], at: dv.getUint32(a + MC.HD_SAT, true) | 0, j: dv.getUint16(a + MC.HD_SJ, true),
      x: dv.getFloat32(a + MC.HD_SX, true), z: dv.getFloat32(a + MC.HD_SZ, true), vx: dv.getFloat32(a + MC.HD_SVX, true), vz: dv.getFloat32(a + MC.HD_SVZ, true) });
  }
  return out;
}
// The tick into play slot p last barked on, plus 1 (its PG_M's top half, on the view's bank); 0 never.
export const barked = (view, p) => view.dv.getUint32(L.PLAYERS + (view.bank || 0) + p * L.PSIZE + L.PG_M, true) >>> 16;
const sideOf = (view, p) => (view.u8[L.PLAYERS + (view.bank || 0) + p * L.PSIZE + L.P_FL] & L.PF_BLUE ? 1 : 0);

// Where the j-th sheep penned stands in side s's pen, world [x, z]: rows
// across it from the back, spaced for the whole flock (1.3 m at most).
export function place(c, s, j) {
  const w = 2 * c.pw - 1.6, d = c.pd - 1.6;
  const sp = Math.min(1.3, Math.sqrt((w * d) / (c.ns + c.nr)));
  const cols = Math.max(1, Math.floor(w / sp) + 1), rows = Math.max(1, Math.floor(d / sp) + 1);
  const row = Math.floor(j / cols) % rows, col = j % cols;
  return [c.cx + dir(s) * (c.hx + c.pd - 0.8 - row * sp), c.cx + (col - (cols - 1) / 2) * sp];
}

// Ticks into play to draw at (fractional; the prediction's clock if given), -1 before play; frozen where the round ended.
function playTime(g, ctx) {
  if (g.state !== L.H_PLAY && g.state !== L.H_OVER) return -1;
  let t = typeof ctx?.pt === 'number' && ctx.pt > 0 ? ctx.pt / TICK : g.t + (ctx?.dt || 0) / TICK;
  if (g.state === L.H_OVER) t = Math.min(t, (g.until - L.P_OVER - g.start) | 0);
  return Math.max(0, t);
}

// The fence's line: points round the rounded rectangle about every `step` m, [x, z] world, in order, closed.
function fenceLine(c, step) {
  const pts = [], o = 0.15, hx = c.hx + o, hz = c.hz + o, cr = c.cr + o, ix = c.hx - c.cr, iz = c.hz - c.cr;
  const run = (x0, z0, x1, z1) => { const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / step)); for (let i = 0; i < n; i++) pts.push([x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n]); };
  const arc = (ox, oz, a0, a1) => { const n = Math.max(2, Math.round(cr * Math.PI / 2 / step)); for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([ox + Math.cos(a) * cr, oz + Math.sin(a) * cr]); } };
  const H = Math.PI / 2;
  run(ix, -hz, -ix, -hz); arc(-ix, -iz, -H, -2 * H);
  run(-hx, -iz, -hx, iz); arc(-ix, iz, 2 * H, H);
  run(-ix, hz, ix, hz); arc(ix, iz, H, 0);
  run(hx, iz, hx, -iz); arc(ix, -iz, 0, -H);
  return pts.map(([x, z]) => [c.cx + x, c.cx + z]);
}

// A run of fence from (x0, z0) to (x1, z1): a post about every `step` m (and one at each end) and two rails between.
function rails(sc, x0, z0, x1, z1, step, col, seed) {
  const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / step));
  const yaw = Math.atan2(z1 - z0, x1 - x0), len = Math.hypot(x1 - x0, z1 - z0) / 2;
  for (let i = 0; i <= n; i++) sc.cyl(x0 + (x1 - x0) * i / n, PLAT_Y + MC.HD_FENCE_H / 2 + 0.1, z0 + (z1 - z0) * i / n, 0.13, MC.HD_FENCE_H / 2 + 0.18, ...col, LOOK.WOOD, 0, 0, 1, seed + i);
  for (const y of [0.45, 0.95]) sc.box((x0 + x1) / 2, PLAT_Y + y * MC.HD_FENCE_H, (z0 + z1) / 2, len, 0.07, 0.05, yaw, ...col, LOOK.WOOD, 0, 0, 1, seed);
}

// the way each sheep faces as drawn (radians), kept from frame to frame: a
// sheep standing still keeps the way it last ran. Cleared each round.
const faces = { round: -1, yaw: new Float32Array(MC.HD_NMAX + MC.HD_NRAM) };

// A sheep at (x, z), its feet on y, facing yaw, s its size (a ram's 1.25), hop how high it is off the ground.
function sheep(out, x, y, z, yaw, s, ram, k) {
  const sc = out.scene, cs = Math.cos(yaw), sn = Math.sin(yaw);
  const at = (fw, up, sd) => [x + (cs * fw - sn * sd) * s, y + up * s, z + (sn * fw + cs * sd) * s];
  const wool = ram ? GOLD : WOOL, look = ram ? LOOK.METAL : LOOK.MATTE;
  sc.put(SHAPE.SPHERE, ...at(0, 0.66, 0), 0.66 * s, 0.46 * s, 0.5 * s, yaw, ...wool, look, 0, 0, 1, k);
  sc.put(SHAPE.SPHERE, ...at(0.68, 0.78, 0), 0.27 * s, 0.24 * s, 0.22 * s, yaw, ...FACE, LOOK.PLASTIC, 0, 0, 1, k);
  sc.put(SHAPE.SPHERE, ...at(0.5, 1.02, 0), 0.2 * s, 0.15 * s, 0.24 * s, yaw, ...wool, look, 0, 0, 1, k);
  for (const fw of [-0.34, 0.34]) for (const sd of [-0.24, 0.24]) sc.cyl(...at(fw, 0.16, sd), 0.07 * s, 0.17 * s, ...FACE, LOOK.PLASTIC, 0, 0, 1, k);
  if (ram) for (const sd of [-0.27, 0.27]) sc.put(SHAPE.SPHERE, ...at(0.55, 0.95, sd), 0.16 * s, 0.16 * s, 0.1 * s, yaw, 0.82, 0.62, 0.2, LOOK.PLASTIC, 0, 0, 1, k);
  out.casters.push([x, y + 0.6 * s, z, -0.6 * s]);
}

// ---- the AI ball

// Where a ball of side s wants a sheep to go: through its mouth, a little way in.
const aimAt = (c, s) => [c.cx + dir(s) * (c.hx + 1.5), c.cx];

// What every AI ball looking at one world tick shares: the meadow, the
// loose sheep, each side's balls in (client/party-world.mjs's, in slot
// order) and the jobs. In a side of four or more, an eighth (one at least)
// are thieves (from its place in the side, turned each round): each is sent
// for the loose sheep nearest the other side's mouth that a foe is driving
// and no thief has yet. Then the sheep, but those a foe is driving in the
// last third before its own mouth (a thief's, or lost: a side that sends a
// ball for each of those walls the other's mouth off, and so does the
// other), the rams first and then the nearest to the side's own mouth, each
// to the nearest ball of the side with none. A ball left over joins the push
// on the nearest sheep on its own half within 25 m (where its side is the
// nearer, it brings the more); with none it blocks: it is sent at the
// nearest foe driving a sheep (within its sight of one), to bump it off its
// line; with no such foe, after the nearest sheep.
function worldOf(view) {
  const o = view.bank || 0;
  const w0 = view._hd;
  if (w0 && w0.tick === view.tick && w0.bank === o) return w0;
  const dv = view.dv;
  const c = meadow(view);
  const state = dv.getUint32(L.HDR_STATE + o, true);
  const round = dv.getUint32(L.HDR_HOLE + o, true);
  const loose = state === L.H_PLAY ? flock(view).filter((e) => e.st === MC.HD_LOOSE) : [];
  const side = state === L.H_PLAY ? world(view).sides : [[], []];
  const job = new Map(); // slot -> { e: the loose sheep it is sent for, or null, foe: the ball it is sent at, or null }
  for (const s of [0, 1]) {
    const mine = side[s], m = mine.length;
    if (!m) continue;
    const [mx, mz] = mouthAt(c, s), [fx, fz] = mouthAt(c, 1 - s);
    const free = new Set(mine);
    const taken = new Set();
    const nearest = (e, list) => { let best = null, bd = Infinity; for (const b of list) { const d = Math.hypot(b.x - e.x, b.z - e.z); if (d < bd) { bd = d; best = b; } } return best; };
    const nt = m >= 4 ? Math.max(1, Math.floor(m / 8)) : 0;
    // the sheep a foe is driving, the nearest their mouth first
    const driven = loose.filter((e) => side[1 - s].some((b) => Math.hypot(b.x - e.x, b.z - e.z) < MC.HD_SCARE))
      .sort((a, b) => Math.hypot(a.x - fx, a.z - fz) - Math.hypot(b.x - fx, b.z - fz) || a.k - b.k);
    if (nt) {
      const thieves = mine.filter((b, i) => (i + round * 7) % m < nt);
      for (const e of driven) {
        if (!thieves.length) break;
        const b = nearest(e, thieves);
        thieves.splice(thieves.indexOf(b), 1);
        free.delete(b);
        taken.add(e.k);
        job.set(b.slot, { e, foe: null });
      }
    }
    // one driven deep in the other side's end is a thief's, or nobody's
    for (const e of driven) if ((e.x - c.cx) * dir(s) < -0.35 * c.hx) taken.add(e.k);
    const order = loose.filter((e) => !taken.has(e.k)).sort((a, b) => b.v - a.v || Math.hypot(a.x - mx, a.z - mz) - Math.hypot(b.x - mx, b.z - mz) || a.k - b.k);
    for (const e of order) {
      if (!free.size) break;
      const b = nearest(e, free);
      free.delete(b);
      job.set(b.slot, { e, foe: null });
    }
    if (!free.size) continue;
    const drivers = side[1 - s].filter((b) => loose.some((e) => Math.hypot(b.x - e.x, b.z - e.z) < MC.HD_SCARE + 1));
    const ours = loose.filter((e) => (e.x - c.cx) * dir(s) > 0);
    for (const b of free) {
      const e = ours.length ? nearest(b, ours) : null;
      if (e && Math.hypot(b.x - e.x, b.z - e.z) < 25) job.set(b.slot, { e, foe: null });
      else job.set(b.slot, drivers.length ? { e: null, foe: nearest(b, drivers) } : { e: loose.length ? nearest(b, loose) : null, foe: null });
    }
  }
  view._hd = { tick: view.tick, bank: o, c, state, round, loose, side, job };
  return view._hd;
}

// Where a ball at (px, pz) of side s goes to drive sheep e: the spot behind
// it on the line from where it wants it, STAND m off; from the wrong side,
// round the sheep outside its sight, a step of the way at a time.
const STAND = 3, ROUND = MC.HD_SCARE + 1;
function driveTo(c, s, e, px, pz, lead = 0.2) {
  const ex = e.x + e.vx * lead, ez = e.z + e.vz * lead;
  const [ax, az] = aimAt(c, s);
  const back = Math.atan2(ez - az, ex - ax);
  const at = Math.atan2(pz - ez, px - ex), d = Math.hypot(px - ex, pz - ez);
  const off = wrap(back - at);
  const far = e.v > 1 ? STAND + 1 : STAND;
  if (Math.abs(off) < 0.6) return [ex + Math.cos(back) * far, ez + Math.sin(back) * far];
  const a = at + Math.max(-1, Math.min(1, off)), r = Math.max(ROUND + (e.v > 1 ? 1 : 0), Math.min(d, ROUND + 3));
  return [ex + Math.cos(a) * r, ez + Math.sin(a) * r];
}

export default {
  id: L.MG_HERD, key: 'herd', name: 'ROUND UP',
  hint: 'GET BEHIND A SHEEP  DRIVE IT INTO YOUR PEN  CLICK TO BARK',
  rules: 'SHEEP RUN FROM EVERY BALL  A GOLDEN RAM IS 3  THE FULLER PEN WINS',
  env: 'day',

  draw(view, ctx, out) {
    const c = meadow(view);
    if (!(c.hx > 0)) return;
    const g = view.party();
    const sc = out.scene, cx = c.cx;
    const now = (ctx?.now ?? 0) / 1000;
    // the island's grass, one solid so no seam crosses the meadow
    sc.box(cx, PLAT_Y - HH, cx, c.hx + c.pd + MARGIN, HH, c.hz + MARGIN, 0, ...GRASS, LOOK.MATTE, 0, 0, 1, 7);
    // the fence: a post about every 2.4 m and two rails between, open at each end's mouth
    const line = fenceLine(c, 2.4);
    for (let i = 0; i < line.length; i++) {
      const [x0, z0] = line[i], [x1, z1] = line[(i + 1) % line.length];
      if (Math.abs(x0 - cx) > c.hx && Math.abs(x1 - cx) > c.hx && Math.min(Math.abs(z0 - cx), Math.abs(z1 - cx)) < c.gw - 0.3) continue;
      sc.cyl(x0, PLAT_Y + MC.HD_FENCE_H / 2, z0, 0.11, MC.HD_FENCE_H / 2 + 0.08, ...FENCE, LOOK.WOOD, 0, 0, 1, i);
      const len = Math.hypot(x1 - x0, z1 - z0) / 2, yaw = Math.atan2(z1 - z0, x1 - x0);
      for (const y of [0.45, 0.95]) sc.box((x0 + x1) / 2, PLAT_Y + y * MC.HD_FENCE_H, (z0 + z1) / 2, len + 0.06, 0.06, 0.04, yaw, ...FENCE, LOOK.WOOD, 0, 0, 1, i);
    }
    // hay bales outside, by the corners
    for (let i = 0; i < 6; i++) {
      const e = i & 1 ? 1 : -1, z = i & 2 ? 1 : -1;
      sc.cyl(cx + e * (c.hx - 4 - (i >> 2) * 3), PLAT_Y + 0.6, cx + z * (c.hz + 2.5 + (i >> 2) * 1.6), 0.6, 0.75, ...STRAW, LOOK.MATTE, 0, 0, 1, 20 + i, Math.PI / 2, Math.PI / 2);
    }
    // the pens: straw on the floor, rails in the side's colour, the mouth's ground tinted, a flag behind
    for (const s of [0, 1]) {
      const d = dir(s), col = SIDES[s].color, tint = mix(FENCE, col, 0.75);
      const xf = cx + d * (c.hx + 0.15), xb = cx + d * (c.hx + c.pd);
      sc.box((xf + xb) / 2, PLAT_Y + 0.02, cx, c.pd / 2, 0.02, c.pw, 0, ...mix(STRAW, col, 0.25), LOOK.MATTE, 0, 0, 1, 30 + s);
      rails(sc, xb, cx - c.pw, xb, cx + c.pw, 1.8, tint, 100 + s * 40);
      for (const e of [-1, 1]) {
        rails(sc, xf, cx + e * c.pw, xb, cx + e * c.pw, 1.8, tint, 40 + s * 40 + (e + 1) * 10);
        rails(sc, xf, cx + e * c.gw, xf, cx + e * c.pw, 1.8, tint, 60 + s * 40 + (e + 1) * 10);
        // the mouth's posts, taller, capped in the side's colour
        sc.cyl(xf, PLAT_Y + 1.1, cx + e * c.gw, 0.17, 1.1, ...tint, LOOK.WOOD, 0, 0, 1, 70 + s);
        sc.sphere(xf, PLAT_Y + 2.3, cx + e * c.gw, 0.24, ...col, LOOK.PLASTIC);
      }
      out.decals.push({ pos: [xf, PLAT_Y + 0.03, cx], radius: c.ar, color: [...col, 0.22], kind: DECAL.DISC });
      out.decals.push({ pos: [xf, PLAT_Y + 0.035, cx], radius: c.ar, width: 0.18, color: [...col, 0.7], kind: DECAL.RING });
      const fx = xb + d * 1.3;
      sc.cyl(fx, PLAT_Y + 2.2, cx, 0.07, 2.2, 0.85, 0.85, 0.88, LOOK.METAL);
      sc.box(fx - d * 0.62, PLAT_Y + 3.95, cx, 0.6, 0.4, 0.03, 0, ...col, LOOK.PLASTIC);
    }
    if (g.state !== L.H_PLAY && g.state !== L.H_OVER && g.state !== L.H_COUNT) return;
    const list = flock(view);
    const tp = playTime(g, ctx);
    const dt = g.state === L.H_PLAY ? ctx?.dt || 0 : 0;
    if (faces.round !== g.round) { faces.round = g.round; faces.yaw.fill(NaN); }
    for (const e of list) {
      const ram = e.v > 1, s = ram ? 1.25 : 1;
      if (e.st === MC.HD_LOOSE) {
        const sp = Math.hypot(e.vx, e.vz);
        let yaw = faces.yaw[e.k];
        // a sheep not yet seen faces out from the middle of the flock; one running turns to where it runs
        if (Number.isNaN(yaw)) yaw = Math.atan2(e.z - cx, e.x - cx) + e.k;
        if (sp > 0.4) yaw += wrap(Math.atan2(e.vz, e.vx) - yaw) * Math.min(1, 0.25 + sp * 0.05);
        faces.yaw[e.k] = yaw;
        const hop = Math.abs(Math.sin(now * 11 + e.k)) * Math.min(0.22, sp * 0.04);
        sheep(out, e.x + e.vx * dt, PLAT_Y + hop, e.z + e.vz * dt, yaw, s, ram, e.k);
        if (ram) out.glow.push({ pos: [e.x + e.vx * dt, PLAT_Y + 1, e.z + e.vz * dt], size: 1.6, color: [1, 0.85, 0.3, 0.22 + 0.08 * Math.sin(now * 5)], kind: SPRITE.FLASH, minpx: 1 });
      } else if (e.st === MC.HD_PENNED) {
        // from where it came through the mouth to its place, then standing, turned to the meadow
        const [qx, qz] = place(c, e.side, e.j);
        const u = tp >= 0 ? Math.max(0, Math.min(1, (tp - e.at) / WALK)) : 1, k = u * u * (3 - 2 * u);
        const yaw = u < 1 ? Math.atan2(qz - e.z, qx - e.x) : (e.side ? Math.PI : 0) + Math.sin(e.k * 2.4) * 0.5;
        sheep(out, e.x + (qx - e.x) * k, PLAT_Y + (u < 1 ? Math.abs(Math.sin(u * 9)) * 0.15 : 0), e.z + (qz - e.z) * k, yaw, s, ram, e.k);
      } else if (e.st === MC.HD_CALLED && tp >= 0) {
        // a ram called: its ring in the middle, closing as it comes
        const left = Math.max(0, e.at - tp) / MC.HD_RAMW, pulse = 0.5 + 0.5 * Math.sin(now * 9);
        out.decals.push({ pos: [cx, PLAT_Y + 0.04, cx], radius: 1.2 + 2 * left + 0.25 * pulse, width: 0.3, color: [...GOLD, 0.5 + 0.4 * (1 - left)], kind: DECAL.RING });
      }
    }
    // the barks: a ring out from each barker, yours from the prediction
    if (tp < 0) return;
    const slot = ctx?.slot ?? -1;
    const mine = ctx?.pme && !ctx.pme.out ? ctx.pme : null;
    for (let p = 0; p < L.NPLAYER; p++) {
      const own = mine && p === slot;
      const last = own ? mine.m >>> 16 : barked(view, p);
      if (!last) continue;
      const age = tp + 1 - last;
      if (age < 0 || age >= MC.HD_BARKT * 1.5) continue;
      const a = L.PLAYERS + p * L.PSIZE;
      if (!own && (view.u8[a + L.P_FL] & (L.PF_LIVE | L.PF_DEAD)) !== L.PF_LIVE) continue;
      const pos = own && ctx.own ? ctx.own : [0, 1, 2].map((i) => view.dv.getFloat32(a + L.P_PX + 4 * i, true) + view.dv.getFloat32(a + L.P_VX + 4 * i, true) * dt);
      const u = Math.min(1, age / (MC.HD_BARKT * 0.6)), col = SIDES[sideOf(view, p)].color;
      out.decals.push({ pos: [pos[0], PLAT_Y + 0.05, pos[2]], radius: 1 + (MC.HD_SCARE * MC.HD_BARKK - 1) * u, width: 0.35, color: [...mix(col, [1, 1, 1], 0.5), 0.85 * (1 - age / (MC.HD_BARKT * 1.5))], kind: DECAL.RING });
    }
  },

  // the whole meadow
  frame(view) {
    const c = meadow(view), g = view.party();
    const cx = c.cx || g.cx;
    return { centre: [cx, PLAT_Y, cx], radius: (c.hx > 0 ? c.hx : g.size) + 1, shape: 'square' };
  },

  // the countdown turns you to the flock
  facing(view, slot) {
    return sideOf(view, slot) ? Math.PI : 0;
  },

  fx(fx, ctx) {
    const d = typeof ctx.dist === 'function' ? ctx.dist(fx.pos) : ctx.dist ?? 0;
    const name = (p) => (ctx.name ? ctx.name(p) : `P${p + 1}`);
    const me = ctx.slot, mySide = ctx.view && me >= 0 ? sideOf(ctx.view, me) : -1;
    if (fx.kind === MC.HD_FX_PEN) {
      const s = (fx.shot >> 8) & 1, ram = fx.shot & 512;
      ctx.glow?.({ pos: [fx.pos[0], fx.pos[1] + 0.6, fx.pos[2]], size: ram ? 6 : 3.5, color: [...(ram ? GOLD : SIDES[s].color), 0.9], kind: SPRITE.RING, life: 500, grow: true });
      if (fx.owner === me) { ctx.banner?.(ram ? 'GOLDEN RAM PENNED  +3' : 'PENNED!', ram ? C.YELLOW : C.GREEN, 900); ctx.sound?.holed?.(); }
      else if (d < 40) ctx.sound?.land?.(10);
      if (ram) ctx.feed?.(fx.owner < 255 ? `${name(fx.owner)} PENNED A GOLDEN RAM FOR ${SIDES[s].name}` : `A GOLDEN RAM RAN INTO ${SIDES[s].name}'S PEN`, mySide === s ? C.GREEN : mySide === 1 - s ? C.RED : C.YELLOW);
    } else if (fx.kind === MC.HD_FX_RAM) {
      if (fx.shot & 256) {
        ctx.glow?.({ pos: [fx.pos[0], fx.pos[1] + 0.8, fx.pos[2]], size: 5, color: [...GOLD, 0.9], kind: SPRITE.RING, life: 600, grow: true });
        if (d < 80) ctx.sound?.pickup?.();
      } else { ctx.banner?.('A GOLDEN RAM IS COMING  TO THE MIDDLE', C.YELLOW, 1800); ctx.sound?.count?.(1); }
    } else if (fx.kind === MC.HD_FX_BARK) {
      if (fx.owner === me || d < 30) ctx.sound?.boing?.(14, fx.owner === me ? 0 : d);
    }
  },

  // the sheep still loose and the next ram; what you drove in; your bark
  hud(view, ctx) {
    const g = view.party();
    if (g.state !== L.H_PLAY) return;
    const c = meadow(view);
    if (!(c.hx > 0)) return;
    const list = flock(view);
    const loose = list.filter((e) => e.st === MC.HD_LOOSE).length;
    const next = list.find((e) => e.st === MC.HD_NONE || e.st === MC.HD_CALLED);
    ctx.right(3, `LOOSE SHEEP ${loose}${next && next.at < g.len ? `  GOLDEN RAM IN ${Math.max(0, Math.ceil((next.at - g.t) * TICK))}` : ''}`, C.GREY);
    const me = ctx.me ?? (ctx.slot >= 0 ? view.partier(ctx.slot) : null);
    if (!me || !me.live || me.out) return;
    const last = me.m >>> 16, wait = last ? MC.HD_BARKCD - (g.t + 1 - last) : 0;
    ctx.right(4, `YOU DROVE IN ${me.score}  ${wait > 0 ? `BARK IN ${(wait * TICK).toFixed(1)}` : 'BARK READY'}`, wait > 0 ? C.GREY : C.WHITE);
  },

  brain: {
    // the ground about the other side's mouth rolls you away
    danger(view, x, z, tick, me) {
      if (!me) return 0;
      const w = worldOf(view);
      if (w.state !== L.H_PLAY) return 0;
      const [mx, mz] = mouthAt(w.c, 1 - me.side);
      return Math.hypot(x - mx, z - mz) < w.c.ar + 0.5 ? 0.5 : 0;
    },
    // behind the sheep it is sent for; with none loose, out in front of its own mouth
    goal(view, me, bot) {
      const w = worldOf(view);
      if (w.state !== L.H_PLAY || !me) return null;
      const j = w.job.get(me.slot), e = j?.e;
      if (j?.foe) return [j.foe.x, j.foe.z];
      if (!e) return [w.c.cx + dir(me.side) * (w.c.hx - 8), w.c.cx];
      return driveTo(w.c, me.side, e, bot?.pos?.[0] ?? me.pos[0], bot?.pos?.[1] ?? me.pos[2]);
    },
    hop() { return false; },
    // a blocker's charge: at where its foe will be when it gets there, flat out.
    // A bark, its wait over, from behind its sheep: within 20 m of home, where it runs the faster for it,
    // or anywhere a foe has it too, to pull the harder
    think(view, me, bot, tick = view.tick) {
      const w = worldOf(view);
      if (w.state !== L.H_PLAY || !me || !me.live || me.out) return null;
      const j = w.job.get(me.slot), e = j?.e;
      if (j?.foe) {
        const x = bot?.pos?.[0] ?? me.pos[0], z = bot?.pos?.[1] ?? me.pos[2], b = j.foe;
        const lag = Math.max(0, Math.min(60, (tick - view.tick) | 0)) * TICK;
        const tt = lag + Math.min(1, Math.hypot(b.x - x, b.z - z) / 11);
        return { yaw: Math.atan2(b.z + b.vz * tt - z, b.x + b.vx * tt - x), move: 1 };
      }
      if (!e) return null;
      const last = me.m >>> 16;
      if (last && tick - view.party().start + 1 - last < MC.HD_BARKCD + 8) return null;
      const px = bot?.pos?.[0] ?? me.pos[0], pz = bot?.pos?.[1] ?? me.pos[2];
      const [ax, az] = aimAt(w.c, me.side);
      const d = Math.hypot(px - e.x, pz - e.z), home = Math.hypot(ax - e.x, az - e.z);
      if (d > 4.5 || home < 2) return null;
      const pulled = w.side[1 - me.side].some((b) => Math.hypot(b.x - e.x, b.z - e.z) < MC.HD_SCARE);
      if (!pulled && home > 20) return null;
      const on = ((e.x - px) * (ax - e.x) + (e.z - pz) * (az - e.z)) / ((d || 1) * home);
      if (on < (pulled ? 0.7 : 0.9) || (bot?.rand && bot.rand() > 0.3 + 0.5 * (bot.skill ?? 0.6))) return null;
      return { use: true };
    },
  },
};
