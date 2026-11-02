// BOWLING (MG_BOWL, prefix bw): lanes side by side along +x over the sea,
// one for every BW_PER balls in, each a wooden lane with a gutter either side
// and a divider to the next; an approach at the near end where the balls
// start, behind the foul line; at the far end ten pins in a triangle on the
// deck, and past it the pit. Every ball is the bowling ball: rolled from
// behind the foul line and kept rolling down the lane, it knocks every pin
// its edge reaches and is never slowed by one. A knocked pin slides, topples
// and knocks the standing pins it meets, credited to whoever knocked the
// first. A point a pin; all ten of a rack to one ball, a strike, BW_STRIKE
// more; a golden pin in some racks; the last 15 s pay double. Once a lane's
// ten are down, or BW_WAIT after its first went, it is called: its deck drops
// BW_SWEEP later and a fresh ten stand BW_DOWN after that. Off the deck's end
// or down a gutter a ball drops into the pit and is back on its lane's
// approach. Most points wins.
// Literal numbers only: the sim reads them through layout.mjs's MG_CONSTS,
// the client imports this file itself.
export const BW_LEN = 11250; // 90 s
export const BW_DOUBLE = 1875; // the last 15 s pay double
// The lanes: one for every BW_PER balls in, BW_NLMIN to BW_NLMAX of them.
export const BW_PER = 6;
export const BW_NLMIN = 2;
export const BW_NLMAX = 43;
// Across (z): a lane's surface BW_LW wide; a gutter either side BW_GW across
// (a ball, 2 m, fits) and BW_GD under the surface, from the foul line on past
// the pins to the pit; a divider BW_DIV across between lanes (and at the
// stage's sides), BW_DIVH over the surface. A lane's pitch is all of it,
// BW_LW + 2 BW_GW + BW_DIV.
export const BW_LW = 6;
export const BW_GW = 2.2;
export const BW_GD = 0.45;
export const BW_DIV = 0.4;
export const BW_DIVH = 0.5;
export const BW_PITCH = 10.8;
// Along (x): the approach BW_APP deep, the foul line at its far edge; the
// head pin BW_LANE past it; the deck from BW_DECKF before the head pin to
// BW_DECKB past the back row, its far edge the pit's lip; the pit BW_PIT
// deep to its back wall.
export const BW_APP = 9;
export const BW_LANE = 40;
export const BW_DECKF = 2;
export const BW_DECKB = 1.6;
export const BW_PIT = 5;
// The pins: BW_PS apart, rows BW_ROW (BW_PS cos 30) apart; BW_PR in radius
// where they touch, BW_PH tall; a knocked pin topples flat over BW_TIP ticks.
export const BW_PS = 1.6;
export const BW_ROW = 1.3856406;
export const BW_PR = 0.35;
export const BW_PH = 1.5;
export const BW_TIP = 40; // 0.32 s
// A knock: a ball on a live roll (from behind the foul line, rolling on down
// the lane at BW_VLIVE m/s at least, on its surface) whose edge reaches a pin
// puts it out to touching and sends it off along the line between them at
// 1 + BW_E of the speed it closes at (BW_KMIN at least), with BW_CARRY of the
// ball's speed across that line, turned up to BW_SPREAD either way (1/16384
// turn), at most BW_PVMAX m/s; it falls the way it goes. The ball is never
// moved.
export const BW_VLIVE = 2;
export const BW_E = 0.5;
export const BW_KMIN = 2;
export const BW_CARRY = 0.3;
export const BW_SPREAD = 400; // 8.8 degrees
export const BW_PVMAX = 20;
// A knocked pin keeps BW_PROLL of its speed a tick, at rest under BW_PSTOP
// m/s; off the lane's surface it drops into a gutter, past the lip into the
// pit. Moving or toppling, its body (from its foot along its fall, BW_PH
// times the sine of its tilt) knocks any standing pin it meets: off along the
// line at the speed it closes at, BW_PKMIN at least; met at its foot it keeps
// BW_PKEEP of its own speed along that line.
export const BW_PROLL = 0.985;
export const BW_PSTOP = 0.3;
export const BW_PKMIN = 2.5;
export const BW_PKEEP = 0.4;
// A rack: called once its ten are down, or BW_WAIT after its first went;
// from the call nothing there scores; BW_SWEEP on (past anything the
// prediction reaches) the deck drops, what's on it into the pit; BW_DOWN
// after that a fresh ten stand. A strike (all ten of a rack to one ball's
// knocks) pays BW_STRIKE more; in one rack in BW_GOLDP one pin (never the
// head pin) is golden and pays BW_GOLD.
export const BW_WAIT = 375; // 3 s
export const BW_SWEEP = 256;
export const BW_DOWN = 125; // 1 s
export const BW_STRIKE = 5;
export const BW_GOLD = 3;
export const BW_GOLDP = 3;
export const BW_KGOLD = 0x6200000; // $p_seed(BW_KGOLD + (lane << 12 | racks stood before it)): which rack's pin is golden
// The balls: a slick lane (rolling drag BW_DRAG a tick with the keys held:
// 14.7 m/s flat out), no hop; a ball down in the pit waits BW_RESPAWN, and
// comes back BW_DROPY over its lane's approach. Off the dividers, the
// approach's back and the pit's back wall at BW_WE of its speed into them;
// in a gutter (its bottom BW_GIN under the surface) eased into the channel
// BW_SOFT m a tick, its speed across kept BW_GDAMP a tick; under the gutters'
// floor it falls BW_SINKV m/s at least.
export const BW_DRAG = 0.994;
export const BW_RESPAWN = 125; // 1 s
export const BW_DROPY = 2;
export const BW_WE = 0.3;
export const BW_GIN = 0.05;
export const BW_SOFT = 0.06;
export const BW_GDAMP = 0.9;
export const BW_SINKV = 24;
// Its header, byte offsets in PG_H (112 B, in the prediction's copy): the
// stage, which ground and push read on their own bank.
export const BW_NL = 0; // u32 lanes
export const BW_XA = 4; // f32 the approach's back edge, x
export const BW_XF = 8; // f32 the foul line
export const BW_XD = 12; // f32 the deck's front edge (what drops)
export const BW_XH = 16; // f32 the head pin
export const BW_XE = 20; // f32 the pit's lip
export const BW_XB = 24; // f32 the pit's back wall
export const BW_ZL = 28; // f32 the first divider's middle, z: lane l's middle is BW_PITCH (l + 1/2) on
// In PG_S: the lanes (BW_LSIZE B each), a record a slot, and the balls
// coming back from the pit this tick, their lanes in slot order, for spawn.
export const BW_LANES = 0;
export const BW_LSIZE = 32;
export const BW_L_CALL = 0; // u32 HDR_TICK it was called, 0 in play
export const BW_L_FIRST = 4; // u32 HDR_TICK its rack's first pin went, 0 none yet
export const BW_L_RACK = 8; // u32 HDR_TICK its rack stood (0 as laid out)
export const BW_L_RACKS = 12; // u16 racks stood
export const BW_L_STRIKES = 14; // u16 strikes
export const BW_L_N = 16; // u8 balls on it, counted every tick
export const BW_L_MOVE = 17; // u8 pins moving or toppling
export const BW_L_GOLD = 18; // u8 the golden pin, 255 none
export const BW_SLOTS = 0x600; // 256 x BW_SSIZE B
export const BW_SSIZE = 12;
export const BW_S_LANE = 0; // u8 the lane it is on, or was last
export const BW_S_LIVE = 1; // u8 1 on a live roll
export const BW_S_GUT = 2; // u8 1 in a gutter as of the last tick
export const BW_S_GUTTERS = 3; // u8 gutter balls (at most 255)
export const BW_S_PINS = 4; // u16 pins it knocked first
export const BW_S_STRIKES = 6; // u16 strikes
export const BW_S_ROLL = 8; // u8 pins it knocked first on its roll now, or its last (at most 255): 0 while armed
export const BW_S_RGUT = 9; // u8 1 if that roll went down a gutter
export const BW_QUEUE = 0x1200; // 256 u8: lanes
export const BW_QN = 0x1300; // u32 how many
export const BW_QI = 0x1304; // u32 how many spawn has taken
export const BW_QT = 0x1308; // u32 the HDR_TICK they're for
// In PG_BIG: ten pins a lane, BW_PSIZE B each, row by row from the head pin
// (low z first in a row).
export const BW_PINS = 0;
export const BW_PSIZE = 32;
export const BW_P_ST = 0; // u8 BW_NONE, BW_UP, BW_HIT or BW_DROP
export const BW_P_BY = 1; // u8 its knocker (its point, a strike's), 255 none
export const BW_P_CR = 2; // u8 whose its knocks are: its knocker, or the ball that shoved it last
export const BW_P_GOLD = 3; // u8 1 golden
export const BW_P_AT = 4; // u32 HDR_TICK it was knocked, or dropped
export const BW_P_X = 8; // f32 its foot, world x and z
export const BW_P_Z = 12;
export const BW_P_VX = 16; // f32 its velocity
export const BW_P_VZ = 20;
export const BW_P_UX = 24; // f32 the unit way it falls
export const BW_P_UZ = 28;
export const BW_NONE = 0;
export const BW_UP = 1; // standing
export const BW_HIT = 2; // knocked: toppling, sliding, lying
export const BW_DROP = 3; // dropped into a gutter or the pit, or through the deck
// A ball's PG_M: BW_M_GUTTER while it is in a gutter (push's, on either bank).
export const BW_M_GUTTER = 1;
// FX kinds, FX_MG + 4 * MG_BOWL + k.
export const BW_FX_KNOCK = 212; // a pin knocked: owner its knocker, shot lane << 4 | pin, at it, size the points (0 once the lane is called)
export const BW_FX_STRIKE = 213; // all ten to one ball: owner, shot the lane, over the head pin's spot, size the points
export const BW_FX_LANE = 214; // owner 255, shot lane | what << 8 (BW_W*), at the head pin's spot, size the lane's racks (a rack's)
export const BW_FX_GUTTER = 215; // a ball into a gutter (either bank): owner the ball, shot the lane, at it
export const BW_WCALL = 1; // the lane called: the bar comes down
export const BW_WSWEEP = 2; // its deck drops
export const BW_WRACK = 3; // a fresh ten stand
export const BW_WDOUBLE = 4; // the last 15 s (lane 255)
