// SUMO RING (MG_SUMO, prefix su), the first minigame written in Rust
// (rust/mg/sumo/src/lib.rs; src/mg/sumo.wat is what it compiles to). A round
// ring of rubber over the sea, sized for the crowd; bumps on. Posts orbit
// the ring, swinging one way and then back, and knock away any ball they
// meet; from 20 s the ring shrinks. Bump the others off: the last ball on
// wins.
// Literal numbers only: the sim reads them through layout.mjs's MG_CONSTS
// (and the Rust through rust/mg/sumo/gen/consts.rs, which tools/rust.mjs
// writes from this file); the client imports this file itself.
export const SU_R0 = 8; // the ring: SU_R0 m plus SU_RK times the root of the balls in, at most SU_RMAX
export const SU_RK = 3;
export const SU_RMAX = 48;
export const SU_LEN = 12500; // 100 s
export const SU_HOLD = 2500; // ticks into play at full size (20 s); then it shrinks
export const SU_SHRINK = 6250; // ticks it shrinks over (50 s), in a straight line to SU_RLOWK of its size, SU_RMIN m at least
export const SU_RLOWK = 0.35;
export const SU_RMIN = 6;
// The posts: SU_P0 plus one for every SU_PPER balls, SU_PMAX at most, evenly
// round an orbit SU_ORBIT of the ring's radius out (so in as it shrinks).
export const SU_P0 = 2;
export const SU_PPER = 16;
export const SU_PMAX = 10;
export const SU_ORBIT = 0.55;
export const SU_POSTR = 1.1; // a post's radius, m
export const SU_POSTH = 2.4; // its height over the ring, m: a ball whose bottom is higher clears it
export const SU_PV = 5; // m/s round the orbit at the start; the turn rate holds as the ring shrinks
export const SU_SWING = 1500; // ticks the posts swing one way before swinging back (12 s)
export const SU_KICK = 9; // m/s a post knocks a ball away from it, relative to the post
export const SU_POP = 2.5; // m/s up, for a ball it knocks off the floor
export const SU_SPAWNM = 1.6; // the balls start inside the orbit: a sunflower SU_SPAWNM m short of the posts' inner edge
// Its header, byte offsets in PG_H (112 B, in the prediction's copy).
export const SU_RAD = 0; // f32 the ring's radius at the start
export const SU_RLOW = 4; // f32 its least
export const SU_NP = 8; // u32 the posts
export const SU_A0 = 12; // u32 post 0's bearing at the start, 1/2^24 of a turn
export const SU_SPIN = 16; // i32 1/2^24 turns a tick the posts swing, signed: the way they set off
// Its state in PG_S.
export const SU_FELL = 0; // u16 per ball: the tick into play (plus one) it first fell, for over
// FX kinds, FX_MG + 4 * MG_SUMO + k: 192 to 195.
export const SU_FX_BONK = 192; // a post knocks a ball: the ball as owner, the post as shot, the knock's m/s as size
export const SU_FX_RING = 193; // the ring starts to shrink (shot 0) or reaches its least (shot 1): its least as size
export const SU_FX_TURN = 194; // the posts swing back: shot the swings so far
