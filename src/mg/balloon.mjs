// BALLOON BASH (MG_BALLOON, prefix bl): every ball carries three balloons
// into a walled arena of crates and a two-tier tower. Come down on another
// ball's top (a stomp), ram it faster than BL_RAM, or catch it in a blast (a
// ROCKET's, a POW's, a SPRING's landing) and it loses a balloon, which you
// steal if you have fewer than three; then it's guarded BL_GUARD. Out of
// balloons, out, the KO to whoever popped the last. Bumper's power-ups fall
// from the sky. From BL_CLOSE0 the wall closes in to BL_RMIN by BL_CLOSE1,
// taking the crates it reaches; in that last ring a ram takes less, a pop
// steals nothing and power-ups fall twice as often. At the clock whoever is
// still in shares the win.
// Literal numbers only: the sim reads them through consts.mjs's MG_CONSTS,
// the client imports this file itself.
export const BL_R0 = 14; // the arena: BL_R0 m plus BL_RK times the root of the balls in, at most BL_RMAX
export const BL_RK = 2.5;
export const BL_RMAX = 56;
export const BL_RMIN = 8; // m, the last ring the wall closes in to, round the tower
export const BL_LEN = 11250; // 90 s, then whoever is still in shares the win
export const BL_CLOSE0 = 4375; // ticks into play the wall starts closing in (35 s)
export const BL_CLOSE1 = 8750; // and reaches BL_RMIN (70 s): the last ring
export const BL_WALLE = 0.5; // the wall gives back this much of the speed into it
export const BL_SPAWN = 0.85; // balls start on a sunflower over this much of the radius, clear of the boxes
export const BL_CLEAR = 0.6; // m at least between a starting ball and a box
// The boxes, square and upright: the tower in the middle (a base a hop high,
// a top tier a hop more), and crates over the ring from BL_CIN m out to
// BL_COUT m inside the wall, BL_GAP m apart at least: BL_C0 and one for every
// BL_CAREA m^2 of arena, BL_TALL of them tall with a step beside (at most
// BL_BMAX boxes). A hop (0.9 m) gets a ball from the floor onto BL_LOW, and
// from BL_LOW onto BL_HIGH. Half-widths and tops over the floor, m.
export const BL_T1 = 3;
export const BL_T1H = 0.75;
export const BL_T2 = 1.2;
export const BL_T2H = 1.5;
export const BL_CRATE = 1.2;
export const BL_STEP = 0.9;
export const BL_LOW = 0.75;
export const BL_HIGH = 1.5;
export const BL_TALL = 0.35;
export const BL_C0 = 3;
export const BL_CAREA = 230;
export const BL_CIN = 6;
export const BL_COUT = 4;
export const BL_GAP = 2.8;
export const BL_BMAX = 64;
export const BL_BOXE = 0.3; // a box's side gives back this much of the speed into it
export const BL_SINK = 63; // ticks a box sinks into the floor as the wall reaches its far corner (0.5 s), then gone
// The balloons: BL_BALLOONS each. A ball can't lose one in the first
// BL_GUARD0 of play, nor for BL_GUARD after it lost one. A ball hit this
// tick (bumper's fresh B_HITT) within reach of a blast that went off this
// tick (a POW's, a ROCKET's, a SPRING's landing: $b_blast's radius, from
// where it went off) was blasted by its owner. A pair of balls hit this tick
// whose skins are within BL_TOUCH m, neither in a blast of the other's, and
// who were closing as it began is a bump: one's bottom over the other's
// centre, falling faster than BL_FALL m/s, is a stomp, and the stomper
// bounces up at BL_BOUNCE m/s; else the faster into the other along the line
// between them, past BL_RAM m/s, rams it (a MEGA ball into one that isn't,
// past BL_RAMM; anyone in the last ring, past BL_RAMF).
export const BL_BALLOONS = 3;
export const BL_GUARD0 = 250; // 2 s
export const BL_GUARD = 190; // 1.5 s
export const BL_TOUCH = 0.15;
export const BL_FALL = 0.5;
export const BL_BOUNCE = 8;
export const BL_RAM = 7;
export const BL_RAMM = 3.5;
export const BL_RAMF = 4.5; // a metre and a half of run gets there: the last ring has no room for more
export const BL_FXY = 2.5; // m over a ball's top its balloons float (where a pop's FX is)
// Bumper's power-ups fall from ORB_Y onto the floor or the box under them:
// the first BL_DROP0 into play, then one every BL_DROPGAP ticks (BL_DROPGAPF
// in the last ring) and one more for every BL_DROPN balls still in; one lies
// BL_ORBLIFE ticks, falling on if the box under it goes, gone outside the
// wall (BL_NORB at once at most). Of each hundred: BL_PDASH DASH, BL_PROCKET
// ROCKET, BL_PSPRING SPRING, BL_PPOW POW, the rest MEGA.
export const BL_DROP0 = 500;
export const BL_DROPGAP = 375;
export const BL_DROPGAPF = 188;
export const BL_DROPN = 16;
export const BL_ORBLIFE = 1500;
export const BL_NORB = 32;
export const BL_PDASH = 25;
export const BL_PROCKET = 25;
export const BL_PSPRING = 20;
export const BL_PPOW = 10;
// Its header, byte offsets in PG_H (112 B, in the prediction's copy).
export const BL_RAD = 0; // f32 the arena's radius at the start
export const BL_NB = 4; // u32 boxes
export const BL_DROP = 8; // u32 ticks into play of the next drop
export const BL_NS = 12; // u32 the balls the spawns were laid out for
export const BL_M = 16; // u32 the spiral's points tried for them
export const BL_NCLEAR = 20; // u32 the points clear of the boxes
// In PG_S, fixed at setup but the power-ups: the boxes (32 B: f32 x, z, half-width, top over the floor | u32
// the tick into play the wall reaches its far corner and it's gone, 0x7fffffff never | u32 its kind, BL_K*);
// the power-ups (16 B: f32 x, y (its bottom), z | u8 PU_* (0 none) | u8 1 falling, 2 lying | u16 ticks left);
// the spiral's points clear of the boxes, u16 each.
export const BL_BOX = 0;
export const BL_ORBS = 2048;
export const BL_SPOTS = 2560;
// In PG_BIG, as the last tick ended: a record per slot (32 B: f32 vx, vy, vz, px, py, pz | u16 P_SHOTS | u8
// B_ITEM | u8 P_FL | f32 its radius); PROJ's rockets (its 32 B slots, J_KIND 0 for one free) and the slots
// they reach (u32: one past the last rocket). Then this tick's own, rebuilt every tick: the balls that used a
// ROCKET, in slot order (u8 each); the blasts, in the order they went off (16 B: f32 x, y, z | u8 owner | u8
// BL_B*), at most two a ball and one a PROJ slot.
export const BL_REC = 0;
export const BL_PJ = 8192;
export const BL_NJ = 40960;
export const BL_RU = 41216;
export const BL_BL = 41472;
export const BL_BPOW = 0; // a POW, in its owner's move
export const BL_BSPRING = 1; // a SPRING's landing, in its owner's move
export const BL_BROCKET = 2; // a rocket, after every ball's move
export const BL_KLOW = 0; // a crate
export const BL_KHIGH = 1; // a tall crate
export const BL_KSTEP = 2; // the step beside one
export const BL_KBASE = 3; // the tower's base
export const BL_KTOP = 4; // its top tier
// A ball's PG_M, written by the confirmed world's tick: b0-1 the balloons it
// has lost (0 to 3: 0, as a round lays it out, is all three), b16-31 the
// tick into play of its last loss + 1 (0 none).
// FX kinds, FX_MG + 4 * MG_BALLOON + k.
export const BL_FX_POP = 204; // a balloon popped: owner the ball, shot the popper (255 none) | how << 8 (0 a stomp, 1 a ram,
//                               2 a blast) | 1024 if the popper stole it; at the balloon, size the balloons it has left
export const BL_FX_CLOSE = 205; // the wall starts closing in: owner 255, at the middle, size the last ring's radius
