// A pilot's brain for flight (src/flight.wat): reads the world it has (a
// View of its own copy, a round trip old like anyone's) and answers with one
// input word a tick. It picks the nearest enemy, flies at it and puts its
// nose on it with an aim that settles as a human's does, fires lasers while
// the nose is on, now and then holds a charge shot and lets it go with the
// target ahead, drops a bomb into a crowd close ahead, boosts to close a long
// gap and brakes rather than overshoot, swerves from a ship about to meet
// it, and rolls when it's hit. Under it
// all it keeps off the ground (looking ahead along where it's going), under
// the ceiling and inside the map, which wins over any target. With nobody
// to chase it flies to waypoints. Under a mode with sides it leaves its own
// alone. In Ring Race it flies at its next gate, boosting on the long legs,
// and fires only at what is already on its nose. Deterministic from its seed and what it sees, so a match of pilots
// is an ordinary event log.
import * as L from '../src/layout.mjs';
import * as F from '../src/flight.mjs';
import { flightWord, arenaFrame, frameDue } from '../src/flight-view.mjs';
import { boxRay } from '../src/arena-view.mjs';

const TAU = 2 * Math.PI;
const CLEAR = 9; // m it keeps over the ground ahead
const LOOK = [12, 25, 40, 60, 85]; // m ahead it looks for ground
const EDGE = 45; // m from the map's edge it starts turning back in
const MAX_PITCH = F.PITCH_MAX / 16384 * TAU;

const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

export class Pilot {
  // skill 0..1: how fast it settles its aim and how steady it holds it
  constructor(slot, seed = 1, skill = 0.6) {
    this.slot = slot;
    this.rng = (seed * 2654435761 + slot * 40503) >>> 0 || 1;
    this.skill = skill;
    this.shot = 0; this.roll = 0; this.bomb = 0;
    this.frame = 0;
    this.sent = {}; // the last frame's lag and tick
    this.target = -1; this.err = [0, 0];
    this.wp = null; this.wpUntil = 0;
    this.charging = 0; this.nextCharge = 0;
    this.health = 200;
    this.match = -1;
  }

  rand() { let x = this.rng; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.rng = x >>> 0; return this.rng / 4294967296; }

  // The word for sim tick t. lag: how many ticks old the bot's view is.
  think(view, t, lag = 0) {
    if ((t & 7) === 0) this.frame = frameDue(this.sent, t, lag, false) ? arenaFrame({ lag }) : 0;
    const serial = (this.frame >> (t & 7)) & 1;
    const h = view.hole();
    if (h.hole !== this.match) { this.match = h.hole; this.target = -1; this.wp = null; }
    const me = view.ship(this.slot);
    if (!me.live || me.dead || h.state === L.H_OVER) { this.charging = 0; return this.word({ yaw: 0, pitch: 512, serial }); }
    const map = view.map();
    const [x0, x1, z0, z1] = map.bounds;
    const ceil = view.dv.getFloat32(L.MAP_CEILING, true) || me.pos[1] + 60;
    const pos = (q) => { const b = L.PLAYERS + q * L.PSIZE; return [view.dv.getFloat32(b + L.P_PX, true), view.dv.getFloat32(b + L.P_PY, true), view.dv.getFloat32(b + L.P_PZ, true)]; };
    const alive = (q) => q >= 0 && q !== this.slot && (view.u8[L.PLAYERS + q * L.PSIZE + L.P_FL] & (L.PF_LIVE | L.PF_DEAD)) === L.PF_LIVE && !view.ally(this.slot, q);

    // the nearest enemy, looked for every 16 ticks (each pilot on its own
    // tick of the 16); the one chosen kept between looks while it lives
    if (((t + this.slot) & 15) === 0 || !alive(this.target)) {
      let best = -1, bd = Infinity;
      for (let q = 0; q < L.NPLAYER; q++) {
        if (!alive(q)) continue;
        const p = pos(q);
        const d = Math.hypot(p[0] - me.pos[0], p[1] - me.pos[1], p[2] - me.pos[2]) - (q === this.target ? 40 : 0);
        if (d < bd) { bd = d; best = q; }
      }
      if (best !== this.target) {
        this.target = best;
        // a new target: the aim starts off and settles
        const off = 1 - this.skill;
        this.err = [(this.rand() - 0.5) * 0.5 * off, (this.rand() - 0.5) * 0.25 * off];
      }
    }
    const k = 0.9 + 0.08 * this.skill;
    this.err = [this.err[0] * k, this.err[1] * k];
    const wobble = (1 - this.skill) * 0.04;

    let want, dist = Infinity, to = null, gate = null;
    const racing = view.dv.getUint32(L.AH_MODE, true) === F.M_RACE && h.state === L.H_PLAY;
    if (racing) {
      const gates = view.race();
      if (gates.length) gate = gates[view.racer(this.slot, gates.length).next];
    }
    if (this.target >= 0) to = pos(this.target), dist = Math.hypot(to[0] - me.pos[0], to[1] - me.pos[1], to[2] - me.pos[2]);
    if (gate) {
      want = norm([gate.pos[0] - me.pos[0], gate.pos[1] - me.pos[1], gate.pos[2] - me.pos[2]]);
    } else if (this.target >= 0) {
      to = pos(this.target);
      const d = [to[0] - me.pos[0], to[1] - me.pos[1], to[2] - me.pos[2]];
      dist = Math.hypot(...d);
      want = norm(d);
    } else {
      if (!this.wp || t > this.wpUntil || Math.hypot(this.wp[0] - me.pos[0], this.wp[2] - me.pos[2]) < 30) {
        const wx = x0 + EDGE + this.rand() * (x1 - x0 - 2 * EDGE), wz = z0 + EDGE + this.rand() * (z1 - z0 - 2 * EDGE);
        this.wp = [wx, Math.min(ceil - 15, view.height(wx, wz) + 20 + this.rand() * 25), wz];
        this.wpUntil = t + 1000;
      }
      want = norm([this.wp[0] - me.pos[0], this.wp[1] - me.pos[1], this.wp[2] - me.pos[2]]);
    }
    let yaw = Math.atan2(want[2], want[0]) + this.err[0] + wobble * Math.sin(t * 0.05 + this.slot);
    let pitch = Math.asin(Math.max(-1, Math.min(1, want[1]))) + this.err[1] + wobble * Math.sin(t * 0.07 + 2 * this.slot);

    // a ship about to meet it (closest within 6 m in the next 0.8 s): swerve
    // to the side away from it and up, ships meeting hurt both (src/flight.wat $f_collide)
    for (let q = 0; q < L.NPLAYER; q++) {
      if (q === this.slot || (view.u8[L.PLAYERS + q * L.PSIZE + L.P_FL] & (L.PF_LIVE | L.PF_DEAD)) !== L.PF_LIVE) continue;
      const p = pos(q);
      const d = [p[0] - me.pos[0], p[1] - me.pos[1], p[2] - me.pos[2]];
      if (Math.abs(d[0]) > 60 || Math.abs(d[2]) > 60) continue;
      const b = L.PLAYERS + q * L.PSIZE;
      const rv = [L.P_VX, L.P_VY, L.P_VZ].map((o, k) => view.dv.getFloat32(b + o, true) - me.vel[k]);
      const rv2 = rv[0] ** 2 + rv[1] ** 2 + rv[2] ** 2;
      if (rv2 < 1) continue;
      const tc = -(d[0] * rv[0] + d[1] * rv[1] + d[2] * rv[2]) / rv2;
      if (tc < 0 || tc > 0.8) continue;
      const miss = Math.hypot(d[0] + rv[0] * tc, d[1] + rv[1] * tc, d[2] + rv[2] * tc);
      if (miss > 6) continue;
      const side = d[0] * Math.sin(yaw) - d[2] * Math.cos(yaw) > 0 ? 1 : -1; // it's to the left: go right
      yaw += side * 0.7;
      pitch += 0.35;
      break;
    }

    // the map's edge: heading out near it, turn for the middle
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    const out = me.pos[0] < x0 + EDGE && Math.cos(yaw) < 0 || me.pos[0] > x1 - EDGE && Math.cos(yaw) > 0
      || me.pos[2] < z0 + EDGE && Math.sin(yaw) < 0 || me.pos[2] > z1 - EDGE && Math.sin(yaw) > 0;
    if (out) yaw = Math.atan2(mz - me.pos[2], mx - me.pos[0]);
    // the ground (and anything built) ahead along where it means to go: climb to clear it
    pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch));
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    for (const d of LOOK) {
      const x = me.pos[0] + cy * d, z = me.pos[2] + sy * d;
      const need = Math.atan2(view.height(x, z) + CLEAR - me.pos[1], d);
      if (need > pitch) pitch = need;
    }
    const ahead = [cy * Math.cos(pitch), Math.sin(pitch), sy * Math.cos(pitch)];
    // (anything built nearer than the gate it's flying through)
    const reach = gate ? Math.min(50, Math.hypot(gate.pos[0] - me.pos[0], gate.pos[1] - me.pos[1], gate.pos[2] - me.pos[2]) - gate.r) : 50;
    if (reach > 0 && boxRay(map, me.pos, ahead, reach) < reach) pitch = Math.max(pitch, 0.6);
    if (me.pos[1] - view.height(me.pos[0], me.pos[2]) < CLEAR) pitch = Math.max(pitch, 0.45);
    if (me.pos[1] > ceil - 10) pitch = Math.min(pitch, -0.1);
    pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch));

    // the nose on the target and in range: lasers, every tick it can
    let fire = false;
    if (to) {
      const d = norm([to[0] - me.pos[0], to[1] - me.pos[1], to[2] - me.pos[2]]);
      const on = d[0] * me.nose[0] + d[1] * me.nose[1] + d[2] * me.nose[2];
      fire = on > 0.985 && dist < F.LASER_RANGE - 20;
      // the charge: held a while with the target ahead, let go once full
      if (!this.charging && t > this.nextCharge && on > 0.8 && dist < 220 && this.rand() < 0.02) this.charging = F.CHARGE_TICKS + 8;
      // a bomb into a crowd ahead: three enemies within its reach of a point 40 m out
      if (me.bombs && on > 0.9 && dist < 70 && ((t + this.slot) & 31) === 0) {
        const c = [me.pos[0] + me.nose[0] * 40, me.pos[1] + me.nose[1] * 40, me.pos[2] + me.nose[2] * 40];
        let n = 0;
        for (let q = 0; q < L.NPLAYER; q++) if (alive(q)) { const p = pos(q); if (Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) < Number(F.FL_BOMB_RAD)) n++; }
        if (n >= 2 || (n >= 1 && this.rand() < 0.15)) this.bomb ^= 1;
      }
    }
    if (fire && !this.charging) this.shot = (this.shot + 1) & 3;
    let charge = 0;
    if (this.charging) {
      this.charging--;
      charge = this.charging > 0 ? 1 : 0;
      if (!this.charging) this.nextCharge = t + 400 + Math.floor(this.rand() * 600);
    }
    // hit: now and then a roll
    const health = me.sh + me.hp;
    if (health < this.health && !me.roll && this.rand() < 0.3) this.roll ^= 1;
    this.health = health;
    // a long way to go: boost; about to overshoot: brake
    const gd = gate ? Math.hypot(gate.pos[0] - me.pos[0], gate.pos[2] - me.pos[2]) : 0;
    const boost = gate ? gd > 120 && me.boost > 60 && !me.spent : to && dist > 140 && me.boost > 60 && !me.spent;
    const brake = !gate && to && dist < 30 && me.boost > 30 && !me.spent;
    return this.word({
      yaw: Math.round(yaw / TAU * 16384) & 16383, pitch: Math.max(0, Math.min(1023, Math.round(512 + pitch / Math.PI * 1024))),
      boost, brake, left: (t >> 9) & 1, charge, serial,
    });
  }

  // left (held or not) is the way a roll goes
  word({ yaw, pitch, boost = false, brake = false, left = 0, charge = 0, serial = 0 }) {
    return flightWord({ yaw, pitch, boost, brake, left, charge, shot: this.shot, roll: this.roll, bomb: this.bomb, serial });
  }
}
