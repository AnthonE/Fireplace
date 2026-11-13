#!/usr/bin/env node
// Sky Steps (maps/obby/): the Obby mode's own course, written from here so
// its numbers have one home. Twelve stages over a floor of lava, a colour
// each as an obby's are. The first leg has one for each thing a part can be:
// stepping stones over the gaps, bars that kill across a walkway, a strip of
// ice, a belt running the wrong way, a bounce pad up to a ledge, a ladder up
// a tower, a platform ferrying across. The second turns and comes back
// beside it, higher, putting them together: stones that climb, a belt
// running your way under bars, walls of lava sweeping a deck, two bounce
// pads over gaps no jump crosses, and a lift up to the finish. A checkpoint
// ends each stage. Its fighters walk, jump and fall as an obby's do (a walk
// of 6 m/s that stops when the keys do, a 2 m jump under 55 m/s^2), so a gap
// is 3.2 m of air at the most.
//   node tools/obby.mjs [maps/obby]
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { encodePng } from './png.mjs';
import { compileMap, formatSpec } from './map.mjs';
import { isMain } from './main.mjs';

const ORIGIN = [440, 464];
export const SIZE = [68, 32]; // the ground's image: 136 by 64 m, flat
const Z = 488, Y = 30; // the first leg's middle line and its first floor
const Z2 = 508, H = Y + 11.5; // the second leg's, coming back
// what kills glows red, and nothing else is red; a checkpoint glows green
const LAVA = 'light#d92e0c', FLOOR = 'light#c42408', CHECK = 'light#4ade80';
// a stage's own colour, in a rainbow's order from the start
const WHITE = '#e9edf2', ORANGE = '#ff9a3c', YELLOW = '#f2c230', TEAL = '#2ec4b6', BLUE = '#4f8df0', PURPLE = '#9a6bf2', PINK = '#ff7eb6', LIME = '#a4d936', GOLD = 'metal#e0a92e';
const pad = (x0, x1, y, half = 2, z = Z) => [x0, y - 0.5, z - half, x1, y, z + half];
const check = (x0, x1, y, stage, z = Z) => [...pad(x0, x1, y, 2, z), CHECK, { kind: 'checkpoint', stage }];
// a wall of lava across half the sweepers' deck, which its structure carries to the other half and back
const sweeper = (name, x, z0, dz) => ({ name, boxes: [[x, H, z0, x + 0.5, H + 2.5, z0 + 4, LAVA, 'kill']], move: { by: [0, 0, dz], seconds: 2, wait: 1.2, ease: true } });

export function obby() {
  const boxes = [
    // the start
    [...pad(450, 460, Y, 4), WHITE],
    // 1: stepping stones, 2.4 m apart
    [...pad(462.4, 464.4, Y, 1.2), ORANGE], [...pad(466.8, 468.8, Y, 1.2), ORANGE], [...pad(471.2, 473.2, Y, 1.2), ORANGE],
    check(475.6, 479.6, Y, 1),
    // 2: a walkway with bars that kill across it, to jump
    [...pad(479.6, 492, Y), YELLOW],
    [483, Y, Z - 2, 483.4, Y + 0.4, Z + 2, LAVA, 'kill'], [487.5, Y, Z - 2, 487.9, Y + 0.4, Z + 2, LAVA, 'kill'],
    check(492, 496, Y, 2),
    // 3: ice, a strip half as wide
    [...pad(496, 508, Y, 1.25), '#bfe8ff', { kind: 'ice', grip: 0.08 }],
    check(508, 512, Y, 3),
    // 4: a belt running back at half a walk
    [...pad(512, 522, Y), 'dark#39424e', { kind: 'conveyor', velocity: [-3, 0] }],
    check(522, 526, Y, 4),
    // 5: a bounce pad, and the ledge it throws you onto 3.5 m up
    [...pad(526, 529, Y), 'light#ffd23f', { kind: 'bounce', speed: 22 }],
    [529, Y - 0.5, Z - 3, 537, Y + 3.5, Z + 3, TEAL],
    check(531, 534, Y + 3.501, 5),
    // 6: a ladder up the tower, 6 m
    [537, Y + 3.5, Z - 1, 537.5, Y + 9.5, Z + 1, 'metal#d08c3a', { kind: 'ladder', speed: 4.5 }],
    [537.5, Y - 0.5, Z - 3, 545, Y + 9.5, Z + 3, BLUE],
    check(540, 544, Y + 9.501, 6),
    // 7: the ferry (its own structure, below) to the far side, where the course turns
    [...pad(557, 566, Y + 9.5, 4), PURPLE],
    check(561, 565, Y + 9.501, 7),
    // 8: stones that climb, half a metre each, 2 m apart
    ...[0, 1, 2].map((k) => [561.8, Y + 9.5 + 0.5 * k, 494 + 4 * k, 564.2, Y + 10 + 0.5 * k, 496 + 4 * k, PINK]),
    [561, H - 0.5, 506, 565, H, 510, CHECK, { kind: 'checkpoint', stage: 8 }],
    // 9: a belt running your way at half a walk, and two bars across it to clear at a run and a half
    [...pad(541, 561, H, 2, Z2), 'dark#39424e', { kind: 'conveyor', velocity: [-3, 0] }],
    [553.6, H, Z2 - 2, 554, H + 0.4, Z2 + 2, LAVA, 'kill'], [546.6, H, Z2 - 2, 547, H + 0.4, Z2 + 2, LAVA, 'kill'],
    check(537, 541, H, 9, Z2),
    // 10: a deck 10 m wide, and two walls of lava (their own structures, below) sweeping across it
    [...pad(523, 537, H, 5, Z2), LIME],
    check(519, 523, H, 10, Z2),
    // 11: two bounce pads, each over 4.5 m of nothing
    [...pad(517.5, 519, H, 2, Z2), 'light#ffd23f', { kind: 'bounce', speed: 33 }],
    [...pad(506.5, 513, H, 2, Z2), ORANGE],
    [...pad(505, 506.5, H, 2, Z2), 'light#ffd23f', { kind: 'bounce', speed: 33 }],
    [...pad(498, 500.5, H, 2, Z2), ORANGE],
    check(494, 498, H, 11, Z2),
    // 12: the lift (its own structure, below) up the last tower, and the finish on it
    [480, Y - 0.5, Z2 - 4, 490, H + 8, Z2 + 4, GOLD],
    [482, H + 8, Z2 - 2, 486, H + 8.1, Z2 + 2, 'light#ffffff', 'finish'],
  ];
  return {
    name: 'Sky Steps',
    by: 'AnthonE',
    about: 'An obstacle course over lava, out and back: stones, bars, ice, belts, bounce pads, a ladder, a ferry, sweeping walls and a lift, a checkpoint after each.',
    bounds: [448, 568, 476, 518],
    terrain: { origin: ORIGIN, height: 'height.png', scale: 0.25, base: 0 },
    mode: 'obby',
    movement: { walk: 6, jump: 2, gravity: 55 },
    void: 12,
    structures: [
      // under it all: touch it and you are back at your checkpoint
      { name: 'lava', boxes: [[448, 19.5, 476, 568, 20, 518, FLOOR, 'kill']] },
      { name: 'course', boxes },
      // 7: the ferry, 12 m of gap in 3 s each way
      { name: 'ferry', boxes: [[545.2, Y + 9, Z - 2, 549.2, Y + 9.5, Z + 2, 'light#40c0f0']], move: { by: [7.6, 0, 0], seconds: 3, wait: 1.5, ease: true } },
      // 10: the sweepers, one from each side, 6 m across in 2 s and 1.2 s at rest with the middle clear
      sweeper('sweeper', 531.5, Z2 - 5, 6), sweeper('sweeper 2', 527, Z2 + 1, -6),
      // 12: the lift, 8 m in 3 s
      { name: 'lift', boxes: [[490, H - 0.5, Z2 - 2, 494, H, Z2 + 2, 'light#40c0f0']], move: { by: [0, 8, 0], seconds: 3, wait: 1.5, ease: true } },
    ],
    spawns: [[452, 486, Y + 1], [452, 490, Y + 1], [455, 485.5, Y + 1], [455, 490.5, Y + 1], [458, 487, Y + 1], [458, 489, Y + 1]],
  };
}

if (isMain(import.meta.url)) {
  const dir = process.argv[2] || 'maps/obby';
  mkdirSync(dir, { recursive: true });
  // a flat floor of rock 10 m up, under the lava
  writeFileSync(join(dir, 'height.png'), encodePng({ width: SIZE[0], height: SIZE[1], channels: 1, depth: 8, data: new Uint8Array(SIZE[0] * SIZE[1]).fill(40) }));
  writeFileSync(join(dir, 'map.json'), formatSpec(obby()));
  const m = compileMap(dir);
  console.log(`${m.name}: ${m.boxes.length} boxes in ${m.groups.length} structures, ${m.parts.length} parts, ${m.spawns.length} spawns, ${m.bytes.length} B`);
}
