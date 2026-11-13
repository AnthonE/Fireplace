// ROUND UP (MG_HERD, prefix hd): sheepdog trials, red against blue
// (PGF_TEAMS). A fenced meadow, a pen behind each end (red's at low x,
// blue's at high x) whose mouth is a gap in the middle of the end fence,
// and a flock grazing between them, a sheep for every ball in. A sheep runs
// from every ball near it, the pushes summed, so a ball herds by getting
// behind it, and two sides on one sheep pull it both ways. A sheep through
// a pen's mouth is that side's for good: a point to the side, and one of
// their own to each of its balls that drove it in. A golden ram, quicker
// and worth 3, comes on later, called ahead (three of them in a big room).
// A click barks: a wider, harder scare for half a second. The round ends
// when every sheep is penned, or at 100 s; the fuller pen wins, a draw
// allowed.
// Literal numbers only: the sim reads them through consts.mjs's MG_CONSTS,
// the client imports this file itself.
// The meadow: a rounded rectangle HD_ASP times as long as wide, HD_A0 m²
// plus HD_AK for each ball up to HD_NK and HD_AK2 for each past (37 by 20 m
// for 1, 53 by 30 for 16, 126 by 70 for 256); its corners rounded HD_RC m
// (half its width at most).
export const HD_A0 = 700;
export const HD_AK = 55;
export const HD_NK = 16;
export const HD_AK2 = 30;
export const HD_ASP = 1.8;
export const HD_RC = 6;
export const HD_LEN = 12500; // 100 s
export const HD_PE = 0.5; // a ball comes off the fence and a mouth's posts softly
export const HD_FENCE_H = 1.1; // m, the fence (drawing: nothing leaves the meadow anyway)
// The pens, one behind each end fence: HD_PW0 m plus HD_PWK times the root
// of the balls in, in half width (3.8 m for 1, 4.7 for 16, 8.3 for 256), and
// HD_PD0 plus HD_PDK times that root deep (4.85, 5.9, 10.1). Its mouth is a
// gap in the end fence, HD_GK of the pen's width (5.8 m wide for 16), a post
// each side. The fence and the pen's rails hold balls and sheep alike; to
// the other side's balls the mouth is fence too, and the ground within
// HD_APR m of the mouth's posts (a disc about its middle) rolls them away,
// HD_TILT m/s more a tick (25 m/s², more than a ball's 11 m/s² push): nobody
// stands in the way of the other side's mouth. A sheep HD_INM m past the
// end's line is penned.
export const HD_PW0 = 3.5;
export const HD_PWK = 0.3;
export const HD_PD0 = 4.5;
export const HD_PDK = 0.35;
export const HD_GK = 0.62;
export const HD_APR = 2.5;
export const HD_TILT = 0.2;
export const HD_INM = 0.5;
// The balls as laid out: each side in rows across the meadow from HD_FRONT m
// past the flock's edge (out of the sheep's sight), HD_GAP m apart, back
// toward its own pen; a newcomer in play falls in HD_BACK m in front of its
// own pen's mouth.
export const HD_FRONT = 6.5;
export const HD_GAP = 2.6;
export const HD_BACK = 5;
// The flock: a sheep for every ball in, HD_NMIN to HD_NMAX, over the middle
// in a disc HD_PS m times the root of their number in radius: every other
// one on a sunflower and the next opposite it through the middle, so the
// flock lies the same for both sides (on a plain sunflower of 8 the side
// with the nearer sheep won 22 of 30 between two AI balls). A sheep is
// HD_SR m in radius among sheep, and keeps HD_KEEP m off the fence and a
// mouth's posts: more than a ball's radius, so a ball rolling along the
// fence pushes it off the fence, not onto it, and two sides pushing one
// along it squeeze it out.
export const HD_NMIN = 8;
export const HD_NMAX = 120;
export const HD_PS = 1.1;
export const HD_SR = 0.6;
export const HD_KEEP = 1.15;
// The golden rams, after the sheep in PG_S, worth HD_RAMV: one, or HD_NRAM
// from HD_RAMN balls in. An odd number of them either way: with a ball a
// sheep, an even room all penned is never a draw. Ram k comes on in the
// middle HD_RAM0 + k * HD_RAMP ticks into play (25 s, then 45 and 65),
// called HD_RAMW before (3 s); sooner if the meadow is empty of sheep: then
// it is called at once.
export const HD_NRAM = 3;
export const HD_RAMN = 24;
export const HD_RAMV = 3;
export const HD_RAM0 = 3125;
export const HD_RAMP = 2500;
export const HD_RAMW = 375;
// How a sheep runs. Every ball in within HD_SCARE m pushes it straight away,
// HD_FLEE m/s at no distance falling to nothing at HD_SCARE; the pushes are
// summed (two balls side by side push harder, two either side cancel). Its
// neighbours, the sheep within HD_NEAR m, add HD_ALIGN of their mean
// velocity, so a flock moves off together and settles together; with no ball
// near it wanders to their middle, HD_COH m/s a metre off, HD_GRAZE at most.
// Sheep closer than their two radii part, HD_SEPK m/s a metre of overlap;
// within HD_SHY m of the fence a sheep leans in off it, HD_SHYV m/s at the
// fence (not off an end in front of its mouth), so a flock left in a corner
// walks out of it. What it wants is held
// to HD_VMAX m/s (a ball makes 10) and its velocity closes HD_EASE of the
// gap a tick. A ram runs from HD_RSCARE m, HD_RFLEE and HD_RVMAX fast.
export const HD_SCARE = 6;
export const HD_FLEE = 10;
export const HD_VMAX = 6;
export const HD_RSCARE = 7;
export const HD_RFLEE = 13;
export const HD_RVMAX = 8;
export const HD_EASE = 0.08;
export const HD_NEAR = 5;
export const HD_ALIGN = 0.5;
export const HD_COH = 0.3;
export const HD_GRAZE = 0.6;
export const HD_SEPK = 4;
export const HD_SHY = 3;
export const HD_SHYV = 2;
// The bark: a click (a change in the word's use counter) HD_BARKCD ticks or
// more after the last one (3 s). For HD_BARKT ticks (0.48 s) the barker
// scares from HD_BARKK times as far and pushes HD_BARKK times as hard.
export const HD_BARKT = 60;
export const HD_BARKCD = 375;
export const HD_BARKK = 1.5;
// The balls in, in a grid rebuilt every tick for the sheep: HD_GN x HD_GN
// cells of HD_CELL m (no less than the widest scare, a ram's from a barker)
// from the meadow's centre less half of it.
export const HD_CELL = 10.5;
export const HD_GN = 14;
// Its header, byte offsets in PG_H (112 B, in the prediction's copy).
export const HD_HX = 0; // f32 the meadow's half length (x)
export const HD_HZ = 4; // f32 its half width (z)
export const HD_CR = 8; // f32 its corners' radius
export const HD_PW = 12; // f32 a pen's half width
export const HD_PD = 16; // f32 a pen's depth, back from the end's line
export const HD_GW = 20; // f32 a mouth's half width
export const HD_AR = 24; // f32 the radius about a mouth's middle the other side is rolled out of
export const HD_FR = 28; // f32 the flock's radius as laid out
export const HD_NS = 32; // u32 the sheep (the rams come after them)
export const HD_LEFT = 36; // u32 sheep and rams not yet penned (the rams to come too): at 0 the round is over
export const HD_NR = 40; // u32 the rams: 1, or HD_NRAM
// A sheep's record, HD_SSIZE bytes each from PG_S.
export const HD_SSIZE = 32;
export const HD_SX = 0; // f32 where it is, x
export const HD_SZ = 4; // f32 and z
export const HD_SVX = 8; // f32 its velocity, x
export const HD_SVZ = 12; // f32 and z
export const HD_ST = 16; // u8 HD_NONE, HD_LOOSE, HD_PENNED or HD_CALLED
export const HD_SSIDE = 17; // u8 penned: whose pen
export const HD_SV = 18; // u8 what it is worth
export const HD_SBY = 19; // u8 penned: the nearest ball of that side that drove it in, 255 none
export const HD_SAT = 20; // u32 a ram to come: the tick into play it comes on; penned: the tick it was
export const HD_SJ = 24; // u16 penned: how many its pen held before it
export const HD_NONE = 0; // a ram not yet called
export const HD_LOOSE = 1;
export const HD_PENNED = 2;
export const HD_CALLED = 3; // a ram called, not yet on
// PG_BIG: the grid's heads (u16 a cell, 0xffff none) and each slot's next.
export const HD_GRID = 0;
export const HD_GNEXT = 0x400;
// A ball's own field (PG_M): the use counter last seen (bits 0-1), HD_M_IN
// (in the round: the first push takes the counter as it stands), and from
// bit 16 the tick into play of its last bark plus 1, 0 none.
export const HD_M_IN = 4;
// FX kinds, FX_MG + 4 * MG_HERD + k.
export const HD_FX_PEN = 240; // owner the driver (255 none), shot the sheep | the pen's side << 8 | 512 a ram, at the mouth, size the side's score now
export const HD_FX_RAM = 241; // owner 255, shot the ram (0..2) | 256 it comes on (else called), at the middle, size s till it comes
export const HD_FX_BARK = 242; // owner the barker, at it, size how far it scares (m)
