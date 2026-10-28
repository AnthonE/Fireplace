// The studio's builder (client/studio.html): party's sim assembled in the page
// with tools/asm-core.mjs, the assembler npm run build uses, on the repo's
// WAT as this site serves it with the minigame being edited in its place, and
// its constants from the edited text. Then the check: the debug build (which
// traps on a NaN or an infinity) played by AI balls on that minigame alone,
// and the log replayed with the ball phases split two ways, every tick's
// hash equal, as the determinism matrix asks of a build split over threads.
//   in:  { build: { key, wat, consts } }  out: { built: { bytes, debug, ms, size } } or { error }
//   in:  { check: { debug, mg, ticks, bots } }  out: { progress } ..., then { checked } or { error }
import * as L from '../src/layout.mjs';
import { makeMacros } from '../src/macros.mjs';
import { expandWith, assembleWith, includesOf, joinPath } from '../tools/asm-core.mjs';
import { playParty } from '../tools/party-play.mjs';
import { parseLog, replay, decodeTrace } from '../harness/core.mjs';

const ROOT = new URL('../', import.meta.url);
const files = new Map(); // path from the root ('src/game.wat') to its text, as served

// src/game.wat and everything it includes, fetched once: every #include,
// whatever #if it sits in, since the preprocessor splices before it picks.
async function fetchSources(path = 'src/game.wat') {
  if (files.has(path)) return;
  const r = await fetch(new URL(path, ROOT), { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${path}: ${r.status} (is the site's src/ served?)`);
  const text = await r.text();
  files.set(path, text);
  const dir = path.slice(0, path.lastIndexOf('/'));
  await Promise.all(includesOf(text).map((f) => fetchSources(joinPath(dir, f))));
}

let wabt = null;
async function loadWabt() {
  if (wabt) return wabt;
  // wabt's package is one script that defines WabtModule; evaluated globally, as a <script> would be
  const text = await (await fetch(new URL('node_modules/wabt/index.js', ROOT))).text();
  (0, eval)(text);
  wabt = await globalThis.WabtModule();
  return wabt;
}

// The edited constants: a module of literal numbers, as src/mg/<key>.mjs is
async function constsOf(text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
  try {
    const mod = await import(url);
    for (const [k, v] of Object.entries(mod)) {
      const ok = typeof v === 'number' ? Number.isFinite(v) : Array.isArray(v) && v.every(Number.isFinite);
      if (!ok) throw new Error(`constants: ${k} is not a number`);
    }
    return { ...mod };
  } finally { URL.revokeObjectURL(url); }
}

async function build({ key, wat, consts }) {
  const t0 = performance.now();
  await fetchSources();
  const edited = `src/mg/${key}.wat`;
  if (!files.has(edited)) throw new Error(`${edited} is not part of party's build`);
  const read = (p) => {
    if (p === edited) return wat;
    if (!files.has(p)) throw new Error(`no ${p}`);
    return files.get(p);
  };
  const layout = { ...L, MG_CONSTS: { ...L.MG_CONSTS, ...(await constsOf(consts)) } };
  const w = await loadWabt();
  const out = {};
  for (const DEBUG of [false, true]) {
    const src = expandWith(read, 'src/game.wat', { DEBUG, BUMPER: true, PARTY: true, layout, macros: makeMacros });
    try {
      out[DEBUG ? 'debug' : 'bytes'] = await assembleWith(w, src, DEBUG ? 'game.debug.wat' : 'game.wat', { debugNames: DEBUG });
    } catch (e) {
      // wabt names a line of the whole expanded module: find it in the minigame,
      // where it reads the same there (a line no macro or constant touched)
      const m = /\.wat:(\d+):\d+/.exec(String(e.message));
      const line = m ? src.split('\n')[Number(m[1]) - 1]?.trim() : '';
      const k = line ? wat.split('\n').findIndex((l) => l.trim() === line) : -1;
      throw new Error(k >= 0 ? `src/mg/${key}.wat line ${k + 1}: ${e.message.trim()}` : e.message);
    }
  }
  return { ...out, ms: Math.round(performance.now() - t0), size: out.bytes.length };
}

async function check({ debug, mg, ticks = 4000, bots = 12 }) {
  const t0 = performance.now();
  let lastSent = 0, at = 0;
  const onTick = (t) => {
    at = t + 1;
    if (t - lastSent >= 500) { lastSent = t; postMessage({ progress: { stage: 'play', t, ticks } }); }
  };
  let played;
  try {
    played = await playParty({ bytes: debug, mg, bots, ticks, seed: 7, leaveAt: Math.floor(ticks / 3), onTick });
  } catch (e) {
    // the debug build's (!chk): a NaN or an infinity, or a trap of the wasm's own
    throw new Error(`the debug build trapped on tick ${at}: ${e?.message || e}`);
  }
  const scored = played.scores.filter((s) => s.pts || s.wins || s.kos);
  postMessage({ progress: { stage: 'replay', t: ticks, ticks } });
  const log = parseLog(played.log);
  const runs = [];
  for (const salt of [0, 7]) runs.push(decodeTrace((await replay({ bytes: debug, log, ticks: log.ticks, salt })).trace).tickHashes);
  let differ = -1;
  for (let t = 0; t < runs[0].length; t++) if (runs[0][t] !== runs[1][t]) { differ = t; break; }
  return {
    ticks, bots, rounds: played.rounds, played: played.games.map((g) => L.MINIGAMES[g]?.name ?? `minigame ${g}`),
    scored: scored.length, best: played.scores.reduce((a, s) => Math.max(a, s.pts), 0),
    splitEqual: differ < 0, differ, ms: Math.round(performance.now() - t0),
  };
}

onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.build) { const b = await build(m.build); postMessage({ built: b }, [b.bytes.buffer, b.debug.buffer]); }
    if (m.check) postMessage({ checked: await check(m.check) });
  } catch (err) {
    postMessage({ error: String(err?.message || err), stage: m.build ? 'build' : 'check' });
  }
};
