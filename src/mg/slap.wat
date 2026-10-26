;; SLAP HAPPY: an island over the sea sized for the crowd, a ring of small
;; ones round it a hop off its rim (SL_GAP), and every ball wearing a glove.
;; A press of use winds the glove up; SL_GWIND ticks later the slap lands on
;; the nearest ball in a cone ahead within reach, which keeps a quarter of
;; its way across and is flung on from the slapper and up, far harder than a
;; bump. A ball that goes into the sea costs itself a point and pays one
;; (two in the last 15 s) to whoever slapped it last in the 3 s before it
;; went over; it's back on a pad on a small island 2 s on, and no slap lands
;; on it for 1.5 s more. Each ball's glove is the round's seed's pick, one of
;; four (classic, heavy, quick, long: wind-up, cooldown, reach and fling in
;; SL_G*). Bumps on; most points at 90 s wins.
;;
;; The islands are the confirmed world's from setup on, and a swing is the
;; ball's own: its press and its tick in PG_M, written by its push on either
;; bank, so the prediction winds your glove up and through its cooldown
;; exactly as the confirmed world will. The slap itself is ball against
;; ball, the confirmed world's tick, and reaches the one slapped a round
;; trip late, as a bump does.

;; A ball's glove this round (SL_G_*).
(func $sl_glove (param $p i32) (result i32)
  (i32.and (i32.shr_u (call $p_seed (i32.add (i32.const @SL_KGLOVE) (local.get $p))) (i32.const 8)) (i32.const 3)))

;; The islands for the crowd: the main one, and the small ones on a ring
;; round it, turned by the seed.
(func $sl_setup (param $n i32)
  (local $rm f32) (local $sr f32) (local $ring f32) (local $ns i32) (local $k i32) (local $ph i32) (local $s f32) (local $c f32) (local $cx f32)
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (local.set $rm (f32.min (!madd (f32.sqrt (f32.convert_i32_u (local.get $n))) (f32.const @SL_RK) (f32.const @SL_R0)) (f32.const @SL_RMAX)))
  (local.set $ns (i32.add (i32.const @SL_K0) (i32.trunc_sat_f32_u (f32.mul (local.get $rm) (f32.const @SL_KK)))))
  (if (i32.gt_u (local.get $ns) (i32.const @SL_KMAX)) (then (local.set $ns (i32.const @SL_KMAX))))
  (local.set $sr (!madd (local.get $rm) (f32.const @SL_SK) (f32.const @SL_S0)))
  (local.set $ring (f32.add (f32.add (local.get $rm) (f32.const @SL_GAP)) (local.get $sr)))
  (!chk (local.get $rm) 310 (local.get $n))
  (i32.store (i32.const @PG_KIND) (i32.const @PK_SCORE))
  (i32.store (i32.const @PG_LEN) (i32.const @SL_LEN))
  (i32.store (i32.const @PG_RESPAWN) (i32.const @SL_RESPAWN))
  (f32.store (i32.const @PG_IDLE) (f32.const @SL_IDLE))
  (f32.store (i32.const @PG_SIZE) (f32.add (local.get $ring) (local.get $sr)))
  (f32.store (i32.const @(PG_H + SL_RAD)) (local.get $rm))
  (i32.store (i32.const @(PG_H + SL_NS)) (local.get $ns))
  (f32.store (i32.const @(PG_H + SL_SR)) (local.get $sr))
  (f32.store (i32.const @(PG_H + SL_RING)) (local.get $ring))
  (local.set $ph (call $p_seed (i32.const @SL_KTURN)))
  (!for $k (i32.const 0) (local.get $ns)
    (call $sincos (i32.add (local.get $ph) (i32.div_u (i32.mul (local.get $k) (i32.const 16384)) (local.get $ns))))
    (local.set $c) (local.set $s)
    (!st f32 @(PG_S + SL_SAT) (i32.shl (local.get $k) (i32.const 1)) (!madd (local.get $c) (local.get $ring) (local.get $cx)))
    (!st f32 @(PG_S + SL_SAT + 4) (i32.shl (local.get $k) (i32.const 1)) (!madd (local.get $s) (local.get $ring) (local.get $cx)))))

;; Ball i of n on a sunflower spiral over the main island; a respawn or a
;; newcomer in play (i of 1024) on small island i mod their number, on a
;; sunflower over its pad.
(func $sl_spawn (param $i i32) (param $n i32) (result f32 f32 f32)
  (local $x f32) (local $z f32) (local $ns i32) (local $k i32) (local $rr f32) (local $s f32) (local $c f32)
  (if (i32.eq (local.get $n) (i32.const 1024))
    (then
      (local.set $ns (i32.load (i32.const @(PG_H + SL_NS))))
      (local.set $k (i32.rem_u (local.get $i) (local.get $ns)))
      (local.set $rr (f32.mul (f32.mul (f32.load (i32.const @(PG_H + SL_SR))) (f32.const @SL_PAD))
                              (f32.sqrt (f32.mul (f32.add (f32.convert_i32_u (i32.and (i32.div_u (local.get $i) (local.get $ns)) (i32.const 15))) (f32.const 0.5))
                                                 (f32.const 0.0625)))))
      (call $sincos (i32.mul (local.get $i) (i32.const 6258)))
      (local.set $c) (local.set $s)
      (return (!madd (local.get $c) (local.get $rr) (!ld f32 @(PG_S + SL_SAT) (i32.shl (local.get $k) (i32.const 1))))
              (f32.const @PLAT_Y)
              (!madd (local.get $s) (local.get $rr) (!ld f32 @(PG_S + SL_SAT + 4) (i32.shl (local.get $k) (i32.const 1)))))))
  (call $p_disc (local.get $i) (local.get $n) (f32.mul (f32.load (i32.const @(PG_H + SL_RAD))) (f32.const @SL_SPAWN)))
  (local.set $z) (local.set $x)
  (local.get $x) (f32.const @PLAT_Y) (local.get $z))

(func $sl_start)

;; Play starts for ball p on bank d: in the round, the press it has made already taken.
(func $sl_begin (param $p i32) (param $d i32)
  (local $pb i32)
  (local.set $pb (i32.add (i32.shl (local.get $p) (i32.const 6)) (local.get $d)))
  (!put i32 @(PLAYERS + PG_M) (local.get $pb)
    (i32.or (i32.const @SL_M_IN) (i32.and (i32.shr_u (!at i32 @(PLAYERS + P_IN) (local.get $pb)) (i32.const 29)) (i32.const 3)))))

;; The islands' top under (x, z) on bank d: the main one, or a small one.
(func $sl_ground (param $d i32) (param $x f32) (param $y f32) (param $z f32) (result f32)
  (local $dx f32) (local $dz f32) (local $r2 f32) (local $rm f32) (local $sr f32) (local $ring f32) (local $k i32) (local $ns i32)
  (if (f32.lt (local.get $y) (f32.const @PLAT_Y)) (then (return (f32.const -1000))))
  (local.set $dx (f32.sub (local.get $x) (f32.load offset=@PG_CX (local.get $d))))
  (local.set $dz (f32.sub (local.get $z) (f32.load offset=@PG_CX (local.get $d))))
  (local.set $r2 (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))))
  (local.set $rm (f32.load offset=@(PG_H + SL_RAD) (local.get $d)))
  (if (f32.le (local.get $r2) (f32.mul (local.get $rm) (local.get $rm))) (then (return (f32.const @PLAT_Y))))
  ;; past the main island: only within a small one's radius of their ring
  (local.set $sr (f32.load offset=@(PG_H + SL_SR) (local.get $d)))
  (local.set $ring (f32.load offset=@(PG_H + SL_RING) (local.get $d)))
  (if (i32.or (f32.gt (local.get $r2) (call $sl_sq (f32.add (local.get $ring) (local.get $sr))))
              (f32.lt (local.get $r2) (call $sl_sq (f32.sub (local.get $ring) (local.get $sr)))))
    (then (return (f32.const -1000))))
  (local.set $ns (i32.load offset=@(PG_H + SL_NS) (local.get $d)))
  (!for $k (i32.const 0) (local.get $ns)
    (local.set $dx (f32.sub (local.get $x) (!ld f32 @(PG_S + SL_SAT) (i32.shl (local.get $k) (i32.const 1)))))
    (local.set $dz (f32.sub (local.get $z) (!ld f32 @(PG_S + SL_SAT + 4) (i32.shl (local.get $k) (i32.const 1)))))
    (if (f32.le (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))) (f32.mul (local.get $sr) (local.get $sr)))
      (then (return (f32.const @PLAT_Y)))))
  (f32.const -1000))

(func $sl_sq (param $x f32) (result f32) (f32.mul (local.get $x) (local.get $x)))

;; Ball p on bank d after its roll: a press of use taken (new to the round,
;; only its counter); one with the glove's cooldown gone by since the last,
;; and the ball not going over, starts a swing on this tick.
(func $sl_push (param $p i32) (param $d i32)
  (local $pb i32) (local $m i32) (local $ctr i32) (local $t i32) (local $last i32)
  (local.set $pb (i32.add (i32.shl (local.get $p) (i32.const 6)) (local.get $d)))
  (local.set $m (!at i32 @(PLAYERS + PG_M) (local.get $pb)))
  (local.set $ctr (i32.and (i32.shr_u (!at i32 @(PLAYERS + P_IN) (local.get $pb)) (i32.const 29)) (i32.const 3)))
  (if (i32.eqz (i32.and (local.get $m) (i32.const @SL_M_IN)))
    (then (!put i32 @(PLAYERS + PG_M) (local.get $pb) (i32.or (i32.const @SL_M_IN) (local.get $ctr))) (return)))
  (if (i32.eq (local.get $ctr) (i32.and (local.get $m) (i32.const 3))) (then (return)))
  (local.set $m (i32.or (i32.and (local.get $m) (i32.const -4)) (local.get $ctr)))
  (if (i32.eqz (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @PF_FALL)))
    (then
      (local.set $t (call $p_t (local.get $d)))
      (local.set $last (i32.shr_u (local.get $m) (i32.const 16)))
      (if (i32.or (i32.eqz (local.get $last))
                  (i32.ge_s (i32.sub (i32.add (local.get $t) (i32.const 1)) (local.get $last)) (!tab SL_GCOOL (call $sl_glove (local.get $p)))))
        (then (local.set $m (i32.or (i32.and (local.get $m) (i32.const 0xffff)) (i32.shl (i32.add (local.get $t) (i32.const 1)) (i32.const 16))))))))
  (!put i32 @(PLAYERS + PG_M) (local.get $pb) (local.get $m)))

;; Slot p's slap lands, on tick now: on the nearest ball in (by its centre,
;; ties to the lower slot) within the glove's reach and SL_DY of height, in
;; the cone ahead of where p faces now, not just back; flung on away from p
;; and up, marked as p's for the credit. SL_FX_SLAP either way.
(func $sl_slap (param $p i32) (param $now i32)
  (local $pb i32) (local $q i32) (local $qb i32) (local $best i32) (local $g i32)
  (local $s f32) (local $c f32) (local $px f32) (local $py f32) (local $pz f32) (local $rp f32)
  (local $dx f32) (local $dy f32) (local $dz f32) (local $d2 f32) (local $bd2 f32) (local $reach f32) (local $dist f32)
  (local $nx f32) (local $nz f32) (local $fling f32) (local $safe i32)
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (local.set $g (call $sl_glove (local.get $p)))
  (call $sincos (!at i32 @(PLAYERS + P_IN) (local.get $pb)))
  (local.set $c) (local.set $s)
  (local.set $rp (call $b_rad (local.get $pb)))
  (local.set $px (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
  (local.set $py (f32.add (!at f32 @(PLAYERS + P_PY) (local.get $pb)) (local.get $rp)))
  (local.set $pz (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
  (local.set $reach (f32.mul (f32.convert_i32_u (!tab SL_GREACH (local.get $g))) (f32.const 0.01)))
  (local.set $bd2 (f32.mul (local.get $reach) (local.get $reach)))
  (local.set $best (i32.const 255))
  (local.set $safe (i32.add (i32.load (i32.const @PG_RESPAWN)) (i32.const @SL_SAFE)))
  (!for $q (i32.const 0) (i32.const @NPLAYER)
    (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
    (if (i32.and (i32.and (i32.ne (local.get $q) (local.get $p)) (call $p_in (local.get $qb)))
                 (i32.ge_u (i32.sub (local.get $now) (!at i32 @(PLAYERS + B_OUTAT) (local.get $qb))) (local.get $safe)))
      (then
        (local.set $dx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $qb)) (local.get $px)))
        (local.set $dz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $qb)) (local.get $pz)))
        (if (i32.and (f32.lt (f32.abs (local.get $dx)) (local.get $reach)) (f32.lt (f32.abs (local.get $dz)) (local.get $reach)))
          (then
            (local.set $dy (f32.sub (f32.add (!at f32 @(PLAYERS + P_PY) (local.get $qb)) (call $b_rad (local.get $qb))) (local.get $py)))
            (local.set $d2 (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))))
            (if (i32.and (i32.and (f32.lt (local.get $d2) (local.get $bd2)) (f32.le (f32.abs (local.get $dy)) (f32.const @SL_DY)))
                         (f32.ge (!madd (local.get $dx) (local.get $c) (f32.mul (local.get $dz) (local.get $s)))
                                 (f32.mul (f32.sqrt (local.get $d2)) (f32.const @SL_CONE))))
              (then (local.set $bd2 (local.get $d2)) (local.set $best (local.get $q)))))))))
  (if (i32.eq (local.get $best) (i32.const 255))
    (then
      (call $fx (i32.const 0) (i32.const @SL_FX_SLAP) (local.get $p) (i32.const 255)
                (!madd (local.get $c) (f32.add (local.get $rp) (f32.const 1)) (local.get $px)) (local.get $py)
                (!madd (local.get $s) (f32.add (local.get $rp) (f32.const 1)) (local.get $pz)) (f32.const 0))
      (return)))
  (local.set $qb (i32.shl (local.get $best) (i32.const 6)))
  (local.set $dx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $qb)) (local.get $px)))
  (local.set $dz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $qb)) (local.get $pz)))
  (local.set $dist (f32.sqrt (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz)))))
  ;; dead on top of it: the way p faces
  (if (f32.lt (local.get $dist) (f32.const 0.01))
    (then (local.set $nx (local.get $c)) (local.set $nz (local.get $s)))
    (else
      (local.set $nx (f32.div (local.get $dx) (local.get $dist)))
      (local.set $nz (f32.div (local.get $dz) (local.get $dist)))))
  (local.set $fling (f32.mul (f32.convert_i32_u (!tab SL_GFLING (local.get $g))) (f32.const 0.01)))
  (!chk (local.get $nx) 311 (local.get $p))
  (!chk (local.get $nz) 311 (local.get $p))
  (!put f32 @(PLAYERS + P_VX) (local.get $qb) (!madd (local.get $nx) (local.get $fling) (f32.mul (!at f32 @(PLAYERS + P_VX) (local.get $qb)) (f32.const @SL_KEEP))))
  (!put f32 @(PLAYERS + P_VZ) (local.get $qb) (!madd (local.get $nz) (local.get $fling) (f32.mul (!at f32 @(PLAYERS + P_VZ) (local.get $qb)) (f32.const @SL_KEEP))))
  (!put f32 @(PLAYERS + P_VY) (local.get $qb) (f32.mul (f32.convert_i32_u (!tab SL_GUP (local.get $g))) (f32.const 0.01)))
  (!put u8 @(PLAYERS + P_FL) (local.get $qb) (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $qb)) (i32.const @(255 ^ PF_GROUND))))
  (!st u8 @(PG_S + SL_REC) (i32.shl (local.get $best) (i32.const 3)) (i32.add (local.get $p) (i32.const 1)))
  (i32.store offset=@(PG_S + SL_REC + 4) (i32.shl (local.get $best) (i32.const 3)) (local.get $now))
  (!put u8 @(PLAYERS + B_HITBY) (local.get $qb) (local.get $p))
  (!put u16 @(PLAYERS + B_HITT) (local.get $qb) (i32.const @CREDIT_TICKS))
  (call $fx (i32.const 0) (i32.const @SL_FX_SLAP) (local.get $p) (local.get $best)
            (!at f32 @(PLAYERS + P_PX) (local.get $qb))
            (f32.add (!at f32 @(PLAYERS + P_PY) (local.get $qb)) (call $b_rad (local.get $qb)))
            (!at f32 @(PLAYERS + P_PZ) (local.get $qb))
            (local.get $fling)))

;; Once a tick in play, after the bumps: the call at the last 15 s; every
;; slap landing this tick, in slot order; then the credit: a slap counts
;; SL_CREDIT on the island (kept while a ball goes over, till it's in the
;; sea), and only a slap: bumper's own credit for a bump is cleared, so the
;; KO and the sea's FX name the slapper or nobody.
(func $sl_tick
  (local $t i32) (local $now i32) (local $p i32) (local $pb i32) (local $m i32) (local $last i32) (local $r i32)
  (local.set $t (call $p_t (i32.const 0)))
  (local.set $now (i32.load (i32.const @HDR_TICK)))
  (if (i32.eq (local.get $t) (i32.const @SL_DOUBLE))
    (then (call $fx (i32.const 0) (i32.const @SL_FX_CALL) (i32.const 255) (i32.const 1)
                    (f32.load (i32.const @PG_CX)) (f32.const @PLAT_Y) (f32.load (i32.const @PG_CX)) (f32.const 2))))
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
    (if (call $p_in (local.get $pb))
      (then
        (local.set $m (!at i32 @(PLAYERS + PG_M) (local.get $pb)))
        (local.set $last (i32.shr_u (local.get $m) (i32.const 16)))
        (if (i32.and (i32.ne (local.get $last) (i32.const 0))
                     (i32.eq (i32.sub (i32.add (local.get $t) (i32.const 1)) (local.get $last)) (!tab SL_GWIND (call $sl_glove (local.get $p)))))
          (then (call $sl_slap (local.get $p) (local.get $now)))))))
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
    (if (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @PF_LIVE))
      (then
        (local.set $r (!ld u8 @(PG_S + SL_REC) (i32.shl (local.get $p) (i32.const 3))))
        (if (i32.and (i32.ne (local.get $r) (i32.const 0))
                     (i32.and (call $p_in (local.get $pb))
                              (i32.ge_u (i32.sub (local.get $now) (i32.load offset=@(PG_S + SL_REC + 4) (i32.shl (local.get $p) (i32.const 3)))) (i32.const @SL_CREDIT))))
          (then
            (!st u8 @(PG_S + SL_REC) (i32.shl (local.get $p) (i32.const 3)) (i32.const 0))
            (local.set $r (i32.const 0))))
        (if (local.get $r)
          (then
            (!put u8 @(PLAYERS + B_HITBY) (local.get $pb) (i32.sub (local.get $r) (i32.const 1)))
            (!put u16 @(PLAYERS + B_HITT) (local.get $pb) (i32.const @CREDIT_TICKS)))
          (else (!put u16 @(PLAYERS + B_HITT) (local.get $pb) (i32.const 0))))))))

(func $sl_over (result i32) (i32.const 0))

;; Ball p is in the sea: a point to the last to slap it (two from SL_DOUBLE),
;; if it's still in the room; SL_FALL off its own; its slap's credit gone
;; and its PG_M with it (back in, its first push takes the counter afresh).
(func $sl_out (param $p i32)
  (local $pb i32) (local $r i32) (local $qb i32) (local $pts i32) (local $s i32)
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (local.set $r (!ld u8 @(PG_S + SL_REC) (i32.shl (local.get $p) (i32.const 3))))
  (if (i32.and (i32.ne (local.get $r) (i32.const 0)) (i32.ne (local.get $r) (i32.add (local.get $p) (i32.const 1))))
    (then
      (local.set $qb (i32.shl (i32.sub (local.get $r) (i32.const 1)) (i32.const 6)))
      (if (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $qb)) (i32.const @PF_LIVE))
        (then
          (local.set $pts (select (i32.const 2) (i32.const 1) (i32.ge_u (call $p_t (i32.const 0)) (i32.const @SL_DOUBLE))))
          (local.set $s (i32.add (!at u16 @(PLAYERS + PG_SCORE) (local.get $qb)) (local.get $pts)))
          (!put u16 @(PLAYERS + PG_SCORE) (local.get $qb) (select (local.get $s) (i32.const 65535) (i32.lt_u (local.get $s) (i32.const 65535))))
          (call $fx (i32.const 0) (i32.const @SL_FX_SCORE) (i32.sub (local.get $r) (i32.const 1)) (local.get $p)
                    (!at f32 @(PLAYERS + P_PX) (local.get $pb))
                    (f32.max (!at f32 @(PLAYERS + P_PY) (local.get $pb)) (f32.load (i32.const @PG_FLOOR)))
                    (!at f32 @(PLAYERS + P_PZ) (local.get $pb))
                    (f32.convert_i32_u (local.get $pts)))))))
  (local.set $s (!at u16 @(PLAYERS + PG_SCORE) (local.get $pb)))
  (!put u16 @(PLAYERS + PG_SCORE) (local.get $pb) (select (i32.sub (local.get $s) (i32.const @SL_FALL)) (i32.const 0) (i32.gt_u (local.get $s) (i32.const @SL_FALL))))
  (!st u8 @(PG_S + SL_REC) (i32.shl (local.get $p) (i32.const 3)) (i32.const 0))
  (!put i32 @(PLAYERS + PG_M) (local.get $pb) (i32.const 0)))
