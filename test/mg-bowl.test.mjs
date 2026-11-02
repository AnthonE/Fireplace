// BOWLING (src/mg/bowl.wat): the lanes for 1 to 256 balls, the floor (the
// approach, the lane, its gutters, the deck, the pit) and the walls; a gutter
// ball, the pit and the return to its own lane's approach; a knock, the ball
// never slowed, a point a pin; only a live roll knocks; pin against pin and
// its credit, the client's slide the same bits; the call, a strike, the deck
// dropping and the fresh rack; golden pins and double time; a newcomer, a
// ball alone and the places; the prediction bit for bit down the lane, into
// a gutter, onto a deck as it drops and through the pins; the client and its
// AI; rounds of AI balls; a tick of 256.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newParty, partyBytes, predicted } from './helpers.mjs';
import { View, partyWord, PLAT_Y, B_RAD } from '../src/party-view.mjs';
import { replay, parseLog, decodeTrace } from '../harness/core.mjs';
import { startWorkers } from '../harness/run-node.mjs';
import { playParty } from '../tools/genparty.mjs';
import { Partier } from '../client/party-bot.mjs';
import * as L from '../src/layout.mjs';
import * as MC from '../src/mg/bowl.mjs'; // BW_*: the minigame's own constants
import bowl, { stage, laneZ, laneAt, lanes, pins, slotOf, spot, slide, deckDown, rackAt } from '../client/mg/bowl.mjs';

const TICK = 0.008;
const f = Math.fround;
const GY = PLAT_Y - MC.BW_GD; // the gutters' floor
const HALF = MC.BW_LW / 2 + MC.BW_GW; // a lane's middle to its divider's face
const near = (a, b, e = 1e-3, m = '') => assert.ok(Math.abs(a - b) <= e, `${m} ${a} against ${b}`);

// A room of n balls in BOWLING, on the debug build (a NaN traps) unless asked not to, stepped into play unless asked not to.
async function room(n = 2, { play = true, seed = 7, debug = true } = {}) {
  const sim = await newParty(debug);
  sim.init(seed);
  const v = new View(sim.memory.buffer);
  const dv = v.dv;
  dv.setUint32(L.PG_FORCE, L.MG_BOWL + 1, true);
  const step = (recs = []) => { sim.feedPlayers(recs); sim.x.step(); assert.equal(sim.error().code, 0, 'no trap'); };
  step(Array.from({ length: n }, (_, p) => [L.EV_JOIN, p]));
  while (play && v.hole().state !== L.H_PLAY) step();
  return { sim, v, dv, step, s: stage(v) };
}
const rec = (p) => L.PLAYERS + p * L.PSIZE;
const PA = (l, k) => L.PG_BIG + MC.BW_PINS + (l * 10 + k) * MC.BW_PSIZE;
const LA = (l) => L.PG_S + MC.BW_LANES + l * MC.BW_LSIZE;
// Ball p at world (x, z), its bottom at y (on the floor there by default), rolling (vx, vz).
function put(g, p, x, z, { vx = 0, vz = 0, y = PLAT_Y, vy = 0, air = false } = {}) {
  const a = rec(p);
  [x, y, z, vx, vy, vz].forEach((val, i) => g.dv.setFloat32(a + [L.P_PX, L.P_PY, L.P_PZ, L.P_VX, L.P_VY, L.P_VZ][i], val, true));
  g.dv.setUint8(a + L.P_FL, L.PF_LIVE | (air ? 0 : L.PF_GROUND));
}
// Ball p parked still at the back of lane l's approach, at u across.
const park = (g, p, l, u = 0) => put(g, p, g.s.xa + 1.5, laneZ(g.s, l) + u);
const word = (a, move = 1) => partyWord({ yaw: Math.round(a / (2 * Math.PI) * 16384) & 16383, move });
const STILL = partyWord({ yaw: 0, move: 0 });
const fxs = (v, from, kind) => { const out = []; for (let k = from; k < v.fxCount(); k++) { const x = v.fx(k); if (x.kind === kind) out.push(x); } return out; };
// Pin k of lane l set (by default standing on its spot, nobody's).
function setPin(g, l, k, o = {}) {
  const s = g.s, [dx, dz] = spot(k), a = PA(l, k), dv = g.dv;
  const p = { st: MC.BW_UP, by: 255, cr: undefined, gold: 0, at: 0, x: f(s.xh + dx), z: f(laneZ(s, l) + dz), vx: 0, vz: 0, ux: 1, uz: 0, ...o };
  dv.setUint8(a + MC.BW_P_ST, p.st); dv.setUint8(a + MC.BW_P_BY, p.by); dv.setUint8(a + MC.BW_P_CR, p.cr ?? p.by); dv.setUint8(a + MC.BW_P_GOLD, p.gold);
  dv.setUint32(a + MC.BW_P_AT, p.at, true);
  [p.x, p.z, p.vx, p.vz, p.ux, p.uz].forEach((val, i) => dv.setFloat32(a + MC.BW_P_X + 4 * i, val, true));
  if (p.st === MC.BW_HIT) dv.setUint8(LA(l) + MC.BW_L_MOVE, 1);
}
// Lane l's clock set, and its ten standing (racked) or gone (empty) unless left as they are.
function setLane(g, l, { call = 0, first = 0, rack } = {}) {
  g.dv.setUint32(LA(l) + MC.BW_L_CALL, call, true);
  g.dv.setUint32(LA(l) + MC.BW_L_FIRST, first, true);
  if (rack === true) for (let k = 0; k < 10; k++) setPin(g, l, k);
  if (rack === false) for (let k = 0; k < 10; k++) setPin(g, l, k, { st: MC.BW_DROP, at: 1 });
}
const ball = (g, p) => { const b = g.v.partier(p); const [l, u] = laneAt(g.s, b.pos[2]); return { ...b, l, u, x: b.pos[0], y: b.pos[1] }; };

test('the stage for 1, 8, 64 and 256: a lane for every 6 (2 to 43) side by side, centred; 40 m from the foul line to the head pin; every ball on its lane\'s approach; ten standing on every deck', async () => {
  assert.equal(f(MC.BW_PITCH), f(MC.BW_LW + 2 * MC.BW_GW + MC.BW_DIV));
  assert.equal(f(MC.BW_ROW), f(MC.BW_PS * Math.sqrt(3) / 2));
  for (const n of [1, 8, 64, 256]) {
    const g = await room(n, { play: false, seed: n });
    const r = g.v.party(), s = g.s;
    const nl = Math.min(MC.BW_NLMAX, Math.max(MC.BW_NLMIN, Math.ceil(n / MC.BW_PER)));
    assert.equal(r.game, L.MG_BOWL);
    assert.deepEqual([r.kind, r.len, r.respawn, r.flags], [L.PK_SCORE, MC.BW_LEN, MC.BW_RESPAWN, L.PGF_BUMPS | L.PGF_NOKICK]);
    assert.deepEqual([r.drag, r.hop, r.floor], [f(MC.BW_DRAG), 0, f(GY)]);
    assert.equal(s.nl, nl, `${nl} lanes for ${n}`);
    near(s.xf - s.xa, MC.BW_APP);
    near(s.xh - s.xf, MC.BW_LANE);
    near(s.xh - s.xd, MC.BW_DECKF);
    near(s.xe - s.xh, 3 * MC.BW_ROW + MC.BW_DECKB);
    near(s.xb - s.xe, MC.BW_PIT);
    near((s.xa + s.xb) / 2, L.B_CX, 1e-3, 'centred along');
    near(s.zl + nl * MC.BW_PITCH / 2, L.B_CX, 1e-3, 'centred across');
    near(r.size, Math.max(s.xb - s.xa, nl * MC.BW_PITCH + MC.BW_DIV) / 2, 1e-3, 'its size');
    const on = new Array(nl).fill(0);
    for (let p = 0; p < n; p++) {
      const b = ball(g, p);
      assert.equal(b.l, p % nl, `${n}: P${p + 1} on lane ${p % nl + 1}`);
      on[b.l]++;
      assert.equal(b.y, PLAT_Y);
      assert.ok(b.x > s.xa + B_RAD && b.x < s.xf - B_RAD && Math.abs(b.u) <= HALF - B_RAD, `${n}: P${p + 1} on its approach`);
    }
    assert.ok(Math.max(...on) <= MC.BW_PER, `${Math.max(...on)} at most on a lane`);
    for (const ln of lanes(g.v)) {
      assert.deepEqual([ln.call, ln.first, ln.racks], [0, 0, 1]);
      assert.ok(ln.gold === 255 || (ln.gold >= 1 && ln.gold <= 9), 'a golden pin is never the head pin');
      const ps = pins(g.v, ln.l);
      ps.forEach((p, k) => {
        assert.deepEqual([p.st, p.by, p.gold], [MC.BW_UP, 255, ln.gold === k ? 1 : 0]);
        assert.deepEqual([p.x, p.z], [f(s.xh + spot(k)[0]), f(laneZ(s, ln.l) + spot(k)[1])]);
      });
      // a triangle BW_PS apart, its back row inside the lane's surface
      assert.ok(Math.abs(Math.hypot(ps[1].x - ps[0].x, ps[1].z - ps[0].z) - MC.BW_PS) < 1e-4 && Math.abs(ps[9].z - ps[6].z - 3 * MC.BW_PS) < 1e-4);
      assert.ok(Math.abs(ps[9].z - laneZ(s, ln.l)) + MC.BW_PR < MC.BW_LW / 2);
    }
  }
});

test('the floor and the walls: the approach across a lane and its gutters, the lane, the gutters BW_GD down from the foul line to the lip, the deck, nothing over the pit; off a divider, the approach\'s back and the pit\'s back wall at BW_WE', async () => {
  const g = await room(2);
  const s = g.s, zc = laneZ(s, 0);
  park(g, 1, 1);
  const settle = (x, z) => { put(g, 0, x, z, { y: PLAT_Y + 0.2, air: true }); for (let k = 0; k < 60; k++) g.step(); return ball(g, 0); };
  assert.equal(settle(s.xf - 2, zc + 4.1).y, PLAT_Y, 'the approach, over a gutter\'s strip');
  assert.equal(settle(s.xf + 10, zc - 1).y, PLAT_Y, 'the lane');
  let b = settle(s.xf + 10, zc + 4.1);
  assert.ok(b.y === f(GY) && b.ground, `down in a gutter: ${b.y}`);
  assert.ok(b.u >= MC.BW_LW / 2 + B_RAD - 1e-4 && b.u <= HALF - B_RAD + 1e-4, `in its channel, ${b.u}`);
  assert.equal(settle(s.xh + 5, zc - 2.5).y, PLAT_Y, 'the deck');
  put(g, 0, s.xe + 2, zc, { y: PLAT_Y + 0.1, air: true });
  for (let k = 0; k < 80; k++) g.step();
  assert.ok(ball(g, 0).y < PLAT_Y - 1, 'into the pit');
  // a divider
  put(g, 0, s.xf - 4, zc + 1, { vz: 7 });
  let hit = null, umax = -1e9;
  for (let k = 0; k < 120; k++) {
    const vz0 = ball(g, 0).vel[2];
    g.step([[L.EV_INPUT, 0, STILL]]);
    b = ball(g, 0);
    umax = Math.max(umax, b.u);
    if (!hit && b.vel[2] < 0) hit = [vz0, b.vel[2]];
  }
  assert.ok(umax <= HALF - B_RAD + 1e-4 && umax > HALF - B_RAD - 1e-3, `held at its face: ${umax}`);
  assert.ok(hit && Math.abs(hit[1] / hit[0] + MC.BW_WE) < 0.05, `off it at BW_WE: ${hit}`);
  // the approach's back
  put(g, 0, s.xa + 2, zc, { vx: -6 });
  let xmin = 1e9;
  for (let k = 0; k < 80; k++) { g.step([[L.EV_INPUT, 0, STILL]]); xmin = Math.min(xmin, ball(g, 0).x); }
  assert.ok(xmin >= s.xa + B_RAD - 1e-4 && ball(g, 0).vel[0] > 0, 'off the approach\'s back');
  // the pit's back wall, falling
  put(g, 0, s.xb - 2, zc, { vx: 9, y: PLAT_Y - 0.3, air: true });
  let xmax = -1e9;
  for (let k = 0; k < 40; k++) { g.step([[L.EV_INPUT, 0, STILL]]); xmax = Math.max(xmax, ball(g, 0).x); }
  assert.ok(xmax <= s.xb - B_RAD + 1e-4 && ball(g, 0).vel[0] <= 0, 'off the pit\'s back wall');
});

test('a gutter: a ball rolled off the lane\'s edge drops in, is eased into the channel, runs on down it and can\'t climb out, into the pit; and BW_RESPAWN after it is down it drops onto its own lane\'s approach', async () => {
  const g = await room(2);
  const s = g.s, z1 = laneZ(s, 1);
  park(g, 1, 1, -3);
  // P1 on lane 1 (P2's), the fewest now lane 0's
  put(g, 0, s.xf + 4, z1 + 2.2, { vx: 9, vz: 2.5 });
  const f0 = g.v.fxCount();
  let inAt = -1, low = 1e9;
  for (let k = 0; k < 300 && !g.v.partier(0).falling && !g.v.partier(0).out; k++) {
    // turned back toward the lane once in, to try and climb out
    g.step([[L.EV_INPUT, 0, word(inAt >= 0 && k - inAt < 120 ? -1.2 : 0)]]);
    const b = ball(g, 0);
    if (inAt < 0 && (g.v.partier(0).m & MC.BW_M_GUTTER)) inAt = k;
    if (inAt >= 0 && k - inAt > 25 && b.x < s.xe) {
      low = Math.min(low, b.u);
      assert.ok(b.y === f(GY) && b.u <= HALF - B_RAD + 1e-4, `in its channel: ${b.u} at ${b.y}`);
    }
  }
  assert.ok(inAt >= 0, 'dropped into the gutter');
  assert.ok(low >= MC.BW_LW / 2 + B_RAD - 1e-4, `never back out over the lane: ${low}`);
  const gx = fxs(g.v, f0, MC.BW_FX_GUTTER);
  assert.deepEqual(gx.map((x) => [x.owner, x.shot]), [[0, 1]], 'its FX, once');
  for (let k = 0; k < 300 && !g.v.partier(0).out; k++) g.step([[L.EV_INPUT, 0, word(0)]]);
  const out = g.v.partier(0);
  assert.ok(out.out, 'down in the pit');
  assert.deepEqual([slotOf(g.v, 0).gutters, slotOf(g.v, 0).lane, slotOf(g.v, 0).roll], [1, 1, 0]);
  assert.equal(bowl.sink({ owner: 0 }, (q) => `P${q + 1}`, g.v), 'P1 GUTTER BALL');
  assert.ok(fxs(g.v, f0, L.FX_SINK).some((x) => x.owner === 0));
  while (g.v.partier(0).out) g.step();
  const back = ball(g, 0);
  assert.equal(g.v.tick - 1 - out.outAt, MC.BW_RESPAWN, 'back BW_RESPAWN after');
  assert.equal(back.l, 1, 'on its own lane, not the emptier one');
  assert.ok(back.x > s.xa + 1.3 && back.x < s.xa + 3.2 && Math.abs(back.u) < 4 && Math.abs(back.y - (PLAT_Y + MC.BW_DROPY)) < 0.1, `dropping onto its approach: ${back.x - s.xa}, ${back.u}, ${back.y}`);
  for (let k = 0; k < 120; k++) g.step();
  assert.ok(ball(g, 0).ground && ball(g, 0).y === PLAT_Y && !g.v.partier(0).out);
});

test('a knock: a ball on a live roll knocks every pin its edge reaches, put out to touching and off along the line at 1 + BW_E of the closing speed plus BW_CARRY across, within BW_SPREAD; the ball never slowed or moved; a point a pin', async () => {
  const g = await room(2, { seed: 3 });
  const s = g.s, zc = laneZ(s, 0);
  park(g, 1, 1);
  for (let k = 0; k < 10; k++) setPin(g, 0, k);
  put(g, 0, s.xf - 1, zc + 0.6, { vx: 12 });
  const save = g.sim.u8.slice(0, 0x100000);
  const f0 = g.v.fxCount();
  const run = () => {
    const out = [];
    for (let k = 0; k < 520; k++) {
      g.step([[L.EV_INPUT, 0, word(0)]]);
      const r = g.sim.u8.slice(rec(0), rec(0) + L.PSIZE);
      r[L.PG_SCORE] = r[L.PG_SCORE + 1] = 0;
      out.push(r);
    }
    return out;
  };
  // the head pin's knock: the ball where it was that tick
  let first = null;
  const orig = g.step;
  g.step = (recs) => { orig(recs); if (!first) { const x = fxs(g.v, f0, MC.BW_FX_KNOCK).find((q) => (q.shot & 15) === 0); if (x) first = { x, b: ball(g, 0), pin: pins(g.v, 0)[0] }; } };
  const a = run();
  g.step = orig;
  const knocks = fxs(g.v, f0, MC.BW_FX_KNOCK).filter((x) => x.owner === 0 && x.size > 0);
  assert.ok(knocks.length >= 6, `${knocks.length} knocked`);
  assert.equal(g.v.partier(0).score, knocks.reduce((t, x) => t + x.size, 0));
  assert.equal(slotOf(g.v, 0).pins, knocks.length, 'a point a pin');
  assert.equal(slotOf(g.v, 0).roll, knocks.length, 'all on this roll');
  assert.equal(bowl.sink({ owner: 0 }, (q) => `P${q + 1}`, g.v), `P1 ${knocks.length} PINS`, 'the feed\'s line as it drops into the pit');
  assert.ok(first, 'the head pin knocked');
  const { x, b, pin } = first;
  const dx = x.pos[0] - b.pos[0], dz = x.pos[2] - b.pos[2], d = Math.hypot(dx, dz);
  near(d, B_RAD + MC.BW_PR + 0.005, 2e-3, 'out to touching');
  const nx = dx / d, nz = dz / d, bn = b.vel[0] * nx + b.vel[2] * nz;
  const q = Math.max(bn * (1 + MC.BW_E), MC.BW_KMIN);
  const wx = nx * q + (b.vel[0] - nx * bn) * MC.BW_CARRY, wz = nz * q + (b.vel[2] - nz * bn) * MC.BW_CARRY;
  const sp = Math.hypot(pin.vx, pin.vz);
  near(sp, Math.min(MC.BW_PVMAX, Math.hypot(wx, wz)) * MC.BW_PROLL, 2e-3, 'its speed');
  const turn = Math.acos(Math.min(1, (pin.vx * wx + pin.vz * wz) / (sp * Math.hypot(wx, wz))));
  assert.ok(turn <= MC.BW_SPREAD / 16384 * 2 * Math.PI + 2e-3, `turned ${turn} rad`);
  assert.ok(Math.abs(Math.atan2(pin.uz, pin.ux) - Math.atan2(pin.vz, pin.vx)) < 1e-4, 'it falls the way it goes');
  // the same roll down a lane with no pins: every byte of the ball the same, tick by tick, but its score
  g.sim.u8.set(save);
  setLane(g, 0, { rack: false });
  const c = run();
  c.forEach((r, k) => assert.deepEqual(r, a[k], `tick ${k}`));
});

test('only a live roll knocks: a ball that rolled on slower than BW_VLIVE past the foul line, one put on the lane without crossing it, one in a gutter, pass the pins by', async () => {
  const g = await room(2, { seed: 4 });
  const s = g.s, zc = laneZ(s, 0);
  park(g, 1, 1);
  const through = (setup) => {
    setLane(g, 0, { rack: true });
    setup();
    const f0 = g.v.fxCount();
    for (let k = 0; k < 160 && !g.v.partier(0).falling; k++) g.step([[L.EV_INPUT, 0, word(0)]]);
    assert.equal(fxs(g.v, f0, MC.BW_FX_KNOCK).length, 0, 'nothing knocked');
    assert.ok(pins(g.v, 0).every((p) => p.st === MC.BW_UP));
    assert.ok(ball(g, 0).x > s.xh + 3 || g.v.partier(0).falling, 'through them');
    assert.equal(slotOf(g.v, 0).live, 0);
  };
  // slow over the foul line, then given its speed
  through(() => {
    put(g, 0, s.xf - 0.4, zc, { vx: 1.5 });
    for (let k = 0; k < 60; k++) g.step([[L.EV_INPUT, 0, STILL]]);
    assert.ok(ball(g, 0).x > s.xf && slotOf(g.v, 0).live === 0, 'over the line too slowly');
    put(g, 0, s.xh - 5, zc + 0.5, { vx: 12 });
  });
  // put on the lane still, then rolled
  through(() => {
    put(g, 0, s.xh - 5, zc - 0.5);
    g.step([[L.EV_INPUT, 0, STILL]]);
    put(g, 0, s.xh - 5, zc - 0.5, { vx: 12 });
  });
  // armed, then down a gutter past the pins
  through(() => {
    put(g, 0, s.xf - 1, zc);
    g.step([[L.EV_INPUT, 0, STILL]]);
    assert.equal(slotOf(g.v, 0).live, 1, 'armed behind the foul line');
    put(g, 0, s.xh - 5, zc + MC.BW_LW / 2 + 1.05, { vx: 12, y: GY });
  });
});

test('pin against pin: a knocked pin slides BW_PROLL a tick, topples over BW_TIP and knocks the standing pins its body meets, credited to its knocker; one shoved by a ball is the ball\'s; off the surface into a gutter, past the lip into the pit; the client\'s slide the same bits', async () => {
  const g = await room(3, { seed: 5 });
  const s = g.s, zc = laneZ(s, 0);
  park(g, 0, 0, -3); park(g, 1, 1); park(g, 2, 0, 3);
  // the head pin knocked by P2 straight back at the 5 pin, toppling as it goes
  setLane(g, 0, { rack: true, first: g.v.tick });
  setPin(g, 0, 0, { st: MC.BW_HIT, by: 1, at: g.v.tick, vx: 6, vz: 0, ux: 1, uz: 0 });
  const f0 = g.v.fxCount();
  for (let k = 0; k < 120; k++) g.step();
  const k4 = fxs(g.v, f0, MC.BW_FX_KNOCK).filter((x) => x.owner === 1);
  assert.ok(k4.some((x) => (x.shot & 15) === 4), `the 5 pin went: ${k4.map((x) => x.shot & 15)}`);
  assert.ok(pins(g.v, 0).filter((p) => p.st !== MC.BW_UP).every((p) => p.by === 1), 'every pin it set going is P2\'s');
  assert.equal(g.v.partier(1).score, k4.length, 'P2 has their points');
  // deadwood: P3 rolls into a lying pin, sends it into a standing one, which is P3's
  setLane(g, 0, { rack: true });
  setPin(g, 0, 0, { st: MC.BW_HIT, by: 1, at: 1, ux: 0, uz: 1, x: f(s.xh - 0.5), z: f(zc) });
  put(g, 2, s.xf - 1, zc, { vx: 12 });
  const f1 = g.v.fxCount();
  for (let k = 0; k < 400 && !g.v.partier(2).falling; k++) g.step([[L.EV_INPUT, 2, word(0)]]);
  assert.ok(fxs(g.v, f1, MC.BW_FX_KNOCK).every((x) => x.owner === 2), 'whatever the deadwood knocks is P3\'s');
  assert.equal(pins(g.v, 0)[0].cr, 2);
  // alone on the lane: the client slides it on the same bits, off its side into a gutter
  setLane(g, 0, { rack: false });
  setPin(g, 0, 3, { st: MC.BW_HIT, by: 1, at: g.v.tick, vx: 7.3, vz: 2.1 });
  const p0 = pins(g.v, 0)[3];
  const mirror = slide({ ...p0 }, s, 0, 40);
  for (let k = 0; k < 40; k++) g.step();
  const p1 = pins(g.v, 0)[3];
  assert.deepEqual([p1.x, p1.z, p1.vx, p1.vz], [mirror.x, mirror.z, mirror.vx, mirror.vz], 'the same bits');
  assert.ok(p1.vx < p0.vx * MC.BW_PROLL ** 39 * 1.001);
  setPin(g, 0, 3, { st: MC.BW_HIT, by: 1, at: 1, vx: 0.5, vz: 5, z: f(zc + 2.5) });
  const m2 = slide({ ...pins(g.v, 0)[3] }, s, 0, 60);
  let dropped = -1;
  for (let k = 0; k < 60 && dropped < 0; k++) { g.step(); if (pins(g.v, 0)[3].st === MC.BW_DROP) dropped = k + 1; }
  assert.ok(dropped > 0 && dropped === m2.drop, `into the gutter on tick ${dropped}, the client's ${m2.drop}`);
  // past the lip into the pit
  setPin(g, 0, 9, { st: MC.BW_HIT, by: 1, at: 1, vx: 9, vz: 0 });
  for (let k = 0; k < 40; k++) g.step();
  assert.equal(pins(g.v, 0)[9].st, MC.BW_DROP);
  assert.ok(pins(g.v, 0)[9].x >= s.xe);
});

test('the rack: all ten down calls the lane, a strike paying BW_STRIKE to a ball that knocked them all; BW_WAIT after its first with some standing, called anyway; once called nothing scores; BW_SWEEP on the deck drops, a ball on it into the pit; BW_DOWN later a fresh ten stand', async () => {
  const g = await room(3, { seed: 6 });
  const s = g.s, z0 = laneZ(s, 0), z1 = laneZ(s, 1);
  park(g, 1, 1); park(g, 2, 1, 3);
  // nine of lane 0 lying, P1's, the head pin standing: P1 rolls into it
  setLane(g, 0, { first: g.v.tick });
  for (let k = 1; k < 10; k++) setPin(g, 0, k, { st: MC.BW_HIT, by: 0, at: 1, ux: 0, uz: 1, x: f(s.xh + spot(k)[0] + 0.4) });
  setPin(g, 0, 0);
  put(g, 0, s.xf - 1, z0, { vx: 12 });
  const f0 = g.v.fxCount();
  for (let k = 0; k < 500 && !lanes(g.v)[0].call; k++) g.step([[L.EV_INPUT, 0, word(0)]]);
  const st = fxs(g.v, f0, MC.BW_FX_STRIKE);
  assert.deepEqual(st.map((x) => [x.owner, x.shot, x.size]), [[0, 0, MC.BW_STRIKE]], 'a strike');
  assert.equal(g.v.partier(0).score, 1 + MC.BW_STRIKE);
  assert.deepEqual([slotOf(g.v, 0).strikes, lanes(g.v)[0].strikes], [1, 1]);
  const call = lanes(g.v)[0].call;
  assert.equal(call, g.v.tick - 1, 'called the tick its last pin went');
  assert.ok(fxs(g.v, f0, MC.BW_FX_LANE).some((x) => x.shot === (MC.BW_WCALL << 8)));
  // lane 1: P2 knocked four, six standing: called BW_WAIT after its first, no strike
  const t1 = g.v.tick;
  setLane(g, 1, { rack: true, first: t1 });
  for (const k of [0, 1, 2, 4]) setPin(g, 1, k, { st: MC.BW_HIT, by: 1, at: 1, uz: 1, ux: 0, x: f(s.xh + spot(k)[0] - 0.2) });
  // the sweep on lane 0, P3 put still on its deck just before
  while (g.v.tick < call + MC.BW_SWEEP - 3) g.step();
  put(g, 2, s.xh + 2, z0 - 1);
  const f1 = g.v.fxCount();
  for (let k = 0; k < 6; k++) g.step([[L.EV_INPUT, 2, STILL]]);
  assert.ok(pins(g.v, 0).every((p) => p.st === MC.BW_DROP && p.at <= call + MC.BW_SWEEP), 'everything on the deck dropped');
  assert.ok(fxs(g.v, f1, MC.BW_FX_LANE).some((x) => x.shot === (MC.BW_WSWEEP << 8)));
  assert.ok(deckDown(lanes(g.v)[0], g.v.tick));
  for (let k = 0; k < 30; k++) g.step([[L.EV_INPUT, 2, STILL]]);
  assert.ok(ball(g, 2).y < PLAT_Y - 1, 'P3 through the deck');
  // the fresh ten
  while (g.v.tick <= call + MC.BW_SWEEP + MC.BW_DOWN) g.step();
  const ln = lanes(g.v)[0];
  assert.deepEqual([ln.call, ln.first, ln.racks, ln.rack], [0, 0, 2, rackAt({ call })]);
  pins(g.v, 0).forEach((p, k) => assert.deepEqual([p.st, p.x, p.z], [MC.BW_UP, f(s.xh + spot(k)[0]), f(z0 + spot(k)[1])]));
  // lane 1 called BW_WAIT after its first
  while (!lanes(g.v)[1].call && g.v.tick < t1 + MC.BW_WAIT + 5) g.step();
  assert.equal(lanes(g.v)[1].call, t1 + MC.BW_WAIT);
  assert.equal(lanes(g.v)[1].strikes, 0);
  // called: P2's live roll (armed behind the foul line) into the six standing knocks them, for nothing
  const before = g.v.partier(1).score;
  put(g, 1, s.xf - 1, z1);
  g.step([[L.EV_INPUT, 1, STILL]]);
  put(g, 1, s.xh - 6, z1, { vx: 12 });
  const f2 = g.v.fxCount();
  for (let k = 0; k < 330 && !g.v.partier(1).falling; k++) g.step([[L.EV_INPUT, 1, word(0)]]);
  const kn = fxs(g.v, f2, MC.BW_FX_KNOCK).filter((x) => x.owner === 1);
  assert.ok(kn.length >= 3 && kn.every((x) => x.size === 0), `${kn.length} knocked for nothing`);
  assert.equal(g.v.partier(1).score, before);
});

test('golden pins, in about one rack in BW_GOLDP, never the head pin, pay BW_GOLD; the last 15 s pay double, a strike too, called with an FX', async () => {
  const g0 = await room(256, { play: false, seed: 21 });
  const golds = lanes(g0.v).map((ln) => ln.gold).filter((x) => x !== 255);
  assert.ok(golds.length >= 6 && golds.length <= 24 && golds.every((k) => k >= 1 && k <= 9), `${golds.length} golden of 43: ${golds}`);
  const g = await room(2, { seed: 8 });
  const s = g.s, z0 = laneZ(s, 0);
  park(g, 1, 1);
  setLane(g, 0, { rack: false });
  setPin(g, 0, 0, { gold: 1 });
  put(g, 0, s.xf - 1, z0, { vx: 12 });
  const f0 = g.v.fxCount();
  for (let k = 0; k < 420 && !g.v.partier(0).falling; k++) g.step([[L.EV_INPUT, 0, word(0)]]);
  assert.deepEqual(fxs(g.v, f0, MC.BW_FX_KNOCK).map((x) => [x.owner, x.shot, x.size]), [[0, 0, MC.BW_GOLD]]);
  assert.equal(g.v.partier(0).score, MC.BW_GOLD);
  // the clock to 2 ticks short of the last 15 s
  g.dv.setUint32(L.HDR_START, g.v.tick - (MC.BW_LEN - MC.BW_DOUBLE) + 2, true);
  for (let k = 0; k < 130 && g.v.partier(0).out !== false; k++) g.step();
  const f1 = g.v.fxCount();
  for (let k = 0; k < 4; k++) g.step();
  assert.ok(fxs(g.v, f1, MC.BW_FX_LANE).some((x) => x.shot === (255 | (MC.BW_WDOUBLE << 8))), 'double time called');
  // a strike in double time: the ten, one golden
  setLane(g, 0, { first: g.v.tick });
  for (let k = 1; k < 10; k++) setPin(g, 0, k, { st: MC.BW_HIT, by: 0, at: 1, ux: 0, uz: 1, x: f(s.xh + spot(k)[0] + 0.4) });
  setPin(g, 0, 0, { gold: 1 });
  put(g, 0, s.xf - 1, z0, { vx: 12 });
  const before = g.v.partier(0).score;
  for (let k = 0; k < 420 && !lanes(g.v)[0].call; k++) g.step([[L.EV_INPUT, 0, word(0)]]);
  assert.equal(g.v.partier(0).score - before, 2 * (MC.BW_GOLD + MC.BW_STRIKE), 'all of it doubled');
});

test('a newcomer in play drops onto the lane with fewest on it; a ball alone plays its own lane; the clock ends it, placed by points', async () => {
  const g = await room(3, { seed: 12 });
  g.step([[L.EV_JOIN, 3]]);
  for (let k = 0; k < 120; k++) g.step();
  assert.equal(ball(g, 3).l, 1, 'onto lane 2, one on it against two');
  assert.ok(!g.v.partier(3).out && ball(g, 3).x < g.s.xf);
  // places by points: 5, 9, 9, 0
  [5, 9, 9, 0].forEach((sc, p) => g.dv.setUint16(rec(p) + L.PG_SCORE, sc, true));
  g.dv.setUint32(L.HDR_UNTIL, g.v.tick + 1, true);
  for (let k = 0; k < 4; k++) g.step();
  assert.equal(g.v.hole().state, L.H_OVER);
  assert.deepEqual([0, 1, 2, 3].map((p) => g.v.partier(p).place), [3, 1, 1, 4]);
  // a ball alone: two lanes, its own rolled at and scored
  const a = await room(1, { seed: 13 });
  assert.equal(a.s.nl, 2);
  const bot = new Partier(0, 3, 0.9);
  for (let k = 0; k < 1100; k++) a.step([[L.EV_INPUT, 0, bot.think(a.v, a.v.tick, 0)]]);
  assert.ok(a.v.partier(0).score >= 5, `it scored ${a.v.partier(0).score}`);
});

test('the prediction matches the confirmed ball bit for bit: down the lane weaving, off the edge into a gutter and down it into the pit; onto a deck as it drops; the call and its drop PRED_MAX ahead; through the pins every byte but its score', async () => {
  const g = await room(2, { seed: 9 });
  const s = g.s, zc = laneZ(s, 0);
  park(g, 1, 1);
  setLane(g, 0, { rack: false });
  let compared = 0;
  // in tens, till it falls (going down is the confirmed world's, past where a prediction from here reaches)
  const chunks = (mk, max) => { for (let n = 0; n < max && !g.v.partier(0).falling; n++) compared += predicted(g, Array.from({ length: 10 }, (_, i) => mk(n * 10 + i))); };
  // A: from the approach down the lane weaving, slowing, then off the right edge into the gutter and down it
  put(g, 0, s.xa + 3, zc - 1);
  const f0 = g.v.fxCount();
  chunks((k) => word(k < 330 ? 0.22 * Math.sin(k * 0.03) : 0.6, k % 97 < 82 ? 1 : 0), 120);
  assert.ok(fxs(g.v, f0, MC.BW_FX_GUTTER).some((x) => x.owner === 0), 'into the gutter');
  assert.ok(g.v.partier(0).falling && ball(g, 0).x > s.xe, 'down it into the pit');
  while (!g.v.partier(0).out) g.step();
  while (g.v.partier(0).out) g.step();
  // B: coasting onto a deck as it drops
  setLane(g, 0, { rack: false, call: g.v.tick - MC.BW_SWEEP + 70 });
  put(g, 0, s.xd - 2, zc + 0.5, { vx: 5 });
  chunks((k) => word(0.1 * Math.sin(k * 0.1), k < 20 ? 1 : 0), 40);
  assert.ok(g.v.partier(0).falling && ball(g, 0).x > s.xd && ball(g, 0).x < s.xe, 'through the deck');
  while (!g.v.partier(0).out) g.step();
  while (g.v.partier(0).out) g.step();
  while (lanes(g.v)[0].call) g.step();
  // C: a ball still on the deck as its lane is called: the prediction PRED_MAX on knows the drop the tick it's called, and only then
  setLane(g, 0, { rack: false });
  put(g, 0, s.xh + 3, zc - 1.5);
  g.step([[L.EV_INPUT, 0, STILL]]);
  for (let i = 0; i < L.PRED_MAX; i++) g.dv.setUint32(L.PWORDS + 4 * i, STILL, true);
  const save = g.sim.u8.slice(0, 0x100000);
  for (const known of [false, true]) {
    g.sim.u8.set(save);
    g.dv.setUint32(LA(0) + MC.BW_L_FIRST, 1, true); // all ten down: called on the next tick
    if (known) g.step([[L.EV_INPUT, 0, STILL]]);
    const t0 = g.v.tick;
    g.sim.x.predict(0, L.PRED_MAX);
    const ahead = g.sim.u8.slice(L.PLAYERS + L.PRED_D, L.PLAYERS + L.PRED_D + L.PSIZE);
    for (let i = 0; i < L.PRED_MAX; i++) g.step([[L.EV_INPUT, 0, STILL]]);
    assert.deepEqual(ahead, g.sim.u8.slice(L.PLAYERS, L.PLAYERS + L.PSIZE), `${L.PRED_MAX} ahead from ${known ? 'the call' : 'just before it'}`);
    assert.equal(lanes(g.v)[0].call, known ? t0 - 1 : t0);
    assert.equal(ball(g, 0).ground, !known, known ? 'its deck gone from under it on the last tick' : 'still on the deck');
  }
  g.sim.u8.set(save);
  // D: through a fresh ten, 30 ahead each tick: every byte but PG_SCORE (the pay is the confirmed world's)
  setLane(g, 0, { rack: true });
  put(g, 0, s.xf - 1, zc + 0.4, { vx: 12 });
  for (let k = 0; k < 420; k++) g.step([[L.EV_INPUT, 0, word(0)]]);
  setLane(g, 0, { rack: true });
  put(g, 0, s.xh - 9, zc + 0.4, { vx: 12 });
  g.dv.setUint8(L.PG_S + MC.BW_SLOTS + MC.BW_S_LIVE, 1);
  const words = Array.from({ length: 160 }, (_, k) => word(0.05 * Math.sin(k * 0.2)));
  let knocked = 0;
  for (let k = 0; k < 110 && ball(g, 0).y > PLAT_Y - 1; k++) {
    for (let i = 0; i < 30; i++) g.dv.setUint32(L.PWORDS + 4 * i, words[k + i], true);
    g.sim.x.predict(0, 30);
    const pred = g.sim.u8.slice(L.PLAYERS + L.PRED_D, L.PLAYERS + L.PRED_D + L.PSIZE);
    const keep = g.sim.u8.slice(0, 0x100000), f1 = g.v.fxCount();
    for (let i = 0; i < 30; i++) g.step([[L.EV_INPUT, 0, words[k + i]]]);
    knocked += fxs(g.v, f1, MC.BW_FX_KNOCK).filter((x) => x.owner === 0).length;
    const conf = g.sim.u8.slice(L.PLAYERS, L.PLAYERS + L.PSIZE);
    for (let b = 0; b < L.PSIZE; b++) if (b !== L.PG_SCORE && b !== L.PG_SCORE + 1) assert.equal(pred[b], conf[b], `byte ${b}, ${k}`);
    g.sim.u8.set(keep);
    g.step([[L.EV_INPUT, 0, words[k]]]);
    compared++;
  }
  assert.ok(knocked >= 10, `${knocked} knocks met on the way`);
  assert.ok(compared > 500, `${compared} compared`);
});

test('the client module: draws the lanes, gutters, dividers, pins standing, toppling and dropping, the sweep bar coming down; frames the stage; its HUD and FX; its brain sees the gutters, lines up, waits its turn, and rolls its line into the pins', async () => {
  const { Scene } = await import('../client/party-render.mjs');
  const g = await room(4, { seed: 14 });
  const s = g.s, z0 = laneZ(s, 0);
  setPin(g, 0, 4, { st: MC.BW_HIT, by: 0, at: g.v.tick - 10, vx: 3, vz: 1, ux: 0.95, uz: 0.31 });
  setPin(g, 0, 6, { st: MC.BW_DROP, at: g.v.tick - 20 });
  setLane(g, 1, { call: g.v.tick - 100 });
  const out = () => ({ scene: new Scene(24000), solid: [], glow: [], beams: [], decals: [], casters: [], paint: null });
  const o = out();
  const r = g.v.party();
  bowl.draw(g.v, { tick: r.tick, t: r.t * TICK, dt: 0, ptick: r.tick + 6, now: 0, slot: 0, pme: g.v.partier(0) }, o);
  for (let k = 0; k < o.scene.count * 16; k++) assert.ok(Number.isFinite(o.scene.data[k]), 'finite');
  assert.ok(o.scene.count > 200, `the lanes and their pins: ${o.scene.count}`);
  const looks = new Set(); for (let k = 0; k < o.scene.count; k++) looks.add(o.scene.data[k * 16 + 11]);
  for (const lk of [8, 3, 4, 1]) assert.ok(looks.has(lk), `look ${lk}: wood, steel gutters, the hazard bar, plastic pins`);
  const fr = bowl.frame(g.v);
  assert.equal(fr.shape, 'square');
  assert.ok(Math.abs(fr.centre[0] - (s.xa + s.xb) / 2) < 1e-3 && fr.radius >= (s.xb - s.xa) / 2);
  assert.equal(bowl.facing(g.v, 0), 0);
  const lines = [], rects = [];
  bowl.hud(g.v, { put: () => {}, centre: (y, x) => lines.push(x), right: (y, x) => lines.push(x), rect: (...a) => rects.push(a), rows: 44, C: {}, slot: 0, now: 0, t: r.t * TICK });
  assert.ok(lines.includes('PINS 0  STRIKES 0') && lines.includes('LANE 1  8 STANDING'), lines.join(' | '));
  assert.equal(rects.length, 11, 'the ten as they stand, on a backing');
  for (const l2 of [...lines, bowl.hint, bowl.rules, 'DOUBLE PINS', 'STRIKE!', 'LANE 43  SWEEPING']) assert.ok(l2.length <= 70 && /^[ -_]*$/.test(l2), l2);
  const said = [];
  const fctx = { slot: 0, view: g.v, glow: () => {}, banner: (x) => said.push(x), feed: (x) => said.push(x), name: (q) => `P${q + 1}`, dist: 0 };
  bowl.fx({ kind: MC.BW_FX_STRIKE, owner: 0, shot: 0, pos: [s.xh, PLAT_Y, z0], size: 5 }, fctx);
  bowl.fx({ kind: MC.BW_FX_GUTTER, owner: 0, shot: 0, pos: [s.xh, PLAT_Y, z0], size: 0 }, fctx);
  bowl.fx({ kind: MC.BW_FX_LANE, owner: 255, shot: 255 | (MC.BW_WDOUBLE << 8), pos: [s.xh, PLAT_Y, z0], size: 0 }, fctx);
  assert.deepEqual(said, ['STRIKE!', 'P1 STRIKE  5', 'GUTTER', 'DOUBLE PINS']);
  // its sense of the stage: a gutter past the foul line is deadly, the approach's strip and the lane aren't
  assert.equal(bowl.brain.danger(g.v, s.xf + 5, z0 + 4), 1);
  assert.equal(bowl.brain.danger(g.v, s.xf - 2, z0 + 4), 0);
  assert.equal(bowl.brain.danger(g.v, s.xf + 5, z0 + 1), 0);
  // lane 1 (P1, P3) bowled by two AI balls: P1 lines up and rolls its line, P3 waits behind the foul line for the fresh ten
  const h = await room(4, { seed: 15 });
  const S = h.s;
  const bots = [new Partier(0, 7, 0.9), new Partier(2, 8, 0.9)];
  const f0 = h.v.fxCount();
  let waited = true, first = -1, x3 = -1;
  for (let k = 0; k < 1600; k++) {
    h.step([...bots.map((b) => [L.EV_INPUT, b.slot, b.think(h.v, h.v.tick, 0)]), [L.EV_INPUT, 1, STILL], [L.EV_INPUT, 3, STILL]]);
    const ln = lanes(h.v)[0];
    if (first < 0 && ln.first) first = k;
    if (first < 0 && ball(h, 2).x > S.xf) waited = false;
    if (x3 < 0 && ball(h, 2).x > S.xf) x3 = k;
  }
  const kn = fxs(h.v, f0, MC.BW_FX_KNOCK).filter((x) => x.size > 0);
  assert.ok(first > 0 && waited && x3 > first, `P3 kept behind the foul line till P1's pins went (${first}, ${x3})`);
  const p1 = kn.filter((x) => x.owner === 0), p3 = kn.filter((x) => x.owner === 2);
  assert.ok(p1.length >= 6 && p3.length >= 6, `both bowled: ${p1.length}, ${p3.length}`);
  assert.ok([0, 1, 2].includes(p1[0].shot & 15), 'P1 into the pocket');
  assert.ok(p3[0].tick > p1.at(-1).tick && p3.every((x) => x.shot >> 4 === 0), 'P3 on a fresh ten');
  assert.equal(fxs(h.v, f0, MC.BW_FX_GUTTER).length, 0, 'no gutter balls');
  assert.ok(Math.abs(ball(h, 0).u) < MC.BW_LW / 2 && Math.abs(ball(h, 2).u) < HALF, 'on its lane');
  assert.equal(h.v.party().state, L.H_PLAY);
});

// A round of AI balls (client/party-bot.mjs) steered by this minigame's brain on the debug build, stats from it.
async function aiRound(balls, ticks, seed) {
  const stats = { start: -1, over: -1, pins: 0, strikes: 0, gutters: 0, racks: 0, scores: null };
  let seen = 0;
  const r = await playParty({ bytes: partyBytes(true), mg: L.MG_BOWL, bots: balls, ticks, seed, onTick: (t, sim, v) => {
    const g = v.party();
    for (; seen < v.fxCount(); seen++) {
      const x = v.fx(seen);
      if (stats.over >= 0 || stats.start < 0) continue;
      if (x.kind === MC.BW_FX_KNOCK && x.size > 0) stats.pins++;
      if (x.kind === MC.BW_FX_STRIKE) stats.strikes++;
      if (x.kind === MC.BW_FX_GUTTER) stats.gutters++;
      if (x.kind === MC.BW_FX_LANE && x.shot >> 8 === MC.BW_WRACK) stats.racks++;
    }
    if (stats.start < 0 && g.state === L.H_PLAY) stats.start = t;
    if (stats.over < 0 && stats.start >= 0 && g.state === L.H_OVER) {
      stats.over = t;
      stats.scores = [...Array(balls).keys()].map((p) => v.partier(p).score);
      stats.places = [...Array(balls).keys()].map((p) => v.partier(p).place);
    }
  } });
  return { ...r, stats };
}

for (const [balls, ticks, seed] of [[8, 12100, 5], [64, 12100, 4]]) {
  test(`a round of ${balls} AI balls on the debug build: no trap, pins down on every lane, strikes, the scores spread and placed; equal on 1 and 4 threads`, async () => {
    const { log, sim, stats, games } = await aiRound(balls, ticks, seed);
    assert.equal(sim.error().code, 0);
    assert.ok(games.every((x) => x === L.MG_BOWL));
    assert.ok(stats.over > 0, 'the round ended');
    assert.equal((stats.over - stats.start), MC.BW_LEN, 'at the clock');
    const nl = Math.max(MC.BW_NLMIN, Math.ceil(balls / MC.BW_PER));
    assert.ok(stats.racks >= 8 * nl && stats.pins >= 8 * stats.racks, `${stats.pins} pins in ${stats.racks} racks`);
    assert.ok(stats.strikes >= 2 * nl && stats.strikes < stats.racks, `${stats.strikes} strikes`);
    const sc = stats.scores;
    assert.ok(sc.filter((x) => x > 0).length >= balls * 0.9 && Math.max(...sc) - Math.min(...sc) >= 15, `scores ${sc}`);
    sc.forEach((x, p) => assert.equal(stats.places[p], 1 + sc.filter((y) => y > x).length));
    const parsed = parseLog(log);
    const n = stats.over + 50;
    const a = await replay({ bytes: partyBytes(), log: parsed, ticks: n, threads: 1, tag: 't1' });
    const b = await replay({ bytes: partyBytes(), log: parsed, ticks: n, threads: 4, tag: 't4', startWorkers });
    const d = await replay({ bytes: partyBytes(true), log: parsed, ticks: n, threads: 1, tag: 'd1' });
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(b.trace).tickHashes]);
    assert.deepEqual([...decodeTrace(a.trace).tickHashes], [...decodeTrace(d.trace).tickHashes], 'the debug build steps the same bits');
  });
}

test('a tick of 256 balls, AI balls bowling on 43 lanes, on the release build', async (t) => {
  const g = await room(256, { debug: false, seed: 5 });
  const bots = Array.from({ length: 256 }, (_, p) => new Partier(p, 5, 0.3 + 0.6 * ((p * 5) % 256) / 256));
  let ms = 0, n = 0;
  const f0 = g.v.fxCount();
  for (let k = 0; k < 3000 && g.v.hole().state === L.H_PLAY; k++) {
    g.sim.feedPlayers(bots.map((b) => [L.EV_INPUT, b.slot, b.think(g.v, g.v.tick, 0)]));
    const a = performance.now();
    g.sim.x.step();
    if (k >= 500) { ms += performance.now() - a; n++; }
  }
  const racks = lanes(g.v).reduce((x, ln) => x + ln.racks, 0);
  t.diagnostic(`${(ms / n).toFixed(3)} ms a tick over ${n} ticks, 256 balls (${racks - 43} racks swept)`);
  assert.ok(n >= 2000 && racks - 43 >= 43, `${n} ticks timed, ${racks - 43} racks`);
  assert.ok(ms / n < 2, `${(ms / n).toFixed(3)} ms`);
  assert.ok(fxs(g.v, f0, MC.BW_FX_KNOCK).length > 0);
});
