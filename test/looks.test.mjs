// Looks (client/looks.mjs): a ball, a hat and a body a player picks, drawn
// beside the sim. The house look must draw exactly as the riders always have; every
// look the list names must be one the renderers draw; an earned look must
// name an achievement that exists; and a priced one is bought, never earned
// too (client/purse.mjs, test/purse.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BALLS, HATS, BODIES, PATTERN, STYLE, TRIM, packLook, unpackLook, riderSprites, slotColor, rgb24, tint, nextOpen, wearable, isOpen, guestLook, lookId, lookName, drawLook, FIRST_LOOK } from '../client/looks.mjs';
import { rider, BLOCK, PART } from '../client/rider.mjs';
import { slotColor as partySlotColor } from '../client/party-game.mjs';
import { byId } from '../client/achievements.mjs';

const inFont = (s) => [...s].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 95);

test('the house look is the riders as they were: the seat colour, alpha 1, the slot for a seed', () => {
  for (const p of [0, 1, 37, 255]) {
    const r = riderSprites(p, 0);
    assert.deepEqual(r.ball, { color: [...partySlotColor(p), 1], seed: p });
    assert.deepEqual(r.body.color, [...partySlotColor(p), 1]);
    assert.deepEqual(r.head.color, [...partySlotColor(p), 1]);
  }
  assert.equal(tint(0), 0, 'golf and the arena keep the seat colour');
});

test('a look word round-trips, and a number this build does not know is the house look', () => {
  for (let b = 0; b < BALLS.length; b++) for (let h = 0; h < HATS.length; h++) for (let k = 0; k < BODIES.length; k++) assert.deepEqual(unpackLook(packLook(b, h, k)), { ball: b, hat: h, body: k });
  assert.deepEqual(unpackLook(packLook(200, 201, 202)), { ball: 0, hat: 0, body: 0 });
  assert.deepEqual(unpackLook(0xffffffff), { ball: 0, hat: 0, body: 0 });
  assert.equal(packLook(3, 2), packLook(3, 2, 0), 'a word from before bodies is the round rider');
});

test('a picked look: 2 + its pattern or style in alpha, the second colour as a seed under 2^24, and a tint with its flag', () => {
  const w = packLook(BALLS.findIndex((b) => b.key === 'candy'), HATS.findIndex((x) => x.key === 'crown'));
  const r = riderSprites(9, w);
  assert.equal(r.ball.color[3], 2 + PATTERN.STRIPES);
  assert.equal(r.head.color[3], 2 + STYLE.CROWN);
  assert.ok(Number.isInteger(r.ball.seed) && r.ball.seed < 2 ** 24 && Math.fround(r.ball.seed) === r.ball.seed);
  assert.equal(r.ball.seed, rgb24(BALLS.find((b) => b.key === 'candy').b));
  assert.equal(tint(w) >>> 24, 1);
  assert.equal(tint(w) & 0xffffff, rgb24(BALLS.find((b) => b.key === 'candy').a));
  // the cap takes the ball's colour, as it always has
  assert.deepEqual(riderSprites(9, packLook(2, 0)).head.color, [...BALLS[2].a, 1]);
  assert.deepEqual(riderSprites(9, packLook(0, 3)).head.color.slice(0, 3), HATS[3].color);
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

test('every pattern and style the lists use is one the party shader draws', () => {
  for (const f of ['client/party-render.mjs']) {
    const src = readFileSync(f, 'utf8');
    const ball = src.slice(src.indexOf('fn lookBall('), src.indexOf('fn lookHat('));
    const hat = src.slice(src.indexOf('fn lookHat('), src.indexOf('\n}\n', src.indexOf('fn lookHat(')));
    for (const k of ['BEACH', 'STRIPES', 'RIBS', 'EIGHT', 'DOTS', 'CHECKER', 'SWIRL', 'DISCO']) assert.match(ball, new RegExp(`case ${PATTERN[k]}u:`), `${f}: ${k}`);
    assert.match(src, new RegExp(`look == ${2 + PATTERN.METAL}u`), `${f}: METAL`);
    assert.match(src, new RegExp(`look == ${2 + PATTERN.DISCO}u`), `${f}: the disco ball's shine`);
    for (const k of ['CAP', 'BEANIE', 'BAND', 'HELMET', 'CROWN', 'PUMPKIN', 'TOPHAT', 'CONE', 'HALO', 'ANTLERS', 'PHONES', 'PROP']) assert.match(hat, new RegExp(`case ${STYLE[k]}u:`), `${f}: ${k}`);
    assert.match(src, new RegExp(`hat == ${2 + STYLE.PUMPKIN}u`), `${f}: the pumpkin's eyes`);
    // every pattern and style there is has a look that wears it, and nothing but SOLID, METAL and NONE goes undrawn
    assert.deepEqual(Object.keys(PATTERN).filter((k) => !new RegExp(`case ${PATTERN[k]}u:`).test(ball)), ['SOLID', 'METAL']);
    assert.deepEqual(Object.keys(STYLE).filter((k) => !new RegExp(`case ${STYLE[k]}u:`).test(hat)), ['NONE']);
  }
  for (const v of Object.values(PATTERN)) assert.ok(BALLS.some((b) => b.pattern === v));
  for (const v of Object.values(STYLE)) assert.ok(HATS.some((h) => h.style === v));
});

test('a hat that stands off the head is boxes over the round rider too: its two spheres first, as ever, then the hat', () => {
  for (let h = 0; h < HATS.length; h++) {
    const out = [];
    rider(out, 7, packLook(1, h, 0), { at: [10, 20, 30], face: 0.5, roll: 3 });
    const rs = riderSprites(7, packLook(1, h, 0));
    assert.deepEqual(out.slice(0, 2).map((s) => [s.kind, s.size, s.color]), [[1, 0.34, rs.body.color], [8, 0.3, rs.head.color]], HATS[h].key);
    const boxes = out.slice(2);
    assert.equal(boxes.length > 0, HATS[h].style >= STYLE.TOPHAT, `${HATS[h].key}: ${boxes.length} boxes`);
    for (const s of boxes) {
      assert.equal(s.kind, BLOCK);
      assert.ok(s.vel.every((v) => v > 0) && [...s.pos, s.roll, s.seed, s.color[3]].every(Number.isFinite));
      assert.ok((s.color[3] & 15) <= PART.GLOW);
      // on or over the head (0.3 round, its middle 0.78 over the ball), never down in the body, and within a hand of its sides
      assert.ok(s.pos[1] > 20.7 && s.pos[1] < 21.75, `${HATS[h].key}: ${s.pos[1] - 20}`);
      assert.ok(Math.hypot(s.pos[0] - 10, s.pos[2] - 30) < 0.4, HATS[h].key);
    }
  }
  // the halo is lit, and the propeller turns with the ball
  const parts = (h, roll) => { const out = []; rider(out, 0, packLook(0, HATS.findIndex((x) => x.key === h), 1), { at: [0, 0, 0], face: 0, roll }); return out; };
  assert.equal(parts('halo', 0).filter((s) => (s.color[3] & 15) === PART.GLOW).length, 8);
  const blade = (roll) => parts('prop', roll).find((s) => s.vel[0] > 0.15 && s.vel[1] < 0.01).roll;
  assert.notEqual(blade(0), blade(1));
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
    if (HATS[h].style !== STYLE.NONE && HATS[h].style !== STYLE.PUMPKIN) assert.ok(bare > fills, `${HATS[h].key} on ${BODIES[body].key}: the hat is drawn`);
  }
});

test('the round body draws its rider as the riders always were: a body and a head, two spheres', () => {
  for (const w of [0, packLook(4, 3)]) {
    const out = [];
    rider(out, 7, w, { at: [10, 20, 30], face: 0.5, bob: 0.01 });
    const rs = riderSprites(7, w);
    assert.deepEqual(out, [
      { pos: [10, 20 + 0.22 + 0.01, 30], size: 0.34, color: rs.body.color, kind: 1, minpx: 1 },
      { pos: [10, 20 + 0.78 + 0.01, 30], size: 0.3, color: rs.head.color, kind: 8, minpx: 1, vel: [Math.cos(0.5), 0, Math.sin(0.5)] },
    ]);
  }
});

test('a blocky body: six boxes standing on the ball, the head with a face, a hat of boxes but none for no hat', () => {
  const none = HATS.findIndex((x) => x.style === STYLE.NONE);
  for (let k = 0; k < BODIES.length; k++) {
    if (!BODIES[k].blocky) continue;
    for (let h = 0; h < HATS.length; h++) {
      const out = [];
      rider(out, 3, packLook(0, h, k), { at: [0, 5, 0], face: 1, roll: 2, speed: 6, vy: 9 });
      assert.ok(out.every((s) => s.kind === BLOCK && s.vel.every((v) => v > 0) && Math.abs(s.size - Math.hypot(...s.vel)) < 1e-9), `${BODIES[k].key} ${HATS[h].key}`);
      assert.equal(out.length > 6, h !== none, `${HATS[h].key}: a hat`);
      assert.ok(out.every((s) => s.pos[1] > 5 && s.pos[1] < 6.7), 'standing on the ball, under two metres');
      const head = out[5];
      assert.equal(head.color[3] & 15, HATS[h].style === STYLE.PUMPKIN ? PART.PUMPKIN : BODIES[k].face);
    }
  }
});

test('a browser that never picked is blocky; an AI player in a local room wears only open looks, on a blocky body', () => {
  assert.equal(unpackLook(FIRST_LOOK).body, BODIES.findIndex((b) => b.key === 'blocky'));
  for (let p = 0; p < 256; p++) {
    const w = guestLook(p);
    assert.equal(wearable(w, new Set()), w);
    assert.ok(BODIES[unpackLook(w).body].blocky);
  }
});

test('the party renderer draws a box (client/rider.mjs) as sprite kind 12', () => {
  assert.equal(BLOCK, 12);
  for (const f of ['client/party-render.mjs']) {
    const src = readFileSync(f, 'utf8');
    assert.match(src, /\$\{BLOCK_WGSL\}/, f);
    assert.match(src, /case 12u: \{[^]*?blockAt\(/, f);
  }
});
