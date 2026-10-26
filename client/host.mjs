// What a page's games share: the sim's wasm and one shared memory, the net
// worker (the session, the clocks, the input words) and the sim worker (the
// confirmed world), the main thread's own instance for the prediction, the
// sound, and one GPU device for every renderer the page has. A game's
// frontend (client/<game>-game.mjs) mounts on a host and draws from it; a
// page with one game (bumper.html, arena.html) mounts one and keeps it, and
// Fireplace mounts each game as the room moves into it.
//   q: the page's query (?url=, ?hash=, ?impair=, ?threads=, ?music=0, ?replay=<url>: a
//      replay file (net/replay.mjs) in the net worker's place, as a spectator)
// With no relay to join (client/kit.mjs relayFor: ?local=1, or none set, as on
// a fresh copy's GitHub Pages site) the room is local (client/local.mjs): this
// page's player and ?bots= AI players (7 by default), on ?seed=, or ?mg=k (a
// party room playing only minigame k) or ?mode=k (an arena room in mode k).
import * as L from '../src/layout.mjs';
import { View } from '../src/view.mjs';
import { wasmPrefix } from '../net/wire.mjs';
import { createSound } from './sound.mjs';
import { parseImpair } from '../net/impair.js';
import { relayFor } from './kit.mjs';
import { forcedSeed } from '../src/arena-view.mjs';

export const epoch = () => performance.timeOrigin + performance.now();

// A canvas's size: the window's own resolution (up to `max`), or ?res=WxH.
export function fitSize(q, max = [1600, 1000]) {
  if (q.has('res')) return q.get('res').split('x').map(Number);
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = innerWidth * dpr, h = innerHeight * dpr;
  const k = Math.min(1, max[0] / w, max[1] / h);
  return [Math.max(320, Math.round(w * k)), Math.max(200, Math.round(h * k))];
}

// wasm: the sim's URL; watch: a spectator; arena: the arena's input words; fireplace: whichever the game on now reads
export async function createHost({ wasm, q = new URLSearchParams(location.search), watch = false, arena = false, fireplace = false, connect = true }) {
  // ../coi.js reloads the page once its service worker isolates it: wait for that, unless it gives up
  while (!crossOriginIsolated && globalThis.coi?.reloading) await new Promise((ok) => setTimeout(ok, 100));
  if (!crossOriginIsolated) throw new Error('the page must be served cross-origin isolated (node tools/serve.mjs)');
  const bytes = await (await fetch(wasm)).arrayBuffer();
  const module = await WebAssembly.compile(bytes);
  const prefix = await wasmPrefix(bytes);
  const memory = new WebAssembly.Memory({ initial: L.PAGES, maximum: L.PAGES, shared: true });
  const i32 = new Int32Array(memory.buffer);
  const h = {
    q, watch, module, bytes, prefix, memory,
    u8: new Uint8Array(memory.buffer), i32, u32: new Uint32Array(memory.buffer), f32: new Float32Array(memory.buffer), f64: new Float64Array(memory.buffer),
    view: new View(memory.buffer), pview: new View(memory.buffer, L.PRED_D),
    set: (a, v) => Atomics.store(i32, a >> 2, v),
    get: (a) => Atomics.load(i32, a >> 2),
    press: (a) => Atomics.add(i32, a >> 2, 1),
    error: '', welcome: null, hashes: [], keys: [], desyncs: [],
    sound: createSound({ music: q.get('music') !== '0' }),
    device: null,
    renderers: new Map(), // a frontend's renderer, kept for when it mounts again
    connected: false,
  };
  h.set(L.CL_SLOT, -1);
  h.set(L.CL_PITCH, 512);
  // a slot's look word (client/looks.mjs): this player's own as picked, the rest as the relay sent them
  h.look = (p) => (p === h.get(L.CL_SLOT) ? h.get(L.CL_LOOK) : h.u32[(L.CL_LOOKS >> 2) + p]) >>> 0;
  // the prediction's own instance: it writes only PRED
  h.px = (await WebAssembly.instantiate(module, { env: { mem: memory } })).exports;
  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) throw new Error('WebGPU is not available in this browser');
  h.device = await adapter.requestDevice();
  h.device.lost.then((info) => { h.error = `GPU device lost (${info.reason}): ${info.message}`; console.error(h.error, performance.now()); });

  // the session: connect() opens it (a page may show something first)
  h.connect = async () => {
    if (h.connected) return;
    h.connected = true;
    const replay = q.get('replay');
    let relay = null;
    try { relay = replay ? null : await relayFor(q); } catch (e) { h.error = e.message; throw e; }
    h.local = !replay && !relay;
    const cores = navigator.hardwareConcurrency || 4;
    const threads = Number(q.get('threads') || (cores >= 8 ? 2 : 1));
    const ch = new MessageChannel();
    h.net = new Worker(new URL(replay ? './replay.mjs' : relay ? './net.mjs' : './local.mjs', import.meta.url), { type: 'module' });
    h.sim = new Worker(new URL('./sim.mjs', import.meta.url), { type: 'module' });
    h.net.onmessage = (e) => { if (e.data.error) h.error = e.data.error.split('\n')[0]; if (e.data.welcome) h.welcome = e.data.welcome; if (e.data.replay) h.replay = e.data.replay; };
    h.sim.onmessage = (e) => {
      const m = e.data;
      if (m.error) h.error = m.error.split('\n')[0];
      if (m.hashes) h.hashes.push(...m.hashes);
      if (m.key) h.keys.push({ ...m.key, at: performance.now() });
      if (m.desync) h.desyncs.push(m.desync);
    };
    for (const w of [h.net, h.sim]) w.onerror = (e) => { h.error = String(e.message || e); e.preventDefault?.(); };
    if (replay) h.net.postMessage({ replay: new URL(replay, location.href).href, memory, prefix, simPort: ch.port1 }, [ch.port1]);
    else if (relay) {
      const certHash = Uint8Array.from(atob(relay.hash), (c) => c.charCodeAt(0));
      h.net.postMessage({ url: relay.url, certHash, memory, prefix, simPort: ch.port1, impair: parseImpair(q.get('impair')), watch, arena, fireplace, looks: true }, [ch.port1]);
    } else h.net.postMessage({ local: localRoom(q, wasm, { arena, fireplace }), memory, prefix, simPort: ch.port1, watch, arena, fireplace }, [ch.port1]);
    h.sim.postMessage({ module, memory, netPort: ch.port2, threads }, [ch.port2]);
    addEventListener('pagehide', () => h.net.postMessage({ leave: true }));
  };
  if (connect) await h.connect();
  return h;
}

// A local room's AI players (their brain by the page's game) and its seed.
function localRoom(q, wasm, { arena, fireplace }) {
  const kind = fireplace ? 'fireplace' : arena ? 'arena' : /\/party\//.test(wasm) ? 'party' : /\/bumper\//.test(wasm) ? 'bumper' : '';
  const rand = crypto.getRandomValues(new Uint32Array(1))[0];
  const seed = q.has('seed') ? Number(q.get('seed')) >>> 0
    : q.has('mg') && kind === 'party' ? ((0xa7 << 24) | ((Number(q.get('mg')) & 0xff) << 16) | (rand & 0xffff)) >>> 0
      : q.has('mode') && kind === 'arena' ? forcedSeed(Number(q.get('mode')), rand) : undefined;
  return { kind, bots: q.has('bots') ? Number(q.get('bots')) : 7, seed };
}

// The prediction for slot: the newest confirmed tick plus every input sampled
// since, then the tick in progress with live() as the word for it, stepped on
// the copy. A copy the sim worker stepped under is made again. Returns the
// ticks predicted, or -1 for none.
export function predict(h, slot, live) {
  const { get, i32, u32, view, px } = h;
  const room = get(L.CL_ROOM);
  for (let tries = 0; tries < 4; tries++) {
    const t = performance.now();
    let s0;
    while (((s0 = Atomics.load(i32, L.CL_SEQ >> 2)) & 1) && performance.now() - t < 2);
    if (s0 & 1) return -1;
    const from = room + view.tick;
    const n = get(L.CL_NEXT) - from;
    if (n < 0 || n > 200) return -1;
    for (let i = 0; i < n; i++) u32[(L.PWORDS >> 2) + i] = u32[(L.CL_WORDS >> 2) + ((from + i) & 255)];
    u32[(L.PWORDS >> 2) + n] = live();
    px.predict(slot, n + 1);
    if (Atomics.load(i32, L.CL_SEQ >> 2) === s0) return n + 1;
  }
  return -1;
}

// Corrections ease in: where this rebuild puts the newest tick the last one
// also predicted, against where that one put it, goes into a render-only
// offset that decays over 100 ms. A jump past 4 m (a respawn) snaps.
export function corrector(h) {
  const { u32, f32 } = h;
  let track = new Map();
  const c = { off: [0, 0, 0] };
  c.update = (n, ms) => {
    const now = new Map();
    for (let i = 0; i < n; i++) { const o = (L.PTRACK >> 2) + 4 * i; now.set(u32[o + 3], [f32[o], f32[o + 1], f32[o + 2]]); }
    let t = -1;
    for (const k of now.keys()) if (track.has(k) && k > t) t = k;
    if (t >= 0) {
      const a = track.get(t), b = now.get(t);
      const d = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
      if (Math.hypot(...d) > 4) c.off = [0, 0, 0];
      else c.off = c.off.map((v, k) => v + d[k]);
    }
    if (n) track = now;
    const f = Math.exp(-ms / 100);
    c.off = c.off.map((v) => v * f);
  };
  return c;
}

// The camera on a ball you're watching, not driving (you're out, or a
// spectator): an AI ball's word turns to any of 16 headings in a tick, so the
// camera's heading eases round to the watched ball's, at most TURN_RATE
// radians a second; a cut to another ball pans there over a quarter second
// rather than jumping, and so does the first one after your own goes out.
// update() returns where to put the focus and the yaw.
export function follower() {
  const TURN_RATE = 3;
  const wrap = (a) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
  let who = -1, yaw = 0, off = [0, 0, 0], shown = null;
  return {
    // your own ball, as the camera has it: where the next one watched pans from
    drive(at, face) { who = -1; yaw = face; off = [0, 0, 0]; shown = at; },
    // slot: the ball watched; at: where it's drawn; face: its heading, radians; ms: since the last frame
    update(slot, at, face, ms) {
      if (slot !== who) {
        // a cut keeps the heading and pans from the last ball shown; with none, square behind this one
        if (shown) off = [0, 1, 2].map((k) => shown[k] - at[k]);
        else yaw = face;
        if (!shown || Math.hypot(...off) > 120) off = [0, 0, 0];
        who = slot;
      }
      const d = wrap(face - yaw) * (1 - Math.exp(-ms / 450));
      const cap = TURN_RATE * ms / 1000;
      yaw = wrap(yaw + Math.max(-cap, Math.min(cap, d)));
      const f = Math.exp(-ms / 250);
      off = off.map((v) => v * f);
      shown = [0, 1, 2].map((k) => at[k] + off[k]);
      return { at: shown, yaw };
    },
    // nobody to show (the stage's overview): the next ball starts square behind it
    reset() { who = -1; shown = null; },
  };
}

// A PNG (base64) of a renderer's next frame, read back from the GPU (headless browsers can't composite WebGPU).
export async function capturePng(renderer, u8, s, scale = 1) {
  const { width, height, rgba } = await renderer.capture(u8, s);
  const small = new OffscreenCanvas(width, height);
  small.getContext('2d').putImageData(new ImageData(rgba, width, height), 0, 0);
  const big = new OffscreenCanvas(width * scale, height * scale);
  const g = big.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(small, 0, 0, width * scale, height * scale);
  const out = new Uint8Array(await (await big.convertToBlob({ type: 'image/png' })).arrayBuffer());
  let bin = '';
  for (let i = 0; i < out.length; i += 0x8000) bin += String.fromCharCode(...out.subarray(i, i + 0x8000));
  return btoa(bin);
}

// Listeners that go when the frontend does: on(target, type, fn, opts).
export function listeners() {
  const ac = new AbortController();
  const on = (target, type, fn, opts = {}) => target.addEventListener(type, fn, { ...opts, signal: ac.signal });
  return { on, off: () => ac.abort() };
}
