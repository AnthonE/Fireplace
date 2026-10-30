// CROSSROADS (M_CROSSROADS), as drawn and as the AI fighter plays it (the
// rules are src/am/crossroads.wat's, its numbers src/am/crossroads.mjs).
// Everyone for itself: the frontend's free-for-all HUD, this module's lines
// added. The board says KOS and WIPEOUTS, as the place's leaderboard did, for
// the core's kills and deaths. The HUD has your health's way back (a point a
// second) and whether the superball is in hand (G); the frags line goes, as
// there are none. Nothing is laid on the map, so nothing is drawn but the
// superballs, which the renderer draws from PROJ (kind CX_K_BALL). The brain
// is a Fiesta's: whoever it sees first.
import * as L from '../../src/layout.mjs';
import * as AC from '../../src/am/consts.mjs';

// Ticks until slot p's next superball, from the confirmed world's record (0: in hand, or dead).
export const ballIn = (view, p) => view.dv.getUint16(L.MODE_REC + p * L.MR_SIZE + AC.CX_MR_BALL, true);

export default {
  mode: L.M_CROSSROADS,
  key: 'crossroads',
  kills: false,
  frags: false,

  // rows 2 to 4: the rules, then the superball's wait
  hud(view, ctx) {
    if (view.hole().state === L.H_COUNT) { ctx.put(1, 2, 'SWORD  ROCKET  SUPERBALL (G)', ctx.C.WHITE); return; }
    ctx.put(1, 2, 'MOST KOS WIN', ctx.C.GREY);
    if (!ctx.me || ctx.me.dead) return;
    const wait = ballIn(view, ctx.slot);
    ctx.put(1, 3, ctx.me.grens ? 'SUPERBALL READY (G)' : `SUPERBALL IN ${Math.ceil(wait / 125)}`, ctx.me.grens ? ctx.C.YELLOW : ctx.C.GREY);
    if (ctx.me.hp < AC.CX_HP) ctx.put(1, 4, 'HEALING', ctx.C.GREEN);
  },

  news() {},
  draw() {},

  cols: [{ head: 'KOS', get: (o) => String(o.kills) }, { head: 'WIPEOUTS', get: (o) => String(o.deaths) }],

  dealt: () => 'SWORD  ROCKET  SUPERBALL',

  goal: () => null,

  state(view) {
    return { leader: view.mode().leader, balls: view.projectiles().filter((j) => j.kind === AC.CX_K_BALL).length };
  },
};
