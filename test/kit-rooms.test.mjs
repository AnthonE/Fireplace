// The kit's room pool (net/kit-rooms.mjs), the parts that decide what it
// fetches and from where; net/run-kit-rooms.mjs is the gate for the rest.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { originMatch, siteOf, fetchWasm, MAP_NAME } from '../net/kit-rooms.mjs';
import { simRefusal, mapRefusal } from '../net/sim-check.mjs';
import { compileMap } from '../tools/map.mjs';
import { packMap } from '../tools/map-compile.mjs';

test('origins match by scheme, host and port, *. for any subdomain', () => {
  const pages = 'https://*.github.io';
  assert.ok(originMatch(pages, 'https://kid.github.io/my-game/'));
  assert.ok(originMatch(pages, 'https://Kid.GitHub.io'));
  assert.ok(!originMatch(pages, 'https://github.io/'));
  assert.ok(!originMatch(pages, 'http://kid.github.io/'));
  assert.ok(!originMatch(pages, 'https://kid.github.io:8443/'));
  assert.ok(!originMatch(pages, 'https://kid.github.io.evil.com/'));
  assert.ok(!originMatch(pages, 'https://evilgithub.io/'));
  assert.ok(originMatch('http://127.0.0.1:5000', 'http://127.0.0.1:5000/x/'));
  assert.ok(!originMatch('http://127.0.0.1:5000', 'http://127.0.0.1:5001/x/'));
  assert.ok(!originMatch('not a pattern', 'https://kid.github.io/'));
});

test('a site is an allowed origin and a plain path, ending in /', () => {
  const from = ['https://*.github.io'];
  assert.equal(siteOf('https://kid.github.io/my-game', from), 'https://kid.github.io/my-game/');
  assert.equal(siteOf('https://kid.github.io/my-game/index.html', from), 'https://kid.github.io/my-game/');
  assert.equal(siteOf('https://kid.github.io/', from), 'https://kid.github.io/');
  const refused = (s, status, why) => assert.throws(() => siteOf(s, from), (e) => e.status === status && why.test(e.message), s);
  refused('https://evil.example.com/game/', 403, /not a host this pool fetches games from/);
  refused('https://kid.github.io/game/?x=1', 400, /no query/);
  refused('https://user:pw@kid.github.io/game/', 400, /no query/);
  refused('https://kid.github.io/a%20b/', 400, /not a page's path/);
  refused('nothing', 400, /address/);
});

test('a fetch follows no redirect, stops past its size, and gives up in time', async () => {
  const server = createServer((req, res) => {
    if (req.url === '/ok') res.end(Buffer.alloc(100, 7));
    else if (req.url === '/moved') res.writeHead(301, { Location: '/ok' }).end();
    else if (req.url === '/big') res.writeHead(200, { 'Content-Length': '5000' }).end(Buffer.alloc(5000));
    else if (req.url === '/stream') { res.writeHead(200); const t = setInterval(() => res.write(Buffer.alloc(400)), 5); req.on('close', () => clearInterval(t)); }
    else if (req.url === '/slow') { /* never answers */ }
    else res.writeHead(404).end();
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const at = (p) => `http://127.0.0.1:${server.address().port}${p}`;
  try {
    assert.equal((await fetchWasm(at('/ok'), 1000, 2)).length, 100);
    const refused = async (p, status, why) => assert.rejects(fetchWasm(at(p), 1000, 1), (e) => e.status === status && why.test(e.message), p);
    await refused('/moved', 502, /redirects/);
    await refused('/big', 413, /more than 1000 bytes/);
    await refused('/stream', 413, /more than 1000 bytes/);
    await refused('/slow', 502, /no answer in 1 s/);
    await refused('/gone', 502, /HTTP 404/);
  } finally { server.closeAllConnections(); server.close(); }
});

test('the referee\'s check: memory only, every export it calls', async () => {
  const wabt = await (createRequire(import.meta.url)('wabt'))();
  const wasm = (wat) => wabt.parseWat('t.wat', wat, { threads: true }).toBinary({}).buffer;
  const MEM = '(import "env" "mem" (memory 1 1 shared))';
  const SIM = '(func (export "init") (param i32)) (func (export "step")) (func (export "snapshot") (param i32)) (func (export "regrid"))';
  assert.equal(await simRefusal(wasm(`(module ${MEM} ${SIM})`), 1), null);
  assert.match(await simRefusal(wasm(`(module ${MEM} ${SIM})`), 2), /does not export step_mt, worker_run/);
  assert.match(await simRefusal(wasm(`(module ${MEM} (import "env" "now" (func (result f64))) ${SIM})`), 1), /env\.now \(function\)/);
  assert.match(await simRefusal(wasm(`(module ${SIM})`), 1), /imports nothing/);
  assert.match(await simRefusal(new Uint8Array([1, 2, 3]), 1), /not a wasm module/);
  // the games this repo builds pass as the relay runs them, two referee threads
  for (const f of ['build/game.wasm', 'build/fireplace/game.wasm']) {
    let bytes;
    try { bytes = readFileSync(f); } catch { continue; } // npm run build makes them
    assert.equal(await simRefusal(bytes, 2), null, f);
  }
});

test('a map is checked by the sim\'s own map_load, as the referee will lay it', async (t) => {
  let arena, fireplace;
  try { [arena, fireplace] = ['build/arena/game.wasm', 'build/fireplace/game.wasm'].map((f) => readFileSync(f)); } catch { return t.skip('npm run build makes them'); }
  const crossroads = packMap(compileMap('maps/crossroads'));
  assert.equal(await mapRefusal(arena, crossroads), null);
  assert.match(await mapRefusal(arena, new Uint8Array(200).fill(0xff)), /the map was refused/);
  assert.match(await mapRefusal(fireplace, crossroads), /takes no map/);
  assert.match(await mapRefusal(new Uint8Array([1, 2, 3]), crossroads), /would not start/);
  // a name is what the site publishes as build/maps/<name>.qgmap, never a path
  for (const ok of ['crossroads', 'my-map_2']) assert.ok(MAP_NAME.test(ok), ok);
  for (const no of ['', '../x', 'a/b', 'x.qgmap', 'x'.repeat(65)]) assert.ok(!MAP_NAME.test(no), no);
});
