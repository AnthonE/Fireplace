// SOCCER (MG_SOCCER, prefix so): red against blue (PGF_TEAMS) on a walled
// pitch sized for the crowd, red's half at low x defending the goal there,
// blue's at high x. Footballs, one for every SO_PER balls, big and lively,
// roll and bounce off the walls, the corners' chamfers and the goals' frames.
// A ball that rolls into one pushes it on the way it rolls, harder the faster
// it hits; one in the air (a hop) chips it up; one in its own box clears it
// harder. A football all the way into a goal is the other side's goal: with
// one football everyone goes back to their own half for the kickoff, with
// more only that football comes back to its spot. First to the target, or
// the most at the clock; a draw stands.

// Literal numbers only: the sim reads them through layout.mjs's MG_CONSTS,
// the client imports this file itself.
// The pitch: SO_A0 m² plus SO_AK for each ball up to SO_NK and SO_AK2 for each
// past, SO_ASP times as long as wide.
export const SO_A0 = 600;
export const SO_AK = 100;
export const SO_NK = 16;
export const SO_AK2 = 30;
export const SO_ASP = 1.5;
export const SO_LEN = 15000; // 120 s
// The goals: a mouth SO_GWK of the pitch's width (SO_GWMIN to SO_GWMAX m
// half wide), the crossbar SO_GH m up, the net box SO_GD m deep behind the
// goal line; posts and bar SO_FR m in radius. The corners are cut at 45
// degrees SO_CORN m back each way (less if the mouth would reach them).
export const SO_GWK = 0.22;
export const SO_GWMIN = 3.6;
export const SO_GWMAX = 14;
export const SO_GH = 4;
export const SO_GD = 3;
export const SO_FR = 0.15;
export const SO_CORN = 4;
// The penalty box: SO_BOXK of the pitch's length deep (SO_BOXMIN to
// SO_BOXMAX), the mouth plus SO_BOXW of its depth either side.
export const SO_BOXK = 0.15;
export const SO_BOXMIN = 5;
export const SO_BOXMAX = 14;
export const SO_BOXW = 0.6;
export const SO_CIRC = 4; // m, the centre circle's radius (drawn; nobody's spot is inside it)
export const SO_X0 = 3.5; // m, the kickoff's front row back from the halfway line
// The balls.
export const SO_ACC = 1; // the push, times bumper's: 10 m/s flat out
export const SO_IDLE = 0.975; // rolling drag a tick with no keys: brakes at 3.2/s
export const SO_HOP = 7; // m/s, a hop (bumper's 6): 0.7 s in the air
export const SO_PE = 0.5; // a ball bounces off the walls, the posts and the nets softly
// The footballs: one for every SO_PER balls in, rounded up, SO_NMIN to SO_NMAX.
export const SO_PER = 16;
export const SO_NMIN = 1;
export const SO_NMAX = 16;
export const SO_R = 0.9; // a football's radius, m: 1.8 m across
export const SO_G = 0.096; // a tick down: 12 m/s², under two thirds of a ball's
// Rolling SO_ROLL of its speed a tick on the floor, SO_AIR in the air; off the
// floor SO_FE up and SO_FH along (a bounce under SO_SETTLE m/s settles); off a
// wall or the chamfers SO_WE of its speed into it, the nets SO_NE, the frame
// SO_FRE; another football, SO_BBE. At most SO_VMAX m/s.
export const SO_ROLL = 0.998;
export const SO_AIR = 0.9995;
export const SO_FE = 0.55;
export const SO_FH = 0.9;
export const SO_SETTLE = 1;
export const SO_WE = 0.6;
export const SO_NE = 0.3;
export const SO_FRE = 0.6;
export const SO_BBE = 0.8;
export const SO_VMAX = 30;
// A touch: a ball in play whose centre comes within its radius plus SO_R of a
// football's. The football is put back out to touching, round the ball
// (which it never moves), and if they were closing it takes 1 + SO_E of the
// closing speed, along the line between them turned SO_AIM of the way toward
// where the ball rolls; then it leaves at least SO_KMIN m/s faster than the
// ball comes on. From a ball in the air, SO_AIRE, and it goes up at least
// SO_CHIP0 plus SO_CHIPK of the ball's speed (to SO_CHIPMAX); from a ball in
// its own box on its goal's side of it, a keeper's, SO_KEEPE, SO_KEEPMIN and
// SO_KEEPUP up.
export const SO_E = 0.5;
export const SO_AIM = 0.6;
export const SO_KMIN = 2;
export const SO_AIRE = 0.6;
export const SO_CHIP0 = 3.5;
export const SO_CHIPK = 0.45;
export const SO_CHIPMAX = 8;
export const SO_KEEPE = 1;
export const SO_KEEPMIN = 6;
export const SO_KEEPUP = 3;
// A touch counts (a point of the ball's own, SO_PT_TOUCH) unless the ball's
// last counted one, on any football, is under SO_RECOUNT ticks old; a
// keeper's counted touch on one coming at its goal mouth faster than
// SO_SAVEV is a save, SO_PT_SAVE more; a goal is SO_PT_GOAL to the scoring side's last toucher,
// unless that side hasn't touched it in SO_OWNT ticks and the other side
// has: then an own goal, nobody's.
export const SO_RECOUNT = 63;
export const SO_SAVEV = 4;
export const SO_PT_TOUCH = 1;
export const SO_PT_SAVE = 3;
export const SO_PT_GOAL = 5;
export const SO_OWNT = 625;
// After a goal the football is gone SO_GONE ticks (as far as the prediction
// runs, so a ball's kickoff is never a surprise to it), then on its spot,
// held and untouchable, SO_HOLD more. With one football everyone is back on
// their own half, held still, over the same SO_HOLD.
export const SO_GONE = 256;
export const SO_HOLD = 125;
// The target: SO_GOAL0 goals, SO_GOALK more for each football past the first.
export const SO_GOAL0 = 5;
export const SO_GOALK = 1;
// Its header, byte offsets in PG_H (in the prediction's copy).
export const SO_HX = 0; // f32 the pitch's half length, the halfway line to a goal line
export const SO_HZ = 4; // f32 its half width
export const SO_NB = 8; // u32 footballs
export const SO_GOAL = 12; // u32 the goals that win
export const SO_GW = 16; // f32 a goal mouth's half width
export const SO_BOXD = 20; // f32 the penalty box's depth from the goal line
export const SO_BOXHW = 24; // f32 its half width
export const SO_CN = 28; // f32 the corners' chamfer, m back each way
export const SO_KO = 32; // u32 tick into play everyone is put back for a kickoff (one football)
export const SO_KOGO = 36; // u32 tick into play they're let go (SO_KO <= t < SO_KOGO: held)
export const SO_TN = 40; // u16 red's balls in as the kickoff was called, u16 blue's (each ball's rank among its side in its PG_M)
// In PG_S: the footballs, SO_NMAX of SO_FSIZE bytes; then SO_SSIZE bytes a slot.
export const SO_BALL = 0;
export const SO_FSIZE = 48;
export const SO_FST = 0; // u8 SO_NONE, SO_LIVE, SO_GONE_ST or SO_HELD
export const SO_FBY = 1; // u8 its last toucher, 255 none
export const SO_FLAST = 2; // u8 red's last toucher at +0, blue's at +1, 255 none
export const SO_FAT = 4; // u32 tick into play of its last touch
export const SO_FNEXT = 8; // u32 tick into play it's back on its spot (gone), or let go (held)
export const SO_FX = 12; // f32 x from the pitch's centre, the height of its centre over the floor, z from the centre
export const SO_FY = 16;
export const SO_FZ = 20;
export const SO_FVX = 24; // f32 its velocity
export const SO_FVY = 28;
export const SO_FVZ = 32;
export const SO_FSAT = 36; // u32 tick into play of red's last touch at +0, blue's at +4
export const SO_NONE = 0;
export const SO_LIVE = 1;
export const SO_GONE_ST = 2;
export const SO_HELD = 3;
export const SO_SLOT = 1024; // 256 x SO_SSIZE B, by slot:
export const SO_SSIZE = 12;
export const SO_TOUCHES = 0; // u16 touches counted
export const SO_GOALS = 2; // u16 goals
export const SO_SAVES = 4; // u16 saves
export const SO_OWN = 6; // u16 own goals (its touch the last, its side's the only one in SO_OWNT)
export const SO_NEXT = 8; // u32 tick into play its next touch counts from
// FX kinds, FX_MG + 4 * MG_SOCCER + k.
export const SO_FX_TOUCH = 184; // owner the toucher, shot the football | 256 from the air | 512 a keeper's | 1024 a save, at it, size its new speed
export const SO_FX_GOAL = 185; // owner the scorer (an own goal: the ball that put it in; 255 none), shot the football | the scoring side << 8 | 512 an own goal, at it, size the side's goals
export const SO_FX_SPOT = 186; // owner 255, shot the football | 256 everyone back too, at its spot, size the s till it's let go
export const SO_FX_HIT = 187; // owner 255, shot the football | 256 the frame (else a wall or a net), at it, size its speed into it
