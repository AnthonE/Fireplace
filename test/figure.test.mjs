// The cartoon figure (client/figure.mjs): the arena's fighter and golf's
// golfer. No GPU here, so what is held is its shape as source: the parts it
// is made of, the kits the two renderers give it, and the demo page that
// holds fighters still for tools/arena-shot.mjs --scenes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIGURE_WGSL, HAIRS, EYES } from '../client/figure.mjs';
import { BODIES } from '../client/looks.mjs';

const read = (f) => readFileSync(f, 'utf8');

test('the figure is a field of parts marched once, with a rig a pose moves', () => {
  for (const fn of ['fgCap', 'fgBox', 'fgLeg', 'fgRig', 'fgMap', 'figureRay']) assert.match(FIGURE_WGSL, new RegExp(`\\nfn ${fn}\\(`), fn);
  for (const st of ['Kit', 'Rig', 'Fig']) assert.match(FIGURE_WGSL, new RegExp(`\\nstruct ${st} \\{`), st);
  // every part fgMap hands back has a colour in figureRay
  const parts = new Set([...FIGURE_WGSL.matchAll(/fgMin\(o, [^;]*, (\d+)\.0\);/g)].map((m) => Number(m[1])));
  assert.deepEqual([...parts].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  for (const p of [1, 2, 3, 4, 5, 6, 7, 8, 10]) assert.match(FIGURE_WGSL, new RegExp(`part == ${p}\\.0`), `part ${p} is coloured`);
  // the march is bounded, and its step never longer than the field says
  assert.match(FIGURE_WGSL, /for \(var i = 0; i < 64; i\+\+\) \{\s+let h = fgMap\(lo \+ ld \* t, r, kit\);/);
  assert.match(FIGURE_WGSL, /t \+= h\.x \* 0\.9;/);
  // as tall as the blocky figure it replaces (1.35 x 1.355 m), within a hand: the head's crown and the hair over it
  const head = Number(/r\.head = vec3f\(0\.0, ([\d.]+), /.exec(FIGURE_WGSL)[1]);
  const hair = /var dh = length\(hl - vec3f\(0\.0, ([\d.]+), [-\d.]+\)\) - ([\d.]+);/.exec(FIGURE_WGSL);
  const top = head + Number(hair[1]) + Number(hair[2]);
  assert.ok(Math.abs(top - 1.83) < 0.06, `${top.toFixed(3)} m tall`);
});

test('hair and eye colours are colours, enough of them to tell a room apart', () => {
  assert.ok(HAIRS.length >= 8 && EYES.length >= 4);
  for (const c of [...HAIRS, ...EYES]) assert.ok(c.length === 3 && c.every((v) => v >= 0 && v <= 1));
});

test('the arena and golf dress the figure: a body\'s skin, an avatar\'s parts, a slot\'s hair', () => {
  for (const [f, gun] of [['client/arena-render.mjs', /k\.gun = select\(1u, 0u, zombie \|\| down\);/], ['client/render.mjs', /k\.gun = 2u;/]]) {
    const src = read(f);
    assert.match(src, /import \{ FIGURE_WGSL, HAIRS, EYES \} from '\.\/figure\.mjs';/, f);
    assert.match(src, /fn kitOf\(s: SOut\) -> Kit \{/, f);
    assert.match(src, gun, `${f}: what it holds`);
    for (const k of [0, 1, 2, 3, 4, 5]) assert.match(src, new RegExp(`avc\\(av, ${k}u\\)`), `${f}: avatar part ${k}`);
    assert.match(src, /k\.hair = /, f);
    assert.match(src, /let h = \(u32\(s\.color\.a \+ 0\.5\) \* 2654435761u\) >> 7u;/, `${f}: the slot rides the colour's alpha`);
    assert.match(src, /figureRay\(/, f);
  }
  // a robot body is the figure's robot, by its face
  assert.equal(BODIES.find((b) => b.key === 'robot').face, 4);
  assert.match(read('client/arena-render.mjs'), /k\.kind = select\(select\(0u, 2u, face == 4u\), 1u, zombie\);/);
});

test('one that is down is the same figure on its front: a crawl\'s rig in the frame laid over, the head tipped back', () => {
  for (const fn of ['fgCrawl', 'fgSprawl', 'fgFloor', 'fgNod']) assert.match(FIGURE_WGSL, new RegExp(`\\nfn ${fn}\\(`), fn);
  assert.match(FIGURE_WGSL, /\n  lie: u32, /, 'the kit says which');
  assert.match(FIGURE_WGSL, /fn fgRig\(pose: vec4f, kit: Kit\) -> Rig \{\n  if \(kit\.lie == 1u\) \{ return fgCrawl\(pose\); \}/);
  // the tilt and the nod are turns: unit pairs, 0.2 rad and 1 rad
  const lie = /const LIE_A = 0\.2;\nconst LIE = vec2f\(([\d.]+), ([\d.]+)\);/.exec(FIGURE_WGSL).slice(1).map(Number);
  const nod = /r\.nod = vec2f\((0\.[\d]+), (0\.[\d]+)\);/.exec(FIGURE_WGSL).slice(1).map(Number);
  for (const [v, a] of [[lie, 0.2], [nod, 1]]) assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-4 && Math.abs(Math.atan2(v[1], v[0]) - a) < 1e-3, `${v} is ${a} rad`);
  // laid over about its hips, 0.85 up the figure and 0.14 off the ground, which fgFloor is under; the ground's own
  // rise the way it heads (the pose's pitch: it has no gun to aim) is added to the tilt
  assert.match(FIGURE_WGSL, /let tilt = vec2f\(cos\(LIE_A \+ pose\.y\), sin\(LIE_A \+ pose\.y\)\);\s+up = f \* tilt\.x \+ vec3f\(0\.0, tilt\.y, 0\.0\);\s+front = f \* tilt\.y - vec3f\(0\.0, tilt\.x, 0\.0\);\s+w\.y -= 0\.14;\s+hips = 0\.85;/);
  assert.match(FIGURE_WGSL, /fn fgFloor\(y: f32\) -> f32 \{ return \(0\.14 \+ \(y - 0\.85\) \* LIE\.y\) \/ LIE\.x; \}/);
  // standing, nothing is turned: the frame upright, the head's points their own (so a standing figure draws as it did)
  assert.match(FIGURE_WGSL, /var up = vec3f\(0\.0, 1\.0, 0\.0\);\n  var front = f;/);
  assert.match(FIGURE_WGSL, /\n  r\.nod = vec2f\(1\.0, 0\.0\);/);
  assert.match(FIGURE_WGSL, /fn fgNod\(p: vec3f, r: Rig\) -> vec3f \{\n  if \(r\.nod\.y == 0\.0\) \{ return p; \}/);
  // the arena: both PF_DOWN bits lay it down with empty hands, in the dress it stood in; the card it was is gone
  const src = read('client/arena-render.mjs');
  assert.ok(src.includes('let down = (flags & ${L.PF_DOWN}u) == ${L.PF_DOWN}u;'));
  assert.match(src, /k\.lie = select\(0u, 1u, down\);/);
  assert.doesNotMatch(src, /kind = 13u|kind == 13u|a soldier/);
  // its stride a crawl's, whole at 2 m/s; its quad round the sphere it lies in, toward the eye too; its shadow its own length
  assert.match(src, /if \(down\) \{\n      o\.pose\.w = min\(speed \/ 2\.0, 1\.0\);/);
  assert.match(src, /o\.pose\.y = select\(0\.0, atan\(clamp\(rise \/ 1\.6, -0\.8, 0\.8\)\), abs\(o\.feet\.y - hgt\(o\.feet\.x, o\.feet\.z\)\) < 0\.4\);/);
  assert.match(src, /let c = vec3f\(select\(-0\.95, 1\.1, \(k & 1u\) != 0u\), select\(-0\.1 - up, 0\.8 \+ 1\.1 \* up, \(k & 2u\) != 0u\), select\(-0\.52, 0\.52, \(k & 4u\) != 0u\)\) \* u\.aim\.w;/);
  assert.match(src, /s = clamp\(mix\(lo, hi, corner \* 0\.5 \+ 0\.5\), vec2f\(-4\.0\), u\.screen\.xy \+ 4\.0\);/);
  assert.match(src, /o\.lie = vec3f\(cos\(yaw\), sin\(yaw\), f32\(down\)\);/);
  // the modes' modules still mark the downed from the same bits (REVIVE, FINISH)
  for (const f of ['client/am/evade.mjs', 'client/am/escape.mjs']) assert.match(read(f), /\(fl & L\.PF_DOWN\) === L\.PF_DOWN \? 'down'/, f);
});

test('the demo page holds fighters still, and the shot tool shoots its scenes', () => {
  const demo = read('client/arena-render-demo.mjs');
  for (const scene of ['figures', 'faces', 'teams', 'effects']) assert.match(demo, new RegExp(`\\n  ${scene}\\(s\\) \\{`), scene);
  // the downed beside the standing, lying still and crawling
  assert.match(demo, /\n  downed\(s, near\) \{/);
  assert.match(demo, /flags: L\.PF_DOWN \}\);/);
  assert.match(demo, /speed: 2, flags: L\.PF_DOWN,/);
  assert.match(demo, /window\.__demo = \{ ready: true, names: Object\.keys\(SCENES\), shot\(name\) \{/);
  assert.match(read('client/arena-render-demo.html'), /<script type="module" src="\.\/arena-render-demo\.mjs"><\/script>/);
  const tool = read('tools/arena-shot.mjs');
  assert.match(tool, /arena-render-demo\.html\?present=0&res=\$\{res\}/);
  assert.match(tool, /traces\/arena-demo-\$\{name\}/);
});
