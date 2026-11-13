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
  assert.match(LOWPOLY_WGSL, /mix\(mix\(TONE_SHADE, TONE_MID, smoothstep\(0\.0, 0\.05, l\)\), TONE_LIT, smoothstep\(env\.lit\.w, env\.lit\.w \+ 0\.05, l\)\)/, 'three tones');
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
  // what glows is drawn flat, by the one pair of functions
  const { FX_WGSL } = await import('../client/lowpoly.mjs');
  assert.match(FX_WGSL, /fn celGlow\(uv: vec2f, kind: u32, col: vec4f, time: f32\) -> vec4f/);
  assert.match(FX_WGSL, /fn celBeam\(across: f32, col: vec4f\) -> vec4f/);
  for (const f of ['client/arena-render.mjs', 'client/flight-render.mjs']) {
    assert.match(read(f), /let c = celGlow\(s\.uv, s\.kind, s\.color, u\.\w+\.w\);/, f);
    assert.match(read(f), /return celBeam\(b\.across, b\.color\);/, f);
  }
  assert.match(read('client/arena-render.mjs'), /var c = h\.alb \* light\(/, 'the gun in your hands in the same tones');
});

test('the hour is a uniform: day, dusk and night, every name the look reads coming from it', async () => {
  const { LOWPOLY_WGSL, GROUND_WGSL, BOXES_WGSL, FX_WGSL, ENV_WGSL, ENVS, ENV_FLOATS, envPack, envOf, withEnv } = await import('../client/lowpoly.mjs');
  assert.deepEqual(Object.keys(ENVS), ['day', 'dusk', 'night']);
  const fields = /struct Env \{ ([^}]*) \};/.exec(ENV_WGSL)[1].split(',').map((f) => f.trim());
  assert.equal(fields.length * 4, ENV_FLOATS);
  assert.ok(fields.every((f) => /^\w+: vec4f$/.test(f)));
  for (const [name, e] of Object.entries(ENVS)) {
    const p = envPack(name);
    assert.equal(p.length, ENV_FLOATS, name);
    assert.ok(Math.abs(Math.hypot(...e.sun) - 1) < 1e-3, `${name}: the light's direction is a unit`);
    assert.ok(e.sun[1] > 0.2, `${name}: the light is over the horizon, high enough for shadows to end`);
    // level ground in the open takes the lit tone: the threshold sits under the light's height
    assert.ok(p[31] < e.sun[1] && p[31] + 0.05 < e.sun[1] + 0.02, name);
    for (const k of ['shade', 'mid', 'lit']) assert.ok(e[k].every((v) => v > 0.1 && v < 1.2), `${name} ${k}`);
    assert.ok(e.shade[0] + e.shade[1] + e.shade[2] < e.mid[0] + e.mid[1] + e.mid[2] && e.mid[0] + e.mid[1] + e.mid[2] < e.lit[0] + e.lit[1] + e.lit[2], `${name}: three tones in order`);
  }
  assert.deepEqual([...envPack('nonesuch')], [...envPack('day')], 'day for a name it does not know');
  // the names are gone from every piece once through withEnv, and nothing declares them
  const NAMES = /\b(SUNC|SUN|SKY_TOP|SKY_HOR|HAZE|TONE_SHADE|TONE_MID|TONE_LIT|CLOUD_LIT|CLOUD_SHADE)\b/;
  for (const w of [LOWPOLY_WGSL, GROUND_WGSL, BOXES_WGSL, FX_WGSL]) {
    assert.doesNotMatch(w, /const (SUN|SUNC|HAZE|SKY_\w+|TONE_\w+|CLOUD_\w+) =/);
    assert.doesNotMatch(withEnv(w), NAMES);
  }
  assert.equal(withEnv('dot(n, SUN) * SUNC + HAZE'), 'dot(n, env.sun.xyz) * env.sunc.rgb + env.haze.rgb');
  for (const f of RENDERERS) {
    const src = read(f);
    assert.match(src, /\$\{ENV_WGSL\}@group\(0\) @binding\(\d+\) var<uniform> env: Env;/, f);
    assert.match(src, /createShaderModule\(\{ code: withEnv\(WGSL\) \}\)/, f);
  }
  // a match's hour is its seed's: mostly day, and the same for everyone in the room
  const hours = Array.from({ length: 6000 }, (_, k) => envOf(k * 2654435761));
  const share = (h) => hours.filter((x) => x === h).length / hours.length;
  assert.ok(share('day') > 0.6 && share('dusk') > 0.1 && share('night') > 0.1, `${share('day')} ${share('dusk')} ${share('night')}`);
  assert.equal(envOf(12345), envOf(12345));
  for (const f of ['client/arena-game.mjs', 'client/flight-game.mjs']) assert.match(read(f), /env: HOUR \|\| envOf\(\(seed \^ Math\.imul\(h\.hole \+ 1, 0x85ebca6b\)\) >>> 0\),/, f);
  // golf is played by day
  assert.match(read('client/render.mjs'), /device\.queue\.writeBuffer\(envBuf, 0, envPack\('day'\)\);/);
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
  const ours = board.views.filter((v) => v.shoot[1] === 'tools/arena-shot.mjs' && v.shoot[2] === '--views');
  assert.ok(ours.length >= 4, 'the arena and Dogfight are on the board');
  // and the demo page's scenes beside them
  const scenes = board.views.filter((v) => v.shoot[1] === 'tools/arena-shot.mjs' && v.shoot[2] === '--scenes');
  assert.ok(scenes.length >= 1);
  for (const v of scenes) {
    assert.equal(v.png, `traces/arena-demo-${v.page.shot}.png`, v.id);
    assert.equal(v.page.src, 'arena-render-demo.html?present=0&res=960x600', v.id);
    assert.equal(v.page.api, '__demo', v.id);
    assert.ok(v.shoot[3].split(',').includes(v.page.shot), v.id);
  }
  for (const v of ours) {
    const row = new RegExp(`\\n  ${v.page.shot}: \\['(\\w+)', '([\\w.]+)', '([^']+)', '(\\w+)'\\],`).exec(tool);
    assert.ok(row, `${v.id} is one of the tool's views`);
    // held at one hour, day but for the two views of the others: a mark is on a picture that stays the same
    assert.match(row[3], new RegExp(`&env=${v.id === 'dusk' || v.id === 'night' ? v.id : 'day'}&`), `${v.id} is held at its hour`);
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
