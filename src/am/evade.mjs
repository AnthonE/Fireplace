// EVADE (M_EVADE, prefix ed): everyone on one side, against the chasers: flat
// faces that glide over the map faster than a fighter runs on the flat, slower
// up stairs, slopes and ledges, each after its nearest standing fighter. A
// chaser that reaches one downs it (PF_DOWN): it crawls at ED_CRAWL, can't
// shoot or jump. A standing fighter holding still beside it for ED_REVIVE
// ticks revives it; downed ED_BLEED ticks (the count stops while someone is
// reviving it) it is out for the match (PF_DEAD, never respawning). A hit
// stuns a chaser ED_STUN ticks, then it shrugs off hits for ED_CALM. Survive
// the clock and everyone standing wins; nobody standing, the chasers do.
// Places: standing at the end, then ticks standing, then revives.
export const ED_MIN = 2; // chasers as play starts, at least
export const ED_PER = 12; // and one more for every ED_PER fighters in the room
export const ED_WAVE = 7500; // ticks of play to each next chaser: 60 s
export const ED_SHARE = 2; // at most one for every ED_SHARE fighters in the room and one more (ED_MIN at least),
export const ED_MAX = 6; // and ED_MAX
export const ED_RUN = '11.5'; // m/s on the flat (a fighter runs RUN, 10)
export const ED_ACC = '24'; // m/s^2 it turns and gets up to speed with: it glides
export const ED_UP = '2.4'; // a rise over its way steeper than ED_FLAT slows it by this times the slope past that (stairs: to ED_SLOW)
export const ED_FLAT = '0.15'; // the slope it takes at full speed (the canyon floor's bumps)
export const ED_SLOW = '0.4'; // its speed's share at the least, up stairs and ledges
export const ED_EASE = '0.012'; // the share of what it lost back each tick (about 0.7 s)
export const ED_CLIMB = '2.5'; // m/s up a ledge it can't step onto, its prey's feet higher than a step over its own
export const ED_LEDGE = '6.5'; // m over its feet: the highest box top it climbs (a base's roof and parapet, the rocks)
export const ED_PROBE = '1.6'; // m it looks ahead along its way for a wall
export const ED_FLOOR = '2.5'; // m up or down its prey is on another floor: in the same building, it goes out (ED_EXIT past the nearest side of its bounds) first
export const ED_EXIT = '3';
export const ED_SNAP = '0.6'; // m: down this far it glides; more, it falls
export const ED_SEP = '3'; // m: chasers closer than this push apart
export const ED_TURN = 2048; // 1/16384 turns: its first turn off the way at a wall (45 degrees)
export const ED_SWING = 1024; // and each next while the way it turned is blocked too
export const ED_RELAX = 256; // and back toward the way each tick it can
export const ED_STUCK = 500; // ticks without getting a metre nearer its prey: it wanders
export const ED_WANDER = 250; // ticks it wanders a way drawn by the PRNG
export const ED_CATCH = '1.1'; // m across (and ED_CATCH_H up or down) from its feet to a fighter's: caught
export const ED_CATCH_H = '1.8';
export const ED_PAUSE = 125; // ticks it stops after a catch: 1 s
export const ED_STUN = 150; // ticks a hit stuns it: 1.2 s
export const ED_CALM = 250; // ticks after a stun ends that no hit stuns it
export const ED_HIT_R = '1.2'; // m: its face, as a ball round ED_HIT_Y over its feet, for a shot
export const ED_HIT_Y = '1.5';
export const ED_BAR = '30'; // m across: no fighter comes in at a spawn point a chaser is this near
export const ED_SAFE = 250; // ticks a fighter just revived or just in can't be caught: 2 s
export const ED_CRAWL = '2'; // m/s a downed fighter crawls (src/players.wat)
export const ED_REACH = '2'; // m across (and ED_REACH_H up or down) a reviver stands from the downed
export const ED_REACH_H = '1.5';
export const ED_STILL = '1'; // m/s across at most: holding still
export const ED_REVIVE = 375; // ticks beside it holding still: 3 s
export const ED_BLEED = 3750; // ticks downed before it's out: 30 s
// Per fighter, MODE_REC's bytes: MR_POINTS its revives of others, MR_AUX its
// ticks standing (to 0xffff), and
export const ED_MR_SAFE = 0; // u8 ticks it can't be caught (MR_RUNG's byte: a standing fighter's)
export const ED_MR_BLEED = 6; // u16 downed: ticks before it's out
// Its state in AO, byte offsets, all zero until play starts:
export const ED_N = 0; // u32 chasers on the field
export const ED_STAND = 4; // u32 fighters standing, counted every tick of play
export const ED_DOWNED = 8; // u32 downed
export const ED_OUT = 12; // u32 out
export const ED_END = 16; // u32 how it ended: 0 still playing, 1 the clock ran out with someone standing, 2 nobody stood
export const ED_CAUGHT = 20; // u32 catches this match
export const ED_UPS = 24; // u32 revives this match
export const ED_STUNS = 28; // u32 stuns this match
export const ED_CH = 32; // the chasers, ED_MAX x ED_CSIZE
export const ED_CSIZE = 48;
export const ED_C_X = 0; // f32 x, y, z: its feet
export const ED_C_Y = 4;
export const ED_C_Z = 8;
export const ED_C_VX = 12; // f32 x, y, z: its velocity
export const ED_C_VY = 16;
export const ED_C_VZ = 20;
export const ED_C_EASE = 24; // f32 its speed's share now (1 on the flat)
export const ED_C_BEST = 28; // f32 the nearest it has been to its prey since it last got nearer by a metre
export const ED_C_STUN = 32; // u16 ticks stunned (or stopped after a catch)
export const ED_C_CALM = 34; // u16 ticks no hit stuns it
export const ED_C_PREY = 36; // u16 the fighter it's after, slot + 1 (0: nobody)
export const ED_C_TURN = 38; // i16 how far off the way to its prey it goes round a wall, 1/16384 turns, its sign the side
export const ED_C_STUCK = 40; // u16 ticks it hasn't got nearer
export const ED_C_WANDER = 42; // u16 ticks it wanders yet
export const ED_C_WDIR = 44; // u16 the way it wanders, 1/16384 turns
export const ED_C_CLIMB = 46; // u8 1 while it climbs
export const ED_C_GROUND = 47; // u8 1 on the ground
export const ED_HELP = 0x200; // u16 x 256: each downed fighter's ticks of being revived
// Its news, FX_MODE with these as size (MX_AM + 8 * 9 ..), where it happened:
export const ED_MX_DOWN = 88; // owner was caught: shot the chaser
export const ED_MX_UP = 89; // owner revived shot
export const ED_MX_OUT = 90; // owner is out
export const ED_MX_COME = 91; // a chaser comes: shot its index (owner 255)
export const ED_MX_STUN = 92; // owner stunned chaser shot
export const ED_MX_LAST = 93; // owner is the last one standing
export const ED_MX_END = 94; // the match is over: shot how many stood at the clock (0: everyone fell), owner 255
