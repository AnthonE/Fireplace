// LUCKY BLOCKS (M_LUCKY), as drawn and as the AI fighter plays it (the rules
// are src/am/lucky.wat's, the blocks AO's as src/am/lucky.mjs lays them out).
// Everyone for itself: no sides, so the frontend's free-for-all HUD and board
// hold the kills, and this module adds the blocks. Each standing block is a
// gold cube with a ? (kind BLOCK) bobbing over its spot in a glow; a waypoint
// marks the nearest while the fighter shown holds the starter alone. The HUD
// has the target, the blocks standing and your legs' seconds left; the feed
// what each block paid ("P7 LUCKY ROCKET", "P3 UNLUCKY"), a banner for yours;
// the board's BLOCKS column is MR_AUX.
// The brain: holding the starter alone, the nearest standing block, at a
// hurry (on toward it while it shoots); armed, the nearest within ARMED at no
// hurry, so it fights whoever turns up first. strike asks the bot core to
// break it once in sight: a swing up close, a shot from further.
import * as L from '../../src/layout.mjs';
import * as AC from '../../src/am/consts.mjs';
import { C } from '../font.mjs';

// the renderer's lucky block sprite (client/arena-render.mjs, fs_splat)
export const BLOCK = 11;
const GOLD = [1, 0.78, 0.18];
const ARMED = 40; // m: an armed fighter breaks a block this near when nobody is in sight

// What a block paid, in the feed's words: a gun's short name, or a roll's.
const GUN = { [L.W_AR]: 'RIFLE', [L.W_BR]: 'BURST RIFLE', [L.W_MAGNUM]: 'MAGNUM', [L.W_SNIPER]: 'SNIPER', [L.W_SHOTGUN]: 'SHOTGUN',
  [L.W_ROCKET]: 'ROCKET', [L.W_PLASMA]: 'PLASMA', [L.W_NEEDLER]: 'SEEKER', [L.W_SWORD]: 'SWORD' };
const ROLL = { [AC.LK_R_OVER]: 'OVERSHIELD', [AC.LK_R_FAST]: 'LEGS', [AC.LK_R_FRAGS]: 'FRAGS' };
// 'LUCKY ROCKET', 'UNLUCKY', 'UNLUCKY FRAG RAIN', or '' for a code it doesn't know
export function rolled(what) {
  if (GUN[what]) return `LUCKY ${GUN[what]}`;
  if (ROLL[what]) return `LUCKY ${ROLL[what]}`;
  if (what === AC.LK_R_BOOM) return 'UNLUCKY';
  if (what === AC.LK_R_RAIN) return 'UNLUCKY FRAG RAIN';
  return '';
}
export const unlucky = (what) => what === AC.LK_R_BOOM || what === AC.LK_R_RAIN;

// The blocks as AO holds them: { k, pos (its middle), wait (ticks until it's
// back, 0 standing) }. In the countdown AO is 0: none.
export function blocksOf(view) {
  const dv = view.dv, n = Math.min(AC.LK_MAX, dv.getUint32(L.AO + AC.LK_N, true)), out = [];
  for (let k = 0; k < n; k++) {
    const a = L.AO + AC.LK_BLOCKS + k * AC.LK_BSIZE;
    out.push({ k, pos: [dv.getFloat32(a, true), dv.getFloat32(a + 4, true), dv.getFloat32(a + 8, true)], wait: dv.getUint16(a + 12, true) });
  }
  return out;
}

// Ticks of legs (PF_FAST) slot p has left, from the confirmed world's record.
export const legsOf = (view, p) => view.dv.getUint16(L.MODE_REC + p * L.MR_SIZE + AC.LK_MR_FAST, true);
// Whether a fighter holds nothing but the starter.
export const bare = (f) => f.gun.every((g) => g === AC.LK_GUN || g === 0);

// The nearest standing block to feet `pos` (across, each metre up or down
// counting 3: a roof's is round by the stairs), or null; `within` m at most.
function nearest(view, pos, within = Infinity) {
  let best = null, bd = within;
  for (const b of blocksOf(view)) {
    if (b.wait) continue;
    const d = Math.hypot(b.pos[0] - pos[0], b.pos[2] - pos[2]) + 3 * Math.abs(b.pos[1] - Number(AC.LK_LIFT) - pos[1]);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

export default {
  mode: L.M_LUCKY,
  key: 'lucky',

  // rows 2 and 3: the target and the blocks standing; your legs' seconds
  hud(view, ctx) {
    if (view.hole().state === L.H_COUNT) { ctx.put(1, 2, 'SHOOT OR HIT THE BLOCKS FOR LOOT', ctx.C.WHITE); return; }
    const bs = blocksOf(view);
    ctx.put(1, 2, `FIRST TO ${AC.LK_TARGET}  ${bs.filter((b) => !b.wait).length} OF ${bs.length} BLOCKS UP`, ctx.C.GREY);
    const legs = ctx.slot >= 0 ? legsOf(view, ctx.slot) : 0;
    if (legs) ctx.put(1, 3, `LEGS ${Math.ceil(legs / 125)}`, ctx.C.YELLOW);
  },

  // The feed: what each block paid, yellow lucky, red unlucky; a banner for your own.
  news(f, ctx) {
    if (f.size !== AC.LK_MX_ROLL) return;
    const text = rolled(f.shot);
    if (!text) return;
    const bad = unlucky(f.shot);
    ctx.feed(`${ctx.name(f.owner)} ${text}`, bad ? C.RED : C.YELLOW);
    ctx.glow({ pos: f.pos, size: 2, color: bad ? [1, 0.3, 0.15, 0.9] : [...GOLD, 0.9], kind: 6, life: 500, grow: true });
    if (ctx.slot >= 0 && f.owner === ctx.slot) {
      const what = L.ARMS[f.shot] ? L.ARMS[f.shot].name : text.replace(/^(UN)?LUCKY ?/, '');
      ctx.banner(bad ? (f.shot === AC.LK_R_RAIN ? 'UNLUCKY  FRAG RAIN  RUN' : 'UNLUCKY') : `LUCKY  ${what}`, bad ? C.RED : C.YELLOW, 2000);
      ctx.sound?.pickup?.();
    }
  },

  // Each standing block bobbing over its spot in a glow; the one nearest the
  // fighter shown waypointed while it holds the starter alone.
  draw(view, ctx, out) {
    for (const b of blocksOf(view)) {
      if (b.wait) continue;
      const bob = 0.08 * Math.sin(ctx.now / 350 + b.k * 1.7);
      const pos = [b.pos[0], b.pos[1] + bob, b.pos[2]];
      out.solid.push({ pos, size: Number(AC.LK_HALF), aspect: 1, color: [...GOLD, 1], kind: BLOCK, minpx: 3 });
      out.glow.push({ pos, size: 1.2, color: [...GOLD, 0.3 + 0.1 * Math.sin(ctx.now / 250 + b.k)], kind: 3, minpx: 1 });
    }
    const eye = ctx.shown >= 0 ? view.fighter(ctx.shown) : null;
    if (eye?.live && !eye.dead && bare(eye)) {
      const b = nearest(view, eye.pos);
      if (b) out.markers.push({ pos: [b.pos[0], b.pos[1] + 1, b.pos[2]], label: '?', color: C.YELLOW });
    }
  },

  cols: [{ head: 'BLOCKS', get: (o) => String(o.aux) }],

  // starter alone: the nearest block, at a hurry; armed: the nearest within ARMED, at none
  goal(view, me) {
    if (view.hole().state !== L.H_PLAY) return null;
    const need = bare(me);
    const b = nearest(view, me.pos, need ? Infinity : ARMED);
    if (!b) return null;
    return { pos: [b.pos[0], b.pos[1] - Number(AC.LK_LIFT), b.pos[2]], r: 2, hurry: need ? 0.6 : 0, hold: false, strike: b.pos };
  },

  state(view) {
    const bs = blocksOf(view);
    return { blocks: bs.length, up: bs.filter((b) => !b.wait).length, leader: view.mode().leader, winner: view.mode().winner };
  },
};
