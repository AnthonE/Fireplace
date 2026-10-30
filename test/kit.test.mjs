// tools/kit.mjs: the first run in a copy made from this repo as a template.
// init renames what a player or the store sees, resets elo.json to the new
// game, refuses Fireplace's own repo, and a second run changes nothing. It
// runs here on a copy of the files it touches, never on the repo itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { init, plan, slugOf, repoOf, pagesUrl, hostedUrl, CAPSULE } from '../tools/kit.mjs';
import { withGenerated, readMaps } from '../tools/elo.mjs';
import { readThemes } from '../tools/themes.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['elo.json', 'package.json', 'README.md', 'CONTRIBUTING.md', 'client/kit.json', 'client/fireplace.html', 'client/room.html', 'client/themes'];

// the files init touches, as a fresh copy of Fireplace has them (whatever
// this repo is called by now: in a copy, init has already run here)
function copy() {
  const dir = mkdtempSync(join(tmpdir(), 'kit-'));
  for (const f of [...FILES, CAPSULE]) cpSync(join(ROOT, f), join(dir, f), { recursive: true });
  const put = (f, text) => writeFileSync(join(dir, f), text);
  const json = (f, edit) => put(f, JSON.stringify(edit(JSON.parse(readFileSync(join(dir, f), 'utf8'))), null, 2) + '\n');
  json('elo.json', () => ({ elo: 1, game: 'fireplace', jobs: [{ id: 'fireplace-theme', deliverable: 'PR: accepted into AnthonE/Fireplace' }], mods: [] }));
  json('package.json', (p) => ({ ...p, name: 'fireplace' }));
  json('client/kit.json', (k) => ({ ...k, name: 'Fireplace' }));
  for (const f of ['client/fireplace.html', 'client/room.html']) put(f, readFileSync(join(dir, f), 'utf8').replace(/<title>[^<]*<\/title>/, '<title>Fireplace</title>'));
  put('README.md', '# Fireplace\n\nA party game for up to 256 people in one room.\n');
  put('CONTRIBUTING.md', '# Contributing to Fireplace\n\nAnyone can change it.\n');
  return dir;
}

test('slugs, repos and Pages addresses', () => {
  assert.equal(slugOf('Snow Fort Party!'), 'snow-fort-party');
  assert.equal(slugOf('Zo'), 'zo-game');
  assert.equal(slugOf('  ---Ünïcode Ball--- '), 'n-code-ball');
  assert.ok(slugOf('x'.repeat(80)).length <= 41);
  assert.equal(repoOf('https://github.com/KidDev/snow-fort.git'), 'KidDev/snow-fort');
  assert.equal(repoOf('git@github.com:KidDev/snow-fort.git'), 'KidDev/snow-fort');
  assert.equal(repoOf('https://example.com/x/y'), null);
  assert.equal(pagesUrl('KidDev/snow-fort'), 'https://kiddev.github.io/snow-fort/');
  assert.equal(pagesUrl('KidDev/kiddev.github.io'), 'https://kiddev.github.io/');
  assert.equal(hostedUrl('snow-fort-party'), 'https://snow-fort-party.scryward.online/');
});

test("it refuses Fireplace's own repo and slug unless forced, and a name it cannot use", () => {
  for (const repo of ['AnthonE/Fireplace', 'anthone/fireplace', 'AnthonE/Quake-Golf']) {
    assert.throws(() => plan('My Game', { repo }), /Fireplace's own repo/, repo);
  }
  assert.throws(() => plan('Fireplace', { repo: 'KidDev/x' }), /own store slug/);
  assert.throws(() => plan('', { repo: 'KidDev/x' }), /give your game a name/);
  assert.throws(() => plan('My Game', { repo: 'KidDev/x', slug: 'Bad Slug' }), /--slug/);
  const dir = copy();
  try {
    assert.ok(Object.keys(plan('My Game', { repo: 'AnthonE/Fireplace', force: true, root: dir }).edits).length > 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("init gives a copy its own game's name and manifest, and a second run changes nothing", () => {
  const dir = copy();
  const read = (f) => readFileSync(join(dir, f), 'utf8');
  try {
    const first = init('Snow Fort Party', { repo: 'KidDev/snow-fort', root: dir });
    assert.deepEqual(Object.keys(first.edits).sort(), ['CONTRIBUTING.md', 'README.md', 'client/fireplace.html', 'client/kit.json', 'client/room.html', 'elo.json', 'package.json']);
    const elo = JSON.parse(read('elo.json'));
    assert.equal(elo.game, 'snow-fort-party');
    assert.equal(elo.elo, 1);
    assert.equal(elo.listing.name, 'Snow Fort Party');
    assert.equal(elo.listing.play_url, 'https://snow-fort-party.scryward.online/', 'the copy plays where Elo Pros hosts it');
    assert.deepEqual(elo.listing.engine, { name: 'Fireplace', license: 'CC0-1.0' });
    for (const k of ['wallet', 'jobs', 'sell', 'terms', 'servers']) assert.equal(elo[k], undefined, `no ${k} by default`);
    assert.deepEqual(elo.art, { capsule: CAPSULE }, 'the kit\'s capsule, so the store can show the copy');
    // the themes are still credited as mods, as test/themes.test.mjs wants
    assert.deepEqual(elo, withGenerated(elo, readThemes(join(dir, 'client/themes')), readMaps(join(dir, 'maps'))));
    assert.doesNotMatch(read('elo.json'), /AnthonE\/Fireplace|fireplace-/);
    assert.equal(JSON.parse(read('package.json')).name, 'snow-fort-party');
    assert.equal(JSON.parse(read('client/kit.json')).name, 'Snow Fort Party');
    assert.equal(JSON.parse(read('client/kit.json')).repo, 'KidDev/snow-fort', "the copy's maps go to its own repo, not Fireplace's");
    assert.deepEqual(elo.tools.map((t) => [t.id, t.url]), [['map-editor', 'https://snow-fort-party.scryward.online/client/map-editor.html'], ['studio', 'https://snow-fort-party.scryward.online/client/studio.html']], "the store links the copy's own map editor and studio");
    assert.match(read('client/fireplace.html'), /<title>Snow Fort Party<\/title>/);
    assert.match(read('client/room.html'), /<title>Snow Fort Party Room<\/title>/);
    assert.match(read('README.md'), /^# Snow Fort Party\n\nSnow Fort Party is made from \[Fireplace\]/);
    assert.match(read('CONTRIBUTING.md'), /^# Contributing to Fireplace\n\n> This guide came with Fireplace, which Snow Fort Party is made from/);
    assert.deepEqual(init('Snow Fort Party', { repo: 'KidDev/snow-fort', root: dir }).edits, {}, 'the same answers again change nothing');
    // a rename later keeps what the game has added since (a wallet line, say) and moves the name
    const withWallet = { ...JSON.parse(read('elo.json')), wallet: '0x' + '1'.repeat(40) };
    writeFileSync(join(dir, 'elo.json'), JSON.stringify(withWallet, null, 2) + '\n');
    init('Snow Fort Pals', { repo: 'KidDev/snow-fort', root: dir });
    const renamed = JSON.parse(read('elo.json'));
    assert.equal(renamed.game, 'snow-fort-pals');
    assert.equal(renamed.listing.name, 'Snow Fort Pals');
    assert.equal(renamed.wallet, withWallet.wallet);
    assert.equal(renamed.listing.play_url, 'https://snow-fort-pals.scryward.online/', 'a rename moves the page');
    assert.deepEqual(renamed.tools.map((t) => t.url), ['https://snow-fort-pals.scryward.online/client/map-editor.html', 'https://snow-fort-pals.scryward.online/client/studio.html'], '…and its tools with it');
    assert.equal((read('README.md').match(/is made from \[Fireplace\]/g) || []).length, 1, 'one line saying where it came from');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
