// Moving boxes (map.json's structures' "move"; layout.mjs MAP_MOVE; $mv,
// $a_ride in src/arena.wat): compiled and laid, where they are at a tick,
// fighters carried and pushed by them, the prediction riding them exactly
// as the confirmed world does, and a map with none left as it was.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newArena, arenaBytes } from './helpers.mjs';
import { View, arenaWord, arenaFrame, moverAt } from '../src/arena-view.mjs';
import { compileSpec, packMap } from '../tools/map-compile.mjs';
import { compileMap } from '../tools/map.mjs';
import { newMemory, instantiate, Sim } from '../harness/core.mjs';
import { expand, assemble } from '../tools/asm.mjs';
import * as L from '../src/layout.mjs';

// A flat 64 m floor at 20 m (as test/map.test.mjs's), a wall, and the structures given.
const W = 32;
const flat = { height: { width: W, height: W, channels: 1, depth: 8, data: new Uint8Array(W * W).fill(40) } };
const spec = (structures = []) => ({
  name: 'Lifts', bounds: [484, 540, 484, 540],
  terrain: { origin: [480, 480], height: 'height.png', scale: 0.5, base: 0 },
  structures: [{ name: 'wall', boxes: [[530, 20, 484, 531, 24, 540, 'rock']] }, ...structures],
  spawns: [[488, 488], [526, 536]],
});
const LIFT = { name: 'lift', boxes: [[500, 19.5, 500, 504, 20.5, 504, 'metal']], move: { by: [0, 6, 0], seconds: 2, wait: 1 } };
const SLIDE = { name: 'slide', boxes: [[490, 19.5, 510, 494, 20.5, 514, 'light']], move: { by: [8, 0, 0], seconds: 2, wait: 1, ease: true } };
const RAM = { name: 'ram', boxes: [[500, 20, 520, 502, 23, 524, 'red']], move: { by: [10, 0, 0], seconds: 2, wait: 0.5 } };

async function arena(m, seed = 7) {
  const sim = await newArena(true);
  sim.loadMap(packMap(m));
  sim.init(seed);
  const v = new View(sim.memory.buffer), dv = new DataView(sim.memory.buffer);
  const step = (recs = []) => { sim.feedPlayers(recs); sim.x.step(); };
  step([[L.EV_JOIN, 0]]);
  while (v.hole().state !== L.H_PLAY) step();
  return { sim, v, dv, step };
}
function put(g, x, z, y) {
  const b = L.PLAYERS;
  g.dv.setFloat32(b + L.P_PX, x, true); g.dv.setFloat32(b + L.P_PY, y, true); g.dv.setFloat32(b + L.P_PZ, z, true);
  for (const o of [L.P_VX, L.P_VY, L.P_VZ]) g.dv.setFloat32(b + o, 0, true);
}
// steps until group k's mover is at the start of its way out (its near end, the wait just over)
function toStart(g, k) {
  const mv = g.v.map().groups[k].move;
  while ((g.v.tick + mv.phase) % (2 * (mv.travel + mv.wait)) !== mv.wait) g.step();
}
const still = arenaWord({ yaw: 0, pitch: 512, move: 0 });

test('a structure\'s move compiles to its group\'s row, its bounds over the whole way; a bad one says why', () => {
  const m = compileSpec(spec([LIFT, SLIDE]), flat);
  const [, lift, slide] = m.groups;
  assert.deepEqual(lift.move, { by: [0, 6, 0], travel: 250, wait: 125, phase: 0, ease: false });
  assert.deepEqual(lift.bound, [500, 19.5, 500, 504, 26.5, 504], 'the lift bounded from its bottom to its top');
  assert.deepEqual(slide.bound, [490, 19.5, 510, 502, 20.5, 514]);
  assert.equal(slide.move.ease, true);
  assert.equal(m.consts.MAPSEG_NMOVEB, 3 * L.MOVE_SIZE, 'a row for each group up to the last that moves');
  // a turned prefab's move turns with it
  const t = compileSpec({ ...spec(), prefabs: { p: [[0, 0, 0, 2, 1, 2, 'metal']] }, structures: [{ prefab: 'p', at: [500, 20, 500], turn: 90, move: { by: [4, 0, 0] } }] }, flat);
  assert.deepEqual(t.groups[0].move.by.map((v) => v + 0), [0, 0, 4]);
  // a map without one keeps its bytes
  const plain = compileSpec(spec(), flat);
  assert.equal(plain.consts.MAPSEG_NMOVEB, 0);
  assert.equal(plain.consts.MAPSEG_MOVE, plain.bytes.length);
  for (const [move, why] of [
    [{ by: [0, 60, 0], seconds: 1 }, /at its fastest, at most 25/],
    [{ by: [0, 60, 0], seconds: 1.5, ease: true }, /at its fastest/],
    [{ by: [0, 6] }, /move.by is \[dx, dy, dz\]/],
    [{ by: [0, 6, 0], seconds: 0 }, /move.seconds: over 0/],
    [{ by: [0, 6, 0], wait: -1 }, /move.wait: 0 or more/],
  ]) assert.throws(() => compileSpec(spec([{ ...LIFT, move }]), flat), why, JSON.stringify(move));
});

test('the movers laid at run time are the movers built in; a bad row is refused', async () => {
  const m = compileSpec(spec([LIFT, SLIDE]), flat);
  const sim = async (bytes) => { const memory = newMemory(); return new Sim(await instantiate(await WebAssembly.compile(bytes), memory), memory); };
  const a = await sim(await assemble(expand('src/game.wat', { ARENA: true, map: m })));
  const b = await sim(arenaBytes());
  a.init(3);
  b.loadMap(packMap(m));
  b.init(3);
  assert.equal(Buffer.compare(Buffer.from(a.u8.subarray(L.MAP, L.MAP_MOVE_END)), Buffer.from(b.u8.subarray(L.MAP, L.MAP_MOVE_END))), 0, 'the map\'s area, the rows included');
  assert.deepEqual(new View(b.memory.buffer).map().groups[1].move, { by: [0, 6, 0], travel: 250, wait: 125, phase: 0, ease: false });
  const good = packMap(m), row = L.MAPPACK_HEAD + m.consts.MAPSEG_MOVE + L.MOVE_SIZE;
  const u32 = (bytes, at, v) => new DataView(bytes.buffer).setUint32(at, v, true);
  const f32 = (bytes, at, v) => new DataView(bytes.buffer).setFloat32(at, v, true);
  for (const [why, spoil] of [
    ['a mover', (x) => u32(x, row + 12, 0)],
    ['a mover', (x) => u32(x, row + 16, L.MV_TICKS_MAX + 1)],
    ['a mover', (x) => u32(x, row + 24, 4 | L.MV_ON)],
    ['a mover', (x) => u32(x, row + 24, L.MV_EASE)],
    ['a mover', (x) => f32(x, row + 4, NaN)],
    ['a mover', (x) => u32(x, L.MP_NMOVEB, L.MOVE_SIZE + 1)],
    ['a part outside its bytes', (x) => u32(x, L.MP_MOVE, x.length)],
    ['a group or a box', (x) => u32(x, L.MAPPACK_HEAD + m.consts.MAPSEG_BOXES + 28, 9)],
    ['not a packed map', (x) => u32(x, L.MP_MAGIC, 0x314d4751)],
  ]) {
    const s = await sim(arenaBytes()), x = good.slice();
    spoil(x);
    assert.throws(() => s.loadMap(x), new RegExp(`refused: ${why}`), why);
  }
});

test('a lift carries a fighter up and down, its feet on its top every tick', async () => {
  const g = await arena(compileSpec(spec([LIFT]), flat));
  const mv = g.v.map().groups[1].move;
  toStart(g, 1);
  put(g, 502, 502, 20.5);
  g.step([[L.EV_INPUT, 0, still]]);
  let top = 0;
  for (let k = 0; k < 2 * (mv.travel + mv.wait); k++) {
    const t = g.v.tick;
    g.step([[L.EV_INPUT, 0, still]]);
    const want = Math.fround(20.5 + moverAt(mv, t)[1]);
    assert.equal(g.v.fighter(0).pos[1], want, `tick ${k}: feet on the lift's top`);
    top = Math.max(top, want);
  }
  assert.equal(top, 26.5, 'all the way up');
  assert.deepEqual(g.v.fighter(0).pos.map((v) => Math.round(v * 1000) / 1000), [502, 20.5, 502], 'and back down where it got on');
});

test('a sliding platform carries a fighter along, eased, and a ram pushes one clear', async () => {
  const g = await arena(compileSpec(spec([SLIDE, RAM]), flat));
  const slide = g.v.map().groups[1].move;
  toStart(g, 1);
  put(g, 492, 512, 20.5);
  g.step([[L.EV_INPUT, 0, still]]);
  for (let k = 0; k < slide.travel + 2; k++) g.step([[L.EV_INPUT, 0, still]]);
  const [x, y, z] = g.v.fighter(0).pos;
  assert.ok(Math.abs(x - 500) < 1e-3 && y === 20.5 && z === 512, `carried 8 m along: ${x}, ${y}, ${z}`);
  // the ram: a fighter on the ground in its way, never inside it as it comes on
  const ram = g.v.map().groups[2];
  toStart(g, 2);
  put(g, 504, 522, 20);
  for (let k = 0; k < ram.move.travel; k++) {
    const t = g.v.tick;
    g.step([[L.EV_INPUT, 0, still]]);
    const [ox] = moverAt(ram.move, t);
    const [fx] = g.v.fighter(0).pos;
    assert.ok(fx >= 502 + ox + 0.5 - 1e-3, `tick ${k}: ahead of the ram (${fx} against its face at ${502 + ox})`);
  }
  // until the wall: pinned there, not through it
  assert.ok(g.v.fighter(0).pos[0] <= 530 - 0.5 + 1e-3, `held by the wall: ${g.v.fighter(0).pos[0]}`);
});

test('a ray, a rocket\'s box test and a stand meet a mover where it is', async () => {
  const g = await arena(compileSpec(spec([LIFT]), flat));
  const mv = g.v.map().groups[1].move;
  toStart(g, 1);
  for (let k = 0; k < mv.travel; k++) g.step();
  // at the top now: a fighter dropped onto it lands on 26.5
  put(g, 502, 502, 30);
  for (let k = 0; k < 120; k++) g.step([[L.EV_INPUT, 0, still]]);
  assert.equal(g.v.fighter(0).pos[1], 26.5, 'landed on the lift at the top');
});

test('the prediction rides a mover exactly as the confirmed world does', async () => {
  const g = await arena(compileSpec(spec([LIFT, SLIDE, RAM]), flat));
  toStart(g, 2);
  put(g, 492, 512, 20.5);
  g.step([[L.EV_INPUT, 0, still]]);
  const word = (k, move) => arenaWord({ yaw: 4096 * (k >> 6), pitch: 512, move, jump: k % 97 === 50 ? 1 : 0, serial: (arenaFrame({ lag: 3 }) >> ((g.v.tick + k) & 7)) & 1 });
  const inputs = Array.from({ length: 600 }, (_, k) => word(k, k < 300 ? 0 : 1));
  let compared = 0;
  const due = new Map();
  for (let k = 0; k < inputs.length; k++) {
    for (const n of [1, 6, 30]) {
      if ((k % 7 !== 0 && n !== 1) || k + n > inputs.length) continue;
      for (let i = 0; i < n; i++) g.dv.setUint32(L.PWORDS + 4 * i, inputs[k + i], true);
      g.sim.x.predict(0, n);
      const list = due.get(k + n) || [];
      list.push({ n, from: k, player: g.sim.u8.slice(L.PLAYERS + L.PRED_D, L.PLAYERS + L.PRED_D + L.PSIZE) });
      due.set(k + n, list);
    }
    g.step([[L.EV_INPUT, 0, inputs[k]]]);
    for (const p of due.get(k + 1) || []) {
      assert.deepEqual(p.player, g.sim.u8.slice(L.PLAYERS, L.PLAYERS + L.PSIZE), `predicted ${p.n} from ${p.from}`);
      compared++;
    }
  }
  assert.ok(compared > 600, `${compared} compared`);
});

test('two sims on a map of movers step to the same region, tick for tick', async () => {
  const m = compileSpec(spec([LIFT, SLIDE, RAM]), flat);
  const [a, b] = [await arena(m, 11), await arena(m, 11)];
  for (let k = 0; k < 1500; k++) {
    const w = arenaWord({ yaw: (k * 37) & 0x3fff, pitch: 512, move: (k >> 5) & 15, jump: k % 61 === 0 ? 1 : 0 });
    a.step([[L.EV_INPUT, 0, w]]);
    b.step([[L.EV_INPUT, 0, w]]);
    if (k % 50 === 0) assert.equal(a.sim.x.hash_region(), b.sim.x.hash_region(), `tick ${k}`);
  }
});

test('a map with no movers lays no rows: every group stands still', async () => {
  const s = await newArena();
  s.init(1);
  assert.ok(s.u8.subarray(L.MAP_MOVE, L.MAP_MOVE_END).every((v) => v === 0));
  assert.ok(new View(s.memory.buffer).map().groups.every((g) => !g.move));
  // and a map laid after one with movers clears them
  s.loadMap(packMap(compileSpec(spec([LIFT]), flat)));
  s.init(1);
  assert.ok(new View(s.memory.buffer).map().groups[1].move);
  const t = await newArena();
  t.loadMap(packMap(compileMap('maps/crossroads')));
  t.init(1);
  assert.ok(t.u8.subarray(L.MAP_MOVE, L.MAP_MOVE_END).every((v) => v === 0));
});
