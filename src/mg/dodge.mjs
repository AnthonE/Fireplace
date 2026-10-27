// DODGEBALL (MG_DODGE, prefix db): the first team minigame (PGF_TEAMS). A
// court in two halves, red's at low x and blue's at high x, split by a centre
// line no ball crosses, each half sized for its side; behind each back line a
// jail for the other side's. Dodgeballs, one for every DB_PER balls, lie
// along the centre line as play starts. Roll over a loose one to hold it (one
// at most); a click throws it the way you face, fast and slightly arcing. A
// throw that meets a ball of the other side before it touches the floor or a
// wall sends that ball to jail; then, or once it has touched anything, it is
// loose again. A click with nothing held while an enemy throw is within reach
// (DB_REACH0 plus its speed times DB_WIN: about DB_WIN s) catches it: the
// thrower goes to jail and the catcher's side's longest jailed comes back. A
// click with nothing in reach locks the catch for DB_LOCK. The side with balls
// in play when the other has none wins; at the clock, the side with more.
// Literal numbers only: the sim reads them through layout.mjs's MG_CONSTS,
// the client imports this file itself.
// Each half is a square DB_HX m deep and twice that wide: DB_AREA m² for each
// ball of the bigger side, at least DB_AMIN.
export const DB_AREA = 36;
export const DB_AMIN = 160;
// The jails: DB_JAREA m² for each ball of the bigger side, at least DB_JMIN m deep.
export const DB_JAREA = 3.6;
export const DB_JMIN = 4;
export const DB_GAP = 2.4; // m between the balls laid out in rows from their back line
export const DB_BACK = 1.5; // m in from the back line the first row stands, and a freed ball
export const DB_LEN = 13750; // 110 s
export const DB_WALL_H = 1.2; // m, the court's walls (drawing: nothing leaves it anyway)
export const DB_LINE_H = 0.45; // m, the centre line's low wall (drawing)
export const DB_PE = 0.5; // a ball bounces off the line and the walls softly
// The dodgeballs: one for every DB_PER balls in, rounded up, DB_NMIN to DB_NMAX.
export const DB_PER = 4;
export const DB_NMIN = 2;
export const DB_NMAX = 64;
export const DB_R = 0.35; // a dodgeball's radius, m
// A throw: DB_V m/s the way the thrower faces and DB_LOFT up, from DB_UP over
// its centre and DB_OUT past its skin; DB_G a tick down (4 m/s²), so from 1.3 m
// it flies about 26 m before the floor.
export const DB_V = 18;
export const DB_LOFT = 2.5;
export const DB_UP = 0.3;
export const DB_OUT = 0.3;
export const DB_G = 0.032;
// Loose: DB_ROLL a tick on the floor; off a wall DB_WE of its speed, off the
// floor DB_FE (a bounce under DB_SETTLE m/s settles), off the ball it hit DB_BE.
export const DB_ROLL = 0.985;
export const DB_WE = 0.5;
export const DB_FE = 0.35;
export const DB_SETTLE = 1;
export const DB_BE = 0.3;
export const DB_TILT = 0.024; // a tick: a jail's floor slopes down to the court at 3 m/s² (a ball left there rolls back out)
// A pick-up: a loose dodgeball within DB_GRAB of a ball's skin, flat, and under DB_LOW m off the floor.
export const DB_GRAB = 0.5;
export const DB_LOW = 1.2;
// A catch: an enemy throw coming in within DB_REACH0 plus its speed times DB_WIN of the catcher's centre.
export const DB_REACH0 = 2;
export const DB_WIN = 0.2;
export const DB_LOCK = 63; // ticks a click with nothing in reach locks the catch (a click while locked locks it again)
// Its header, byte offsets in PG_H (in the prediction's copy).
export const DB_HX = 0; // f32 a half's depth, line to back line
export const DB_HZ = 4; // f32 the court's half width
export const DB_JD = 8; // f32 a jail's depth past the back line
export const DB_NB = 12; // u32 dodgeballs
// In PG_S: the dodgeballs, DB_NMAX of DB_BSIZE bytes; then DB_SSIZE bytes a slot.
export const DB_BALL = 0;
export const DB_BSIZE = 32;
export const DB_BST = 0; // u8 DB_NONE, DB_LOOSE, DB_HELD or DB_FLY
export const DB_BBY = 1; // u8 its holder, or (flying, or loose since) its thrower; 255 none
export const DB_BSIDE = 2; // u8 the side of its thrower (flying)
export const DB_BAT = 4; // u32 tick into play it was thrown or last changed hands
export const DB_BX = 8; // f32 x, y (its centre), z
export const DB_BY = 12;
export const DB_BZ = 16;
export const DB_BVX = 20; // f32 its velocity
export const DB_BVY = 24;
export const DB_BVZ = 28;
export const DB_NONE = 0;
export const DB_LOOSE = 1;
export const DB_HELD = 2;
export const DB_FLY = 3;
export const DB_SLOT = 2048; // 256 x DB_SSIZE B, by slot:
export const DB_SSIZE = 16;
export const DB_SEEN = 0; // u8 the use counter (the word's bits 29-30) last seen
export const DB_HOLD = 1; // u8 the dodgeball it holds, plus 1 (0 none)
export const DB_LOCKT = 2; // u16 tick into play its catch is locked till
export const DB_HITS = 4; // u16 balls it sent to jail with a throw
export const DB_CATCHES = 6; // u16 throws it caught
export const DB_THROWS = 8; // u16 throws
export const DB_JAILT = 12; // u32 tick into play it last went to jail
// A ball's own field (PG_M): 0 not begun (a newcomer: in play), DB_PLAY, or DB_JAIL.
export const DB_PLAY = 1;
export const DB_JAIL = 2;
// FX kinds, FX_MG + 4 * MG_DODGE + k.
export const DB_FX_THROW = 180; // owner the thrower, shot the dodgeball, at its launch, size its speed
export const DB_FX_HIT = 181; // owner the ball jailed, shot the thrower | the dodgeball << 8, at the dodgeball, size its speed
export const DB_FX_CATCH = 182; // owner the catcher, shot the thrower | the ball freed << 8 (255 none), at the dodgeball, size its speed
export const DB_FX_WHIFF = 183; // owner the clicker, shot 1 if it was locked already, at the ball, size the lock in ticks
