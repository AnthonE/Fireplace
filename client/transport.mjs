// How a session reaches its relay: WebTransport, or in a browser without it
// the relay's WebSocket door (net/relay.ts --ws-port). Either way the net
// worker (client/net.mjs) gets the same thing: the stream (sw to write, sr to
// read whole messages from) and the datagrams (dw to write, an async iterator
// to read), close(), and the largest datagram to ask the relay for.
import * as W from '../net/wire.mjs';

export async function openWebTransport(url, certHash) {
  const wt = new WebTransport(url, { serverCertificateHashes: [{ algorithm: 'sha-256', value: certHash }], congestionControl: 'low-latency' });
  await wt.ready;
  try { wt.datagrams.outgoingMaxAge = 2 * W.TICK_MS; } catch { /* optional */ }
  // a busy moment on this worker must not drop bundles queued for it
  try { wt.datagrams.incomingHighWaterMark = 256; } catch { /* optional */ }
  const bidi = await wt.createBidirectionalStream();
  return {
    kind: 'webtransport', sw: bidi.writable.getWriter(), sr: W.bufferedReader(bidi.readable.getReader()),
    dw: wt.datagrams.writable.getWriter(), datagrams: readable(wt.datagrams.readable), maxDatagram: wt.datagrams.maxDatagramSize, close: () => wt.close(),
  };
}

// The relay's WebSocket door (net/relay.ts --ws-port): one binary message a
// unit, the stream's bytes or a datagram by its first byte (net/wire.mjs
// WS_*). TCP under it delivers everything in order, so nothing is lost and
// nothing needs a repair; a lost packet holds up what follows it, and the
// bundles behind it land together, late. An input datagram is not queued
// behind WS_BACKLOG unsent bytes: its words would be late, and the next
// datagram carries them again.
const WS_BACKLOG = 64 * 1024;
export async function openWebSocket(url) {
  const ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';
  // each kind of message as it comes, for a reader that waits for the next
  const queue = () => {
    const got = [];
    let wake = null, ended = false;
    return {
      push(b) { got.push(b); wake?.(); },
      end() { ended = true; wake?.(); },
      async read() {
        while (!got.length && !ended) await new Promise((ok) => { wake = ok; });
        return got.length ? { value: got.shift(), done: false } : { value: undefined, done: true };
      },
    };
  };
  const stream = queue(), dgrams = queue();
  ws.onmessage = (e) => {
    const b = new Uint8Array(e.data);
    if (b[0] === W.WS_STREAM) stream.push(b.subarray(1));
    else if (b[0] === W.WS_DATAGRAM) dgrams.push(b.subarray(1));
  };
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = () => no(new Error(`no WebSocket door at ${url}`)); });
  ws.onerror = null;
  ws.onclose = () => { stream.end(); dgrams.end(); };
  const send = (tag, b) => { if (ws.readyState === WebSocket.OPEN) ws.send(W.wsFrame(tag, b)); };
  return {
    kind: 'websocket', sw: { write: async (b) => send(W.WS_STREAM, b), close: async () => ws.close() }, sr: W.bufferedReader(stream),
    dw: { write: async (b) => { if (ws.bufferedAmount <= WS_BACKLOG) send(W.WS_DATAGRAM, b); } },
    datagrams: (async function* () { for (;;) { const { value, done } = await dgrams.read(); if (done) return; yield value; } })(),
    maxDatagram: W.MAX_DATAGRAM, close: () => ws.close(),
  };
}

async function* readable(stream) {
  const r = stream.getReader();
  try {
    for (;;) {
      const { value, done } = await r.read();
      if (done) return;
      yield value;
    }
  } catch { /* session closed */ }
}
