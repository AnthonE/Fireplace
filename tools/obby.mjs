#!/usr/bin/env node
// Sky Steps (maps/obby/): the Obby mode's own course, written from here so
// its numbers have one home. Seven stages in a line over a floor of lava,
// one for each thing a part can be: stepping stones over the gaps, bars that
// kill across a walkway, a strip of ice, a belt running the wrong way, a
// bounce pad up to a ledge, a ladder up a tower, a platform ferrying across
// to the finish. A checkpoint ends each stage. Its fighters walk, jump and
// fall as an obby's do (a walk of 6 m/s that stops when the keys do, a 2 m
// jump under 55 m/s^2), so a gap is 3.2 m of air at the most.
//   node tools/obby.mjs [maps/obby]
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { encodePng } from './png.mjs';
import { compileMap, formatSpec } from './map.mjs';
import { isMain } from './main.mjs';

const ORIGIN = [440, 464], SIZE = [68, 24]; // the ground's image: 136 by 48 m, flat
const Z = 488, Y = 30; // the course's middle line and its first floor
const LAVA = 'light#ff4a1c', CHECK = 'light#4ade80', STONE = '#8d99ae', DECK = '#5c677d';
const pad = (x0, x1, y, half = 2) => [x0, y - 0.5, Z - half, x1, y, Z + half];
const check = (x0, x1, y, stage) => [...pad(x0, x1, y), CHECK, { kind: 'checkpoint', stage }];

export function obby() {
  const boxes = [
    // the start
    [...pad(450, 460, Y, 4), DECK],
    // 1: stepping stones, 2.4 m apart
    [...pad(462.4, 464.4, Y, 1.2), STONE], [...pad(466.8, 468.8, Y, 1.2), STONE], [...pad(471.2, 473.2, Y, 1.2), STONE],
    check(475.6, 479.6, Y, 1),
    // 2: a walkway with bars that kill across it, to jump
    [...pad(479.6, 492, Y), DECK],
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
    [529, Y - 0.5, Z - 3, 537, Y + 3.5, Z + 3, STONE],
    check(531, 534, Y + 3.501, 5),
    // 6: a ladder up the tower, 6 m
    [537, Y + 3.5, Z - 1, 537.5, Y + 9.5, Z + 1, 'metal#d08c3a', { kind: 'ladder', speed: 4.5 }],
    [537.5, Y - 0.5, Z - 3, 545, Y + 9.5, Z + 3, STONE],
    check(540, 544, Y + 9.501, 6),
    // the far side, and the finish on it
    [...pad(557, 566, Y + 9.5, 4), DECK],
    [561, Y + 9.5, Z - 2, 565, Y + 9.6, Z + 2, 'light#ffffff', 'finish'],
  ];
  return {
    name: 'Sky Steps',
    by: 'AnthonE',
    about: 'An obstacle course over lava: stones, bars, ice, a belt, a bounce pad, a ladder and a ferry, a checkpoint after each.',
    bounds: [448, 568, 476, 500],
    terrain: { origin: ORIGIN, height: 'height.png', scale: 0.25, base: 0 },
    mode: 'obby',
    movement: { walk: 6, jump: 2, gravity: 55 },
    void: 12,
    structures: [
      // under it all: touch it and you are back at your checkpoint
      { name: 'lava', boxes: [[448, 19.5, 476, 568, 20, 500, LAVA, 'kill']] },
      { name: 'course', boxes },
      // 7: the ferry, 12 m of gap in 3 s each way
      { name: 'ferry', boxes: [[545.2, Y + 9, Z - 2, 549.2, Y + 9.5, Z + 2, 'light#40c0f0']], move: { by: [7.6, 0, 0], seconds: 3, wait: 1.5, ease: true } },
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
