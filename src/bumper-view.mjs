// The ball's readers, on top of src/view.mjs: a player record read as a ball
// (bumper.wat's, which party's minigames all roll), and golf's input word as
// a ball reads it. src/party-view.mjs builds on them.
import * as L from './layout.mjs';
import { View, inputWord } from './view.mjs';

export { View, inputWord };
const N = (k) => Number(L.BPHYS[k]);
export const PLAT_Y = N('PLAT_Y');
export const B_RAD = N('B_RAD');
export const MEGA_RAD = N('MEGA_RAD');

// A ball: a player record read as bumper's.
View.prototype.bumper = function bumper(p) {
  const d = this.dv;
  const b = L.PLAYERS + this.bank + p * L.PSIZE;
  const pl = this.player(p);
  const fl = d.getUint8(b + L.P_FL);
  const mega = d.getUint16(b + L.B_MEGA, true);
  return {
    ...pl, out: !!(fl & L.PF_DEAD), falling: !!(fl & L.PF_FALL), stomp: !!(fl & L.PF_STOMP),
    item: d.getUint8(b + L.B_ITEM), mega, dash: d.getUint16(b + L.B_DASH, true), radius: mega ? MEGA_RAD : B_RAD,
    wins: d.getUint16(b + L.B_WINS, true), kos: d.getUint16(b + L.B_KOS, true), bumps: d.getUint16(b + L.B_BUMPS, true),
    hitBy: d.getUint8(b + L.B_HITBY), hitFor: d.getUint16(b + L.B_HITT, true), place: d.getUint8(b + L.B_PLACE),
    rounds: d.getUint16(b + L.B_ROUNDS, true), outAt: d.getUint32(b + L.B_OUTAT, true),
    yaw: (pl.input & 0x3fff) / 16384 * 2 * Math.PI,
  };
};

// Golf's input word, as bumper reads it: yaw, the keys, a hop, the use counter.
export const bumperWord = ({ yaw = 0, move = 0, hop = 0, use = 0 }) => inputWord({ yaw, pitch: 512, move, jump: hop, shot: use });
