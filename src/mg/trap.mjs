// TRAP RUN (MG_TRAP, prefix tr): runners against trappers, after Roblox's
// Deathrun. One ball in 16 (at least one, none in a room of one), picked
// from the round's seed, is a trapper; the rest run. The runners race a
// straight course over the sea along +x from a start pad to a finish line
// and a pen past it, through TR_NT0 to TR_NT0 + TR_NTK - 1 traps with safe,
// railed stretches between. The trappers ride a moving walkway beside it,
// up past a wall, and beside each trap is a button pad: a trapper rolling
// onto it arms that trap. An armed trap fires TR_DELAY ticks on, longer
// than the prediction ever runs ahead (its pad lit, the trap flashing the
// last TR_FLASH), is live for its own time, cools TR_COOL and can be armed
// again. Runners place by finishing order, then by how far down the course
// they got (the fallen where they fell); trappers behind every runner home
// and ahead of every runner who isn't, among themselves by the runners
// their traps took out. Bumps on, without the kick. Literal numbers only:
// the sim reads them through layout.mjs's MG_CONSTS, the client imports
// this file itself.
export const TR_LEN = 15000; // 120 s
export const TR_LATE = 3750; // 30 s after the first runner home the round ends
export const TR_WIN = 8000; // PG_SCORE of a runner home: TR_WIN + the ticks of PG_LEN it had left; else TR_DM a metre along
export const TR_DM = 10;
export const TR_TRAP0 = 7744; // PG_SCORE of a trapper: TR_TRAP0 + the runners it took (past any course's TR_DM a metre, under TR_WIN)
export const TR_PER = 16; // balls to a trapper
export const TR_W0 = 4; // the course's half-width: TR_W0 plus TR_WK times the root of the balls in, at most TR_WMAX
export const TR_WK = 0.75;
export const TR_WMAX = 16;
export const TR_STEP = 2.4; // m between balls on the start grid and the trappers' rows
export const TR_PAD = 4; // m of start pad behind and in front of the grid
export const TR_IDLE = 0.975; // rolling drag a tick with no keys: a brake to wait at a trap on
// The course: the first trap TR_X1 past the start line, TR_GAP0 to TR_GAP0 + TR_GAPK of railed floor
// between traps, the line TR_XN past the last; the pen past the line, TR_PEN0 and TR_PENK more a ball.
export const TR_NT0 = 8;
export const TR_NTK = 4;
export const TR_NTMAX = 12;
export const TR_X1 = 12;
export const TR_XN = 12;
export const TR_GAP0 = 7;
export const TR_GAPK = 3;
export const TR_PEN0 = 14;
export const TR_PENK = 0.12;
export const TR_MOUTH = 6; // m into the pen a ball is carried on at TR_THRU at least
export const TR_THRU = 3;
export const TR_BOUNCE = 0.3; // of the speed into a rail or a wall given back
// The walkway: past a wall TR_WALL thick on the course's +z side, TR_WH over the course's floor,
// TR_WW0 wide and TR_WWK more a trapper, from the start line on a belt carrying what rolls on it on down
// the course at TR_BELT.
// A trap's pad: a disc TR_PADR round, its centre TR_PADIN in from the walkway's inner edge, beside
// the trap's middle; a trapper's centre on it arms the trap.
export const TR_WALL = 0.6;
export const TR_WH = 3;
export const TR_WW0 = 5;
export const TR_WWK = 0.4;
export const TR_BELT = 3;
export const TR_PADR = 1.3;
export const TR_PADIN = 1.6;
export const TR_RAIL = 1.4; // m: the rails' height (drawn: solid all the way up)
// The traps' kinds
export const TR_K_DROP = 0; // floor panels: a random share of them drop away
export const TR_K_PIST = 1; // pistons out of the wall shove across toward the open edge
export const TR_K_SWEEP = 2; // a bar at ball height turns half round on a post
export const TR_K_CRUSH = 3; // a block slams down across the course
export const TR_K_JET = 4; // air jets in the floor blow a ball up, back and toward the edge
export const TR_K_TIP = 5; // the floor tips down from the wall to the open edge
export const TR_NK = 6;
// Each kind's length down the course (the sweeper's is the course's width and 2 more), and ticks live.
export const TR_LENS = [15, 15, 0, 10, 14, 16];
export const TR_LIVES = [250, 100, 200, 175, 150, 300];
// A trap's clock from the tick it's armed: TR_DELAY armed (more than PRED_MAX, so whatever the
// prediction reaches was armed before it began), live, TR_COOL cooling, then it can be armed again.
// Armed, its pad on the walkway is lit; the trap itself flashes only the last TR_FLASH ticks (drawn).
export const TR_DELAY = 264;
export const TR_COOL = 150;
export const TR_FLASH = 110;
export const TR_CREDIT = 500; // ticks: a runner out this soon after a trap had it is its trapper's
// Floor panels: TR_DROWS rows of TR_CELL m down the section, about TR_CELL across (TR_NCMIN to TR_NCMAX
// a row); each drops, the arming's draw, with chance TR_DODDS / 256.
export const TR_DROWS = 5;
export const TR_CELL = 3;
export const TR_NCMIN = 2;
export const TR_NCMAX = 11;
export const TR_DODDS = 150;
// Pistons: heads TR_PHEAD m long side by side down the section, TR_PH tall, punching out from the wall
// across TR_PREACH of the course in TR_PEXT ticks, holding to TR_PHOLD, back in by the end; a ball the
// punch meets goes off at TR_SHOVE toward the edge.
export const TR_PHEAD = 3;
export const TR_PH = 1.6;
export const TR_PREACH = 0.68;
export const TR_PEXT = 12;
export const TR_PHOLD = 50;
export const TR_SHOVE = 13;
// The sweeper: a bar through a post TR_POST round in the section's middle, its axis TR_BY over the floor,
// TR_BW thick either side (a ball's bottom clears it from 0.6 m up; a hop peaks at 0.9), reaching to
// TR_BIN short of the course's sides; at rest sunk in the floor along the course, live up and half a turn.
// A ball in front of it moving goes on round at TR_KICK times its speed there and TR_KICK0 (at most
// TR_KMAX), TR_OUT out, TR_UP up.
export const TR_POST = 0.6;
export const TR_BY = 0.35;
export const TR_BW = 0.25;
export const TR_BIN = 0.4;
export const TR_KICK = 1.3;
export const TR_KICK0 = 4;
export const TR_KMAX = 30;
export const TR_OUT = 3;
export const TR_UP = 5.5;
export const TR_RAD_TICK = 0.047936897; // m/s a metre out for a turn of 1/16384 a tick
// The crusher: a block TR_CL long across the course, hanging with its bottom TR_CH up; it falls in
// TR_CFALL ticks, stays down to TR_CUP, rises by the end. Under it as it falls, a ball is crushed through
// the floor; down or rising it's a wall.
export const TR_CL = 6;
export const TR_CH = 4.5;
export const TR_CFALL = 15;
export const TR_CUP = 115;
// Air jets: two rows of vents TR_VR round, TR_VROW m in from the section's ends, in every other cell
// across; a ball low over one (its bottom under TR_VTOP, its centre within TR_VR + TR_VIN) is blown up
// at TR_JETV, back at TR_JETB and toward the open edge at TR_JETS.
export const TR_VR = 1;
export const TR_VIN = 0.5;
export const TR_VROW = 3;
export const TR_VTOP = 1.5;
export const TR_JETV = 12;
export const TR_JETB = 5;
export const TR_JETS = 6;
// The tipping floor: hinged at the wall, down to TR_TILT (1/16384 turn: 22 degrees) over TR_TRAMP ticks,
// back over the last TR_TRAMP; on it a ball is pulled down the slope (TR_PULL m/s^2 of gravity), held to
// it from TR_SNAP over it unless it's leaving faster than TR_SNAPV.
export const TR_TILT = 1001;
export const TR_TRAMP = 50;
export const TR_PULL = 20;
export const TR_SNAP = 0.4;
export const TR_SNAPV = 1;
// $p_seed keys
export const TR_KCOURSE = 0x32b00; // the course: $hash32 of this and a counter
export const TR_KGRID = 0x32b01; // who traps and the start grid's order
// In PG_S: the traps, then a byte a slot where it came home (0 not yet), a byte a slot the runners it took.
export const TR_TRAPS = 0;
export const TR_TRSZ = 32;
export const TR_T_X0 = 0; // f32 the section's start
export const TR_T_X1 = 4; // f32 its end
export const TR_T_KIND = 8; // u32 TR_K_*
export const TR_T_ARM = 12; // u32 1 + the tick into play it was armed, 0 never
export const TR_T_BY = 16; // u32 the trapper who armed it
export const TR_T_M0 = 20; // u32 floor panels: which drop, cells 0 to 31 (row * TR_NCOL + column)
export const TR_T_M1 = 24; // u32 cells 32 on
export const TR_T_PAD = 28; // f32 its pad's x
export const TR_PLACE = 384; // TR_TRAPS + TR_NTMAX * TR_TRSZ
export const TR_KILLS = 640; // TR_PLACE + 256
// A runner's PG_M: 1 + the last trap that had it in the low byte, the tick into play it did above.
// Its header, byte offsets in PG_H (112 B, in the prediction's copy).
export const TR_NT = 0; // u32 traps
export const TR_W = 4; // f32 the course's half-width, about PG_CX in z
export const TR_XA = 8; // f32 the start pad's back (and the walkway's)
export const TR_X0 = 12; // f32 the start line: metres along are x less this
export const TR_FIN = 16; // f32 the finish line
export const TR_XB = 20; // f32 the pen's far end (and the walkway's)
export const TR_ZW = 24; // f32 the walkway's inner edge
export const TR_WWID = 28; // f32 its width
export const TR_NCOL = 32; // u32 cells across (floor panels, jets)
export const TR_CW = 36; // f32 a cell's width
export const TR_NTR = 40; // u32 trappers
export const TR_ROW = 44; // u32 runners a row on the grid
export const TR_FIRST = 48; // u32 the tick the first runner came home, 0 none yet
export const TR_HOME = 52; // u32 runners home
export const TR_TAKEN = 56; // u32 runners the traps took
// A trap's phase on a tick, as $tr_phase gives it with the ticks into it
export const TR_IDLEP = 0;
export const TR_WARN = 1;
export const TR_LIVE = 2;
export const TR_COOLP = 3;
// Its FX kinds are FX_MG + 4 * MG_TRAP + k, k 0 to 3: 160 to 163.
export const TR_FX_TRAP = 160; // a trap armed (owner the trapper) or fired (owner its trapper): shot the trap | 256 fired, at its pad
export const TR_FX_HIT = 161; // a trap had a ball (its bank's ring): owner, shot the trap | kind << 8, size the speed it leaves at
export const TR_FX_HOME = 162; // a runner over the line: owner, size its place; shot the seconds the rest have left if it's the first
export const TR_FX_TAKEN = 163; // a trapper's trap took a runner out: owner the runner, shot the trapper, size the trap's kind
