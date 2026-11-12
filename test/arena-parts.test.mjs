// A map's parts and its body (map.json: a box's eighth element, and "body";
// layout.mjs MAP_PARTS, MAP_BODY; $a_part and $pt_at in src/arena.wat, read
// by $move and $arena): compiled and laid, refused when wrong, each kind
// doing what it says on a floor written here, a part on a mover going where
// the mover goes, the prediction stepping all of it as the confirmed world
// does, and a smaller body passing what the arena's own can't.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newArena } from './helpers.mjs';
import { View, arenaWord, arenaFrame } from '../src/arena-view.mjs';
import { compileSpec, packMap, partOf, bodyOf, MAP_LOAD_ERRORS } from '../tools/map-compile.mjs';
import * as L from '../src/layout.mjs';

const W = 32, Y = 20; // a 64 m floor at 20 m
const flat = { height: { width: W, height: W, channels: 1, depth: 8, data: new Uint8Array(W * W).fill(40) } };
const spec = (boxes = [], extra = {}) => ({
  name: 'Parts', bounds: [484, 540, 484, 540],
  terrain: { origin: [480, 480], height: 'height.png', scale: 0.5, base: 0 },
  structures: boxes.length ? [{ name: 'course', boxes }] : [], spawns: [[488, 488], [536, 536]], ...extra,
});
const f = Math.fround;

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
function put(g, x, z, y = Y) {
  const b = L.PLAYERS;
  g.dv.setFloat32(b + L.P_PX, x, true); g.dv.setFloat32(b + L.P_PY, y, true); g.dv.setFloat32(b + L.P_PZ, z, true);
  for (const o of [L.P_VX, L.P_VY, L.P_VZ]) g.dv.setFloat32(b + o, 0, true);
}
const FWD = 1, BACK = 2;
const word = (move = 0, jump = 0, yaw = 0) => arenaWord({ yaw, pitch: 512, move, jump });
const run = (g, n, w = word()) => { for (let k = 0; k < n; k++) g.step([[L.EV_INPUT, 0, w]]); };
const me = (g) => g.v.fighter(0);
const fxs = (v, kind) => { const out = []; for (let k = 0; k < v.fxCount(); k++) { const e = v.fx(k); if (e.kind === kind) out.push(e); } return out; };
const part = (m, k) => {
  const a = m.consts.MAPSEG_RULES + L.MAP_RULES_SIZE + L.PARTS_HEAD + k * L.PART_SIZE, dv = new DataView(m.bytes.buffer, m.bytes.byteOffset);
  return { box: [0, 1, 2, 3, 4, 5].map((i) => dv.getFloat32(a + 4 * i, true)), kind: dv.getUint8(a + L.PT_KIND), stage: dv.getUint32(a + L.PT_KIND, true) >>> 8,
    group: dv.getUint32(a + L.PT_GROUP, true), a: dv.getFloat32(a + L.PT_A, true), b: dv.getFloat32(a + L.PT_B, true) };
};

test('a box\'s eighth element compiles to a part\'s row; a ghost has no box; a map with none keeps its bytes', () => {
  const plain = compileSpec(spec([[500, Y, 500, 504, Y + 1, 504, 'rock']]), flat);
  assert.equal(plain.consts.MAPSEG_NRULESB, 0, 'no rules, no parts: nothing after the movers');
  const m = compileSpec(spec([
    [500, Y, 500, 504, Y + 1, 504, 'rock'],
    [506, Y, 500, 508, Y + 0.25, 504, 'light#ff2020', { kind: 'kill' }],
    [510, Y, 500, 512, Y + 0.5, 504, 'light', { kind: 'bounce', speed: 12 }],
    [514, Y, 500, 518, Y + 0.25, 504, 'plain', 'ice'],
    [520, Y, 500, 524, Y + 0.25, 504, 'dark', { kind: 'conveyor', velocity: [3, -1] }],
    [526, Y, 500, 527, Y + 6, 502, 'metal', { kind: 'ladder' }],
    [528, Y, 500, 530, Y + 0.25, 502, 'blue', { kind: 'checkpoint', stage: 3 }],
    [532, Y, 500, 534, Y + 4, 502, 'red', { kind: 'finish', ghost: true }],
  ]), flat);
  assert.equal(m.boxes.length, 7, 'the ghost is no box');
  assert.equal(m.parts.length, 7);
  assert.equal(m.consts.MAPSEG_NRULESB, L.MAP_RULES_SIZE + L.PARTS_HEAD + 7 * L.PART_SIZE);
  assert.equal(m.bytes.length, plain.bytes.length + 6 * L.BOX_SIZE + m.consts.MAPSEG_NRULESB);
  const kinds = [0, 1, 2, 3, 4, 5, 6].map((k) => part(m, k));
  assert.deepEqual(kinds.map((p) => p.kind), [L.PK_KILL, L.PK_BOUNCE, L.PK_ICE, L.PK_CONVEY, L.PK_LADDER, L.PK_CHECK, L.PK_FINISH]);
  assert.deepEqual(kinds[0].box, [506, Y, 500, 508, Y + 0.25, 504]);
  assert.equal(kinds[1].a, 12);
  assert.equal(kinds[2].a, f(0.06), 'ice\'s grip, left out');
  assert.deepEqual([kinds[3].a, kinds[3].b], [3, -1]);
  assert.equal(kinds[4].a, 4.5, 'a ladder\'s speed, left out');
  assert.deepEqual(kinds.map((p) => p.stage), [0, 0, 0, 0, 0, 3, 0]);
  assert.ok(kinds.every((p) => p.group === 0), 'none on a mover');
  // a conveyor turns with its structure, and a part on a mover names its group
  const t = compileSpec({ ...spec(), structures: [
    { name: 'still', boxes: [[500, Y, 500, 501, Y + 1, 501, 'rock']] },
    { name: 'belt', at: [510, Y, 510], turn: 90, move: { by: [0, 0, 6], seconds: 3 }, boxes: [[-2, 0, -1, 2, 0.25, 1, 'dark', { kind: 'conveyor', velocity: [3, 0] }]] },
  ] }, flat);
  const p = part(t, 0);
  assert.deepEqual([p.a, p.b], [0, 3], '+x is +z a quarter turn on');
  assert.equal(p.group, 2, 'the second group, + 1');
});

test('a part the compiler can\'t take is refused, saying why', () => {
  const bad = (eighth, why, extra) => assert.throws(() => compileSpec(spec([[500, Y, 500, 504, Y + 1, 504, 'rock', eighth]], extra), flat), why);
  bad({ kind: 'lava' }, /no part kind "lava"/);
  bad({ kind: 'checkpoint' }, /stage/);
  bad({ kind: 'checkpoint', stage: 0 }, /stage/);
  bad({ kind: 'bounce', speed: 500 }, /speed/);
  bad({ kind: 'ice', grip: 2 }, /grip/);
  bad({ kind: 'conveyor' }, /velocity/);
  bad(7, /eighth element/);
  bad({ kind: 'kill' }, /needs a finish/, { mode: 'obby' });
  const many = Array.from({ length: L.NPART + 1 }, (_, k) => [490 + (k % 40), Y, 490 + Math.floor(k / 40), 490.5 + (k % 40), Y + 0.2, 490.5 + Math.floor(k / 40), 'red', 'kill']);
  assert.throws(() => compileSpec(spec(many), flat), /at most 256/);
  assert.throws(() => compileSpec({ ...spec(), structures: [{ name: 'gate', move: { by: [0, 2, 0] }, boxes: [[500, Y, 500, 501, Y + 1, 501, 'red', { kind: 'kill', ghost: true }]] }] }, flat), /needs a solid box/);
  assert.equal(partOf('kill').kind, L.PK_KILL, 'a bare name will do');
});

test('map_load refuses a part or a body that isn\'t one, and changes nothing', async () => {
  const m = compileSpec(spec([[506, Y, 500, 508, Y + 0.25, 504, 'red', { kind: 'checkpoint', stage: 2 }], [510, Y, 500, 512, Y + 0.5, 504, 'light', 'bounce']],
    { body: { width: 0.56, height: 1.4 } }), flat);
  const good = packMap(m);
  const rules = L.MAPPACK_HEAD + m.consts.MAPSEG_RULES, head = rules + L.MAP_RULES_SIZE, row = head + L.PARTS_HEAD;
  const u32 = (b, at, v) => new DataView(b.buffer).setUint32(at, v, true), f32 = (b, at, v) => new DataView(b.buffer).setFloat32(at, v, true);
  const cases = [
    (b) => u32(b, row + L.PT_KIND, 9), // a kind no build has
    (b) => u32(b, row + L.PT_KIND, L.PK_CHECK), // a checkpoint with no stage
    (b) => u32(b, row + L.PT_KIND, L.PK_CHECK | ((L.NSTAGE + 1) << 8)),
    (b) => u32(b, row + L.PART_SIZE + L.PT_KIND, L.PK_BOUNCE | (1 << 8)), // a stage on what isn't one
    (b) => u32(b, row + L.PT_GROUP, 5), // a group the map hasn't
    (b) => f32(b, row + L.PT_A, NaN),
    (b) => f32(b, row + L.PART_SIZE + L.PT_A, 1000),
    (b) => f32(b, row + 12, 400), // x1 under x0
    (b) => u32(b, head, 3), // more parts than rows
    (b) => f32(b, head + 16 + L.BD_R, 0.05), // a body too thin
    (b) => f32(b, head + 16 + L.BD_TOP, 9),
    (b) => f32(b, head + 16 + L.BD_EYE, 2), // an eye over its head
    (b) => f32(b, head + 16 + L.BD_HITR2, NaN),
    (b) => u32(b, head + 4, 0), // a body nobody owns
    (b) => u32(b, head + 4, 2),
  ];
  for (const [k, spoil] of cases.entries()) {
    const sim = await newArena(true), b = good.slice();
    spoil(b);
    assert.throws(() => sim.loadMap(b), new RegExp(MAP_LOAD_ERRORS[10].slice(0, 20).replace(/[()]/g, '.')), `case ${k}`);
    assert.equal(sim.i32[L.MAP_HOSTED >> 2], 0, 'nothing laid');
    assert.ok(sim.u8.subarray(L.MAP, L.MAP_PARTS_END).every((x) => x === 0));
  }
  // a block cut mid-row is no block
  const cut = good.slice();
  u32(cut, L.MP_NRULESB, m.consts.MAPSEG_NRULESB - 8);
  await assert.rejects(async () => (await newArena(true)).loadMap(cut));
  const sim = await newArena(true);
  sim.loadMap(good);
  sim.init(7);
  const dv = new DataView(sim.memory.buffer);
  assert.equal(dv.getUint32(L.MAP_NPART, true), 2);
  assert.equal(dv.getFloat32(L.MAP_BODY + L.BD_R, true), f(0.28));
  assert.equal(dv.getFloat32(L.MAP_BODY + L.BD_TOP, true), f(1.4));
});

test('a map without a body has the arena\'s own, as the sim\'s literals had it', async () => {
  const g = await arena(compileSpec(spec(), flat));
  const got = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => g.dv.getFloat32(L.MAP_BODY + 4 * k, true));
  assert.deepEqual(got, L.BODY.map((s) => f(Number(s))));
  assert.deepEqual(got.slice(0, 3), [f(Number(L.PHYS.P_R)), f(Number(L.PHYS.P_TOP)), f(Number(L.PHYS.P_EYE))]);
  assert.equal(g.dv.getUint32(L.MAP_NPART, true), 0);
});

test('a kill brick kills whoever touches it, from the side or on top, and a ghost one too; the feed says the part did it', async () => {
  const g = await arena(compileSpec(spec([
    [500, Y, 498, 501, Y + 2, 502, 'light#ff2020', 'kill'], // a wall
    [510, Y, 498, 512, Y + 0.25, 502, 'light#ff2020', 'kill'], // a low pad
    [520, Y, 498, 522, Y + 3, 502, 'red', { kind: 'kill', ghost: true }], // a zone
  ]), flat));
  put(g, 496, 500);
  run(g, 1);
  assert.equal(me(g).dead, false);
  let ticks = 0;
  while (!me(g).dead && ticks++ < 200) run(g, 1, word(FWD));
  assert.ok(me(g).dead, 'walked into the wall');
  assert.ok(me(g).pos[0] < 499.6, `stopped at its face: ${me(g).pos[0]}`);
  const fx = fxs(g.v, L.FX_KILL).at(-1);
  assert.equal(Math.round(fx.size), L.KILL_PART, 'the feed\'s cause');
  assert.equal(me(g).deaths, 1);
  // stepping up onto the low pad
  while (me(g).dead) run(g, 1);
  put(g, 508, 500);
  run(g, 1);
  ticks = 0;
  while (!me(g).dead && ticks++ < 200) run(g, 1, word(FWD));
  assert.ok(me(g).dead && me(g).pos[0] > 509, `on the pad: ${me(g).pos[0]}`);
  // the ghost: nothing stops on it
  while (me(g).dead) run(g, 1);
  put(g, 518, 500);
  run(g, 1);
  ticks = 0;
  while (!me(g).dead && ticks++ < 200) run(g, 1, word(FWD));
  assert.ok(me(g).dead && me(g).pos[0] > 519.4, `inside the zone: ${me(g).pos[0]}`);
});

test('a bounce pad throws what stands on it up at its speed', async () => {
  const g = await arena(compileSpec(spec([[500, Y, 498, 503, Y + 0.25, 502, 'light', { kind: 'bounce', speed: 14 }]]), flat));
  put(g, 501.5, 500, Y + 0.25);
  let top = 0, left = 0;
  for (let k = 0; k < 300; k++) {
    run(g, 1);
    top = Math.max(top, me(g).pos[1] - (Y + 0.25));
    if (!me(g).ground) left = 1;
  }
  const apex = 14 * 14 / (2 * Number(L.PHYS.GP_DT) * L.TICK_HZ);
  assert.ok(left, 'off the ground');
  assert.ok(Math.abs(top - apex) < 0.2, `rose ${top.toFixed(2)} m, ${apex.toFixed(2)} by the book`);
  // beside it, nothing
  put(g, 506, 500);
  run(g, 50);
  assert.equal(me(g).pos[1], Y);
});

test('ice keeps a body sliding where a floor stops it, and is slow to get going', async () => {
  const m = compileSpec(spec([[500, Y - 1, 496, 530, Y, 499, 'plain', { kind: 'ice', grip: 0.05 }], [500, Y - 1, 501, 530, Y, 504, 'rock']]), flat);
  const slide = async (z) => {
    const g = await arena(m);
    put(g, 502, z);
    run(g, 100, word(FWD));
    const v0 = me(g).vel[0];
    run(g, 60);
    return [v0, me(g).vel[0]];
  };
  const [iv0, iv1] = await slide(497.5), [rv0, rv1] = await slide(502.5);
  assert.ok(Math.abs(rv0 - 10) < 0.01 && rv1 < 1, `the floor: ${rv0} then ${rv1}`);
  assert.ok(iv0 > 1 && iv0 < rv0, `slow away on ice: ${iv0}`);
  assert.ok(iv1 > 0.5 * iv0, `and still sliding half a second on: ${iv1} of ${iv0}`);
});

test('a conveyor carries what stands on it at its speed, and stops it at a wall', async () => {
  const g = await arena(compileSpec(spec([
    [500, Y - 1, 498, 520, Y, 502, 'dark', { kind: 'conveyor', velocity: [4, 0] }],
    [520, Y, 498, 521, Y + 3, 502, 'rock'],
  ]), flat));
  put(g, 502, 500);
  run(g, 1);
  const x0 = me(g).pos[0];
  run(g, 125);
  assert.ok(Math.abs(me(g).pos[0] - x0 - 4) < 0.01, `4 m in a second: ${me(g).pos[0] - x0}`);
  assert.equal(me(g).vel[0], 0, 'carried, not thrown: its own speed is 0');
  run(g, 600);
  assert.equal(me(g).pos[0], f(520 - 0.5), 'against the wall');
  // walking against it: 10 m/s less 4
  put(g, 515, 500);
  run(g, 100, word(BACK));
  const x1 = me(g).pos[0];
  run(g, 125, word(BACK));
  assert.ok(Math.abs(x1 - me(g).pos[0] - 6) < 0.05, `6 m/s against it: ${x1 - me(g).pos[0]}`);
});

test('a ladder: forward climbs it to its top and onto it, back comes down, nothing hangs on, jump lets go', async () => {
  const g = await arena(compileSpec(spec([[500, Y, 498, 501, Y + 6, 502, 'metal', { kind: 'ladder', speed: 4 }], [501, Y, 498, 506, Y + 6, 502, 'rock']]), flat));
  put(g, 498, 500);
  run(g, 1);
  let ticks = 0;
  while (!(me(g).ground && me(g).pos[1] > Y + 5.9) && ticks++ < 500) run(g, 1, word(FWD));
  assert.ok(me(g).ground && me(g).pos[1] === f(Y + 6), `on top after ${ticks} ticks: ${me(g).pos}`);
  assert.ok(ticks < 300, 'at about 4 m/s');
  assert.ok(me(g).pos[0] > 499.5, 'over the edge');
  // from the foot again: up a way, then hang, then down, then let go
  put(g, 499.4, 500);
  run(g, 100, word(FWD));
  const y1 = me(g).pos[1];
  assert.ok(y1 > Y + 2 && y1 < Y + 4, `part way up: ${y1}`);
  run(g, 60);
  assert.ok(Math.abs(me(g).pos[1] - y1) < 0.05 && !me(g).ground, `hanging: ${me(g).pos[1]}`);
  run(g, 25, word(BACK));
  assert.ok(me(g).pos[1] < y1 - 0.5, `coming down: ${me(g).pos[1]}`);
  const y2 = me(g).pos[1];
  let fell = 0;
  while (!me(g).ground && fell++ < 200) run(g, 1, word(0, 1));
  assert.ok(me(g).ground && me(g).pos[1] === Y && fell < 100, `let go and fell from ${y2}: ${me(g).pos[1]} in ${fell} ticks`);
  // standing at its foot without pressing forward is just standing
  put(g, 499.48, 500);
  run(g, 50);
  assert.ok(me(g).ground && me(g).pos[1] === Y);
});

test('a part on a mover is where the mover is: a kill brick sweeping by, a bounce pad on a lift', async () => {
  const g = await arena(compileSpec({ ...spec(), structures: [
    { name: 'sweep', move: { by: [10, 0, 0], seconds: 2, wait: 0 }, boxes: [[500, Y, 498, 501, Y + 2, 502, 'light#ff2020', 'kill']] },
    { name: 'lift', move: { by: [0, 4, 0], seconds: 4, wait: 0 }, boxes: [[520, Y, 498, 523, Y + 0.5, 502, 'light', { kind: 'bounce', speed: 10 }]] },
  ] }, flat));
  // where the brick was built is safe once it has gone; where it is now is not
  put(g, 506, 506);
  run(g, 1);
  while (g.v.tick % 500 !== 125) run(g, 1); // half way out: the brick at 505..506
  put(g, 500.5, 500);
  run(g, 3);
  assert.equal(me(g).dead, false, 'it has left there');
  put(g, 505.5, 500, Y + 0.01);
  run(g, 2);
  assert.ok(me(g).dead, 'and is here');
  while (me(g).dead) run(g, 1);
  // on the lift's pad, wherever the lift is
  put(g, 521.5, 500, Y + 6);
  let bounced = 0, last = 0;
  for (let k = 0; k < 600; k++) {
    run(g, 1);
    if (me(g).vel[1] === 10 && last !== 10) bounced++;
    last = me(g).vel[1];
  }
  assert.ok(bounced >= 3, `thrown up ${bounced} times off the lift`);
});

test('the prediction steps a body over ice, a conveyor, a bounce pad and a ladder exactly as the confirmed world does', async () => {
  const g = await arena(compileSpec(spec([
    [490, Y - 1, 496, 500, Y, 504, 'plain', { kind: 'ice', grip: 0.4 }],
    [500, Y - 1, 496, 508, Y, 504, 'dark', { kind: 'conveyor', velocity: [2, 1] }],
    [508, Y - 1, 496, 512, Y, 504, 'light', { kind: 'bounce', speed: 8 }],
    [514, Y, 496, 515, Y + 4, 504, 'metal', 'ladder'],
    [515, Y, 496, 520, Y + 4, 504, 'rock'],
  ]), flat));
  put(g, 496, 500);
  run(g, 1);
  const w = (k) => arenaWord({ yaw: (k >> 7) % 3 === 1 ? 1024 : 0, pitch: 512, move: [FWD, FWD, 0, FWD | 4, BACK, FWD][(k >> 5) % 6], jump: k % 97 < 2 ? 1 : 0, serial: (arenaFrame({ lag: 3 }) >> ((g.v.tick + k) & 7)) & 1 });
  const inputs = Array.from({ length: 900 }, (_, k) => w(k));
  let compared = 0;
  const due = new Map(), seen = new Set();
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
    const x = me(g).pos[0];
    seen.add(x < 500 ? 'ice' : x < 508 ? 'belt' : x < 512 ? 'pad' : me(g).pos[1] > Y + 1 ? 'up' : 'floor');
  }
  assert.ok(compared > 900, `${compared} compared`);
  for (const what of ['ice', 'belt', 'pad', 'up']) assert.ok(seen.has(what), `went over the ${what}`);
});

test('a map\'s body: a Roblox character passes a gap and a ceiling the arena\'s own can\'t, and shoots from its own eye', async () => {
  const boxes = [
    [500, Y, 490, 501, Y + 3, 499.6, 'rock'], [500, Y, 500.4, 501, Y + 3, 510, 'rock'], // a wall with a gap 0.8 m wide
    [510, Y + 1.5, 490, 514, Y + 2, 510, 'rock'], // a slab 1.5 m off the floor
  ];
  const small = bodyOf({ width: 0.56, height: 1.4 });
  assert.deepEqual(small.slice(0, 3), [f(0.28), f(1.4), f(1.2)]);
  assert.equal(small[3], f(0.281));
  const walk = async (m, x, z) => {
    const g = await arena(m);
    put(g, x, z);
    run(g, 150, word(FWD));
    return g;
  };
  const roblox = compileSpec(spec(boxes, { body: { width: 0.56, height: 1.4 } }), flat), own = compileSpec(spec(boxes), flat);
  assert.ok(me(await walk(roblox, 497, 500)).pos[0] > 502, 'through the gap');
  assert.equal(me(await walk(own, 497, 500)).pos[0], f(500 - 0.5), 'the arena\'s own stops at it');
  assert.ok(me(await walk(roblox, 506, 500)).pos[0] > 512, 'under the slab');
  assert.equal(me(await walk(own, 506, 500)).pos[0], f(510 - 0.5), 'the arena\'s own doesn\'t fit');
  // a shot leaves from the eye: its tracer starts at 1.2 m, not 1.6
  const g = await arena(roblox);
  put(g, 490, 490);
  run(g, 2);
  run(g, 1, arenaWord({ yaw: 0, pitch: 512, shot: 1 }));
  run(g, 3, arenaWord({ yaw: 0, pitch: 512, shot: 1 }));
  const shot = fxs(g.v, L.FX_SHOT).at(-1);
  assert.ok(shot, 'a shot');
  assert.ok(Math.abs(shot.pos[1] - (Y + 1.2)) < 1e-4, `from ${shot.pos[1] - Y} m up`);
});
