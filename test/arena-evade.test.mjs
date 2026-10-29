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
import ed, { chasersOf, evadeOf, stateOf, nextIn, known, FACE, FACES } from '../client/am/evade.mjs';
import { AMC } from '../client/am/index.mjs';
import { C } from '../client/font.mjs';

// EVADE (src/am/evade.wat): everyone on one side against the chasers, records
// in AO moved by the sim; caught is downed (both PF_DOWN bits), the still
// beside the downed revive them, downed too long is out. Helpers as
// test/arena-vip.test.mjs has them; the chasers read straight from AO (its
// fields in src/am/evade.mjs).

let debugModule = null;
async function room(n = 2, { seed = 7, mode = L.M_EVADE, park: parked = true, play = true } = {}) {
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
const bleed = (g, p) => g.dv.getUint16(mr(p) + AC.ED_MR_BLEED, true);
const safe = (g, p) => g.sim.u8[mr(p) + AC.ED_MR_SAFE];
const help = (g, p) => g.dv.getUint16(L.AO + AC.ED_HELP + 2 * p, true);
const revives = (g, p) => g.dv.getUint16(mr(p) + L.MR_POINTS, true);
const stood = (g, p) => g.dv.getUint16(mr(p) + L.MR_AUX, true);
const steps = (g, n) => { for (let i = 0; i < n; i++) g.step(); };
const across = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

function put(g, p, x, z, y = g.v.height(x, z)) {
  g.dv.setFloat32(rec(p) + L.P_PX, x, true);
  g.dv.setFloat32(rec(p) + L.P_PY, y, true);
  g.dv.setFloat32(rec(p) + L.P_PZ, z, true);
  for (const o of [L.P_VX, L.P_VY, L.P_VZ]) g.dv.setFloat32(rec(p) + o, 0, true);
  g.sim.u8[rec(p) + L.P_FL] |= L.PF_GROUND;
}
// Slot p's place on open ground mid-field, 3 m from the next.
const park = (g, p) => put(g, p, 491 + 3 * (p % 8), 528 + 3 * (p >> 3));

// Chaser k as AO holds it, and set by hand (feet, velocity, stun, calm; still, on the ground, at full speed).
const ch = (g, k) => chasersOf(g.v)[k];
const cha = (k) => L.AO + AC.ED_CH + k * AC.ED_CSIZE;
function setCh(g, k, x, z, { y = g.v.stand(x, z, g.v.height(x, z) + 0.5), stun = 0, calm = 0, vx = 0, vz = 0 } = {}) {
  const c = cha(k);
  g.dv.setFloat32(c + AC.ED_C_X, x, true); g.dv.setFloat32(c + AC.ED_C_Y, y, true); g.dv.setFloat32(c + AC.ED_C_Z, z, true);
  g.dv.setFloat32(c + AC.ED_C_VX, vx, true); g.dv.setFloat32(c + AC.ED_C_VY, 0, true); g.dv.setFloat32(c + AC.ED_C_VZ, vz, true);
  g.dv.setFloat32(c + AC.ED_C_EASE, 1, true); g.dv.setFloat32(c + AC.ED_C_BEST, 1e9, true);
  g.dv.setUint16(c + AC.ED_C_STUN, stun, true); g.dv.setUint16(c + AC.ED_C_CALM, calm, true);
  for (const o of [AC.ED_C_PREY, AC.ED_C_TURN, AC.ED_C_STUCK, AC.ED_C_WANDER]) g.dv.setUint16(c + o, 0, true);
  g.sim.u8[c + AC.ED_C_GROUND] = 1; g.sim.u8[c + AC.ED_C_CLIMB] = 0;
}
// Every chaser but `keep` parked frozen in the canyon's far corner.
function bench(g, keep = []) {
  for (let k = 0; k < u32(g, L.AO + AC.ED_N); k++) if (!keep.includes(k)) setCh(g, k, 640, 580 - 4 * k, { stun: 60000 });
}

// A word that presses nothing new: the counters and bits as p last took them.
const still = (g, p) => { const f = g.v.fighter(p); return { shot: f.fired, melee: f.act & L.AB_MELEE, gren: (f.act >> 1) & 1 }; };
const word = (g, p, rest = {}) => arenaWord({ ...still(g, p), ...rest });

// FX of a kind (and size) from the running count `from` on, at most the ring's last FX_MAX
function fxs(v, kind, size, from = 0) {
  const outs = [];
  for (let k = Math.max(from, v.fxCount() - L.FX_MAX); k < v.fxCount(); k++) {
    const f = v.fx(k);
    if (f.kind === kind && (size === undefined || f.size === size)) outs.push(f);
  }
  return outs;
}
// Evade's news from `from` on: [what, owner, shot]
const news = (g, from) => fxs(g.v, L.FX_MODE, undefined, from).filter((f) => f.size >= AC.ED_MX_DOWN && f.size <= AC.ED_MX_END).map((f) => [f.size, f.owner, f.shot]);

// The spawn point a chaser comes in at: the farthest from every fighter in the fight and every chaser before it (the lowest such).
function farthest(g, before) {
  let best = -1, bd = -1;
  g.v.map().spawns.forEach((s, i) => {
    let md = 1e9;
    for (let q = 0; q < L.NPLAYER; q++) { const f = g.v.fighter(q); if (f.live && !f.dead) md = Math.min(md, (f.pos[0] - s[0]) ** 2 + (f.pos[2] - s[2]) ** 2); }
    for (const c of before) md = Math.min(md, (c[0] - s[0]) ** 2 + (c[2] - s[2]) ** 2);
    if (md > bd) { bd = md; best = i; }
  });
  return g.v.map().spawns[best];
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

test('Evade: nothing of it before play; as play starts ED_MIN chasers and one more for every ED_PER fighters, each at the spawn point farthest from everyone and the chasers before it; news; no sides, no hurting each other; an assault rifle and a magnum, no frags', async () => {
  const g = await room(4, { play: false });
  while (g.v.hole().state !== L.H_PLAY) {
    assert.ok(g.sim.u8.slice(L.AO, L.AO + L.AO_SIZE).every((x) => x === 0), 'the countdown');
    g.step();
  }
  // the tick play starts: the start hook alone
  const want = [];
  for (let k = 0; k < AC.ED_MIN; k++) want.push(farthest(g, want));
  assert.equal(u32(g, L.AO + AC.ED_N), AC.ED_MIN);
  chasersOf(g.v).forEach((c, k) => assert.deepEqual(c.pos, want[k], `chaser ${k}`));
  assert.deepEqual(news(g, 0), [[AC.ED_MX_COME, 255, 0], [AC.ED_MX_COME, 255, 1]]);
  assert.deepEqual(evadeOf(g.v), { chasers: 2, stand: 4, down: 0, out: 0, end: 0, caught: 0, ups: 0, stuns: 0 });
  for (let p = 0; p < 4; p++) {
    const f = g.v.fighter(p);
    assert.deepEqual([f.team, f.gun, f.grens, fl(g, p) & (L.PF_ZOMBIE | L.PF_JUGG | L.PF_BLUE | L.PF_CARRY | L.PF_FAST)], [-1, [L.W_AR, L.W_MAGNUM], 0, 0]);
    for (let q = 0; q < 4; q++) assert.equal(g.v.ally(p, q), p !== q);
  }
  // a rifle round point blank does nothing to another fighter
  bench(g); put(g, 0, 500, 510); put(g, 1, 505, 510);
  g.dv.setUint16(rec(0) + L.P_REFIRE, 0, true);
  const a = g.v.fighter(0), b = g.v.fighter(1);
  const { yaw, pitch } = aimAt([a.pos[0], a.pos[1] + 1.6, a.pos[2]], [b.pos[0], b.pos[1] + 1.1, b.pos[2]]);
  g.step([[L.EV_INPUT, 0, word(g, 0, { yaw, pitch, shot: (a.fired + 1) & 3 })]]);
  steps(g, 2);
  assert.equal(fxs(g.v, L.FX_SHOT).length, 1, 'the shot went off');
  assert.deepEqual([g.v.fighter(1).sh, g.v.fighter(1).hp], [100, 100]);
  // a crowd: one more chaser for every ED_PER fighters
  const crowd = await room(2 * AC.ED_PER, { park: false });
  assert.equal(u32(crowd, L.AO + AC.ED_N), AC.ED_MIN + 2);
});

test('more chasers as play goes: one every ED_WAVE ticks, at most one for every ED_SHARE fighters and one more (ED_MIN with fewer) and ED_MAX; they never go', async () => {
  for (const [n, cap] of [[1, 2], [2, 2], [4, 3], [8, 5], [12, 6], [16, 6]]) {
    const g = await room(n, { park: false });
    let was = u32(g, L.AO + AC.ED_N);
    assert.equal(was, Math.min(cap, AC.ED_MIN + Math.floor(n / AC.ED_PER)), `${n} fighters at the start`);
    for (let w = 1; w <= 6; w++) {
      // the clock to a tick before the next wave, then onto it
      g.dv.setUint32(L.HDR_START, g.v.tick - (w * AC.ED_WAVE - 1), true);
      g.step();
      assert.equal(u32(g, L.AO + AC.ED_N), was, `${n}: not a tick early`);
      g.step();
      const now = u32(g, L.AO + AC.ED_N);
      assert.equal(now, Math.min(cap, AC.ED_MIN + Math.floor(n / AC.ED_PER) + w), `${n} fighters, wave ${w}`);
      if (now > was) assert.equal(news(g, g.v.fxCount() - 40).filter(([m, , k]) => m === AC.ED_MX_COME && k === now - 1).length, 1);
      was = now;
    }
    assert.equal(nextIn(g.v), null, `${n}: none to come`);
  }
  // fighters leaving takes none away
  const g = await room(8, { park: false });
  g.dv.setUint32(L.HDR_START, g.v.tick - 3 * AC.ED_WAVE, true);
  g.step();
  assert.equal(u32(g, L.AO + AC.ED_N), 5);
  g.step(Array.from({ length: 6 }, (_, p) => [L.EV_LEAVE, p + 2]));
  steps(g, 3);
  assert.equal(u32(g, L.AO + AC.ED_N), 5);
});

// Chaser 0 after slot 0 (the rest frozen far off, slot 0 not safe) from (x, z), slot 0 at (fx, fz[, fy]) on word w:
// steps until it's caught or `ticks` pass; what each tick did.
async function chase(x, z, fx, fz, { cy, fy, w = arenaWord({}), ticks = 3000 } = {}) {
  const g = await room(1);
  bench(g, [0]);
  put(g, 0, fx, fz, fy);
  setCh(g, 0, x, z, cy === undefined ? {} : { y: cy });
  g.sim.u8[mr(0) + AC.ED_MR_SAFE] = 0;
  const path = [];
  for (let t = 0; t < ticks && !down(g, 0); t++) {
    g.step([[L.EV_INPUT, 0, w]]);
    const c = ch(g, 0), f = g.v.fighter(0);
    path.push({ c: c.pos, v: Math.hypot(c.vel[0], c.vel[2]), climb: c.climb, ease: g.dv.getFloat32(cha(0) + AC.ED_C_EASE, true), f: f.pos, fv: Math.hypot(f.vel[0], f.vel[2]) });
  }
  return { g, path, caught: down(g, 0) ? path.length : -1 };
}
const g0 = (g, p) => g.v.height(p[0], p[2]);

test('a chaser runs ED_RUN on the flat, faster than a fighter runs, and catches one running straight; up stairs it slows to ED_SLOW of it at once, and gets its speed back by ED_EASE', async () => {
  // a runner straight down the field with a 12 m start
  const run = await chase(488, 528, 500, 528, { w: arenaWord({ yaw: 0, move: 1 }) });
  const late = run.path.slice(400);
  assert.ok(run.caught > 0, 'caught');
  assert.ok(late.every((p) => Math.abs(p.fv - Number(L.PHYS.RUN)) < 0.05), 'the fighter at RUN');
  const fast = late.filter((p) => p.v > Number(AC.ED_RUN) - 0.01).length;
  assert.ok(fast > 0.8 * late.length, `at ED_RUN ${fast} of ${late.length} ticks`);
  // the gap closes at the difference, give or take its start and the ground's rises
  const secs = run.caught / 125, closing = 12 / (Number(AC.ED_RUN) - Number(L.PHYS.RUN));
  assert.ok(secs > closing && secs < closing + 2.5, `caught in ${secs} s (${closing} at full speed all the way)`);
  // up the red base's stairs, 0.4 m a step, to a fighter halfway up: slowed at each step, slower than a run all the way
  const up = await chase(401.0, 519.2, 396.8, 519.2, { cy: 21.4, fy: 23.4 });
  assert.ok(up.caught > 0);
  const climbs = up.path.filter((p, k) => k > 0 && p.c[1] > up.path[k - 1].c[1] + 0.3);
  assert.ok(climbs.length >= 3, 'a step at a time');
  for (const p of climbs) assert.ok(p.ease < Number(AC.ED_SLOW) + 0.02, `slowed at a step: ${p.ease}`);
  const span = across(up.path[0].c, up.path.at(-1).c);
  assert.ok(up.caught / 125 > 2 * span / Number(L.PHYS.RUN), `${span} m of stairs in ${up.caught / 125} s: under half a run`);
  // the canyon floor barely slows it
  assert.ok(run.path.every((p) => p.ease > 0.85), 'the flat');
});

test('a ledge it can\'t step onto is climbed at ED_CLIMB when its prey is up there (a rock; a base\'s roof, out of the base first, up the outer wall and over the parapet); with its prey on the ground beyond, it goes round', async () => {
  // a fighter on the west rocks' top, the chaser on the ground short of them
  const rock = await chase(454.5, 440, 454.5, 453.5, { fy: 23.4 });
  assert.ok(rock.caught > 0 && rock.caught < 500, `caught on the rock in ${rock.caught} ticks`);
  assert.ok(rock.path.filter((p) => p.climb).length > 10, 'it climbed');
  for (let k = 1; k < rock.path.length; k++) {
    if (rock.path[k].climb) assert.ok(Math.abs(rock.path[k].c[1] - rock.path[k - 1].c[1] - Number(AC.ED_CLIMB) * Number(L.PHYS.DT)) < 1e-4, 'ED_CLIMB a tick');
  }
  // the same rocks between it and a fighter on the ground: round them, never on top
  const round = await chase(454.5, 442, 454.5, 466);
  assert.ok(round.caught > 0 && round.caught < 500);
  assert.ok(round.path.every((p) => !p.climb), 'no climb');
  // a fighter on the red base's roof, the chaser inside under it: out of a door, up the outer wall and over the parapet
  const roof = await chase(395, 508, 392, 508, { cy: 21, fy: 25.8 });
  assert.ok(roof.caught > 0, 'caught on the roof');
  const outAt = roof.path.findIndex((p) => p.c[0] > 402.5 || p.c[0] < 381.5 || p.c[2] > 521.5 || p.c[2] < 502.5);
  const upAt = roof.path.findIndex((p) => p.climb);
  assert.ok(outAt > 0 && upAt > outAt, `out (${outAt}) before it climbs (${upAt})`);
  assert.ok(Math.max(...roof.path.map((p) => p.c[1])) >= 26.8 - 1e-3, 'over the parapet');
  // a fighter on the floor inside, the chaser outside: in by a door, never up the walls
  const inside = await chase(420, 508, 392, 508, { fy: 21 });
  assert.ok(inside.caught > 0 && inside.path.every((p) => !p.climb && p.c[1] < 21.6), 'in by the door');
});

// Chaser k on top of slot p, the rest benched, p not safe: p is caught on the next tick.
function catchOn(g, p, k = 0) {
  bench(g, [k]);
  const f = g.v.fighter(p);
  setCh(g, k, f.pos[0] + 0.3, f.pos[2], { y: f.pos[1] });
  g.sim.u8[mr(p) + AC.ED_MR_SAFE] = 0;
  g.step();
  assert.ok(down(g, p), `P${p} caught`);
}

test('a catch: the chaser that reaches a standing fighter downs it (both PF_DOWN bits), ED_BLEED to bleed, counted, news; it stops ED_PAUSE ticks; a fighter just revived or just in is safe ED_SAFE ticks; the downed are nobody\'s prey', async () => {
  const g = await room(3);
  const k0 = g.v.fxCount();
  catchOn(g, 0);
  assert.deepEqual([fl(g, 0) & L.PF_DOWN, bleed(g, 0), help(g, 0)], [L.PF_DOWN, AC.ED_BLEED, 0]);
  assert.deepEqual(news(g, k0), [[AC.ED_MX_DOWN, 0, 0]]);
  assert.deepEqual(fxs(g.v, L.FX_MODE, AC.ED_MX_DOWN, k0)[0].pos, g.v.fighter(0).pos, 'at its feet');
  assert.deepEqual([ch(g, 0).stun, evadeOf(g.v).caught, evadeOf(g.v).stand, evadeOf(g.v).down], [AC.ED_PAUSE, 1, 2, 1]);
  assert.ok(g.v.fighter(0).down && !g.v.fighter(0).carry && g.v.fighter(0).live && !g.v.fighter(0).dead);
  // stopped: another fighter on it isn't caught until the pause is out, and then at once
  const c = ch(g, 0);
  put(g, 1, c.pos[0], c.pos[2], c.pos[1]);
  g.sim.u8[mr(1) + AC.ED_MR_SAFE] = 0;
  for (let t = 1; t < AC.ED_PAUSE; t++) { g.step(); assert.ok(!down(g, 1), `paused, tick ${t}`); }
  g.step();
  assert.ok(down(g, 1), 'caught once the pause is out');
  // safe: ED_SAFE ticks after it's set, then caught
  g.sim.u8[mr(2) + AC.ED_MR_SAFE] = 40;
  const f2 = g.v.fighter(2);
  setCh(g, 0, f2.pos[0] + 0.3, f2.pos[2], { y: f2.pos[1] });
  let t = 0;
  while (!down(g, 2)) {
    const p = g.v.fighter(2).pos;
    setCh(g, 0, p[0] + 0.3, p[2], { y: p[1] });
    g.step(); t++;
  }
  assert.equal(t, 40, 'caught on the tick it stops being safe');
  // the downed are nobody's prey: with everyone down there is none, and the match is over
  assert.equal(g.v.hole().state, L.H_OVER);
  // a chaser goes for the nearest standing fighter, the downed passed over
  const h = await room(2);
  bench(h, [0]);
  put(h, 0, 500, 528); put(h, 1, 530, 528);
  setCh(h, 0, 505, 528);
  h.step();
  assert.equal(ch(h, 0).prey, 0);
  h.sim.u8[rec(0) + L.P_FL] |= L.PF_DOWN; h.dv.setUint16(mr(0) + AC.ED_MR_BLEED, AC.ED_BLEED, true);
  h.step();
  assert.equal(ch(h, 0).prey, 1, 'the one standing');
});

test('downed: a crawl at ED_CRAWL at most, no jump, no shot, no swing, no frag, no reload; the prediction bit for bit through it all', async () => {
  const g = await room(2);
  catchOn(g, 0);
  bench(g);
  g.dv.setUint16(rec(0) + L.A_COOL, 0, true);
  const shots0 = g.v.fighter(0).shots, k0 = g.v.fxCount();
  const inputs = [];
  for (let k = 0; k < 400; k++) {
    inputs.push(arenaWord({ yaw: 30 * k, pitch: 480, move: k < 150 ? 1 : k < 300 ? 9 : 2, jump: k % 40 === 5 ? 1 : 0, shot: (k >> 3) & 3, melee: (k >> 5) & 1,
      gren: (k >> 4) & 1, slot: k >= 200 && k < 260 ? 1 : 0, serial: (arenaFrame({ lag: 4, reload: k > 100 }) >> ((g.v.tick + k) & 7)) & 1 }));
  }
  let top = 0, ground = 0;
  const compared = predicted(g, 0, inputs.slice(0, 1));
  for (const w of inputs.slice(1)) {
    g.step([[L.EV_INPUT, 0, w]]);
    const f = g.v.fighter(0);
    top = Math.max(top, Math.hypot(f.vel[0], f.vel[2]));
    ground = Math.max(ground, f.pos[1] - g.v.stand(f.pos[0], f.pos[2], f.pos[1] + 0.5));
  }
  assert.ok(compared > 0);
  // (a hair over it off a bump, as any fighter's air control turning)
  assert.ok(top <= 1.25 * Number(AC.ED_CRAWL) && top > Number(AC.ED_CRAWL) - 0.1, `a crawl: ${top}`);
  assert.ok(ground < 0.05, 'never off the ground');
  const f = g.v.fighter(0);
  assert.deepEqual([f.shots, f.grens, f.reload, fxs(g.v, L.FX_SHOT, undefined, k0).length, fxs(g.v, L.FX_MELEE, undefined, k0).length], [shots0, 0, 0, 0, 0]);
  assert.ok(down(g, 0), 'still down');
  // bit for bit, predicted from every tick
  const h = await room(2);
  catchOn(h, 0);
  bench(h);
  assert.ok(predicted(h, 0, inputs) > 400);
});

test('a revive: a standing fighter still (under ED_STILL) within ED_REACH across and ED_REACH_H up or down for ED_REVIVE ticks, to the tick; moving or off, it starts over; no bleeding while it lasts; the lowest slot\'s revive; ED_SAFE after; news', async () => {
  const g = await room(4);
  catchOn(g, 0);
  bench(g);
  const p0 = g.v.fighter(0).pos;
  put(g, 1, p0[0] + 1.9, p0[2], p0[1]);
  put(g, 2, p0[0] + 2.1, p0[2] + 0.5, p0[1]);
  put(g, 3, 540, 528);
  const b0 = bleed(g, 0);
  for (let t = 1; t < AC.ED_REVIVE; t++) { g.step(); assert.deepEqual([help(g, 0), bleed(g, 0), down(g, 0)], [t, b0, true], `tick ${t}`); }
  // a nudge: moving at over ED_STILL starts it over, and the bleeding goes on
  g.dv.setFloat32(rec(1) + L.P_VX, 2, true);
  g.step();
  assert.deepEqual([help(g, 0), bleed(g, 0)], [0, b0 - 1]);
  steps(g, 30);
  const k0 = g.v.fxCount();
  put(g, 1, p0[0] + 1.9, p0[2], p0[1]);
  put(g, 2, p0[0] - 1.5, p0[2], p0[1]);
  for (let t = 1; t < AC.ED_REVIVE; t++) g.step();
  assert.ok(down(g, 0));
  g.step();
  assert.ok(!down(g, 0) && g.v.fighter(0).live && !g.v.fighter(0).dead, 'up again');
  assert.deepEqual([help(g, 0), bleed(g, 0), safe(g, 0), revives(g, 1), revives(g, 2), evadeOf(g.v).ups], [0, 0, AC.ED_SAFE, 1, 0, 1]);
  assert.deepEqual(news(g, k0), [[AC.ED_MX_UP, 1, 0]]);
  // safe ED_SAFE: it counts down from the next tick
  g.step();
  assert.equal(safe(g, 0), AC.ED_SAFE - 1);
  // not from the roof over it (2.1 m across was P2 before), nor by another downed
  const h = await room(3);
  put(h, 0, 392, 508, 21);
  catchOn(h, 0);
  put(h, 1, 393, 508, 21);
  catchOn(h, 1);
  bench(h);
  put(h, 2, 392.5, 508.5, 25.8);
  steps(h, 50);
  assert.deepEqual([help(h, 0), help(h, 1), Math.fround(h.v.fighter(2).pos[1])], [0, 0, Math.fround(25.8)]);
});

test('bleeding out: downed ED_BLEED ticks with nobody reviving it, it is out on the tick that runs out: PF_DEAD, a death, never back while the match lasts, nobody\'s to revive; news', async () => {
  const g = await room(3);
  catchOn(g, 0);
  bench(g);
  put(g, 1, 520, 528); put(g, 2, 525, 528);
  const k0 = g.v.fxCount();
  for (let t = 1; t < AC.ED_BLEED; t++) g.step();
  assert.ok(down(g, 0) && !out(g, 0) && bleed(g, 0) === 1);
  g.step();
  const f = g.v.fighter(0);
  assert.ok(out(g, 0) && !f.down && f.live, 'out');
  assert.deepEqual([f.deaths, bleed(g, 0), evadeOf(g.v).out, evadeOf(g.v).stand, f.respawn], [1, 0, 1, 2, 0xffff]);
  assert.deepEqual(news(g, k0), [[AC.ED_MX_OUT, 0, 0]]);
  // beside it, still, no revive; and it stays out
  put(g, 1, f.pos[0] + 1, f.pos[2], f.pos[1]);
  steps(g, AC.ED_REVIVE + 10);
  assert.ok(out(g, 0) && help(g, 0) === 0);
  steps(g, 5000);
  assert.ok(out(g, 0), 'never back');
  assert.ok(stood(g, 0) < stood(g, 1), 'no more time standing');
});

// p's rifle round at the point `at`, its refire waited out and its frame's lag `lag` ticks.
function fire(g, p, at, lag = 0) {
  g.dv.setUint16(rec(p) + L.P_REFIRE, 0, true);
  g.sim.u8[rec(p) + L.A_LAG] = lag;
  const a = g.v.fighter(p);
  const { yaw, pitch } = aimAt([a.pos[0], a.pos[1] + 1.6, a.pos[2]], at);
  g.step([[L.EV_INPUT, p, word(g, p, { yaw, pitch, shot: (a.fired + 1) & 3 })]]);
  g.step([[L.EV_INPUT, p, word(g, p, { yaw, pitch })]]);
}

test('a stun: a round through a chaser\'s face, where the shooter saw it (back by its velocity over the shooter\'s view lag), stops it ED_STUN ticks, catching nobody; then ED_CALM no round stuns it; news at it', async () => {
  const g = await room(2);
  bench(g, [0]);
  put(g, 1, 500, 520);
  put(g, 0, 470, 560);
  setCh(g, 0, 500, 535, { stun: 2 });
  steps(g, 2);
  const c = ch(g, 0), k0 = g.v.fxCount();
  fire(g, 1, [c.pos[0], c.pos[1] + Number(AC.ED_HIT_Y), c.pos[2]]);
  const s = ch(g, 0);
  assert.ok(s.stun >= AC.ED_STUN - 2 && s.stun <= AC.ED_STUN, `stunned: ${s.stun}`);
  assert.equal(s.calm - s.stun, AC.ED_CALM);
  assert.deepEqual([news(g, k0), evadeOf(g.v).stuns], [[[AC.ED_MX_STUN, 1, 0]], 1]);
  const at = fxs(g.v, L.FX_MODE, AC.ED_MX_STUN, k0)[0].pos;
  assert.ok(Math.hypot(at[0] - c.pos[0], at[1] - c.pos[1] - Number(AC.ED_HIT_Y), at[2] - c.pos[2]) <= Number(AC.ED_HIT_R) + 1e-3, 'news on its face');
  // stunned, it catches nobody standing on it
  put(g, 0, s.pos[0], s.pos[2], s.pos[1]);
  g.sim.u8[mr(0) + AC.ED_MR_SAFE] = 0;
  const left = ch(g, 0).stun;
  for (let t = 0; t < left - 1; t++) {
    const p = ch(g, 0).pos;
    put(g, 0, p[0], p[2], p[1]);
    g.step();
    assert.ok(!down(g, 0), `stunned, tick ${t}`);
  }
  // calm: another round does nothing
  const calm = ch(g, 0).calm;
  put(g, 0, 470, 560);
  const p1 = ch(g, 0).pos;
  fire(g, 1, [p1[0], p1[1] + Number(AC.ED_HIT_Y), p1[2]]);
  assert.ok(ch(g, 0).stun === 0 && evadeOf(g.v).stuns === 1 && ch(g, 0).calm < calm, 'calm');
  // where the shooter saw it: a chaser running across at 10 m/s, a round at where it was 20 ticks back
  const h = await room(2);
  bench(h, [0]);
  put(h, 1, 500, 520); put(h, 0, 470, 560);
  for (const [lag, hit] of [[20, 1], [0, 0]]) {
    setCh(h, 0, 500, 535, { vx: 10, stun: 1, calm: 0 });
    h.dv.setUint16(cha(0) + AC.ED_C_CALM, 0, true);
    const was = evadeOf(h.v).stuns;
    // (the round goes before the chaser moves this tick: it is where the record has it)
    const q = ch(h, 0);
    h.dv.setUint16(cha(0) + AC.ED_C_STUN, 0, true);
    h.dv.setUint16(rec(1) + L.P_REFIRE, 0, true);
    h.sim.u8[rec(1) + L.A_LAG] = lag;
    const a = h.v.fighter(1);
    const { yaw, pitch } = aimAt([a.pos[0], a.pos[1] + 1.6, a.pos[2]], [q.pos[0] - 10 * 20 * Number(L.PHYS.DT), q.pos[1] + Number(AC.ED_HIT_Y), q.pos[2]]);
    h.step([[L.EV_INPUT, 1, word(h, 1, { yaw, pitch, shot: (a.fired + 1) & 3 })]]);
    assert.equal(evadeOf(h.v).stuns - was, hit, `lag ${lag}`);
    steps(h, 3);
  }
});

test('the end: nobody standing ends it on that tick (ED_END 2); at the clock someone standing survives it (ED_END 1); news; places: standing at the end, then ticks standing, then revives; a Fiesta after Evade is exactly a Fiesta\'s region', async () => {
  const g = await room(3);
  g.dv.setUint16(mr(0) + L.MR_AUX, 500, true); g.dv.setUint16(mr(1) + L.MR_AUX, 900, true); g.dv.setUint16(mr(2) + L.MR_AUX, 500, true);
  g.dv.setUint16(mr(2) + L.MR_POINTS, 1, true);
  catchOn(g, 0);
  catchOn(g, 1);
  assert.equal(g.v.hole().state, L.H_PLAY);
  const k0 = g.v.fxCount();
  catchOn(g, 2);
  assert.equal(g.v.hole().state, L.H_OVER, 'over on the tick');
  assert.deepEqual([evadeOf(g.v).end, news(g, k0).filter(([m]) => m === AC.ED_MX_END)], [2, [[AC.ED_MX_END, 255, 0]]]);
  assert.deepEqual([0, 1, 2].map((p) => g.v.fighter(p).place), [3, 1, 2]);
  assert.equal(ed.over(g.v), 'THE CHASERS GOT EVERYONE');
  // at the clock: one out, one down, one standing
  const h = await room(3);
  for (const p of [0, 1, 2]) h.dv.setUint16(mr(p) + L.MR_AUX, 2000 - 500 * p, true);
  catchOn(h, 0);
  catchOn(h, 1);
  h.dv.setUint16(mr(1) + AC.ED_MR_BLEED, 1, true);
  bench(h);
  h.step();
  assert.ok(out(h, 1));
  const k1 = h.v.fxCount();
  h.dv.setUint32(L.HDR_UNTIL, h.v.tick + 1, true);
  steps(h, 2);
  assert.deepEqual([h.v.hole().state, evadeOf(h.v).end], [L.H_OVER, 1]);
  assert.deepEqual(news(h, k1).filter(([m]) => m === AC.ED_MX_END), [[AC.ED_MX_END, 255, 1]]);
  assert.deepEqual([0, 1, 2].map((p) => h.v.fighter(p).place), [2, 3, 1], 'the one standing first, though it stood least');
  assert.equal(ed.over(h.v), '1 SURVIVED');
  // the next match a Fiesta (the seed no longer forcing Evade; the rotation's first): its region exactly a Fiesta's
  h.dv.setUint32(L.HDR_SEED, 7, true);
  h.dv.setUint32(L.HDR_HOLE, L.ARENA_MODES.length - 1, true);
  while (h.v.hole().state !== L.H_PLAY) h.step();
  h.step();
  assert.equal(h.v.mode().mode, L.M_FIESTA);
  const zero = (a, b) => h.sim.u8.slice(a, b).every((x) => x === 0);
  assert.ok(zero(L.AH_MODE, L.AH_END), 'the header');
  assert.ok(zero(L.AO, L.AO + L.AO_SIZE), 'the chasers');
  assert.ok(zero(L.MODE_REC, L.MODE_REC + L.NPLAYER * L.MR_SIZE), 'the records');
  if (L.FIESTA) assert.ok(zero(L.PAD, L.PAD + L.NPAD * L.PAD_SIZE), 'the pads');
  for (const p of [0, 1, 2]) {
    const f = h.v.fighter(p);
    assert.ok(f.live && !f.dead && !f.down && (fl(h, p) & (L.PF_BLUE | L.PF_CARRY | L.PF_JUGG | L.PF_ZOMBIE | L.PF_FAST)) === 0 && f.grens === 2, `P${p} as anyone's`);
  }
  steps(h, 500);
  assert.ok(zero(L.AH_MODE, L.AH_END) && zero(L.AO, L.AO + L.AO_SIZE) && zero(L.MODE_REC, L.MODE_REC + L.NPLAYER * L.MR_SIZE));
});

test('joins and leaves mid-match: a join comes in standing, at a spawn point no chaser is within ED_BAR of, safe ED_SAFE; a downed fighter leaving, its slot taken again, comes in standing; a chaser\'s prey leaving, it takes the next', async () => {
  const g = await room(2);
  bench(g, [0]);
  // a chaser at every spawn point but the last
  const spawns = g.v.map().spawns;
  setCh(g, 0, spawns[0][0], spawns[0][2], { stun: 60000 });
  for (let k = 1; k < u32(g, L.AO + AC.ED_N); k++) setCh(g, k, spawns[k][0], spawns[k][2], { stun: 60000 });
  const free = spawns.filter((s) => chasersOf(g.v).every((c) => across(c.pos, s) >= Number(AC.ED_BAR)));
  assert.ok(free.length > 0 && free.length < spawns.length);
  for (let n = 0; n < 6; n++) {
    g.step([[L.EV_JOIN, 2]]);
    const f = g.v.fighter(2);
    assert.ok(f.live && !f.down && !f.dead);
    assert.ok(free.some((s) => across(s, f.pos) < 0.01), 'away from the chasers');
    assert.deepEqual([f.gun, f.grens], [[L.W_AR, L.W_MAGNUM], 0]);
    assert.equal(safe(g, 2), AC.ED_SAFE - 1, 'safe from the tick it comes in');
    g.step([[L.EV_LEAVE, 2]]);
    g.step();
  }
  // a downed fighter leaves; its slot comes back standing, nothing of the downing left
  catchOn(g, 1);
  bench(g);
  g.step([[L.EV_LEAVE, 1]]);
  assert.equal(evadeOf(g.v).down, 0);
  g.step([[L.EV_JOIN, 1]]);
  g.step();
  assert.ok(!down(g, 1) && bleed(g, 1) === 0 && stood(g, 1) === 2, "its count from the start");
  // the prey leaves: the chaser after the next
  const h = await room(3);
  bench(h, [0]);
  put(h, 0, 500, 528); put(h, 1, 540, 528); put(h, 2, 560, 528);
  setCh(h, 0, 495, 528);
  h.step();
  assert.equal(ch(h, 0).prey, 0);
  h.step([[L.EV_LEAVE, 0]]);
  assert.equal(ch(h, 0).prey, 1);
});

test('Evade\'s client module: the chasers, counts and states as AO and the records have them; faces run on by dt, REVIVE waypoints; HUD lines, news, the board; the AI fighter\'s goals', async () => {
  const cd = await room(2, { play: false });
  const lines = (g, slot, extra = {}) => {
    const outs = [];
    ed.hud(g.v, { put: (x, y, s, c) => outs.push([y, s, c]), centre: (y, s, c) => outs.push(['mid', s, c]), right() {}, rect() {}, rows: 33, C, slot, me: g.v.fighter(slot),
      team: -1, now: 0, t: 1, ...extra });
    return outs;
  };
  assert.deepEqual(lines(cd, 0), [[0, 'EVERYONE AGAINST THE CHASERS', C.YELLOW], [1, 'STAND STILL BY THE DOWNED', C.GREY], [2, 'TO REVIVE THEM', C.GREY]]);
  const gctx = (g, slot) => ({ role: 'attack', rank: 0, view: g.v, ally: (p, q) => g.v.ally(p, q), slot, t: g.v.tick });
  assert.equal(ed.goal(cd.v, cd.v.fighter(0), gctx(cd, 0)), null, 'nothing to do before play');

  const g = await room(4);
  const v = g.v;
  bench(g);
  setCh(g, 0, 470, 528, { stun: 60000 });
  setCh(g, 1, 640, 580, { vx: 3 });
  assert.deepEqual(chasersOf(v).map((c) => [c.k, c.pos, c.stun > 0]), [[0, [470, v.stand(470, 528, v.height(470, 528) + 0.5), 528], true], [1, ch(g, 1).pos, false]]);
  assert.deepEqual(stateOf(v, 0), { state: 'up', bleed: 0, help: 0, safe: safe(g, 0) });
  // the HUD: you standing, the room's counts, the chasers and the next to come
  assert.deepEqual(lines(g, 0), [[0, 'YOU: STANDING', C.YELLOW], [1, '4 STANDING  0 DOWN  0 OUT', C.GREY],
    [2, `2 CHASERS  NEXT IN 0:${String(Math.floor(nextIn(v) / 125) % 60).padStart(2, '0')}`, C.ORANGE]]);
  catchOn(g, 1, 1);
  bench(g, [0]);
  setCh(g, 1, 640, 580, { stun: 60000 });
  put(g, 0, 491, 528);
  const l1 = lines(g, 1);
  assert.deepEqual(l1[0].slice(0, 2), [0, `YOU: DOWN  OUT IN ${Math.ceil(bleed(g, 1) / 125)}`]);
  assert.deepEqual(l1.at(-1), ['mid', 'DOWN  CRAWL TO A FRIEND', C.RED]);
  // being revived, and reviving: the middle line and its bar
  const p1 = v.fighter(1).pos;
  put(g, 2, p1[0] + 1, p1[2], p1[1]);
  steps(g, 40);
  assert.equal(help(g, 1), 40);
  assert.deepEqual(lines(g, 1).at(-1), ['mid', 'BEING REVIVED  HOLD ON', C.GREEN]);
  assert.deepEqual(lines(g, 2).at(-1), ['mid', 'REVIVING P2  HOLD STILL', C.GREEN]);
  assert.deepEqual(lines(g, 2, { watching: true, mine: 3 })[0][1], 'P3: STANDING', 'a watcher sees whose it is');
  // drawn: a face a chaser, run on by dt unless stunned, its alpha one of FACES; a REVIVE waypoint on the downed, but the one shown
  const draw = (slot, shown = slot, dt = 0) => {
    const o = { solid: [], glow: [], beams: [], markers: [], zone: null };
    ed.draw(v, { dt, now: 0, t: 1, slot, shown, me: slot >= 0 ? v.fighter(slot) : null, pme: null, cam: [0, 0, 0], view: v, pview: v }, o);
    return o;
  };
  setCh(g, 0, 470, 528, { stun: 60000 });
  setCh(g, 1, 600, 560, { vx: 5 });
  const o = draw(0, 0, 0.1);
  assert.deepEqual(o.solid.map((s) => s.kind), [FACE, FACE]);
  assert.ok(Math.abs(o.solid[1].pos[0] - 600.5) < 1e-4 && Math.abs(o.solid[0].pos[0] - 470) < 1e-4, 'run on by dt, the stunned one not');
  assert.deepEqual(o.solid.map((s) => Math.floor(s.color[3] * FACES)), [0, 1]);
  assert.deepEqual(o.markers.map((m) => [m.label, m.color]), [['REVIVING', C.GREEN]]);
  assert.equal(draw(1).markers.length, 0, 'none over your own head');
  // news
  const feed = [], banners = [];
  const nctx = (slot) => ({ slot, me: v.fighter(slot), name: (p) => (p === slot ? 'YOU' : `P${p + 1}`), team: () => -1,
    feed: (s, col) => feed.push([s, col]), banner: (s, col) => banners.push([s, col]), glow() {}, sound: {}, dist: 10, C, now: 0, view: v });
  const f = (size, owner, shot) => ({ tick: v.tick, kind: L.FX_MODE, owner, shot, pos: [512, 20, 512], size });
  ed.news(f(AC.ED_MX_DOWN, 1, 0), nctx(1));
  ed.news(f(AC.ED_MX_DOWN, 1, 0), nctx(0));
  ed.news(f(AC.ED_MX_UP, 2, 1), nctx(1));
  ed.news(f(AC.ED_MX_UP, 2, 1), nctx(2));
  ed.news(f(AC.ED_MX_OUT, 3, 3), nctx(3));
  ed.news(f(AC.ED_MX_COME, 255, 0), nctx(0));
  ed.news(f(AC.ED_MX_COME, 255, AC.ED_MIN), nctx(0));
  ed.news(f(AC.ED_MX_LAST, 0, 0), nctx(0));
  ed.news(f(AC.ED_MX_END, 255, 2), nctx(0));
  ed.news(f(AC.ED_MX_END, 255, 0), nctx(0));
  assert.deepEqual(feed, [['YOU WERE CAUGHT', C.RED], ['P2 WAS CAUGHT', C.RED], ['P3 REVIVED YOU', C.GREEN], ['YOU REVIVED P2', C.GREEN], ['YOU ARE OUT', C.WHITE],
    ['THE CHASERS ARE LOOSE', C.ORANGE], ['ANOTHER CHASER IS LOOSE', C.ORANGE], ['YOU ARE THE LAST ONE STANDING', C.YELLOW]]);
  assert.deepEqual(banners, [['CAUGHT  CRAWL TO A FRIEND', C.RED], ['BACK ON YOUR FEET', C.GREEN], ['YOU REVIVED P2', C.GREEN], ['YOU ARE OUT  WATCH THE OTHERS', C.RED],
    ['ANOTHER CHASER', C.ORANGE], ['LAST ONE STANDING', C.YELLOW], ['2 SURVIVED', C.GREEN], ['THE CHASERS GOT EVERYONE', C.RED]]);
  // the board
  g.dv.setUint16(mr(2) + L.MR_POINTS, 3, true);
  assert.deepEqual(ed.cols.map((k) => [k.head, k.get(v.fighter(2))]), [['REVIVES', '3'], ['STOOD', `0:${String(Math.floor(stood(g, 2) / 125)).padStart(2, '0')}`], ['NOW', 'UP']]);
  assert.deepEqual([ed.cols[2].get(v.fighter(1)), ed.own, ed.kills, ed.dead(), ed.watch(v, 1), ed.watch(v, 2)], ['DOWN', true, false, 'OUT  SPECTATING', false, true]);
  assert.ok(ed.standing(v.fighter(2)) > ed.standing(v.fighter(1)), 'standing first');
  assert.deepEqual(AMC[L.M_EVADE], ed);

  // the AI fighter: shown a chaser coming inside 40 m it runs off, farther from it; inside JUKE, a step square to its way
  const h = await room(3);
  bench(h, [0]);
  put(h, 0, 500, 528); put(h, 1, 560, 540); put(h, 2, 560, 545);
  setCh(h, 0, 475, 528, { vx: 11 });
  const me = h.v.fighter(0);
  let goal = ed.goal(h.v, me, gctx(h, 0));
  assert.ok(goal.flee && !goal.dodge && across(goal.pos, ch(h, 0).pos) > across(me.pos, ch(h, 0).pos), 'away from it');
  assert.ok(goal.shoot && Math.abs(goal.shoot[0] - (475 + 1.1)) < 0.01, 'and shoots it');
  setCh(h, 0, 496, 528, { vx: 11 });
  goal = ed.goal(h.v, me, gctx(h, 0));
  assert.ok(goal.dodge && Math.abs(goal.pos[2] - 528) > 5, 'a juke');
  // one it can't see, beyond HEAR, behind the red base: it doesn't know of it
  put(h, 0, 420, 512);
  setCh(h, 0, 370, 512, { vx: 11 });
  assert.equal(known(h.v, [420, h.v.fighter(0).pos[1] + 1.6, 512]).length, 0);
  goal = ed.goal(h.v, h.v.fighter(0), gctx(h, 0));
  assert.ok(goal && !goal.flee, 'it roams on');
  // a teammate down, every chaser it knows of far off: there, to hold still; downed, to the nearest friend, then still by it
  setCh(h, 0, 640, 580, { stun: 60000 });
  put(h, 0, 500, 528);
  catchOn(h, 1, 1);
  bench(h);
  goal = ed.goal(h.v, h.v.fighter(0), gctx(h, 0));
  assert.ok(goal.still && goal.hold && across(goal.pos, h.v.fighter(1).pos) < 0.01, 'to revive it');
  goal = ed.goal(h.v, h.v.fighter(1), gctx(h, 1));
  assert.ok(!goal.still && across(goal.pos, h.v.fighter(2).pos) < 0.01, 'crawl to the nearest friend');
  const q1 = h.v.fighter(1).pos;
  put(h, 2, q1[0] + 1.5, q1[2], q1[1]);
  assert.ok(ed.goal(h.v, h.v.fighter(1), gctx(h, 1)).still, 'still by it');
  // played out by the bot: it gets there and holds still, and the revive goes through
  const bot = new Fighter(0, 7, 0.8);
  put(h, 2, 560, 545);
  for (let t = 0; t < 1500 && down(h, 1); t++) h.step([[L.EV_INPUT, 0, bot.think(h.v, h.v.tick, 0)]]);
  assert.ok(!down(h, 1) && revives(h, 0) === 1, 'revived by the bot');
  assert.ok(ed.state(h.v).ups === 1);
});

test('Evade with 8 and 16 AI fighters: caught, revived, out, chasers stunned and run from, in 20,000 ticks; no trap on the debug build, the same hash on every tick on 1 and 4 threads', async (t) => {
  const [debug, bytes] = [arenaBytes(true), arenaBytes()];
  const ticks = 20000;
  const total = { [AC.ED_MX_UP]: 0 };
  for (const bots of [8, 16]) {
    const count = {};
    let k0 = 0;
    // every 25 ticks of play, a standing fighter with a chaser closing on it inside 25 m: its step since along the way from it, away or toward
    const steps = [0, 0], last = new Map();
    const { log } = await playArena({ bytes: debug, seed: forcedSeed(L.M_EVADE), bots, ticks, leaveAt: 1000,
      onTick: (tick, v) => {
        for (let k = Math.max(k0, v.fxCount() - L.FX_MAX); k < v.fxCount(); k++) {
          const f = v.fx(k);
          if (f.kind === L.FX_MODE) count[f.size] = (count[f.size] || 0) + 1;
        }
        k0 = v.fxCount();
        if (v.hole().state !== L.H_PLAY || tick % 25) return;
        const cs = chasersOf(v), now = new Map();
        for (let p = 0; p < bots; p++) {
          if (stateOf(v, p).state !== 'up') continue;
          const me = v.fighter(p);
          const c = cs.filter((x) => !x.stun && across(x.pos, me.pos) < 25 && x.vel[0] * (me.pos[0] - x.pos[0]) + x.vel[2] * (me.pos[2] - x.pos[2]) > 0)
            .sort((a, b) => across(a.pos, me.pos) - across(b.pos, me.pos))[0];
          const was = last.get(p);
          if (was) {
            const ux = was.pos[0] - was.c[0], uz = was.pos[2] - was.c[2], u = Math.hypot(ux, uz) || 1;
            const along = ((me.pos[0] - was.pos[0]) * ux + (me.pos[2] - was.pos[2]) * uz) / u;
            if (along > 0.5) steps[0]++; else if (along < -0.5) steps[1]++;
          }
          if (c) now.set(p, { pos: me.pos, c: c.pos });
        }
        last.clear(); for (const [k, x] of now) last.set(k, x);
      } });
    const n = (m) => count[m] || 0;
    t.diagnostic(`${bots} fighters: caught ${n(AC.ED_MX_DOWN)}, revived ${n(AC.ED_MX_UP)}, out ${n(AC.ED_MX_OUT)}, chasers ${n(AC.ED_MX_COME)}, stuns ${n(AC.ED_MX_STUN)}, ends ${n(AC.ED_MX_END)}; a fighter with a chaser closing inside 25 m stepped away ${steps[0]} times, toward ${steps[1]}`);
    assert.ok(n(AC.ED_MX_DOWN) >= 2, `${bots}: caught`);
    total[AC.ED_MX_OUT] = (total[AC.ED_MX_OUT] || 0) + n(AC.ED_MX_OUT);
    assert.ok(n(AC.ED_MX_STUN) >= 20, `${bots}: stuns`);
    assert.ok(n(AC.ED_MX_COME) >= AC.ED_MIN + 1, `${bots}: more chasers as it goes`);
    assert.ok(steps[0] >= 3 * steps[1], `${bots}: runs from them`);
    total[AC.ED_MX_UP] += n(AC.ED_MX_UP);
    const parsed = parseLog(log);
    const a = await replay({ bytes, log: parsed, ticks, threads: 1, tag: `ed${bots}x1` });
    const b = await replay({ bytes, log: parsed, ticks, threads: 4, tag: `ed${bots}x4`, startWorkers });
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(b.trace).tickHashes]);
  }
  assert.ok(total[AC.ED_MX_UP] >= 2 && total[AC.ED_MX_OUT] >= 2, 'revived, and out');
});
