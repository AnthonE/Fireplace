#!/usr/bin/env node
// The macro assembler. Hand-written WAT in, game.wasm out, no compiler.
//
//   #include "file.wat"     splice another source file
//   #if DEBUG / #else / #endif   (and #if ARENA, #if !ARENA, #if FIESTA, #if FLIGHT, #if BUMPER, #if PARTY)
//   @NAME, @(expr)          layout constants from the sim's layout.mjs, folded at build time
//
// Every sim builds from src/, with its layout.mjs and macros.mjs. Golf is
// build/game.wasm; the arena (build/arena/) is src/ with ARENA set: a
// deathmatch on the same engine; flight (build/flight/) is the arena with
// FLIGHT set too: every fighter a ship; party (build/party/) is src/ with
// BUMPER (every player a ball) and PARTY set: a different minigame every round.
// Fireplace (build/fireplace/) is golf, the arena, party and flight in one
// module (the arena on Box Canyon, flight on its own map), each as its own build would be under a prefix, with src/fireplace.wat
// dispatching to the one on now.
//   (!macro args...)        JS macros from src/macros.mjs; args are raw s-expressions
//
// It refuses anything the determinism rules ban: memory.grow, relaxed SIMD,
// active data segments (they would rewrite shared memory on every
// instantiate) and mutable globals (per-thread state the region never sees).
// A passive segment is only bytes until init copies it out with memory.init:
// the arena's map (tools/map.mjs; QG_MAP=name or --map name picks one of
// maps/, or a directory, Box Canyon by default; --flight-map likewise for
// flight's, Skyways by default) goes in as one, through (!mapdata).

import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import wabtInit from 'wabt';
import { FEATURES, includeWith, conditionals, stripComments, splitArgs, expandMacros, constants, forbid, expandWith, assembleWith, canonicalWith, prefixed } from './asm-core.mjs';
import * as layout from '../src/layout.mjs';
import { makeMacros } from '../src/macros.mjs';
import { pathToFileURL } from 'node:url';
import { isMain } from './main.mjs';
import { buildThemes } from './themes.mjs';
import { compileMap, mapDir } from './map.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// the preprocessor, the checks and the prefixer are tools/asm-core.mjs's, which a page runs too
export { FEATURES, conditionals, stripComments, splitArgs, expandMacros, constants, forbid, prefixed };

export const include = (file) => includeWith((p) => readFileSync(p, 'utf8'), resolve(file));
export function expand(file, { ARENA = false, FLIGHT = false, layout: lay = layout, macros = makeMacros, map = null, ...flags } = {}) {
  // flight flies its own map (src/flight.mjs FLIGHT_MAP), the arena Box Canyon unless told otherwise
  if (ARENA && !map) map = compileMap(FLIGHT ? mapDir(lay.FLIGHT_CONSTS?.FLIGHT_MAP) : mapDir());
  return expandWith((p) => readFileSync(p, 'utf8'), resolve(file), { ...flags, ARENA, FLIGHT, layout: lay, macros, map });
}

export async function assemble(wat, name = 'game.wat', opts = {}) {
  return assembleWith(await wabtInit(), wat, name, opts);
}

export async function canonical(bin) {
  return canonicalWith(await wabtInit(), bin);
}

// The test files build in parallel processes: a reader sees the old file or
// the new one, never half of one.
function writeAtomic(path, data) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

async function binaryenSize(bin) {
  try {
    const { default: binaryen } = await import('binaryen');
    const m = binaryen.readBinary(bin);
    m.setFeatures(binaryen.Features.All);
    binaryen.setOptimizeLevel(3);
    binaryen.setShrinkLevel(2);
    m.optimize();
    const out = m.emitBinary();
    m.dispose();
    return { raw: out.length, gzip: gzipSync(out, { level: 9 }).length };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

// Fireplace's games (layout.mjs FP_SETS): each a build under its prefix, with its flags and map
export const GAMESETS = layout.FP_PLAYS.map((k) => layout.FP_SETS[k]).map((g) => [g.prefix, g.flags, g.map ?? null]);

export function fireplaceWat({ DEBUG = false, layout: lay = layout, macros = makeMacros, map = compileMap(), flightMap = null, src = join(ROOT, 'src') } = {}) {
  // flight flies its own map, whatever the arena's
  flightMap ??= compileMap(mapDir(lay.FLIGHT_CONSTS.FLIGHT_MAP));
  const maps = { arena: map, flight: flightMap };
  const games = lay.FP_PLAYS.map((k) => lay.FP_SETS[k]).map((g) => prefixed(expand(join(src, 'game.wat'), { DEBUG, ...g.flags, layout: lay, macros, map: g.map ? maps[g.map] : null }), g.prefix));
  const fp = expand(join(src, 'fireplace.wat'), { DEBUG, layout: lay, macros });
  const wat = `(module\n  (import "env" "mem" (memory ${lay.PAGES} ${lay.PAGES} shared))\n${games.join('\n')}\n${fp}\n)\n`;
  forbid(wat);
  return wat;
}

export const SIMS = [
  { name: 'game', src: join(ROOT, 'src'), out: join(ROOT, 'build') },
  { name: 'arena', src: join(ROOT, 'src'), out: join(ROOT, 'build', 'arena'), flags: { ARENA: true } },
  { name: 'flight', src: join(ROOT, 'src'), out: join(ROOT, 'build', 'flight'), flags: { ARENA: true, FLIGHT: true }, map: layout.FLIGHT_CONSTS.FLIGHT_MAP },
  { name: 'party', src: join(ROOT, 'src'), out: join(ROOT, 'build', 'party'), flags: { BUMPER: true, PARTY: true } },
  { name: 'fireplace', src: join(ROOT, 'src'), out: join(ROOT, 'build', 'fireplace'), fireplace: true },
];

async function buildSim({ name, src, out, flags = {}, fireplace = false, map: own = null }) {
  mkdirSync(out, { recursive: true });
  // a sim with a map of its own (flight's) flies it unless --flight-map names
  // another; --map picks the arena's
  const map = flags.ARENA || fireplace ? compileMap(mapDir((own && FLIGHT_MAP_ARG) || own || MAP_ARG)) : null;
  const flightMap = fireplace && FLIGHT_MAP_ARG ? compileMap(mapDir(FLIGHT_MAP_ARG)) : null;
  const lay = await import(pathToFileURL(join(src, 'layout.mjs')).href);
  const { makeMacros: macros } = await import(pathToFileURL(join(src, 'macros.mjs')).href);
  const entry = join(src, 'game.wat');
  const manifest = {};
  for (const debug of [false, true]) {
    const wat = fireplace ? fireplaceWat({ DEBUG: debug, layout: lay, macros, map, flightMap, src }) : expand(entry, { DEBUG: debug, ...flags, layout: lay, macros, map });
    const base = debug ? 'game.debug' : 'game';
    writeAtomic(join(out, `${base}.wat`), wat);
    const bin = await assemble(wat, `${base}.wat`, { debugNames: debug });
    writeAtomic(join(out, `${base}.wasm`), bin);
    manifest[base] = {
      raw: bin.length,
      gzip: gzipSync(bin, { level: 9 }).length,
      sha256: createHash('sha256').update(bin).digest('hex'),
    };
  }
  manifest.binaryen = await binaryenSize(readFileSync(join(out, 'game.wasm')));
  writeAtomic(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const g = manifest.game;
  const where = out === join(ROOT, 'build') ? 'game.wasm' : `${name}/game.wasm`;
  console.log(`${where} ${g.raw} B, ${g.gzip} B gzip, sha256 ${g.sha256.slice(0, 16)}${map ? ` (map: ${map.name}, ${map.bytes.length} B)` : ''}`);
  if (manifest.binaryen.raw) console.log(`  binaryen -O3 would give ${manifest.binaryen.raw} B, ${manifest.binaryen.gzip} B gzip (measurement only)`);
}

const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
const MAP_ARG = arg('--map'), FLIGHT_MAP_ARG = arg('--flight-map');

async function main() {
  buildThemes(); // Fireplace's room themes: data, checked and bundled; no sim reads them
  for (const sim of SIMS) await buildSim(sim);
}

if (isMain(import.meta.url)) {
  main().catch((e) => { console.error(e.message || e); process.exit(1); });
}
