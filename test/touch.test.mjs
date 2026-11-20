// Touch controls (client/touch.mjs) and a phone's page (client/mobile.mjs):
// on with ?touch=1, off with ?touch=0, and otherwise on a coarse pointer (none
// in Node); the stick's eight equal directions and its pull; the buttons'
// places, none on another or on the HUD's bottom rows; the settings kept in
// bounds; the HUD's words for keys in a phone's; when a page draws at a new
// size; and every player frontend and page wiring them. net/run-touch.mjs plays
// them with fingers in Chrome.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { touchWanted, stickBits, follow, STICK_R, SPOTS, BIG, MID, cleanSettings, TOUCH_DEFAULTS, LOOK_RANGE, touchWords } from '../client/touch.mjs';
import { refitWanted, tooSlow } from '../client/mobile.mjs';
import { shortName } from '../tools/kit.mjs';

test('?touch=1 turns them on, ?touch=0 off, and with neither a page with no coarse pointer has none', () => {
  assert.equal(touchWanted(new URLSearchParams('touch=1')), true);
  assert.equal(touchWanted(new URLSearchParams('touch=0')), false);
  assert.equal(touchWanted(new URLSearchParams('')), false);
});

test('the stick holds one of eight equal directions, nothing in its middle', () => {
  const W = 1, S = 2, A = 4, D = 8;
  const at = (deg, r = STICK_R) => stickBits(r * Math.cos(deg * Math.PI / 180), r * Math.sin(deg * Math.PI / 180), STICK_R); // screen y down
  assert.equal(stickBits(0, 0, STICK_R), 0);
  assert.equal(at(-90, STICK_R * 0.15), 0, 'a thumb settling in the middle holds nothing');
  assert.equal(at(-90, STICK_R * 0.25), W);
  // each direction 45 degrees wide, centred on its axis or diagonal
  const dirs = [[0, D], [45, D | S], [90, S], [135, S | A], [180, A], [-135, A | W], [-90, W], [-45, W | D]];
  for (const [deg, bits] of dirs) {
    assert.equal(at(deg), bits, `${deg} degrees`);
    assert.equal(at(deg - 22), bits, `${deg - 22} degrees`);
    assert.equal(at(deg + 22), bits, `${deg + 22} degrees`);
  }
  assert.equal(at(-90, STICK_R * 3), W, 'past the rim it still holds');
  for (let deg = -180; deg < 180; deg += 7) {
    const b = at(deg);
    assert.ok(!((b & W) && (b & S)) && !((b & A) && (b & D)), 'never both ways at once');
  }
});

test('the stick follows a thumb past its rim, never more than its reach behind', () => {
  assert.deepEqual(follow(100, 100, 130, 100, STICK_R), [100, 100], 'inside: it stays');
  const [x, y] = follow(100, 100, 100 + STICK_R + 40, 100, STICK_R);
  assert.equal(Math.round(x), 140);
  assert.equal(y, 100);
  const [x2, y2] = follow(0, 0, 300, 400, STICK_R);
  assert.ok(Math.abs(Math.hypot(300 - x2, 400 - y2) - STICK_R) < 1e-9, 'pulled along to exactly its reach');
});

test('the corner\'s buttons sit apart, on the screen, and clear of the HUD\'s bottom rows', () => {
  const size = (k) => (k === 0 ? BIG : MID);
  for (let i = 0; i < SPOTS.length; i++) {
    const [x, y] = SPOTS[i], r = size(i) / 2;
    assert.ok(x - r >= 8 && y - r >= 8, `spot ${i} on the screen`);
    assert.ok(y - r >= 46, `spot ${i} clear of the arena's guns and golf's distances along the bottom`);
    // a phone held sideways is 320 px tall at the least: every spot is under its top
    assert.ok(y + r <= 320 - 40, `spot ${i} under a short screen's top`);
    for (let j = i + 1; j < SPOTS.length; j++) {
      const d = Math.hypot(SPOTS[j][0] - x, SPOTS[j][1] - y);
      assert.ok(d >= r + size(j) / 2 + 4, `spots ${i} and ${j} apart (${d.toFixed(1)} px)`);
    }
  }
});

test('the settings come back in bounds, the defaults where something is off', () => {
  assert.deepEqual(cleanSettings({}), { ...TOUCH_DEFAULTS });
  assert.deepEqual(cleanSettings(null), { ...TOUCH_DEFAULTS });
  assert.deepEqual(cleanSettings({ look: 99, invert: true, buzz: false }), { look: LOOK_RANGE[1], invert: true, buzz: false });
  assert.equal(cleanSettings({ look: 0 }).look, LOOK_RANGE[0]);
  assert.equal(cleanSettings({ look: 'fast' }).look, TOUCH_DEFAULTS.look);
  assert.equal(cleanSettings({ look: 1.26 }).look, 1.3, 'a tenth at a time');
  assert.equal(cleanSettings({ invert: 'yes' }).invert, false);
});

test('a HUD\'s words for keys and the mouse, in a phone\'s', () => {
  assert.equal(touchWords('ROLL OVER A BALL  CLICK TO THROW'), 'ROLL OVER A BALL  TAP TO THROW');
  assert.equal(touchWords('AIM WITH THE MOUSE  HOLD SPACE TO CHARGE  LET GO TO PUTT'), 'AIM BY DRAGGING  HOLD HOP TO CHARGE  LET GO TO PUTT');
  assert.equal(touchWords('CLICKS AND SPACESHIPS'), 'CLICKS AND SPACESHIPS', 'whole words only');
  // every minigame's hint, on a phone, names no key
  const hints = [];
  for (const f of readFileSync('client/mg/index.mjs', 'utf8').match(/'\.\/[\w-]+\.mjs'/g) ?? []) {
    const src = readFileSync(`client/mg/${f.slice(3, -1)}`, 'utf8');
    for (const m of src.matchAll(/\bhint: '([^']*)'/g)) hints.push(m[1]);
  }
  assert.ok(hints.length >= 40, `the minigames' hints (${hints.length})`);
  for (const h of hints) assert.doesNotMatch(touchWords(h), /\b(CLICK|SPACE|MOUSE|WASD|[QEFRG] TO)\b/, h);
});

test('a page draws at a new size when the window moves 6% either way; a slow one smaller', () => {
  assert.equal(refitWanted([1560, 720], [1560, 720]), false);
  assert.equal(refitWanted([1560, 720], [1560, 700]), false, 'a browser bar coming and going is no new canvas');
  assert.equal(refitWanted([1560, 720], [720, 1560]), true, 'turned upright');
  assert.equal(refitWanted([1560, 608], [1560, 720]), true, 'the whole screen');
  assert.equal(tooSlow(Array(60).fill(16.7)), false);
  assert.equal(tooSlow(Array(60).fill(33.3)), true);
  assert.equal(tooSlow([...Array(50).fill(16.7), ...Array(10).fill(200)]), false, 'a few hitches are not slow');
  assert.equal(tooSlow(Array(10).fill(40)), false, 'too few frames to say');
});

test('a phone names its home screen icon short', () => {
  assert.equal(shortName('Fireplace'), 'Fireplace');
  assert.equal(shortName('Snow Fort Party'), 'Snow Fort');
  assert.equal(shortName('Supercalifragilistic Games'), 'Supercalifra');
});

test('golf, the arena, Dogfight and party each put them up for a player, and take them down', () => {
  for (const g of ['golf', 'arena', 'flight', 'party']) {
    const src = readFileSync(`client/${g}-game.mjs`, 'utf8');
    assert.match(src, /touch = touchControls\(\{ held, writeKeys/, g);
    assert.match(src, /const TOUCH = !WATCH && !BOT && touchWanted\((host|h)\.q\);/, g);
    assert.match(src, /if \(TOUCH\) locked = true;/, g);
    assert.match(src, /unmount\(\) \{ off\(\); touch\?\.remove\(\);/, g);
    // a button's label is a word to tap, never a key's
    for (const m of src.matchAll(/label: '([^']+)'/g)) assert.doesNotMatch(m[1], /^(SPACE|CLICK|TAB|SHIFT|[A-Z])$/, `${g}: ${m[1]}`);
  }
});

test('every page that plays holds still on a phone, fits its canvas again, and can go on a home screen', () => {
  const manifest = JSON.parse(readFileSync('client/manifest.webmanifest', 'utf8'));
  assert.equal(manifest.display, 'fullscreen');
  assert.equal(manifest.orientation, 'landscape');
  assert.equal(manifest.start_url, undefined, 'each page on a home screen opens itself');
  for (const p of ['golf', 'arena', 'flight', 'party', 'fireplace']) {
    const html = readFileSync(`client/${p}.html`, 'utf8');
    assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">/, p);
    assert.match(html, /<link rel="manifest" href="manifest.webmanifest">/, p);
    const js = readFileSync(`client/${p}.mjs`, 'utf8');
    assert.match(js, /phonePage\(q, \{ wake:/, p);
    if (p !== 'fireplace') assert.match(js, /await fitted\(h, phone, \{ canvas, key: '\w+', mount: \(\) => mount\(h,/, p);
  }
  assert.match(readFileSync('client/fireplace.mjs', 'utf8'), /phone\.refit\(\(\) => \[W, H\], async/);
});
