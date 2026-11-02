// EGG RAID (MG_EGGS, prefix eg): red against blue (PGF_TEAMS) in a walled
// farmyard, red's nest near its end at low x, blue's at high x, and a pile
// of eggs in the middle, one for every ball in. Roll over a loose egg to
// carry it (one at a time; a carrier rolls 15% slower), into your own nest
// to lay it there, into the other side's carrying nothing to take one of
// theirs. A carrier bumped hard by a foe, or shoved by a blast, drops its
// egg, sliding off the way it was knocked. A golden egg worth 3 drops into
// the middle every 20 s, and bumper's power-ups fall onto the yard. A side's
// score is the value of its nest, live; the bigger nest at 90 s wins, a draw
// allowed.
// Literal numbers only: the sim reads them through layout.mjs's MG_CONSTS,
// the client imports this file itself.
// The yard: a rounded rectangle EG_ASP times as long as wide, EG_A0 m² plus
// EG_AK for each ball up to EG_NK and EG_AK2 for each past (32.2 by 20.2 m
// for 1, 47.3 by 29.6 for 16, 114 by 71.2 for 256); its corners rounded
// EG_RC m (half its width at most).
export const EG_A0 = 600;
export const EG_AK = 50;
export const EG_NK = 16;
export const EG_AK2 = 28;
export const EG_ASP = 1.6;
export const EG_RC = 5;
export const EG_LEN = 11250; // 90 s
export const EG_PE = 0.5; // a ball comes off the fence softly
export const EG_FENCE_H = 1.1; // m, the fence (drawing: nothing leaves the yard anyway)
// The balls as laid out: each side in rows across the yard from EG_FRONT m
// past the pile's edge, EG_GAP m apart, back toward its nest; a newcomer in
// play falls in EG_BACK m in front of its own nest.
export const EG_FRONT = 2.5;
export const EG_GAP = 2.6;
export const EG_BACK = 2.5;
// A carrier keeps EG_SLOW of its speed a tick after its roll: 8.5 m/s flat
// out instead of 10, and it coasts to a stop sooner.
export const EG_SLOW = 0.9985;
// The nests: EG_NR0 m plus EG_NRK times the root of the balls in, in radius
// (2.65 m for 1, 3.1 for 16, 4.9 for 256), each centre that plus EG_NIN m in
// from its end wall. A nest's floor rolls any ball on it, and any loose egg,
// straight out from its middle, EG_TILT m/s more a tick (25 m/s², more than
// a ball's 11 m/s² push): nobody sits in a nest, its own side's or not.
export const EG_NR0 = 2.5;
export const EG_NRK = 0.15;
export const EG_NIN = 3.5;
export const EG_TILT = 0.2;
// The eggs: one for every ball in, EG_NMIN to EG_NMAX, on a sunflower over
// the middle EG_PS m times the root of their number in radius; EG_NGOLD
// golden ones after them, worth EG_GOLDV. An egg is EG_R m in radius on the
// floor (it stands EG_EH m tall as drawn).
export const EG_NMIN = 10;
export const EG_NMAX = 128;
export const EG_NGOLD = 4;
export const EG_PS = 0.5;
export const EG_R = 0.35;
export const EG_EH = 0.9;
export const EG_GOLDV = 3;
// Golden egg k lands in the middle EG_GOLD0 + k * EG_GOLDP ticks into play
// (20, 40, 60 and 80 s), called EG_GOLDW before, falling from EG_GOLDH m for
// the last EG_GOLDFALL (drawing).
export const EG_GOLD0 = 2500;
export const EG_GOLDP = 2500;
export const EG_GOLDW = 250;
export const EG_GOLDFALL = 100;
export const EG_GOLDH = 14;
// A take: a ball in play carrying nothing, its bottom under EG_LOW m over
// the floor, whose centre comes within its radius, EG_R and EG_GRAB of a
// loose egg's takes it (of several, the nearest, ties to the lower slot).
// A lay or a steal: its centre inside a nest, at any height.
export const EG_GRAB = 0.25;
export const EG_LOW = 1;
// A knock, judged on a carrier the tick it is hit: by a foe touching it
// (within their radii and EG_TOUCH) that was the faster into the bump
// (bumper's B_BUMPS for the other one), if its velocity jumped more than
// EG_HARD m/s since the last tick (a bump between two balls of a weight
// jolts each 2.5 m/s plus the speed they closed at: 5 m/s of closing);
// else by a blast (its hitter not touching it, or blowing up beside it: a
// POW used, a SPRING's landing), if it jumped more than EG_SHOVE m/s level. The egg pops out from its carrier's centre sliding EG_POPK of that
// jump (at most EG_POPMAX m/s), nobody's to take for EG_LOCK ticks and not
// its carrier's for EG_REGRAB (nor a steal by it).
export const EG_TOUCH = 0.5;
export const EG_HARD = 7.5;
export const EG_SHOVE = 2;
export const EG_POPK = 0.5;
export const EG_POPMAX = 9;
export const EG_LOCK = 30;
export const EG_REGRAB = 125;
// A loose egg keeps EG_FRIC of its speed a tick (9 m/s slides 4.8 m), stops
// under EG_STOP m/s, comes off the fence at EG_WE of its speed into it, and
// passes through the balls.
export const EG_FRIC = 0.985;
export const EG_STOP = 0.05;
export const EG_WE = 0.6;
// Points of a ball's own (PG_SCORE, how the losers place): an egg laid its
// value, a steal EG_PT_STEAL, a foe's egg knocked loose EG_PT_KNOCK.
export const EG_PT_STEAL = 1;
export const EG_PT_KNOCK = 1;
// The balls that may take, in a grid rebuilt every tick for the takes:
// EG_GN x EG_GN cells of EG_CELL m from the yard's centre less half of it.
export const EG_CELL = 4;
export const EG_GN = 32;
// Bumper's power-ups fall from ORB_Y onto the yard, a minor spice beside the
// eggs: the first EG_DROP0 into play (6 s), then one every EG_DROPGAP ticks
// (8 s) and one more for every EG_DROPN balls in (2 at a time for 16, 17 for
// 256: 22 a round for 16). Each over a random spot EG_DROPIN m or more inside
// the fence and EG_DROPNEST m or more past a nest's rim (EG_DROPTRY tries,
// else none), falling at ORB_FALL (3.6 s) and lying EG_ORBLIFE ticks (10 s),
// EG_NORB at once at most; the first ball in, by slot, holding none, that
// rolls into one takes it. Of each hundred: EG_PPOW POW and EG_PROCKET
// ROCKET (a blast knocks a carrier's egg loose), EG_PDASH DASH (an egg run
// home, a carrier caught), EG_PSPRING SPRING, the rest MEGA.
export const EG_DROP0 = 750;
export const EG_DROPGAP = 1000;
export const EG_DROPN = 16;
export const EG_DROPIN = 2;
export const EG_DROPNEST = 2;
export const EG_DROPTRY = 8;
export const EG_ORBLIFE = 1250;
export const EG_NORB = 32;
export const EG_PPOW = 25;
export const EG_PROCKET = 25;
export const EG_PDASH = 30;
export const EG_PSPRING = 15;
// Its header, byte offsets in PG_H (in the prediction's copy).
export const EG_HX = 0; // f32 the yard's half length, x
export const EG_HZ = 4; // f32 its half width, z
export const EG_CR = 8; // f32 its corners' radius
export const EG_NR = 12; // f32 a nest's radius
export const EG_NX = 16; // f32 a nest's centre from the yard's, along x (red's at -, blue's at +)
export const EG_PR = 20; // f32 the pile's radius as laid out
export const EG_NE = 24; // u32 eggs in the pile (the golden ones are the next EG_NGOLD records)
export const EG_DROP = 28; // u32 ticks into play of the next power-up drop
// In PG_S: the eggs, EG_NMAX + EG_NGOLD of EG_ESIZE bytes; then from EG_ORBS
// the power-ups, EG_NORB of 16 bytes (bumper's orbs, as Swiss Roll keeps
// them): f32 x, y (its centre), z | u8 PU_* (0 none) | u8 1 falling, 2 lying
// | u16 ticks left lying.
export const EG_EGG = 0;
export const EG_ESIZE = 24;
export const EG_EST = 0; // u8 EG_NONE (a golden egg still to come), EG_FREE, EG_HELD or EG_NEST
export const EG_EBY = 1; // u8 held: its carrier; loose: who dropped it; in a nest: who laid it; 255 none
export const EG_ESIDE = 2; // u8 in a nest: whose, 0 red, 1 blue
export const EG_EV = 3; // u8 its value: 1, or EG_GOLDV
export const EG_EAT = 4; // u32 tick into play anyone may take it (loose), or it was taken or laid
export const EG_EX = 8; // f32 world x, z: where it lies (loose), or was taken
export const EG_EZ = 12;
export const EG_EVX = 16; // f32 its velocity, loose
export const EG_EVZ = 20;
export const EG_NONE = 0;
export const EG_FREE = 1;
export const EG_HELD = 2;
export const EG_NEST = 3;
export const EG_ORBS = 3200;
// In PG_BIG: EG_SSIZE bytes a slot; then the grid's heads (u16 a cell,
// 0xffff empty) and its links (u16 a slot).
export const EG_SLOT = 0;
export const EG_SSIZE = 32;
export const EG_SVX = 0; // f32 its velocity at the last tick's end, x
export const EG_SVZ = 4; // f32 and z
export const EG_SBUMPS = 8; // u16 its B_BUMPS then
export const EG_SLAID = 10; // u16 eggs laid (a golden one too)
export const EG_SSTEALS = 12; // u16 eggs taken from the other nest
export const EG_SKNOCKS = 14; // u16 foes' eggs knocked loose
export const EG_SLOST = 16; // u16 its own knocked loose
export const EG_SGOLD = 18; // u16 golden eggs laid
export const EG_SNEXT = 20; // u32 tick into play it may take an egg again
export const EG_SSHOTS = 24; // u16 its P_SHOTS at the last tick's end (a POW used since: its count moved on)
export const EG_SITEM = 26; // u8 its B_ITEM then
export const EG_SFL = 27; // u8 its P_FL then (a SPRING's landing since: PF_STOMP gone)
export const EG_GRID = 0x2000;
export const EG_GNEXT = 0x2800;
// A ball's own field (PG_M): the egg it carries plus 1, 0 none.
// FX kinds, FX_MG + 4 * MG_EGGS + k.
export const EG_FX_GET = 208; // owner the taker, shot the egg | 256 a steal (else from the floor), at it, size its value
export const EG_FX_LAY = 209; // owner the layer, shot the egg | its side << 8 | 512 a golden one, at the nest, size the nest's value now
export const EG_FX_POP = 210; // owner the carrier, shot the knocker | 256 by a blast | 512 a golden egg, at its top, size the jolt (m/s)
export const EG_FX_GOLD = 211; // owner 255, shot the golden egg (0..3) | 256 it lands (else called), at the middle, size s till it lands
