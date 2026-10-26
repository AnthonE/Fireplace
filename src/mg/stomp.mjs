// STOMPIN GROUND (MG_STOMP, prefix sg): a raised round floor of square
// flagstones over the sea, sized for the crowd, and stompers: great boulders
// on two stubby legs that drop out of the sky and charge across it. A charge
// runs a circular arc from just inside the rim to off the far side, its path
// glowing on the floor SG_TELE ticks before it sets off; one that meets a
// ball sends it flying the way it is going and up, a glancing one shoves it
// aside. From SG_LEAPFROM some stompers leap in instead and slam down on a
// marked ring: under it you're thrown clear, and a shockwave runs out along
// the floor at ball height, knocking outward whoever is on the floor when it
// passes; a ball in the air clears it. Waves of stompers grow, come closer
// together and run faster, more of them leaping; from SG_CRUMBLE the rim
// crumbles in. Bumps on; last ball on wins, and the balls one stomper (or one
// slam) sent off together share it.
// Literal numbers only: the sim reads them through consts.mjs's MG_CONSTS,
// the client imports this file itself.
export const SG_R0 = 14; // the floor: SG_R0 m plus SG_RK times the root of the balls in, at most SG_RMAX
export const SG_RK = 2.6;
export const SG_RMAX = 56;
export const SG_RMIN = 12; // the floor at its smallest: the rim crumbles in to here
export const SG_LEN = 12500; // 100 s
export const SG_IDLE = 0.98; // rolling drag a tick with no keys: from 10 m/s to a stop in about 4 m
export const SG_HOP = 8; // hop speed, m/s: 1.6 m up, a ball's bottom over SG_HW for 0.69 s
export const SG_SPAWN = 0.7; // balls start on a spiral over this much of the floor
// The flagstones, in PG_BIG: SG_S m squares, cell (q, r) from -SG_N to
// SG_N - 1 each way, its centre at ((q + 0.5) SG_S, (r + 0.5) SG_S) from the
// stage's centre; a u16 a cell, (r + SG_N) * SG_W + (q + SG_N): the tick into
// play the rim takes it (0 no stone, SG_NEVER inside SG_RMIN), from
// SG_CRUMBLE + 1 at the rim to SG_CRUMBLE + SG_SHRINK at SG_RMIN, plus up to
// SG_JIT more from the round's random numbers, so the rim goes ragged.
export const SG_S = 2.5;
export const SG_N = 23;
export const SG_W = 46; // 2 SG_N
export const SG_TILES = 0; // byte offset in PG_BIG
export const SG_NEVER = 0xffff;
export const SG_CRUMBLE = 7500; // 60 s
export const SG_SHRINK = 3750; // 30 s
export const SG_JIT = 250;
// The waves, from play's start: the first SG_FIRST in, then one every
// SG_GAP0 ticks closing to SG_GAP1 over SG_RAMP, each of 1 + radius / SG_PER
// stompers and one more every SG_MORE ticks into play, at most SG_WMAX,
// SG_STAG ticks apart. A charge's path shows SG_TELE ticks before it sets
// off, a leap's ring SG_TELE before it lands.
export const SG_FIRST = 375; // 3 s
export const SG_TELE = 175; // 1.4 s
export const SG_GAP0 = 400; // 3.2 s
export const SG_GAP1 = 175; // 1.4 s
export const SG_RAMP = 10000; // 80 s
export const SG_PER = 32;
export const SG_MORE = 2000; // 16 s
export const SG_WMAX = 7;
export const SG_STAG = 20;
// A stomper: body radius SG_RS0 to SG_RS1 (a ball under its top, 2 rs over
// the floor, meets it), charging at SG_V0 plus SG_VUP by the round's end, give
// or take SG_VJ. Its arc: the heading at its apex a random bearing, the apex
// up to SG_AIM of the rim (as it stands when it sets off) off the centre,
// either side, curving either way round a circle of SG_RA0 to SG_RA0 + SG_RA1
// times the rim (and at least the rim plus 2 rs). It sets off where its centre
// is SG_IN plus rs inside the rim, its body all on the floor, and is gone
// once its centre is SG_OUT plus rs past it (past a ball on the corner of a
// rim flagstone).
export const SG_RS0 = 1.8;
export const SG_RS1 = 2.8;
export const SG_V0 = 10;
export const SG_VUP = 5;
export const SG_VJ = 1.5;
export const SG_AIM = 0.6;
export const SG_RA0 = 1.05;
export const SG_RA1 = 1.6;
export const SG_IN = 0.5;
export const SG_OUT = 3;
export const SG_TURN = 2670176.9; // 2^-24 turns a radian
export const SG_FRAC = 3.7450703e-7; // radians a 2^-24 turn
// A charge meeting a ball: the ball out of it across the floor, sent off it at
// SG_KICK past the stomper's own speed that way, SG_FLING more along its
// heading and up at SG_POP0 plus SG_POP1, each of those last two times how
// head on it met (the cosine between its heading and the way to the ball).
export const SG_KICK = 4;
export const SG_FLING = 4;
export const SG_POP0 = 3;
export const SG_POP1 = 6;
// The leaps: from SG_LEAPFROM a stomper leaps in one time in SG_LEAP0 plus
// SG_LEAPK by the round's end, from out over the sea SG_LEAPT ticks before it
// lands (drawn; the sim has it only from its landing), on a spot up to SG_TAIM
// of the rim out. A ball under it as it lands (its bottom under the stomper's
// top, its centre within rs + SG_SLAMR) goes off it at SG_SLAMV and up at
// SG_SLAMUP; it stands SG_STAY ticks, a body balls are put out of, then
// leaps away. The shockwave runs out from its body at SG_VW to SG_RW from its
// centre, SG_BAND deep behind its front: a ball whose centre it sweeps with
// the ball's bottom under SG_HW is knocked outward to SG_KW (less SG_KWF of it
// by SG_RW) and up at SG_WPOP.
export const SG_LEAPFROM = 1875; // 15 s
export const SG_LEAP0 = 0.2;
export const SG_LEAPK = 0.3;
export const SG_LEAPT = 110;
export const SG_LEAPH = 16; // m the drawn leap climbs over the floor
export const SG_LAUNCH = 26; // m past the rim it leaps from (drawn)
export const SG_TAIM = 0.75;
export const SG_SLAMR = 1;
export const SG_SLAMV = 12;
export const SG_SLAMUP = 7;
export const SG_STAY = 60;
export const SG_VW = 11;
export const SG_RW = 14;
export const SG_BAND = 0.5;
export const SG_HW = 0.45;
export const SG_KW = 9;
export const SG_KWF = 0.45;
export const SG_WPOP = 3;
export const SG_WARN = 250; // ticks before the leaps and the crumbling a call says they're coming
// The schedule, in PG_BIG: per SG_BUCKET ticks into play, u16 the first
// stomper not gone by the bucket's start (SG_LO) and the first not started by
// its end (SG_HI); then SG_NMAX stompers of SG_REC B in the order they start:
// u32 the tick into play it sets off (a leap: lands), it's gone | f32 its
// arc's centre x, z (a leap: where it lands) | f32 the arc's radius (0 a
// leap), its body's radius | i32 its angle round the arc's centre as it sets
// off, its turn a tick (2^-24 turn, signed) | f32 its speed | f32 a leap's
// launch x, z | u32 stompers in its wave | u8 1 a leap + 2 the first of its
// wave, u8 0, u16 its wave | f32 a leap's shockwave's reach.
export const SG_BUCKET = 64;
export const SG_NB = 256;
export const SG_LO = 8192;
export const SG_HI = 8704;
export const SG_RECS = 9216;
export const SG_REC = 64;
export const SG_NMAX = 1024;
export const SG_FELL = 0; // in PG_S: u16 per slot, the tick into play it started going out, plus 1 (0 not yet: over's)
// A ball's PG_M: u16 the last stomper that hit it plus 1 (0 none), u16 the
// tick into play it did. The last balls on, all falling, share the win if one
// stomper (its charge, its slam or its shockwave) hit each no more than
// SG_SHARE ticks before it began to fall.
export const SG_SHARE = 375; // 3 s
// Its header, byte offsets in PG_H (112 B, in the prediction's copy).
export const SG_RAD = 0; // f32 the floor's radius at the start
export const SG_NS = 4; // u32 stompers in the schedule
export const SG_NV = 8; // u32 waves in the schedule
export const SG_COUNT = 12; // u32 flagstones at the start
// FX kinds, FX_MG + 4 * MG_STOMP + k.
export const SG_FX_LAND = 144; // a stomper lands: a charge where it sets off, a leap where it slams; size its radius, shot its record
export const SG_FX_HIT = 145; // a stomper knocks a ball: where they touch, owner the ball, shot the record (+ 0x8000 its shockwave), size the knock (m/s); on the ball's bank
export const SG_FX_LEAP = 146; // a leap takes off, out over the sea: shot its record, size its radius
export const SG_FX_CALL = 147; // a wave's paths show (shot its wave, size how many), or 0x8001 leaps coming, 0x8002 the rim going (size 0)
