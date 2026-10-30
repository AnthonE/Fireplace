import test from 'node:test';
import assert from 'node:assert/strict';
import { newArena } from './helpers.mjs';
import { View, unpackArena } from '../src/arena-view.mjs';
import { Fighter } from '../client/arena-bot.mjs';
import { BrainBot, GOLFER } from '../client/brain.mjs';
import * as L from '../src/layout.mjs';

// An AI player's slips (a local room's, the bot host's --slips): the arena's
// fighter late to fire on a new target and blind behind it; golf's brain off
// its line; and without slips every bot as it was. Two fighters on open
// ground in a frozen Fiesta, as test/arena-client.test.mjs freezes one.
async function world() {
  const sim = await newArena();
  sim.init(7);
  const v = new View(sim.memory.buffer);
  const dv = new DataView(sim.memory.buffer);
  sim.feedPlayers([[L.EV_JOIN, 0], [L.EV_JOIN, 1]]);
  sim.x.step();
  while (v.hole().state !== L.H_PLAY) sim.x.step();
  sim.x.step();
  const put = (p, x, z) => {
    const b = L.PLAYERS + p * L.PSIZE;
    dv.setFloat32(b + L.P_PX, x, true); dv.setFloat32(b + L.P_PY, v.stand(x, z), true); dv.setFloat32(b + L.P_PZ, z, true);
    for (const o of [L.P_VX, L.P_VY, L.P_VZ]) dv.setFloat32(b + o, 0, true);
  };
  return { v, put };
}

// the first tick of `n` it pulled the trigger, or -1
function firstShot(bot, v, n, yaw) {
  bot.yaw = yaw;
  for (let t = 0; t < n; t++) if (unpackArena(bot.think(v, t, 0)).shot !== 0) return t;
  return -1;
}

test('slips: the fighter holds fire 0.25-0.6 s on a new target and only sees in front; without them it fires straight away and sees all round', async () => {
  const { v, put } = await world();
  put(0, 600, 440); put(1, 615, 440); // 15 m east of 0
  const sharp = firstShot(new Fighter(0, 7, 0.2), v, 200, 0);
  const slow = firstShot(new Fighter(0, 7, 0.2, { slips: true }), v, 200, 0);
  assert.equal(sharp, 0, 'without slips it fires on the tick it sees them');
  assert.ok(slow >= 31 + 35, `with slips at skill 0.2 not before 0.25 + 0.28 s: tick ${slow}`);
  // 1 behind it (it faces west) and 15 m off: found without slips, not with
  const behind = new Fighter(0, 7, 0.6), blind = new Fighter(0, 7, 0.6, { slips: true });
  behind.yaw = blind.yaw = 8192;
  for (let t = 0; t < 2; t++) { behind.think(v, t, 0); blind.think(v, t, 0); }
  assert.equal(behind.target, 1);
  assert.equal(blind.target, -1, 'nobody in front');
  // within 10 m it is noticed wherever it is
  put(1, 608, 440);
  const near = new Fighter(0, 7, 0.6, { slips: true });
  near.yaw = 8192;
  near.think(v, 0, 0);
  assert.equal(near.target, 1);
});

test('slips: golf\'s brain moves its shot off what it decided, less the more skill; without them the shot is the brain\'s', async () => {
  const { v } = await world();
  const ball = [500, v.height(500, 500), 500], cup = [540, v.height(540, 520), 520];
  const shot = (bot) => bot.choose(v, ball, cup).shot;
  const base = shot(new BrainBot(1, GOLFER, { lag: 8 }));
  assert.deepEqual(shot(new BrainBot(1, GOLFER, { lag: 8, skill: 0.2, seed: 5 })), base, 'a skill alone changes nothing');
  const spread = (skill) => {
    const bot = new BrainBot(1, GOLFER, { lag: 8, slips: true, skill, seed: 5 });
    let dh = 0, turn = 0;
    for (let k = 0; k < 200; k++) { const s = shot(bot); dh = Math.max(dh, Math.abs(s.dh / base.dh - 1)); turn = Math.max(turn, Math.abs(s.turn - base.turn)); }
    return { dh, turn };
  };
  const lo = spread(0.2), hi = spread(0.9);
  assert.ok(lo.dh > 0.05 && lo.dh <= 0.15 * 0.8 + 1e-6, `skill 0.2: blast distance off by ${lo.dh}`);
  assert.ok(lo.turn > 0.01 && lo.turn <= 3 * 0.8 * Math.PI / 180 + 1e-6, `skill 0.2: line off by ${lo.turn}`);
  assert.ok(hi.dh < lo.dh && hi.turn < lo.turn, 'less at skill 0.9');
});
