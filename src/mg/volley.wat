;; VOLLEYBALL: red against blue (PGF_TEAMS) on a court in two halves, red's
;; at low x and blue's at high x, split by a net VB_NET_H high that no ball
;; crosses, walled round. Each half is VB_AREA m² for every ball of the
;; bigger side, twice as wide as deep to VB_HXMAX deep, then wider.
;; Volleyballs, one for every VB_PER balls, each in a lane of the court's
;; width, VB_R across and falling VB_G a tick, are served from one side's
;; back line over the net to a spot on the other's. A ball in play whose
;; centre comes within its radius plus VB_R of one touches it: the volleyball
;; goes on the way the ball rolls, faster the faster it rolls, and up; a ball
;; in the air (a hop, VB_HOP here) spikes it, harder and higher, always on
;; toward the net, unless it comes in too fast (a dig, a bump). A volleyball
;; that lands on a side's floor is a point for the other side (PG_TSCORE),
;; two of its own to the ball whose touch sent it there, and the scorer
;; serves it again VB_PAUSE later; a side's fourth touch in a row is the
;; other side's point too. Every touch is a point of the ball's own
;; (PG_SCORE, how the losers place). First to VB_GOAL wins; at the clock the
;; side with more, or a draw.
;;
;; The volleyballs are the confirmed world's, in PG_S: a touch is ball
;; against a sim object, judged in tick on the records as they stand, so it
;; comes a round trip late, and it never moves the ball (only its PG_SCORE).
;; The prediction runs only the net and the walls, by the ball's own side in
;; its record, so it is exact; the page flies each volleyball on to the
;; prediction's tick as $vb_fly flies it.


;; A volleyball's record, and a slot's.
(func $vb_b (param $k i32) (result i32)
  (i32.add (i32.const @(PG_S + VB_BALL)) (i32.mul (local.get $k) (i32.const @VB_BSIZE))))
(func $vb_s (param $p i32) (result i32)
  (i32.add (i32.const @(PG_S + VB_SLOT)) (i32.shl (local.get $p) (i32.const 3))))

;; Side s's way from the net to its back line: -1 red, 1 blue.
(func $vb_dir (param $s i32) (result f32)
  (select (f32.const 1) (f32.const -1) (local.get $s)))

;; The court for the crowd, the volleyballs and the target; every volleyball
;; waiting to be served, the first VB_FIRST into play and each next one
;; VB_STAGGER on, from a side the round's seed picks and then the other. A
;; half of area A is square, sqrt(A / 2) deep and twice that wide, to
;; VB_HXMAX deep (three touches carry a volleyball that far), then wider.
(func $vb_setup (param $n i32)
  (local $m f32) (local $a f32) (local $hx f32) (local $hz f32) (local $nb i32) (local $k i32) (local $b i32) (local $s0 i32)
  (local.set $m (f32.convert_i32_u (i32.shr_u (i32.add (local.get $n) (i32.const 1)) (i32.const 1))))
  (local.set $a (f32.max (f32.mul (local.get $m) (f32.const @VB_AREA)) (f32.const @VB_AMIN)))
  (local.set $hx (f32.min (f32.sqrt (f32.mul (local.get $a) (f32.const 0.5))) (f32.const @VB_HXMAX)))
  (local.set $hz (f32.div (local.get $a) (f32.mul (local.get $hx) (f32.const 2))))
  (!chk (local.get $hz) 370 (local.get $n))
  (local.set $nb (i32.div_u (i32.add (local.get $n) (i32.const @(VB_PER - 1))) (i32.const @VB_PER)))
  (if (i32.lt_u (local.get $nb) (i32.const @VB_NMIN)) (then (local.set $nb (i32.const @VB_NMIN))))
  (if (i32.gt_u (local.get $nb) (i32.const @VB_NMAX)) (then (local.set $nb (i32.const @VB_NMAX))))
  (i32.store (i32.const @PG_KIND) (i32.const @PK_SCORE))
  (i32.store (i32.const @PG_LEN) (i32.const @VB_LEN))
  (i32.store (i32.const @PG_FLAGS) (i32.const @(PGF_BUMPS | PGF_TEAMS)))
  (f32.store (i32.const @PG_ACC) (f32.const @VB_ACC))
  (f32.store (i32.const @PG_IDLE) (f32.const @VB_IDLE))
  (f32.store (i32.const @PG_HOP) (f32.const @VB_HOP))
  (f32.store (i32.const @PG_SIZE) (local.get $hz))
  (f32.store (i32.const @(PG_H + VB_HX)) (local.get $hx))
  (f32.store (i32.const @(PG_H + VB_HZ)) (local.get $hz))
  (i32.store (i32.const @(PG_H + VB_NB)) (local.get $nb))
  (i32.store (i32.const @(PG_H + VB_GOAL)) (i32.add (i32.const @VB_GOAL0) (i32.mul (i32.sub (local.get $nb) (i32.const 1)) (i32.const @VB_GOALK))))
  (local.set $s0 (i32.and (call $p_seed (i32.const 0x7b0011)) (i32.const 1)))
  (!for $k (i32.const 0) (local.get $nb)
    (local.set $b (call $vb_b (local.get $k)))
    (i32.store8 offset=@VB_BST (local.get $b) (i32.const @VB_WAIT))
    (i32.store8 offset=@VB_BBY (local.get $b) (i32.const 255))
    (i32.store8 offset=@VB_BSIDE (local.get $b) (i32.const 255))
    (i32.store offset=@VB_BNEXT (local.get $b) (i32.add (i32.const @VB_FIRST) (i32.mul (local.get $k) (i32.const @VB_STAGGER))))
    (i32.store8 offset=@VB_BSERVE (local.get $b) (i32.and (i32.add (local.get $k) (local.get $s0)) (i32.const 1)))
    (call $vb_at_serve (local.get $k))))

;; Volleyball k's lane: the middle of its share of the court's width.
(func $vb_lane (param $k i32) (result f32)
  (!madd (f32.sub (f32.div (f32.mul (f32.add (f32.convert_i32_u (local.get $k)) (f32.const 0.5)) (f32.const 2))
                           (f32.convert_i32_u (i32.load (i32.const @(PG_H + VB_NB)))))
                  (f32.const 1))
         (f32.load (i32.const @(PG_H + VB_HZ))) (f32.load (i32.const @PG_CX))))

;; Volleyball k where its server will serve it from, still.
(func $vb_at_serve (param $k i32)
  (local $b i32)
  (local.set $b (call $vb_b (local.get $k)))
  (f32.store offset=@VB_BX (local.get $b)
    (!madd (call $vb_dir (i32.load8_u offset=@VB_BSERVE (local.get $b))) (f32.sub (f32.load (i32.const @(PG_H + VB_HX))) (f32.const @VB_SBACK)) (f32.load (i32.const @PG_CX))))
  (f32.store offset=@VB_BY (local.get $b) (f32.const @(+PLAT_Y + VB_SY)))
  (f32.store offset=@VB_BZ (local.get $b) (call $vb_lane (local.get $k)))
  (f32.store offset=@VB_BVX (local.get $b) (f32.const 0))
  (f32.store offset=@VB_BVY (local.get $b) (f32.const 0))
  (f32.store offset=@VB_BVZ (local.get $b) (f32.const 0)))

;; As the round is laid out, ball PG_TK of its side's PG_TN in a grid over its
;; half, its cells about square; a newcomer at its back line, k of 1024 across.
(func $vb_spawn (param $i i32) (param $n i32) (result f32 f32 f32)
  (local $s i32) (local $k i32) (local $m i32) (local $cols i32) (local $rows i32)
  (local $dir f32) (local $hx f32) (local $hz f32) (local $cx f32)
  (local.set $s (i32.load (i32.const @PG_TSIDE)))
  (local.set $dir (call $vb_dir (local.get $s)))
  (local.set $hx (f32.load (i32.const @(PG_H + VB_HX))))
  (local.set $hz (f32.load (i32.const @(PG_H + VB_HZ))))
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (if (i32.eq (i32.load (i32.const @HDR_STATE)) (i32.const @H_PLAY))
    (then
      (return
        (!madd (local.get $dir) (f32.sub (local.get $hx) (f32.const 1.5)) (local.get $cx))
        (f32.const @PLAT_Y)
        (!madd (f32.sub (f32.mul (f32.convert_i32_u (i32.and (local.get $i) (i32.const 1023))) (f32.const @(2 / 1023))) (f32.const 1))
               (f32.sub (local.get $hz) (f32.const 1.5)) (local.get $cx)))))
  (local.set $k (i32.load (i32.const @PG_TK)))
  (local.set $m (i32.and (i32.shr_u (i32.load (i32.const @PG_TN)) (i32.shl (local.get $s) (i32.const 4))) (i32.const 0xffff)))
  (if (i32.eqz (local.get $m)) (then (local.set $m (i32.const 1))))
  (local.set $cols (i32.trunc_sat_f32_u (f32.nearest (f32.sqrt (f32.div (f32.mul (f32.convert_i32_u (local.get $m)) (f32.mul (local.get $hz) (f32.const 2))) (local.get $hx))))))
  (if (i32.eqz (local.get $cols)) (then (local.set $cols (i32.const 1))))
  (local.set $rows (i32.div_u (i32.add (local.get $m) (i32.sub (local.get $cols) (i32.const 1))) (local.get $cols)))
  (!madd (local.get $dir)
         (f32.div (f32.mul (local.get $hx) (f32.add (f32.convert_i32_u (i32.div_u (local.get $k) (local.get $cols))) (f32.const 0.5))) (f32.convert_i32_u (local.get $rows)))
         (local.get $cx))
  (f32.const @PLAT_Y)
  (!madd (f32.sub (f32.div (f32.mul (f32.add (f32.convert_i32_u (i32.rem_u (local.get $k) (local.get $cols))) (f32.const 0.5)) (f32.const 2)) (f32.convert_i32_u (local.get $cols)))
                  (f32.const 1))
         (local.get $hz) (local.get $cx)))

(func $vb_start)
(func $vb_begin (param $p i32) (param $d i32))

;; A floor without end: the net and the walls (in push) keep a ball on its half.
(func $vb_ground (param $d i32) (param $x f32) (param $y f32) (param $z f32) (result f32)
  (select (f32.const @PLAT_Y) (f32.const -1000) (f32.ge (local.get $y) (f32.const @PLAT_Y))))

;; Ball p on bank d after its roll: kept on its own half, bouncing softly off
;; the net, the back line and the walls. Its side is in its record.
(func $vb_push (param $p i32) (param $d i32)
  (local $pb i32) (local $r f32) (local $cx f32) (local $hx f32) (local $hz f32)
  (local $lo f32) (local $hi f32) (local $px f32) (local $pz f32) (local $vx f32) (local $vz f32)
  (local.set $pb (i32.add (i32.shl (local.get $p) (i32.const 6)) (local.get $d)))
  (local.set $r (call $b_rad (local.get $pb)))
  (local.set $cx (f32.load offset=@PG_CX (local.get $d)))
  (local.set $hx (f32.load offset=@(PG_H + VB_HX) (local.get $d)))
  (local.set $hz (f32.load offset=@(PG_H + VB_HZ) (local.get $d)))
  (if (call $p_side (local.get $pb))
    (then (local.set $lo (f32.add (local.get $cx) (local.get $r)))
          (local.set $hi (f32.sub (f32.add (local.get $cx) (local.get $hx)) (local.get $r))))
    (else (local.set $lo (f32.add (f32.sub (local.get $cx) (local.get $hx)) (local.get $r)))
          (local.set $hi (f32.sub (local.get $cx) (local.get $r)))))
  (local.set $px (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
  (local.set $pz (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
  (local.set $vx (!at f32 @(PLAYERS + P_VX) (local.get $pb)))
  (local.set $vz (!at f32 @(PLAYERS + P_VZ) (local.get $pb)))
  (if (f32.lt (local.get $px) (local.get $lo))
    (then (local.set $px (local.get $lo)) (if (f32.lt (local.get $vx) (f32.const 0)) (then (local.set $vx (f32.mul (local.get $vx) (f32.const @(-VB_PE))))))))
  (if (f32.gt (local.get $px) (local.get $hi))
    (then (local.set $px (local.get $hi)) (if (f32.gt (local.get $vx) (f32.const 0)) (then (local.set $vx (f32.mul (local.get $vx) (f32.const @(-VB_PE))))))))
  (local.set $lo (f32.add (f32.sub (local.get $cx) (local.get $hz)) (local.get $r)))
  (local.set $hi (f32.sub (f32.add (local.get $cx) (local.get $hz)) (local.get $r)))
  (if (f32.lt (local.get $pz) (local.get $lo))
    (then (local.set $pz (local.get $lo)) (if (f32.lt (local.get $vz) (f32.const 0)) (then (local.set $vz (f32.mul (local.get $vz) (f32.const @(-VB_PE))))))))
  (if (f32.gt (local.get $pz) (local.get $hi))
    (then (local.set $pz (local.get $hi)) (if (f32.gt (local.get $vz) (f32.const 0)) (then (local.set $vz (f32.mul (local.get $vz) (f32.const @(-VB_PE))))))))
  (!chk (local.get $px) 371 (local.get $p))
  (!chk (local.get $pz) 372 (local.get $p))
  (!put f32 @(PLAYERS + P_PX) (local.get $pb) (local.get $px))
  (!put f32 @(PLAYERS + P_PZ) (local.get $pb) (local.get $pz))
  (!put f32 @(PLAYERS + P_VX) (local.get $pb) (local.get $vx))
  (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (local.get $vz)))

;; Volleyball k served on tick t into play by its VB_BSERVE side: from its
;; spot to one VB_SD0 to VB_SD1 of the other half deep in its lane (from the
;; PRNG), VB_ST0 plus VB_STK s a metre in the air, or long enough that it
;; passes the net VB_SCLEAR over it: on a parabola from height y0 to yT over
;; T s, the height a share f of the way along is y0 + (yT - y0) f + g T² f (1 - f) / 2.
(func $vb_serve (param $k i32) (param $t i32)
  (local $b i32) (local $s i32) (local $cx f32) (local $hx f32) (local $hz f32) (local $lw f32)
  (local $x0 f32) (local $z0 f32) (local $xt f32) (local $zt f32) (local $dx f32) (local $dz f32) (local $tt f32) (local $fr f32) (local $need f32)
  (local.set $b (call $vb_b (local.get $k)))
  (local.set $s (i32.load8_u offset=@VB_BSERVE (local.get $b)))
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (local.set $hx (f32.load (i32.const @(PG_H + VB_HX))))
  (local.set $hz (f32.load (i32.const @(PG_H + VB_HZ))))
  (call $vb_at_serve (local.get $k))
  (local.set $x0 (f32.load offset=@VB_BX (local.get $b)))
  (local.set $z0 (f32.load offset=@VB_BZ (local.get $b)))
  (local.set $lw (f32.div (local.get $hz) (f32.convert_i32_u (i32.load (i32.const @(PG_H + VB_NB))))))
  (local.set $xt (!madd (f32.neg (call $vb_dir (local.get $s)))
                        (f32.mul (local.get $hx) (!madd (call $p_unit) (f32.const @(VB_SD1 - VB_SD0)) (f32.const @VB_SD0)))
                        (local.get $cx)))
  (local.set $zt (!madd (f32.sub (call $p_unit) (f32.const 0.5)) (f32.mul (local.get $lw) (f32.const 1.6)) (local.get $z0)))
  (local.set $zt (f32.min (f32.max (local.get $zt) (f32.add (f32.sub (local.get $cx) (local.get $hz)) (f32.const @(VB_R + 0.5))))
                          (f32.sub (f32.add (local.get $cx) (local.get $hz)) (f32.const @(VB_R + 0.5)))))
  (local.set $dx (f32.sub (local.get $xt) (local.get $x0)))
  (local.set $dz (f32.sub (local.get $zt) (local.get $z0)))
  (local.set $tt (!madd (f32.sqrt (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz)))) (f32.const @VB_STK) (f32.const @VB_ST0)))
  ;; long enough to pass the net VB_SCLEAR over it: the share of the way to the net
  (local.set $fr (f32.div (f32.abs (f32.sub (local.get $x0) (local.get $cx))) (f32.abs (local.get $dx))))
  (local.set $need (f32.div (f32.sub (f32.const @(VB_NET_H + VB_R + VB_SCLEAR - VB_SY)) (f32.mul (f32.const @(VB_R - VB_SY)) (local.get $fr)))
                            (f32.mul (f32.const @(VB_G / +DT / 2)) (f32.mul (local.get $fr) (f32.sub (f32.const 1) (local.get $fr))))))
  (local.set $tt (f32.max (local.get $tt) (f32.sqrt (f32.max (local.get $need) (f32.const 0)))))
  (!chk (local.get $tt) 373 (local.get $k))
  (f32.store offset=@VB_BVX (local.get $b) (f32.div (local.get $dx) (local.get $tt)))
  (f32.store offset=@VB_BVZ (local.get $b) (f32.div (local.get $dz) (local.get $tt)))
  (f32.store offset=@VB_BVY (local.get $b)
    (f32.div (!madd (f32.mul (local.get $tt) (local.get $tt)) (f32.const @(VB_G / +DT / 2)) (f32.const @(VB_R - VB_SY))) (local.get $tt)))
  (i32.store8 offset=@VB_BST (local.get $b) (i32.const @VB_FLY))
  (i32.store8 offset=@VB_BBY (local.get $b) (i32.const 255))
  (i32.store8 offset=@VB_BSIDE (local.get $b) (i32.const 255))
  (i32.store8 offset=@VB_BN (local.get $b) (i32.const 0))
  (i32.store offset=@VB_BAT (local.get $b) (i32.sub (local.get $t) (i32.const @VB_COOL)))
  (call $fx (i32.const 0) (i32.const @VB_FX_SERVE) (i32.const 255) (i32.or (local.get $k) (i32.shl (local.get $s) (i32.const 8)))
            (local.get $x0) (f32.load offset=@VB_BY (local.get $b)) (local.get $z0) (local.get $tt)))

;; Volleyball k dead (no touch scores or counts) and side s's point, on tick t
;; into play: two of the ball's own to its last toucher if it was s's (not
;; for a fourth touch, why 1), and it's s's to serve VB_PAUSE on.
(func $vb_point (param $k i32) (param $s i32) (param $why i32) (param $t i32)
  (local $b i32) (local $by i32) (local $bb i32)
  (local.set $b (call $vb_b (local.get $k)))
  (local.set $by (i32.load8_u offset=@VB_BBY (local.get $b)))
  (call $p_tadd (local.get $s) (i32.const 1))
  (if (i32.and (i32.and (i32.eqz (local.get $why)) (i32.eq (i32.load8_u offset=@VB_BSIDE (local.get $b)) (local.get $s)))
               (i32.lt_u (local.get $by) (i32.const @NPLAYER)))
    (then
      (local.set $bb (i32.shl (local.get $by) (i32.const 6)))
      (if (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $bb)) (i32.const @PF_LIVE))
        (then
          (!put u16 @(PLAYERS + PG_SCORE) (local.get $bb) (i32.add (!at u16 @(PLAYERS + PG_SCORE) (local.get $bb)) (i32.const 2)))
          (i32.store16 offset=@VB_KILLS (call $vb_s (local.get $by)) (i32.add (i32.load16_u offset=@VB_KILLS (call $vb_s (local.get $by))) (i32.const 1)))))))
  (i32.store8 offset=@VB_BST (local.get $b) (i32.const @VB_DEAD))
  (i32.store offset=@VB_BNEXT (local.get $b) (i32.add (local.get $t) (i32.const @VB_PAUSE)))
  (i32.store8 offset=@VB_BSERVE (local.get $b) (local.get $s))
  (call $fx (i32.const 0) (i32.const @VB_FX_POINT) (local.get $by) (i32.or (i32.or (local.get $k) (i32.shl (local.get $s) (i32.const 8))) (i32.shl (local.get $why) (i32.const 9)))
            (f32.load offset=@VB_BX (local.get $b)) (f32.load offset=@VB_BY (local.get $b)) (f32.load offset=@VB_BZ (local.get $b))
            (f32.convert_i32_u (i32.load (i32.add (i32.const @PG_TSCORE) (i32.shl (local.get $s) (i32.const 2)))))))

;; Volleyball k flying, on tick t into play: the first ball in play (in slot
;; order) whose centre is within its radius plus VB_R of the volleyball's,
;; past VB_GAP since its last touch (VB_COOL for the ball that made it),
;; touches it. Rolling, it goes on the way the ball rolls (slow, straight
;; toward the net), VB_BUMP0 plus VB_BUMPK of the ball's speed and VB_BUMPUP
;; up; in the air, a spike, at least VB_FWD of it toward the net, VB_SPIKE0
;; plus VB_SPIKEK of its speed and VB_SPIKEUP up, unless the volleyball comes
;; in faster than VB_DIG flat (a dig: a bump). A side's touch past VB_MAXT
;; in a row is the other side's point instead.

(func $vb_touch (param $k i32) (param $t i32)
  (local $b i32) (local $q i32) (local $qb i32) (local $side i32) (local $air i32) (local $n i32) (local $sb i32)
  (local $x f32) (local $y f32) (local $z f32) (local $r f32) (local $rs f32) (local $dx f32) (local $dy f32) (local $dz f32)
  (local $bvx f32) (local $bvz f32) (local $sp f32) (local $ux f32) (local $uz f32) (local $h f32) (local $tn f32)
  (local.set $b (call $vb_b (local.get $k)))
  (if (i32.lt_s (i32.sub (local.get $t) (i32.load offset=@VB_BAT (local.get $b))) (i32.const @VB_GAP)) (then (return)))
  (local.set $x (f32.load offset=@VB_BX (local.get $b)))
  (local.set $y (f32.load offset=@VB_BY (local.get $b)))
  (local.set $z (f32.load offset=@VB_BZ (local.get $b)))
  (block $found
    (!for $q (i32.const 0) (i32.const @NPLAYER)
      (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
      (if (call $p_in (local.get $qb))
        (then
          (local.set $r (call $b_rad (local.get $qb)))
          (local.set $rs (f32.add (local.get $r) (f32.const @VB_R)))
          (local.set $dx (f32.sub (local.get $x) (!at f32 @(PLAYERS + P_PX) (local.get $qb))))
          (local.set $dz (f32.sub (local.get $z) (!at f32 @(PLAYERS + P_PZ) (local.get $qb))))
          (if (i32.and (f32.lt (f32.abs (local.get $dx)) (local.get $rs)) (f32.lt (f32.abs (local.get $dz)) (local.get $rs)))
            (then
              (local.set $dy (f32.sub (local.get $y) (f32.add (!at f32 @(PLAYERS + P_PY) (local.get $qb)) (local.get $r))))
              (if (i32.and (f32.lt (!dot3 (local.get $dx) (local.get $dy) (local.get $dz) (local.get $dx) (local.get $dy) (local.get $dz)) (f32.mul (local.get $rs) (local.get $rs)))
                           (i32.or (i32.ne (local.get $q) (i32.load8_u offset=@VB_BBY (local.get $b)))
                                   (i32.ge_s (i32.sub (local.get $t) (i32.load offset=@VB_BAT (local.get $b))) (i32.const @VB_COOL))))
                (then (br $found))))))))
    (return))
  ;; ball q touches it
  (local.set $side (call $p_side (local.get $qb)))
  (local.set $tn (f32.neg (call $vb_dir (local.get $side))))
  ;; a spike from the air, unless the volleyball comes in too fast to (then a dig)
  (local.set $air (i32.and (i32.eqz (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $qb)) (i32.const @PF_GROUND)))
                           (f32.lt (!madd (f32.load offset=@VB_BVX (local.get $b)) (f32.load offset=@VB_BVX (local.get $b))
                                          (f32.mul (f32.load offset=@VB_BVZ (local.get $b)) (f32.load offset=@VB_BVZ (local.get $b))))
                                   (f32.const @(VB_DIG * VB_DIG)))))
  (local.set $bvx (!at f32 @(PLAYERS + P_VX) (local.get $qb)))
  (local.set $bvz (!at f32 @(PLAYERS + P_VZ) (local.get $qb)))
  (local.set $sp (f32.sqrt (!madd (local.get $bvx) (local.get $bvx) (f32.mul (local.get $bvz) (local.get $bvz)))))
  (if (f32.gt (local.get $sp) (f32.const @VB_SLOW))
    (then (local.set $ux (f32.div (local.get $bvx) (local.get $sp))) (local.set $uz (f32.div (local.get $bvz) (local.get $sp))))
    (else (local.set $ux (local.get $tn)) (local.set $uz (f32.const 0))))
  (if (local.get $air)
    (then
      ;; a spike: on over the net, at least VB_FWD of the way toward it
      (if (f32.lt (f32.mul (local.get $ux) (local.get $tn)) (f32.const @VB_FWD))
        (then
          (local.set $ux (f32.mul (local.get $tn) (f32.const @VB_FWD)))
          (local.set $uz (f32.copysign (f32.const @(Math.sqrt(1 - VB_FWD * VB_FWD))) (local.get $uz)))))
      (local.set $h (f32.min (!madd (local.get $sp) (f32.const @VB_SPIKEK) (f32.const @VB_SPIKE0)) (f32.const @VB_SPIKEMAX))))
    (else (local.set $h (f32.min (!madd (local.get $sp) (f32.const @VB_BUMPK) (f32.const @VB_BUMP0)) (f32.const @VB_BUMPMAX)))))
  ;; the run of touches: the side's, one more; else the other side's first
  (if (i32.eq (i32.load8_u offset=@VB_BSIDE (local.get $b)) (local.get $side))
    (then (local.set $n (i32.add (i32.load8_u offset=@VB_BN (local.get $b)) (i32.const 1))))
    (else (local.set $n (i32.const 1))))
  (i32.store8 offset=@VB_BBY (local.get $b) (local.get $q))
  (i32.store8 offset=@VB_BSIDE (local.get $b) (local.get $side))
  (i32.store8 offset=@VB_BN (local.get $b) (local.get $n))
  (i32.store offset=@VB_BAT (local.get $b) (local.get $t))
  (local.set $sb (call $vb_s (local.get $q)))
  (if (i32.gt_u (local.get $n) (i32.const @VB_MAXT))
    (then
      (i32.store16 offset=@VB_FAULTS (local.get $sb) (i32.add (i32.load16_u offset=@VB_FAULTS (local.get $sb)) (i32.const 1)))
      (call $vb_point (local.get $k) (i32.sub (i32.const 1) (local.get $side)) (i32.const 1) (local.get $t))
      (return)))
  (!chk (local.get $h) 374 (local.get $k))
  (f32.store offset=@VB_BVX (local.get $b) (f32.mul (local.get $ux) (local.get $h)))
  (f32.store offset=@VB_BVY (local.get $b) (select (f32.const @VB_SPIKEUP) (f32.const @VB_BUMPUP) (local.get $air)))
  (f32.store offset=@VB_BVZ (local.get $b) (f32.mul (local.get $uz) (local.get $h)))
  (i32.store16 offset=@VB_TOUCHES (local.get $sb) (i32.add (i32.load16_u offset=@VB_TOUCHES (local.get $sb)) (i32.const 1)))
  (if (local.get $air) (then (i32.store16 offset=@VB_SPIKES (local.get $sb) (i32.add (i32.load16_u offset=@VB_SPIKES (local.get $sb)) (i32.const 1)))))
  (!put u16 @(PLAYERS + PG_SCORE) (local.get $qb) (i32.add (!at u16 @(PLAYERS + PG_SCORE) (local.get $qb)) (i32.const 1)))
  (call $fx (i32.const 0) (i32.const @VB_FX_TOUCH) (local.get $q) (i32.or (i32.or (local.get $k) (i32.shl (local.get $air) (i32.const 8))) (i32.shl (local.get $n) (i32.const 9)))
            (local.get $x) (local.get $y) (local.get $z) (local.get $h)))

;; Volleyball k's tick, flying or dead, on tick t into play: down VB_G
;; (unless it lies still, rolling), on a step; flying, the touches; then the
;; net (a wall VB_NET_H high, its top a rounded edge), the court's walls at
;; any height and the floor. Flying, the floor is a point for the side whose
;; floor it isn't; dead, it bounces and settles.
(func $vb_fly (param $k i32) (param $t i32)
  (local $b i32) (local $st i32)
  (local $x f32) (local $y f32) (local $z f32) (local $vx f32) (local $vy f32) (local $vz f32)
  (local $cx f32) (local $lo f32) (local $hi f32) (local $dx f32) (local $dy f32) (local $d2 f32) (local $d f32) (local $nx f32) (local $ny f32) (local $vn f32)
  (local.set $b (call $vb_b (local.get $k)))
  (local.set $st (i32.load8_u offset=@VB_BST (local.get $b)))
  (local.set $x (f32.load offset=@VB_BX (local.get $b)))
  (local.set $y (f32.load offset=@VB_BY (local.get $b)))
  (local.set $z (f32.load offset=@VB_BZ (local.get $b)))
  (local.set $vx (f32.load offset=@VB_BVX (local.get $b)))
  (local.set $vy (f32.load offset=@VB_BVY (local.get $b)))
  (local.set $vz (f32.load offset=@VB_BVZ (local.get $b)))
  (if (i32.and (i32.and (i32.eq (local.get $st) (i32.const @VB_DEAD)) (f32.le (local.get $y) (f32.const @(+PLAT_Y + VB_R))))
               (f32.eq (local.get $vy) (f32.const 0)))
    (then
      (local.set $vx (f32.mul (local.get $vx) (f32.const @VB_ROLL)))
      (local.set $vz (f32.mul (local.get $vz) (f32.const @VB_ROLL))))
    (else (local.set $vy (f32.sub (local.get $vy) (f32.const @VB_G)))))
  (local.set $x (!madd (local.get $vx) (f32.const @DT) (local.get $x)))
  (local.set $y (!madd (local.get $vy) (f32.const @DT) (local.get $y)))
  (local.set $z (!madd (local.get $vz) (f32.const @DT) (local.get $z)))
  (if (i32.eq (local.get $st) (i32.const @VB_FLY))
    (then
      (f32.store offset=@VB_BX (local.get $b) (local.get $x))
      (f32.store offset=@VB_BY (local.get $b) (local.get $y))
      (f32.store offset=@VB_BZ (local.get $b) (local.get $z))
      (f32.store offset=@VB_BVY (local.get $b) (local.get $vy))
      (call $vb_touch (local.get $k) (local.get $t))
      (local.set $st (i32.load8_u offset=@VB_BST (local.get $b)))
      (local.set $vx (f32.load offset=@VB_BVX (local.get $b)))
      (local.set $vy (f32.load offset=@VB_BVY (local.get $b)))
      (local.set $vz (f32.load offset=@VB_BVZ (local.get $b)))))
  ;; the net: the nearest point of it to the centre, (cx, min(y, top))
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (local.set $dx (f32.sub (local.get $x) (local.get $cx)))
  (local.set $dy (f32.max (f32.sub (local.get $y) (f32.const @(+PLAT_Y + VB_NET_H))) (f32.const 0)))
  (local.set $d2 (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dy) (local.get $dy))))
  (if (f32.lt (local.get $d2) (f32.const @(VB_R * VB_R)))
    (then
      (if (f32.eq (local.get $dy) (f32.const 0))
        (then
          ;; its face: back out on the side it is on (on the plane, the side it came from)
          (local.set $nx (f32.copysign (f32.const 1) (select (local.get $dx) (f32.neg (local.get $vx)) (f32.ne (local.get $dx) (f32.const 0)))))
          (local.set $ny (f32.const 0))
          (local.set $x (!madd (local.get $nx) (f32.const @VB_R) (local.get $cx))))
        (else
          ;; its top edge: out along the line from it
          (local.set $d (f32.sqrt (local.get $d2)))
          (local.set $nx (f32.div (local.get $dx) (local.get $d)))
          (local.set $ny (f32.div (local.get $dy) (local.get $d)))
          (local.set $x (!madd (local.get $nx) (f32.const @VB_R) (local.get $cx)))
          (local.set $y (!madd (local.get $ny) (f32.const @VB_R) (f32.const @(+PLAT_Y + VB_NET_H))))))
      (local.set $vn (!madd (local.get $vx) (local.get $nx) (f32.mul (local.get $vy) (local.get $ny))))
      (if (f32.lt (local.get $vn) (f32.const 0))
        (then
          (if (i32.eq (local.get $st) (i32.const @VB_FLY))
            (then (if (f32.lt (local.get $vn) (f32.const -1)) (then (call $fx (i32.const 0) (i32.const @VB_FX_NET) (i32.const 255) (local.get $k) (local.get $x) (local.get $y) (local.get $z) (f32.neg (local.get $vn)))))))
          (local.set $vn (f32.mul (local.get $vn) (f32.const @(1 + VB_NE))))
          (local.set $vx (f32.sub (local.get $vx) (f32.mul (local.get $vn) (local.get $nx))))
          (local.set $vy (f32.sub (local.get $vy) (f32.mul (local.get $vn) (local.get $ny))))))))
  ;; the court's walls
  (local.set $hi (f32.sub (f32.load (i32.const @(PG_H + VB_HX))) (f32.const @VB_R)))
  (local.set $lo (f32.sub (local.get $cx) (local.get $hi)))
  (local.set $hi (f32.add (local.get $cx) (local.get $hi)))
  (if (f32.lt (local.get $x) (local.get $lo))
    (then (local.set $x (local.get $lo)) (if (f32.lt (local.get $vx) (f32.const 0)) (then (local.set $vx (f32.mul (local.get $vx) (f32.const @(-VB_WE))))))))
  (if (f32.gt (local.get $x) (local.get $hi))
    (then (local.set $x (local.get $hi)) (if (f32.gt (local.get $vx) (f32.const 0)) (then (local.set $vx (f32.mul (local.get $vx) (f32.const @(-VB_WE))))))))
  (local.set $hi (f32.sub (f32.load (i32.const @(PG_H + VB_HZ))) (f32.const @VB_R)))
  (local.set $lo (f32.sub (local.get $cx) (local.get $hi)))
  (local.set $hi (f32.add (local.get $cx) (local.get $hi)))
  (if (f32.lt (local.get $z) (local.get $lo))
    (then (local.set $z (local.get $lo)) (if (f32.lt (local.get $vz) (f32.const 0)) (then (local.set $vz (f32.mul (local.get $vz) (f32.const @(-VB_WE))))))))
  (if (f32.gt (local.get $z) (local.get $hi))
    (then (local.set $z (local.get $hi)) (if (f32.gt (local.get $vz) (f32.const 0)) (then (local.set $vz (f32.mul (local.get $vz) (f32.const @(-VB_WE))))))))
  ;; the floor: flying, a point; then a bounce, or settled
  (if (f32.lt (local.get $y) (f32.const @(+PLAT_Y + VB_R)))
    (then
      (local.set $y (f32.const @(+PLAT_Y + VB_R)))
      (if (i32.eq (local.get $st) (i32.const @VB_FLY))
        (then
          (f32.store offset=@VB_BX (local.get $b) (local.get $x))
          (f32.store offset=@VB_BY (local.get $b) (local.get $y))
          (f32.store offset=@VB_BZ (local.get $b) (local.get $z))
          (call $vb_point (local.get $k) (f32.le (local.get $x) (local.get $cx)) (i32.const 0) (local.get $t))))
      (if (f32.lt (local.get $vy) (f32.const @(-VB_SETTLE)))
        (then
          (local.set $vy (f32.mul (local.get $vy) (f32.const @(-VB_FE))))
          (local.set $vx (f32.mul (local.get $vx) (f32.const @VB_FH)))
          (local.set $vz (f32.mul (local.get $vz) (f32.const @VB_FH))))
        (else (local.set $vy (f32.const 0))))))
  (!chk (local.get $x) 375 (local.get $k))
  (!chk (local.get $y) 376 (local.get $k))
  (!chk (local.get $z) 377 (local.get $k))
  (!chk (local.get $vx) 378 (local.get $k))
  (!chk (local.get $vy) 379 (local.get $k))
  (!chk (local.get $vz) 380 (local.get $k))
  (f32.store offset=@VB_BX (local.get $b) (local.get $x))
  (f32.store offset=@VB_BY (local.get $b) (local.get $y))
  (f32.store offset=@VB_BZ (local.get $b) (local.get $z))
  (f32.store offset=@VB_BVX (local.get $b) (local.get $vx))
  (f32.store offset=@VB_BVY (local.get $b) (local.get $vy))
  (f32.store offset=@VB_BVZ (local.get $b) (local.get $vz)))

;; The volleyballs in order: one waiting or dead served when its time comes,
;; else one flying or dead flown.
(func $vb_tick
  (local $t i32) (local $k i32) (local $b i32) (local $st i32)
  (local.set $t (call $p_t (i32.const 0)))
  (!for $k (i32.const 0) (i32.load (i32.const @(PG_H + VB_NB)))
    (local.set $b (call $vb_b (local.get $k)))
    (local.set $st (i32.load8_u offset=@VB_BST (local.get $b)))
    (if (i32.and (i32.or (i32.eq (local.get $st) (i32.const @VB_WAIT)) (i32.eq (local.get $st) (i32.const @VB_DEAD)))
                 (i32.ge_s (i32.sub (local.get $t) (i32.load offset=@VB_BNEXT (local.get $b))) (i32.const 0)))
      (then (call $vb_serve (local.get $k) (local.get $t)))
      (else (if (i32.ne (local.get $st) (i32.const @VB_WAIT)) (then (call $vb_fly (local.get $k) (local.get $t))))))))

;; Over when a side has the target.
(func $vb_over (result i32)
  (local $g i32)
  (local.set $g (i32.load (i32.const @(PG_H + VB_GOAL))))
  (i32.or (i32.ge_u (i32.load (i32.const @PG_TSCORE)) (local.get $g)) (i32.ge_u (i32.load (i32.const @(PG_TSCORE + 4))) (local.get $g))))

(func $vb_out (param $p i32))
