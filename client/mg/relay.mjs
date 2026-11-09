// RELAY RACE: procedural running lanes, numbered gates and a baton over
// each carrier. The next teammate waits at the painted exchange circle.
import * as L from '../../src/layout.mjs';
import * as MC from '../../src/mg/relay.mjs';
import { PLAT_Y, SIDES } from '../../src/party-view.mjs';
import { LOOK } from '../party-render.mjs';

export function stage(view) {
  const d = view.bank || 0, u = (a) => view.dv.getUint32(a + d, true);
  return { cx: view.dv.getFloat32(L.PG_CX + d, true),
    runner: [0, 4].map((s) => u(L.PG_H + MC.RR_RUNNER + s)),
    next: [0, 4].map((s) => u(L.PG_H + MC.RR_NEXT + s)),
    check: [0, 4].map((s) => u(L.PG_H + MC.RR_CHECK + s)),
    score: [u(L.PG_TSCORE), u(L.PG_TSCORE + 4)] };
}
export function gate(st, side, c) {
  return [st.cx + (c === 1 || c === 2 ? MC.RR_X : -MC.RR_X),
    st.cx + (side ? MC.RR_Z : -MC.RR_Z) + (c === 2 || c === 3 ? MC.RR_WIDTH : -MC.RR_WIDTH)];
}
export default {
  id: L.MG_RELAY, key: 'relay', name: 'RELAY RACE', env: 'day',
  hint: 'CARRY THE BATON THROUGH THE GATES  MEET YOUR NEXT RUNNER AT HOME',
  rules: 'FIRST TEAM TO FOUR LEGS WINS  MOST LEGS AT THE CLOCK',
  draw(view, ctx, out) {
    const st = stage(view), sc = out.scene;
    sc.box(st.cx, PLAT_Y - 0.5, st.cx, MC.RR_HX, 0.5, MC.RR_HZ, 0, 0.25, 0.35, 0.26, LOOK.RUBBER);
    for (const side of [0, 1]) {
      const color = SIDES[side].color, z = st.cx + (side ? MC.RR_Z : -MC.RR_Z);
      for (const dz of [-MC.RR_WIDTH, MC.RR_WIDTH])
        sc.box(st.cx, PLAT_Y + 0.01, z + dz, MC.RR_X, 0.015, MC.RR_GATE, 0, ...color, LOOK.PAINT);
      for (const dx of [-MC.RR_X, MC.RR_X])
        sc.box(st.cx + dx, PLAT_Y + 0.01, z, MC.RR_GATE, 0.015, MC.RR_WIDTH, 0, ...color, LOOK.PAINT);
      for (let c = 0; c < 4; c++) {
        const [x, gz] = gate(st, side, c), active = (st.check[side] % 4) === c;
        sc.cyl(x, PLAT_Y + 0.04, gz, MC.RR_GATE, 0.025, ...color, active ? LOOK.GLOW : LOOK.PAINT);
        // One to four posts mark the order without imported art.
        for (let k = 0; k <= c; k++)
          sc.cyl(x + (k - c / 2) * 0.65, PLAT_Y + 0.6, gz - MC.RR_GATE - 0.5, 0.12, 0.6, ...color, LOOK.PLASTIC);
      }
      const p = st.runner[side];
      if (p < L.NPLAYER) {
        const pos = p === ctx.slot && ctx.own ? ctx.own : view.partier(p).pos;
        sc.cyl(pos[0], pos[1] + 3.4, pos[2], 0.18, 0.65, ...color, LOOK.GLOW);
      }
    }
  },
  frame(view) { const { cx } = stage(view); return { centre: [cx, PLAT_Y, cx], radius: MC.RR_HX, shape: 'square' }; },
  fx() {},
  hud(view, ctx) {
    const st = stage(view), me = ctx.me;
    ctx.right(2, `LEGS ${st.score[0]} - ${st.score[1]} / ${MC.RR_LEGS}`, ctx.C.WHITE);
    if (!me) return;
    const s = me.side;
    const text = st.runner[s] === ctx.slot ? (st.check[s] === 4 ? 'MEET NEXT RUNNER AT HOME' : `BATON: GATE ${st.check[s] + 1}`)
      : st.next[s] === ctx.slot ? 'NEXT RUNNER: WAIT AT HOME' : 'WAIT FOR YOUR BATON';
    ctx.right(3, text, ctx.C.WHITE);
  },
  brain: {
    danger(view, x, z) {
      const cx = view.dv.getFloat32(L.PG_CX + (view.bank || 0), true);
      return Math.abs(x - cx) > MC.RR_HX - 3 || Math.abs(z - cx) > MC.RR_HZ - 3 ? 1 : 0;
    },
    goal(view, me, bot) {
      const st = stage(view);
      return gate(st, me.side, st.runner[me.side] === bot.slot ? st.check[me.side] : 0);
    },
    think(view, me, bot) {
      // Waiting runners brake in the exchange; they must stay there while
      // their teammate comes back. The planner steers the active runner.
      const st = stage(view), home = gate(st, me.side, 0);
      if (st.runner[me.side] !== bot.slot && Math.hypot(bot.pos[0] - home[0], bot.pos[1] - home[1]) < 1)
        return { yaw: 0, move: 0, hop: false, use: false };
      return null;
    },
    hop() { return false; },
  },
};
