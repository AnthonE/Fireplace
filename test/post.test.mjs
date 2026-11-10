// The cartoon's finish (client/post.mjs) and the look under it
// (client/lowpoly.mjs): golf's, the arena's and Dogfight's renderers draw
// their world into the post's float texture and depth and their HUD onto the
// finished frame; the shared light is three tones; the pages that shoot the
// board's views expose the shot; and the ground is sent to the GPU again
// after a keyframe, since the sim lays it afresh then. No GPU here: the
// renderers' own frames are tools/arena-shot.mjs's and the gates'.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as L from '../src/layout.mjs';
import { View } from '../src/arena-view.mjs';

const read = (f) => readFileSync(f, 'utf8');
const RENDERERS = ['client/render.mjs', 'client/arena-render.mjs', 'client/flight-render.mjs'];

test('each renderer draws its world for the post and its HUD after it', () => {
  for (const f of RENDERERS) {
    const src = read(f);
    assert.match(src, /import \{ createPost, SCENE_FORMAT, DEPTH_FORMAT \} from '\.\/post\.mjs';/, f);
    assert.match(src, /targets: \[\{ format: SCENE_FORMAT, blend \}\]/, `${f}: the world's pipelines`);
    assert.match(src, /view: post\.sceneView/, f);
    assert.match(src, /view: post\.depthView/, f);
    // the HUD: the canvas's own format, no depth, drawn in the post's last pass
    assert.match(src, /entryPoint: 'fs_hud', targets: \[\{ format, blend: over \}\] \}, primitive/, `${f}: the HUD's pipeline`);
    assert.match(src, /post\.finish\(enc, \(target \|\| ctx\.getCurrentTexture\(\)\)\.createView\(\), \(last\) => \{\s+last\.setBindGroup\(0, bind\);\s+last\.setPipeline\(hudPipe\);/, f);
    assert.doesNotMatch(src, /depthStencilAttachment: \{ view: depth\./, `${f}: no depth of its own`);
  }
});

test('the post: ink from depth, a bloom of five levels, the roll-off, FXAA last', () => {
  const src = read('client/post.mjs');
  for (const fs of ['fs_bright', 'fs_down', 'fs_up', 'fs_comp', 'fs_fxaa']) assert.match(src, new RegExp(`@fragment fn ${fs}\\(`), fs);
  assert.match(src, /const LEVELS = 5;/);
  assert.match(src, /texture_depth_2d/);
  // the last pass is the one a renderer's HUD joins
  assert.match(src, /const pass = full\(enc, view, fxaa, ldrSrc\);\s+over\?\.\(pass\);\s+pass\.end\(\);/);
});

test('the shared light is three tones, and the hills shade the ground', async () => {
  const { LOWPOLY_WGSL, GROUND_WGSL, BOXES_WGSL } = await import('../client/lowpoly.mjs');
  for (const fn of ['cel', 'light', 'hillLit', 'cloudShade', 'cliff', 'sky', 'fogged', 'slopeN', 'facet', 'surfAt']) assert.match(LOWPOLY_WGSL, new RegExp(`\\nfn ${fn}\\(`), fn);
  for (const tone of ['TONE_SHADE', 'TONE_MID', 'TONE_LIT']) assert.match(LOWPOLY_WGSL, new RegExp(`const ${tone} = vec3f\\(`), tone);
  assert.match(GROUND_WGSL, /fn groundPaint\(w: vec2f, y: f32, z: f32, pw: f32\) -> Ground/);
  assert.match(BOXES_WGSL, /fn sunlit\(p: vec3f\) -> f32/);
  // the arena and Dogfight light the ground past the hills, then past the boxes
  for (const f of ['client/arena-render.mjs', 'client/flight-render.mjs']) {
    const src = read(f);
    assert.match(src, /groundPaint\(/, f);
    assert.match(src, /sun = hillLit\(/, f);
    assert.match(src, /sun \*= sunlit\(/, f);
  }
  assert.match(read('client/arena-render.mjs'), /@fragment fn fs_shade\(/, "a fighter's shadow");
  assert.match(read('client/viewmodel.mjs'), /let lit = cel\(/, 'the gun in your hands in the same tones');
});

test("the arena's and Dogfight's pages shoot their own view for the board", () => {
  for (const [f, api] of [['client/arena.mjs', '__qa'], ['client/flight.mjs', '__qf']]) {
    const src = read(f);
    assert.match(src, /async function shot\(_name, after = 2\)/, f);
    assert.match(src, new RegExp(`window\\.${api} = \\{[^\\n]*ready: true, shot \\};`), f);
  }
  const tool = read('tools/arena-shot.mjs');
  const board = JSON.parse(read('board/board.json'));
  const seed = Number(/const SEED = (\d+);/.exec(tool)[1]);
  const ours = board.views.filter((v) => v.shoot[1] === 'tools/arena-shot.mjs');
  assert.ok(ours.length >= 4, 'the arena and Dogfight are on the board');
  for (const v of ours) {
    const row = new RegExp(`\\n  ${v.page.shot}: \\['(\\w+)', '([\\w.]+)', '([^']+)', '(\\w+)'\\],`).exec(tool);
    assert.ok(row, `${v.id} is one of the tool's views`);
    assert.equal(v.png, `traces/${row[1]}-look-${v.page.shot}.png`, v.id);
    assert.equal(v.page.src, `${row[2]}?${row[3]}&seed=${seed}&present=0&res=960x600`, `${v.id}: the page draws what the tool shoots`);
    assert.equal(v.page.api, row[4], v.id);
    assert.ok(v.shoot.join(' ').includes(v.page.shot), `${v.id} is in its shooter's list`);
  }
});

test('a frontend sends the ground again after every keyframe', () => {
  for (const f of ['client/arena-game.mjs', 'client/flight-game.mjs', 'client/golf-game.mjs', 'client/main.mjs']) {
    const src = read(f);
    assert.match(src, /\(view\.dv\.getUint32\(L\.HDR_SEED, true\) !== seed \|\| get\(L\.CL_KEYS\) !== keysSeen\)\) \{\s+keysSeen = get\(L\.CL_KEYS\);/, f);
  }
  for (const f of ['client/arena-game.mjs', 'client/flight-game.mjs']) assert.match(read(f), /renderer\.setMap\(view\.map\(true\)\);/, f);
});

test('a map read fresh is read again, whatever was kept', () => {
  const buf = new ArrayBuffer(L.PAGES * 65536);
  const v = new View(buf);
  const d = new DataView(buf);
  const a = v.map();
  assert.equal(a.boxes.length, 0);
  assert.equal(v.map(), a, 'kept');
  // the sim lays a box without the key changing: only a fresh read sees it
  d.setFloat32(L.MAP_BOXES + 12, 5, true);
  d.setUint32(L.MAP_NBOX, 1, true);
  d.setUint32(L.MAP_NBOX, 0, true);
  assert.equal(v.map(), a);
  d.setFloat32(L.MAP_BOUNDS + 4, 77, true);
  assert.equal(v.map().bounds[1], a.bounds[1], 'the kept one');
  assert.equal(v.map(true).bounds[1], 77, 'read again');
});
