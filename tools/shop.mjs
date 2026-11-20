#!/usr/bin/env node
// Fireplace's shop on Elo Pros, opened and later moved to the coin (docs/coin.md).
// Elo Pros reads elo.json from main, so committing it is the switch; the shop
// is written from client/shop.mjs and coin/shop.json, which this keeps.
//   node tools/shop.mjs                       the shop as it stands: what is for sale and at what price
//   node tools/shop.mjs --payer <wallet> --write
//       open it, priced in PROS: the wallet that is paid and that mints are owed from.
//       Not before the Fireplace Items collection exists (deploy/solana-items in
//       Elo Pros), or a buyer pays for what can't be delivered
//   node tools/shop.mjs --coin <mint> --cap <n> [--symbol FIRE] --write
//       the coin's landing day, once it is on record: every price in days of the
//       daily pot's per-player cap n (whole coins), the way oneshot's skins were set
// Without --write it prints and changes nothing.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { FILE, SHOP as SHOP_FILE, readShop, withGenerated } from './elo.mjs';
import { SHOP, TIERS, economy, shopProblems, priceOf } from '../client/shop.mjs';
import { isMain } from './main.mjs';

// the table, one row to an item, in what it costs now
export function table(shop) {
  const coin = shop.coin ? { coin: shop.coin, cap: shop.cap } : null;
  const unit = coin ? (shop.symbol || 'FIRE') : 'PROS';
  return SHOP.map((x) => `  ${x.key.padEnd(9)} ${x.kind.padEnd(4)} ${String(priceOf(x, coin || {})).replace(/\B(?=(\d{3})+$)/g, ',').padStart(10)} ${unit}   (${x.marshmallows} marshmallows, ${TIERS[x.tier].days} days of a cap)`).join('\n');
}

// coin/shop.json after the flags: what was said replaces, the rest is kept
export function next(was, argv) {
  const opt = (k) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : undefined; };
  const out = { ...was };
  if (opt('payer')) out.payer = opt('payer');
  if (opt('coin')) {
    out.coin = opt('coin');
    out.cap = Number(opt('cap'));
    if (opt('symbol')) out.symbol = opt('symbol');
  }
  return out;
}

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  try {
    const shop = next(readShop(), argv);
    const bad = shopProblems(shop);
    if (bad.length) throw new Error(`coin/shop.json would be wrong: ${bad.join('; ')}`);
    if (shop.coin && !shop.payer) throw new Error('the coin needs the shop open first: --payer <wallet>');
    console.log(shop.payer ? `the shop is open${shop.coin ? ` in ${shop.symbol || 'FIRE'} (${shop.coin}), a cap of ${shop.cap} a day` : ', in PROS'}, paid to ${shop.payer}` : 'the shop is dark: no wallet is named to be paid (--payer)');
    console.log(table(shop));
    if (!argv.includes('--write')) { console.log('\nThat is what it would be. To write it: the same command with --write'); process.exit(0); }
    mkdirSync(dirname(SHOP_FILE), { recursive: true });
    writeFileSync(SHOP_FILE, JSON.stringify(shop, null, 2) + '\n');
    const made = withGenerated(JSON.parse(readFileSync(FILE, 'utf8')), undefined, undefined, shop);
    writeFileSync(FILE, JSON.stringify(made, null, 2) + '\n');
    console.log(`\ncoin/shop.json and elo.json written${economy(shop) ? '' : ' (no economy: no payer)'}. Commit them to main to switch it.`);
  } catch (e) {
    console.error(e.message || e);
    process.exit(1);
  }
}
