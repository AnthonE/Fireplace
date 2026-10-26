// The page's own settings, client/kit.json: the game's name and tagline for
// the TV's title card (node tools/kit.mjs init writes them), and where its
// online room is. A fresh copy of this repo names no relay, so its page plays
// a local room (client/local.mjs) with AI players, and offers to go online:
// the kit's room pool (net/kit-rooms.mjs) starts a room on the copy's own
// wasm, and the page's address with ?room=<id> is the invite to it.
//   relay.url       the relay's address, https://host:port/ (several, comma-separated, fail over in turn)
//   relay.hash      its certificate's sha-256, base64, as tools/cert.sh writes certs/hash.txt
//   relay.hash_url  or an https URL that serves that hash, for a relay whose 13-day
//                   certificate rotates (the host must allow this page's origin, CORS)
//   relay.pool      the room pool, POOL unless set; "" for none (?pool= for this visit, 0 for none)
export const kit = await fetch(new URL('./kit.json', import.meta.url), { cache: 'no-cache' })
  .then((r) => (r.ok ? r.json() : {}))
  .catch(() => ({}));

const text = (url) => fetch(url, { cache: 'no-cache' }).then((r) => (r.ok ? r.text() : '')).then((s) => s.trim()).catch(() => '');
// a certificate hash is 32 bytes in base64; anything else (a host's 404 page) is none
const isHash = (s) => { try { return atob(s).length === 32; } catch { return false; } };

export const POOL = 'https://game.elopros.com/kit/';
// the pool's room, once it has given one: its id and a link that opens it; or why the room is local
export const room = { id: '', invite: '', why: '' };

let certsText = null;
const certs = () => (certsText ??= text(new URL('../certs/hash.txt', import.meta.url)));

// The pool this page may ask, as a URL ending in /, or null: ?pool= or
// relay.pool ("" or 0 for none), never one on this page's own host (Fireplace's
// own page, beside the pool), and the default pool only from an https page
// (a copy's Pages site, not a dev server).
function poolBase(q) {
  const pool = q.has('pool') ? q.get('pool') : kit.relay?.pool ?? POOL;
  if (!pool || pool === '0') return null;
  let base;
  try { base = new URL(pool.endsWith('/') ? pool : `${pool}/`, location.href); } catch { return null; }
  if (base.origin === location.origin || (base.href === POOL && location.protocol !== 'https:')) return null;
  return base;
}

// Where this page's room is, in order: ?local=1 none; ?url= (with ?hash=, or
// the kit's hash); the kit's relay; the page's own host on 4433 with
// certs/hash.txt beside it (node net/play.mjs); with ?room=<id> (an invite),
// that room from the pool, for this page's wasm (opts.wasm, its bytes
// opts.bytes). None of those, or a pool that can't give the room: null, and
// the page plays a local room with AI players, room.why saying why. A relay
// named with no hash to pin is an error.
export async function relayFor(q, opts = {}) {
  if (q.get('local') === '1') return null;
  const r = kit.relay || {};
  const kitHash = async () => (isHash(r.hash) ? r.hash : r.hash_url ? text(r.hash_url) : '');
  let url = q.get('url') || r.url || '';
  let hash = q.get('hash') || '';
  if (url) {
    if (!hash) hash = await kitHash();
    if (!isHash(hash)) hash = await certs();
    if (!isHash(hash)) throw new Error(`no certificate hash for ${url}: set relay.hash in client/kit.json, or ?hash=`);
    return { url, hash };
  }
  hash = hash || (await certs());
  if (isHash(hash)) return { url: `https://${location.hostname}:4433/`, hash };
  const base = poolBase(q);
  if (!q.get('room') || !base || !opts.wasm) return null;
  try {
    const a = await ask(base, opts, q.get('room'));
    Object.assign(room, { id: a.room, invite: inviteTo(a.room, q).href, why: a.why || '' });
    return { url: a.url, hash: a.hash, pool: true };
  } catch (e) { room.why = String(e.message || e); return null; }
}

// Can this page offer to go online: no relay of its own, and a pool to ask?
export async function canGoOnline(q) {
  if (q.get('url') || kit.relay?.url || isHash(q.get('hash') || '') || isHash(await certs())) return false;
  return !!poolBase(q);
}

// A fresh room from the pool for this page's game: the address to go to, its
// invite (and the rest of this page's query, but ?local), or throws why not.
export async function goOnline(q, opts) {
  const base = poolBase(q);
  if (!base) throw new Error('no room pool for this page');
  const a = await ask(base, opts);
  const to = inviteTo(a.room, q);
  for (const [k, v] of q) if (!to.searchParams.has(k) && k !== 'local') to.searchParams.set(k, v);
  return to.href;
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

// the invite to a room: Fireplace's page by the site's front door (its index keeps the query), any other page as it is
function inviteTo(id, q) {
  const site = new URL('..', import.meta.url).href;
  const link = new URL(location.pathname.endsWith('/client/fireplace.html') ? site : location.origin + location.pathname);
  link.searchParams.set('room', id);
  if (q.has('pool')) link.searchParams.set('pool', q.get('pool'));
  return link;
}

// POST <pool>rooms for this site's game (the room id's, if given): the pool's answer, or throws why not
async function ask(base, { wasm, bytes }, id) {
  const site = new URL('..', import.meta.url).href;
  const game = /\/build\/([a-z]+)\/game\.wasm$/.exec(new URL(wasm, location.href).pathname)?.[1] || 'golf';
  const sha256 = bytes ? hex(await crypto.subtle.digest('SHA-256', bytes)) : undefined;
  let res;
  try {
    res = await fetch(new URL('rooms', base), { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ site, game, sha256, ...(id ? { room: id } : {}) }), cache: 'no-store', signal: AbortSignal.timeout(30000) });
  } catch (e) { throw new Error(`the room pool is out of reach (${e.message || e})`); }
  const a = await res.json().catch(() => ({}));
  if (!res.ok || !a.url || !isHash(a.hash)) throw new Error(a.why || `the room pool answered HTTP ${res.status}`);
  return a;
}
