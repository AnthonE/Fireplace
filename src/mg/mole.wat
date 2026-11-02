;; WHACK A MOLE: a square lawn over the sea, sized for the crowd and fenced
;; round (a ball under the fence's top is held in), with a grid of mole
;; holes, about one for every WM_PER balls, WM_PITCH apart. Moles pop up on
;; the round's schedule: the hole's dirt heaves WM_TELE ahead, the mole rises
;; over WM_RISE, stays up (WM_UP0 at the start, WM_UP1 by the end) and ducks
;; over WM_DUCK; more holes heave as the round goes. Up, a mole is a post a
;; rolling ball goes round or is stopped by, and its head is floor a ball
;; coming down from a hop lands on: that whacks it, a point to the first ball
;; by slot to land on it, WM_GOLDV for a gold one, and it is dazed after,
;; paying nothing more. From WM_SPIKE some rise spiked: touching one flings a
;; ball off it, and coming down on one costs WM_SPIKEV. The last 15 s are a
;; frenzy, more moles and double points. Bumps on; most points at 80 s wins.
;;
;; Setup draws the whole round's pops with the PRNG into PG_BIG, each hole's
;; in the order they rise, so a mole's height is a function of the tick into
;; play and that schedule ($wm_lift), and ground and push on either bank meet
;; every mole exactly where the confirmed world has it: the prediction lands
;; your ball on a head, bounces it off a post and flings it off spikes bit for
;; bit. A whack is the confirmed world's: push marks the ball's PG_M with the
;; tick and what it stood on, and tick pays the first ball by slot on an
;; unwhacked head, a round trip late as a bump is; a dazed mole's body keeps
;; to its schedule, so being whacked changes nothing a ball meets.

;; Hole i's pop k: its byte offset from PG_BIG + WM_POPS.
(func $wm_rec (param $i i32) (param $k i32) (result i32)
  (i32.mul (i32.add (i32.mul (local.get $i) (i32.const @WM_PMAX)) (local.get $k)) (i32.const @WM_PSIZE)))

;; Hole i's pop on tick tp into play: the last whose heave has begun (its
;; offset from PG_BIG + WM_POPS), or -1 before its first. A hole's pops are in
;; the order they rise and never overlap, heave and rest included, so it is
;; the only one of them that can be out. By halves.
(func $wm_pop (param $i i32) (param $tp i32) (result i32)
  (local $lo i32) (local $hi i32) (local $mid i32)
  (local.set $hi (i32.load8_u offset=@(PG_S + WM_COUNT) (local.get $i)))
  (block $done
    (loop $half
      (br_if $done (i32.ge_u (local.get $lo) (local.get $hi)))
      (local.set $mid (i32.shr_u (i32.add (local.get $lo) (local.get $hi)) (i32.const 1)))
      (if (i32.le_s (i32.sub (i32.load16_u offset=@(PG_BIG + WM_POPS + WM_P_T0) (call $wm_rec (local.get $i) (local.get $mid))) (i32.const @WM_TELE))
                    (local.get $tp))
        (then (local.set $lo (i32.add (local.get $mid) (i32.const 1))))
        (else (local.set $hi (local.get $mid))))
      (br $half)))
  (if (result i32) (local.get $lo)
    (then (call $wm_rec (local.get $i) (i32.sub (local.get $lo) (i32.const 1))))
    (else (i32.const -1))))

;; How far out of its hole pop a's mole is on tick tp into play, m over the
;; lawn: rising, up at WM_TOP, ducking, else 0 (still in its hole).
(func $wm_lift (param $a i32) (param $tp i32) (result f32)
  (local $el i32) (local $up i32)
  (local.set $el (i32.sub (local.get $tp) (i32.load16_u offset=@(PG_BIG + WM_POPS + WM_P_T0) (local.get $a))))
  (if (i32.lt_s (local.get $el) (i32.const 0)) (then (return (f32.const 0))))
  (if (i32.lt_s (local.get $el) (i32.const @WM_RISE))
    (then (return (f32.mul (f32.convert_i32_s (local.get $el)) (f32.const @(WM_TOP / WM_RISE))))))
  (local.set $el (i32.sub (local.get $el) (i32.const @WM_RISE)))
  (local.set $up (i32.load8_u offset=@(PG_BIG + WM_POPS + WM_P_UP) (local.get $a)))
  (if (i32.lt_s (local.get $el) (local.get $up)) (then (return (f32.const @WM_TOP))))
  (local.set $el (i32.sub (local.get $el) (local.get $up)))
  (if (i32.lt_s (local.get $el) (i32.const @WM_DUCK))
    (then (return (f32.mul (f32.convert_i32_s (i32.sub (i32.const @WM_DUCK) (local.get $el))) (f32.const @(WM_TOP / WM_DUCK))))))
  (f32.const 0))

;; The top of pop a's mole on tick tp: its head, or the lawn while it's in.
(func $wm_top (param $a i32) (param $tp i32) (result f32)
  (f32.add (f32.const @PLAT_Y) (call $wm_lift (local.get $a) (local.get $tp))))

;; The hole nearest (x, z) on bank d: its index (row by row), its axis's x and z.
(func $wm_near (param $d i32) (param $x f32) (param $z f32) (result i32 f32 f32)
  (local $g i32) (local $x0 f32) (local $i i32) (local $j i32)
  (local.set $g (i32.load offset=@(PG_H + WM_G) (local.get $d)))
  (local.set $x0 (f32.load offset=@(PG_H + WM_X0) (local.get $d)))
  (local.set $i (i32.trunc_sat_f32_s (f32.nearest (f32.mul (f32.sub (local.get $x) (local.get $x0)) (f32.const @(1 / WM_PITCH))))))
  (local.set $j (i32.trunc_sat_f32_s (f32.nearest (f32.mul (f32.sub (local.get $z) (local.get $x0)) (f32.const @(1 / WM_PITCH))))))
  (if (i32.lt_s (local.get $i) (i32.const 0)) (then (local.set $i (i32.const 0))))
  (if (i32.lt_s (local.get $j) (i32.const 0)) (then (local.set $j (i32.const 0))))
  (if (i32.ge_s (local.get $i) (local.get $g)) (then (local.set $i (i32.sub (local.get $g) (i32.const 1)))))
  (if (i32.ge_s (local.get $j) (local.get $g)) (then (local.set $j (i32.sub (local.get $g) (i32.const 1)))))
  (i32.add (i32.mul (local.get $j) (local.get $g)) (local.get $i))
  (!madd (f32.convert_i32_s (local.get $i)) (f32.const @WM_PITCH) (local.get $x0))
  (!madd (f32.convert_i32_s (local.get $j)) (f32.const @WM_PITCH) (local.get $x0)))

;; Hole i's axis, x and z (the confirmed world's header).
(func $wm_hole (param $i i32) (result f32 f32)
  (local $g i32) (local $x0 f32)
  (local.set $g (i32.load (i32.const @(PG_H + WM_G))))
  (local.set $x0 (f32.load (i32.const @(PG_H + WM_X0))))
  (!madd (f32.convert_i32_u (i32.rem_u (local.get $i) (local.get $g))) (f32.const @WM_PITCH) (local.get $x0))
  (!madd (f32.convert_i32_u (i32.div_u (local.get $i) (local.get $g))) (f32.const @WM_PITCH) (local.get $x0)))

;; The lawn for n balls: a square of holes, the nearest whole number to the
;; root of n / WM_PER a side (WM_GMIN to WM_GMAX), the fence WM_EDGE past the
;; outer ones; a firm brake; the round's pops.
(func $wm_setup (param $n i32)
  (local $g i32) (local $half f32) (local $cx f32)
  (local.set $g (i32.trunc_sat_f32_u (f32.nearest (f32.sqrt (f32.div (f32.convert_i32_u (local.get $n)) (f32.const @WM_PER))))))
  (if (i32.lt_u (local.get $g) (i32.const @WM_GMIN)) (then (local.set $g (i32.const @WM_GMIN))))
  (if (i32.gt_u (local.get $g) (i32.const @WM_GMAX)) (then (local.set $g (i32.const @WM_GMAX))))
  (local.set $half (!madd (f32.convert_i32_u (i32.sub (local.get $g) (i32.const 1))) (f32.const @(WM_PITCH / 2)) (f32.const @WM_EDGE)))
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (!chk (local.get $half) 420 (local.get $n))
  (i32.store (i32.const @PG_KIND) (i32.const @PK_SCORE))
  (i32.store (i32.const @PG_LEN) (i32.const @WM_LEN))
  (f32.store (i32.const @PG_SIZE) (local.get $half))
  (f32.store (i32.const @PG_IDLE) (f32.const @WM_IDLE))
  (f32.store (i32.const @(PG_H + WM_HALF)) (local.get $half))
  (i32.store (i32.const @(PG_H + WM_G)) (local.get $g))
  (i32.store (i32.const @(PG_H + WM_NH)) (i32.mul (local.get $g) (local.get $g)))
  (f32.store (i32.const @(PG_H + WM_X0))
    (f32.sub (local.get $cx) (f32.mul (f32.convert_i32_u (i32.sub (local.get $g) (i32.const 1))) (f32.const @(WM_PITCH / 2)))))
  (call $wm_schedule (i32.mul (local.get $g) (local.get $g))))

;; The round's pops, drawn now with the PRNG. From WM_FIRST, tick by tick,
;; the rate runs up (the holes times their heaves a second: WM_RATE0 rising
;; to WM_RATE1 by the frenzy, WM_RATEF in it, by when the mole would rise),
;; and each whole pop it reaches starts a heave on a hole drawn at random,
;; or the next one round from it lying still by now; the mole rises WM_TELE
;; later, is up for its share of WM_UP0 to WM_UP1 give or take WM_UPJ, and is
;; gold one time in WM_GOLD, else from WM_SPIKE spiked one in WM_SPIKEK. None
;; rises too late to be up before the end.
(func $wm_schedule (param $nh i32)
  (local $tp i32) (local $t0 i32) (local $r i32) (local $k i32) (local $h i32) (local $c i32) (local $a i32) (local $b i32)
  (local $up i32) (local $kind i32) (local $total i32) (local $acc f32) (local $rate f32)
  (local.set $tp (i32.const @WM_FIRST))
  (block $done
    (loop $next
      (local.set $t0 (i32.add (local.get $tp) (i32.const @WM_TELE)))
      (br_if $done (i32.ge_u (i32.add (local.get $t0) (i32.const @WM_RISE)) (i32.const @WM_LEN)))
      (local.set $rate (f32.const @WM_RATEF))
      (if (i32.lt_u (local.get $t0) (i32.const @WM_FRENZY))
        (then (local.set $rate (!madd (f32.convert_i32_u (local.get $t0)) (f32.const @((WM_RATE1 - WM_RATE0) / WM_FRENZY)) (f32.const @WM_RATE0)))))
      (local.set $acc (!madd (f32.convert_i32_u (local.get $nh)) (f32.mul (local.get $rate) (f32.const @DT)) (local.get $acc)))
      (block $none
        (loop $more
          (br_if $none (f32.lt (local.get $acc) (f32.const 1)))
          (local.set $acc (f32.sub (local.get $acc) (f32.const 1)))
          (local.set $r (i32.rem_u (call $rand) (local.get $nh)))
          (block $placed
            (!for $k (i32.const 0) (local.get $nh)
              (local.set $h (i32.rem_u (i32.add (local.get $r) (local.get $k)) (local.get $nh)))
              (local.set $c (i32.load8_u offset=@(PG_S + WM_COUNT) (local.get $h)))
              (if (i32.lt_u (local.get $c) (i32.const @WM_PMAX))
                (then
                  ;; still since its last pop ducked, and its rest
                  (local.set $b (i32.const 0))
                  (if (local.get $c)
                    (then
                      (local.set $a (call $wm_rec (local.get $h) (i32.sub (local.get $c) (i32.const 1))))
                      (local.set $b (i32.add (i32.add (i32.load16_u offset=@(PG_BIG + WM_POPS + WM_P_T0) (local.get $a))
                                                      (i32.load8_u offset=@(PG_BIG + WM_POPS + WM_P_UP) (local.get $a)))
                                             (i32.const @(WM_RISE + WM_DUCK + WM_REST))))))
                  (if (i32.le_s (local.get $b) (local.get $tp))
                    (then
                      (local.set $up (i32.sub (i32.add (i32.sub (i32.const @WM_UP0) (i32.div_u (i32.mul (i32.const @(WM_UP0 - WM_UP1)) (local.get $t0)) (i32.const @WM_LEN)))
                                                       (i32.rem_u (call $rand) (i32.const @(2 * WM_UPJ + 1))))
                                              (i32.const @WM_UPJ)))
                      (local.set $kind (i32.const @WM_KMOLE))
                      (if (i32.eqz (i32.rem_u (call $rand) (i32.const @WM_GOLD)))
                        (then (local.set $kind (i32.const @WM_KGOLD)))
                        (else
                          (if (i32.ge_u (local.get $t0) (i32.const @WM_SPIKE))
                            (then
                              (if (i32.eqz (i32.rem_u (call $rand) (i32.const @WM_SPIKEK)))
                                (then (local.set $kind (i32.const @WM_KSPIKE))))))))
                      (local.set $a (call $wm_rec (local.get $h) (local.get $c)))
                      (i32.store16 offset=@(PG_BIG + WM_POPS + WM_P_T0) (local.get $a) (local.get $t0))
                      (i32.store8 offset=@(PG_BIG + WM_POPS + WM_P_UP) (local.get $a) (local.get $up))
                      (i32.store8 offset=@(PG_BIG + WM_POPS + WM_P_KIND) (local.get $a) (local.get $kind))
                      (i32.store8 offset=@(PG_S + WM_COUNT) (local.get $h) (i32.add (local.get $c) (i32.const 1)))
                      (!inc $total)
                      (br $placed)))))))
          (br $more)))
      (!inc $tp)
      (br $next)))
  (i32.store (i32.const @(PG_H + WM_NPOP)) (local.get $total)))

;; A sunflower spiral over the middle of the lawn, each point moved out to
;; WM_CLEAR from the axis of a hole it is nearer than that.
(func $wm_spawn (param $i i32) (param $n i32) (result f32 f32 f32)
  (local $x f32) (local $z f32) (local $hx f32) (local $hz f32) (local $dx f32) (local $dz f32) (local $dd f32)
  (call $p_disc (local.get $i) (local.get $n) (f32.mul (f32.load (i32.const @(PG_H + WM_HALF))) (f32.const @WM_SPAWN)))
  (local.set $z) (local.set $x)
  (call $wm_near (i32.const 0) (local.get $x) (local.get $z))
  (local.set $hz) (local.set $hx) (drop)
  (local.set $dx (f32.sub (local.get $x) (local.get $hx)))
  (local.set $dz (f32.sub (local.get $z) (local.get $hz)))
  (local.set $dd (f32.sqrt (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz)))))
  (if (f32.lt (local.get $dd) (f32.const @WM_CLEAR))
    (then
      (if (f32.lt (local.get $dd) (f32.const 0.001)) (then (local.set $dx (f32.const 1)) (local.set $dz (f32.const 0)) (local.set $dd (f32.const 1))))
      (local.set $x (!madd (f32.div (local.get $dx) (local.get $dd)) (f32.const @WM_CLEAR) (local.get $hx)))
      (local.set $z (!madd (f32.div (local.get $dz) (local.get $dd)) (f32.const @WM_CLEAR) (local.get $hz)))))
  (!chk (local.get $x) 421 (local.get $i))
  (!chk (local.get $z) 421 (local.get $i))
  (local.get $x) (f32.const @PLAT_Y) (local.get $z))

(func $wm_start)
(func $wm_begin (param $p i32) (param $d i32))

;; The lawn's top under (x, z) on bank d, or the head of the mole out of the
;; nearest hole if (x, z) is within WM_HEADR of its axis and the ball's bottom
;; (y less P_STEP) was over it but for WM_SNAP's slack: a ball comes down onto
;; a head, never climbs or is lifted onto one. None past the fence's line.
(func $wm_ground (param $d i32) (param $x f32) (param $y f32) (param $z f32) (result f32)
  (local $cx f32) (local $hw f32) (local $hx f32) (local $hz f32) (local $dx f32) (local $dz f32) (local $i i32) (local $a i32) (local $tp i32) (local $top f32)
  (if (f32.lt (local.get $y) (f32.const @PLAT_Y)) (then (return (f32.const -1000))))
  (local.set $cx (f32.load offset=@PG_CX (local.get $d)))
  (local.set $hw (f32.load offset=@(PG_H + WM_HALF) (local.get $d)))
  (if (i32.or (f32.gt (f32.abs (f32.sub (local.get $x) (local.get $cx))) (local.get $hw))
              (f32.gt (f32.abs (f32.sub (local.get $z) (local.get $cx))) (local.get $hw)))
    (then (return (f32.const -1000))))
  (call $wm_near (local.get $d) (local.get $x) (local.get $z))
  (local.set $hz) (local.set $hx) (local.set $i)
  (local.set $dx (f32.sub (local.get $x) (local.get $hx)))
  (local.set $dz (f32.sub (local.get $z) (local.get $hz)))
  (if (f32.gt (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))) (f32.const @(WM_HEADR * WM_HEADR)))
    (then (return (f32.const @PLAT_Y))))
  (local.set $tp (call $p_t (local.get $d)))
  (local.set $a (call $wm_pop (local.get $i) (local.get $tp)))
  (if (i32.lt_s (local.get $a) (i32.const 0)) (then (return (f32.const @PLAT_Y))))
  (local.set $top (call $wm_top (local.get $a) (local.get $tp)))
  (if (result f32) (i32.and (f32.gt (local.get $top) (f32.const @PLAT_Y)) (f32.le (local.get $top) (f32.sub (local.get $y) (f32.const @WM_SNAP))))
    (then (local.get $top))
    (else (f32.const @PLAT_Y))))

;; After ball p's roll on bank d: the fence holds it in while its bottom is
;; under the fence's top (a ball that flew over it is gone); then the mole
;; out of the nearest hole. Standing on
;; its head marks the ball's PG_M (tick() whacks it from that), and a spiked
;; head flings it off. Under the head's top it is a post as wide as the
;; ball's sphere reaches at that height: the ball is put back out of it and
;; bounces off, or a spiked one flings it out. Writes only its own record and
;; bank d's FX.
(func $wm_push (param $p i32) (param $d i32)
  (local $pb i32) (local $fl i32) (local $i i32) (local $a i32) (local $tp i32) (local $kind i32) (local $hit i32)
  (local $px f32) (local $py f32) (local $pz f32) (local $vx f32) (local $vy f32) (local $vz f32) (local $r f32)
  (local $cx f32) (local $lim f32) (local $hx f32) (local $hz f32) (local $top f32) (local $dx f32) (local $dz f32) (local $q f32)
  (local $dd f32) (local $nx f32) (local $nz f32) (local $vn f32) (local $e f32) (local $rr f32)
  (local.set $pb (i32.add (i32.shl (local.get $p) (i32.const 6)) (local.get $d)))
  (local.set $fl (!at u8 @(PLAYERS + P_FL) (local.get $pb)))
  (if (i32.ne (i32.and (local.get $fl) (i32.const @(PF_LIVE | PF_DEAD | PF_FALL))) (i32.const @PF_LIVE)) (then (return)))
  (local.set $px (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
  (local.set $py (!at f32 @(PLAYERS + P_PY) (local.get $pb)))
  (local.set $pz (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
  (local.set $vx (!at f32 @(PLAYERS + P_VX) (local.get $pb)))
  (local.set $vy (!at f32 @(PLAYERS + P_VY) (local.get $pb)))
  (local.set $vz (!at f32 @(PLAYERS + P_VZ) (local.get $pb)))
  (local.set $r (call $b_rad (local.get $pb)))
  (local.set $cx (f32.load offset=@PG_CX (local.get $d)))
  ;; the fence, on a ball under its top whose centre is still on the lawn's side of it (one gone over is the sea's)
  (local.set $e (f32.load offset=@(PG_H + WM_HALF) (local.get $d)))
  (if (i32.and (i32.and (f32.lt (local.get $py) (f32.const @(+PLAT_Y + WM_FENCEH)))
                        (f32.lt (f32.abs (f32.sub (local.get $px) (local.get $cx))) (local.get $e)))
               (f32.lt (f32.abs (f32.sub (local.get $pz) (local.get $cx))) (local.get $e)))
    (then
      (local.set $lim (f32.sub (local.get $e) (local.get $r)))
      (if (f32.gt (f32.sub (local.get $px) (local.get $cx)) (local.get $lim))
        (then
          (local.set $px (f32.add (local.get $cx) (local.get $lim)))
          (if (f32.gt (local.get $vx) (f32.const 0)) (then (local.set $vx (f32.mul (local.get $vx) (f32.const @(-WM_FENCEE))))))))
      (if (f32.lt (f32.sub (local.get $px) (local.get $cx)) (f32.neg (local.get $lim)))
        (then
          (local.set $px (f32.sub (local.get $cx) (local.get $lim)))
          (if (f32.lt (local.get $vx) (f32.const 0)) (then (local.set $vx (f32.mul (local.get $vx) (f32.const @(-WM_FENCEE))))))))
      (if (f32.gt (f32.sub (local.get $pz) (local.get $cx)) (local.get $lim))
        (then
          (local.set $pz (f32.add (local.get $cx) (local.get $lim)))
          (if (f32.gt (local.get $vz) (f32.const 0)) (then (local.set $vz (f32.mul (local.get $vz) (f32.const @(-WM_FENCEE))))))))
      (if (f32.lt (f32.sub (local.get $pz) (local.get $cx)) (f32.neg (local.get $lim)))
        (then
          (local.set $pz (f32.sub (local.get $cx) (local.get $lim)))
          (if (f32.lt (local.get $vz) (f32.const 0)) (then (local.set $vz (f32.mul (local.get $vz) (f32.const @(-WM_FENCEE))))))))))
  ;; the nearest hole's mole, if it is out
  (local.set $tp (call $p_t (local.get $d)))
  (call $wm_near (local.get $d) (local.get $px) (local.get $pz))
  (local.set $hz) (local.set $hx) (local.set $i)
  (local.set $a (call $wm_pop (local.get $i) (local.get $tp)))
  (if (i32.ge_s (local.get $a) (i32.const 0))
    (then
      (local.set $top (call $wm_top (local.get $a) (local.get $tp)))
      (if (f32.gt (local.get $top) (f32.const @PLAT_Y))
        (then
          (local.set $kind (i32.load8_u offset=@(PG_BIG + WM_POPS + WM_P_KIND) (local.get $a)))
          (local.set $dx (f32.sub (local.get $px) (local.get $hx)))
          (local.set $dz (f32.sub (local.get $pz) (local.get $hz)))
          (local.set $q (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))))
          (if (i32.and (i32.and (i32.ne (i32.and (local.get $fl) (i32.const @PF_GROUND)) (i32.const 0)) (f32.eq (local.get $py) (local.get $top)))
                       (f32.le (local.get $q) (f32.const @(WM_HEADR * WM_HEADR))))
            (then
              ;; on its head (it landed there: ground holds nobody up a head otherwise)
              (local.set $hit (i32.const @WM_ON))
              (if (i32.eq (local.get $kind) (i32.const @WM_KSPIKE))
                (then
                  ;; spikes: flung off out from its axis, else on the way it came, else along x
                  (local.set $hit (i32.const @WM_SPIKED))
                  (local.set $dd (f32.sqrt (local.get $q)))
                  (if (f32.gt (local.get $dd) (f32.const 0.05))
                    (then
                      (local.set $nx (f32.div (local.get $dx) (local.get $dd)))
                      (local.set $nz (f32.div (local.get $dz) (local.get $dd))))
                    (else
                      (local.set $dd (f32.sqrt (!madd (local.get $vx) (local.get $vx) (f32.mul (local.get $vz) (local.get $vz)))))
                      (local.set $nx (f32.const 1))
                      (local.set $nz (f32.const 0))
                      (if (f32.gt (local.get $dd) (f32.const 0.05))
                        (then
                          (local.set $nx (f32.div (local.get $vx) (local.get $dd)))
                          (local.set $nz (f32.div (local.get $vz) (local.get $dd)))))))
                  (local.set $vx (f32.mul (local.get $nx) (f32.const @WM_FLING)))
                  (local.set $vz (f32.mul (local.get $nz) (f32.const @WM_FLING)))
                  (local.set $vy (f32.max (local.get $vy) (f32.const @WM_FLINGUP)))
                  (local.set $fl (i32.and (local.get $fl) (i32.const @(255 ^ PF_GROUND))))
                  (call $fx (local.get $d) (i32.const @WM_FX_SPIKE) (local.get $p) (i32.or (local.get $i) (i32.const 0x100))
                            (local.get $px) (local.get $py) (local.get $pz) (f32.const @WM_FLING)))))
            (else
              (if (f32.lt (local.get $py) (local.get $top))
                (then
                  ;; under its top: the post, out to where the ball's sphere reaches at that height
                  (local.set $e (f32.sub (local.get $top) (local.get $py)))
                  (local.set $rr (local.get $r))
                  (if (f32.lt (local.get $e) (local.get $r))
                    (then (local.set $rr (f32.sqrt (f32.mul (local.get $e) (f32.sub (f32.add (local.get $r) (local.get $r)) (local.get $e)))))))
                  (local.set $rr (f32.add (local.get $rr) (f32.const @WM_MR)))
                  (if (f32.lt (local.get $q) (f32.mul (local.get $rr) (local.get $rr)))
                    (then
                      (local.set $dd (f32.sqrt (local.get $q)))
                      (if (f32.gt (local.get $dd) (f32.const 0.001))
                        (then
                          (local.set $nx (f32.div (local.get $dx) (local.get $dd)))
                          (local.set $nz (f32.div (local.get $dz) (local.get $dd))))
                        (else
                          ;; dead on its axis: back the way it came, else out along x
                          (local.set $dd (f32.sqrt (!madd (local.get $vx) (local.get $vx) (f32.mul (local.get $vz) (local.get $vz)))))
                          (local.set $nx (f32.const 1))
                          (local.set $nz (f32.const 0))
                          (if (f32.gt (local.get $dd) (f32.const 0.001))
                            (then
                              (local.set $nx (f32.neg (f32.div (local.get $vx) (local.get $dd))))
                              (local.set $nz (f32.neg (f32.div (local.get $vz) (local.get $dd))))))))
                      (local.set $px (!madd (local.get $nx) (f32.add (local.get $rr) (f32.const 0.01)) (local.get $hx)))
                      (local.set $pz (!madd (local.get $nz) (f32.add (local.get $rr) (f32.const 0.01)) (local.get $hz)))
                      (local.set $vn (!madd (local.get $vx) (local.get $nx) (f32.mul (local.get $vz) (local.get $nz))))
                      (if (i32.eq (local.get $kind) (i32.const @WM_KSPIKE))
                        (then
                          (local.set $hit (i32.const @WM_SIDE))
                          (if (f32.lt (local.get $vn) (f32.const @WM_FLING))
                            (then
                              (local.set $vx (!madd (local.get $nx) (f32.sub (f32.const @WM_FLING) (local.get $vn)) (local.get $vx)))
                              (local.set $vz (!madd (local.get $nz) (f32.sub (f32.const @WM_FLING) (local.get $vn)) (local.get $vz)))))
                          (local.set $vy (f32.max (local.get $vy) (f32.const @WM_FLINGUP)))
                          (local.set $fl (i32.and (local.get $fl) (i32.const @(255 ^ PF_GROUND))))
                          (call $fx (local.get $d) (i32.const @WM_FX_SPIKE) (local.get $p) (local.get $i)
                                    (!madd (local.get $nx) (f32.const @WM_MR) (local.get $hx)) (f32.add (local.get $py) (local.get $r))
                                    (!madd (local.get $nz) (f32.const @WM_MR) (local.get $hz)) (f32.const @WM_FLING)))
                        (else
                          (if (f32.lt (local.get $vn) (f32.const 0))
                            (then
                              (local.set $vx (f32.sub (local.get $vx) (f32.mul (local.get $nx) (f32.mul (local.get $vn) (f32.const @(1 + WM_POSTE))))))
                              (local.set $vz (f32.sub (local.get $vz) (f32.mul (local.get $nz) (f32.mul (local.get $vn) (f32.const @(1 + WM_POSTE))))))))))))))))))))
  (!chk (local.get $px) 422 (local.get $p))
  (!chk (local.get $pz) 422 (local.get $p))
  (!chk (local.get $vx) 423 (local.get $p))
  (!chk (local.get $vy) 423 (local.get $p))
  (!chk (local.get $vz) 423 (local.get $p))
  (!put f32 @(PLAYERS + P_PX) (local.get $pb) (local.get $px))
  (!put f32 @(PLAYERS + P_PZ) (local.get $pb) (local.get $pz))
  (!put f32 @(PLAYERS + P_VX) (local.get $pb) (local.get $vx))
  (!put f32 @(PLAYERS + P_VY) (local.get $pb) (local.get $vy))
  (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (local.get $vz))
  (!put u8 @(PLAYERS + P_FL) (local.get $pb) (local.get $fl))
  ;; what it stood on or was flung off, this tick, for the confirmed world's tick()
  (if (local.get $hit)
    (then (!put i32 @(PLAYERS + PG_M) (local.get $pb)
            (i32.or (i32.or (i32.shl (i32.load offset=@HDR_TICK (local.get $d)) (i32.const 10)) (i32.shl (local.get $hit) (i32.const 8)))
                    (i32.add (local.get $i) (i32.const 1)))))))

;; Slot p's score plus k (less, for k under 0), held to a u16.
(func $wm_add (param $p i32) (param $k i32)
  (local $pb i32) (local $s i32)
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (local.set $s (i32.add (!at u16 @(PLAYERS + PG_SCORE) (local.get $pb)) (local.get $k)))
  (if (i32.lt_s (local.get $s) (i32.const 0)) (then (local.set $s (i32.const 0))))
  (if (i32.gt_s (local.get $s) (i32.const 65535)) (then (local.set $s (i32.const 65535))))
  (!put u16 @(PLAYERS + PG_SCORE) (local.get $pb) (local.get $s)))

;; The round's world, a tick of it. In slot order, what each ball's push
;; marked this tick: standing on the head of a mole nobody has whacked this
;; pop whacks it (WM_GOLDV for gold, twice in the frenzy), the first ball by
;; slot taking it; come down on spikes costs WM_SPIKEV. Then a pop's sound for
;; every mole starting to rise, and the calls.
(func $wm_tick
  (local $t i32) (local $tp i32) (local $p i32) (local $pb i32) (local $m i32) (local $i i32) (local $a i32) (local $v i32) (local $nh i32)
  (local $x f32) (local $z f32)
  (local.set $t (i32.load (i32.const @HDR_TICK)))
  (local.set $tp (call $p_t (i32.const 0)))
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
    (if (call $p_in (local.get $pb))
      (then
        (local.set $m (!at i32 @(PLAYERS + PG_M) (local.get $pb)))
        (if (i32.and (i32.eq (i32.and (local.get $m) (i32.const 0xfffffc00)) (i32.shl (local.get $t) (i32.const 10)))
                     (i32.ne (i32.and (local.get $m) (i32.const 0xff)) (i32.const 0)))
          (then
            (local.set $i (i32.sub (i32.and (local.get $m) (i32.const 0xff)) (i32.const 1)))
            (call $wm_hole (local.get $i))
            (local.set $z) (local.set $x)
            (local.set $a (call $wm_pop (local.get $i) (local.get $tp)))
            (if (i32.and (i32.eq (i32.and (i32.shr_u (local.get $m) (i32.const 8)) (i32.const 3)) (i32.const @WM_ON)) (i32.ge_s (local.get $a) (i32.const 0)))
              (then
                (if (i32.and (i32.eqz (i32.load8_u offset=@(PG_BIG + WM_POPS + WM_P_HIT) (local.get $a)))
                             (i32.ne (i32.load8_u offset=@(PG_BIG + WM_POPS + WM_P_KIND) (local.get $a)) (i32.const @WM_KSPIKE)))
                  (then
                    (i32.store8 offset=@(PG_BIG + WM_POPS + WM_P_BY) (local.get $a) (local.get $p))
                    (i32.store8 offset=@(PG_BIG + WM_POPS + WM_P_HIT) (local.get $a) (i32.const 1))
                    (i32.store16 offset=@(PG_BIG + WM_POPS + WM_P_WT) (local.get $a) (local.get $tp))
                    (local.set $v (select (i32.const @WM_GOLDV) (i32.const 1)
                                          (i32.eq (i32.load8_u offset=@(PG_BIG + WM_POPS + WM_P_KIND) (local.get $a)) (i32.const @WM_KGOLD))))
                    (if (i32.ge_u (local.get $tp) (i32.const @WM_FRENZY)) (then (local.set $v (i32.shl (local.get $v) (i32.const 1)))))
                    (call $wm_add (local.get $p) (local.get $v))
                    (i32.store (i32.const @(PG_H + WM_WHACKS)) (i32.add (i32.load (i32.const @(PG_H + WM_WHACKS))) (i32.const 1)))
                    (call $fx (i32.const 0) (i32.const @WM_FX_WHACK) (local.get $p) (local.get $i)
                              (local.get $x) (call $wm_top (local.get $a) (local.get $tp)) (local.get $z) (f32.convert_i32_u (local.get $v)))))))
            (if (i32.eq (i32.and (i32.shr_u (local.get $m) (i32.const 8)) (i32.const 3)) (i32.const @WM_SPIKED))
              (then
                (call $wm_add (local.get $p) (i32.const @(-WM_SPIKEV)))
                (call $fx (i32.const 0) (i32.const @WM_FX_WHACK) (local.get $p) (local.get $i)
                          (local.get $x) (f32.const @(+PLAT_Y + WM_TOP)) (local.get $z) (f32.const @(-WM_SPIKEV))))))))))
  ;; the moles starting to rise
  (local.set $nh (i32.load (i32.const @(PG_H + WM_NH))))
  (!for $i (i32.const 0) (local.get $nh)
    (local.set $a (call $wm_pop (local.get $i) (local.get $tp)))
    (if (i32.ge_s (local.get $a) (i32.const 0))
      (then
        (if (i32.eq (i32.load16_u offset=@(PG_BIG + WM_POPS + WM_P_T0) (local.get $a)) (local.get $tp))
          (then
            (call $wm_hole (local.get $i))
            (local.set $z) (local.set $x)
            (call $fx (i32.const 0) (i32.const @WM_FX_POP) (i32.const 255) (local.get $i) (local.get $x) (f32.const @PLAT_Y) (local.get $z)
                      (f32.convert_i32_u (i32.load8_u offset=@(PG_BIG + WM_POPS + WM_P_KIND) (local.get $a)))))))))
  (if (i32.eq (local.get $tp) (i32.const @(WM_SPIKE - WM_TELE)))
    (then (call $fx (i32.const 0) (i32.const @WM_FX_CALL) (i32.const 255) (i32.const 0)
                    (f32.load (i32.const @PG_CX)) (f32.const @PLAT_Y) (f32.load (i32.const @PG_CX)) (f32.const 0))))
  (if (i32.eq (local.get $tp) (i32.const @WM_FRENZY))
    (then (call $fx (i32.const 0) (i32.const @WM_FX_CALL) (i32.const 255) (i32.const 1)
                    (f32.load (i32.const @PG_CX)) (f32.const @PLAT_Y) (f32.load (i32.const @PG_CX)) (f32.const 0)))))

(func $wm_over (result i32) (i32.const 0))
(func $wm_out (param $p i32))
