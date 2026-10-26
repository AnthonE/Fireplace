// SEESAWS (MG_SEESAW, prefix ss): rows of long planks over the sea, each on
// a pivot at its middle, tipping under the weight of the balls on it. A plank
// answers its load SS_LAG ticks (2.05 s) late: the confirmed world sums the
// load on each plank every tick and integrates the plank's slope that far
// ahead into a ring, so every slope the prediction can reach is already
// written, and the client draws the one coming. Heavy and damped, the slope
// stops at SS_GMAX and levels slowly when the plank is empty; the slope pulls
// a ball down it, and off its low end into the sea. From SS_CUT0 the planks
// are cut shorter or narrower one by one, and from SS_DROP0 they drop away
// for good, flashing first, so the crowd crams onto fewer. The last ball on
// wins. Literal numbers only: the sim reads them through layout.mjs's
// MG_CONSTS, the client imports this file itself.
export const SS_LEN = 12500; // 100 s
// The field: a plank for every SS_PER balls and one more (SS_KMIN to
// SS_KMAX), in rows about SS_ASPECT times as many planks across as along,
// the grid filled. A plank lies along z, SS_PL either side of its pivot in
// plan and SS_PW across; neighbours across are SS_SX centre to centre (a gap
// of 2 m, a hop), along SS_SZ (3 m between the ends).
export const SS_PER = 4;
export const SS_KMIN = 2;
export const SS_KMAX = 48;
export const SS_ASPECT = 3;
export const SS_PL = 9;
export const SS_PW = 3;
export const SS_SX = 8;
export const SS_SZ = 21;
// The spawns: dealt round the planks, on each in pairs either side of the
// pivot, SS_SPU apart along it, a pair SS_SPX to one side of the middle and
// the next to the other (an odd one out on the pivot), so every plank starts
// balanced.
export const SS_SPU = 2.2;
export const SS_SPX = 1.2;
// The tilt: g, the plank's slope (its top falls g a metre toward +z), and w,
// g's change a tick. Each tick, from the load L (the metres along it from
// the pivot of every ball standing on it, times its weight, summed):
// w = w * SS_DAMP + SS_TQ * L - SS_LVL * g, at most SS_WMAX either way, and
// g += w, held at the stop SS_GMAX (32 degrees). Overdamped: a load settles
// the slope at SS_TQ / SS_LVL of it (one ball 3.5 m out tips a plank to the
// stop), with a time constant of 2 s, and a plank swings stop to stop in no
// less than 3.3 s. The slope written is for SS_LAG ticks on, into a ring
// SS_RING ticks long.
export const SS_LAG = 256; // 2.05 s
export const SS_RING = 512;
export const SS_GMAX = 0.625;
export const SS_DAMP = 0.95;
export const SS_TQ = 0.000036;
export const SS_LVL = 0.0002;
export const SS_WMAX = 0.003;
// A slope this steep (23 degrees) coming is a hard tip: it creaks as the
// confirmed world writes it, SS_LAG ahead; under SS_GSOFT it may creak again.
export const SS_GHARD = 0.42;
export const SS_GSOFT = 0.3;
// A ball on a plank: the slope pulls it SS_PULL m/s^2 a unit of slope (10.4
// at the stop, against a push of 11: a ball low on a plank at the stop
// barely holds); a ball within SS_SNAP over the top, leaving it no faster
// than SS_SNAPV, is put back on it; one within SS_GRIP under it is lifted
// onto it (it rose past the ball).
export const SS_PULL = 16.6;
export const SS_SNAP = 0.5;
export const SS_SNAPV = 1.5;
export const SS_GRIP = 0.8;
// The cuts: from SS_CUT0 a plank every SS_CUTSPAN / planks (at least
// SS_CUTMIN), drawn from the PRNG among those not cut or dropping, is cut
// SS_CUTWARN later: shorter (SS_CUTL of its length) or narrower (SS_CUTW of
// its width), as the PRNG says.
export const SS_CUT0 = 3750; // 30 s
export const SS_CUTSPAN = 3750;
export const SS_CUTMIN = 125;
export const SS_CUTWARN = 312; // 2.5 s
export const SS_CUTL = 0.6;
export const SS_CUTW = 0.6;
export const SS_K_SHORT = 1;
export const SS_K_NARROW = 2;
// The drops: from SS_DROP0 a plank every SS_DROPSPAN / (planks - kept) (at
// least SS_DROPMIN), drawn from the PRNG among those standing, drops away
// for good SS_DROPWARN later, flashing; one plank in SS_KEEPK (at least one)
// is kept to the end.
export const SS_DROP0 = 7500; // 60 s
export const SS_DROPSPAN = 3750;
export const SS_DROPMIN = 188;
export const SS_DROPWARN = 375; // 3 s
export const SS_KEEPK = 8;
// Balls in that all started going out within SS_TIE ticks of each other
// share the win (a plank dumped them together).
export const SS_TIE = 12;
// Its header, byte offsets in PG_H (fixed at setup).
export const SS_K = 0; // u32 planks
export const SS_COLS = 4; // u32 planks across (x)
export const SS_ROWS = 8; // u32 rows along (z)
export const SS_X0 = 12; // f32 the first column's middle, x
export const SS_Z0 = 16; // f32 the first row's pivots, z
export const SS_KEEP = 20; // u32 planks kept to the end
export const SS_CUTI = 24; // u32 ticks between cuts
export const SS_DROPI = 28; // u32 ticks between drops
// In PG_S: plank k's record, SS_PSIZE bytes from SS_PLANKS + k * SS_PSIZE:
// u32 the tick into play it's cut (0 never) and the tick it drops (0 never),
// both written that tick less SS_CUTWARN or SS_DROPWARN; f32 its slope and
// its change a tick SS_LAG ticks on (the head of the ring); f32 the load on
// it this tick; u8 its cut (SS_K_*); u8 1 while the head is a hard tip; u16
// the balls standing on it this tick (the client's).
export const SS_PLANKS = 0;
export const SS_PSIZE = 32;
export const SS_P_CUT = 0;
export const SS_P_DROP = 4;
export const SS_P_G = 8;
export const SS_P_W = 12;
export const SS_P_LOAD = 16;
export const SS_P_KIND = 20;
export const SS_P_HARD = 21;
export const SS_P_N = 22;
// Then u16 per slot, the tick into play it started going out, plus 1 (over's);
// u32 the cuts and the drops made so far.
export const SS_FELL = 1536;
export const SS_NCUT = 2048;
export const SS_NDROP = 2052;
// In PG_BIG: f32 [SS_KMAX][SS_RING] each plank's slope by tick into play,
// mod SS_RING (96 KiB).
export const SS_SLOPES = 0;
// FX kinds, FX_MG + 4 * MG_SEESAW + k: 148 to 151.
export const SS_FX_CREAK = 148; // a hard tip is coming, SS_LAG on: shot the plank, at its pivot, size the slope
export const SS_FX_WARN = 149; // a cut or a drop is coming: shot the plank | its kind << 8 (SS_K_*, 3 a drop), at its pivot, size the ticks
export const SS_FX_GO = 150; // it happens: the same, size 0
export const SS_FX_SPLASH = 151; // a ball goes out: owner the ball, at the sea under it
export const SS_K_DROP = 3;
