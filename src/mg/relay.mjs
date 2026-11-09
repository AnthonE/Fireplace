// RELAY RACE: two batons, four out-and-back legs per side. Gates must be
// visited in order, then the runner meets the next teammate at the exchange.
export const RR_LEN = 11250; // 90 s; most completed legs wins at the clock
export const RR_LEGS = 4;
export const RR_X = 24; // gates at centre +/- X
export const RR_Z = 14; // each team's lane centre from the stage centre
export const RR_WIDTH = 5; // half the loop's width
export const RR_GATE = 3; // checkpoint / exchange radius
export const RR_HX = 72; // floor half extents, with a waiting area behind the start
export const RR_HZ = 32;
export const RR_RESPAWN = 250;
// PG_H, two u32s per field. Slot sentinel 256 leaves slot 255 playable.
export const RR_RUNNER = 0;
export const RR_CHECK = 8; // 0: collect baton at home, 1..3: course gates, 4: exchange
export const RR_NEXT = 16;
