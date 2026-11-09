import test from 'node:test';
import assert from 'node:assert/strict';
import { newParty, partyBytes, predicted } from './helpers.mjs';
import { View, PLAT_Y, partyWord } from '../src/party-view.mjs';
import * as L from '../src/layout.mjs';
import * as MC from '../src/mg/relay.mjs';
import relay, { stage, gate } from '../client/mg/relay.mjs';
import { playParty } from '../tools/party-play.mjs';
import { replay, parseLog, decodeTrace } from '../harness/core.mjs';
import { startWorkers } from '../harness/run-node.mjs';
import { Scene } from '../client/party-render.mjs';

async function room(n = 4, play = true) {
  const sim = await newParty(true); sim.init(7);
  const v = new View(sim.memory.buffer), dv = v.dv;
  dv.setUint32(L.PG_FORCE, L.MG_RELAY + 1, true);
  const step = (events = []) => { sim.feedPlayers(events); sim.x.step(); assert.equal(sim.error().code, 0); };
  step(Array.from({ length: n }, (_, p) => [L.EV_JOIN, p]));
  while (play && v.party().state !== L.H_PLAY) step();
  return { sim, v, dv, step };
}
function put(g, p, x, z, y = PLAT_Y) {
  const a = L.PLAYERS + p * L.PSIZE;
  for (const [off, val] of [[L.P_PX, x], [L.P_PY, y], [L.P_PZ, z], [L.P_VX, 0], [L.P_VY, 0], [L.P_VZ, 0]]) g.dv.setFloat32(a + off, val, true);
  g.dv.setUint8(a + L.P_FL, L.PF_LIVE | L.PF_GROUND | (g.v.partier(p).side ? L.PF_BLUE : 0));
}
function at(g, p, side, c) { put(g, p, ...gate(stage(g.v), side, c)); }
function leg(g, side) {
  const p = stage(g.v).runner[side];
  for (let c = stage(g.v).check[side]; c < 5; c++) {
    at(g, p, side, c);
    if (c === 4) at(g, stage(g.v).next[side], side, 0);
    g.step();
  }
}

test('teams, floor, spawns and clock for 1, 8, 64 and 256 balls', async () => {
  for (const n of [1, 8, 64, 256]) {
    const g = await room(n, false), r = g.v.party();
    assert.equal(r.game, L.MG_RELAY);
    assert.equal(r.kind, L.PK_SCORE);
    assert.equal(r.len, MC.RR_LEN);
    assert.ok(g.dv.getUint32(L.PG_FLAGS, true) & L.PGF_TEAMS);
    let blue = 0;
    for (let p = 0; p < n; p++) {
      const b = g.v.partier(p); blue += b.side;
      assert.equal(b.pos[1], PLAT_Y);
      assert.ok(Math.abs(b.pos[0] - r.cx) < MC.RR_HX);
      assert.ok(Math.abs(b.pos[2] - r.cx) < MC.RR_HZ);
      assert.ok(b.ground);
    }
    assert.equal(blue, Math.floor(n / 2));
  }
});

test('ordered gates, grounded runner, teammate exchange and no duplicate scoring', async () => {
  const g = await room(), s = 0, p = stage(g.v).runner[s], q = stage(g.v).next[s];
  assert.notEqual(p, q);
  at(g, p, s, 2); g.step();
  assert.equal(stage(g.v).check[s], 0, 'cannot skip home');
  at(g, p, s, 0); g.step();
  at(g, p, s, 2); g.step();
  assert.equal(stage(g.v).check[s], 1, 'cannot skip the first far gate');
  const [x, z] = gate(stage(g.v), s, 1);
  put(g, p, x, z, PLAT_Y + 8); g.step();
  assert.equal(stage(g.v).check[s], 1, 'airborne crossing does not count');
  for (let c = 1; c <= 4; c++) { at(g, p, s, c); g.step(); }
  assert.equal(stage(g.v).score[s], 0, 'wait for the next runner');
  at(g, q, s, 0); g.step();
  assert.equal(stage(g.v).score[s], 1);
  assert.equal(stage(g.v).runner[s], q);
  assert.equal(stage(g.v).check[s], 1);
  for (let i = 0; i < 10; i++) g.step();
  assert.equal(stage(g.v).score[s], 1);
});

test('four completed legs place the winning side first', async () => {
  const g = await room(8);
  for (let i = 0; i < MC.RR_LEGS; i++) leg(g, 0);
  assert.equal(g.v.party().state, L.H_OVER);
  assert.equal(g.dv.getUint32(L.PG_TWIN, true), 1);
  for (let p = 0; p < 8; p++) assert.equal(g.v.partier(p).place === 1, g.v.partier(p).side === 0);
});

test('same-tick finishes draw; a lone runner can carry the next leg', async () => {
  const g = await room(2);
  for (let n = 0; n < MC.RR_LEGS; n++) {
    for (let c = n ? 1 : 0; c <= 4; c++) {
      for (let s = 0; s < 2; s++) at(g, stage(g.v).runner[s], s, c);
      g.step();
    }
  }
  assert.deepEqual(stage(g.v).score, [4, 4]);
  assert.equal(g.dv.getUint32(L.PG_TWIN, true), 3);
});

test('disconnect and fall replace the carrier and discard only unfinished progress', async () => {
  const g = await room(8);
  leg(g, 0);
  let p = stage(g.v).runner[0];
  at(g, p, 0, 1); g.step();
  g.step([[L.EV_LEAVE, p]]);
  assert.notEqual(stage(g.v).runner[0], p);
  assert.equal(stage(g.v).check[0], 0);
  assert.equal(stage(g.v).score[0], 1);
  p = stage(g.v).runner[0];
  put(g, p, L.B_CX, L.B_CX, PLAT_Y - L.OUT_DEPTH - 2);
  g.step(); g.step();
  assert.notEqual(stage(g.v).runner[0], p);
  assert.equal(stage(g.v).score[0], 1);
});

test('slot 255 is a runner, and an empty side uses sentinel 256', async () => {
  const g = await room(1);
  g.step([[L.EV_JOIN, 255]]);
  for (let i = 0; i < 200; i++) g.step();
  const s = g.v.partier(255).side;
  assert.equal(stage(g.v).runner[s], 255);
  g.step([[L.EV_LEAVE, 255]]);
  assert.equal(stage(g.v).runner[s], L.NPLAYER);
});

test('clock resolves by completed legs; equal scores draw', async () => {
  for (const scored of [false, true]) {
    const g = await room();
    if (scored) leg(g, 0);
    g.dv.setUint32(L.PG_LEN, g.v.party().t + 2, true);
    g.dv.setUint32(L.HDR_UNTIL, g.v.tick + 2, true);
    for (let i = 0; i < 5 && g.v.party().state === L.H_PLAY; i++) g.step();
    assert.equal(g.dv.getUint32(L.PG_TWIN, true), scored ? 1 : 3);
  }
});

test('movement prediction stays exact on the fixed floor', async () => {
  const g = await room();
  assert.ok(predicted(g, Array.from({ length: 300 }, (_, i) => partyWord({ yaw: i * 31 & 16383, move: 1 }))) >= 300);
});

test('procedural scene, HUD and bot targets are finite and follow the baton', async () => {
  const g = await room(), st = stage(g.v), p = st.runner[0];
  const scene = new Scene(1000);
  relay.draw(g.v, {}, { scene });
  assert.ok(scene.count > 10);
  assert.ok([...scene.data.slice(0, scene.count * 16)].every(Number.isFinite));
  const lines = [];
  relay.hud(g.v, { me: g.v.partier(p), slot: p, C: {}, right: (_, s) => lines.push(s) });
  assert.ok(lines.some((s) => s.includes('BATON')));
  assert.deepEqual(relay.brain.goal(g.v, g.v.partier(p), { slot: p }), gate(st, 0, 0));
  assert.equal(relay.brain.danger(g.v, st.cx + MC.RR_HX + 1, st.cx), 1);
});

test('bots finish a relay on the debug build; replay agrees on one and four threads', async () => {
  const { log, rounds } = await playParty({ bytes: partyBytes(true), mg: L.MG_RELAY, seed: 7, bots: 8, ticks: 11000, delay: 6, leaveAt: 3000, onTick(t, sim, v) {
    assert.equal(sim.error().code, 0);
    if (v.party().state === L.H_OVER) assert.ok(Math.max(...stage(v).score) >= MC.RR_LEGS);
  } });
  assert.ok(rounds > 0, 'bots finish before the time limit');
  const parsed = parseLog(log);
  const a = await replay({ bytes: partyBytes(), log: parsed, ticks: 11000, threads: 1, tag: 'relay1' });
  const b = await replay({ bytes: partyBytes(), log: parsed, ticks: 11000, threads: 4, tag: 'relay4', startWorkers });
  assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(b.trace).tickHashes]);
});


test('the local baton follows the drawn ball, including prediction and correction', async () => {
  const g = await room(), p = stage(g.v).runner[0], own = [L.B_CX + 1, PLAT_Y + 2, L.B_CX + 3];
  const batons = [];
  relay.draw(g.v, { slot: p, own }, { scene: {
    box() {},
    cyl(x, y, z, r, hh) { if (r === 0.18 && hh === 0.65) batons.push([x, y, z]); },
  } });
  assert.equal(batons.length, 2);
  assert.deepEqual(batons[0], [own[0], own[1] + 3.4, own[2]]);
  const other = g.v.partier(stage(g.v).runner[1]).pos;
  assert.deepEqual(batons[1], [other[0], other[1] + 3.4, other[2]]);
});
