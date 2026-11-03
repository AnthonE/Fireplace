// BATTLE ROYALE (M_ROYALE, prefix ry): everyone for itself, one life each.
// As play starts everyone in the room is put down spread over the map (a
// sunflower's spiral over the ellipse in its bounds, turned by the room's
// seed and match), with RY_GUN in both hands, a magazine and RY_RES each, no
// frags; crates are laid over the map's spots and then at random over it.
// Walking into a crate opens it if what it holds is of use (a gun in place
// of the starter or ammo for one carried, shields, health, frags); the map's
// pads hand out their guns too. A fighter out drops its best gun as a crate.
// The zone: RY_STAGES + 1 circles drawn by the room's PRNG as play starts,
// circle 0 the bounds' own (their half diagonal and RY_EDGE), each next RY_SIZE of that
// across and wholly inside the one before (and inside the bounds as far as
// its size lets it); circle k + 1 is shown while the wall stands at circle k,
// then between RY_SCHED's two ticks the wall closes in to it. Outside the
// wall a fighter takes RY_DMG[k] a second (RY_DMG_END once the last, of no
// size, has closed): nothing holds out, so the match ends inside its clock.
// The schedule is for MODES' clock (48750 ticks, 6:30) and shrinks with a
// shorter one (Fireplace's 90 s). The dead are out (A_RESPAWN past the
// clock); a join after the first close comes in out, watching. The last
// standing wins; the rest place by when they went out, later better, then
// by kills.
export const RY_GUN = 3; // W_MAGNUM: the starter, in both hands (Lucky Blocks' too, so $lk_gun deals a crate's gun in its place)
export const RY_RES = 8; // rounds in reserve the starter has in each hand: one more magazine
export const RY_STAGES = 6; // closes; circles 0 .. RY_STAGES
// each circle's radius in 1024ths of circle 0's (the bounds' half diagonal and RY_EDGE: Box Canyon's 178 m)
export const RY_SIZE = [1024, 563, 338, 205, 113, 51, 0];
// ticks of play each close starts and ends, at the mode's own clock: 1:00-1:40, 2:20-2:50, 3:20-3:45, 4:10-4:30, 4:50-5:10, 5:25-5:45
export const RY_SCHED = [7500, 12500, 17500, 21250, 25000, 28125, 31250, 33750, 36250, 38750, 40625, 43125];
export const RY_DMG = [2, 4, 7, 10, 15, 25]; // a second outside the wall, by stage: closing to circle k + 1 or showing it
export const RY_DMG_END = 50; // once the last circle has closed
export const RY_EVERY = 125; // ticks between the zone's hits
export const RY_WARN = 1250; // ticks before a close its warning comes
export const RY_KILL_ZONE = 21; // the kill feed's cause, past Crossroads' superball
export const RY_EDGE = '3'; // m inside the bounds the spread and the crates keep
export const RY_NUDGE = '2.5'; // m: a spot in a box tries eight round it this far off, then twice as far
export const RY_UP = '0.6'; // m over the ground a spot stands on at most (a floor, a step), not a roof
// The crates: RY_CRATE0 and one more for every RY_CRATE_PER fighters as play
// starts, at most RY_MAX, none within RY_APART of another; one is opened by
// a standing fighter whose feet come within RY_TAKE across and RY_TAKE_H up
// or down of its foot, if of use to it. What one holds: RY_LOOT[k] with
// RY_ODDS[k] chances in RY_ODDS_SUM, a gun by its W_* (never the starter) or:
export const RY_R_OVER = 16; // OVERSHIELD and full health
export const RY_R_HEAL = 17; // full health and shields up to 100
export const RY_R_FRAGS = 18; // RY_FRAGS frags, up to 4
export const RY_LOOT = [1, 2, 4, 5, 6, 7, 8, 9, 16, 17, 18];
export const RY_ODDS = [10, 8, 3, 7, 2, 6, 5, 2, 6, 9, 6];
export const RY_ODDS_SUM = 64;
export const RY_FRAGS = 2;
export const RY_MAX = 48;
export const RY_CRATE0 = 12;
export const RY_CRATE_PER = 2;
export const RY_TRIES = 8; // random spots tried for each crate wanted
export const RY_APART = '4';
export const RY_TAKE = '1.2';
export const RY_TAKE_H = '1.8';
// Its state in AO, byte offsets, all zero until play starts:
export const RY_N = 0; // u32 crates laid (and dropped past them)
export const RY_STAND = 4; // u32 fighters standing, counted every tick of play
export const RY_OUT = 8; // u32 out (in the room, dead)
export const RY_END = 12; // u32 how it ended: 0 playing, 1 one stood, 2 nobody stood (the last went out together), 3 the clock
export const RY_STAGE = 16; // u32 the circle the wall stands at or closes from (RY_STAGES once the last has closed)
export const RY_CLOSING = 20; // u32 1 while the wall moves in
export const RY_WX = 24; // f32 x, z, radius: the wall this tick
export const RY_WZ = 28;
export const RY_WR = 32;
export const RY_HIT = 36; // u32 the damage a second outside it now
export const RY_OPENED = 40; // u32 crates opened this match
export const RY_ZONED = 44; // u32 fighters the zone took
export const RY_C = 64; // the circles, (RY_STAGES + 1) x 16 B: f32 x, z, radius | u32 0
export const RY_CRATES = 192; // RY_MAX x RY_CSIZE: f32 x, y (its foot), z | u8 what | u8 1 once opened | u16 0
export const RY_CSIZE = 16;
// Per fighter, MODE_REC's bytes: MR_AUX the crates it opened, and
export const RY_MR_OUT = 2; // u16 (MR_POINTS's) ticks of play + 1 when it went out (0: standing, or out from the start)
export const RY_MR_BURN = 6; // u16 damage the zone has done it
// Its news, FX_MODE with these as size (MX_AM + 8 * 12 ..):
export const RY_MX_OUT = 112; // owner went out, shot how many still stand; at its feet
export const RY_MX_SHOW = 113; // circle shot is shown, the next the wall closes to (owner 255); at its middle
export const RY_MX_WARN = 114; // the wall closes to circle shot in RY_WARN ticks (owner 255)
export const RY_MX_CLOSE = 115; // the wall closes in to circle shot now (owner 255)
export const RY_MX_LOOT = 116; // owner opened a crate, shot what it held (an RY_LOOT code); at the crate
export const RY_MX_LATE = 117; // owner came in after the first close: out, watching
export const RY_MX_WIN = 118; // owner is the last standing, shot its kills
export const RY_MX_END = 119; // over with nobody standing (shot 0), or at the clock (shot how many stood); owner 255
