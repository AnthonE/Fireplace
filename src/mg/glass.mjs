// GLASS BRIDGE (MG_GLASS, prefix gb): bridges of glass over a long drop, side
// by side, one for about every GB_PER balls, from a start deck to a finish
// deck along +x. Each bridge is rows of panels in pairs with a gap between
// rows a ball has to hop; of each pair one is tempered and holds, the other
// shatters, which is which from the round's seed, pair by pair. Glass that
// shatters cracks as a ball lands on it and goes GB_HOLD ticks later, for
// good; a ball on it can't hop off. The first across wins; the rest place by
// the row they reached, the fallen by the row they fell from.
// Literal numbers only: the sim reads them through layout.mjs's MG_CONSTS,
// the client imports this file itself.
export const GB_LP = 10; // m, a panel along the way on (x): its near third to land on, then room to wait, then a run-up to the edge
export const GB_WP = 4.5; // m, a panel across (z)
export const GB_GIN = 0.8; // m between the two panels of a pair
export const GB_G = 2.5; // m between rows: rolling at 14 m/s a ball drops more than a step (P_STEP) crossing it; a hop clears it
export const GB_GB = 5; // m between two bridges: more than a hop sideways
export const GB_DS = 10; // m, the start deck's depth
export const GB_DF = 16; // m, the finish deck's depth
export const GB_EDGE = 2; // m the decks reach past the outer bridges
export const GB_PER = 8; // balls a bridge, at most
export const GB_NBMAX = 32; // bridges, for 256
export const GB_ROW0 = 7; // rows: GB_ROW0 plus half the balls a bridge (7 for a ball alone, 11 for 8)
export const GB_NRMAX = 12;
export const GB_HOLD = 40; // ticks a cracked panel still holds: 0.32 s
export const GB_GRIP = 0.8; // a tick, the speed a ball on cracked glass keeps: it sinks in, it can't hop off
export const GB_IDLE = 0.975; // rolling drag a tick with no keys: a brake to stop on a panel
export const GB_HOP = 7; // m/s, a hop (bumper's 6): 0.7 s up and down, room to come down on the other side's glass
export const GB_LEN0 = 6250; // the clock: 50 s plus GB_LENK a row (78 s for 7 rows, 94 s for 11)
export const GB_LENK = 500;
export const GB_SFIN = 60000; // PG_SCORE home: GB_SFIN less the balls home before it; else twice the row reached (0 the deck), one more if still in
export const GB_M_HOME = 0x10000000; // PG_M home: this | its order from 1; else the row stood on furthest, 1 the first (0 the deck)
export const GB_KSEED = 0x6b00; // $p_seed(GB_KSEED + pair): its low bit, the side that shatters
export const GB_PARK = 5; // m past the finish deck's edge a ball home is parked, 4 abreast, GB_PARKD apart
export const GB_PARKD = 2.4;
// Its state, in PG_S: a u32 per panel, panel (b * rows + row) * 2 + side
// (side 0 the one at lower z): 1 whole, 2 tempered and stood on, else the
// tick it stops holding (cracked); a u8 per pair, the side that shatters
// (the sim's alone: the client never reads it); a u32 per bridge, balls
// parked on its stretch of the finish deck.
export const GB_CELLS = 0; // byte offset in PG_S, GB_NBMAX * GB_NRMAX * 2 u32
export const GB_BAD = 0xc00; // byte offset in PG_S, GB_NBMAX * GB_NRMAX u8
export const GB_HOMES = 0xe00; // byte offset in PG_S, GB_NBMAX u32
// Its header, byte offsets in PG_H (112 B, in the prediction's copy).
export const GB_NB = 0; // u32 bridges
export const GB_NR = 4; // u32 rows
export const GB_X0 = 8; // f32 the start deck's front edge, x
export const GB_ZL = 12; // f32 the first bridge's low edge, z
export const GB_ZR = 16; // f32 the last bridge's high edge, z
export const GB_FX = 20; // f32 the finish deck's front edge, x
export const GB_FIN = 24; // u32 balls home
// Its FX kinds are FX_MG + 4 * MG_GLASS + k, 136 to 139: the panel as shot,
// its top's centre as the position, its row as size (but home's).
export const GB_FX_CRACK = 136; // glass cracks under a ball: the ball as owner (the prediction's own, in its ring)
export const GB_FX_DROP = 137; // it goes, the tick before it stops holding: owner 255
export const GB_FX_SAFE = 138; // tempered glass first stood on: the ball as owner
export const GB_FX_HOME = 139; // a ball onto the finish deck: its order from 1 as shot, where it landed, seconds into play as size
