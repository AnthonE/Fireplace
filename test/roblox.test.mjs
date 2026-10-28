import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readRoblox, lz4, basicRotation, path } from '../tools/rbx-file.mjs';
import { robloxToMap, terrainColumns, fit } from '../tools/rbx-map.mjs';
import { compileSpec, materialWord, materialOf } from '../tools/map-compile.mjs';
import { compileMap } from '../tools/map.mjs';
import { expand, assemble } from '../tools/asm.mjs';
import { newMemory, instantiate, Sim } from '../harness/core.mjs';
import { View } from '../src/arena-view.mjs';
import * as L from '../src/layout.mjs';

const fixture = (f) => readFileSync(new URL(`./roblox/${f}`, import.meta.url));
const S = 0.28; // metres a stud, the converter's default

// ---- a place written by hand, in Studio's XML format

// A part: { cls, name, size, at, r (rows), colour, material, shape, anchored, collide, clear, team, kids, props }
function item(p) {
  const r = p.r || [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const props = [
    `<string name="Name">${p.name || p.cls || 'Part'}</string>`,
    p.size && `<Vector3 name="size"><X>${p.size[0]}</X><Y>${p.size[1]}</Y><Z>${p.size[2]}</Z></Vector3>`,
    p.at && `<CoordinateFrame name="CFrame"><X>${p.at[0]}</X><Y>${p.at[1]}</Y><Z>${p.at[2]}</Z>${['R00', 'R01', 'R02', 'R10', 'R11', 'R12', 'R20', 'R21', 'R22'].map((k, i) => `<${k}>${r[i]}</${k}>`).join('')}</CoordinateFrame>`,
    p.colour && `<Color3uint8 name="Color3uint8">${(0xff000000 | (p.colour[0] << 16) | (p.colour[1] << 8) | p.colour[2]) >>> 0}</Color3uint8>`,
    p.material !== undefined && `<token name="Material">${p.material}</token>`,
    p.shape !== undefined && `<token name="shape">${p.shape}</token>`,
    p.size && `<bool name="Anchored">${p.anchored !== false}</bool>`,
    p.collide === false && '<bool name="CanCollide">false</bool>',
    p.clear && '<float name="Transparency">1</float>',
    p.team !== undefined && `<BrickColor name="TeamColor">${p.team}</BrickColor><bool name="Neutral">false</bool>`,
    p.props,
  ].filter(Boolean).join('');
  return `<Item class="${p.cls || 'Part'}" referent="RBX${Math.random().toString(16).slice(2)}"><Properties>${props}</Properties>${(p.kids || []).map(item).join('')}</Item>`;
}
const place = (...parts) => new TextEncoder().encode(`<roblox version="4"><Item class="Workspace" referent="W"><Properties><string name="Name">Workspace</string></Properties>${parts.map(item).join('')}</Item>`
  + '<Item class="ServerStorage" referent="SS"><Properties><string name="Name">ServerStorage</string></Properties>'
  + item({ name: 'Spare', size: [4, 4, 4], at: [0, 50, 0] }) + '</Item></roblox>');
const baseplate = { name: 'Baseplate', size: [256, 4, 256], at: [0, -2, 0], colour: [99, 95, 98] };
// the boxes of a converted map (world metres) and its spec
function convert(...parts) {
  const out = robloxToMap(readRoblox(place(...parts)));
  const boxes = out.spec.structures.flatMap((s) => s.boxes);
  return { ...out, boxes, map: compileSpec(out.spec, out.images) };
}
// the map's metres for the place's studs, by the converter's own offset: where the baseplate's top (0) went
const near = (a, b, e = 1e-3) => Math.abs(a - b) < e;

test('LZ4 blocks: literals, then a match that overlaps what it copies', () => {
  const block = Uint8Array.from([0x35, 0x61, 0x62, 0x63, 0x03, 0x00]); // "abc", then 9 bytes from 3 back
  assert.equal(new TextDecoder().decode(lz4(block, 12)), 'abcabcabcabc');
  assert.throws(() => lz4(block, 13), /came to 12 B, not 13/);
});

test('a binary CFrame\'s one-byte rotations are the axes they name', () => {
  assert.deepEqual(basicRotation(0x02), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  assert.deepEqual(basicRotation(0x03), [1, 0, 0, 0, 0, -1, 0, 1, 0]); // rbx-dom's table
  assert.deepEqual(basicRotation(0x14), [-1, 0, 0, 0, 1, 0, 0, 0, -1]); // 180 about y
});

test('Studio\'s baseplate place reads the same from its binary and XML files', () => {
  const bin = readRoblox(fixture('baseplate.rbxl')), xml = readRoblox(fixture('baseplate.rbxlx'));
  const parts = (d) => d.instances.filter((x) => x.props.CFrame && x.props.size && /^Workspace\./.test(path(x)))
    .map((x) => ({ path: path(x), class: x.class, size: x.props.size, cf: x.props.CFrame, colour: x.props.Color3uint8, anchored: x.props.Anchored }))
    .sort((a, b) => (a.path < b.path ? -1 : 1));
  assert.deepEqual(parts(bin), parts(xml));
  const plate = parts(bin).find((p) => p.path === 'Workspace.Baseplate');
  assert.deepEqual(plate.size, [2048, 16, 2048]);
  assert.deepEqual(plate.cf.p, [0, -8, 0]);
  assert.ok(bin.instances.some((x) => x.class === 'SpawnLocation'));
  // and as a map: the plate is the ground, the spawn location a box, a spawn on each half
  const m = robloxToMap(bin);
  assert.equal(m.count.ground, 1);
  assert.equal(m.spec.structures.flatMap((s) => s.boxes).length, 1);
  compileSpec(m.spec, m.images);
});

test('a union is its own parts, from the place inside it, moved where the union is', () => {
  const d = readRoblox(fixture('unions.rbxm'));
  assert.deepEqual(d.instances.map((x) => x.name), ['Red Union 1', 'Red Union 2', 'Blue Union']);
  const m = robloxToMap(d);
  assert.equal(m.count.approx, 0, 'each union\'s shape came from its parts, none from its bounds');
  // Red Union 2 is Red Union 1 moved 7 studs along -x: the same boxes, moved
  const boxes = m.spec.structures.flatMap((s) => s.boxes).filter((b) => b[6] === '#c4281c').sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  assert.equal(boxes.length, 4);
  const [a, b] = [boxes.slice(0, 2), boxes.slice(2)];
  for (let k = 0; k < 2; k++) assert.ok(near(b[k][0] - a[k][0], 7 * S) && near(b[k][3] - a[k][3], 7 * S) && near(b[k][1], a[k][1]), JSON.stringify([a[k], b[k]]));
});

test('terrain: the top of each column of solid voxels, water drained (rbx-dom\'s SmoothGrid sample)', () => {
  // two chunks (the second one along x, its offset interleaved), each a water voxel then a pavement one, then air, 256 at a time
  const chunk = [0x01, 0x16, ...Array(127).fill([0x80, 0xff]).flat(), 0x80, 0xfd];
  const grid = Uint8Array.from([1, 5, ...Array(12).fill(0), ...chunk, ...Array(9).fill(0), 1, 0, 0, ...chunk]);
  assert.equal(btoa(String.fromCharCode(...grid)).slice(0, 40), 'AQUAAAAAAAAAAAAAAAABFoD/gP+A/4D/gP+A/4D/', 'rbx-dom\'s TERRAIN_BASE64');
  const cols = terrainColumns(grid);
  assert.deepEqual([...cols.entries()].map(([k, v]) => [Math.floor(k / 65536) - 32768, (k % 65536) - 32768, ...v]).sort((p, q) => p[0] - q[0]), [[1, 0, 4, 22], [33, 0, 4, 22]]);
  assert.throws(() => terrainColumns(Uint8Array.from([2, 5, 0])), /unknown kind/);
});

test('a block square to the axes is its box, in its colour, at 0.28 m a stud; a baseplate is the ground', () => {
  const m = convert(baseplate, { name: 'Crate', size: [4, 6, 10], at: [20, 3, -8], colour: [196, 40, 28] }, { name: 'Plate', size: [8, 1, 8], at: [-30, 0.5, 30], colour: [128, 128, 128], material: 1088 });
  assert.equal(m.count.ground, 1);
  const crate = m.boxes.find((b) => b[6] === '#c4281c'), plate = m.boxes.find((b) => b[6] === 'metal#808080');
  assert.ok(crate && plate, JSON.stringify(m.boxes));
  assert.deepEqual([crate[3] - crate[0], crate[4] - crate[1], crate[5] - crate[2]].map((v) => +v.toFixed(3)), [4 * S, 6 * S, 10 * S].map((v) => +v.toFixed(3)));
  assert.ok(near(plate[0] - crate[0], -52 * S) && near(plate[2] - crate[2], 39 * S), 'the two as far apart as in the place');
  // the crate stands on the ground: the plate's top (0 studs) is the ground's height under it
  const [x, z] = [(crate[0] + crate[3]) / 2, (crate[2] + crate[5]) / 2];
  const v = m.map, i = Math.round((x - v.origin[0]) / 2), j = Math.round((z - v.origin[1]) / 2);
  assert.ok(Math.abs(v.heights[j * v.size[0] + i] / 256 - crate[1]) < 0.01, `ground ${v.heights[j * v.size[0] + i] / 256}, crate's bottom ${crate[1]}`);
  assert.equal(m.spec.void, undefined, 'all of it ground: no void');
});

test('a wedge is stairs a fighter walks up; a turned wall a row of posts with no way through', () => {
  // a ramp 20 studs long rising 8 to the back (+z), and a wall turned 45 degrees
  const c = Math.SQRT1_2;
  const m = convert(baseplate, { cls: 'WedgePart', name: 'Ramp', size: [8, 8, 20], at: [0, 4, 0], colour: [10, 200, 10] },
    { name: 'Wall', size: [30, 10, 1], at: [40, 5, 40], r: [c, 0, c, 0, 1, 0, -c, 0, c], colour: [200, 10, 10] });
  const ramp = m.boxes.filter((b) => b[6] === '#0ac80a').sort((a, b) => a[2] - b[2]);
  assert.ok(ramp.length > 4);
  const tops = ramp.map((b) => b[4]);
  for (let k = 1; k < tops.length; k++) assert.ok(tops[k] >= tops[k - 1] && tops[k] - tops[k - 1] <= Number(L.STEP), `step ${tops[k] - tops[k - 1]} m`);
  assert.ok(Math.abs(tops.at(-1) - tops[0] - 8 * S) < 0.5, 'climbs the wedge\'s height');
  assert.ok(ramp[0][2] < ramp.at(-1)[2], 'low at the front (-z), high at the back');
  // a line along the wall's own length crosses no gap: every point on it is in a post
  const wall = m.boxes.filter((b) => b[6] === '#c80a0a');
  const centre = wall.reduce((p, b) => [p[0] + (b[0] + b[3]) / 2 / wall.length, p[1] + (b[2] + b[5]) / 2 / wall.length], [0, 0]);
  for (let t = -13; t <= 13; t += 0.25) {
    const x = centre[0] + t * S * c, z = centre[1] - t * S * c;
    assert.ok(wall.some((b) => x >= b[0] - 1e-6 && x <= b[3] + 1e-6 && z >= b[2] - 1e-6 && z <= b[5] + 1e-6), `a gap at ${t} studs`);
  }
});

test('what is left out: passable, invisible, characters, vehicles, storage; unanchored bricks stay', () => {
  const m = convert(baseplate,
    { name: 'Ghost', size: [4, 4, 4], at: [10, 2, 10], collide: false },
    { name: 'Barrier', size: [4, 4, 4], at: [20, 2, 10], clear: true },
    { cls: 'Model', name: 'Noob', kids: [{ cls: 'Humanoid', name: 'Humanoid' }, { name: 'Torso', size: [2, 2, 1], at: [0, 3, 30] }] },
    { cls: 'Model', name: 'Jeep', kids: [{ cls: 'VehicleSeat', name: 'Seat', size: [2, 1, 2], at: [30, 1, 30], anchored: false }, { name: 'Body', size: [6, 2, 10], at: [30, 1, 30], anchored: false }] },
    { name: 'Brick', size: [4, 1.2, 2], at: [-10, 0.6, -10], anchored: false, colour: [1, 2, 3] });
  assert.deepEqual([m.count.passable, m.count.invisible, m.count.characters, m.count.vehicles, m.count.outside], [1, 1, 1, 2, 1]);
  assert.ok(m.boxes.some((b) => b[6] === '#010203'), 'the unanchored brick is a box');
  assert.equal(m.boxes.length, 1);
  assert.equal(robloxToMap(readRoblox(place(baseplate, { name: 'Brick', size: [4, 1.2, 2], at: [-10, 0.6, -10], anchored: false })), { anchored: true }).count.loose, 1);
});

test('a negated part cuts its union: a doorway through a wall stays open', () => {
  // a union's parts are a place inside it (ChildData; Studio writes it binary, the reader takes XML as well), about the union's centre
  const inner = new TextEncoder().encode(`<roblox version="4">${item({ name: 'W', size: [20, 10, 2], at: [0, 0, 0] })}${item({ cls: 'NegateOperation', name: 'Door', size: [4, 7, 4], at: [0, -1.5, 0] })}</roblox>`);
  const m = convert(baseplate, { cls: 'UnionOperation', name: 'Wall', size: [20, 10, 2], at: [0, 5, 0], colour: [90, 90, 200],
    props: `<BinaryString name="ChildData">${btoa(String.fromCharCode(...inner))}</BinaryString><Vector3 name="InitialSize"><X>20</X><Y>10</Y><Z>2</Z></Vector3>` });
  assert.equal(m.count.approx, 0);
  const wall = m.boxes.filter((b) => b[6] === '#5a5ac8');
  assert.ok(wall.length >= 3, `the wall either side of the door and over it: ${wall.length} boxes`);
  const x0 = Math.min(...wall.map((b) => b[0])), x1 = Math.max(...wall.map((b) => b[3])), low = Math.min(...wall.map((b) => b[1]));
  assert.ok(near(x1 - x0, 20 * S, 0.3), `the wall is 20 studs long: ${x1 - x0}`);
  const mid = (x0 + x1) / 2;
  assert.ok(!wall.some((b) => mid >= b[0] && mid <= b[3] && low + 0.5 >= b[1] && low + 0.5 <= b[4]), 'nothing in the doorway');
  assert.ok(wall.some((b) => mid >= b[0] && mid <= b[3] && b[4] > low + 7 * S), 'the lintel over it');
});

test('spawn locations: the two commonest teams are red and blue, their flags among their spawns', () => {
  const sp = (x, team) => ({ cls: 'SpawnLocation', name: 'Spawn', size: [6, 1, 6], at: [x, 0.5, 0], team });
  const m = convert(baseplate, sp(-80, 23), sp(-70, 23), sp(70, 21), sp(80, 21), sp(0, 24));
  const [red, blue] = m.spec.flags;
  assert.ok(red.at[0] > blue.at[0], 'red (BrickColor 21, Bright red) at +x, where its spawns are');
  assert.equal(m.spec.spawns.length, 5);
  assert.deepEqual(m.map.sides, [2, 2]);
});

test('a place with sky under it gets a void: a pit, and a height below which a fighter falls to death', async () => {
  // two islands 60 studs up, 40 studs of sky between them, a spawn on each
  const island = (x) => ({ name: 'Island', size: [100, 4, 100], at: [x, 60, 0], colour: [40, 120, 40] });
  const spawn = (x) => ({ cls: 'SpawnLocation', name: 'S', size: [6, 1, 6], at: [x, 62.5, 0] });
  const m = convert(island(-70), island(70), spawn(-90), spawn(90));
  assert.ok(m.spec.void > 0, 'a void');
  const top = m.map.heights.reduce((a, h) => Math.max(a, h / 256), 0);
  assert.ok(near(top - m.spec.void, 3, 0.05), `3 m under the lowest ground: the islands ${top} m, the void ${m.spec.void} m`);
  // in the sim: one fighter on the island lives, one dropped past the void dies by falling
  const bytes = await assemble(expand('src/game.wat', { ARENA: true, map: m.map }));
  const memory = newMemory();
  const sim = new Sim(await instantiate(await WebAssembly.compile(bytes), memory), memory);
  sim.init(7);
  const v = new View(sim.memory.buffer), dv = new DataView(sim.memory.buffer);
  const step = (recs = []) => { sim.feedPlayers(recs); sim.x.step(); };
  step([[L.EV_JOIN, 0], [L.EV_JOIN, 1]]);
  while (v.hole().state !== L.H_PLAY) step();
  // over the gap between the islands (the map's middle), just under the void, above the pit's floor
  const b = L.PLAYERS + L.PSIZE, [x0, x1, z0, z1] = m.spec.bounds;
  assert.ok(m.map.heights[Math.round(((z0 + z1) / 2 - m.map.origin[1]) / 2) * m.map.size[0] + Math.round(((x0 + x1) / 2 - m.map.origin[0]) / 2)] / 256 < m.spec.void - 1, 'the pit under the gap');
  dv.setFloat32(b + L.P_PX, (x0 + x1) / 2, true);
  dv.setFloat32(b + L.P_PZ, (z0 + z1) / 2, true);
  dv.setFloat32(b + L.P_PY, m.spec.void - 0.5, true);
  step();
  assert.equal(v.fighter(0).dead, false);
  assert.equal(v.fighter(1).dead, true);
  const kill = [];
  for (let k = 0; k < v.fxCount(); k++) { const f = v.fx(k); if (f.kind === L.FX_KILL) kill.push(f); }
  assert.ok(kill.some((f) => f.size === L.KILL_FALL), 'by falling');
});

test('fitting a budget fuses bricks that touch but never closes a gap', () => {
  const box = (b, colour = [100, 100, 100]) => ({ b, colour, look: 'plain', key: '', model: '' });
  // a wall of staggered bricks (each course offset half a brick), and beside it a door's gap of 1 m between two walls
  const bricks = [];
  for (let y = 0; y < 6; y++) for (let x = 0; x < 8; x++) { const o = (y % 2) * 0.5; bricks.push(box([x + o, y * 0.5, 0, x + o + 1, y * 0.5 + 0.5, 0.3])); }
  const left = box([20, 0, 0, 24, 3, 0.3]), right = box([25, 0, 0, 29, 3, 0.3]);
  const all = [...bricks, left, right];
  const loose = fit(all, 1000);
  assert.equal(loose.level, null, 'within budget: only exact joins');
  const tight = fit(all, 4);
  assert.ok(tight.boxes.length <= 4, `${tight.boxes.length} boxes`);
  assert.ok(!tight.boxes.some((x) => x.b[0] < 24.5 && x.b[3] > 24.5), 'the doorway at x 24..25 is open');
});

test('a box\'s own colour: a material word the sim never reads, the renderer\'s look and rgb', () => {
  assert.equal(materialWord('metal'), 0);
  assert.equal(materialWord('plain'), 6);
  const w = materialWord('rock#7a6e5c');
  assert.deepEqual(materialOf(w), { look: 1, rgb: [0x7a, 0x6e, 0x5c] });
  assert.deepEqual(materialOf(materialWord('#ff0000')), { look: 6, rgb: [255, 0, 0] });
  assert.equal(materialWord('gold#ffffff'), -1);
  assert.equal(materialWord('#12345'), -1);
});

test('maps/crossroads, Roblox\'s Crossroads made by the converter, builds', () => {
  const m = compileMap('maps/crossroads');
  assert.equal(m.name, 'Crossroads');
  assert.ok(m.boxes.length > 1000 && m.boxes.length <= L.NBOX, `${m.boxes.length} boxes`);
  assert.ok(m.boxes.some((b) => materialOf(b.material).rgb), 'in their own colours');
  assert.equal(m.spawns.length, 9);
  assert.equal(m.void, null, 'its baseplate is the ground all the way to the bounds: no void');
});

test('the converter is the page\'s too: no Node in its modules', () => {
  for (const f of ['rbx-file.mjs', 'rbx-map.mjs']) {
    const src = readFileSync(new URL(`../tools/${f}`, import.meta.url), 'utf8');
    assert.ok(!/from 'node:|require\(/.test(src), `${f} imports Node`);
  }
});
