// The shelf's page (client/games.html): every tile of the catalogue
// (client/shelf.mjs) as a link that plays, the main games in a row and a
// section for Party's minigames, the arena's modes and maps, and Dogfight;
// a box that filters them by name; and, where a pool reports rooms, how many
// are playing, the tile's link then a room with a seat. With no pool (a
// static site, a dev server) every tile is a local room with AI players.
// Pictures are client/shelf/<id>.webp (tools/shelf.mjs); a tile without one
// is drawn in a colour of its own with its name.
//   ?pool=<url> the kit's room pool for this visit (client/kit.mjs), kept on every link; ?pool=0 none
import { kit, roomList, poolRooms } from './kit.mjs';
import { catalogue, tilesOf, hrefOf, lineText, playersText, matches, seats, liveText, buildDir } from './shelf.mjs';
import { MINIGAMES } from '../src/layout.mjs';

const q = new URLSearchParams(location.search);
const json = (url, opts = { cache: 'no-cache' }) => fetch(url, opts).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  for (const k of kids) if (k) e.append(k);
  return e;
};
// a tile's own colour, from its id: the same one every visit
const hueOf = (id) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 360; };

async function main() {
  // the pictures there are and the minigames' lines (tools/shelf.mjs), and the maps the site packs (tools/site.mjs)
  const [index, packed] = await Promise.all([json(new URL('./shelf/index.json', import.meta.url)), json(new URL('../build/maps/index.json', import.meta.url))]);
  const maps = Array.isArray(packed?.maps) ? packed.maps : [];
  const name = String(kit.name || 'Fireplace');
  // a minigame the index has no line for (one added since the tool last ran): its client module's own hint
  const lines = { ...index?.lines };
  await Promise.all(MINIGAMES.filter((m) => !lines[m.key]).map(async (m) => { lines[m.key] = (await import(`./mg/${m.key}.mjs`).catch(() => null))?.default?.hint || ''; }));
  const shelf = catalogue({ maps, lines, name });
  const tiles = tilesOf(shelf);
  const shots = new Set(index?.shots ?? []);
  const carry = q.has('pool') ? { pool: q.get('pool') } : {};
  const local = (t) => hrefOf(t, { ...t.query, ...carry });

  document.title = `${name}: games`;
  document.getElementById('title').textContent = name.toUpperCase();
  document.getElementById('tag').textContent = String(kit.tagline ?? '');
  const root = document.getElementById('shelf');
  const none = document.getElementById('none');
  const els = new Map(); // tile id -> { a, live }
  function tileEl(t) {
    const live = el('span', { className: 'live', hidden: true });
    // its picture, or (none shot, or one the host would not serve) its name on its colour
    const drawn = () => el('span', { className: 'drawn', textContent: t.name });
    const img = shots.has(t.shot) ? el('img', { src: new URL(`./shelf/${t.shot}.webp`, import.meta.url).href, alt: '', loading: 'lazy', decoding: 'async' }) : null;
    img?.addEventListener('error', () => img.replaceWith(drawn()));
    const pic = el('span', { className: 'pic' }, img ?? drawn(), live, el('span', { className: 'play', textContent: 'PLAY' }));
    pic.style.setProperty('--hue', hueOf(t.id));
    const a = el('a', { className: 'tile', href: local(t) }, pic,
      el('span', { className: 'text' }, el('span', { className: 'name', textContent: t.name }), el('span', { className: 'line', textContent: lineText(t.line) }),
        el('span', { className: 'who', textContent: playersText(t.players) })));
    a.dataset.id = t.id;
    a.title = lineText(t.line);
    els.set(t.id, { a, live });
    return a;
  }
  const sections = [{ id: 'featured', title: '', about: '', tiles: shelf.featured }, ...shelf.sections];
  const jump = document.getElementById('jump');
  const counts = new Map(); // section id -> the count by its title
  for (const s of sections) {
    counts.set(s.id, el('b', { textContent: String(s.tiles.length) }));
    const sec = el('section', { id: s.id },
      s.title && el('h2', { textContent: s.title }, counts.get(s.id)),
      s.about && el('p', { className: 'about', textContent: lineText(s.about) }),
      el('div', { className: 'grid' }, ...s.tiles.map(tileEl)));
    root.append(sec);
    if (s.title) jump.append(el('a', { href: `#${s.id}`, textContent: s.title }, el('b', { textContent: String(s.tiles.length) })));
  }
  none.hidden = true;
  root.append(none);

  // the box: tiles by name (or their game's), a section's count how many it left, sections with none away
  const find = document.getElementById('find');
  function filter(typed) {
    let shown = 0;
    for (const s of sections) {
      let n = 0;
      for (const t of s.tiles) { const on = matches(t, typed, shelf); els.get(t.id).a.hidden = !on; if (on) n++; }
      document.getElementById(s.id).hidden = !n;
      counts.get(s.id).textContent = n < s.tiles.length ? `${n} OF ${s.tiles.length}` : String(n);
      shown += n;
    }
    none.textContent = `NOTHING HERE IS CALLED "${typed.trim().toUpperCase()}"`;
    none.hidden = shown > 0;
    return tiles.filter((t) => !els.get(t.id).a.hidden).map((t) => t.id);
  }
  find.addEventListener('input', () => filter(find.value));
  addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== find) { e.preventDefault(); find.focus(); }
    if (e.key === 'Escape' && document.activeElement === find) { find.value = ''; filter(''); find.blur(); }
  });
  if (q.get('find')) { find.value = q.get('find'); filter(find.value); }

  // ---- who is playing: the room pool's list beside the page with each
  // room's status, and the kit pool's open rooms, matched to this site's own
  // builds and maps by sha256 (read once, and only if the pool has rooms)
  let listed = true, shas = null, playing = new Map();
  async function siteShas() {
    const games = {};
    await Promise.all([...new Set(tiles.map((t) => t.game))].map(async (g) => {
      const m = await json(new URL(`../${buildDir(g)}manifest.json`, import.meta.url));
      if (m?.game?.sha256) games[g] = m.game.sha256;
    }));
    return { games, maps: Object.fromEntries(maps.map((m) => [m.id, m.sha256])) };
  }
  async function live() {
    // a site with no list beside it is not asked for one again
    const rows = listed ? await roomList() : [];
    if (!rows.length) listed = false;
    const list = await Promise.all(rows.map(async (r) => ({ ...r, status: r.status_url ? await json(r.status_url, { cache: 'no-store' }) : null })));
    const open = await poolRooms(q);
    if (open.length) shas ??= await siteShas();
    playing = seats(tiles, { list, open, shas: shas ?? undefined, pool: q.get('pool') || '' });
    for (const t of tiles) {
      const s = playing.get(t.id), e = els.get(t.id);
      e.live.hidden = !s;
      if (s) e.live.textContent = liveText(s);
      e.a.href = s?.join ? hrefOf(t, s.join) : local(t);
    }
  }
  await live().catch(() => {});
  setInterval(() => { if (document.visibilityState === 'visible') live().catch(() => {}); }, 20000);

  // for the gates (net/run-pages.mjs): what the shelf holds and what it shows
  window.__shelf = {
    ready: true, sections: sections.map((s) => ({ id: s.id, title: s.title, tiles: s.tiles.map((t) => t.id) })),
    tiles: () => tiles.map((t) => ({ id: t.id, kind: t.kind, game: t.game, name: t.name, line: t.line, href: els.get(t.id).a.getAttribute('href'), picture: shots.has(t.shot),
      shown: !els.get(t.id).a.hidden, live: playing.get(t.id) ?? null })),
    filter: (typed) => { find.value = typed; return filter(typed); },
    live,
  };
}

main().catch((e) => {
  document.getElementById('none').hidden = false;
  document.getElementById('none').textContent = String(e?.message || e);
  window.__shelf = { error: String(e?.stack || e) };
});
