import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify as edVerify, createHash } from 'node:crypto';
import { fireplaceBytes } from './helpers.mjs';
import { Referee } from '../net/referee.mjs';
import * as W from '../net/wire.mjs';
import * as Elo from '../net/elo.mjs';
import * as L from '../src/layout.mjs';

const reader = (bytes) => W.bufferedReader(new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }).getReader());

// a sign-in message as the Elo Pros web SDK writes one (scry-forge sdk/js/elo-3.js)
const siwe = (domain, nonce, address = '0x' + 'ab'.repeat(20)) => [
  `${domain} wants you to sign in with your Ethereum account:`, address, '', 'Sign in to play.', '',
  `URI: https://${domain}`, 'Version: 1', 'Chain ID: 4663', `Nonce: ${nonce}`, `Issued At: ${new Date().toISOString()}`,
].join('\n');

test('the sign-in messages: a hello asks, the relay hands a nonce, the client sends what its wallet signed, the relay answers', async () => {
  const hello = W.decodeHello(W.encodeHello({ maxDatagram: 1200, wasmPrefix: new Uint8Array(8), signin: true, looks: true }));
  assert.equal(hello.signin, true);
  assert.equal(hello.looks, true);
  assert.equal(W.decodeHello(W.encodeHello({ maxDatagram: 1200, wasmPrefix: new Uint8Array(8) })).signin, false);
  const msg = siwe('game.elopros.com', 'abcDEF123456'), sig = '0x' + '5a'.repeat(65);
  const buf = W.encodeSignin(msg, sig);
  const head = buf.subarray(0, 16);
  const m = W.decodeClient(head);
  assert.equal(m.type, W.T_SIGNIN);
  assert.equal(m.bytes, buf.length - 16);
  assert.deepEqual(W.decodeSigninBody(head, buf.subarray(16)), { message: msg, signature: sig });
  const nonce = Elo.newNonce();
  assert.match(nonce, /^[A-Za-z0-9]{12}$/);
  const sr = reader(new Uint8Array([...W.encodeSigninNonce(nonce), ...W.encodeSigned(Elo.SIGNIN.SIGNED, '0x' + 'ab'.repeat(20)), ...W.encodeSigned(Elo.SIGNIN.OFF)]));
  assert.deepEqual(await W.readControl(sr), { type: W.T_SIGNIN, nonce });
  assert.deepEqual(await W.readControl(sr), { type: W.T_SIGNED, status: Elo.SIGNIN.SIGNED, address: '0x' + 'ab'.repeat(20) });
  assert.deepEqual(await W.readControl(sr), { type: W.T_SIGNED, status: Elo.SIGNIN.OFF, address: '' });
});

test("a sign-in's domain and nonce, read off the message the SDK writes; anything else isn't one", () => {
  assert.deepEqual(Elo.parseSignIn(siwe('game.elopros.com', 'abcDEF123456')),
    { domain: 'game.elopros.com', chain: 'evm', address: '0x' + 'ab'.repeat(20), nonce: 'abcDEF123456' });
  assert.equal(Elo.parseSignIn(siwe('game.elopros.com', 'abcDEF123456').replace('Ethereum', 'Solana')).chain, 'solana');
  assert.equal(Elo.parseSignIn('hello'), null);
  assert.equal(Elo.parseSignIn(siwe('x.com', 'short')), null, 'a nonce under 8 characters');
  assert.equal(Elo.parseSignIn('x'.repeat(Elo.MESSAGE_MAX + 1)), null);
  assert.equal(Elo.normWallet('0xABCDEF0123456789abcdef0123456789ABCDEF01'), '0xabcdef0123456789abcdef0123456789abcdef01');
  assert.equal(Elo.normWallet('4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T'), '4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T');
});

test('a result as a rated match: signed-in players only, at their places, one seat a wallet, an id per game in the room', () => {
  const W1 = '0x' + '11'.repeat(20), W2 = '0x' + '22'.repeat(20), W3 = '0x' + '33'.repeat(20);
  const seat = { 0: W1, 1: W2, 2: null, 3: W3, 4: W1 };
  const result = { game: L.G_ARENA, count: 3, places: [[0, 2], [1, 1], [2, 3], [3, 1], [4, 5]] };
  const m = Elo.matchOf({ seed: 0xdeadbeef, roomStart: 1200, result, wallet: (p) => seat[p] ?? null });
  assert.equal(m.id, 'fp-deadbeef-1200-3');
  assert.equal(m.ladder, 'arena');
  assert.deepEqual(m.teams, [{ players: [W1], place: 2 }, { players: [W2], place: 1 }, { players: [W3], place: 1 }],
    'the guest is left out, ties share a place, and a wallet seen twice keeps its better one');
  assert.equal(Elo.matchOf({ seed: 1, roomStart: 0, result: { ...result, places: [[0, 1], [2, 2]] }, wallet: (p) => seat[p] ?? null }), null,
    'one signed-in player is not a match');
  assert.deepEqual(Elo.LADDERS.map((_, g) => Elo.matchOf({ seed: 1, roomStart: 0, result: { game: g, count: 1, places: [[0, 1], [1, 2]] }, wallet: (p) => seat[p] }).ladder),
    ['golf', 'arena', 'bumper', 'party']);
});

test("a report carries the game server's signature over the text Elo Pros checks (serverkeys.message)", async () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const key = await Elo.loadKey(privateKey.export({ type: 'pkcs8', format: 'pem' }));
  const body = new TextEncoder().encode(JSON.stringify({ matches: [] }));
  const h = await Elo.serverHeaders(key, 'fireplace/room-1', 'POST', '/api/ratings/fireplace/report', body);
  assert.equal(h['X-Elo-Server'], 'fireplace/room-1');
  assert.match(h['X-Elo-Nonce'], /^[A-Za-z0-9]{16}$/);
  assert.ok(Math.abs(Number(h['X-Elo-Time']) - Date.now() / 1000) < 5);
  const text = ['elo server', 'POST', '/api/ratings/fireplace/report', 'fireplace/room-1', h['X-Elo-Time'], h['X-Elo-Nonce'],
    createHash('sha256').update(body).digest('hex')].join('\n');
  assert.equal(text, Elo.serverText('POST', '/api/ratings/fireplace/report', 'fireplace/room-1', h['X-Elo-Time'], h['X-Elo-Nonce'], createHash('sha256').update(body).digest('hex')));
  assert.ok(edVerify(null, Buffer.from(text), publicKey, Buffer.from(h['X-Elo-Signature'], 'base64')));
});

test("the referee says when a game ends, with the places the room shows, once; with results off it says nothing", async () => {
  const run = async (results) => {
    const ref = await Referee.create(fireplaceBytes(results), 1, results);
    ref.reset(7);
    const join = { ev: [0, 1, 2].map((slot) => ({ slot, kind: W.EV_JOIN })), w: [] };
    ref.step(join);
    for (let t = 0; t < 50; t++) ref.step({ ev: [], w: [] });
    assert.equal(ref.result, null, 'nothing ended yet');
    // bumper balls' last round over, as test/fireplace.test.mjs's atTheEnd puts it: wins 2, 0, 1
    const dv = ref.dv;
    dv.setUint8(L.FP_COUNT, L.FP_MATCHES[L.G_BUMPER] - 1);
    dv.setUint16(L.FP_COUNT + 2, 0, true);
    dv.setUint32(L.HDR_STATE, L.H_OVER, true);
    dv.setUint32(L.HDR_UNTIL, ref.tick + 5000, true);
    [2, 0, 1].forEach((wins, p) => {
      dv.setUint16(L.PLAYERS + p * L.PSIZE + L.B_ROUNDS, 2, true);
      dv.setUint16(L.PLAYERS + p * L.PSIZE + L.B_WINS, wins, true);
    });
    const got = [];
    for (let t = 0; t < 20; t++) { ref.step({ ev: [], w: [] }); if (ref.result) { got.push(ref.result); ref.result = null; } }
    return { got, ref };
  };
  const { got, ref } = await run(true);
  assert.equal(got.length, 1, 'one result for one game, though it is held for many ticks');
  assert.equal(ref.dv.getUint32(L.FP_STAGE, true), 1);
  const r = got[0];
  assert.equal(r.game, L.G_BUMPER);
  assert.equal(r.count, 0, "the room's first game: none played before it");
  assert.deepEqual(r.places, [[0, 1], [1, 3], [2, 2]]);
  assert.deepEqual(r.places, [0, 1, 2].map((p) => [p, ref.u8[L.FP_LAST + p]]), 'the places FP_LAST holds');
  assert.equal(Elo.matchOf({ seed: 7, roomStart: 0, result: r, wallet: (p) => `0x${String(p).repeat(40)}` }).ladder, 'bumper');
  assert.deepEqual((await run(false)).got, []);
});
