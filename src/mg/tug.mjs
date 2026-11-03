// TUG O WAR (MG_TUG, prefix tw): red against blue (PGF_TEAMS) on two decks
// over a mud pit, red's at low x and blue's at high x, a rope along x down the
// middle of both. A ball on its own deck in the band along the rope holds it:
// dug in, it rolls across the rope but not along it, and every tick of a pull it
// pulls by how much its keys point away from the pit. The rope's speed eases
// toward TW_K times the difference of the sides' pulls, each the root of its
// sum over half the balls in, so a crowd's numbers count for less than its
// effort; the losing side's holders are dragged with it. The flag in the
// rope's middle crossing a line, closing in from TW_WIN0 to TW_WIN1 over the
// pull, wins the pull: the rope reels the losers in at TW_REEL, and TW_LAG
// later the front of their deck tips whoever is on it into the mud. First to
// TW_BEST pulls wins; at the clock with pulls level, the flag's side of the
// middle takes the decider. A ball in the mud is back on its deck TW_RESPAWN
// after it is down.
// Hop the pit to knock the other side's holders off the rope: they hold fast
// along it but not across. Literal numbers only: the sim reads them through
// layout.mjs's MG_CONSTS, the client imports this file itself.
export const TW_LEN = 15000; // 120 s
// The stage: two decks TW_GAP apart across the pit, each TW_D0 m plus TW_DK
// times the root of the balls in long (x) and TW_W0 plus TW_WK times it in
// half width (z): 19.6 by 20.4 m for 16, 30.4 by 39.6 for 256. The band a
// ball holds the rope in is TW_B0 plus TW_BK times the root either side of
// it (2 m for 16, 3.2 for 256). The mud's top is TW_MUD under the decks.
export const TW_GAP = 3.5;
export const TW_D0 = 16;
export const TW_DK = 0.9;
export const TW_W0 = 7;
export const TW_WK = 0.8;
export const TW_B0 = 1.6;
export const TW_BK = 0.1;
export const TW_MUD = 3;
// The balls as laid out: each side in rows across its deck from TW_FRONT m in
// from its front edge, TW_SPACE apart, back toward its rail; one back from
// the mud falls in TW_BACK in front of the rail, across the middle 0.7 of it.
export const TW_FRONT = 3;
export const TW_SPACE = 2.4;
export const TW_BACK = 3;
export const TW_RESPAWN = 125; // 1 s
// The rope: its speed eases TW_EASE of the way a tick (0.67 s) toward TW_K
// m/s times (blue's pull less red's), each side's the root of its sum over
// half the balls in (at least 1), held to TW_VMAX either way; a holder's
// pull is the share of its keys' push away from the pit, 0 to 1.
export const TW_K = 16;
export const TW_EASE = 0.012;
export const TW_VMAX = 5;
// The lines: the flag wins a pull TW_WIN0 m from the middle, the lines
// closing in to TW_WIN1 over TW_CLOSE ticks of the pull.
export const TW_WIN0 = 6;
export const TW_WIN1 = 1;
export const TW_CLOSE = 1500; // 12 s
// A pull won: the rope reels in at TW_REEL m/s toward the winners, the
// losers' holders gripping it across too (a hop lets go), and
// TW_LAG ticks on (as far as the prediction runs) the front TW_APRON m of the
// losers' deck tips for TW_TIP ticks. The next pull is set TW_SET after
// that (the first TW_SET0 from the round's start); its holders pull from the
// set's end.
export const TW_REEL = 3;
export const TW_LAG = 256;
export const TW_APRON = 4;
export const TW_TIP = 125; // 1 s
export const TW_SET0 = 312; // 2.5 s
export const TW_SET = 438; // 3.5 s: the losers tipped in are back on their deck
export const TW_BEST = 3; // pulls to win
// A ball's own points (PG_SCORE, how the losers place): one a second it
// pulls, TW_PT_KO for a foe it knocked into the mud.
export const TW_PT = 125;
export const TW_PT_KO = 3;
// Its header, byte offsets in PG_H (in the prediction's copy).
export const TW_D = 0; // f32 a deck's length, x
export const TW_HW = 4; // f32 a deck's half width, z
export const TW_BAND = 8; // f32 the band's half width
export const TW_PHASE = 12; // u32 TW_P_*
export const TW_AT = 16; // u32 tick into play the phase ends (a set, a reel)
export const TW_FROM = 20; // u32 tick into play the pull on began
export const TW_M = 24; // f32 the flag: the rope's middle less the stage's centre, x
export const TW_V = 28; // f32 the rope's speed, + toward blue
export const TW_TIPAT = 32; // u32 tick into play a deck's front tips, 0 none yet
export const TW_TIPS = 36; // u32 whose: 0 red, 1 blue
export const TW_NP = 40; // u32 pulls begun
export const TW_P_SET = 0; // the rope still, holders gathering
export const TW_P_PULL = 1;
export const TW_P_REEL = 2; // a pull won, the losers reeled in and tipped
export const TW_P_DONE = 3; // the deciding pull won: the same, then over
// In PG_S: u16 [2] the holders by side this tick; f32 [2] their pull (the
// sums); then TW_NLOG records of 4 bytes, one a pull: u8 who won it (1 red,
// 2 blue, | 4 the clock's decider), u8 0, u16 the ticks it took.
export const TW_HOLD = 0;
export const TW_SUM = 4;
export const TW_LOG = 12;
export const TW_NLOG = 32;
// A ball's own field (PG_M): the ticks it has pulled toward its next point.
// FX kinds, FX_MG + 4 * MG_TUG + k: 220 to 223.
export const TW_FX_PULL = 220; // a pull begins: owner 255, shot its number from 1, at the flag
export const TW_FX_WON = 221; // a pull won: owner 255, shot the side | 2 the decider | its number << 2, at the flag, size its seconds
export const TW_FX_TIP = 222; // a deck's front tips: owner 255, shot the side, at the front's middle
export const TW_FX_MUD = 223; // a ball into the mud: owner it, shot the foe that knocked it in or 255, at it
