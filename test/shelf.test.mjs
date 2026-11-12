// The shelf (client/shelf.mjs, client/games.html): the catalogue built from
// the games' own lists, each tile's link, the box's matching, the counts and
// seats read off what the pools report, and what tools/shelf.mjs and
// tools/site.mjs write for the page (client/shelf/, build/maps/index.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from '../src/layout.mjs';
import { MODE_NAMES } from '../src/flight-view.mjs';
import { PAGES, catalogue, tilesOf, hrefOf, lineText, playersText, matches, seats, liveText, buildDir, mapRow } from '../client/shelf.mjs';
import { GAMES as POOL_GAMES, MAP_NAME } from '../net/kit-rooms.mjs';
import { packMaps, buildSite } from '../tools/site.mjs';
import { mgLines } from '../tools/shelf.mjs';
import { wasmBytes } from './helpers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'shelf-'));
process.on('exit', () => rmSync(tmp, { recursive: true, force: true }));
const packed = packMaps(join(tmp, 'maps'));
const maps = packed.rows;
const lines = await mgLines();
const shelf = catalogue({ maps, lines, name: 'Fireplace' });
const tiles = tilesOf(shelf);
const byId = (id) => tiles.find((t) => t.id === id);
const section = (id) => shelf.sections.find((s) => s.id === id);

test('the maps are packed with the list the shelf reads', () => {
  const dirs = readdirSync(join(ROOT, 'maps')).filter((m) => existsSync(join(ROOT, 'maps', m, 'map.json'))).sort();
  assert.deepEqual(maps.map((m) => m.id), dirs);
  const index = JSON.parse(readFileSync(join(tmp, 'maps', 'index.json'), 'utf8'));
  assert.deepEqual(index.maps, maps);
  for (const m of maps) {
    assert.match(m.id, MAP_NAME, 'a name the pool takes');
    assert.equal(statSync(join(tmp, 'maps', `${m.id}.qgmap`)).size, m.bytes);
    assert.match(m.sha256, /^[0-9a-f]{64}$/);
  }
  const of = (id) => maps.find((m) => m.id === id);
  assert.deepEqual([of('canyon').mode, of('lifts').mode, of('crossroads').mode, of('obby').mode], [null, null, L.M_CROSSROADS, L.M_OBBY]);
  assert.deepEqual(maps.filter((m) => m.flight).map((m) => m.id), [L.FLIGHT_CONSTS.FLIGHT_MAP]);
  assert.deepEqual(mapRow('x', { name: 'X', ceiling: 300 }, { mode: 0 }), { id: 'x', name: 'X', about: '', mode: null, flight: true });
});

test('the row of main games: Fireplace, then every game it plays, in the playlist\'s order', () => {
  assert.equal(PAGES.length, L.FP_SETS.length);
  assert.deepEqual(shelf.featured.map((t) => t.name), ['FIREPLACE', ...[...new Set(L.PLAYLIST)].map((g) => L.GAMES[g])]);
  assert.deepEqual(shelf.featured.map((t) => t.game).sort(), ['fireplace', ...L.FP_PLAYS.map((g) => PAGES[g].game)].sort());
  for (const g of L.FP_PLAYS) assert.ok(PAGES[g], `${L.GAMES[g]} has its page's row in client/shelf.mjs PAGES`);
  for (const t of shelf.featured) {
    assert.equal(hrefOf(t), `${t.page}?local=1`);
    assert.equal(t.kind, 'game');
    assert.ok(t.open);
    // where the pool finds this game's wasm is where the page reads its sha256
    assert.equal(POOL_GAMES[t.game], `${buildDir(t.game)}game.wasm`);
  }
  assert.equal(catalogue({ name: 'Snow Fort' }).featured[0].name, 'SNOW FORT');
});

test('every page a tile opens is on the site and isolates itself on a static host', () => {
  for (const page of new Set(tiles.map((t) => t.page))) {
    const html = readFileSync(join(ROOT, 'client', page), 'utf8');
    assert.match(html, /<script src="\.\.\/coi\.js"><\/script>/, page);
    assert.match(html, /shelf-link\.mjs/, `${page} has the way back`);
  }
});

test('every minigame is a tile that opens party forced to it', () => {
  const s = section('minigames');
  assert.equal(s.tiles.length, L.MINIGAMES.length);
  L.MINIGAMES.forEach((m, k) => {
    const t = s.tiles[k];
    assert.equal(t.name, m.name);
    assert.equal(hrefOf(t), `party.html?local=1&mg=${k}`);
    assert.ok(t.line, `${m.key} has a line`);
    assert.equal(t.open, false);
  });
});

test('every arena mode is a tile: the rotation\'s forced by ?mode=, a map\'s own on the map that names it', () => {
  const s = section('modes');
  assert.equal(s.tiles.length, L.MODES.length);
  assert.deepEqual(s.tiles.slice(0, L.ARENA_MODES.length).map((t) => t.id), L.ARENA_MODES.map((k) => `arena-${k}`));
  L.MODES.forEach((m, k) => {
    const t = byId(`arena-${k}`);
    assert.equal(t.name, m.name);
    assert.ok(t.line.startsWith(m.rules));
    if (L.ARENA_MODES.includes(k)) assert.equal(hrefOf(t), `arena.html?local=1&mode=${k}`);
    else {
      const on = maps.find((x) => x.mode === k);
      assert.ok(on, `a map plays ${m.name}`);
      assert.equal(hrefOf(t), `arena.html?local=1&map=${on.id}`);
      assert.equal(t.shot, `map-${on.id}`);
      assert.ok(t.open);
    }
    assert.deepEqual(t.players, [m.team ? 2 : 1, L.NPLAYER]);
  });
  // with no map on the site that names it, such a mode is forced on the build's own
  const bare = catalogue({});
  assert.equal(hrefOf(tilesOf(bare).find((t) => t.id === `arena-${L.M_OBBY}`)), `arena.html?local=1&mode=${L.M_OBBY}`);
  assert.equal(bare.sections.find((x) => x.id === 'maps'), undefined);
});

test('every map is a tile on its game: the build\'s own with no ?map=, the rest by name', () => {
  const arena = section('maps').tiles, dog = section('dogfight').tiles.filter((t) => t.kind === 'map');
  assert.deepEqual([...arena, ...dog].map((t) => t.id).sort(), maps.map((m) => `map-${m.id}`).sort());
  for (const t of arena) {
    const m = maps.find((x) => `map-${x.id}` === t.id);
    assert.equal(t.name, m.name.toUpperCase());
    assert.equal(hrefOf(t), m.id === L.MAP_NAME ? 'arena.html?local=1' : `arena.html?local=1&map=${m.id}`);
    assert.equal(t.map, m.id === L.MAP_NAME ? '' : m.id);
    if (m.mode !== null) assert.ok(t.line.startsWith(`PLAYS ${L.MODES[m.mode].name}`));
    assert.ok(t.line, `${m.id} has a line`);
  }
  assert.deepEqual(dog.map((t) => hrefOf(t)), ['flight.html?local=1']);
});

test('every Dogfight mode is a tile under the name flight gives it', () => {
  const modes = section('dogfight').tiles.filter((t) => t.kind === 'mode');
  assert.deepEqual(modes.map((t) => [t.name, hrefOf(t)]), L.FLIGHT_MODES.map((k) => [MODE_NAMES[k].name, `flight.html?local=1&mode=${k}`]));
  for (const t of modes) assert.ok(t.line);
});

test('ids are one each, names are the players\', and nothing names another company\'s game', () => {
  assert.equal(new Set(tiles.map((t) => t.id)).size, tiles.length);
  const html = readFileSync(join(ROOT, 'client', 'games.html'), 'utf8').replace(/<style>[\s\S]*?<\/style>/, '');
  for (const s of [...tiles.flatMap((t) => [t.name, t.line]), ...shelf.sections.flatMap((x) => [x.title, x.about]), html]) {
    assert.doesNotMatch(s, /\bM_[A-Z]|\bMG_[A-Z]/, s);
    assert.doesNotMatch(s, /roblox|halo|quake|mario|fortnite|minecraft|fall guys|among us|squid/i, s);
  }
  for (const t of tiles) assert.equal(t.query.local, '1', `${t.id} plays a local room`);
});

test('a line reads with dots, the players as a range', () => {
  assert.equal(lineText('RANDOM GUNS  MOST KILLS IN 10 MIN'), 'RANDOM GUNS · MOST KILLS IN 10 MIN');
  assert.equal(lineText(' one line. '), 'one line.');
  assert.equal(lineText(undefined), '');
  assert.equal(playersText([1, 256]), '1-256 PLAYERS');
});

test('the box matches a tile by its name or its game\'s, every word typed', () => {
  const found = (typed) => tiles.filter((t) => matches(t, typed, shelf)).map((t) => t.id);
  assert.deepEqual(found('thin ice'), ['mg-thinice']);
  assert.deepEqual(found('  ICE thin '), ['mg-thinice']);
  assert.deepEqual(found(''), tiles.map((t) => t.id));
  assert.deepEqual(found('zzzz'), []);
  assert.deepEqual(found('flag'), [`arena-${L.M_CTF}`]);
  assert.deepEqual(found('party').length, 1 + L.MINIGAMES.length);
  assert.ok(found('golf').includes('golf') && found('golf').includes('mg-minigolf'));
  assert.ok(found('sky steps').includes('map-obby'));
  assert.ok(found('dogfight').includes(`flight-${L.FLIGHT_CONSTS.M_RACE}`));
});

test('a room pool\'s list counts on its game\'s tile, the link a room with a seat', () => {
  const row = (port, game, players, most = 8) => ({ id: `${game}-${port}`, game, addr: `game.example.com:${port}`, max_players: most, status: players === null ? null : { players, max_players: most } });
  let s = seats(tiles, { list: [row(61290, 'fireplace', 8), row(61291, 'fireplace', 3), row(61292, 'fireplace', 5), row(61293, 'fireplace', 0)] });
  assert.deepEqual([...s.keys()], ['fireplace']);
  assert.deepEqual(s.get('fireplace'), { playing: 16, rooms: 4, join: { url: 'https://game.example.com:61292/' } }); // the fullest with a seat
  assert.equal(hrefOf(byId('fireplace'), s.get('fireplace').join), 'fireplace.html?url=https%3A%2F%2Fgame.example.com%3A61292%2F');
  assert.equal(liveText(s.get('fireplace')), '16 PLAYING');
  // every room full: counted, and the tile keeps its local room
  s = seats(tiles, { list: [row(4990, 'party', 8)] });
  assert.deepEqual(s.get('party'), { playing: 8, rooms: 1, join: null });
  // an empty room, an unread status, a row from before `game` (its id's), the arena's map tile too; a bad address is no room
  s = seats(tiles, { list: [{ id: 'arena-4991', addr: 'h:4991', max_players: 8, status: null }, row(4992, 'arena', 0), { id: 'golf-1', game: 'golf', addr: 'javascript:alert(1)' }] });
  assert.deepEqual([...s.keys()].sort(), ['arena', 'map-canyon']);
  assert.equal(s.get('arena').playing, 0);
  assert.equal(liveText(s.get('arena')), 'ROOM OPEN');
  assert.deepEqual(s.get('arena').join, { url: 'https://h:4991/' });
  assert.equal(seats(tiles, {}).size, 0);
});

test('the kit pool\'s rooms count where the wasm and the map are this site\'s', () => {
  const shas = { games: { fireplace: 'f'.repeat(64), arena: 'a'.repeat(64) }, maps: Object.fromEntries(maps.map((m) => [m.id, m.sha256])) };
  const lifts = maps.find((m) => m.id === 'lifts').sha256, obby = maps.find((m) => m.id === 'obby').sha256;
  const open = [
    { room: 'aa11', game: 'fireplace', game_sha256: shas.games.fireplace, map: null, map_sha256: null, players: 2, max_players: 8 },
    { room: 'bb22', game: 'fireplace', game_sha256: '0'.repeat(64), map: null, map_sha256: null, players: 7, max_players: 8 }, // another copy's build
    { room: 'cc33', game: 'arena', game_sha256: shas.games.arena, map: 'lifts', map_sha256: lifts, players: 8, max_players: 8 },
    { room: 'dd44', game: 'arena', game_sha256: shas.games.arena, map: 'lifts', map_sha256: lifts, players: 1, max_players: 8 },
    { room: 'ee55', game: 'arena', game_sha256: shas.games.arena, map: 'obby', map_sha256: obby, players: 4, max_players: 8 },
    { room: 'ff66', game: 'arena', game_sha256: shas.games.arena, map: 'crossroads', map_sha256: '1'.repeat(64), players: 5, max_players: 8 }, // another map by that name
    { room: 'gg77', game: 'party', game_sha256: 'p'.repeat(64), map: null, map_sha256: null, players: 3, max_players: 8 }, // no sha of ours to match
  ];
  const s = seats(tiles, { open, shas, pool: 'http://127.0.0.1:8490/kit/' });
  assert.deepEqual([...s.keys()].sort(), [`arena-${L.M_OBBY}`, 'fireplace', 'map-lifts', 'map-obby']);
  assert.deepEqual(s.get('fireplace'), { playing: 2, rooms: 1, join: { room: 'aa11', pool: 'http://127.0.0.1:8490/kit/' } });
  assert.deepEqual(s.get('map-lifts'), { playing: 9, rooms: 2, join: { room: 'dd44', map: 'lifts', pool: 'http://127.0.0.1:8490/kit/' } });
  assert.deepEqual(s.get('map-obby'), s.get(`arena-${L.M_OBBY}`)); // the mode's tile is that map's room
  assert.equal(hrefOf(byId('map-lifts'), seats(tiles, { open, shas }).get('map-lifts').join), 'arena.html?room=dd44&map=lifts');
  assert.equal(seats(tiles, { open }).size, 0); // no shas read: nothing is ours
});

test('the pictures and lines tools/shelf.mjs wrote are the catalogue\'s, small, and fresh', () => {
  const dir = join(ROOT, 'client', 'shelf');
  const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
  const files = readdirSync(dir).filter((f) => f.endsWith('.webp')).map((f) => f.slice(0, -5)).sort();
  assert.deepEqual(index.shots, files, 'index.json lists the pictures there are: node tools/shelf.mjs --lines');
  const known = new Set(tiles.map((t) => t.shot));
  let bytes = 0;
  for (const id of files) {
    assert.ok(known.has(id), `${id}.webp is no tile's picture`);
    const size = statSync(join(dir, `${id}.webp`)).size;
    assert.ok(size > 1500 && size < 60 * 1024, `${id}.webp is ${size} B`);
    assert.equal(readFileSync(join(dir, `${id}.webp`)).subarray(8, 12).toString('latin1'), 'WEBP');
    bytes += size;
  }
  assert.ok(bytes < 1.5 * 1024 * 1024, `${bytes} B of pictures`);
  // a minigame's line, where the index has one, is its module's as it is now (a new minigame has none until the tool runs)
  for (const [key, line] of Object.entries(index.lines)) assert.equal(line, lines[key], `${key}: node tools/shelf.mjs --lines`);
  assert.equal(Object.keys(lines).length, L.MINIGAMES.length);
});

test('the site ships the shelf, its pictures and the maps\' list, and its front door offers it', () => {
  wasmBytes(); // npm run build, once
  const out = join(tmp, 'site');
  buildSite(out);
  for (const f of ['client/games.html', 'client/games.mjs', 'client/shelf.mjs', 'client/shelf-link.mjs', 'client/golf.html', 'client/golf.mjs', 'client/shelf/index.json', 'build/maps/index.json',
    ...['fireplace', 'party', 'arena', 'flight', 'golf'].map((g) => `${buildDir(g)}manifest.json`), ...maps.map((m) => `build/maps/${m.id}.qgmap`)]) assert.ok(existsSync(join(out, f)), f);
  for (const id of JSON.parse(readFileSync(join(out, 'client/shelf/index.json'), 'utf8')).shots) assert.ok(existsSync(join(out, 'client/shelf', `${id}.webp`)), id);
  assert.deepEqual(JSON.parse(readFileSync(join(out, 'build/maps/index.json'), 'utf8')).maps, maps);
  const index = readFileSync(join(out, 'index.html'), 'utf8');
  assert.match(index, /client\/games\.html/);
  assert.match(index, /location\.replace\('client\/fireplace\.html' \+ location\.search/); // an invite's ?room= still opens the room
  // a build's sha256 is where the shelf reads it
  for (const g of ['fireplace', 'arena']) assert.match(JSON.parse(readFileSync(join(out, buildDir(g), 'manifest.json'), 'utf8')).game.sha256, /^[0-9a-f]{64}$/);
});
