#!/usr/bin/env node
// The machine check for a map someone sends in: it compiles (tools/map.mjs,
// the limits the map editor checks as it is drawn), builds into the debug
// sim, which traps on any NaN or infinity, and plays there with AI fighters:
// a map with a ceiling is Dogfight's and is flown (and raced, if it has
// gates), any other is the arena's and is played as a Fiesta, Capture the
// Flag and King of the Hill, the modes that use its objectives. A map passes
// when every match runs its ticks without a trap and somebody scored.
//   node tools/map-check.mjs maps/<folder> [...]   or --all for every folder in maps/
//   [--ticks 6000] [--bots 8]
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileMap } from './map.mjs';
import { expand, assemble } from './asm.mjs';
import { playArena } from './genarena.mjs';
import { playFlight } from './genflight.mjs';
import { forcedSeed } from '../src/arena-view.mjs';
import * as L from '../src/layout.mjs';
import { M_RACE } from '../src/flight.mjs';
import { isMain } from './main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// The matches a map is played in: [name, seed]
export function matchesFor(spec) {
  if (spec.ceiling) return [['Dogfight', 7], ...(spec.race?.length ? [['Ring Race', forcedSeed(M_RACE)]] : [])];
  return [['Fiesta', 7], ['Capture the Flag', forcedSeed(L.M_CTF)], ['King of the Hill', forcedSeed(L.M_HILL)]];
}

// One map folder: { name, ok, lines } (lines say what happened, a failure first)
export async function checkMap(dir, { ticks = 6000, bots = 8 } = {}) {
  const where = relative(ROOT, resolve(dir)) || dir;
  let map, spec;
  try {
    spec = JSON.parse(readFileSync(join(dir, 'map.json'), 'utf8'));
    map = compileMap(resolve(dir));
  } catch (e) { return { name: where, ok: false, lines: [`doesn't compile: ${e.message}`] }; }
  const flight = !!spec.ceiling;
  let bytes;
  try { bytes = await assemble(expand(join(ROOT, 'src/game.wat'), { DEBUG: true, ARENA: true, FLIGHT: flight, map }), 'game.debug.wat'); }
  catch (e) { return { name: where, ok: false, lines: [`doesn't build: ${e.message}`] }; }
  const lines = [`${map.name}: ${map.bytes.length} B, built as ${flight ? "Dogfight's" : "the arena's"}`];
  let ok = true;
  for (const [mode, seed] of matchesFor(spec)) {
    try {
      const play = flight ? playFlight : playArena;
      const { scores } = await play({ bytes, seed, bots, ticks, leaveAt: Math.floor(ticks / 3) });
      const scored = scores.some((s) => s.kills || s.points);
      if (!scored) ok = false;
      lines.push(`${scored ? 'ok  ' : 'FAIL'} ${mode}: ${ticks} ticks, ${bots} fighters, kills ${scores.map((s) => s.kills).join(' ')}${scored ? '' : ': nobody scored'}`);
    } catch (e) {
      ok = false;
      lines.push(`FAIL ${mode}: trapped (${e.message})`);
    }
  }
  return { name: where, ok, lines };
}

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
  const valued = new Set(['--ticks', '--bots']);
  const dirs = argv.includes('--all')
    ? readdirSync(join(ROOT, L.MAPS), { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join(ROOT, L.MAPS, d.name, 'map.json'))).map((d) => join(ROOT, L.MAPS, d.name))
    : argv.filter((a, i) => !a.startsWith('--') && !valued.has(argv[i - 1]));
  if (!dirs.length) { console.error('node tools/map-check.mjs maps/<folder> [...] | --all'); process.exit(2); }
  let failed = 0;
  for (const dir of dirs) {
    const r = await checkMap(dir, { ticks: Number(opt('ticks', 6000)), bots: Number(opt('bots', 8)) });
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}\n  ${r.lines.join('\n  ')}`);
    if (!r.ok) failed++;
  }
  process.exit(failed ? 1 : 0);
}
