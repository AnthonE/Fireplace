import test from 'node:test';
import assert from 'node:assert/strict';
import { arenaBytes } from './helpers.mjs';
import { View, arenaWord, arenaFrame, forcedSeed } from '../src/arena-view.mjs';
import { aimAt } from '../client/bot.mjs';
import { Fighter } from '../client/arena-bot.mjs';
import { playArena } from '../tools/genarena.mjs';
import { compileMap } from '../tools/map.mjs';
import { replay, parseLog, decodeTrace, newMemory, instantiate, Sim } from '../harness/core.mjs';
import { startWorkers } from '../harness/run-node.mjs';
import * as L from '../src/layout.mjs';
import * as AC from '../src/am/consts.mjs';
import lk, { blocksOf, legsOf, rolled, bare, BLOCK } from '../client/am/lucky.mjs';
import { AMC } from '../client/am/index.mjs';
import { C } from '../client/font.mjs';

// LUCKY BLOCKS (src/am/lucky.wat): everyone for itself with a magnum alone;
// blocks over the map's spots break to a shot, a swing, a blast or a bolt and
// pay out by the PRNG at the tick's end. Helpers as test/arena-vip.test.mjs
// has them; the blocks read straight from AO (its fields in src/am/lucky.mjs).

let debugModule = null;
async function room(n = 2, { seed = 7, mode = L.M_LUCKY, park: parked = true, play = true } = {}) {
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
const sh = (g, p) => g.sim.u8[rec(p) + L.A_SH];
const hp = (g, p) => g.sim.u8[rec(p) + L.A_HP];
const dead = (g, p) => g.v.fighter(p).dead;
const broke = (g, p) => g.dv.getUint16(mr(p) + L.MR_AUX, true);
const setKills = (g, p, n) => g.dv.setUint16(rec(p) + L.A_KILLS, n, true);
const MAP = compileMap();

// The blocks, and block j's middle, ticks gone and breaker (slot + 1) as AO holds them.
const blocks = (g) => blocksOf(g.v);
const blk = (g, j) => {
  const a = L.AO + AC.LK_BLOCKS + j * AC.LK_BSIZE;
  return { pos: [0, 4, 8].map((o) => g.dv.getFloat32(a + o, true)), wait: g.dv.getUint16(a + 12, true), by: g.dv.getUint16(a + 14, true) };
};
const setWait = (g, j, n) => g.dv.setUint16(L.AO + AC.LK_BLOCKS + j * AC.LK_BSIZE + 12, n, true);
// the block on open ground mid-field (over the rocket's pad, the skull's spot, the first hill)
const MID = 2;

function put(g, p, x, z, y = g.v.height(x, z)) {
  g.dv.setFloat32(rec(p) + L.P_PX, x, true);
  g.dv.setFloat32(rec(p) + L.P_PY, y, true);
  g.dv.setFloat32(rec(p) + L.P_PZ, z, true);
  for (const o of [L.P_VX, L.P_VY, L.P_VZ]) g.dv.setFloat32(rec(p) + o, 0, true);
}
// Slot p's place on open ground south of mid-field, 3 m from the next, clear of every block.
const park = (g, p) => put(g, p, 491 + 3 * (p % 8), 528 + 3 * (p >> 3));

function loadout(g, p, w0, w1 = w0) {
  g.dv.setUint8(rec(p) + L.A_GUN, w0); g.dv.setUint8(rec(p) + L.A_GUN + 1, w1);
  g.dv.setUint8(rec(p) + L.A_MAG, L.ARMS[w0].mag); g.dv.setUint8(rec(p) + L.A_MAG + 1, L.ARMS[w1].mag);
  g.dv.setUint16(rec(p) + L.A_RES, L.ARMS[w0].res, true); g.dv.setUint16(rec(p) + L.A_RES + 2, L.ARMS[w1].res, true);
  g.dv.setUint8(rec(p) + L.A_RELOAD, 0); g.dv.setUint8(rec(p) + L.A_BURST, 0);
}

// A word that presses nothing new: the counters and bits as p last took them.
const still = (g, p) => { const f = g.v.fighter(p); return { shot: f.fired, melee: f.act & L.AB_MELEE, gren: (f.act >> 1) & 1, slot: f.hand }; };
// p's word aimed at the point `at` (its eye P_EYE over its feet), pressing what `press` says anew
function aim(g, p, at, press = {}) {
  const f = g.v.fighter(p), w = still(g, p);
  const { yaw, pitch } = aimAt([f.pos[0], f.pos[1] + 1.6, f.pos[2]], at);
  return arenaWord({ yaw, pitch, ...w, shot: press.shot ? (w.shot + 1) & 3 : w.shot, melee: press.melee ? w.melee ^ 1 : w.melee, slot: press.slot ?? w.slot });
}
// p fires the gun in its hands at the point `at` from where it stands (its refire and cooldown waited out).
function fire(g, p, at) {
  g.dv.setUint16(rec(p) + L.P_REFIRE, 0, true);
  g.step([[L.EV_INPUT, p, aim(g, p, at, { shot: 1 })]]);
}
// p swings (a butt, or the sword in its hands) facing the point `at`.
function swing(g, p, at) {
  g.dv.setUint16(rec(p) + L.A_COOL, 0, true);
  g.step([[L.EV_INPUT, p, aim(g, p, at, { melee: 1 })]]);
}
// p stands `d` m west of block j, on the floor under it, and fires at its middle.
function shoot(g, p, j, d = 6) {
  const b = blk(g, j).pos;
  put(g, p, b[0] - d, b[2], b[1] - Number(AC.LK_LIFT));
  fire(g, p, b);
}

function fxs(v, kind, size, from = 0) {
  const out = [];
  for (let k = Math.max(from, v.fxCount() - L.FX_MAX); k < v.fxCount(); k++) {
    const f = v.fx(k);
    if (f.kind === kind && (size === undefined || f.size === size)) out.push(f);
  }
  return out;
}
// what blocks paid from `from` on: [owner, what]
const rolls = (g, from) => fxs(g.v, L.FX_MODE, AC.LK_MX_ROLL, from).map((f) => [f.owner, f.shot]);
const endMatch = (g) => { g.dv.setUint32(L.HDR_UNTIL, g.v.tick + 1, true); for (let i = 0; i < 4; i++) g.step(); };
const steps = (g, n) => { for (let i = 0; i < n; i++) g.step(); };

// The sim's PRNG (src/util.wat's $rand): xorshift32; and what a block pays on the draw x.
const xorshift = (x) => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return x >>> 0; };
function paid(x) {
  let r = x % AC.LK_ODDS_SUM, k = 0;
  while ((r -= AC.LK_ODDS[k]) >= 0) k++;
  return AC.LK_ROLLS[k];
}
// A PRNG state whose next draw pays `what`.
function seedFor(what) {
  for (let s = 1; ; s++) if (paid(xorshift(s)) === what) return s;
}
// p breaks block j with a shot on a PRNG set to pay `what` (the tick's only draw).
function lucky(g, p, j, what) {
  g.dv.setUint32(L.HDR_RNG, seedFor(what), true);
  const from = g.v.fxCount();
  shoot(g, p, j);
  assert.deepEqual(rolls(g, from), [[p, what]], `P${p} breaks block ${j} for ${what}`);
}

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

// Where the blocks should stand, from the map as JS reads it: each spot in its
// order (pads, the stands, the skull's spot, the hills) on what is under it,
// LK_LIFT up, but one within LK_APART across and 2 m up or down of one before.
function spots(v) {
  const m = v.map(), out = [];
  const add = (x, z, top) => {
    const y = v.stand(x, z, top) + Number(AC.LK_LIFT);
    if (out.some((b) => Math.hypot(b[0] - x, b[2] - z) < Number(AC.LK_APART) && Math.abs(b[1] - y) < 2)) return;
    out.push([x, y, z]);
  };
  for (const p of MAP.pads) add(p.x, p.z, p.top);
  for (const f of [...m.flags, m.ball]) add(f[0], f[1], f[2]);
  for (const h of m.hills) add(h[0], h[1], h[2]);
  return out;
}

test('Lucky Blocks: on the kit with no sides; nothing of it in the countdown; as play starts a block over each of the map\'s spots, one to a spot; everyone with a magnum alone, no frags, nobody on a side', async () => {
  assert.ok((L.KIT >> L.M_LUCKY) & 1 && !((L.TEAMED >> L.M_LUCKY) & 1) && !((L.TEAM_MODES >> L.M_LUCKY) & 1));
  assert.equal(L.MODES[L.M_LUCKY].name, 'LUCKY BLOCKS');
  assert.equal(L.ARENA_MODES.at(-1), L.M_LUCKY, 'last in the rotation, before it comes round to a Fiesta');
  assert.equal(AC.LK_ODDS.reduce((a, b) => a + b), AC.LK_ODDS_SUM);
  assert.equal(AC.LK_ODDS.length, AC.LK_ROLLS.length);
  assert.equal(AMC[L.M_LUCKY], lk);
  const g = await room(4, { play: false });
  while (g.v.hole().state !== L.H_PLAY) {
    assert.ok(g.sim.u8.slice(L.AO, L.AO + L.AO_SIZE).every((x) => x === 0), 'the countdown');
    g.step();
  }
  const bs = blocks(g);
  const want = spots(g.v);
  assert.equal(bs.length, want.length);
  assert.ok(bs.length >= 12 && bs.length <= AC.LK_MAX, `${bs.length} blocks`);
  bs.forEach((b, k) => assert.ok(b.pos.every((x, i) => Math.abs(x - want[k][i]) < 1e-4) && b.wait === 0, `block ${k} at ${b.pos}`));
  // the pads' first, each over its pad; two roofs' sniper pads and their hills apart
  MAP.pads.forEach((p, k) => assert.deepEqual([bs[k].pos[0], bs[k].pos[2]], [p.x, p.z]));
  assert.ok(bs.filter((b) => b.pos[1] > 25).length >= 2, 'up on the roofs');
  for (let p = 0; p < 4; p++) {
    const f = g.v.fighter(p);
    assert.deepEqual([f.gun, f.mag, f.grens, f.sh, f.hp, fl(g, p) & (L.PF_ZOMBIE | L.PF_JUGG | L.PF_BLUE | L.PF_CARRY | L.PF_FAST), f.team], [[L.W_MAGNUM, L.W_MAGNUM], [8, 8], 0, 100, 100, 0, -1]);
    assert.ok(bare(f));
  }
  assert.ok(!g.v.ally(0, 1) && !g.v.teamed());
  assert.deepEqual([u32(g, L.AH_TARGET), u32(g, L.AH_SCORE), u32(g, L.AH_TEAMN)], [0, 0, 0], 'no team fields');
  // no pads laid: the blocks are the guns
  assert.deepEqual(g.v.pads(), []);
});

test('Lucky Blocks: a magnum round through a block breaks it (one a round, even through one into a fighter, who is hit too); a miss by a hair doesn\'t; gone LK_BACK ticks, nothing breaks it while gone; back on its tick', async () => {
  const g = await room(3);
  const b = blk(g, MID).pos;
  // from 6 m, aimed a hair over the near face's top edge (the line goes on down, over the far edge): a miss
  put(g, 0, b[0] - 6, b[2], b[1] - 1);
  fire(g, 0, [b[0] - 0.5, b[1] + 0.53, b[2]]);
  assert.equal(blk(g, MID).wait, 0, 'missed by a hair');
  // a hair inside: broken, its breaker's on the tick (MR_AUX), the roll drawn at the tick's end, gone LK_BACK
  let from = g.v.fxCount();
  put(g, 0, b[0] - 6, b[2], b[1] - 1);
  fire(g, 0, [b[0] - 0.5, b[1] + 0.47, b[2]]);
  assert.deepEqual([blk(g, MID).wait, blk(g, MID).by, broke(g, 0)], [AC.LK_BACK, 0, 1]);
  const r = rolls(g, from);
  assert.equal(r.length, 1);
  assert.equal(r[0][0], 0);
  assert.ok(rolled(r[0][1]), `paid ${r[0][1]}`);
  const at = fxs(g.v, L.FX_MODE, AC.LK_MX_ROLL, from)[0].pos;
  assert.ok(at.every((x, i) => Math.abs(x - b[i]) < 1e-4), 'the news at the block');
  // gone: a shot through where it was breaks nothing and pays nothing
  steps(g, 40);
  from = g.v.fxCount();
  shoot(g, 1, MID);
  assert.deepEqual([rolls(g, from), broke(g, 1), blk(g, MID).wait], [[], 0, AC.LK_BACK - 41]);
  // back on its tick
  steps(g, AC.LK_BACK - 42);
  assert.equal(blk(g, MID).wait, 1);
  g.step();
  assert.equal(blk(g, MID).wait, 0);
  // one round through it into a fighter behind: both
  put(g, 2, b[0] + 4, b[2]);
  const hp0 = sh(g, 2) + hp(g, 2);
  from = g.v.fxCount();
  g.dv.setUint32(L.HDR_RNG, seedFor(L.W_AR), true);
  put(g, 1, b[0] - 6, b[2], b[1] - 1);
  fire(g, 1, [b[0] + 4, g.v.fighter(2).pos[1] + 1.2, b[2]]);
  assert.deepEqual([rolls(g, from), broke(g, 1)], [[[1, L.W_AR]], 1]);
  assert.equal(hp0 - sh(g, 2) - hp(g, 2), L.ARMS[L.W_MAGNUM].dmg, 'the round goes on through it');
});

test('Lucky Blocks: a butt reaches one 2.4 m off and the sword 5 m, along the facing; a frag within half its blast; a plasma bolt through it; two fighters on one tick: the first to it in slot order; in the countdown nothing', async () => {
  const g = await room(3);
  const b = blk(g, MID).pos;
  const floor = b[1] - Number(AC.LK_LIFT);
  const near = Number(AC.LK_HALF) + Number(AC.LK_SWING_R);
  // a butt from 2.4 + near less a hair: broken; from a hair further: not
  put(g, 0, b[0] - 2.4 - near - 0.02, b[2], floor);
  swing(g, 0, b);
  assert.equal(blk(g, MID).wait, 0, 'out of reach');
  put(g, 0, b[0] - 2.4 - near + 0.02, b[2], floor);
  swing(g, 0, b);
  assert.equal(blk(g, MID).wait, AC.LK_BACK, 'a butt');
  // facing away: nothing
  setWait(g, MID, 0);
  put(g, 0, b[0] - 1.5, b[2], floor);
  swing(g, 0, [b[0] - 10, b[1], b[2]]);
  assert.equal(blk(g, MID).wait, 0, 'behind its back');
  // the sword: its 5 m
  loadout(g, 0, L.W_SWORD);
  put(g, 0, b[0] - 5 - near + 0.05, b[2], floor);
  fire(g, 0, b);
  assert.equal(blk(g, MID).wait, AC.LK_BACK, 'the sword');
  // a frag of 1's going off within half its 5 m: broken; just outside: not
  setWait(g, MID, 0);
  const frag = (x, z, owner) => {
    const j = L.PROJ;
    g.dv.setFloat32(j + L.J_PX, x, true); g.dv.setFloat32(j + L.J_PY, g.v.height(x, z) + 0.12, true); g.dv.setFloat32(j + L.J_PZ, z, true);
    for (const o of [L.J_VX, L.J_VY, L.J_VZ]) g.dv.setFloat32(j + o, 0, true);
    g.dv.setUint16(j + L.J_AGE, L.A_FUSE - 1, true); g.sim.u8[j + L.J_KIND] = L.K_GRENADE; g.sim.u8[j + L.J_OWNER] = owner;
    g.step();
  };
  const reach = 2.5 + Number(AC.LK_HALF);
  frag(b[0] - reach - 0.05, b[2], 1);
  assert.equal(blk(g, MID).wait, 0, 'outside half the blast');
  let from = g.v.fxCount();
  frag(b[0] - reach + 0.3, b[2], 1);
  assert.equal(blk(g, MID).wait, AC.LK_BACK, 'inside it');
  assert.equal(rolls(g, from)[0][0], 1, 'the frag\'s owner');
  // a plasma bolt from 2 through it, and on: broken by 2
  setWait(g, MID, 0);
  park(g, 0);
  loadout(g, 2, L.W_PLASMA);
  put(g, 2, b[0] - 12, b[2], floor);
  from = g.v.fxCount();
  fire(g, 2, b);
  for (let i = 0; i < 40 && blk(g, MID).wait === 0; i++) g.step();
  assert.deepEqual([blk(g, MID).wait > 0, rolls(g, from).map((x) => x[0])], [true, [2]]);
  // 1 and 2 on one tick, each a round through it: 1's (the lower slot moves first)
  setWait(g, MID, 0);
  for (const p of [1, 2]) { loadout(g, p, L.W_MAGNUM); g.dv.setUint16(rec(p) + L.P_REFIRE, 0, true); }
  put(g, 1, b[0] - 6, b[2] + 1, floor); put(g, 2, b[0] + 6, b[2] - 1, floor);
  from = g.v.fxCount();
  g.step([[L.EV_INPUT, 2, aim(g, 2, b, { shot: 1 })], [L.EV_INPUT, 1, aim(g, 1, b, { shot: 1 })]]);
  assert.deepEqual([rolls(g, from).map((x) => x[0]), broke(g, 1), broke(g, 2)], [[1], 2, 1], '1\'s second (its frag\'s the first), 2\'s bolt\'s alone');
  // in the countdown of the next match nothing breaks (nor are there blocks)
  endMatch(g);
  while (g.v.hole().state !== L.H_COUNT) g.step();
  assert.deepEqual(blocks(g), []);
});

test('Lucky Blocks: what a block pays is the PRNG\'s draw at the tick\'s end, LK_ODDS of 64; a gun in the hand, in place of the starter in the other once the hands hold better, or ammo; a dead or gone breaker is paid nothing', async () => {
  // the draw: $rand % LK_ODDS_SUM walked through LK_ODDS
  const g = await room(3);
  for (const seed of [1, 2, 3, 99, 12345, 0x9e3779b9]) {
    setWait(g, MID, 0);
    g.dv.setUint32(L.HDR_RNG, seed, true);
    const from = g.v.fxCount();
    shoot(g, 0, MID);
    assert.deepEqual(rolls(g, from), [[0, paid(xorshift(seed))]], `seed ${seed}`);
    assert.equal(u32(g, L.HDR_RNG), xorshift(seed), 'one draw');
    // (back to the starter, unhurt)
    loadout(g, 0, L.W_MAGNUM); g.dv.setUint8(rec(0) + L.A_SH, 100); g.dv.setUint8(rec(0) + L.A_HP, 100);
    steps(g, 300);
    if (dead(g, 0)) while (dead(g, 0)) g.step();
    loadout(g, 0, L.W_MAGNUM);
  }
  // every roll comes up over the odds
  const seen = new Set();
  for (let s = 1; s < 4000; s++) seen.add(paid(xorshift(s)));
  assert.deepEqual([...seen].sort((a, b) => a - b), [...AC.LK_ROLLS].sort((a, b) => a - b));
  // a gun: in the hands (the slot it holds), full
  const h = await room(2);
  loadout(h, 0, L.W_MAGNUM);
  lucky(h, 0, MID, L.W_SHOTGUN);
  let f = h.v.fighter(0);
  assert.deepEqual([f.gun, f.mag[0], f.res[0], f.hand], [[L.W_SHOTGUN, L.W_MAGNUM], L.ARMS[L.W_SHOTGUN].mag, L.ARMS[L.W_SHOTGUN].res, 0]);
  // holding the shotgun with the starter in the other hand: the next in place of the starter
  setWait(h, MID, 0);
  lucky(h, 0, MID, L.W_SNIPER);
  f = h.v.fighter(0);
  assert.deepEqual(f.gun, [L.W_SHOTGUN, L.W_SNIPER]);
  // both better: in the hands
  setWait(h, MID, 0);
  lucky(h, 0, MID, L.W_ROCKET);
  assert.deepEqual(h.v.fighter(0).gun, [L.W_ROCKET, L.W_SNIPER]);
  // one it carries, spent: full again where it is
  h.dv.setUint8(rec(0) + L.A_MAG + 1, 0); h.dv.setUint16(rec(0) + L.A_RES + 2, 1, true);
  setWait(h, MID, 0);
  loadout(h, 0, L.W_MAGNUM, L.W_SNIPER);
  h.dv.setUint8(rec(0) + L.A_MAG + 1, 0); h.dv.setUint16(rec(0) + L.A_RES + 2, 1, true);
  lucky(h, 0, MID, L.W_SNIPER);
  f = h.v.fighter(0);
  assert.deepEqual([f.gun, f.mag[1], f.res[1]], [[L.W_MAGNUM, L.W_SNIPER], L.ARMS[L.W_SNIPER].mag, L.ARMS[L.W_SNIPER].res]);
  // the other hand in use (slot 1): a gun there
  setWait(h, MID, 0);
  loadout(h, 0, L.W_MAGNUM);
  h.step([[L.EV_INPUT, 0, arenaWord({ ...still(h, 0), slot: 1 })]]);
  steps(h, L.SWAP_TICKS);
  h.dv.setUint32(L.HDR_RNG, seedFor(L.W_BR), true);
  const bp = blk(h, MID).pos;
  put(h, 0, bp[0] - 6, bp[2], bp[1] - 1);
  h.dv.setUint16(rec(0) + L.P_REFIRE, 0, true);
  h.step([[L.EV_INPUT, 0, aim(h, 0, bp, { shot: 1, slot: 1 })]]);
  assert.deepEqual([h.v.fighter(0).gun, h.v.fighter(0).hand], [[L.W_MAGNUM, L.W_BR], 1]);
  // broken by a frag of a fighter dead since, or gone: it breaks, nothing is drawn or paid
  const d = await room(3);
  const b = blk(d, MID).pos;
  for (const gone of [false, true]) {
    setWait(d, MID, 0);
    const j = L.PROJ;
    d.dv.setFloat32(j + L.J_PX, b[0], true); d.dv.setFloat32(j + L.J_PY, d.v.height(b[0], b[2]) + 0.12, true); d.dv.setFloat32(j + L.J_PZ, b[2], true);
    for (const o of [L.J_VX, L.J_VY, L.J_VZ]) d.dv.setFloat32(j + o, 0, true);
    d.dv.setUint16(j + L.J_AGE, L.A_FUSE - 1, true); d.sim.u8[j + L.J_KIND] = L.K_GRENADE; d.sim.u8[j + L.J_OWNER] = 1;
    if (gone) d.step([[L.EV_LEAVE, 1]]);
    else { d.sim.u8[rec(1) + L.P_FL] |= L.PF_DEAD; d.dv.setUint16(rec(1) + L.A_RESPAWN, 500, true); }
    const rng = u32(d, L.HDR_RNG), from = d.v.fxCount();
    steps(d, gone ? 0 : 1);
    if (gone) assert.ok(blk(d, MID).wait > 0);
    assert.deepEqual([blk(d, MID).wait > 0, rolls(d, from), u32(d, L.HDR_RNG), broke(d, 1)], [true, [], rng, 0], gone ? 'gone' : 'dead');
  }
});

test('Lucky Blocks: an overshield (back only to 100), frags up to 4, legs for LK_FAST_TICKS (a zombie\'s run and jump) that go with a death', async () => {
  const g = await room(2);
  g.dv.setUint8(rec(0) + L.A_SH, 30); g.dv.setUint8(rec(0) + L.A_HP, 40);
  lucky(g, 0, MID, AC.LK_R_OVER);
  assert.deepEqual([sh(g, 0), hp(g, 0)], [L.OVERSHIELD, 100]);
  steps(g, L.SHIELD_DELAY + 200);
  assert.equal(sh(g, 0), L.OVERSHIELD, 'it stays over 100 unhurt');
  // frags: two, and two more, and no more than 4
  for (const want of [2, 4, 4]) {
    setWait(g, MID, 0);
    lucky(g, 0, MID, AC.LK_R_FRAGS);
    assert.equal(g.v.fighter(0).grens, want);
  }
  // legs: PF_FAST, LK_FAST_TICKS of it in the record (the tick's own counted from the next)
  setWait(g, MID, 0);
  lucky(g, 0, MID, AC.LK_R_FAST);
  assert.deepEqual([fl(g, 0) & L.PF_FAST, legsOf(g.v, 0)], [L.PF_FAST, AC.LK_FAST_TICKS]);
  put(g, 0, 470, 500); put(g, 1, 470, 520);
  const run = arenaWord({ yaw: 0, move: 1 });
  for (let i = 0; i < 60; i++) g.step([[L.EV_INPUT, 0, run], [L.EV_INPUT, 1, run]]);
  const speed = (p) => Math.hypot(g.v.fighter(p).vel[0], g.v.fighter(p).vel[2]);
  assert.ok(Math.abs(speed(0) - 12.5) < 1e-3 && Math.abs(speed(1) - 10) < 1e-3, `${speed(0)} and ${speed(1)} m/s`);
  const peak = (p) => {
    put(g, p, 470, 500 + 20 * p);
    g.step([[L.EV_INPUT, 0, arenaWord({})], [L.EV_INPUT, 1, arenaWord({})]]);
    const y0 = g.v.fighter(p).pos[1];
    let top = y0;
    for (let i = 0; i < 150; i++) { g.step([[L.EV_INPUT, p, arenaWord({ jump: i < 2 ? 1 : 0 })]]); top = Math.max(top, g.v.fighter(p).pos[1]); }
    return top - y0;
  };
  const [j0, j1] = [peak(0), peak(1)];
  assert.ok(j0 > 1.8 && j0 < 1.9 && j1 > 1.2 && j1 < 1.3, `jumps of ${j0} and ${j1} m`);
  // they run out on the tick the count reaches 0
  g.dv.setUint16(mr(0) + AC.LK_MR_FAST, 3, true);
  steps(g, 2);
  assert.deepEqual([fl(g, 0) & L.PF_FAST, legsOf(g.v, 0)], [L.PF_FAST, 1]);
  g.step();
  assert.deepEqual([fl(g, 0) & L.PF_FAST, legsOf(g.v, 0)], [0, 0]);
  // and go with a death, and aren't back with the respawn
  setWait(g, MID, 0);
  lucky(g, 0, MID, AC.LK_R_FAST);
  loadout(g, 1, L.W_SWORD);
  put(g, 0, 500, 510); put(g, 1, 502, 510);
  g.step([[L.EV_INPUT, 0, arenaWord({ yaw: 8192, ...still(g, 0) })], [L.EV_INPUT, 1, aim(g, 1, [500, g.v.fighter(0).pos[1] + 1, 510], { melee: 1 })]]);
  assert.ok(dead(g, 0));
  assert.deepEqual([fl(g, 0) & L.PF_FAST, legsOf(g.v, 0)], [0, 0]);
  while (dead(g, 0)) g.step();
  assert.deepEqual([fl(g, 0) & L.PF_FAST, g.v.fighter(0).gun, g.v.fighter(0).grens], [0, [L.W_MAGNUM, L.W_MAGNUM], 0], 'the starter again');
});

test('Lucky Blocks: unlucky, a blast on its breaker (half to itself, all of it to one beside it); a frag rain of LK_RAIN round it in the air, going off one after another; its own kills as its own', async () => {
  const g = await room(3);
  const b = blk(g, MID).pos;
  // 1 stands a metre from where 0 will break it from
  put(g, 1, b[0] - 6, b[2] + 1, b[1] - 1);
  let from = g.v.fxCount();
  lucky(g, 0, MID, AC.LK_R_BOOM);
  const blast = fxs(g.v, L.FX_BLAST, undefined, from);
  assert.equal(blast.length, 1);
  assert.deepEqual([blast[0].owner, blast[0].size], [0, 5]);
  assert.deepEqual([sh(g, 0), hp(g, 0)], [0, 100 - (Number(AC.LK_BOOM_DMG) / 2 - 100)], 'half to itself');
  assert.ok(dead(g, 1), 'all of it a metre off');
  assert.deepEqual([g.v.fighter(0).kills, g.v.fighter(1).deaths], [1, 1], 'its kill');
  const k = fxs(g.v, L.FX_KILL, undefined, from);
  assert.deepEqual(k.map((f) => [f.owner, f.shot, f.size]), [[0, 1, L.KILL_GREN]]);
  // the rain: LK_RAIN frags of 0's, LK_RAIN_R round it, LK_RAIN_UP over its feet, at rest, their fuses LK_RAIN_FUSE apart
  park(g, 2);
  setWait(g, MID, 0);
  g.dv.setUint8(rec(0) + L.A_SH, 100); g.dv.setUint8(rec(0) + L.A_HP, 100);
  lucky(g, 0, MID, AC.LK_R_RAIN);
  const me = g.v.fighter(0).pos;
  const frags = [];
  for (let j = 0; j < L.NPROJ; j++) {
    const a = L.PROJ + j * L.JSIZE;
    if (g.sim.u8[a + L.J_KIND] !== L.K_GRENADE) continue;
    frags.push({ owner: g.sim.u8[a + L.J_OWNER], age: g.dv.getUint16(a + L.J_AGE, true), pos: [0, 4, 8].map((o) => g.dv.getFloat32(a + o, true)), shot: g.dv.getUint16(a + L.J_SHOT, true) });
  }
  assert.equal(frags.length, AC.LK_RAIN);
  frags.forEach((f, k) => {
    assert.deepEqual([f.owner, f.shot], [0, 0]);
    assert.ok(Math.abs(Math.hypot(f.pos[0] - me[0], f.pos[2] - me[2]) - Number(AC.LK_RAIN_R)) < 0.05, `frag ${k} round it`);
    assert.ok(f.pos[1] > me[1] + Number(AC.LK_RAIN_UP) - 0.2 && f.pos[1] <= me[1] + Number(AC.LK_RAIN_UP), `frag ${k} over it`);
  });
  assert.deepEqual(frags.map((f) => f.age).sort((a, b) => b - a), Array.from({ length: AC.LK_RAIN }, (_, k) => AC.LK_RAIN_AGE - k * AC.LK_RAIN_FUSE), 'their fuses');
  // standing in it, it goes down; the blasts one after another, the first A_FUSE - LK_RAIN_AGE on
  from = g.v.fxCount();
  const t0 = g.v.tick;
  let first = -1, n = 0;
  for (let i = 0; i < L.A_FUSE; i++) {
    g.step();
    const bl = fxs(g.v, L.FX_BLAST, undefined, from).length;
    if (bl && first < 0) first = g.v.tick - t0;
    n = bl;
  }
  assert.equal(n, AC.LK_RAIN);
  assert.equal(first, L.A_FUSE - AC.LK_RAIN_AGE);
  assert.ok(dead(g, 0) || g.v.fighter(0).deaths > 0, 'it went down');
});

test('Lucky Blocks: a fighter with legs runs, jumps, turns, shoots and swings predicted bit for bit from every tick', async () => {
  const g = await room(2);
  lucky(g, 0, MID, AC.LK_R_FAST);
  put(g, 0, 470, 500); put(g, 1, 600, 450);
  const inputs = [];
  for (let k = 0; k < 400; k++) {
    inputs.push(arenaWord({ yaw: 30 * k, pitch: 480, move: k < 150 ? 1 : k < 300 ? 9 : 2, jump: k % 60 === 10 ? 1 : 0, shot: (k >> 4) & 3, melee: (k >> 6) & 1,
      gren: (k >> 5) & 1, slot: k >= 200 && k < 260 ? 1 : 0, serial: (arenaFrame({ lag: 4, reload: k > 100 }) >> ((g.v.tick + k) & 7)) & 1 }));
  }
  assert.ok(predicted(g, 0, inputs) > 400);
  assert.equal(fl(g, 0) & L.PF_FAST, L.PF_FAST, 'legs all the way');
  assert.ok(g.v.fighter(0).shots > 4);
});

test('Lucky Blocks: over on the tick someone reaches LK_TARGET kills, the winner said; at the clock the most; places by kills, ties sharing; a suicide a kill off; the leader every tick', async () => {
  const g = await room(4);
  [3, 9, 9, 1].forEach((k, p) => setKills(g, p, k));
  g.step();
  assert.equal(g.v.mode().leader, 1, 'the most kills, the lower slot on a tie');
  setKills(g, 2, AC.LK_TARGET - 1);
  g.step();
  assert.deepEqual([g.v.mode().leader, g.v.hole().state], [2, L.H_PLAY]);
  // 2 kills 3: LK_TARGET, over on that tick
  loadout(g, 2, L.W_SWORD);
  put(g, 3, 500, 510); put(g, 2, 502, 510);
  const from = g.v.fxCount();
  g.step([[L.EV_INPUT, 3, arenaWord({ yaw: 0, ...still(g, 3) })], [L.EV_INPUT, 2, aim(g, 2, [500, g.v.fighter(3).pos[1] + 1, 510], { melee: 1 })]]);
  assert.ok(dead(g, 3));
  assert.deepEqual([g.v.hole().state, g.v.mode().winner, g.v.fighter(2).kills], [L.H_OVER, 2, AC.LK_TARGET]);
  assert.deepEqual(fxs(g.v, L.FX_MODE, L.MX_WIN, from).map((f) => f.owner), [2]);
  assert.deepEqual([0, 1, 2, 3].map((p) => g.v.fighter(p).place), [3, 2, 1, 4]);
  // over, nothing breaks
  const was = g.sim.u8.slice(L.AO, L.AO + L.AO_SIZE);
  shoot(g, 0, MID);
  steps(g, 50);
  assert.deepEqual(g.sim.u8.slice(L.AO, L.AO + L.AO_SIZE), was);
  // the clock: the most kills first, a tie shared; a suicide takes one off (a Fiesta's rule)
  const c = await room(4);
  assert.equal(c.v.hole().until - c.v.hole().start, L.MODE_TICKS[L.M_LUCKY], '5 min');
  [5, 2, 5, 0].forEach((k, p) => setKills(c, p, k));
  c.dv.setUint8(rec(1) + L.A_SH, 0); c.dv.setUint8(rec(1) + L.A_HP, 10);
  const pos = c.v.fighter(1).pos;
  const j = L.PROJ;
  c.dv.setFloat32(j + L.J_PX, pos[0], true); c.dv.setFloat32(j + L.J_PY, pos[1] + 0.12, true); c.dv.setFloat32(j + L.J_PZ, pos[2], true);
  c.dv.setUint16(j + L.J_AGE, L.A_FUSE - 1, true); c.sim.u8[j + L.J_KIND] = L.K_GRENADE; c.sim.u8[j + L.J_OWNER] = 1;
  c.step();
  assert.deepEqual([dead(c, 1), c.v.fighter(1).kills], [true, 1]);
  endMatch(c);
  assert.deepEqual([c.v.hole().state, c.v.mode().winner], [L.H_OVER, -1]);
  assert.deepEqual([0, 1, 2, 3].map((p) => c.v.fighter(p).place), [1, 3, 1, 4]);
});

test('Lucky Blocks: a join mid-match comes in with the starter and nothing of its slot\'s last fighter (blocks broken, legs); a leave leaves the blocks as they are', async () => {
  const g = await room(3);
  lucky(g, 1, MID, AC.LK_R_FAST);
  assert.deepEqual([broke(g, 1), legsOf(g.v, 1)], [1, AC.LK_FAST_TICKS]);
  const was = blocks(g);
  g.step([[L.EV_LEAVE, 1]]);
  assert.deepEqual(blocks(g), was.map((b) => ({ ...b, wait: Math.max(0, b.wait - 1) })), 'the blocks as they were, a tick on');
  g.step([[L.EV_JOIN, 1], [L.EV_JOIN, 5]]);
  for (const p of [1, 5]) {
    const f = g.v.fighter(p);
    assert.deepEqual([f.live, f.dead, f.gun, f.grens, broke(g, p), legsOf(g.v, p), fl(g, p) & L.PF_FAST, f.team], [true, false, [L.W_MAGNUM, L.W_MAGNUM], 0, 0, 0, 0, -1], `P${p}`);
  }
  // and breaks blocks like anyone
  park(g, 5);
  setWait(g, 4, 0);
  lucky(g, 5, 4, L.W_SWORD);
  assert.deepEqual([g.v.fighter(5).gun[0], broke(g, 5)], [L.W_SWORD, 1]);
  // a fighter in the last slot, 255: its breaks are its (by is slot + 1)
  const h = await room(L.NPLAYER, { park: false });
  const q = L.NPLAYER - 1;
  lucky(h, q, MID, AC.LK_R_OVER);
  assert.deepEqual([broke(h, q), sh(h, q)], [1, L.OVERSHIELD]);
});

test('a Fiesta after a Lucky Blocks match: its region exactly a Fiesta\'s (the mode header, the blocks, the records, no pads, no legs)', async () => {
  const g = await room(4, { park: false });
  lucky(g, 0, MID, AC.LK_R_FAST);
  setWait(g, 3, 0);
  lucky(g, 1, 3, AC.LK_R_OVER);
  steps(g, 100);
  g.dv.setUint32(L.HDR_SEED, 7, true);
  g.dv.setUint32(L.HDR_HOLE, L.ARENA_MODES.length - 1, true);
  endMatch(g);
  while (g.v.hole().state !== L.H_PLAY) g.step();
  g.step();
  assert.equal(g.v.mode().mode, L.M_FIESTA);
  const zero = (a, b) => g.sim.u8.slice(a, b).every((x) => x === 0);
  assert.ok(zero(L.AH_MODE, L.AH_END), 'the header');
  assert.ok(zero(L.AO, L.AO + L.AO_SIZE), 'the blocks');
  assert.ok(zero(L.MODE_REC, L.MODE_REC + L.NPLAYER * L.MR_SIZE), 'the records');
  if (L.FIESTA) assert.ok(zero(L.PAD, L.PAD + L.NPAD * L.PAD_SIZE), 'the pads');
  for (let p = 0; p < L.NPLAYER; p++) assert.equal(fl(g, p) & (L.PF_BLUE | L.PF_CARRY | L.PF_JUGG | L.PF_ZOMBIE | L.PF_FAST), 0, `P${p}`);
  assert.ok([0, 1, 2, 3].every((p) => sh(g, p) === 100 && g.v.fighter(p).gun[0] !== g.v.fighter(p).gun[1]), 'a Fiesta\'s two guns');
});

test('Lucky Blocks\' client module: the blocks as AO has them; a cube over each standing one, the nearest waypointed while the starter is all you hold; HUD lines, news, the board\'s column; the AI fighter\'s goals', async () => {
  const cd = await room(2, { play: false });
  const lines = (g, slot) => {
    const out = [];
    lk.hud(g.v, { put: (x, y, s, c) => out.push([y, s, c]), centre() {}, right() {}, rect() {}, rows: 33, C, slot, me: g.v.fighter(slot), team: -1, now: 0, t: 1 });
    return out;
  };
  assert.deepEqual([blocksOf(cd.v), lines(cd, 0)], [[], [[2, 'SHOOT OR HIT THE BLOCKS FOR LOOT', C.WHITE]]]);
  assert.equal(lk.goal(cd.v, cd.v.fighter(0), { slot: 0, t: 0 }), null);
  const g = await room(2);
  const v = g.v;
  const n = blocks(g).length;
  assert.deepEqual(lines(g, 0), [[2, `FIRST TO ${AC.LK_TARGET}  ${n} OF ${n} BLOCKS UP`, C.GREY]]);
  lucky(g, 0, MID, AC.LK_R_FAST);
  assert.deepEqual(lines(g, 0), [[2, `FIRST TO ${AC.LK_TARGET}  ${n - 1} OF ${n} BLOCKS UP`, C.GREY], [3, `LEGS ${AC.LK_FAST_TICKS / 125}`, C.YELLOW]]);
  assert.deepEqual(blocksOf(v)[MID].wait, AC.LK_BACK);
  // drawn: a cube over each standing block in its glow; the nearest waypointed for a fighter holding the starter alone
  const draw = (slot, shown = slot) => {
    const out = { solid: [], glow: [], beams: [], markers: [], zone: null };
    lk.draw(v, { dt: 0, now: 0, t: 1, slot, shown, me: slot >= 0 ? v.fighter(slot) : null, pme: null, cam: [0, 0, 0], view: v, pview: v }, out);
    return out;
  };
  let out = draw(1);
  assert.equal(out.solid.length, n - 1);
  assert.ok(out.solid.every((o) => o.kind === BLOCK && o.size === Number(AC.LK_HALF)) && out.glow.length === n - 1);
  assert.ok(!out.solid.some((o) => Math.hypot(o.pos[0] - 512, o.pos[2] - 512) < 0.1), 'not the broken one');
  assert.equal(out.markers.length, 1);
  const m = out.markers[0], me = v.fighter(1).pos;
  const d = (b) => Math.hypot(b.pos[0] - me[0], b.pos[2] - me[2]) + 3 * Math.abs(b.pos[1] - 1 - me[1]);
  const up = blocksOf(v).filter((b) => !b.wait).sort((a, b) => d(a) - d(b));
  assert.deepEqual([m.pos[0], m.pos[2], m.label], [up[0].pos[0], up[0].pos[2], '?']);
  loadout(g, 1, L.W_SHOTGUN, L.W_MAGNUM);
  assert.deepEqual(draw(1).markers, [], 'armed: none');
  assert.deepEqual(draw(-1, -1).markers, [], 'nobody shown');
  // news: what it paid, yellow or red; a banner for your own
  const feed = [], banners = [];
  const nctx = (slot) => ({ slot, me: slot >= 0 ? v.fighter(slot) : null, name: (p) => (p === slot ? 'YOU' : `P${p + 1}`), team: () => -1,
    feed: (s, col) => feed.push([s, col]), banner: (s, col) => banners.push([s, col]), glow() {}, sound: {}, dist: 10, C, now: 0, view: v });
  const f = (owner, shot) => ({ tick: v.tick, kind: L.FX_MODE, owner, shot, pos: [512, 21, 512], size: AC.LK_MX_ROLL });
  lk.news(f(6, L.W_ROCKET), nctx(0));
  lk.news(f(2, AC.LK_R_BOOM), nctx(0));
  lk.news(f(0, L.W_SNIPER), nctx(0));
  lk.news(f(0, AC.LK_R_RAIN), nctx(0));
  lk.news(f(4, AC.LK_R_OVER), nctx(-1));
  lk.news(f(4, AC.LK_R_FAST), nctx(-1));
  lk.news(f(4, AC.LK_R_FRAGS), nctx(-1));
  lk.news(f(4, 99), nctx(-1));
  assert.deepEqual(feed, [['P7 LUCKY ROCKET', C.YELLOW], ['P3 UNLUCKY', C.RED], ['YOU LUCKY SNIPER', C.YELLOW], ['YOU UNLUCKY FRAG RAIN', C.RED],
    ['P5 LUCKY OVERSHIELD', C.YELLOW], ['P5 LUCKY LEGS', C.YELLOW], ['P5 LUCKY FRAGS', C.YELLOW]]);
  assert.deepEqual(banners, [['LUCKY  SNIPER RIFLE', C.YELLOW], ['UNLUCKY  FRAG RAIN  RUN', C.RED]]);
  assert.deepEqual(lk.cols.map((k) => [k.head, k.get(v.fighter(0))]), [['BLOCKS', '1']]);
  assert.deepEqual(lk.state(v), { blocks: n, up: n - 1, leader: 0, winner: -1 });
  // goals: holding the starter alone, the nearest standing block at a hurry, to strike; armed, one within 40 m at none, or nothing
  loadout(g, 1, L.W_MAGNUM);
  const goal = (p) => lk.goal(v, v.fighter(p), { slot: p, t: v.tick });
  const g1 = goal(1);
  assert.deepEqual([g1.pos[0], g1.pos[2], g1.hurry, g1.hold, g1.strike], [up[0].pos[0], up[0].pos[2], 0.6, false, up[0].pos]);
  assert.ok(Math.abs(g1.pos[1] - (up[0].pos[1] - 1)) < 1e-5, 'the floor under it');
  loadout(g, 1, L.W_SHOTGUN, L.W_MAGNUM);
  assert.equal(goal(1).hurry, 0);
  put(g, 1, 300, 300);
  assert.equal(goal(1), null, 'armed, nothing within 40 m');
});

test('Lucky Blocks: an AI fighter alone holding the starter goes to a block and breaks it; one in sight 15 m off it shoots from there', async () => {
  const g = await room(1);
  const bot = new Fighter(0, 3, 0.6);
  put(g, 0, 470, 520);
  const t0 = g.v.tick;
  for (let i = 0; i < 2500 && broke(g, 0) === 0; i++) g.step([[L.EV_INPUT, 0, bot.think(g.v, g.v.tick)]]);
  assert.ok(broke(g, 0) === 1 && blocks(g).some((b) => b.wait > 0), 'it broke one');
  const took = g.v.tick - t0;
  assert.ok(took < 1500, `in ${took} ticks`);
  // a fighter with a block in sight 15 m off and nobody about: breaks it in under 5 s
  const h = await room(1);
  const b = blk(h, MID).pos;
  put(h, 0, b[0] - 15, b[2] + 2, b[1] - 1);
  const hb = new Fighter(0, 5, 0.6);
  let n = 0;
  for (; n < 625 && broke(h, 0) === 0; n++) h.step([[L.EV_INPUT, 0, hb.think(h.v, h.v.tick)]]);
  assert.ok(broke(h, 0) === 1 && blk(h, MID).wait > 0, `the middle one, in ${n} ticks`);
  assert.ok(Math.hypot(h.v.fighter(0).pos[0] - b[0], h.v.fighter(0).pos[2] - b[2]) > 8, 'shot from where it stood, near enough');
});

test('Lucky Blocks with 8 and 16 AI fighters: blocks broken for every kind of roll, guns found and used for kills; no trap on the debug build, the same hash on every tick on 1 and 4 threads', async (t) => {
  const [debug, bytes] = [arenaBytes(true), arenaBytes()];
  const ticks = 20000;
  for (const bots of [8, 16]) {
    const got = {};
    let k0 = 0, kills = 0, found = 0, all = 0, bareT = 0, samples = 0;
    const { log } = await playArena({ bytes: debug, seed: forcedSeed(L.M_LUCKY), bots, ticks, leaveAt: 1000,
      onTick: (tick, v) => {
        for (let k = Math.max(k0, v.fxCount() - L.FX_MAX); k < v.fxCount(); k++) {
          const f = v.fx(k);
          if (f.kind === L.FX_KILL && f.owner !== f.shot) { all++; if (f.size !== L.W_MAGNUM && f.size <= L.W_SWORD) found++; }
          if (f.kind === L.FX_MODE && f.size === AC.LK_MX_ROLL) got[f.shot] = (got[f.shot] || 0) + 1;
        }
        k0 = v.fxCount();
        if (tick % 125 === 0 && v.hole().state === L.H_PLAY) {
          for (let p = 0; p < bots; p++) { const o = v.fighter(p); if (o.live && !o.dead) { samples++; if (bare(o)) bareT++; } }
        }
      } });
    const n = Object.values(got).reduce((a, b) => a + b, 0);
    t.diagnostic(`${bots} fighters: ${n} blocks broken (${AC.LK_ROLLS.map((r) => `${rolled(r).toLowerCase()} ${got[r] || 0}`).join(', ')}), ${all} kills, ${found} with a gun from a block; holding the starter alone ${Math.round(100 * bareT / samples)}% of the time`);
    assert.ok(n >= 40, `${bots}: blocks broken`);
    assert.ok(AC.LK_ROLLS.filter((r) => got[r]).length >= 10, `${bots}: most rolls come up`);
    assert.ok(found >= 1 && all >= 15, `${bots}: kills, with what the blocks gave too`);
    assert.ok(bareT < 0.7 * samples, `${bots}: guns from the blocks carried`);
    const parsed = parseLog(log);
    const a = await replay({ bytes, log: parsed, ticks, threads: 1, tag: `lk${bots}x1` });
    const b = await replay({ bytes, log: parsed, ticks, threads: 4, tag: `lk${bots}x4`, startWorkers });
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(b.trace).tickHashes]);
  }
});
