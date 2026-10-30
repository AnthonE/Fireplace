import test from 'node:test';
import assert from 'node:assert/strict';
import { arenaBytes } from './helpers.mjs';
import { View, arenaWord, arenaFrame, forcedSeed } from '../src/arena-view.mjs';
import { aimAt } from '../client/bot.mjs';
import { Fighter } from '../client/arena-bot.mjs';
import { playArena } from '../tools/genarena.mjs';
import { replay, parseLog, decodeTrace, newMemory, instantiate, Sim } from '../harness/core.mjs';
import { startWorkers } from '../harness/run-node.mjs';
import * as L from '../src/layout.mjs';
import * as AC from '../src/am/consts.mjs';
import es, { escapeOf, termsOf, exitsOf, stateOf, TERMINAL } from '../client/am/escape.mjs';
import { AMC, newsOf } from '../client/am/index.mjs';
import { C } from '../client/font.mjs';

// ESCAPE (src/am/escape.wat): one hunter against the room. The hunter is
// PF_JUGG; its swing downs (both PF_DOWN bits, Evade's), a survivor's shove
// stuns it (PF_DOWN on it too); terminals in AO, hacked by survivors holding
// still; enough hacked, the exits open. Helpers as test/arena-evade.test.mjs
// has them.

let debugModule = null;
async function room(n = 2, { seed = 7, mode = L.M_ESCAPE, park: parked = true, play = true } = {}) {
  debugModule ||= await WebAssembly.compile(arenaBytes(true));
  const memory = newMemory();
  const sim = new Sim(await instantiate(debugModule, memory), memory);
  sim.init(mode === null ? seed : forcedSeed(mode, seed));
  const v = new View(sim.memory.buffer);
  const dv = new DataView(sim.memory.buffer);
  const step = (recs = []) => { sim.feedPlayers(recs); sim.x.step(); };
  const g = { sim, v, dv, step, n };
  step(Array.from({ length: n }, (_, p) => [L.EV_JOIN, p]));
  if (parked) for (let p = 0; p < n; p++) park(g, p);
  if (!play) return g;
  while (v.hole().state !== L.H_PLAY) step();
  step();
  return g;
}

const rec = (p) => L.PLAYERS + p * L.PSIZE;
const mr = (p) => L.MODE_REC + p * L.MR_SIZE;
const fl = (g, p) => g.sim.u8[rec(p) + L.P_FL];
const u32 = (g, a) => g.dv.getUint32(a, true);
const down = (g, p) => (fl(g, p) & L.PF_DOWN) === L.PF_DOWN;
const out = (g, p) => g.v.fighter(p).dead;
const time = (g, p) => g.dv.getUint16(mr(p) + AC.ES_MR_TIME, true);
const help = (g, p) => g.dv.getUint16(L.AO + AC.ES_HELP + 2 * p, true);
const points = (g, p) => g.dv.getUint16(mr(p) + L.MR_POINTS, true);
const aux = (g, p) => g.dv.getUint16(mr(p) + L.MR_AUX, true);
const steps = (g, n) => { for (let i = 0; i < n; i++) g.step(); };
const across = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const hunters = (g) => Array.from({ length: L.NPLAYER }, (_, p) => p).filter((p) => g.v.fighter(p).live && g.v.fighter(p).jugg);
const term = (k) => L.AO + AC.ES_T + k * AC.ES_TSIZE;
const prog = (g, k) => g.dv.getUint16(term(k) + AC.ES_T_PROG, true);

function put(g, p, x, z, y = g.v.stand(x, z, g.v.height(x, z) + 0.5)) {
  g.dv.setFloat32(rec(p) + L.P_PX, x, true);
  g.dv.setFloat32(rec(p) + L.P_PY, y, true);
  g.dv.setFloat32(rec(p) + L.P_PZ, z, true);
  for (const o of [L.P_VX, L.P_VY, L.P_VZ]) g.dv.setFloat32(rec(p) + o, 0, true);
  g.sim.u8[rec(p) + L.P_FL] |= L.PF_GROUND;
}
// Slot p's place on open ground mid-field, 3 m from the next.
const park = (g, p) => put(g, p, 491 + 3 * (p % 8), 528 + 3 * (p >> 3));
// Everyone but `keep` far off, in the canyon's south-east, a row 3 m apart.
const away = (g, keep = []) => { for (let p = 0; p < g.n; p++) if (!keep.includes(p)) put(g, p, 600 + 3 * (p % 8), 580 - 3 * (p >> 3)); };

// A word that presses nothing new: the counters and bits as p last took them.
const still = (g, p) => { const f = g.v.fighter(p); return { shot: f.fired, melee: f.act & L.AB_MELEE, gren: (f.act >> 1) & 1 }; };
const word = (g, p, rest = {}) => arenaWord({ ...still(g, p), ...rest });
// Slot a faces slot b and swings (its melee bit flipped), its cooldowns run out.
function swing(g, a, b) {
  const f = g.v.fighter(a), t = g.v.fighter(b);
  g.dv.setUint16(rec(a) + L.A_COOL, 0, true);
  g.dv.setUint16(rec(a) + L.P_REFIRE, 0, true);
  const { yaw, pitch } = aimAt([f.pos[0], f.pos[1] + 1.6, f.pos[2]], [t.pos[0], t.pos[1] + 1.1, t.pos[2]]);
  g.step([[L.EV_INPUT, a, word(g, a, { yaw, pitch, melee: (still(g, a).melee ? 0 : 1) })]]);
}
// Hunter h downs survivor s from 2 m off (the rest far off).
function downOn(g, h, s) {
  const p = g.v.fighter(s).pos;
  put(g, h, p[0] - 2, p[2], p[1]);
  swing(g, h, s);
  g.step([[L.EV_INPUT, h, word(g, h)]]);
  assert.ok(down(g, s), `P${s} downed`);
}

// FX of a kind (and size) from the running count `from` on, at most the ring's last FX_MAX
function fxs(v, kind, size, from = 0) {
  const outs = [];
  for (let k = Math.max(from, v.fxCount() - L.FX_MAX); k < v.fxCount(); k++) {
    const f = v.fx(k);
    if (f.kind === kind && (size === undefined || f.size === size)) outs.push(f);
  }
  return outs;
}
// Escape's news from `from` on: [what, owner, shot]
const news = (g, from) => fxs(g.v, L.FX_MODE, undefined, from).filter((f) => f.size >= AC.ES_MX_DOWN && f.size <= AC.ES_MX_HUNT).map((f) => [f.size, f.owner, f.shot]);

// Predicts slot p through `inputs` from every tick (1 ahead, and 6 and 30 every
// 7th) and compares each with the confirmed world when it gets there.
function predicted(g, p, inputs) {
  const due = new Map();
  let compared = 0;
  const at0 = rec(p), atP = rec(p) + L.PRED_D;
  for (let k = 0; k < inputs.length; k++) {
    for (const n of [1, 6, 30]) {
      if ((k % 7 !== 0 && n !== 1) || k + n > inputs.length) continue;
      for (let i = 0; i < n; i++) g.dv.setUint32(L.PWORDS + 4 * i, inputs[k + i], true);
      g.sim.x.predict(p, n);
      const list = due.get(k + n) || [];
      list.push({ n, from: k, player: g.sim.u8.slice(atP, atP + L.PSIZE) });
      due.set(k + n, list);
    }
    g.step([[L.EV_INPUT, p, inputs[k]]]);
    for (const d of due.get(k + 1) || []) {
      assert.deepEqual(d.player, g.sim.u8.slice(at0, at0 + L.PSIZE), `predicted ${d.n} from ${d.from}`);
      compared++;
    }
  }
  return compared;
}

// The map's spots the sim lays terminals on, as $es_lay reads them: hills, the flags, the skull's, the pads; each at its feet height; one of any ES_APART.
function spots(v) {
  const dv = v.dv, out = [];
  const nh = dv.getUint32(L.MAP_NHILL, true), np = dv.getUint32(L.MAP_NPAD, true);
  const at = (a) => { const x = dv.getFloat32(a, true), z = dv.getFloat32(a + 4, true); return [x, v.stand(x, z, dv.getFloat32(a + 8, true)), z]; };
  const all = [];
  for (let k = 0; k < nh; k++) all.push(at(L.MAP_HILLS + 16 * k));
  for (let k = 0; k < 3; k++) all.push(at(L.MAP_FLAGS + 16 * k));
  for (let k = 0; k < np; k++) all.push(at(L.MAP_PADS + 16 * k));
  for (const s of all) if (!out.some((o) => across(o, s) < Number(AC.ES_APART) && Math.abs(o[1] - s[1]) < Number(AC.ES_APART_H))) out.push(s);
  return out;
}

test('Escape: on the kit with no sides; nothing of it before play; as play starts one hunter for every ES_PER fighters (rounded, at least one, never the last), PF_JUGG with the sword, at the spawn point farthest from everyone; the rest no guns, no frags; news', async () => {
  assert.ok((L.KIT >> L.M_ESCAPE) & 1 && !((L.TEAMED >> L.M_ESCAPE) & 1) && (L.TEAM_MODES >> L.M_ESCAPE) & 1);
  assert.deepEqual([L.MODES[L.M_ESCAPE].name, L.MODES[L.M_ESCAPE].ticks, L.ARENA_MODES.at(-1)], ['ESCAPE', 30000, L.M_ESCAPE]);
  assert.equal(AC.ES_MX_DOWN, L.MX_AM + 8 * L.AM.findIndex((m) => m.mode === L.M_ESCAPE), 'its news codes are its own');
  assert.equal(AC.ES_RATE.length, 4);
  assert.ok(AC.ES_T + AC.ES_TMAX * AC.ES_TSIZE <= AC.ES_HELP && AC.ES_HELP + 2 * L.NPLAYER <= L.AO_SIZE, 'AO holds it');
  const g = await room(4, { play: false });
  while (g.v.hole().state !== L.H_PLAY) {
    assert.ok(g.sim.u8.slice(L.AO, L.AO + L.AO_SIZE).every((x) => x === 0), 'the countdown');
    for (let p = 0; p < 4; p++) { const f = g.v.fighter(p); assert.deepEqual([f.gun, f.grens, f.jugg], [[0, 0], 0, false], 'nobody armed'); }
    g.step();
  }
  // the tick play starts: one hunter, moved to the spawn point farthest from the other three
  const hs = hunters(g);
  assert.equal(hs.length, 1);
  const h = hs[0], others = [0, 1, 2, 3].filter((p) => p !== h);
  const far = g.v.map().spawns.reduce((b, s) => {
    const d = Math.min(...others.map((p) => (g.v.fighter(p).pos[0] - s[0]) ** 2 + (g.v.fighter(p).pos[2] - s[2]) ** 2));
    return d > b.d ? { d, s } : b;
  }, { d: -1 }).s;
  const H = g.v.fighter(h);
  assert.ok(across(H.pos, far) < 1e-4 && Math.abs(H.pos[1] - far[1]) < 1e-4, 'at the farthest spawn point');
  assert.deepEqual([H.gun, H.grens, H.team, H.vel], [[L.W_SWORD, L.W_SWORD], 0, -1, [0, 0, 0]]);
  assert.deepEqual(news(g, 0), [[AC.ES_MX_HUNT, h, h]]);
  for (const p of others) {
    assert.deepEqual([g.v.fighter(p).gun, g.v.fighter(p).grens, g.v.ally(p, h), g.v.ally(p, others.find((q) => q !== p))], [[0, 0], 0, false, true]);
  }
  const e = escapeOf(g.v);
  assert.deepEqual([e.hunters, e.up, e.in, e.down, e.out, e.free, e.terminals, e.need, e.open, e.end], [1, 3, 3, 0, 0, 0, AC.ES_TMIN, 2, 0, 0]);
  // how many: rounded, at least one; a fighter alone is no hunter
  for (const [n, want] of [[1, 0], [2, 1], [8, 1], [20, 1], [21, 2], [64, 5]]) {
    const r = await room(n, { park: false });
    assert.equal(hunters(r).length, want, `${n} fighters`);
    assert.equal(escapeOf(r.v).up, n - want);
  }
});

test('the terminals: the map\'s spots (hills, flags, the skull\'s, pads, at their feet height), one of any ES_APART; one for every ES_TPER survivors, ES_TMIN at least, as many as there are spots at most; the first drawn, each next the farthest from those before; ES_NEED is two in three', async () => {
  const g = await room(2);
  const all = spots(g.v);
  assert.ok(all.length >= 12 && all.length <= AC.ES_TMAX, `${all.length} spots`);
  for (const [n, want] of [[2, 3], [10, 3], [16, 5], [40, 13], [64, Math.min(all.length, 20)], [100, all.length]]) {
    const r = await room(n, { park: false });
    const ts = termsOf(r.v);
    const e = escapeOf(r.v);
    assert.equal(ts.length, want, `${n} fighters: ${e.in} survivors`);
    assert.equal(e.need, Math.floor((2 * want + 2) / 3));
    // each on a spot, no two the same
    for (const t of ts) assert.ok(all.some((s) => across(s, t.pos) < 1e-3 && Math.abs(s[1] - t.pos[1]) < 1e-3), `on a spot: ${t.pos}`);
    assert.equal(new Set(ts.map((t) => t.pos.join())).size, ts.length);
    // each after the first the farthest from those before it (a metre up or down three across)
    const d2 = (a, b) => (a[0] - b[0]) ** 2 + (3 * (a[1] - b[1])) ** 2 + (a[2] - b[2]) ** 2;
    for (let k = 1; k < ts.length; k++) {
      const md = (s) => Math.min(...ts.slice(0, k).map((t) => d2(t.pos, s)));
      const left = all.filter((s) => !ts.slice(0, k).some((t) => d2(t.pos, s) < 1e-6));
      assert.ok(left.every((s) => md(s) <= md(ts[k].pos) + 1e-3), `${n}: terminal ${k} the farthest`);
    }
    assert.ok(ts.every((t) => !t.done));
    // the room left past them is zero
    assert.ok(r.sim.u8.slice(term(ts.length), term(AC.ES_TMAX)).every((x) => x === 0));
  }
  // another seed, another first
  const first = async (seed) => termsOf((await room(16, { park: false, seed })).v)[0].pos;
  const a = await first(1), b = await first(2), c = await first(3);
  assert.ok(new Set([a, b, c].map((x) => x.join())).size > 1, 'the first is drawn');
});

test('hacking: a survivor still (under ES_STILL) within ES_TERM_R across and ES_TERM_H up or down; ES_RATE quarter ticks a tick for one, two, three or more; done at 4 ES_HACK to the tick (the lowest slot of its crew named); the crew counted afresh every tick; nobody moving, down or hunting hacks; one terminal a survivor', async () => {
  const g = await room(6);
  const h = hunters(g)[0];
  const s = [0, 1, 2, 3, 4, 5].filter((p) => p !== h);
  away(g);
  const [t0, t1] = termsOf(g.v);
  // one hacker: 4 a tick, its ticks hacking counted
  put(g, s[0], t0.pos[0] + 1.9, t0.pos[2], t0.pos[1]);
  g.step();
  assert.deepEqual([prog(g, 0), termsOf(g.v)[0].crew, aux(g, s[0])], [4, 1, 1]);
  // off by ES_TERM_R across, or moving: nothing
  put(g, s[0], t0.pos[0] + 2.05, t0.pos[2], t0.pos[1]);
  g.step();
  assert.deepEqual([prog(g, 0), termsOf(g.v)[0].crew], [4, 0]);
  put(g, s[0], t0.pos[0] + 1, t0.pos[2], t0.pos[1]);
  g.dv.setFloat32(rec(s[0]) + L.P_VX, 1.2, true);
  g.step();
  assert.equal(prog(g, 0), 4);
  // two, three, four: 6, 7, 7
  for (const [k, want] of [[2, 6], [3, 7], [4, 7]]) {
    away(g);
    for (let i = 0; i < k; i++) put(g, s[i], t0.pos[0] + Math.cos(i * 1.6), t0.pos[2] + Math.sin(i * 1.6), t0.pos[1]);
    const was = prog(g, 0);
    g.step();
    assert.deepEqual([prog(g, 0) - was, termsOf(g.v)[0].crew], [want, k], `${k} hacking`);
  }
  // a survivor by two terminals at once hacks only the first; the hunter and the downed don't hack
  away(g);
  put(g, h, t1.pos[0] + 1, t1.pos[2], t1.pos[1]);
  put(g, s[0], t1.pos[0] - 1, t1.pos[2], t1.pos[1]);
  downOn(g, h, s[0]);
  put(g, h, t1.pos[0] + 1, t1.pos[2], t1.pos[1]);
  const p1 = prog(g, 1);
  steps(g, 3);
  assert.deepEqual([prog(g, 1), termsOf(g.v)[1].crew], [p1, 0], 'neither the hunter nor the downed');
  // to the tick: done at 4 ES_HACK, news, the lowest slot named
  const k0 = g.v.fxCount();
  away(g, [s[0]]);
  put(g, h, 640, 440);
  g.dv.setUint16(term(0) + AC.ES_T_PROG, 4 * AC.ES_HACK - 12, true);
  put(g, s[2], t0.pos[0] + 1, t0.pos[2], t0.pos[1]);
  put(g, s[1], t0.pos[0] - 1, t0.pos[2], t0.pos[1]);
  g.step();
  assert.deepEqual([prog(g, 0), termsOf(g.v)[0].done], [4 * AC.ES_HACK - 6, false]);
  g.step();
  assert.deepEqual([prog(g, 0), termsOf(g.v)[0].done, escapeOf(g.v).hacked], [4 * AC.ES_HACK, true, 1]);
  assert.deepEqual(news(g, k0), [[AC.ES_MX_HACK, Math.min(s[1], s[2]), 0]]);
  const a2 = aux(g, s[1]);
  g.step();
  assert.deepEqual([prog(g, 0), aux(g, s[1]), termsOf(g.v)[0].crew], [4 * AC.ES_HACK, a2, 0], 'nothing more once done');
  // solo, from nothing to done: ES_HACK ticks
  const r = await room(2);
  const rs = 1 - hunters(r)[0];
  put(r, 1 - rs, 640, 440);
  const rt = termsOf(r.v)[0];
  put(r, rs, rt.pos[0] + 1, rt.pos[2], rt.pos[1]);
  let n = 0;
  while (!termsOf(r.v)[0].done) { r.step(); n++; }
  assert.equal(n, AC.ES_HACK);
});

test('the exits: ES_NEED hacked opens them that tick (two ground spawn points, the first drawn, the second the farthest from it), news; ES_LATE before the clock they open hacked or not (in Fireplace\'s 90 s too, 30 s in); a survivor up within ES_EXIT_R escapes, in order, out of play; not the downed, not the hunter', async () => {
  const g = await room(5);
  const h = hunters(g)[0];
  const s = [0, 1, 2, 3, 4].filter((p) => p !== h);
  away(g);
  const need = escapeOf(g.v).need;
  for (let k = 0; k < need - 1; k++) { g.dv.setUint16(term(k) + AC.ES_T_PROG, 4 * AC.ES_HACK, true); g.sim.u8[term(k) + AC.ES_T_DONE] = 1; }
  g.dv.setUint32(L.AO + AC.ES_HACKED, need - 1, true);
  g.step();
  assert.deepEqual([escapeOf(g.v).open, exitsOf(g.v)], [0, []]);
  const t = termsOf(g.v)[need - 1];
  g.dv.setUint16(term(need - 1) + AC.ES_T_PROG, 4 * AC.ES_HACK - 1, true);
  put(g, s[0], t.pos[0] + 1, t.pos[2], t.pos[1]);
  const k0 = g.v.fxCount();
  g.step();
  assert.equal(escapeOf(g.v).open, 1, 'open on the tick');
  const ex = exitsOf(g.v);
  const sp = g.v.map().spawns;
  const ground = sp.filter((p) => p[1] < g.v.height(p[0], p[2]) + 1);
  assert.ok(ground.length >= 8 && ground.length < sp.length, 'roofs left out');
  for (const x of ex) assert.ok(ground.some((p) => across(p, x) < 1e-4 && Math.abs(p[1] - x[1]) < 1e-4), 'a ground spawn point');
  assert.equal(across(ex[0], ex[1]), Math.max(...ground.map((p) => across(p, ex[0]))), 'the second the farthest from the first');
  assert.deepEqual(news(g, k0).slice(-1), [[AC.ES_MX_OPEN, 255, 1]]);
  assert.deepEqual(fxs(g.v, L.FX_MODE, AC.ES_MX_OPEN, k0)[0].pos, ex[0]);
  // escapes: a survivor within ES_EXIT_R, in order; the downed and the hunter don't
  const k1 = g.v.fxCount();
  put(g, s[1], ex[0][0] + 3.1, ex[0][2], ex[0][1]);
  put(g, h, ex[1][0] + 1, ex[1][2], ex[1][1]);
  g.step();
  assert.ok(!out(g, s[1]) && !out(g, h));
  put(g, s[1], ex[0][0] + 2.9, ex[0][2], ex[0][1]);
  put(g, s[2], ex[1][0] - 1, ex[1][2] + 1, ex[1][1]);
  g.dv.setFloat32(rec(s[2]) + L.P_VX, 8, true);
  g.step();
  assert.ok(out(g, s[1]) && out(g, s[2]) && !out(g, h));
  assert.deepEqual([s[1], s[2]].map((p) => [stateOf(g.v, p).state, stateOf(g.v, p).order, g.v.fighter(p).respawn]), [['free', 1, 0xffff], ['free', 2, 0xffff]]);
  assert.deepEqual(news(g, k1), [[AC.ES_MX_FREE, Math.min(s[1], s[2]), 1], [AC.ES_MX_FREE, Math.max(s[1], s[2]), 2]].sort((a, b) => a[1] - b[1]).map((x, i) => [x[0], x[1], i + 1]));
  put(g, h, 640, 440);
  put(g, s[3], 500, 500);
  downOn(g, h, s[3]);
  put(g, s[3], ex[0][0], ex[0][2], ex[0][1]);
  put(g, h, 640, 440);
  g.step();
  assert.ok(down(g, s[3]) && !out(g, s[3]), 'the downed stay');
  assert.deepEqual([escapeOf(g.v).free, escapeOf(g.v).escapes], [2, 2]);
  steps(g, 400);
  assert.ok(!g.v.fighter(s[1]).respawn === false && out(g, s[1]), 'never back while the match lasts');
  // at the clock less ES_LATE they open, hacked or not, with Fireplace's 90 s clock as with Escape's 4 min
  for (const len of [L.MODE_TICKS[L.M_ESCAPE], L.FP_ARENA_TICKS]) {
    const r = await room(3);
    const h0 = r.v.hole();
    r.dv.setUint32(L.HDR_UNTIL, h0.start + len, true);
    r.dv.setUint32(L.HDR_START, r.v.tick - (len - AC.ES_LATE - 2), true);
    r.dv.setUint32(L.HDR_UNTIL, r.v.tick + AC.ES_LATE + 2, true);
    r.step();
    assert.equal(escapeOf(r.v).open, 0, 'not a tick early');
    r.step();
    assert.equal(escapeOf(r.v).open, 0);
    r.step();
    assert.deepEqual([escapeOf(r.v).open, escapeOf(r.v).hacked, u32(r, L.HDR_UNTIL) - u32(r, L.HDR_TICK) <= AC.ES_LATE], [2, 0, true]);
    assert.ok(AC.ES_LATE < L.FP_ARENA_TICKS, 'the exits open inside Fireplace\'s cut, not at its start');
  }
});

test('the hunter\'s swing downs a survivor up (both PF_DOWN bits, ES_BLEED to bleed, the down counted, news); nothing hurts anybody: a swing on the downed, a shove, nothing else; the downed are nobody\'s to reach; a stunned hunter is down too', async () => {
  const g = await room(4);
  const h = hunters(g)[0];
  const [a, b, c] = [0, 1, 2, 3].filter((p) => p !== h);
  away(g);
  put(g, a, 500, 510);
  const k0 = g.v.fxCount();
  downOn(g, h, a);
  assert.deepEqual([fl(g, a) & L.PF_DOWN, time(g, a), help(g, a), aux(g, h), escapeOf(g.v).downs, escapeOf(g.v).down, escapeOf(g.v).up], [L.PF_DOWN, AC.ES_BLEED - 2, 0, 1, 1, 1, 2]);
  assert.deepEqual(news(g, k0), [[AC.ES_MX_DOWN, a, h]]);
  assert.deepEqual([g.v.fighter(a).hp, g.v.fighter(a).sh, g.v.fighter(a).deaths, g.v.fighter(h).kills, fxs(g.v, L.FX_KILL, undefined, k0).length, fxs(g.v, L.FX_HIT, undefined, k0).length], [100, 100, 0, 0, 0, 0]);
  // another swing at the downed one reaches nothing: no lunge, no news
  const k1 = g.v.fxCount();
  put(g, h, 498, 510);
  swing(g, h, a);
  assert.deepEqual([news(g, k1), g.v.fighter(h).vel[0]], [[], 0]);
  assert.ok(down(g, a) && !out(g, a));
  // a survivor's shove does no harm to the hunter, nor to another survivor
  put(g, b, 497, 510);
  g.step();
  swing(g, b, h);
  assert.deepEqual([g.v.fighter(h).hp, g.v.fighter(h).sh, fxs(g.v, L.FX_HIT, undefined, k1).length], [100, 100, 0]);
  put(g, c, 495, 510);
  g.dv.setUint16(mr(c) + AC.ES_MR_TIME, 0, true);
  swing(g, c, b);
  assert.deepEqual([g.v.fighter(b).hp, g.v.fighter(b).sh, down(g, b)], [100, 100, false]);
  // with the hunter stunned (PF_DOWN on it), a survivor's shove reaches nothing
  assert.ok(down(g, h) && g.v.fighter(h).jugg, 'P_FL holds both');
  const k2 = g.v.fxCount();
  put(g, c, 497.5, 510.5);
  g.dv.setUint16(mr(c) + AC.ES_MR_TIME, 0, true);
  swing(g, c, h);
  assert.deepEqual([news(g, k2), g.v.fighter(c).vel[0]], [[], 0]);
});

test('the shove: a survivor\'s melee on the hunter stuns it ES_STUN (it lies down and crawls, no swing), its shove then ES_COOL off; the hunter calm ES_CALM after, shoves doing nothing; a shove still cooling does nothing; news', async () => {
  const g = await room(4);
  const h = hunters(g)[0];
  const [a, b] = [0, 1, 2, 3].filter((p) => p !== h);
  away(g);
  put(g, h, 500, 510);
  put(g, a, 502, 510);
  const k0 = g.v.fxCount();
  swing(g, a, h);
  assert.ok(down(g, h), 'stunned');
  // (the stun and the cooldown each a tick down already: the shove lands before the mode's tick)
  assert.deepEqual([stateOf(g.v, h).stun, time(g, a), escapeOf(g.v).stuns, escapeOf(g.v).hunters], [AC.ES_STUN - 1, AC.ES_COOL - 1, 1, 1]);
  assert.deepEqual(news(g, k0), [[AC.ES_MX_STUN, a, h]]);
  // it crawls, and its swing does nothing
  const k1 = g.v.fxCount();
  put(g, b, 500, 512);
  let top = 0;
  for (let t = 0; t < 100; t++) {
    g.step([[L.EV_INPUT, h, word(g, h, { move: 1, melee: t & 1, shot: (t >> 1) & 3, jump: t & 1 })]]);
    top = Math.max(top, Math.hypot(g.v.fighter(h).vel[0], g.v.fighter(h).vel[2]));
  }
  assert.ok(top <= 1.25 * Number(AC.ED_CRAWL), `a crawl: ${top}`);
  assert.deepEqual([fxs(g.v, L.FX_MELEE, undefined, k1).length, down(g, b)], [0, false]);
  assert.equal(time(g, a), AC.ES_COOL - 101, 'the shove cools a tick at a time');
  // up at ES_STUN, calm ES_CALM
  steps(g, AC.ES_STUN - 102);
  assert.ok(down(g, h));
  g.step();
  assert.deepEqual([down(g, h), stateOf(g.v, h).stun, stateOf(g.v, h).calm], [false, 0, AC.ES_CALM]);
  // calm: b's shove does nothing; cooling: a's does nothing
  const k2 = g.v.fxCount();
  put(g, b, g.v.fighter(h).pos[0] + 2, g.v.fighter(h).pos[2]);
  swing(g, b, h);
  assert.deepEqual([down(g, h), time(g, b), news(g, k2)], [false, 0, []]);
  g.dv.setUint8(mr(h) + AC.ES_MR_CALM, 0);
  put(g, a, g.v.fighter(h).pos[0] + 2, g.v.fighter(h).pos[2]);
  swing(g, a, h);
  assert.deepEqual([down(g, h), news(g, k2)], [false, []]);
  // ready again: it stuns
  g.dv.setUint16(mr(a) + AC.ES_MR_TIME, 0, true);
  g.dv.setUint16(rec(a) + L.A_COOL, 0, true);
  swing(g, a, h);
  assert.ok(down(g, h));
});

test('revives and bleeding, as Evade\'s: a survivor still within ES_REACH for ES_REVIVE ticks, to the tick, its bleeding stopped while it lasts, the lowest slot\'s revive, the shove ready after; the hunter revives nobody; ES_BLEED downed it is out (PF_DEAD, a death, news)', async () => {
  const g = await room(5);
  const h = hunters(g)[0];
  const [a, b, c, d] = [0, 1, 2, 3, 4].filter((p) => p !== h);
  away(g);
  put(g, a, 500, 510);
  downOn(g, h, a);
  put(g, h, 640, 440);
  const p0 = g.v.fighter(a).pos;
  g.dv.setUint16(mr(b) + AC.ES_MR_TIME, 900, true);
  put(g, b, p0[0] + 1.9, p0[2], p0[1]);
  put(g, c, p0[0] - 1.5, p0[2], p0[1]);
  const b0 = time(g, a);
  const k0 = g.v.fxCount();
  for (let t = 1; t < AC.ES_REVIVE; t++) { g.step(); assert.deepEqual([help(g, a), time(g, a)], [t, b0], `tick ${t}`); }
  g.step();
  assert.ok(!down(g, a) && !out(g, a), 'up again');
  assert.deepEqual([help(g, a), time(g, a), points(g, Math.min(b, c)), points(g, Math.max(b, c)), escapeOf(g.v).ups], [0, 0, 1, 0, 1]);
  assert.deepEqual(news(g, k0), [[AC.ES_MX_UP, Math.min(b, c), a]]);
  // the hunter holding still by the downed revives nobody
  put(g, b, 560, 560); put(g, c, 570, 560);
  put(g, h, 500, 520);
  put(g, d, 500, 518);
  downOn(g, h, d);
  const q0 = g.v.fighter(d).pos;
  put(g, h, q0[0] + 1.5, q0[2], q0[1]);
  steps(g, 3);
  assert.equal(help(g, d), 0);
  // bleeding out on the tick
  put(g, h, 640, 440);
  g.dv.setUint16(mr(d) + AC.ES_MR_TIME, 2, true);
  const k1 = g.v.fxCount();
  g.step();
  assert.ok(down(g, d) && !out(g, d));
  g.step();
  assert.ok(out(g, d) && !down(g, d));
  assert.deepEqual([stateOf(g.v, d).state, g.v.fighter(d).respawn, g.v.fighter(d).deaths, escapeOf(g.v).out], ['out', 0xffff, 1, 1]);
  assert.deepEqual(news(g, k1), [[AC.ES_MX_OUT, d, d]]);
});

test('finishing: the hunter up and still within ES_REACH of a downed survivor for ES_FINISH ticks, to the tick, finishes it (out, the hunter\'s count, news); moving or stunned it starts over; the lowest slot first', async () => {
  const g = await room(4);
  const h = hunters(g)[0];
  const [a, b, c] = [0, 1, 2, 3].filter((p) => p !== h);
  away(g);
  put(g, a, 500, 510);
  downOn(g, h, a);
  const p0 = g.v.fighter(a).pos;
  put(g, h, p0[0] + 1.8, p0[2], p0[1]);
  for (let t = 1; t < 40; t++) { g.step(); assert.equal(stateOf(g.v, h).fin, t); }
  // a nudge: over again
  g.dv.setFloat32(rec(h) + L.P_VZ, 1.5, true);
  g.step();
  assert.equal(stateOf(g.v, h).fin, 0);
  put(g, h, p0[0] + 1.8, p0[2], p0[1]);
  for (let t = 1; t < 30; t++) g.step();
  assert.equal(stateOf(g.v, h).fin, 29);
  // stunned: over again
  put(g, b, p0[0] + 3.8, p0[2], p0[1]);
  swing(g, b, h);
  assert.deepEqual([down(g, h), stateOf(g.v, h).fin], [true, 0]);
  put(g, h, 640, 440);
  steps(g, AC.ES_STUN + 2);
  put(g, b, 560, 560);
  put(g, h, p0[0] + 1.8, p0[2], p0[1]);
  const k0 = g.v.fxCount();
  for (let t = 1; t < AC.ES_FINISH; t++) g.step();
  assert.ok(down(g, a) && !out(g, a));
  g.step();
  assert.ok(out(g, a));
  assert.deepEqual([stateOf(g.v, a).state, points(g, h), stateOf(g.v, h).fin, escapeOf(g.v).finished, g.v.fighter(a).deaths], ['out', 1, 0, 1, 1]);
  assert.deepEqual(news(g, k0), [[AC.ES_MX_OUT, a, h]]);
  // two downed in reach: the lower slot first
  const r = await room(4);
  const rh = hunters(r)[0];
  const [x, y] = [0, 1, 2, 3].filter((p) => p !== rh).slice(0, 2);
  away(r);
  put(r, x, 500, 510); downOn(r, rh, x);
  put(r, y, 500, 511); downOn(r, rh, y);
  put(r, rh, 501.5, 510.5);
  steps(r, AC.ES_FINISH);
  assert.deepEqual([out(r, x), out(r, y)], [true, false]);
});

test('the prediction bit for bit: a downed survivor\'s crawl (no jump, no swing), the hunter\'s legs and its swing that downs, and a stunned hunter\'s crawl', async () => {
  const mk = (n, f) => Array.from({ length: n }, (_, k) => f(k));
  // downed: a crawl
  const g = await room(3);
  const h = hunters(g)[0];
  const [a, b] = [0, 1, 2].filter((p) => p !== h);
  away(g);
  put(g, a, 500, 510);
  downOn(g, h, a);
  put(g, h, 640, 440);
  const crawl = mk(300, (k) => arenaWord({ yaw: 30 * k, pitch: 480, move: k < 120 ? 1 : 9, jump: k % 40 === 5 ? 1 : 0, shot: (k >> 3) & 3, melee: (k >> 5) & 1,
    serial: (arenaFrame({ lag: 4 }) >> ((g.v.tick + k) & 7)) & 1 }));
  assert.ok(predicted(g, a, crawl) > 300);
  assert.ok(down(g, a));
  // the hunter: running, jumping, and a swing that downs b
  const r = await room(3);
  const rh = hunters(r)[0];
  const [ra, rb] = [0, 1, 2].filter((p) => p !== rh);
  away(r);
  put(r, rh, 482, 510);
  put(r, ra, 600, 440);
  put(r, rb, 488, 510);
  const yawTo = aimAt([482, 0, 510], [488, 0, 510]).yaw;
  const run = mk(140, (k) => arenaWord({ yaw: yawTo, pitch: 512, move: 1, jump: k === 60 ? 1 : 0, melee: k >= 20 ? 1 : 0 }));
  assert.ok(predicted(r, rh, run) > 140);
  assert.ok(down(r, rb), 'downed on the way');
  // stunned: a crawl, inside its stun
  const s = await room(3);
  const sh = hunters(s)[0];
  const [sa] = [0, 1, 2].filter((p) => p !== sh);
  away(s);
  put(s, sh, 500, 510);
  put(s, sa, 502, 510);
  swing(s, sa, sh);
  assert.ok(down(s, sh));
  const stun = mk(AC.ES_STUN - 35, (k) => arenaWord({ yaw: 50 * k, move: k % 50 < 25 ? 1 : 6, jump: k % 9 === 0 ? 1 : 0, melee: (k >> 3) & 1, shot: (k >> 2) & 3 }));
  assert.ok(predicted(s, sh, stun) > 140);
  assert.ok(down(s, sh));
});

test('the end: nobody left in play ends it on that tick (ES_END 1); at the clock ES_END 2; places: the escaped by order, the hunter by finishes then downs, then survivors in play, then out, by revives then hacking; the board\'s order the same; a Fiesta after Escape is exactly a Fiesta\'s region', async () => {
  const g = await room(5);
  const h = hunters(g)[0];
  const [a, b, c, d] = [0, 1, 2, 3, 4].filter((p) => p !== h);
  away(g);
  // open the exits, b then a escape; c finished; d downed and bled out
  g.dv.setUint32(L.HDR_UNTIL, g.v.tick + AC.ES_LATE, true);
  g.step();
  const ex = exitsOf(g.v);
  put(g, b, ex[0][0], ex[0][2], ex[0][1]); g.step();
  put(g, a, ex[1][0], ex[1][2], ex[1][1]); g.step();
  g.dv.setUint32(L.HDR_UNTIL, g.v.tick + 20000, true);
  put(g, c, 500, 510); downOn(g, h, c);
  put(g, h, g.v.fighter(c).pos[0] + 1, g.v.fighter(c).pos[2], g.v.fighter(c).pos[1]);
  steps(g, AC.ES_FINISH + 1);
  assert.ok(out(g, c));
  g.dv.setUint16(mr(d) + L.MR_AUX, 4000, true);
  put(g, d, 520, 510); downOn(g, h, d);
  put(g, h, 640, 440);
  g.dv.setUint16(mr(d) + AC.ES_MR_TIME, 2, true);
  assert.equal(g.v.hole().state, L.H_PLAY);
  g.step();
  assert.equal(g.v.hole().state, L.H_PLAY);
  g.step();
  assert.equal(g.v.hole().state, L.H_OVER, 'over on the tick');
  assert.equal(escapeOf(g.v).end, 1);
  assert.deepEqual([b, a, h, d, c].map((p) => g.v.fighter(p).place), [1, 2, 3, 4, 5]);
  assert.equal(es.over(g.v), '2 ESCAPED');
  const order = [0, 1, 2, 3, 4].sort((p, q) => es.standing(g.v.fighter(q)) - es.standing(g.v.fighter(p)));
  assert.deepEqual(order, [b, a, h, d, c], 'the board as the places');
  // at the clock: in play first after the hunter; nobody escaped
  const r = await room(3);
  const rh = hunters(r)[0];
  const [x, y] = [0, 1, 2].filter((p) => p !== rh);
  away(r);
  r.dv.setUint16(mr(x) + L.MR_AUX, 100, true);
  r.dv.setUint16(mr(y) + L.MR_AUX, 900, true);
  put(r, y, 500, 510); downOn(r, rh, y);
  put(r, rh, 640, 440);
  r.dv.setUint32(L.HDR_UNTIL, r.v.tick + 1, true);
  steps(r, 2);
  assert.deepEqual([r.v.hole().state, escapeOf(r.v).end], [L.H_OVER, 2]);
  assert.deepEqual([rh, y, x].map((p) => r.v.fighter(p).place), [1, 2, 3], 'the hunter, then the downed with more hacking');
  assert.equal(es.over(r.v), 'THE HUNTER GOT EVERYONE');
  // the next match a Fiesta (the seed no longer forcing Escape; the rotation's first): its region exactly a Fiesta's
  r.dv.setUint32(L.HDR_SEED, 7, true);
  r.dv.setUint32(L.HDR_HOLE, L.ARENA_MODES.length - 1, true);
  while (r.v.hole().state !== L.H_PLAY) r.step();
  r.step();
  assert.equal(r.v.mode().mode, L.M_FIESTA);
  const zero = (a0, b0) => r.sim.u8.slice(a0, b0).every((v) => v === 0);
  assert.ok(zero(L.AH_MODE, L.AH_END), 'the header');
  assert.ok(zero(L.AO, L.AO + L.AO_SIZE), 'the terminals');
  assert.ok(zero(L.MODE_REC, L.MODE_REC + L.NPLAYER * L.MR_SIZE), 'the records');
  if (L.FIESTA) assert.ok(zero(L.PAD, L.PAD + L.NPAD * L.PAD_SIZE), 'the pads');
  for (const p of [0, 1, 2]) {
    const f = r.v.fighter(p);
    assert.ok(f.live && !f.dead && !f.down && (fl(r, p) & (L.PF_BLUE | L.PF_CARRY | L.PF_JUGG | L.PF_ZOMBIE | L.PF_FAST)) === 0 && f.grens === 2 && f.gun[0] !== 0, `P${p} as anyone's`);
  }
});

test('joins and leaves mid-match: a join comes in a survivor, unarmed, at a spawn point no hunter is within ES_BAR of; the hunter leaving, another is drawn from those up, at the farthest spawn point; a downed survivor leaving, its slot comes back up', async () => {
  const g = await room(3);
  const h = hunters(g)[0];
  const spawns = g.v.map().spawns;
  put(g, h, spawns[0][0], spawns[0][2], spawns[0][1]);
  const free = spawns.filter((s) => across(s, spawns[0]) >= Number(AC.ES_BAR));
  assert.ok(free.length > 0 && free.length < spawns.length);
  for (let n = 0; n < 6; n++) {
    g.step([[L.EV_JOIN, 3]]);
    const f = g.v.fighter(3);
    assert.ok(f.live && !f.down && !f.dead && !f.jugg);
    assert.ok(free.some((s) => across(s, f.pos) < 0.01), 'away from the hunter');
    assert.deepEqual([f.gun, f.grens], [[0, 0], 0]);
    g.step([[L.EV_LEAVE, 3]]);
    g.step();
  }
  // a downed survivor leaves; its slot comes back up, nothing of the down left
  const [a, b] = [0, 1, 2].filter((p) => p !== h);
  put(g, a, 500, 510);
  downOn(g, h, a);
  g.step([[L.EV_LEAVE, a]]);
  assert.equal(escapeOf(g.v).down, 0);
  g.step([[L.EV_JOIN, a]]);
  g.step();
  assert.ok(!down(g, a) && time(g, a) === 0 && !g.v.fighter(a).jugg);
  // the hunter leaves: one of those up is drawn, moved, news
  const k0 = g.v.fxCount();
  g.step([[L.EV_LEAVE, h]]);
  const hs = hunters(g);
  assert.equal(hs.length, 1);
  assert.ok([a, b].includes(hs[0]));
  assert.deepEqual(news(g, k0), [[AC.ES_MX_HUNT, hs[0], hs[0]]]);
  assert.deepEqual([g.v.fighter(hs[0]).gun, points(g, hs[0]), aux(g, hs[0])], [[L.W_SWORD, L.W_SWORD], 0, 0]);
  // a room down to one: no hunter, play goes on
  g.step([[L.EV_LEAVE, hs[0]]]);
  g.step();
  assert.deepEqual([hunters(g).length, g.v.hole().state], [0, L.H_PLAY]);
});

test('Escape\'s client module: the terminals, exits, counts and states as AO and the records have them; consoles that flicker while hacked, exits, waypoints by role; HUD lines, news, the board; the AI fighter\'s goals both ways, played out', async () => {
  const cd = await room(2, { play: false });
  const lines = (g, slot, extra = {}) => {
    const outs = [];
    es.hud(g.v, { put: (x, y, s, c) => outs.push([y, s, c]), centre: (y, s, c) => outs.push(['mid', s, c]), right() {}, rect() {}, rows: 33, C, slot, me: g.v.fighter(slot),
      team: -1, now: 0, t: 1, ...extra });
    return outs;
  };
  assert.deepEqual(lines(cd, 0), [[0, 'ONE HUNTER AGAINST THE ROOM', C.YELLOW], [1, 'HACK THE TERMINALS', C.GREY], [2, 'THEN RUN FOR THE EXITS', C.GREY]]);
  const gctx = (g, slot) => ({ role: 'attack', rank: 0, view: g.v, ally: (p, q) => g.v.ally(p, q), slot, t: g.v.tick });
  assert.equal(es.goal(cd.v, cd.v.fighter(0), gctx(cd, 0)), null, 'nothing to do before play');
  assert.deepEqual(AMC[L.M_ESCAPE], es);
  assert.equal(newsOf(AC.ES_MX_HUNT), es);

  const g = await room(4);
  const v = g.v;
  const h = hunters(g)[0];
  const [a, b, c] = [0, 1, 2, 3].filter((p) => p !== h);
  away(g);
  put(g, h, 640, 440);
  const ts = termsOf(v);
  assert.deepEqual(stateOf(v, a), { hunter: false, state: 'up', order: 0, time: 0, help: 0 });
  assert.deepEqual(stateOf(v, h), { hunter: true, state: 'up', stun: 0, calm: 0, fin: 0 });
  // the HUD: a survivor's and the hunter's, each line short of the shield bar (26 columns in)
  put(g, a, ts[0].pos[0] + 1, ts[0].pos[2], ts[0].pos[1]);
  g.step();
  assert.deepEqual(lines(g, a), [[0, 'YOU: SURVIVOR', C.CYAN], [1, 'TERMINALS 0 OF 2', C.YELLOW], [2, '3 UP  0 DOWN', C.GREY], [3, '0 ESCAPED  0 OUT', C.GREY], [4, 'SHOVE READY  Q', C.GREEN],
    ['mid', 'HACKING  HOLD STILL', C.CYAN]]);
  assert.deepEqual(lines(g, h).slice(0, 4).map((l) => l.slice(0, 2)), [[0, 'YOU: THE HUNTER'], [1, 'FINISHED 0  DOWNED 0'], [2, 'NOISE AT 1 TERMINAL'], [3, 'TERMINALS 0 OF 2']]);
  assert.deepEqual(lines(g, b, { watching: true, mine: c })[0][1], `P${b + 1}: SURVIVOR`, 'a watcher sees whose it is');
  // drawn: a console on each terminal, the noisy one amber; waypoints: HACK for a survivor, NOISE for the hunter
  const draw = (slot, now = 0) => {
    const o = { solid: [], glow: [], beams: [], markers: [], zone: null };
    es.draw(v, { dt: 0, now, t: 1, slot, shown: slot, me: v.fighter(slot), pme: null, cam: [0, 0, 0], view: v, pview: v }, o);
    return o;
  };
  const o = draw(b);
  assert.deepEqual(o.solid.map((s) => s.kind), ts.map(() => TERMINAL));
  assert.ok(o.solid[0].color[0] > o.solid[0].color[2] && o.solid[1].color[2] > o.solid[1].color[0], 'amber while hacked, cyan idle');
  assert.deepEqual([o.markers.map((m) => m.label.split(' ')[0]), o.zone], [ts.map(() => 'HACK'), null]);
  assert.deepEqual(draw(h).markers.map((m) => m.label), ['NOISE']);
  // the survivor's goal: a terminal to hack; the hunter's: the noise
  let goal = es.goal(v, v.fighter(b), gctx(g, b));
  assert.ok(goal.still && goal.hold && ts.some((t) => across(t.pos, goal.pos) < 1e-3), 'to a terminal');
  goal = es.goal(v, v.fighter(h), gctx(g, h));
  assert.ok(across(goal.pos, ts[0].pos) < 1e-3 && goal.hurry === 0.6, 'to the noise');
  // a hunter seen inside RUN: off, farther from it; on top of it, the shove ready: at it, to shove
  put(g, b, 500, 528);
  put(g, h, 485, 528);
  goal = es.goal(v, v.fighter(b), gctx(g, b));
  assert.ok(goal.flee && across(goal.pos, v.fighter(h).pos) > across(v.fighter(b).pos, v.fighter(h).pos), 'away from it');
  put(g, h, 497.5, 528);
  goal = es.goal(v, v.fighter(b), gctx(g, b));
  assert.ok(goal.swing && across(goal.pos, v.fighter(h).pos) < 1e-3, 'shove it');
  g.dv.setUint16(mr(b) + AC.ES_MR_TIME, 500, true);
  assert.ok(es.goal(v, v.fighter(b), gctx(g, b)).flee, 'cooling: run');
  // the hunter sees a survivor: on to it (led); a downed one with nobody by: there, still
  goal = es.goal(v, v.fighter(h), gctx(g, h));
  assert.ok(goal.hurry === 0.6 && !goal.still && across(goal.pos, v.fighter(b).pos) < 1, 'after it');
  downOn(g, h, b);
  put(g, a, 600, 580);
  goal = es.goal(v, v.fighter(h), gctx(g, h));
  assert.ok(goal.still && goal.hurry === 1 && across(goal.pos, v.fighter(b).pos) < 0.01, 'to finish it');
  assert.deepEqual(draw(h).markers.filter((m) => m.label === 'FINISH').length, 1);
  assert.ok(draw(c).markers.some((m) => m.label.startsWith('REVIVE')));
  // downed: by a friend still, else to the nearest friend
  put(g, h, 640, 440);
  goal = es.goal(v, v.fighter(b), gctx(g, b));
  assert.ok(!goal.still && across(goal.pos, v.fighter(c).pos) < 0.01 || across(goal.pos, v.fighter(a).pos) < 0.01, 'crawl to a friend');
  const pb = v.fighter(b).pos;
  put(g, c, pb[0] + 1.5, pb[2], pb[1]);
  assert.ok(es.goal(v, v.fighter(b), gctx(g, b)).still, 'still by it');
  assert.ok(es.goal(v, v.fighter(c), gctx(g, c)).still, 'and the friend revives');
  // news
  const feed = [], banners = [];
  const nctx = (slot) => ({ slot, me: v.fighter(slot), name: (p) => (p === slot ? 'YOU' : `P${p + 1}`), team: () => -1,
    feed: (s, col) => feed.push([s, col]), banner: (s, col) => banners.push([s, col]), glow() {}, sound: {}, dist: 10, C, now: 0, view: v });
  const f = (size, owner, shot) => ({ tick: v.tick, kind: L.FX_MODE, owner, shot, pos: [512, 20, 512], size });
  es.news(f(AC.ES_MX_DOWN, 1, 0), nctx(1));
  es.news(f(AC.ES_MX_DOWN, 1, 0), nctx(0));
  es.news(f(AC.ES_MX_UP, 2, 1), nctx(1));
  es.news(f(AC.ES_MX_OUT, 1, 0), nctx(2));
  es.news(f(AC.ES_MX_OUT, 1, 1), nctx(1));
  es.news(f(AC.ES_MX_HACK, 2, 0), nctx(2));
  es.news(f(AC.ES_MX_OPEN, 255, 2), nctx(2));
  es.news(f(AC.ES_MX_FREE, 2, 1), nctx(2));
  es.news(f(AC.ES_MX_STUN, 2, 0), nctx(0));
  es.news(f(AC.ES_MX_HUNT, 0, 0), nctx(0));
  assert.deepEqual(feed, [['P1 DOWNED YOU', C.RED], ['YOU DOWNED P2', C.RED], ['P3 REVIVED YOU', C.GREEN], ['P1 FINISHED P2', C.WHITE], ['YOU BLED OUT', C.WHITE],
    ['A TERMINAL IS HACKED  0 OF 2', C.CYAN], ['THE EXITS ARE OPEN', C.GREEN], ['YOU ESCAPED 1ST', C.GREEN], ['P3 STUNNED YOU', C.CYAN], ['YOU ARE THE HUNTER', C.ORANGE]]);
  assert.deepEqual(banners, [['DOWNED  CRAWL TO A FRIEND', C.RED], ['DOWNED P2  HOLD STILL OVER THEM', C.ORANGE], ['BACK ON YOUR FEET', C.GREEN], ['YOU ARE OUT  WATCH THE OTHERS', C.RED],
    ['TERMINAL HACKED', C.CYAN], ['TIME IS SHORT  THE EXITS ARE OPEN', C.GREEN], ['YOU ESCAPED 1ST', C.GREEN], ['STUNNED', C.CYAN], ['YOU ARE THE HUNTER  DOWN THEM ALL', C.ORANGE]]);
  // the board, dealt, dead, watch
  const F = (p) => v.fighter(p);
  assert.deepEqual(es.cols.map((k) => k.head), ['NOW', 'REVIVES', 'HACKING', 'DOWNS', 'FINISHED']);
  assert.deepEqual(es.cols.map((k) => k.get(F(h))), ['HUNTER', '-', '-', '1', '0']);
  assert.deepEqual(es.cols.map((k) => k.get(F(b))).slice(0, 2), ['DOWN', '0']);
  assert.deepEqual([es.own, es.kills, es.sides, es.frags, es.dealt(F(h)), es.dealt(F(a)), es.dead({ rung: 2 }), es.dead({ rung: 0 })],
    [true, false, 1, false, 'THE HUNTER: THE SWORD', 'SURVIVOR: NO GUNS  Q SHOVES THE HUNTER', 'ESCAPED 2ND  SPECTATING', 'OUT  SPECTATING']);
  assert.deepEqual([es.watch(v, b), es.watch(v, h), es.watch(v, 9)], [true, true, false]);
  // the exits drawn, once open: a flag each, a zone on the nearest, EXIT waypoints for everyone
  g.dv.setUint32(L.HDR_UNTIL, v.tick + AC.ES_LATE, true);
  g.step();
  const ex = exitsOf(v);
  const oe = draw(a);
  assert.deepEqual(oe.solid.filter((s) => s.kind === 7).length, 2);
  assert.ok(oe.zone && [ex[0], ex[1]].some((x) => x[0] === oe.zone.x && x[2] === oe.zone.z));
  assert.deepEqual([oe.markers.filter((m) => m.label === 'EXIT').length, draw(h).markers.filter((m) => m.label === 'EXIT').length], [2, 2]);
  assert.ok(across(es.goal(v, v.fighter(a), gctx(g, a)).pos, ex[0]) < 1e-3 || across(es.goal(v, v.fighter(a), gctx(g, a)).pos, ex[1]) < 1e-3, 'to an exit');
  assert.equal(es.state(v).open, 2);

  // played out by the bots: a survivor hacks a terminal through; the hunter finishes a downed one
  const r = await room(3);
  const rh = hunters(r)[0];
  const [ra, rb] = [0, 1, 2].filter((p) => p !== rh);
  away(r);
  put(r, rh, 640, 440);
  const rt = termsOf(r.v)[0];
  put(r, ra, rt.pos[0] + 12, rt.pos[2], r.v.stand(rt.pos[0] + 12, rt.pos[2], rt.pos[1] + 1));
  r.dv.setUint16(term(0) + AC.ES_T_PROG, 4 * AC.ES_HACK - 400, true);
  const bot = new Fighter(ra, 7, 0.8);
  for (let t = 0; t < 1500 && !termsOf(r.v)[0].done; t++) r.step([[L.EV_INPUT, ra, bot.think(r.v, r.v.tick, 0)]]);
  assert.ok(termsOf(r.v)[0].done, 'hacked by the bot');
  put(r, rb, 500, 510); downOn(r, rh, rb);
  put(r, rh, 510, 510);
  put(r, ra, 600, 580);
  const hb = new Fighter(rh, 7, 0.8);
  for (let t = 0; t < 1500 && !out(r, rb); t++) r.step([[L.EV_INPUT, rh, hb.think(r.v, r.v.tick, 0)]]);
  assert.ok(out(r, rb) && points(r, rh) === 1, 'finished by the bot');
  // and the survivor's bot, the hunter on top of it, shoves it down
  put(r, rh, 520, 520);
  put(r, ra, 522.5, 521);
  for (let t = 0; t < 250 && !down(r, rh); t++) r.step([[L.EV_INPUT, ra, bot.think(r.v, r.v.tick, 0)]]);
  assert.ok(down(r, rh) && escapeOf(r.v).stuns === 1, 'stunned by the bot');
});

test('Escape with 8 and 16 AI fighters: downs, finishes, hacks, the exits opened and escapes in 20,000 ticks; no trap on the debug build, the same hash on every tick on 1 and 4 threads', async (t) => {
  const [debug, bytes] = [arenaBytes(true), arenaBytes()];
  const ticks = 20000;
  const total = {};
  for (const bots of [8, 16]) {
    const count = {};
    let k0 = 0, ends = 0;
    const { log } = await playArena({ bytes: debug, seed: forcedSeed(L.M_ESCAPE), bots, ticks, leaveAt: 1000,
      onTick: (tick, v) => {
        for (let k = Math.max(k0, v.fxCount() - L.FX_MAX); k < v.fxCount(); k++) {
          const f = v.fx(k);
          if (f.kind === L.FX_MODE) count[f.size] = (count[f.size] || 0) + 1;
        }
        k0 = v.fxCount();
        if (v.hole().state === L.H_OVER && v.hole().until === tick + 1 + L.OVER_TICKS - 1) ends++;
      } });
    const n = (m) => count[m] || 0;
    t.diagnostic(`${bots} fighters: hunters ${n(AC.ES_MX_HUNT)}, downed ${n(AC.ES_MX_DOWN)}, revived ${n(AC.ES_MX_UP)}, out ${n(AC.ES_MX_OUT)}, stunned ${n(AC.ES_MX_STUN)}, hacked ${n(AC.ES_MX_HACK)}, opened ${n(AC.ES_MX_OPEN)}, escaped ${n(AC.ES_MX_FREE)}`);
    for (const m of [AC.ES_MX_DOWN, AC.ES_MX_OUT, AC.ES_MX_HACK, AC.ES_MX_OPEN, AC.ES_MX_FREE, AC.ES_MX_HUNT, AC.ES_MX_UP, AC.ES_MX_STUN]) total[m] = (total[m] || 0) + n(m);
    assert.ok(n(AC.ES_MX_DOWN) >= 2 && n(AC.ES_MX_OUT) >= 1, `${bots}: the hunter downs and finishes`);
    assert.ok(n(AC.ES_MX_HACK) >= 2 && n(AC.ES_MX_OPEN) >= 1 && n(AC.ES_MX_FREE) >= 2, `${bots}: hacked, opened, escaped`);
    const parsed = parseLog(log);
    const a = await replay({ bytes, log: parsed, ticks, threads: 1, tag: `es${bots}x1` });
    const b = await replay({ bytes, log: parsed, ticks, threads: 4, tag: `es${bots}x4`, startWorkers });
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(b.trace).tickHashes]);
  }
  assert.ok(total[AC.ES_MX_FREE] + total[AC.ES_MX_OUT] >= 10, 'matches played out');
});
