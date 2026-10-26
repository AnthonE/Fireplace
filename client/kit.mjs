// The page's own settings, client/kit.json: the game's name and tagline for
// the TV's title card (node tools/kit.mjs init writes them), and where its
// online room is. A fresh copy of this repo names no relay, so its page asks
// the kit's room pool (net/kit-rooms.mjs) for a room running its own wasm,
// and plays a local room (client/local.mjs) if the pool can't give one.
//   relay.url       the relay's address, https://host:port/ (several, comma-separated, fail over in turn)
//   relay.hash      its certificate's sha-256, base64, as tools/cert.sh writes certs/hash.txt
//   relay.hash_url  or an https URL that serves that hash, for a relay whose 13-day
//                   certificate rotates (the host must allow this page's origin, CORS)
//   relay.pool      the room pool, POOL unless set; "" for none
export const kit = await fetch(new URL('./kit.json', import.meta.url), { cache: 'no-cache' })
  .then((r) => (r.ok ? r.json() : {}))
  .catch(() => ({}));

const text = (url) => fetch(url, { cache: 'no-cache' }).then((r) => (r.ok ? r.text() : '')).then((s) => s.trim()).catch(() => '');
// a certificate hash is 32 bytes in base64; anything else (a host's 404 page) is none
const isHash = (s) => { try { return atob(s).length === 32; } catch { return false; } };

export const POOL = 'https://game.elopros.com/kit/';
// the pool's room, once it has given one: its id and a link that opens it; or why the room is local
export const room = { id: '', invite: '', why: '' };

// Where this page's room is, in order: ?local=1 none; ?url= (with ?hash=, or
// the kit's hash); the kit's relay; the page's own host on 4433 with
// certs/hash.txt beside it (node net/play.mjs); a room from the pool for this
// page's wasm (opts.wasm, its bytes opts.bytes), the invite's (?room=) if it
// can. The pool is ?pool= or relay.pool; the default pool is asked only from
// an https page on another host (a copy's Pages site, not a dev server or the
// pool's own). None of those, or a pool that can't give a room: null, and
// the page plays a local room, room.why saying why. A relay named with no
// hash to pin is an error.
export async function relayFor(q, opts = {}) {
  if (q.get('local') === '1') return null;
  const r = kit.relay || {};
  const kitHash = async () => (isHash(r.hash) ? r.hash : r.hash_url ? text(r.hash_url) : '');
  const certs = () => text(new URL('../certs/hash.txt', import.meta.url));
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
  const pool = q.has('pool') ? q.get('pool') : r.pool ?? POOL;
  if (!pool || pool === '0' || !opts.wasm) return null;
  let base;
  try { base = new URL(pool.endsWith('/') ? pool : `${pool}/`, location.href); } catch { room.why = `relay.pool ${pool} is not a URL`; return null; }
  if (base.origin === location.origin) return null;
  if (base.href === POOL && location.protocol !== 'https:') return null;
  try { return await fromPool(base, q, opts); } catch (e) { room.why = String(e.message || e); return null; }
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

// POST <pool>rooms for this site's game: the room's { url, hash }, or throws why not
async function fromPool(base, q, { wasm, bytes }) {
  const site = new URL('..', import.meta.url).href;
  const game = /\/build\/([a-z]+)\/game\.wasm$/.exec(new URL(wasm, location.href).pathname)?.[1] || 'golf';
  const sha256 = bytes ? hex(await crypto.subtle.digest('SHA-256', bytes)) : undefined;
  const ask = { site, game, sha256, ...(q.get('room') ? { room: q.get('room') } : {}) };
  let res;
  try {
    res = await fetch(new URL('rooms', base), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ask), cache: 'no-store', signal: AbortSignal.timeout(30000) });
  } catch (e) { throw new Error(`the room pool is out of reach (${e.message || e})`); }
  const a = await res.json().catch(() => ({}));
  if (!res.ok || !a.url || !isHash(a.hash)) throw new Error(a.why || `the room pool answered HTTP ${res.status}`);
  // the invite: Fireplace's page by the site's front door (its index keeps the query), any other page as it is
  const page = location.pathname.endsWith('/client/fireplace.html') ? site : location.origin + location.pathname;
  const link = new URL(page);
  link.searchParams.set('room', a.room);
  if (q.has('pool')) link.searchParams.set('pool', q.get('pool'));
  Object.assign(room, { id: a.room, invite: link.href, why: a.why || '' });
  return { url: a.url, hash: a.hash, pool: true };
}
