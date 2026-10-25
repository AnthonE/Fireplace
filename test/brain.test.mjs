import test from 'node:test';
import assert from 'node:assert/strict';
import { wasmBytes } from './helpers.mjs';
import { Brain, encode, decode, weights, features, MAX_MUTATIONS, NW, TWEET, GOLFER } from '../client/brain.mjs';
import { playHoles } from '../tools/gengame.mjs';
import { replay, parseLog, decodeTrace } from '../harness/core.mjs';
import * as L from '../src/layout.mjs';

const G = { base: 0xc0ffee, muts: [1, 0x4001, 0x8002, 0xc003, 0xffff] };

test('a genome is a few characters, and the longest still fits in a tweet', () => {
  assert.equal(encode(G), 'qg2:7v_AAAEAAUACgAPA__8');
  assert.deepEqual(decode(encode(G)), G);
  assert.deepEqual(decode(encode({ base: 7, muts: [] })), { base: 7, muts: [] });
  const full = encode({ base: 0xffffffff, muts: Array(MAX_MUTATIONS).fill(0xffff) });
  assert.ok(full.length <= TWEET, `${full.length} chars`);
  assert.ok(encode({ base: 0, muts: Array(MAX_MUTATIONS + 1).fill(0) }).length > TWEET, 'and one more does not');
  assert.throws(() => decode('hello'), /qg2:/);
  assert.throws(() => decode('qg1:AAAAAA'), /f64 brain/);
  assert.throws(() => decode('qg2:AAAAAAA'), /4 \+ 2n bytes, this one is 5/);
});

test('the recipe rebuilds the same weights bit for bit', () => {
  const w = weights(G);
  assert.equal(w.length, NW);
  let h = 0x811c9dc5;
  for (const x of new Uint8Array(w.buffer)) { h ^= x; h = Math.imul(h, 0x01000193) >>> 0; }
  // f32 + - * / only: every engine gets this hash
  assert.equal(h.toString(16), 'ffac99fb');
  assert.deepEqual(weights(decode(encode(G))), w);
  assert.notDeepEqual(weights({ ...G, muts: G.muts.slice(0, 4) }), w, 'each mutation moves the weights');
});

test('the brain answers inside the bot\'s range of shots', async () => {
  const { view: v } = await playHoles({ bytes: wasmBytes(), bots: 1, ticks: 400 });
  const f = features(v, v.ball(v.player(0).ball).pos, v.hole().cup);
  assert.equal(f.length, 14);
  assert.equal(f[2] + f[3] + f[4] + f[5], 1, 'one lie');
  for (let b = 0; b < 50; b++) {
    const { dh, turn } = new Brain({ base: b, muts: [] }).decide(f);
    assert.ok(dh >= 0.3 && dh <= 4.8, `dh ${dh}`);
    assert.ok(Math.abs(turn) <= 6 * Math.PI / 180 + 1e-12, `turn ${turn}`);
  }
});

test('the bred golfer plays a real hole on the bot\'s legs, and the game replays', async () => {
  const bytes = wasmBytes();
  const r = await playHoles({ bytes, bots: 1, ticks: 6000, genome: GOLFER, until: (v) => v.player(0).strokes >= 2 });
  assert.ok(r.view.player(0).strokes >= 2, 'it walked to its ball and shot twice');
  assert.equal(r.view.hole().state, L.H_PLAY);
  const tr = decodeTrace((await replay({ bytes, log: parseLog(r.log), ticks: r.ticks, tag: 'brain' })).trace);
  assert.equal(tr.tickHashes[r.ticks - 1], r.hash);
});
