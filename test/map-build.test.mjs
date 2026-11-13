// The map editor's building half (client/map-build.mjs), which has no page in
// it: its camera against the renderer's own projection, the ray through the
// pointer against boxes and the ground, the plane and the lines a drag
// slides along, the grid, a box moved and sized through a turned structure,
// parts read and written as map.json holds them with their looks, the
// course's check, and the starter obby compiled, saved and run by AI fighters.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { arenaBytes } from './helpers.mjs';
import { project } from '../client/arena-render.mjs';
import { compileSpec, packMap, formatSpec, partOf, place, MAP_MODES } from '../tools/map-compile.mjs';
import { compileMap, mapDir } from '../tools/map.mjs';
import { playArena } from '../tools/genarena.mjs';
import { obby } from '../tools/obby.mjs';
import { robloxToMap } from '../tools/rbx-map.mjs';
import { readRoblox } from '../tools/rbx-file.mjs';
import { doneOf } from '../client/am/obby.mjs';
import { moverAt } from '../src/arena-view.mjs';
import * as L from '../src/layout.mjs';
import {
  orbitEye, screenOf, rayAt, polygonOf, segmentOf, rayBox, pickRay, rayPlane, rayGround, alongAxis, snap, movedBox, facedBox, dropBox,
  worldBox, setWorldBox, moveOf, movedAt, shifted, readPart, writePart, partsOf, nextStage, lookFor, setKind, setPartField,
  beltOf, beltVelocity, beltWorld, beltLocal, PART_NAMES, PART_LOOKS, PART_MARK, PART_WHAT, ROBLOX_MOVEMENT, ROBLOX_BODY, needsSides,
  courseOf, partCounts, starterObby,
} from '../client/map-build.mjs';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const nears = (a, b, eps = 1e-6, msg = '') => { assert.equal(a.length, b.length, msg); a.forEach((v, i) => assert.ok(near(v, b[i], eps), `${msg} [${i}] ${v} vs ${b[i]}`)); };
const flat = (W, H, m = 10) => ({ height: { width: W, height: H, channels: 1, depth: 16, data: new Uint16Array(W * H).fill(m * 256) }, surface: { width: W, height: H, channels: 3, depth: 8, data: new Uint8Array(W * H * 3).fill(110) } });

test('the editor\'s building half loads in a page: no Node in it', () => {
  assert.doesNotMatch(readFileSync('client/map-build.mjs', 'utf8'), /from 'node:|require\(/);
});

test('the eye is the renderer\'s camera: a point lands where project() puts it, and the ray through it comes back', () => {
  const orbit = { target: [500, 26, 512], yaw: -1.1, pitch: -0.6, dist: 34 };
  for (const [W, H] of [[580, 796], [1280, 720], [900, 400]]) {
    const e = orbitEye(orbit, W, H);
    // the camera where client/map-view.mjs puts it, and the target mid-screen
    const cp = Math.cos(orbit.pitch);
    nears(e.cam, [500 - Math.cos(-1.1) * cp * 34, 26 - Math.sin(-0.6) * 34, 512 - Math.sin(-1.1) * cp * 34]);
    nears(screenOf(e, orbit.target).slice(0, 2), [W / 2, H / 2], 1e-6, 'the target');
    const s = { cam: e.cam, yaw: orbit.yaw, pitch: orbit.pitch, zoom: 1 };
    for (const q of [[490, 26, 510], [520, 20, 530], [470, 40, 500], [500, 10, 512]]) {
      const mine = screenOf(e, q);
      nears(mine, project(s, W, H, q), 1e-6, `${W}x${H} ${q}`);
      // and back: the ray through that pixel passes through the point, its depth the ray's t
      const { o, d } = rayAt(e, mine[0], mine[1]);
      nears([0, 1, 2].map((k) => o[k] + d[k] * mine[2]), q, 1e-6, 'the ray');
    }
  }
});

test('a ray against boxes: the nearest one, the face it enters by, nothing from inside or past', () => {
  const b = [0, 0, 0, 2, 1, 4];
  assert.deepEqual(rayBox([-5, 0.5, 2], [1, 0, 0], b), { t: 5, axis: 0, sign: -1 }, 'from the west: its west face');
  assert.deepEqual(rayBox([7, 0.5, 2], [-1, 0, 0], b), { t: 5, axis: 0, sign: 1 }, 'from the east');
  assert.deepEqual(rayBox([1, 9, 2], [0, -1, 0], b), { t: 8, axis: 1, sign: 1 }, 'from above: its top');
  assert.deepEqual(rayBox([1, 0.5, -3], [0, 0, 2], b), { t: 1.5, axis: 2, sign: -1 }, 't in units of the direction');
  assert.equal(rayBox([-5, 2, 2], [1, 0, 0], b), null, 'over it');
  assert.equal(rayBox([-5, 0.5, 2], [-1, 0, 0], b), null, 'behind the ray');
  assert.equal(rayBox([1, 0.5, 2], [1, 0, 0], b), null, 'from inside: no face');
  // a slanting ray picks the nearer of two, and says where
  const hit = pickRay([-3, 5, 2], [1, -1, 0], [[10, 0, 0, 12, 1, 4], b, [0, 0, 10, 2, 1, 14]]);
  assert.equal(hit.i, 1);
  assert.deepEqual([hit.axis, hit.sign], [1, 1]);
  nears(hit.at, [1, 1, 2]);
  assert.equal(pickRay([-3, 5, 2], [1, 1, 0], [b]), null);
});

test('the ground, the drag plane and the line a handle slides along', () => {
  nears(rayPlane([0, 10, 0], [1, -1, 0.5], 1, 4), [6, 4, 3]);
  assert.equal(rayPlane([0, 10, 0], [1, 1, 0], 1, 4), null, 'the plane is behind');
  assert.equal(rayPlane([0, 10, 0], [1, 0, 0], 1, 4), null, 'along it');
  // a slope rising 1 in 4 to the east: the ray comes down onto it
  const slope = (x) => x / 4;
  const g = rayGround([0, 30, 5], [1, -1, 0], slope);
  nears(g, [24, 6, 5], 1e-4);
  assert.equal(rayGround([0, 30, 5], [1, 0.5, 0], slope, 500), null, 'up into the sky');
  assert.equal(rayGround([0, -3, 5], [1, 0, 0], slope), null, 'from under it');
  // a handle on the vertical through (5, 0, 5): a level ray aimed at 3 m up says 3
  assert.ok(near(alongAxis([0, 3, 0], [1, 0, 1], [5, 0, 5], 1), 3));
  // a slanting ray that misses the line: the point of the line nearest it
  assert.ok(near(alongAxis([1.5, 0, -2], [0, 1, 1], [5, 0, 0], 0), 1.5), 'a ray that crosses the line\'s way at x = 1.5');
  assert.ok(near(alongAxis([2, 10, -3], [0, -1, 0], [0, 0, 0], 0), 2), 'straight down at x = 2');
  assert.equal(alongAxis([0, 5, 0], [0, 1, 0], [3, 0, 3], 1), null, 'a ray along the axis says nothing');
});

test('the grid: a quarter metre by default, off is a millimetre; a box moved, sized and dropped lands on it', () => {
  assert.equal(snap(3.13, 0.25), 3.25);
  assert.equal(snap(-0.1, 0.25), 0);
  assert.equal(snap(3.1234567, 0), 3.123);
  assert.equal(snap(0.30000000000000004, 0.1), 0.3);
  const w = [490.8, 25.5, 510.8, 492.8, 26, 513.2];
  assert.deepEqual(movedBox(w, [2.7, 0, 4.2], 0.25), [493.5, 25.5, 515, 495.5, 26, 517.4], 'across the ground: its height as it was, its size kept');
  assert.deepEqual(movedBox(w, [0, 5.6, 0], 0.25), [490.8, 31, 510.8, 492.8, 31.5, 513.2], 'raised: only its height');
  assert.deepEqual(movedBox(w, [0.004, 0, 0], 0), [490.804, 25.5, 510.8, 492.804, 26, 513.2], 'no grid');
  assert.deepEqual(facedBox(w, 0, 1, 494.9, 0.25), [490.8, 25.5, 510.8, 495, 26, 513.2], 'its east face');
  assert.deepEqual(facedBox(w, 1, -1, 24.1, 0.5), [490.8, 24, 510.8, 492.8, 26, 513.2], 'its foot');
  assert.deepEqual(facedBox(w, 0, 1, 480, 0.25), [490.8, 25.5, 510.8, 491.05, 26, 513.2], 'never through its other face: a grid step is left');
  assert.deepEqual(facedBox(w, 2, -1, 600, 0), [490.8, 25.5, 513.15, 492.8, 26, 513.2]);
  // dropped on a box's top it stands on it, centred on the pointer, on the grid
  assert.deepEqual(dropBox({ at: [476.1, 26, 510.07], axis: 1, sign: 1 }, [4, 1, 2], 0.25), [474, 26, 509, 478, 27, 511]);
  // against a side it stands out from that face
  assert.deepEqual(dropBox({ at: [484, 25.7, 512], axis: 0, sign: 1 }, [4, 1, 2], 0.25), [484, 25.25, 511, 488, 26.25, 513]);
  assert.deepEqual(dropBox({ at: [474, 25.7, 512], axis: 0, sign: -1 }, [4, 1, 2], 0.25), [470, 25.25, 511, 474, 26.25, 513]);
  // on the ground its foot goes down to the grid, so it never floats
  assert.deepEqual(dropBox({ at: [500, 20.13, 500], axis: 1, sign: 1, ground: true }, [2, 3, 2], 0.25), [499, 20, 499, 501, 23, 501]);
  assert.deepEqual(dropBox({ at: [500, 20.13, 500], axis: 1, sign: 1, ground: true }, [2, 3, 2], 0), [499, 20.1, 499, 501, 23.1, 501]);
});

test('a box set in the world goes back through its structure\'s turn and place, as the compiler places it', () => {
  for (const turn of [0, 90, 180, 270]) {
    const s = { at: [500, 20, 480], turn }, b = [1, 0, 2, 5, 3, 4, 'metal'];
    const want = [510.25, 22.5, 470, 513, 24, 477.5];
    setWorldBox(s, b, want);
    assert.equal(b[6], 'metal');
    nears(place(b, s.at, turn), want, 1e-9, `turn ${turn}`);
    nears(worldBox(s, b), want, 1e-9);
  }
  const plain = { boxes: [[1, 2, 3, 4, 5, 6]] };
  setWorldBox(plain, plain.boxes[0], [2, 3, 4, 5, 6, 7]);
  assert.deepEqual(plain.boxes[0], [2, 3, 4, 5, 6, 7]);
  // a mover's row as the compiler packs it, so a box is picked where it is drawn
  const spec = (move, turn = 0) => ({ name: 'M', bounds: [484, 540, 484, 540], terrain: { origin: [480, 480], height: 'height.png' }, spawns: [[488, 488], [536, 536]],
    structures: [{ name: 'lift', turn, at: [500, 0, 500], boxes: [[0, 20, 0, 4, 20.5, 4, 'metal']], move }] });
  for (const [move, turn] of [[{ by: [0, 12, 0], seconds: 3, wait: 2, phase: 0.5, ease: true }, 0], [{ by: [8, 0, 0] }, 90], [{ by: [1, 2, 3], seconds: 0.4, wait: 0 }, 180]]) {
    const m = compileSpec(spec(move, turn), flat(32, 32));
    assert.deepEqual(moveOf(spec(move, turn).structures[0]), m.groups[0].move, JSON.stringify(move));
    for (const t of [0, 100.5, 400, 999]) assert.deepEqual(movedAt(spec(move, turn).structures[0], t), moverAt(m.groups[0].move, t));
  }
  assert.equal(moveOf({ boxes: [] }), null);
  assert.equal(moveOf({ move: { by: [0, 1] } }), null, 'not a move yet');
  assert.deepEqual(movedAt({ boxes: [] }, 50), [0, 0, 0]);
  assert.deepEqual(shifted([1, 2, 3, 4, 5, 6], [10, 20, 30]), [11, 22, 33, 14, 25, 36]);
});

test('polygons and lines are cut at the eye, so what is behind it draws nothing', () => {
  const e = orbitEye({ target: [10, 0, 0], yaw: 0, pitch: -0.3, dist: 10 }, 800, 500);
  assert.equal(polygonOf(e, [[5, 0, -1], [6, 0, -1], [6, 0, 1], [5, 0, 1]]).length, 4, 'all ahead');
  assert.equal(polygonOf(e, [[-5, 0, -1], [-6, 0, -1], [-6, 0, 1], [-5, 0, 1]]).length, 0, 'all behind');
  const cut = polygonOf(e, [[-5, 0, -1], [5, 0, -1], [5, 0, 1], [-5, 0, 1]]);
  assert.equal(cut.length, 4, 'cut across');
  assert.ok(cut.every((p) => p[2] >= 0.1 - 1e-9 && Number.isFinite(p[0]) && Number.isFinite(p[1])));
  assert.equal(segmentOf(e, [-5, 0, 0], [-6, 0, 0]), null);
  assert.equal(segmentOf(e, [-5, 0, 0], [6, 0, 0]).length, 2);
});

test('a part read and written as map.json holds it, and as the compiler takes it', () => {
  assert.equal(readPart(undefined), null);
  assert.deepEqual(readPart('kill'), { kind: 'kill', ghost: false });
  assert.deepEqual(readPart({ kind: 'bounce', speed: 22 }), { kind: 'bounce', speed: 22, ghost: false });
  assert.equal(writePart({ kind: 'kill', ghost: false }), 'kill', 'a kind alone is a word');
  assert.deepEqual(writePart({ kind: 'kill', ghost: true }), { kind: 'kill', ghost: true });
  assert.deepEqual(writePart({ kind: 'ice', grip: 0.08, speed: 3, ghost: false }), { kind: 'ice', grip: 0.08 }, 'only what the kind reads');
  assert.equal(writePart(null), undefined);
  // every part of Sky Steps and the Roblox converter's survives the round trip, and compiles the same
  const every = [...obby().structures.flatMap((s) => s.boxes), [0, 0, 0, 1, 1, 1, 'metal', { kind: 'conveyor', velocity: [0, -2.8] }], [0, 0, 0, 1, 1, 1, 'metal', { kind: 'kill', ghost: true }], [0, 0, 0, 1, 1, 1, 'metal', { kind: 'ice' }]];
  for (const b of every.filter((x) => x[7] !== undefined)) assert.deepEqual(partOf(writePart(readPart(b[7]))), partOf(b[7]), JSON.stringify(b[7]));
  for (const b of obby().structures.flatMap((s) => s.boxes).filter((x) => x[7] !== undefined)) assert.deepEqual(writePart(readPart(b[7])), b[7], 'as tools/obby.mjs writes it');
  assert.deepEqual(PART_NAMES, ['kill', 'bounce', 'ice', 'conveyor', 'ladder', 'checkpoint', 'finish']);
  for (const k of PART_NAMES) assert.ok(PART_LOOKS[k] && PART_MARK[k] && PART_WHAT[k], k);
});

test('choosing a kind: its numbers, the next free stage, its look unless the box has a colour of its own', () => {
  const spec = { structures: [{ boxes: [
    [0, 0, 0, 1, 1, 1, 'metal'], [0, 0, 0, 1, 1, 1], [0, 0, 0, 1, 1, 1, '#8d99ae'], [0, 0, 0, 1, 1, 1, 'rock'],
    [0, 0, 0, 1, 1, 1, 'light#4ade80', { kind: 'checkpoint', stage: 1 }], [0, 0, 0, 1, 1, 1, 'light#4ade80', { kind: 'checkpoint', stage: 3 }]] }] };
  const [metal, bare, own, rock] = spec.structures[0].boxes;
  // a new box's metal takes the kind's look: lava glows red-orange (tools/obby.mjs)
  setKind(spec, metal, 'kill');
  assert.deepEqual(metal.slice(6), ['light#ff4a1c', 'kill']);
  // changing its kind changes the look the editor gave it
  setKind(spec, metal, 'checkpoint');
  assert.deepEqual(metal.slice(6), ['light#4ade80', { kind: 'checkpoint', stage: 2 }], 'the next free stage fills the gap');
  assert.equal(nextStage(spec), 4);
  setKind(spec, bare, 'checkpoint');
  assert.deepEqual(bare.slice(6), ['light#4ade80', { kind: 'checkpoint', stage: 4 }], 'a box with no material gets one');
  setKind(spec, metal, 'bounce');
  assert.deepEqual(metal.slice(6), ['light#ffd23f', { kind: 'bounce', speed: 14 }]);
  setPartField(metal, 'speed', 22);
  setKind(spec, metal, 'bounce');
  assert.deepEqual(metal[7], { kind: 'bounce', speed: 22 }, 'its kind again keeps its numbers');
  setPartField(metal, 'ghost', true);
  assert.deepEqual(metal[7], { kind: 'bounce', speed: 22, ghost: true });
  setKind(spec, metal, 'ice');
  assert.deepEqual(metal.slice(6), ['#bfe8ff', { kind: 'ice', grip: 0.06, ghost: true }], 'a ghost stays one');
  setKind(spec, metal, 'finish');
  assert.deepEqual(metal.slice(6), ['light#ffffff', { kind: 'finish', ghost: true }]);
  setKind(spec, metal, '');
  assert.deepEqual(metal, [0, 0, 0, 1, 1, 1, 'metal'], 'a plain box again, in the plain material');
  // a colour set by hand, or a material chosen, is never overridden
  for (const [b, m] of [[own, '#8d99ae'], [rock, 'rock']]) {
    for (const k of PART_NAMES) { setKind(spec, b, k); assert.equal(b[6], m, `${m} as ${k}`); }
    setKind(spec, b, '');
    assert.deepEqual(b.slice(6), [m]);
  }
  assert.equal(lookFor('plain', 'kill'), 'light#ff4a1c');
  assert.equal(lookFor('light#ff4a1c', undefined), 'metal');
  assert.equal(lookFor('red', 'kill'), 'red');
  // every look and every part the editor writes is one the compiler takes
  for (const k of PART_NAMES) { const b = [0, 0, 0, 1, 1, 1, 'metal']; setKind({ structures: [] }, b, k); partOf(b[7]); }
  assert.deepEqual(partCounts(spec), { checkpoint: 3 });
  assert.equal(partsOf(spec).length, 3);
});

test('a belt is a direction and a speed: east is 0 degrees, south 90, turned with its structure', () => {
  assert.deepEqual(beltOf([3, 0]), { speed: 3, angle: 0 });
  assert.deepEqual(beltOf([0, -2.8]), { speed: 2.8, angle: 270 });
  assert.deepEqual(beltOf([-3, 0]), { speed: 3, angle: 180 });
  assert.deepEqual(beltVelocity(90, 4), [0, 4]);
  assert.deepEqual(beltVelocity(180, 3), [-3, 0]);
  assert.deepEqual(beltVelocity(45, 2), [1.414, 1.414]);
  for (const turn of [0, 90, 180, 270]) {
    // the compiler turns a belt's velocity with its structure: the editor's world arrow is that one
    const p = partOf({ kind: 'conveyor', velocity: [3, -1] }, turn);
    nears(beltWorld([3, -1], turn), [p.a, p.b], 1e-6, `turn ${turn}`);
    assert.deepEqual(beltLocal(beltWorld([3, -1], turn), turn), [3, -1]);
  }
});

test('whether the build asks a spawn on each half: not of a map whose one mode has no sides', () => {
  assert.equal(needsSides({}), true, 'the rotation');
  assert.equal(needsSides({ mode: 'obby' }), false);
  assert.equal(needsSides({ mode: 'ctf' }), true);
  assert.equal(needsSides({ mode: 'lucky' }), false);
  assert.equal(needsSides({ mode: 'nonsense' }), true);
  // as the compiler has it: all its spawns at one end, refused in the rotation and taken as an obby
  const { spec, ground } = starterObby(), img = flat(...ground.size, ground.level);
  for (const k of Object.keys(MAP_MODES)) {
    const s = { ...spec, mode: k };
    let ok = true;
    try { compileSpec(s, img); } catch (e) { ok = false; assert.match(e.message, /no spawn on/, k); }
    assert.equal(ok, !needsSides(s), k);
  }
  assert.throws(() => compileSpec({ ...spec, mode: undefined }, img), /no spawn on/);
});

test('the course\'s check: stages in order, a missing number, no finish, a mode that isn\'t obby, a checkpoint nobody could stand on', () => {
  const ground = () => 10;
  const lines = (spec) => courseOf(spec, { ground }).lines.map((l) => `${l.level}: ${l.text}`);
  // Sky Steps and the starter are clean
  for (const spec of [obby(), starterObby().spec]) {
    const c = courseOf(spec, { ground });
    assert.deepEqual(c.lines.filter((l) => l.level !== 'ok'), [], spec.name);
    assert.equal(c.finishes, 1);
  }
  assert.equal(courseOf(obby(), { ground }).stages, 11);
  assert.equal(courseOf(starterObby().spec, { ground }).stages, 4);
  // a map with no course in it has nothing to say
  assert.equal(courseOf({ structures: [{ boxes: [[0, 0, 0, 1, 1, 1, 'metal', 'kill']] }], spawns: [[0, 0]] }, { ground }), null);
  const deck = [0, 19, 0, 40, 20, 8, 'metal'];
  const cp = (x, stage, extra = {}) => [x, 20, 2, x + 2, 20.1, 6, 'light#4ade80', { kind: 'checkpoint', stage, ...extra }];
  const base = (boxes, extra = {}) => ({ mode: 'obby', spawns: [[1, 4, 21]], structures: [{ name: 'course', boxes: [deck, ...boxes] }], ...extra });
  // a gap in the numbers, and no finish in an obby
  let l = lines(base([cp(4, 1), cp(10, 2), cp(20, 4)]));
  assert.ok(l.includes('warn: stage 3 is missing: the stages run 1 to 4 and no checkpoint is 3'), l.join('\n'));
  assert.ok(l.some((x) => /^bad: no finish: the mode obby needs one/.test(x)), l.join('\n'));
  assert.equal(l.filter((x) => /^ok: stage/.test(x)).length, 3);
  // the lines name the box, so the panel can fly to it
  const c = courseOf(base([cp(4, 1), [30, 20, 2, 32, 20.1, 6, 'light#ffffff', 'finish']]), { ground });
  assert.deepEqual(c.lines.map((x) => x.sel), [undefined, { kind: 'box', s: 0, b: 1 }, { kind: 'box', s: 0, b: 2 }]);
  assert.deepEqual(c.lines.map((x) => x.level), ['ok', 'ok', 'ok']);
  // a finish and checkpoints on a map that plays the rotation do nothing
  l = lines(base([cp(4, 1), [30, 20, 2, 32, 20.1, 6, 'light#ffffff', 'finish']], { mode: undefined }));
  assert.ok(l.some((x) => /^warn: the map's mode is not obby/.test(x)), l.join('\n'));
  // two checkpoints of one stage: the first is where you come back
  l = lines(base([cp(4, 1), cp(10, 1)]));
  assert.ok(l.includes('warn: 2 checkpoints are stage 1: a death comes back on the first'), l.join('\n'));
  // no spawn at all
  assert.ok(lines(base([cp(4, 1)], { spawns: [] })).some((x) => /^bad: no start/.test(x)));
  // nobody could stand on it: a box over it, lava on it, a zone in mid-air, under the void
  const bad = (boxes, why, extra) => {
    const out = lines(base([...boxes, [30, 20, 2, 32, 20.1, 6, 'light#ffffff', 'finish']], extra)).filter((x) => /^bad/.test(x));
    assert.equal(out.length, 1, out.join('\n'));
    assert.match(out[0], /Nobody could stand on it/);
    assert.match(out[0], why);
  };
  bad([cp(4, 1), [4, 21, 2, 6, 23, 6, 'metal']], /leaves no room for a body 1\.8 m tall/);
  assert.equal(lines(base([cp(4, 1), [4, 21.5, 2, 6, 23, 6, 'metal'], [30, 20, 2, 32, 20.1, 6, 'light#ffffff', 'finish']], { body: { width: 0.56, height: 1.4 } })).filter((x) => /^bad/.test(x)).length, 0, 'a Roblox character fits under 1.4 m');
  bad([cp(4, 1), [4, 21.5, 2, 6, 23, 6, 'metal']], /no room/);
  bad([cp(4, 1), [4.5, 20.1, 3, 5.5, 20.3, 5, 'light#ff4a1c', 'kill']], /a part that kills touches whoever stands there/);
  bad([[60, 20, 2, 62, 21, 6, 'light#4ade80', { kind: 'checkpoint', stage: 1, ghost: true }], [58, 19, 0, 64, 20, 8, 'light#ff4a1c', 'kill']], /stands you on a part that kills/);
  bad([cp(4, 1), [3, 20.5, 1, 7, 21, 7, 'light#ff4a1c', { kind: 'kill', ghost: true }]], /a part that kills touches/);
  bad([[60, 30, 2, 62, 31, 6, 'light#4ade80', { kind: 'checkpoint', stage: 1, ghost: true }]], /nothing under it to stand on: you would come back 20 m below it/);
  bad([[60, 30, 2, 62, 31, 6, 'light#4ade80', { kind: 'checkpoint', stage: 1, ghost: true }]], /under the void \(12 m\)/, { void: 12 });
  // a zone just over a floor is fine: you come back on the floor under it
  assert.equal(lines(base([cp(4, 1, { ghost: true }), [30, 20, 2, 32, 20.1, 6, 'light#ffffff', 'finish']])).filter((x) => !/^ok/.test(x)).length, 0);
  // a spawn left over the lava when its platform went: nobody starts there
  l = lines({ mode: 'obby', void: 12, spawns: [[1, 4, 21], [70, 4, 21]], structures: [{ boxes: [deck, [0, 14, 0, 100, 15, 8, 'light#ff4a1c', 'kill'], [30, 20, 2, 32, 20.1, 6, 'light#ffffff', 'finish']] }] });
  assert.deepEqual(l.filter((x) => /^bad/.test(x)), ['bad: spawn 2 at 70, 4 is no place to start: it stands you on a part that kills'], l.join('\n'));
  l = lines({ mode: 'obby', void: 12, spawns: [[70, 4, 21]], structures: [{ boxes: [deck, [30, 20, 2, 32, 20.1, 6, 'light#ffffff', 'finish']] }] });
  assert.deepEqual(l.filter((x) => /^bad/.test(x)), ['bad: spawn 1 at 70, 4 is no place to start: it is under the void (12 m)']);
  // a checkpoint with no stage
  assert.ok(lines(base([[4, 20, 2, 6, 20.1, 6, 'metal', { kind: 'checkpoint' }]])).some((x) => /^bad: a checkpoint at .* has no stage/.test(x)));
});

test('a Roblox obby opened in the editor keeps its parts, its body and its mode, and the course lists it', () => {
  const baseplate = readFileSync('test/roblox/baseplate.rbxlx', 'utf8');
  const item = (cls, name, props, kids = '') => `<Item class="${cls}"><Properties><string name="Name">${name}</string>${props}</Properties>${kids}</Item>`;
  const part = (name, size, at, extra = '') => item('Part', name, `<bool name="Anchored">true</bool><bool name="CanCollide">true</bool>
    <CoordinateFrame name="CFrame"><X>${at[0]}</X><Y>${at[1]}</Y><Z>${at[2]}</Z><R00>1</R00><R01>0</R01><R02>0</R02><R10>0</R10><R11>1</R11><R12>0</R12><R20>0</R20><R21>0</R21><R22>1</R22></CoordinateFrame>
    <Vector3 name="size"><X>${size[0]}</X><Y>${size[1]}</Y><Z>${size[2]}</Z></Vector3>${extra}`);
  const xml = baseplate.replace(/(<Item class="Workspace"[^>]*>\s*<Properties>[\s\S]*?<\/Properties>)/, `$1
    ${item('SpawnLocation', 'SpawnLocation', '<bool name="Anchored">true</bool><CoordinateFrame name="CFrame"><X>-100</X><Y>0.5</Y><Z>0</Z><R00>1</R00><R01>0</R01><R02>0</R02><R10>0</R10><R11>1</R11><R12>0</R12><R20>0</R20><R21>0</R21><R22>1</R22></CoordinateFrame><Vector3 name="size"><X>6</X><Y>1</Y><Z>6</Z></Vector3>')}
    ${part('Lava', [4, 1, 4], [-70, 0.5, 0])}
    ${item('Folder', 'Checkpoints', '', part('1', [4, 1, 4], [10, 0.5, 0]) + part('2', [4, 1, 4], [30, 0.5, 0]) + part('3', [4, 1, 4], [50, 0.5, 0]))}
    ${part('Finish', [6, 1, 6], [80, 0.5, 0])}`);
  const out = robloxToMap(readRoblox(new TextEncoder().encode(xml)), { name: 'Tower' });
  // what the editor holds is the converter's spec: its parts are there to read, change and write back
  const spec = JSON.parse(formatSpec(out.spec));
  assert.equal(spec.mode, 'obby');
  assert.deepEqual(spec.body, ROBLOX_BODY);
  assert.deepEqual(spec.movement, ROBLOX_MOVEMENT, 'the preset is a Roblox place\'s own numbers');
  assert.deepEqual(partCounts(spec), { kill: 1, checkpoint: 2, finish: 1 });
  const c = courseOf(spec, { ground: () => 0 });
  assert.equal(c.stages, 2);
  assert.deepEqual(c.lines.filter((l) => l.level === 'bad'), []);
  assert.equal(needsSides(spec), false);
  // a part changed in the editor compiles
  const lava = partsOf(spec).find((p) => p.part.kind === 'kill');
  setKind(spec, spec.structures[lava.s].boxes[lava.b], 'bounce');
  const m = compileSpec(spec, out.images);
  assert.equal(m.parts.filter((p) => p.kind === L.PK_BOUNCE).length, 1);
});

test('the starter obby: it compiles, saves as map.json writes it, and eight AI fighters run it to the finish on the debug build', async () => {
  const { spec, ground } = starterObby(), [W, H] = ground.size;
  const m = compileSpec(spec, flat(W, H, ground.level));
  assert.equal(m.mode, L.M_OBBY + 1);
  assert.equal(m.spawns.length, 6);
  assert.deepEqual(m.parts.map((p) => p.name).sort(), ['bounce', 'checkpoint', 'checkpoint', 'checkpoint', 'checkpoint', 'finish', 'ice', 'kill', 'kill', 'kill', 'ladder']);
  assert.deepEqual(m.parts.filter((p) => p.kind === L.PK_CHECK).map((p) => p.stage), [1, 2, 3, 4]);
  assert.ok(m.void !== null && m.movement, 'a void under the lava, an obby\'s walk and jump');
  // the editor's file: the same spec comes back from what it saves, and the same bytes
  const again = JSON.parse(formatSpec(spec));
  assert.deepEqual(again, JSON.parse(JSON.stringify(spec)));
  assert.deepEqual(compileSpec(again, flat(W, H, ground.level)).bytes, m.bytes);
  // every spawn stands on the start, over the lava
  for (const s of m.spawns) assert.ok(s.x > 474 && s.x < 484 && s.z > 508 && s.z < 516 && s.top === 27);
  const seen = { home: new Set(), all: 0 };
  let last = -1;
  const r = await playArena({ bytes: arenaBytes(true), seed: 7, bots: 8, ticks: 4200, map: packMap(m), onTick: (t, view) => {
    const h = view.hole();
    if (h.hole !== last) { last = h.hole; seen.home.clear(); }
    for (let p = 0; p < 8; p++) if (doneOf(view, p)) seen.home.add(p);
    if (h.hole === 0 && h.state === L.H_OVER) seen.all = seen.home.size;
  } });
  assert.equal(seen.all, 8, 'all eight home in the first match');
  assert.equal(r.mode.mode, L.M_OBBY);
});

test('Sky Steps as the editor opens it: its parts drawn from the map, its course in order', () => {
  const spec = JSON.parse(readFileSync(`${mapDir('obby')}/map.json`, 'utf8'));
  const m = compileMap(mapDir('obby'));
  assert.equal(partsOf(spec).length, m.parts.length);
  assert.deepEqual(partCounts(spec), { kill: 7, checkpoint: 11, ice: 1, conveyor: 2, bounce: 3, ladder: 1, finish: 1 });
  // each part's box in the world is the compiler's
  partsOf(spec).forEach((p, k) => nears(p.box, m.parts[k].box, 1e-4, `part ${k}`));
  assert.equal(nextStage(spec), 12);
});
