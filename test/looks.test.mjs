// Looks (client/looks.mjs): a ball, a hat and a body a player picks, drawn
// beside the sim. The house ball must draw exactly as the balls always have; every
// look the list names must be one the renderers draw; an earned look must
// name an achievement that exists; and a priced one is bought, never earned
// too (client/purse.mjs, test/purse.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BALLS, HATS, BODIES, PATTERN, STYLE, TRIM, packLook, unpackLook, ballSprite, lookOf, slotColor, rgb24, tint, nextOpen, wearable, isOpen, guestLook, lookId, lookName, FIRST_LOOK } from '../client/looks.mjs';
import { rider, BLOCK, FIGURE } from '../client/rider.mjs';
import { drawLook, kitOf } from '../client/figure.mjs';
import { slotColor as partySlotColor } from '../client/party-game.mjs';
import { byId } from '../client/achievements.mjs';

const inFont = (s) => [...s].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 95);

test('the house ball is the balls as they were: the seat colour, alpha 1, the slot for a seed; its rider\'s shirt the seat\'s', () => {
  for (const p of [0, 1, 37, 255]) {
    assert.deepEqual(ballSprite(p, 0), { color: [...partySlotColor(p), 1], seed: p });
    assert.deepEqual(kitOf(p, 0).torso, partySlotColor(p));
  }
  assert.equal(tint(0), 0, 'golf and the arena keep the seat colour');
});

test('a look word round-trips, and a number this build does not know is the house look', () => {
  for (let b = 0; b < BALLS.length; b++) for (let h = 0; h < HATS.length; h++) for (let k = 0; k < BODIES.length; k++) assert.deepEqual(unpackLook(packLook(b, h, k)), { ball: b, hat: h, body: k });
  assert.deepEqual(unpackLook(packLook(200, 201, 202)), { ball: 0, hat: 0, body: 0 });
  assert.deepEqual(unpackLook(0xffffffff), { ball: 0, hat: 0, body: 0 });
  assert.equal(packLook(3, 2), packLook(3, 2, 0), 'a word from before bodies is body 0');
});

test('a picked look: 2 + its pattern or style in alpha, the second colour as a seed under 2^24, and a tint with its flag', () => {
  const w = packLook(BALLS.findIndex((b) => b.key === 'candy'), HATS.findIndex((x) => x.key === 'crown'));
  const r = ballSprite(9, w);
  assert.equal(r.color[3], 2 + PATTERN.STRIPES);
  assert.equal(kitOf(9, w).hat, STYLE.CROWN + 1);
  assert.ok(Number.isInteger(r.seed) && r.seed < 2 ** 24 && Math.fround(r.seed) === r.seed);
  assert.equal(r.seed, rgb24(BALLS.find((b) => b.key === 'candy').b));
  assert.equal(tint(w) >>> 24, 1);
  assert.equal(tint(w) & 0xffffff, rgb24(BALLS.find((b) => b.key === 'candy').a));
  // the shirt takes the ball's colour, the hat its own
  assert.deepEqual(kitOf(9, packLook(2, 0)).torso, BALLS[2].a);
  assert.deepEqual(kitOf(9, packLook(0, 3)).hatc, HATS[3].color);
  assert.deepEqual(lookOf(9, packLook(2, 0)).hatColor, BALLS[2].a);
  assert.deepEqual(slotColor(4), partySlotColor(4));
});

test('the lists: keys unique, names in the font, the house look first, each earned look naming an achievement', () => {
  for (const list of [BALLS, HATS, BODIES]) {
    assert.equal(new Set(list.map((x) => x.key)).size, list.length);
    assert.ok(!list[0].unlock, 'the house look is everyone\'s');
    for (const x of list) {
      assert.ok(inFont(x.name) && x.name.length <= 16, x.name);
      if (x.unlock) assert.ok(byId.has(x.unlock), `${x.key} opens with ${x.unlock}, which is not an achievement`);
    }
  }
  for (const b of BALLS) assert.ok(Object.values(PATTERN).includes(b.pattern), b.key);
  for (const h of HATS) assert.ok(Object.values(STYLE).includes(h.style), h.key);
});

test('the lists are append-only: every look that was there keeps its number, so a word on the wire means what it did', () => {
  assert.deepEqual(BALLS.slice(0, 14).map((x) => x.key), ['house', 'beach', 'candy', 'zebra', 'melon', 'pumpkin', 'snow', 'eight', 'gold', 'mallow', 'swiss', 'ember', 'smore', 'platinum']);
  assert.deepEqual(HATS.slice(0, 8).map((x) => x.key), ['cap', 'beanie', 'band', 'helmet', 'none', 'pumpkin', 'crown', 'pilot']);
  assert.deepEqual(BODIES.slice(0, 5).map((x) => x.key), ['round', 'blocky', 'peach', 'cocoa', 'robot']);
  assert.deepEqual([PATTERN.BEACH, PATTERN.STRIPES, PATTERN.RIBS, PATTERN.SOLID, PATTERN.METAL, PATTERN.EIGHT], [0, 1, 2, 3, 4, 5]);
  assert.deepEqual([STYLE.CAP, STYLE.NONE, STYLE.BEANIE, STYLE.BAND, STYLE.HELMET, STYLE.CROWN, STYLE.PUMPKIN], [0, 1, 2, 3, 4, 5, 6]);
  // each list's number is a byte of the look word
  for (const list of [BALLS, HATS, BODIES]) assert.ok(list.length <= 256);
  // 2 + a pattern or a style rides a sprite's alpha, 2 + a part and a splay a box's: whole numbers an f32 holds
  for (const v of [...Object.values(PATTERN), ...Object.values(STYLE)]) assert.ok(Number.isInteger(v) && v >= 0 && v < 64);
});

test('a priced look: bought with marshmallows, never earned as well; 5 to 150, the dearer the rarer; an id of its own', () => {
  const all = [...BALLS, ...HATS, ...BODIES];
  const priced = all.filter((x) => x.price !== undefined);
  assert.ok(priced.length >= 10 && priced.length <= 16, `${priced.length} priced looks`);
  for (const x of priced) {
    assert.ok(!x.unlock, `${x.key}: a price or an achievement, not both`);
    assert.ok(Number.isInteger(x.price) && x.price >= 5 && x.price <= 150, `${x.key}: ${x.price}`);
    assert.ok(lookName(x).length <= 24 && inFont(lookName(x)));
  }
  for (const list of [BALLS, HATS, BODIES]) {
    assert.ok(!list[0].price, 'the house look is free');
    assert.ok(list.some((x) => x.price), 'something to buy in each list');
  }
  // an id names its list and its key, so a ball and a hat of one key are two
  assert.equal(new Set(all.map(lookId)).size, all.length);
  assert.equal(lookId(BALLS.find((b) => b.key === 'pumpkin')), 'ball:pumpkin');
  assert.equal(lookId(HATS.find((h) => h.key === 'pumpkin')), 'hat:pumpkin');
  assert.equal(lookId(BODIES.find((b) => b.key === 'goldbot')), 'body:goldbot');
  // the curve: a first buy within two top-three finishes, and the lot more than a night's play
  const prices = priced.map((x) => x.price).sort((a, b) => a - b);
  assert.equal(prices[0], 5);
  assert.equal(prices.at(-1), 150);
  assert.ok(prices.filter((v) => v <= 15).length >= 4, 'a few cheap ones');
  assert.ok(prices.reduce((a, b) => a + b, 0) >= 400);
  // what is new: a hat in each new style, a ball in each new pattern
  for (const k of ['TOPHAT', 'CONE', 'HALO', 'ANTLERS', 'PHONES', 'PROP']) assert.ok(HATS.some((h) => h.style === STYLE[k] && h.price), k);
  for (const k of ['DOTS', 'CHECKER', 'SWIRL', 'DISCO']) assert.ok(BALLS.some((b) => b.pattern === PATTERN[k] && b.price), k);
  for (const c of Object.values(TRIM)) assert.ok(c.length === 3 && c.every((v) => v >= 0 && v <= 1));
});

test('locked looks are skipped and taken off', () => {
  const gold = BALLS.findIndex((b) => b.key === 'gold');
  const crown = HATS.findIndex((x) => x.key === 'crown');
  const none = new Set();
  assert.equal(isOpen(BALLS[gold], none), false);
  assert.equal(isOpen(BALLS[gold], new Set(['golden'])), true);
  assert.equal(wearable(packLook(gold, crown), none), 0);
  assert.equal(wearable(packLook(gold, crown), new Set(['golden', 'roll'])), packLook(gold, crown));
  for (let k = 0; k < BALLS.length; k++) assert.ok(isOpen(BALLS[nextOpen(BALLS, k, none)], none));
  assert.equal(nextOpen(BALLS, gold - 1, new Set(['golden'])), gold);
  // a priced look is shut the same way until its id is held, and no achievement opens it
  const halo = HATS.findIndex((x) => x.key === 'halo');
  const every = new Set([...byId.keys()]);
  assert.equal(isOpen(HATS[halo], every), false);
  assert.equal(wearable(packLook(gold, halo), every), packLook(gold, 0));
  assert.equal(wearable(packLook(gold, halo), new Set([...every, 'hat:halo'])), packLook(gold, halo));
  for (let k = 0; k < HATS.length; k++) assert.ok(!HATS[nextOpen(HATS, k, every)].price, 'H skips what is not bought');
  assert.equal(nextOpen(HATS, halo - 1, new Set(['hat:halo'])), halo);
});

test('every pattern the lists use is one the party shader draws (a hat\'s style is the figure\'s: test/figure.test.mjs)', () => {
  for (const f of ['client/party-render.mjs']) {
    const src = readFileSync(f, 'utf8');
    const ball = src.slice(src.indexOf('fn lookBall('), src.indexOf('\n}\n', src.indexOf('fn lookBall(')));
    for (const k of ['BEACH', 'STRIPES', 'RIBS', 'EIGHT', 'DOTS', 'CHECKER', 'SWIRL', 'DISCO']) assert.match(ball, new RegExp(`case ${PATTERN[k]}u:`), `${f}: ${k}`);
    assert.match(src, new RegExp(`look == ${2 + PATTERN.METAL}u`), `${f}: METAL`);
    assert.match(src, new RegExp(`look == ${2 + PATTERN.DISCO}u`), `${f}: the disco ball's shine`);
    // every pattern there is has a look that wears it, and nothing but SOLID and METAL goes undrawn
    assert.deepEqual(Object.keys(PATTERN).filter((k) => !new RegExp(`case ${PATTERN[k]}u:`).test(ball)), ['SOLID', 'METAL']);
  }
  for (const v of Object.values(PATTERN)) assert.ok(BALLS.some((b) => b.pattern === v));
  for (const v of Object.values(STYLE)) assert.ok(HATS.some((h) => h.style === v));
});

test('every hat is worn by the figure by its style, the house cap and none as no hat (as the arena draws them); a standing one takes a taller square', () => {
  for (let h = 0; h < HATS.length; h++) {
    const out = [];
    rider(out, 7, packLook(1, h, 1), { at: [10, 20, 30], face: 0.5, roll: 3 });
    const k = out[0].fig.kit;
    assert.equal(k.hat, h === 0 || HATS[h].style === STYLE.NONE ? 0 : HATS[h].style + 1, HATS[h].key);
    // (the arena's wearTall: a crown's points and up)
    assert.equal(out[0].size > 1.6 * out[0].fig.scale, HATS[h].style >= STYLE.CROWN && h !== 0, `${HATS[h].key}: its square`);
    if (HATS[h].color) assert.deepEqual(k.hatc, HATS[h].color);
  }
});

test('a card draws every look: each ball, hat and body through drawLook without a miss', () => {
  // a 2D context that takes any call and counts the fills
  let fills = 0;
  const g = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => { if (/^fill|^stroke/.test(String(k))) fills++; return a; }), set: (t, k, v) => { t[k] = v; return true; } });
  for (let b = 0; b < BALLS.length; b++) for (const body of [0, 1]) { fills = 0; drawLook(g, 20, 33, 16, 3, packLook(b, 0, body), 0.3); assert.ok(fills > 3, BALLS[b].key); }
  for (let h = 0; h < HATS.length; h++) for (let body = 0; body < BODIES.length; body++) {
    fills = 0;
    drawLook(g, 20, 90, 30, 3, packLook(0, h, body), 0.3);
    const bare = fills;
    fills = 0;
    drawLook(g, 20, 90, 30, 3, packLook(0, HATS.findIndex((x) => x.style === STYLE.NONE), body), 0.3);
    if (h && HATS[h].style !== STYLE.NONE && HATS[h].style !== STYLE.PUMPKIN) assert.ok(bare > fills, `${HATS[h].key} on ${BODIES[body].key}: the hat is drawn`);
  }
});

test('every body is the figure on its ball: one sprite, the body\'s skin, a robot\'s head by its face', () => {
  BODIES.forEach((b, k) => {
    for (const w of [packLook(0, 0, k), packLook(4, 3, k)]) {
      const out = [];
      rider(out, 7, w, { at: [10, 20, 30], face: 0.5, bob: 0.01 });
      assert.equal(out.length, 1);
      assert.equal(out[0].kind, FIGURE);
      assert.deepEqual(out[0].fig.feet, [10, 20.01, 30]);
      assert.deepEqual(out[0].fig.kit.skin, b.skin, b.key);
      assert.equal(out[0].fig.kit.kind, b.face === 4 ? 2 : 0, b.key);
    }
  });
});

test('a browser that never picked wears the yellow body, as Elo Pros\' default avatar does; an AI player wears only open looks, never body 0', () => {
  assert.equal(unpackLook(FIRST_LOOK).body, BODIES.findIndex((b) => b.key === 'blocky'));
  assert.equal(BODIES[unpackLook(FIRST_LOOK).body].name, 'YELLOW');
  for (let p = 0; p < 256; p++) {
    const w = guestLook(p);
    assert.equal(wearable(w, new Set()), w);
    assert.ok(unpackLook(w).body > 0);
  }
});

test('the party renderer draws a box (client/block.mjs) as sprite kind 12, a rider (client/rider.mjs) as kind 13, the figure marched', () => {
  assert.equal(BLOCK, 12);
  assert.equal(FIGURE, 13);
  for (const f of ['client/party-render.mjs']) {
    const src = readFileSync(f, 'utf8');
    assert.match(src, /\$\{BLOCK_WGSL\}/, f);
    assert.match(src, /\$\{FIGURE_WGSL\}/, f);
    assert.match(src, /case 12u: \{[^]*?blockAt\(/, f);
    assert.match(src, /case 13u: \{[^]*?figKit\(k\)[^]*?figureRay\(/, f);
  }
});
