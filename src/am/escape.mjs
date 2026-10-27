// ESCAPE (M_ESCAPE, prefix es): one hunter against the room. As play starts
// one fighter in ES_PER (at least one, never the last) is drawn the hunter
// (PF_JUGG: the sword that never runs out, a zombie's legs, nothing hurts
// it), moved to the spawn point farthest from everyone; the rest are
// survivors with no guns and a shove (the melee) that stuns it ES_STUN on an
// ES_COOL cooldown, then ES_CALM it shrugs shoves off. Its swing downs a
// survivor (Evade's PF_DOWN: a crawl, no jump, no swing); one holding still
// beside it ES_REVIVE revives it, the hunter holding still over it ES_FINISH
// finishes it, ES_BLEED downed it is out. Survivors holding still by a
// terminal hack it, faster with more of them, and its light flickers on the
// hunters' HUD while they do; ES_NEED of them hacked (or ES_LATE before the
// clock) the exits open, two spawn points on the ground, and a survivor that
// reaches one escapes. Over when no survivor is left in play, or at the
// clock. Places: the escaped by escape order, then the hunters by survivors
// finished, then downs; then the survivors still in, then those out, each by
// revives, then time hacking.
export const ES_PER = 14; // a hunter for every ES_PER fighters as play starts, rounded, at least one
export const ES_BAR = '25'; // m across: no survivor comes in at a spawn point a hunter is this near
export const ES_REACH = '2'; // m across (and ES_REACH_H up or down): a reviver, or the hunter finishing, from the downed
export const ES_REACH_H = '1.5';
export const ES_STILL = '1'; // m/s across at most: holding still
export const ES_REVIVE = 375; // ticks beside a downed survivor holding still: 3 s
export const ES_FINISH = 250; // ticks the hunter holds still over one: 2 s
export const ES_BLEED = 3750; // ticks downed before it's out: 30 s
export const ES_STUN = 188; // ticks a shove stuns the hunter (it lies down, as the downed, and crawls): 1.5 s
export const ES_CALM = 250; // ticks after a stun no shove stuns it: 2 s
export const ES_COOL = 5000; // ticks before a survivor's shove stuns again: 40 s
export const ES_TPER = 3; // a terminal for every ES_TPER survivors as play starts, rounded up,
export const ES_TMIN = 3; // ES_TMIN at least, and as many as the map has spots ES_APART
export const ES_TMAX = 24; // terminals' room in AO
export const ES_APART = '8'; // m across (or ES_APART_H up or down): two of the map's spots this close are one
export const ES_APART_H = '2.5';
export const ES_TERM_R = '2'; // m across (and ES_TERM_H up or down) a hacker stands from its terminal
export const ES_TERM_H = '1.5';
export const ES_HACK = 6250; // ticks one survivor takes to hack a terminal: 50 s; two take 2/3 of it, three or more 4/7
export const ES_RATE = [0, 4, 6, 7]; // a terminal's progress a tick for 0, 1, 2 and 3 or more hackers, in quarter ticks
export const ES_EXIT_R = '3'; // m across (and ES_EXIT_H up or down) from an open exit: escaped
export const ES_EXIT_H = '2';
export const ES_LATE = 7500; // ticks before the clock the exits open, hacked or not: 60 s
// Per fighter, MODE_REC's bytes: MR_POINTS a survivor's revives of others,
// a hunter's survivors finished; MR_AUX a survivor's ticks hacking (to
// 0xffff), a hunter's downs; MR_RUNG's byte and the last two:
export const ES_MR_ORDER = 0; // u8 a survivor's escape order (1 the first out; 0 not out)
export const ES_MR_STUN = 0; // u8 the hunter's ticks stunned yet
export const ES_MR_TIME = 6; // u16 a standing survivor's ticks before its shove stuns again; a downed one's before it's out
export const ES_MR_FIN = 6; // u8 the hunter's ticks held still over the downed it is finishing
export const ES_MR_CALM = 7; // u8 the hunter's ticks no shove stuns it
// Its state in AO, byte offsets, all zero until play starts:
export const ES_NT = 0; // u32 terminals
export const ES_NEED = 4; // u32 hacked that open the exits: two in three, rounded
export const ES_HACKED = 8; // u32 hacked so far
export const ES_OPEN = 12; // u32 the exits: 0 shut, 1 opened by the terminals, 2 by the clock
export const ES_IN = 16; // u32 survivors in play (standing or down), counted every tick of play
export const ES_UP = 20; // u32 standing
export const ES_DOWNED = 24; // u32 down
export const ES_OUT = 28; // u32 out (finished or bled out)
export const ES_FREE = 32; // u32 escaped, in the room
export const ES_HUNTERS = 36; // u32 hunters
export const ES_END = 40; // u32 how it ended: 0 still playing, 1 nobody left in play, 2 the clock
export const ES_ESCAPES = 44; // u32 escapes this match (the last one's order)
export const ES_DOWNS = 48; // u32 downs this match
export const ES_UPS = 52; // u32 revives
export const ES_STUNS = 56; // u32 stuns
export const ES_FINISHED = 60; // u32 survivors finished
export const ES_EXIT = 64; // 2 x 16 B: f32 x, y, z | u32 0: the exits, once open
export const ES_T = 96; // the terminals, ES_TMAX x ES_TSIZE
export const ES_TSIZE = 16;
export const ES_T_X = 0; // f32 x, y, z: where it stands (feet height)
export const ES_T_Y = 4;
export const ES_T_Z = 8;
export const ES_T_PROG = 12; // u16 its progress, in quarter ticks of one hacker (done at 4 ES_HACK)
export const ES_T_CREW = 14; // u8 survivors hacking it this tick: its noise
export const ES_T_DONE = 15; // u8 1 once hacked
export const ES_HELP = 0x200; // u16 x 256: each downed survivor's ticks of being revived
// Its news, FX_MODE with these as size (MX_AM + 8 * 10 ..), where it happened:
export const ES_MX_DOWN = 96; // owner was downed by the hunter shot
export const ES_MX_UP = 97; // owner revived shot
export const ES_MX_OUT = 98; // owner is out: finished by the hunter shot, or bled out (shot owner)
export const ES_MX_HACK = 99; // terminal shot is hacked, owner the lowest slot hacking it
export const ES_MX_OPEN = 100; // the exits are open: shot 1 the terminals did it, 2 the clock; owner 255, at the first
export const ES_MX_FREE = 101; // owner escaped, shot its order
export const ES_MX_STUN = 102; // owner stunned the hunter shot
export const ES_MX_HUNT = 103; // owner is a hunter
