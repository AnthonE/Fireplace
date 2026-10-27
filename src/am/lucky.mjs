// LUCKY BLOCKS (M_LUCKY, prefix lk): everyone for itself, no sides. Everyone
// spawns with LK_GUN in both hands and no frags. Lucky blocks stand over the
// map's spots (its pads, both flags' stands, the skull's spot and its hills,
// one to a spot LK_APART across), each a cube LK_HALF each way of its middle,
// LK_LIFT over the floor. A hitscan round through one, a swing reaching it, a
// blast within half its radius or a bolt or needle through it breaks it (none
// stops the shot); at the tick's end, in block order, the room's PRNG draws
// what it pays whoever broke it (LK_ROLLS, LK_ODDS of LK_ODDS_SUM), and it is
// back LK_BACK after. LK_TARGET kills win; the most at the clock wins.
export const LK_GUN = 3; // W_MAGNUM: the gun everyone starts with
export const LK_TARGET = 15;
export const LK_BACK = 1875; // ticks a broken block is gone: 15 s
export const LK_HALF = '0.5'; // m: half a block's side
export const LK_LIFT = '1'; // m: a block's middle over the floor under it
export const LK_APART = '3'; // m across (and 2 up or down) within which a later spot is the same block
export const LK_MAX = 24; // blocks at most
export const LK_SWING_R = '0.4'; // m: a swing's reach is a line this thick
export const LK_BOLT_R = '0.15'; // m: a bolt's or needle's
// What a block pays: a gun of ARMS by its W_* (in place of the one in your
// hands, or of the starter in the other; ammo if you carry it), or one of these:
export const LK_R_OVER = 16; // OVERSHIELD (the juggernaut's, back only to 100) and full health
export const LK_R_FAST = 17; // a zombie's legs (PF_FAST) for LK_FAST_TICKS
export const LK_R_FRAGS = 18; // LK_FRAGS frags, up to 4
export const LK_R_BOOM = 19; // a blast at the breaker's middle: LK_BOOM_DMG over 5 m, half to itself
export const LK_R_RAIN = 20; // LK_RAIN frags round the breaker, falling, their fuses LK_RAIN_FUSE apart
export const LK_ROLLS = [2, 5, 7, 8, 1, 4, 6, 9, 16, 17, 18, 19, 20];
export const LK_ODDS = [6, 6, 5, 5, 4, 4, 3, 3, 7, 7, 4, 6, 4];
export const LK_ODDS_SUM = 64;
export const LK_FAST_TICKS = 1875; // 15 s
export const LK_FRAGS = 2;
export const LK_BOOM_DMG = '300';
export const LK_RAIN = 8; // 45 degrees apart, LK_RAIN_R out and LK_RAIN_UP over its feet
export const LK_RAIN_R = '2.5';
export const LK_RAIN_UP = '4';
export const LK_RAIN_FUSE = 12; // ticks between one going off and the next; the first A_FUSE - LK_RAIN_AGE after
export const LK_RAIN_AGE = 100;
// The blocks, in AO (byte offsets from it):
export const LK_N = 0; // u32 blocks laid as play starts
export const LK_BLOCKS = 16; // LK_MAX x 16 B: f32 x, y, z (its middle) | u16 ticks until it's back (0 standing) | u16 who broke it this tick, slot + 1
export const LK_BSIZE = 16;
// A fighter's own, in its MODE_REC (MR_AUX the blocks it broke):
export const LK_MR_FAST = 6; // u16 ticks of PF_FAST left
// Its news, FX_MODE with these as size (MX_AM + 8 * 8 ..), at the block:
export const LK_MX_ROLL = 80; // owner broke a block, shot what it paid (an LK_ROLLS code)
