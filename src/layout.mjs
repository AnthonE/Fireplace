// The one memory map. tools/asm.mjs folds these into the WAT as @NAME;
// every harness and runtime imports the same file, so nothing drifts.

export const PAGES = 64; // 4 MiB, shared, never grows

// CTRL: thread control, error slot, inbox. Never hashed, never snapshotted.
export const CTRL = 0x000000;
export const BAR_COUNT = 0x040; // own cache lines for the barrier
export const BAR_GEN = 0x080;
export const JOB_QUIT = 0x0c0;
export const JOB_NA = 0x0c4; // awake balls this tick
export const JOB_NB = 0x0c8; // 4-ball blocks with an awake ball
export const JOB_ABORT = 0x0cc; // set by any thread that fails; every barrier gives up
// 1 when the arena's map came from outside the build (the map_load export):
// here, where init clears nothing, so init leaves the map and the ground it
// laid (MAP to NET) as they are
export const MAP_HOSTED = 0x100;
export const ERR_CODE = 0x240;
export const ERR_INDEX = 0x244;
export const ERR_TICK = 0x248;
export const INTERVAL_HASH = 0x300; // u64, written when slice 127 closes
export const INTERVAL_TICK = 0x308;
// The ball grid (HEAD, NEXT, CELLOF) lives outside the region and is kept up
// to date tick by tick. It is rebuilt from the region whole when GRID_OK is 0
// (init, restore, the regrid export after any outside write to the region) or
// when the tick or the ball count it was kept for is not the region's.
export const GRID_TICK = 0x310;
export const GRID_N = 0x314;
export const GRID_OK = 0x318;
export const SORT_ON = 0x31c; // 1 when tick_begin built this tick's sorted copy (SBOUND...) for contacts

export const DIGESTS = 0x400; // u64[128], slice s digested at tick K+s+1; the interval closes at K+128
export const INBOX = 0x1000; // u32 count, then records
export const INBOX_REC = 0x1010;
export const INBOX_MAX = 1024;
export const FULLDIG = 0x6000; // u64[128] scratch for the full region hash
export const RS_OUT = 0xf00; // 16 B: a Rust minigame's spawn writes its x, y, z here (serial, per call, never hashed; tools/rust.mjs)
// FX ring: blasts, shots and sinks for the renderer and the sound. Written by
// the sim, read by the main thread, never hashed. u32 count, then records:
// u32 tick | u8 kind | u8 owner | u16 shot | f32 x | f32 y | f32 z | f32 size | 8 B zero
export const FX = 0x8000;
export const FX_REC = 0x8010;
export const FX_MAX = 256;
export const FX_BLAST = 1;
export const FX_SINK = 2;
export const FX_SHOT = 3;

// REGION: all gameplay state. Hashed in 128 slices of 4 KiB, snapshotted whole.
export const REGION = 0x010000;
export const REGION_SIZE = 0x80000;
export const SLICE = 4096;
export const NSLICE = 128;
export const HDR_TICK = REGION + 0;
export const HDR_RNG = REGION + 4;
export const HDR_SEED = REGION + 8;
export const HDR_NBALLS = REGION + 12;
export const HDR_HOLE = REGION + 16; // holes started in this room
export const HDR_STATE = REGION + 20; // H_*
export const HDR_UNTIL = REGION + 24; // tick the current state ends
export const HDR_START = REGION + 28; // tick play began
export const HDR_TEE = REGION + 32; // f32 x, y, z
export const HDR_CUP = REGION + 44; // f32 x, y, z
export const HDR_DIR = REGION + 56; // f32 x, z: unit vector, tee to cup
export const HDR_PAR = REGION + 64;
export const HDR_LIVE = REGION + 68; // live players, counted every tick
export const PLAYERS = REGION + 0x100; // 256 x 64 B
export const PROJ = REGION + 0x4100; // 1024 x 32 B
export const PX = REGION + 0x10000; // f32[16384] each, structure of arrays
export const PY = REGION + 0x20000;
export const PZ = REGION + 0x30000;
export const VX = REGION + 0x40000;
export const VY = REGION + 0x50000;
export const VZ = REGION + 0x60000;
export const FLAGS = REGION + 0x70000; // u8
export const SLEEP = REGION + 0x74000; // u8
export const OWNER = REGION + 0x78000; // u16

// The prediction layer (predict.wat) writes only here. Keyframe slots.
export const PRED = 0x090000;
export const SNAP0 = 0x0a0000;
export const SNAP1 = 0x120000;

// Per-tick scratch, rebuilt every tick, never hashed.
export const DVX = 0x1a0000;
export const DVY = 0x1b0000;
export const DVZ = 0x1c0000;
export const WAKE = 0x1d0000; // u8
export const AWAKE = 0x1d4000; // u16 list
export const BLOCKS = 0x1dc000; // u16 list of 4-ball blocks
// The ball grid, kept from tick to tick (GRID_OK): each bucket a list of the
// balls in it in ascending index, the order a stable sort by bucket gives.
export const HEAD = 0x1e0000; // u16[NCELL], the bucket's first ball, 0xffff for none
export const NEXT = 0x1f0000; // u16[BALL_CAP], the next ball in the same bucket: always a higher index, or 0xffff
export const CELLOF = 0x1f8000; // u16[BALL_CAP], the ball's bucket, 0xffff for none (sunk, or not yet spawned)

// The live balls sorted by bucket, rebuilt by tick_begin when SORT_MIN or more
// are awake, never hashed: bucket b's balls are SI[SBOUND[b], SBOUND[b + 1]),
// in ascending index, with their positions copied beside them. Buckets number
// x fastest, so a row of three cells is one run of the arrays. It sits past
// the client's slots at NET, which use its first 12 KiB.
export const SBOUND = 0x300000; // u16[NCELL + 2]
export const SX = 0x320000; // f32[BALL_CAP] each, by sorted position
export const SY = 0x330000;
export const SZ = 0x340000;
export const SI = 0x350000; // u16[BALL_CAP], the ball at each sorted position
export const SORT_MIN = 768;
// Per thread, the touching balls (sorted positions) one awake ball has met so
// far: contacts take them four at a time. u16[HIT_CAP] for each of 32 threads.
export const HITS = 0x358000;
export const HIT_CAP = 64;

// Terrain, regenerated from the seed.
export const TERRAIN_H = 0x220000; // u16[512 * 512], 1/256 m
export const TERRAIN_S = 0x2a0000; // u8[512 * 512] surface type
export const TERRAIN_END = 0x2e0000;
export const NET = 0x2e0000; // the client's threads talk here; init never clears it

// The client's shared slots (main thread, net worker, sim worker, bot).
// Input, written by the main thread or a bot, sampled by the net worker every tick:
export const CL_MOVE = NET + 0; // u32 move bits (forward 1, back 2, left 4, right 8) | jump 16
export const CL_YAW = NET + 4; // u32, 1/16384 turn
export const CL_PITCH = NET + 8; // u32, 10 bits, 512 level
export const CL_PRESSES = NET + 12; // u32 shots asked for; the word's counter follows it a step a tick
export const CL_WEAPON = NET + 16; // u32 0 rocket, 1 grenade
export const CL_MOVEAT = NET + 24; // f64 epoch ms the move bits last changed, for the latency figures
// Session, written by the net worker:
export const CL_SLOT = NET + 32; // i32, -1 until the welcome
export const CL_ROOM = NET + 36; // u32 server tick of sim tick 0
export const CL_LEAD = NET + 40; // f32 ticks of input lead
export const CL_PING = NET + 44; // f32 ms, bundle slack seen by the relay (negative = late)
export const CL_DELAY = NET + 48; // f32 ticks the playout clock aims to run behind the server's: the earliest arrival, 2, the jitter
export const CL_JITTER = NET + 52; // f32 ticks, p95 of first arrivals past the earliest
export const CL_NEXT = NET + 56; // u32 one past the newest sampled input tick (server ticks)
export const CL_REPAIRS = NET + 60; // u32 ticks that came in repair datagrams
export const CL_SENT = NET + 80; // u32 shots sampled into words so far (CL_PRESSES runs ahead of it)
export const CL_MOVETICK = NET + 84; // u32 the first sampled tick with the move bits CL_MOVESEEN's change made
export const CL_MOVESEEN = NET + 88; // f64 that change's CL_MOVEAT
// Sim, written by the sim worker:
export const CL_STATE = NET + 64; // u32 0 connecting, 1 catching up, 2 playing, 3 failed
export const CL_SEQ = NET + 68; // u32, odd while the sim worker is stepping or restoring
export const CL_QUEUED = NET + 72; // u32 ticks received, not yet stepped
export const CL_KEYS = NET + 76; // u32 keyframes restored: the join's, then one per resync
// The arena's input, written by the main thread (presses counted like CL_PRESSES):
export const CL_MELEE = NET + 96; // u32 melee presses
export const CL_GREN = NET + 100; // u32 grenade presses
export const CL_RELOAD = NET + 104; // u32 reload presses
export const CL_USE = NET + 108; // u32 pickup presses
export const CL_AUTO = NET + 112; // u32 1 while an automatic's trigger is held: a shot asked for every tick
// and by the net worker, for the prediction's word in progress:
export const CL_MSENT = NET + 116; // u32 melee presses sampled; its bit is the low bit
export const CL_GSENT = NET + 120; // u32 grenade presses sampled
export const CL_FRAME = NET + 124; // u32 the frame being sent, a bit a tick
// Clocks (client/clock.mjs), 32 B each, written by the net worker:
export const CL_PLAY = NET + 128; // the playout clock, in server ticks: the confirmed world steps up to it
export const CL_PRED = NET + 160; // the predicted clock: the server tick plus the input lead
// Traffic, for the net graph (client/netgraph.mjs), counted by the net worker:
export const CL_RX_BUNDLE = NET + 192; // u32 bytes of bundle datagrams received
export const CL_RX_REPAIR = NET + 196; // u32 bytes of repair datagrams received
export const CL_RX_STREAM = NET + 200; // u32 bytes of keyframes and fills received
export const CL_TX = NET + 204; // u32 bytes of input datagrams sent
export const CL_HEARD = NET + 208; // u32 closed ticks heard, by any of them
// Looks (client/looks.mjs), drawing only: the relay carries them beside the ticks.
export const CL_LOOK = NET + 212; // u32 this player's look, written by the page; the net worker sends it when it changes
export const CL_LOOKS = NET + 2048; // u32[256] every slot's look as the relay last sent it (0: the house look)
// Names, drawing only too: each signed-in slot's, as the relay last sent it (net/wire.mjs T_NAMES)
export const NAME_BYTES = 16; // net/wire.mjs NAME_MAX: the font's characters, 0 after the last
export const CL_NAMES = NET + 8192; // u8[256 * NAME_BYTES], every slot's name ('' for none: P1, P2, ...)
export const CL_AVATARS = NET + 3072; // u32[256] every signed-in slot's Elo Pros avatar as the relay last sent it (0: none; client/avatar.mjs)
// Input words by server tick (& 255), written by the net worker as it samples them:
export const CL_WORDS = NET + 1024;
export const PLAY_BASE = 2; // ticks of playout delay past the earliest arrival, before jitter

export const BALL_CAP = 16384;
export const NCELL = 32768; // 64 x 8 x 64 modular grid: 27 neighbours never alias, and a 26 m pit does not wrap
export const GRID = 512;
export const SPACING = 2; // metres per heightfield sample
export const WORLD = GRID * SPACING;

// Ball flags. A sunk ball has gone through the slipgate: out of the grid, never moves again.
export const F_LIVE = 1;
export const F_AWAKE = 2;
export const F_SUNK = 4;

// Players: 256 x 64 B. Position is the feet.
export const NPLAYER = 256;
export const PSIZE = 64;
export const P_PX = 0;
export const P_PY = 4;
export const P_PZ = 8;
export const P_VX = 12;
export const P_VY = 16;
export const P_VZ = 20;
export const P_IN = 24; // u32 input word, last applied
export const P_FL = 28; // u8 PF_*
export const P_FIRED = 30; // u8 shot counter of the last shot taken
export const P_REFIRE = 32; // u16 ticks until the next shot
export const P_STROKES = 34; // u16
export const P_BALL = 36; // u32 this hole's ball
export const P_DONE = 40; // u32 tick the ball went in
export const P_SCORE = 44; // u16 last hole's score
export const P_HOLES = 46; // u16 holes scored
export const P_TOTAL = 48; // u32 sum of scores
export const P_SHOTS = 52; // u16 shots fired, ever; keys flashes and sounds
export const PF_LIVE = 1;
export const PF_GROUND = 2;
export const PF_DONE = 4;

// Projectiles: 1024 x 32 B.
export const NPROJ = 1024;
export const JSIZE = 32;
export const J_PX = 0;
export const J_PY = 4;
export const J_PZ = 8;
export const J_VX = 12;
export const J_VY = 16;
export const J_VZ = 20;
export const J_AGE = 24; // u16 ticks in flight
export const J_KIND = 26; // u8 K_*, 0 = free slot
export const J_OWNER = 28; // u8
export const J_SHOT = 30; // u16 owner's shot number, keys flashes and sounds
export const K_ROCKET = 1;
export const K_GRENADE = 2;
export const ROCKET_REFIRE = 100; // 0.8 s
export const GREN_REFIRE = 75; // 0.6 s
export const FUSE = 312; // 2.5 s
export const ROCKET_LIFE = 1000;

// The prediction layer: a copy of the header, players and projectiles at PRED,
// stepped ahead for one player by the main thread's own instance. Record
// addresses carry a bank offset, 0 for the confirmed world and PRED_D here,
// so PLAYERS + PRED_D + 64p is slot p's predicted record. Only the main thread
// reads or writes PRED.
export const PRED_D = PRED - REGION;
export const PRED_COPY = PROJ + NPROJ * JSIZE - REGION; // 48.25 KiB
export const PFX = PRED + 0xc200; // ghost shots and blasts, laid out as FX
export const PTRACK = PRED + 0xe400; // after predicted tick k: f32 x, y, z, u32 tick reached
export const PWORDS = PRED + 0xf400; // u32 input word for each tick to predict
export const PRED_MAX = 256;

// Hole clock. A join starts a countdown; play ends when every live player
// is in or the limit passes; the scoreboard shows, then the hole restarts.
export const H_IDLE = 0;
export const H_COUNT = 1;
export const H_PLAY = 2;
export const H_OVER = 3;
export const COUNT_TICKS = 375; // 3 s
export const LIMIT_TICKS = 30000; // 4 min
export const OVER_TICKS = 1250; // 10 s
export const PENALTY = 2; // strokes added for not finishing
export const GREEN_R = 15; // m
export const TEE_R = 14; // m

// Event log records (16 B): u32 tick | u8 kind | u8 a | u16 b | u16 x | i16 y | u16 z | i16 c
export const EV_SPAWN = 1;
export const EV_EXPLODE = 2;
export const EV_EXPLODE_BALL = 3;
export const EV_INPUT = 4; // a = slot, u32 word at offset 8
export const EV_JOIN = 5; // a = slot
export const EV_LEAVE = 6; // a = slot
export const REC = 16;

// Physics, as the f32 literals the module inlines.
export const PHYS = {
  DT: '0.008', // 1/125 s
  G_DT: '0.07848', // 9.81 * DT
  R: '0.2',
  D2: '0.16', // (2R)^2
  TWO_R: '0.4',
  INV_CELL: '2.5', // 1 / (2R)
  E_BB: '0.2',
  PUSH: '4.0', // m/s per metre of overlap
  BOUNCE_MIN: '0.5', // below this approach speed, no restitution
  WAKE_V: '0.3',
  SLEEP_V2: '0.0144', // (0.12 m/s)^2, above one tick of gravity
  VMAX2: '3600', // (60 m/s)^2
  CEIL: '400',
  LO: '0.2',
  HI: '1021.8',
  // players, scaled from Quake at 32 units a metre
  P_R: '0.5', // radius
  P_EYE: '1.6',
  P_TOP: '1.8',
  RUN: '10', // sv_maxspeed 320
  STOP: '3', // sv_stopspeed 100
  FRIC_DT: '0.032', // sv_friction 4, per tick
  ACCEL_DT: '0.08', // sv_accelerate 10, per tick
  AIRCAP: '1', // Quake's 30-unit air wishspeed cap
  GP_DT: '0.16', // 20 m/s^2 on players, per tick
  JUMP: '7',
  ZRUN: '12.5', // the arena's zombies and juggernaut run a quarter faster
  ZJUMP: '8.5', // and jump 1.8 m, not 1.2
  SNAP: '0.25', // the ground follows walking feet within this
  PVMAX2: '6400', // (80 m/s)^2
  // weapons
  ROCKET_V: '40',
  ROCKET_S: '50', // ball impulse at the centre, m/s
  ROCKET_RAD: '5',
  GREN_V: '18',
  GREN_UP: '3',
  GREN_S: '20',
  GREN_RAD: '4',
  KNOCK: '0.5', // players take this share of a blast
  ROCKET_HIT: '0.3', // rocket centre to ball centre at contact
  GREN_R: '0.12',
  GREN_HIT: '0.32', // GREN_R + R
  // the cup
  CUP_R2: '0.25', // (0.5 m)^2
  CUP_V2: '64', // (8 m/s)^2
};
export const SLEEP_TICKS = 30;

// Every field a slice of the region overlaps, with the element range inside
// each, for compare.mjs.
export function describeSlice(s) {
  const lo = REGION + s * SLICE;
  const hi = lo + SLICE;
  const fields = [
    ['HDR', REGION, PLAYERS, 1],
    ['PLAYERS', PLAYERS, PROJ, 64],
    ['PROJ', PROJ, PROJ + 0x8000, 32],
    ['PAD', PROJ + 0x8000, PX, 1],
    ['PX', PX, PY, 4], ['PY', PY, PZ, 4], ['PZ', PZ, VX, 4],
    ['VX', VX, VY, 4], ['VY', VY, VZ, 4], ['VZ', VZ, FLAGS, 4],
    ['FLAGS', FLAGS, SLEEP, 1], ['SLEEP', SLEEP, OWNER, 1], ['OWNER', OWNER, REGION + REGION_SIZE, 2],
  ];
  const parts = [];
  for (const [name, a, b, size] of fields) {
    const from = Math.max(lo, a);
    const to = Math.min(hi, b);
    if (from < to) parts.push(`${name}[${Math.floor((from - a) / size)}..${Math.ceil((to - a) / size) - 1}]`);
  }
  return parts.join(' + ');
}

// ---- The arena: src/ built with ARENA (build/arena/game.wasm). The same
// world, netcode and lockstep, a deathmatch on it: shields and health, two
// guns carried, frag grenades, melee, pickups on pads, respawns. Golf's
// balls, cup and hole clock are left out; the hole states run the match
// (H_COUNT before it, H_PLAY during it, H_OVER for the scoreboard).
//
// Its input word, laid on golf's fields so wire v4 codes it as tightly (a
// small turn is a small yaw delta, pitch is golf's, the high byte holds what
// changes least): yaw b0-10 (1/2048 turn) | melee b11 and grenade b12 (each
// flips once a press) | gun slot b13 | pitch b14-23 (512 level) | move
// b24-27 (forward, back, left, right) | jump b28 | shot counter b29-30 |
// b31 one bit of an 8-tick frame, bit (tick & 7), the frame starting on a
// tick that is a multiple of 8. A frame's b0 says one is sent: then b1-5
// are the view lag in ticks, b6 asks for a reload, b7 a pickup. A client
// sends one only when it has news (or once a second), so between them its
// word stays put and costs nothing on the wire.
export const AW_PITCH = 14;
export const AW_MOVE = 24;
export const AW_JUMP = 28;
export const AW_SHOT = 29;
export const AW_MELEE = 11;
export const AW_GREN = 12;
export const AW_SLOT = 13;
export const AW_SERIAL = 31;
export const AF_SENT = 1; // the frame's bits
export const AF_LAG_SHIFT = 1;
export const AF_RELOAD = 64;
export const AF_USE = 128;
export const FRAME_EVERY = 128; // ticks: an unchanged lag is sent again this often
export const LAG_MAX = 31;

// A fighter's fields in the player record, where golf keeps its own.
export const A_NEEDT = 29; // u8 ticks until stuck needles fall out
export const A_RELOAD = 31; // u8 ticks of reload left
export const A_HP = 34; // u8 health, 0..100
export const A_SH = 35; // u8 shields, 0..100
export const A_SHT = 36; // u16 ticks until the shields recharge
export const A_GUN = 38; // u8 x 2, the weapon in each slot (W_*), 0 for none
export const A_MAG = 40; // u8 x 2, rounds in each
export const A_RES = 42; // u16 x 2, rounds in reserve
export const A_GRENS = 46; // u8 frag grenades
export const A_ACT = 47; // u8 AB_*: the last melee and grenade bits, the slot, a pending use
export const A_KILLS = 48; // u16
export const A_DEATHS = 50; // u16
export const A_RESPAWN = 54; // u16 ticks until a dead fighter comes back
export const A_COOL = 56; // u16 ticks until the next melee or grenade
export const A_BURST = 58; // u8 rounds left in a burst
export const A_LAG = 59; // u8 view lag in ticks, from the last whole frame
export const A_FRAME = 60; // u8 the frame so far
export const A_NEEDLES = 61; // u8 needles stuck in this fighter
export const A_NEEDLER = 62; // u8 whose
export const A_HITBY = 63; // u8 who hit this fighter last
export const AB_MELEE = 1;
export const AB_GREN = 2;
export const AB_SLOT = 4;
export const AB_USE = 8;
export const AB_HELD = 16; // a carrier's trigger counter moved last tick: a trigger held down doesn't swing
export const PF_DEAD = 8;
export const J_TGT = 27; // u8 a needle's target
export const J_HOME = 29; // u8 1 when it has one
export const K_BOLT = 3;
export const K_NEEDLE = 4;

// Arena state past the projectiles (not in the prediction's copy): weapon
// pads and spawn points, laid out at init from the map.
export const ARENA = REGION + 0xc100;
export const NPAD = 12;
export const PAD = ARENA; // 12 x 16 B: f32 x, y, z | u8 weapon | u8 0 | u16 ticks until it's back
export const PAD_SIZE = 16;
export const NSPAWN = 32;
export const SPAWNS = ARENA + 0x100; // 32 x 16 B: f32 x, y, z | u32 0
export const SPAWN_SIZE = 16;
// Where every fighter stood after each of the last 32 ticks, for shots
// checked where the shooter saw their target: 32 x 256 x 16 B (f32 x, y, z,
// u32 0), slot tick & 31. It takes the balls' place.
export const HIST = REGION + 0x10000;
export const HIST_TICK = NPLAYER * 16;

// The match. FIESTA 1: ten minutes, everyone spawning with two guns drawn at
// random and two frags, no guns on the map, the most kills at the end wins.
// FIESTA 0 (slayer): an assault rifle and a magnum, guns on pads, first to
// FRAG_LIMIT kills or the most at the end. A build-time switch (#if FIESTA).
export const FIESTA = 1;
export const FRAG_LIMIT = 25;
export const MATCH_TICKS = 75000; // 10 min
export const RESPAWN_TICKS = 375; // 3 s
export const SHIELD_DELAY = 625; // 5 s without a hit before the shields come back
export const NEEDLE_TICKS = 250; // 2 s
export const SUPERCOMBINE = 7; // needles in one fighter at once
export const COOL_TICKS = 80;
export const SWAP_TICKS = 40;
export const A_FUSE = 225; // 1.8 s


// The map (tools/map.mjs builds it from maps/<name>/ into the arena's wasm, as
// a passive data segment that init copies out): static, the same on every
// machine, outside the region like the terrain, so never hashed or
// snapshotted. Its height and surface images go straight into TERRAIN_H and
// TERRAIN_S; the rest lands here. The structures are axis-aligned boxes in
// groups, each group with the box that bounds it, so a query skips whole
// buildings; teleporters are one-way, from a pad to a point.
export const MAP = 0x200000;
export const MAP_NBOX = MAP + 0; // u32
export const MAP_NGROUP = MAP + 4;
export const MAP_NTELE = MAP + 8;
export const MAP_NSPAWN = MAP + 12;
export const MAP_NPAD = MAP + 16;
export const MAP_CEILING = MAP + 20; // f32 flight's ceiling (tools/map.mjs), written by its init; 0 in the arena's
export const MAP_VOID = MAP + 24; // f32 a fighter whose feet are below it dies by falling (map.json "void"); 0 none
export const MAP_BOUNDS = MAP + 32; // f32 x0, x1, z0, z1: where fighters can go
export const MAP_SPAWN = MAP + 0x40; // 32 x 8 B: f32 x, z; a fighter spawns on what is under (x, z) from MAP_SPAWNY up
export const MAP_SPAWNY = MAP + 0x140; // 32 x f32: the highest feet a spawn may stand at (-1000: the ground)
export const MAP_PADS = MAP + 0x1c0; // 12 x 16 B: f32 x, z, top (as MAP_SPAWNY) | u32 weapon
export const MAP_TELE = MAP + 0x280; // 16 x 32 B: f32 x, y, z, radius, to x, y, z | u32 0
export const MAP_HEAD = 0x480; // the bytes above, copied whole
export const MAP_GROUPS = MAP + 0x480; // 64 x 32 B: f32 x0, y0, z0, x1, y1, z1 | u32 first box, count
export const MAP_BOXES = MAP + 0xc80; // 2048 x 32 B: f32 x0, y0, z0, x1, y1, z1 | u32 material, group
// The objectives the arena's team modes play for (tools/map.mjs fills them in,
// defaulting any the map leaves out): the two flags' stands, red's then blue's
// (f32 x, z, top | u32 0), the skull's spot (the same), and up to NHILL hills
// (f32 x, z, top, radius), MAP_NHILL of them. Tops as MAP_SPAWNY.
export const MAP_OBJ = MAP + 0x10c80;
export const MAP_NHILL = MAP_OBJ; // u32
export const MAP_FLAGS = MAP_OBJ + 0x10; // 2 x 16 B
export const MAP_BALL = MAP_OBJ + 0x30; // 16 B
export const MAP_HILLS = MAP_OBJ + 0x40; // NHILL x 16 B
export const NHILL = 8;
export const MAP_OBJ_SIZE = 0xc0;
export const MAP_END = MAP_OBJ + MAP_OBJ_SIZE;
// Flight's race course (map.json "race", tools/map.mjs), after the rest: u32
// gates, 12 B zero, then up to NGATE x 16 B: f32 x, y, z, radius, in order.
// A map without one leaves it 0; flight's init copies it out (src/flight.wat).
export const MAP_RACE = MAP_END;
export const MAP_RACE_END = MAP_RACE + 16 + 16 * 16;
// Moving boxes (map.json's structures' "move", tools/map-compile.mjs): a row
// a group (NGROUP of them, MOVE_SIZE bytes each), a group whose row's flags
// are 0 standing still. f32 dx, dy, dz: where its far end is from where it is
// built; u32 the ticks each way (1 or more), the ticks it waits at each end,
// the ticks added to the room's tick (its phase); u32 flags (MV_ON, MV_EASE);
// u32 0. Where a mover is is the room's tick and nothing else ($mv in
// src/arena.wat), so it is in no record and every bank's tick places it.
export const MAP_MOVE = MAP_RACE_END;
export const MOVE_SIZE = 32;
export const MAP_MOVE_END = MAP_MOVE + 64 * MOVE_SIZE; // NGROUP rows
export const TICK_HZ = 125; // the sim's rate: a second is this many ticks
export const MV_ON = 1;
export const MV_EASE = 2; // eased in and out (3f^2 - 2f^3) rather than at one speed
export const MV_TICKS_MAX = 1000000; // each way, waiting, or the phase: 2 h 13 min
export const MV_STEP_MAX = 0.2; // m a tick a mover may go (25 m/s): under PHYS.SNAP, so what rides one down stays on it
// The map's rules (map.json "movement" and "mode", tools/map-compile.mjs),
// after the movers' rows: u32 flags (RU_GAIT: a fighter walks, jumps and
// falls by the f32s below, not by PHYS's Quake numbers: a Roblox place's
// Humanoid, as tools/rbx-map.mjs reads it); u32 a mode every match on the map
// plays, + 1 (0: the room's rotation); f32 the walking speed (m/s) and the
// fast legs' (zombies', the juggernaut's, a lucky block's), the most the
// speed across may change in a tick toward where the keys point (on the
// ground and in the air alike), the jump's speed up (m/s) and the fast legs',
// and gravity a tick (m/s). A map without them leaves all 0, and $move goes
// on as it always has.
export const MAP_RULES = MAP_MOVE_END;
export const MAP_RULES_SIZE = 32;
export const RU_GAIT = 1;
export const RU_FLAGS = 0; // byte offsets in MAP_RULES
export const RU_MODE = 4;
export const RU_WALK = 8;
export const RU_ZWALK = 12;
export const RU_ACCEL = 16;
export const RU_JUMP = 20;
export const RU_ZJUMP = 24;
export const RU_GRAV = 28;
export const RU_MAX = 100; // map_load takes each of the six f32s over 0 and at most this
export const NBOX = 2048; // a place brought from Roblox (tools/roblox.mjs) wants hundreds to thousands
// A map from outside the build, packed (tools/map-compile.mjs packMap) for the
// arena's and flight's map_load export: a head, then the bytes a build's own
// map segment holds. The host writes it at MAP_STAGE, the keyframe slots,
// which nothing uses before init, so at most MAP_STAGE_MAX bytes.
export const MAPPACK_MAGIC = 0x324d4751; // "QGM2": QGM1's head, and the movers
export const MAPPACK_HEAD = 80;
// u32 fields of the head: the magic, the bytes after it, where each part of
// the map is in them and how big (as MAPSEG_* name them in a build), the
// images' place and size in samples (MAPIMG_*); then f32 the ceiling; then
// where the movers' rows are and how many bytes (0, none), and the rules'
export const MP_MAGIC = 0;
export const MP_BYTES = 4;
export const MP_GROUPS = 8;
export const MP_NGROUPB = 12;
export const MP_BOXES = 16;
export const MP_NBOXB = 20;
export const MP_H = 24;
export const MP_S = 28;
export const MP_OBJ = 32;
export const MP_RACE = 36;
export const MP_NRACEB = 40;
export const MP_X0 = 44;
export const MP_Z0 = 48;
export const MP_W = 52;
export const MP_HT = 56;
export const MP_CEIL = 60;
export const MP_MOVE = 64;
export const MP_NMOVEB = 68;
export const MP_RULES = 72; // where the map's rules are (MAP_RULES_SIZE bytes) and how many bytes (0, none)
export const MP_NRULESB = 76;
export const MAP_STAGE = 0x0a0000; // SNAP0
export const MAP_STAGE_MAX = 0x100000; // to DVX
export const NGROUP = 64;
export const NTELE = 16;
export const BOX_SIZE = 32;
export const TELE_SIZE = 32;
export const STEP = '0.5'; // a fighter walks up onto a box this much higher than its feet
export const MAPS = 'maps';
export const MAP_NAME = 'canyon'; // the arena's map unless the build is given another

// Weapons, by W_* (index 0 is none). Reloads fit a u8 of ticks. type: 0 hitscan, 1 projectile, 2 sword.
// head: 0 none, 1 a headshot kills once the shields are down, 2 it always
// kills. spread in yaw units (1/16384 turn). The sim reads this through the
// (!arm field w) macro, the client for the HUD.
export const W_AR = 1;
export const W_BR = 2;
export const W_MAGNUM = 3;
export const W_SNIPER = 4;
export const W_SHOTGUN = 5;
export const W_ROCKET = 6;
export const W_PLASMA = 7;
export const W_NEEDLER = 8;
export const W_SWORD = 9;
export const ARMS = [
  null,
  { name: 'ASSAULT RIFLE', type: 0, auto: 1, refire: 11, mag: 32, res: 192, dmg: 8, head: 0, spread: 40, pellets: 1, range: 90, reload: 220, zoom: 1 },
  { name: 'BURST RIFLE', type: 0, auto: 0, refire: 44, mag: 36, res: 108, dmg: 9, head: 1, spread: 6, pellets: 1, range: 160, reload: 220, zoom: 2, burst: 3 },
  { name: 'MAGNUM', type: 0, auto: 0, refire: 22, mag: 8, res: 40, dmg: 28, head: 1, spread: 4, pellets: 1, range: 110, reload: 160, zoom: 2 },
  { name: 'SNIPER RIFLE', type: 0, auto: 0, refire: 75, mag: 4, res: 20, dmg: 120, head: 2, spread: 0, pellets: 1, range: 420, reload: 240, zoom: 5 },
  { name: 'SHOTGUN', type: 0, auto: 0, refire: 105, mag: 6, res: 18, dmg: 15, head: 0, spread: 260, pellets: 15, range: 28, reload: 250, zoom: 1 },
  { name: 'ROCKET LAUNCHER', type: 1, auto: 0, refire: 110, mag: 2, res: 6, dmg: 230, head: 0, spread: 0, pellets: 1, range: 0, reload: 250, zoom: 2, kind: 1, speed: 36 },
  { name: 'PLASMA RIFLE', type: 1, auto: 1, refire: 13, mag: 100, res: 0, dmg: 10, head: 0, spread: 40, pellets: 1, range: 0, reload: 0, zoom: 1, kind: 3, speed: 70 },
  { name: 'SEEKER', type: 1, auto: 1, refire: 14, mag: 20, res: 60, dmg: 6, head: 0, spread: 70, pellets: 1, range: 0, reload: 230, zoom: 1, kind: 4, speed: 34 },
  { name: 'SWORD', type: 2, auto: 0, refire: 70, mag: 10, res: 0, dmg: 255, head: 0, spread: 0, pellets: 1, range: 5, reload: 0, zoom: 1 },
];
export const MELEE_DMG = 70;
export const GREN_DMG = 150;
export const SUPER_DMG = 250;
// kill feed causes past the weapons
export const KILL_GREN = 10;
export const KILL_MELEE = 11;
export const KILL_BEHIND = 12;
export const KILL_SUPER = 13;
export const KILL_FALL = 14;
export const KILL_CARRY = 15; // a flag or the skull swung by its carrier

// More FX kinds, for the arena. A tracer's record is its end (the hit, or
// where the ray gave out), the weapon as its size, the shot number; a hit's is
// where it landed, the victim as `shot`, and what it struck as its size
// (1 shields, 2 health, 3 the head); a kill's, the killer as owner, the victim
// as `shot`, the cause (W_* or KILL_*) as its size.
export const FX_TRACER = 4;
export const FX_HIT = 5;
export const FX_KILL = 6;
export const FX_SPAWN = 7;
export const FX_PICKUP = 8;
export const FX_MELEE = 9;
export const FX_TELE = 10; // a fighter through a teleporter: where it came out, the slot as owner

// Modes: the rules of a match, chosen at run time as its countdown starts, all
// on the one build. Match k of a room (HDR_HOLE counts them) plays
// ARENA_MODES[k % length], so a room's first match is always M_FIESTA (the
// build's own rules above: Fiesta, or slayer with FIESTA 0). A seed whose top
// byte is FORCE_MODE plays mode (seed >>> 16) & 0xff every match, for gates
// and dev. M_FIESTA leaves every field below at 0, so a Fiesta's region is
// what it always was.
//   M_INFECTION (ZOMBIES): at the countdown's end one fighter in ten (at least
//   one) is drawn a zombie: an energy sword that never runs out, ZRUN and
//   ZJUMP, no shields (and so no dying to a head shot that kills through
//   them), half the damage of any gun but the shotgun; humans get a shotgun,
//   a magnum and two frags. Neither side hurts its own. A human who dies
//   comes back a zombie; if the zombies all leave, another is drawn. Over
//   when no human is left, or at the clock.
//   M_GUNGAME: the LADDER's guns in order; a kill moves the killer
//   up a rung (its gun, full, at once), an assassination moves the victim
//   down one, the first kill with the sword wins. No pads.
//   M_JUGGERNAUT: one fighter drawn the juggernaut (the sword, an
//   overshield, a zombie's legs); everyone else is on one side against it.
//   Kill it to become it; a kill as the juggernaut is a point, JUGG_POINTS win.
export const M_FIESTA = 0;
export const M_INFECTION = 1;
export const M_GUNGAME = 2;
export const M_JUGGERNAUT = 3;
// The team modes: red against blue (P_FL's PF_BLUE), each its own files on the
// kit (AM below): src/am/<key>.wat and .mjs, client/am/<key>.mjs.
//   M_SLAYER (TEAM DEATHMATCH): every kill scores for your side, a death by your own hand takes
//   one off; AH_TARGET (TS_PER a fighter on the larger side, at least TS_MIN) wins.
//   M_CTF: a flag on each side's stand; bring theirs to yours while yours is
//   home; CF_CAPS captures win.
//   M_ODDBALL (KEEP AWAY): one skull; every second your side holds it is a point; OB_TARGET win.
//   M_HILL: one hill at a time, moving; every second your side holds it (more
//   of you on it than of them) is a point; HL_TARGET win.
//   M_HEADHUNT: a death drops its fighter's skulls and one more; carry them
//   to the drop zone, moving round the map's hills, to bank a point each.
//   M_TERRITORY: every hill of the map a territory, all up at once; more of
//   you on one takes it; every 2 s a point a territory held; TR_TARGET win.
//   M_VIP: a VIP each side, drawn again after it dies; a kill of theirs is a
//   point; VP_TARGET win.
//   M_ASSAULT: one bomb mid-field; carry it to their stand and plant it; it
//   goes off for a point unless they defuse it; AS_TARGET win.
// In a team mode everyone spawns on their own half with an assault rifle and
// a magnum, the map's pads are laid, and a flag's or the skull's carrier has
// no guns or frags, only a swing that kills (PF_CARRY).
// A mode on the kit may have no sides (MODES' team 0: everyone for itself,
// as in a Fiesta), its hooks called all the same:
//   M_LUCKY (LUCKY BLOCKS): everyone spawns with a magnum alone; blocks on the
//   map's spots pay out at random when shot, struck or blown up (a gun, an
//   overshield, legs, frags, or a blast on whoever broke it); LK_TARGET kills win.
export const M_SLAYER = 4;
export const M_CTF = 5;
export const M_ODDBALL = 6;
export const M_HILL = 7;
export const M_HEADHUNT = 8;
export const M_TERRITORY = 9;
export const M_VIP = 10;
export const M_ASSAULT = 11;
export const M_LUCKY = 12;
// Evade, on the kit with no sides too:
//   M_EVADE: everyone against the chasers; a chaser that reaches a fighter
//   downs it (PF_DOWN), the still beside it revive it, downed ED_BLEED it's
//   out; survive the clock. Its constants in src/am/evade.mjs.
export const M_EVADE = 13;
// Escape, on the kit with no sides too (one hunter against the room):
//   M_ESCAPE: one fighter in ES_PER the hunter (PF_JUGG: the sword, a
//   zombie's legs, no hurt), the rest survivors with no guns, a shove that
//   stuns it. Its swing downs (PF_DOWN, Evade's), held still over the downed
//   it finishes; hack the terminals, the exits open, escape. Its constants in
//   src/am/escape.mjs.
export const M_ESCAPE = 14;
// Crossroads, on the kit with no sides, never in the rotation: a map that
// names it plays it (map.json "mode", as tools/roblox.mjs writes it for a
// place that hands everyone Roblox's classic gear), or a forced seed.
//   M_CROSSROADS: Roblox's Crossroads' rules: the classic sword, rocket
//   launcher and superball, a Humanoid's 100 health and no shields, healing
//   1 a second, 5 s to respawn; the most KOs at the clock win. Its constants
//   in src/am/crossroads.mjs.
export const M_CROSSROADS = 15;
// name is what a player sees (the M_* and FIESTA names are only the code's)
export const MODES = [
  { name: FIESTA ? 'GRAB BAG' : 'FREE FOR ALL', rules: FIESTA ? 'RANDOM GUNS  MOST KILLS IN 10 MIN' : `${FRAG_LIMIT} KILLS WIN`, ticks: MATCH_TICKS },
  { name: 'ZOMBIES', rules: 'ZOMBIES HAVE SWORDS  STAY HUMAN FOR 3 MIN', ticks: 22500 },
  { name: 'GUN GAME', rules: 'EVERY KILL A NEW GUN  FIRST SWORD KILL WINS', ticks: 37500 },
  { name: 'JUGGERNAUT', rules: 'KILL THE JUGGERNAUT TO BECOME IT  10 POINTS', ticks: 37500 },
  { name: 'TEAM DEATHMATCH', rules: 'RED V BLUE  EVERY KILL SCORES FOR YOUR SIDE', ticks: 60000, team: 1, pads: 1 },
  { name: 'CAPTURE THE FLAG', rules: 'BRING THEIR FLAG HOME TO YOURS  3 TO WIN', ticks: 75000, team: 1, pads: 1 },
  { name: 'KEEP AWAY', rules: 'HOLD THE SKULL  A POINT A SECOND  100 TO WIN', ticks: 45000, team: 1, pads: 1 },
  { name: 'KING OF THE HILL', rules: 'HOLD THE HILL  A POINT A SECOND  IT MOVES', ticks: 45000, team: 1, pads: 1 },
  { name: 'SKULL HUNT', rules: 'KILLS DROP SKULLS  BANK THEM IN THE ZONE', ticks: 45000, team: 1, pads: 1 },
  { name: 'TERRITORIES', rules: 'TAKE THE TERRITORIES  HOLD THEM TO SCORE', ticks: 45000, team: 1, pads: 1 },
  { name: 'VIP', rules: 'GUARD YOUR VIP  KILL THEIRS  10 TO WIN', ticks: 45000, team: 1, pads: 1 },
  { name: 'ASSAULT', rules: 'PLANT THE BOMB AT THEIR BASE  3 TO WIN', ticks: 60000, team: 1, pads: 1 },
  { name: 'LUCKY BLOCKS', rules: 'BREAK THE BLOCKS FOR LOOT  15 KILLS WIN', ticks: 37500, team: 0 },
  { name: 'EVADE', rules: 'RUN FROM THE CHASERS  REVIVE THE DOWNED  SURVIVE', ticks: 26250, team: 0 },
  { name: 'ESCAPE', rules: 'HACK THE TERMINALS  REACH AN EXIT  OUTRUN THE HUNTER', ticks: 30000, team: 0 },
  { name: 'CROSSROADS', rules: 'SWORD  ROCKET  SUPERBALL  MOST KOS IN 10 MIN', ticks: 75000, team: 0 },
];
export const MODE_TICKS = MODES.map((m) => m.ticks);
// a room opens on a Fiesta, then two team matches to every free-for-all, and Lucky Blocks, Evade and Escape before it comes round
export const ARENA_MODES = [M_FIESTA, M_SLAYER, M_HEADHUNT, M_INFECTION, M_CTF, M_TERRITORY, M_GUNGAME, M_ODDBALL, M_VIP, M_JUGGERNAUT, M_HILL, M_ASSAULT, M_LUCKY, M_EVADE, M_ESCAPE];
export const FORCE_MODE = 0xa8;
export const TEAMED = MODES.reduce((b, m, k) => (m.team ? b | (1 << k) : b), 0); // red against blue
export const PAD_MODES = MODES.reduce((b, m, k) => (m.pads ? b | (1 << k) : b), 0); // the FIESTA build lays the map's pads for these
// modes that keep a fighter's health their own way (Crossroads' Humanoid): the core recharges no shields and no health in them
export const OWN_HEALTH = 1 << M_CROSSROADS;
export const TEAM_MODES = (1 << M_INFECTION) | (1 << M_JUGGERNAUT) | TEAMED | (1 << M_EVADE) | (1 << M_ESCAPE); // modes with sides: no hurting your own (Evade's one side, everyone; Escape's hunters and survivors)
export const LADDER = [W_AR, W_BR, W_MAGNUM, W_SHOTGUN, W_PLASMA, W_NEEDLER, W_SNIPER, W_ROCKET, W_SWORD];
export const JUGG_POINTS = 10;
export const ZRESPAWN_TICKS = 250; // 2 s: a zombie comes back sooner
export const OVERSHIELD = 200; // the juggernaut's shields; they recharge only to 100
// In the header past golf's fields (inside the prediction's copy):
export const AH_MODE = REGION + 0x48; // u32 M_*: this match's
export const AH_HUMANS = REGION + 0x4c; // u32 Infection: live humans, counted every tick of play
export const AH_ZOMBIES = REGION + 0x50; // u32 Infection: live zombies
export const AH_LEADER = REGION + 0x54; // u32 gun game, Lucky Blocks: the leader + 1; Juggernaut: the juggernaut + 1 (0 none)
export const AH_WINNER = REGION + 0x58; // u32 gun game: the sword's killer + 1; Juggernaut: who reached JUGG_POINTS + 1; Lucky Blocks: LK_TARGET kills
// The team modes' (TEAMED), red's then blue's where there are two:
export const AH_SCORE = REGION + 0x5c; // u32 x 2: each side's score (kills, captures, seconds held)
export const AH_TARGET = REGION + 0x64; // u32 the score that wins, set as play starts (0: none)
export const AH_TEAMWIN = REGION + 0x68; // u32 set as the match ends: 1 red won, 2 blue, 3 a draw (0 still playing)
export const AH_TEAMN = REGION + 0x6c; // u32 x 2: live fighters on each side, counted every tick
export const AH_END = REGION + 0x74; // AH_MODE up to here is cleared as a mode is picked
// A fighter's side, in P_FL (the prediction reads it: a zombie's legs are predicted):
export const PF_ZOMBIE = 16; // Infection: a zombie
export const PF_JUGG = 32; // Juggernaut: the juggernaut
export const PF_BLUE = 64; // a team mode: on blue (red without it)
export const PF_CARRY = 128; // a team mode: carrying the flag or the skull (no guns, no frags, a swing that kills)
export const PF_FAST = 4; // Lucky Blocks: a zombie's legs for a while (golf's PF_DONE, which the arena never sets)
export const PF_DOWN = PF_CARRY | PF_FAST; // Evade, Escape: downed (a crawl, no jump, no guns, no swing), both bits, which no other mode sets together; Escape's hunter stunned
// Per fighter, past the spawn points (hashed, in every keyframe, not in the
// prediction's copy: only the confirmed world reads it), cleared as a mode is picked:
export const MODE_REC = ARENA + 0x300; // 256 x 8 B
export const MR_SIZE = 8;
export const MR_RUNG = 0; // u8 gun game: the rung (0 the assault rifle .. 8 the sword, 9 won)
export const MR_PLACE = 1; // u8 where it finished (1 first, ties share), set as a match of a mode ends
export const MR_POINTS = 2; // u16 Infection: humans infected; Juggernaut: kills as the juggernaut
export const MR_HUMAN = 4; // u16 Infection: ticks lived as a human
// A team mode's own (the same bytes): MR_POINTS the fighter's objective score
// (captures, seconds holding the skull or the hill; Team Slayer's kills are A_KILLS), and
export const MR_AUX = 4; // u16 a second stat (CTF: flags returned)
// The team mode's objective (each mode lays its own fields out in it, in
// src/am/<key>.mjs): hashed and in every keyframe, not in the prediction's
// copy, cleared as a mode is picked, so a Fiesta leaves it 0.
export const AO = ARENA + 0xb00; // REGION + 0xcc00
export const AO_SIZE = 0x400;
// FX_MODE: a mode's news for the feed, what happened as its size, who as owner, whom as shot.
export const FX_MODE = 14;
export const MX_INFECT = 1; // owner infected shot (owner == shot: a human died alone and turned)
export const MX_ZOMBIE = 2; // owner was drawn a zombie
export const MX_LAST = 3; // owner is the last human
export const MX_RUNG = 4; // owner moved up to rung shot
export const MX_DEMOTE = 5; // owner was moved down to rung shot
export const MX_WIN = 6; // owner won the match
export const MX_JUGG = 7; // owner is the juggernaut
export const MX_TEAMWIN = 8; // a team mode's match is over: shot AH_TEAMWIN (1 red, 2 blue, 3 a draw), owner 0
// Each team mode's own news: MX codes MX_AM + 8 k .. + 7 for AM[k] (in its .mjs).
export const MX_AM = 16;

// The arena's kit of team modes: mode AM[k].mode is src/am/<key>.wat, its
// hooks $<prefix>_start, _tick, _kill and _bar called through (!am) while it
// is on, and any of the optional ones named in its hooks: _strike (a shot's
// line, a swing's reach or a blast, on the confirmed world in play),
// _spawn (a fighter armed as it comes into the fight) and _hurt (damage
// about to be dealt, which the mode may take in its place).
export const AM = [
  { mode: M_SLAYER, key: 'slayer', prefix: 'ts' },
  { mode: M_CTF, key: 'ctf', prefix: 'cf' },
  { mode: M_ODDBALL, key: 'oddball', prefix: 'ob' },
  { mode: M_HILL, key: 'hill', prefix: 'hl' },
  { mode: M_HEADHUNT, key: 'headhunter', prefix: 'hh' },
  { mode: M_TERRITORY, key: 'territories', prefix: 'tr' },
  { mode: M_VIP, key: 'vip', prefix: 'vp' },
  { mode: M_ASSAULT, key: 'assault', prefix: 'as' },
  { mode: M_LUCKY, key: 'lucky', prefix: 'lk', hooks: ['strike', 'spawn'] },
  { mode: M_EVADE, key: 'evade', prefix: 'ed', hooks: ['strike', 'spawn'] },
  { mode: M_ESCAPE, key: 'escape', prefix: 'es', hooks: ['spawn', 'hurt'] },
  { mode: M_CROSSROADS, key: 'crossroads', prefix: 'cx', hooks: ['spawn', 'hurt'] },
];
export const AM_HOOKS = ['start', 'tick', 'kill', 'bar']; // every mode on the kit has these
export const KIT = AM.reduce((b, m) => b | (1 << m.mode), 0); // the modes on the kit, sides or none
// Each team mode's own constants (src/am/<key>.mjs), gathered as one object
// the assembler spreads into its scope, as MG_CONSTS is, and not names of this
// module (V8's dictionary line, below); JS reads them from src/am/consts.mjs.
import * as am_consts from './am/consts.mjs';
export const AM_CONSTS = Object.freeze({ ...am_consts });

// ---- Flight: src/ built with ARENA and FLIGHT (build/flight/game.wasm). The
// arena's world, match, sides and netcode, every fighter a ship
// (src/flight.wat): the word's yaw and pitch are where the pilot aims and the
// nose turns toward them; forward boosts, back brakes, melee's bit rolls,
// grenade's drops a bomb, the jump bit holds the charge shot, the trigger
// fires lasers. Its constants are src/flight.mjs, gathered for the assembler
// as a minigame's are. A match plays FLIGHT_MODES in turn (a forced mode
// outside them is a free-for-all).
import * as flight_consts from './flight.mjs';
export const FLIGHT_CONSTS = Object.freeze({ ...flight_consts });
export const FLIGHT_MODES = [M_FIESTA, M_SLAYER, M_JUGGERNAUT, flight_consts.M_RACE];
export const FLIGHT_OK = FLIGHT_MODES.reduce((b, m) => b | (1 << m), 0);
// a flight match's clock by mode: the arena's, and Ring Race's past them
export const FLIGHT_TICKS = [...MODES.map((m) => m.ticks), flight_consts.RACE_TICKS];

// ---- The ball: src/ built with BUMPER (which party, below, always sets with
// PARTY). The same world, netcode and lockstep; every player is a ball. Balls
// bump: an elastic hit with a kick on top, heavier balls shoved less.
// Power-ups: roll over one to hold it, fire to use it. Golf's balls, cup and
// guns are left out; the hole states run the round (H_COUNT before it,
// H_PLAY during it, H_OVER after). (Bumper balls, the game this began as, a
// wheel of Swiss cheese, is party's SWISS ROLL: src/mg/cheese.wat.)
//
// The input word is golf's (yaw b0-13, move b24-27, jump b28 for a hop, the
// shot counter b29-30 to use the power-up held); pitch and b31 are unused,
// so a client keeps them still and they cost nothing on the wire.
export const B_CX = 512; // the stage's centre, world x and z (a round's PG_CX by default)
export const ROUND_TICKS = 11250; // 90 s, a round's length unless its minigame says
export const ORB_Y = 36; // m above the floor a power-up starts falling from
export const MEGA_TICKS = 1000; // 8 s
export const DASH_TICKS = 60;
export const USE_REFIRE = 40;
export const CREDIT_TICKS = 375; // a ball out within 3 s of a bump is the bumper's KO
export const OUT_DEPTH = 14; // m under the floor a falling ball is out

// The header, in golf's tee and cup fields (all inside the prediction's copy).
export const BH_N0 = HDR_TEE + 8; // u32 balls in at the start
export const BH_LEFT = HDR_CUP + 4; // u32 balls still in, counted every tick
export const BH_WINNER = HDR_CUP + 8; // u32 the last round's winner, 255 for none or a shared win

// serial scratch for laying a round out (spawn candidates) and the bump pass (the balls in): never hashed
export const B_SCR = DVX;

// A ball's fields in the player record, where golf keeps its own.
export const B_ITEM = 29; // u8 the power-up held (PU_*), 0 none
export const B_HOLE = 31; // u8 the hole a falling ball went down, 255 the rim
export const B_MEGA = 34; // u16 ticks of MEGA left
export const B_WINS = 36; // u16 rounds won
export const B_KOS = 38; // u16 balls knocked out
export const B_HITBY = 40; // u8 who bumped this ball last
export const B_PLACE = 41; // u8 where it finished last round (1 won), 0 while it's in
export const B_HITT = 42; // u16 ticks that bump still counts
export const B_DASH = 44; // u16 ticks of a dash's glow left
export const B_ROUNDS = 46; // u16 rounds played
export const B_OUTAT = 48; // u32 tick it went out
export const B_BUMPS = 54; // u16 hard bumps dealt
export const PF_FALL = 16; // under the cheese's top: going down a hole or off the rim
export const PF_STOMP = 32; // a SPRING jump: landing shoves everyone near

// Power-ups, by PU_* (index 0 is none).
export const PU_MEGA = 1; // 1.6 times the size, three times the weight, for 8 s
export const PU_DASH = 2; // a burst of speed where you face
export const PU_POW = 3; // a shockwave: everyone near is shoved away
export const PU_ROCKET = 4; // golf's club: a rocket where you face, its blast shoves
export const PU_SPRING = 5; // a high jump; the landing shoves everyone near
export const NPU = 5;
export const PU_NAMES = ['', 'MEGA', 'DASH', 'POW', 'ROCKET', 'SPRING'];
export const FX_BUMP = 11; // a hard bump: the two as owner and shot, where they met, how hard (m/s) as size
export const FX_USE = 12; // a power-up used: owner, its use number as shot, the kind as size
export const FX_DROP = 13; // an orb starts to fall: the kind as size

// Physics, as the f32 literals the module inlines.
export const BPHYS = {
  PLAT_Y: '40', // a stage's floor, over the sea
  B_RAD: '1', // a ball's radius
  MEGA_RAD: '1.6',
  MEGA_M: '3', // MEGA's weight
  B_ACC_DT: '0.088', // 11 m/s^2 rolling, per tick
  B_AIR_DT: '0.026', // a third of it in the air
  B_DRAG: '0.9912', // 1.1/s rolling: 10 m/s flat out
  B_AIR_DRAG: '0.998',
  B_HOP: '6',
  B_E: '1', // restitution of a bump
  B_KICK: '5', // m/s more apart on every bump
  DASH_V: '20',
  SPRING_V: '13',
  ROCKET_BV: '30',
  BLAST_UP: '0.35', // a blast lifts as well as shoves
  POW_R: '11', POW_S: '18',
  STOMP_R: '6', STOMP_S: '14',
  BROCKET_R: '5', BROCKET_S: '20',
  ORB_R: '0.7', // an orb's reach, past the ball's radius
  ORB_FALL: '0.08', // 10 m/s, per tick
};

// ---- Party: src/ built with BUMPER and PARTY (build/party/game.wasm).
// The ball, and every round a different minigame on its own stage, up to
// 256 in a room. bumper.wat's ball, power-ups, bumps and blasts; around them
// src/party.wat, the framework (rounds,
// rotation, joins, the ball's move over any stage, outs, places, points),
// which calls each minigame's hooks (src/mg/<key>.wat, named $<prefix>_<hook>)
// through (!mg). A minigame's own constants live in src/mg/<key>.mjs, every
// name under its prefix in capitals, gathered into MG_CONSTS below.
export const MINIGAMES = [
  { key: 'thinice', prefix: 'ti', name: 'THIN ICE' },
  { key: 'color', prefix: 'cc', name: 'COLOR CALL' },
  { key: 'sweep', prefix: 'sw', name: 'SWEEPER' },
  { key: 'light', prefix: 'rl', name: 'RED LIGHT' },
  { key: 'bombs', prefix: 'bo', name: 'BOMB RAIN' },
  { key: 'wall', prefix: 'wl', name: 'THE WALL' },
  { key: 'pads', prefix: 'mp', name: 'MUSICAL PADS' },
  { key: 'hill', prefix: 'kh', name: 'KING OF THE HILL' },
  { key: 'potato', prefix: 'hp', name: 'HOT POTATO' },
  { key: 'coins', prefix: 'cr', name: 'COIN RUSH' },
  { key: 'paint', prefix: 'pp', name: 'PAINT PARTY' },
  { key: 'race', prefix: 'rc', name: 'DOWNHILL' },
  { key: 'chute', prefix: 'fc', name: 'FRUIT CHUTE' },
  { key: 'tag', prefix: 'tg', name: 'TAG' },
  { key: 'snowball', prefix: 'sb', name: 'SNOWBALL' },
  { key: 'tilt', prefix: 'tt', name: 'TILT TABLE' },
  { key: 'lava', prefix: 'lv', name: 'RISING LAVA' },
  { key: 'gale', prefix: 'gf', name: 'GALE FORCE' },
  { key: 'drums', prefix: 'dr', name: 'DRUM ROLL' },
  { key: 'hoops', prefix: 'ho', name: 'HOOPLA' },
  { key: 'pinball', prefix: 'pn', name: 'PINBALL' },
  { key: 'trails', prefix: 'lt', name: 'LIGHT TRAILS' },
  { key: 'maze', prefix: 'mz', name: 'MAZE RUN' },
  { key: 'bullseye', prefix: 'be', name: 'BULLSEYE' },
  { key: 'cannon', prefix: 'cn', name: 'CANNONADE' },
  { key: 'rope', prefix: 'jr', name: 'JUMP ROPE' },
  { key: 'glass', prefix: 'gb', name: 'GLASS BRIDGE' },
  { key: 'gates', prefix: 'gc', name: 'GATE CRASH' },
  { key: 'stomp', prefix: 'sg', name: 'STOMPIN GROUND' },
  { key: 'seesaw', prefix: 'ss', name: 'SEESAWS' },
  { key: 'kart', prefix: 'kt', name: 'KART GRAB' },
  { key: 'disaster', prefix: 'nd', name: 'DISASTER ISLAND' },
  { key: 'slap', prefix: 'sl', name: 'SLAP HAPPY' },
  { key: 'trap', prefix: 'tr', name: 'TRAP RUN' },
  { key: 'parry', prefix: 'py', name: 'PARRY BALL' },
  { key: 'mingle', prefix: 'mi', name: 'MINGLE' },
  { key: 'honey', prefix: 'hc', name: 'HONEYCOMB' },
  { key: 'dodge', prefix: 'db', name: 'DODGEBALL' },
  { key: 'volley', prefix: 'vb', name: 'VOLLEYBALL' },
  { key: 'soccer', prefix: 'so', name: 'SOCCER' },
  { key: 'sumo', prefix: 'su', name: 'SUMO RING' },
  { key: 'cheese', prefix: 'ch', name: 'SWISS ROLL' },
]; // index = MG_*
export const MG_THINICE = 0;
export const MG_COLOR = 1;
export const MG_SWEEP = 2;
export const MG_LIGHT = 3;
export const MG_BOMBS = 4;
export const MG_WALL = 5;
export const MG_PADS = 6;
export const MG_HILL = 7;
export const MG_POTATO = 8;
export const MG_COINS = 9;
export const MG_PAINT = 10;
export const MG_RACE = 11;
export const MG_CHUTE = 12;
export const MG_TAG = 13;
export const MG_SNOWBALL = 14;
export const MG_TILT = 15;
export const MG_LAVA = 16;
export const MG_GALE = 17;
export const MG_DRUMS = 18;
export const MG_HOOPS = 19;
export const MG_PINBALL = 20;
export const MG_TRAILS = 21;
export const MG_MAZE = 22;
export const MG_BULLSEYE = 23;
export const MG_CANNON = 24;
export const MG_ROPE = 25;
export const MG_GLASS = 26;
export const MG_GATES = 27;
export const MG_STOMP = 28;
export const MG_SEESAW = 29;
export const MG_KART = 30;
export const MG_DISASTER = 31;
export const MG_SLAP = 32;
export const MG_TRAP = 33;
export const MG_PARRY = 34;
export const MG_MINGLE = 35;
export const MG_HONEY = 36;
export const MG_DODGE = 37;
export const MG_VOLLEY = 38;
export const MG_SOCCER = 39;
export const MG_SUMO = 40;
export const MG_CHEESE = 41;
export const NMG = 42;

export const PK_OUT = 0; // out is out: the last ball in wins
export const PK_SCORE = 1; // a ball that falls comes back; placed by PG_SCORE at the end
export const PGF_BUMPS = 1; // PG_FLAGS: balls bump
export const PGF_NOKICK = 2; // PG_FLAGS: a bump has no kick, only what the balls bring (elastic)
export const PGF_SIZE = 4; // PG_FLAGS: a ball's radius is its PG_M, an f32 (B_RAD while that's less), its weight the radius cubed
export const PGF_TEAMS = 8; // PG_FLAGS: red against blue (P_FL's PF_BLUE), dealt as the round is laid out; scores by side, placed by side
export const PGF_MATES = 16; // PG_FLAGS, with PGF_TEAMS: teammates bump (and a ball's blast shoves its own side); without it they pass through
export const FORCE_TEAMS = 0x100; // PG_FORCE: every round in teams, whatever its minigame (a test and gate hook)
export const P_COUNT = 750; // 6 s countdown, the minigame's title up
export const P_OVER = 625; // 5 s of the result
export const FX_MG = 32; // minigame k's own FX kinds are FX_MG + 4k .. FX_MG + 4k + 3
export const P_STEP = '0.3'; // a ball rolls up onto anything this much higher than its bottom

// The header, past golf's fields (inside the prediction's copy; Fireplace owns 0xf0..0x100).
export const PG_GAME = REGION + 0x48; // u32 MG_* of the round now (or the next, while laid out for the countdown)
export const PG_KIND = REGION + 0x4c; // u32 PK_*
export const PG_LEN = REGION + 0x50; // u32 the round's length in ticks, from the countdown's end
export const PG_FLOOR = REGION + 0x54; // f32 the lowest floor's top: a ball OUT_DEPTH under it is out (or down)
export const PG_SIZE = REGION + 0x58; // f32 the stage's radius (or half-width), for the camera, the minimap, the bots
export const PG_ACC = REGION + 0x5c; // f32 the push, times bumper's
export const PG_DRAG = REGION + 0x60; // f32 rolling drag a tick with keys held
export const PG_IDLE = REGION + 0x64; // f32 rolling drag a tick with no move keys: lower brakes harder
export const PG_HOP = REGION + 0x68; // f32 hop speed; 0: no hop
export const PG_RESPAWN = REGION + 0x6c; // u32 PK_SCORE: ticks a fallen ball waits
export const PG_FLAGS = REGION + 0x70; // u32 PGF_*
export const PG_FORCE = REGION + 0x74; // u32 0, or MG + 1: every round is that minigame
export const PG_PREV = REGION + 0x78; // u32 the last minigame played (low byte) and the one before, 255 for none
export const PG_CX = REGION + 0x7c; // f32 the stage's centre, world x and z
export const PG_H = REGION + 0x80; // 112 B the minigame's own header (phase, timings, the call, seeds), to 0xf0
export const PG_H_SIZE = 112;
// A team round's (PGF_TEAMS), in golf's tee, cup and par fields that party leaves free (inside the
// prediction's copy), zeroed each round; the side of a ball is P_FL's PF_BLUE (red without it).
export const PG_TSCORE = HDR_TEE; // u32 red's score, then blue's at +4: the minigame adds to them
export const PG_TSIDE = HDR_CUP; // u32 the side of the ball spawn is placing, 0 red, 1 blue
export const PG_TK = HDR_DIR; // u32 its place among that side's balls as laid out, in slot order (a respawn: spawn's own k)
export const PG_TN = HDR_DIR + 4; // u16 red's balls as laid out, u16 blue's
export const PG_TWIN = HDR_PAR; // u32 the side that won, 1 red, 2 blue, 3 a draw; 0 till the end, unless the minigame decides it
// A ball's fields past bumper's, in bytes golf leaves free.
export const PG_SCORE = 56; // u16 this round's score, zeroed each round
export const PG_PTS = 58; // u16 party points, every round so far
export const PG_M = 60; // u32 the minigame's own field, zeroed each round
// Hashed and in every keyframe, not in the prediction's copy; zeroed before each round's setup.
export const PG_S = REGION + 0xc100; // 7936 B small minigame state, to 0xe000 (Fireplace owns 0xe000..0x10000)
export const PG_S_SIZE = 0xe000 - 0xc100;
export const PG_BIG = REGION + 0x10000; // big minigame state (tiles, grids), to the region's end: party has no golf balls
export const PG_BIG_SIZE = REGION_SIZE - 0x10000;

// Each minigame's own constants (src/mg/<key>.mjs), as one object the
// assembler spreads into its scope (tools/asm.mjs) rather than as names of
// this module: V8 keeps a namespace of more than about a thousand exports as a
// dictionary, and every L.NAME read in the hot loops (the bot host, the relay,
// the referee, a page's frame) took 14 times as long once these 763 joined
// it (test/party.test.mjs holds the count down). JS reads a minigame's own file.
import * as mg_thinice from './mg/thinice.mjs';
import * as mg_color from './mg/color.mjs';
import * as mg_sweep from './mg/sweep.mjs';
import * as mg_light from './mg/light.mjs';
import * as mg_bombs from './mg/bombs.mjs';
import * as mg_wall from './mg/wall.mjs';
import * as mg_pads from './mg/pads.mjs';
import * as mg_hill from './mg/hill.mjs';
import * as mg_potato from './mg/potato.mjs';
import * as mg_coins from './mg/coins.mjs';
import * as mg_paint from './mg/paint.mjs';
import * as mg_race from './mg/race.mjs';
import * as mg_chute from './mg/chute.mjs';
import * as mg_tag from './mg/tag.mjs';
import * as mg_snowball from './mg/snowball.mjs';
import * as mg_tilt from './mg/tilt.mjs';
import * as mg_lava from './mg/lava.mjs';
import * as mg_gale from './mg/gale.mjs';
import * as mg_drums from './mg/drums.mjs';
import * as mg_hoops from './mg/hoops.mjs';
import * as mg_pinball from './mg/pinball.mjs';
import * as mg_trails from './mg/trails.mjs';
import * as mg_maze from './mg/maze.mjs';
import * as mg_bullseye from './mg/bullseye.mjs';
import * as mg_cannon from './mg/cannon.mjs';
import * as mg_rope from './mg/rope.mjs';
import * as mg_glass from './mg/glass.mjs';
import * as mg_gates from './mg/gates.mjs';
import * as mg_stomp from './mg/stomp.mjs';
import * as mg_seesaw from './mg/seesaw.mjs';
import * as mg_kart from './mg/kart.mjs';
import * as mg_disaster from './mg/disaster.mjs';
import * as mg_slap from './mg/slap.mjs';
import * as mg_trap from './mg/trap.mjs';
import * as mg_parry from './mg/parry.mjs';
import * as mg_mingle from './mg/mingle.mjs';
import * as mg_honey from './mg/honey.mjs';
import * as mg_dodge from './mg/dodge.mjs';
import * as mg_volley from './mg/volley.mjs';
import * as mg_soccer from './mg/soccer.mjs';
import * as mg_sumo from './mg/sumo.mjs';
import * as mg_cheese from './mg/cheese.mjs';
export const MG_CONSTS = Object.freeze(Object.assign({}, mg_thinice, mg_color, mg_sweep, mg_light, mg_bombs, mg_wall, mg_pads, mg_hill, mg_potato, mg_coins, mg_paint, mg_race, mg_chute, mg_tag, mg_snowball, mg_tilt, mg_lava, mg_gale, mg_drums, mg_hoops, mg_pinball, mg_trails, mg_maze, mg_bullseye, mg_cannon, mg_rope, mg_glass, mg_gates, mg_stomp, mg_seesaw, mg_kart, mg_disaster, mg_slap, mg_trap, mg_parry, mg_mingle, mg_honey, mg_dodge, mg_volley, mg_soccer, mg_sumo, mg_cheese));

// ---- Fireplace: every game in one module (build/fireplace/game.wasm), a
// playlist of matches the room plays through, Mario Party style; people come
// and go as they please. Each game is its own build, unchanged, under a prefix
// ($g. golf, $a. the arena, $p. party, $f. flight's Dogfight; bumper balls,
// $b., is retired); src/fireplace.wat
// dispatches every export to the game on now and, at the end of a tick, runs
// the playlist: when a game's last match ends it hands out marshmallows (3, 2
// and 1 for the top three), holds the result, then wipes the world, builds the
// next game's on a fresh seed and joins everyone in the room into it.
export const G_GOLF = 0;
export const G_ARENA = 1;
export const G_BUMPER = 2;
export const G_PARTY = 3;
export const G_FLIGHT = 4;
export const FP_HOLD = 750; // 6 s of the result, the standings, then the next game
export const FP_ARENA_TICKS = 22500; // an arena match of 3 min, whatever its mode (Infection's is 3 already; the rest 5 or 10)
export const FP_FLIGHT_TICKS = 22500; // a Dogfight of 3 min, whatever its mode
export const FP_GOLF_TICKS = 18750; // a hole of at most 2.5 min, not 4
// The games, by G_*: what the playlist (src/fireplace.wat, through the fp
// macros), the assembler (tools/asm.mjs) and the page need to know of one, so
// a game joins Fireplace as an entry here, its build's flags and one of the
// ways below of being joined, scored and seeded. Append-only: a game's number
// is its place, and replays, the playlist, browsers' achievement tallies and
// Elo Pros' stats name games by number. A game taken out stays as
// { name, retired: true }: nothing builds, plays or pages it, its number kept.
//   prefix   its functions' prefix in the module ($g.step)
//   flags    its build's (#if ARENA ...); map: the arena's map, or flight's own
//   world    its generators, called (gen seed) in order to build its static world
//   join     'ev': each player in joins by an EV_JOIN record (its ev_join);
//            'round': everyone in is laid out at once (its b_join of the last slot)
//   word     whose input word it reads: 'golf' (golf's, which party shares) or
//            'arena' (which Dogfight shares); a switch keeps the players'
//            words only between games that read the same one
//   matches  how many it plays before the next game (party's minigames)
//   ticks    the longest a match may run in Fireplace, 0 for its own length
//   score    how a player's place is read: 'golf' fewest strokes; 'arena' a
//            Fiesta's kills, then deaths, any other mode's place; 'party'
//            party points, then wins
//   seed     what its next seed forces: 'arena' a mode of ARENA_MODES (never
//            the last), 'flight' one of FLIGHT_MODES, 'party' never one
//            minigame; none for a seed as drawn
export const FP_SETS = [
  { name: 'GOLF', prefix: 'g', flags: {}, world: ['terrain_gen', 'course_gen'], join: 'ev', word: 'golf', matches: 1, ticks: FP_GOLF_TICKS, score: 'golf' },
  { name: 'ARENA', prefix: 'a', flags: { ARENA: true }, map: 'arena', world: ['terrain_gen', 'arena_gen'], join: 'ev', word: 'arena', matches: 1, ticks: FP_ARENA_TICKS, score: 'arena', seed: 'arena' },
  // bumper balls' own build, retired: its wheel of cheese is party's SWISS ROLL
  { name: 'BUMPER BALLS', retired: true },
  { name: 'PARTY', prefix: 'p', flags: { BUMPER: true, PARTY: true }, world: ['terrain_gen', 'bumper_gen'], join: 'round', word: 'golf', matches: 3, ticks: 0, score: 'party', seed: 'party' },
  { name: 'DOGFIGHT', prefix: 'f', flags: { ARENA: true, FLIGHT: true }, map: 'flight', world: ['terrain_gen', 'arena_gen'], join: 'ev', word: 'arena', matches: 1, ticks: FP_FLIGHT_TICKS, score: 'arena', seed: 'flight' },
];
export const GAMES = FP_SETS.map((g) => g.name);
export const FP_MATCHES = FP_SETS.map((g) => g.matches ?? 0); // by game: matches it plays before the next game
export const FP_PLAYS = [...FP_SETS.keys()].filter((k) => !FP_SETS[k].retired); // the games built into Fireplace, by number
// By position, so a game may come round more than once: the room plays entry
// (games played) % length next. Bumper balls stays on the list (its id is in
// browsers' achievements and Elo Pros' stats) but not in the playlist: its
// wheel comes round as Party's SWISS ROLL.
export const PLAYLIST = [G_PARTY, G_ARENA, G_PARTY, G_FLIGHT, G_GOLF];
export const FP_START = 0xf1; // a Fireplace seed with this top byte starts the playlist at entry (seed >>> 16) & 0xff, for gates and dev
export const FP_PARTY_FORCE = 0xa7; // a party seed with this top byte plays one minigame only (party.wat's $bumper_gen): Fireplace's never has it
// In the header's last 16 bytes, which no game uses (inside the prediction's copy):
export const FP_GAME = REGION + 0xf0; // u32 G_*: the game on now
export const FP_STAGE = REGION + 0xf4; // u32 0 playing, 1 its last result held
export const FP_AT = REGION + 0xf8; // u32 tick the held result gives way to the next game
export const FP_COUNT = REGION + 0xfc; // u8 matches of this game over | u8 its last state seen | u16 games the room has played (the playlist's position)
// 8 KiB of the region that no game touches: what lasts from game to game.
export const FP = REGION + 0xe000;
export const FP_MALLOWS = FP; // u16[256] marshmallows, ever
export const FP_LAST = FP + 0x200; // u8[256] where each came in the last game (0: not in it)
export const FP_GOT = FP + 0x300; // u8[256] marshmallows each got for it
export const FP_NEXT = FP + 0x400; // u32 the next game's seed, drawn as this one's result is held (the arena's and Dogfight's force a mode)
export const FP_MODE = FP + 0x404; // u8 1 + the index in ARENA_MODES of the arena's last mode (0: none yet); the next is another
// Outside the region: which game's static world (terrain, map) is built, so a
// keyframe from another game rebuilds it; and a stash for the region while it is.
export const FP_WORLD = 0x320; // u32 game + 1 (0 none), u32 its seed
export const FP_STASH = 0x360000; // 512 KiB, never hashed
