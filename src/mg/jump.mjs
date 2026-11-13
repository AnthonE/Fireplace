// LONG JUMP (MG_JUMP, prefix lj): runways side by side along +x over the sea,
// one for every LJ_PER balls in. A ball rolls off the start deck down its
// runway's slope, over boost pads set left and right in a slalom, onto the
// take-off board, and flies out over the water; a hop on the board's last
// LJ_HOPZ lifts it, more the nearer the edge it is made. Out over the sea lie
// sand islands, smaller the farther out: a jump counts only if the ball comes
// down on one, and measures from the board's edge to where it landed; the sea
// is a foul. A wind along the runways, a new one from the seed every LJ_WSEG,
// carries a ball in the air on or holds it back. LJ_BACK after a landing or a
// splash the ball is back on its runway's start deck to go again. The best
// jump wins, in centimetres (PG_SCORE).
// Literal numbers only: the sim reads them through layout.mjs's MG_CONSTS,
// the client imports this file itself.
export const LJ_LEN = 11250; // 90 s
// The runways: one for every LJ_PER balls in, LJ_NLMIN to LJ_NLMAX of them,
// LJ_PITCH apart; each LJ_HW either side of its middle, railed.
export const LJ_PER = 6;
export const LJ_NLMIN = 2;
export const LJ_NLMAX = 32;
export const LJ_PITCH = 14;
export const LJ_HW = 4.5;
// Along (x): the start deck LJ_TOP deep, level, LJ_RISE over the board; the
// slope LJ_SLOPE long down to the board, LJ_BOARD long and level, LJ_BH over
// the islands' tops (the stage's floor); its far edge is where a jump is
// measured from.
export const LJ_TOP = 7;
export const LJ_SLOPE = 56;
export const LJ_BOARD = 9;
export const LJ_RISE = 11.2;
export const LJ_BH = 5;
// The roll: across the runway the usual push with a firm drag (LJ_DRAG a
// tick, keys held or not), so a ball answers the keys; along it the runway
// is slick (it keeps LJ_XKEEP of its speed a tick) and past the start deck
// the keys push only LJ_KEYX of their push along it: the slope (LJ_PULL
// m/s^2 down it) and the pads make the speed, the keys the line. No hop but
// the board's.
export const LJ_DRAG = 0.985;
export const LJ_XKEEP = 0.999;
export const LJ_KEYX = 0.2;
export const LJ_PULL = 1.6;
// The boost pads: LJ_NPAD down the slope, the first LJ_PAD0 from its top and
// LJ_PADGAP apart, each LJ_PADU off the middle, left then right (the other
// way round on every other runway), LJ_PADL half long and LJ_PADW half wide;
// a ball on the ground over one is pushed LJ_PADA m/s^2 down the runway while
// it rolls slower than LJ_PADV.
export const LJ_NPAD = 3;
export const LJ_PAD0 = 10;
export const LJ_PADGAP = 18;
export const LJ_PADU = 1.6;
export const LJ_PADL = 2.5;
export const LJ_PADW = 1.1;
export const LJ_PADA = 24;
export const LJ_PADV = 29;
// The hop: with the hop key down on the board's last LJ_HOPZ a ball goes up
// LJ_LIFT0 m/s at the zone's start, rising evenly to LJ_LIFT1 at the edge;
// past the edge the key does nothing.
export const LJ_HOPZ = 5;
export const LJ_LIFT0 = 1.5;
export const LJ_LIFT1 = 9;
// The wind: LJ_WSEG ticks of each, level -LJ_WMAX to LJ_WMAX from the seed
// ($p_seed(LJ_KWIND + its number)), LJ_WSTEP m/s^2 a level on a ball in the
// air (over 0 a tailwind); over a segment's last LJ_WTURN ticks it turns
// evenly into the next.
export const LJ_WSEG = 750; // 6 s
export const LJ_WTURN = 125; // 1 s
export const LJ_WMAX = 4;
export const LJ_WSTEP = 1.25;
export const LJ_KWIND = 0x1a600000;
// The islands: LJ_NI discs of sand on each runway's line, their tops the
// stage's floor; island i's middle LJ_ID[i] from the board's edge and its
// radius LJ_IR[i], written into the header at setup (LJ_ISL) from these.
export const LJ_NI = 5;
export const LJ_ID = [10.5, 18.6, 25, 30.2, 34.3];
export const LJ_IR = [4, 2.6, 2, 1.5, 1.1];
// The sea: its surface LJ_SEA under the islands' tops, its bed (what holds a
// sunk ball) LJ_DEEP under them; a ball in the air LJ_WET under the tops has
// missed. In the water a ball keeps LJ_WDRAG of its speed a tick and sinks
// LJ_SINKV m/s at most.
export const LJ_SEA = 0.5;
export const LJ_DEEP = 1.7;
export const LJ_WET = 0.3;
export const LJ_WDRAG = 0.9;
export const LJ_SINKV = 2.5;
// After a landing (held still in the sand) or a splash, LJ_BACK ticks and
// the ball is on its runway's start deck: three across LJ_SPOTU apart, three
// rows LJ_SPOTX apart from LJ_SPOT0 off its back edge, its slot's place. A ball within LJ_HUG over the runway
// keeps to it down the slope.
export const LJ_BACK = 125; // 1 s
export const LJ_SPOTU = 2.6;
export const LJ_SPOTX = 2.3;
export const LJ_SPOT0 = 1.3;
export const LJ_HUG = 0.7;
// Its header, byte offsets in PG_H (112 B, in the prediction's copy): the
// stage, which ground and push read on their own bank.
export const LJ_NL = 0; // u32 runways
export const LJ_XA = 4; // f32 the start deck's back edge, x
export const LJ_XS = 8; // f32 the slope's top
export const LJ_XB = 12; // f32 the board's near edge (the slope's foot)
export const LJ_XE = 16; // f32 the board's far edge: where a jump is measured from
export const LJ_ZL = 20; // f32 the first runway's middle less half a pitch: runway l's middle is LJ_PITCH (l + 1/2) on
export const LJ_ISL = 24; // LJ_NI x (f32 its middle's distance from the edge, f32 its radius)
// A ball's PG_M: where it is in its jump, and its last. All of it is push's,
// on either bank; the wait back is its P_REFIRE, which the roll counts down.
export const LJ_M_ST = 3; // LJ_RUN, LJ_FLY, LJ_SAND or LJ_SWIM
export const LJ_M_FOUL = 4; // its last jump ended in the sea
export const LJ_M_N = 3; // << : 6 bits, jumps ended (landed or sunk), counted round
export const LJ_M_LAST = 9; // << : 14 bits, its last jump, cm (where it sank, for a foul)
export const LJ_RUN = 0; // on its runway (or dropping onto it)
export const LJ_FLY = 1; // off the board, in the air
export const LJ_SAND = 2; // landed on an island, held
export const LJ_SWIM = 3; // in the sea
export const LJ_CMMAX = 16383;
// In PG_S: a record a slot, the confirmed world's (tick's), for the HUD and
// the marks.
export const LJ_SLOTS = 0;
export const LJ_SSIZE = 16;
export const LJ_S_BX = 0; // f32 where its best landed, x and z
export const LJ_S_BZ = 4;
export const LJ_S_JUMPS = 8; // u16 jumps ended
export const LJ_S_FOULS = 10; // u16 of them in the sea
export const LJ_S_BEST = 12; // u16 its best as tick last saw it, cm
export const LJ_S_SEEN = 14; // u8 its PG_M's count as tick last saw it
// FX kinds, FX_MG + 4 * MG_JUMP + k.
export const LJ_FX_OFF = 236; // a ball leaves the board: owner, shot the hop's lift in 1/8 m/s (0 none), at it, size its speed along the runway
export const LJ_FX_LAND = 237; // landed: owner, shot the island | 16 for its best yet, at it, size the jump, m
export const LJ_FX_SPLASH = 238; // into the sea: owner, at it, size how far out, m
export const LJ_FX_WIND = 239; // the wind starts to turn: owner 255, shot the coming level + LJ_WMAX, over the first board, size the coming wind, m/s^2
