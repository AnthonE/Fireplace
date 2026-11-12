// The purse (client/purse.mjs): marshmallows as money. What a browser has
// won is its tally's (client/achievements.mjs), which only grows; what it
// spent and bought is the purse's. Pure functions, so no browser here: the
// storage is a stand-in, or missing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyPurse, balance, owns, buy, openSet, loadPurse, savePurse, freshPurse } from '../client/purse.mjs';
import { emptyTally, record, byId } from '../client/achievements.mjs';
import { BALLS, HATS, BODIES, lookId, isOpen, wearable, nextOpen, packLook } from '../client/looks.mjs';
import * as L from '../src/layout.mjs';

// a game's result as the page reads it: place 1 to 3 gets 3, 2 and 1
const result = (k, place) => ({ key: `1:${k}:${L.G_PARTY}`, game: L.G_PARTY, place, got: Math.max(0, 4 - place), field: 8 });
const play = (tally, places, from = 0) => places.reduce((t, place, k) => record(t, result(from + k, place), 1000).tally, tally);
// localStorage's two calls over a Map
const storeOf = (m = new Map()) => ({ getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, m });
const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };

test('earning: the balance is the tally\'s marshmallows until something is bought', () => {
  let t = emptyTally();
  const p = emptyPurse();
  assert.equal(balance(t, p), 0);
  t = play(t, [1, 2, 3, 5]);
  assert.equal(t.mallows, 6);
  assert.equal(balance(t, p), 6);
  // the same end seen twice counts once, for the purse as for the tally
  assert.equal(balance(record(t, result(3, 5), 0).tally, p), 6);
});

test('spending: a buy takes its price, keeps the look, and leaves the tally and the old purse as they were', () => {
  const t = play(emptyTally(), Array(10).fill(1)); // 30
  const before = JSON.stringify(t);
  const p0 = emptyPurse();
  const r = buy(t, p0, 'hat:tophat', 25, 5000);
  assert.equal(r.ok, true);
  assert.equal(r.short, 0);
  assert.equal(balance(t, r.purse), 5);
  assert.ok(owns(r.purse, 'hat:tophat'));
  assert.equal(r.purse.owned['hat:tophat'], 5);
  assert.deepEqual(p0, emptyPurse(), 'the purse passed in is not changed');
  assert.equal(JSON.stringify(t), before, 'buying never touches the tally');
  // owned stays owned, and costs nothing a second time
  const again = buy(t, r.purse, 'hat:tophat', 25);
  assert.equal(again.ok, true);
  assert.equal(again.purse, r.purse);
  assert.equal(balance(t, again.purse), 5);
  // and what is left buys something it reaches
  const bee = buy(t, r.purse, 'ball:bee', 5);
  assert.equal(bee.ok, true);
  assert.equal(balance(t, bee.purse), 0);
  assert.deepEqual(Object.keys(bee.purse.owned), ['hat:tophat', 'ball:bee']);
});

test('no overspending: a price past the balance buys nothing and says how many more it takes', () => {
  const t = play(emptyTally(), [1, 1, 2]); // 8
  const p = buy(t, emptyPurse(), 'ball:bee', 5).purse; // 3 left
  const r = buy(t, p, 'hat:cone', 10);
  assert.equal(r.ok, false);
  assert.equal(r.short, 7);
  assert.equal(r.purse, p);
  assert.equal(balance(t, p), 3);
  assert.equal(owns(p, 'hat:cone'), false);
  // exactly enough is enough
  assert.equal(buy(t, p, 'x:three', 3).ok, true);
  assert.equal(buy(t, p, 'x:four', 4).ok, false);
  // a price that is no price buys nothing
  for (const bad of [0, -5, 1.5, NaN, Infinity, undefined, '5']) assert.equal(buy(t, p, 'x:bad', bad).ok, false, String(bad));
  // a purse that spent more than a tally holds (the tally cleared, the purse not) is empty, not in debt
  assert.equal(balance(emptyTally(), p), 0);
  assert.equal(buy(emptyTally(), p, 'x:one', 1).ok, false);
});

test('the lifetime total: what the achievements and the board read is the same after buying', () => {
  let t = play(emptyTally(), Array(9).fill(1)); // 27: A BAG OF THEM
  assert.ok(t.got.bag);
  const p = buy(t, emptyPurse(), 'hat:tophat', 25).purse;
  assert.equal(t.mallows, 27);
  assert.ok(byId.get('bag').test(t), 'still a bag of them with 2 left to spend');
  assert.deepEqual(byId.get('campfire').have(t), [27, 100]);
  // and the next games count on from the lifetime total, not the balance
  t = play(t, Array(25).fill(1), 9);
  assert.equal(t.mallows, 102);
  assert.ok(t.got.campfire, '100 in all, though 25 were spent');
  assert.equal(balance(t, p), 77);
});

test('what a browser holds is one set: the achievements it opened and the looks it bought', () => {
  const t = play(emptyTally(), Array(10).fill(1));
  const p = buy(t, emptyPurse(), 'hat:tophat', 25).purse;
  const got = openSet(t, p);
  assert.ok(got.has('golden') && got.has('hat:tophat'));
  assert.equal(got.has('hat:halo'), false);
  for (const id of Object.keys(t.got)) assert.ok(!id.includes(':'), `${id}: an achievement's id has no colon, a look's has one`);
});

test('every priced look: shut until bought, then open; the keys skip it and a saved word loses it without the purse', () => {
  const lists = [[BALLS, 0], [HATS, 8], [BODIES, 16]];
  const rich = { ...emptyTally(), mallows: 100000 };
  let p = emptyPurse(), n = 0, sum = 0;
  for (const [list, shift] of lists) for (let k = 0; k < list.length; k++) {
    const x = list[k];
    if (!x.price) continue;
    n++; sum += x.price;
    const none = openSet(emptyTally(), emptyPurse());
    assert.equal(isOpen(x, none), false, x.key);
    assert.equal(wearable((k << shift) >>> 0, none), 0, `${x.key} comes off`);
    for (let j = 0; j < list.length; j++) assert.notEqual(nextOpen(list, j, none), k, `${x.key}: the key skips it`);
    // an achievement of the same name opens nothing priced
    assert.equal(isOpen(x, new Set([x.key])), false);
    const r = buy(rich, p, lookId(x), x.price);
    assert.ok(r.ok);
    p = r.purse;
    const got = openSet(emptyTally(), p);
    assert.equal(isOpen(x, got), true);
    assert.equal(wearable((k << shift) >>> 0, got), (k << shift) >>> 0);
    assert.equal(nextOpen(list, (k + list.length - 1) % list.length, got), k);
  }
  assert.ok(n >= 10, `${n} priced looks`);
  assert.equal(p.spent, sum);
  assert.equal(balance(rich, p), 100000 - sum);
  // a look worn whole from the shop
  const w = packLook(BALLS.findIndex((b) => b.key === 'disco'), HATS.findIndex((h) => h.key === 'halo'), BODIES.findIndex((b) => b.key === 'goldbot'));
  assert.equal(wearable(w, openSet(emptyTally(), p)), w);
  assert.equal(wearable(w, openSet(emptyTally(), emptyPurse())), 0);
});

test('kept in the browser: a purse comes back from storage as it went in, and rubbish there is an empty purse', () => {
  const store = storeOf();
  const t = play(emptyTally(), Array(10).fill(1));
  const p = buy(t, emptyPurse(), 'hat:tophat', 25, 9000).purse;
  assert.equal(savePurse(p, store), true);
  assert.deepEqual([...store.m.keys()], ['fireplace.purse']);
  assert.deepEqual(loadPurse(store), p);
  assert.deepEqual(loadPurse(storeOf()), emptyPurse(), 'nothing kept yet');
  for (const junk of ['', 'not json', 'null', '[]', '7', '{"v":2,"spent":5,"owned":{}}', '{"v":1,"spent":-5,"owned":{}}', '{"v":1,"spent":1.5,"owned":{}}', '{"v":1,"spent":"5","owned":{}}', '{"v":1,"spent":5}', '{"v":1,"spent":5,"owned":[]}']) {
    assert.deepEqual(loadPurse(storeOf(new Map([['fireplace.purse', junk]]))), emptyPurse(), junk);
  }
  // another tab bought since this one read: the purse as storage has it now
  const mine = emptyPurse();
  assert.deepEqual(freshPurse(mine, store), p);
  assert.equal(freshPurse(mine, storeOf()), mine, 'nothing kept: the one in hand');
});

test('storage missing or refused: the page still has a purse, for the visit', () => {
  for (const store of [null, undefined, broken, {}]) {
    assert.deepEqual(loadPurse(store), emptyPurse());
    const t = play(emptyTally(), [1, 1]);
    const r = buy(t, loadPurse(store), 'ball:bee', 5);
    assert.ok(r.ok);
    assert.equal(savePurse(r.purse, store), false);
    assert.equal(freshPurse(r.purse, store), r.purse, 'what was bought this visit is not lost to a reload that reads nothing');
    assert.equal(balance(t, r.purse), 1);
  }
  // and with no localStorage at all (Node has none), the defaults do the same
  assert.deepEqual(loadPurse(), emptyPurse());
  assert.equal(savePurse(emptyPurse()), false);
});
