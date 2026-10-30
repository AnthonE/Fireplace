;; SWISS ROLL: bumper balls' round, played as a minigame. A wheel of Swiss
;; cheese floats at PLAT_Y over the sea, sized for the crowd, its holes the
;; golf cup made big and many: a ball whose centre rolls over one, or off the
;; rim, drops through and is out. Bumps on, and the last one rolling wins.
;; Over CH_SHRINK the rim crumbles in to CH_RMIN and every hole widens by
;; half; power-ups fall from the sky onto the cheese.
;;
;; The wheel and its holes are laid out with the round (the holes in PG_S,
;; fixed till the next); how far they have squeezed is a function of the tick
;; into play. So ground and push read only bank d's header, the holes and the
;; ball's own record, and the prediction drops your ball through a hole on
;; the tick the confirmed world will. A ball going through is held in its
;; hole's shaft (push, PG_M the hole plus one, 256 the rim) until it is under
;; the cheese, as bumper's was. The power-ups are the confirmed world's.

;; How far the round has squeezed the cheese on bank d, 0 to 1: the rim in to
;; CH_RMIN, the holes half as wide again. Nothing before play.
(func $ch_squeeze (param $d i32) (result f32)
  (f32.min (f32.mul (f32.convert_i32_s (call $p_t (local.get $d))) (f32.const @(1 / CH_SHRINK))) (f32.const 1)))

;; The rim's radius now.
(func $ch_rim (param $d i32) (result f32)
  (local $r0 f32)
  (local.set $r0 (f32.load offset=@(PG_H + CH_RAD) (local.get $d)))
  (f32.sub (local.get $r0) (f32.mul (f32.max (f32.sub (local.get $r0) (f32.const @CH_RMIN)) (f32.const 0)) (call $ch_squeeze (local.get $d)))))

;; Hole k's radius now.
(func $ch_hole_r (param $d i32) (param $k i32) (result f32)
  (f32.mul (f32.load offset=@(PG_S + CH_HOLES + 8) (i32.shl (local.get $k) (i32.const 4)))
           (!madd (call $ch_squeeze (local.get $d)) (f32.const 0.5) (f32.const 1))))

;; What is under (x, z) on bank d: -1 cheese, k the hole it is over, 255 past the rim.
(func $ch_floor (param $d i32) (param $x f32) (param $z f32) (result i32)
  (local $f f32) (local $r f32) (local $g f32) (local $dx f32) (local $dz f32) (local $k i32) (local $h i32)
  (local.set $f (call $ch_squeeze (local.get $d)))
  (local.set $r (call $ch_rim (local.get $d)))
  (local.set $dx (f32.sub (local.get $x) (f32.load offset=@PG_CX (local.get $d))))
  (local.set $dz (f32.sub (local.get $z) (f32.load offset=@PG_CX (local.get $d))))
  (if (f32.ge (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))) (f32.mul (local.get $r) (local.get $r)))
    (then (return (i32.const 255))))
  (local.set $g (!madd (local.get $f) (f32.const 0.5) (f32.const 1)))
  (!for $k (i32.const 0) (i32.load offset=@(PG_H + CH_NH) (local.get $d))
    (local.set $h (i32.add (i32.const @(PG_S + CH_HOLES)) (i32.shl (local.get $k) (i32.const 4))))
    (local.set $dx (f32.sub (local.get $x) (f32.load (local.get $h))))
    (local.set $dz (f32.sub (local.get $z) (f32.load offset=4 (local.get $h))))
    (local.set $r (f32.mul (f32.load offset=8 (local.get $h)) (local.get $g)))
    (if (f32.lt (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))) (f32.mul (local.get $r) (local.get $r)))
      (then (return (local.get $k)))))
  (i32.const -1))

;; Spawn candidate i of m: a sunflower spiral over most of a wheel of radius r0.
(func $ch_spot (param $i i32) (param $m i32) (param $r0 f32) (result f32 f32)
  (local $rr f32) (local $s f32) (local $c f32) (local $cx f32)
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (local.set $rr (f32.mul (f32.mul (local.get $r0) (f32.const 0.86))
                          (f32.sqrt (f32.div (f32.add (f32.convert_i32_u (local.get $i)) (f32.const 0.5)) (f32.convert_i32_u (local.get $m))))))
  (call $sincos (i32.mul (local.get $i) (i32.const 6258))) ;; the golden angle, in 1/16384 turn
  (local.set $c) (local.set $s)
  (!madd (local.get $c) (local.get $rr) (local.get $cx))
  (!madd (local.get $s) (local.get $rr) (local.get $cx)))

;; The wheel for n balls: its radius, fresh holes anywhere on it (biting into
;; the rim if they like, never within CH_MID of the middle), and the spiral's
;; points clear of every hole, which spawn shares out.
(func $ch_setup (param $n i32)
  (local $k i32) (local $tries i32) (local $nh i32) (local $i i32) (local $m i32) (local $nclear i32) (local $ok i32) (local $h i32) (local $q i32)
  (local $r0 f32) (local $rmax f32) (local $r f32) (local $rad f32) (local $s f32) (local $c f32) (local $x f32) (local $z f32)
  (local $dx f32) (local $dz f32) (local $lim f32) (local $cx f32)
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (local.set $r0 (f32.min (!madd (f32.sqrt (f32.convert_i32_u (local.get $n))) (f32.const @CH_RK) (f32.const @CH_R0)) (f32.const @CH_RMAX)))
  (i32.store (i32.const @PG_KIND) (i32.const @PK_OUT))
  (i32.store (i32.const @PG_LEN) (i32.const @CH_LEN))
  (f32.store (i32.const @PG_SIZE) (local.get $r0))
  (f32.store (i32.const @(PG_H + CH_RAD)) (local.get $r0))
  (i32.store (i32.const @(PG_H + CH_DROP)) (i32.const @CH_DROP0))
  (local.set $rmax (f32.min (!madd (local.get $r0) (f32.const @CH_HK) (f32.const @CH_H0)) (f32.const @CH_HMAX)))
  (local.set $nh (i32.add (i32.const @CH_NH0) (i32.trunc_sat_f32_u (f32.mul (f32.mul (local.get $r0) (local.get $r0)) (f32.const @CH_NHK)))))
  (if (i32.gt_u (local.get $nh) (i32.const @CH_NHMAX)) (then (local.set $nh (i32.const @CH_NHMAX))))
  (block $done
    (loop $more
      (br_if $done (i32.or (i32.ge_u (local.get $k) (local.get $nh)) (i32.ge_u (local.get $tries) (i32.shl (local.get $nh) (i32.const 3)))))
      (!inc $tries)
      (local.set $r (!madd (call $p_unit) (f32.sub (local.get $rmax) (f32.const @CH_HMIN)) (f32.const @CH_HMIN)))
      (local.set $rad (f32.mul (local.get $r0) (f32.sqrt (call $p_unit))))
      (call $sincos (call $rand))
      (local.set $c) (local.set $s)
      (if (f32.ge (local.get $rad) (f32.add (local.get $r) (f32.const @CH_MID)))
        (then
          (local.set $h (i32.add (i32.const @(PG_S + CH_HOLES)) (i32.shl (local.get $k) (i32.const 4))))
          (f32.store (local.get $h) (!madd (local.get $c) (local.get $rad) (local.get $cx)))
          (f32.store offset=4 (local.get $h) (!madd (local.get $s) (local.get $rad) (local.get $cx)))
          (f32.store offset=8 (local.get $h) (local.get $r))
          (!inc $k)))
      (br $more)))
  (i32.store (i32.const @(PG_H + CH_NH)) (local.get $k))
  ;; the spawns: the spiral's points clear of every hole
  (local.set $m (i32.add (i32.shl (local.get $n) (i32.const 1)) (i32.const 16)))
  (!for $i (i32.const 0) (local.get $m)
    (call $ch_spot (local.get $i) (local.get $m) (local.get $r0))
    (local.set $z) (local.set $x)
    (local.set $ok (i32.const 1))
    (!for $q (i32.const 0) (local.get $k)
      (local.set $h (i32.add (i32.const @(PG_S + CH_HOLES)) (i32.shl (local.get $q) (i32.const 4))))
      (local.set $dx (f32.sub (local.get $x) (f32.load (local.get $h))))
      (local.set $dz (f32.sub (local.get $z) (f32.load offset=4 (local.get $h))))
      (local.set $lim (f32.add (f32.load offset=8 (local.get $h)) (f32.const @CH_CLEAR)))
      (if (f32.lt (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))) (f32.mul (local.get $lim) (local.get $lim)))
        (then (local.set $ok (i32.const 0)))))
    (if (local.get $ok)
      (then (!st u16 @(PG_S + CH_SPOTS) (local.get $nclear) (local.get $i)) (!inc $nclear))))
  (i32.store (i32.const @(PG_H + CH_N)) (local.get $n))
  (i32.store (i32.const @(PG_H + CH_M)) (local.get $m))
  (i32.store (i32.const @(PG_H + CH_NCLEAR)) (local.get $nclear)))

;; Ball i of n on a clear point of the spiral, the clear ones shared out
;; evenly; the middle if there are none (or n is not the round's).
(func $ch_spawn (param $i i32) (param $n i32) (result f32 f32 f32)
  (local $nclear i32) (local $x f32) (local $z f32)
  (local.set $nclear (i32.load (i32.const @(PG_H + CH_NCLEAR))))
  (local.set $x (f32.load (i32.const @PG_CX)))
  (local.set $z (local.get $x))
  (if (i32.and (i32.and (i32.ne (local.get $nclear) (i32.const 0)) (i32.eq (local.get $n) (i32.load (i32.const @(PG_H + CH_N)))))
               (i32.lt_u (local.get $i) (local.get $n)))
    (then
      (call $ch_spot (!ld u16 @(PG_S + CH_SPOTS) (i32.div_u (i32.mul (local.get $i) (local.get $nclear)) (local.get $n)))
                     (i32.load (i32.const @(PG_H + CH_M))) (f32.load (i32.const @(PG_H + CH_RAD))))
      (local.set $z) (local.set $x)))
  (local.get $x) (f32.const @PLAT_Y) (local.get $z))

(func $ch_start)
(func $ch_begin (param $p i32) (param $d i32))

;; The cheese's top under (x, z) on bank d, none over a hole or past the rim,
;; nor for a ball already under the top.
(func $ch_ground (param $d i32) (param $x f32) (param $y f32) (param $z f32) (result f32)
  (if (f32.lt (local.get $y) (f32.const @PLAT_Y)) (then (return (f32.const -1000))))
  (if (result f32) (i32.lt_s (call $ch_floor (local.get $d) (local.get $x) (local.get $z)) (i32.const 0))
    (then (f32.const @PLAT_Y))
    (else (f32.const -1000))))

;; Going through: a ball under the cheese's top is in the hole it dropped
;; into (or outside the rim) until it is under the cheese, its wall keeping it
;; in with a little bounce, as bumper's shaft did. PG_M remembers which: the
;; hole plus one, 256 the rim, 0 none; back on the cheese, none.
(func $ch_push (param $p i32) (param $d i32)
  (local $pb i32) (local $fl i32) (local $k i32)
  (local $px f32) (local $py f32) (local $pz f32) (local $vx f32) (local $vz f32) (local $rad f32)
  (local $hx f32) (local $hz f32) (local $dx f32) (local $dz f32) (local $dist f32) (local $lim f32) (local $vr f32)
  (local.set $pb (i32.add (i32.shl (local.get $p) (i32.const 6)) (local.get $d)))
  (local.set $fl (!at u8 @(PLAYERS + P_FL) (local.get $pb)))
  (if (i32.and (local.get $fl) (i32.const @PF_DEAD)) (then (return)))
  (if (i32.and (local.get $fl) (i32.const @PF_GROUND))
    (then (!put i32 @(PLAYERS + PG_M) (local.get $pb) (i32.const 0)) (return)))
  (local.set $py (!at f32 @(PLAYERS + P_PY) (local.get $pb)))
  (if (f32.ge (local.get $py) (f32.const @PLAT_Y)) (then (return)))
  (local.set $px (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
  (local.set $pz (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
  (local.set $k (!at i32 @(PLAYERS + PG_M) (local.get $pb)))
  (if (i32.eqz (local.get $k))
    (then
      (local.set $k (call $ch_floor (local.get $d) (local.get $px) (local.get $pz)))
      (if (i32.lt_s (local.get $k) (i32.const 0)) (then (return)))
      (local.set $k (i32.add (local.get $k) (i32.const 1)))
      (!put i32 @(PLAYERS + PG_M) (local.get $pb) (local.get $k))))
  (local.set $k (i32.sub (local.get $k) (i32.const 1)))
  (local.set $rad (call $b_rad (local.get $pb)))
  (if (f32.le (local.get $py) (f32.sub (f32.const @(PLAT_Y - CH_THICK)) (local.get $rad))) (then (return)))
  (local.set $vx (!at f32 @(PLAYERS + P_VX) (local.get $pb)))
  (local.set $vz (!at f32 @(PLAYERS + P_VZ) (local.get $pb)))
  (if (i32.eq (local.get $k) (i32.const 255))
    (then
      (local.set $hx (f32.load offset=@PG_CX (local.get $d)))
      (local.set $hz (local.get $hx))
      (local.set $lim (f32.add (call $ch_rim (local.get $d)) (local.get $rad))))
    (else
      (local.set $hx (f32.load offset=@(PG_S + CH_HOLES) (i32.shl (local.get $k) (i32.const 4))))
      (local.set $hz (f32.load offset=@(PG_S + CH_HOLES + 4) (i32.shl (local.get $k) (i32.const 4))))
      (local.set $lim (f32.max (f32.sub (call $ch_hole_r (local.get $d) (local.get $k)) (local.get $rad)) (f32.const 0)))))
  (local.set $dx (f32.sub (local.get $px) (local.get $hx)))
  (local.set $dz (f32.sub (local.get $pz) (local.get $hz)))
  (local.set $dist (f32.sqrt (f32.max (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))) (f32.const 1e-6))))
  (local.set $dx (f32.div (local.get $dx) (local.get $dist)))
  (local.set $dz (f32.div (local.get $dz) (local.get $dist)))
  (local.set $vr (!madd (local.get $vx) (local.get $dx) (f32.mul (local.get $vz) (local.get $dz))))
  (if (i32.eq (local.get $k) (i32.const 255))
    (then
      ;; outside the rim, held off it
      (if (f32.lt (local.get $dist) (local.get $lim))
        (then
          (local.set $px (!madd (local.get $dx) (local.get $lim) (local.get $hx)))
          (local.set $pz (!madd (local.get $dz) (local.get $lim) (local.get $hz)))
          (local.set $vr (f32.min (local.get $vr) (f32.const 0))))
        (else (local.set $vr (f32.const 0)))))
    (else
      ;; in a hole, held in it
      (if (f32.gt (local.get $dist) (local.get $lim))
        (then
          (local.set $px (!madd (local.get $dx) (local.get $lim) (local.get $hx)))
          (local.set $pz (!madd (local.get $dz) (local.get $lim) (local.get $hz)))
          (local.set $vr (f32.max (local.get $vr) (f32.const 0))))
        (else (local.set $vr (f32.const 0))))))
  ;; off the wall, a little bounce
  (local.set $vx (f32.sub (local.get $vx) (f32.mul (local.get $dx) (f32.mul (local.get $vr) (f32.const 1.3)))))
  (local.set $vz (f32.sub (local.get $vz) (f32.mul (local.get $dz) (f32.mul (local.get $vr) (f32.const 1.3)))))
  (!chk (local.get $px) 76 (local.get $p))
  (!chk (local.get $pz) 77 (local.get $p))
  (!chk (local.get $vx) 78 (local.get $p))
  (!chk (local.get $vz) 79 (local.get $p))
  (!put f32 @(PLAYERS + P_PX) (local.get $pb) (local.get $px))
  (!put f32 @(PLAYERS + P_PZ) (local.get $pb) (local.get $pz))
  (!put f32 @(PLAYERS + P_VX) (local.get $pb) (local.get $vx))
  (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (local.get $vz)))

;; A power-up in a free slot, high over a random spot of cheese (eight tries).
(func $ch_drop
  (local $k i32) (local $o i32) (local $tries i32) (local $rad f32) (local $s f32) (local $c f32) (local $x f32) (local $z f32) (local $cx f32)
  (block $found
    (!for $k (i32.const 0) (i32.const @CH_NORB)
      (local.set $o (i32.add (i32.const @(PG_S + CH_ORBS)) (i32.shl (local.get $k) (i32.const 4))))
      (br_if $found (i32.eqz (i32.load8_u offset=12 (local.get $o)))))
    (return))
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (!for $tries (i32.const 0) (i32.const 8)
    (local.set $rad (f32.mul (f32.mul (call $ch_rim (i32.const 0)) (f32.const 0.85)) (f32.sqrt (call $p_unit))))
    (call $sincos (call $rand))
    (local.set $c) (local.set $s)
    (local.set $x (!madd (local.get $c) (local.get $rad) (local.get $cx)))
    (local.set $z (!madd (local.get $s) (local.get $rad) (local.get $cx)))
    (if (i32.lt_s (call $ch_floor (i32.const 0) (local.get $x) (local.get $z)) (i32.const 0))
      (then
        (f32.store (local.get $o) (local.get $x))
        (f32.store offset=4 (local.get $o) (f32.const @(+PLAT_Y + ORB_Y)))
        (f32.store offset=8 (local.get $o) (local.get $z))
        (i32.store8 offset=12 (local.get $o) (i32.add (i32.rem_u (call $rand) (i32.const @NPU)) (i32.const 1)))
        (i32.store8 offset=13 (local.get $o) (i32.const 1))
        (i32.store16 offset=14 (local.get $o) (i32.const 0))
        (call $fx (i32.const 0) (i32.const @FX_DROP) (i32.const 0) (local.get $k) (local.get $x) (f32.const @PLAT_Y) (local.get $z)
                  (f32.convert_i32_u (i32.load8_u offset=12 (local.get $o))))
        (return)))))

;; The power-ups, bumper's: drops on the clock, falling, lying on the cheese
;; until their time is up or the cheese goes from under them, and picked up
;; by the first ball, in slot order, to roll into one with its hands free.
(func $ch_tick
  (local $t i32) (local $m i32) (local $k i32) (local $o i32) (local $p i32) (local $pb i32) (local $life i32)
  (local $y f32) (local $rad f32) (local $dx f32) (local $dy f32) (local $dz f32) (local $lim f32)
  (local.set $t (call $p_t (i32.const 0)))
  (if (i32.ge_u (local.get $t) (i32.load (i32.const @(PG_H + CH_DROP))))
    (then
      (i32.store (i32.const @(PG_H + CH_DROP)) (i32.add (local.get $t) (i32.const @CH_DROPGAP)))
      (!for $m (i32.const 0) (i32.add (i32.const 1) (i32.div_u (i32.load (i32.const @BH_LEFT)) (i32.const @CH_DROPN)))
        (call $ch_drop))))
  (!for $k (i32.const 0) (i32.const @CH_NORB)
    (local.set $o (i32.add (i32.const @(PG_S + CH_ORBS)) (i32.shl (local.get $k) (i32.const 4))))
    (if (i32.load8_u offset=12 (local.get $o))
      (then (block $gone
        (if (i32.eq (i32.load8_u offset=13 (local.get $o)) (i32.const 1))
          (then
            (local.set $y (f32.sub (f32.load offset=4 (local.get $o)) (f32.const @ORB_FALL)))
            (f32.store offset=4 (local.get $o) (local.get $y))
            (if (f32.le (local.get $y) (f32.const @(+PLAT_Y + 0.6)))
              (then
                (if (i32.and (i32.lt_s (call $ch_floor (i32.const 0) (f32.load (local.get $o)) (f32.load offset=8 (local.get $o))) (i32.const 0))
                             (f32.gt (local.get $y) (f32.const @(PLAT_Y - 0.2))))
                  (then
                    (f32.store offset=4 (local.get $o) (f32.const @(+PLAT_Y + 0.6)))
                    (i32.store8 offset=13 (local.get $o) (i32.const 2))
                    (i32.store16 offset=14 (local.get $o) (i32.const @CH_ORBLIFE))))
                (if (f32.lt (local.get $y) (f32.const @(PLAT_Y - 12)))
                  (then (memory.fill (local.get $o) (i32.const 0) (i32.const 16)) (br $gone))))))
          (else
            (local.set $life (i32.sub (i32.load16_u offset=14 (local.get $o)) (i32.const 1)))
            (i32.store16 offset=14 (local.get $o) (local.get $life))
            (if (i32.eqz (local.get $life)) (then (memory.fill (local.get $o) (i32.const 0) (i32.const 16)) (br $gone)))
            (if (i32.ge_s (call $ch_floor (i32.const 0) (f32.load (local.get $o)) (f32.load offset=8 (local.get $o))) (i32.const 0))
              (then (i32.store8 offset=13 (local.get $o) (i32.const 1))))))
        (!for $p (i32.const 0) (i32.const @NPLAYER)
          (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
          (if (i32.and (call $p_in (local.get $pb)) (i32.eqz (!at u8 @(PLAYERS + B_ITEM) (local.get $pb))))
            (then
              (local.set $rad (call $b_rad (local.get $pb)))
              (local.set $dx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (f32.load (local.get $o))))
              (local.set $dy (f32.sub (f32.add (!at f32 @(PLAYERS + P_PY) (local.get $pb)) (local.get $rad)) (f32.load offset=4 (local.get $o))))
              (local.set $dz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $pb)) (f32.load offset=8 (local.get $o))))
              (local.set $lim (f32.add (local.get $rad) (f32.const @ORB_R)))
              (if (f32.lt (!dot3 (local.get $dx) (local.get $dy) (local.get $dz) (local.get $dx) (local.get $dy) (local.get $dz)) (f32.mul (local.get $lim) (local.get $lim)))
                (then
                  (!put u8 @(PLAYERS + B_ITEM) (local.get $pb) (i32.load8_u offset=12 (local.get $o)))
                  (call $fx (i32.const 0) (i32.const @FX_PICKUP) (local.get $p) (local.get $k)
                            (f32.load (local.get $o)) (f32.load offset=4 (local.get $o)) (f32.load offset=8 (local.get $o)) (f32.convert_i32_u (i32.load8_u offset=12 (local.get $o))))
                  (memory.fill (local.get $o) (i32.const 0) (i32.const 16))
                  (br $gone)))))))))))

(func $ch_over (result i32) (i32.const 0))
(func $ch_out (param $p i32))
