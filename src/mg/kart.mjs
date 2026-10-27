// KART GRAB (MG_KART, prefix kt): a battle course of coins, and every ball a
// go-kart. A walled square floor, blocks on a lattice, dash panels in the
// lanes between them, item boxes in rows; coins drop all over it and the
// karts drive into them (PG_SCORE). A kart hit by a rocket, a POW, a stomp or
// a MEGA kart spins out and drops coins for anyone; holding drift (Space)
// through a turn charges a mini-turbo. Most coins at the time wins.
// Literal numbers only: the sim reads them through layout.mjs's MG_CONSTS,
// the client imports this file itself.
export const KT_H0 = 16; // the floor's half-width: KT_H0 m plus KT_HK times the root of the balls in, at most KT_HMAX
export const KT_HK = 2.4;
export const KT_HMAX = 56;
export const KT_LEN = 9375; // 75 s
export const KT_FEVER = 7500; // ticks into play the last 15 s start: coins drop twice as often, half as many again
export const KT_SPAWN = 0.7; // karts start on a sunflower over this much of the floor's half-width
// The course on a lattice of KT_S m round the centre, KT_M = floor((half-width - KT_MRIM) / KT_S) steps each way:
// a block on every point (i, j) with i + j even but the centre, a dash panel on every one with i + j odd,
// an item box on every cell's centre and a ring of KT_NRING round the middle.
export const KT_S = 14;
export const KT_MRIM = 7;
export const KT_BLOCK = 2.5; // a block's half-width, m
export const KT_BLOCKH = 2.2; // and its height: a hop doesn't clear it, a SPRING lands on it
export const KT_WALLH = 1.2; // the wall round the floor, as drawn; it stops a kart at any height
export const KT_WALLE = 0.4; // what a wall or a block gives back of the speed into it
export const KT_PADL = 2.6; // a dash panel's half-length along its way, m
export const KT_PADW = 1.7; // and half-width
export const KT_RING = 4.5; // the middle's ring of boxes, its radius
export const KT_NRING = 6;
export const KT_BOXY = 1.1; // a box's centre over the floor, m
export const KT_BOXR = 0.9; // taken by the first ball (by slot) with nothing held whose centre comes within its radius and this
export const KT_BOXBACK = 500; // ticks a taken box is gone: 4 s
export const KT_NBLKMAX = 32;
export const KT_NPADMAX = 32;
export const KT_NBOXMAX = 64;
// The kart, driven by its own push on either bank (the roll's push, drag and hop are off): its heading turns
// toward the yaw (where you look), up to KT_TURN a tick (1/16384 turns) at KT_TURNV m/s and over, KT_TURN0 of it
// standing; the gas takes it to KT_VMAX, the brake to a stop and then back to KT_VREV; with neither it coasts.
// Its sideways speed is KT_GRIP of itself a tick on the ground, all of it in the air; drifting, KT_DGRIP of it,
// the rest turned into the way it faces (its speed kept).
export const KT_VMAX = 15;
export const KT_VREV = 5;
export const KT_ACC = 0.14; // m/s a tick of gas: 17.5 m/s^2
export const KT_RACC = 0.06; // in reverse
export const KT_BRAKE = 0.25;
export const KT_COAST = 0.996;
export const KT_OVER = 0.99; // past KT_VMAX with the boost gone, a tick
export const KT_GRIP = 0.82;
export const KT_DGRIP = 0.95;
export const KT_TURN = 52; // 2.5 rad/s
export const KT_TURNV = 5;
export const KT_TURN0 = 0.45;
// A boost (B_DASH ticks left, its glow): to KT_VBOOST at KT_BACC a tick, gas or not. A dash panel under the
// kart gives KT_PADB; bumper's DASH (a mushroom) is stretched from DASH_TICKS to KT_SHROOM.
export const KT_VBOOST = 22;
export const KT_BACC = 0.3;
export const KT_PADB = 90;
export const KT_SHROOM = 150;
// Drift: Space held on the ground at KT_DRIFTV or more, the heading at least KT_DRIFTD off the yaw, hops
// (KT_HOPV) into a drift that way; held, the kart turns that way KT_DTURN0 to KT_DTURN1 a tick and charges a
// tick a tick (two turning tight); let go (or slowed under KT_DRIFTV / 2) at KT_MT1 ticks of charge it boosts
// KT_MTB1, at KT_MT2 KT_MTB2.
export const KT_DRIFTV = 7;
export const KT_DRIFTD = 256;
export const KT_HOPV = 3;
export const KT_DTURN0 = 26;
export const KT_DTURN1 = 78;
export const KT_MT1 = 80;
export const KT_MT2 = 180;
export const KT_MTB1 = 62;
export const KT_MTB2 = 125;
// Hits: a kart a blast reached (a rocket, a POW, a SPRING's stomp: its hitter not touching it) or a MEGA kart
// ran into spins out KT_SPIN ticks (no control, the heading whirling KT_SPINTURN a tick, KT_SPINDRAG a tick off
// its speed) and drops 3 coins and one more for every KT_LOSEK it holds, at most KT_LOSEMAX; then KT_GRACE
// more ticks nothing hits it again.
export const KT_SPIN = 125;
export const KT_SPINTURN = 393;
export const KT_SPINDRAG = 0.97;
export const KT_LOSE0 = 3;
export const KT_LOSEK = 8;
export const KT_LOSEMAX = 8;
export const KT_GRACE = 125;
// The coins: every KT_EVERY ticks (KT_EVERYF in the fever), while fewer than KT_C0 + (balls in) * KT_CN / 2
// are in (at most KT_CCAP, half as many again in the fever), a line of 3 drops KT_DROPH m onto a random spot
// clear of the blocks; the same as play starts until there are that many.
export const KT_EVERY = 40;
export const KT_EVERYF = 20;
export const KT_C0 = 20;
export const KT_CN = 3;
export const KT_CCAP = 320;
export const KT_DROPH = 10;
export const KT_DROPAIR = 75;
export const KT_LINE = 1.6; // m between the coins of a line
export const KT_MAX = 512; // records in PG_BIG (a power of two: the allocator's cursor wraps by mask)
export const KT_LIFE = 2500; // ticks a coin lies before it goes: 20 s
export const KT_CY = 0.55; // a lying coin's centre over the floor, m
export const KT_REACH = 0.7;
export const KT_GRABH = 3; // m over the floor a coin comes within reach
export const KT_LOOSE = 40; // ticks a coin knocked loose flies before anyone may take it
export const KT_IN = 2; // no coin lies nearer the wall than this
// The balls' grid for the takes, rebuilt every tick: KT_GN x KT_GN cells of KT_CELL m from the centre less KT_GN * KT_CELL / 2.
export const KT_CELL = 4;
export const KT_GN = 32;

// Its header, byte offsets in PG_H (112 B, in the prediction's copy).
export const KT_HALF = 0; // f32 the floor's half-width
export const KT_NBLK = 4; // u32 blocks
export const KT_NPAD = 8; // u32 dash panels
export const KT_NBOX = 12; // u32 item boxes
export const KT_CURSOR = 16; // u32 the next coin record the allocator tries
export const KT_LIVE = 20; // u32 coins in the records
// In PG_S, fixed at setup but the boxes' clocks: the blocks (8 B: f32 x, z), the panels (12 B: f32 x, z | u32 the
// way, 0 +x, 1 +z, 2 -x, 3 -z), the boxes (12 B: f32 x, z | u32 the tick into play it's back from), a record per slot.
export const KT_BLK = 0;
export const KT_PAD = 256;
export const KT_BOX = 640;
export const KT_BALL = 1408;
export const KT_BSIZE = 8;
export const KT_B_SAFE = 0; // u32 the HDR_TICK till which nothing hits it again
// A kart's PG_M, written by its own push on either bank (and the confirmed world's tick, as a hit spins it):
// b0-13 its heading (1/16384 turns), b14-15 its drift (KT_DL turning +, KT_DR turning -), b16-23 the drift's
// charge, b24-31 the spin-out's ticks left.
export const KT_DL = 1;
export const KT_DR = 2;
// In PG_BIG: the coins (KT_CSIZE B each), then the grid's heads (u16 a cell, 0xffff empty) and its links (u16 a slot).
export const KT_COINS = 0;
export const KT_GRID = 0x4000;
export const KT_GNEXT = 0x4800;
// A coin: flying from (x0, y0, z0) on tick t0 to lie at (x, z) after air ticks, h m of arc over the straight
// line between; worth v (0: a free record); its kind (KT_K*).
export const KT_CSIZE = 32;
export const KT_C_X = 0; // f32
export const KT_C_Z = 4; // f32
export const KT_C_X0 = 8; // f32
export const KT_C_Y0 = 12; // f32
export const KT_C_Z0 = 16; // f32
export const KT_C_H = 20; // f32
export const KT_C_T0 = 24; // u32 HDR_TICK
export const KT_C_AIR = 28; // u16 ticks
export const KT_C_V = 30; // u8
export const KT_C_KIND = 31; // u8
export const KT_KDROP = 0; // dropped from the sky
export const KT_KLOOSE = 1; // knocked loose: KT_LOOSE ticks before it's anyone's
// FX kinds, FX_MG + 4 * MG_KART + k.
export const KT_FX_TAKE = 152; // a take: the taker as owner, the coin's record as shot, the worth as size
export const KT_FX_HIT = 153; // a kart hit: it as owner, the coins it dropped as shot, where it was, size 0 a blast, 1 a MEGA kart
export const KT_FX_BOX = 154; // a box taken: the taker as owner, the box as shot, where it was, the power-up (PU_*) as size
export const KT_FX_BOOST = 155; // a boost (on the kart's own bank): it as owner, shot 0 a panel, 1 a mini-turbo, 2 a long one
