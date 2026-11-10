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
  for (const [f, gun] of [['client/arena-render.mjs', /k\.gun = select\(1u, 0u, zombie\);/], ['client/render.mjs', /k\.gun = 2u;/]]) {
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

test('the demo page holds fighters still, and the shot tool shoots its scenes', () => {
  const demo = read('client/arena-render-demo.mjs');
  for (const scene of ['figures', 'faces', 'teams', 'effects']) assert.match(demo, new RegExp(`\\n  ${scene}\\(s\\) \\{`), scene);
  assert.match(demo, /window\.__demo = \{ ready: true, names: Object\.keys\(SCENES\), shot: /);
  assert.match(read('client/arena-render-demo.html'), /<script type="module" src="\.\/arena-render-demo\.mjs"><\/script>/);
  const tool = read('tools/arena-shot.mjs');
  assert.match(tool, /arena-render-demo\.html\?present=0&res=\$\{res\}/);
  assert.match(tool, /traces\/arena-demo-\$\{name\}/);
});
