import * as L from '../src/layout.mjs';
import { loadMap } from '../harness/core.mjs';

// What a room's wasm must be for the referee to run it, checked before it
// runs: its only import the shared memory (env.mem), so it cannot reach a
// file or a socket, and every export the referee calls. The relay refuses a
// module that fails at start (exit 2, net/relay.ts); the kit's room pool
// (net/kit-rooms.mjs) refuses it before starting a relay at all.
//   threads: the referee's (relay --referee-threads); above 1 it also calls step_mt and worker_run
// Returns null for a sim it will run, else why not.
export async function simRefusal(bytes, threads = 2) {
  let mod;
  try { mod = await WebAssembly.compile(bytes); } catch (e) { return `not a wasm module (${e})`; }
  const imports = WebAssembly.Module.imports(mod);
  const odd = imports.filter((i) => !(i.module === 'env' && i.name === 'mem' && i.kind === 'memory'));
  if (odd.length || imports.length !== 1) return `imports ${imports.map((i) => `${i.module}.${i.name} (${i.kind})`).join(', ') || 'nothing'}; a sim imports only env.mem, its shared memory`;
  const have = new Set(WebAssembly.Module.exports(mod).map((e) => e.name));
  const need = ['init', 'step', 'snapshot', 'regrid', ...(threads > 1 ? ['step_mt', 'worker_run'] : [])];
  const missing = need.filter((n) => !have.has(n));
  return missing.length ? `does not export ${missing.join(', ')}` : null;
}

// Does the sim take this map (tools/map-compile.mjs packMap) as the referee
// will lay it, before its first init? The same map_load every machine in the
// room runs, so a map it refuses here no room would start on. Returns null for
// a map it takes, else why not.
export async function mapRefusal(bytes, map) {
  const memory = new WebAssembly.Memory({ initial: L.PAGES, maximum: L.PAGES, shared: true });
  let x;
  try { x = (await WebAssembly.instantiate(await WebAssembly.compile(bytes), { env: { mem: memory } })).exports; } catch (e) { return `the game would not start (${e.message || e})`; }
  try { loadMap(x, new Uint8Array(memory.buffer), map); } catch (e) { return e.message; }
  return null;
}
