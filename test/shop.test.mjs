// Fireplace's shop on Elo Pros (client/shop.mjs, docs/coin.md): the thirteen
// priced looks as owned items, what they cost, the badge bits that tell a page
// what a wallet owns, the economy block in elo.json and the tool that moves it
// to the coin. All of it is outside the sim and its hashes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { BALLS, HATS, BODIES, lookId, isOpen, wearable, packLook } from '../client/looks.mjs';
import { eloStats } from '../client/achievements.mjs';
import { SHOP, TIERS, SLUG, priceOf, economy, shopProblems, isWallet, ownedLooks } from '../client/shop.mjs';
import { openSet, emptyPurse } from '../client/purse.mjs';
import { emptyTally } from '../client/achievements.mjs';
import { withGenerated, readShop } from '../tools/elo.mjs';
import { next, table } from '../tools/shop.mjs';
import * as Elo from '../net/elo.mjs';
import * as W from '../net/wire.mjs';

const PAYER = 'D29z38je9jFaWYQXBLVK71QKbiyLb1QKmbibhyrECWun', MINT = '9SghtAqLvMmCdgJAqtGP8nPM5p7hqcpr5exL9YWLpump';
const priced = [...BALLS, ...HATS, ...BODIES].filter((x) => x.price);

test('every priced look is an item, once, in the order the badge bits keep', () => {
  assert.equal(SHOP.length, 13);
  assert.deepEqual(SHOP.map((x) => x.key).sort(), priced.map((x) => x.key).sort(), 'a look gets a price, or loses it, and the shop follows');
  assert.deepEqual(SHOP.map((x) => x.key), W.BADGE_ITEMS, 'BADGE_ITEMS is the shop\'s order: a key\'s bit never moves');
  assert.equal(new Set(W.BADGE_ITEMS).size, W.BADGE_ITEMS.length);
  assert.equal(W.BADGE_ITEMS.length, 13);
  assert.ok(1 + W.BADGE_ITEMS.length <= 31, 'a badge word is 32 bits and the Pill has bit 0');
  assert.equal(W.BADGE_PILL & W.BADGE_ITEM_MASK, 0, 'the Pill is not an item\'s bit');
  for (const x of SHOP) {
    assert.equal(x.id, lookId(priced.find((l) => l.key === x.key)), x.key);
    assert.equal(x.marshmallows, priced.find((l) => l.key === x.key).price);
  }
});

test('an item\'s key and name pass Elo Pros\' item rules, and name nothing that is measured', () => {
  const taken = new Set(Object.values(eloStats()).flatMap((l) => (Array.isArray(l) ? l : [])).map((r) => String(r.id || '').toLowerCase().replace(/-/g, '_')));
  for (const x of SHOP) {
    assert.match(x.key, /^[a-z0-9][a-z0-9-]{0,31}$/, 'the collection\'s key (deploy/solana-items lib/sheet.mjs)');
    assert.match(x.key, /^[a-z0-9][a-z0-9_-]{0,39}$/, 'the economy\'s id (meter/game_economy.py)');
    assert.ok(x.name.length >= 1 && x.name.length <= 32, `${x.key}: a Metaplex name is 32 characters at most`);
    assert.ok(!taken.has(x.key.replace(/-/g, '_')), `${x.key}: an item id that names an achievement, stat, board or challenge is refused`);
    assert.ok(x.name === x.name.replace(/(^|\s)\S/g, (c) => c.toUpperCase()).replace(/(?<=\S)([A-Z])/g, (c) => c.toLowerCase()), `${x.key}: ${x.name} is in title case`);
  }
  assert.deepEqual(SHOP.map((x) => x.name), ['Bumblebee', 'Soccer Ball', 'Ladybird', 'Checkers', 'Peppermint', 'Disco Ball', 'Party Hat', 'Headphones', 'Top Hat', 'Antlers', 'Propeller Cap', 'Halo', 'Gold Robot']);
});

test('the price ladder: five tiers, dearer as the marshmallow price is, in PROS now and in days of a cap with the coin', () => {
  assert.equal(TIERS.length, 5);
  for (const [k, t] of TIERS.entries()) {
    if (k) assert.ok(t.pros > TIERS[k - 1].pros && t.days > TIERS[k - 1].days, `tier ${k} costs more than the one before`);
    assert.ok(Number.isSafeInteger(t.pros) && t.pros >= 1 && t.pros <= 10 ** 12 && Number.isSafeInteger(t.days), `tier ${k}`);
  }
  const bySellPrice = [...SHOP].sort((a, b) => a.marshmallows - b.marshmallows);
  bySellPrice.forEach((x, i) => { if (i) assert.ok(x.tier >= bySellPrice[i - 1].tier, `${x.key} (${x.marshmallows}) is no cheaper than ${bySellPrice[i - 1].key} (${bySellPrice[i - 1].marshmallows})`); });
  for (const x of SHOP) assert.ok(TIERS[x.tier], x.key);
  assert.deepEqual(SHOP.map((x) => priceOf(x)).filter((p, i, a) => a.indexOf(p) === i).sort((a, b) => a - b), TIERS.map((t) => t.pros), 'every tier is used');
  const goldbot = SHOP.find((x) => x.key === 'goldbot'), bee = SHOP.find((x) => x.key === 'bee');
  assert.equal(priceOf(bee, { coin: MINT, cap: 5000 }), 10_000, 'gear is two days of a maxed pot');
  assert.equal(priceOf(goldbot, { coin: MINT, cap: 5000 }), 100_000, 'the top item is twenty');
  assert.equal(priceOf(bee), 50_000);
});

test('coin/shop.json: what is a good one, and the economy block each gives', () => {
  assert.equal(economy({}), null, 'no wallet to be paid, no shop: nothing is sold that cannot be delivered');
  assert.equal(economy({ coin: MINT, cap: 5000 }), null, 'a coin with no wallet to be paid is still dark');
  const bad = (s, why) => assert.ok(shopProblems(s).some((p) => p.startsWith(why)), `${JSON.stringify(s)}: ${shopProblems(s)}`);
  bad({ payer: '0x' + '11'.repeat(20) }, 'payer');
  bad({ payer: 'nope' }, 'payer');
  bad({ payer: PAYER, coin: 'FIREPLACE', cap: 5 }, 'coin');
  bad({ payer: PAYER, coin: MINT }, 'cap');
  bad({ payer: PAYER, coin: MINT, cap: 0 }, 'cap');
  bad({ payer: PAYER, coin: MINT, cap: 5.5 }, 'cap');
  bad({ payer: PAYER, coin: MINT, cap: 5, symbol: '$FIRE' }, 'symbol');
  bad({ payer: PAYER, cap: 5 }, 'cap and symbol');
  bad({ payer: PAYER, wallet: PAYER }, 'wallet');
  assert.throws(() => economy({ payer: 'x' }), /coin\/shop\.json: payer/);
  assert.deepEqual(shopProblems({}), []);
  assert.ok(isWallet(PAYER) && isWallet(MINT) && !isWallet(PAYER.slice(1)) && !isWallet('1'.repeat(40)));

  const pros = economy({ payer: PAYER });
  assert.deepEqual({ ...pros, items: undefined }, { currency: { name: 'PROS', symbol: 'PROS' }, mode: 'real', coin: 'reserve', chain: 'solana', payer: PAYER, items: undefined });
  assert.equal(pros.items.length, 13);
  const coin = economy({ payer: PAYER, coin: MINT, cap: 5000, symbol: 'FIREPLACE' });
  assert.deepEqual({ ...coin, items: undefined }, { currency: { name: 'FIREPLACE', symbol: 'FIREPLACE' }, mode: 'real', coin: MINT, chain: 'solana', payer: PAYER, items: undefined });
  // the rows, as meter/game_economy.py validate_items takes them
  for (const e of [pros, coin]) {
    assert.ok(e.items.length <= 100);
    for (const it of e.items) {
      assert.deepEqual(Object.keys(it), ['id', 'name', 'kind', 'price', 'nft']);
      assert.equal(it.kind, 'pass', 'a look is owned once');
      assert.equal(it.nft, it.id, 'the item\'s key in the Fireplace Items collection is its id');
      assert.ok(Number.isInteger(it.price) && it.price >= 1 && it.price <= 10 ** 12, it.id);
      assert.ok(it.name.length <= 60 && !/[<>]/.test(it.name));
    }
  }
  assert.deepEqual(pros.items.map((i) => i.price), SHOP.map((x) => TIERS[x.tier].pros));
  assert.deepEqual(coin.items.map((i) => i.price), SHOP.map((x) => TIERS[x.tier].days * 5000));
});

test("elo.json: the shop is Fireplace's own, generated, dark until a wallet is named, and never in a copy", () => {
  const was = JSON.parse(readFileSync('elo.json', 'utf8'));
  const shop = readShop();
  assert.deepEqual(was.economy ?? null, economy(shop), 'elo.json\'s economy is the shop\'s (node tools/elo.mjs writes it)');
  const base = { elo: 1, game: SLUG, stats: {}, mods: [] };
  const open = withGenerated(base, [], [], { payer: PAYER });
  assert.equal(open.economy.payer, PAYER);
  assert.equal(open.economy.items.length, 13);
  assert.equal(withGenerated({ ...base, economy: { mode: 'paper' } }, [], [], {}).economy, undefined, 'a hand-written economy on Fireplace\'s own goes: the shop is the one writer');
  assert.equal(withGenerated({ ...base, game: 'my-game' }, [], [], { payer: PAYER }).economy, undefined, 'a copy made from this template sells nothing');
  assert.deepEqual(withGenerated({ ...base, game: 'my-game', economy: { mode: 'paper' } }, [], [], {}).economy, { mode: 'paper' }, 'and keeps what it wrote itself');
  assert.deepEqual(withGenerated(open, [], [], { payer: PAYER }), open, 'again changes nothing');
});

test('tools/shop.mjs: the table, and what each flag changes in coin/shop.json', () => {
  assert.deepEqual(next({}, ['--payer', PAYER]), { payer: PAYER });
  assert.deepEqual(next({ payer: PAYER }, ['--coin', MINT, '--cap', '5000']), { payer: PAYER, coin: MINT, cap: 5000 });
  assert.deepEqual(next({ payer: PAYER }, ['--coin', MINT, '--cap', '5000', '--symbol', 'FIREPLACE']), { payer: PAYER, coin: MINT, cap: 5000, symbol: 'FIREPLACE' });
  assert.deepEqual(next({ payer: PAYER, coin: MINT, cap: 5000 }, []), { payer: PAYER, coin: MINT, cap: 5000 }, 'no flag, no change');
  assert.ok(shopProblems(next({ payer: PAYER }, ['--coin', MINT])).some((p) => p.startsWith('cap')), 'the cap is not guessed');
  const t = table({ payer: PAYER });
  assert.equal(t.split('\n').length, 13);
  assert.match(t, /goldbot\s+body\s+1,000,000 PROS/);
  assert.match(table({ payer: PAYER, coin: MINT, cap: 5000, symbol: 'FIREPLACE' }), /goldbot\s+body\s+100,000 FIREPLACE/);
});

test('a wallet\'s items become badge bits, and the page opens the looks they name', () => {
  const rows = (...r) => ({ items: r.map(([title, item]) => ({ title, item })) });
  assert.equal(Elo.badgesOf(rows(['fireplace', 'bee']), 'fireplace'), 2);
  assert.equal(Elo.badgesOf(rows(['fireplace', 'goldbot']), 'fireplace'), 2 << 12);
  assert.equal(Elo.badgesOf(rows(['fireplace', 'pill'], ['FIREPLACE', 'halo'], ['fireplace', 'disco']), 'fireplace'), W.BADGE_PILL | (2 << 11) | (2 << 5));
  assert.equal(Elo.badgesOf(rows(['oneshot', 'bee'], ['gates', 'pill'], ['fireplace', 'ember']), 'fireplace'), 0, 'another title\'s, or a key this build has no bit for');
  assert.equal(Elo.badgesOf(rows(['fireplace', 'bee'], ['fireplace', 'bee']), 'fireplace'), 2, 'twice is once');
  assert.equal(Elo.badgesOf(null, 'fireplace'), 0);
  for (const k of W.BADGE_ITEMS.keys()) assert.ok((Elo.badgesOf(rows(['fireplace', W.BADGE_ITEMS[k]]), 'fireplace') >>> 0) < 2 ** 14);

  const word = Elo.badgesOf(rows(['fireplace', 'pill'], ['fireplace', 'tophat'], ['fireplace', 'ladybird'], ['fireplace', 'goldbot']), 'fireplace');
  assert.deepEqual(ownedLooks(word).sort(), ['ball:ladybird', 'body:goldbot', 'hat:tophat']);
  assert.deepEqual(ownedLooks(W.BADGE_PILL), [], 'the Pill is a badge, not a look');
  assert.deepEqual(ownedLooks(0), []);
  // what the page does with them: a priced look opens, an earned one doesn't, and a saved look comes back
  const tally = emptyTally(), purse = emptyPurse();
  const shut = openSet(tally, purse), got = openSet(tally, purse, ownedLooks(word));
  const ball = BALLS.findIndex((x) => x.key === 'ladybird'), hat = HATS.findIndex((x) => x.key === 'tophat'), body = BODIES.findIndex((x) => x.key === 'goldbot');
  assert.ok(!isOpen(BALLS[ball], shut) && isOpen(BALLS[ball], got));
  assert.ok(!isOpen(BALLS.find((x) => x.key === 'bee'), got), 'only what the wallet owns');
  assert.ok(!isOpen(BALLS.find((x) => x.key === 'gold'), got), 'an earned look is the achievement\'s, never an item\'s');
  const saved = packLook(ball, hat, body);
  assert.equal(wearable(saved, shut), 0, 'before it signs in a page can\'t wear it');
  assert.equal(wearable(saved, got), saved, 'once it has, the saved look is back');
  assert.deepEqual([...openSet(tally, purse)], [], 'and with no owned list, the open set is what it was');
});

// a JPEG's size is its frame's (SOF0 to SOF15, less the three that are tables)
function jpegSize(file) {
  const b = readFileSync(file);
  assert.equal(b.readUInt16BE(0), 0xffd8, `${file} is a JPEG`);
  for (let i = 2; i < b.length - 9;) {
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + b.readUInt16BE(i + 2);
  }
  throw new Error(`${file}: no frame`);
}

test('every item has its picture, 512 px, and the collection one of 1024: what a wallet shows', async () => {
  const { SIZE, collectionHtml } = await import('../tools/shop-shots.mjs');
  for (const x of SHOP) assert.deepEqual(jpegSize(`coin/art/items/${x.key}.jpg`), [SIZE, SIZE], x.key);
  assert.deepEqual(jpegSize('coin/art/items/collection.jpg'), [1024, 1024]);
  const html = collectionHtml('/x');
  for (const x of SHOP) assert.ok(html.includes(`/x/${x.key}.jpg`), `${x.key} is on the collection's picture`);
  assert.ok(!existsSync('coin/art/items/collection.html'), 'the page it is shot from is not kept');
});
