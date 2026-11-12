// OBBY (M_OBBY, prefix oy): an obstacle course, everyone for itself, no
// sides and nothing in anyone's hands. Never in the rotation: a map that
// names it plays it (map.json "mode": "obby"), or a forced seed.
//
// The course is the map's parts (layout.mjs MAP_PARTS, a box's eighth
// element in map.json): what kills, throws, slides, carries and climbs is the
// map's in every mode; this mode reads its checkpoints and its finish.
// Touching a checkpoint whose stage is past yours makes it yours (any later
// one: a shortcut found is a shortcut earned); you come back OY_RESPAWN after
// a death on your stage's checkpoint, or at the map's spawn before the
// first. Touching a finish ends your run, timed from the start of play. The
// first to finish cuts the clock to OY_AFTER, so a room doesn't wait out a
// straggler; the match is over at the clock, or when everyone in it has
// finished. Places: the finishers by their time, then the rest by stage,
// then the fewer deaths. Nobody can hurt anybody.
export const OY_RESPAWN = 125; // ticks: back on your checkpoint a second after a death
export const OY_AFTER = 5625; // ticks left on the clock once the first has finished: 45 s
// A fighter's own, in its MODE_REC: MR_POINTS its stage (0 before the first
// checkpoint), and
export const OY_MR_DONE = 6; // u16 the ticks of play it finished in (0: still running), at most 65535
// In AO:
export const OY_STAGES = 0; // u32 the course's last stage: the highest any checkpoint has
export const OY_DONE = 4; // u32 how many have finished
// Its news (FX_MODE): 16 + 8 * 13 for the fourteenth mode on the kit
export const OY_MX_STAGE = 120; // owner reached stage shot
export const OY_MX_DONE = 121; // owner finished, shot its place among the finishers
export const OY_MX_FIRST = 122; // owner finished first: the clock is cut to OY_AFTER
