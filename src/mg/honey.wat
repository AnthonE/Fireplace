;; HONEYCOMB: every ball on its own disc of honeycomb candy over a void, the
;; discs in a grid HC_GP cells apart, and pressed into each the round's shape
;; (a circle, a triangle, a star or an umbrella, turned the seed's way). Its
;; outline is HC_K checkpoints from a start mark; a ball traces it by rolling
;; past them in order, and all the way round and back to the start is home.
;; The candy is a grid of HC_CS cells; a ball on it cracks the cell under its
;; centre and those within HC_F0 + HC_FK x its speed, off the line only, or
;; the line too above HC_VLINE. A crack holds, then drops for good; a ball
;; over a dropped cell falls and is out. The line thins (HC_W0 to HC_W1) and
;; cracks hold less (HC_HOLD0 to HC_HOLD1) as the round goes. Placed by
;; PG_SCORE (PK_SCORE, nobody back): home in order, then by checkpoints
;; traced, one still on its candy ahead of one fallen there. No hops, no bumps:
;; a ball never meets another.
;;
;; A cell is 0 (no candy), 1 (whole) or the tick it drops, counted from play's
;; start, so whether it holds is a function of the tick: $hc_ground reads the
;; confirmed cells against bank d's own tick. A prediction running more than a
;; hold ahead would reach the drop of a crack the confirmed world hasn't made
;; yet, so it cracks its own ball's candy too, as Thin Ice does: $hc_push on
;; bank d strokes as $hc_tick will, one FX in that bank's ring a tick (the
;; ball's centre, the stroke's radius, whether the line goes too), and
;; $hc_mine finds a cell's first stroke there. A ring holds FX_MAX, as many
;; as PRED_MAX ticks of strokes, so that is exact however far ahead the
;; prediction runs. A ball's progress round the outline is its own (PG_M,
;; kept by push on either bank). Going home and the places are the confirmed
;; world's, a round trip late.

;; ---- where things are

;; The global cell index holding coordinate v, cell 0's centre at v0 (negative off the grid's low side).
(func $hc_g (param $v f32) (param $v0 f32) (result i32)
  (i32.trunc_sat_f32_s (f32.floor (!madd (f32.sub (local.get $v) (local.get $v0)) (f32.const @(1 / HC_CS)) (f32.const 0.5)))))

;; Global cell g's centre, cell 0's at v0.
(func $hc_at (param $g i32) (param $v0 f32) (result f32)
  (!madd (f32.convert_i32_s (local.get $g)) (f32.const @HC_CS) (local.get $v0)))

;; The cookie holding global cell (gx, gz) on bank d's layout, and the cell's
;; index in it (j * HC_G + i); -1 for none (the void between, or off the grid).
(func $hc_cookie (param $d i32) (param $gx i32) (param $gz i32) (result i32 i32)
  (local $i i32) (local $j i32) (local $cols i32) (local $c i32)
  (if (i32.or (i32.lt_s (local.get $gx) (i32.const 0)) (i32.lt_s (local.get $gz) (i32.const 0)))
    (then (return (i32.const -1) (i32.const 0))))
  (local.set $i (i32.rem_u (local.get $gx) (i32.const @HC_GP)))
  (local.set $j (i32.rem_u (local.get $gz) (i32.const @HC_GP)))
  (local.set $cols (i32.load offset=@(PG_H + HC_COLS) (local.get $d)))
  (if (i32.or (i32.or (i32.ge_u (local.get $i) (i32.const @HC_G)) (i32.ge_u (local.get $j) (i32.const @HC_G)))
              (i32.ge_u (i32.div_u (local.get $gx) (i32.const @HC_GP)) (local.get $cols)))
    (then (return (i32.const -1) (i32.const 0))))
  (local.set $c (i32.add (i32.mul (i32.div_u (local.get $gz) (i32.const @HC_GP)) (local.get $cols)) (i32.div_u (local.get $gx) (i32.const @HC_GP))))
  (if (i32.ge_u (local.get $c) (i32.load offset=@(PG_H + HC_NC) (local.get $d)))
    (then (return (i32.const -1) (i32.const 0))))
  (local.get $c)
  (i32.add (i32.mul (local.get $j) (i32.const @HC_G)) (local.get $i)))

;; Cell k of cookie c's address.
(func $hc_addr (param $c i32) (param $k i32) (result i32)
  (i32.add (i32.const @(PG_BIG + HC_CELLS)) (i32.shl (i32.add (i32.mul (local.get $c) (i32.const @HC_GG)) (local.get $k)) (i32.const 1))))

;; Cookie c's centre, x and z, on bank d's layout.
(func $hc_centre (param $d i32) (param $c i32) (result f32 f32)
  (local $cols i32)
  (local.set $cols (i32.load offset=@(PG_H + HC_COLS) (local.get $d)))
  (call $hc_at (i32.add (i32.mul (i32.rem_u (local.get $c) (local.get $cols)) (i32.const @HC_GP)) (i32.const @HC_GH))
               (f32.load offset=@(PG_H + HC_GX0) (local.get $d)))
  (call $hc_at (i32.add (i32.mul (i32.div_u (local.get $c) (local.get $cols)) (i32.const @HC_GP)) (i32.const @HC_GH))
               (f32.load offset=@(PG_H + HC_GZ0) (local.get $d))))

;; Ticks a crack made rel ticks into play holds.
(func $hc_hold (param $rel i32) (result i32)
  (i32.sub (i32.const @HC_HOLD0)
           (i32.div_u (i32.mul (i32.const @(HC_HOLD0 - HC_HOLD1))
                               (select (local.get $rel) (i32.const @HC_BRITTLE) (i32.lt_u (local.get $rel) (i32.const @HC_BRITTLE))))
                      (i32.const @HC_BRITTLE))))

;; The line's half width rel ticks into play.
(func $hc_w (param $rel i32) (result f32)
  (!madd (f32.convert_i32_u (select (local.get $rel) (i32.const @HC_THIN) (i32.lt_u (local.get $rel) (i32.const @HC_THIN))))
         (f32.const @((HC_W1 - HC_W0) / HC_THIN)) (f32.const @HC_W0)))

;; Is cell k, global (gx, gz), in the stroke of a ball at (x, z) (its cell
;; (ux, uz)), radius r, the line too if line, the line w wide each side, on
;; bank d's layout? The cell under its centre and any within r, off the line
;; unless line.
(func $hc_hits (param $d i32) (param $gx i32) (param $gz i32) (param $k i32) (param $ux i32) (param $uz i32)
               (param $x f32) (param $z f32) (param $r f32) (param $line i32) (param $w f32) (result i32)
  (local $dx f32) (local $dz f32)
  (if (i32.eqz (local.get $line))
    (then (if (f32.le (f32.load offset=@(PG_S + HC_DIST) (i32.shl (local.get $k) (i32.const 2))) (local.get $w)) (then (return (i32.const 0))))))
  (if (i32.and (i32.eq (local.get $gx) (local.get $ux)) (i32.eq (local.get $gz) (local.get $uz))) (then (return (i32.const 1))))
  (local.set $dx (f32.sub (call $hc_at (local.get $gx) (f32.load offset=@(PG_H + HC_GX0) (local.get $d))) (local.get $x)))
  (local.set $dz (f32.sub (call $hc_at (local.get $gz) (f32.load offset=@(PG_H + HC_GZ0) (local.get $d))) (local.get $z)))
  (f32.le (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))) (f32.mul (local.get $r) (local.get $r))))

;; The prediction's own crack of cell k, global (gx, gz), from its FX ring:
;; the first stroke over it, as the tick it drops from play's start, or 1 if
;; its ball hasn't cracked it.
(func $hc_mine (param $d i32) (param $gx i32) (param $gz i32) (param $k i32) (result i32)
  (local $n i32) (local $i i32) (local $r i32) (local $rel i32) (local $x f32) (local $z f32)
  (local.set $n (i32.load (i32.const @PFX)))
  (!for $i (select (i32.sub (local.get $n) (i32.const @FX_MAX)) (i32.const 0) (i32.gt_u (local.get $n) (i32.const @FX_MAX))) (local.get $n)
    (local.set $r (i32.add (i32.const @(PFX + 16)) (i32.shl (i32.and (local.get $i) (i32.const @(FX_MAX - 1))) (i32.const 5))))
    (if (i32.eq (i32.load8_u offset=4 (local.get $r)) (i32.const @HC_FX_STROKE))
      (then
        (local.set $rel (i32.sub (i32.load (local.get $r)) (i32.load offset=@HDR_START (local.get $d))))
        (local.set $x (f32.load offset=8 (local.get $r)))
        (local.set $z (f32.load offset=16 (local.get $r)))
        (if (call $hc_hits (local.get $d) (local.get $gx) (local.get $gz) (local.get $k)
                           (call $hc_g (local.get $x) (f32.load offset=@(PG_H + HC_GX0) (local.get $d)))
                           (call $hc_g (local.get $z) (f32.load offset=@(PG_H + HC_GZ0) (local.get $d)))
                           (local.get $x) (local.get $z) (f32.load offset=20 (local.get $r))
                           (i32.and (i32.load16_u offset=6 (local.get $r)) (i32.const 1)) (call $hc_w (local.get $rel)))
          (then (return (i32.add (local.get $rel) (call $hc_hold (local.get $rel)))))))))
  (i32.const 1))

;; ---- the shape

;; Element k of the umbrella's table, in m.
(func $hc_umb (param $k i32) (result f32)
  (f32.mul (f32.convert_i32_s (!tab HC_UMB (local.get $k))) (f32.const 0.01)))

;; Vertex i of the shape's outline before it's turned, (u, v) in m.
(func $hc_vertex (param $shape i32) (param $i i32) (result f32 f32)
  (local $s f32) (local $c f32) (local $r f32)
  (if (i32.eq (local.get $shape) (i32.const @HC_UMBRELLA))
    (then
      (return (call $hc_umb (i32.shl (local.get $i) (i32.const 1))) (call $hc_umb (i32.add (i32.shl (local.get $i) (i32.const 1)) (i32.const 1))))))
  (if (i32.eq (local.get $shape) (i32.const @HC_TRIANGLE))
    (then
      (call $sincos (i32.div_u (i32.mul (local.get $i) (i32.const 16384)) (i32.const 3)))
      (local.set $c) (local.set $s)
      (return (f32.mul (local.get $c) (f32.const @HC_TRI_R)) (f32.mul (local.get $s) (f32.const @HC_TRI_R)))))
  (if (i32.eq (local.get $shape) (i32.const @HC_STAR))
    (then
      (call $sincos (i32.div_u (i32.mul (local.get $i) (i32.const 16384)) (i32.const 10)))
      (local.set $c) (local.set $s)
      (local.set $r (select (f32.const @HC_STAR_RI) (f32.const @HC_STAR_RO) (i32.and (local.get $i) (i32.const 1))))
      (return (f32.mul (local.get $c) (local.get $r)) (f32.mul (local.get $s) (local.get $r)))))
  (call $sincos (i32.shl (local.get $i) (i32.const 8)))
  (local.set $c) (local.set $s)
  (f32.mul (local.get $c) (f32.const @HC_CIRC_R))
  (f32.mul (local.get $s) (f32.const @HC_CIRC_R)))

;; The shape's outline as checkpoints: its vertices turned by rot, each edge
;; cut into pieces at most HC_STEP long, the start mark the first vertex. Then
;; every cell's distance from it (the closed polyline through the checkpoints).
(func $hc_shape (param $shape i32) (param $rot i32)
  (local $nv i32) (local $i i32) (local $q i32) (local $s i32) (local $k i32) (local $j i32)
  (local $sn f32) (local $cs f32) (local $u f32) (local $v f32) (local $ax f32) (local $az f32) (local $bx f32) (local $bz f32)
  (local $ex f32) (local $ez f32) (local $len f32) (local $f f32) (local $px f32) (local $pz f32) (local $best f32) (local $d2 f32) (local $l2 f32)
  (local.set $nv (select (i32.const @HC_UMB_N)
                         (select (i32.const 3) (select (i32.const 10) (i32.const 64) (i32.eq (local.get $shape) (i32.const @HC_STAR)))
                                 (i32.eq (local.get $shape) (i32.const @HC_TRIANGLE)))
                         (i32.eq (local.get $shape) (i32.const @HC_UMBRELLA))))
  (call $sincos (local.get $rot))
  (local.set $cs) (local.set $sn)
  (!for $i (i32.const 0) (local.get $nv)
    (call $hc_vertex (local.get $shape) (local.get $i))
    (local.set $v) (local.set $u)
    (!st f32 @(PG_S + HC_VERT) (i32.shl (local.get $i) (i32.const 1)) (f32.sub (f32.mul (local.get $u) (local.get $cs)) (f32.mul (local.get $v) (local.get $sn))))
    (!st f32 @(PG_S + HC_VERT + 4) (i32.shl (local.get $i) (i32.const 1)) (!madd (local.get $u) (local.get $sn) (f32.mul (local.get $v) (local.get $cs)))))
  (!for $i (i32.const 0) (local.get $nv)
    (local.set $ax (!ld f32 @(PG_S + HC_VERT) (i32.shl (local.get $i) (i32.const 1))))
    (local.set $az (!ld f32 @(PG_S + HC_VERT + 4) (i32.shl (local.get $i) (i32.const 1))))
    (local.set $j (i32.rem_u (i32.add (local.get $i) (i32.const 1)) (local.get $nv)))
    (local.set $ex (f32.sub (!ld f32 @(PG_S + HC_VERT) (i32.shl (local.get $j) (i32.const 1))) (local.get $ax)))
    (local.set $ez (f32.sub (!ld f32 @(PG_S + HC_VERT + 4) (i32.shl (local.get $j) (i32.const 1))) (local.get $az)))
    (local.set $len (f32.sqrt (!madd (local.get $ex) (local.get $ex) (f32.mul (local.get $ez) (local.get $ez)))))
    (local.set $s (i32.trunc_sat_f32_u (f32.ceil (f32.mul (local.get $len) (f32.const @(1 / HC_STEP))))))
    (local.set $s (select (local.get $s) (i32.const 1) (local.get $s)))
    (!for $q (i32.const 0) (local.get $s)
      (if (i32.lt_u (local.get $k) (i32.const @HC_KMAX))
        (then
          (local.set $f (f32.div (f32.convert_i32_u (local.get $q)) (f32.convert_i32_u (local.get $s))))
          (!st f32 @(PG_S + HC_PTS) (i32.shl (local.get $k) (i32.const 1)) (!madd (local.get $ex) (local.get $f) (local.get $ax)))
          (!st f32 @(PG_S + HC_PTS + 4) (i32.shl (local.get $k) (i32.const 1)) (!madd (local.get $ez) (local.get $f) (local.get $az)))
          (!inc $k)))))
  (i32.store (i32.const @(PG_H + HC_K)) (local.get $k))
  ;; every cell's distance from the outline: the least to a piece of it, k to k + 1 round to 0
  (!for $j (i32.const 0) (i32.const @HC_GG)
    (local.set $px (f32.mul (f32.convert_i32_s (i32.sub (i32.rem_u (local.get $j) (i32.const @HC_G)) (i32.const @HC_GH))) (f32.const @HC_CS)))
    (local.set $pz (f32.mul (f32.convert_i32_s (i32.sub (i32.div_u (local.get $j) (i32.const @HC_G)) (i32.const @HC_GH))) (f32.const @HC_CS)))
    (local.set $best (f32.const 1e9))
    (!for $i (i32.const 0) (local.get $k)
      (local.set $ax (!ld f32 @(PG_S + HC_PTS) (i32.shl (local.get $i) (i32.const 1))))
      (local.set $az (!ld f32 @(PG_S + HC_PTS + 4) (i32.shl (local.get $i) (i32.const 1))))
      (local.set $q (i32.rem_u (i32.add (local.get $i) (i32.const 1)) (local.get $k)))
      (local.set $ex (f32.sub (!ld f32 @(PG_S + HC_PTS) (i32.shl (local.get $q) (i32.const 1))) (local.get $ax)))
      (local.set $ez (f32.sub (!ld f32 @(PG_S + HC_PTS + 4) (i32.shl (local.get $q) (i32.const 1))) (local.get $az)))
      (local.set $bx (f32.sub (local.get $px) (local.get $ax)))
      (local.set $bz (f32.sub (local.get $pz) (local.get $az)))
      (local.set $l2 (!madd (local.get $ex) (local.get $ex) (f32.mul (local.get $ez) (local.get $ez))))
      (local.set $f (f32.const 0))
      (if (f32.gt (local.get $l2) (f32.const 0))
        (then (local.set $f (!clamp (f32.div (!madd (local.get $bx) (local.get $ex) (f32.mul (local.get $bz) (local.get $ez))) (local.get $l2))
                                    (f32.const 0) (f32.const 1)))))
      (local.set $bx (f32.sub (local.get $bx) (f32.mul (local.get $ex) (local.get $f))))
      (local.set $bz (f32.sub (local.get $bz) (f32.mul (local.get $ez) (local.get $f))))
      (local.set $d2 (!madd (local.get $bx) (local.get $bx) (f32.mul (local.get $bz) (local.get $bz))))
      (local.set $best (f32.min (local.get $best) (local.get $d2))))
    (!st f32 @(PG_S + HC_DIST) (local.get $j) (f32.sqrt (local.get $best)))))

;; ---- the hooks

;; A cookie for every ball, as near square a grid as fits them, centred on the
;; stage; the shape from the seed; every cell inside HC_R whole. Scored by
;; place, nobody back, no hop, no bumps; a gentler push and a brake.
(func $hc_setup (param $n i32)
  (local $cols i32) (local $rows i32) (local $c i32) (local $k i32) (local $shape i32) (local $ex f32) (local $ez f32)
  (local $ox f32) (local $oz f32)
  (local.set $n (select (local.get $n) (i32.const 1) (local.get $n)))
  (local.set $cols (i32.const 1))
  (loop $wide
    (if (i32.lt_u (i32.mul (local.get $cols) (local.get $cols)) (local.get $n))
      (then (!inc $cols) (br $wide))))
  (local.set $rows (i32.div_u (i32.add (local.get $n) (i32.sub (local.get $cols) (i32.const 1))) (local.get $cols)))
  ;; the grid's extent, the first cookie's square's near edge to the last's far edge
  (local.set $ex (f32.mul (f32.convert_i32_u (i32.sub (i32.mul (local.get $cols) (i32.const @HC_GP)) (i32.const @(HC_GP - HC_G)))) (f32.const @HC_CS)))
  (local.set $ez (f32.mul (f32.convert_i32_u (i32.sub (i32.mul (local.get $rows) (i32.const @HC_GP)) (i32.const @(HC_GP - HC_G)))) (f32.const @HC_CS)))
  (i32.store (i32.const @PG_KIND) (i32.const @PK_SCORE))
  (i32.store (i32.const @PG_LEN) (i32.const @HC_LEN))
  (i32.store (i32.const @PG_RESPAWN) (i32.const 0x7fffffff))
  (f32.store (i32.const @PG_ACC) (f32.const @HC_ACC))
  (f32.store (i32.const @PG_IDLE) (f32.const @HC_IDLE))
  (f32.store (i32.const @PG_HOP) (f32.const 0))
  (i32.store (i32.const @PG_FLAGS) (i32.const 0))
  (f32.store (i32.const @PG_SIZE) (f32.mul (f32.max (local.get $ex) (local.get $ez)) (f32.const 0.5)))
  (i32.store (i32.const @(PG_H + HC_NC)) (local.get $n))
  (i32.store (i32.const @(PG_H + HC_COLS)) (local.get $cols))
  (i32.store (i32.const @(PG_H + HC_ROWS)) (local.get $rows))
  (f32.store (i32.const @(PG_H + HC_GX0)) (f32.add (!madd (local.get $ex) (f32.const -0.5) (f32.load (i32.const @PG_CX))) (f32.const @(HC_CS / 2))))
  (f32.store (i32.const @(PG_H + HC_GZ0)) (f32.add (!madd (local.get $ez) (f32.const -0.5) (f32.load (i32.const @PG_CX))) (f32.const @(HC_CS / 2))))
  (local.set $shape (i32.and (call $p_seed (i32.const @HC_KSEED)) (i32.const 3)))
  (i32.store (i32.const @(PG_H + HC_SHAPE)) (local.get $shape))
  (i32.store (i32.const @(PG_H + HC_ROT)) (i32.and (call $p_seed (i32.const @(HC_KSEED + 1))) (i32.const 16383)))
  (call $hc_shape (local.get $shape) (i32.load (i32.const @(PG_H + HC_ROT))))
  ;; the candy: a disc of cells on every cookie
  (!for $k (i32.const 0) (i32.const @HC_GG)
    (local.set $ox (f32.mul (f32.convert_i32_s (i32.sub (i32.rem_u (local.get $k) (i32.const @HC_G)) (i32.const @HC_GH))) (f32.const @HC_CS)))
    (local.set $oz (f32.mul (f32.convert_i32_s (i32.sub (i32.div_u (local.get $k) (i32.const @HC_G)) (i32.const @HC_GH))) (f32.const @HC_CS)))
    (if (f32.le (!madd (local.get $ox) (local.get $ox) (f32.mul (local.get $oz) (local.get $oz))) (f32.const @(HC_R * HC_R)))
      (then
        (!for $c (i32.const 0) (local.get $n)
          (i32.store16 (call $hc_addr (local.get $c) (local.get $k)) (i32.const 1)))))))

;; Ball i of n on cookie i's start mark; a newcomer falling in (n 1024) onto
;; the start mark of a cookie its i picks.
(func $hc_spawn (param $i i32) (param $n i32) (result f32 f32 f32)
  (local $c i32) (local $x f32) (local $z f32)
  (local.set $c (i32.rem_u (local.get $i) (select (i32.load (i32.const @(PG_H + HC_NC))) (i32.const 1) (i32.load (i32.const @(PG_H + HC_NC))))))
  (call $hc_centre (i32.const 0) (local.get $c))
  (local.set $z) (local.set $x)
  (f32.add (local.get $x) (f32.load (i32.const @(PG_S + HC_PTS))))
  (f32.const @PLAT_Y)
  (f32.add (local.get $z) (f32.load (i32.const @(PG_S + HC_PTS + 4)))))

(func $hc_start)
(func $hc_begin (param $p i32) (param $d i32))

;; The candy that holds under (x, z) on bank d's tick, its top at PLAT_Y.
(func $hc_ground (param $d i32) (param $x f32) (param $y f32) (param $z f32) (result f32)
  (local $gx i32) (local $gz i32) (local $c i32) (local $k i32) (local $v i32)
  (if (f32.lt (local.get $y) (f32.const @PLAT_Y)) (then (return (f32.const -1000))))
  (local.set $gx (call $hc_g (local.get $x) (f32.load offset=@(PG_H + HC_GX0) (local.get $d))))
  (local.set $gz (call $hc_g (local.get $z) (f32.load offset=@(PG_H + HC_GZ0) (local.get $d))))
  (call $hc_cookie (local.get $d) (local.get $gx) (local.get $gz))
  (local.set $k) (local.set $c)
  (if (i32.lt_s (local.get $c) (i32.const 0)) (then (return (f32.const -1000))))
  (local.set $v (i32.load16_u (call $hc_addr (local.get $c) (local.get $k))))
  (if (i32.eqz (local.get $v)) (then (return (f32.const -1000))))
  (if (i32.and (i32.ne (local.get $d) (i32.const 0)) (i32.eq (local.get $v) (i32.const 1)))
    (then (local.set $v (call $hc_mine (local.get $d) (local.get $gx) (local.get $gz) (local.get $k)))))
  (if (result f32) (i32.or (i32.eq (local.get $v) (i32.const 1)) (i32.lt_u (call $p_t (local.get $d)) (local.get $v)))
    (then (f32.const @PLAT_Y))
    (else (f32.const -1000))))

;; Ball p after its roll on bank d, on its candy: its progress round the
;; outline (PG_M), the next checkpoint or one of the HC_AHEAD - 1 after it in
;; reach; home, it's held on the start mark till the confirmed world takes
;; it. In the prediction, a stroke that reaches whole candy is an FX in its
;; bank's ring, as $hc_tick will crack it.
(func $hc_push (param $p i32) (param $d i32)
  (local $pb i32) (local $gx i32) (local $gz i32) (local $c i32) (local $k i32) (local $m i32) (local $kk i32) (local $a i32) (local $q i32)
  (local $c2 i32) (local $k2 i32) (local $i i32) (local $j i32) (local $line i32)
  (local $x f32) (local $z f32) (local $cx f32) (local $cz f32) (local $dx f32) (local $dz f32) (local $r f32) (local $w f32)
  (local.set $pb (i32.add (i32.shl (local.get $p) (i32.const 6)) (local.get $d)))
  (if (i32.eqz (call $p_in (local.get $pb))) (then (return)))
  (if (i32.or (i32.eqz (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @PF_GROUND)))
              (f32.ge (f32.abs (f32.sub (!at f32 @(PLAYERS + P_PY) (local.get $pb)) (f32.const @PLAT_Y))) (f32.const 0.05)))
    (then (return)))
  (local.set $x (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
  (local.set $z (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
  (local.set $gx (call $hc_g (local.get $x) (f32.load offset=@(PG_H + HC_GX0) (local.get $d))))
  (local.set $gz (call $hc_g (local.get $z) (f32.load offset=@(PG_H + HC_GZ0) (local.get $d))))
  (call $hc_cookie (local.get $d) (local.get $gx) (local.get $gz))
  (local.set $k) (local.set $c)
  (if (i32.lt_s (local.get $c) (i32.const 0)) (then (return)))
  (call $hc_centre (local.get $d) (local.get $c))
  (local.set $cz) (local.set $cx)
  ;; round the outline, in order
  (local.set $m (i32.and (!at i32 @(PLAYERS + PG_M) (local.get $pb)) (i32.const 255)))
  (local.set $kk (i32.load offset=@(PG_H + HC_K) (local.get $d)))
  (if (i32.lt_u (local.get $m) (local.get $kk))
    (then
      (!for $a (i32.const 1) (i32.const @(HC_AHEAD + 1))
        (local.set $q (i32.add (local.get $m) (local.get $a)))
        (if (i32.le_u (local.get $q) (local.get $kk))
          (then
            (local.set $i (select (i32.const 0) (local.get $q) (i32.eq (local.get $q) (local.get $kk))))
            (local.set $dx (f32.sub (f32.sub (local.get $x) (local.get $cx)) (!ld f32 @(PG_S + HC_PTS) (i32.shl (local.get $i) (i32.const 1)))))
            (local.set $dz (f32.sub (f32.sub (local.get $z) (local.get $cz)) (!ld f32 @(PG_S + HC_PTS + 4) (i32.shl (local.get $i) (i32.const 1)))))
            (if (f32.le (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))) (f32.const @(HC_REACH * HC_REACH)))
              (then (local.set $j (local.get $q)))))))
      (if (local.get $j)
        (then
          (local.set $m (local.get $j))
          (!put i32 @(PLAYERS + PG_M) (local.get $pb) (local.get $m))))))
  (if (i32.ge_u (local.get $m) (local.get $kk))
    (then
      (!put f32 @(PLAYERS + P_PX) (local.get $pb) (f32.add (local.get $cx) (f32.load (i32.const @(PG_S + HC_PTS)))))
      (!put f32 @(PLAYERS + P_PZ) (local.get $pb) (f32.add (local.get $cz) (f32.load (i32.const @(PG_S + HC_PTS + 4)))))
      (!put f32 @(PLAYERS + P_VX) (local.get $pb) (f32.const 0))
      (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (f32.const 0))
      (return)))
  (if (i32.eqz (local.get $d)) (then (return)))
  ;; the prediction's stroke
  (local.set $dx (!at f32 @(PLAYERS + P_VX) (local.get $pb)))
  (local.set $dz (!at f32 @(PLAYERS + P_VZ) (local.get $pb)))
  (local.set $r (f32.sqrt (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz)))))
  (local.set $line (f32.gt (local.get $r) (f32.const @HC_VLINE)))
  (local.set $r (f32.min (!madd (local.get $r) (f32.const @HC_FK) (f32.const @HC_F0)) (f32.const @HC_FMAX)))
  (local.set $w (call $hc_w (call $p_t (local.get $d))))
  (!for $j (i32.const 0) (i32.const 5)
    (!for $i (i32.const 0) (i32.const 5)
      (call $hc_cookie (local.get $d) (i32.add (local.get $gx) (i32.sub (local.get $i) (i32.const 2))) (i32.add (local.get $gz) (i32.sub (local.get $j) (i32.const 2))))
      (local.set $k2) (local.set $c2)
      (if (i32.eq (local.get $c2) (local.get $c))
        (then
          (if (i32.and (i32.eq (i32.load16_u (call $hc_addr (local.get $c2) (local.get $k2))) (i32.const 1))
                       (call $hc_hits (local.get $d) (i32.add (local.get $gx) (i32.sub (local.get $i) (i32.const 2))) (i32.add (local.get $gz) (i32.sub (local.get $j) (i32.const 2)))
                                      (local.get $k2) (local.get $gx) (local.get $gz) (local.get $x) (local.get $z) (local.get $r) (local.get $line) (local.get $w)))
            (then
              (call $fx (local.get $d) (i32.const @HC_FX_STROKE) (local.get $p) (local.get $line)
                        (local.get $x) (f32.const @PLAT_Y) (local.get $z) (local.get $r))
              (return))))))))

;; In slot order, every ball in on its candy: home if it has traced it all
;; (out of play where it stands, its order, a tick's share it, and score);
;; else its stroke cracks the whole candy in it, dropping a hold from now.
(func $hc_tick
  (local $p i32) (local $pb i32) (local $t i32) (local $rel i32) (local $drop i32) (local $kk i32) (local $fin0 i32) (local $fin i32)
  (local $gx i32) (local $gz i32) (local $c i32) (local $k i32) (local $c2 i32) (local $k2 i32) (local $i i32) (local $j i32) (local $line i32) (local $n i32) (local $a i32)
  (local $x f32) (local $z f32) (local $vx f32) (local $vz f32) (local $r f32) (local $w f32)
  (local.set $t (i32.load (i32.const @HDR_TICK)))
  (local.set $rel (call $p_t (i32.const 0)))
  (local.set $drop (i32.add (local.get $rel) (call $hc_hold (local.get $rel))))
  (local.set $w (call $hc_w (local.get $rel)))
  (local.set $kk (i32.load (i32.const @(PG_H + HC_K))))
  (local.set $fin0 (i32.load (i32.const @(PG_H + HC_FIN))))
  (local.set $fin (local.get $fin0))
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
    (if (i32.and (call $p_in (local.get $pb)) (i32.ne (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @PF_GROUND)) (i32.const 0)))
      (then
        (if (f32.lt (f32.abs (f32.sub (!at f32 @(PLAYERS + P_PY) (local.get $pb)) (f32.const @PLAT_Y))) (f32.const 0.05))
          (then
            (local.set $x (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
            (local.set $z (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
            (if (i32.ge_u (i32.and (!at i32 @(PLAYERS + PG_M) (local.get $pb)) (i32.const 255)) (local.get $kk))
              (then
                (call $fx (i32.const 0) (i32.const @HC_FX_HOME) (local.get $p) (i32.add (local.get $fin0) (i32.const 1))
                          (local.get $x) (f32.const @PLAT_Y) (local.get $z) (f32.mul (f32.convert_i32_u (local.get $rel)) (f32.const @DT)))
                (!put u16 @(PLAYERS + PG_SCORE) (local.get $pb) (i32.sub (i32.const @HC_SFIN) (local.get $fin0)))
                (!put i32 @(PLAYERS + PG_M) (local.get $pb) (i32.or (i32.const @HC_M_HOME) (i32.add (local.get $fin0) (i32.const 1))))
                (!put f32 @(PLAYERS + P_VY) (local.get $pb) (f32.const 0))
                (!put u8 @(PLAYERS + P_FL) (local.get $pb) (i32.const @(PF_LIVE | PF_GROUND | PF_DEAD)))
                (!put i32 @(PLAYERS + B_OUTAT) (local.get $pb) (local.get $t))
                (!inc $fin))
              (else
                (local.set $gx (call $hc_g (local.get $x) (f32.load (i32.const @(PG_H + HC_GX0)))))
                (local.set $gz (call $hc_g (local.get $z) (f32.load (i32.const @(PG_H + HC_GZ0)))))
                (call $hc_cookie (i32.const 0) (local.get $gx) (local.get $gz))
                (local.set $k) (local.set $c)
                (if (i32.ge_s (local.get $c) (i32.const 0))
                  (then
                    (local.set $vx (!at f32 @(PLAYERS + P_VX) (local.get $pb)))
                    (local.set $vz (!at f32 @(PLAYERS + P_VZ) (local.get $pb)))
                    (local.set $r (f32.sqrt (!madd (local.get $vx) (local.get $vx) (f32.mul (local.get $vz) (local.get $vz)))))
                    (local.set $line (f32.gt (local.get $r) (f32.const @HC_VLINE)))
                    (local.set $r (f32.min (!madd (local.get $r) (f32.const @HC_FK) (f32.const @HC_F0)) (f32.const @HC_FMAX)))
                    (local.set $n (i32.const 0))
                    (!for $j (i32.const 0) (i32.const 5)
                      (!for $i (i32.const 0) (i32.const 5)
                        (call $hc_cookie (i32.const 0) (i32.add (local.get $gx) (i32.sub (local.get $i) (i32.const 2))) (i32.add (local.get $gz) (i32.sub (local.get $j) (i32.const 2))))
                        (local.set $k2) (local.set $c2)
                        (if (i32.eq (local.get $c2) (local.get $c))
                          (then
                            (local.set $a (call $hc_addr (local.get $c2) (local.get $k2)))
                            (if (i32.and (i32.eq (i32.load16_u (local.get $a)) (i32.const 1))
                                         (call $hc_hits (i32.const 0) (i32.add (local.get $gx) (i32.sub (local.get $i) (i32.const 2))) (i32.add (local.get $gz) (i32.sub (local.get $j) (i32.const 2)))
                                                        (local.get $k2) (local.get $gx) (local.get $gz) (local.get $x) (local.get $z) (local.get $r) (local.get $line) (local.get $w)))
                              (then
                                (i32.store16 (local.get $a) (local.get $drop))
                                (!inc $n)))))))
                    (if (i32.and (i32.ne (local.get $n) (i32.const 0)) (i32.eqz (i32.and (i32.add (local.get $t) (local.get $p)) (i32.const 15))))
                      (then (call $fx (i32.const 0) (i32.const @HC_FX_CRACK) (local.get $p) (local.get $n)
                                      (local.get $x) (f32.const @PLAT_Y) (local.get $z) (local.get $r)))))))))))))
  (i32.store (i32.const @(PG_H + HC_FIN)) (local.get $fin)))

;; Over when nobody is left on the candy. On the round's last tick (this, or
;; the clock's), the balls still on it are scored by what they traced, one
;; falling as one fallen: kept out of their records till then, so the
;; prediction's copy of them stays the confirmed one's.
(func $hc_over (result i32)
  (local $p i32) (local $pb i32) (local $end i32) (local $fl i32)
  (local.set $end (i32.eqz (i32.load (i32.const @BH_LEFT))))
  (if (i32.or (local.get $end) (i32.ge_u (i32.load (i32.const @HDR_TICK)) (i32.load (i32.const @HDR_UNTIL))))
    (then
      (!for $p (i32.const 0) (i32.const @NPLAYER)
        (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
        (local.set $fl (!at u8 @(PLAYERS + P_FL) (local.get $pb)))
        (if (i32.eq (i32.and (local.get $fl) (i32.const @(PF_LIVE | PF_DEAD))) (i32.const @PF_LIVE))
          (then
            (!put u16 @(PLAYERS + PG_SCORE) (local.get $pb)
              (i32.add (i32.shl (i32.and (!at i32 @(PLAYERS + PG_M) (local.get $pb)) (i32.const 255)) (i32.const 1))
                       (i32.eqz (i32.and (local.get $fl) (i32.const @PF_FALL))))))))))
  (local.get $end))

;; Ball p fell through: scored by what it traced.
(func $hc_out (param $p i32)
  (local $pb i32)
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (!put u16 @(PLAYERS + PG_SCORE) (local.get $pb) (i32.shl (i32.and (!at i32 @(PLAYERS + PG_M) (local.get $pb)) (i32.const 255)) (i32.const 1))))
