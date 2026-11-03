// FALL BALL (MG_FALLBALL, prefix fa): red against blue (PGF_TEAMS) on a
// pitch over the void, red's half at low x defending the goal there, blue's
// at high x. The ends are walled, each with a wide goal mouth and a net box
// behind it; the sides are open but for low bumpers along the corners and the
// halfway line. Giant balls, FA_R in radius and FA_M balls heavy, drop out of
// the sky onto a spot marked as they fall: one at the kickoff, one more every
// FA_ADD up to a cap that grows with the crowd, and a golden one worth
// FA_GOLDV at FA_GOLDT. A ball shoves one by rolling into it, and it takes a
// few to move it far; one all the way into a goal is a goal for the side
// attacking it, one off a side is lost, and either way a new one drops
// FA_REDROP later. A ball that falls off is down FA_DOWN, then drops back in
// on its own side. Most goals at the clock wins; a draw stands.

// Literal numbers only: the sim reads them through layout.mjs's MG_CONSTS,
// the client imports this file itself.
// The pitch: FA_A0 m² plus FA_AK for each ball up to FA_NK and FA_AK2 for each
// past, FA_ASP times as long as wide.
export const FA_A0 = 700;
export const FA_AK = 70;
export const FA_NK = 16;
export const FA_AK2 = 25;
export const FA_ASP = 1.5;
export const FA_LEN = 15000; // 120 s
// The goals: a mouth FA_GWK of the pitch's half width either side of the
// middle (FA_GWMIN to FA_GWMAX m), posts FA_FR in radius, a crossbar FA_GH up
// (drawn: nothing reaches it), a net box FA_GD deep behind the goal line.
export const FA_GWK = 0.5;
export const FA_GWMIN = 6.5;
export const FA_GWMAX = 20;
export const FA_GD = 8;
export const FA_GH = 7.5;
export const FA_FR = 0.3;
// The bumpers: a kerb FA_BH high and FA_BT thick just outside each side line,
// from FA_BC0 of the half length out to the end wall, and within FA_BC1 of it
// of the halfway line; the rest of the sides are open.
export const FA_BH = 0.7;
export const FA_BT = 0.6;
export const FA_BC0 = 0.6;
export const FA_BC1 = 0.12;
// The balls.
export const FA_ACC = 1; // the push, times bumper's: 10 m/s flat out
export const FA_IDLE = 0.975; // rolling drag a tick with no keys: brakes at 3.2/s
export const FA_PE = 0.4; // a ball comes off the walls, the posts, the nets and the bumpers at this of its speed into them
export const FA_X0 = 5; // m, the kickoff's front row back from the halfway line (the kickoff ball lands on it)
export const FA_BACK = 0.72; // a ball back from down drops in this far from the halfway line toward its own goal line
export const FA_DOWN = 188; // ticks down after a fall: 1.5 s
// The giant balls: FA_R in radius, FA_M balls heavy. Rolling, FA_ROLL of their
// speed a tick and FA_FRIC m/s less (1.25 m/s²): one ball pushing it flat out
// makes 2.3 m/s at most, three 6, and it coasts a few metres after; in the
// air FA_G a tick down (16 m/s²) and FA_AIR. Off the floor FA_FE up (under FA_SETTLE m/s it
// settles); off the end walls and the nets FA_WE, the bumpers FA_BE, another
// giant ball FA_BBE. At most FA_VMAX m/s.
export const FA_R = 3;
export const FA_M = 5;
export const FA_ROLL = 0.9984;
export const FA_FRIC = 0.01;
export const FA_AIR = 0.9995;
export const FA_G = 0.128;
export const FA_FE = 0.3;
export const FA_SETTLE = 2;
export const FA_WE = 0.45;
export const FA_BE = 0.7;
export const FA_BBE = 0.7;
export const FA_VMAX = 20;
// A ball meets one where their spheres overlap, judged level (the giant
// ball's circle at the ball's centre height): put apart by weight, and if
// closing, 1 + FA_CE of the speed they close at shared by weight. A giant ball
// coming down faster than FA_SQ0 m/s is the sky's: it moves for nobody and
// throws whoever it meets out at FA_SQV m/s and up at FA_SQUP.
export const FA_CE = 0.6;
export const FA_SQ0 = 3;
export const FA_SQV = 9;
export const FA_SQUP = 5;
// The drops: from FA_DROPY m up (its centre over the floor: 2.2 s of fall,
// FA_VMAX at the end);
// one at the kickoff on the centre spot, then one every FA_ADD ticks while
// fewer than the cap are in play, and FA_REDROP after one goes. A drop lands
// within FA_DROPK of the half length of the halfway line and FA_DROPM m of the
// sides, FA_SEP m from any other giant ball if 8 tries find it. The cap: 1
// for every FA_PER balls in, rounded up, plus 1, FA_NMIN to FA_NMAX. A golden
// one, worth FA_GOLDV, drops near the centre spot at FA_GOLDT, past the cap.
// One whose centre falls FA_LOSTY under the floor is lost.
export const FA_DROPY = 34;
export const FA_ADD = 1000; // 8 s
export const FA_REDROP = 250; // 2 s
export const FA_DROPK = 0.55;
export const FA_DROPM = 6;
export const FA_SEP = 8;
export const FA_PER = 10;
export const FA_NMIN = 2;
export const FA_NMAX = 16;
export const FA_GOLDT = 11250; // 90 s
export const FA_GOLDV = 2;
export const FA_LOSTY = -16;
// Points of a ball's own (how the losing side places): a touch FA_PT_TOUCH,
// once a FA_RECOUNT at most; a goal FA_PT_GOAL times its worth to the scoring
// side's last toucher, FA_PT_ASSIST to each other ball of that side whose
// last touch was on it in the FA_ASSISTT before; a foe knocked off (the
// framework's KO) FA_PT_KO.
export const FA_PT_TOUCH = 1;
export const FA_RECOUNT = 125;
export const FA_PT_GOAL = 5;
export const FA_PT_ASSIST = 2;
export const FA_ASSISTT = 500;
export const FA_PT_KO = 2;
// Its header, byte offsets in PG_H (112 B, in the prediction's copy).
export const FA_HX = 0; // f32 the pitch's half length, the halfway line to a goal line
export const FA_HZ = 4; // f32 its half width
export const FA_GW = 8; // f32 a goal mouth's half width
export const FA_BX0 = 12; // f32 the corner bumpers run from here to the end wall (|x|)
export const FA_BX1 = 16; // f32 the halfway bumper runs out to here (|x|)
export const FA_CAP = 20; // u32 giant balls in play at most (the golden one past it)
export const FA_NEXT = 24; // u32 tick into play the next drop is due
export const FA_SER = 28; // u32 drops so far (a giant ball's serial is its drop's, from 1)
export const FA_GOLDN = 32; // u32 1 once the golden ball has dropped
export const FA_GOALS = 36; // u32 goals so far
export const FA_LOST = 40; // u32 giant balls lost off the sides so far
// In PG_S: the giant balls, FA_NMAX + 1 of FA_BSIZE bytes (the last the golden
// one's); then FA_SSIZE bytes a slot.
export const FA_BALL = 0;
export const FA_BSIZE = 48;
export const FA_FST = 0; // u8 FA_NONE, FA_FALL (dropping, the sky's), FA_LIVE or FA_WAIT
export const FA_FGOLD = 1; // u8 1 the golden one
export const FA_FBY = 2; // u8 its last toucher, 255 none
export const FA_FLAST = 3; // u8 red's last toucher at +0, blue's at +1, 255 none
export const FA_FSER = 8; // u32 its serial
export const FA_FAT = 12; // u32 tick into play it dropped (FA_WAIT: its replacement drops)
export const FA_FX = 16; // f32 x from the pitch's centre, the height of its centre over the floor, z from the centre
export const FA_FY = 20;
export const FA_FZ = 24;
export const FA_FVX = 28; // f32 its velocity
export const FA_FVY = 32;
export const FA_FVZ = 36;
export const FA_FSAT = 40; // u32 tick into play of red's last touch at +0, blue's at +4
export const FA_NONE = 0; // (FA_WAIT: gone, a new one drops into its record at its FA_FAT)
export const FA_FALL = 1;
export const FA_LIVE = 2;
export const FA_WAIT = 3;
export const FA_SLOT = 1024; // 256 x FA_SSIZE B, by slot:
export const FA_SSIZE = 20;
export const FA_TOUCHES = 0; // u16 touches counted
export const FA_GOALN = 2; // u16 goals
export const FA_ASSISTS = 4; // u16 assists
export const FA_KOS = 6; // u16 foes knocked off
export const FA_NEXTT = 8; // u32 tick into play its next touch counts from
export const FA_LASTB = 12; // u32 the serial of the giant ball it touched last (0 none)
export const FA_LASTT = 16; // u32 tick into play of that touch
// FX kinds, FX_MG + 4 * MG_FALLBALL + k: 216 to 219.
export const FA_FX_DROP = 216; // owner 255, shot the giant ball | 256 golden, at where it lands, size the s till it does
export const FA_FX_GOAL = 217; // owner the scorer (255 none), shot the giant ball | the scoring side << 8 | 512 golden | 1024 nobody of that side touched it, at it, size the side's goals
export const FA_FX_LOST = 218; // owner its last toucher (255 none), shot the giant ball | 512 golden, at where it went over, size 0
export const FA_FX_LAND = 219; // owner 255, shot the giant ball | 256 golden, at it, size its speed down
