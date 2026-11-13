;; LONG JUMP: runways side by side along +x over the sea, one for every
;; LJ_PER balls in (LJ_NLMIN to LJ_NLMAX), LJ_PITCH apart, railed. A ball
;; starts on its runway's deck, rolls down the slope (LJ_PULL down it, and
;; LJ_PADA more over each boost pad, left then right, while under LJ_PADV)
;; onto the take-off board and flies off its edge, LJ_BH over the sea's
;; islands. The hop key on the board's last LJ_HOPZ lifts it, LJ_LIFT0 at
;; the zone's start to LJ_LIFT1 at the edge; past the edge it does nothing.
;; In the air the wind pushes it along x, a level from the seed every
;; LJ_WSEG turning into the next over its last LJ_WTURN. LJ_NI islands of
;; sand lie on each runway's line, smaller the farther out: a ball that
;; comes down on one (its centre over it) is held there and has jumped from
;; the edge to where it is, in cm; one LJ_WET under their tops is in the
;; sea, a foul. LJ_BACK later it is on its runway's start deck again. Its
;; best jump is its PG_SCORE (PK_SCORE).
;;
;; No bumps, and nothing a ball meets moves: the stage is PG_H's, fixed at
;; setup, the wind the tick's and the seed's, a ball's jump its own PG_M,
;; P_REFIRE and PG_SCORE. So push, on either bank, plays the whole game for
;; its ball, and the prediction is exact from the deck to the sand and back.
;; tick only keeps what the page shows (PG_S: where each best landed, the
;; jumps and fouls) and calls the wind's turns.

;; Runway l's middle, z, on bank d.
(func $lj_zc (param $d i32) (param $l i32) (result f32)
  (!madd (f32.convert_i32_s (local.get $l)) (f32.const @LJ_PITCH) (f32.add (f32.load offset=@(PG_H + LJ_ZL) (local.get $d)) (f32.const @(LJ_PITCH / 2)))))

;; The runway whose strip holds z on bank d (the nearest, off the stage).
(func $lj_lane (param $d i32) (param $z f32) (result i32)
  (local $l i32) (local $nl i32)
  (local.set $nl (i32.load offset=@(PG_H + LJ_NL) (local.get $d)))
  (local.set $l (i32.trunc_sat_f32_s (f32.floor (f32.div (f32.sub (local.get $z) (f32.load offset=@(PG_H + LJ_ZL) (local.get $d))) (f32.const @LJ_PITCH)))))
  (if (i32.ge_s (local.get $l) (local.get $nl)) (then (local.set $l (i32.sub (local.get $nl) (i32.const 1)))))
  (if (i32.lt_s (local.get $l) (i32.const 0)) (then (local.set $l (i32.const 0))))
  (local.get $l))

;; The runway's top at x on bank d: the deck, the slope, the board.
(func $lj_top (param $d i32) (param $x f32) (result f32)
  (local $s f32)
  (local.set $s (f32.sub (local.get $x) (f32.load offset=@(PG_H + LJ_XS) (local.get $d))))
  (if (f32.le (local.get $s) (f32.const 0)) (then (return (f32.const @(+PLAT_Y + LJ_BH + LJ_RISE)))))
  (if (f32.ge (local.get $s) (f32.const @LJ_SLOPE)) (then (return (f32.const @(+PLAT_Y + LJ_BH)))))
  (!madd (local.get $s) (f32.const @(-LJ_RISE / LJ_SLOPE)) (f32.const @(+PLAT_Y + LJ_BH + LJ_RISE))))

;; The wind on tick t into play, m/s^2 along x: segment t / LJ_WSEG's level,
;; turning evenly into the next's over its last LJ_WTURN.
(func $lj_level (param $k i32) (result f32)
  (f32.mul (f32.convert_i32_s (i32.sub (i32.rem_u (call $p_seed (i32.add (i32.const @LJ_KWIND) (local.get $k))) (i32.const @(2 * LJ_WMAX + 1))) (i32.const @LJ_WMAX)))
           (f32.const @LJ_WSTEP)))
(func $lj_wind (param $t i32) (result f32)
  (local $k i32) (local $f i32) (local $a f32) (local $b f32)
  (if (i32.lt_s (local.get $t) (i32.const 0)) (then (local.set $t (i32.const 0))))
  (local.set $k (i32.div_u (local.get $t) (i32.const @LJ_WSEG)))
  (local.set $f (i32.sub (i32.rem_u (local.get $t) (i32.const @LJ_WSEG)) (i32.const @(LJ_WSEG - LJ_WTURN))))
  (local.set $a (call $lj_level (local.get $k)))
  (if (i32.le_s (local.get $f) (i32.const 0)) (then (return (local.get $a))))
  (local.set $b (call $lj_level (i32.add (local.get $k) (i32.const 1))))
  (!madd (f32.sub (local.get $b) (local.get $a)) (f32.mul (f32.convert_i32_s (local.get $f)) (f32.const @(1 / LJ_WTURN))) (local.get $a)))

;; What the keys of word in pushed a rolling ball along x this tick, as
;; $b_move worked it: the wish's x, a unit's, times the roll's push.
(func $lj_keyx (param $in i32) (result f32)
  (local $s f32) (local $c f32) (local $fwd f32) (local $side f32) (local $wx f32) (local $wz f32) (local $len f32)
  (call $sincos (local.get $in))
  (local.set $c) (local.set $s)
  (local.set $fwd (f32.convert_i32_s (i32.sub (i32.and (i32.shr_u (local.get $in) (i32.const 24)) (i32.const 1))
                                              (i32.and (i32.shr_u (local.get $in) (i32.const 25)) (i32.const 1)))))
  (local.set $side (f32.convert_i32_s (i32.sub (i32.and (i32.shr_u (local.get $in) (i32.const 27)) (i32.const 1))
                                               (i32.and (i32.shr_u (local.get $in) (i32.const 26)) (i32.const 1)))))
  (local.set $wx (f32.sub (f32.mul (local.get $c) (local.get $fwd)) (f32.mul (local.get $s) (local.get $side))))
  (local.set $wz (f32.add (f32.mul (local.get $s) (local.get $fwd)) (f32.mul (local.get $c) (local.get $side))))
  (local.set $len (f32.sqrt (f32.add (f32.mul (local.get $wx) (local.get $wx)) (f32.mul (local.get $wz) (local.get $wz)))))
  (if (f32.le (local.get $len) (f32.const 0)) (then (return (f32.const 0))))
  (f32.mul (f32.div (local.get $wx) (local.get $len)) (f32.const @B_ACC_DT)))

;; ---- the stage

;; The runways for n balls, centred on PG_CX across and (deck to the last
;; island) along; the islands; the knobs: scored, nobody down (the sea's bed
;; holds a sunk ball, push brings it back), a slick roll, no hop but the
;; board's, no bumps.
(func $lj_setup (param $n i32)
  (local $nl i32) (local $i i32) (local $len f32) (local $wid f32) (local $cx f32) (local $xa f32)
  (local.set $nl (i32.div_u (i32.add (local.get $n) (i32.const @(LJ_PER - 1))) (i32.const @LJ_PER)))
  (if (i32.lt_u (local.get $nl) (i32.const @LJ_NLMIN)) (then (local.set $nl (i32.const @LJ_NLMIN))))
  (if (i32.gt_u (local.get $nl) (i32.const @LJ_NLMAX)) (then (local.set $nl (i32.const @LJ_NLMAX))))
  (local.set $len (f32.const @(LJ_TOP + LJ_SLOPE + LJ_BOARD + LJ_ID[LJ_NI - 1] + LJ_IR[LJ_NI - 1])))
  (local.set $wid (f32.mul (f32.convert_i32_u (local.get $nl)) (f32.const @LJ_PITCH)))
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (local.set $xa (!madd (local.get $len) (f32.const -0.5) (local.get $cx)))
  (i32.store (i32.const @PG_KIND) (i32.const @PK_SCORE))
  (i32.store (i32.const @PG_LEN) (i32.const @LJ_LEN))
  (f32.store (i32.const @PG_FLOOR) (f32.const @(+PLAT_Y - LJ_DEEP)))
  (f32.store (i32.const @PG_DRAG) (f32.const @LJ_DRAG))
  (f32.store (i32.const @PG_IDLE) (f32.const @LJ_DRAG))
  (f32.store (i32.const @PG_HOP) (f32.const 0))
  (i32.store (i32.const @PG_FLAGS) (i32.const 0))
  (f32.store (i32.const @PG_SIZE) (f32.mul (f32.max (local.get $len) (local.get $wid)) (f32.const 0.5)))
  (i32.store (i32.const @(PG_H + LJ_NL)) (local.get $nl))
  (f32.store (i32.const @(PG_H + LJ_XA)) (local.get $xa))
  (f32.store (i32.const @(PG_H + LJ_XS)) (f32.add (local.get $xa) (f32.const @LJ_TOP)))
  (f32.store (i32.const @(PG_H + LJ_XB)) (f32.add (local.get $xa) (f32.const @(LJ_TOP + LJ_SLOPE))))
  (f32.store (i32.const @(PG_H + LJ_XE)) (f32.add (local.get $xa) (f32.const @(LJ_TOP + LJ_SLOPE + LJ_BOARD))))
  (f32.store (i32.const @(PG_H + LJ_ZL)) (!madd (f32.convert_i32_u (local.get $nl)) (f32.const @(-LJ_PITCH / 2)) (local.get $cx)))
  (f32.store (i32.const @(PG_H + LJ_ISL + 0)) (f32.const @(LJ_ID[0])))
  (f32.store (i32.const @(PG_H + LJ_ISL + 4)) (f32.const @(LJ_IR[0])))
  (f32.store (i32.const @(PG_H + LJ_ISL + 8)) (f32.const @(LJ_ID[1])))
  (f32.store (i32.const @(PG_H + LJ_ISL + 12)) (f32.const @(LJ_IR[1])))
  (f32.store (i32.const @(PG_H + LJ_ISL + 16)) (f32.const @(LJ_ID[2])))
  (f32.store (i32.const @(PG_H + LJ_ISL + 20)) (f32.const @(LJ_IR[2])))
  (f32.store (i32.const @(PG_H + LJ_ISL + 24)) (f32.const @(LJ_ID[3])))
  (f32.store (i32.const @(PG_H + LJ_ISL + 28)) (f32.const @(LJ_IR[3])))
  (f32.store (i32.const @(PG_H + LJ_ISL + 32)) (f32.const @(LJ_ID[4])))
  (f32.store (i32.const @(PG_H + LJ_ISL + 36)) (f32.const @(LJ_IR[4]))))

;; Place k on a start deck, from its back edge and its runway's middle:
;; three across, three rows.
(func $lj_spot (param $k i32) (result f32 f32)
  (!madd (f32.convert_i32_u (i32.rem_u (i32.div_u (local.get $k) (i32.const 3)) (i32.const 3))) (f32.const @LJ_SPOTX) (f32.const @LJ_SPOT0))
  (f32.mul (f32.convert_i32_s (i32.sub (i32.rem_u (local.get $k) (i32.const 3)) (i32.const 1))) (f32.const @LJ_SPOTU)))

;; Ball i of n on the deck of runway i mod the runways, the next place for
;; each one more there (a newcomer, n 1024: the runway and place i picks).
(func $lj_spawn (param $i i32) (param $n i32) (result f32 f32 f32)
  (local $nl i32) (local $dx f32) (local $u f32)
  (local.set $nl (i32.load (i32.const @(PG_H + LJ_NL))))
  (local.set $nl (select (local.get $nl) (i32.const 1) (local.get $nl)))
  (call $lj_spot (i32.div_u (local.get $i) (local.get $nl)))
  (local.set $u) (local.set $dx)
  (f32.add (f32.load (i32.const @(PG_H + LJ_XA))) (local.get $dx))
  (f32.const @(+PLAT_Y + LJ_BH + LJ_RISE))
  (f32.add (call $lj_zc (i32.const 0) (i32.rem_u (local.get $i) (local.get $nl))) (local.get $u)))

(func $lj_start)
(func $lj_begin (param $p i32) (param $d i32))

;; What's under (x, z) on bank d no higher than y: a runway (short of the
;; board's edge, within LJ_HW of its middle), an island's top, else the
;; sea's bed.
(func $lj_ground (param $d i32) (param $x f32) (param $y f32) (param $z f32) (result f32)
  (local $l i32) (local $i i32) (local $a i32) (local $u f32) (local $top f32) (local $dx f32) (local $r f32) (local $xe f32)
  (local.set $xe (f32.load offset=@(PG_H + LJ_XE) (local.get $d)))
  (local.set $l (call $lj_lane (local.get $d) (local.get $z)))
  (local.set $u (f32.sub (local.get $z) (call $lj_zc (local.get $d) (local.get $l))))
  (if (f32.le (local.get $x) (local.get $xe))
    (then
      (if (i32.and (f32.ge (local.get $x) (f32.load offset=@(PG_H + LJ_XA) (local.get $d))) (f32.le (f32.abs (local.get $u)) (f32.const @LJ_HW)))
        (then
          (local.set $top (call $lj_top (local.get $d) (local.get $x)))
          (if (f32.le (local.get $top) (local.get $y)) (then (return (local.get $top)))))))
    (else
      (if (f32.le (f32.const @PLAT_Y) (local.get $y))
        (then
          (!for $i (i32.const 0) (i32.const @LJ_NI)
            (local.set $a (i32.add (local.get $d) (i32.shl (local.get $i) (i32.const 3))))
            (local.set $dx (f32.sub (f32.sub (local.get $x) (local.get $xe)) (f32.load offset=@(PG_H + LJ_ISL) (local.get $a))))
            (local.set $r (f32.load offset=@(PG_H + LJ_ISL + 4) (local.get $a)))
            (if (f32.le (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $u) (local.get $u))) (f32.mul (local.get $r) (local.get $r)))
              (then (return (f32.const @PLAT_Y)))))))))
  (select (f32.const @(+PLAT_Y - LJ_DEEP)) (f32.const -1000) (f32.le (f32.const @(+PLAT_Y - LJ_DEEP)) (local.get $y))))

;; The island of bank d under (x, z), or -1.
(func $lj_isle (param $d i32) (param $x f32) (param $z f32) (result i32)
  (local $i i32) (local $a i32) (local $u f32) (local $dx f32) (local $r f32)
  (local.set $u (f32.sub (local.get $z) (call $lj_zc (local.get $d) (call $lj_lane (local.get $d) (local.get $z)))))
  (!for $i (i32.const 0) (i32.const @LJ_NI)
    (local.set $a (i32.add (local.get $d) (i32.shl (local.get $i) (i32.const 3))))
    (local.set $dx (f32.sub (f32.sub (local.get $x) (f32.load offset=@(PG_H + LJ_XE) (local.get $d))) (f32.load offset=@(PG_H + LJ_ISL) (local.get $a))))
    (local.set $r (f32.load offset=@(PG_H + LJ_ISL + 4) (local.get $a)))
    (if (f32.le (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $u) (local.get $u))) (f32.mul (local.get $r) (local.get $r)))
      (then (return (local.get $i)))))
  (i32.const -1))

;; How far past the board's edge x is on bank d, cm, 0 to LJ_CMMAX.
(func $lj_cm (param $d i32) (param $x f32) (result i32)
  (local $c i32)
  (local.set $c (i32.trunc_sat_f32_s (f32.mul (f32.sub (local.get $x) (f32.load offset=@(PG_H + LJ_XE) (local.get $d))) (f32.const 100))))
  (if (i32.lt_s (local.get $c) (i32.const 0)) (then (local.set $c (i32.const 0))))
  (if (i32.gt_s (local.get $c) (i32.const @LJ_CMMAX)) (then (local.set $c (i32.const @LJ_CMMAX))))
  (local.get $c))

;; A jump ended in PG_M m: one more counted, its length cm, a foul or not,
;; the state st.
(func $lj_ended (param $m i32) (param $st i32) (param $cm i32) (param $foul i32) (result i32)
  (i32.or (i32.or (local.get $st) (select (i32.const @LJ_M_FOUL) (i32.const 0) (local.get $foul)))
          (i32.or (i32.shl (i32.and (i32.add (i32.shr_u (local.get $m) (i32.const @LJ_M_N)) (i32.const 1)) (i32.const 63)) (i32.const @LJ_M_N))
                  (i32.shl (local.get $cm) (i32.const @LJ_M_LAST)))))

;; Ball p after its roll on bank d, by where it is in its jump (PG_M).
;; Held in the sand (still) or in the sea (slowed, sinking) till its
;; P_REFIRE runs out, then on its slot's place on the deck of the runway it
;; is by. On its runway: kept to it down the slope (LJ_HUG), off the rails
;; and the deck's back, pulled down the slope and pushed on over a pad; the
;; hop key on the board's last LJ_HOPZ lifts it off; past the edge it is in
;; the air. In the air: the wind; down on an island it has landed (its jump
;; measured, its best kept), down on a runway it rolls again, LJ_WET under
;; the islands' tops it is in the sea. Writes only its record, and the
;; confirmed world's FX.
(func $lj_push (param $p i32) (param $d i32)
  (local $pb i32) (local $m i32) (local $st i32) (local $fl i32) (local $l i32) (local $i i32) (local $cm i32) (local $best i32)
  (local $px f32) (local $py f32) (local $pz f32) (local $vx f32) (local $vy f32) (local $vz f32)
  (local $xe f32) (local $zc f32) (local $u f32) (local $h f32) (local $s f32) (local $lim f32) (local $k f32)
  (local.set $pb (i32.add (i32.shl (local.get $p) (i32.const 6)) (local.get $d)))
  (local.set $fl (!at u8 @(PLAYERS + P_FL) (local.get $pb)))
  (if (i32.and (local.get $fl) (i32.const @PF_DEAD)) (then (return)))
  (local.set $m (!at i32 @(PLAYERS + PG_M) (local.get $pb)))
  (local.set $st (i32.and (local.get $m) (i32.const @LJ_M_ST)))
  (local.set $px (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
  (local.set $py (!at f32 @(PLAYERS + P_PY) (local.get $pb)))
  (local.set $pz (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
  (local.set $vx (!at f32 @(PLAYERS + P_VX) (local.get $pb)))
  (local.set $vy (!at f32 @(PLAYERS + P_VY) (local.get $pb)))
  (local.set $vz (!at f32 @(PLAYERS + P_VZ) (local.get $pb)))
  (local.set $xe (f32.load offset=@(PG_H + LJ_XE) (local.get $d)))
  (local.set $l (call $lj_lane (local.get $d) (local.get $pz)))
  (local.set $zc (call $lj_zc (local.get $d) (local.get $l)))
  (block $done
    ;; held: in the sand still, in the sea slowed and sinking; then back on the deck
    (if (i32.ge_u (local.get $st) (i32.const @LJ_SAND))
      (then
        (if (!at u16 @(PLAYERS + P_REFIRE) (local.get $pb))
          (then
            (if (i32.eq (local.get $st) (i32.const @LJ_SAND))
              (then
                ;; what the keys moved it this tick, taken back
                (local.set $px (!madd (local.get $vx) (f32.const @(-DT)) (local.get $px)))
                (local.set $pz (!madd (local.get $vz) (f32.const @(-DT)) (local.get $pz)))
                (local.set $vx (f32.const 0)) (local.set $vy (f32.const 0)) (local.set $vz (f32.const 0)))
              (else
                (local.set $vx (f32.mul (local.get $vx) (f32.const @LJ_WDRAG)))
                (local.set $vz (f32.mul (local.get $vz) (f32.const @LJ_WDRAG)))
                (local.set $vy (f32.max (local.get $vy) (f32.const @(-LJ_SINKV))))))
            (br $done)))
        (call $lj_spot (local.get $p))
        (local.set $u) (local.set $s)
        (local.set $px (f32.add (f32.load offset=@(PG_H + LJ_XA) (local.get $d)) (local.get $s)))
        (local.set $py (f32.const @(+PLAT_Y + LJ_BH + LJ_RISE)))
        (local.set $pz (f32.add (local.get $zc) (local.get $u)))
        (local.set $vx (f32.const 0)) (local.set $vy (f32.const 0)) (local.set $vz (f32.const 0))
        (local.set $fl (i32.or (local.get $fl) (i32.const @PF_GROUND)))
        (local.set $m (i32.and (local.get $m) (i32.const @(~LJ_M_ST))))
        (br $done)))
    (local.set $u (f32.sub (local.get $pz) (local.get $zc)))
    (if (i32.eq (local.get $st) (i32.const @LJ_RUN))
      (then
        ;; past the edge: in the air
        (if (f32.gt (local.get $px) (local.get $xe))
          (then
            (local.set $m (i32.or (local.get $m) (i32.const @LJ_FLY)))
            (local.set $fl (i32.and (local.get $fl) (i32.const @(255 ^ PF_GROUND))))
            (if (i32.eqz (local.get $d))
              (then (call $fx (i32.const 0) (i32.const @LJ_FX_OFF) (local.get $p) (i32.const 0) (local.get $px) (local.get $py) (local.get $pz) (local.get $vx))))
            (br $done)))
        ;; the rails, the deck's back
        (local.set $lim (f32.sub (f32.const @LJ_HW) (call $b_rad (local.get $pb))))
        (if (f32.gt (f32.abs (local.get $u)) (local.get $lim))
          (then
            (local.set $pz (f32.add (local.get $zc) (f32.copysign (local.get $lim) (local.get $u))))
            (if (f32.gt (f32.mul (local.get $vz) (local.get $u)) (f32.const 0)) (then (local.set $vz (f32.const 0))))
            (local.set $u (f32.sub (local.get $pz) (local.get $zc)))))
        (local.set $lim (f32.add (f32.load offset=@(PG_H + LJ_XA) (local.get $d)) (call $b_rad (local.get $pb))))
        (if (f32.lt (local.get $px) (local.get $lim))
          (then
            (local.set $px (local.get $lim))
            (if (f32.lt (local.get $vx) (f32.const 0)) (then (local.set $vx (f32.const 0))))))
        ;; kept to the runway down the slope
        (local.set $h (call $lj_top (local.get $d) (local.get $px)))
        (if (i32.and (i32.and (f32.ge (local.get $py) (local.get $h)) (f32.lt (f32.sub (local.get $py) (local.get $h)) (f32.const @LJ_HUG)))
                     (f32.le (local.get $vy) (f32.const 0)))
          (then
            (local.set $py (local.get $h))
            (local.set $vy (f32.const 0))
            (local.set $fl (i32.or (local.get $fl) (i32.const @PF_GROUND)))))
        (if (i32.eqz (i32.and (local.get $fl) (i32.const @PF_GROUND))) (then (br $done)))
        ;; along the runway: the roll's drag taken back for the runway's own, and past the deck most of the keys' push with it
        (local.set $s (f32.sub (local.get $px) (f32.load offset=@(PG_H + LJ_XS) (local.get $d))))
        (local.set $k (call $lj_keyx (!at i32 @(PLAYERS + P_IN) (local.get $pb))))
        (local.set $vx (!madd (f32.sub (local.get $vx) (local.get $k)) (f32.const @(LJ_XKEEP / LJ_DRAG))
                              (select (f32.mul (local.get $k) (f32.const @LJ_KEYX)) (local.get $k) (f32.gt (local.get $s) (f32.const 0)))))
        (if (i32.and (f32.gt (local.get $s) (f32.const 0)) (f32.lt (local.get $s) (f32.const @LJ_SLOPE)))
          (then
            ;; the slope's pull, and a pad: pad i's middle is LJ_PAD0 + i LJ_PADGAP down it, on the side i and the runway pick
            (local.set $vx (f32.add (local.get $vx) (f32.const @(LJ_PULL * DT))))
            (local.set $i (i32.trunc_sat_f32_s (f32.nearest (f32.div (f32.sub (local.get $s) (f32.const @LJ_PAD0)) (f32.const @LJ_PADGAP)))))
            (if (i32.lt_u (local.get $i) (i32.const @LJ_NPAD))
              (then
                (if (i32.and (i32.and (f32.le (f32.abs (f32.sub (local.get $s) (!madd (f32.convert_i32_s (local.get $i)) (f32.const @LJ_PADGAP) (f32.const @LJ_PAD0)))) (f32.const @LJ_PADL))
                                      (f32.le (f32.abs (f32.sub (local.get $u) (select (f32.const @LJ_PADU) (f32.const @(-LJ_PADU)) (i32.and (i32.add (local.get $i) (local.get $l)) (i32.const 1)))))
                                              (f32.const @LJ_PADW)))
                             (f32.lt (local.get $vx) (f32.const @LJ_PADV)))
                  (then (local.set $vx (f32.add (local.get $vx) (f32.const @(LJ_PADA * DT)))))))))
          (else
            ;; the hop, on the board's last LJ_HOPZ
            (local.set $s (f32.sub (local.get $xe) (local.get $px)))
            (if (i32.and (f32.le (local.get $s) (f32.const @LJ_HOPZ)) (i32.ne (i32.and (!at i32 @(PLAYERS + P_IN) (local.get $pb)) (i32.const 0x10000000)) (i32.const 0)))
              (then
                (local.set $vy (!madd (local.get $s) (f32.const @((LJ_LIFT0 - LJ_LIFT1) / LJ_HOPZ)) (f32.const @LJ_LIFT1)))
                (local.set $m (i32.or (local.get $m) (i32.const @LJ_FLY)))
                (local.set $fl (i32.and (local.get $fl) (i32.const @(255 ^ PF_GROUND))))
                (if (i32.eqz (local.get $d))
                  (then (call $fx (i32.const 0) (i32.const @LJ_FX_OFF) (local.get $p) (i32.trunc_sat_f32_s (f32.mul (local.get $vy) (f32.const 8)))
                                  (local.get $px) (local.get $py) (local.get $pz) (local.get $vx))))))))
        (br $done)))
    ;; in the air: the sea, the sand, a runway again, else the wind
    (if (f32.lt (local.get $py) (f32.const @(+PLAT_Y - LJ_WET)))
      (then
        (local.set $cm (call $lj_cm (local.get $d) (local.get $px)))
        (local.set $m (call $lj_ended (local.get $m) (i32.const @LJ_SWIM) (local.get $cm) (i32.const 1)))
        (!put u16 @(PLAYERS + P_REFIRE) (local.get $pb) (i32.const @LJ_BACK))
        (if (i32.eqz (local.get $d))
          (then (call $fx (i32.const 0) (i32.const @LJ_FX_SPLASH) (local.get $p) (i32.const 0) (local.get $px) (f32.const @(+PLAT_Y - LJ_SEA)) (local.get $pz)
                          (f32.sub (local.get $px) (local.get $xe)))))
        (br $done)))
    (if (i32.and (local.get $fl) (i32.const @PF_GROUND))
      (then
        (if (f32.le (local.get $px) (local.get $xe))
          (then (local.set $m (i32.and (local.get $m) (i32.const @(~LJ_M_ST)))) (br $done)))
        (local.set $cm (call $lj_cm (local.get $d) (local.get $px)))
        (local.set $m (call $lj_ended (local.get $m) (i32.const @LJ_SAND) (local.get $cm) (i32.const 0)))
        (!put u16 @(PLAYERS + P_REFIRE) (local.get $pb) (i32.const @LJ_BACK))
        (local.set $best (i32.gt_u (local.get $cm) (!at u16 @(PLAYERS + PG_SCORE) (local.get $pb))))
        (if (local.get $best) (then (!put u16 @(PLAYERS + PG_SCORE) (local.get $pb) (local.get $cm))))
        (local.set $vx (f32.const 0)) (local.set $vy (f32.const 0)) (local.set $vz (f32.const 0))
        (if (i32.eqz (local.get $d))
          (then (call $fx (i32.const 0) (i32.const @LJ_FX_LAND) (local.get $p)
                          (i32.or (i32.and (call $lj_isle (i32.const 0) (local.get $px) (local.get $pz)) (i32.const 15)) (i32.shl (local.get $best) (i32.const 4)))
                          (local.get $px) (local.get $py) (local.get $pz) (f32.sub (local.get $px) (local.get $xe)))))
        (br $done)))
    (local.set $vx (!madd (call $lj_wind (call $p_t (local.get $d))) (f32.const @DT) (local.get $vx))))
  (!chk (local.get $px) 5100 (local.get $p))
  (!chk (local.get $py) 5101 (local.get $p))
  (!chk (local.get $pz) 5102 (local.get $p))
  (!chk (local.get $vx) 5103 (local.get $p))
  (!chk (local.get $vy) 5104 (local.get $p))
  (!chk (local.get $vz) 5105 (local.get $p))
  (!put f32 @(PLAYERS + P_PX) (local.get $pb) (local.get $px))
  (!put f32 @(PLAYERS + P_PY) (local.get $pb) (local.get $py))
  (!put f32 @(PLAYERS + P_PZ) (local.get $pb) (local.get $pz))
  (!put f32 @(PLAYERS + P_VX) (local.get $pb) (local.get $vx))
  (!put f32 @(PLAYERS + P_VY) (local.get $pb) (local.get $vy))
  (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (local.get $vz))
  (!put u8 @(PLAYERS + P_FL) (local.get $pb) (local.get $fl))
  (!put i32 @(PLAYERS + PG_M) (local.get $pb) (local.get $m)))

;; What the page shows, kept from the balls' own records in slot order: a
;; jump ended since the last tick counted (a foul too), and where a new best
;; landed (the ball is held there); and the wind's turn called as it starts.
(func $lj_tick
  (local $p i32) (local $pb i32) (local $sa i32) (local $m i32) (local $n i32) (local $s i32) (local $t i32) (local $k i32) (local $lv f32)
  (local.set $t (call $p_t (i32.const 0)))
  (if (i32.eq (i32.rem_u (local.get $t) (i32.const @LJ_WSEG)) (i32.const @(LJ_WSEG - LJ_WTURN)))
    (then
      (local.set $k (i32.add (i32.div_u (local.get $t) (i32.const @LJ_WSEG)) (i32.const 1)))
      (local.set $lv (call $lj_level (local.get $k)))
      (call $fx (i32.const 0) (i32.const @LJ_FX_WIND) (i32.const 255)
                (i32.add (i32.trunc_sat_f32_s (f32.nearest (f32.mul (local.get $lv) (f32.const @(1 / LJ_WSTEP))))) (i32.const @LJ_WMAX))
                (f32.load (i32.const @(PG_H + LJ_XE))) (f32.const @(+PLAT_Y + LJ_BH + 4)) (call $lj_zc (i32.const 0) (i32.const 0)) (local.get $lv))))
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
    (if (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @PF_LIVE))
      (then
        (local.set $sa (i32.add (i32.const @(PG_S + LJ_SLOTS)) (i32.mul (local.get $p) (i32.const @LJ_SSIZE))))
        (local.set $m (!at i32 @(PLAYERS + PG_M) (local.get $pb)))
        (local.set $n (i32.and (i32.shr_u (local.get $m) (i32.const @LJ_M_N)) (i32.const 63)))
        (if (i32.ne (local.get $n) (i32.load8_u offset=@LJ_S_SEEN (local.get $sa)))
          (then
            (i32.store8 offset=@LJ_S_SEEN (local.get $sa) (local.get $n))
            (i32.store16 offset=@LJ_S_JUMPS (local.get $sa) (i32.add (i32.load16_u offset=@LJ_S_JUMPS (local.get $sa)) (i32.const 1)))
            (if (i32.and (local.get $m) (i32.const @LJ_M_FOUL))
              (then (i32.store16 offset=@LJ_S_FOULS (local.get $sa) (i32.add (i32.load16_u offset=@LJ_S_FOULS (local.get $sa)) (i32.const 1)))))))
        (local.set $s (!at u16 @(PLAYERS + PG_SCORE) (local.get $pb)))
        (if (i32.gt_u (local.get $s) (i32.load16_u offset=@LJ_S_BEST (local.get $sa)))
          (then
            (i32.store16 offset=@LJ_S_BEST (local.get $sa) (local.get $s))
            (f32.store offset=@LJ_S_BX (local.get $sa) (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
            (f32.store offset=@LJ_S_BZ (local.get $sa) (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))))))))

(func $lj_over (result i32) (i32.const 0))
(func $lj_out (param $p i32))
