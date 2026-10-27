import test from 'node:test';
import assert from 'node:assert/strict';
import { newFlight, flightBytes } from './helpers.mjs';
import { View, flightWord, aimWord, arenaFrame, forcedSeed } from '../src/flight-view.mjs';
import { playFlight } from '../tools/genflight.mjs';
import { replay, parseLog, decodeTrace } from '../harness/core.mjs';
import { startWorkers } from '../harness/run-node.mjs';
import * as L from '../src/layout.mjs';
import * as F from '../src/flight.mjs';
import { compileMap, mapDir } from '../tools/map.mjs';

const MID = 512; // the middle of Skyways (maps/skyways), x and z
const SKY = 100; // m: over every hill, spire, arch, ring and tower there, under its ceiling
const FLAT = [330, MID]; // open valley floor west of the middle, between the red pad and the mesa

// A room on flight's sim with n ships in play, a free-for-all unless the seed forces another mode.
async function flight(seed = 7, n = 2) {
  const sim = await newFlight(true);
  sim.init(seed);
  const v = new View(sim.memory.buffer);
  const dv = new DataView(sim.memory.buffer);
  const step = (recs = []) => { sim.feedPlayers(recs); sim.x.step(); };
  step(Array.from({ length: n }, (_, p) => [L.EV_JOIN, p]));
  while (v.hole().state !== L.H_PLAY) step();
  return { sim, v, dv, step };
}

// Slot p at (x, y, z), its nose along yaw and pitch (1/16384 turn), moving
// along it at `speed`.
function put(g, p, x, y, z, yaw = 0, pitch = 0, speed = 0) {
  const b = L.PLAYERS + p * L.PSIZE;
  const a = yaw / 16384 * 2 * Math.PI, e = pitch / 16384 * 2 * Math.PI;
  g.dv.setFloat32(b + L.P_PX, x, true);
  g.dv.setFloat32(b + L.P_PY, y, true);
  g.dv.setFloat32(b + L.P_PZ, z, true);
  g.dv.setFloat32(b + L.P_VX, Math.cos(e) * Math.cos(a) * speed, true);
  g.dv.setFloat32(b + L.P_VY, Math.sin(e) * speed, true);
  g.dv.setFloat32(b + L.P_VZ, Math.cos(e) * Math.sin(a) * speed, true);
  g.dv.setUint16(b + F.F_YAW, yaw & 16383, true);
  g.dv.setInt16(b + F.F_PITCH, pitch, true);
}

const fxs = (v, kind) => { const out = []; for (let k = 0; k < v.fxCount(); k++) { const f = v.fx(k); if (f.kind === kind) out.push(f); } return out; };
const level = { yaw: 0, pitch: 512 };

test('Ring Race sits past every arena mode, and its news past every kit mode\'s', () => {
  // FLIGHT_TICKS is MODE_TICKS with the race's after: the race must be the next number
  assert.equal(F.M_RACE, L.MODES.length);
  assert.equal(L.FLIGHT_TICKS[F.M_RACE], F.RACE_TICKS);
  assert.equal(L.KIT & (1 << F.M_RACE), 0);
  assert.ok(F.MX_GATE >= L.MX_AM + 8 * L.AM.length && F.MX_LAP === F.MX_GATE + 1);
});

test('flight is its own sim, the arena\'s with ships, on its own map: the same exports, the ceiling in the map\'s head', async () => {
  const s = await newFlight();
  for (const name of ['init', 'step', 'step_mt', 'worker_run', 'predict', 'snapshot', 'restore', 'regrid', 'hash_region']) assert.equal(typeof s.x[name], 'function', name);
  s.init(7);
  const v = new View(s.memory.buffer);
  const ceil = v.dv.getFloat32(L.MAP_CEILING, true);
  // its own map, Skyways, not the arena's
  const want = compileMap(mapDir(F.FLIGHT_MAP));
  assert.equal(want.name, 'Skyways');
  assert.deepEqual(v.map().bounds, want.bounds);
  assert.equal(v.map().boxes.length, want.boxes.length);
  assert.equal(ceil, want.ceiling);
});

test('a ship comes in flying: SPAWN_ALT up, its nose level toward the middle, the meter full, three bombs; it waits out the countdown', async () => {
  const sim = await newFlight(true);
  sim.init(7);
  const g = { sim, v: new View(sim.memory.buffer), dv: new DataView(sim.memory.buffer), step: (recs = []) => { sim.feedPlayers(recs); sim.x.step(); } };
  g.step([0, 1, 2, 3].map((p) => [L.EV_JOIN, p]));
  assert.equal(g.v.hole().state, L.H_COUNT);
  const at = [0, 1, 2, 3].map((p) => g.v.ship(p).pos);
  for (let p = 0; p < 4; p++) {
    const s = g.v.ship(p);
    assert.ok(!s.dead && s.live);
    assert.ok(s.pos[1] - g.v.height(s.pos[0], s.pos[2]) > 15, `slot ${p} in the air`);
    assert.equal(s.boost, F.BOOST_MAX);
    assert.equal(s.bombs, F.BOMBS);
    assert.equal(s.sh, 100);
    // toward the middle, within half of a sixteenth of a turn and the tick's own turn (the word is 0: nose down)
    const turn = F.TURN / 16384 * 2 * Math.PI;
    const toMid = Math.atan2(MID - s.pos[2], MID - s.pos[0]);
    assert.ok(Math.cos(s.heading[0] - toMid) > Math.cos(Math.PI / 16 + turn), `slot ${p} faces in`);
    assert.ok(Math.abs(s.heading[1]) <= turn + 1e-6, `slot ${p} level`);
  }
  for (let k = 0; k < 250; k++) g.step([[L.EV_INPUT, 0, flightWord({ yaw: 4096, pitch: 600 })]]);
  assert.deepEqual([0, 1, 2, 3].map((p) => g.v.ship(p).pos), at, 'held');
  assert.equal(g.dv.getUint16(L.PLAYERS + F.F_YAW, true), 4096, 'the nose turned');
  assert.ok(Math.abs(Math.hypot(...g.v.ship(0).vel) - Number(F.FL_CRUISE)) < 1e-3, 'ready at the cruise');
});

test('the nose turns toward the aim at TURN a tick, slower boosting, faster braking; the speed settles at the cruise', async () => {
  const g = await flight(7, 1);
  put(g, 0, 420, SKY, MID, 0, 0, 34);
  const turned = (word, n) => { put(g, 0, 420, SKY, MID, 0, 0, 34); for (let k = 0; k < n; k++) g.step([[L.EV_INPUT, 0, word]]); return g.dv.getUint16(L.PLAYERS + F.F_YAW, true); };
  assert.equal(turned(flightWord({ yaw: 4096, pitch: 512 }), 10), 10 * F.TURN);
  assert.equal(turned(flightWord({ yaw: 4096, pitch: 512, boost: 1 }), 10), 10 * F.TURN_BOOST);
  assert.equal(turned(flightWord({ yaw: 4096, pitch: 512, brake: 1 }), 10), 10 * F.TURN_BRAKE);
  // the short way round: an aim just right of behind turns right, then stops on it
  assert.equal(turned(flightWord({ yaw: 16384 - 4096, pitch: 512 }), 5), 16384 - 5 * F.TURN);
  assert.equal(turned(flightWord({ yaw: 400, pitch: 512 }), 30), 400);
  // pitch: up to PITCH_MAX and no further
  put(g, 0, 420, SKY, MID, 0, 0, 34);
  for (let k = 0; k < 120; k++) g.step([[L.EV_INPUT, 0, flightWord({ yaw: 0, pitch: 1023 })]]);
  assert.equal(g.dv.getInt16(L.PLAYERS + F.F_PITCH, true), F.PITCH_MAX);
  // level again, from rest: the speed comes up to the cruise along the nose
  put(g, 0, 380, SKY, MID, 0, 0, 0);
  for (let k = 0; k < 250; k++) g.step([[L.EV_INPUT, 0, flightWord(level)]]);
  const s = g.v.ship(0);
  assert.ok(Math.abs(Math.hypot(...s.vel) - Number(F.FL_CRUISE)) < 0.1, `${Math.hypot(...s.vel)} m/s`);
  assert.ok(Math.abs(s.vel[1]) < 1e-3 && Math.abs(s.vel[2]) < 1e-3);
});

test('boost and brake run the meter down; run dry, neither works until it is full again', async () => {
  const g = await flight(7, 1);
  put(g, 0, 370, SKY, MID, 0, 0, 34);
  const boost = flightWord({ ...level, boost: 1 });
  for (let k = 0; k < 100; k++) g.step([[L.EV_INPUT, 0, boost]]);
  assert.equal(g.v.ship(0).boost, F.BOOST_MAX - 100);
  assert.ok(Math.hypot(...g.v.ship(0).vel) > 55, 'boosting');
  put(g, 0, 370, SKY, MID, 0, 0, 60);
  for (let k = 0; k < 100; k++) g.step([[L.EV_INPUT, 0, boost]]);
  assert.equal(g.v.ship(0).boost, 0);
  assert.ok(g.v.ship(0).spent);
  // dry: still asking, but it cruises and the meter fills
  put(g, 0, 370, SKY, MID, 0, 0, 34);
  for (let k = 0; k < 50; k++) g.step([[L.EV_INPUT, 0, boost]]);
  assert.equal(g.v.ship(0).boost, 50);
  assert.ok(Math.abs(Math.hypot(...g.v.ship(0).vel) - Number(F.FL_CRUISE)) < 0.5);
  put(g, 0, 370, SKY, MID, 0, 0, 34);
  for (let k = 0; k < 150; k++) g.step([[L.EV_INPUT, 0, flightWord({ ...level, brake: 1 })]]);
  assert.equal(g.v.ship(0).boost, F.BOOST_MAX);
  assert.ok(!g.v.ship(0).spent, 'full again');
  for (let k = 0; k < 60; k++) g.step([[L.EV_INPUT, 0, flightWord({ ...level, brake: 1 })]]);
  assert.equal(g.v.ship(0).boost, F.BOOST_MAX - 60);
  assert.ok(Math.hypot(...g.v.ship(0).vel) < 20, 'braking');
});

test('the ground bounces a ship off and a dive into it hurts; the ceiling and the map\'s edge hold it', async () => {
  const g = await flight(7, 1);
  const h = g.v.height(...FLAT);
  put(g, 0, FLAT[0], h + 6, FLAT[1], 0, -3000, 34);
  const down = flightWord({ yaw: 0, pitch: 0 });
  g.step([[L.EV_INPUT, 0, down]]);
  let low = Infinity;
  for (let k = 0; k < 40; k++) { g.step([[L.EV_INPUT, 0, down]]); const s = g.v.ship(0); low = Math.min(low, s.pos[1] - g.v.height(s.pos[0], s.pos[2])); }
  assert.ok(low >= Number(F.FL_R) - 1e-3, `never under the hull: ${low}`);
  const s = g.v.ship(0);
  assert.ok(s.sh < 100, `the dive hurt: shields ${s.sh}`);
  // straight up into the ceiling
  const ceil = g.dv.getFloat32(L.MAP_CEILING, true);
  put(g, 0, MID, ceil - 3, MID, 0, F.PITCH_MAX, 34);
  for (let k = 0; k < 60; k++) g.step([[L.EV_INPUT, 0, flightWord({ yaw: 0, pitch: 1023 })]]);
  assert.ok(g.v.ship(0).pos[1] <= ceil);
  // flat out at the edge
  const [, x1] = g.v.map().bounds;
  put(g, 0, x1 - 5, SKY, MID, 0, 0, 34);
  for (let k = 0; k < 60; k++) g.step([[L.EV_INPUT, 0, flightWord(level)]]);
  assert.ok(g.v.ship(0).pos[0] <= x1);
});

test('lasers: a ship with its nose on another wears through shields and health to a kill; a roll turns them away', async () => {
  const g = await flight(7, 2);
  const hold = () => { put(g, 0, 440, SKY, MID, 0, 0, 0); put(g, 1, 480, SKY, MID, 8192, 0, 0); };
  hold();
  let shot = g.v.ship(0).fired;
  let hits = 0, k = 0;
  for (; k < 600 && !g.v.ship(1).dead; k++) {
    hold();
    shot = (shot + 1) & 3;
    g.step([[L.EV_INPUT, 0, flightWord({ ...level, shot })], [L.EV_INPUT, 1, flightWord({ yaw: 8192, pitch: 512 })]]);
  }
  hits = fxs(g.v, L.FX_HIT).filter((f) => f.owner === 0).length;
  assert.ok(g.v.ship(1).dead, 'killed');
  assert.equal(g.v.ship(0).kills, 1);
  assert.equal(hits, Math.ceil(200 / F.LASER_DMG), 'every shot a hit');
  assert.ok(Math.abs(k - (hits - 1) * F.LASER_REFIRE) <= 2, `${k} ticks for ${hits} shots`);
  assert.ok(fxs(g.v, L.FX_KILL).some((f) => f.owner === 0 && f.shot === 1 && f.size === F.KILL_LASER));
  // back, and rolling the whole time: every laser turned away
  for (let i = 0; i < L.RESPAWN_TICKS + 2; i++) g.step();
  assert.ok(!g.v.ship(1).dead);
  for (let i = 0; i < 80; i++) {
    hold();
    g.dv.setUint8(L.PLAYERS + L.PSIZE + F.F_ROLL, 30);
    shot = (shot + 1) & 3;
    g.step([[L.EV_INPUT, 0, flightWord({ ...level, shot })]]);
  }
  assert.equal(g.v.ship(1).sh, 100);
  assert.ok(fxs(g.v, L.FX_HIT).filter((f) => f.size === F.HIT_DEFLECT).length >= 6, 'deflected');
});

test('lasers are checked where the shooter saw its target, by the lag its frames send', async () => {
  const g = await flight(7, 2);
  // the target holds still at A for a while, then sits at B; a shooter that
  // says it sees the world 12 ticks old and aims at A hits while A is within those 12 ticks
  const A = [480, SKY, MID], B = [480, SKY, MID + 20];
  for (let i = 0; i < 40; i++) { put(g, 0, 440, SKY, MID); put(g, 1, ...A, 8192); g.step(); }
  const frame = arenaFrame({ lag: 12 });
  // a whole frame of 8 ticks sets the lag
  for (let i = 0; i < 16; i++) {
    const t = g.v.tick;
    put(g, 0, 440, SKY, MID); put(g, 1, ...A, 8192);
    g.step([[L.EV_INPUT, 0, flightWord({ ...level, serial: (frame >> (t & 7)) & 1 })]]);
  }
  assert.equal(g.v.ship(0).lag, 12);
  for (let i = 0; i < 5; i++) { put(g, 0, 440, SKY, MID); put(g, 1, ...B, 8192); g.step([[L.EV_INPUT, 0, flightWord(level)]]); }
  put(g, 0, 440, SKY, MID); put(g, 1, ...B, 8192);
  g.step([[L.EV_INPUT, 0, flightWord({ ...level, shot: (g.v.ship(0).fired + 1) & 3 })]]);
  assert.equal(g.v.ship(1).sh, 100 - F.LASER_DMG, 'hit where it was seen');
});

test('a charge shot built and let go homes on the ship nearest the nose; a bomb goes off on a ship ahead', async () => {
  const g = await flight(7, 2);
  // the target 12 degrees off the nose, 60 m out, still
  const tx = 440 + 60 * Math.cos(0.21), tz = MID + 60 * Math.sin(0.21);
  const hold = () => { put(g, 0, 440, SKY, MID, 0, 0, 0); put(g, 1, tx, SKY, tz, 8192); };
  for (let k = 0; k < F.CHARGE_TICKS + 5; k++) { hold(); g.step([[L.EV_INPUT, 0, flightWord({ ...level, charge: 1 })]]); }
  assert.equal(g.v.ship(0).charge, F.CHARGE_TICKS);
  hold();
  g.step([[L.EV_INPUT, 0, flightWord(level)]]);
  const shot = g.v.projectiles().find((j) => j.kind === F.K_CHARGE);
  assert.ok(shot, 'launched');
  assert.equal(g.v.ship(0).charge, 0);
  for (let k = 0; k < 150 && g.v.ship(1).sh === 100; k++) { hold(); g.step([[L.EV_INPUT, 0, flightWord(level)]]); }
  assert.equal(g.v.ship(1).sh, 100 - F.CHARGE_DMG, 'a direct hit');
  // a charge let go before it's full fires nothing
  for (let k = 0; k < 30; k++) { hold(); g.step([[L.EV_INPUT, 0, flightWord({ ...level, charge: 1 })]]); }
  hold();
  g.step([[L.EV_INPUT, 0, flightWord(level)]]);
  assert.ok(!g.v.projectiles().some((j) => j.kind === F.K_CHARGE));
  // a bomb, dead ahead
  for (let k = 0; k < L.SHIELD_DELAY + 300; k++) { hold(); g.step([[L.EV_INPUT, 0, flightWord(level)]]); }
  put(g, 0, 400, SKY, MID, 0, 0, 34); put(g, 1, 440, SKY, MID, 8192);
  assert.equal(g.v.ship(1).sh, 100);
  g.step([[L.EV_INPUT, 0, flightWord({ ...level, bomb: 1 })]]);
  assert.equal(g.v.ship(0).bombs, F.BOMBS - 1);
  for (let k = 0; k < 60; k++) { put(g, 1, 440, SKY, MID, 8192); g.step([[L.EV_INPUT, 0, flightWord({ ...level, bomb: 1 })]]); }
  const s = g.v.ship(1);
  assert.equal(s.sh + s.hp, 200 - F.BOMB_DMG, `bombed: ${s.sh} + ${s.hp}`);
  assert.ok(fxs(g.v, L.FX_BLAST).some((f) => f.size === Number(F.FL_BOMB_RAD)));
});

test('modes: a free-for-all, then red against blue, then the juggernaut (lasers twice as hard, its nose kept), then the race; a forced mode flight has not is a free-for-all', async () => {
  const g = await flight(7, 4);
  assert.equal(g.v.mode().mode, L.M_FIESTA);
  const next = () => {
    g.dv.setUint32(L.HDR_UNTIL, g.v.tick + 2, true);
    while (g.v.hole().state !== L.H_COUNT) g.step();
    while (g.v.hole().state !== L.H_PLAY) g.step();
  };
  next();
  assert.equal(g.v.mode().mode, L.M_SLAYER);
  assert.deepEqual([0, 1, 2, 3].map((p) => g.v.ship(p).team), [0, 1, 0, 1]);
  next();
  assert.equal(g.v.mode().mode, L.M_JUGGERNAUT);
  const j = [0, 1, 2, 3].find((p) => g.v.ship(p).jugg);
  assert.ok(j >= 0);
  const js = g.v.ship(j);
  assert.equal(js.sh, L.OVERSHIELD);
  assert.equal(js.bombs, 0);
  assert.ok(g.v.dv.getUint16(L.PLAYERS + j * L.PSIZE + F.F_YAW, true) < 16384, 'no gun over its nose');
  next();
  assert.equal(g.v.mode().mode, F.M_RACE, 'then the race');
  next();
  assert.equal(g.v.mode().mode, L.M_FIESTA, 'round again');
  const h = await flight(forcedSeed(L.M_CTF), 2);
  assert.equal(h.v.mode().mode, L.M_FIESTA);
  const k = await flight(forcedSeed(L.M_SLAYER), 2);
  assert.equal(k.v.mode().mode, L.M_SLAYER);
});

test('two ships that meet bounce apart and both take a crash\'s damage, each credited to the other; allies only bounce', async () => {
  const g = await flight(7, 2);
  // head on, 6 m apart, at the cruise: 68 m/s closing
  put(g, 0, MID - 3, SKY, MID, 0, 0, 34);
  put(g, 1, MID + 3, SKY, MID, 8192, 0, 34);
  const words = [[L.EV_INPUT, 0, flightWord(level)], [L.EV_INPUT, 1, flightWord({ yaw: 8192, pitch: 512 })]];
  let close = Infinity, first = null;
  for (let k = 0; k < 40; k++) {
    g.step(words);
    const [a, b] = [g.v.ship(0), g.v.ship(1)];
    close = Math.min(close, Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2]));
    if (!first && a.sh < 100) first = { a: a.sh, b: b.sh, va: a.vel[0], vb: b.vel[0] };
    assert.ok(a.pos[0] < b.pos[0], 'never through each other');
  }
  assert.ok(close >= Number(F.FL_MEET) - 1e-3, `never closer than they meet: ${close}`);
  // the first meeting: about 68 m/s closing, each turned back
  const hurt = Math.trunc((68 - Number(F.FL_CRASH)) * Number(F.FL_CRASHK) + 5);
  assert.ok(Math.abs(100 - first.a - hurt) <= 2 && first.a === first.b, `shields ${first.a}, ${first.b}: about ${hurt} each`);
  assert.ok(first.va < 0 && first.vb > 0, `bounced: ${first.va}, ${first.vb}`);
  const hits = fxs(g.v, L.FX_HIT);
  assert.ok(hits.some((h) => h.owner === 1 && h.shot === 0) && hits.some((h) => h.owner === 0 && h.shot === 1), 'each hit credited to the other');
  // a gentle touch (under FL_CRASH closing) only bounces
  for (let k = 0; k < L.SHIELD_DELAY + 300; k++) { put(g, 0, MID - 40, SKY, MID - 40); put(g, 1, MID + 40, SKY, MID + 40); g.step(); }
  put(g, 0, MID - 1.5, SKY, MID, 0, 0, 2);
  put(g, 1, MID + 1.5, SKY, MID, 8192, 0, 2);
  g.step();
  assert.deepEqual([g.v.ship(0).sh, g.v.ship(1).sh], [100, 100]);
  // red against blue: two reds meeting head on only bounce
  const t = await flight(forcedSeed(L.M_SLAYER), 3);
  assert.equal(t.v.ship(0).team, t.v.ship(2).team);
  put(t, 0, MID - 3, SKY, MID, 0, 0, 34);
  put(t, 2, MID + 3, SKY, MID, 8192, 0, 34);
  put(t, 1, MID, SKY, MID + 200);
  for (let k = 0; k < 20; k++) t.step([[L.EV_INPUT, 0, flightWord(level)], [L.EV_INPUT, 2, flightWord({ yaw: 8192, pitch: 512 })]]);
  assert.deepEqual([t.v.ship(0).sh, t.v.ship(2).sh], [100, 100]);
  assert.ok(t.v.ship(0).pos[0] < t.v.ship(2).pos[0]);
});

test('Ring Race: the map\'s gates in order, three laps, the first home wins, places by gates passed; a ship comes back at its last gate', async () => {
  const g = await flight(forcedSeed(F.M_RACE), 2);
  assert.equal(g.v.mode().mode, F.M_RACE);
  const h = g.v.hole();
  assert.equal(h.until - h.start, F.RACE_TICKS, "the race's clock");
  const gates = g.v.race();
  assert.deepEqual(gates.map((x) => [...x.pos, x.r]), compileMap(mapDir(F.FLIGHT_MAP)).race.map((x) => x.map(Math.fround)));
  assert.equal(gates.length, 6);
  // a gate out of order counts for nothing
  const at = (p, k) => put(g, p, ...gates[k].pos);
  at(0, 2); g.step();
  assert.equal(g.v.racer(0).passed, 0);
  // round the course three times
  let gateNews = 0;
  const seen = g.v.fxCount();
  for (let k = 0; k < gates.length * F.LAPS; k++) {
    at(0, k % gates.length);
    put(g, 1, MID, SKY, MID);
    g.step();
    if (k < gates.length * F.LAPS - 1) assert.equal(g.v.racer(0).passed, k + 1, `gate ${k}`);
  }
  for (let k = seen; k < g.v.fxCount(); k++) { const f = g.v.fx(k); if (f.kind === L.FX_MODE && f.owner === 0 && (f.size === F.MX_GATE || f.size === F.MX_LAP)) gateNews++; }
  assert.equal(gateNews, gates.length * F.LAPS, 'news for every gate and lap');
  assert.equal(g.dv.getUint32(L.AH_WINNER, true), 1, 'P1 home first');
  assert.equal(g.v.hole().state, L.H_OVER);
  assert.deepEqual([0, 1].map((p) => g.v.u8[L.MODE_REC + p * L.MR_SIZE + L.MR_PLACE]), [1, 2]);
  // the next race: P2 through two gates, shot down, back at the second facing the third
  const r = await flight(forcedSeed(F.M_RACE), 2);
  const gs = r.v.race();
  for (const k of [0, 1]) { put(r, 1, ...gs[k].pos); r.step(); }
  assert.equal(r.v.racer(1).passed, 2);
  const b = L.PLAYERS + L.PSIZE;
  r.dv.setUint8(b + L.P_FL, r.v.u8[b + L.P_FL] | L.PF_DEAD);
  r.dv.setUint16(b + L.A_RESPAWN, 1, true);
  put(r, 1, MID, SKY, MID);
  r.step();
  const s = r.v.ship(1);
  assert.ok(!s.dead);
  assert.ok(Math.hypot(...[0, 1, 2].map((i) => s.pos[i] - gs[1].pos[i])) < 1, `at gate 2: ${s.pos}`);
  const to = Math.atan2(gs[2].pos[2] - s.pos[2], gs[2].pos[0] - s.pos[0]);
  assert.ok(Math.cos(s.heading[0] - to) > Math.cos(Math.PI / 16 + F.TURN / 16384 * 2 * Math.PI), 'facing gate 3');
  assert.equal(r.v.racer(1).passed, 2, 'its gates kept');
});

// Predicts slot 0 through `inputs` from every tick (1 ahead, and 6 and 30 every
// 7th) and compares each with the confirmed world when it gets there.
function predicted(g, inputs) {
  const due = new Map();
  let compared = 0;
  for (let k = 0; k < inputs.length; k++) {
    for (const n of [1, 6, 30]) {
      if ((k % 7 !== 0 && n !== 1) || k + n > inputs.length) continue;
      for (let i = 0; i < n; i++) g.dv.setUint32(L.PWORDS + 4 * i, inputs[k + i], true);
      g.sim.x.predict(0, n);
      const list = due.get(k + n) || [];
      list.push({ n, from: k, player: g.sim.u8.slice(L.PLAYERS + L.PRED_D, L.PLAYERS + L.PRED_D + L.PSIZE) });
      due.set(k + n, list);
    }
    g.step([[L.EV_INPUT, 0, inputs[k]]]);
    for (const p of due.get(k + 1) || []) {
      assert.deepEqual(p.player, g.sim.u8.slice(L.PLAYERS, L.PLAYERS + L.PSIZE), `predicted ${p.n} from ${p.from}`);
      compared++;
    }
  }
  return compared;
}

test('the prediction matches the confirmed ship bit for bit: turns, boost, brake, a roll, lasers, a charge shot, a bomb', async () => {
  const g = await flight(7, 1);
  put(g, 0, 380, SKY, MID, 0, 0, 34);
  const k0 = g.v.tick;
  const inputs = [];
  for (let k = 0; k < 420; k++) {
    const t = k0 + k;
    // round a wide circle, high over the field
    inputs.push(flightWord({ yaw: (1200 + 24 * k) & 16383, pitch: 512 + (k < 200 ? 20 : -20), boost: k >= 40 && k < 140 ? 1 : 0, brake: k >= 300 && k < 340 ? 1 : 0,
      left: k >= 150 ? 1 : 0, roll: k >= 160 ? 1 : 0, bomb: k >= 280 ? 1 : 0, charge: k >= 60 && k < 150 ? 1 : 0, shot: (k >> 1) & 3,
      serial: (arenaFrame({ lag: 7 }) >> (t & 7)) & 1 }));
  }
  assert.ok(predicted(g, inputs) > 420);
  const me = g.v.ship(0);
  assert.ok(me.shots > 20, `${me.shots} shots`);
  assert.equal(me.bombs, F.BOMBS - 1, 'the bomb');
  assert.equal(me.lag, 7);
  assert.ok(!me.dead && me.sh === 100, 'nothing hurt it');
});

test('a flight match of AI pilots scores, and replays to the same hash on every tick, on 1 and 4 threads', async () => {
  const bytes = flightBytes();
  const { log, scores } = await playFlight({ bytes, bots: 8, ticks: 6000, leaveAt: 1000 });
  assert.ok(scores.reduce((s, f) => s + f.kills, 0) > 5, 'pilots shot each other down');
  const parsed = parseLog(log);
  const a = await replay({ bytes, log: parsed, ticks: 6000, threads: 1, tag: 'f1' });
  const b = await replay({ bytes, log: parsed, ticks: 6000, threads: 4, tag: 'f4', startWorkers });
  assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(b.trace).tickHashes]);
});
