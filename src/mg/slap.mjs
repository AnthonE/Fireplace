// SLAP HAPPY (MG_SLAP, prefix sl): a round platform over the sea,
// sized for the crowd; bump the others off, and the last ball on it wins.
// (node tools/new-mg.mjs wrote this as a start: say here what your minigame is.)
// Literal numbers only: the sim reads them through layout.mjs's MG_CONSTS,
// the client imports this file itself.
export const SL_R0 = 12; // the platform: SL_R0 m plus SL_RK times the root of the balls in, at most SL_RMAX
export const SL_RK = 4.5;
export const SL_RMAX = 64;
export const SL_LEN = 11250; // 90 s
// Its header, byte offsets in PG_H (112 B, in the prediction's copy).
export const SL_RAD = 0; // f32 the platform's radius
// Its FX kinds are FX_MG + 4 * MG_SLAP + k, k 0 to 3: 156 to 159.
