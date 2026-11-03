// FALL BALL (MG_FALLBALL, prefix fa): a round platform over the sea,
// sized for the crowd; bump the others off, and the last ball on it wins.
// (node tools/new-mg.mjs wrote this as a start: say here what your minigame is.)
// Literal numbers only: the sim reads them through layout.mjs's MG_CONSTS,
// the client imports this file itself.
export const FA_R0 = 12; // the platform: FA_R0 m plus FA_RK times the root of the balls in, at most FA_RMAX
export const FA_RK = 4.5;
export const FA_RMAX = 64;
export const FA_LEN = 11250; // 90 s
// Its header, byte offsets in PG_H (112 B, in the prediction's copy).
export const FA_RAD = 0; // f32 the platform's radius
// Its FX kinds are FX_MG + 4 * MG_FALLBALL + k, k 0 to 3: 216 to 219.
