;; TRAP RUN: runners against trappers, after Roblox's Deathrun. A straight
;; course over the sea along +x, from a start pad over TR_NT0 to TR_NT0 +
;; TR_NTK - 1 traps to a finish line and a pen past it, wider for a crowd,
;; railed except along a trap's open edge (-z); on its +z side a wall, and
;; past it, TR_WH up, the trappers' walkway, from the start line a belt
;; running on down the course. One ball in TR_PER (at least one, none in a
;; room of one), picked from the round's seed, starts on the walkway: a
;; trapper; the rest run. Beside each trap is a pad on the walkway, and a
;; trapper whose centre is on it arms the trap (no new input: it rolls
;; there). An armed trap fires TR_DELAY ticks on (its pad lit, the trap
;; flashing only the last TR_FLASH), is live for its kind's TR_LIVES, cools
;; TR_COOL, and can be armed again. Six kinds: floor panels a random share of
;; which drop away; pistons punching out of the wall across most of the
;; course; a bar at ball height turning half round on a post; a block
;; slamming down across it; air jets blowing a ball up, back and toward the
;; edge; the floor tipping down from the wall to the edge. The first runner
;; over the line cuts the clock to TR_LATE; placed by PG_SCORE, nobody back:
;; a runner home TR_WIN plus the ticks it had left, the rest TR_DM a metre
;; down the course (the fallen where they fell); a trapper TR_TRAP0 plus the
;; runners its traps took out (out within TR_CREDIT of a trap having it),
;; behind every runner home and ahead of every one who isn't.
;;
;; The course is laid out in setup and fixed (PG_S, the header); a trap's
;; clock is a function of its arming tick, which only the confirmed world's
;; tick writes. TR_DELAY is more than PRED_MAX, so any trap the prediction
;; sees live was armed before the prediction began, and one armed since is
;; still armed and harmless as far as it runs (a trap is armed again only
;; once its last firing is over): push and ground read the confirmed traps
;; against their own bank's tick, exact. A runner's score and its last trap
;; (PG_M) are its own, kept by push on either bank. Arming, homecomings and
;; credit are the confirmed world's.

;; Trap k's record.
(func $tr_ta (param $k i32) (result i32)
  (i32.add (i32.const @(PG_S + TR_TRAPS)) (i32.mul (local.get $k) (i32.const @TR_TRSZ))))

;; The course's k-th random number in [0, 1).
(func $tr_rnd (param $k i32) (result f32)
  (f32.mul (f32.convert_i32_u (i32.shr_u (call $hash32 (local.get $k) (i32.const 0x7a9) (call $p_seed (i32.const @TR_KCOURSE))) (i32.const 8)))
           (f32.const 0x1p-24)))

;; A kind's length down the course, the course's half-width w.
(func $tr_len (param $kind i32) (param $w f32) (result f32)
  (if (result f32) (i32.eq (local.get $kind) (i32.const @TR_K_SWEEP))
    (then (!madd (local.get $w) (f32.const 2) (f32.const 2)))
    (else (f32.convert_i32_u (!tab TR_LENS (local.get $kind))))))

;; Trap k on tick t into play: its phase (TR_IDLEP ... TR_COOLP) and the
;; ticks into it.
(func $tr_phase (param $k i32) (param $t i32) (result i32 i32)
  (local $a i32) (local $e i32) (local $live i32)
  (local.set $a (call $tr_ta (local.get $k)))
  (if (i32.eqz (i32.load offset=@TR_T_ARM (local.get $a))) (then (return (i32.const @TR_IDLEP) (i32.const 0))))
  (local.set $live (!tab TR_LIVES (i32.load offset=@TR_T_KIND (local.get $a))))
  (local.set $e (i32.sub (local.get $t) (i32.sub (i32.load offset=@TR_T_ARM (local.get $a)) (i32.const 1))))
  (if (i32.lt_s (local.get $e) (i32.const 0)) (then (return (i32.const @TR_IDLEP) (i32.const 0))))
  (if (i32.lt_s (local.get $e) (i32.const @TR_DELAY)) (then (return (i32.const @TR_WARN) (local.get $e))))
  (local.set $e (i32.sub (local.get $e) (i32.const @TR_DELAY)))
  (if (i32.lt_s (local.get $e) (local.get $live)) (then (return (i32.const @TR_LIVE) (local.get $e))))
  (local.set $e (i32.sub (local.get $e) (local.get $live)))
  (if (i32.lt_s (local.get $e) (i32.const @TR_COOL)) (then (return (i32.const @TR_COOLP) (local.get $e))))
  (i32.const @TR_IDLEP) (i32.sub (local.get $e) (i32.const @TR_COOL)))

;; Ticks into trap k's live time on tick t, or -1 if it isn't live.
(func $tr_on (param $k i32) (param $t i32) (result i32)
  (local $e i32) (local $ph i32)
  (call $tr_phase (local.get $k) (local.get $t))
  (local.set $e) (local.set $ph)
  (select (local.get $e) (i32.const -1) (i32.eq (local.get $ph) (i32.const @TR_LIVE))))

;; The floor panel under (x, z) in a section from x0, on bank d's layout:
;; row * TR_NCOL + column, or -1 past its rows.
(func $tr_cell (param $d i32) (param $x0 f32) (param $x f32) (param $z f32) (result i32)
  (local $row i32) (local $col i32) (local $n i32)
  (local.set $row (i32.trunc_sat_f32_s (f32.floor (f32.div (f32.sub (local.get $x) (local.get $x0)) (f32.const @TR_CELL)))))
  (if (i32.or (i32.lt_s (local.get $row) (i32.const 0)) (i32.ge_s (local.get $row) (i32.const @TR_DROWS))) (then (return (i32.const -1))))
  (local.set $n (i32.load offset=@(PG_H + TR_NCOL) (local.get $d)))
  (local.set $col (i32.trunc_sat_f32_s (f32.floor (f32.div (f32.sub (local.get $z) (f32.sub (f32.load offset=@PG_CX (local.get $d)) (f32.load offset=@(PG_H + TR_W) (local.get $d))))
                                                         (f32.load offset=@(PG_H + TR_CW) (local.get $d))))))
  (if (i32.lt_s (local.get $col) (i32.const 0)) (then (local.set $col (i32.const 0))))
  (if (i32.ge_s (local.get $col) (local.get $n)) (then (local.set $col (i32.sub (local.get $n) (i32.const 1)))))
  (i32.add (i32.mul (local.get $row) (local.get $n)) (local.get $col)))

;; Does trap k's panel c drop?
(func $tr_drops (param $k i32) (param $c i32) (result i32)
  (local $a i32)
  (local.set $a (call $tr_ta (local.get $k)))
  (i32.and (i32.shr_u (select (i32.load offset=@TR_T_M0 (local.get $a)) (i32.load offset=@TR_T_M1 (local.get $a)) (i32.lt_u (local.get $c) (i32.const 32)))
                      (i32.and (local.get $c) (i32.const 31)))
           (i32.const 1)))

;; The tipping floor's angle (1/16384 turn) e ticks into its live time.
(func $tr_tilt (param $e i32) (result i32)
  (local $m i32)
  (local.set $m (i32.add (local.get $e) (i32.const 1)))
  (if (i32.gt_s (local.get $m) (i32.const @TR_TRAMP)) (then (local.set $m (i32.const @TR_TRAMP))))
  (if (i32.gt_s (local.get $m) (i32.sub (!tab TR_LIVES (i32.const @TR_K_TIP)) (local.get $e)))
    (then (local.set $m (i32.sub (!tab TR_LIVES (i32.const @TR_K_TIP)) (local.get $e)))))
  (i32.div_s (i32.mul (local.get $m) (i32.const @TR_TILT)) (i32.const @TR_TRAMP)))

;; The tipped floor's top at z on bank d, at angle ang: down from the wall.
(func $tr_tiptop (param $d i32) (param $ang i32) (param $z f32) (result f32)
  (local $s f32) (local $c f32)
  (call $sincos (local.get $ang))
  (local.set $c) (local.set $s)
  (f32.sub (f32.const @PLAT_Y)
           (f32.div (f32.mul (f32.sub (f32.add (f32.load offset=@PG_CX (local.get $d)) (f32.load offset=@(PG_H + TR_W) (local.get $d))) (local.get $z))
                             (local.get $s))
                    (local.get $c))))

;; The sweeper's bar's angle (1/16384 turn) on tick t: along the course at
;; rest (sunk), half a turn over its live time.
(func $tr_bar (param $k i32) (param $t i32) (result i32)
  (local $e i32)
  (local.set $e (call $tr_on (local.get $k) (local.get $t)))
  (if (result i32) (i32.lt_s (local.get $e) (i32.const 0))
    (then (i32.const 0))
    (else (i32.div_s (i32.mul (i32.add (local.get $e) (i32.const 1)) (i32.const 8192)) (!tab TR_LIVES (i32.const @TR_K_SWEEP))))))

;; The crusher's bottom over the floor e ticks into its live time (-1: not
;; live, hanging).
(func $tr_crush_b (param $e i32) (result f32)
  (local $s f32)
  (if (i32.lt_s (local.get $e) (i32.const 0)) (then (return (f32.const @TR_CH))))
  (if (i32.lt_s (local.get $e) (i32.const @TR_CFALL))
    (then
      (local.set $s (f32.mul (f32.convert_i32_s (i32.add (local.get $e) (i32.const 1))) (f32.const @(1 / TR_CFALL))))
      (return (f32.mul (f32.const @TR_CH) (f32.sub (f32.const 1) (f32.mul (local.get $s) (local.get $s)))))))
  (if (i32.lt_s (local.get $e) (i32.const @TR_CUP)) (then (return (f32.const 0))))
  (f32.mul (f32.convert_i32_s (i32.add (i32.sub (local.get $e) (i32.const @TR_CUP)) (i32.const 1)))
           (f32.const @(TR_CH / (TR_LIVES[TR_K_CRUSH] - TR_CUP)))))

;; How far out from the wall the pistons' faces are, 0 to 1, e ticks into
;; their live time.
(func $tr_ext (param $e i32) (result f32)
  (if (i32.lt_s (local.get $e) (i32.const 0)) (then (return (f32.const 0))))
  (if (i32.lt_s (local.get $e) (i32.const @TR_PEXT))
    (then (return (f32.mul (f32.convert_i32_s (i32.add (local.get $e) (i32.const 1))) (f32.const @(1 / TR_PEXT))))))
  (if (i32.lt_s (local.get $e) (i32.const @TR_PHOLD)) (then (return (f32.const 1))))
  (f32.mul (f32.convert_i32_s (i32.sub (!tab TR_LIVES (i32.const @TR_K_PIST)) (local.get $e)))
           (f32.const @(1 / (TR_LIVES[TR_K_PIST] - TR_PHOLD)))))

;; Is the ball at record pb a trapper? Its score says so (TR_TRAP0 and up,
;; under TR_WIN), set as play starts for those on the walkway; a newcomer's
;; is 0, a runner's.
(func $tr_trapper (param $pb i32) (result i32)
  (local $sc i32)
  (local.set $sc (!at u16 @(PLAYERS + PG_SCORE) (local.get $pb)))
  (i32.and (i32.ge_u (local.get $sc) (i32.const @TR_TRAP0)) (i32.lt_u (local.get $sc) (i32.const @TR_WIN))))

;; The greatest common divisor of a and b.
(func $tr_gcd (param $a i32) (param $b i32) (result i32)
  (local $t i32)
  (block $done
    (loop $next
      (br_if $done (i32.eqz (local.get $b)))
      (local.set $t (i32.rem_u (local.get $a) (local.get $b)))
      (local.set $a (local.get $b))
      (local.set $b (local.get $t))
      (br $next)))
  (local.get $a))

;; ---- laying the course out (setup)

;; The course for n balls: who traps, its width, the grid's rows, the traps
;; (every kind once in an order of the seed's, then any but the last), the
;; railed stretches between them, the pen; all centred on the stage's
;; centre, each trap's pad beside its middle. A scoring round nobody comes
;; back into, braking hard with no keys, bumps with no kick.
(func $tr_setup (param $n i32)
  (local $ntr i32) (local $w f32) (local $ww f32) (local $m i32) (local $rows i32) (local $pad f32) (local $nt i32) (local $k i32) (local $j i32)
  (local $kind i32) (local $prev i32) (local $a i32) (local $len f32) (local $pen f32) (local $total f32) (local $xa f32) (local $x0 f32) (local $x f32) (local $nc i32)
  (local.set $n (select (local.get $n) (i32.const 1) (local.get $n)))
  (local.set $ntr (i32.div_u (local.get $n) (i32.const @TR_PER)))
  (if (i32.and (i32.eqz (local.get $ntr)) (i32.ge_u (local.get $n) (i32.const 2))) (then (local.set $ntr (i32.const 1))))
  (local.set $w (f32.min (!madd (f32.sqrt (f32.convert_i32_u (local.get $n))) (f32.const @TR_WK) (f32.const @TR_W0)) (f32.const @TR_WMAX)))
  (!chk (local.get $w) 170 (local.get $n))
  (local.set $ww (!madd (f32.convert_i32_u (local.get $ntr)) (f32.const @TR_WWK) (f32.const @TR_WW0)))
  (i32.store (i32.const @PG_KIND) (i32.const @PK_SCORE))
  (i32.store (i32.const @PG_LEN) (i32.const @TR_LEN))
  (f32.store (i32.const @PG_IDLE) (f32.const @TR_IDLE))
  (i32.store (i32.const @PG_RESPAWN) (i32.const 0x7fffffff))
  (i32.store (i32.const @PG_FLAGS) (i32.const @(PGF_BUMPS | PGF_NOKICK)))
  ;; the runners' grid: rows TR_STEP apart, as many a row as fit
  (local.set $m (i32.trunc_sat_f32_u (f32.max (f32.const 1) (f32.div (f32.sub (f32.mul (local.get $w) (f32.const 2)) (f32.const 2)) (f32.const @TR_STEP)))))
  (local.set $rows (i32.div_u (i32.add (i32.sub (local.get $n) (local.get $ntr)) (i32.sub (local.get $m) (i32.const 1))) (local.get $m)))
  (local.set $pad (!madd (f32.convert_i32_u (local.get $rows)) (f32.const @TR_STEP) (f32.const @TR_PAD)))
  ;; the traps' kinds: the six shuffled, then any but the one before
  (local.set $nt (i32.add (i32.const @TR_NT0) (i32.trunc_sat_f32_u (f32.mul (call $tr_rnd (i32.const 0)) (f32.const @TR_NTK)))))
  (!for $k (i32.const 0) (i32.const @TR_NK)
    (i32.store offset=@TR_T_KIND (call $tr_ta (local.get $k)) (local.get $k)))
  (!for $k (i32.const 0) (i32.const @(TR_NK - 1))
    (local.set $j (i32.add (local.get $k) (i32.trunc_sat_f32_u (f32.mul (call $tr_rnd (i32.add (i32.const 8) (local.get $k)))
                                                                     (f32.convert_i32_u (i32.sub (i32.const @TR_NK) (local.get $k)))))))
    (local.set $kind (i32.load offset=@TR_T_KIND (call $tr_ta (local.get $j))))
    (i32.store offset=@TR_T_KIND (call $tr_ta (local.get $j)) (i32.load offset=@TR_T_KIND (call $tr_ta (local.get $k))))
    (i32.store offset=@TR_T_KIND (call $tr_ta (local.get $k)) (local.get $kind)))
  (local.set $prev (i32.load offset=@TR_T_KIND (call $tr_ta (i32.const @(TR_NK - 1)))))
  (!for $k (i32.const @TR_NK) (local.get $nt)
    (local.set $prev (i32.rem_u (i32.add (i32.add (local.get $prev) (i32.const 1))
                                         (i32.trunc_sat_f32_u (f32.mul (call $tr_rnd (i32.add (i32.const 32) (local.get $k))) (f32.const @(TR_NK - 1)))))
                                (i32.const @TR_NK)))
    (i32.store offset=@TR_T_KIND (call $tr_ta (local.get $k)) (local.get $prev)))
  ;; its length: the sections and the stretches between, then where it all goes
  (local.set $len (f32.const @(TR_X1 + TR_XN)))
  (!for $k (i32.const 0) (local.get $nt)
    (local.set $len (f32.add (local.get $len) (call $tr_len (i32.load offset=@TR_T_KIND (call $tr_ta (local.get $k))) (local.get $w))))
    (if (local.get $k) (then (local.set $len (f32.add (local.get $len) (!madd (call $tr_rnd (i32.add (i32.const 16) (local.get $k))) (f32.const @TR_GAPK) (f32.const @TR_GAP0)))))))
  (local.set $pen (!madd (f32.convert_i32_u (local.get $n)) (f32.const @TR_PENK) (f32.const @TR_PEN0)))
  (local.set $total (f32.add (f32.add (local.get $pad) (local.get $len)) (local.get $pen)))
  (local.set $xa (f32.sub (f32.load (i32.const @PG_CX)) (f32.mul (local.get $total) (f32.const 0.5))))
  (local.set $x0 (f32.add (local.get $xa) (local.get $pad)))
  (local.set $x (f32.add (local.get $x0) (f32.const @TR_X1)))
  (!for $k (i32.const 0) (local.get $nt)
    (local.set $a (call $tr_ta (local.get $k)))
    (if (local.get $k) (then (local.set $x (f32.add (local.get $x) (!madd (call $tr_rnd (i32.add (i32.const 16) (local.get $k))) (f32.const @TR_GAPK) (f32.const @TR_GAP0))))))
    (f32.store offset=@TR_T_X0 (local.get $a) (local.get $x))
    (local.set $x (f32.add (local.get $x) (call $tr_len (i32.load offset=@TR_T_KIND (local.get $a)) (local.get $w))))
    (f32.store offset=@TR_T_X1 (local.get $a) (local.get $x))
    (f32.store offset=@TR_T_PAD (local.get $a) (f32.mul (f32.add (f32.load offset=@TR_T_X0 (local.get $a)) (local.get $x)) (f32.const 0.5)))
    (i32.store offset=@TR_T_ARM (local.get $a) (i32.const 0))
    (i32.store offset=@TR_T_BY (local.get $a) (i32.const 0))
    (i32.store offset=@TR_T_M0 (local.get $a) (i32.const 0))
    (i32.store offset=@TR_T_M1 (local.get $a) (i32.const 0)))
  ;; the panels and jets' cells across: about TR_CELL m each
  (local.set $nc (i32.trunc_sat_f32_u (f32.nearest (f32.div (f32.mul (local.get $w) (f32.const 2)) (f32.const @TR_CELL)))))
  (if (i32.lt_u (local.get $nc) (i32.const @TR_NCMIN)) (then (local.set $nc (i32.const @TR_NCMIN))))
  (if (i32.gt_u (local.get $nc) (i32.const @TR_NCMAX)) (then (local.set $nc (i32.const @TR_NCMAX))))
  (i32.store (i32.const @(PG_H + TR_NT)) (local.get $nt))
  (f32.store (i32.const @(PG_H + TR_W)) (local.get $w))
  (f32.store (i32.const @(PG_H + TR_XA)) (local.get $xa))
  (f32.store (i32.const @(PG_H + TR_X0)) (local.get $x0))
  (f32.store (i32.const @(PG_H + TR_FIN)) (f32.add (local.get $x) (f32.const @TR_XN)))
  (f32.store (i32.const @(PG_H + TR_XB)) (f32.add (f32.add (local.get $x) (f32.const @TR_XN)) (local.get $pen)))
  (f32.store (i32.const @(PG_H + TR_ZW)) (f32.add (f32.add (f32.load (i32.const @PG_CX)) (local.get $w)) (f32.const @TR_WALL)))
  (f32.store (i32.const @(PG_H + TR_WWID)) (local.get $ww))
  (i32.store (i32.const @(PG_H + TR_NCOL)) (local.get $nc))
  (f32.store (i32.const @(PG_H + TR_CW)) (f32.div (f32.mul (local.get $w) (f32.const 2)) (f32.convert_i32_u (local.get $nc))))
  (i32.store (i32.const @(PG_H + TR_NTR)) (local.get $ntr))
  (i32.store (i32.const @(PG_H + TR_ROW)) (local.get $m))
  (f32.store (i32.const @PG_SIZE) (f32.mul (f32.max (local.get $total) (f32.add (f32.add (f32.mul (local.get $w) (f32.const 2)) (local.get $ww)) (f32.const @TR_WALL)))
                                           (f32.const 0.5))))

;; Ball i of n: the seed's shuffle of them (i times a stride prime to n, plus
;; an offset), the first TR_NTR of it trappers on the walkway in rows back
;; from 1.5 m short of the start line (where its belt starts), the rest on
;; the runners' grid across the start pad from its front back; a newcomer
;; (n 1024) anywhere on the pad.
(func $tr_spawn (param $i i32) (param $n i32) (result f32 f32 f32)
  (local $m i32) (local $k i32) (local $row i32) (local $cnt i32) (local $stride i32) (local $seed i32) (local $ntr i32)
  (local $x0 f32) (local $w f32) (local $along f32) (local $u f32) (local $ww f32)
  (local.set $x0 (f32.load (i32.const @(PG_H + TR_X0))))
  (local.set $w (f32.load (i32.const @(PG_H + TR_W))))
  (local.set $m (select (i32.load (i32.const @(PG_H + TR_ROW))) (i32.const 1) (i32.load (i32.const @(PG_H + TR_ROW)))))
  (if (i32.ge_u (local.get $n) (i32.const 1024))
    (then
      (local.set $along (!madd (f32.convert_i32_u (i32.and (local.get $i) (i32.const 15)))
                               (f32.mul (f32.sub (f32.sub (local.get $x0) (f32.load (i32.const @(PG_H + TR_XA)))) (f32.const 4)) (f32.const 0.0625))
                               (f32.const 2)))
      (return (f32.sub (local.get $x0) (local.get $along))
              (f32.const @PLAT_Y)
              (!madd (f32.sub (f32.mul (f32.convert_i32_u (i32.shr_u (local.get $i) (i32.const 4))) (f32.const 0.015625)) (f32.const 0.5))
                     (f32.mul (f32.const 2) (f32.sub (local.get $w) (f32.const 2)))
                     (f32.load (i32.const @PG_CX))))))
  (local.set $seed (call $p_seed (i32.const @TR_KGRID)))
  (local.set $stride (i32.add (i32.and (local.get $seed) (i32.const 127)) (i32.const 1)))
  (block $prime
    (loop $next
      (br_if $prime (i32.eq (call $tr_gcd (local.get $stride) (local.get $n)) (i32.const 1)))
      (local.set $stride (i32.add (local.get $stride) (i32.const 1)))
      (br $next)))
  (local.set $k (i32.rem_u (i32.add (i32.mul (local.get $i) (local.get $stride)) (i32.shr_u (local.get $seed) (i32.const 8))) (local.get $n)))
  (local.set $ntr (i32.load (i32.const @(PG_H + TR_NTR))))
  (if (i32.lt_u (local.get $k) (local.get $ntr))
    (then
      (local.set $ww (f32.load (i32.const @(PG_H + TR_WWID))))
      (local.set $cnt (i32.add (i32.trunc_sat_f32_u (f32.div (f32.sub (local.get $ww) (f32.const 2.4)) (f32.const @TR_STEP))) (i32.const 1)))
      (return (!madd (f32.convert_i32_u (i32.div_u (local.get $k) (local.get $cnt))) (f32.const @(-TR_STEP))
                     (f32.sub (local.get $x0) (f32.const 1.5)))
              (f32.const @(+PLAT_Y + TR_WH))
              (!madd (f32.convert_i32_u (i32.rem_u (local.get $k) (local.get $cnt))) (f32.const @TR_STEP)
                     (f32.add (f32.load (i32.const @(PG_H + TR_ZW))) (f32.const 1.2))))))
  (local.set $k (i32.sub (local.get $k) (local.get $ntr)))
  (local.set $n (i32.sub (local.get $n) (local.get $ntr)))
  (local.set $row (i32.div_u (local.get $k) (local.get $m)))
  (local.set $cnt (i32.sub (local.get $n) (i32.mul (local.get $row) (local.get $m))))
  (if (i32.gt_u (local.get $cnt) (local.get $m)) (then (local.set $cnt (local.get $m))))
  (local.set $along (!madd (f32.convert_i32_u (local.get $row)) (f32.const @TR_STEP) (f32.const 1.5)))
  (local.set $u (f32.mul (f32.sub (f32.convert_i32_u (i32.rem_u (local.get $k) (local.get $m)))
                                  (f32.mul (f32.convert_i32_u (i32.sub (local.get $cnt) (i32.const 1))) (f32.const 0.5)))
                         (f32.const @TR_STEP)))
  (f32.sub (local.get $x0) (local.get $along))
  (f32.const @PLAT_Y)
  (f32.add (f32.load (i32.const @PG_CX)) (local.get $u)))

(func $tr_start)
;; A trapper's score as play starts, on bank d: TR_TRAP0, none taken.
(func $tr_begin (param $p i32) (param $d i32)
  (local $pb i32)
  (local.set $pb (i32.add (i32.shl (local.get $p) (i32.const 6)) (local.get $d)))
  (if (f32.gt (!at f32 @(PLAYERS + P_PZ) (local.get $pb))
              (f32.add (f32.add (f32.load offset=@PG_CX (local.get $d)) (f32.load offset=@(PG_H + TR_W) (local.get $d))) (f32.const @(TR_WALL / 2))))
    (then (!put u16 @(PLAYERS + PG_SCORE) (local.get $pb) (i32.const @TR_TRAP0)))))

;; What holds (x, z) up on bank d, no higher than y: the walkway past the
;; wall; the course's floor, but over a trap's dropped panel nothing and
;; over its tipped floor the slope; nothing past the course's sides.
(func $tr_ground (param $d i32) (param $x f32) (param $y f32) (param $z f32) (result f32)
  (local $cx f32) (local $w f32) (local $zw f32) (local $top f32) (local $nt i32) (local $k i32) (local $a i32) (local $e i32) (local $kind i32) (local $c i32)
  (if (i32.or (f32.lt (local.get $x) (f32.sub (f32.load offset=@(PG_H + TR_XA) (local.get $d)) (f32.const 0.5)))
              (f32.gt (local.get $x) (f32.add (f32.load offset=@(PG_H + TR_XB) (local.get $d)) (f32.const 0.5))))
    (then (return (f32.const -1000))))
  (local.set $cx (f32.load offset=@PG_CX (local.get $d)))
  (local.set $w (f32.load offset=@(PG_H + TR_W) (local.get $d)))
  (local.set $zw (f32.load offset=@(PG_H + TR_ZW) (local.get $d)))
  (if (f32.ge (local.get $z) (local.get $zw))
    (then
      (if (i32.and (f32.le (local.get $z) (f32.add (f32.add (local.get $zw) (f32.load offset=@(PG_H + TR_WWID) (local.get $d))) (f32.const 0.5)))
                   (f32.ge (local.get $y) (f32.const @(+PLAT_Y + TR_WH))))
        (then (return (f32.const @(+PLAT_Y + TR_WH)))))
      (return (f32.const -1000))))
  (if (f32.gt (f32.abs (f32.sub (local.get $z) (local.get $cx))) (local.get $w)) (then (return (f32.const -1000))))
  (local.set $top (f32.const @PLAT_Y))
  (local.set $nt (i32.load offset=@(PG_H + TR_NT) (local.get $d)))
  (block $found
    (!for $k (i32.const 0) (local.get $nt)
      (local.set $a (call $tr_ta (local.get $k)))
      (if (i32.and (f32.ge (local.get $x) (f32.load offset=@TR_T_X0 (local.get $a))) (f32.lt (local.get $x) (f32.load offset=@TR_T_X1 (local.get $a))))
        (then
          (local.set $kind (i32.load offset=@TR_T_KIND (local.get $a)))
          (local.set $e (call $tr_on (local.get $k) (call $p_t (local.get $d))))
          (if (i32.ge_s (local.get $e) (i32.const 0))
            (then
              (if (i32.eq (local.get $kind) (i32.const @TR_K_DROP))
                (then
                  (local.set $c (call $tr_cell (local.get $d) (f32.load offset=@TR_T_X0 (local.get $a)) (local.get $x) (local.get $z)))
                  (if (i32.and (i32.ge_s (local.get $c) (i32.const 0)) (call $tr_drops (local.get $k) (local.get $c)))
                    (then (return (f32.const -1000))))))
              (if (i32.eq (local.get $kind) (i32.const @TR_K_TIP))
                (then (local.set $top (call $tr_tiptop (local.get $d) (call $tr_tilt (local.get $e)) (local.get $z)))))))
          (br $found)))))
  (select (local.get $top) (f32.const -1000) (f32.ge (local.get $y) (local.get $top))))

;; Ball (u, w) of radius r rolling (vx, vz) against the box [xa, xb] x [za, zb]:
;; out of it the nearest way, TR_BOUNCE of its speed into it given back; how
;; fast it came in (-1 if it doesn't touch).
(func $tr_box (param $u f32) (param $w f32) (param $vx f32) (param $vz f32) (param $r f32)
              (param $xa f32) (param $xb f32) (param $za f32) (param $zb f32) (result f32 f32 f32 f32 f32)
  (local $dx f32) (local $dz f32) (local $dd f32) (local $nx f32) (local $nz f32) (local $dep f32) (local $e f32) (local $vn f32)
  (local.set $dx (f32.sub (local.get $u) (!clamp (local.get $u) (local.get $xa) (local.get $xb))))
  (local.set $dz (f32.sub (local.get $w) (!clamp (local.get $w) (local.get $za) (local.get $zb))))
  (local.set $dd (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))))
  (if (f32.ge (local.get $dd) (f32.mul (local.get $r) (local.get $r)))
    (then (return (local.get $u) (local.get $w) (local.get $vx) (local.get $vz) (f32.const -1))))
  (if (f32.gt (local.get $dd) (f32.const 1e-8))
    (then
      (local.set $dd (f32.sqrt (local.get $dd)))
      (local.set $nx (f32.div (local.get $dx) (local.get $dd)))
      (local.set $nz (f32.div (local.get $dz) (local.get $dd)))
      (local.set $dep (f32.sub (local.get $r) (local.get $dd))))
    (else
      ;; its centre in the box: out the nearest side
      (local.set $dep (f32.sub (local.get $u) (local.get $xa)))
      (local.set $nx (f32.const -1))
      (local.set $e (f32.sub (local.get $xb) (local.get $u)))
      (if (f32.lt (local.get $e) (local.get $dep)) (then (local.set $dep (local.get $e)) (local.set $nx (f32.const 1))))
      (local.set $e (f32.sub (local.get $w) (local.get $za)))
      (if (f32.lt (local.get $e) (local.get $dep)) (then (local.set $dep (local.get $e)) (local.set $nx (f32.const 0)) (local.set $nz (f32.const -1))))
      (local.set $e (f32.sub (local.get $zb) (local.get $w)))
      (if (f32.lt (local.get $e) (local.get $dep)) (then (local.set $dep (local.get $e)) (local.set $nx (f32.const 0)) (local.set $nz (f32.const 1))))
      (local.set $dep (f32.add (local.get $dep) (local.get $r)))))
  (local.set $u (!madd (local.get $nx) (local.get $dep) (local.get $u)))
  (local.set $w (!madd (local.get $nz) (local.get $dep) (local.get $w)))
  (local.set $vn (!madd (local.get $vx) (local.get $nx) (f32.mul (local.get $vz) (local.get $nz))))
  (if (f32.lt (local.get $vn) (f32.const 0))
    (then
      (local.set $vx (f32.sub (local.get $vx) (f32.mul (f32.mul (local.get $vn) (f32.const @(1 + TR_BOUNCE))) (local.get $nx))))
      (local.set $vz (f32.sub (local.get $vz) (f32.mul (f32.mul (local.get $vn) (f32.const @(1 + TR_BOUNCE))) (local.get $nz)))))
    (else (local.set $vn (f32.const 0))))
  (local.get $u) (local.get $w) (local.get $vx) (local.get $vz) (f32.neg (local.get $vn)))

;; ---- the traps on a runner (its record at pb on bank d, trap k at record a,
;; tick t into play): each writes only the record and bank d's FX, and says
;; whether the trap had the ball

;; Floor panels: physics is ground's; over a dropped one, it had it.
(func $tr_drop (param $p i32) (param $d i32) (param $pb i32) (param $k i32) (param $a i32) (param $t i32) (result i32)
  (local $c i32) (local $px f32)
  (if (i32.lt_s (call $tr_on (local.get $k) (local.get $t)) (i32.const 0)) (then (return (i32.const 0))))
  (local.set $px (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
  (if (i32.or (f32.lt (local.get $px) (f32.load offset=@TR_T_X0 (local.get $a))) (f32.ge (local.get $px) (f32.load offset=@TR_T_X1 (local.get $a))))
    (then (return (i32.const 0))))
  (local.set $c (call $tr_cell (local.get $d) (f32.load offset=@TR_T_X0 (local.get $a)) (local.get $px) (!at f32 @(PLAYERS + P_PZ) (local.get $pb))))
  (i32.and (i32.ge_s (local.get $c) (i32.const 0)) (call $tr_drops (local.get $k) (local.get $c))))

;; Pistons: their heads a box from the wall out to their faces, under TR_PH.
;; Punching out, one meeting a ball whose centre is in front of it takes it
;; to its face and on toward the edge at TR_SHOVE; otherwise a wall, never
;; left the wall's way.
(func $tr_pist (param $p i32) (param $d i32) (param $pb i32) (param $k i32) (param $a i32) (param $t i32) (result i32)
  (local $e i32) (local $px f32) (local $py f32) (local $pz f32) (local $vx f32) (local $vz f32) (local $r f32) (local $wall f32) (local $face f32) (local $x0 f32) (local $x1 f32) (local $hit f32)
  (local.set $e (call $tr_on (local.get $k) (local.get $t)))
  (if (i32.lt_s (local.get $e) (i32.const 0)) (then (return (i32.const 0))))
  (local.set $py (!at f32 @(PLAYERS + P_PY) (local.get $pb)))
  (if (f32.ge (local.get $py) (f32.const @(+PLAT_Y + TR_PH))) (then (return (i32.const 0))))
  (local.set $px (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
  (local.set $pz (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
  (local.set $vx (!at f32 @(PLAYERS + P_VX) (local.get $pb)))
  (local.set $vz (!at f32 @(PLAYERS + P_VZ) (local.get $pb)))
  (local.set $r (call $b_rad (local.get $pb)))
  (local.set $x0 (f32.load offset=@TR_T_X0 (local.get $a)))
  (local.set $x1 (f32.load offset=@TR_T_X1 (local.get $a)))
  (local.set $wall (f32.add (f32.load offset=@PG_CX (local.get $d)) (f32.load offset=@(PG_H + TR_W) (local.get $d))))
  (local.set $face (f32.sub (local.get $wall)
                            (f32.mul (call $tr_ext (local.get $e)) (f32.mul (f32.load offset=@(PG_H + TR_W) (local.get $d)) (f32.const @(2 * TR_PREACH))))))
  (if (i32.and (i32.and (i32.lt_s (local.get $e) (i32.const @TR_PEXT)) (f32.gt (local.get $pz) (f32.sub (local.get $face) (local.get $r))))
               (i32.and (f32.ge (local.get $px) (local.get $x0)) (f32.le (local.get $px) (local.get $x1))))
    (then
      (local.set $pz (f32.sub (local.get $face) (local.get $r)))
      (if (f32.gt (local.get $vz) (f32.const @(0.5 - TR_SHOVE)))
        (then (call $fx (local.get $d) (i32.const @TR_FX_HIT) (local.get $p) (i32.or (local.get $k) (i32.const @(TR_K_PIST << 8)))
                        (local.get $px) (local.get $py) (local.get $pz) (f32.const @TR_SHOVE))))
      (local.set $vz (f32.min (local.get $vz) (f32.const @(-TR_SHOVE))))
      (!put f32 @(PLAYERS + P_PZ) (local.get $pb) (local.get $pz))
      (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (local.get $vz))
      (return (i32.const 1))))
  (call $tr_box (local.get $px) (local.get $pz) (local.get $vx) (local.get $vz) (local.get $r) (local.get $x0) (local.get $x1) (local.get $face) (f32.const 1e6))
  (local.set $hit) (local.set $vz) (local.set $vx) (local.set $pz) (local.set $px)
  (!put f32 @(PLAYERS + P_PX) (local.get $pb) (local.get $px))
  (!put f32 @(PLAYERS + P_PZ) (local.get $pb) (local.get $pz))
  (!put f32 @(PLAYERS + P_VX) (local.get $pb) (local.get $vx))
  (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (local.get $vz))
  (i32.const 0))

;; The sweeper: against the post, back out at its side; live, touching the
;; bar (the ball's centre within its radius and TR_BW of the bar's axis,
;; along it either way from the post), out of it along the way from the axis
;; to the centre, what of its velocity goes into the bar taken away; and in
;; front of the bar turning, flung on round, out and up (Sweeper's bars, one
;; of them). At rest the bar lies sunk in the floor along the course.
(func $tr_sweep (param $p i32) (param $d i32) (param $pb i32) (param $k i32) (param $a i32) (param $t i32) (result i32)
  (local $fl i32) (local $ang i32) (local $spin i32) (local $flung i32)
  (local $px f32) (local $py f32) (local $pz f32) (local $vx f32) (local $vy f32) (local $vz f32) (local $r f32) (local $rr f32)
  (local $xc f32) (local $zc f32) (local $dx f32) (local $dz f32) (local $d2 f32) (local $hd f32) (local $nx f32) (local $nz f32) (local $vr f32)
  (local $s f32) (local $c f32) (local $len f32) (local $along f32) (local $h f32) (local $dy f32) (local $dist f32)
  (local $nh f32) (local $ny f32) (local $va f32) (local $vh f32) (local $vn f32) (local $u f32) (local $want f32)
  (local.set $fl (!at u8 @(PLAYERS + P_FL) (local.get $pb)))
  (local.set $px (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
  (local.set $py (!at f32 @(PLAYERS + P_PY) (local.get $pb)))
  (local.set $pz (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
  (local.set $vx (!at f32 @(PLAYERS + P_VX) (local.get $pb)))
  (local.set $vy (!at f32 @(PLAYERS + P_VY) (local.get $pb)))
  (local.set $vz (!at f32 @(PLAYERS + P_VZ) (local.get $pb)))
  (local.set $r (call $b_rad (local.get $pb)))
  (local.set $xc (f32.mul (f32.add (f32.load offset=@TR_T_X0 (local.get $a)) (f32.load offset=@TR_T_X1 (local.get $a))) (f32.const 0.5)))
  (local.set $zc (f32.load offset=@PG_CX (local.get $d)))
  (local.set $dx (f32.sub (local.get $px) (local.get $xc)))
  (local.set $dz (f32.sub (local.get $pz) (local.get $zc)))
  ;; the post
  (local.set $rr (f32.add (local.get $r) (f32.const @TR_POST)))
  (local.set $d2 (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))))
  (if (i32.and (f32.lt (local.get $d2) (f32.mul (local.get $rr) (local.get $rr))) (f32.lt (local.get $py) (f32.const @(+PLAT_Y + 2))))
    (then
      (local.set $nx (f32.const -1))
      (local.set $nz (f32.const 0))
      (if (f32.gt (local.get $d2) (f32.const 1e-6))
        (then
          (local.set $hd (f32.sqrt (local.get $d2)))
          (local.set $nx (f32.div (local.get $dx) (local.get $hd)))
          (local.set $nz (f32.div (local.get $dz) (local.get $hd)))))
      (local.set $px (!madd (local.get $nx) (local.get $rr) (local.get $xc)))
      (local.set $pz (!madd (local.get $nz) (local.get $rr) (local.get $zc)))
      (local.set $vr (!madd (local.get $vx) (local.get $nx) (f32.mul (local.get $vz) (local.get $nz))))
      (if (f32.lt (local.get $vr) (f32.const 0))
        (then
          (local.set $vx (f32.sub (local.get $vx) (f32.mul (local.get $nx) (f32.mul (local.get $vr) (f32.const 1.5)))))
          (local.set $vz (f32.sub (local.get $vz) (f32.mul (local.get $nz) (f32.mul (local.get $vr) (f32.const 1.5)))))))
      (local.set $dx (f32.sub (local.get $px) (local.get $xc)))
      (local.set $dz (f32.sub (local.get $pz) (local.get $zc)))))
  ;; the bar: its angle and how far it turned this tick
  (local.set $ang (call $tr_bar (local.get $k) (local.get $t)))
  (local.set $spin (i32.sub (local.get $ang) (call $tr_bar (local.get $k) (i32.sub (local.get $t) (i32.const 1)))))
  (if (i32.lt_s (local.get $spin) (i32.const 0)) (then (local.set $spin (i32.const 0))))
  (call $sincos (local.get $ang))
  (local.set $c) (local.set $s)
  (local.set $len (f32.sub (f32.load offset=@(PG_H + TR_W) (local.get $d)) (f32.const @TR_BIN)))
  (local.set $rr (f32.add (local.get $r) (f32.const @TR_BW)))
  (local.set $dy (f32.sub (f32.add (local.get $py) (local.get $r)) (f32.const @(+PLAT_Y + TR_BY))))
  (if (i32.and (f32.lt (f32.abs (local.get $dy)) (local.get $rr)) (i32.ge_s (call $tr_on (local.get $k) (local.get $t)) (i32.const 0)))
    (then
      ;; along the bar from the post, and across it (+ the way it turns)
      (local.set $along (!madd (local.get $dx) (local.get $c) (f32.mul (local.get $dz) (local.get $s))))
      (local.set $h (f32.sub (f32.mul (local.get $dz) (local.get $c)) (f32.mul (local.get $dx) (local.get $s))))
      (if (i32.and (f32.lt (f32.abs (local.get $along)) (local.get $len))
                   (f32.lt (!madd (local.get $h) (local.get $h) (f32.mul (local.get $dy) (local.get $dy))) (f32.mul (local.get $rr) (local.get $rr))))
        (then
          ;; dead on the axis: out on the side it's coming from
          (if (f32.lt (f32.abs (local.get $h)) (f32.const 1e-3))
            (then (local.set $h (select (f32.const 1e-3) (f32.const -1e-3) (f32.ge (local.get $along) (f32.const 0))))))
          (local.set $dist (f32.sqrt (!madd (local.get $h) (local.get $h) (f32.mul (local.get $dy) (local.get $dy)))))
          (local.set $nh (f32.div (local.get $h) (local.get $dist)))
          (local.set $ny (f32.div (local.get $dy) (local.get $dist)))
          (local.set $h (f32.mul (local.get $nh) (f32.add (local.get $rr) (f32.const 0.01))))
          (local.set $dy (f32.mul (local.get $ny) (f32.add (local.get $rr) (f32.const 0.01))))
          (local.set $px (f32.sub (!madd (local.get $c) (local.get $along) (local.get $xc)) (f32.mul (local.get $s) (local.get $h))))
          (local.set $pz (!madd (local.get $c) (local.get $h) (!madd (local.get $s) (local.get $along) (local.get $zc))))
          (local.set $py (f32.sub (f32.add (local.get $dy) (f32.const @(+PLAT_Y + TR_BY))) (local.get $r)))
          (local.set $fl (i32.and (local.get $fl) (i32.const @(255 ^ PF_GROUND))))
          ;; the velocity along the bar and across it, what goes into the bar (moving at u there) taken away
          (local.set $va (!madd (local.get $vx) (local.get $c) (f32.mul (local.get $vz) (local.get $s))))
          (local.set $vh (f32.sub (f32.mul (local.get $vz) (local.get $c)) (f32.mul (local.get $vx) (local.get $s))))
          (local.set $u (f32.mul (f32.mul (f32.convert_i32_s (local.get $spin)) (f32.const @TR_RAD_TICK)) (local.get $along)))
          (local.set $vn (!madd (f32.sub (local.get $vh) (local.get $u)) (local.get $nh) (f32.mul (local.get $vy) (local.get $ny))))
          (if (f32.lt (local.get $vn) (f32.const 0))
            (then
              (local.set $vh (f32.sub (local.get $vh) (f32.mul (local.get $vn) (local.get $nh))))
              (local.set $vy (f32.sub (local.get $vy) (f32.mul (local.get $vn) (local.get $ny))))))
          ;; in front of the bar turning: flung on round, out and up
          (if (f32.gt (f32.mul (local.get $h) (local.get $u)) (f32.const 0))
            (then
              (local.set $want (f32.min (!madd (f32.abs (local.get $u)) (f32.const @TR_KICK) (f32.const @TR_KICK0)) (f32.const @TR_KMAX)))
              (local.set $vh (select (f32.max (local.get $vh) (local.get $want)) (f32.min (local.get $vh) (f32.neg (local.get $want))) (f32.gt (local.get $h) (f32.const 0))))
              (local.set $va (f32.add (local.get $va) (select (f32.const @TR_OUT) (f32.const @(-TR_OUT)) (f32.ge (local.get $along) (f32.const 0)))))
              (local.set $vy (f32.max (local.get $vy) (f32.const @TR_UP)))
              (local.set $flung (i32.const 1))
              (call $fx (local.get $d) (i32.const @TR_FX_HIT) (local.get $p) (i32.or (local.get $k) (i32.const @(TR_K_SWEEP << 8)))
                        (local.get $px) (local.get $py) (local.get $pz) (local.get $want))))
          (local.set $vx (f32.sub (f32.mul (local.get $va) (local.get $c)) (f32.mul (local.get $vh) (local.get $s))))
          (local.set $vz (!madd (local.get $va) (local.get $s) (f32.mul (local.get $vh) (local.get $c))))))))
  (!chk (local.get $px) 171 (local.get $p))
  (!chk (local.get $py) 172 (local.get $p))
  (!chk (local.get $pz) 173 (local.get $p))
  (!chk (local.get $vx) 174 (local.get $p))
  (!chk (local.get $vy) 175 (local.get $p))
  (!chk (local.get $vz) 176 (local.get $p))
  (!put f32 @(PLAYERS + P_PX) (local.get $pb) (local.get $px))
  (!put f32 @(PLAYERS + P_PY) (local.get $pb) (local.get $py))
  (!put f32 @(PLAYERS + P_PZ) (local.get $pb) (local.get $pz))
  (!put f32 @(PLAYERS + P_VX) (local.get $pb) (local.get $vx))
  (!put f32 @(PLAYERS + P_VY) (local.get $pb) (local.get $vy))
  (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (local.get $vz))
  (!put u8 @(PLAYERS + P_FL) (local.get $pb) (local.get $fl))
  (local.get $flung))

;; The crusher: its block across the course, its bottom where its clock has
;; it. Coming down past the top of a ball whose centre is under it, the ball
;; is crushed through the floor (going out); otherwise, under the ball's top,
;; a wall.
(func $tr_crush (param $p i32) (param $d i32) (param $pb i32) (param $k i32) (param $a i32) (param $t i32) (result i32)
  (local $e i32) (local $fl i32) (local $px f32) (local $py f32) (local $pz f32) (local $vx f32) (local $vz f32) (local $r f32) (local $b f32) (local $xc f32) (local $hit f32)
  (local.set $e (call $tr_on (local.get $k) (local.get $t)))
  (local.set $b (call $tr_crush_b (local.get $e)))
  (local.set $py (!at f32 @(PLAYERS + P_PY) (local.get $pb)))
  (local.set $r (call $b_rad (local.get $pb)))
  (if (f32.ge (local.get $b) (!madd (local.get $r) (f32.const 2) (f32.sub (local.get $py) (f32.const @PLAT_Y)))) (then (return (i32.const 0))))
  (local.set $px (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
  (local.set $pz (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
  (local.set $xc (f32.mul (f32.add (f32.load offset=@TR_T_X0 (local.get $a)) (f32.load offset=@TR_T_X1 (local.get $a))) (f32.const 0.5)))
  (if (i32.and (i32.lt_s (local.get $e) (i32.const @TR_CFALL)) (f32.lt (f32.abs (f32.sub (local.get $px) (local.get $xc))) (f32.const @(TR_CL / 2))))
    (then
      (local.set $fl (!at u8 @(PLAYERS + P_FL) (local.get $pb)))
      (!put u8 @(PLAYERS + P_FL) (local.get $pb) (i32.and (i32.or (local.get $fl) (i32.const @PF_FALL)) (i32.const @(255 ^ PF_GROUND))))
      (!put f32 @(PLAYERS + P_VX) (local.get $pb) (f32.const 0))
      (!put f32 @(PLAYERS + P_VY) (local.get $pb) (f32.const -12))
      (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (f32.const 0))
      (call $fx (local.get $d) (i32.const @TR_FX_HIT) (local.get $p) (i32.or (local.get $k) (i32.const @(TR_K_CRUSH << 8)))
                (local.get $px) (local.get $py) (local.get $pz) (f32.const 12))
      (return (i32.const 1))))
  (local.set $vx (!at f32 @(PLAYERS + P_VX) (local.get $pb)))
  (local.set $vz (!at f32 @(PLAYERS + P_VZ) (local.get $pb)))
  (call $tr_box (local.get $px) (local.get $pz) (local.get $vx) (local.get $vz) (local.get $r)
                (f32.sub (local.get $xc) (f32.const @(TR_CL / 2))) (f32.add (local.get $xc) (f32.const @(TR_CL / 2)))
                (f32.const -1e6) (f32.const 1e6))
  (local.set $hit) (local.set $vz) (local.set $vx) (local.set $pz) (local.set $px)
  (!put f32 @(PLAYERS + P_PX) (local.get $pb) (local.get $px))
  (!put f32 @(PLAYERS + P_VX) (local.get $pb) (local.get $vx))
  (i32.const 0))

;; Air jets: two rows of vents, in every other cell across; while they blow,
;; a ball low over one goes up, back and toward the edge.
(func $tr_jet (param $p i32) (param $d i32) (param $pb i32) (param $k i32) (param $a i32) (param $t i32) (result i32)
  (local $row i32) (local $col i32) (local $c i32) (local $nc i32) (local $fl i32)
  (local $px f32) (local $py f32) (local $pz f32) (local $vy f32) (local $x f32) (local $z f32) (local $zl f32) (local $cw f32) (local $dx f32) (local $dz f32)
  (if (i32.lt_s (call $tr_on (local.get $k) (local.get $t)) (i32.const 0)) (then (return (i32.const 0))))
  (local.set $py (!at f32 @(PLAYERS + P_PY) (local.get $pb)))
  (if (f32.ge (local.get $py) (f32.const @(+PLAT_Y + TR_VTOP))) (then (return (i32.const 0))))
  (local.set $px (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
  (local.set $pz (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
  (local.set $nc (i32.load offset=@(PG_H + TR_NCOL) (local.get $d)))
  (local.set $cw (f32.load offset=@(PG_H + TR_CW) (local.get $d)))
  (local.set $zl (f32.sub (f32.load offset=@PG_CX (local.get $d)) (f32.load offset=@(PG_H + TR_W) (local.get $d))))
  (local.set $col (i32.trunc_sat_f32_s (f32.floor (f32.div (f32.sub (local.get $pz) (local.get $zl)) (local.get $cw)))))
  (if (i32.or (i32.lt_s (local.get $col) (i32.const -1)) (i32.gt_s (local.get $col) (local.get $nc))) (then (return (i32.const 0))))
  (!for $row (i32.const 0) (i32.const 2)
    (local.set $x (select (f32.add (f32.load offset=@TR_T_X0 (local.get $a)) (f32.const @TR_VROW))
                          (f32.sub (f32.load offset=@TR_T_X1 (local.get $a)) (f32.const @TR_VROW))
                          (i32.eqz (local.get $row))))
    (local.set $dx (f32.sub (local.get $px) (local.get $x)))
    (if (f32.lt (f32.abs (local.get $dx)) (f32.const @(TR_VR + TR_VIN)))
      (then
        ;; the vents either side of its cell and its own: (row + column) even
        (!for $c (select (i32.sub (local.get $col) (i32.const 1)) (i32.const 0) (i32.gt_s (local.get $col) (i32.const 0)))
                 (select (i32.add (local.get $col) (i32.const 2)) (local.get $nc) (i32.lt_s (i32.add (local.get $col) (i32.const 2)) (local.get $nc)))
          (if (i32.eqz (i32.and (i32.add (local.get $row) (local.get $c)) (i32.const 1)))
            (then
              (local.set $z (!madd (f32.add (f32.convert_i32_s (local.get $c)) (f32.const 0.5)) (local.get $cw) (local.get $zl)))
              (local.set $dz (f32.sub (local.get $pz) (local.get $z)))
              (if (f32.lt (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))) (f32.const @((TR_VR + TR_VIN) * (TR_VR + TR_VIN))))
                (then
                  (local.set $vy (!at f32 @(PLAYERS + P_VY) (local.get $pb)))
                  (if (f32.lt (local.get $vy) (f32.const @(TR_JETV - 0.5)))
                    (then (call $fx (local.get $d) (i32.const @TR_FX_HIT) (local.get $p) (i32.or (local.get $k) (i32.const @(TR_K_JET << 8)))
                                    (local.get $px) (local.get $py) (local.get $pz) (f32.const @TR_JETV))))
                  (!put f32 @(PLAYERS + P_VY) (local.get $pb) (f32.max (local.get $vy) (f32.const @TR_JETV)))
                  (!put f32 @(PLAYERS + P_VX) (local.get $pb) (f32.min (!at f32 @(PLAYERS + P_VX) (local.get $pb)) (f32.const @(-TR_JETB))))
                  (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (f32.min (!at f32 @(PLAYERS + P_VZ) (local.get $pb)) (f32.const @(-TR_JETS))))
                  (local.set $fl (!at u8 @(PLAYERS + P_FL) (local.get $pb)))
                  (!put u8 @(PLAYERS + P_FL) (local.get $pb) (i32.and (local.get $fl) (i32.const @(255 ^ PF_GROUND))))
                  (return (i32.const 1))))))))))
  (i32.const 0))

;; The tipping floor: a ball on it (not under it, not leaving it faster than
;; TR_SNAPV) is held to its top as it tips away, and pulled down the slope.
(func $tr_tip (param $p i32) (param $d i32) (param $pb i32) (param $k i32) (param $a i32) (param $t i32) (result i32)
  (local $e i32) (local $ang i32) (local $px f32) (local $py f32) (local $pz f32) (local $top f32) (local $s f32) (local $c f32) (local $cx f32) (local $w f32)
  (local.set $e (call $tr_on (local.get $k) (local.get $t)))
  (if (i32.lt_s (local.get $e) (i32.const 0)) (then (return (i32.const 0))))
  (local.set $px (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
  (local.set $pz (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
  (local.set $cx (f32.load offset=@PG_CX (local.get $d)))
  (local.set $w (f32.load offset=@(PG_H + TR_W) (local.get $d)))
  (if (i32.or (i32.or (f32.lt (local.get $px) (f32.load offset=@TR_T_X0 (local.get $a))) (f32.ge (local.get $px) (f32.load offset=@TR_T_X1 (local.get $a))))
              (f32.gt (f32.abs (f32.sub (local.get $pz) (local.get $cx))) (local.get $w)))
    (then (return (i32.const 0))))
  (local.set $ang (call $tr_tilt (local.get $e)))
  (local.set $top (call $tr_tiptop (local.get $d) (local.get $ang) (local.get $pz)))
  (local.set $py (!at f32 @(PLAYERS + P_PY) (local.get $pb)))
  (if (i32.or (i32.or (f32.lt (local.get $py) (f32.sub (local.get $top) (f32.const 0.05)))
                      (f32.gt (local.get $py) (f32.add (local.get $top) (f32.const @TR_SNAP))))
              (f32.gt (!at f32 @(PLAYERS + P_VY) (local.get $pb)) (f32.const @TR_SNAPV)))
    (then (return (i32.const 0))))
  (call $sincos (local.get $ang))
  (local.set $c) (local.set $s)
  (!put f32 @(PLAYERS + P_PY) (local.get $pb) (local.get $top))
  (!put f32 @(PLAYERS + P_VY) (local.get $pb) (f32.const 0))
  (!put f32 @(PLAYERS + P_VZ) (local.get $pb)
    (f32.sub (!at f32 @(PLAYERS + P_VZ) (local.get $pb)) (f32.mul (f32.mul (local.get $s) (local.get $c)) (f32.const @(TR_PULL * DT)))))
  (!put u8 @(PLAYERS + P_FL) (local.get $pb) (i32.or (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @PF_GROUND)))
  (i32.const 1))

;; After a ball's move, on bank d. A trapper: the belt carries it on, the
;; walkway's sides and ends hold it. A runner: the wall on its +z side, the
;; rail on its -z side but along a trap, the pad's back and the pen's end
;; hold it, the pen's mouth carries it in; then each trap in reach, as its
;; clock stands on this bank's tick; one that has it is the ball's last
;; (PG_M); last its score from where it ends up. Writes only its own record
;; and the FX on bank d.
(func $tr_push (param $p i32) (param $d i32)
  (local $pb i32) (local $fl i32) (local $t i32) (local $nt i32) (local $k i32) (local $a i32) (local $kind i32) (local $open i32) (local $had i32) (local $sc i32) (local $j i32)
  (local $px f32) (local $pz f32) (local $vx f32) (local $vz f32) (local $r f32) (local $cx f32) (local $w f32) (local $x f32) (local $lim f32)
  (local.set $pb (i32.add (i32.shl (local.get $p) (i32.const 6)) (local.get $d)))
  (local.set $fl (!at u8 @(PLAYERS + P_FL) (local.get $pb)))
  (if (i32.and (local.get $fl) (i32.const @(PF_FALL | PF_DEAD))) (then (return)))
  (local.set $nt (i32.load offset=@(PG_H + TR_NT) (local.get $d)))
  (if (i32.eqz (local.get $nt)) (then (return)))
  (local.set $px (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
  (local.set $pz (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
  (local.set $vx (!at f32 @(PLAYERS + P_VX) (local.get $pb)))
  (local.set $vz (!at f32 @(PLAYERS + P_VZ) (local.get $pb)))
  (local.set $r (call $b_rad (local.get $pb)))
  (local.set $t (call $p_t (local.get $d)))
  (local.set $cx (f32.load offset=@PG_CX (local.get $d)))
  (local.set $w (f32.load offset=@(PG_H + TR_W) (local.get $d)))
  ;; a trapper on the belt (the walkway past the start line) is carried on; then the ends, both sides of the wall
  (if (i32.and (i32.and (f32.gt (local.get $pz) (f32.add (f32.add (local.get $cx) (local.get $w)) (f32.const @(TR_WALL / 2))))
                        (f32.ge (local.get $px) (f32.load offset=@(PG_H + TR_X0) (local.get $d))))
               (i32.ne (i32.and (local.get $fl) (i32.const @PF_GROUND)) (i32.const 0)))
    (then (local.set $px (f32.add (local.get $px) (f32.const @(TR_BELT * DT))))))
  (local.set $x (f32.add (f32.load offset=@(PG_H + TR_XA) (local.get $d)) (local.get $r)))
  (if (f32.lt (local.get $px) (local.get $x))
    (then
      (local.set $px (local.get $x))
      (if (f32.lt (local.get $vx) (f32.const 0)) (then (local.set $vx (f32.mul (local.get $vx) (f32.const @(-TR_BOUNCE))))))))
  (local.set $x (f32.sub (f32.load offset=@(PG_H + TR_XB) (local.get $d)) (local.get $r)))
  (if (f32.gt (local.get $px) (local.get $x))
    (then
      (local.set $px (local.get $x))
      (if (f32.gt (local.get $vx) (f32.const 0)) (then (local.set $vx (f32.mul (local.get $vx) (f32.const @(-TR_BOUNCE))))))))
  (if (f32.gt (local.get $pz) (f32.add (f32.add (local.get $cx) (local.get $w)) (f32.const @(TR_WALL / 2))))
    (then
      ;; a trapper: held between the walkway's sides
      (local.set $x (f32.add (f32.load offset=@(PG_H + TR_ZW) (local.get $d)) (local.get $r)))
      (if (f32.lt (local.get $pz) (local.get $x))
        (then
          (local.set $pz (local.get $x))
          (if (f32.lt (local.get $vz) (f32.const 0)) (then (local.set $vz (f32.mul (local.get $vz) (f32.const @(-TR_BOUNCE))))))))
      (local.set $x (f32.sub (f32.add (f32.load offset=@(PG_H + TR_ZW) (local.get $d)) (f32.load offset=@(PG_H + TR_WWID) (local.get $d))) (local.get $r)))
      (if (f32.gt (local.get $pz) (local.get $x))
        (then
          (local.set $pz (local.get $x))
          (if (f32.gt (local.get $vz) (f32.const 0)) (then (local.set $vz (f32.mul (local.get $vz) (f32.const @(-TR_BOUNCE))))))))
      (!chk (local.get $px) 177 (local.get $p))
      (!chk (local.get $pz) 178 (local.get $p))
      (!put f32 @(PLAYERS + P_PX) (local.get $pb) (local.get $px))
      (!put f32 @(PLAYERS + P_PZ) (local.get $pb) (local.get $pz))
      (!put f32 @(PLAYERS + P_VX) (local.get $pb) (local.get $vx))
      (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (local.get $vz))
      (return)))
  ;; a runner: the wall; the rail but along a trap (its open edge), while its centre is over the course
  (local.set $lim (f32.sub (local.get $w) (local.get $r)))
  (if (f32.gt (f32.sub (local.get $pz) (local.get $cx)) (local.get $lim))
    (then
      (local.set $pz (f32.add (local.get $cx) (local.get $lim)))
      (if (f32.gt (local.get $vz) (f32.const 0)) (then (local.set $vz (f32.mul (local.get $vz) (f32.const @(-TR_BOUNCE))))))))
  (!for $k (i32.const 0) (local.get $nt)
    (local.set $a (call $tr_ta (local.get $k)))
    (if (i32.and (f32.ge (local.get $px) (f32.load offset=@TR_T_X0 (local.get $a))) (f32.le (local.get $px) (f32.load offset=@TR_T_X1 (local.get $a))))
      (then (local.set $open (i32.const 1)))))
  (if (i32.and (i32.eqz (local.get $open))
               (i32.and (f32.lt (f32.sub (local.get $pz) (local.get $cx)) (f32.neg (local.get $lim))) (f32.gt (local.get $pz) (f32.sub (local.get $cx) (local.get $w)))))
    (then
      (local.set $pz (f32.sub (local.get $cx) (local.get $lim)))
      (if (f32.lt (local.get $vz) (f32.const 0)) (then (local.set $vz (f32.mul (local.get $vz) (f32.const @(-TR_BOUNCE))))))))
  ;; the pen's mouth
  (local.set $x (f32.load offset=@(PG_H + TR_FIN) (local.get $d)))
  (if (i32.and (i32.and (f32.ge (local.get $px) (local.get $x)) (f32.lt (local.get $px) (f32.add (local.get $x) (f32.const @TR_MOUTH))))
               (f32.lt (local.get $vx) (f32.const @TR_THRU)))
    (then (local.set $vx (f32.const @TR_THRU))))
  (!chk (local.get $px) 179 (local.get $p))
  (!chk (local.get $pz) 180 (local.get $p))
  (!put f32 @(PLAYERS + P_PX) (local.get $pb) (local.get $px))
  (!put f32 @(PLAYERS + P_PZ) (local.get $pb) (local.get $pz))
  (!put f32 @(PLAYERS + P_VX) (local.get $pb) (local.get $vx))
  (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (local.get $vz))
  ;; the traps in reach
  (local.set $had (i32.const -1))
  (!for $k (i32.const 0) (local.get $nt)
    (local.set $a (call $tr_ta (local.get $k)))
    (local.set $px (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
    (if (i32.and (f32.gt (local.get $px) (f32.sub (f32.load offset=@TR_T_X0 (local.get $a)) (f32.add (local.get $r) (f32.const 0.5))))
                 (f32.lt (local.get $px) (f32.add (f32.load offset=@TR_T_X1 (local.get $a)) (f32.add (local.get $r) (f32.const 0.5)))))
      (then
        (if (i32.eqz (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @PF_FALL)))
          (then
            (local.set $kind (i32.load offset=@TR_T_KIND (local.get $a)))
            (local.set $j
              (if (result i32) (i32.eq (local.get $kind) (i32.const @TR_K_DROP))
                (then (call $tr_drop (local.get $p) (local.get $d) (local.get $pb) (local.get $k) (local.get $a) (local.get $t)))
                (else (if (result i32) (i32.eq (local.get $kind) (i32.const @TR_K_PIST))
                  (then (call $tr_pist (local.get $p) (local.get $d) (local.get $pb) (local.get $k) (local.get $a) (local.get $t)))
                  (else (if (result i32) (i32.eq (local.get $kind) (i32.const @TR_K_SWEEP))
                    (then (call $tr_sweep (local.get $p) (local.get $d) (local.get $pb) (local.get $k) (local.get $a) (local.get $t)))
                    (else (if (result i32) (i32.eq (local.get $kind) (i32.const @TR_K_CRUSH))
                      (then (call $tr_crush (local.get $p) (local.get $d) (local.get $pb) (local.get $k) (local.get $a) (local.get $t)))
                      (else (if (result i32) (i32.eq (local.get $kind) (i32.const @TR_K_JET))
                        (then (call $tr_jet (local.get $p) (local.get $d) (local.get $pb) (local.get $k) (local.get $a) (local.get $t)))
                        (else (call $tr_tip (local.get $p) (local.get $d) (local.get $pb) (local.get $k) (local.get $a) (local.get $t)))))))))))))
            (if (local.get $j) (then (local.set $had (local.get $k)))))))))
  (if (i32.ge_s (local.get $had) (i32.const 0))
    (then (!put i32 @(PLAYERS + PG_M) (local.get $pb) (i32.or (i32.add (local.get $had) (i32.const 1)) (i32.shl (local.get $t) (i32.const 8))))))
  ;; its score: decimetres down the course, or home in the pen, TR_WIN and the ticks it had left (kept)
  (local.set $sc (!at u16 @(PLAYERS + PG_SCORE) (local.get $pb)))
  (if (i32.lt_u (local.get $sc) (i32.const @TR_WIN))
    (then
      (local.set $px (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
      (if (f32.ge (local.get $px) (f32.load offset=@(PG_H + TR_FIN) (local.get $d)))
        (then
          (local.set $j (i32.sub (i32.load offset=@PG_LEN (local.get $d)) (local.get $t)))
          (local.set $sc (i32.add (i32.const @TR_WIN) (select (local.get $j) (i32.const 0) (i32.gt_s (local.get $j) (i32.const 0))))))
        (else
          (local.set $sc (i32.trunc_sat_f32_u (f32.mul (f32.sub (local.get $px) (f32.load offset=@(PG_H + TR_X0) (local.get $d))) (f32.const @TR_DM))))))
      (!put u16 @(PLAYERS + PG_SCORE) (local.get $pb) (local.get $sc)))))

;; In slot order: a trapper on a pad whose trap is idle arms it (floor panels
;; draw which drop, from the PRNG); a trap that fires says so; a runner newly
;; home takes its place (those home on one tick share it, by their score),
;; the first one cuts the clock to TR_LATE.
(func $tr_tick
  (local $p i32) (local $pb i32) (local $t i32) (local $nt i32) (local $k i32) (local $a i32) (local $c i32) (local $m0 i32) (local $m1 i32) (local $ph i32)
  (local $home i32) (local $new i32) (local $sc i32) (local $place i32)
  (local $px f32) (local $pz f32) (local $dx f32) (local $dz f32) (local $zp f32)
  (local.set $t (call $p_t (i32.const 0)))
  (local.set $nt (i32.load (i32.const @(PG_H + TR_NT))))
  (local.set $zp (f32.add (f32.load (i32.const @(PG_H + TR_ZW))) (f32.const @TR_PADIN)))
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
    (if (i32.and (i32.eq (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @(PF_LIVE | PF_DEAD | PF_FALL | PF_GROUND))) (i32.const @(PF_LIVE | PF_GROUND)))
                 (call $tr_trapper (local.get $pb)))
      (then
        (local.set $px (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
        (local.set $pz (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
        (!for $k (i32.const 0) (local.get $nt)
          (local.set $a (call $tr_ta (local.get $k)))
          (local.set $dx (f32.sub (local.get $px) (f32.load offset=@TR_T_PAD (local.get $a))))
          (local.set $dz (f32.sub (local.get $pz) (local.get $zp)))
          (if (f32.lt (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))) (f32.const @(TR_PADR * TR_PADR)))
            (then
              (call $tr_phase (local.get $k) (local.get $t))
              (drop)
              (local.set $ph)
              (if (i32.eq (local.get $ph) (i32.const @TR_IDLEP))
                (then
                  (i32.store offset=@TR_T_ARM (local.get $a) (i32.add (local.get $t) (i32.const 1)))
                  (i32.store offset=@TR_T_BY (local.get $a) (local.get $p))
                  (local.set $m0 (i32.const 0))
                  (local.set $m1 (i32.const 0))
                  (if (i32.eq (i32.load offset=@TR_T_KIND (local.get $a)) (i32.const @TR_K_DROP))
                    (then
                      (!for $c (i32.const 0) (i32.mul (i32.const @TR_DROWS) (i32.load (i32.const @(PG_H + TR_NCOL))))
                        (if (i32.lt_u (i32.and (call $rand) (i32.const 255)) (i32.const @TR_DODDS))
                          (then
                            (if (i32.lt_u (local.get $c) (i32.const 32))
                              (then (local.set $m0 (i32.or (local.get $m0) (i32.shl (i32.const 1) (local.get $c)))))
                              (else (local.set $m1 (i32.or (local.get $m1) (i32.shl (i32.const 1) (local.get $c)))))))))))
                  (i32.store offset=@TR_T_M0 (local.get $a) (local.get $m0))
                  (i32.store offset=@TR_T_M1 (local.get $a) (local.get $m1))
                  (call $fx (i32.const 0) (i32.const @TR_FX_TRAP) (local.get $p) (local.get $k)
                            (f32.load offset=@TR_T_PAD (local.get $a)) (f32.const @(+PLAT_Y + TR_WH)) (local.get $zp)
                            (f32.convert_i32_u (i32.load offset=@TR_T_KIND (local.get $a))))))))))))
  ;; traps firing
  (!for $k (i32.const 0) (local.get $nt)
    (local.set $a (call $tr_ta (local.get $k)))
    (if (i32.and (i32.ne (i32.load offset=@TR_T_ARM (local.get $a)) (i32.const 0))
                 (i32.eq (local.get $t) (i32.add (i32.load offset=@TR_T_ARM (local.get $a)) (i32.const @(TR_DELAY - 1)))))
      (then
        (call $fx (i32.const 0) (i32.const @TR_FX_TRAP) (i32.load offset=@TR_T_BY (local.get $a)) (i32.or (local.get $k) (i32.const 256))
                  (f32.load offset=@TR_T_PAD (local.get $a)) (f32.const @PLAT_Y) (f32.load (i32.const @PG_CX))
                  (f32.convert_i32_u (i32.load offset=@TR_T_KIND (local.get $a)))))))
  ;; home
  (local.set $home (i32.load (i32.const @(PG_H + TR_HOME))))
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
    (if (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @PF_LIVE))
      (then
        (local.set $sc (!at u16 @(PLAYERS + PG_SCORE) (local.get $pb)))
        (local.set $place (!ld u8 @(PG_S + TR_PLACE) (local.get $p)))
        ;; a newcomer in a slot someone home has left
        (if (i32.and (i32.ne (local.get $place) (i32.const 0)) (i32.lt_u (local.get $sc) (i32.const @TR_WIN)))
          (then (local.set $place (i32.const 0)) (!st u8 @(PG_S + TR_PLACE) (local.get $p) (i32.const 0))))
        (if (i32.and (i32.ge_u (local.get $sc) (i32.const @TR_WIN)) (i32.eqz (local.get $place)))
          (then
            (local.set $place (select (i32.add (local.get $home) (i32.const 1)) (i32.const 255) (i32.lt_u (local.get $home) (i32.const 255))))
            (!st u8 @(PG_S + TR_PLACE) (local.get $p) (local.get $place))
            (!inc $new)
            (local.set $c (i32.const 0))
            (if (i32.eqz (i32.load (i32.const @(PG_H + TR_FIRST))))
              (then
                (i32.store (i32.const @(PG_H + TR_FIRST)) (i32.load (i32.const @HDR_TICK)))
                (if (i32.gt_u (i32.load (i32.const @HDR_UNTIL)) (i32.add (i32.load (i32.const @HDR_TICK)) (i32.const @TR_LATE)))
                  (then (i32.store (i32.const @HDR_UNTIL) (i32.add (i32.load (i32.const @HDR_TICK)) (i32.const @TR_LATE)))))
                (local.set $c (i32.div_u (i32.sub (i32.load (i32.const @HDR_UNTIL)) (i32.load (i32.const @HDR_TICK))) (i32.const 125)))))
            (call $fx (i32.const 0) (i32.const @TR_FX_HOME) (local.get $p) (local.get $c)
                      (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (!at f32 @(PLAYERS + P_PY) (local.get $pb)) (!at f32 @(PLAYERS + P_PZ) (local.get $pb))
                      (f32.convert_i32_u (local.get $place))))))))
  (i32.store (i32.const @(PG_H + TR_HOME)) (i32.add (local.get $home) (local.get $new))))

;; Over when no runner is still out on the course.
(func $tr_over (result i32)
  (local $p i32) (local $pb i32)
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
    (if (i32.and (i32.eq (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @(PF_LIVE | PF_DEAD))) (i32.const @PF_LIVE))
                 (i32.lt_u (!at u16 @(PLAYERS + PG_SCORE) (local.get $pb)) (i32.const @TR_TRAP0)))
      (then (return (i32.const 0)))))
  (i32.const 1))

;; Runner p is out: if a trap had it within TR_CREDIT, the trapper who armed
;; that trap, still in, took it: one more taken, its score one up.
(func $tr_out (param $p i32)
  (local $pb i32) (local $m i32) (local $k i32) (local $by i32) (local $qb i32) (local $sc i32)
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (if (call $tr_trapper (local.get $pb)) (then (return)))
  (local.set $m (!at i32 @(PLAYERS + PG_M) (local.get $pb)))
  (local.set $k (i32.sub (i32.and (local.get $m) (i32.const 255)) (i32.const 1)))
  (if (i32.or (i32.lt_s (local.get $k) (i32.const 0)) (i32.ge_s (local.get $k) (i32.load (i32.const @(PG_H + TR_NT))))) (then (return)))
  (if (i32.ge_u (i32.sub (call $p_t (i32.const 0)) (i32.shr_u (local.get $m) (i32.const 8))) (i32.const @TR_CREDIT)) (then (return)))
  (local.set $by (i32.load offset=@TR_T_BY (call $tr_ta (local.get $k))))
  (local.set $qb (i32.shl (local.get $by) (i32.const 6)))
  (if (i32.or (i32.eqz (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $qb)) (i32.const @PF_LIVE))) (i32.eqz (call $tr_trapper (local.get $qb)))) (then (return)))
  (local.set $sc (!ld u8 @(PG_S + TR_KILLS) (local.get $by)))
  (if (i32.lt_u (local.get $sc) (i32.const 255))
    (then
      (local.set $sc (i32.add (local.get $sc) (i32.const 1)))
      (!st u8 @(PG_S + TR_KILLS) (local.get $by) (local.get $sc))
      (!put u16 @(PLAYERS + PG_SCORE) (local.get $qb) (i32.add (i32.const @TR_TRAP0) (local.get $sc)))))
  (i32.store (i32.const @(PG_H + TR_TAKEN)) (i32.add (i32.load (i32.const @(PG_H + TR_TAKEN))) (i32.const 1)))
  (call $fx (i32.const 0) (i32.const @TR_FX_TAKEN) (local.get $p) (local.get $by)
            (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (f32.max (!at f32 @(PLAYERS + P_PY) (local.get $pb)) (f32.const @PLAT_Y)) (!at f32 @(PLAYERS + P_PZ) (local.get $pb))
            (f32.convert_i32_u (i32.load offset=@TR_T_KIND (call $tr_ta (local.get $k))))))
