#!/usr/bin/env node
// The map compiler: maps/<name>/ in, the bytes of the arena's map out, built
// into build/arena/game.wasm by tools/asm.mjs as a passive data segment that
// init copies into memory. A map is a directory:
//
//   map.json      bounds, the terrain images and how to read them, the
//                 structures (boxes, by prefab or by hand), teleporters,
//                 spawn points, weapon pads, and what the team modes play
//                 for (two flags, the skull's spot, hills: defaults for any
//                 left out), flight's ceiling and its race's gates ("race":
//                 [[x, y, z, radius], ...] in order, none for a map without
//                 one); see maps/canyon/map.json and maps/skyways/map.json
//   height.png    the ground: grey, 8 or 16 bits, 2 m a pixel, read as
//                 metres = base + level * scale
//   surface.png   optional: what the ground is (colours, nearest of "surfaces")
//
// Anything a fighter can stand on, hide behind or walk under that the ground
// can't be (walls, roofs, bridges, a cave's roof) is a box: [x0, y0, z0, x1,
// y1, z1, material], in metres. A prefab is a list of boxes about its own
// origin, placed by a structure at a point with a quarter turn and a remap of
// its materials, so one base serves both teams.
//
//   node tools/map.mjs maps/canyon     checks a map and prints what it holds
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as L from '../src/layout.mjs';
import { decodePng } from './png.mjs';
import { compileSpec, GROUND } from './map-compile.mjs';
import { isMain } from './main.mjs';

export { SURFACES, SURFACE_RGB, MATERIALS, WEAPONS, GROUND, place, placePoint, compileSpec, half, dataSegment, formatSpec, defaultFlags, defaultBall, defaultHills } from './map-compile.mjs';

export function mapDir(name = process.env.QG_MAP || L.MAP_NAME) {
  return resolve(name.includes('/') ? name : join(L.MAPS, name));
}

export function compileMap(dir = mapDir()) {
  const spec = JSON.parse(readFileSync(join(dir, 'map.json'), 'utf8'));
  const t = spec.terrain || {};
  const images = { height: decodePng(readFileSync(join(dir, t.height || 'height.png'))) };
  if (t.surface) images.surface = decodePng(readFileSync(join(dir, t.surface)));
  return compileSpec(spec, images, `${dir}/map.json`);
}

if (isMain(import.meta.url)) {
  const m = compileMap(mapDir(process.argv[2]));
  console.log(`${m.name}: ${m.size[0]} x ${m.size[1]} samples at ${m.origin.join(', ')}, ${m.boxes.length} boxes in ${m.groups.length} structures, ` +
    `${m.teleporters.length} teleporters, ${m.spawns.length} spawns, ${m.pads.length} pads; ${m.bytes.length} B`);
  for (const g of m.groups) console.log(`  ${g.name}: ${g.count} boxes, ${g.bound.map((v) => +v.toFixed(2)).join(' ')}`);
  const at = ([x, z, top]) => `${x}, ${z}${top === GROUND ? '' : ` up to ${top}`}`;
  console.log(`  flags: red ${at(m.flags[0])}, blue ${at(m.flags[1])}; spawns on each half: red ${m.sides[0]}, blue ${m.sides[1]}`);
  console.log(`  the skull: ${at(m.ball)}; ${m.hills.length} hills: ${m.hills.map((h) => `${at(h)} r ${h[3]}`).join('; ')}`);
}
