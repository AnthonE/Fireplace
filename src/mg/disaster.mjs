// DISASTER ISLAND (MG_DISASTER, prefix nd): a round island of grass over the
// sea, sized for the crowd, a terraced hill or two on it, stone houses (each
// with a crate to climb onto its roof) and rocks; and disasters, one after
// another, each the seed's pick (never one of the last two), called on the
// HUD ND_WARN before it hits and lasting ND_DUR0 to ND_DUR0 + ND_DURK: a
// flood that rises, drags outward and drowns, a meteor shower onto marked
// rings, a tornado wandering a seeded path, an earthquake's shoves and
// fissures, a tsunami's waves from one side (the lee of a house is shelter),
// and lightning onto marked spots, roofs first and some at the balls. Later
// ones are harder and the calm between them shorter; in the calm the rim
// crumbles in. Bumps on; the last ball on wins, and the balls one disaster
// takes off together share it.
// Literal numbers only: the sim reads them through layout.mjs's MG_CONSTS,
// the client imports this file itself.
export const ND_R0 = 16; // the island: ND_R0 m plus ND_RK times the root of the balls in, at most ND_RMAX
export const ND_RK = 2.5;
export const ND_RMAX = 56;
export const ND_RMIN0 = 7; // the rim crumbles in to ND_RMIN0 plus ND_RMINK of the island's radius
export const ND_RMINK = 0.18;
export const ND_IDLE = 0.98; // rolling drag a tick with no keys
export const ND_HOP = 9; // hop speed, m/s: 2 m up, 0.9 s in the air
export const ND_SPAWN = 0.68; // balls start on a spiral this much of the island across, spaced for the crowd
export const ND_CLEAR = 1.6; // m a spawn keeps from a house or rock
// The ground, in PG_BIG: ND_S m square cells, (q, r) from -ND_N to ND_N - 1
// each way round the stage's centre, cell (r + ND_N) * ND_W + (q + ND_N): a
// u16 the tick into play the rim takes it (0 none, ND_NEVER never), and a u8
// its height in ND_STEP steps over PLAT_Y. A hill is ND_HK steps high, its top
// ND_HTOP of the island's radius across, a step down every ND_HS m (so cells
// side by side differ by one step at most, which a ball rolls up), and none
// within ND_HS of the rim.
export const ND_S = 2.5;
export const ND_N = 24;
export const ND_W = 48; // 2 ND_N
export const ND_DROP = 0; // byte offset in PG_BIG: u16 a cell
export const ND_HGT = 4608; // u8 a cell
export const ND_NEVER = 0xffff;
export const ND_STEP = 0.25;
export const ND_HK = 4;
export const ND_HS = 3.6;
export const ND_HTOP = 0.08;
export const ND_HAIM = 0.4; // a hill's top up to this much of the radius off the centre
// The houses and rocks, in PG_BIG at ND_OBS, ND_OBSZ B each: f32 x, z, half
// extents x, z (a rock: its radius, 0), its top (y), u32 the tick the rim
// takes it (its centre's cell's), its kind. A house is ND_HX0 to ND_HX0 +
// ND_HXK half a side, its roof ND_HT0 to ND_HT0 + ND_HTK over its ground, a
// crate ND_CH high against one wall to hop up from; a rock ND_RR0 to ND_RR0 +
// ND_RRK round, ND_RT0 to ND_RT0 + ND_RTK high. 1 + radius / ND_PERH houses,
// 1 + radius / ND_PERR rocks, ND_GAP m apart at least, inside ND_OAIM of the
// radius; a ball meeting a side is put out of it, ND_BOUNCE of its speed into
// it given back.
export const ND_OBS = 8192;
export const ND_OBSZ = 32;
export const ND_NOBMAX = 24;
export const ND_HOUSE = 0;
export const ND_CRATE = 1;
export const ND_ROCK = 2;
export const ND_HX0 = 2;
export const ND_HXK = 1.2;
export const ND_HT0 = 2.4;
export const ND_HTK = 0.4;
export const ND_CH = 1.3;
export const ND_CX = 1.1; // a crate's half side
export const ND_RR0 = 1.2;
export const ND_RRK = 0.8;
export const ND_RT0 = 1;
export const ND_RTK = 0.4;
export const ND_PERH = 13;
export const ND_PERR = 9;
export const ND_GAP = 3;
export const ND_OAIM = 0.78;
export const ND_BOUNCE = 0.3;
// The disasters, in PG_BIG at ND_DIS, ND_DSZ B each: u32 kind, the tick into
// play it's called, hits and is over, its level (how many came before) | f32
// the island's radius as it hits | its own, from +24 (below). The first hits
// ND_FIRST in; each lasts ND_DUR0 plus up to ND_DURK; the calm after the j-th
// is ND_CALM0 less ND_CALMK a disaster, down to ND_CALM1; none starts past
// ND_LAST, and the round is over ND_TAIL after the last one ends.
export const ND_DIS = 9216;
export const ND_DSZ = 128;
export const ND_NDMAX = 12;
export const ND_FLOOD = 0;
export const ND_METEOR = 1;
export const ND_TORNADO = 2;
export const ND_QUAKE = 3;
export const ND_TSUNAMI = 4;
export const ND_LIGHTNING = 5;
export const ND_KINDS = 6;
export const ND_WARN = 375; // 3 s
export const ND_FIRST = 625; // 5 s
export const ND_DUR0 = 1500; // 12 s
export const ND_DURK = 1000; // 8 s more at most
export const ND_CALM0 = 875; // 7 s
export const ND_CALMK = 125;
export const ND_CALM1 = 400; // more than ND_WARN: the next is called once the last is over
export const ND_LAST = 13375; // 107 s: a disaster starting later would be cut short of 12 s
export const ND_TAIL = 125;
export const ND_LMAX = 15000; // 120 s
export const ND_LVMAX = 5; // levels past this are as hard as it
// A flood (+24 f32 its depth over PLAT_Y): the water rises from under the
// rim over ND_FRISE, holds, and drains over ND_FRISE to the end; ND_FD0 deep
// plus ND_FDK a level. Over a ball's bottom the water slows it (ND_FDRAG a
// tick), and past ND_FCUR its current drags it outward at ND_FA0 plus ND_FAK
// a level (m/s^2, by how much deeper, full a metre on); over ND_FSUB past its
// bottom it's under, and ND_BREATH ticks under, it drowns (getting its breath
// back two a tick).
export const ND_FRISE = 375;
export const ND_FD0 = 1.6;
export const ND_FDK = 0.2;
export const ND_FA0 = 3;
export const ND_FAK = 0.6;
export const ND_FDRAG = 0.994;
export const ND_FCUR = 0.5;
export const ND_FSUB = 1.5;
export const ND_BREATH = 500; // 4 s
// The strikes, meteors and lightning, in PG_BIG at ND_EVS, ND_ESZ B each, in
// the order they land: u32 the tick into play | f32 x, z, the top there (y),
// the reach | u32 ND_EV_* | u32 its disaster | u32 the house or rock it hits
// plus 1 (0 the ground). A disaster's are +24 u32 the first, +28 past the
// last. Per ND_BUCKET ticks, u16 the first landing in the bucket (ND_LO) and
// past the last (ND_HI).
export const ND_EVS = 16384;
export const ND_ESZ = 32;
export const ND_NEMAX = 8192;
export const ND_LO = 11264;
export const ND_HI = 11776;
export const ND_BUCKET = 64;
export const ND_NB = 256;
export const ND_EV_METEOR = 1;
export const ND_EV_BOLT = 2;
export const ND_EV_ROOF = 4;
export const ND_EV_AIM = 8; // a bolt aimed at the balls (its spot fixed ND_LAHEAD before it lands)
// A meteor's ring shows ND_MWARN ahead; it lands one every ND_MPER m^2 of
// island a second (ND_MMIN at least), ND_MUP more a level; reach ND_MR0 to
// ND_MR0 + ND_MRK: a ball under it (its bottom under the spot's top plus the
// reach) goes off it at ND_MKICK, less ND_MFALL of it by the edge, and up at
// ND_MUPV.
export const ND_MWARN = 175; // 1.4 s
export const ND_MPER = 1400;
export const ND_MMIN = 1.2;
export const ND_MUP = 0.5;
export const ND_MR0 = 3.2;
export const ND_MRK = 1.3;
export const ND_MKICK = 14;
export const ND_MFALL = 0.5;
export const ND_MUPV = 6;
// A bolt's spot flickers ND_LWARN ahead; one every ND_LPER m^2 a second
// (ND_LMIN at least) and ND_LAIMR more for each ball in at the start, ND_LUP
// more a level. As many as the balls bring are aimed at a ball in and the
// crowd round it (the balls within ND_LCROWD of it, where they'd be ND_LLEAD
// s on, give or take ND_LSCAT), fixed ND_LAHEAD before they land: PRED_MAX,
// as far as the prediction runs. Of the rest, ND_LROOF on a roof or a rock
// while any stand, ND_LHILL on a hilltop (up to its top and a step down).
// Reach ND_LR: a ball there (its bottom from ND_LBELOW under the top to
// ND_LOVER over it) is thrown off at ND_LKICK, less ND_LFALL of it by the
// edge, and up at ND_LUPV.
export const ND_LWARN = 106; // 0.85 s
export const ND_LPER = 500;
export const ND_LMIN = 2.5;
export const ND_LUP = 0.5;
export const ND_LAIMR = 0.04;
export const ND_LAHEAD = 256; // 2.05 s
export const ND_LCROWD = 5;
export const ND_LLEAD = 0.4;
export const ND_LSCAT = 1;
export const ND_LROOF = 0.35;
export const ND_LHILL = 0.25;
export const ND_LR = 3.4;
export const ND_LBELOW = 0.5;
export const ND_LOVER = 4;
export const ND_LKICK = 11;
export const ND_LFALL = 0.5;
export const ND_LUPV = 8;
// A tornado (+24 f32 its path's centre x, z, its two arms, +40 i32 the first
// arm's angle and turn, the second's (1/16384 turn, the turn a tick in
// sixteenths), +56 f32 its pull's reach, its pull): its funnel at the path's
// centre plus the arms, each round at its own rate. It touches down and lifts
// over ND_TRAMP. Within the reach a ball is pulled in at the pull (less by
// the edge) and swung round at ND_TSWIRL of it; in its core (ND_TCORE) held
// (ND_TGRIP of its speed kept a tick), lifted at ND_TLIFT, and once ND_TFLY
// up flung out at ND_TFLING, round at ND_TROUND, up at ND_TUPV.
export const ND_TRAMP = 125;
export const ND_TAIM = 0.25; // the path's centre up to this much of the radius off the island's
export const ND_TA1 = 0.34; // the first arm, of the radius, plus up to ND_TA1K
export const ND_TA1K = 0.1;
export const ND_TA2 = 0.12;
export const ND_TA2K = 0.08;
export const ND_TW1 = 24; // sixteenths of 1/16384 turn a tick, plus up to ND_TW1K, plus ND_TWUP a level
export const ND_TW1K = 24;
export const ND_TW2 = 80;
export const ND_TW2K = 80;
export const ND_TWUP = 0.12;
export const ND_TR0 = 7; // the pull's reach: ND_TR0 plus ND_TRR of the radius plus ND_TRUP a level
export const ND_TRR = 0.1;
export const ND_TRUP = 0.5;
export const ND_TP0 = 9; // the pull, m/s^2, plus ND_TPUP a level
export const ND_TPUP = 1.5;
export const ND_TSWIRL = 0.8;
export const ND_TCORE = 2;
export const ND_TGRIP = 0.94;
export const ND_TLIFT = 36;
export const ND_TFLY = 4;
export const ND_TFLING = 12;
export const ND_TROUND = 5;
export const ND_TUPV = 4;
// An earthquake (+24 u32 the ticks between shoves, +28 f32 a shove, +32 u32
// fissures, +36 f32 a fissure's half width, +40 the fissures, ND_FSZ B each:
// f32 a point on it x, z, its line x, z, half its length, u32 the tick into
// play it opens): from ND_Q0 in, a shove every ND_QP0 less ND_QPK a level
// ticks, ND_QLEN long, the way $p_seed says: a ball on the ground pushed at
// ND_QA0 plus ND_QAK a level (m/s^2) and jolted up at ND_QJOLT. Fissures,
// ND_NF0 plus one from level ND_NFLV, open from ND_QFIRST in, ND_QSTAG
// apart, each glowing ND_QWARN before; ND_QOPEN to open to ND_QW0 plus ND_QWK
// a level wide, and they close with the quake. A point on one up to
// ND_QAIM of the radius out, ND_QL0 to ND_QL0 + ND_QLK of it long.
export const ND_Q0 = 60;
export const ND_QP0 = 125;
export const ND_QPK = 8;
export const ND_QLEN = 25;
export const ND_QA0 = 8;
export const ND_QAK = 2;
export const ND_QJOLT = 1.5;
export const ND_NF0 = 2;
export const ND_NFLV = 3;
export const ND_NFMAX = 3;
export const ND_FSZ = 24;
export const ND_QFIRST = 250;
export const ND_QSTAG = 375;
export const ND_QWARN = 190; // 1.5 s
export const ND_QOPEN = 75;
export const ND_QW0 = 0.9;
export const ND_QWK = 0.1;
export const ND_QAIM = 0.5;
export const ND_QL0 = 0.9;
export const ND_QLK = 0.8;
// A tsunami (+24 f32 its way x, z, its speed, its height over PLAT_Y, +40 u32
// its waves, the ticks between them, +48 f32 where along its way a wave's
// front starts, +52 f32 where it's gone): ND_NW0 waves plus one every
// ND_NWLV levels (ND_NWMAX at most) across the island, each ND_WD deep,
// ND_WC0 plus ND_WCK a level fast, ND_WH0 plus ND_WHK a level high, from
// ND_WOFF past the rim. A ball the water's in (its bottom under the top less
// ND_WFREE) is carried its way at ND_WA up to ND_WU of the wave's speed,
// unless it's in the lee of a house or rock: behind it, ND_WLEE deep, inside
// its width less ND_WIN.
export const ND_NW0 = 2;
export const ND_NWLV = 2;
export const ND_NWMAX = 4;
export const ND_WD = 4;
export const ND_WC0 = 11;
export const ND_WCK = 0.5;
export const ND_WH0 = 2;
export const ND_WHK = 0.25;
export const ND_WOFF = 3;
export const ND_WFREE = 0.8;
export const ND_WA = 40;
export const ND_WU = 0.6;
export const ND_WLEE = 6;
export const ND_WIN = 0.3;
// The erosion: each cell past the rim's last line goes in the calms, in from
// the rim, its share of all the calm (its way in over the rim's way to the
// last line, of ND_EK of it) plus up to ND_EJ of it at random, so the rim
// goes ragged; a house or rock goes with its centre's cell.
export const ND_EK = 0.92;
export const ND_EJ = 0.08;
// The spawns, in PG_BIG at ND_SPN: f32 x, z a ball, in slot order of the balls in.
export const ND_SPN = 12288;
// A ball's PG_M: its ticks under water (the low 12 bits), the last thing
// that hit it (ND_HIT_*, the next 4) and the tick into play it did (the top 16).
export const ND_HIT_METEOR = 1;
export const ND_HIT_BOLT = 2;
export const ND_HIT_TORNADO = 3;
export const ND_HIT_WAVE = 4;
export const ND_HIT_DROWN = 5;
export const ND_FELL = 0; // in PG_S: u16 per slot, the tick into play it started going out, plus 1 (over's)
// Its header, byte offsets in PG_H (112 B, in the prediction's copy).
export const ND_RAD = 0; // f32 the island's radius at the start
export const ND_RMIN = 4; // f32 the rim's last line
export const ND_NOB = 8; // u32 houses, crates and rocks
export const ND_ND = 12; // u32 disasters
export const ND_NE = 16; // u32 strikes
export const ND_COUNT = 20; // u32 cells at the start
// FX kinds, FX_MG + 4 * MG_DISASTER + k.
export const ND_FX_CALL = 156; // a disaster called (shot its kind), hitting (+ 0x100) or over (+ 0x200); size its number
export const ND_FX_STRIKE = 157; // a meteor or bolt lands: shot its record, size its reach, at the spot
export const ND_FX_HIT = 158; // a ball hit: owner the ball, shot ND_HIT_*, size how hard (m/s); on the ball's bank
export const ND_FX_QUAKE = 159; // a shove (shot its number, size its push) or a fissure opening (shot 0x100 + it)
