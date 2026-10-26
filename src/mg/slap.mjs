// SLAP HAPPY (MG_SLAP, prefix sl): an island over the sea with a ring of
// small ones round it, a hop apart, and every ball wearing a glove. A click
// winds up a slap, seen by everyone, that lands SL_GWIND ticks later on the
// nearest ball in a cone ahead within reach, flinging it away and up far
// harder than a bump. Knock one into the sea and whoever slapped it last,
// in the SL_CREDIT before it went over, scores a point (two in the last
// 15 s); a fall costs a point, and the fallen are back on a pad on a small
// island 2 s on. Each ball's glove is rolled per round: classic, heavy,
// quick or long. Most points at 90 s wins.
// Literal numbers only: the sim reads them through layout.mjs's MG_CONSTS,
// the client imports this file itself.
// The main island: SL_R0 m plus SL_RK times the root of the balls in, at most SL_RMAX.
export const SL_R0 = 9;
export const SL_RK = 2;
export const SL_RMAX = 42;
export const SL_SPAWN = 0.78; // balls start on a spiral over this much of it
// The small islands round it: SL_K0 plus the main radius times SL_KK of them
// (at most SL_KMAX), each SL_S0 + SL_SK times the main radius across, their
// edges SL_GAP from the main island's: a hop at 7 m/s or more clears it.
export const SL_K0 = 3;
export const SL_KK = 0.25;
export const SL_KMAX = 16;
export const SL_S0 = 3.6;
export const SL_SK = 0.06;
export const SL_GAP = 2.4;
export const SL_PAD = 0.55; // the respawn pad: the middle this much of a small island
export const SL_LEN = 11250; // 90 s
export const SL_DOUBLE = 9375; // ticks into play from which a knock-off pays double: the last 15 s
export const SL_RESPAWN = 250; // ticks a fallen ball waits: 2 s
export const SL_SAFE = 190; // and after it's back, ticks no slap lands on it (it drops in from 6 m for the first 0.8 s)
export const SL_IDLE = 0.985; // rolling drag a tick with no keys: let go and a ball stops in a few metres
// The slap. The click winds the glove up; SL_GWIND ticks after the press it
// lands on the nearest ball (ties to the lower slot) whose centre is within
// SL_GREACH of the slapper's, SL_DY of its height and SL_CONE (the cosine)
// of where the slapper faces as it lands; that ball keeps SL_KEEP of its
// way across and is flung on from the slapper at SL_GFLING and up at
// SL_GUP. The next press counts SL_GCOOL ticks after the last. Per glove
// (SL_G_*), the reach and speeds in cm and cm/s.
export const SL_G_CLASSIC = 0;
export const SL_G_HEAVY = 1;
export const SL_G_QUICK = 2;
export const SL_G_LONG = 3;
export const SL_GWIND = [25, 34, 15, 28]; // 0.2 s, 0.27, 0.12, 0.22
export const SL_GCOOL = [100, 150, 65, 115]; // 0.8 s, 1.2, 0.52, 0.92
export const SL_GREACH = [360, 340, 330, 480];
export const SL_GFLING = [1250, 1600, 1000, 1100];
export const SL_GUP = [650, 750, 550, 600];
export const SL_CONE = 0.5; // 60 degrees either side
export const SL_DY = 2.5;
export const SL_KEEP = 0.25;
export const SL_CREDIT = 375; // ticks a slap counts on the island: 3 s (a ball going over keeps it till it's in the sea)
export const SL_FALL = 1; // points a fall costs (not below 0)
// $p_seed keys: the small islands' turn, ball p's glove from SL_KGLOVE + p.
export const SL_KTURN = 0x31000;
export const SL_KGLOVE = 0x31100;
// Its header, byte offsets in PG_H (112 B, in the prediction's copy).
export const SL_RAD = 0; // f32 the main island's radius
export const SL_NS = 4; // u32 small islands
export const SL_SR = 8; // f32 a small island's radius
export const SL_RING = 12; // f32 how far out their centres are
// In PG_S: the small islands (f32 x, z), then a record per slot.
export const SL_SAT = 0;
export const SL_REC = 128; // 8 B a slot: u8 the last to slap it + 1 (0 none), u32 at +4 the HDR_TICK it landed
// A ball's PG_M, its own (written by its push on either bank): the use
// counter last seen (bits 0-1), SL_M_IN (in the round: the first push after
// play starts, a join or a respawn only takes the counter), and from bit 16
// the tick into play of its last swing's press + 1 (0 none).
export const SL_M_IN = 4;
// FX kinds, FX_MG + 4 * MG_SLAP + k.
export const SL_FX_SLAP = 156; // a slap lands: owner the slapper, shot the ball slapped (255 a miss), at it (a miss: the glove), size the fling (m/s)
export const SL_FX_SCORE = 157; // a knock-off scores: owner the scorer, shot the fallen, at the fallen, size the points
export const SL_FX_CALL = 158; // the last 15 s: double points; owner 255, at the middle
