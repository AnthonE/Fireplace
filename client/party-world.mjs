// What every party bot looking at one world tick shares, apart from the
// minigame's own brain: the round, every ball in (not out, not falling) in a
// grid of CELL m squares (each with its side), both sides' balls in a team
// round, and the view the brains are handed (the same memory, with party()
// and hole() read once for the tick). Kept on the view for its tick.
// client/party-bot.mjs adds the minigame's module; this file imports nothing
// of the minigames', so a minigame's brain (client/mg/<key>.mjs) can import
// team() from here without a cycle through client/mg/index.mjs.
import * as L from '../src/layout.mjs';

export const CELL = 8; // m, the balls' grid

export function world(view) {
  const t = view.tick;
  if (view._pbot?.tick === t) return view._pbot;
  const g = view.party();
  const bv = Object.create(view);
  bv.party = () => g;
  bv.hole = () => g;
  const balls = [];
  const grid = new Map();
  const sides = [[], []];
  for (let p = 0; p < L.NPLAYER; p++) {
    const a = L.PLAYERS + view.bank + p * L.PSIZE;
    const fl = view.u8[a + L.P_FL];
    if ((fl & (L.PF_LIVE | L.PF_DEAD | L.PF_FALL)) !== L.PF_LIVE) continue;
    const b = { slot: p, x: view.dv.getFloat32(a + L.P_PX, true), z: view.dv.getFloat32(a + L.P_PZ, true), vx: view.dv.getFloat32(a + L.P_VX, true), vz: view.dv.getFloat32(a + L.P_VZ, true), side: fl & L.PF_BLUE ? 1 : 0 };
    balls.push(b);
    if (g.teams) sides[b.side].push(b);
    const k = Math.floor(b.x / CELL) * 4096 + Math.floor(b.z / CELL);
    const list = grid.get(k);
    if (list) list.push(b); else grid.set(k, [b]);
  }
  // teammates pass through each other in a team round without PGF_MATES: not in each other's way
  const through = g.teams && !(g.flags & L.PGF_MATES);
  view._pbot = { tick: t, g, mg: null, balls, grid, sides, through, view: bv };
  return view._pbot;
}

// A team round as slot sees it on the view's tick: its side (0 red, 1 blue;
// -1 outside a team round or out of it), and the balls in ({ slot, x, z, vx,
// vz, side }) on its side but itself and on the other.
export function team(view, slot) {
  const w = world(view);
  const a = L.PLAYERS + view.bank + slot * L.PSIZE;
  if (!w.g.teams || !(view.u8[a + L.P_FL] & L.PF_LIVE)) return { side: -1, mates: [], foes: w.balls.filter((b) => b.slot !== slot) };
  const side = view.u8[a + L.P_FL] & L.PF_BLUE ? 1 : 0;
  return { side, mates: w.sides[side].filter((b) => b.slot !== slot), foes: w.sides[1 - side] };
}
