// The page's own settings, client/kit.json: the game's name and tagline for
// the TV's title card (node tools/kit.mjs init writes them), and where its
// online room is. A fresh copy of this repo names no relay, so its page plays
// a local room (client/local.mjs) until one is set.
//   relay.url       the relay's address, https://host:port/ (several, comma-separated, fail over in turn)
//   relay.hash      its certificate's sha-256, base64, as tools/cert.sh writes certs/hash.txt
//   relay.hash_url  or an https URL that serves that hash, for a relay whose 13-day
//                   certificate rotates (the host must allow this page's origin, CORS)
export const kit = await fetch(new URL('./kit.json', import.meta.url), { cache: 'no-cache' })
  .then((r) => (r.ok ? r.json() : {}))
  .catch(() => ({}));

const text = (url) => fetch(url, { cache: 'no-cache' }).then((r) => (r.ok ? r.text() : '')).then((s) => s.trim()).catch(() => '');
// a certificate hash is 32 bytes in base64; anything else (a host's 404 page) is none
const isHash = (s) => { try { return atob(s).length === 32; } catch { return false; } };

// Where this page's room is, in order: ?local=1 none; ?url= (with ?hash=, or
// the kit's hash); the kit's relay; the page's own host on 4433 with
// certs/hash.txt beside it (node net/play.mjs). None of those: null, and the
// page plays a local room. A relay named with no hash to pin is an error.
export async function relayFor(q) {
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
  if (!isHash(hash)) return null;
  url = `https://${location.hostname}:4433/`;
  return { url, hash };
}
