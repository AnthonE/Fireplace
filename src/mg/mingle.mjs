// MINGLE (MG_MINGLE, prefix mi): a carousel in the middle of a hall
// over the sea, rooms round its walls, each behind a door. The music plays
// and the carousel turns, carrying everyone round; the hall's floor sweeps
// anyone off it back on. The music stops, a number is called and some doors
// open; when they slam, every ball not in a room holding exactly that number
// is out (if no room holds it, a room over it keeps its deepest). The doors
// open again and the rooms shove everyone back out. Rooms close for good as
// the crowd thins.
// Literal numbers only: the sim reads them through layout.mjs's MG_CONSTS,
// the client imports this file itself.
export const MI_LEN = 22500; // 180 s
export const MI_IDLE = 0.975; // rolling drag a tick with no keys: a brake for stopping in a room
// The carousel: MI_RC0 m plus MI_RCK times the root of the balls in, at most
// MI_RCMAX; the hall's walls at least MI_RING m past its edge.
export const MI_RC0 = 4;
export const MI_RCK = 1.6;
export const MI_RCMAX = 30;
export const MI_RING = 7;
export const MI_SPAWN = 0.85; // balls start on a spiral over this much of the carousel
// The hall: a polygon of MI_K sides, a room behind each (a ball's centre
// counts in it past the door's line, MI_WI wide and MI_DI deep inside), its
// door MI_WD wide in the middle of the side. Walls are 2 MI_WT thick and
// MI_WH high, each side at least MI_PITCH long.
export const MI_WI = 5;
export const MI_DI = 6;
export const MI_WD = 3.2;
export const MI_WT = 0.3;
export const MI_WH = 2.5;
export const MI_PITCH = 7;
export const MI_BOUNCE = 0.2; // what a wall gives back of a ball's speed into it
export const MI_BONK = 4; // m/s into a wall that makes an FX
// Rooms: MI_LIVE0 plus one for every MI_LIVEK balls in (rounded up), from
// MI_KMIN to MI_KMAX at the start; as the crowd thins the rooms past that
// for the balls left close for good. Each music, a number from 2 to MI_NMAX
// under half the balls in (1 under five balls), and rooms open for at most
// MI_SURV of the balls in, two at least from three balls (one for the last
// two), never as many places as balls.
export const MI_LIVE0 = 2;
export const MI_LIVEK = 4;
export const MI_KMIN = 6;
export const MI_KMAX = 40;
export const MI_NMAX = 6;
export const MI_SURV = 0.5;
// A cycle, in ticks into play: the music (MI_M0 .. MI_M1 from $p_seed: longer
// than PRED_MAX, so the rooms a cycle opens are set before the prediction can
// reach them), the scramble with the doors open (MI_W0, MI_WK shorter each
// cycle, at least MI_W1), the doors slammed (MI_HOLD), the rooms shoving
// everyone out (MI_EJECT), then the next music.
export const MI_M0 = 500; // 4 s
export const MI_M1 = 1000; // 8 s
export const MI_W0 = 1250; // 10 s
export const MI_WK = 94; // 0.75 s
export const MI_W1 = 625; // 5 s
export const MI_HOLD = 150; // 1.2 s
export const MI_EJECT = 250; // 2 s
export const MI_RAMP = 125; // the carousel takes 1 s to wind up and 1 s to stop, by the music's end
export const MI_VRIM = 4; // m/s the carousel's rim goes flat out
export const MI_SWEEP = 5; // m/s at least toward the middle, on the hall's floor through the music
export const MI_EJV = 7; // m/s at least out of a room as it shoves
export const MI_EJW = 3; // per s: the shove's pull across toward the door, times metres off its middle
export const MI_KMUSIC = 0x31000; // $p_seed key: cycle c's music from MI_KMUSIC + c
export const MI_KDIR = 0x32000; // the carousel's way in cycle c (the low bit) from MI_KDIR + c
export const MI_KNUM = 0x33000; // cycle c's number from MI_KNUM + c
export const MI_KROOM = 0x34000; // which live rooms cycle c opens from MI_KROOM + c
export const MI_KOFF = 0x35000; // room 0's bearing
// Phases of a cycle ($mi_when's).
export const MI_MUSIC = 0;
export const MI_OPEN = 1;
export const MI_SHUT = 2;
export const MI_OUT = 3;
// Its header, byte offsets in PG_H (112 B, in the prediction's copy).
export const MI_RC = 0; // f32 the carousel's radius
export const MI_A = 4; // f32 the hall's apothem: the doors' line, m from the middle
export const MI_RO = 8; // f32 the floor's radius: past it, the sea
export const MI_HS = 12; // f32 half a side's wall, to past the corner
export const MI_K = 16; // u32 rooms
export const MI_OFF = 20; // u32 room 0's bearing, 1/16384 turn
export const MI_CYC = 24; // u32 the cycle now, from 0
export const MI_C0 = 28; // u32 tick into play its music started
export const MI_NUM = 32; // u32 the number it calls
export const MI_NOPEN = 36; // u32 rooms it opens
export const MI_NLIVE = 40; // u32 rooms not yet closed for good
export const MI_N = 44; // u32 balls in as it started
export const MI_SAFE = 48; // u32 balls safe at the last slam
export const MI_LOST = 52; // u32 balls out at the last slam
export const MI_DEEP = 56; // u32 1 if no room held the number at the last slam, so the rooms over it kept their deepest
export const MI_OPENM = 64; // i64 a room's bit set: open this cycle
export const MI_LIVEM = 72; // i64 a room's bit set: not closed for good
// In PG_S.
export const MI_DIRS = 0; // MI_KMAX x 8 B: f32 cos, sin of room k's bearing
export const MI_CNT = 512; // u8 a room: balls in it at the last slam
export const MI_ROOMOF = 576; // u8 a slot: the room it was safe in at the last slam, 255 none
export const MI_SAVED = 832; // u8 a slot: slams it has lived through this round
export const MI_LIST = 1088; // u8 x 64: the live rooms, a rollover's scratch
export const MI_U = 1152; // f32 a slot: how far into its room it was at the last slam, out from the middle
export const MI_TRIM = 2176; // u8 a slot: trimmed from a room over the number at the last slam
// FX kinds, FX_MG + 4 * MG_MINGLE + k: owner 255, at the middle (but a bonk).
export const MI_FX_MUSIC = 168; // the music starts: shot the cycle, size the rooms it will open
export const MI_FX_CALL = 169; // the music stops, the doors open: shot the number, size the scramble in ticks
export const MI_FX_SLAM = 170; // the doors slam: shot the balls safe (0: nobody made it, nobody is out), size the balls out
export const MI_FX_BONK = 171; // owner into a wall (its bank's ring), shot the room, at the ball, size m/s into it
