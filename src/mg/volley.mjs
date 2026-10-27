// VOLLEYBALL (MG_VOLLEY, prefix vb): red against blue (PGF_TEAMS) on a court
// in two halves, red's at low x and blue's at high x, split by a net no ball
// crosses, each half sized for its side. Volleyballs, one for every VB_PER
// balls, big and floaty, are served over the net. A ball that meets one
// knocks it up and on the way it's rolling; in the air (a hop) it spikes it,
// harder, from higher up and flatter, always on over the net. A volleyball
// that lands on a side's floor is a point for the other side, and so is a
// side's fourth touch in a row; the scorer serves it again after VB_PAUSE.
// First to the target, or the most at the clock; a draw stands.

// Literal numbers only: the sim reads them through layout.mjs's MG_CONSTS,
// the client imports this file itself.
// Each half is VB_AREA m² for each ball of the bigger side, at least
// VB_AMIN: VB_HX m deep and twice that wide, to VB_HXMAX deep, then wider.
export const VB_AREA = 32;
export const VB_AMIN = 112;
export const VB_HXMAX = 18;
export const VB_LEN = 15000; // 120 s
export const VB_NET_H = 3; // m, the net's top over the floor: a ball's is 2, at a hop's top 3.6
export const VB_WALL_H = 1.2; // m, the court's walls (drawing: a volleyball bounces off them at any height)
export const VB_PE = 0.5; // a ball bounces off the net and the walls softly
export const VB_ACC = 1.1; // the push, times bumper's
export const VB_IDLE = 0.975; // rolling drag a tick with no keys: brakes at 3.2/s
export const VB_HOP = 8; // m/s, a hop (bumper's 6): a ball rises 1.6 m, its top over the net
// The volleyballs: one for every VB_PER balls in, rounded up, VB_NMIN to VB_NMAX.
export const VB_PER = 8;
export const VB_NMIN = 1;
export const VB_NMAX = 24;
export const VB_R = 1.2; // a volleyball's radius, m
export const VB_G = 0.072; // a tick down: 9 m/s², under half a ball's
// Off the net VB_NE of its speed into it, off a wall VB_WE; landed, off the
// floor VB_FE up and VB_FH along (a bounce under VB_SETTLE m/s settles), and
// VB_ROLL a tick on it.
export const VB_NE = 0.4;
export const VB_WE = 0.2;
export const VB_FE = 0.45;
export const VB_FH = 0.6;
export const VB_SETTLE = 1.2;
export const VB_ROLL = 0.98;
// A touch: a ball in play whose centre comes within its radius plus VB_R of
// a volleyball's. It goes on the way the ball rolls (under VB_SLOW m/s,
// straight toward the net), VB_BUMP0 plus VB_BUMPK of the ball's speed (at
// most VB_BUMPMAX), VB_BUMPUP up; from a ball in the air, a spike, at least
// VB_FWD of it toward the net, VB_SPIKE0 plus VB_SPIKEK of its speed (at most
// VB_SPIKEMAX) and VB_SPIKEUP up, flatter than a bump but from a hop's height
// and over twice as fast, unless it comes in faster than VB_DIG flat (a dig:
// a bump).
export const VB_SLOW = 1.5;
export const VB_BUMP0 = 1.5;
export const VB_BUMPK = 0.4;
export const VB_BUMPMAX = 5;
export const VB_BUMPUP = 6;
export const VB_FWD = 0.75;
export const VB_SPIKE0 = 10;
export const VB_SPIKEK = 0.9;
export const VB_SPIKEMAX = 18;
export const VB_SPIKEUP = 3.5;
export const VB_DIG = 6.5;

export const VB_GAP = 10; // ticks after a touch no ball touches it
export const VB_COOL = 30; // ticks after its touch the same ball doesn't
export const VB_MAXT = 3; // touches a side may make in a row: the next is a point to the other
// A serve: from VB_SBACK in from the server's back line, VB_SY up, in the
// volleyball's lane, to a spot VB_SD0 to VB_SD1 of the other half deep; VB_ST0
// plus VB_STK s a metre in the air, longer if it would pass under VB_SCLEAR
// over the net.
export const VB_SBACK = 1.8;
export const VB_SY = 3.5;
export const VB_SD0 = 0.3;
export const VB_SD1 = 0.8;
export const VB_ST0 = 1.8;
export const VB_STK = 0.03;
export const VB_SCLEAR = 1;
export const VB_FIRST = 125; // ticks into play of the first serve, VB_STAGGER more for each volleyball on
export const VB_STAGGER = 40;
export const VB_PAUSE = 250; // ticks after a point it's served again
// The target: VB_GOAL0 points, VB_GOALK more for each volleyball past the first.
export const VB_GOAL0 = 15;
export const VB_GOALK = 4;
// Its header, byte offsets in PG_H (in the prediction's copy).
export const VB_HX = 0; // f32 a half's depth, net to back line
export const VB_HZ = 4; // f32 the court's half width
export const VB_NB = 8; // u32 volleyballs
export const VB_GOAL = 12; // u32 the points that win
// In PG_S: the volleyballs, VB_NMAX of VB_BSIZE bytes; then VB_SSIZE bytes a slot.
export const VB_BALL = 0;
export const VB_BSIZE = 48;
export const VB_BST = 0; // u8 VB_NONE, VB_WAIT, VB_FLY or VB_DEAD
export const VB_BBY = 1; // u8 its last toucher, 255 none
export const VB_BSIDE = 2; // u8 the side touching it in a row, 255 none
export const VB_BN = 3; // u8 that side's touches in a row
export const VB_BAT = 4; // u32 tick into play of its last touch
export const VB_BNEXT = 8; // u32 tick into play it's served (waiting, or dead)
export const VB_BSERVE = 12; // u8 the side serving it next
export const VB_BX = 16; // f32 x, y (its centre), z
export const VB_BY = 20;
export const VB_BZ = 24;
export const VB_BVX = 28; // f32 its velocity
export const VB_BVY = 32;
export const VB_BVZ = 36;
export const VB_NONE = 0;
export const VB_WAIT = 1;
export const VB_FLY = 2;
export const VB_DEAD = 3;
export const VB_SLOT = 2048; // 256 x VB_SSIZE B, by slot:
export const VB_SSIZE = 8;
export const VB_TOUCHES = 0; // u16 touches
export const VB_SPIKES = 2; // u16 of them spikes
export const VB_KILLS = 4; // u16 points its side won off its last touch
export const VB_FAULTS = 6; // u16 fourth touches
// FX kinds, FX_MG + 4 * MG_VOLLEY + k.
export const VB_FX_TOUCH = 184; // owner the toucher, shot the volleyball | 256 a spike | the side's touches in a row << 9, at it, size its flat speed
export const VB_FX_POINT = 185; // owner its last toucher (255 none), shot the volleyball | the side scoring << 8 | 512 a fourth touch, at it, size the scorer's score
export const VB_FX_SERVE = 186; // owner 255, shot the volleyball | the serving side << 8, at its launch, size its flight in s
export const VB_FX_NET = 187; // owner 255, shot the volleyball, at it, size its speed into the net
