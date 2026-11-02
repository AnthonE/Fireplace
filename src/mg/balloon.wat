;; BALLOON BASH: every ball carries three balloons into a walled arena sized
;; for the crowd, with a two-tier tower in the middle and crates round it,
;; low ones a hop high and tall ones with a step beside. Come down on another
;; ball's top (a stomp: your bottom over its centre, falling) and it loses a
;; balloon and you bounce; drive into it faster than BL_RAM along the line
;; between you, and faster than it into you (a ram), and it loses one; a
;; ROCKET's or POW's blast, or a SPRING's landing, pops one of each ball it
;; shoves. A pop you cause steals the balloon if you have fewer than three;
;; the ball that lost it is guarded BL_GUARD, and out of balloons it's out,
;; the KO to whoever popped the last. Bumper's power-ups fall from the sky.
;; From BL_CLOSE0 the wall closes in to BL_RMIN round the tower by
;; BL_CLOSE1, each crate sinking into the floor as it reaches it; in that
;; last ring a ram takes less, nothing is stolen and power-ups fall twice as
;; often; at the clock whoever is still in shares the win. Bumps on; nobody
;; falls.
;;
;; The arena is the confirmed world's from setup on (the boxes in PG_S, each
;; with the tick into play the wall takes it), and the wall's radius is a
;; function of the tick into play, so ground and push read only bank d's
;; header, the boxes and the ball's own record: the prediction rolls your
;; ball onto, off and into the crates and against the closing wall exactly
;; as the confirmed world will. The pops are ball against ball, or a blast:
;; the confirmed world's tick reads them off bumper's own bookkeeping (a
;; fresh B_HITT), with each ball's speed as the last tick ended kept in
;; PG_BIG to tell how fast it came in. Bumper keeps one hitter, so the tick
;; finds every blast that went off itself, from what it kept as the last
;; tick ended (each ball's record, PROJ's rockets), and where. Their effect
;; on your ball (a balloon, a stomp's bounce) comes a round trip later, as a
;; bump does.

;; The wall's radius on bank d's tick: the start's until BL_CLOSE0, then in
;; a straight line to BL_RMIN by BL_CLOSE1.
(func $bl_rim (param $d i32) (result f32)
  (local $r0 f32) (local $f f32)
  (local.set $r0 (f32.load offset=@(PG_H + BL_RAD) (local.get $d)))
  (local.set $f (f32.min (f32.max (f32.mul (f32.convert_i32_s (i32.sub (call $p_t (local.get $d)) (i32.const @BL_CLOSE0)))
                                           (f32.const @(1 / (BL_CLOSE1 - BL_CLOSE0))))
                                  (f32.const 0))
                         (f32.const 1)))
  (f32.sub (local.get $r0) (f32.mul (f32.sub (local.get $r0) (f32.const @BL_RMIN)) (local.get $f))))

;; How fast the wall comes in on bank d's tick, m/s (0 but while it closes).
(func $bl_wallv (param $d i32) (result f32)
  (local $t i32)
  (local.set $t (call $p_t (local.get $d)))
  (if (result f32) (i32.and (i32.ge_s (local.get $t) (i32.const @BL_CLOSE0)) (i32.lt_s (local.get $t) (i32.const @BL_CLOSE1)))
    (then (f32.mul (f32.sub (f32.load offset=@(PG_H + BL_RAD) (local.get $d)) (f32.const @BL_RMIN)) (f32.const @(125 / (BL_CLOSE1 - BL_CLOSE0)))))
    (else (f32.const 0))))

;; Box b's top over the floor (b its record's offset in PG_S's boxes) on tick
;; t into play: all of it till BL_SINK before the wall takes it, then sinking
;; to nothing; -1 once it's gone.
(func $bl_top (param $b i32) (param $t i32) (result f32)
  (local $g i32) (local $top f32)
  (local.set $g (i32.load offset=@(PG_S + BL_BOX + 16) (local.get $b)))
  (if (i32.ge_s (local.get $t) (local.get $g)) (then (return (f32.const -1))))
  (local.set $top (f32.load offset=@(PG_S + BL_BOX + 12) (local.get $b)))
  (if (i32.gt_s (i32.sub (local.get $g) (local.get $t)) (i32.const @BL_SINK)) (then (return (local.get $top))))
  (f32.mul (local.get $top) (f32.mul (f32.convert_i32_s (i32.sub (local.get $g) (local.get $t))) (f32.const @(1 / BL_SINK)))))

;; A box at (x, z), half-width h, top over the floor, of a kind (BL_K*), with
;; the tick into play the wall reaches its far corner (never, inside BL_RMIN;
;; at once as it starts closing, outside the start's radius).
(func $bl_box (param $x f32) (param $z f32) (param $h f32) (param $top f32) (param $kind i32)
  (local $k i32) (local $b i32) (local $ax f32) (local $az f32) (local $far f32) (local $r0 f32) (local $g i32)
  (local.set $k (i32.load (i32.const @(PG_H + BL_NB))))
  (if (i32.ge_u (local.get $k) (i32.const @BL_BMAX)) (then (return)))
  (local.set $b (i32.add (i32.const @(PG_S + BL_BOX)) (i32.shl (local.get $k) (i32.const 5))))
  (local.set $ax (f32.add (f32.abs (f32.sub (local.get $x) (f32.load (i32.const @PG_CX)))) (local.get $h)))
  (local.set $az (f32.add (f32.abs (f32.sub (local.get $z) (f32.load (i32.const @PG_CX)))) (local.get $h)))
  (local.set $far (f32.sqrt (!madd (local.get $ax) (local.get $ax) (f32.mul (local.get $az) (local.get $az)))))
  (local.set $r0 (f32.load (i32.const @(PG_H + BL_RAD))))
  (local.set $g (i32.const 0x7fffffff))
  (if (f32.gt (local.get $far) (f32.const @BL_RMIN))
    (then
      (local.set $g (i32.add (i32.const @BL_CLOSE0)
                             (i32.trunc_sat_f32_s (f32.mul (f32.div (f32.sub (local.get $r0) (local.get $far)) (f32.sub (local.get $r0) (f32.const @BL_RMIN)))
                                                           (f32.const @(BL_CLOSE1 - BL_CLOSE0))))))
      (if (i32.lt_s (local.get $g) (i32.const @BL_CLOSE0)) (then (local.set $g (i32.const @BL_CLOSE0))))))
  (f32.store (local.get $b) (local.get $x))
  (f32.store offset=4 (local.get $b) (local.get $z))
  (f32.store offset=8 (local.get $b) (local.get $h))
  (f32.store offset=12 (local.get $b) (local.get $top))
  (i32.store offset=16 (local.get $b) (local.get $g))
  (i32.store offset=20 (local.get $b) (local.get $kind))
  (i32.store (i32.const @(PG_H + BL_NB)) (i32.add (local.get $k) (i32.const 1))))

;; Is a box of half-width h at (x, z) clear of every box so far by BL_GAP,
;; and its far corner a metre and a half inside the wall?
(func $bl_free (param $x f32) (param $z f32) (param $h f32) (result i32)
  (local $k i32) (local $b i32) (local $lim f32) (local $ax f32) (local $az f32) (local $rim f32)
  (local.set $ax (f32.add (f32.abs (f32.sub (local.get $x) (f32.load (i32.const @PG_CX)))) (local.get $h)))
  (local.set $az (f32.add (f32.abs (f32.sub (local.get $z) (f32.load (i32.const @PG_CX)))) (local.get $h)))
  (local.set $rim (f32.sub (f32.load (i32.const @(PG_H + BL_RAD))) (f32.const 1.5)))
  (if (f32.gt (!madd (local.get $ax) (local.get $ax) (f32.mul (local.get $az) (local.get $az))) (f32.mul (local.get $rim) (local.get $rim)))
    (then (return (i32.const 0))))
  (!for $k (i32.const 0) (i32.load (i32.const @(PG_H + BL_NB)))
    (local.set $b (i32.add (i32.const @(PG_S + BL_BOX)) (i32.shl (local.get $k) (i32.const 5))))
    (local.set $lim (f32.add (f32.add (local.get $h) (f32.load offset=8 (local.get $b))) (f32.const @BL_GAP)))
    (if (i32.and (f32.lt (f32.abs (f32.sub (local.get $x) (f32.load (local.get $b)))) (local.get $lim))
                 (f32.lt (f32.abs (f32.sub (local.get $z) (f32.load offset=4 (local.get $b)))) (local.get $lim)))
      (then (return (i32.const 0)))))
  (i32.const 1))

;; Is a ball standing at (x, z) BL_CLEAR clear of every box?
(func $bl_clear (param $x f32) (param $z f32) (result i32)
  (local $k i32) (local $b i32) (local $h f32) (local $dx f32) (local $dz f32) (local $lim f32)
  (local.set $lim (f32.const @(+B_RAD + BL_CLEAR)))
  (!for $k (i32.const 0) (i32.load (i32.const @(PG_H + BL_NB)))
    (local.set $b (i32.add (i32.const @(PG_S + BL_BOX)) (i32.shl (local.get $k) (i32.const 5))))
    (local.set $h (f32.load offset=8 (local.get $b)))
    (local.set $dx (f32.max (f32.sub (f32.abs (f32.sub (local.get $x) (f32.load (local.get $b)))) (local.get $h)) (f32.const 0)))
    (local.set $dz (f32.max (f32.sub (f32.abs (f32.sub (local.get $z) (f32.load offset=4 (local.get $b)))) (local.get $h)) (f32.const 0)))
    (if (f32.lt (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))) (f32.mul (local.get $lim) (local.get $lim)))
      (then (return (i32.const 0)))))
  (i32.const 1))

;; The arena for n balls: its radius, the tower, the crates (from the PRNG,
;; each clear of the rest), and the spiral's points clear of them all, which
;; spawn shares out.
(func $bl_setup (param $n i32)
  (local $r0 f32) (local $cx f32) (local $want i32) (local $tries i32) (local $k i32) (local $side i32) (local $m i32) (local $i i32) (local $nclear i32)
  (local $rr f32) (local $s f32) (local $c f32) (local $x f32) (local $z f32) (local $sx f32) (local $sz f32) (local $rin2 f32) (local $rout2 f32)
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (local.set $r0 (f32.min (!madd (f32.sqrt (f32.convert_i32_u (local.get $n))) (f32.const @BL_RK) (f32.const @BL_R0)) (f32.const @BL_RMAX)))
  (!chk (local.get $r0) 430 (local.get $n))
  (i32.store (i32.const @PG_KIND) (i32.const @PK_OUT))
  (i32.store (i32.const @PG_LEN) (i32.const @BL_LEN))
  (f32.store (i32.const @PG_SIZE) (local.get $r0))
  (f32.store (i32.const @(PG_H + BL_RAD)) (local.get $r0))
  (i32.store (i32.const @(PG_H + BL_DROP)) (i32.const @BL_DROP0))
  ;; the tower
  (call $bl_box (local.get $cx) (local.get $cx) (f32.const @BL_T1) (f32.const @BL_T1H) (i32.const @BL_KBASE))
  (call $bl_box (local.get $cx) (local.get $cx) (f32.const @BL_T2) (f32.const @BL_T2H) (i32.const @BL_KTOP))
  ;; the crates, evenly over the ring's area; a tall one's step on a side the PRNG picks
  (local.set $want (i32.add (i32.const @BL_C0) (i32.trunc_sat_f32_u (f32.mul (f32.mul (local.get $r0) (local.get $r0)) (f32.const @(Math.PI / BL_CAREA))))))
  (local.set $rin2 (f32.const @(BL_CIN * BL_CIN)))
  (local.set $rout2 (f32.mul (f32.sub (local.get $r0) (f32.const @BL_COUT)) (f32.sub (local.get $r0) (f32.const @BL_COUT))))
  (block $done
    (loop $more
      (br_if $done (i32.or (i32.ge_u (local.get $k) (local.get $want)) (i32.ge_u (local.get $tries) (i32.mul (local.get $want) (i32.const 12)))))
      (br_if $done (i32.gt_u (i32.load (i32.const @(PG_H + BL_NB))) (i32.const @(BL_BMAX - 2))))
      (!inc $tries)
      (local.set $rr (f32.sqrt (!madd (call $p_unit) (f32.sub (local.get $rout2) (local.get $rin2)) (local.get $rin2))))
      (call $sincos (call $rand))
      (local.set $c) (local.set $s)
      (local.set $x (!madd (local.get $c) (local.get $rr) (local.get $cx)))
      (local.set $z (!madd (local.get $s) (local.get $rr) (local.get $cx)))
      (if (f32.lt (call $p_unit) (f32.const @BL_TALL))
        (then
          (local.set $side (i32.and (call $rand) (i32.const 3)))
          (local.set $sx (local.get $x))
          (local.set $sz (local.get $z))
          (if (i32.lt_u (local.get $side) (i32.const 2))
            (then (local.set $sx (f32.add (local.get $x) (select (f32.const @(BL_CRATE + BL_STEP)) (f32.const @(-BL_CRATE - BL_STEP)) (local.get $side)))))
            (else (local.set $sz (f32.add (local.get $z) (select (f32.const @(BL_CRATE + BL_STEP)) (f32.const @(-BL_CRATE - BL_STEP)) (i32.and (local.get $side) (i32.const 1)))))))
          (if (i32.and (call $bl_free (local.get $x) (local.get $z) (f32.const @BL_CRATE)) (call $bl_free (local.get $sx) (local.get $sz) (f32.const @BL_STEP)))
            (then
              (call $bl_box (local.get $x) (local.get $z) (f32.const @BL_CRATE) (f32.const @BL_HIGH) (i32.const @BL_KHIGH))
              (call $bl_box (local.get $sx) (local.get $sz) (f32.const @BL_STEP) (f32.const @BL_LOW) (i32.const @BL_KSTEP))
              (!inc $k))))
        (else
          (if (call $bl_free (local.get $x) (local.get $z) (f32.const @BL_CRATE))
            (then
              (call $bl_box (local.get $x) (local.get $z) (f32.const @BL_CRATE) (f32.const @BL_LOW) (i32.const @BL_KLOW))
              (!inc $k)))))
      (br $more)))
  ;; the spawns: the spiral's points clear of every box
  (local.set $m (i32.add (i32.shl (local.get $n) (i32.const 1)) (i32.const 16)))
  (!for $i (i32.const 0) (local.get $m)
    (call $p_disc (local.get $i) (local.get $m) (f32.mul (local.get $r0) (f32.const @BL_SPAWN)))
    (local.set $z) (local.set $x)
    (if (call $bl_clear (local.get $x) (local.get $z))
      (then (!st u16 @(PG_S + BL_SPOTS) (local.get $nclear) (local.get $i)) (!inc $nclear))))
  (i32.store (i32.const @(PG_H + BL_NS)) (local.get $n))
  (i32.store (i32.const @(PG_H + BL_M)) (local.get $m))
  (i32.store (i32.const @(PG_H + BL_NCLEAR)) (local.get $nclear)))

;; Ball i of n on a clear point of the spiral, the clear ones shared out
;; evenly (n not the round's: the spiral's point i of n).
(func $bl_spawn (param $i i32) (param $n i32) (result f32 f32 f32)
  (local $nclear i32) (local $r f32) (local $x f32) (local $z f32)
  (local.set $nclear (i32.load (i32.const @(PG_H + BL_NCLEAR))))
  (local.set $r (f32.mul (f32.load (i32.const @(PG_H + BL_RAD))) (f32.const @BL_SPAWN)))
  (if (result f32 f32) (i32.and (i32.and (i32.ne (local.get $nclear) (i32.const 0)) (i32.eq (local.get $n) (i32.load (i32.const @(PG_H + BL_NS)))))
                                (i32.lt_u (local.get $i) (local.get $n)))
    (then
      (call $p_disc (!ld u16 @(PG_S + BL_SPOTS) (i32.div_u (i32.mul (local.get $i) (local.get $nclear)) (local.get $n)))
                    (i32.load (i32.const @(PG_H + BL_M))) (local.get $r)))
    (else (call $p_disc (local.get $i) (local.get $n) (local.get $r))))
  (local.set $z) (local.set $x)
  (local.get $x) (f32.const @PLAT_Y) (local.get $z))

(func $bl_start)
(func $bl_begin (param $p i32) (param $d i32))

;; The floor, everywhere (the wall keeps a ball on it), or the highest box
;; top under (x, z) no higher than y, as it stands on bank d's tick.
(func $bl_ground (param $d i32) (param $x f32) (param $y f32) (param $z f32) (result f32)
  (local $k i32) (local $b i32) (local $t i32) (local $h f32) (local $top f32) (local $best f32)
  (local.set $best (f32.const @PLAT_Y))
  (local.set $t (call $p_t (local.get $d)))
  (!for $k (i32.const 0) (i32.load offset=@(PG_H + BL_NB) (local.get $d))
    (local.set $b (i32.shl (local.get $k) (i32.const 5)))
    (local.set $h (f32.load offset=@(PG_S + BL_BOX + 8) (local.get $b)))
    (if (i32.and (f32.le (f32.abs (f32.sub (local.get $x) (f32.load offset=@(PG_S + BL_BOX) (local.get $b)))) (local.get $h))
                 (f32.le (f32.abs (f32.sub (local.get $z) (f32.load offset=@(PG_S + BL_BOX + 4) (local.get $b)))) (local.get $h)))
      (then
        (local.set $top (f32.add (f32.const @PLAT_Y) (call $bl_top (local.get $b) (local.get $t))))
        (if (i32.and (f32.le (local.get $top) (local.get $y)) (f32.gt (local.get $top) (local.get $best)))
          (then (local.set $best (local.get $top)))))))
  (local.get $best))

;; Ball p on bank d after its roll: out of every box it is more than a step
;; under the top of (out by the nearest way, bouncing off at BL_BOXE), then
;; inside the wall at any height, off it softly, and carried in at the
;; wall's speed while it closes.
(func $bl_push (param $p i32) (param $d i32)
  (local $pb i32) (local $k i32) (local $b i32) (local $t i32)
  (local $px f32) (local $py f32) (local $pz f32) (local $vx f32) (local $vz f32) (local $rb f32) (local $bot f32)
  (local $bx f32) (local $bz f32) (local $h f32) (local $dx f32) (local $dz f32) (local $d2 f32) (local $dist f32)
  (local $nx f32) (local $nz f32) (local $over f32) (local $vn f32) (local $ex f32) (local $ez f32) (local $cx f32) (local $lim f32)
  (local.set $pb (i32.add (i32.shl (local.get $p) (i32.const 6)) (local.get $d)))
  (local.set $px (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
  (local.set $py (!at f32 @(PLAYERS + P_PY) (local.get $pb)))
  (local.set $pz (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
  (local.set $vx (!at f32 @(PLAYERS + P_VX) (local.get $pb)))
  (local.set $vz (!at f32 @(PLAYERS + P_VZ) (local.get $pb)))
  (local.set $rb (call $b_rad (local.get $pb)))
  (local.set $bot (f32.sub (local.get $py) (f32.const @PLAT_Y)))
  (local.set $t (call $p_t (local.get $d)))
  (!for $k (i32.const 0) (i32.load offset=@(PG_H + BL_NB) (local.get $d))
    (local.set $b (i32.shl (local.get $k) (i32.const 5)))
    (local.set $bx (f32.load offset=@(PG_S + BL_BOX) (local.get $b)))
    (local.set $bz (f32.load offset=@(PG_S + BL_BOX + 4) (local.get $b)))
    (local.set $h (f32.load offset=@(PG_S + BL_BOX + 8) (local.get $b)))
    (if (i32.and (f32.lt (f32.abs (f32.sub (local.get $px) (local.get $bx))) (f32.add (local.get $h) (local.get $rb)))
                 (f32.lt (f32.abs (f32.sub (local.get $pz) (local.get $bz))) (f32.add (local.get $h) (local.get $rb))))
      (then
        (if (f32.lt (local.get $bot) (f32.sub (call $bl_top (local.get $b) (local.get $t)) (f32.const @P_STEP)))
          (then
            ;; the nearest point of the square to its centre
            (local.set $dx (f32.sub (local.get $px) (f32.min (f32.max (local.get $px) (f32.sub (local.get $bx) (local.get $h))) (f32.add (local.get $bx) (local.get $h)))))
            (local.set $dz (f32.sub (local.get $pz) (f32.min (f32.max (local.get $pz) (f32.sub (local.get $bz) (local.get $h))) (f32.add (local.get $bz) (local.get $h)))))
            (local.set $d2 (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))))
            (if (f32.lt (local.get $d2) (f32.mul (local.get $rb) (local.get $rb)))
              (then
                (if (f32.gt (local.get $d2) (f32.const 1e-8))
                  (then
                    (local.set $dist (f32.sqrt (local.get $d2)))
                    (local.set $nx (f32.div (local.get $dx) (local.get $dist)))
                    (local.set $nz (f32.div (local.get $dz) (local.get $dist)))
                    (local.set $over (f32.sub (local.get $rb) (local.get $dist))))
                  (else
                    ;; its centre in the square: out by the nearer side
                    (local.set $ex (f32.sub (local.get $h) (f32.abs (f32.sub (local.get $px) (local.get $bx)))))
                    (local.set $ez (f32.sub (local.get $h) (f32.abs (f32.sub (local.get $pz) (local.get $bz)))))
                    (if (f32.lt (local.get $ex) (local.get $ez))
                      (then
                        (local.set $nx (select (f32.const -1) (f32.const 1) (f32.lt (local.get $px) (local.get $bx))))
                        (local.set $nz (f32.const 0))
                        (local.set $over (f32.add (local.get $ex) (local.get $rb))))
                      (else
                        (local.set $nx (f32.const 0))
                        (local.set $nz (select (f32.const -1) (f32.const 1) (f32.lt (local.get $pz) (local.get $bz))))
                        (local.set $over (f32.add (local.get $ez) (local.get $rb)))))))
                (local.set $px (!madd (local.get $nx) (local.get $over) (local.get $px)))
                (local.set $pz (!madd (local.get $nz) (local.get $over) (local.get $pz)))
                (local.set $vn (!madd (local.get $vx) (local.get $nx) (f32.mul (local.get $vz) (local.get $nz))))
                (if (f32.lt (local.get $vn) (f32.const 0))
                  (then
                    (local.set $vx (f32.sub (local.get $vx) (f32.mul (local.get $nx) (f32.mul (local.get $vn) (f32.const @(1 + BL_BOXE))))))
                    (local.set $vz (f32.sub (local.get $vz) (f32.mul (local.get $nz) (f32.mul (local.get $vn) (f32.const @(1 + BL_BOXE)))))))))))))))
  ;; the wall
  (local.set $cx (f32.load offset=@PG_CX (local.get $d)))
  (local.set $lim (f32.sub (call $bl_rim (local.get $d)) (local.get $rb)))
  (local.set $dx (f32.sub (local.get $px) (local.get $cx)))
  (local.set $dz (f32.sub (local.get $pz) (local.get $cx)))
  (local.set $d2 (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))))
  (if (f32.gt (local.get $d2) (f32.mul (local.get $lim) (local.get $lim)))
    (then
      (local.set $dist (f32.sqrt (local.get $d2)))
      (local.set $nx (f32.div (local.get $dx) (local.get $dist)))
      (local.set $nz (f32.div (local.get $dz) (local.get $dist)))
      (local.set $px (!madd (local.get $nx) (local.get $lim) (local.get $cx)))
      (local.set $pz (!madd (local.get $nz) (local.get $lim) (local.get $cx)))
      (local.set $vn (!madd (local.get $vx) (local.get $nx) (f32.mul (local.get $vz) (local.get $nz))))
      (local.set $ex (select (f32.mul (local.get $vn) (f32.const @(-BL_WALLE))) (local.get $vn) (f32.gt (local.get $vn) (f32.const 0))))
      (local.set $ex (f32.min (local.get $ex) (f32.neg (call $bl_wallv (local.get $d)))))
      (local.set $vx (!madd (local.get $nx) (f32.sub (local.get $ex) (local.get $vn)) (local.get $vx)))
      (local.set $vz (!madd (local.get $nz) (f32.sub (local.get $ex) (local.get $vn)) (local.get $vz)))))
  (!chk (local.get $px) 431 (local.get $p))
  (!chk (local.get $pz) 432 (local.get $p))
  (!chk (local.get $vx) 433 (local.get $p))
  (!chk (local.get $vz) 434 (local.get $p))
  (!put f32 @(PLAYERS + P_PX) (local.get $pb) (local.get $px))
  (!put f32 @(PLAYERS + P_PZ) (local.get $pb) (local.get $pz))
  (!put f32 @(PLAYERS + P_VX) (local.get $pb) (local.get $vx))
  (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (local.get $vz)))

;; ---- the confirmed world: pops, power-ups

;; Ball p loses a balloon to q (255 nobody; how: 0 a stomp, 1 a ram, 2 a
;; blast), unless it's out or guarded; q steals it if q is in with fewer
;; than three, before the last ring. Its FX; out of balloons, out, the KO to
;; q. 1 if it popped.
(func $bl_pop (param $p i32) (param $q i32) (param $how i32) (result i32)
  (local $pb i32) (local $qb i32) (local $t i32) (local $m i32) (local $last i32) (local $lost i32) (local $stole i32) (local $ok i32)
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (if (i32.eqz (call $p_in (local.get $pb))) (then (return (i32.const 0))))
  (local.set $t (call $p_t (i32.const 0)))
  (local.set $m (!at i32 @(PLAYERS + PG_M) (local.get $pb)))
  (local.set $last (i32.shr_u (local.get $m) (i32.const 16)))
  (if (i32.lt_s (local.get $t) (i32.const @BL_GUARD0)) (then (return (i32.const 0))))
  (if (i32.and (i32.ne (local.get $last) (i32.const 0)) (i32.lt_s (i32.sub (i32.add (local.get $t) (i32.const 1)) (local.get $last)) (i32.const @BL_GUARD)))
    (then (return (i32.const 0))))
  (local.set $lost (i32.add (i32.and (local.get $m) (i32.const 3)) (i32.const 1)))
  (!put i32 @(PLAYERS + PG_M) (local.get $pb) (i32.or (local.get $lost) (i32.shl (i32.add (local.get $t) (i32.const 1)) (i32.const 16))))
  (local.set $ok (i32.and (i32.lt_u (local.get $q) (i32.const @NPLAYER)) (i32.ne (local.get $q) (local.get $p))))
  (if (local.get $ok)
    (then
      (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
      (local.set $m (!at i32 @(PLAYERS + PG_M) (local.get $qb)))
      (if (i32.and (i32.and (call $p_in (local.get $qb)) (i32.ne (i32.and (local.get $m) (i32.const 3)) (i32.const 0)))
                   (i32.lt_s (local.get $t) (i32.const @BL_CLOSE1)))
        (then
          (!put i32 @(PLAYERS + PG_M) (local.get $qb) (i32.sub (local.get $m) (i32.const 1)))
          (local.set $stole (i32.const 1024))))))
  (call $fx (i32.const 0) (i32.const @BL_FX_POP) (local.get $p)
            (i32.or (i32.or (i32.and (local.get $q) (i32.const 255)) (i32.shl (local.get $how) (i32.const 8))) (local.get $stole))
            (!at f32 @(PLAYERS + P_PX) (local.get $pb))
            (f32.add (!at f32 @(PLAYERS + P_PY) (local.get $pb)) (!madd (call $b_rad (local.get $pb)) (f32.const 2) (f32.const @BL_FXY)))
            (!at f32 @(PLAYERS + P_PZ) (local.get $pb))
            (f32.convert_i32_u (i32.sub (i32.const @BL_BALLOONS) (local.get $lost))))
  (if (i32.ge_u (local.get $lost) (i32.const @BL_BALLOONS))
    (then
      (!put u8 @(PLAYERS + B_HITBY) (local.get $pb) (select (local.get $q) (i32.const 255) (local.get $ok)))
      (!put u16 @(PLAYERS + B_HITT) (local.get $pb) (select (i32.const @CREDIT_TICKS) (i32.const 0) (local.get $ok)))
      (call $p_out (local.get $p))))
  (i32.const 1))

;; Are balls p and q both in, their skins within BL_TOUCH?
(func $bl_touch (param $p i32) (param $q i32) (result i32)
  (local $pb i32) (local $qb i32) (local $rp f32) (local $rq f32) (local $rs f32) (local $dx f32) (local $dy f32) (local $dz f32)
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
  (if (i32.eqz (i32.and (call $p_in (local.get $pb)) (call $p_in (local.get $qb)))) (then (return (i32.const 0))))
  (local.set $rp (call $b_rad (local.get $pb)))
  (local.set $rq (call $b_rad (local.get $qb)))
  (local.set $rs (f32.add (f32.add (local.get $rp) (local.get $rq)) (f32.const @BL_TOUCH)))
  (local.set $dx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $qb)) (!at f32 @(PLAYERS + P_PX) (local.get $pb))))
  (local.set $dy (f32.sub (f32.add (!at f32 @(PLAYERS + P_PY) (local.get $qb)) (local.get $rq)) (f32.add (!at f32 @(PLAYERS + P_PY) (local.get $pb)) (local.get $rp))))
  (local.set $dz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $qb)) (!at f32 @(PLAYERS + P_PZ) (local.get $pb))))
  (f32.lt (!dot3 (local.get $dx) (local.get $dy) (local.get $dz) (local.get $dx) (local.get $dy) (local.get $dz)) (f32.mul (local.get $rs) (local.get $rs))))

;; This tick's blasts, in the order bumper set them off, into BL_BL: each
;; ball's POW and SPRING landing as it moved, in slot order (told from its
;; record as the last tick ended: its shots on with a POW held, PF_STOMP
;; gone), then the rockets in PROJ's slot order, told from PROJ's rockets as
;; the last tick ended: one there short of its fizzle and gone now went off;
;; a slot free then took the next ROCKET used this tick, in slot order, as
;; $b_use fills them, and is free now if that one went off at once. The
;; copy of PROJ is brought up to date as it goes. Returns how many.
(func $bl_blasts (result i32)
  (local $n i32) (local $nu i32) (local $u i32) (local $o i32) (local $ob i32) (local $r i32) (local $fl i32) (local $item i32)
  (local $j i32) (local $jb i32) (local $sb i32) (local $live i32) (local $h i32) (local $hi i32)
  (local $rad f32) (local $s f32) (local $c f32)
  (!for $o (i32.const 0) (i32.const @NPLAYER)
    (local.set $ob (i32.shl (local.get $o) (i32.const 6)))
    (local.set $r (i32.add (i32.const @(PG_BIG + BL_REC)) (i32.shl (local.get $o) (i32.const 5))))
    (local.set $fl (!at u8 @(PLAYERS + P_FL) (local.get $ob)))
    ;; (a ball that left, or is out, moved nowhere this tick)
    (if (i32.eq (i32.and (local.get $fl) (i32.const @(PF_LIVE | PF_DEAD))) (i32.const @PF_LIVE))
      (then
        (if (i32.ne (!at u16 @(PLAYERS + P_SHOTS) (local.get $ob)) (i32.load16_u offset=24 (local.get $r)))
          (then
            (local.set $item (i32.load8_u offset=26 (local.get $r)))
            ;; a POW at its centre as its move began, its radius then the one it has now
            (if (i32.eq (local.get $item) (i32.const @PU_POW))
              (then
                (call $bl_add (local.get $n) (local.get $o) (i32.const @BL_BPOW) (f32.load offset=12 (local.get $r))
                              (f32.add (f32.load offset=16 (local.get $r)) (call $b_rad (local.get $ob))) (f32.load offset=20 (local.get $r)))
                (!inc $n)))
            (if (i32.eq (local.get $item) (i32.const @PU_ROCKET))
              (then (!st u8 @(PG_BIG + BL_RU) (local.get $nu) (local.get $o)) (!inc $nu)))))
        ;; a landing where it stands now: its height exact, across by any push or bump since
        (if (i32.and (i32.ne (i32.and (i32.load8_u offset=27 (local.get $r)) (i32.const @PF_STOMP)) (i32.const 0))
                     (i32.eqz (i32.and (local.get $fl) (i32.const @PF_STOMP))))
          (then
            (call $bl_add (local.get $n) (local.get $o) (i32.const @BL_BSPRING) (!at f32 @(PLAYERS + P_PX) (local.get $ob))
                          (!at f32 @(PLAYERS + P_PY) (local.get $ob)) (!at f32 @(PLAYERS + P_PZ) (local.get $ob)))
            (!inc $n))))))
  (local.set $h (i32.load (i32.const @(PG_BIG + BL_NJ))))
  (block $done
    (loop $more
      (br_if $done (i32.ge_u (local.get $j) (i32.const @NPROJ)))
      (br_if $done (i32.and (i32.ge_u (local.get $j) (local.get $h)) (i32.ge_u (local.get $u) (local.get $nu))))
      (local.set $jb (i32.shl (local.get $j) (i32.const 5)))
      (local.set $sb (i32.add (i32.const @(PG_BIG + BL_PJ)) (local.get $jb)))
      (local.set $live (!at u8 @(PROJ + J_KIND) (local.get $jb)))
      (if (i32.load8_u offset=@J_KIND (local.get $sb))
        (then
          (if (i32.and (i32.eqz (local.get $live)) (i32.lt_u (i32.load16_u offset=@J_AGE (local.get $sb)) (i32.const 375)))
            (then
              (call $bl_rocket (local.get $n) (i32.load8_u offset=@J_OWNER (local.get $sb))
                               (f32.load offset=@J_PX (local.get $sb)) (f32.load offset=@J_PY (local.get $sb)) (f32.load offset=@J_PZ (local.get $sb))
                               (f32.load offset=@J_VX (local.get $sb)) (f32.load offset=@J_VZ (local.get $sb)))
              (!inc $n))))
        (else
          (if (i32.lt_u (local.get $u) (local.get $nu))
            (then
              (local.set $o (!ld u8 @(PG_BIG + BL_RU) (local.get $u)))
              (!inc $u)
              (if (i32.eqz (local.get $live))
                (then
                  ;; fired as $b_use fires it, from where it stood as the last tick ended, the way it faces
                  (local.set $ob (i32.shl (local.get $o) (i32.const 6)))
                  (local.set $r (i32.add (i32.const @(PG_BIG + BL_REC)) (i32.shl (local.get $o) (i32.const 5))))
                  (local.set $rad (call $b_rad (local.get $ob)))
                  (call $sincos (!at i32 @(PLAYERS + P_IN) (local.get $ob)))
                  (local.set $c) (local.set $s)
                  (call $bl_rocket (local.get $n) (local.get $o)
                                   (!madd (local.get $c) (f32.add (local.get $rad) (f32.const 0.8)) (f32.load offset=12 (local.get $r)))
                                   (f32.add (f32.load offset=16 (local.get $r)) (local.get $rad))
                                   (!madd (local.get $s) (f32.add (local.get $rad) (f32.const 0.8)) (f32.load offset=20 (local.get $r)))
                                   (f32.mul (local.get $c) (f32.const @ROCKET_BV)) (f32.mul (local.get $s) (f32.const @ROCKET_BV)))
                  (!inc $n)))))))
      (if (local.get $live)
        (then
          (memory.copy (local.get $sb) (i32.add (i32.const @PROJ) (local.get $jb)) (i32.const @JSIZE))
          (local.set $hi (i32.add (local.get $j) (i32.const 1))))
        (else (i32.store8 offset=@J_KIND (local.get $sb) (i32.const 0))))
      (!inc $j)
      (br $more)))
  (i32.store (i32.const @(PG_BIG + BL_NJ)) (local.get $hi))
  (local.get $n))

;; Blast n of the tick's: o's, of a kind (BL_B*), at (x, y, z).
(func $bl_add (param $n i32) (param $o i32) (param $kind i32) (param $x f32) (param $y f32) (param $z f32)
  (local $a i32)
  (local.set $a (i32.add (i32.const @(PG_BIG + BL_BL)) (i32.shl (local.get $n) (i32.const 4))))
  (f32.store (local.get $a) (local.get $x))
  (f32.store offset=4 (local.get $a) (local.get $y))
  (f32.store offset=8 (local.get $a) (local.get $z))
  (i32.store8 offset=12 (local.get $a) (local.get $o))
  (i32.store8 offset=13 (local.get $a) (local.get $kind)))

;; Is there a ball in, not o, for a rocket of o's at (x, y, z) to meet, as
;; $b_rockets measures?
(func $bl_meets (param $o i32) (param $x f32) (param $y f32) (param $z f32) (result i32)
  (local $q i32) (local $qb i32) (local $rq f32) (local $dx f32) (local $dy f32) (local $dz f32)
  (!for $q (i32.const 0) (i32.const @NPLAYER)
    (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
    (if (i32.and (call $b_in (local.get $qb)) (i32.ne (local.get $q) (local.get $o)))
      (then
        (local.set $rq (call $b_rad (local.get $qb)))
        (local.set $dx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $qb)) (local.get $x)))
        (local.set $dy (f32.sub (f32.add (!at f32 @(PLAYERS + P_PY) (local.get $qb)) (local.get $rq)) (local.get $y)))
        (local.set $dz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $qb)) (local.get $z)))
        (local.set $rq (f32.add (local.get $rq) (f32.const 0.35)))
        (if (f32.lt (!dot3 (local.get $dx) (local.get $dy) (local.get $dz) (local.get $dx) (local.get $dy) (local.get $dz)) (f32.mul (local.get $rq) (local.get $rq)))
          (then (return (i32.const 1)))))))
  (i32.const 0))

;; Blast n of the tick's: a rocket of o's that went off, from where
;; $b_rockets took it (x, y, z), flying at (vx, vz): at its first half step
;; if a ball is there to meet it (where the balls stand now, which is where
;; it found them but for the bumps' separating), else at its second.
(func $bl_rocket (param $n i32) (param $o i32) (param $x f32) (param $y f32) (param $z f32) (param $vx f32) (param $vz f32)
  (local.set $x (!madd (local.get $vx) (f32.const @(DT / 2)) (local.get $x)))
  (local.set $z (!madd (local.get $vz) (f32.const @(DT / 2)) (local.get $z)))
  (if (i32.eqz (call $bl_meets (local.get $o) (local.get $x) (local.get $y) (local.get $z)))
    (then
      (local.set $x (!madd (local.get $vx) (f32.const @(DT / 2)) (local.get $x)))
      (local.set $z (!madd (local.get $vz) (f32.const @(DT / 2)) (local.get $z)))))
  (call $bl_add (local.get $n) (local.get $o) (i32.const @BL_BROCKET) (local.get $x) (local.get $y) (local.get $z)))

;; Did blast k of the tick's reach ball p: p in, not its owner (nor, in a
;; team round without PGF_MATES, its mate), its centre within the blast's
;; radius of where it went off, as $b_blast measures, and where it found p.
;; A POW or a landing goes off in its owner's move, before a ball later by
;; slot has moved: that one is judged where it stood as the last tick ended,
;; exactly; any other where it stands now, which is where the blast found it
;; but for the bumps' separating.
(func $bl_reach (param $k i32) (param $p i32) (result i32)
  (local $a i32) (local $o i32) (local $kind i32) (local $pb i32) (local $r i32)
  (local $rq f32) (local $rr f32) (local $px f32) (local $py f32) (local $pz f32) (local $dx f32) (local $dy f32) (local $dz f32) (local $hd f32)
  (local.set $a (i32.add (i32.const @(PG_BIG + BL_BL)) (i32.shl (local.get $k) (i32.const 4))))
  (local.set $o (i32.load8_u offset=12 (local.get $a)))
  (local.set $kind (i32.load8_u offset=13 (local.get $a)))
  (if (i32.eq (local.get $o) (local.get $p)) (then (return (i32.const 0))))
  (if (i32.and (i32.eq (i32.and (i32.load (i32.const @PG_FLAGS)) (i32.const @(PGF_TEAMS | PGF_MATES))) (i32.const @PGF_TEAMS))
               (call $p_mates (local.get $p) (local.get $o)))
    (then (return (i32.const 0))))
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (if (i32.and (i32.ne (local.get $kind) (i32.const @BL_BROCKET)) (i32.gt_u (local.get $p) (local.get $o)))
    (then
      (local.set $r (i32.add (i32.const @(PG_BIG + BL_REC)) (i32.shl (local.get $p) (i32.const 5))))
      (if (i32.ne (i32.and (i32.load8_u offset=27 (local.get $r)) (i32.const @(PF_LIVE | PF_DEAD | PF_FALL))) (i32.const @PF_LIVE))
        (then (return (i32.const 0))))
      (local.set $rq (f32.load offset=28 (local.get $r)))
      (local.set $px (f32.load offset=12 (local.get $r)))
      (local.set $py (f32.load offset=16 (local.get $r)))
      (local.set $pz (f32.load offset=20 (local.get $r))))
    (else
      (if (i32.eqz (call $b_in (local.get $pb))) (then (return (i32.const 0))))
      (local.set $rq (call $b_rad (local.get $pb)))
      (local.set $px (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
      (local.set $py (!at f32 @(PLAYERS + P_PY) (local.get $pb)))
      (local.set $pz (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))))
  (local.set $rr (select (f32.const @POW_R) (select (f32.const @STOMP_R) (f32.const @BROCKET_R) (i32.eq (local.get $kind) (i32.const @BL_BSPRING)))
                         (i32.eq (local.get $kind) (i32.const @BL_BPOW))))
  (local.set $dx (f32.sub (local.get $px) (f32.load (local.get $a))))
  (local.set $dy (f32.sub (f32.add (local.get $py) (local.get $rq)) (f32.load offset=4 (local.get $a))))
  (local.set $dz (f32.sub (local.get $pz) (f32.load offset=8 (local.get $a))))
  (local.set $hd (f32.add (f32.mul (local.get $dx) (local.get $dx)) (f32.mul (local.get $dz) (local.get $dz))))
  (f32.lt (!madd (local.get $dy) (local.get $dy) (local.get $hd)) (f32.mul (local.get $rr) (local.get $rr))))

;; Did a blast of o's, of the tick's first nb, reach ball p?
(func $bl_by (param $o i32) (param $p i32) (param $nb i32) (result i32)
  (local $k i32)
  (!for $k (i32.const 0) (local.get $nb)
    (if (i32.eq (i32.load8_u offset=@(PG_BIG + BL_BL + 12) (i32.shl (local.get $k) (i32.const 4))) (local.get $o))
      (then (if (call $bl_reach (local.get $k) (local.get $p)) (then (return (i32.const 1)))))))
  (i32.const 0))

;; Who blasted ball p, hit this tick (255 nobody): the hitter bumper kept, if
;; a blast of its reached p, or it blew up this tick and isn't touching p
;; (bumper's word that its hit was a blast); else, its hit a bump that came
;; after, the last blast of the tick's nb to reach p.
(func $bl_blasted (param $p i32) (param $nb i32) (result i32)
  (local $h i32) (local $k i32) (local $blew i32)
  (if (i32.eqz (local.get $nb)) (then (return (i32.const 255))))
  (local.set $h (!at u8 @(PLAYERS + B_HITBY) (i32.shl (local.get $p) (i32.const 6))))
  (if (i32.and (i32.lt_u (local.get $h) (i32.const @NPLAYER)) (i32.ne (local.get $h) (local.get $p)))
    (then
      (!for $k (i32.const 0) (local.get $nb)
        (if (i32.eq (i32.load8_u offset=@(PG_BIG + BL_BL + 12) (i32.shl (local.get $k) (i32.const 4))) (local.get $h))
          (then
            (if (call $bl_reach (local.get $k) (local.get $p)) (then (return (local.get $h))))
            (local.set $blew (i32.const 1)))))
      (if (i32.and (local.get $blew) (i32.eqz (call $bl_touch (local.get $p) (local.get $h)))) (then (return (local.get $h))))))
  (local.set $k (local.get $nb))
  (block $none
    (loop $back
      (br_if $none (i32.eqz (local.get $k)))
      (local.set $k (i32.sub (local.get $k) (i32.const 1)))
      (if (call $bl_reach (local.get $k) (local.get $p))
        (then (return (i32.load8_u offset=@(PG_BIG + BL_BL + 12) (i32.shl (local.get $k) (i32.const 4))))))
      (br $back)))
  (i32.const 255))

;; Ball s came down on ball v: v loses one to it, and s bounces up (guarded or not).
(func $bl_stomp (param $s i32) (param $v i32)
  (local $sb i32)
  (local.set $sb (i32.shl (local.get $s) (i32.const 6)))
  (drop (call $bl_pop (local.get $v) (local.get $s) (i32.const 0)))
  (!put f32 @(PLAYERS + P_VY) (local.get $sb) (f32.max (!at f32 @(PLAYERS + P_VY) (local.get $sb)) (f32.const @BL_BOUNCE)))
  (!put u8 @(PLAYERS + P_FL) (local.get $sb) (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $sb)) (i32.const @(255 ^ PF_GROUND)))))

;; Balls i and j bumped this tick: how fast each came into the other along
;; the line between their centres, from their speeds as the last tick ended
;; (closing, or nothing). One's bottom over the other's centre, falling, is
;; a stomp; else the faster in, past BL_RAM (BL_RAMF in the last ring;
;; BL_RAMM for a MEGA ball into one that isn't), rams the other.
(func $bl_meet (param $i i32) (param $j i32)
  (local $ib i32) (local $jb i32) (local $ri i32) (local $rj i32) (local $radi f32) (local $raj f32)
  (local $dx f32) (local $dy f32) (local $dz f32) (local $dist f32) (local $si f32) (local $sj f32) (local $ti f32) (local $tj f32)
  (local.set $ib (i32.shl (local.get $i) (i32.const 6)))
  (local.set $jb (i32.shl (local.get $j) (i32.const 6)))
  (if (i32.eqz (i32.and (call $p_in (local.get $ib)) (call $p_in (local.get $jb)))) (then (return)))
  (local.set $ri (i32.add (i32.const @(PG_BIG + BL_REC)) (i32.shl (local.get $i) (i32.const 5))))
  (local.set $rj (i32.add (i32.const @(PG_BIG + BL_REC)) (i32.shl (local.get $j) (i32.const 5))))
  (local.set $radi (call $b_rad (local.get $ib)))
  (local.set $raj (call $b_rad (local.get $jb)))
  (local.set $dx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $jb)) (!at f32 @(PLAYERS + P_PX) (local.get $ib))))
  (local.set $dy (f32.sub (f32.add (!at f32 @(PLAYERS + P_PY) (local.get $jb)) (local.get $raj)) (f32.add (!at f32 @(PLAYERS + P_PY) (local.get $ib)) (local.get $radi))))
  (local.set $dz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $jb)) (!at f32 @(PLAYERS + P_PZ) (local.get $ib))))
  (local.set $dist (f32.sqrt (!dot3 (local.get $dx) (local.get $dy) (local.get $dz) (local.get $dx) (local.get $dy) (local.get $dz))))
  (if (f32.lt (local.get $dist) (f32.const 0.001)) (then (return)))
  (local.set $si (f32.div (!dot3 (f32.load (local.get $ri)) (f32.load offset=4 (local.get $ri)) (f32.load offset=8 (local.get $ri))
                                 (local.get $dx) (local.get $dy) (local.get $dz)) (local.get $dist)))
  (local.set $sj (f32.div (f32.neg (!dot3 (f32.load (local.get $rj)) (f32.load offset=4 (local.get $rj)) (f32.load offset=8 (local.get $rj))
                                          (local.get $dx) (local.get $dy) (local.get $dz))) (local.get $dist)))
  (!chk (local.get $si) 435 (local.get $i))
  (!chk (local.get $sj) 436 (local.get $j))
  (if (f32.le (f32.add (local.get $si) (local.get $sj)) (f32.const 0)) (then (return)))
  (if (i32.and (f32.ge (!at f32 @(PLAYERS + P_PY) (local.get $ib)) (f32.add (!at f32 @(PLAYERS + P_PY) (local.get $jb)) (local.get $raj)))
               (f32.lt (f32.load offset=4 (local.get $ri)) (f32.const @(-BL_FALL))))
    (then (call $bl_stomp (local.get $i) (local.get $j)) (return)))
  (if (i32.and (f32.ge (!at f32 @(PLAYERS + P_PY) (local.get $jb)) (f32.add (!at f32 @(PLAYERS + P_PY) (local.get $ib)) (local.get $radi)))
               (f32.lt (f32.load offset=4 (local.get $rj)) (f32.const @(-BL_FALL))))
    (then (call $bl_stomp (local.get $j) (local.get $i)) (return)))
  (local.set $ti (select (f32.const @BL_RAMF) (f32.const @BL_RAM) (i32.ge_s (call $p_t (i32.const 0)) (i32.const @BL_CLOSE1))))
  (local.set $tj (local.get $ti))
  (if (i32.and (i32.ne (!at u16 @(PLAYERS + B_MEGA) (local.get $ib)) (i32.const 0)) (i32.eqz (!at u16 @(PLAYERS + B_MEGA) (local.get $jb))))
    (then (local.set $ti (f32.const @BL_RAMM))))
  (if (i32.and (i32.ne (!at u16 @(PLAYERS + B_MEGA) (local.get $jb)) (i32.const 0)) (i32.eqz (!at u16 @(PLAYERS + B_MEGA) (local.get $ib))))
    (then (local.set $tj (f32.const @BL_RAMM))))
  (if (i32.and (f32.gt (local.get $si) (local.get $ti)) (f32.gt (local.get $si) (local.get $sj)))
    (then (drop (call $bl_pop (local.get $j) (local.get $i) (i32.const 1))) (return)))
  (if (i32.and (f32.gt (local.get $sj) (local.get $tj)) (f32.gt (local.get $sj) (local.get $si)))
    (then (drop (call $bl_pop (local.get $i) (local.get $j) (i32.const 1))))))

;; What a power-up from the sky is, from the PRNG (BL_P* of each hundred).
(func $bl_item (result i32)
  (local $h i32)
  (local.set $h (i32.rem_u (call $rand) (i32.const 100)))
  (if (i32.lt_u (local.get $h) (i32.const @BL_PDASH)) (then (return (i32.const @PU_DASH))))
  (if (i32.lt_u (local.get $h) (i32.const @(BL_PDASH + BL_PROCKET))) (then (return (i32.const @PU_ROCKET))))
  (if (i32.lt_u (local.get $h) (i32.const @(BL_PDASH + BL_PROCKET + BL_PSPRING))) (then (return (i32.const @PU_SPRING))))
  (if (i32.lt_u (local.get $h) (i32.const @(BL_PDASH + BL_PROCKET + BL_PSPRING + BL_PPOW))) (then (return (i32.const @PU_POW))))
  (i32.const @PU_MEGA))

;; A power-up in a free slot, high over a random spot inside the wall.
(func $bl_drop
  (local $k i32) (local $o i32) (local $rad f32) (local $s f32) (local $c f32) (local $x f32) (local $z f32) (local $cx f32)
  (block $found
    (!for $k (i32.const 0) (i32.const @BL_NORB)
      (local.set $o (i32.add (i32.const @(PG_S + BL_ORBS)) (i32.shl (local.get $k) (i32.const 4))))
      (br_if $found (i32.eqz (i32.load8_u offset=12 (local.get $o)))))
    (return))
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (local.set $rad (f32.mul (f32.mul (call $bl_rim (i32.const 0)) (f32.const 0.8)) (f32.sqrt (call $p_unit))))
  (call $sincos (call $rand))
  (local.set $c) (local.set $s)
  (local.set $x (!madd (local.get $c) (local.get $rad) (local.get $cx)))
  (local.set $z (!madd (local.get $s) (local.get $rad) (local.get $cx)))
  (f32.store (local.get $o) (local.get $x))
  (f32.store offset=4 (local.get $o) (f32.const @(+PLAT_Y + ORB_Y)))
  (f32.store offset=8 (local.get $o) (local.get $z))
  (i32.store8 offset=12 (local.get $o) (call $bl_item))
  (i32.store8 offset=13 (local.get $o) (i32.const 1))
  (i32.store16 offset=14 (local.get $o) (i32.const 0))
  (call $fx (i32.const 0) (i32.const @FX_DROP) (i32.const 0) (local.get $k) (local.get $x) (f32.const @PLAT_Y) (local.get $z)
            (f32.convert_i32_u (i32.load8_u offset=12 (local.get $o)))))

;; The power-ups: drops on the clock (twice as often in the last ring); each falling at ORB_FALL onto the
;; floor or the box under it, lying there BL_ORBLIFE (falling again if the
;; box sinks from under it), gone outside the wall; taken by the first ball
;; in, by slot, holding nothing, that rolls into it.
(func $bl_orbs (param $t i32)
  (local $m i32) (local $k i32) (local $o i32) (local $p i32) (local $pb i32) (local $life i32)
  (local $x f32) (local $y f32) (local $z f32) (local $g f32) (local $rad f32) (local $dx f32) (local $dy f32) (local $dz f32) (local $lim f32) (local $rim f32) (local $cx f32)
  (if (i32.ge_u (local.get $t) (i32.load (i32.const @(PG_H + BL_DROP))))
    (then
      (i32.store (i32.const @(PG_H + BL_DROP)) (i32.add (local.get $t) (select (i32.const @BL_DROPGAPF) (i32.const @BL_DROPGAP) (i32.ge_s (local.get $t) (i32.const @BL_CLOSE1)))))
      (!for $m (i32.const 0) (i32.add (i32.const 1) (i32.div_u (i32.load (i32.const @BH_LEFT)) (i32.const @BL_DROPN)))
        (call $bl_drop))))
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (local.set $rim (f32.sub (call $bl_rim (i32.const 0)) (f32.const 0.5)))
  (!for $k (i32.const 0) (i32.const @BL_NORB)
    (local.set $o (i32.add (i32.const @(PG_S + BL_ORBS)) (i32.shl (local.get $k) (i32.const 4))))
    (if (i32.load8_u offset=12 (local.get $o))
      (then (block $gone
        (local.set $x (f32.load (local.get $o)))
        (local.set $y (f32.load offset=4 (local.get $o)))
        (local.set $z (f32.load offset=8 (local.get $o)))
        (local.set $dx (f32.sub (local.get $x) (local.get $cx)))
        (local.set $dz (f32.sub (local.get $z) (local.get $cx)))
        (if (f32.gt (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))) (f32.mul (local.get $rim) (local.get $rim)))
          (then (memory.fill (local.get $o) (i32.const 0) (i32.const 16)) (br $gone)))
        (local.set $g (call $bl_ground (i32.const 0) (local.get $x) (local.get $y) (local.get $z)))
        (if (i32.eq (i32.load8_u offset=13 (local.get $o)) (i32.const 1))
          (then
            (local.set $y (f32.sub (local.get $y) (f32.const @ORB_FALL)))
            (if (f32.le (local.get $y) (local.get $g))
              (then
                (local.set $y (local.get $g))
                (i32.store8 offset=13 (local.get $o) (i32.const 2))
                (i32.store16 offset=14 (local.get $o) (i32.const @BL_ORBLIFE))))
            (f32.store offset=4 (local.get $o) (local.get $y)))
          (else
            (local.set $life (i32.sub (i32.load16_u offset=14 (local.get $o)) (i32.const 1)))
            (i32.store16 offset=14 (local.get $o) (local.get $life))
            (if (i32.eqz (local.get $life)) (then (memory.fill (local.get $o) (i32.const 0) (i32.const 16)) (br $gone)))
            (if (f32.lt (local.get $g) (local.get $y)) (then (i32.store8 offset=13 (local.get $o) (i32.const 1))))))
        (local.set $y (f32.add (local.get $y) (f32.const 0.6)))
        (!for $p (i32.const 0) (i32.const @NPLAYER)
          (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
          (if (i32.and (call $p_in (local.get $pb)) (i32.eqz (!at u8 @(PLAYERS + B_ITEM) (local.get $pb))))
            (then
              (local.set $rad (call $b_rad (local.get $pb)))
              (local.set $dx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (local.get $x)))
              (local.set $dy (f32.sub (f32.add (!at f32 @(PLAYERS + P_PY) (local.get $pb)) (local.get $rad)) (local.get $y)))
              (local.set $dz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $pb)) (local.get $z)))
              (local.set $lim (f32.add (local.get $rad) (f32.const @ORB_R)))
              (if (f32.lt (!dot3 (local.get $dx) (local.get $dy) (local.get $dz) (local.get $dx) (local.get $dy) (local.get $dz)) (f32.mul (local.get $lim) (local.get $lim)))
                (then
                  (!put u8 @(PLAYERS + B_ITEM) (local.get $pb) (i32.load8_u offset=12 (local.get $o)))
                  (call $fx (i32.const 0) (i32.const @FX_PICKUP) (local.get $p) (local.get $k) (local.get $x) (local.get $y) (local.get $z)
                            (f32.convert_i32_u (i32.load8_u offset=12 (local.get $o))))
                  (memory.fill (local.get $o) (i32.const 0) (i32.const 16))
                  (br $gone)))))))))))

;; Once a tick in play, after the bumps: the wall's call; the tick's blasts;
;; the balls in hit this tick (bumper's fresh B_HITT), in slot order: each
;; blasted loses one, then every pair of them touching, neither in a blast
;; of the other's, meets; the power-ups; then every slot's speed, place,
;; shots, power-up, flags and radius kept for the next.
(func $bl_tick
  (local $t i32) (local $p i32) (local $q i32) (local $pb i32) (local $nf i32) (local $nb i32) (local $a i32) (local $b i32) (local $r i32)
  (local.set $t (call $p_t (i32.const 0)))
  (if (i32.eq (local.get $t) (i32.const @BL_CLOSE0))
    (then (call $fx (i32.const 0) (i32.const @BL_FX_CLOSE) (i32.const 255) (i32.const 0)
                    (f32.load (i32.const @PG_CX)) (f32.const @PLAT_Y) (f32.load (i32.const @PG_CX)) (f32.const @BL_RMIN))))
  (local.set $nb (call $bl_blasts))
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
    (if (i32.and (call $p_in (local.get $pb)) (i32.eq (!at u16 @(PLAYERS + B_HITT) (local.get $pb)) (i32.const @CREDIT_TICKS)))
      (then (!st u8 @B_SCR (local.get $nf) (local.get $p)) (!inc $nf))))
  (!for $a (i32.const 0) (local.get $nf)
    (local.set $p (!ld u8 @B_SCR (local.get $a)))
    (local.set $q (call $bl_blasted (local.get $p) (local.get $nb)))
    (if (i32.ne (local.get $q) (i32.const 255)) (then (drop (call $bl_pop (local.get $p) (local.get $q) (i32.const 2))))))
  (!for $a (i32.const 0) (local.get $nf)
    (local.set $p (!ld u8 @B_SCR (local.get $a)))
    (!for $b (i32.add (local.get $a) (i32.const 1)) (local.get $nf)
      (local.set $q (!ld u8 @B_SCR (local.get $b)))
      (if (call $bl_touch (local.get $p) (local.get $q))
        (then
          (if (i32.eqz (i32.or (call $bl_by (local.get $p) (local.get $q) (local.get $nb)) (call $bl_by (local.get $q) (local.get $p) (local.get $nb))))
            (then (call $bl_meet (local.get $p) (local.get $q))))))))
  (call $bl_orbs (local.get $t))
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
    (local.set $r (i32.add (i32.const @(PG_BIG + BL_REC)) (i32.shl (local.get $p) (i32.const 5))))
    (f32.store (local.get $r) (!at f32 @(PLAYERS + P_VX) (local.get $pb)))
    (f32.store offset=4 (local.get $r) (!at f32 @(PLAYERS + P_VY) (local.get $pb)))
    (f32.store offset=8 (local.get $r) (!at f32 @(PLAYERS + P_VZ) (local.get $pb)))
    (f32.store offset=12 (local.get $r) (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
    (f32.store offset=16 (local.get $r) (!at f32 @(PLAYERS + P_PY) (local.get $pb)))
    (f32.store offset=20 (local.get $r) (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
    (i32.store16 offset=24 (local.get $r) (!at u16 @(PLAYERS + P_SHOTS) (local.get $pb)))
    (i32.store8 offset=26 (local.get $r) (!at u8 @(PLAYERS + B_ITEM) (local.get $pb)))
    (i32.store8 offset=27 (local.get $r) (!at u8 @(PLAYERS + P_FL) (local.get $pb)))
    (f32.store offset=28 (local.get $r) (call $b_rad (local.get $pb)))))

(func $bl_over (result i32) (i32.const 0))
(func $bl_out (param $p i32))
