// SWISS ROLL (MG_CHEESE, prefix ch): bumper balls' round as a minigame. A
// wheel of Swiss cheese over the sea, sized for the crowd, its holes the golf
// cup made big and many; a ball whose centre rolls over one, or off the rim,
// drops through and is out. Over CH_SHRINK the rim crumbles in to CH_RMIN and
// every hole widens by half; power-ups fall from the sky. Bumps on; the last
// ball rolling wins.
// Literal numbers only: the sim reads them through layout.mjs's MG_CONSTS,
// the client imports this file itself.
export const CH_R0 = 16; // the wheel: CH_R0 m plus CH_RK times the root of the balls in, at most CH_RMAX
export const CH_RK = 3.5;
export const CH_RMAX = 80;
export const CH_RMIN = 9; // the rim's radius once it has crumbled in
export const CH_LEN = 11250; // 90 s, then whoever is still rolling shares the win
export const CH_SHRINK = 7500; // ticks into play for the rim to crumble in and the holes to widen by half (60 s)
// The holes: four, and one more for every 70 m^2 of wheel (1 / 0.01428), CH_NHMAX at most; 2.6 m across up
// to 1.6 m plus 0.12 of the wheel's radius (6 m at most); never within CH_MID of the middle, where the last
// stand has cheese under it.
export const CH_NH0 = 4;
export const CH_NHK = 0.01428;
export const CH_NHMAX = 64;
export const CH_HMIN = 2.6;
export const CH_HMAX = 6;
export const CH_HK = 0.12;
export const CH_H0 = 1.6;
export const CH_MID = 7;
export const CH_CLEAR = 1.8; // a spawn is this far, at least, past a hole's edge
export const CH_THICK = 6; // m of cheese: a ball going through is held in its hole's shaft till it is under it
// The power-ups: the first CH_DROP0 into play, then one every CH_DROPGAP, and one more for every CH_DROPN balls
// still in; each falls from bumper's ORB_Y at ORB_FALL and lies on the cheese CH_ORBLIFE, gone with the cheese under it.
export const CH_DROP0 = 250;
export const CH_DROPGAP = 500;
export const CH_DROPN = 24;
export const CH_ORBLIFE = 1250;
export const CH_NORB = 32;
// Its header, byte offsets in PG_H (112 B, in the prediction's copy).
export const CH_RAD = 0; // f32 the wheel's radius at the start
export const CH_NH = 4; // u32 the holes
export const CH_DROP = 8; // u32 ticks into play of the next drop
export const CH_N = 12; // u32 the balls the spawns were laid out for
export const CH_M = 16; // u32 the spiral's points tried for them
export const CH_NCLEAR = 20; // u32 the points clear of every hole
// In PG_S: the holes, f32 x, z, radius at the start | u32 0, 16 B each; the power-ups, f32 x, y, z | u8 PU_*
// (0 none) | u8 1 falling, 2 landed | u16 ticks left, 16 B each; and the spiral's points clear of the holes,
// u16 each.
export const CH_HOLES = 0;
export const CH_ORBS = 1024;
export const CH_SPOTS = 1536;
// Its FX kinds would be FX_MG + 4 * MG_CHEESE + k, 196 to 199: it has none of its own (a drop is bumper's
// FX_DROP, a pickup FX_PICKUP).
