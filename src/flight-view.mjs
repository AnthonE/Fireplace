// Flight's readers, on top of src/arena-view.mjs: a pilot's input word and a
// player record read as a ship.
import * as L from './layout.mjs';
import * as F from './flight.mjs';
import { View, arenaWord } from './arena-view.mjs';

export { View };
export { arenaFrame, frameDue, forcedSeed } from './arena-view.mjs';

// What flight calls the arena's modes it flies (layout.mjs FLIGHT_MODES).
export const MODE_NAMES = {
  [L.M_FIESTA]: { name: 'DOGFIGHT', rules: 'EVERY SHIP FOR ITSELF  MOST KILLS IN 10 MIN' },
  [L.M_SLAYER]: { name: 'TEAM DOGFIGHT', rules: 'RED V BLUE  EVERY KILL SCORES FOR YOUR SIDE' },
  [L.M_JUGGERNAUT]: { name: 'JUGGERNAUT', rules: 'SHOOT DOWN THE JUGGERNAUT TO BECOME IT  10 POINTS' },
  [F.M_RACE]: { name: 'RING RACE', rules: `THROUGH THE GATES IN ORDER  ${F.LAPS} LAPS  FIRST HOME WINS` },
};
export const modeName = (m) => MODE_NAMES[m] ?? MODE_NAMES[L.M_FIESTA];

// A pilot's word: the arena's, its fields given flight's meanings (layout.mjs,
// src/flight.wat). yaw and pitch are where the pilot aims, as the arena's.
export function flightWord({ yaw = 0, pitch = 512, boost = 0, brake = 0, left = 0, right = 0, charge = 0, shot = 0, roll = 0, bomb = 0, serial = 0 }) {
  return arenaWord({ yaw, pitch, move: (boost ? 1 : 0) | (brake ? 2 : 0) | (left ? 4 : 0) | (right ? 8 : 0), jump: charge ? 1 : 0, shot, melee: roll, gren: bomb, serial });
}

// The yaw and pitch (word units: yaw 1/16384 turn, pitch 10 bits with 512
// level) that aim from a to b, the way the sim reads them.
export function aimWord(a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const yaw = Math.round(Math.atan2(dz, dx) / (2 * Math.PI) * 16384) & 16383;
  const pitch = Math.max(0, Math.min(1023, Math.round(512 + Math.atan2(dy, Math.hypot(dx, dz)) / Math.PI * 1024)));
  return { yaw, pitch };
}

// A ship: a fighter (arena-view.mjs) and its own fields. heading is the
// nose's [yaw, pitch] in radians, nose its unit vector.
View.prototype.ship = function ship(p) {
  const d = this.dv;
  const b = L.PLAYERS + this.bank + p * L.PSIZE;
  const f = this.fighter(p);
  const yaw = d.getUint16(b + F.F_YAW, true) / 16384 * 2 * Math.PI;
  const pitch = d.getInt16(b + F.F_PITCH, true) / 16384 * 2 * Math.PI;
  const bits = d.getUint8(b + F.F_BITS);
  return {
    ...f, heading: [yaw, pitch], nose: [Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw)],
    boost: d.getUint8(b + F.F_BOOST), spent: !!(bits & F.FB_SPENT), roll: d.getUint8(b + F.F_ROLL), rollLeft: !!(bits & F.FB_LEFT),
    charge: d.getUint8(b + F.F_CHARGE), held: !!(bits & F.FB_HELD), bombs: f.grens,
  };
};

// Ring Race's course as init laid it out (layout.mjs MAP_RACE): its gates in
// order, each { pos: [x, y, z], r }; none for a map without a race.
View.prototype.race = function race() {
  const d = this.dv;
  const n = Math.min(d.getUint32(L.MAP_RACE, true), F.NGATE);
  const gates = [];
  for (let k = 0; k < n; k++) {
    const a = L.MAP_RACE + 16 + 16 * k;
    gates.push({ pos: [d.getFloat32(a, true), d.getFloat32(a + 4, true), d.getFloat32(a + 8, true)], r: d.getFloat32(a + 12, true) });
  }
  return gates;
};

// Slot p's place in a race: gates passed (MR_POINTS), and from them its lap
// (0-based) and next gate; done once it has been round LAPS times.
View.prototype.racer = function racer(p, n = this.race().length) {
  const passed = this.dv.getUint16(L.MODE_REC + p * L.MR_SIZE + L.MR_POINTS, true);
  return { passed, lap: n ? Math.floor(passed / n) : 0, next: n ? passed % n : 0, done: n > 0 && passed >= n * F.LAPS };
};
