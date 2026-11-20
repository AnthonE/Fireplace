// WHACK A MOLE (MG_MOLE, prefix wm): a square lawn over the sea, sized for
// the crowd and fenced round, with a grid of mole holes. Moles pop up on a
// schedule drawn with the round: the hole's dirt heaves WM_TELE ahead, the
// mole rises, stays up, ducks. Come down on one from a hop to whack it for a
// point (PG_SCORE); a gold one pays 3; from WM_SPIKE some are spiked, and
// touching one flings you off it, coming down on one costs 2. The last 15 s
// are a frenzy: more moles, double points. Bumps on; most points at the time
// wins.
// Literal numbers only: the sim reads them through consts.mjs's MG_CONSTS,
// the client imports this file itself.
export const WM_LEN = 10000; // 80 s
export const WM_FRENZY = 8125; // ticks into play the frenzy starts: the last 15 s
export const WM_SPIKE = 3750; // ticks into play from which a mole may rise spiked: 30 s
export const WM_IDLE = 0.98; // rolling drag a tick with no keys: from 10 m/s to a stop in about 4 m
// The lawn: a square of holes WM_G a side, WM_G the nearest whole number to
// the root of (balls in) / WM_PER, from WM_GMIN to WM_GMAX; WM_PITCH m apart,
// the fence's inside WM_EDGE out past the outer ones.
export const WM_PER = 1.5; // balls a hole
export const WM_GMIN = 3;
export const WM_GMAX = 14;
export const WM_PITCH = 8;
export const WM_EDGE = 4.5;
export const WM_SPAWN = 0.85; // balls start on a spiral over this much of the half-width
export const WM_CLEAR = 2; // m from a hole's axis a ball starts at least
// The fence: a ball whose bottom is under WM_FENCEH is held inside it,
// bouncing back with WM_FENCEE of its speed into it.
export const WM_FENCEH = 1.2;
export const WM_FENCEE = 0.5;
// A mole: a post WM_MR in radius, its head's top WM_TOP over the lawn when up
// (a hop's bottom tops out 0.9 m up), on which a ball whose centre is within
// WM_HEADR of its axis stands, if its bottom was no more than P_STEP - WM_SNAP
// (0.01 m) under the head a tick before: a ball comes down onto a head, it
// can't climb on, and a rising head doesn't lift it. Off its head a ball meets
// the post, bouncing back with WM_POSTE of its speed into it.
export const WM_MR = 0.45;
export const WM_TOP = 0.55;
export const WM_HEADR = 0.7;
export const WM_SNAP = 0.29;
export const WM_POSTE = 0.3;
// A pop: the dirt heaves WM_TELE before the mole rises over WM_RISE, it stays
// up WM_UP0 at the round's start to WM_UP1 at its end (give or take WM_UPJ),
// ducks over WM_DUCK, and its hole lies still WM_REST before the next heave.
export const WM_TELE = 75; // 0.6 s
export const WM_RISE = 19; // 0.15 s
export const WM_DUCK = 19;
export const WM_UP0 = 150; // 1.2 s
export const WM_UP1 = 88; // 0.7 s
export const WM_UPJ = 12;
export const WM_REST = 50; // 0.4 s
export const WM_FIRST = 125; // ticks into play the first heaves start: 1 s
// How often: each hole heaves WM_RATE0 times a second as play starts, rising
// to WM_RATE1 as the frenzy starts, WM_RATEF in it (about a sixth of the holes
// up at once to a third); a pop's hole drawn at random from those lying still.
export const WM_RATE0 = 0.11;
export const WM_RATE1 = 0.24;
export const WM_RATEF = 0.34;
// What rises: one in WM_GOLD gold, worth WM_GOLDV; of the rest from WM_SPIKE
// one in WM_SPIKEK spiked. A ball that touches a spiked mole is flung off it
// at WM_FLING m/s out from its axis and up at WM_FLINGUP; one that came down
// on its head also loses WM_SPIKEV points. The frenzy pays double.
export const WM_GOLD = 8;
export const WM_GOLDV = 3;
export const WM_SPIKEK = 6;
export const WM_SPIKEV = 2;
export const WM_FLING = 12;
export const WM_FLINGUP = 5;
export const WM_KMOLE = 0;
export const WM_KGOLD = 1;
export const WM_KSPIKE = 2;
// Its header, byte offsets in PG_H (112 B, in the prediction's copy).
export const WM_HALF = 0; // f32 the lawn's half-width to the fence's inside
export const WM_G = 4; // u32 holes a side
export const WM_NH = 8; // u32 holes
export const WM_X0 = 12; // f32 the first hole's x and z (row 0, column 0)
export const WM_NPOP = 16; // u32 pops in the schedule
export const WM_WHACKS = 20; // u32 moles whacked so far (the confirmed world's)
// In PG_S: u8 a hole, its pops. In PG_BIG: hole i's pops, WM_PMAX of
// WM_PSIZE B from (i * WM_PMAX) * WM_PSIZE, in the order they rise: u16 the
// tick into play it starts rising | u8 its ticks up | u8 WM_K* | then the
// confirmed world's: u8 the slot that whacked it | u8 1 once whacked | u16
// the tick into play it was.
export const WM_COUNT = 0;
export const WM_POPS = 0;
export const WM_PMAX = 48;
export const WM_PSIZE = 8;
export const WM_P_T0 = 0;
export const WM_P_UP = 2;
export const WM_P_KIND = 3;
export const WM_P_BY = 4;
export const WM_P_HIT = 5;
export const WM_P_WT = 6;
// A ball's PG_M, its push's mark (either bank): HDR_TICK << 10 | what << 8 |
// the hole + 1, what WM_ON standing on a head, WM_SIDE flung off a spiked
// one's side, WM_SPIKED come down on a spiked one's head. The confirmed tick
// pays (or fines) a mark of its own tick.
export const WM_ON = 1;
export const WM_SIDE = 2;
export const WM_SPIKED = 3;
// Its FX kinds are FX_MG + 4 * MG_MOLE + k, k 0 to 3: 200 to 203.
export const WM_FX_POP = 200; // a mole rises: owner 255, shot the hole, at its head, size its kind
export const WM_FX_WHACK = 201; // a whack: owner the ball, shot the hole, at the head, size the points (-WM_SPIKEV come down on spikes)
export const WM_FX_SPIKE = 202; // a spiked mole flings a ball (its bank's ring): owner the ball, shot the hole (+ 0x100 from its head), size the speed out
export const WM_FX_CALL = 203; // the stage: shot 0 spiked moles from now, 1 the frenzy; owner 255, at the centre
