// Elo Pros for the relay: a player's sign-in, and each game's result as a
// rated match. The relay hands each player a nonce, the page has the player's
// wallet sign it (Sign-In With Ethereum, through the Elo Pros web SDK), and
// the relay asks Elo Pros whether the signature is good (POST /api/signin/check).
// When a game in the playlist ends, the referee reads the places it gave from
// the confirmed world (FP_LAST, as the room shows them), and the relay reports
// the signed-in players' places to POST /api/ratings/<slug>/report, signed with
// the game's server key (Ed25519). Results come from the referee, never from a
// client. Runs in Deno (the relay), Node (the tests) and Workers.
import * as L from '../src/layout.mjs';

// The ratings ladder for each game, by G_*: a game's skill is its own.
export const LADDERS = ['golf', 'arena', 'bumper', 'party'];

// What a sign-in got, the relay's answer (W.T_SIGNED).
export const SIGNIN = { SIGNED: 1, REFUSED: 2, UNCHECKED: 3, OFF: 4, ELSEWHERE: 5 };
export const MESSAGE_MAX = 2048;
export const SIGNATURE_MAX = 16384;

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
export function newNonce(n = 12) {
  const r = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(r, (b) => ALNUM[b % ALNUM.length]).join('');
}

// The fields of a sign-in message the relay checks before asking: the domain
// it was made on (its first line) and its nonce. The signature is Elo Pros's
// to check. Null if it isn't one.
export function parseSignIn(message) {
  if (typeof message !== 'string' || message.length > MESSAGE_MAX) return null;
  const lines = message.split('\n');
  const head = /^(\S+) wants you to sign in with your (Ethereum|Solana) account:$/.exec(lines[0] || '');
  const nonce = lines.map((l) => /^Nonce: ([A-Za-z0-9]{8,128})$/.exec(l)).find(Boolean);
  if (!head || !nonce) return null;
  return { domain: head[1], chain: head[2] === 'Solana' ? 'solana' : 'evm', address: (lines[1] || '').trim(), nonce: nonce[1] };
}

// One spelling of a wallet: an Ethereum address lowercased, a Solana one as it is.
export const normWallet = (a) => (/^0x[0-9a-fA-F]{40}$/.test(a) ? a.toLowerCase() : a);

// The game that just ended, read from a Fireplace world while its result is
// held (FP_STAGE 1): { game, count (the games the room played before this
// one), places: [[slot, place], ...] for every slot in it, 1 the best }.
export function readResult(u8, dv) {
  const places = [];
  for (let p = 0; p < L.NPLAYER; p++) if (u8[L.FP_LAST + p]) places.push([p, u8[L.FP_LAST + p]]);
  return { game: dv.getUint32(L.FP_GAME, true), count: dv.getUint16(L.FP_COUNT + 2, true), places };
}

// A result as the match Elo Pros rates, or null when fewer than two of its
// players had signed in. wallet(slot) is the wallet signed in on that slot as
// the game ended (null for a guest). A free-for-all: each player a side of one,
// at the place the game gave (ties share it). The id names the room (its seed
// and start) and the game's number in it, so a report sent twice, or by a
// standby that took the room over, is rated once.
export function matchOf({ seed, roomStart, result, wallet }) {
  const best = new Map();
  for (const [slot, place] of result.places) {
    const w = wallet(slot);
    if (w && !(best.get(w) <= place)) best.set(w, place);
  }
  if (best.size < 2) return null;
  return {
    id: `fp-${(seed >>> 0).toString(16)}-${roomStart >>> 0}-${result.count}`,
    ladder: LADDERS[result.game] ?? `game${result.game}`,
    teams: [...best].map(([w, place]) => ({ players: [w], place })),
  };
}

// A server key: the private half of an Ed25519 key in PEM (openssl genpkey
// -algorithm ed25519), whose public half the developer named on Elo Pros.
export async function loadKey(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', der, { name: 'Ed25519' }, false, ['sign']);
}

const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));

// The text a game server signs (scry-forge meter/serverkeys.py, `message`).
export const serverText = (method, path, who, at, nonce, bodySha) => `elo server\n${method}\n${path}\n${who}\n${at}\n${nonce}\n${bodySha}`;

// The headers that prove a request is from the game's own server: who is
// `<slug>/<key id>`, path the one requested.
export async function serverHeaders(key, who, method, path, body) {
  const at = String(Math.floor(Date.now() / 1000));
  const nonce = newNonce(16);
  const text = serverText(method, path, who, at, nonce, hex(await crypto.subtle.digest('SHA-256', body)));
  const sig = await crypto.subtle.sign('Ed25519', key, new TextEncoder().encode(text));
  return { 'X-Elo-Server': who, 'X-Elo-Time': at, 'X-Elo-Nonce': nonce, 'X-Elo-Signature': b64(sig) };
}
