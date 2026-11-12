// The arena's third-person camera (client/chase.mjs): where it sits behind
// the fighter, what pulls it in, and the reticle's point against the sim's
// own shots. Its worlds are a few boxes over a made-up ground, then Box
// Canyon as the arena's sim lays it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newArena } from './helpers.mjs';
import { View, arenaWord, boxClear } from '../src/arena-view.mjs';
import { chase, aimPoint, steepAim, boxHit, groundHit, bodyHit, zoomStep, startView, mapView, viewOf, viewText,
  CHASE_MIN, CHASE_MAX, CHASE_START, CHASE_NEAR } from '../client/chase.mjs';
import { project, lens } from '../client/arena-render.mjs';
import * as L from '../src/layout.mjs';

const W = 960, H = 600;
// a map of boxes in one group, over ground at a height everywhere (or a function of x, z)
const world = (boxes = [], ground = 0, tick = 0) => ({
  map: { groups: [{ box: [-1e4, -1e4, -1e4, 1e4, 1e4, 1e4], first: 0, count: boxes.length }], boxes: boxes.map((box) => ({ box })) },
  height: typeof ground === 'function' ? ground : () => ground, tick,
});
const EYE = [100, 1.6, 100];
const near = (a, b, eps, what) => assert.ok(Math.abs(a - b) <= eps, `${what ?? ''} ${a} is not within ${eps} of ${b}`);
const dirOf = (yaw, pitch) => [Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw)];

test('zoom 0 is the eye, whatever is round it', () => {
  for (const w of [world(), world([[98, 0, 98, 99, 5, 102]]), world([], 50)]) {
    for (const [yaw, pitch] of [[0, 0], [2, -0.6], [4, 0.5]]) {
      const c = chase({ eye: EYE, yaw, pitch, dist: 0 }, w);
      assert.deepEqual(c.cam, EYE);
      assert.equal(c.dist, 0);
    }
  }
});

test('in the open it is behind the aim, to its right and over it, as far back as asked; the figure holds its place on the screen', () => {
  const w = world();
  const { focal } = lens({ zoom: 1, pitch: 0 }, W, H);
  let at = null;
  for (const dist of [CHASE_MIN, 5, CHASE_MAX]) {
    for (const yaw of [0, 1, 2.5, 4]) {
      for (const pitch of [0, -0.3, -0.8, 0.2]) {
        const eye = [100, 30, 100]; // high over the ground, so nothing is in the boom's way
        const c = chase({ eye, yaw, pitch, dist }, w);
        assert.equal(c.dist, dist);
        const r = c.cam.map((v, k) => v - eye[k]);
        const aim = dirOf(yaw, pitch);
        near((r[0] * aim[0] + r[1] * aim[1] + r[2] * aim[2]) / -dist, 1, 0.1, 'behind, a metre a metre');
        assert.ok(-r[0] * Math.sin(yaw) + r[2] * Math.cos(yaw) > 0, 'to the right');
        assert.ok(r[1] > -dist * Math.sin(pitch), 'over the aim');
        assert.deepEqual(c.cam, eye.map((v, k) => v + c.back[k] * dist), 'the boom is back, a metre of dist');
        // the eye's place on the screen, through the renderer's lens: the same at every distance, yaw and pitch
        const [x, y, depth] = project({ cam: c.cam, yaw, pitch, zoom: 1 }, W, H, eye);
        assert.ok(depth > 0.3);
        at ??= [x, y];
        near(x, at[0], 1e-6, 'x'); near(y, at[1], 1e-6, 'y');
      }
    }
  }
  // left of the centre and under it: a quarter and an eighth of the focal length
  near(at[0], W / 2 - 0.25 * focal, 1e-6); near(at[1], H / 2 + 0.12 * focal, 1e-6);
});

test('a wall behind pulls it in short of the wall; under a metre of room it is the eye', () => {
  // facing +x, a wall 3 m behind the eye
  const wall = [90, 0, 90, 97, 20, 110];
  const c = chase({ eye: EYE, yaw: 0, pitch: 0, dist: 8 }, world([wall]));
  assert.ok(c.dist > CHASE_NEAR && c.dist < 3, `pulled in to ${c.dist}`);
  assert.ok(c.cam[0] > 97.2 && c.cam[0] < EYE[0], `in front of the wall: ${c.cam[0]}`);
  assert.equal(boxHit(world([wall]).map, EYE, c.cam.map((v, k) => v - EYE[k]), 1), 1, 'nothing between the eye and the camera');
  // the same wall out of reach changes nothing
  assert.equal(chase({ eye: EYE, yaw: 0, pitch: 0, dist: 2 }, world([wall])).dist, 2);
  // 1 m behind: no room for a camera
  const tight = chase({ eye: EYE, yaw: 0, pitch: 0, dist: 8 }, world([[90, 0, 90, 99, 20, 110]]));
  assert.deepEqual([tight.dist, tight.cam], [0, EYE]);
  // a roof low overhead stops the boom's rise as a wall does its run
  const roof = chase({ eye: EYE, yaw: 0, pitch: -0.7, dist: 10 }, world([[80, 4, 80, 120, 5, 120]]));
  assert.ok(roof.dist > 0 && roof.cam[1] < 3.9, `under the roof: ${roof.cam[1]}`);
});

test('the ground pulls it in: never under a slope behind, nor within 0.4 m of it', () => {
  // a hill rising behind the eye (toward -x), level ahead
  const hill = (x) => Math.max(0, (98 - x) * 0.8);
  const w = world([], hill);
  const c = chase({ eye: EYE, yaw: 0, pitch: 0, dist: 12 }, w);
  assert.ok(c.dist > CHASE_NEAR && c.dist < 6, `pulled in to ${c.dist}`);
  assert.ok(c.cam[1] >= hill(c.cam[0]) + 0.4 - 1e-9, 'clear of the slope');
  // aiming up over level ground the boom runs down into it
  const up = chase({ eye: EYE, yaw: 0, pitch: 0.5, dist: 12 }, world());
  assert.ok(up.dist < 4 && up.cam[1] >= 0.4 - 1e-9, `over the ground: ${up.cam[1]} at ${up.dist}`);
  // and every sample of the way from the eye is clear too
  for (let k = 0; k <= 20; k++) {
    const p = EYE.map((v, i) => v + (c.cam[i] - v) * k / 20);
    assert.ok(p[1] >= hill(p[0]) + 0.4 - 1e-9, `sample ${k}`);
  }
});

test('a box that moves is in the way where it is on the tick drawn, not where it was built', () => {
  // a lift built 4 m behind the eye that rises 10 m in 100 ticks and comes back
  const w = (tick) => ({
    map: { groups: [{ box: [94, 0, 98, 96, 13, 102], first: 0, count: 1, move: { by: [0, 10, 0], travel: 100, wait: 0, phase: 0, ease: false } }], boxes: [{ box: [94, 0, 98, 96, 3, 102] }] },
    height: () => 0, tick,
  });
  const down = chase({ eye: EYE, yaw: 0, pitch: 0, dist: 8 }, w(0));
  assert.ok(down.dist < 4 && down.cam[0] > 96, `stopped by the lift: ${down.dist}`);
  assert.equal(chase({ eye: EYE, yaw: 0, pitch: 0, dist: 8 }, w(100)).dist, 8, 'the lift is up out of the way');
  assert.ok(chase({ eye: EYE, yaw: 0, pitch: 0, dist: 8 }, w(200)).dist < 4, 'and back');
  // the reticle's ray meets it the same way
  near(aimPoint({ eye: EYE, yaw: Math.PI, pitch: 0, range: 50 }, w(0)).t, 4, 1e-9);
  assert.equal(aimPoint({ eye: EYE, yaw: Math.PI, pitch: 0, range: 50 }, w(100)).hit, false);
});

test('an aim too steep is seen through the eye, with slack before the camera goes out again', () => {
  assert.equal(steepAim(0), false);
  assert.equal(steepAim(-0.8), false);
  assert.equal(steepAim(-0.9), true);
  assert.equal(steepAim(0.75), true);
  assert.equal(steepAim(-0.8, true), true, 'still, coming back up');
  assert.equal(steepAim(-0.7, true), false);
  assert.equal(steepAim(0.65, true), true);
  assert.equal(steepAim(0.55, true), false);
  // inside a figure the renderer draws none: a boom that leaves the camera there (0.7 m off across the ground,
  // level with its chest) is the eye; over its head it is not
  assert.equal(chase({ eye: [100, 30, 100], yaw: 0, pitch: 1, dist: 1.2 }, world()).dist, 0);
  assert.equal(chase({ eye: [100, 30, 100], yaw: 0, pitch: -1.3, dist: 1.2 }, world()).dist, 1.2);
});

test('the wheel, the view a browser keeps, ?view= and a map of its own', () => {
  // out from first person to the nearest, by notches to the farthest; in again the same way
  let d = 0;
  const out = [];
  for (let k = 0; k < 12; k++) out.push(d = zoomStep(d, 1));
  assert.equal(out[0], CHASE_MIN);
  assert.equal(out.at(-1), CHASE_MAX);
  assert.ok(out.every((v, k) => k === 0 || v >= out[k - 1]));
  for (let k = 0; k < 12; k++) d = zoomStep(d, -1);
  assert.equal(d, 0);
  assert.equal(zoomStep(CHASE_MIN, -1), 0);
  assert.equal(zoomStep(0, -1), 0);
  // kept as text and read back; nonsense is nothing kept
  assert.deepEqual(viewOf(viewText({ dist: 0, last: 6.25 })), { dist: 0, last: 6.25 });
  assert.deepEqual(viewOf(viewText({ dist: 3.5, last: 3.5 })), { dist: 3.5, last: 3.5 });
  for (const bad of [null, '', 'x', '1,5', '5', '5,50', '-3,5']) assert.equal(viewOf(bad), null, String(bad));
  // nothing kept: first person, unless the map walks as a Humanoid does
  const fresh = startView(null, null);
  assert.deepEqual([fresh.dist, fresh.last, fresh.chosen], [0, CHASE_START, false]);
  assert.equal(mapView(fresh, { movement: { walk: 4.48 } }).dist, CHASE_START);
  assert.equal(mapView(mapView(fresh, { movement: { walk: 4.48 } }), { movement: null }).dist, 0, 'and back on a map without one');
  // a choice kept wins over the map; ?view= over both, and is not kept
  const kept = startView(null, { dist: 0, last: 7 });
  assert.equal(mapView(kept, { movement: { walk: 4.48 } }).dist, 0);
  assert.deepEqual([startView('3', { dist: 0, last: 7 }).dist, startView('3', null).dist, startView('3', null, 2.5).dist, startView('3', null, 99).dist], [7, CHASE_START, 2.5, CHASE_MAX]);
  assert.deepEqual([startView('1', { dist: 7, last: 7 }).dist, startView('1', null).forced, startView('3', null).forced, kept.forced], [0, true, true, false]);
  assert.equal(mapView(startView('1', null), { movement: { walk: 4.48 } }).dist, 0);
});

test('the reticle\'s point: a wall, the ground, a body and a head, the ray\'s end; first person puts it on the centre', () => {
  // a wall 20 m ahead
  const wall = [120, 0, 80, 121, 30, 120];
  const a = aimPoint({ eye: EYE, yaw: 0, pitch: 0, range: 90 }, world([wall]));
  near(a.t, 20, 1e-9); assert.equal(a.hit, true); near(a.pos[0], 120, 1e-9);
  // the ground, 45 degrees down from 1.6 m up
  const g = aimPoint({ eye: EYE, yaw: 1, pitch: -Math.PI / 4, range: 90 }, world());
  near(g.t, 1.6 * Math.SQRT2, 0.01); near(g.pos[1], 0, 0.01);
  // nothing in reach: the ray's end
  const far = aimPoint({ eye: EYE, yaw: 0, pitch: 0.2, range: 90 }, world());
  assert.equal(far.hit, false); near(far.t, 90, 1e-9);
  // a fighter 10 m ahead: its body's near side (0.45 m in radius), before the wall behind it; over its shoulders, the head (0.22 m at 1.62 m)
  const feet = [110, 0, 100];
  near(aimPoint({ eye: [100, 1, 100], yaw: 0, pitch: 0, range: 90 }, world([wall]), [feet]).t, 9.55, 1e-6);
  near(aimPoint({ eye: [100, 1.62, 100], yaw: 0, pitch: 0, range: 90 }, world([wall]), [feet]).t, 9.78, 1e-6);
  near(aimPoint({ eye: [100, 1.9, 100], yaw: 0, pitch: 0, range: 90 }, world([wall]), [feet]).t, 20, 1e-9, 'over its head');
  assert.equal(bodyHit(feet, [100, 1, 100], dirOf(Math.PI, 0), 90), 90, 'not behind the aim');
  assert.equal(groundHit(() => 0, EYE, dirOf(0, 0.1), 50), 50);
  // seen from the eye (zoom 0) the point is the screen's centre; from the camera behind, off it by the camera's
  // lean over the depth: left and down for a wall near, almost none for one far
  for (const [yaw, pitch] of [[0, 0], [0, -0.4], [0, 0.3]]) {
    const p = aimPoint({ eye: EYE, yaw, pitch, range: 90 }, world([wall]));
    const [x, y] = project({ cam: EYE, yaw, pitch, zoom: 1 }, W, H, p.pos);
    near(x, W / 2, 1e-6); near(y, H / 2, 1e-6);
  }
  const { focal } = lens({ zoom: 1, pitch: 0 }, W, H);
  const eye = [100, 10, 100];
  const c = chase({ eye, yaw: 0, pitch: 0, dist: 5 }, world([wall]));
  const nearWall = project({ cam: c.cam, yaw: 0, pitch: 0, zoom: 1 }, W, H, aimPoint({ eye, yaw: 0, pitch: 0, range: 90 }, world([wall])).pos);
  near(nearWall[0], W / 2 - focal * 1.25 / 25, 1e-6); near(nearWall[1], H / 2 + focal * 0.6 / 25, 1e-6);
  const farWall = project({ cam: c.cam, yaw: 0, pitch: 0, zoom: 1 }, W, H, aimPoint({ eye, yaw: 0, pitch: 0, range: 420 }, world([[500, 0, 0, 501, 99, 200]])).pos);
  assert.ok(Math.hypot(farWall[0] - W / 2, farWall[1] - H / 2) < 2.5, `${farWall}`);
});

// ---- on Box Canyon, as the sim lays it
async function canyon(n = 2) {
  const sim = await newArena();
  sim.init(7);
  const v = new View(sim.memory.buffer);
  const dv = new DataView(sim.memory.buffer);
  const step = (recs = []) => { sim.feedPlayers(recs); sim.x.step(); };
  step(Array.from({ length: n }, (_, p) => [L.EV_JOIN, p]));
  while (v.hole().state !== L.H_PLAY) step();
  return { sim, v, dv, step };
}
function put(g, p, x, y, z) {
  const b = L.PLAYERS + p * L.PSIZE;
  [x, y, z].forEach((q, k) => g.dv.setFloat32(b + L.P_PX + 4 * k, q, true));
  for (const o of [L.P_VX, L.P_VY, L.P_VZ]) g.dv.setFloat32(b + o, 0, true);
}

test('Box Canyon: from every spawn, all round and at every zoom, the camera is outside every box, over the ground, and sees its fighter', async () => {
  const g = await canyon(2);
  const map = g.v.map();
  const w = { map, height: (x, z) => g.v.height(x, z), tick: 0 };
  let pulled = 0, n = 0;
  for (const s of map.spawns) {
    const feet = [s[0], g.v.stand(s[0], s[2], s[1]), s[2]];
    const eye = [feet[0], feet[1] + 1.6, feet[2]];
    for (let a = 0; a < 16; a++) {
      for (const pitch of [-0.8, -0.3, 0, 0.3, 0.6]) {
        for (const dist of [CHASE_MIN, 5, CHASE_MAX]) {
          const c = chase({ eye, yaw: a / 16 * 2 * Math.PI, pitch, dist }, w);
          n++;
          if (c.dist < dist) pulled++;
          if (!c.dist) { assert.deepEqual(c.cam, eye); continue; }
          assert.ok(c.dist >= CHASE_NEAR && c.dist <= dist + 1e-9);
          const where = `spawn ${s.map((q) => q.toFixed(1))} yaw ${a}/16 pitch ${pitch} dist ${dist}: ${c.cam.map((q) => q.toFixed(2))}`;
          assert.ok(!map.boxes.some(({ box: b }) => [0, 1, 2].every((k) => c.cam[k] > b[k] && c.cam[k] < b[k + 3])), `in a box: ${where}`);
          assert.ok(c.cam[1] >= g.v.height(c.cam[0], c.cam[2]) + 0.39, `in the ground: ${where}`);
          assert.ok(boxClear(map, eye, c.cam), `a box between it and the eye: ${where}`);
        }
      }
    }
  }
  assert.ok(pulled > n / 20 && pulled < n, `${pulled} of ${n} pulled in: the bases' rooms and the cave do, the field doesn't`);
});

test('the reticle\'s point is where the sim\'s shot lands: a sniper\'s tracers end on it, on the ground, on walls and on a fighter', async () => {
  const g = await canyon(2);
  const b = L.PLAYERS;
  const arm = () => {
    g.dv.setUint8(b + L.A_GUN, L.W_SNIPER); g.dv.setUint8(b + L.A_GUN + 1, L.W_SNIPER);
    g.dv.setUint8(b + L.A_MAG, 4); g.dv.setUint8(b + L.A_MAG + 1, 4);
  };
  const w = { map: g.v.map(), height: (x, z) => g.v.height(x, z), tick: 0 };
  const fxs = () => { const out = []; for (let k = 0; k < g.v.fxCount(); k++) { const f = g.v.fx(k); if (f.kind === L.FX_TRACER && f.owner === 0) out.push(f); } return out; };
  // mid-field: at the ground, at each base's wall, along the field; then from inside the red base at its own walls
  const shots = [[512, 512, 0, 300], [512, 512, 0, 480], [512, 512, 8192, 500], [512, 512, 4096, 440], [512, 512, 12000, 505], [512, 512, 2000, 520],
    [414, 506, 0, 512], [414, 506, 8192, 512], [414, 506, 4096, 560], [414, 506, 12288, 400]];
  let shot = 0, landed = 0;
  for (const [x, z, yaw, pitch] of shots) {
    put(g, 0, x, g.v.stand(x, z), z);
    put(g, 1, 300, g.v.stand(300, 300), 300); // out of the way
    arm();
    const before = fxs().length;
    shot = (shot + 1) & 3;
    const word = arenaWord({ yaw, pitch, shot });
    // (the gun's refire is 75 ticks: hold the word until it fires)
    for (let k = 0; k < 90 && fxs().length === before; k++) { put(g, 0, x, g.v.stand(x, z), z); g.step([[L.EV_INPUT, 0, word]]); }
    const end = fxs().at(-1);
    assert.equal(fxs().length, before + 1, `a shot from ${x}, ${z}`);
    const f = g.v.fighter(0);
    const p = aimPoint({ eye: [f.pos[0], f.pos[1] + 1.6, f.pos[2]], yaw: f.yaw, pitch: f.pitch, range: L.ARMS[L.W_SNIPER].range }, { ...w, tick: g.v.tick }, []);
    const off = Math.hypot(...p.pos.map((q, k) => q - end.pos[k]));
    assert.ok(off < 0.12, `yaw ${yaw} pitch ${pitch} from ${x}, ${z}: the sim's ${end.pos.map((q) => q.toFixed(2))}, the reticle's ${p.pos.map((q) => q.toFixed(2))}`);
    if (p.hit) landed++;
  }
  assert.ok(landed >= 8, `${landed} of ${shots.length} landed on something`);
  // a fighter 30 m down the field: the tracer ends on its body, and so does the reticle's point with it among the bodies
  put(g, 0, 500, g.v.stand(500, 512), 512);
  put(g, 1, 530, g.v.stand(530, 512), 512);
  arm();
  const before = fxs().length;
  const me = g.v.fighter(0), it = g.v.fighter(1);
  const dy = it.pos[1] + 1 - (me.pos[1] + 1.6);
  const word = arenaWord({ yaw: 0, pitch: 512 + Math.round(Math.atan2(dy, 30) / Math.PI * 1024), shot: (shot + 1) & 3 });
  for (let k = 0; k < 90 && fxs().length === before; k++) { put(g, 0, 500, me.pos[1], 512); put(g, 1, 530, it.pos[1], 512); g.step([[L.EV_INPUT, 0, word]]); }
  const end = fxs().at(-1);
  const f = g.v.fighter(0);
  const aim = { eye: [f.pos[0], f.pos[1] + 1.6, f.pos[2]], yaw: f.yaw, pitch: f.pitch, range: 420 };
  const on = aimPoint(aim, w, [g.v.fighter(1).pos]);
  near(on.t, 29.55, 0.05, 'the body\'s near side');
  assert.ok(Math.hypot(...on.pos.map((q, k) => q - end.pos[k])) < 0.12, `the sim's ${end.pos}, the reticle's ${on.pos}`);
  assert.ok(aimPoint(aim, w, []).t > 35, 'and past it without');
});

test('the renderer draws my own figure only when it is given my record, and the reticle off the centre by aim; first person gives neither', () => {
  const r = readFileSync(new URL('../client/arena-render.mjs', import.meta.url), 'utf8');
  assert.match(r, /\(i == u32\(u\.misc\.x\) && u\.aim\.z < 0\.5\)\) \{ return o; \}/, 'my figure is skipped unless aim.z');
  assert.match(r, /let dh = \(d - u\.aim\.xy\) \/ hs;/, 'the reticle and the hit marker follow aim');
  assert.match(r, /uf\.set\(\[s\.aim\?\.\[0\] \?\? 0, s\.aim\?\.\[1\] \?\? 0, s\.own \? 1 : 0, 0\], 48\);/);
  assert.match(r, /if \(s\.own\) device\.queue\.writeBuffer\(playerBuf, s\.slot \* L\.PSIZE, s\.own\);/);
  const g = readFileSync(new URL('../client/arena-game.mjs', import.meta.url), 'utf8');
  assert.match(g, /own: chasing \? ownRec : null, aim: aimAt,/);
  assert.match(g, /if \(!WATCH && !f\.dead && !f\.down && !chasing\) \{\n\s+inHand =/, 'no gun in the hands from behind');
  assert.match(g, /const mine = !WATCH && !FIXED && !\(spect && tgt\)/, 'never a spectator\'s, a held camera\'s or a watched fighter\'s');
});
