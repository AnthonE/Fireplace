// MINI GOLF (MG_MINIGOLF, prefix pt): every ball the golf ball on a
// putt-putt course of PT_NHMIN to PT_NHMAX holes side by side, each walled
// all round, laid out from the round's seed out of six: a windmill whose
// blades shut its door, a dogleg with a bank and a bumper, a sliding gate and
// a ramp up to a raised green, a field of bumpers over a hump, a zigzag of
// baffles over a dip, a spinning bar before a bowl round the cup. No rolling:
// you aim with the look, hold Space (or click, then click again) to charge,
// and let go to putt. The balls pass through each other, so nobody blocks a
// putt, and everyone plays the holes in order at their own pace. A hole is
// its strokes; PT_CAP strokes without sinking it and the ball is picked up
// for PT_CAP + 1. Placed by fewest strokes, a hole not finished counting
// PT_CAP + 1, ties to whoever holed out first; once half the balls are home
// the rest have PT_LATE.
// Literal numbers only: the sim reads them through layout.mjs's MG_CONSTS,
// the client imports this file itself.
export const PT_NHMIN = 3; // holes a round, from the seed
export const PT_NHMAX = 6;
export const PT_NTPL = 6; // the holes there are to lay out
export const PT_LEN0 = 1875; // 15 s, and
export const PT_LENH = 3125; // 25 s a hole
export const PT_LATE = 3750; // once half the balls are home, 30 s for the rest
export const PT_PITCH = 28; // m from one hole's middle to the next one's, along x
export const PT_ZH = 28; // the holes start this far before the stage's centre, along z
// The crowd waits on the lawn behind the first hole (every ball its own
// spot): PT_LCOLS across PT_LSTEP apart, rows from PT_LBACK back; PT_WALK
// into play everyone is on the first tee, sharing its spots (balls pass
// through each other).
export const PT_LCOLS = 16;
export const PT_LSTEP = 2.2;
export const PT_LBACK = 4;
export const PT_WALK = 50; // 0.4 s
// The putt: Space held (or a click) at rest charges a tick at a time to
// PT_CH (and stays there); let go (or click again) and it goes at
// PT_VK * charge m/s (PT_VMAX full) the way you look; under PT_CHMIN, nothing.
export const PT_CH = 160; // 1.28 s to full
export const PT_CHMIN = 6;
export const PT_VMAX = 19;
export const PT_VK = 0.11875; // PT_VMAX / PT_CH
// The roll: PT_FRIC_DT of speed a tick to rolling friction, PT_SLOPEG_DT a
// tick down a slope of 1; still where the slope is under PT_GSTILL (the
// friction over the slope's pull) and the speed under a tick's friction. A
// roll is stopped PT_ROLLMAX after the putt. A ball within PT_HUG over the
// green keeps to it.
export const PT_FRIC_DT = 0.024; // 3 m/s^2, per tick
export const PT_SLOPEG_DT = 0.056; // 7 m/s^2, per tick
export const PT_GSTILL = 0.42857143;
export const PT_ROLLMAX = 1500; // 12 s
export const PT_HUG = 0.3;
// Walls are capsules PT_WT round their lines; a ball touches one PT_RW
// (B_RAD + PT_WT) from its line, and keeps PT_E of its speed into it. A post
// gives back PT_PE of it and its kick on top; a moving obstacle, PT_ME.
export const PT_WT = 0.25;
export const PT_RW = 1.25;
export const PT_E = 0.7;
export const PT_PE = 1;
export const PT_ME = 0.5;
export const PT_KICK = 3; // a bumper post's kick, m/s
// The cup: a ball whose centre is within PT_CUPR of it under PT_SINKV m/s
// drops in; it sinks PT_SINKDY a tick for PT_SINKT ticks, then is on the next
// tee (picked up, it waits as long where it lies). PT_CAP strokes and at rest
// out of it, it is picked up for PT_CAP + 1.
export const PT_CUPR = 1.25;
export const PT_SINKV = 5;
export const PT_SINKT = 100; // 0.8 s
export const PT_SINKDY = 0.03;
export const PT_CAP = 6;
// Placed by PG_SCORE: (PT_SMAX less the strokes, PT_CAP + 1 for each hole not
// finished) << 10, and 1023 less the 1/4 s into play the last hole was
// finished at (0 before the first).
export const PT_SMAX = 42;
// The obstacles: a windmill's blades turn PT_WM_W 1/16384 turns a tick (a
// turn in 5 s) and shut its door while one is within PT_WM_BL of straight
// down (34% of the time); a gate slides PT_GT_A either way and back over
// PT_GT_P ticks, its gap 2 PT_GT_B wide; a bar PT_SP_ARM each side of its
// pivot turns PT_SP_W a tick (a turn in 3.85 s). PT_RADT is rad/s for
// 1/16384 turn a tick (2 pi 125 / 16384).
export const PT_WM_W = 26;
export const PT_WM_BL = 700;
export const PT_WM_HD = 1.6; // the windmill's door, half its width
export const PT_GT_P = 500; // 4 s
export const PT_GT_A = 5.3;
export const PT_GT_B = 1.7;
export const PT_SP_W = 34;
export const PT_SP_ARM = 4.6;
export const PT_RADT = 0.0479369;
// Its header, byte offsets in PG_H (112 B, in the prediction's copy).
export const PT_NH = 0; // u32 the holes this round
export const PT_X0 = 4; // f32 hole 0's middle, x
export const PT_Z0 = 8; // f32 every hole's near end, z
export const PT_PARS = 12; // u32 the course's par
// A hole's record, PT_HSIZE bytes from PG_S, in world metres.
export const PT_HSIZE = 1024;
export const PT_H_TPL = 0; // u32 which hole (PT_T_*)
export const PT_H_MIR = 4; // f32 1, or -1 laid out mirrored (u to -u)
export const PT_H_X = 8; // f32 its middle, x
export const PT_H_Z = 12; // f32 its near end, z
export const PT_H_LEN = 16; // f32 its length along z
export const PT_H_HW = 20; // f32 its half width
export const PT_H_TEEX = 24; // f32 the tee, x and z
export const PT_H_TEEZ = 28;
export const PT_H_CUPX = 32; // f32 the cup, x and z
export const PT_H_CUPZ = 36;
export const PT_H_PAR = 40; // u32
export const PT_H_NSEG = 44; // u32 walls
export const PT_H_NPOST = 48; // u32 posts
export const PT_H_NFT = 52; // u32 slopes
export const PT_H_NGRN = 56; // u32 greens
export const PT_H_MK = 60; // u32 its moving obstacle, PT_MK_* (0 none)
export const PT_H_MX = 64; // f32 where: x, z
export const PT_H_MZ = 68;
export const PT_H_MW = 72; // i32 a turn's speed (1/16384 turn a tick, signed), or a gate's period in ticks
export const PT_H_MP = 76; // i32 its phase (1/16384 turns, or ticks)
export const PT_H_MA = 80; // f32 the windmill's half door, the gate's swing, the bar's arm
export const PT_H_MB = 84; // f32 the gate's half gap
export const PT_H_MC = 88; // i32 the windmill's half angle shut
export const PT_H_FT = 96; // slopes: u32 kind (PT_F_*), f32 z0, z1, height
export const PT_NFTMAX = 3;
export const PT_H_GRN = 144; // greens, to draw: f32 x0, z0, x1, z1
export const PT_NGRNMAX = 4;
export const PT_H_SEG = 224; // walls: f32 ax, az, bx, bz
export const PT_NSEGMAX = 40;
export const PT_H_POST = 864; // posts: f32 x, z, reach (its radius and the ball's), kick
export const PT_NPOSTMAX = 8;
export const PT_T_WINDMILL = 0;
export const PT_T_DOGLEG = 1;
export const PT_T_GATE = 2;
export const PT_T_BUMPERS = 3;
export const PT_T_ZIGZAG = 4;
export const PT_T_SPINNER = 5;
export const PT_MK_WINDMILL = 1;
export const PT_MK_GATE = 2;
export const PT_MK_SPINNER = 3;
export const PT_F_RAMP = 1; // up by its height from z0 to z1, and at it on past z1
export const PT_F_HUMP = 2; // a cosine bump of its height (under 0, a dip) from z0 to z1
// A ball's PG_M: its hole in the low 3 bits (finished once it's PT_NH), the
// strokes on it (in a pause, what the hole scored), its total over the holes
// done, the charge, charging, charging from a click, the use counter last
// seen, the pause's ticks left, and begun (the counter and score set).
export const PT_M_STROKE = 3; // shift, 3 bits
export const PT_M_TOTAL = 6; // shift, 6 bits
export const PT_M_CH = 12; // shift, 8 bits
export const PT_M_CHG = 0x100000;
export const PT_M_ARMED = 0x200000;
export const PT_M_CTR = 22; // shift, 2 bits
export const PT_M_PAUSE = 24; // shift, 7 bits
export const PT_M_BEGUN = 0x80000000;
// Its FX kinds are FX_MG + 4 * MG_MINIGOLF + k, k 0 to 3: 224 to 227.
export const PT_FX_PUTT = 224; // a putt: owner, its stroke on the hole, at the ball, its speed as size
export const PT_FX_SINK = 225; // holed: owner, the strokes, at the cup, the hole as size
export const PT_FX_PICK = 226; // picked up: owner, PT_CAP + 1, where it lies, the hole as size
export const PT_FX_HOME = 227; // every hole done: owner, the total strokes, at the last cup, the holes as size
