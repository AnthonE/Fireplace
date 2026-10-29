import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readVox, writeVox, eachVoxel, rotation, DEFAULT_PALETTE } from '../tools/vox-file.mjs';
import { voxToMap } from '../tools/vox-map.mjs';
import { compileSpec, packMap } from '../tools/map-compile.mjs';
import { newMemory, instantiate, Sim } from '../harness/core.mjs';
import { arenaBytes } from './helpers.mjs';
import { View } from '../src/arena-view.mjs';
import { Fighter } from '../client/arena-bot.mjs';
import * as L from '../src/layout.mjs';

// a model of size [x, y, z] from a function (x, y, z) -> colour (0 none)
function model(size, fill) {
  const v = [];
  for (let z = 0; z < size[2]; z++) for (let y = 0; y < size[1]; y++) for (let x = 0; x < size[0]; x++) { const c = fill(x, y, z); if (c) v.push(x, y, z, c); }
  return { size, voxels: v };
}
const voxels = (vox) => { const out = []; eachVoxel(vox, (x, y, z, c, k) => out.push([x, y, z, c, k])); return out; };
const convert = (file, opts) => { const out = voxToMap(readVox(file), opts); return { ...out, map: compileSpec(out.spec, out.images) }; };

test('MagicaVoxel\'s default palette, as its spec lists it', () => {
  const rgba = (i) => [...DEFAULT_PALETTE.subarray(4 * i, 4 * i + 4)];
  // spec entries 1, 2, 7, 91, 215 (the cube's last), 216, 226, 236, 246, 255
  assert.deepEqual([1, 2, 7, 91, 215, 216, 226, 236, 246, 255].map(rgba), [
    [255, 255, 255, 255], [255, 255, 204, 255], [255, 204, 255, 255], [153, 102, 255, 255], [0, 0, 51, 255],
    [238, 0, 0, 255], [0, 238, 0, 255], [0, 0, 238, 255], [238, 238, 238, 255], [17, 17, 17, 255],
  ]);
  assert.deepEqual(rgba(0), [0, 0, 0, 0]);
});

test('a file MagicaVoxel saved: an older one with no scene, on the default palette', () => {
  const v = readVox(readFileSync(new URL('./vox/maze.vox', import.meta.url)));
  assert.equal(v.version, 150);
  assert.equal(v.scene, false);
  assert.ok(v.defaultPalette);
  assert.deepEqual(v.models[0].size, [100, 100, 100]);
  const all = voxels(v);
  assert.equal(all.length, 10990);
  assert.ok(all.every(([, , , c]) => c === 91));
  // about its middle: 0..99 is -50..49
  assert.deepEqual([0, 1, 2].map((a) => [Math.min(...all.map((p) => p[a])), Math.max(...all.map((p) => p[a]))]), [[-50, 49], [-50, 49], [-50, 49]]);
});

test('a scene: transforms composed, turns, names, hidden objects and layers left out, materials, the palette', () => {
  const pal = DEFAULT_PALETTE.slice();
  pal.set([10, 20, 30, 255], 4 * 5);
  const L_shape = model([3, 2, 1], (x, y) => (y === 0 || x === 0 ? 5 : 0)); // an L: (0..2, 0) and (0, 1)
  const turn = [0, -1, 0, 1, 0, 0, 0, 0, 1]; // a quarter turn about z: x -> y
  const bytes = writeVox({
    models: [L_shape],
    palette: pal,
    instances: [
      { model: 0, name: 'here', t: [10, 0, 0] },
      { model: 0, name: 'turned', t: [0, 10, 0], r: turn },
      { model: 0, name: 'hidden', t: [0, 0, 20], hidden: true },
      { model: 0, name: 'on a hidden layer', t: [0, 0, 30], layer: 1 },
    ],
    materials: new Map([[5, { _type: '_metal', _metal: '0.8' }]]),
    layers: [{ name: 'shown' }, { name: 'off', hidden: true }],
  });
  const v = readVox(bytes);
  assert.equal(v.version, 200);
  assert.ok(v.scene);
  assert.deepEqual([...v.palette.subarray(20, 24)], [10, 20, 30, 255]);
  assert.equal(v.materials.get(5).type, 'metal');
  assert.deepEqual(v.instances.map((i) => i.name), ['here', 'turned']);
  // pivot floor([3, 2, 1] / 2) = (1, 1, 0)
  const got = voxels(v).map(([x, y, z, , k]) => `${k}:${x},${y},${z}`).sort();
  const want = [];
  for (const [x, y] of [[0, 0], [1, 0], [2, 0], [0, 1]]) {
    want.push(`0:${x - 1 + 10},${y - 1},0`);
    want.push(`1:${-(y - 1)},${x - 1 + 10},0`);
  }
  assert.deepEqual(got, want.sort());
  // every rotation byte MagicaVoxel can write reads as a turn and writes back the same
  for (let r = 0; r < 128; r++) {
    const c0 = r & 3, c1 = (r >> 2) & 3;
    if (c0 > 2 || c1 > 2 || c0 === c1) { assert.throws(() => rotation(r)); continue; }
    const m = rotation(r);
    const back = readVox(writeVox({ models: [L_shape], instances: [{ model: 0, r: m }] })).instances[0].r;
    assert.deepEqual(back, m, `rotation ${r}`);
  }
});

test('a file that is not one, or is cut short, is refused with what was wrong', () => {
  assert.throws(() => readVox(new TextEncoder().encode('hello there, not a voxel file')), /not a MagicaVoxel file/);
  const good = writeVox({ models: [model([2, 2, 2], () => 1)] });
  assert.throws(() => readVox(good.slice(0, 40)), /runs past the file/);
  const none = writeVox({ models: [model([2, 2, 2], () => 0)] });
  assert.throws(() => voxToMap(readVox(none)), /nothing to stand on/);
});

// A floor 60 x 60 voxels (30 m), one deep, grass green; a wall on it; a
// floating slab; a red spawn and a blue one at the ends; a sword lying about.
function arenaScene() {
  const green = 5, wall = 6, gold = 7;
  const pal = DEFAULT_PALETTE.slice();
  pal.set([80, 130, 50, 255], 4 * green);
  pal.set([200, 60, 40, 255], 4 * wall);
  pal.set([230, 200, 40, 255], 4 * gold);
  const floor = model([60, 60, 1], () => green);
  const wallM = model([2, 20, 6], () => wall); // 1 x 10 x 3 m
  const slab = model([8, 8, 1], () => gold);
  const pad = model([4, 4, 1], () => wall);
  const sword = model([1, 1, 3], () => gold);
  return writeVox({
    models: [floor, wallM, slab, pad, sword],
    palette: pal,
    instances: [
      { model: 0, name: 'ground', t: [0, 0, 0] },
      { model: 1, name: 'the wall', t: [0, 0, 4] }, // z 1..6 (pivot 3)
      { model: 2, name: 'slab', t: [10, 10, 12] },
      { model: 3, name: 'Red Spawn', t: [-24, 0, 1] },
      { model: 3, name: 'blue spawn', t: [24, 0, 1] },
      { model: 4, name: 'sword', t: [0, 20, 2] },
    ],
    materials: new Map([[gold, { _type: '_emit' }]]),
  });
}

test('a voxel scene into a map: the floor the ground, the rest exact boxes, spawns and a pad from names', () => {
  const m = convert(arenaScene(), { name: 'Voxel Yard' });
  assert.equal(m.count.columns, 3600, 'every column of the floor');
  assert.equal(m.count.depth, 1);
  assert.equal(m.count.spawns, 2);
  assert.equal(m.spec.void, undefined, 'the floor covers the play: no void');
  const boxes = m.spec.structures.flatMap((s) => s.boxes);
  const size = (b) => [b[3] - b[0], b[4] - b[1], b[5] - b[2]].map((v) => Math.round(v * 100) / 100);
  const wall = boxes.find((b) => b[6] === '#c83c28' && size(b)[2] === 10);
  assert.ok(wall, 'the wall, one box');
  assert.deepEqual(size(wall), [1, 3, 10]);
  const pad = boxes.find((b) => b[6] === '#c83c28' && size(b)[2] === 2);
  assert.equal(wall[1], pad[1], 'the wall and the spawns\' pads stand on the floor\'s top');
  const slab = boxes.find((b) => b[6] === 'light#e6c828');
  assert.ok(slab, 'the slab, its emit material the lit look');
  assert.deepEqual(size(slab), [4, 0.5, 4]);
  // red's spawn to the -x, blue's to the +x, each on its pad
  assert.deepEqual(m.spec.flags.map((f) => f.team), ['red', 'blue']);
  assert.ok(m.spec.flags[0].at[0] < m.spec.flags[1].at[0]);
  assert.equal(m.spec.spawns.length, 2);
  assert.deepEqual(m.spec.pads.map((p) => p.weapon), ['sword']);
  assert.equal(m.map.spawns.length, 2);
  assert.ok(boxes.every((b) => b[6] !== 'light#e6c828' || size(b)[0] === 4), 'the sword\'s voxels are the pad, not a box');
  assert.equal(m.spec.from, 'a MagicaVoxel model, 0.5 m a voxel (tools/vox.mjs)');
  // the same bytes, the same map
  assert.deepEqual(convert(arenaScene(), { name: 'Voxel Yard' }).spec, m.spec);
});

test('a model in the air has no ground: open air under it, a void, spawns added', () => {
  const island = writeVox({ models: [model([40, 40, 4], (x, y, z) => (z === 3 || (x > 15 && x < 25 && y > 15 && y < 25) ? 1 + (z % 2) : 0))], instances: [{ model: 0, t: [0, 0, 50] }] });
  const m = convert(island);
  // the island's middle reaches down to the model's bottom, but its 81
  // columns are too few to be the ground
  assert.equal(m.count.columns, 0);
  assert.ok(m.spec.void > 0, 'a void under it');
  assert.ok(m.report.some((r) => /open air/.test(r)));
  assert.ok(m.spec.spawns.length >= 2);
});

test('a voxel map plays: a match on it in the arena, laid at run time', async () => {
  const m = convert(arenaScene());
  const memory = newMemory();
  const s = new Sim(await instantiate(await WebAssembly.compile(arenaBytes()), memory), memory);
  s.loadMap(packMap(m.map));
  s.init(3);
  const view = new View(memory.buffer);
  const bots = Array.from({ length: 4 }, (_, k) => ({ f: new Fighter(k, 3, 0.7), last: -1 }));
  for (let t = 0; t < 3000; t++) {
    const now = [];
    for (const p of bots) {
      if (t === 10 * p.f.slot) now.push([L.EV_JOIN, p.f.slot]);
      if (t > 10 * p.f.slot) { const w = p.f.think(view, t, 6); if (w !== p.last) { now.push([L.EV_INPUT, p.f.slot, w]); p.last = w; } }
    }
    s.feedPlayers(now);
    s.x.step();
  }
  assert.ok(bots.reduce((n, p) => n + view.fighter(p.f.slot).kills, 0) > 0, 'someone was killed');
});

test('the voxel converter is the page\'s too: no Node in its modules', () => {
  for (const f of ['vox-file.mjs', 'vox-map.mjs']) {
    const src = readFileSync(new URL(`../tools/${f}`, import.meta.url), 'utf8');
    assert.ok(!/from 'node:|require\(/.test(src), `${f} imports Node`);
  }
});
