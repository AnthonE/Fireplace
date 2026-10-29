import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileMap } from '../tools/map.mjs';
import { packMap } from '../tools/map-compile.mjs';
import { expand, assemble } from '../tools/asm.mjs';
import { newMemory, instantiate, Sim } from '../harness/core.mjs';
import { arenaBytes, flightBytes } from './helpers.mjs';
import { View } from '../src/arena-view.mjs';
import { Fighter } from '../client/arena-bot.mjs';
import { wasmPrefix } from '../net/wire.mjs';
import * as L from '../src/layout.mjs';

const sim = async (bytes) => { const memory = newMemory(); return new Sim(await instantiate(await WebAssembly.compile(bytes), memory), memory); };
const built = async (m, flight = false) => sim(await assemble(expand('src/game.wat', { ARENA: true, FLIGHT: flight, map: m })));
const same = (a, b, from, to) => Buffer.compare(Buffer.from(a.u8.subarray(from, to)), Buffer.from(b.u8.subarray(from, to))) === 0;
const crossroads = compileMap('maps/crossroads');

test('a map laid at run time (map_load) is the same world as that map built in: the map, the ground, the region', async () => {
  for (const [flight, m] of [[false, crossroads], [true, crossroads], [false, compileMap('maps/skyways')]]) {
    const a = await built(m, flight), b = await sim(flight ? flightBytes() : arenaBytes());
    a.init(0);
    b.loadMap(packMap(m));
    b.init(0);
    const what = `${flight ? 'flight' : 'the arena'} on ${m.name}`;
    assert.ok(same(a, b, L.MAP, L.MAP_RACE_END), `${what}: the map's area`);
    assert.equal(a.x.terrain_hash(), b.x.terrain_hash(), `${what}: the ground`);
    assert.equal(a.x.hash_region(), b.x.hash_region(), `${what}: the region`);
    if (flight) assert.equal(new DataView(b.memory.buffer).getFloat32(L.MAP_CEILING, true), Math.fround(m.ceiling), 'the ceiling, in memory for the sim to read');
  }
});

test('a laid map stays through init on any seed; the built-in one is laid again by an init after a refused map', async () => {
  const s = await sim(arenaBytes());
  s.loadMap(packMap(crossroads));
  s.init(1);
  const h = s.x.terrain_hash();
  s.init(987654);
  assert.equal(s.x.terrain_hash(), h, 'the ground is the map\'s alone, not the seed\'s');
  assert.equal(new DataView(s.memory.buffer).getUint32(L.MAP_NBOX, true), crossroads.boxes.length);
  const t = await sim(arenaBytes());
  assert.throws(() => t.loadMap(new Uint8Array(100)), /refused: not a packed map/);
  t.init(1);
  assert.equal(new DataView(t.memory.buffer).getUint32(L.MAP_NBOX, true), compileMap().boxes.length, 'Box Canyon, the build\'s own');
});

test('a map that is wrong anywhere is refused, with what was wrong, and nothing laid', async () => {
  const good = packMap(crossroads);
  const d = L.MAPPACK_HEAD, m = crossroads.consts;
  const f32 = (b, at, v) => new DataView(b.buffer).setFloat32(at, v, true);
  const u32 = (b, at, v) => new DataView(b.buffer).setUint32(at, v, true);
  const cases = [
    ['not a packed map', (b) => u32(b, L.MP_MAGIC, 0)],
    ['not a packed map', (b) => u32(b, L.MP_BYTES, 5)],
    ['a count past the build', (b) => u32(b, d + L.MAP_NBOX - L.MAP, L.NBOX + 1)],
    ['a count past the build', (b) => u32(b, d + L.MAP_NSPAWN - L.MAP, 0)],
    ['a part outside its bytes', (b) => u32(b, L.MP_BOXES, b.length)],
    ['a part outside its bytes', (b) => u32(b, L.MP_NGROUPB, 32)],
    ['its images outside the world', (b) => u32(b, L.MP_X0, 0)],
    ['its images outside the world', (b) => u32(b, L.MP_W, L.GRID)],
    ['a group or a box', (b) => f32(b, d + m.MAPSEG_BOXES + 12, -1e9)],
    ['a group or a box', (b) => f32(b, d + m.MAPSEG_BOXES + 4, NaN)],
    ['a group or a box', (b) => u32(b, d + m.MAPSEG_GROUPS + 28, L.NBOX)],
    ['its ceiling or void', (b) => f32(b, L.MP_CEIL, 500)],
    ['its ceiling or void', (b) => f32(b, d + L.MAP_VOID - L.MAP, 1000)],
    ['a place that is not a number', (b) => f32(b, d + L.MAP_SPAWN - L.MAP, Infinity)],
    ['a place that is not a number', (b) => f32(b, d + L.MAP_BOUNDS - L.MAP, NaN)],
  ];
  const s = await sim(arenaBytes());
  for (const [why, spoil] of cases) {
    const b = good.slice();
    spoil(b);
    assert.throws(() => s.loadMap(b), new RegExp(`refused: ${why}`), why);
    assert.equal(new DataView(s.memory.buffer).getUint32(L.MAP_HOSTED, true), 0, `${why}: nothing laid`);
    assert.ok(s.u8.subarray(L.MAP, L.MAP_END).every((v) => v === 0), `${why}: the map's area untouched`);
  }
  // golf has no map to take
  const g = await sim(readFileSync(new URL('../build/game.wasm', import.meta.url)));
  assert.throws(() => g.loadMap(good), /takes no map from outside/);
});

test('a match on a laid map steps tick for tick as on the same map built in', async () => {
  const a = await built(crossroads), b = await sim(arenaBytes());
  b.loadMap(packMap(crossroads));
  for (const s of [a, b]) s.init(7);
  const view = new View(a.memory.buffer);
  const bots = Array.from({ length: 8 }, (_, k) => ({ f: new Fighter(k, 7, 0.7), last: -1 }));
  for (let t = 0; t < 2500; t++) {
    const now = [];
    for (const p of bots) {
      if (t === 10 * p.f.slot) now.push([L.EV_JOIN, p.f.slot]);
      if (t > 10 * p.f.slot) { const w = p.f.think(view, t, 6); if (w !== p.last) { now.push([L.EV_INPUT, p.f.slot, w]); p.last = w; } }
    }
    for (const s of [a, b]) { s.feedPlayers(now); s.x.step(); }
    if (t % 100 === 99) assert.equal(a.x.hash_region(), b.x.hash_region(), `tick ${t}`);
  }
  assert.ok(bots.reduce((n, p) => n + view.fighter(p.f.slot).kills, 0) > 0, 'a match was played');
});

test('a hello names the map with the build: another map is another room', async () => {
  const wasm = arenaBytes(), a = packMap(crossroads), b = packMap(compileMap('maps/skyways'));
  const hex = (u) => Buffer.from(u).toString('hex');
  const p0 = hex(await wasmPrefix(wasm)), pa = hex(await wasmPrefix(wasm, a)), pb = hex(await wasmPrefix(wasm, b));
  assert.equal(new Set([p0, pa, pb]).size, 3);
  assert.equal(hex(await wasmPrefix(wasm, a.slice())), pa, 'the same bytes, the same name');
});
