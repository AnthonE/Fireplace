// CROSSROADS (src/am/crossroads.wat): Roblox's Crossroads' rules on the
// arena's kit, everyone for itself: the classic sword and rocket launcher
// and a superball, a Humanoid's 100 health with no shields healing a point a
// second, 5 s to respawn, KOs and Wipeouts. Helpers as test/arena-lucky.test.mjs
// has them; the superball read straight from PROJ (its fields in src/am/crossroads.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { arenaBytes } from './helpers.mjs';
import { View, arenaWord, arenaFrame, forcedSeed } from '../src/arena-view.mjs';
import { aimAt } from '../client/bot.mjs';
import { playArena } from '../tools/genarena.mjs';
import { compileMap } from '../tools/map.mjs';
import { packMap, MAP_MODES } from '../tools/map-compile.mjs';
import { replay, parseLog, decodeTrace, newMemory, instantiate, Sim } from '../harness/core.mjs';
import { startWorkers } from '../harness/run-node.mjs';
import * as L from '../src/layout.mjs';
import * as AC from '../src/am/consts.mjs';
import * as F from '../src/flight.mjs';
import cx, { ballIn } from '../client/am/crossroads.mjs';
import { AMC } from '../client/am/index.mjs';

let debugModule = null;
async function room(n = 2, { seed = 7, map = null } = {}) {
  debugModule ||= await WebAssembly.compile(arenaBytes(true));
  const memory = newMemory();
  const sim = new Sim(await instantiate(debugModule, memory), memory);
  if (map) sim.loadMap(map);
  sim.init(map ? seed : forcedSeed(L.M_CROSSROADS, seed));
  const v = new View(sim.memory.buffer);
  const dv = new DataView(sim.memory.buffer);
  const step = (recs = []) => { sim.feedPlayers(recs); sim.x.step(); };
  const g = { sim, v, dv, step, n };
  step(Array.from({ length: n }, (_, p) => [L.EV_JOIN, p]));
  if (!map) for (let p = 0; p < n; p++) park(g, p);
  while (v.hole().state !== L.H_PLAY) step();
  step();
  return g;
}

const rec = (p) => L.PLAYERS + p * L.PSIZE;
const hp = (g, p) => g.sim.u8[rec(p) + L.A_HP];
const setHp = (g, p, n) => { g.sim.u8[rec(p) + L.A_HP] = n; };
const steps = (g, n, recs = () => []) => { for (let i = 0; i < n; i++) g.step(recs(i)); };
function put(g, p, x, z, y = g.v.height(x, z)) {
  g.dv.setFloat32(rec(p) + L.P_PX, x, true);
  g.dv.setFloat32(rec(p) + L.P_PY, y, true);
  g.dv.setFloat32(rec(p) + L.P_PZ, z, true);
  for (const o of [L.P_VX, L.P_VY, L.P_VZ]) g.dv.setFloat32(rec(p) + o, 0, true);
}
// open ground south of Box Canyon's mid-field, 3 m apart
const park = (g, p) => put(g, p, 491 + 3 * (p % 8), 528 + 3 * (p >> 3));
const still = (g, p) => { const f = g.v.fighter(p); return { shot: f.fired, melee: f.act & L.AB_MELEE, gren: (f.act >> 1) & 1, slot: f.hand }; };
function aim(g, p, at, press = {}) {
  const f = g.v.fighter(p), w = still(g, p);
  const { yaw, pitch } = aimAt([f.pos[0], f.pos[1] + 1.6, f.pos[2]], at);
  return arenaWord({ yaw, pitch, ...w, shot: press.shot ? (w.shot + 1) & 3 : w.shot, melee: press.melee ? w.melee ^ 1 : w.melee,
    gren: press.gren ? w.gren ^ 1 : w.gren, slot: press.slot ?? w.slot });
}
function swing(g, p, at) {
  g.dv.setUint16(rec(p) + L.A_COOL, 0, true);
  g.step([[L.EV_INPUT, p, aim(g, p, at, { melee: 1 })]]);
}
const chest = (g, q) => { const f = g.v.fighter(q); return [f.pos[0], f.pos[1] + 1.2, f.pos[2]]; };
const balls = (g) => g.v.projectiles().filter((j) => j.kind === AC.CX_K_BALL);
// a superball of p's laid straight into PROJ's slot j, `bounces` made already
function lay(g, j, p, pos, vel = [0, 0, 0], bounces = 0) {
  const b = L.PROJ + j * L.JSIZE;
  g.sim.u8.fill(0, b, b + L.JSIZE);
  pos.forEach((v, k) => g.dv.setFloat32(b + L.J_PX + 4 * k, v, true));
  vel.forEach((v, k) => g.dv.setFloat32(b + L.J_VX + 4 * k, v, true));
  g.sim.u8[b + L.J_KIND] = AC.CX_K_BALL;
  g.sim.u8[b + L.J_OWNER] = p;
  g.dv.setUint16(b + L.J_AGE, AC.CX_BALL_SAFE, true);
  g.sim.u8[b + L.J_TGT] = bounces;
}

test('Crossroads: on the kit with no sides, out of the rotation, a map\'s to name; everyone with the sword out, the rocket launcher in the other hand, a superball, 100 health and no shields', async () => {
  assert.equal(L.MODES[L.M_CROSSROADS].name, 'CROSSROADS');
  assert.ok(L.KIT & (1 << L.M_CROSSROADS));
  assert.equal(L.TEAMED & (1 << L.M_CROSSROADS), 0);
  assert.equal(L.TEAM_MODES & (1 << L.M_CROSSROADS), 0);
  assert.ok(!L.ARENA_MODES.includes(L.M_CROSSROADS), 'never in a room\'s rotation');
  assert.equal(MAP_MODES.crossroads, L.M_CROSSROADS);
  assert.equal(F.M_RACE, L.MODES.length, 'flight\'s Ring Race moved past it');
  assert.ok(F.MX_GATE >= L.MX_AM + 8 * L.AM.length, 'and its news past every kit mode\'s');
  assert.equal(AMC[L.M_CROSSROADS], cx);
  const g = await room(3);
  for (let p = 0; p < 3; p++) {
    const f = g.v.fighter(p);
    assert.deepEqual(f.gun, [L.W_SWORD, L.W_ROCKET]);
    assert.equal(f.hand, 0, 'the sword out');
    assert.deepEqual([f.sh, f.hp, f.grens, f.team], [0, AC.CX_HP, 1, -1]);
  }
  assert.equal(g.v.mode().mode, L.M_CROSSROADS);
});

test('Crossroads: no shields ever; health back a point every CX_REGEN of the clock, to 100 and no more; the sword\'s swings and the rocket\'s reserve kept full', async () => {
  const g = await room(1);
  setHp(g, 0, 50);
  const t0 = g.v.tick;
  steps(g, 3 * AC.CX_REGEN);
  let due = 0;
  for (let t = t0; t < g.v.tick; t++) if (t % AC.CX_REGEN === 0) due++;
  assert.equal(hp(g, 0), 50 + due, `${due} points in ${3 * AC.CX_REGEN} ticks`);
  assert.equal(g.v.fighter(0).sh, 0, 'no shields come back');
  setHp(g, 0, 100);
  steps(g, 2 * AC.CX_REGEN);
  assert.equal(hp(g, 0), 100);
  g.dv.setUint8(rec(0) + L.A_MAG, 1);
  g.dv.setUint16(rec(0) + L.A_RES + 2, 0, true);
  g.step();
  assert.equal(g.v.fighter(0).mag[0], L.ARMS[L.W_SWORD].mag, 'the sword never runs out');
  assert.equal(g.v.fighter(0).res[1], L.ARMS[L.W_ROCKET].res, 'nor the rockets');
});

test('Crossroads: the sword\'s swing takes CX_SWORD, four kill; the butt does nothing; back CX_RESPAWN after, a KO and a Wipeout', async () => {
  const g = await room(2);
  put(g, 0, 500, 530);
  put(g, 1, 502, 530);
  for (let k = 1; k <= 3; k++) {
    swing(g, 0, chest(g, 1));
    put(g, 0, 500, 530); put(g, 1, 502, 530);
    assert.equal(hp(g, 1), AC.CX_HP - k * AC.CX_SWORD, `swing ${k}`);
  }
  swing(g, 0, chest(g, 1));
  const f = g.v.fighter(1);
  assert.ok(f.dead, 'the fourth kills');
  assert.equal(f.respawn, AC.CX_RESPAWN - 1, 'CX_RESPAWN, the tick of the KO counted');
  assert.deepEqual([g.v.fighter(0).kills, f.deaths], [1, 1]);
  steps(g, AC.CX_RESPAWN);
  assert.ok(!g.v.fighter(1).dead && hp(g, 1) === AC.CX_HP && g.v.fighter(1).sh === 0, 'back, whole, with no shields');
  // the rocket launcher in hand: a butt is nothing
  put(g, 0, 500, 530); put(g, 1, 502, 530);
  g.step([[L.EV_INPUT, 0, aim(g, 0, chest(g, 1), { slot: 1 })]]);
  steps(g, L.SWAP_TICKS);
  swing(g, 0, chest(g, 1));
  assert.equal(hp(g, 1), AC.CX_HP, 'no melee but the sword\'s');
});

test('Crossroads: a superball thrown flies at CX_BALL_V and takes CX_BALL_DMG off the first body; another in hand CX_BALL_RELOAD on', async () => {
  const g = await room(2);
  put(g, 0, 492, 530);
  put(g, 1, 502, 530);
  g.dv.setUint16(rec(0) + L.A_COOL, 0, true);
  g.step([[L.EV_INPUT, 0, aim(g, 0, chest(g, 1), { gren: 1 })]]);
  const [b] = balls(g);
  assert.ok(b, 'thrown');
  assert.ok(Math.abs(Math.hypot(...b.vel) - Number(AC.CX_BALL_V)) < 1, `at ${Math.hypot(...b.vel).toFixed(2)} m/s`);
  assert.equal(g.v.fighter(0).grens, 0);
  steps(g, 40);
  assert.equal(hp(g, 1), AC.CX_HP - AC.CX_BALL_DMG, 'struck once');
  assert.equal(g.sim.u8[L.PROJ + b.slot * L.JSIZE + L.J_TGT], AC.CX_SPENT, 'and spent');
  steps(g, AC.CX_BALL_RELOAD - 45);
  assert.equal(g.v.fighter(0).grens, 0, 'not yet');
  assert.ok(ballIn(g.v, 0) > 0);
  steps(g, 10);
  assert.equal(g.v.fighter(0).grens, 1, 'back in hand');
});

test('Crossroads: a superball bounces off the ground keeping CX_BALL_E of its fall, each bounce halving what it deals; a touch within CX_BALL_QUIET of the last counts for nothing; gone CX_BALL_LIFE on', async () => {
  const g = await room(2);
  put(g, 0, 492, 530);
  put(g, 1, 508, 530);
  const x = 500, z = 536, h = g.v.height(x, z);
  lay(g, 0, 0, [x, h + 5, z]);
  let vin = 0, j = null;
  for (let k = 0; k < 200 && !j; k++) {
    const before = balls(g)[0];
    g.step();
    const after = balls(g)[0];
    if (after.vel[1] > 0 && before.vel[1] < 0) { vin = -before.vel[1]; j = after; }
  }
  assert.ok(j, 'it bounced');
  assert.ok(Math.abs(j.vel[1] - vin * Number(AC.CX_BALL_E)) < 1, `up at ${j.vel[1].toFixed(2)} from ${vin.toFixed(2)} down`);
  assert.equal(g.sim.u8[L.PROJ + L.J_TGT], 1, 'one bounce');
  // a ball two bounces in, dropped on a body: a quarter
  lay(g, 1, 0, [508, g.v.fighter(1).pos[1] + 2.5, 530], [0, -3, 0], 2);
  steps(g, 30);
  assert.equal(hp(g, 1), AC.CX_HP - (AC.CX_BALL_DMG >> 2));
  // five bounces in, harmless
  setHp(g, 1, 100);
  lay(g, 2, 0, [508, g.v.fighter(1).pos[1] + 2.5, 530], [0, -3, 0], 5);
  steps(g, 30);
  assert.equal(hp(g, 1), 100, `${AC.CX_BALL_DMG >> 5} is under CX_BALL_MIN`);
  // in its quiet, a body takes nothing
  lay(g, 3, 0, [508, g.v.fighter(1).pos[1] + 1.5, 530], [0, -3, 0], 0);
  g.sim.u8[L.PROJ + 3 * L.JSIZE + L.J_HOME] = 200;
  steps(g, 20);
  assert.equal(hp(g, 1), 100, 'quiet');
  // gone at the end of its life
  const age = g.dv.getUint16(L.PROJ + L.J_AGE, true);
  steps(g, AC.CX_BALL_LIFE - age + 1);
  assert.equal(g.sim.u8[L.PROJ + L.J_KIND], 0, 'gone');
});

// the record's bytes the tick hook writes: health, the superball in hand, the magazines and reserves
const HOOKED = [L.A_HP, L.A_GRENS, L.A_MAG, L.A_MAG + 1, L.A_RES, L.A_RES + 1, L.A_RES + 2, L.A_RES + 3];

test('Crossroads: a fighter throwing superballs, swinging, swapping and running is predicted bit for bit from every tick', async () => {
  const g = await room(2);
  put(g, 0, 492, 530);
  put(g, 1, 510, 530);
  const word = (k) => {
    const w = still(g, 0);
    return arenaWord({ yaw: (k * 41) & 0x3fff, pitch: 480, move: (k >> 4) & 15, jump: k % 71 === 0 ? 1 : 0, shot: w.shot, melee: k % 50 === 7 ? w.melee ^ 1 : w.melee,
      gren: k % 60 === 3 ? w.gren ^ 1 : w.gren, slot: (k >> 7) & 1, serial: (arenaFrame({ lag: 2 }) >> ((g.v.tick + k) & 7)) & 1 });
  };
  let compared = 0, thrown = 0;
  for (let k = 0; k < 500; k++) {
    const w = word(k);
    g.dv.setUint32(L.PWORDS, w, true);
    g.sim.x.predict(0, 1);
    const pred = g.sim.u8.slice(L.PLAYERS + L.PRED_D, L.PLAYERS + L.PRED_D + L.PSIZE);
    const predBalls = g.sim.u8.slice(L.PROJ + L.PRED_D, L.PROJ + L.PRED_D + 4 * L.JSIZE);
    g.step([[L.EV_INPUT, 0, w]]);
    const real = g.sim.u8.slice(L.PLAYERS, L.PLAYERS + L.PSIZE);
    // what the confirmed world's tick hook writes after everyone's move (health back, the superball
    // back in hand, ammo kept full) the prediction takes from it a round trip later, as a shot's damage
    for (const o of HOOKED) pred[o] = real[o];
    assert.deepEqual(pred, real, `tick ${k}: the fighter, byte ${pred.findIndex((b, i) => b !== real[i])}`);
    assert.deepEqual(predBalls, g.sim.u8.slice(L.PROJ, L.PROJ + 4 * L.JSIZE), `tick ${k}: its superballs`);
    compared++;
    thrown = Math.max(thrown, balls(g).length);
  }
  assert.equal(compared, 500);
  assert.ok(thrown >= 2, `superballs in the air at once: ${thrown}`);
});

test('Crossroads: places by KOs at the clock; the leader every tick', async () => {
  const g = await room(3);
  g.dv.setUint16(rec(2) + L.A_KILLS, 4, true);
  g.dv.setUint16(rec(1) + L.A_KILLS, 2, true);
  g.step();
  assert.equal(g.v.mode().leader, 2);
  g.dv.setUint32(L.HDR_UNTIL, g.v.tick + 1, true);
  steps(g, 4);
  assert.equal(g.v.hole().state, L.H_OVER);
  assert.deepEqual([0, 1, 2].map((p) => g.v.fighter(p).place), [3, 2, 1]);
});

test('Crossroads on its own map: the map plays it every match, its fighters walking, jumping and falling as Roblox\'s Humanoid', async () => {
  const map = packMap(compileMap('maps/crossroads'));
  const g = await room(2, { map });
  assert.equal(g.v.mode().mode, L.M_CROSSROADS);
  const mv = g.v.map().movement;
  assert.ok(mv && Math.abs(mv.walk - 4.48) < 1e-6, 'walking 16 studs/s');
  assert.ok(Math.abs(mv.grav * 125 - 54.936) < 1e-3, 'under 196.2 studs/s^2');
  assert.ok(Math.abs(mv.jump * mv.jump / (2 * mv.grav * 125) - 50 * 50 / (2 * 196.2) * 0.28) < 1e-3, 'jumping as a JumpPower of 50');
  assert.deepEqual(g.v.fighter(0).gun, [L.W_SWORD, L.W_ROCKET]);
});

test('Crossroads with 8 AI fighters on Box Canyon and on Crossroads: KOs by sword, rocket and superball; no trap on the debug build; the same hash on every tick on 1 and 4 threads', async (t) => {
  const [debug, bytes] = [arenaBytes(true), arenaBytes()];
  const ticks = 12000;
  for (const [where, map, seed] of [['Box Canyon', null, forcedSeed(L.M_CROSSROADS)], ['Crossroads', packMap(compileMap('maps/crossroads')), 7]]) {
    const by = {};
    let k0 = 0;
    const { log } = await playArena({ bytes: debug, seed, bots: 8, ticks, map, leaveAt: 1000,
      onTick: (tick, v) => {
        for (let k = Math.max(k0, v.fxCount() - L.FX_MAX); k < v.fxCount(); k++) {
          const f = v.fx(k);
          if (f.kind === L.FX_KILL && f.owner !== f.shot) by[f.size] = (by[f.size] || 0) + 1;
        }
        k0 = v.fxCount();
      } });
    const kos = Object.values(by).reduce((a, b) => a + b, 0);
    t.diagnostic(`${where}: ${kos} KOs (sword ${by[L.W_SWORD] || 0}, rocket ${by[L.W_ROCKET] || 0}, superball ${by[AC.CX_KILL_BALL] || 0})`);
    assert.ok(kos >= 10, `${where}: KOs`);
    assert.ok(by[L.W_SWORD] && by[L.W_ROCKET], `${where}: by the sword and the rocket`);
    if (map) continue; // the harness replays a build's own map
    const parsed = parseLog(log);
    const a = await replay({ bytes, log: parsed, ticks, threads: 1, tag: 'cx8x1' });
    const b = await replay({ bytes, log: parsed, ticks, threads: 4, tag: 'cx8x4', startWorkers });
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(b.trace).tickHashes]);
  }
});
