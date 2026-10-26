// GATE CRASH (MG_GATES, prefix gc): a straight course over the sea along +x,
// railed both sides, from a start pad to a finish line and a pen past it,
// crossed by GC_NW0 to GC_NW0 + GC_NWK - 1 walls of gates. Each gate is a
// portcullis in its slot between two posts, on its own clock from the round's
// seed: up, flashing GC_WARN ticks before it slams down in GC_FALL, down,
// then rising in GC_RISE. The periods shorten down the course and the open
// windows shrink down the course and as the round goes. A gate coming down
// onto a ball knocks it back hard; a gate down is a wall. Between walls,
// belts running back toward the start and bumper posts. The first over the
// line cuts the clock to GC_LATE; placed by finishing order, the rest by how
// far down the course they are at the end. Bumps on, without the kick.
// Literal numbers only: the sim reads them through layout.mjs's MG_CONSTS,
// the client imports this file itself.
export const GC_LEN = 15000; // 120 s
export const GC_LATE = 3750; // 30 s after the first ball home the round ends
export const GC_WIN = 4000; // PG_SCORE of a ball home: GC_WIN + the ticks of PG_LEN it had left; the rest: GC_DM a metre along
export const GC_DM = 10;
export const GC_W0 = 5; // the course's half-width: GC_W0 plus GC_WK times the root of the balls in, at most GC_WMAX
export const GC_WK = 0.9;
export const GC_WMAX = 20;
export const GC_SLOT = 4; // m a gate's slot about: a wall's gates are its width over this, GC_NGMIN to GC_NGMAX
export const GC_NGMIN = 3;
export const GC_NGMAX = 10;
export const GC_STEP = 2.4; // m between balls on the start grid
export const GC_PAD = 4; // m of start pad behind and in front of the grid
export const GC_IDLE = 0.975; // rolling drag a tick with no keys: a brake to wait at a gate on
export const GC_BACK = 250; // ticks a ball off the course waits (PG_RESPAWN: the rails keep everyone on)
// The course: GC_NW0 to GC_NW0 + GC_NWK - 1 walls, the first GC_X1 m past the start, the line GC_XN past
// the last, GC_GAP0 to GC_GAP0 + GC_GAPK m between walls (the course's own), each inner one jittered GC_JIT
// either way: 148 to 256 m to the line.
export const GC_NW0 = 8;
export const GC_NWK = 5;
export const GC_NWMAX = 12;
export const GC_X1 = 18;
export const GC_XN = 18;
export const GC_GAP0 = 16;
export const GC_GAPK = 4;
export const GC_JIT = 1;
export const GC_PEN0 = 14; // m: the pen past the line, and GC_PENK more a ball
export const GC_PENK = 0.12;
export const GC_MOUTH = 6; // m into the pen a ball is carried on at GC_THRU at least
// A wall: posts GC_PT either side of every slot's edge, a gate between each two, all GC_T either side of
// the wall's line. A gate up has its bottom GC_OPEN_H over the floor (a ball is 2 m, a hop's top 2.9);
// down, on the floor. Solid to a ball whose top is over its bottom; the posts, the rails, the pad's back
// and the pen's end always.
export const GC_T = 0.45;
export const GC_PT = 0.25;
export const GC_OPEN_H = 3.2;
export const GC_FRAME = 6.8; // m: the posts' tops, the housing the gates rise into between them (drawn)
export const GC_RAIL = 1.4; // m: the rails' height (drawn: solid all the way up)
// A gate's clock: its period from GC_P0 ticks at the first wall to GC_P1 at the last, and up to GC_PK more;
// up for a share of it from GC_O0 to GC_O1, half by how far down the course its wall is and half by how
// far its period's start is into GC_RAMP; then GC_FALL ticks slamming down, down, GC_RISE rising.
export const GC_P0 = 450; // 3.6 s
export const GC_P1 = 300; // 2.4 s
export const GC_PK = 60;
export const GC_O0 = 0.6;
export const GC_O1 = 0.38;
export const GC_RAMP = 7500; // 60 s
export const GC_FALL = 12;
export const GC_RISE = 50;
export const GC_WARN = 100; // 0.8 s: a gate flashes this long before it falls
// A gate coming down onto a ball: out the near side at GC_KNOCK back and GC_POP up; past its line, out
// the far side at GC_THRU on. A wall or a post met gives back GC_BOUNCE of the speed into it.
export const GC_KNOCK = 12;
export const GC_POP = 4;
export const GC_THRU = 3;
export const GC_BOUNCE = 0.3;
export const GC_BONK = 3; // m/s into a post or a gate down that makes an FX
// Between walls: a belt from GC_BIN past one wall to GC_BOUT short of the next, carrying what rolls on it
// back at GC_BELT m/s; bumper posts GC_BR round in two rows (at GC_ROW0 and GC_ROW1 of the way), one
// every GC_BSPAN m across, the second row's offset half that, that bounce a ball off at GC_BE of its speed
// into them and GC_BKICK more.
export const GC_BELT = 3;
export const GC_BIN = 3;
export const GC_BOUT = 6;
export const GC_BR = 0.8;
export const GC_BE = 0.6;
export const GC_BKICK = 4;
export const GC_BSPAN = 7;
export const GC_ROW0 = 0.35;
export const GC_ROW1 = 0.62;
export const GC_NPMAX = 160;
// a section's flags (GC_S_FL)
export const GC_S_BELT = 1;
export const GC_S_POSTS = 2;
// $p_seed keys
export const GC_KCOURSE = 0x31b00; // the course: $hash32 of this and a counter
export const GC_KGRID = 0x31b01; // the start grid's order
// In PG_S: the walls, the sections (k between wall k - 1 and wall k; 0 from the start line, GC_NW to the
// line), the gates (wall w's gate k at w * GC_NG + k, across from the low z side), the bumper posts, then
// a byte a slot.
export const GC_WALLS = 0;
export const GC_WSIZE = 8;
export const GC_W_X = 0; // f32 its line
export const GC_W_DEPTH = 4; // f32 how far down the course, 0 the first wall to 1 the last
export const GC_SECS = 96; // GC_WALLS + GC_NWMAX * GC_WSIZE, GC_NWMAX + 1 of them
export const GC_SSIZE = 20;
export const GC_S_FL = 0; // u32 GC_S_*
export const GC_S_BX0 = 4; // f32 its belt, from
export const GC_S_BX1 = 8; // f32 to
export const GC_S_P0 = 12; // u32 its first post
export const GC_S_PN = 16; // u32 its posts
export const GC_GATES = 512;
export const GC_GSIZE = 8;
export const GC_G_PER = 0; // u32 its period, ticks
export const GC_G_PH = 4; // u32 its phase: tick t into play is (t + PH) mod PER into its period
export const GC_POSTS = 1536; // GC_GATES + GC_NWMAX * GC_NGMAX * GC_GSIZE, rounded up
export const GC_PSIZE = 8; // f32 x, f32 z
export const GC_PLACE = 2816; // GC_POSTS + GC_NPMAX * GC_PSIZE: u8 per slot, where it came home (0 not yet)
// Its header, byte offsets in PG_H (112 B, in the prediction's copy).
export const GC_NW = 0; // u32 walls
export const GC_NG = 4; // u32 gates a wall
export const GC_W = 8; // f32 the course's half-width, about PG_CX in z
export const GC_XA = 12; // f32 the start pad's back
export const GC_X0 = 16; // f32 the start line: metres along are x less this
export const GC_FIN = 20; // f32 the finish line
export const GC_XB = 24; // f32 the pen's far end
export const GC_S = 28; // f32 a slot's width, GC_W * 2 / GC_NG
export const GC_FIRST = 32; // u32 the tick the first ball came home, 0 none yet
export const GC_HOME = 36; // u32 balls home
export const GC_ROW = 40; // u32 balls a row on the grid
export const GC_NPOST = 44; // u32 bumper posts
// A gate's state, as $gc_gate gives it with its bottom's height over the floor
export const GC_UP = 0;
export const GC_WARNING = 1; // up, flashing: it falls in GC_WARN ticks or fewer
export const GC_FALLING = 2;
export const GC_DOWN = 3;
export const GC_RISING = 4;
// Its FX kinds are FX_MG + 4 * MG_GATES + k, k 0 to 3: 140 to 143.
export const GC_FX_HOME = 140; // a ball over the line: owner, size its place
export const GC_FX_LATE = 141; // the first ball home: owner, size the seconds the rest have left
export const GC_FX_KNOCK = 142; // a gate comes down on a ball (its bank's ring): owner, the gate (w * GC_NG + k) as shot, size the speed it leaves at
export const GC_FX_BONK = 143; // a ball into a post or a gate down (its bank's ring): owner, shot the gate or 4096 + the post, size m/s into it
