// Fireplace's coin, before it exists (docs/coin.md): the sheet the create form
// is typed from, held to the form's rules and ours; its pictures, the size
// pump.fun takes each at; and the doc, which quotes what is welded. A coin is
// outside every sim and hash: nothing here builds or steps one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIR, SHEET, SIZES, DRAFTS, problems, pixelText, bannerHtml, postHtml } from '../tools/coin.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sheet = JSON.parse(readFileSync(SHEET, 'utf8'));

// a PNG's size is its header's; a JPEG's is its frame's (SOF0 to SOF15, less the three that are tables)
function sizeOf(file) {
  const b = readFileSync(file);
  if (b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  for (let i = 2; i < b.length - 9;) {
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + b.readUInt16BE(i + 2);
  }
  throw new Error(`${file}: neither a PNG nor a JPEG`);
}

test('the sheet is one the create form takes, and each rule refuses what it should', () => {
  assert.deepEqual(problems(sheet), []);
  const bad = (change, why) => assert.ok(problems({ ...sheet, ...change }).some((p) => p.startsWith(why)), `${JSON.stringify(change)}: ${problems({ ...sheet, ...change })}`);
  bad({ name: '' }, 'name');
  bad({ name: 'x'.repeat(33) }, 'name');
  bad({ symbol: '$FIREPLACE' }, 'symbol'); // tickers are bare
  bad({ symbol: 'fireplace' }, 'symbol');
  bad({ symbol: 'FIREPLACES1' }, 'symbol'); // 11: the form takes it, the daily pot's rule does not
  bad({ description: 'x'.repeat(1001) }, 'description');
  bad({ description: 'The house bought 10% in the create.' }, 'description names no figure');
  bad({ description: 'A pot of 100,000 a day.' }, 'description names no figure');
  bad({ image: 'art/fireplace-coin.svg' }, 'image');
  bad({ links: { website: 'http://elopros.com' } }, 'links.website');
  bad({ links: { discord: 'https://discord.gg/x' } }, 'links takes');
  bad({ mayhem_mode: true }, 'mayhem_mode');
  bad({ buy_tokens: 0 }, 'buy_tokens');
  bad({ buy_tokens: 793_100_001 }, 'buy_tokens');
  bad({ creator: '0x' + '11'.repeat(20) }, 'creator');
  bad({ creator: sheet.creator.slice(0, -1) + 'l' }, 'creator'); // l is not base58
  bad({ creator: '1'.repeat(40) }, 'creator'); // 40 bytes, not a key's 32
  bad({ creator_fee_bps: 10_001 }, 'creator_fee_bps');
  assert.deepEqual(problems(null).length > 5, true);
});

test('what the sheet welds is what it should be: the game\'s name, a bare ticker, our links, no mayhem', () => {
  assert.equal(sheet.name, 'Fireplace');
  assert.equal(sheet.symbol, 'FIRE');
  assert.equal(sheet.mayhem_mode, false);
  assert.deepEqual(Object.keys(sheet.links), ['website', 'twitter', 'telegram']);
  assert.ok(sheet.description.includes(`${sheet.symbol} is its coin, paired against PROS`), 'the description says what the coin is');
  assert.ok(sheet.description.endsWith('elopros.com/tokenomics.html'), 'and where the house\'s wallets are listed');
  assert.ok(!sheet.description.includes('pump'), 'the launchpad names itself');
});

test('the pictures are drawn, each at the size pump.fun and a post take', () => {
  const at = (rel) => join(DIR, rel);
  assert.deepEqual(sizeOf(at(sheet.image)), SIZES.coin, sheet.image);
  assert.deepEqual(sizeOf(at(sheet.banner)), SIZES.banner, sheet.banner);
  assert.deepEqual(sizeOf(at('art/fireplace-post.jpg')), SIZES.post);
  const picked = readFileSync(at(sheet.image));
  const drafts = Object.keys(DRAFTS).map((d) => at(`art/fireplace/coin-${d}.png`));
  for (const d of drafts) assert.deepEqual(sizeOf(d), SIZES.coin, d);
  assert.ok(drafts.some((d) => readFileSync(d).equals(picked)), 'the coin\'s picture is one of the drafts, byte for byte');
  assert.deepEqual(Object.keys(DRAFTS).map((d) => d[0]), ['a', 'b', 'c'], '--pick takes a draft by its letter');
});

test('a draft is a 1024 px square with ink to its corners, and the words are the TV\'s font', () => {
  for (const [name, draw] of Object.entries(DRAFTS)) {
    const svg = draw();
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 1024 1024" width="1024" height="1024">/, name);
    assert.ok(svg.includes('<rect width="1024" height="1024" fill="#080a10"/>'), `${name}: the corners, for pump.fun's rounded square`);
    assert.ok(!/gradient|<text|font-family/.test(svg), `${name}: flat colours and no font but the game's`);
  }
  const t = pixelText('Fire', 0, 0, 10, '#fff');
  assert.equal(t.w, (4 * 4 - 1) * 10, 'a character 4 font pixels apart, as on the TV\'s cards');
  assert.equal(pixelText('FIRE', 0, 0, 10, '#fff').svg, t.svg, 'capitals only');
  assert.equal((pixelText('.', 0, 0, 10, '#fff').svg.match(/M/g) || []).length, 1, 'a full stop is one pixel');
  // neither picture carries an amount: a pot changes, a picture in a feed can't
  for (const html of [bannerHtml('room.png'), postHtml('room.png', 'coin.png', sheet)]) assert.ok(!/<text|font-family/.test(html));
});

test('docs/coin.md quotes the sheet: its name, ticker, links and description, word for word', () => {
  const doc = readFileSync(join(ROOT, 'docs/coin.md'), 'utf8');
  const flat = doc.replace(/\n> ?/g, ' ').replace(/\s+/g, ' ');
  assert.ok(flat.includes(sheet.description), 'the description, as a quote');
  assert.ok(doc.includes(`| ⛔ name | \`${sheet.name}\``) && doc.includes(`| ⛔ ticker | \`${sheet.symbol}\``));
  for (const u of Object.values(sheet.links)) assert.ok(doc.includes(u), u);
  assert.ok(doc.includes(sheet.creator), 'and the wallet that creates it');
  assert.ok(!/\$[A-Z]{2,}/.test(doc), 'tickers are bare, never $-prefixed');
  for (const f of [sheet.image, sheet.banner, 'art/fireplace-post.jpg']) assert.ok(doc.includes(`coin/${f}`) && existsSync(join(DIR, f)), f);
});
