// What a fighter holds, from its own eyes (client/viewmodel.mjs): the gun
// in your hands, a carrier's flag, skull or bomb. No GPU here, so what is
// held is the model as numbers (every weapon one, inside its bounds and on
// the screen) and the shader and the pass that draws it as source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as L from '../src/layout.mjs';
import { gunModel, carryModel, handRect, MAX_VM, PAINT, VIEWMODEL_WGSL } from '../client/viewmodel.mjs';
import { focalFor } from '../client/lowpoly.mjs';

const read = (f) => readFileSync(f, 'utf8');
const still = { t: 0, bob: 0, drop: 0, lunge: 0, kick: 0 };
const GUNS = [L.W_AR, L.W_BR, L.W_MAGNUM, L.W_SNIPER, L.W_SHOTGUN, L.W_ROCKET, L.W_PLASMA, L.W_NEEDLER, L.W_SWORD, 0];
const held = () => [...GUNS.map((w) => [`gun ${w}`, gunModel(w, still)]), ...['flag', 'skull', 'bomb'].map((k) => [k, carryModel(k, [0.9, 0.2, 0.2], { ...still, t: 0.1 })])];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const near = (a, b, why) => assert.ok(Math.abs(a - b) < 1e-5, `${why}: ${a} is not ${b}`);
const frame = (r, u, why) => { near(dot(r, r), 1, why); near(dot(u, u), 1, why); near(dot(r, u), 0, why); };

test('every weapon and everything carried is a model: a frame, a box round its parts, then parts and frames', () => {
  assert.deepEqual(L.LADDER.slice().sort(), GUNS.slice(0, 9).sort(), 'a model for every gun there is');
  for (const [name, m] of held()) {
    assert.ok(m instanceof Float32Array && m.length % 12 === 0, name);
    const n = m.length / 12;
    assert.ok(n >= 4 && n <= MAX_VM, `${name}: ${n} entries`);
    const e = (k) => [...m.subarray(12 * k, 12 * k + 12)];
    // held ahead of the eye and to its right, the frame square
    const [h, bound] = [e(0), e(1)];
    assert.ok(h[2] > 0.2 && h[0] > 0, `${name} is held ahead and to the right`);
    frame(h.slice(4, 7), h.slice(8, 11), name);
    const half = bound.slice(4, 7), mid = bound.slice(0, 3);
    assert.ok(half.every((v) => v > 0 && v < 0.6), `${name}: its bounds are a hand's reach`);
    // each part: a kind the shader knows, a size, a colour, and its middle inside the bounds
    // (a part in a later frame is placed by that frame, itself given in the first)
    let at = [0, 0, 0], ax = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], parts = 0;
    for (let k = 2; k < n; k++) {
      const p = e(k);
      if (p[3] < 0) {
        frame(p.slice(4, 7), p.slice(8, 11), `${name} frame ${k}`);
        at = p.slice(0, 3); ax = [p.slice(4, 7), p.slice(8, 11), cross(p.slice(4, 7), p.slice(8, 11))];
        continue;
      }
      parts++;
      assert.ok(p[3] < 3 && p[3] % 1 <= 0.95, `${name} part ${k}: kind ${p[3]}`);
      assert.ok(p[4] > 0 && p[6] > 0 && (p[3] >= 1 || p[5] > 0), `${name} part ${k} has a size`);
      if (p[3] < 2) assert.ok(p[7] >= 0 && p[7] <= Math.min(p[4], p[6]) + 1e-6, `${name} part ${k}: an edge no rounder than the part is thick`);
      assert.ok(p.slice(8, 11).every((v) => v >= 0 && v <= 1), `${name} part ${k}: a colour`);
      assert.ok(p[11] >= 0 && Math.floor(p[11] / 2) <= Math.max(...Object.values(PAINT)) && p[11] % 2 <= 1, `${name} part ${k}: a paint and a glow`);
      const c = [0, 1, 2].map((i) => at[i] + ax[0][i] * p[0] + ax[1][i] * p[1] + ax[2][i] * p[2]);
      for (let i = 0; i < 3; i++) assert.ok(Math.abs(c[i] - mid[i]) <= half[i], `${name} part ${k} is inside the bounds`);
    }
    assert.ok(parts >= 2, `${name}: more than one shape`);
  }
});

test('the models are told apart: no two weapons the same shapes, the lit ones lit, a shot adds its flash', () => {
  const shapes = held().map(([, m]) => [...m.subarray(24)].map((v) => v.toFixed(3)).join());
  assert.equal(new Set(shapes).size, shapes.length);
  const glows = (m) => { let g = 0; for (let k = 2; k < m.length / 12; k++) if (m[12 * k + 3] >= 0 && m[12 * k + 11] % 2 === 1) g++; return g; };
  // the rifle's sight, the plasma's two prongs, the seeker's six needles, the sword's two blades
  assert.deepEqual([L.W_AR, L.W_PLASMA, L.W_NEEDLER, L.W_SWORD, L.W_SHOTGUN, 0].map((w) => glows(gunModel(w, still))), [1, 2, 6, 2, 0, 0]);
  for (const w of GUNS) {
    const plain = gunModel(w, still), fired = gunModel(w, still, true);
    const flash = w === L.W_SWORD || w === 0 ? 0 : 1;
    assert.equal(fired.length, plain.length + 12 * flash, `gun ${w}`);
    assert.equal(glows(fired), glows(plain) + flash, `gun ${w}`);
  }
  // a kick tips the gun up and back; the bomb's light blinks twice a second
  assert.ok(gunModel(L.W_AR, { ...still, kick: 1 })[2] < gunModel(L.W_AR, still)[2]);
  assert.notDeepEqual(carryModel('bomb', [1, 0, 0], { ...still, t: 0.1 }), carryModel('bomb', [1, 0, 0], { ...still, t: 0.35 }));
  // the flag is the side's colour, on a cloth that waves
  const flag = carryModel('flag', [0.2, 0.4, 1], still);
  const cloth = [...Array(flag.length / 12).keys()].filter((k) => k >= 2 && flag[12 * k + 3] === 2);
  assert.equal(cloth.length, 1);
  assert.deepEqual([...flag.subarray(12 * cloth[0] + 8, 12 * cloth[0] + 11)].map((v) => Math.round(v * 10)), [2, 4, 10]);
});

test('the quad it is drawn in is its box on the screen: inside it, lower right, and never the whole of it for a gun', () => {
  for (const [W, H] of [[960, 600], [1600, 1000], [1280, 540], [390, 844]]) {
    const focal = focalFor(W, H);
    for (const [name, m] of held()) {
      const [x0, y0, x1, y1] = handRect(m, W, H, focal);
      assert.ok(x0 >= 0 && y0 >= 0 && x1 <= W && y1 <= H && x1 > x0 && y1 > y0, `${name} at ${W}x${H}: ${[x0, y0, x1, y1]}`);
      assert.ok(x1 > W * 0.6 && y1 > H * 0.6, `${name} at ${W}x${H} reaches the lower right`);
      if (name.startsWith('gun')) assert.ok((x1 - x0) * (y1 - y0) < 0.4 * W * H, `${name} at ${W}x${H}: ${(x1 - x0) * (y1 - y0)} px`);
      // every corner of its box that is ahead of the eye lands inside the quad
      const o = m.subarray(0, 3), r = m.subarray(4, 7), u = m.subarray(8, 11), f = cross(r, u);
      for (let k = 0; k < 8; k++) {
        const q = [0, 1, 2].map((i) => m[12 + i] + (k >> i & 1 ? 1 : -1) * m[16 + i]);
        const p = [0, 1, 2].map((i) => o[i] + r[i] * q[0] + u[i] * q[1] + f[i] * q[2]);
        if (p[2] < 0.06) continue;
        const x = Math.max(0, Math.min(W, W / 2 + p[0] * focal / p[2])), y = Math.max(0, Math.min(H, H / 2 - p[1] * focal / p[2]));
        assert.ok(x >= x0 - 1e-6 && x <= x1 + 1e-6 && y >= y0 - 1e-6 && y <= y1 + 1e-6, `${name} at ${W}x${H}: corner ${k}`);
      }
    }
  }
  assert.deepEqual(handRect(null, 960, 600, 595), [0, 0, 0, 0], 'nothing held, nothing drawn');
});

test('the shader marches the parts as one field, bounded, and inks where parts meet and along sharp edges', () => {
  for (const fn of ['vmPart', 'vmMap', 'heldRay']) assert.match(VIEWMODEL_WGSL, new RegExp(`\\nfn ${fn}\\(`), fn);
  assert.match(VIEWMODEL_WGSL, /\nstruct Held \{ hit: bool, z: f32, n: vec3f, alb: vec3f, glow: f32, line: f32 \};/);
  // inside the box round the model only, a bounded march, its step never longer than the field says
  assert.match(VIEWMODEL_WGSL, /if \(t >= far\) \{ return o; \}/);
  assert.match(VIEWMODEL_WGSL, /for \(var i = 0; i < 48; i\+\+\) \{\s+h = vmMap\(lo \+ ld \* t, n\);/);
  assert.match(VIEWMODEL_WGSL, /t \+= h\.x \* 0\.9;\s+if \(t > far\) \{ break; \}/);
  // the three kinds of part the models use, and every paint
  assert.match(VIEWMODEL_WGSL, /if \(kind >= 2\.0\) \{/);
  assert.match(VIEWMODEL_WGSL, /if \(kind >= 1\.0\) \{/);
  for (const p of Object.values(PAINT).filter((v) => v > 0)) assert.match(VIEWMODEL_WGSL, new RegExp(`paint == ${p}u`), `paint ${p}`);
  // the line: the next part's nearness, or an edge's turn
  assert.match(VIEWMODEL_WGSL, /o\.line = max\(1\.0 - smoothstep\(0\.7 \* w, 1\.6 \* w, h\.z\), /);
  // (the arena names its crosshair cross(), so the builtin is not to be had there)
  assert.doesNotMatch(VIEWMODEL_WGSL, /[^m]cross\(/i);
});

test('the arena draws it in the world\'s pass, last and over everything, lit by the hour and the eye\'s shadow; the HUD no longer does', () => {
  const src = read('client/arena-render.mjs');
  assert.match(src, /import \{ VIEWMODEL_WGSL, MAX_VM, handRect \} from '\.\/viewmodel\.mjs';/);
  // into the post's float texture and depth: over whatever is there, its own depth for the ink
  assert.match(src, /const hand = pipe\('vs_hand', 'fs_hand', \{ depthWrite: true, depthCompare: 'always' \}\);/);
  assert.match(src, /if \(ng > 0\) pass\.draw\(6, ng, 0, L\.NPLAYER \+ L\.NPROJ \+ s\.solid\.length\);\n      if \(held\) \{ pass\.setPipeline\(hand\); pass\.draw\(6\); \}\n      pass\.end\(\);/, 'after everything else of the world');
  assert.match(src, /uf\.set\(handRect\(held, W, H, focalFor\(W, H\)\), 52\);/, 'its quad, at the lens unzoomed');
  assert.match(src, /let s = mix\(u\.hand\.xy, u\.hand\.zw, CORNERS\[v\] \* 0\.5 \+ 0\.5\);/);
  // the three tones (client/lowpoly.mjs light), the sun's share the eye's own, found in the vertex stage
  assert.match(src, /o\.sun = sunlit\(u\.cam\.xyz\);\n  if \(o\.sun > 0\.0\) \{ o\.sun = hillLit\(u\.cam\.xyz, u\.misc\.z\); \}/);
  assert.match(src, /var c = h\.alb \* light\(rt \* h\.n\.x \+ vmCross\(rt, fw\) \* h\.n\.y \+ fw \* h\.n\.z, g\.sun\);/);
  assert.match(src, /o\.depth = h\.z \/ u\.screen\.z;/);
  // what glows goes past white, for the post's bloom
  assert.match(src, /o\.color = vec4f\(mix\(c, h\.alb \* 1\.6, h\.glow\), 1\.0\);/);
  // the map's boxes and the heights are the vertex stage's too now, still eight buffers a stage at most
  assert.match(src, /b === 11 \|\| b === 12 \? GPUShaderStage\.VERTEX \| GPUShaderStage\.FRAGMENT/);
  const hud = src.slice(src.indexOf('@fragment fn fs_hud'), src.indexOf('export async function createRenderer'));
  assert.doesNotMatch(hud, /heldRay|viewModel|\bvm\[/, 'the HUD draws round it, not it');
  // the frontend hands over a model for first person only, and none through a scope
  const game = read('client/arena-game.mjs');
  assert.match(game, /import \{ gunModel, carryModel \} from '\.\/viewmodel\.mjs';/);
  assert.match(game, /if \(!WATCH && !f\.dead && !f\.down && !chasing\) \{\n        inHand = f\.carry \? carryModel\(/);
  assert.match(game, /viewmodel: zoom >= 4 \? null : inHand,/);
});

test('the demo page holds each of them still for the shooter', () => {
  const demo = read('client/arena-render-demo.mjs');
  assert.match(demo, /\n  hands\(s, \.\.\.arg\) \{/);
  const names = /const HELD = \{([^}]*)\};/.exec(demo)[1];
  for (const w of ['W_AR', 'W_BR', 'W_MAGNUM', 'W_SNIPER', 'W_SHOTGUN', 'W_ROCKET', 'W_PLASMA', 'W_NEEDLER', 'W_SWORD']) assert.match(names, new RegExp(`: L\\.${w}\\b`), w);
  assert.match(demo, /const CARRIED = \['flag', 'skull', 'bomb'\];/);
  assert.match(demo, /const \[scene, \.\.\.arg\] = name\.split\('~'\);/, 'a scene takes what follows a ~');
});
