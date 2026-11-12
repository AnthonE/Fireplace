// The shelf: everything this site can play, as tiles (client/games.html draws
// them, client/games.mjs asks the pools). All of it comes from the lists the
// games themselves read, so a new minigame, mode or map is on the shelf the
// day it is in its list: layout.mjs's FP_SETS (the games), PLAYLIST,
// MINIGAMES, MODES, ARENA_MODES and FLIGHT_MODES, flight-view.mjs's names
// for the modes it flies, and the maps the site packs (build/maps/index.json,
// tools/site.mjs packMaps). Nothing here touches the page or the network, so
// node:test holds it (test/shelf.test.mjs).
//
// A tile: { id, kind (game, minigame, mode, map), game (whose wasm: fireplace,
// party, arena, flight, golf), name (as the game's own HUD has it), line (one
// line of what it is, phrases two spaces apart as MODES' rules are), players
// [fewest, most], page, query (what opens it in a local room with AI
// players), map (the map it is on, '' the build's own), shot (the id its
// picture is filed under, client/shelf/<shot>.webp), open (does a pool's room
// play exactly this: the rotation, or a map; a forced mode or minigame is a
// local room's seed), and on a map's tile plays (the mode every match on it
// is, null for the rotation) }.
import * as L from '../src/layout.mjs';
import { MODE_NAMES } from '../src/flight-view.mjs';

// The page's half of each game in FP_SETS, by G_*, as client/fireplace.mjs
// has its own: the page that plays it alone, the name a pool knows its wasm
// by (net/kit-rooms.mjs GAMES), and its line. A retired game keeps its place
// as null; a new game adds its row here.
export const PAGES = [
  { game: 'golf', page: 'golf.html', line: 'ONE COURSE FOR EVERYONE  ROCKETS AND GRENADES FOR CLUBS  EVERY BALL STAYS IN PLAY' },
  { game: 'arena', page: 'arena.html', line: `A SHOOTER  ${L.ARENA_MODES.length} MODES IN TURN  EVERYONE FOR THEMSELVES OR RED V BLUE` },
  null, // bumper balls, retired (party's SWISS ROLL)
  { game: 'party', page: 'party.html', line: `EVERY PLAYER A BALL  A NEW MINIGAME EVERY ROUND  ${L.MINIGAMES.length} OF THEM` },
  { game: 'flight', page: 'flight.html', line: 'THE ARENA WITH WINGS  LASERS  HOMING SHOTS  BOMBS  BARREL ROLLS' },
];
if (PAGES.length !== L.FP_SETS.length) throw new Error(`client/shelf.mjs knows ${PAGES.length} games and FP_SETS has ${L.FP_SETS.length}`);

// where a game's build is on the site, as net/kit-rooms.mjs GAMES has its wasm: its manifest.json beside it holds the sha256
export const buildDir = (game) => (game === 'golf' ? 'build/' : `build/${game}/`);

const PLAYERS = [1, L.NPLAYER];
const LOCAL = { local: '1' };
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// A map as the shelf lists it, from its map.json and what the compiler made
// of it (tools/map-compile.mjs compileSpec): its folder, the name and line a
// player reads, the arena mode every match on it plays (null for none), and
// whether it is a sky for ships (map.json gives it a ceiling). tools/site.mjs
// writes these, with each packed map's sha256, as build/maps/index.json.
export const mapRow = (id, spec, compiled) => ({
  id, name: String(spec.name || id), about: String(spec.about || ''),
  mode: compiled.mode ? compiled.mode - 1 : null, flight: spec.ceiling !== undefined || id === L.FLIGHT_CONSTS.FLIGHT_MAP,
});

// The whole shelf. maps: mapRow()s (none: only what the builds hold); lines: a
// minigame's own line by key (client/mg/<key>.mjs's hint, gathered by
// tools/shelf.mjs); name: the title card's (client/kit.json).
// Returns { featured: [tile], sections: [{ id, title, about, tiles }] }.
export function catalogue({ maps = [], lines = {}, name = 'Fireplace' } = {}) {
  const plays = L.FP_PLAYS.filter((g) => PAGES[g]);
  // the games in the order the room meets them, then any the playlist leaves out
  const order = [...new Set([...L.PLAYLIST.filter((g) => plays.includes(g)), ...plays])];
  const pageOf = (game) => PAGES.find((p) => p?.game === game);
  const game = (g) => ({
    id: PAGES[g].game, kind: 'game', game: PAGES[g].game, name: L.GAMES[g], line: PAGES[g].line, players: PLAYERS,
    page: PAGES[g].page, query: { ...LOCAL }, map: '', shot: PAGES[g].game, open: true,
  });
  const featured = [
    { id: 'fireplace', kind: 'game', game: 'fireplace', name: String(name).toUpperCase(),
      line: `EVERY GAME IN TURN  ${order.map((g) => L.GAMES[g]).join('  ')}  MARSHMALLOWS FOR THE TOP THREE`,
      players: PLAYERS, page: 'fireplace.html', query: { ...LOCAL }, map: '', shot: 'fireplace', open: true },
    ...order.map(game),
  ];
  const sections = [];

  const party = pageOf('party');
  if (party) {
    sections.push({ id: 'minigames', title: `${L.GAMES[L.G_PARTY]} MINIGAMES`, about: 'A TILE\'S ROOM PLAYS IT EVERY ROUND',
      tiles: L.MINIGAMES.map((m, k) => ({
        id: `mg-${m.key}`, kind: 'minigame', game: 'party', name: m.name, line: lines[m.key] || '', players: PLAYERS,
        page: party.page, query: { ...LOCAL, mg: String(k) }, map: '', shot: `mg-${m.key}`, open: false,
      })) });
  }

  // a map by the game that plays it: a sky is Dogfight's, the rest the arena's;
  // a build's own map needs no ?map=, and is the room a pool's rotation plays
  const arena = pageOf('arena'), flight = pageOf('flight');
  const mapTile = (m, p, own) => {
    const mode = m.mode === null ? null : L.MODES[m.mode];
    return { id: `map-${m.id}`, kind: 'map', game: p.game, name: m.name.toUpperCase(),
      line: [mode ? `PLAYS ${mode.name}` : '', m.about || mode?.rules || ''].filter(Boolean).join('  '), players: PLAYERS,
      page: p.page, query: m.id === own ? { ...LOCAL } : { ...LOCAL, map: m.id }, map: m.id === own ? '' : m.id, shot: `map-${m.id}`, open: true,
      plays: m.mode };
  };
  const arenaMaps = arena ? maps.filter((m) => !m.flight).map((m) => mapTile(m, arena, L.MAP_NAME)) : [];
  const flightMaps = flight ? maps.filter((m) => m.flight).map((m) => mapTile(m, flight, L.FLIGHT_CONSTS.FLIGHT_MAP)) : [];

  if (arena) {
    // the rotation's modes in its order, then the ones only a map plays: on that
    // map if the site ships one, else forced on the build's own
    const rest = L.MODES.map((_, k) => k).filter((k) => !L.ARENA_MODES.includes(k));
    sections.push({ id: 'modes', title: `${L.GAMES[L.G_ARENA]} MODES`, about: 'A TILE\'S ROOM PLAYS IT EVERY MATCH',
      tiles: [...L.ARENA_MODES, ...rest].map((k) => {
        const on = L.ARENA_MODES.includes(k) ? null : arenaMaps.find((t) => t.plays === k);
        return { id: `arena-${k}`, kind: 'mode', game: 'arena', name: L.MODES[k].name,
          line: `${L.MODES[k].rules}${on ? `  ON ${on.name}` : ''}`, players: L.MODES[k].team ? [2, L.NPLAYER] : PLAYERS,
          page: arena.page, query: on ? { ...on.query } : { ...LOCAL, mode: String(k) }, map: on ? on.map : '',
          shot: on ? on.shot : `arena-${k}`, open: !!on };
      }) });
    if (arenaMaps.length) sections.push({ id: 'maps', title: `${L.GAMES[L.G_ARENA]} MAPS`, about: 'THE MODES IN TURN ON THE MAP  OR THE ONE MODE IT IS BUILT FOR', tiles: arenaMaps });
  }

  if (flight) {
    sections.push({ id: 'dogfight', title: L.GAMES[L.G_FLIGHT], about: 'A TILE\'S ROOM FLIES IT EVERY MATCH',
      tiles: [
        ...L.FLIGHT_MODES.map((k) => ({
          id: `flight-${k}`, kind: 'mode', game: 'flight', name: MODE_NAMES[k]?.name ?? L.MODES[k]?.name ?? `MODE ${k}`,
          line: MODE_NAMES[k]?.rules ?? L.MODES[k]?.rules ?? '', players: L.MODES[k]?.team ? [2, L.NPLAYER] : PLAYERS,
          page: flight.page, query: { ...LOCAL, mode: String(k) }, map: '', shot: `flight-${k}`, open: false,
        })),
        ...flightMaps,
      ] });
  }
  return { featured, sections };
}

// Every tile of a shelf, the featured row first.
export const tilesOf = (shelf) => [...shelf.featured, ...shelf.sections.flatMap((s) => s.tiles)];

// A tile's link, beside the shelf's own page: its local room, or the room a
// pool has a seat in (join, from seats() below).
export function hrefOf(tile, join = null) {
  const q = new URLSearchParams(join ?? tile.query);
  return `${tile.page}?${q}`;
}

// A line for a person: the lists' phrases, two spaces apart, with a dot between.
export const lineText = (s) => String(s || '').trim().replace(/\s{2,}/g, ' · ');
export const playersText = ([a, b]) => `${a}-${b} PLAYERS`;

// Does a tile answer what was typed in the search box: every word in its
// name, or in its game's.
export function matches(tile, typed, shelf) {
  const words = slug(typed).split('-').filter(Boolean);
  if (!words.length) return true;
  const hay = `${slug(tile.name)} ${slug(shelf.featured.find((t) => t.kind === 'game' && t.game === tile.game)?.name || '')}`;
  return words.every((w) => hay.includes(w));
}

// What the pools report, as each open tile's count and seat.
//   list: the room pool's rows beside the page (rooms/servers.json,
//     net/rooms.mjs: id, game, addr, max_players), each with what its
//     status_url said (status: { players, max_players, game }, or null unread)
//   open: the kit pool's rooms (net/kit-rooms.mjs GET ./: room, game,
//     game_sha256, map, map_sha256, players, max_players)
//   shas: this site's own builds and packed maps by sha256, { games: { arena:
//     hex }, maps: { lifts: hex } }: a kit room is this site's only on both
//   pool: ?pool= as the page was given it, kept on a kit room's link
// Returns a Map: tile id -> { playing, rooms, join }. join is the query that
// opens the room with a seat (the fullest such, so a room fills), null when
// every room is full: the tile then plays its local room.
export function seats(tiles, { list = [], open = [], shas = { games: {}, maps: {} }, pool = '' } = {}) {
  const out = new Map();
  for (const t of tiles) {
    if (!t.open) continue;
    const rooms = [];
    // a listed room plays its build's own map
    if (!t.map) {
      for (const r of list) {
        // whose room: the row's game, as its status says it, or its id's (rows from before `game`)
        if ((r.game ?? r.status?.game ?? String(r.id || '').replace(/-\d+$/, '')) !== t.game || !/^[\w.-]+:\d+$/.test(r.addr || '')) continue;
        const most = r.status?.max_players ?? r.max_players ?? L.NPLAYER;
        rooms.push({ players: r.status?.players ?? 0, most, join: { url: `https://${r.addr}/` } });
      }
    }
    for (const r of open) {
      if (r.game !== t.game || !r.game_sha256 || r.game_sha256 !== shas.games?.[t.game]) continue;
      if ((r.map || '') !== t.map || (t.map && r.map_sha256 !== shas.maps?.[t.map])) continue;
      rooms.push({ players: r.players ?? 0, most: r.max_players ?? L.NPLAYER,
        join: { room: r.room, ...(t.map ? { map: t.map } : {}), ...(pool ? { pool } : {}) } });
    }
    if (!rooms.length) continue;
    const free = rooms.filter((r) => r.players < r.most).sort((a, b) => b.players - a.players)[0];
    out.set(t.id, { playing: rooms.reduce((n, r) => n + r.players, 0), rooms: rooms.length, join: free ? free.join : null });
  }
  return out;
}

// The badge a tile wears while a pool has rooms for it.
export const liveText = (s) => (s.playing ? `${s.playing} PLAYING` : 'ROOM OPEN');
