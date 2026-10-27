// HONEYCOMB (MG_HONEY, prefix hc): every ball on its own disc of honeycomb
// candy over a void, the discs in a grid with gaps, and pressed into each the
// same shape, the round's pick: a circle, a triangle, a star or an umbrella.
// Trace its outline by rolling along it, in order, from the start mark round
// and back. Candy off the line cracks under a ball, holds a moment and drops;
// so does the line itself under a ball rolling faster than HC_VLINE. The
// line thins and the candy grows more brittle as the round goes. Fall through
// and you're out, placed by how much you'd traced; the first all the way
// round wins, the rest by how far they got.
// Literal numbers only: the sim reads them through layout.mjs's MG_CONSTS,
// the client imports this file itself.
export const HC_CS = 0.45; // m, a candy cell a side
export const HC_G = 29; // cells a cookie's square a side
export const HC_GH = 14; // its middle cell, the cookie's centre
export const HC_GG = 841; // HC_G squared, a cookie's cells
export const HC_GP = 36; // cells from one cookie's square to the next: HC_G of candy, 7 of void (3.15 m)
export const HC_R = 6.4; // m, the candy's radius: a cell whose centre is within it is candy
export const HC_LEN = 9375; // 75 s
export const HC_ACC = 0.35; // the push, times bumper's: 3.9 m/s^2, 3.5 m/s flat out
export const HC_IDLE = 0.975; // rolling drag a tick with no keys: a brake to stop on the line
// A ball on the candy cracks the cell under its centre and every cell within
// HC_F0 + HC_FK times its speed (m/s) of it, at most HC_FMAX: off the line
// only, or the line too when it's rolling faster than HC_VLINE.
export const HC_F0 = 0.2;
export const HC_FK = 0.09;
export const HC_FMAX = 0.85; // two cells, so a stroke is within 2 cells of the one under it
export const HC_VLINE = 1.8; // m/s, about half flat out
// A crack holds HC_HOLD0 ticks at the start, down to HC_HOLD1 by HC_BRITTLE
// into play, then drops for good.
export const HC_HOLD0 = 70; // 0.56 s
export const HC_HOLD1 = 28; // 0.22 s
export const HC_BRITTLE = 7500; // 60 s
// The line: cells whose centre is within HC_W0 m of the outline, thinning to
// HC_W1 by HC_THIN into play.
export const HC_W0 = 0.75;
export const HC_W1 = 0.35;
export const HC_THIN = 5000; // 40 s
// The outline, as checkpoints at most HC_STEP apart round it from the start
// mark (checkpoint 0). A ball's next checkpoint counts within HC_REACH of its
// centre, and so do the HC_AHEAD - 1 after it (a corner cut short); all
// HC_K of them and back to the start is home.
export const HC_STEP = 0.7;
export const HC_REACH = 0.9; // under the umbrella hook's 1.4 m radius: no counting round it from its middle
export const HC_AHEAD = 2;
export const HC_KMAX = 128;
export const HC_VMAX = 80; // the shape's vertices, at most
// The shapes, $p_seed(HC_KSEED) & 3; $p_seed(HC_KSEED + 1) & 16383 turns it (1/16384 turn).
export const HC_KSEED = 0x4c00;
export const HC_CIRCLE = 0;
export const HC_TRIANGLE = 1;
export const HC_STAR = 2;
export const HC_UMBRELLA = 3;
export const HC_CIRC_R = 4.6; // m
export const HC_TRI_R = 5.3; // m, to a corner
export const HC_STAR_RO = 5.3; // m, to a point
export const HC_STAR_RI = 2.2; // m, to a notch
// The umbrella's outline in cm, u right and v up, from the canopy's top round
// to the right, the scallops under it to the middle, down the handle, round
// its hook and back up, the other scallops, and the canopy's left side.
export const HC_UMB = [0, 475, 90, 466, 176, 440, 256, 397, 325, 340, 382, 271, 425, 191, 451, 105, 460, 15, 445, 55, 403, 84, 345, 95, 288, 84, 245, 55,
  230, 15, 215, 55, 173, 84, 115, 95, 58, 84, 15, 55, 0, 15, 0, -300, -11, -354, -41, -399, -86, -429, -140, -440, -194, -429, -239, -399,
  -269, -354, -280, -300, -280, -240, -280, -300, -269, -354, -239, -399, -194, -429, -140, -440, -86, -429, -41, -399, -11, -354, 0, -300, 0, 15, -15, 55,
  -57, 84, -115, 95, -172, 84, -215, 55, -230, 15, -245, 55, -287, 84, -345, 95, -402, 84, -445, 55, -460, 15, -451, 105, -425, 191, -382, 271,
  -325, 340, -256, 397, -176, 440, -90, 466];
export const HC_UMB_N = 60; // its vertices
export const HC_SFIN = 60000; // PG_SCORE home: HC_SFIN less the balls home before it; else twice the checkpoints traced, one more if still in
export const HC_M_HOME = 0x10000000; // PG_M home: this | its order from 1; else the checkpoints traced in order (0 to HC_K)
// Its header, byte offsets in PG_H (112 B, in the prediction's copy).
export const HC_SHAPE = 0; // u32 HC_CIRCLE...
export const HC_NC = 4; // u32 cookies
export const HC_COLS = 8; // u32 cookies a row (along x)
export const HC_ROWS = 12; // u32 rows (along z)
export const HC_GX0 = 16; // f32 x of global cell column 0's centre
export const HC_GZ0 = 20; // f32 z of global cell row 0's centre
export const HC_K = 24; // u32 checkpoints round the outline
export const HC_FIN = 28; // u32 balls home
export const HC_ROT = 32; // u32 the shape's turn, 1/16384 turn
// Its state. In PG_S, the same for every cookie: f32 per cell (j * HC_G + i),
// how far its centre is from the outline; f32 x, z per checkpoint, from the
// cookie's centre; the shape's vertices (setup's scratch, kept). In PG_BIG, a
// u16 per cell, cookie by cookie (c * HC_GG + j * HC_G + i): 0 no candy, 1
// whole, else the tick it drops, counted from play's start.
export const HC_DIST = 0; // byte offset in PG_S, HC_GG f32
export const HC_PTS = 0xd40; // byte offset in PG_S, HC_KMAX x 2 f32
export const HC_VERT = 0x1140; // byte offset in PG_S, HC_VMAX x 2 f32
export const HC_CELLS = 0; // byte offset in PG_BIG, 256 x HC_GG u16 (420.5 KiB)
// Its FX kinds are FX_MG + 4 * MG_HONEY + k, 176 to 179.
export const HC_FX_STROKE = 176; // the prediction's own ring only: its ball cracked candy; owner the ball, shot 1 if the line too, at its centre, size the stroke's radius
export const HC_FX_CRACK = 177; // candy cracks under a ball (the confirmed world, every 16th tick of it): owner, the cells as shot, size the radius
export const HC_FX_HOME = 178; // a ball traced it all: its order from 1 as shot, at the start mark, seconds into play as size
