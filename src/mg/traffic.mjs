// RUSH HOUR (MG_TRAFFIC, prefix rh): a street to cross again and again, from
// one pavement to the other and back, through lanes of traffic that knock a
// ball down the lane and send it back to the pavement it last scored from.
// Literal numbers only: the sim reads them through consts.mjs's MG_CONSTS,
// the client imports this file itself.
export const RH_LEN = 11250; // 90 s
export const RH_DOUBLE = 9375; // from here every point is two
export const RH_IDLE = 0.94; // rolling drag a tick with no keys: let go and a ball stops in a metre or so
// The street runs along z, RH_W0 m long plus RH_WK times the root of the
// balls in; the balls cross it along x. A pavement RH_PAVE deep either side,
// the crowd on the near one in rows RH_SP apart from RH_GRID0 behind its
// kerb, RH_EDGE in from the ends.
export const RH_W0 = 36;
export const RH_WK = 7;
export const RH_PAVE = 10;
export const RH_SP = 2.2;
export const RH_GRID0 = 2.2;
export const RH_EDGE = 3;
export const RH_BOUNCE = 0.3; // what a wall gives back
// The road is RH_NS strips side by side, each a kind (RH_T*), RH_TW cm wide:
// two lanes, a median or a belt, three strips of which up to two are a bike
// lane and a tram line, a median or a belt, two lanes. The seed picks.
export const RH_NS = 9;
export const RH_TLANE = 1; // cars, vans and lorries
export const RH_TBIKE = 2; // motorbikes, fast and few
export const RH_TTRAM = 3; // a tram every RH_PTRAM m
export const RH_TMEDIAN = 4; // safe
export const RH_TBELT = 5; // a moving walkway: no traffic, but it carries you along at RH_BELT
export const RH_TW = [0, 400, 260, 440, 320, 360];
export const RH_MID3 = [2, 3, 1, 1, 2, 3]; // the fourth strip and the sixth, by the seed's draw of six
export const RH_MID5 = [1, 1, 2, 3, 3, 2];
export const RH_BELT = 4; // m/s
export const RH_BELT_DT = 0.032;
// A lane's traffic is cells RH_P* m long, one vehicle or none in each, all
// moving as one at the lane's speed (RH_V* m/s as play starts, RH_QK times
// that more by the end: the distance run is v DT (t + RH_QA t^2 / 2)). Cell
// i's front edge has run RH_C0 cells less than i lengths past the lane's
// start, so the first RH_C0 are on the street at GO. A vehicle starts
// 0 to the cell's slack behind the front edge, RH_GAP m at least left behind it.
export const RH_QK = 0.4;
export const RH_QA = 0.4 / 11250;
export const RH_C0 = 16;
export const RH_NCELL = 160;
export const RH_VLANE0 = 6; // a lane: 6 to 10 m/s, cells 13 to 18 m
export const RH_VLANEK = 4;
export const RH_PLANE0 = 13;
export const RH_PLANEK = 5;
export const RH_PLORRY = 15.5; // lorries only in lanes with cells this long
export const RH_VBIKE0 = 15; // 15 to 18 m/s
export const RH_VBIKEK = 3;
export const RH_PBIKE = 15;
export const RH_VTRAM = 12;
export const RH_PTRAM = 72;
export const RH_GAP = 5;
// How full a lane's cells are, in 256ths, at GO and by the end.
export const RH_D0 = [0, 150, 90, 256];
export const RH_D1 = [0, 240, 170, 256];
// The vehicles (RH_K*): length, half width (cm), how hard one throws a ball
// up (cm/s). Of a lane's, RH_CARS in 256 are cars, to RH_VANS vans, the rest lorries.
export const RH_KCAR = 1;
export const RH_KVAN = 2;
export const RH_KLORRY = 3;
export const RH_KBIKE = 4;
export const RH_KTRAM = 5;
export const RH_KLEN = [0, 440, 600, 1050, 220, 2200];
export const RH_KHW = [0, 100, 115, 130, 45, 135];
export const RH_KUP = [0, 900, 1000, 1200, 800, 1300];
export const RH_CARS = 140;
export const RH_VANS = 205;
export const RH_VHWMAX = 1.35;
// A hit: knocked on down the lane RH_KICK faster than the vehicle and up,
// RH_KEEP of its way across kept; RH_DOWN ticks later it is back RH_BACK
// behind the kerb of the pavement it last scored from, RH_DROP up.
export const RH_KICK = 5;
export const RH_KEEP = 0.3;
export const RH_DOWN = 140;
export const RH_BACK = 3;
export const RH_DROP = 2.5;
export const RH_IN = 1; // m past the far kerb, on the ground, is a crossing
// The zebra: a band across the road, RH_ZH0 m plus RH_ZHK times the root of
// the balls in to each side of its middle. Every RH_LT ticks, from RH_LA,
// its lights hold the traffic back for RH_LW: no vehicle is within RH_ZM of
// it then. Amber RH_LWARN before; the green flashes its last RH_LEND.
export const RH_ZH0 = 3;
export const RH_ZHK = 0.4;
export const RH_ZM = 1.5;
export const RH_ZOFF = 0.4; // its middle within this share of the street's length of the street's
export const RH_LT = 2000;
export const RH_LA = 375;
export const RH_LW = 550;
export const RH_LWARN = 190;
export const RH_LEND = 190;
export const RH_LM = 4; // ticks either side of it kept clear besides
// Coins: every RH_CEVERY ticks one and one more for every RH_CPER balls in,
// on a lane, lying RH_CLIFE; RH_NCOIN at once at most; worth RH_COIN to the
// first ball by slot within RH_CR of it.
export const RH_COIN = 3;
export const RH_CEVERY = 500;
export const RH_CPER = 16;
export const RH_CLIFE = 1500;
export const RH_NCOIN = 48;
export const RH_CR = 1.7;
// The seed's draws ($p_seed's k).
export const RH_SEEDLAY = 0x52480000;
export const RH_SEEDSTRIP = 0x52480100; // + the strip
export const RH_SEEDCELL = 0x52480200;
// Its header, byte offsets in PG_H (112 B, in the prediction's copy).
export const RH_HW = 0; // f32 half the street's length
export const RH_XA = 4; // f32 the near kerb
export const RH_XB = 8; // f32 the far kerb
export const RH_ZC = 12; // f32 the zebra's middle, z
export const RH_ZH = 16; // f32 half its width
export const RH_COLS = 20; // u32 balls a row on the near pavement
// In PG_S: the strips, RH_SREC bytes each, then the coins, 16 bytes each.
export const RH_SREC = 32;
export const RH_SX0 = 0; // f32 its near edge
export const RH_SX1 = 4; // f32 its far edge
export const RH_STYPE = 8; // u8 RH_T*
export const RH_SDIR = 9; // u8 0 toward +z, 1 toward -z
export const RH_SV = 12; // f32 its speed as play starts
export const RH_SPITCH = 16; // f32 its cells' length
export const RH_COINS = 512; // f32 x, f32 z, u32 the tick into play it dropped + 1 (0: none)
// In PG_BIG: strip k's cells from RH_NCELL * 2 * k, two bytes each: the
// vehicle's kind (RH_K*, 0 none) with its colour in the top four bits, and
// how far behind the cell's front edge it starts, in eighths of a metre.
export const RH_CELLS = 0;
// A ball's PG_M: bit 0 the pavement it last scored from (1 the far one),
// bits 8 to 23 the tick into play it was hit + 1 while it is down, the top
// byte its crossings.
export const RH_MSIDE = 1;
export const RH_MDOWN = 0xffff00;
// FX kinds, FX_MG + 4 * MG_TRAFFIC + k.
export const RH_FX_CROSS = 232; // a crossing (either bank): owner the ball, shot its crossings, at it, size the points
export const RH_FX_HIT = 233; // a vehicle hit a ball (either bank): owner the ball, shot the kind | strip << 4, at it, size the speed it left at
export const RH_FX_COIN = 234; // owner 255, a coin dropped; else its taker: shot the coin, at it, size the points
export const RH_FX_CALL = 235; // owner 255, shot RH_C*, at the zebra's middle
export const RH_CAMBER = 1; // the lights go amber: green RH_LWARN on
export const RH_CWALK = 2; // green: the zebra is clear
export const RH_CEND = 3; // the green flashes
export const RH_CSTOP = 4; // red
export const RH_CDOUBLE = 5; // the last 15 s
