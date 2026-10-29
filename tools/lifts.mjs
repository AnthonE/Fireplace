#!/usr/bin/env node
// How maps/lifts/ was drawn: a small arena made to show moving boxes (map.json
// structures' "move", docs/arena.md "Moving boxes"). The files it writes are
// the map; this is only the brush that made them:
//   node tools/lifts.mjs [maps/lifts]
//
// A field split along x by a pit, crossed by three platforms that slide over
// it a lane each, their times staggered, and by one narrow plank that stays
// put (the AI fighters walk the plank: they steer by boxes as built). At each
// end a tower with a sniper's pad on top, reached by a lift beside it. Fall
// into the pit and you die.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { encodePng } from './png.mjs';
import { compileMap, SURFACES, formatSpec } from './map.mjs';
import { isMain } from './main.mjs';

export const ORIGIN = [440, 440]; // world x, z of the first pixel; 2 m a pixel
export const SIZE = [72, 48];
const BOUNDS = [452, 572, 452, 524];
const FLOOR = 20; // the field
const PIT = { x0: 496, x1: 528, floor: 4 }; // across the whole field in z
const TOWER = 12; // a tower's top over the field
const LANES = [466, 488, 510]; // the platforms' z

const tidy = (v) => (typeof v === 'number' ? +v.toFixed(3) : v);

export function liftsSpec() {
  const towers = [{ x: 460, side: 1, name: 'red tower' }, { x: 564, side: -1, name: 'blue tower' }];
  const structures = [];
  for (const t of towers) {
    // the tower, its lift on the field side, the lift's shaft walls either side of it
    const lx = t.x + t.side * 6;
    structures.push({ name: t.name, boxes: [
      [t.x - 4, FLOOR - 1, 482, t.x + 4, FLOOR + TOWER, 494, 'rock'],
      [lx - 2.5, FLOOR - 1, 482, lx + 2.5, FLOOR + TOWER + 1, 483, 'metal'],
      [lx - 2.5, FLOOR - 1, 493, lx + 2.5, FLOOR + TOWER + 1, 494, 'metal'],
    ] });
    structures.push({ name: `${t.name}'s lift`, boxes: [[lx - 2, FLOOR - 0.5, 484, lx + 2, FLOOR, 492, 'light#f0c040']],
      move: { by: [0, TOWER, 0], seconds: 3, wait: 2, ease: true } });
  }
  // the platforms: from the pit's near edge to its far one, each lane a third of a cycle after the last
  LANES.forEach((z, k) => structures.push({
    name: `platform ${k + 1}`, boxes: [[PIT.x0, FLOOR - 0.5, z - 3, PIT.x0 + 6, FLOOR, z + 3, 'light#40c0f0']],
    move: { by: [PIT.x1 - PIT.x0 - 6, 0, 0], seconds: 2.5, wait: 1, phase: tidy((k * 7) / 3) },
  }));
  structures.push({ name: 'plank', boxes: [[PIT.x0 - 1, FLOOR - 0.4, 520, PIT.x1 + 1, FLOOR, 522, 'dark']] });
  // cover on the field: a few crates each side
  const crates = [[478, 462], [482, 500], [474, 516], [542, 476], [538, 512], [546, 462]];
  structures.push({ name: 'crates', boxes: crates.map(([x, z]) => [x - 1.5, FLOOR, z - 1.5, x + 1.5, FLOOR + 2.5, z + 1.5, 'rock#8a6a40']) });
  return {
    name: 'Lifts',
    about: 'Platforms slide across a pit and lifts climb two towers: a small arena of moving boxes.',
    bounds: BOUNDS,
    terrain: { origin: ORIGIN, height: 'height.png', scale: 0.00390625, base: 0, surface: 'surface.png' },
    structures,
    spawns: [[458, 460], [458, 516], [470, 470], [470, 506], [566, 460], [566, 516], [554, 470], [554, 506]],
    pads: [
      { weapon: 'sniper', at: [460, 488, FLOOR + TOWER + 1] },
      { weapon: 'sniper', at: [564, 488, FLOOR + TOWER + 1] },
      { weapon: 'shotgun', at: [512, 521, FLOOR + 1] },
    ],
    void: PIT.floor + 6,
  };
}

// the ground: the field, the pit's floor, its walls sheer
export function liftsImages() {
  const [W, H] = SIZE;
  const h = new Uint16Array(W * H), s = new Uint8Array(W * H * 3);
  const grass = [77, 128, 51], rock = [122, 110, 92];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = ORIGIN[0] + 2 * i, k = j * W + i;
    const pit = x > PIT.x0 && x < PIT.x1;
    h[k] = Math.round((pit ? PIT.floor : FLOOR) * 256);
    s.set(pit ? rock : grass, 3 * k);
  }
  return { height: { width: W, height: H, channels: 1, depth: 16, data: h }, surface: { width: W, height: H, channels: 3, depth: 8, data: s } };
}

if (isMain(import.meta.url)) {
  const dir = process.argv[2] || 'maps/lifts';
  mkdirSync(dir, { recursive: true });
  const img = liftsImages();
  writeFileSync(join(dir, 'height.png'), encodePng(img.height));
  writeFileSync(join(dir, 'surface.png'), encodePng(img.surface));
  writeFileSync(join(dir, 'map.json'), formatSpec(liftsSpec()));
  const m = compileMap(dir);
  console.log(`${m.name}: ${m.boxes.length} boxes in ${m.groups.length} structures, ${m.groups.filter((g) => g.move).length} of them moving; ${SURFACES.length} surfaces`);
}
