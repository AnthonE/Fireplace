#!/usr/bin/env node
// A Roblox place into an arena map: the file Studio saves (File, Save to
// File As: .rbxl or .rbxlx; a model, .rbxm or .rbxmx, works too) in, a map
// directory out, checked by the build's own compiler. tools/rbx-map.mjs has
// what comes over and how; the map editor does the same with a file dropped
// on it.
//
//   node tools/roblox.mjs <place.rbxl> [maps/<name>] [--scale 0.28] [--name "Its Name"] [--from ServerStorage.Maps.Castle] [--anchored]
//   node net/play.mjs --arena --map <name>      then play it with bots
//
// --scale is metres a stud (Roblox's own is 0.28); --from takes a model by
// its path as the place, for a game that keeps its maps in storage and
// builds them with scripts (the report names the biggest); --anchored leaves
// out unanchored parts (kept by default: a classic place's bricks are held
// by joints, not anchors); --cell and --rise are the columns' width
// and height step for parts not square to the axes (0.5 and 0.25 m).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { zstdDecompressSync } from 'node:zlib';
import { readRoblox } from './rbx-file.mjs';
import { robloxToMap, OPTIONS } from './rbx-map.mjs';
import { compileMap, formatSpec } from './map.mjs';
import { encodePng } from './png.mjs';
import { isMain } from './main.mjs';
import * as L from '../src/layout.mjs';

const zstd = typeof zstdDecompressSync === 'function' ? (z) => zstdDecompressSync(z) : null;

// The map from a file's bytes: { spec, images, report } as robloxToMap gives.
export function convert(bytes, opts = {}) {
  return robloxToMap(readRoblox(bytes, { zstd }), { zstd, ...opts });
}

// Write it as a map directory, then compile it as the build will.
export function writeMap(dir, { spec, images }) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'map.json'), formatSpec(spec));
  writeFileSync(join(dir, 'height.png'), encodePng(images.height));
  writeFileSync(join(dir, 'surface.png'), encodePng(images.surface));
  return compileMap(dir);
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'roblox';

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2), pos = [], opts = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--anchored') opts.anchored = true;
    else if (a === '--name') opts.name = args[++i];
    else if (a === '--from') opts.from = args[++i];
    else if (['--scale', '--cell', '--rise', '--ground-area'].includes(a)) opts[a.slice(2).replace(/-a/, 'A')] = Number(args[++i]);
    else pos.push(a);
  }
  if (!pos[0]) {
    console.error('node tools/roblox.mjs <place.rbxl|.rbxlx|.rbxm|.rbxmx> [maps/<name>] [--scale 0.28] [--name "Its Name"] [--from <path>] [--anchored]');
    process.exit(2);
  }
  const file = pos[0];
  const base = basename(file, extname(file));
  opts.name ||= base.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const dir = pos[1] || join(L.MAPS, slug(base));
  const t0 = performance.now();
  let out, m;
  try {
    out = convert(readFileSync(file), opts);
    m = writeMap(dir, out);
  } catch (e) {
    console.error(`${file}: ${e.message}`);
    process.exit(1);
  }
  console.log(`${file} -> ${dir}/ in ${((performance.now() - t0) / 1000).toFixed(1)} s, ${opts.scale ?? OPTIONS.scale} m a stud`);
  for (const line of out.report) console.log(`  ${line}`);
  console.log(`  the map: ${m.size[0] * L.SPACING} x ${m.size[1] * L.SPACING} m of ground, ${m.boxes.length} boxes in ${m.groups.length} structures, ${m.spawns.length} spawns (red's half ${m.sides[0]}, blue's ${m.sides[1]})`);
  console.log(`play it: node net/play.mjs --arena --map ${dir.startsWith(L.MAPS) ? basename(dir) : dir}`);
}
