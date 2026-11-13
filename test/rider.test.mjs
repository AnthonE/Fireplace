// Party's riders (client/rider.mjs: the cartoon figure on a ball), emotes
// (the look word's top byte) and juice (client/juice.mjs): drawing only,
// beside the sim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rider, emoteOf, withEmote, EMOTE, EMOTE_KEYS, EMOTE_S, BLOCK, FIGURE } from '../client/rider.mjs';
import { RIDE, kitOf, HAIRS, EYES } from '../client/figure.mjs';
import { createJuice } from '../client/juice.mjs';
import { packLook, unpackLook, wearable, BODIES } from '../client/looks.mjs';

test('an emote rides the look word\'s top byte: the look under it unchanged, the same emote twice a new word', () => {
  const w = packLook(3, 2, 1);
  const a = withEmote(w, EMOTE.WAVE);
  const b = withEmote(a, EMOTE.WAVE);
  assert.notEqual(a, b);
  for (const x of [a, b]) assert.deepEqual(unpackLook(x), unpackLook(w));
  assert.equal(wearable(a, new Set()), w, 'what is kept in the browser has no emote in it');
  let x = w;
  for (let k = 0; k < 40; k++) { x = withEmote(x, EMOTE.SPIN); assert.ok(x >= 0 && x < 2 ** 32 && (x & 0xffffff) === w); }
  assert.deepEqual(Object.values(EMOTE_KEYS).sort(), Object.values(EMOTE).sort());
});

test('a page acts an emote out from when it sees the word change, for EMOTE_S, and not one it found already there', () => {
  const seen = new Map();
  const w = withEmote(packLook(0, 0, 1), EMOTE.CHEER);
  assert.equal(emoteOf(seen, 4, w, 1000), null, 'there before the page looked: old news');
  const w2 = withEmote(w, EMOTE.DANCE);
  assert.deepEqual(emoteOf(seen, 4, w2, 2000), { id: EMOTE.DANCE, t: 0 });
  assert.deepEqual(emoteOf(seen, 4, w2, 3000), { id: EMOTE.DANCE, t: 1 });
  assert.equal(emoteOf(seen, 4, w2, 2000 + EMOTE_S * 1000), null);
  assert.equal(emoteOf(seen, 5, packLook(1, 1, 1), 0), null);
});

test('a rider is one figure standing on its ball, whole through every emote, a jolt and a flight', () => {
  const w = packLook(2, 1, 1);
  for (const id of [0, ...Object.values(EMOTE)]) for (const t of [0, 0.4, 1.3, 2.4]) for (const jolt of [0, 0.5, 1]) for (const vy of [0, -9, 12]) {
    const out = [];
    rider(out, 0, w, { at: [0, 3, 0], face: 0.3, roll: 5, speed: 4, vy, emote: id ? { id, t } : null, jolt });
    assert.equal(out.length, 1);
    const [s] = out;
    const f = s.fig;
    assert.equal(s.kind, FIGURE);
    assert.equal(f.scale, RIDE);
    const nums = [...s.pos, s.size, ...f.feet, ...f.pose, f.act, f.actT, f.air, f.jolt, f.lean];
    assert.ok(nums.every(Number.isFinite), `${id} ${t} ${jolt}`);
    // its feet on the ball's top (a hop or a jolt a little over it), its square round the whole figure
    assert.ok(f.feet[1] >= 3 && f.feet[1] < 3.3, `${f.feet[1]}`);
    assert.ok(s.pos[1] - s.size <= f.feet[1] && s.pos[1] + s.size >= f.feet[1] + 1.83 * RIDE);
    assert.equal(f.act, id && t < EMOTE_S ? id : 0);
    assert.ok(f.air >= 0 && f.air <= 1 && (id ? f.air === 0 : f.air === (vy ? 1 : 0)));
    assert.ok(Math.abs(f.lean) < 0.5);
  }
});

test('a rider is drawn as the arena\'s fighter is: the same hair, eyes and cut for a slot, its body\'s skin, a robot by its face', () => {
  // the arena's kitOf (client/arena-render.mjs): h = (slot * 2654435761) >> 7, as u32s
  for (const slot of [0, 1, 7, 31, 200, 255]) {
    const h = Number((BigInt(slot) * 2654435761n) & 0xffffffffn) >>> 7;
    const k = kitOf(slot, packLook(0, 0, 2));
    assert.deepEqual([k.hair, k.eye, k.cut], [HAIRS[h % HAIRS.length], EYES[(h >>> 11) % EYES.length], (h >>> 5) % 3]);
  }
  BODIES.forEach((b, k) => {
    const kit = kitOf(3, packLook(0, 0, k));
    assert.deepEqual(kit.skin, b.skin);
    assert.equal(kit.kind, b.face === 4 ? 2 : 0, b.key);
    assert.deepEqual(kit.larm, b.skin, 'bare arms in its skin');
  });
});

test('juice: a bump jolts both riders and fades; confetti thrown up falls, turning, and is gone in under five seconds', () => {
  const j = createJuice();
  j.bump(3, 9, 12, false, 0);
  assert.equal(j.jolt(3, 0), 1);
  assert.ok(j.jolt(9, 100) > 0 && j.jolt(9, 100) < 1);
  assert.equal(j.jolt(3, 1000), 0);
  assert.equal(j.jolt(4, 0), 0);
  const cam = [1, 2, 3];
  j.shake(cam, 16, 0);
  assert.deepEqual(cam, [1, 2, 3], 'not your bump: the camera holds still');
  j.bump(0, 1, 18, true, 0);
  j.shake(cam, 16, 123);
  assert.notDeepEqual(cam, [1, 2, 3]);
  j.win([5], 0);
  assert.equal(j.cheer(6, 100, [0, 0, 0]), null);
  assert.equal(j.cheer(5, 100, [0, 10, 0]).id, EMOTE.CHEER);
  let out = [];
  j.draw(out, 16);
  assert.ok(out.length > 50 && out.every((s) => s.kind === BLOCK && s.color[3] === 1024));
  let top = 0;
  for (let k = 0; k < 300 && out.length; k++) { out = []; j.draw(out, 16); for (const s of out) top = Math.max(top, s.pos[1]); }
  assert.ok(top > 11, 'thrown up');
  assert.equal(out.length, 0, 'and gone');
  j.reset();
  assert.equal(j.cheer(5, 100, [0, 0, 0]), null);
});

test('the arena draws its fighters as the cartoon figure, with every body\'s skin, and the gun in your hands of boxes', () => {
  const src = readFileSync('client/arena-render.mjs', 'utf8');
  assert.match(src, /\$\{BLOCK_RAY_WGSL\}/, 'the viewmodel is boxes');
  assert.match(src, /\$\{FIGURE_WGSL\}/);
  assert.match(src, /fn kitOf\(s: SOut\) -> Kit/);
  // (the eye brought toward its feet by the figure's size, u.aim.w: 1 unless the map has a body of its own)
  assert.match(src, /figureRay\(s\.feet \+ \(u\.cam\.xyz - s\.feet\) \/ u\.aim\.w, normalize\(ray\), fwd, 1\.0 \/ \(u\.cam\.w \* u\.aim\.w\), s\.feet, s\.pose, kitOf\(s\)\)/);
  assert.match(src, /kind = 15u;/);
  assert.match(readFileSync('client/arena-game.mjs', 'utf8'), /looks: looksOf\(host\)/);
});

test('an Elo Pros avatar word: six parts from the palette and a face; 0 is none; its default the profile\'s', async () => {
  const A = await import('../client/avatar.mjs');
  assert.equal(A.DEFAULT, 0xa31002a0, 'scry-forge meter/faces.py AVATAR_DEFAULT');
  assert.equal(A.PALETTE.length, 32);
  assert.equal(A.colorsOf(0), null);
  assert.equal(A.colorsOf(0x7fffffff), null, 'no set bit, no avatar');
  const w = A.pack([1, 11, 3, 4, 22, 23], true);
  const c = A.colorsOf(w);
  assert.deepEqual([c.head, c.torso, c.larm, c.rarm, c.lleg, c.rleg], [1, 11, 3, 4, 22, 23].map((k) => A.PALETTE[k]));
  assert.equal(c.robot, true);
  for (let p = 0; p < 256; p++) assert.ok(A.isAvatar(A.guestAvatar(p)));
});

test('a rider wears its avatar: the head (its skin), arms, torso and legs in its colours, a robot\'s head by its face bit', async () => {
  const A = await import('../client/avatar.mjs');
  const av = A.pack([1, 11, 3, 4, 22, 23], true);
  const out = [];
  rider(out, 0, packLook(0, 4, 1), { at: [0, 0, 0], face: 0, avatar: av }); // no hat
  const k = out[0].fig.kit;
  assert.deepEqual([k.skin, k.torso, k.larm, k.rarm, k.lleg, k.rleg], [1, 11, 3, 4, 22, 23].map((i) => A.PALETTE[i]));
  assert.equal(k.kind, 2, 'a robot');
  assert.equal(k.hat, 0);
  const plain = [];
  rider(plain, 0, packLook(0, 4, 1), { at: [0, 0, 0], face: 0 });
  assert.deepEqual(plain[0].fig.kit.skin, BODIES[1].skin, 'no avatar: its body\'s skin');
  assert.equal(plain[0].fig.kit.kind, 0);
});

test('the wire carries avatars as it carries looks: a hello flag, then [slot, word] pairs', async () => {
  const W = await import('../net/wire.mjs');
  const h = W.decodeHello(W.encodeHello({ maxDatagram: 1200, wasmPrefix: new Uint8Array(8), avatars: true, looks: true }));
  assert.equal(h.avatars, true);
  assert.equal(W.decodeHello(W.encodeHello({ maxDatagram: 1200, wasmPrefix: new Uint8Array(8), looks: true })).avatars, false);
  const buf = W.encodeLooks([[3, 0xa31002a0], [255, 0xc0000000]], W.T_AVATAR);
  let o = 0;
  const sr = { read: async (n) => { const b = buf.subarray(o, o + n); o += n; return b; } };
  assert.deepEqual(await W.readControl(sr), { type: W.T_AVATAR, avatars: [[3, 0xa31002a0], [255, 0xc0000000]] });
});
