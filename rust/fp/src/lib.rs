//! The engine as a Party minigame written in Rust sees it: the one memory
//! map (every number of src/layout.mjs and its PHYS and BPHYS, as
//! `pub const`s), loads and stores at those addresses, a ball's record, and
//! the engine's own functions (`$rand`, `$sincos`, `$p_t`, `$fx`, ...), which
//! tools/rust.mjs links to the real ones when it turns the crate's wasm into
//! the minigame's WAT.
//!
//! What a minigame may not have, because the sim can't (tools/rust.mjs
//! refuses each and says which function did it): a `static` or anything else
//! in memory of its own (a constant table, a string), the stack (a local array
//! or anything whose address is taken), a function pointer or `dyn` call.
//! State goes where a WAT minigame keeps it: PG_H, PG_S, PG_BIG and the
//! record's PG_M and PG_SCORE, through the functions below.
//!
//! Floats: Rust's `a * b + c` is a multiply then an add, never fused, as
//! `(!madd a b c)` is; never `mul_add`. Angles through [`sincos`] (1/16384 of a
//! turn), never a float sin or cos. [`rand`] only from serial confirmed code
//! (setup, spawn, start, tick, out), never in begin, ground or push.
//! Integer overflow wraps (release, no overflow checks) as WAT's does; a
//! division by zero or an index out of bounds traps the sim for everyone.
#![no_std]

include!("../gen/layout.rs");

#[panic_handler]
fn panic(_: &core::panic::PanicInfo) -> ! {
    core::arch::wasm32::unreachable()
}

// ---- memory, by address (an i32, as in the WAT)

macro_rules! access {
    ($ld:ident, $st:ident, $t:ty, $as:ty) => {
        #[inline(always)]
        pub fn $ld(a: i32) -> $as {
            unsafe { core::ptr::read(a as u32 as usize as *const $t) as $as }
        }
        #[inline(always)]
        pub fn $st(a: i32, v: $as) {
            unsafe { core::ptr::write(a as u32 as usize as *mut $t, v as $t) }
        }
    };
}
access!(ld_u8, st_u8, u8, i32);
access!(ld_u16, st_u16, u16, i32);
access!(ld_i32, st_i32, i32, i32);
access!(ld_f32, st_f32, f32, f32);

// ---- the engine's functions, linked by tools/rust.mjs

mod sys {
    // A name is the engine's function of that name; NAME__pk is one that
    // returns two 32-bit values, handed back packed in an i64 (the first in
    // the low half). sqrt, floor, ceil, trunc, nearest, fmin and fmax become
    // the f32 instruction itself.
    #[link(wasm_import_module = "fp")]
    extern "C" {
        pub fn sqrt(x: f32) -> f32;
        pub fn floor(x: f32) -> f32;
        pub fn ceil(x: f32) -> f32;
        pub fn trunc(x: f32) -> f32;
        pub fn nearest(x: f32) -> f32;
        pub fn fmin(a: f32, b: f32) -> f32;
        pub fn fmax(a: f32, b: f32) -> f32;
        pub fn rand() -> i32;
        pub fn sincos__pk(u: i32) -> i64;
        pub fn hash32(x: i32, z: i32, s: i32) -> i32;
        pub fn p_t(d: i32) -> i32;
        pub fn p_unit() -> f32;
        pub fn p_in(pb: i32) -> i32;
        pub fn p_seed(k: i32) -> i32;
        pub fn p_disc__pk(i: i32, n: i32, r: f32) -> i64;
        pub fn p_hex__pk(x: f32, z: f32, s: f32) -> i64;
        pub fn p_hexc__pk(q: i32, r: i32, s: f32) -> i64;
        pub fn b_rad(pb: i32) -> f32;
        pub fn fx(d: i32, kind: i32, owner: i32, shot: i32, x: f32, y: f32, z: f32, size: f32);
    }
}

#[inline(always)]
fn lo_f32(v: i64) -> f32 {
    f32::from_bits(v as u32)
}
#[inline(always)]
fn hi_f32(v: i64) -> f32 {
    f32::from_bits((v >> 32) as u32)
}

/// f32.sqrt.
#[inline(always)]
pub fn sqrt(x: f32) -> f32 {
    unsafe { sys::sqrt(x) }
}
/// f32.floor.
#[inline(always)]
pub fn floor(x: f32) -> f32 {
    unsafe { sys::floor(x) }
}
/// f32.ceil.
#[inline(always)]
pub fn ceil(x: f32) -> f32 {
    unsafe { sys::ceil(x) }
}
/// f32.trunc.
#[inline(always)]
pub fn trunc(x: f32) -> f32 {
    unsafe { sys::trunc(x) }
}
/// f32.nearest: ties to even.
#[inline(always)]
pub fn nearest(x: f32) -> f32 {
    unsafe { sys::nearest(x) }
}
/// f32.min, one instruction (Rust's `f32::min` is several).
#[inline(always)]
pub fn fmin(a: f32, b: f32) -> f32 {
    unsafe { sys::fmin(a, b) }
}
/// f32.max.
#[inline(always)]
pub fn fmax(a: f32, b: f32) -> f32 {
    unsafe { sys::fmax(a, b) }
}
/// The room's PRNG (`$rand`): serial confirmed code only.
#[inline(always)]
pub fn rand() -> i32 {
    unsafe { sys::rand() }
}
/// (sin, cos) of u/16384 of a turn (`$sincos`).
#[inline(always)]
pub fn sincos(u: i32) -> (f32, f32) {
    let v = unsafe { sys::sincos__pk(u) };
    (lo_f32(v), hi_f32(v))
}
/// `$hash32`: a hash of three words.
#[inline(always)]
pub fn hash32(x: i32, z: i32, s: i32) -> i32 {
    unsafe { sys::hash32(x, z, s) }
}
/// Ticks since the round's start on bank d (0 before it plays).
#[inline(always)]
pub fn p_t(d: i32) -> i32 {
    unsafe { sys::p_t(d) }
}
/// Uniform in [0, 1), from the PRNG: serial confirmed code only.
#[inline(always)]
pub fn p_unit() -> f32 {
    unsafe { sys::p_unit() }
}
/// A per-round random number for k, from the header alone: any bank may ask.
#[inline(always)]
pub fn p_seed(k: i32) -> i32 {
    unsafe { sys::p_seed(k) }
}
/// Point i of n of a sunflower spiral over a disc of radius r round the stage's centre: (x, z).
#[inline(always)]
pub fn p_disc(i: i32, n: i32, r: f32) -> (f32, f32) {
    let v = unsafe { sys::p_disc__pk(i, n, r) };
    (lo_f32(v), hi_f32(v))
}
/// The axial hex (q, r) holding (x, z), cells of circumradius s (`$p_hex`).
#[inline(always)]
pub fn p_hex(x: f32, z: f32, s: f32) -> (i32, i32) {
    let v = unsafe { sys::p_hex__pk(x, z, s) };
    (v as i32, (v >> 32) as i32)
}
/// The centre (x, z) of hex (q, r) (`$p_hexc`).
#[inline(always)]
pub fn p_hexc(q: i32, r: i32, s: f32) -> (f32, f32) {
    let v = unsafe { sys::p_hexc__pk(q, r, s) };
    (lo_f32(v), hi_f32(v))
}
/// An FX record in bank d's ring: what the renderer and the sound hear of.
#[inline(always)]
pub fn fx(d: i32, kind: i32, owner: i32, shot: i32, x: f32, y: f32, z: f32, size: f32) {
    unsafe { sys::fx(d, kind, owner, shot, x, y, z, size) }
}

// ---- the round's header, on bank d (0 the confirmed world, PRED_D the prediction's copy)

/// The tick on bank d.
#[inline(always)]
pub fn tick(d: i32) -> i32 {
    ld_i32(HDR_TICK + d)
}
/// The stage's centre, world x and z, on bank d.
#[inline(always)]
pub fn centre(d: i32) -> f32 {
    ld_f32(PG_CX + d)
}

// ---- a ball

/// Ball p's record on bank d: the WAT's `pb` is `b.pb`.
#[derive(Clone, Copy)]
pub struct Ball {
    pub p: i32,
    pub pb: i32,
}

macro_rules! field {
    ($get:ident, $set:ident, $ld:ident, $st:ident, $t:ty, $off:expr) => {
        #[inline(always)]
        pub fn $get(self) -> $t {
            $ld(PLAYERS + $off + self.pb)
        }
        #[inline(always)]
        pub fn $set(self, v: $t) {
            $st(PLAYERS + $off + self.pb, v)
        }
    };
}

impl Ball {
    #[inline(always)]
    pub fn of(p: i32, d: i32) -> Ball {
        Ball { p, pb: p * PSIZE + d }
    }
    field!(px, set_px, ld_f32, st_f32, f32, P_PX);
    field!(py, set_py, ld_f32, st_f32, f32, P_PY);
    field!(pz, set_pz, ld_f32, st_f32, f32, P_PZ);
    field!(vx, set_vx, ld_f32, st_f32, f32, P_VX);
    field!(vy, set_vy, ld_f32, st_f32, f32, P_VY);
    field!(vz, set_vz, ld_f32, st_f32, f32, P_VZ);
    // P_FL: PF_LIVE, PF_GROUND, PF_FALL, PF_DEAD, ...
    field!(fl, set_fl, ld_u8, st_u8, i32, P_FL);
    // PG_M: the minigame's own field, zeroed each round.
    field!(m, set_m, ld_i32, st_i32, i32, PG_M);
    // PG_SCORE: this round's score (PK_SCORE rounds place by it).
    field!(score, set_score, ld_u16, st_u16, i32, PG_SCORE);
    /// Live, not out, not going out.
    #[inline(always)]
    pub fn is_in(self) -> bool {
        unsafe { sys::p_in(self.pb) != 0 }
    }
    /// Its radius (B_RAD, or its own when the round sets PGF_SIZE).
    #[inline(always)]
    pub fn rad(self) -> f32 {
        unsafe { sys::b_rad(self.pb) }
    }
}
