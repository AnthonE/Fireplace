;; TUG O WAR: red against blue (PGF_TEAMS) on two decks over a mud pit, red's
;; at low x and blue's at high x, TW_GAP apart, with a rope along x down the
;; middle of both. A ball in, on the ground, on its own deck and within
;; TW_BAND of the rope holds it: dug in, it doesn't roll along the rope
;; (across it, it rolls as ever), and while a pull is on it pulls by the
;; share of its keys' push away from the pit. The rope's speed eases toward
;; TW_K times blue's pull less red's, each the root of its holders' sum over
;; half the balls in, and the flag in its middle moves with it; the side
;; losing ground has its holders dragged along with the rope. The flag past a
;; line (TW_WIN0 from the middle, closing in to TW_WIN1 over TW_CLOSE) wins
;; the pull: the rope reels the losers' holders toward the pit at TW_REEL,
;; gripped across it too till they hop, and TW_LAG later the front TW_APRON
;; of their deck tips for TW_TIP, dropping whoever is on it into the mud; the
;; next pull is set TW_SET after. First to TW_BEST pulls; at the clock with
;; them level, the flag's side of the middle takes a decider, and dead in the
;; middle it's a draw. A ball in the mud is down (PK_SCORE), back on its own
;; deck in front of its rail TW_RESPAWN later. Teammates pass through each
;; other; a foe that hops the pit bumps holders off the rope across it (along
;; it they hold fast). A ball's own points: a second of pulling one, a foe
;; knocked into the mud TW_PT_KO.
;;
;; The decks, the band and the rail are fixed at setup in the header, and a
;; deck's front tips TW_LAG after the confirmed world calls the pull, as far
;; ahead as the prediction runs; the reel runs from that call to the tip's
;; end, so push reads the reel off TW_TIPAT too: the prediction rolls a ball
;; through a reel, onto a tipping front and into the mud bit for bit. The
;; rope itself is the confirmed world's, from every holder's keys; while a
;; pull is on push drags a losing holder at bank d's rope speed, which the
;; prediction holds where it was as its run began, so a change in the drag
;; (and a pull won) arrives a round trip late, as a bump does.

;; Side s's way out from the middle along x: -1 red, 1 blue.
(func $tw_dir (param $s i32) (result f32)
  (select (f32.const 1) (f32.const -1) (local.get $s)))

;; The decks for the crowd, the band, the mud; the first pull set.
(func $tw_setup (param $n i32)
  (local $r f32) (local $d f32)
  (local.set $r (f32.sqrt (f32.convert_i32_u (local.get $n))))
  (local.set $d (!madd (local.get $r) (f32.const @TW_DK) (f32.const @TW_D0)))
  (i32.store (i32.const @PG_KIND) (i32.const @PK_SCORE))
  (i32.store (i32.const @PG_LEN) (i32.const @TW_LEN))
  (i32.store (i32.const @PG_FLAGS) (i32.const @(PGF_BUMPS | PGF_TEAMS)))
  (f32.store (i32.const @PG_FLOOR) (f32.const @(+PLAT_Y - TW_MUD)))
  (i32.store (i32.const @PG_RESPAWN) (i32.const @TW_RESPAWN))
  (f32.store (i32.const @PG_SIZE) (f32.add (local.get $d) (f32.const @(TW_GAP / 2))))
  (f32.store (i32.const @(PG_H + TW_D)) (local.get $d))
  (f32.store (i32.const @(PG_H + TW_HW)) (!madd (local.get $r) (f32.const @TW_WK) (f32.const @TW_W0)))
  (f32.store (i32.const @(PG_H + TW_BAND)) (!madd (local.get $r) (f32.const @TW_BK) (f32.const @TW_B0)))
  (i32.store (i32.const @(PG_H + TW_AT)) (i32.const @TW_SET0)))

;; As the round is laid out, ball PG_TK of its side's PG_TN in rows across
;; its deck, TW_SPACE apart and each row centred, the first TW_FRONT in from
;; the front edge and the rest back toward the rail; one back from the mud in
;; play TW_BACK in front of its rail, k of 1024 across the middle of it.
(func $tw_spawn (param $i i32) (param $n i32) (result f32 f32 f32)
  (local $s i32) (local $k i32) (local $m i32) (local $cols i32) (local $row i32) (local $cnt i32)
  (local $a f32) (local $hw f32) (local $cx f32)
  (local.set $s (i32.load (i32.const @PG_TSIDE)))
  (local.set $a (call $tw_dir (local.get $s)))
  (local.set $hw (f32.load (i32.const @(PG_H + TW_HW))))
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (if (i32.eq (i32.load (i32.const @HDR_STATE)) (i32.const @H_PLAY))
    (then
      (return
        (!madd (local.get $a) (f32.add (f32.load (i32.const @(PG_H + TW_D))) (f32.const @(TW_GAP / 2 - TW_BACK))) (local.get $cx))
        (f32.const @PLAT_Y)
        (!madd (f32.sub (f32.mul (f32.convert_i32_u (i32.and (local.get $i) (i32.const 1023))) (f32.const @(2 / 1023))) (f32.const 1))
               (f32.mul (local.get $hw) (f32.const 0.7)) (local.get $cx)))))
  (local.set $k (i32.load (i32.const @PG_TK)))
  (local.set $m (i32.and (i32.shr_u (i32.load (i32.const @PG_TN)) (i32.shl (local.get $s) (i32.const 4))) (i32.const 0xffff)))
  (local.set $cols (i32.add (i32.trunc_sat_f32_u (f32.div (f32.sub (f32.mul (local.get $hw) (f32.const 2)) (f32.const 3)) (f32.const @TW_SPACE))) (i32.const 1)))
  (local.set $row (i32.div_u (local.get $k) (local.get $cols)))
  (local.set $cnt (i32.sub (local.get $m) (i32.mul (local.get $row) (local.get $cols))))
  (if (i32.or (i32.gt_s (local.get $cnt) (local.get $cols)) (i32.le_s (local.get $cnt) (i32.const 0))) (then (local.set $cnt (local.get $cols))))
  (!madd (local.get $a)
         (!madd (f32.convert_i32_u (local.get $row)) (f32.const @TW_SPACE) (f32.const @(TW_GAP / 2 + TW_FRONT)))
         (local.get $cx))
  (f32.const @PLAT_Y)
  (!madd (f32.sub (f32.convert_i32_u (i32.rem_u (local.get $k) (local.get $cols))) (f32.mul (f32.convert_i32_s (i32.sub (local.get $cnt) (i32.const 1))) (f32.const 0.5)))
         (f32.const @TW_SPACE) (local.get $cx)))

(func $tw_start)
(func $tw_begin (param $p i32) (param $d i32))

;; The decks' top under (x, z) on bank d's tick, if y is over it: none over
;; the pit, past a deck's back or sides, or on the front TW_APRON of the deck
;; whose front is tipped then.
(func $tw_ground (param $d i32) (param $x f32) (param $y f32) (param $z f32) (result f32)
  (local $cx f32) (local $u f32) (local $tip i32) (local $t i32)
  (if (f32.lt (local.get $y) (f32.const @PLAT_Y)) (then (return (f32.const -1000))))
  (local.set $cx (f32.load offset=@PG_CX (local.get $d)))
  (if (f32.gt (f32.abs (f32.sub (local.get $z) (local.get $cx))) (f32.load offset=@(PG_H + TW_HW) (local.get $d)))
    (then (return (f32.const -1000))))
  ;; how far into a deck from its front edge
  (local.set $u (f32.sub (f32.abs (f32.sub (local.get $x) (local.get $cx))) (f32.const @(TW_GAP / 2))))
  (if (i32.or (f32.lt (local.get $u) (f32.const 0)) (f32.gt (local.get $u) (f32.load offset=@(PG_H + TW_D) (local.get $d))))
    (then (return (f32.const -1000))))
  (local.set $tip (i32.load offset=@(PG_H + TW_TIPAT) (local.get $d)))
  (if (i32.and (i32.and (i32.ne (local.get $tip) (i32.const 0)) (f32.lt (local.get $u) (f32.const @TW_APRON)))
               (i32.eq (f32.gt (local.get $x) (local.get $cx)) (i32.load offset=@(PG_H + TW_TIPS) (local.get $d))))
    (then
      (local.set $t (call $p_t (local.get $d)))
      (if (i32.and (i32.ge_s (local.get $t) (local.get $tip)) (i32.lt_s (local.get $t) (i32.add (local.get $tip) (i32.const @TW_TIP))))
        (then (return (f32.const -1000))))))
  (f32.const @PLAT_Y))

;; Does the ball at record pb (bank d's) hold the rope: in, on the ground, on
;; its own deck and within the band?
(func $tw_holds (param $pb i32) (param $d i32) (result i32)
  (local $cx f32) (local $u f32)
  (if (i32.ne (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @(PF_LIVE | PF_DEAD | PF_FALL | PF_GROUND)))
              (i32.const @(PF_LIVE | PF_GROUND)))
    (then (return (i32.const 0))))
  (local.set $cx (f32.load offset=@PG_CX (local.get $d)))
  (local.set $u (f32.sub (f32.mul (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (local.get $cx)) (call $tw_dir (call $p_side (local.get $pb))))
                         (f32.const @(TW_GAP / 2))))
  (i32.and (i32.and (f32.ge (local.get $u) (f32.const 0)) (f32.le (local.get $u) (f32.load offset=@(PG_H + TW_D) (local.get $d))))
           (f32.le (f32.abs (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $pb)) (local.get $cx))) (f32.load offset=@(PG_H + TW_BAND) (local.get $d)))))

;; After the ball's roll on bank d: the rail along each deck's back keeps it
;; on; a holder is dug in, its own roll along the rope undone (across it, it
;; rolls as ever). Through a reel (from the pull won to the end of the tip,
;; fixed by TW_TIPAT TW_LAG ahead) the losers' holders are dragged toward the
;; pit at TW_REEL and gripped across the rope too, till a hop lets go; while
;; a pull is on, a holder is dragged at bank d's rope speed when its side
;; loses ground. Writes only its own record.
(func $tw_push (param $p i32) (param $d i32)
  (local $pb i32) (local $hold i32) (local $s i32) (local $tip i32) (local $t i32)
  (local $cx f32) (local $x f32) (local $z f32) (local $vx f32) (local $lim f32) (local $v f32) (local $a f32)
  (local.set $pb (i32.add (i32.shl (local.get $p) (i32.const 6)) (local.get $d)))
  (if (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @(PF_FALL | PF_DEAD))) (then (return)))
  (local.set $hold (call $tw_holds (local.get $pb) (local.get $d)))
  (local.set $cx (f32.load offset=@PG_CX (local.get $d)))
  (local.set $x (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (local.get $cx)))
  (local.set $vx (!at f32 @(PLAYERS + P_VX) (local.get $pb)))
  (if (i32.and (f32.ge (!at f32 @(PLAYERS + P_PY) (local.get $pb)) (f32.const @(+PLAT_Y - 0.5)))
               (f32.le (f32.abs (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $pb)) (local.get $cx))) (f32.load offset=@(PG_H + TW_HW) (local.get $d))))
    (then
      (local.set $lim (f32.sub (f32.add (f32.load offset=@(PG_H + TW_D) (local.get $d)) (f32.const @(TW_GAP / 2))) (call $b_rad (local.get $pb))))
      (if (f32.gt (local.get $x) (local.get $lim))
        (then (local.set $x (local.get $lim)) (local.set $vx (f32.min (local.get $vx) (f32.const 0)))))
      (if (f32.lt (local.get $x) (f32.neg (local.get $lim)))
        (then (local.set $x (f32.neg (local.get $lim))) (local.set $vx (f32.max (local.get $vx) (f32.const 0)))))))
  (if (local.get $hold)
    (then
      (local.set $x (f32.sub (local.get $x) (f32.mul (local.get $vx) (f32.const @DT))))
      (local.set $vx (f32.const 0))
      (local.set $s (call $p_side (local.get $pb)))
      (local.set $a (call $tw_dir (local.get $s)))
      (local.set $tip (i32.load offset=@(PG_H + TW_TIPAT) (local.get $d)))
      (local.set $t (call $p_t (local.get $d)))
      (if (i32.and (i32.ne (local.get $tip) (i32.const 0))
                   (i32.and (i32.ge_s (local.get $t) (i32.sub (local.get $tip) (i32.const @TW_LAG))) (i32.lt_s (local.get $t) (i32.add (local.get $tip) (i32.const @TW_TIP)))))
        (then
          (if (i32.eq (local.get $s) (i32.load offset=@(PG_H + TW_TIPS) (local.get $d)))
            (then
              (local.set $x (!madd (local.get $a) (f32.const @(-TW_REEL * DT)) (local.get $x)))
              (local.set $z (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
              (!put f32 @(PLAYERS + P_PZ) (local.get $pb) (f32.sub (local.get $z) (f32.mul (!at f32 @(PLAYERS + P_VZ) (local.get $pb)) (f32.const @DT))))
              (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (f32.const 0)))))
        (else
          (if (i32.eq (i32.load offset=@(PG_H + TW_PHASE) (local.get $d)) (i32.const @TW_P_PULL))
            (then
              (local.set $v (f32.load offset=@(PG_H + TW_V) (local.get $d)))
              (if (f32.lt (f32.mul (local.get $v) (local.get $a)) (f32.const 0))
                (then (local.set $x (!madd (local.get $v) (f32.const @DT) (local.get $x)))))))))))
  (!chk (local.get $x) 4701 (local.get $p))
  (!chk (local.get $vx) 4702 (local.get $p))
  (!put f32 @(PLAYERS + P_PX) (local.get $pb) (f32.add (local.get $x) (local.get $cx)))
  (!put f32 @(PLAYERS + P_VX) (local.get $pb) (local.get $vx)))

;; Ball pb's pull: the share of its keys' push away from side s's pit, 0 to 1.
(func $tw_pull (param $pb i32) (param $s i32) (result f32)
  (local $in i32) (local $sn f32) (local $c f32) (local $fwd f32) (local $side f32) (local $wx f32) (local $wz f32) (local $len f32)
  (local.set $in (!at i32 @(PLAYERS + P_IN) (local.get $pb)))
  (call $sincos (local.get $in))
  (local.set $c) (local.set $sn)
  (local.set $fwd (f32.convert_i32_s (i32.sub (i32.and (i32.shr_u (local.get $in) (i32.const 24)) (i32.const 1))
                                              (i32.and (i32.shr_u (local.get $in) (i32.const 25)) (i32.const 1)))))
  (local.set $side (f32.convert_i32_s (i32.sub (i32.and (i32.shr_u (local.get $in) (i32.const 27)) (i32.const 1))
                                               (i32.and (i32.shr_u (local.get $in) (i32.const 26)) (i32.const 1)))))
  (local.set $wx (f32.sub (f32.mul (local.get $c) (local.get $fwd)) (f32.mul (local.get $sn) (local.get $side))))
  (local.set $wz (f32.add (f32.mul (local.get $sn) (local.get $fwd)) (f32.mul (local.get $c) (local.get $side))))
  (local.set $len (f32.sqrt (!madd (local.get $wx) (local.get $wx) (f32.mul (local.get $wz) (local.get $wz)))))
  (if (f32.le (local.get $len) (f32.const 0)) (then (return (f32.const 0))))
  (f32.max (f32.div (f32.mul (local.get $wx) (call $tw_dir (local.get $s))) (local.get $len)) (f32.const 0)))

;; A pull won by side w (dec: at the clock): its score, the log, the rope
;; reeling in toward it, the losers' front to tip TW_LAG on; the match over
;; once it has TW_BEST.
(func $tw_won (param $w i32) (param $dec i32) (param $t i32)
  (local $k i32) (local $done i32)
  (call $p_tadd (local.get $w) (i32.const 1))
  (local.set $done (i32.ge_u (i32.load (i32.add (i32.const @PG_TSCORE) (i32.shl (local.get $w) (i32.const 2)))) (i32.const @TW_BEST)))
  (local.set $k (i32.sub (i32.load (i32.const @(PG_H + TW_NP))) (i32.const 1)))
  (if (i32.lt_u (local.get $k) (i32.const @TW_NLOG))
    (then
      (i32.store8 offset=@(PG_S + TW_LOG) (i32.shl (local.get $k) (i32.const 2))
        (i32.or (i32.add (local.get $w) (i32.const 1)) (i32.shl (local.get $dec) (i32.const 2))))
      (i32.store16 offset=@(PG_S + TW_LOG + 2) (i32.shl (local.get $k) (i32.const 2))
        (i32.sub (local.get $t) (i32.load (i32.const @(PG_H + TW_FROM)))))))
  (call $fx (i32.const 0) (i32.const @TW_FX_WON) (i32.const 255)
            (i32.or (i32.or (local.get $w) (i32.shl (local.get $dec) (i32.const 1))) (i32.shl (i32.load (i32.const @(PG_H + TW_NP))) (i32.const 2)))
            (f32.add (f32.load (i32.const @PG_CX)) (f32.load (i32.const @(PG_H + TW_M)))) (f32.const @(+PLAT_Y + 1)) (f32.load (i32.const @PG_CX))
            (f32.mul (f32.convert_i32_s (i32.sub (local.get $t) (i32.load (i32.const @(PG_H + TW_FROM))))) (f32.const @DT)))
  (f32.store (i32.const @(PG_H + TW_V)) (f32.mul (call $tw_dir (local.get $w)) (f32.const @TW_REEL)))
  (i32.store (i32.const @(PG_H + TW_TIPAT)) (i32.add (local.get $t) (i32.const @TW_LAG)))
  (i32.store (i32.const @(PG_H + TW_TIPS)) (i32.sub (i32.const 1) (local.get $w)))
  (i32.store (i32.const @(PG_H + TW_AT)) (i32.add (local.get $t) (i32.const @(TW_LAG + TW_TIP))))
  (i32.store (i32.const @(PG_H + TW_PHASE)) (select (i32.const @TW_P_DONE) (i32.const @TW_P_REEL) (local.get $done))))

;; The confirmed world's tick: the holders counted and their pull summed (a
;; point a second to each); the set ending in a pull; the rope eased toward
;; the pulls' difference and the flag moved, a pull won past the line closing
;; in; a pull won reeling in, its losers' front tipping, the next set after;
;; at the clock with the pulls level, the decider.
(func $tw_tick
  (local $t i32) (local $p i32) (local $pb i32) (local $s i32) (local $n i32) (local $ph i32) (local $a i32)
  (local $pull f32) (local $sr f32) (local $sb f32) (local $h f32) (local $v f32) (local $m f32) (local $win f32)
  (local.set $t (call $p_t (i32.const 0)))
  (local.set $ph (i32.load (i32.const @(PG_H + TW_PHASE))))
  (i64.store (i32.const @(PG_S + TW_HOLD)) (i64.const 0))
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
    (if (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @PF_LIVE)) (then (!inc $n)))
    (if (call $tw_holds (local.get $pb) (i32.const 0))
      (then
        (local.set $s (call $p_side (local.get $pb)))
        (local.set $a (i32.add (i32.const @(PG_S + TW_HOLD)) (i32.shl (local.get $s) (i32.const 1))))
        (i32.store16 (local.get $a) (i32.add (i32.load16_u (local.get $a)) (i32.const 1)))
        (local.set $pull (call $tw_pull (local.get $pb) (local.get $s)))
        (if (i32.and (i32.eq (local.get $ph) (i32.const @TW_P_PULL)) (f32.gt (local.get $pull) (f32.const 0)))
          (then
            (if (local.get $s)
              (then (local.set $sb (f32.add (local.get $sb) (local.get $pull))))
              (else (local.set $sr (f32.add (local.get $sr) (local.get $pull)))))
            (local.set $a (i32.add (!at i32 @(PLAYERS + PG_M) (local.get $pb)) (i32.const 1)))
            (if (i32.ge_u (local.get $a) (i32.const @TW_PT))
              (then
                (local.set $a (i32.const 0))
                (!put u16 @(PLAYERS + PG_SCORE) (local.get $pb) (i32.add (!at u16 @(PLAYERS + PG_SCORE) (local.get $pb)) (i32.const 1)))))
            (!put i32 @(PLAYERS + PG_M) (local.get $pb) (local.get $a)))))))
  (f32.store (i32.const @(PG_S + TW_SUM)) (local.get $sr))
  (f32.store (i32.const @(PG_S + TW_SUM + 4)) (local.get $sb))
  (local.set $m (f32.load (i32.const @(PG_H + TW_M))))
  (if (i32.eq (local.get $ph) (i32.const @TW_P_SET))
    (then
      (if (i32.ge_s (local.get $t) (i32.load (i32.const @(PG_H + TW_AT))))
        (then
          (i32.store (i32.const @(PG_H + TW_PHASE)) (i32.const @TW_P_PULL))
          (i32.store (i32.const @(PG_H + TW_FROM)) (local.get $t))
          (i32.store (i32.const @(PG_H + TW_NP)) (i32.add (i32.load (i32.const @(PG_H + TW_NP))) (i32.const 1)))
          (call $fx (i32.const 0) (i32.const @TW_FX_PULL) (i32.const 255) (i32.load (i32.const @(PG_H + TW_NP)))
                    (f32.load (i32.const @PG_CX)) (f32.const @(+PLAT_Y + 1)) (f32.load (i32.const @PG_CX)) (f32.const 0))))))
  (if (i32.eq (local.get $ph) (i32.const @TW_P_PULL))
    (then
      (local.set $h (f32.max (f32.mul (f32.convert_i32_u (local.get $n)) (f32.const 0.5)) (f32.const 1)))
      (local.set $v (f32.load (i32.const @(PG_H + TW_V))))
      (local.set $v (!madd (f32.sub (f32.mul (f32.sub (f32.sqrt (f32.div (local.get $sb) (local.get $h))) (f32.sqrt (f32.div (local.get $sr) (local.get $h))))
                                             (f32.const @TW_K))
                                    (local.get $v))
                           (f32.const @TW_EASE) (local.get $v)))
      (local.set $v (!clamp (local.get $v) (f32.const @(-TW_VMAX)) (f32.const @TW_VMAX)))
      (local.set $m (!madd (local.get $v) (f32.const @DT) (local.get $m)))
      (!chk (local.get $v) 4703 (local.get $n))
      (!chk (local.get $m) 4704 (local.get $n))
      (f32.store (i32.const @(PG_H + TW_V)) (local.get $v))
      (f32.store (i32.const @(PG_H + TW_M)) (local.get $m))
      (local.set $win (f32.max (f32.sub (f32.const @TW_WIN0)
                                        (f32.mul (f32.convert_i32_s (i32.sub (local.get $t) (i32.load (i32.const @(PG_H + TW_FROM)))))
                                                 (f32.const @((TW_WIN0 - TW_WIN1) / TW_CLOSE))))
                               (f32.const @TW_WIN1)))
      (if (f32.ge (f32.abs (local.get $m)) (local.get $win))
        (then (call $tw_won (f32.gt (local.get $m) (f32.const 0)) (i32.const 0) (local.get $t))))))
  (if (i32.ge_u (local.get $ph) (i32.const @TW_P_REEL))
    (then
      (f32.store (i32.const @(PG_H + TW_M))
        (!clamp (!madd (f32.load (i32.const @(PG_H + TW_V))) (f32.const @DT) (local.get $m)) (f32.const -40) (f32.const 40)))
      (if (i32.eq (local.get $t) (i32.load (i32.const @(PG_H + TW_TIPAT))))
        (then
          (local.set $s (i32.load (i32.const @(PG_H + TW_TIPS))))
          (call $fx (i32.const 0) (i32.const @TW_FX_TIP) (i32.const 255) (local.get $s)
                    (!madd (call $tw_dir (local.get $s)) (f32.const @(TW_GAP / 2 + TW_APRON / 2)) (f32.load (i32.const @PG_CX)))
                    (f32.const @PLAT_Y) (f32.load (i32.const @PG_CX)) (f32.const 0))))
      (if (i32.and (i32.eq (local.get $ph) (i32.const @TW_P_REEL)) (i32.ge_s (local.get $t) (i32.load (i32.const @(PG_H + TW_AT)))))
        (then
          (i32.store (i32.const @(PG_H + TW_PHASE)) (i32.const @TW_P_SET))
          (i32.store (i32.const @(PG_H + TW_AT)) (i32.add (local.get $t) (i32.const @TW_SET)))
          (f32.store (i32.const @(PG_H + TW_M)) (f32.const 0))
          (f32.store (i32.const @(PG_H + TW_V)) (f32.const 0))))))
  ;; the clock: pulls level, the flag's side of the middle takes the decider
  ;; (in a set it is in the middle: a draw)
  (if (i32.and (i32.ge_s (local.get $t) (i32.load (i32.const @PG_LEN)))
               (i32.and (i32.ne (i32.load (i32.const @(PG_H + TW_PHASE))) (i32.const @TW_P_DONE))
                        (i32.eq (i32.load (i32.const @PG_TSCORE)) (i32.load (i32.const @(PG_TSCORE + 4))))))
    (then
      (local.set $m (f32.load (i32.const @(PG_H + TW_M))))
      (if (f32.ne (local.get $m) (f32.const 0))
        (then (call $tw_won (f32.gt (local.get $m) (f32.const 0)) (i32.const 1) (local.get $t)))))))

;; Over once the deciding pull's losers have tipped.
(func $tw_over (result i32)
  (i32.and (i32.eq (i32.load (i32.const @(PG_H + TW_PHASE))) (i32.const @TW_P_DONE))
           (i32.ge_s (call $p_t (i32.const 0)) (i32.load (i32.const @(PG_H + TW_AT))))))

;; A ball into the mud: a splash, and TW_PT_KO to a foe that knocked it in
;; (bumped it in the last CREDIT_TICKS).
(func $tw_out (param $p i32)
  (local $pb i32) (local $hb i32)
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (local.set $hb (!at u8 @(PLAYERS + B_HITBY) (local.get $pb)))
  (if (i32.or (i32.or (i32.eqz (!at u16 @(PLAYERS + B_HITT) (local.get $pb))) (i32.ge_u (local.get $hb) (i32.const @NPLAYER)))
              (i32.or (i32.eq (local.get $hb) (local.get $p)) (call $p_mates (local.get $p) (local.get $hb))))
    (then (local.set $hb (i32.const 255)))
    (else
      (if (i32.and (!at u8 @(PLAYERS + P_FL) (i32.shl (local.get $hb) (i32.const 6))) (i32.const @PF_LIVE))
        (then
          (!put u16 @(PLAYERS + PG_SCORE) (i32.shl (local.get $hb) (i32.const 6))
            (i32.add (!at u16 @(PLAYERS + PG_SCORE) (i32.shl (local.get $hb) (i32.const 6))) (i32.const @TW_PT_KO))))
        (else (local.set $hb (i32.const 255))))))
  (call $fx (i32.const 0) (i32.const @TW_FX_MUD) (local.get $p) (local.get $hb)
            (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (f32.const @(+PLAT_Y - TW_MUD)) (!at f32 @(PLAYERS + P_PZ) (local.get $pb)) (f32.const 0)))
