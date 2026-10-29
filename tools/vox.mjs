#!/usr/bin/env node
// A MagicaVoxel model into an arena map: the .vox file MagicaVoxel saves (or
// any editor that writes the format: Goxel, Qubicle's export, Avoyd) in, a
// map directory out, checked by the build's own compiler. tools/vox-map.mjs
// has what comes over and how; the map editor does the same with a file
// dropped on it.
//
//   node tools/vox.mjs <model.vox> [maps/<name>] [--scale 0.5] [--name "Its Name"] [--ground-area 150]
//   node net/play.mjs --arena --map <name>      then play it with bots
//
// --scale is metres a voxel (0.5: a voxel is a step a fighter walks up).
// Name objects in MagicaVoxel's outliner to place things: "red spawn",
// "blue spawn" or "spawn" stand fighters on them, a weapon's name
// ("sword", "rocket", "sniper") makes a pad with that gun.
import { readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { readVox } from './vox-file.mjs';
import { voxToMap, OPTIONS } from './vox-map.mjs';
import { writeMap } from './roblox.mjs';
import { isMain } from './main.mjs';
import * as L from '../src/layout.mjs';

// The map from a file's bytes: { spec, images, report, count }.
export function convertVox(bytes, opts = {}) {
  return voxToMap(readVox(bytes), opts);
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'vox';

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2), pos = [], opts = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--name') opts.name = args[++i];
    else if (a === '--scale') opts.scale = Number(args[++i]);
    else if (a === '--ground-area') opts.groundArea = Number(args[++i]);
    else pos.push(a);
  }
  if (!pos[0]) {
    console.error('node tools/vox.mjs <model.vox> [maps/<name>] [--scale 0.5] [--name "Its Name"] [--ground-area 150]');
    process.exit(2);
  }
  const file = pos[0];
  const base = basename(file, extname(file));
  opts.name ||= base.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const dir = pos[1] || join(L.MAPS, slug(base));
  const t0 = performance.now();
  let out, m;
  try {
    out = convertVox(readFileSync(file), opts);
    m = writeMap(dir, out);
  } catch (e) {
    console.error(`${file}: ${e.message}`);
    process.exit(1);
  }
  console.log(`${file} -> ${dir}/ in ${((performance.now() - t0) / 1000).toFixed(1)} s, ${opts.scale ?? OPTIONS.scale} m a voxel`);
  for (const line of out.report) console.log(`  ${line}`);
  console.log(`  the map: ${m.size[0] * L.SPACING} x ${m.size[1] * L.SPACING} m of ground, ${m.boxes.length} boxes in ${m.groups.length} structures, ${m.spawns.length} spawns (red's half ${m.sides[0]}, blue's ${m.sides[1]})`);
  console.log(`play it: node net/play.mjs --arena --map ${dir.startsWith(L.MAPS) ? basename(dir) : dir}`);
}
