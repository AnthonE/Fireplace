// The relay's WebSocket door, a browser's way in without WebTransport: the
// framing (net/wire.mjs WS_*), the client's side of it (client/transport.mjs
// openWebSocket) against a door of a few lines here, where a page looks for
// the door (client/kit.mjs wsDoor), and who opens it. The relay's own side
// runs under Deno: net/run-arena.mjs --ws is its gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as W from '../net/wire.mjs';
import { openWebSocket } from '../client/transport.mjs';

const { wsDoor, wsForced } = await import('../client/kit.mjs');

// A WebSocket server, as little of RFC 6455 as a test needs: binary messages
// under 64 KiB, unfragmented. peer: { got: [Uint8Array], send(bytes), close() }.
function door() {
  const peers = [];
  let waiting = null;
  const server = createServer();
  server.on('upgrade', (req, sock) => {
    const accept = createHash('sha1').update(`${req.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
    sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const frame = (op, b) => Buffer.concat([Buffer.from(b.length < 126 ? [0x80 | op, b.length] : [0x80 | op, 126, b.length >> 8, b.length & 255]), b]);
    const peer = { got: [], send: (b) => sock.write(frame(2, Buffer.from(b))), close: () => sock.end(frame(8, Buffer.alloc(0))) };
    let buf = Buffer.alloc(0);
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      for (;;) {
        if (buf.length < 2) return;
        let n = buf[1] & 127, o = 2;
        if (n === 126) { if (buf.length < 4) return; n = buf.readUInt16BE(2); o = 4; }
        if (buf.length < o + 4 + n) return;
        const mask = buf.subarray(o, o + 4);
        const body = Uint8Array.from(buf.subarray(o + 4, o + 4 + n), (v, k) => v ^ mask[k & 3]);
        if ((buf[0] & 15) === 2) peer.got.push(body);
        if ((buf[0] & 15) === 8) sock.end(frame(8, Buffer.alloc(0)));
        buf = buf.subarray(o + 4 + n);
      }
    });
    sock.on('error', () => {});
    peers.push(peer);
    waiting?.(peer);
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({
    port: server.address().port,
    peer: () => (peers.length ? Promise.resolve(peers[0]) : new Promise((got) => { waiting = got; })),
    close: () => new Promise((done) => { server.closeAllConnections?.(); server.close(done); }),
  })));
}
const until = async (fn) => { for (let k = 0; k < 200 && !fn(); k++) await new Promise((ok) => setTimeout(ok, 10)); return fn(); };

test('a WebSocket message is the stream\'s bytes or one datagram, by its first byte', () => {
  assert.deepEqual([W.WS_STREAM, W.WS_DATAGRAM], [0, 1]);
  assert.deepEqual([...W.wsFrame(W.WS_STREAM, new Uint8Array([7, 8, 9]))], [0, 7, 8, 9]);
  assert.deepEqual([...W.wsFrame(W.WS_DATAGRAM, new Uint8Array([]))], [1]);
  // a datagram goes whole: what the relay decodes is what the client encoded, with no token before it
  const d = W.encodeInput({ seq: 3, firstTick: 40, ackTick: 38, ackBits: 0xffn, words: [1, 2] });
  const f = W.wsFrame(W.WS_DATAGRAM, d);
  assert.equal(f.length, d.length + 1);
  assert.deepEqual([...W.decodeInput(f.subarray(1)).words], [1, 2]);
});

test('the client\'s side: stream bytes and datagrams go out tagged, come back sorted, and a close ends both', async () => {
  const srv = await door();
  const t = await openWebSocket(`ws://127.0.0.1:${srv.port}/`);
  const peer = await srv.peer();
  assert.equal(t.kind, 'websocket');
  assert.equal(t.maxDatagram, W.MAX_DATAGRAM);
  // out: a hello on the stream, then a datagram
  const hello = W.encodeHello({ maxDatagram: t.maxDatagram, wasmPrefix: new Uint8Array(8), chat: true });
  const input = W.encodeInput({ seq: 0, firstTick: 9, ackTick: 0, ackBits: 0n, words: [5] });
  await t.sw.write(hello);
  await t.dw.write(input);
  assert.ok(await until(() => peer.got.length === 2));
  assert.deepEqual([...peer.got[0]], [W.WS_STREAM, ...hello]);
  assert.deepEqual([...peer.got[1]], [W.WS_DATAGRAM, ...input]);
  // back: a welcome cut in two messages with a datagram between its halves, then a pong and a line of chat in one
  const welcome = W.encodeWelcome({ slot: 3, maxDatagram: 1161, joinTick: 50, seed: 7, serverTick: 46 });
  const bundle = W.stampTrailer(W.encodeTicks(W.T_BUNDLE, [{ tick: 50, parts: W.encodeTick([], new Uint32Array(W.NP), new Uint32Array(W.NP)) }])[0], { inAck: 49, slack: 3, late: 0 });
  const rest = new Uint8Array([...W.encodePong(1, 51.5), ...W.encodeChat('hi', 3)]);
  peer.send(W.wsFrame(W.WS_STREAM, welcome.subarray(0, 10)));
  peer.send(W.wsFrame(W.WS_DATAGRAM, bundle));
  peer.send(W.wsFrame(W.WS_STREAM, welcome.subarray(10)));
  peer.send(W.wsFrame(W.WS_STREAM, rest));
  assert.equal(W.decodeWelcome(await t.sr.read(32)).slot, 3);
  assert.deepEqual(await W.readControl(t.sr), { type: W.T_PONG, nonce: 1, serverTick: 51.5 });
  assert.deepEqual(await W.readControl(t.sr), { type: W.T_CHAT, kind: W.CHAT.LINE, slot: 3, text: 'hi' });
  const it = t.datagrams[Symbol.asyncIterator]();
  const first = await it.next();
  assert.deepEqual(W.decodeTicks(first.value).entries.map((e) => e.tick), [50]);
  // the door shuts: the stream reads short, which the net worker takes as the end, and the datagrams are done
  peer.close();
  assert.equal(await W.readControl(t.sr), null);
  assert.equal((await it.next()).done, true);
  // nothing is written to a socket that has closed, and nothing throws
  await t.sw.write(hello);
  await t.dw.write(input);
  await srv.close();
});

test('no door at the address: the open says so', async () => {
  const srv = await door();
  const { port } = srv;
  await srv.close();
  await assert.rejects(openWebSocket(`ws://127.0.0.1:${port}/`), /no WebSocket door at ws:\/\/127\.0\.0\.1/);
});

test('where a page looks for the door: the relay\'s own host and port, unless it is told', () => {
  const q = (s = '') => new URLSearchParams(s);
  // on TCP at the relay's number: wss from an https page, ws from an http one
  assert.equal(wsDoor('https://127.0.0.1:4433/', q(), { secure: false, ws: '' }), 'ws://127.0.0.1:4433/');
  assert.equal(wsDoor('https://game.example.com:61290/', q(), { secure: true, ws: '' }), 'wss://game.example.com:61290/');
  assert.equal(wsDoor('https://game.example.com/', q(), { secure: true, ws: '' }), 'wss://game.example.com:443/');
  assert.equal(wsDoor('https://[::1]:4433/', q(), { secure: false, ws: '' }), 'ws://[::1]:4433/');
  // several relays, for failover: a door each, in order
  assert.equal(wsDoor('https://a:1/,https://b:2/', q(), { secure: false, ws: '' }), 'ws://a:1/,ws://b:2/');
  // kit.json's relay.ws, with the relay's own host and port where it asks: one line for a pool's rooms behind a proxy
  assert.equal(wsDoor('https://game.example.com:61290/,https://game.example.com:61291/', q(), { secure: true, ws: 'wss://game.example.com/ws/{port}' }),
    'wss://game.example.com/ws/61290,wss://game.example.com/ws/61291');
  assert.equal(wsDoor('https://h:9/', q(), { secure: true, ws: 'wss://{host}:8443/' }), 'wss://h:8443/');
  // ?ws=: an address for this visit over kit.json's; 1 the usual place; 0 never
  assert.equal(wsDoor('https://h:9/', q('ws=ws://127.0.0.1:4700/'), { secure: true, ws: 'wss://x/{port}' }), 'ws://127.0.0.1:4700/');
  assert.equal(wsDoor('https://h:9/', q('ws=1'), { secure: false, ws: '' }), 'ws://h:9/');
  assert.equal(wsDoor('https://h:9/', q('ws=0'), { secure: false, ws: 'wss://x/' }), '');
  // forced past WebTransport by 1 or an address, by nothing else
  assert.deepEqual(['ws=1', 'ws=ws://h:1/', 'ws=wss://h/x', 'ws=0', '', 'ws=yes'].map((s) => wsForced(q(s))), [true, true, true, false, false, false]);
});

test('who opens it: the relay on --ws-port, play.mjs beside the page, a pool that asks, the gate and CI', () => {
  const read = (f) => readFileSync(f, 'utf8');
  const relay = read('net/relay.ts');
  assert.match(relay, /const wsPort = Number\(opt\('ws-port', '0'\)\); \/\/ 0: no WebSocket door/);
  assert.match(relay, /Deno\.upgradeWebSocket\(req\)/);
  assert.match(relay, /door: 'websocket'/);
  // the net worker takes it when the browser has no WebTransport, or when told
  assert.match(read('client/net.mjs'), /ws && \(forceWs \|\| !quic\) \? await openWebSocket\(ws\) : await openWebTransport\(url, certHash\)/);
  assert.match(read('client/host.mjs'), /ws: relay\.ws, forceWs: wsForced\(q\)/);
  assert.match(read('client/main.mjs'), /ws: wsDoor\(url, q\), forceWs: wsForced\(q\)/);
  assert.match(read('net/play.mjs'), /'--port', port, '--ws-port', port,/);
  assert.match(read('net/rooms.mjs'), /\.\.\.\(c\.ws \? \['--ws-port', String\(port\)\] : \[\]\)/);
  assert.match(read('net/kit-rooms.mjs'), /native_offset: c\.native_offset, ws: c\.ws,/);
  assert.match(read('net/run-arena.mjs'), /overWebSocket:/);
  assert.match(read('.github/workflows/determinism.yml'), /node net\/run-arena\.mjs --ws /);
});
