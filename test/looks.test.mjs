// Looks (client/looks.mjs): a ball, a hat and a body a player picks, drawn
// beside the sim. The house look must draw exactly as the riders always have; every
// look the list names must be one the renderers draw; and an earned look
// must name an achievement that exists.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BALLS, HATS, BODIES, PATTERN, STYLE, packLook, unpackLook, riderSprites, slotColor, rgb24, tint, nextOpen, wearable, isOpen, guestLook, FIRST_LOOK } from '../client/looks.mjs';
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
});

test('every pattern and style the lists use is one the party shader draws', () => {
  for (const f of ['client/party-render.mjs']) {
    const src = readFileSync(f, 'utf8');
    const ball = src.slice(src.indexOf('fn lookBall('), src.indexOf('fn lookHat('));
    const hat = src.slice(src.indexOf('fn lookHat('), src.indexOf('\n}\n', src.indexOf('fn lookHat(')));
    for (const k of ['BEACH', 'STRIPES', 'RIBS', 'EIGHT']) assert.match(ball, new RegExp(`case ${PATTERN[k]}u:`), `${f}: ${k}`);
    assert.match(src, new RegExp(`look == ${2 + PATTERN.METAL}u`), `${f}: METAL`);
    for (const k of ['BEANIE', 'BAND', 'HELMET', 'CROWN', 'PUMPKIN']) assert.match(hat, new RegExp(`case ${STYLE[k]}u:`), `${f}: ${k}`);
    assert.match(src, new RegExp(`hat == ${2 + STYLE.PUMPKIN}u`), `${f}: the pumpkin's eyes`);
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
