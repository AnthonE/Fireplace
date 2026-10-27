//! SUMO RING: a round ring of rubber over the sea, sized for the crowd, bumps
//! on. Posts orbit it, swinging SU_SWING ticks one way and then back, and
//! knock away any ball they meet; from SU_HOLD into play the ring shrinks to
//! its least. Bump the others off: the last ball on wins.
//!
//! Every hazard is a function of the tick and the round's header (PG_H, in
//! the prediction's copy), so ground and push give the prediction exactly
//! what the confirmed world will: a post's knock is predicted bit for bit,
//! as a ring that shrinks under you is. Only ball against ball (the bumps,
//! the framework's) comes a round trip late.
//!
//! The nine hooks are the WAT's, `su_<hook>`; tools/rust.mjs turns this crate
//! into src/mg/sumo.wat. spawn writes its x, y, z through `out`.
#![no_std]

use fp::*;
include!("../gen/consts.rs");

/// The ring's radius on tick t of play, from r0 to r1: still until SU_HOLD,
/// then in a straight line to r1 at SU_HOLD + SU_SHRINK.
#[inline(always)]
fn ring(r0: f32, r1: f32, t: i32) -> f32 {
    if t <= SU_HOLD {
        return r0;
    }
    if t >= SU_HOLD + SU_SHRINK {
        return r1;
    }
    let k = (t - SU_HOLD) as f32 / SU_SHRINK as f32;
    r0 - (r0 - r1) * k
}

/// The ring's radius on bank d's tick t.
#[inline(always)]
fn rim(d: i32, t: i32) -> f32 {
    ring(ld_f32(PG_H + SU_RAD + d), ld_f32(PG_H + SU_RLOW + d), t)
}

/// How far along their swing the posts are on tick t: up for SU_SWING
/// ticks, back down for SU_SWING, and again.
#[inline(always)]
fn swing(t: i32) -> i32 {
    let t = if t < 0 { 0 } else { t };
    let m = t % SU_SWING;
    if (t / SU_SWING) & 1 == 0 {
        m
    } else {
        SU_SWING - m
    }
}

/// Post k's centre (x, z) on bank d's tick t. Inlined, as any function
/// handing back two values must be: one that isn't returns them through the
/// stack, which the sim can't have (tools/rust.mjs says so).
#[inline(always)]
fn post(d: i32, k: i32, t: i32) -> (f32, f32) {
    let np = ld_i32(PG_H + SU_NP + d);
    let a = ld_i32(PG_H + SU_A0 + d)
        .wrapping_add(ld_i32(PG_H + SU_SPIN + d).wrapping_mul(swing(t)))
        .wrapping_add(k * (1 << 24) / np);
    let (s, c) = sincos(((a as u32) & 0xffffff) as i32 >> 10);
    let rho = SU_ORBIT * rim(d, t);
    let cx = centre(d);
    (c * rho + cx, s * rho + cx)
}

/// The ring and its posts for n balls: its radius, its least, how many
/// posts, where post 0 starts and how fast and which way they set off.
#[no_mangle]
pub extern "C" fn su_setup(n: i32) {
    let r0 = fmin(sqrt(n as f32) * SU_RK as f32 + SU_R0 as f32, SU_RMAX as f32);
    let r1 = fmax(r0 * SU_RLOWK, SU_RMIN as f32);
    let np = SU_P0 + n / SU_PPER;
    let np = if np > SU_PMAX { SU_PMAX } else { np };
    // SU_PV m/s round an orbit of SU_ORBIT * r0, in 1/2^24 turns a tick
    let spin = (SU_PV as f32 * DT * 16777216.0 / (6.2831855 * SU_ORBIT * r0)) as i32;
    let r = rand();
    st_i32(PG_KIND, PK_OUT);
    st_i32(PG_LEN, SU_LEN);
    st_f32(PG_SIZE, r0);
    st_f32(PG_H + SU_RAD, r0);
    st_f32(PG_H + SU_RLOW, r1);
    st_i32(PG_H + SU_NP, np);
    st_i32(PG_H + SU_A0, r & 0xffffff);
    st_i32(PG_H + SU_SPIN, if r < 0 { -spin } else { spin });
}

/// A sunflower spiral inside the orbit, clear of the posts.
#[no_mangle]
pub extern "C" fn su_spawn(i: i32, n: i32, out: &mut [f32; 3]) {
    let r0 = ld_f32(PG_H + SU_RAD);
    let (x, z) = p_disc(i, n, fmax(SU_ORBIT * r0 - SU_POSTR - SU_SPAWNM, 1.0));
    out[0] = x;
    out[1] = PLAT_Y;
    out[2] = z;
}

/// The ring's top under (x, z) if (x, z) is on it on bank d's tick, else none.
#[no_mangle]
pub extern "C" fn su_ground(d: i32, x: f32, y: f32, z: f32) -> f32 {
    if y < PLAT_Y {
        return -1000.0;
    }
    let r = rim(d, p_t(d));
    let dx = x - centre(d);
    let dz = z - centre(d);
    if dx * dx + dz * dz <= r * r {
        PLAT_Y
    } else {
        -1000.0
    }
}

/// Ball p after its roll on bank d: a post it is inside puts it back on the
/// post's edge, knocked away at SU_KICK m/s relative to the post (and up a
/// little, off the floor), an FX in its bank's ring, PG_M counting its knocks.
#[no_mangle]
pub extern "C" fn su_push(p: i32, d: i32) {
    let b = Ball::of(p, d);
    let mut fl = b.fl();
    if fl & (PF_FALL | PF_DEAD) != 0 {
        return;
    }
    let py = b.py();
    if py >= PLAT_Y + SU_POSTH {
        return;
    }
    let t = p_t(d);
    let rr = b.rad() + SU_POSTR;
    let np = ld_i32(PG_H + SU_NP + d);
    let (mut px, mut pz) = (b.px(), b.pz());
    let (mut vx, mut vz) = (b.vx(), b.vz());
    let mut hit = false;
    for k in 0..np {
        let (x, z) = post(d, k, t);
        let dx = px - x;
        let dz = pz - z;
        let d2 = dx * dx + dz * dz;
        if d2 >= rr * rr {
            continue;
        }
        let h = sqrt(d2);
        let (nx, nz) = if h > 1e-4 { (dx / h, dz / h) } else { (1.0, 0.0) };
        // the post's own velocity: where it is this tick against the last
        let (x1, z1) = post(d, k, t - 1);
        let pvx = (x - x1) / DT;
        let pvz = (z - z1) / DT;
        let vr = (vx - pvx) * nx + (vz - pvz) * nz;
        let kick = if vr < SU_KICK as f32 { SU_KICK as f32 - vr } else { 0.0 };
        vx = nx * kick + vx;
        vz = nz * kick + vz;
        px = nx * rr + x;
        pz = nz * rr + z;
        hit = true;
        fx(d, SU_FX_BONK, p, k, px, py, pz, kick);
    }
    if !hit {
        return;
    }
    if fl & PF_GROUND != 0 {
        fl &= !PF_GROUND;
        b.set_vy(SU_POP);
        b.set_fl(fl);
    }
    b.set_px(px);
    b.set_pz(pz);
    b.set_vx(vx);
    b.set_vz(vz);
    b.set_m(b.m() + 1);
}

/// The schedule's moments, as FX: the ring starting to shrink and reaching
/// its least, the posts swinging back.
#[no_mangle]
pub extern "C" fn su_tick() {
    let t = p_t(0);
    let cx = centre(0);
    let low = ld_f32(PG_H + SU_RLOW);
    if t == SU_HOLD {
        fx(0, SU_FX_RING, 255, 0, cx, PLAT_Y, cx, low);
    }
    if t == SU_HOLD + SU_SHRINK {
        fx(0, SU_FX_RING, 255, 1, cx, PLAT_Y, cx, low);
    }
    if t > 0 && t % SU_SWING == 0 {
        fx(0, SU_FX_TURN, 255, t / SU_SWING, cx, PLAT_Y, cx, 0.0);
    }
}

/// Two or more still on, every one of them falling, and all since the same
/// tick (knocked off together): over now, and they share the win rather than
/// all sharing last. One that went off before the rest goes out first, in its
/// place. Each ball's first tick falling is noted in PG_S (SU_FELL).
#[no_mangle]
pub extern "C" fn su_over() -> i32 {
    let t = p_t(0) + 1;
    for p in 0..NPLAYER {
        let fl = Ball::of(p, 0).fl() & (PF_LIVE | PF_DEAD | PF_FALL);
        let fell = PG_S + SU_FELL + 2 * p;
        if fl == PF_LIVE | PF_FALL && ld_u16(fell) == 0 {
            st_u16(fell, t);
        }
    }
    if ld_i32(BH_LEFT) < 2 {
        return 0;
    }
    let mut at = 0;
    for p in 0..NPLAYER {
        let fl = Ball::of(p, 0).fl() & (PF_LIVE | PF_DEAD | PF_FALL);
        if fl == PF_LIVE {
            return 0;
        }
        if fl == PF_LIVE | PF_FALL {
            let fell = ld_u16(PG_S + SU_FELL + 2 * p);
            if at == 0 {
                at = fell;
            }
            if fell != at {
                return 0;
            }
        }
    }
    1
}

// start, begin and out: tools/rust.mjs writes them empty.
