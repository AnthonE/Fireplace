// RELAY RACE (MG_RELAY, prefix ry): red against blue (PGF_TEAMS) on a walled
// track, a zone across each end, both sides on it at once. Each side's
// batons, one for every 4 of its balls, start in its own end's zone (red's at
// low x, blue's at high x) and are carried to the other zone and back, over
// and over: a carrier over the far zone's line has run a leg, a point for its
// side, and sets the baton down there, where a teammate waiting takes it and
// runs it back; the carrier itself must rest before it takes one again. A
// carrier rolls 15% slower, and a foe faster into a bump knocks its baton
// loose: it lies where it fell, its own side's only. Between the zones rows
// of posts slide from side to side on the clock and bat away whoever they
// meet. First side to its target of legs, or the most at 100 s; draws allowed.
// Literal numbers only: the sim reads them through layout.mjs's MG_CONSTS,
// the client imports this file itself.
// The track: RY_L0 m plus RY_LK times the root of the balls in long (x),
// RY_W0 plus RY_WK times it wide (65 by 16.5 m for 1, 68 by 30 for 16, 72 by
// 48 for 64, 80 by 84 for 256), walled; a zone RY_ZD m deep across each end.
export const RY_L0 = 64;
export const RY_LK = 1;
export const RY_W0 = 12;
export const RY_WK = 4.5;
export const RY_ZD = 8;
export const RY_LEN = 12500; // 100 s
export const RY_PE = 0.5; // a ball comes off a wall softly
export const RY_WALL_H = 1.2; // m, the wall (drawing: nothing leaves the track anyway)
// The balls as laid out: half of each side in its own end's zone and half in
// the other, the two sides' in turn across the track RY_GAP m apart, in
// columns RY_GAP apart from RY_IN m off the end wall. A newcomer in play
// falls in RY_BACK m off its own end wall.
export const RY_GAP = 2.4;
export const RY_IN = 1.5;
export const RY_BACK = 3;
// The batons: for each side the balls in plus RY_BN over RY_BD of them, 1 at
// least and RY_BMAX at most (1 for up to 11 balls, 2 for 16, 8 for 64, 32 for
// 256), lying across its own zone RY_SET m past the zone's line as the round
// is laid out. The first side to its target wins: RY_TGT legs, and RY_TGTK
// more for each baton past the first (8 for 1, 14 for 2, 50 for 8, 194 for 32).
export const RY_BN = 4;
export const RY_BD = 8;
export const RY_BMAX = 32;
export const RY_TGT = 8;
export const RY_TGTK = 6;
export const RY_SET = 2.5;
export const RY_R = 0.3; // m, a baton's radius lying (it is RY_BH m long as drawn)
export const RY_BH = 1.1;
// A take: a ball in play of the baton's side carrying nothing, rested, its
// bottom under RY_LOW m over the floor, whose centre comes within its radius
// and RY_GRAB of a lying baton takes it (of several, the nearest, ties to the
// lower slot).
export const RY_GRAB = 1.6;
export const RY_LOW = 1;
// A carrier keeps RY_SLOW of its speed a tick after its roll: 8.5 m/s flat
// out instead of 10.
export const RY_SLOW = 0.9985;
// A leg: a carrier's centre past the line of the zone its baton is going to.
// The baton is set down RY_SET m past the line where it crossed, anyone's of
// its side at once, and goes back the other way; its carrier takes none for
// RY_REST ticks (4 s), unless it is the only ball of its side in.
export const RY_REST = 500;
// A knock, judged on a carrier the tick it is hit: by a foe touching it
// (within their radii and RY_TOUCH) that was the faster into the bump
// (bumper's B_BUMPS for the other one), if its velocity jumped more than
// RY_HARD m/s since the last tick (a bump between two balls of a weight jolts
// each 2.5 m/s plus the speed they closed at: 5 m/s of closing). The baton
// lies where its carrier was, nobody's for RY_LOCK ticks and not its
// carrier's for RY_REGRAB.
export const RY_TOUCH = 0.5;
export const RY_HARD = 7.5;
export const RY_LOCK = 30;
export const RY_REGRAB = 150;
// Points of a ball's own (PG_SCORE, how the losers place).
export const RY_PT_LEG = 3;
export const RY_PT_KNOCK = 1;
// The posts: rows across the track RY_ROWGAP m apart, centred, none within
// RY_CLEAR m of a zone's line (4 rows for 1 ball, 5 for 64, 6 for 256,
// RY_ROWMAX at most). A row's posts stand RY_PS m apart along z, every other
// row's half of that across, RY_PR m in radius and RY_PH tall (a hop doesn't
// clear one), and slide together RY_PA m either way, a triangle wave: a
// 16-bit phase from the seed that RY_STEP0 to RY_STEP0 + RY_STEPN - 1 a tick
// (the seed's pick) carries round in 3.4 to 5.2 s, 3.1 to 4.7 m/s. A ball one
// meets is put outside it and sent straight off at RY_KNOCK m/s at least and
// RY_LIFT m/s up.
export const RY_ROWGAP = 10;
export const RY_CLEAR = 7;
export const RY_ROWMAX = 8;
export const RY_PS = 8;
export const RY_PR = 1.2;
export const RY_PH = 2.4;
export const RY_PA = 4;
export const RY_STEP0 = 100;
export const RY_STEPN = 56;
export const RY_KNOCK = 9;
export const RY_LIFT = 3;
// Its header, byte offsets in PG_H (in the prediction's copy).
export const RY_HX = 0; // f32 the track's half length, x
export const RY_HZ = 4; // f32 its half width, z
export const RY_ZX = 8; // f32 a zone's line from the middle, along x
export const RY_NB = 12; // u32 batons a side
export const RY_GOAL = 16; // u32 the legs that win
export const RY_NR = 20; // u32 rows of posts
export const RY_ROWS = 24; // u32 a row, RY_ROWMAX of them: its phase in the low 16 bits, its step a tick above
// In PG_S: the batons, 2 * RY_BMAX of RY_BSIZE bytes, red's then blue's.
export const RY_BAT = 0;
export const RY_BSIZE = 16;
export const RY_BST = 0; // u8 RY_NONE, RY_LIES or RY_HELD
export const RY_BBY = 1; // u8 held: its carrier; lying: who set it down or dropped it; 255 none
export const RY_BTO = 2; // u8 the zone it is going to: 0 at low x, 1 at high x
export const RY_BSIDE = 3; // u8 whose: 0 red, 1 blue
export const RY_BAT_AT = 4; // u32 tick into play its side may take it (lying), or it was taken
export const RY_BX = 8; // f32 world x, z: where it lies, or was taken
export const RY_BZ = 12;
export const RY_NONE = 0;
export const RY_LIES = 1;
export const RY_HELD = 2;
// In PG_BIG: RY_SSIZE bytes a slot.
export const RY_SLOT = 0;
export const RY_SSIZE = 32;
export const RY_SVX = 0; // f32 its velocity at the last tick's end, x
export const RY_SVZ = 4; // f32 and z
export const RY_SBUMPS = 8; // u16 its B_BUMPS then
export const RY_SLEGS = 10; // u16 legs run
export const RY_SKNOCKS = 12; // u16 foes' batons knocked loose
export const RY_SLOST = 14; // u16 its own knocked loose
export const RY_SNEXT = 16; // u32 tick into play it may take a baton again
// A ball's own field (PG_M): the baton it carries plus 1, 0 none.
// FX kinds, FX_MG + 4 * MG_RELAY + k.
export const RY_FX_TAKE = 228; // owner the taker, shot the baton | 256 off the floor short of a zone (a loose one), at it, size 0
export const RY_FX_LEG = 229; // owner the carrier, shot the baton | its side << 8, where it is set down, size its side's legs now
export const RY_FX_DROP = 230; // owner the carrier, shot the knocker, at its top, size the jolt (m/s)
export const RY_FX_BONK = 231; // owner the ball a post met, shot the row, at the ball, size 0 (bank d's ring)
