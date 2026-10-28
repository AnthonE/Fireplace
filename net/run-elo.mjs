#!/usr/bin/env node
// Elo Pros online: a relay on Fireplace's sim with sign-in and rated results
// on (net/relay.ts --signin-domains, --elo-key), pointed at a stand-in for
// Elo Pros here (its sign-in check and its ratings report), and guests through
// the native door (net/bot-host.mjs --fireplace --signin), each its own made-up
// wallet, one of them refused. Passes when every other guest was signed in,
// the room's first game ended and the relay reported it once, signed with the
// game's server key over the text Elo Pros checks, as a match of the signed-in
// guests at the places every client saw (the bot host's shared world), with
// the refused guest left out.
//   node net/run-elo.mjs [--bots 6] [--seconds 150] [--port 4441: the relay's, its native door the next, the stand-in the one after]
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { generateKeyPairSync, verify as edVerify, createHash } from 'node:crypto';
import * as Elo from './elo.mjs';
import * as L from '../src/layout.mjs';
import { serverText } from './elo.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const nbots = Number(opt('bots', 6));
const seconds = Number(opt('seconds', 150));
const port = Number(opt('port', 4441));
const DENO = existsSync('.tools/deno') ? '.tools/deno' : 'deno';
const DOMAIN = 'fireplace.test';
const WHO = 'fireplace/gate';
// the bot host's made-up wallet for its session k (net/bot-host.mjs)
const walletOf = (k) => '0x' + (0xb07 * 2 ** 32 + k).toString(16).padStart(40, '0');
const REFUSED = walletOf(1);

execFileSync('sh', ['tools/cert.sh'], { stdio: 'inherit' });
execFileSync(process.execPath, ['tools/asm.mjs'], { stdio: 'inherit' });
mkdirSync('traces', { recursive: true });
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const keyPath = 'traces/elo-gate.key';
writeFileSync(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });

// The stand-in: a sign-in is good when it was made on DOMAIN with the nonce
// asked about (the wallet is the message's own; the signature goes unchecked),
// except REFUSED's; a report is good when its signature is.
const signins = [], reports = [];
const stub = createServer((req, res) => {
  let body = '';
  req.on('data', (d) => { body += d; });
  req.on('end', () => {
    const answer = (code, j) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(j)); };
    if (req.url === '/api/signin/check') {
      const b = JSON.parse(body);
      const f = Elo.parseSignIn(b.message);
      signins.push({ domain: b.domain, nonce: b.nonce, address: f?.address });
      if (!f || f.domain !== b.domain || b.domain !== DOMAIN || f.nonce !== b.nonce) return answer(401, { ok: false, code: 'fields' });
      if (f.address === REFUSED) return answer(401, { ok: false, code: 'signature' });
      return answer(200, { ok: true, address: f.address, chain: 'evm' });
    }
    if (req.url === '/api/ratings/fireplace/report') {
      const h = req.headers;
      const text = serverText('POST', req.url, h['x-elo-server'], h['x-elo-time'], h['x-elo-nonce'], createHash('sha256').update(body).digest('hex'));
      const ok = h['x-elo-server'] === WHO && edVerify(null, Buffer.from(text), publicKey, Buffer.from(h['x-elo-signature'] || '', 'base64'));
      reports.push({ ok, at: performance.now(), body: JSON.parse(body) });
      return answer(ok ? 200 : 401, ok ? { ok: true, recorded: 1 } : { error: 'bad signature' });
    }
    answer(404, { error: 'not here' });
  });
});
await new Promise((ok) => stub.listen(port + 2, '127.0.0.1', ok));

const summaryPath = 'traces/elo.relay.json', botsPath = 'traces/elo.bots.json', onlinePath = 'traces/elo.online.json';
rmSync(summaryPath, { force: true });
rmSync(botsPath, { force: true });
const t0 = performance.now();
const relay = spawn(DENO, ['run', '--unstable-net', '-A', 'net/relay.ts', '--port', String(port), '--native-port', String(port + 1), '--seed', '7',
  '--wasm', 'build/fireplace/game.wasm', '--duration', String(seconds + 20), '--summary', summaryPath, '--online', onlinePath, '--quiet',
  '--elo', `http://127.0.0.1:${port + 2}`, '--signin-domains', `other.test,${DOMAIN}`, '--elo-key', keyPath, '--elo-key-id', WHO], { stdio: ['ignore', 'inherit', 'inherit'] });
await new Promise((ok) => setTimeout(ok, 1500));
const bots = spawn(process.execPath, ['net/bot-host.mjs', '--relay', `127.0.0.1:${port + 1}`, '--bots', String(nbots), '--fireplace', '--signin', DOMAIN,
  '--seconds', String(seconds), '--out', botsPath, '--quiet'], { stdio: ['ignore', 'inherit', 'inherit'] });
// the fullest roster the relay wrote while the guests played (the online_url Elo Pros counts as play)
let roster = [];
const watch = setInterval(() => {
  try { const r = JSON.parse(readFileSync(onlinePath, 'utf8')); if (r.online.length > roster.length) roster = r.online; } catch { /* not written yet */ }
}, 250);
await Promise.all([new Promise((ok) => bots.on('exit', ok)), new Promise((ok) => relay.on('exit', ok))]);
clearInterval(watch);
stub.close();
rmSync(keyPath, { force: true });

const fails = [];
const must = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };
const rs = JSON.parse(readFileSync(summaryPath, 'utf8'));
const bs = JSON.parse(readFileSync(botsPath, 'utf8'));
const joined = bs.sessions.filter((s) => s.joined);
must(joined.length === nbots, `every guest joined (${joined.length} of ${nbots})`);
const signed = joined.filter((s) => s.signed?.status === Elo.SIGNIN.SIGNED);
must(signed.length === nbots - 1 && signed.every((s) => s.signed.address === s.wallet), `all but one guest signed in as its own wallet (${signed.length})`);
must(joined.find((s) => s.wallet === REFUSED)?.signed?.status === Elo.SIGNIN.REFUSED, 'the guest Elo Pros refused was told so');
must(rs.elo.signed === nbots - 1 && rs.elo.refused >= 1, `the relay counts ${rs.elo.signed} signed in, ${rs.elo.refused} refused`);
must(signins.every((x) => x.domain === DOMAIN), 'the relay asked about sign-ins made on its own domains only');
const lc = (ws) => ws.map((w) => String(w).toLowerCase()).sort().join();
must(lc(roster.map((r) => r.wallet)) === lc(signed.map((s) => s.wallet)) && roster.every((r) => Number.isInteger(r.since)),
  `the room's roster names every signed-in guest and nobody else (${roster.length})`);
must(!existsSync(onlinePath), 'a relay that ends removes its roster');
must(bs.results?.length >= 1, `the room's first game ended (${bs.results?.length ?? 0} results seen)`);
must(reports.length >= 1 && reports.every((r) => r.ok), `the relay reported it, signed with the game's server key (${reports.length} reports)`);
const first = bs.results?.[0], match = reports[0]?.body?.matches?.[0];
if (first && match) {
  const slotOf = new Map(signed.map((s) => [s.wallet, s.slot]));
  const placeOf = new Map(first.places);
  must(match.ladder === Elo.LADDERS[first.game], `on ${L.GAMES[first.game]}'s ladder (${match.ladder})`);
  must(match.id === `fp-${(bs.world.seed >>> 0).toString(16)}-${bs.world.roomStart >>> 0}-${first.count}`, `its id names the room and the game (${match.id})`);
  const players = match.teams.flatMap((t) => t.players);
  must(players.length === signed.filter((s) => placeOf.has(s.slot)).length && players.every((w) => slotOf.has(w)),
    `every signed-in guest in the game, and nobody else (${players.length})`);
  must(!players.includes(REFUSED), 'the refused guest left out');
  must(match.teams.every((t) => t.players.length === 1 && t.place === placeOf.get(slotOf.get(t.players[0]))),
    'each at the place every client saw');
  must(new Set(reports.map((r) => r.body.matches[0].id)).size === reports.length, 'each game reported once');
  console.log(`the first game ended ${(first.simTick / 125).toFixed(0)} s in; reported ${((reports[0].at - t0) / 1000).toFixed(0)} s after the relay started`);
}
writeFileSync('traces/elo.json', JSON.stringify({ signins, reports, relayElo: rs.elo, results: bs.results, fails }, null, 1) + '\n');
console.log(fails.length ? `FAIL: ${fails.length}` : 'PASS');
process.exit(fails.length ? 1 : 0);
