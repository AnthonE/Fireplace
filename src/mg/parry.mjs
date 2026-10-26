// PARRY BALL (MG_PARRY, prefix py): a disc with a low rim, sized for the
// crowd, and glowing orbs, one for every 16 balls, each hunting one ball at a
// time on a homing path. The ball hunted clicks while its orb is in reach
// (reach grows with the orb's speed, so the window is about PY_WIN s at any
// speed) and the orb goes off faster, along the clicker's facing, after the
// nearest ball in a cone round it (else the nearest). An orb that reaches its
// ball unparried puts it out. A click with nothing in reach locks the ball's
// parry for PY_LOCK. Orbs speed up with every parry and over the round; from
// PY_SHRINK0 the rim closes in. The last one in wins.
// Literal numbers only: the sim reads them through layout.mjs's MG_CONSTS,
// the client imports this file itself.
export const PY_R0 = 12; // the disc: PY_R0 m plus PY_RK times the root of the balls in, at most PY_RMAX
export const PY_RK = 3.6;
export const PY_RMAX = 70;
export const PY_SPAWN = 0.75; // balls start on a spiral over this much of the disc
export const PY_LEN = 15000; // 120 s
// The rim closes in from PY_SHRINK0 to PY_SHRINK1 ticks into play, from the
// disc's radius to PY_RFIN of it (at least PY_RMIN m); a ball is kept inside
// it and bounces off it softly (PY_WE).
export const PY_SHRINK0 = 7500; // 60 s
export const PY_SHRINK1 = 12500; // 100 s
export const PY_RFIN = 0.4;
export const PY_RMIN = 9;
export const PY_WE = 0.5;
export const PY_RIM_H = 0.6; // m, the rim's height (drawing)
// The orbs: one for every PY_PER balls in at the start, rounded up, at most
// PY_NMAX; one retires at a hit when the balls left need one fewer at one
// for every PY_KEEP.
export const PY_PER = 16;
export const PY_KEEP = 8;
export const PY_NMAX = 16;
// Speeds in m/s: an orb flies at least PY_S0 plus PY_SKT a tick into play
// (12 to 26.4 m/s over the round); a parry sends it off PY_UP times faster,
// at most PY_SMAX.
export const PY_S0 = 12;
export const PY_SKT = 0.00096;
export const PY_UP = 1.1;
export const PY_SMAX = 70;
// Homing: an orb turns toward its ball at most PY_TURN0 radians a tick as it
// is launched, PY_TURNK more each tick after, at most PY_TURN1 (so it never
// circles for long); within reach it flies straight in.
export const PY_TURN0 = 0.025;
export const PY_TURNK = 0.0004;
export const PY_TURN1 = 0.3;
export const PY_HIT = 1.4; // m between the orb's centre and the ball's, flat, that is a hit
export const PY_REACH0 = 2.4; // reach, m: PY_REACH0 plus the orb's speed times PY_WIN
export const PY_WIN = 0.2;
export const PY_LOCK = 63; // ticks a click with nothing in reach locks a ball's parry (a click while locked locks it again)
export const PY_CONE = 0.7071; // a parry's cone round the clicker's facing: the cosine of its half angle, 45 degrees
export const PY_SEND = 0.25; // s: a parry goes to a ball at least this much of the orb's flight off (its speed times it, plus PY_HIT and a ball's radius), while there is one
export const PY_SERVE = 250; // ticks into play the first orbs launch: their balls are shown from the countdown
export const PY_REST = 125; // ticks from a hit to the orb's next launch, its next ball shown
export const PY_SPOT = 0.3; // orbs wait to launch on a ring this much of the disc out
export const PY_Y = 1.1; // m over the floor an orb flies (drawing)
// Its header, byte offsets in PG_H.
export const PY_RAD = 0; // f32 the disc's radius as laid out
export const PY_RFINAL = 4; // f32 the radius the rim closes in to
export const PY_NORB = 8; // u32 orbs at the start
// In PG_S: the orbs, PY_NMAX of PY_OSIZE bytes; then 8 bytes a slot.
export const PY_ORB = 0;
export const PY_OSIZE = 32;
export const PY_OST = 0; // u8 PY_IDLE, PY_WAIT (on its spot, launching at PY_OAT) or PY_FLY
export const PY_OTGT = 1; // u8 the ball it hunts
export const PY_OBY = 2; // u8 the last to parry it, 255 none since it launched
export const PY_ORALLY = 3; // u8 parries since it launched, at most 255
export const PY_OAT = 4; // u32 tick into play: its launch (waiting), its launch or last parry (flying)
export const PY_OX = 8; // f32 where it is, x and z
export const PY_OZ = 12;
export const PY_ODX = 16; // f32 its heading, a unit vector
export const PY_ODZ = 20;
export const PY_OSP = 24; // f32 its speed, m/s
export const PY_OLAST = 28; // u8 the ball it hunted before (255 none)
export const PY_IDLE = 0;
export const PY_WAIT = 1;
export const PY_FLY = 2;
export const PY_SLOT = 512; // 256 x 8 B, by slot:
export const PY_SEEN = 0; // u8 the use counter (the word's bits 29-30) last seen
export const PY_LOCKT = 2; // u16 tick into play its parry is locked till
export const PY_PARRIES = 4; // u16 parries this round
export const PY_WHIFFS = 6; // u16 clicks with nothing in reach this round
// FX kinds, FX_MG + 4 * MG_PARRY + k.
export const PY_FX_PARRY = 164; // owner the parrier, shot the ball it now hunts | the orb << 8, at the orb, size its speed
export const PY_FX_HIT = 165; // owner the ball out, shot the last to parry it (255 none) | the orb << 8, at the orb, size its speed
export const PY_FX_SERVE = 166; // owner the ball it will hunt, shot the orb, at its spot, size the ticks to its launch
export const PY_FX_WHIFF = 167; // owner the clicker, shot 1 if it was locked already, at the ball, size the lock in ticks
