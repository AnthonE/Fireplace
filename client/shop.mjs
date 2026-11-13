// Fireplace's shop on Elo Pros (docs/coin.md): the looks and dress pieces that
// marshmallows buy (client/looks.mjs and client/dress.mjs `price`) are also sold as owned items, one
// NFT each in the Fireplace Items collection, so a purchase follows the wallet
// to any browser and can be sold on. Marshmallows still buy a look into this
// browser's purse as they always did; the two are separate doors to the same
// look, and no rate between them is posted.
//
// An item's key is its look's key (the collection's key for it and the
// economy's id), and its place in net/wire.mjs BADGE_ITEMS is its bit in a
// badge word: that is how the page learns what a signed-in wallet owns, from
// the relay, which read it off Elo Pros. A look owned that way opens like a
// bought one (purse.mjs openSet), and nothing else changes: it is drawing only.
//
// The price is one table, by tier. In PROS until the game's coin is on record
// (a tier's `pros`), then in days of the daily pot's per-player cap, the way
// oneshot's skins were set (a tier's `days`, times `cap`; tools/skins_in_coin.mjs
// switches it). The tiers are a proposal to edit, and the shop stays dark
// until coin/shop.json names the wallet that is paid (tools/elo.mjs).
import { BALLS, HATS, BODIES, lookId } from './looks.mjs';
import { FACES, SHIRTS, BACKS } from './dress.mjs';
import { BADGE_ITEMS, BADGE_ITEM_MASK } from '../net/wire.mjs';

export const SLUG = 'fireplace';
export const TIERS = [
  { pros: 50_000, days: 2 },
  { pros: 100_000, days: 4 },
  { pros: 250_000, days: 10 },
  { pros: 500_000, days: 15 },
  { pros: 1_000_000, days: 20 },
];
// a piece's tier, by its key: the marshmallow price's order, in five steps
const TIER = {
  bee: 0, soccer: 0, cone: 0, ladybird: 0, phones: 0, checker: 1, tophat: 1, antlers: 1, mint: 1, prop: 2, halo: 2, disco: 3, goldbot: 4,
  cool: 0, wink: 0, oh: 0, cat: 1, stars: 2, stripes: 0, check: 0, chevrons: 1, heart: 1, star: 1, pack: 1, cape: 2, jet: 3,
};

const KINDS = [[BALLS, 'ball'], [HATS, 'hat'], [BODIES, 'body'], [FACES, 'face'], [SHIRTS, 'shirt'], [BACKS, 'back']];
const title = (s) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

// what is for sale: every priced look and dress piece, in the order BADGE_ITEMS keeps
export const SHOP = KINDS.flatMap(([list, kind]) => list.filter((x) => x.price).map((x) => ({
  key: x.key, id: lookId(x), kind, name: title(x.name), marshmallows: x.price, tier: TIER[x.key],
}))).sort((a, b) => BADGE_ITEMS.indexOf(a.key) - BADGE_ITEMS.indexOf(b.key));

// what an item costs: whole PROS, or with a coin and the daily cap (whole coins a player can earn in a UTC day) days of it
export const priceOf = (item, { coin = null, cap = 0 } = {}) => (coin ? TIERS[item.tier].days * cap : TIERS[item.tier].pros);

// a Solana address: base58 of 32 bytes (a leading 1 is a zero byte)
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function isWallet(s) {
  if (typeof s !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s)) return false;
  let n = 0n;
  for (const ch of s) n = n * 58n + BigInt(B58.indexOf(ch));
  let bytes = 0;
  for (; n > 0n; n >>= 8n) bytes++;
  for (const ch of s) { if (ch !== '1') break; bytes++; }
  return bytes === 32;
}

// What is wrong with coin/shop.json, in plain words: { payer, coin, cap, symbol }, each optional.
// The payer is the wallet that is paid and that mints are owed from; the coin and the cap come on landing day.
export function shopProblems(shop) {
  const out = [], s = shop || {};
  if (typeof s !== 'object' || Array.isArray(s)) return ['coin/shop.json is an object'];
  for (const k of Object.keys(s)) if (!['payer', 'coin', 'cap', 'symbol'].includes(k)) out.push(`${k} is not a field of coin/shop.json (payer, coin, cap, symbol)`);
  if (s.payer !== undefined && !isWallet(s.payer)) out.push('payer is the Solana wallet the shop is paid to');
  if (s.coin !== undefined) {
    if (!isWallet(s.coin)) out.push('coin is the game\'s coin, its mint, a Solana address');
    if (!Number.isSafeInteger(s.cap) || s.cap < 1) out.push('cap is the whole coins a player can earn in a UTC day, 1 or more: the coin\'s prices are days of it');
    if (s.symbol !== undefined && !/^[A-Z0-9]{2,10}$/.test(s.symbol)) out.push('symbol is the coin\'s ticker, bare capitals');
  } else if (s.cap !== undefined || s.symbol !== undefined) out.push('cap and symbol come with the coin');
  return out;
}

// elo.json's economy block (scry-forge meter/game_economy.py): every item a
// pass, owned once, paid to `payer`. shop is coin/shop.json: { payer, coin, cap }.
// Null while no wallet is named to be paid, so nothing is sold that cannot be delivered.
export function economy(shop = {}) {
  const bad = shopProblems(shop);
  if (bad.length) throw new Error(`coin/shop.json: ${bad.join('; ')}`);
  if (!shop.payer) return null;
  const coin = shop.coin ? { coin: shop.coin, cap: shop.cap } : null;
  const symbol = shop.symbol || 'FIREPLACE';
  return {
    currency: coin ? { name: symbol, symbol } : { name: 'PROS', symbol: 'PROS' },
    mode: 'real',
    coin: coin ? shop.coin : 'reserve',
    chain: 'solana',
    payer: shop.payer,
    items: SHOP.map((x) => ({ id: x.key, name: x.name, kind: 'pass', price: priceOf(x, coin || {}), nft: x.key })),
  };
}

// the look ids a badge word's item bits name: what a signed-in wallet owns, for purse.mjs openSet
export const ownedLooks = (badges) => SHOP.filter((x) => (badges >>> 0) & (2 << BADGE_ITEMS.indexOf(x.key))).map((x) => x.id);
export { BADGE_ITEM_MASK };
