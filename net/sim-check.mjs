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
