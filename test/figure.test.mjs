// The cartoon figure (client/figure.mjs): every player in every game, the
// arena's fighter, golf's golfer and party's rider. No GPU here, so what is
// held is its shape as source: the parts it is made of, the kits the
// renderers give it, and the demo page that holds fighters still for
// tools/arena-shot.mjs --scenes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIGURE_WGSL, WEAR_WGSL, HAIRS, EYES, kitOf, figureKit } from '../client/figure.mjs';
import { BODIES, HATS, STYLE, packLook } from '../client/looks.mjs';
import { FACES, SHIRTS, BACKS, packDress, dressOf } from '../client/dress.mjs';

const read = (f) => readFileSync(f, 'utf8');

test('the figure is a field of parts marched once, with a rig a pose moves', () => {
  for (const fn of ['fgCap', 'fgBox', 'fgLeg', 'fgRig', 'fgMap', 'figureRay']) assert.match(FIGURE_WGSL, new RegExp(`\\nfn ${fn}\\(`), fn);
  for (const st of ['Kit', 'Rig', 'Fig']) assert.match(FIGURE_WGSL, new RegExp(`\\nstruct ${st} \\{`), st);
  // every part fgMap hands back has a colour in figureRay
  const parts = new Set([...FIGURE_WGSL.matchAll(/fgMin\(o, [^;]*, (\d+)\.0\);/g)].map((m) => Number(m[1])));
  assert.deepEqual([...parts].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  for (const p of [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14]) assert.match(FIGURE_WGSL, new RegExp(`part == ${p}\\.0`), `part ${p} is coloured`);
  // the march is bounded, and its step never longer than the field says
  assert.match(FIGURE_WGSL, /for \(var i = 0; i < 64; i\+\+\) \{\s+let h = fgMap\(lo \+ ld \* t, r, kit\);/);
  assert.match(FIGURE_WGSL, /t \+= h\.x \* 0\.9;/);
  // 1.83 m tall within a hand (as the arena's fighters always were): the head's crown and the hair over it
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
    assert.match(src, /import \{ FIGURE_WGSL, WEAR_WGSL, HAIRS, EYES \} from '\.\/figure\.mjs';/, f);
    // what it wears: the shared tables, the kit through them, a dress word a slot uploaded, a taller quad for a standing hat
    assert.match(src, /\$\{WEAR_WGSL\}/, f);
    assert.match(src, /return wornKit\(k, s\.wear, (zombie|false)\);/, f);
    assert.match(src, /s\.dresses \?\? /, f);
    assert.match(src, /if \(wearTall\(o\.wear\)\) \{/, f);
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
  assert.match(demo, /window\.__demo = \{ ready: true, names: Object\.keys\(SCENES\), shot\(name\) \{/);
  assert.match(read('client/arena-render-demo.html'), /<script type="module" src="\.\/arena-render-demo\.mjs"><\/script>/);
  const tool = read('tools/arena-shot.mjs');
  assert.match(tool, /arena-render-demo\.html\?present=0&res=\$\{res\}/);
  assert.match(tool, /traces\/arena-demo-\$\{name\}/);
});

test('what a figure wears: a hat, a worn face, a shirt print, a back item, and nothing for the house look', () => {
  const arr = (name) => new RegExp(`const ${name} = array<u32, (\\d+)>\\(([^)]*)\\);`).exec(WEAR_WGSL);
  const nums = (m) => m[2].split(',').map((x) => Number(x.trim().replace('u', '')));
  // the house hat and none draw no hat, so a fighter that picked neither (every bot in a match before this) draws as it did
  const hat = nums(arr('WEAR_HAT'));
  assert.equal(hat.length, HATS.length);
  assert.equal(hat[0], 0, 'the house hat');
  assert.equal(hat[HATS.findIndex((h) => h.key === 'none')], 0, 'none');
  HATS.forEach((h, k) => { if (k && h.key !== 'none') assert.equal(hat[k], h.style + 1, h.key); });
  // every style a hat can have is drawn: in fgHat by its style, the pumpkin as the head itself
  for (const st of new Set(HATS.slice(1).filter((h) => h.key !== 'none').map((h) => h.style))) {
    if (st === STYLE.PUMPKIN) assert.match(FIGURE_WGSL, /kit\.hat == 7u && kit\.kind != 1u/);
    else assert.match(FIGURE_WGSL, new RegExp(`st == ${st}u\\)`), `style ${st}`);
  }
  // faces, prints and backs line up with client/dress.mjs's lists, and each is drawn
  assert.deepEqual(nums(arr('WEAR_FACE')), FACES.map((x) => (x.variant === undefined ? 0 : x.variant + 1)));
  assert.deepEqual(nums(arr('WEAR_PRINT')), SHIRTS.map((x) => (x.variant === undefined ? 0 : x.variant + 1)));
  assert.deepEqual(nums(arr('WEAR_BACK')), BACKS.map((x) => ({ pack: 1, cape: 2, jet: 3, wings: 4 })[x.key] ?? 0));
  for (let v = 1; v <= 5; v++) assert.match(FIGURE_WGSL, new RegExp(`fw == ${v}u`), `face ${v}`);
  for (let v = 0; v <= 5; v++) assert.match(FIGURE_WGSL, new RegExp(`v == ${v}u`), `print ${v}`);
  for (let b = 1; b <= 4; b++) assert.match(FIGURE_WGSL, new RegExp(`back == ${b}u`), `back ${b}`);
  // nothing worn costs nothing: the hat and the back are only marched when there is one
  assert.match(FIGURE_WGSL, /if \(kit\.hat != 0u && kit\.hat != 7u\) \{/);
  assert.match(FIGURE_WGSL, /if \(kit\.back != 0u\) \{/);
  assert.match(read('client/arena-render-demo.mjs'), /\n  dressed\(s\) \{/);
});

test('party\'s riders are the same figure: a kit from JS, and the riding the arena and golf never set, so they draw as they did', () => {
  assert.match(read('client/party-render.mjs'), /fn figKit\(k: u32\) -> Kit \{/);
  for (const f of ['act', 'actT', 'air', 'jolt', 'lean']) {
    assert.match(FIGURE_WGSL, new RegExp(`\\n  ${f}: `), f);
    for (const g of ['client/arena-render.mjs', 'client/render.mjs']) assert.doesNotMatch(read(g), new RegExp(`k\\.${f} = `), `${g} leaves ${f} at 0`);
  }
  // with none of it, the rig keeps its own arms and the march its own frame
  assert.match(FIGURE_WGSL, /if \(kit\.act != 0u \|\| kit\.air > 0\.0 \|\| kit\.jolt > 0\.0\) \{/);
  assert.match(FIGURE_WGSL, /if \(kit\.lean != 0\.0\) \{/);
  // the JS kit wears what the WGSL's tables say for every hat, face, print and back
  const arr = (name) => new RegExp(`const ${name} = array<u32, \\d+>\\(([^)]*)\\);`).exec(WEAR_WGSL)[1].split(',').map((x) => Number(x.trim().replace('u', '')));
  const [hat, face, print, back] = ['WEAR_HAT', 'WEAR_FACE', 'WEAR_PRINT', 'WEAR_BACK'].map(arr);
  HATS.forEach((h, k) => assert.equal(kitOf(0, packLook(0, k, 1)).hat, hat[k], h.key));
  FACES.forEach((x, k) => assert.equal(figureKit(0, 0, 0, packDress(k)).face, face[k], x.key));
  SHIRTS.forEach((x, k) => assert.equal(figureKit(0, 0, 0, packDress(0, k)).print, print[k], x.key));
  BACKS.forEach((x, k) => assert.equal(kitOf(0, 0, 0, dressOf(packDress(0, 0, k))).back, back[k], x.key));
});

test('the cards draw the figure too: every hat style a hat has, each worn face and print, each back item', () => {
  const src = read('client/figure.mjs');
  const cards = src.slice(src.indexOf('export function drawLook('));
  for (const st of new Set(HATS.slice(1).filter((h) => h.key !== 'none' && h.style !== STYLE.PUMPKIN).map((h) => h.style))) {
    const k = Object.keys(STYLE).find((n) => STYLE[n] === st);
    assert.match(cards, new RegExp(`st === STYLE\\.${k}\\)`), k);
  }
  assert.match(cards, /const pumpkin = K\.hat === 7/);
  for (let v = 1; v <= 5; v++) assert.match(cards, new RegExp(`fw === ${v}`), `face ${v}`);
  for (let v = 0; v <= 5; v++) assert.match(cards, new RegExp(`v === ${v}\\)`), `print ${v}`);
  for (let b = 1; b <= 4; b++) assert.match(cards, new RegExp(`K\\.back === ${b}`), `back ${b}`);
});
