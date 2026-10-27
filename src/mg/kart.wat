;; KART GRAB: a battle course, every ball a go-kart, coins all over it; most
;; coins at the time wins (PK_SCORE). A walled square floor sized for the
;; crowd, blocks on a lattice (KT_S m) with dash panels in the lanes between
;; them, rows of item boxes. The roll's own push, drag and hop are off: the
;; kart's push drives it, its heading turning toward where you look, gas,
;; brake and reverse, grip that bleeds off its sideways speed, and a drift
;; (Space held through a turn) that charges a mini-turbo. Item boxes hand out
;; bumper's power-ups (a DASH is a mushroom, a ROCKET a shell); a kart a
;; blast reaches, or a MEGA kart runs into, spins out and drops coins.
;;
;; What a kart meets in its push (the walls, the blocks, the panels) is fixed
;; at setup (the half-width in PG_H, the rest in PG_S), and its state (the
;; heading, the drift, the spin) is its own PG_M, so the prediction drives it
;; exactly. The coins, the boxes and the hits are the confirmed world's:
;; tick() drops coins ($rand), knocks them loose and hands each, and each box,
;; to the first ball by slot within reach; a coin's flight is a function of
;; the tick from its record, so every client draws it where the sim has it.

;; The stage's centre, x and z alike.
(func $kt_c (result f32) (f32.load (i32.const @PG_CX)))

;; Coin record a (its byte offset in KT_COINS) on tick t: flying from its
;; launch to where it lies, then lying there.
(func $kt_at (param $a i32) (param $t i32) (result f32 f32 f32)
  (local $tau i32) (local $air i32) (local $u f32) (local $x f32) (local $z f32) (local $x0 f32) (local $y0 f32) (local $z0 f32)
  (local.set $x (f32.load offset=@(PG_BIG + KT_COINS + KT_C_X) (local.get $a)))
  (local.set $z (f32.load offset=@(PG_BIG + KT_COINS + KT_C_Z) (local.get $a)))
  (local.set $tau (i32.sub (local.get $t) (i32.load offset=@(PG_BIG + KT_COINS + KT_C_T0) (local.get $a))))
  (local.set $air (i32.load16_u offset=@(PG_BIG + KT_COINS + KT_C_AIR) (local.get $a)))
  (if (i32.ge_s (local.get $tau) (local.get $air))
    (then (return (local.get $x) (f32.const @(+PLAT_Y + KT_CY)) (local.get $z))))
  (local.set $u (f32.div (f32.convert_i32_s (local.get $tau)) (f32.convert_i32_u (local.get $air))))
  (local.set $x0 (f32.load offset=@(PG_BIG + KT_COINS + KT_C_X0) (local.get $a)))
  (local.set $y0 (f32.load offset=@(PG_BIG + KT_COINS + KT_C_Y0) (local.get $a)))
  (local.set $z0 (f32.load offset=@(PG_BIG + KT_COINS + KT_C_Z0) (local.get $a)))
  (!madd (f32.sub (local.get $x) (local.get $x0)) (local.get $u) (local.get $x0))
  (f32.add (!madd (f32.sub (f32.const @(+PLAT_Y + KT_CY)) (local.get $y0)) (local.get $u) (local.get $y0))
           (f32.mul (f32.mul (f32.mul (f32.load offset=@(PG_BIG + KT_COINS + KT_C_H) (local.get $a)) (f32.const 4)) (local.get $u))
                    (f32.sub (f32.const 1) (local.get $u))))
  (!madd (f32.sub (local.get $z) (local.get $z0)) (local.get $u) (local.get $z0)))

;; A coin in the first free record from the cursor on: thrown from (x0, y0,
;; z0) on tick t0 to lie at (x, z) air ticks later, h m of arc, worth v. 0 if
;; every record is taken (the coin isn't made).
(func $kt_coin (param $x0 f32) (param $y0 f32) (param $z0 f32) (param $x f32) (param $z f32) (param $h f32) (param $t0 i32) (param $air i32) (param $v i32) (param $kind i32) (result i32)
  (local $k i32) (local $c i32) (local $a i32)
  (!chk (local.get $x0) 150 (local.get $kind))
  (!chk (local.get $y0) 150 (local.get $kind))
  (!chk (local.get $z0) 150 (local.get $kind))
  (!chk (local.get $x) 151 (local.get $kind))
  (!chk (local.get $z) 151 (local.get $kind))
  (!chk (local.get $h) 151 (local.get $kind))
  (local.set $c (i32.load (i32.const @(PG_H + KT_CURSOR))))
  (!for $k (i32.const 0) (i32.const @KT_MAX)
    (local.set $a (i32.shl (local.get $c) (i32.const 5)))
    (local.set $c (i32.and (i32.add (local.get $c) (i32.const 1)) (i32.const @(KT_MAX - 1))))
    (if (i32.eqz (i32.load8_u offset=@(PG_BIG + KT_COINS + KT_C_V) (local.get $a)))
      (then
        (f32.store offset=@(PG_BIG + KT_COINS + KT_C_X) (local.get $a) (local.get $x))
        (f32.store offset=@(PG_BIG + KT_COINS + KT_C_Z) (local.get $a) (local.get $z))
        (f32.store offset=@(PG_BIG + KT_COINS + KT_C_X0) (local.get $a) (local.get $x0))
        (f32.store offset=@(PG_BIG + KT_COINS + KT_C_Y0) (local.get $a) (local.get $y0))
        (f32.store offset=@(PG_BIG + KT_COINS + KT_C_Z0) (local.get $a) (local.get $z0))
        (f32.store offset=@(PG_BIG + KT_COINS + KT_C_H) (local.get $a) (local.get $h))
        (i32.store offset=@(PG_BIG + KT_COINS + KT_C_T0) (local.get $a) (local.get $t0))
        (i32.store16 offset=@(PG_BIG + KT_COINS + KT_C_AIR) (local.get $a) (local.get $air))
        (i32.store8 offset=@(PG_BIG + KT_COINS + KT_C_V) (local.get $a) (local.get $v))
        (i32.store8 offset=@(PG_BIG + KT_COINS + KT_C_KIND) (local.get $a) (local.get $kind))
        (i32.store (i32.const @(PG_H + KT_CURSOR)) (local.get $c))
        (i32.store (i32.const @(PG_H + KT_LIVE)) (i32.add (i32.load (i32.const @(PG_H + KT_LIVE))) (i32.const 1)))
        (return (i32.const 1)))))
  (i32.const 0))

;; (x, z) brought in to lie at least KT_IN inside the wall.
(func $kt_in (param $x f32) (param $z f32) (result f32 f32)
  (local $m f32)
  (local.set $m (f32.sub (f32.load (i32.const @(PG_H + KT_HALF))) (f32.const @KT_IN)))
  (!clamp (local.get $x) (f32.sub (call $kt_c) (local.get $m)) (f32.add (call $kt_c) (local.get $m)))
  (!clamp (local.get $z) (f32.sub (call $kt_c) (local.get $m)) (f32.add (call $kt_c) (local.get $m))))

;; (x, z) moved out of every block grown by m, the shortest way. Blocks stand
;; KT_S apart and well in from the wall, so the point stays clear of the rest
;; and on the floor.
(func $kt_clear (param $x f32) (param $z f32) (param $m f32) (result f32 f32)
  (local $i i32) (local $b i32) (local $bx f32) (local $bz f32) (local $w f32) (local $ex f32) (local $ez f32)
  (local.set $w (f32.add (f32.const @KT_BLOCK) (local.get $m)))
  (!for $i (i32.const 0) (i32.load (i32.const @(PG_H + KT_NBLK)))
    (local.set $b (i32.shl (local.get $i) (i32.const 3)))
    (local.set $bx (f32.load offset=@(PG_S + KT_BLK) (local.get $b)))
    (local.set $bz (f32.load offset=@(PG_S + KT_BLK + 4) (local.get $b)))
    (local.set $ex (f32.sub (local.get $w) (f32.abs (f32.sub (local.get $x) (local.get $bx)))))
    (local.set $ez (f32.sub (local.get $w) (f32.abs (f32.sub (local.get $z) (local.get $bz)))))
    (if (i32.and (f32.gt (local.get $ex) (f32.const 0)) (f32.gt (local.get $ez) (f32.const 0)))
      (then
        (if (f32.lt (local.get $ex) (local.get $ez))
          (then (local.set $x (select (f32.sub (local.get $bx) (local.get $w)) (f32.add (local.get $bx) (local.get $w))
                                      (f32.lt (local.get $x) (local.get $bx)))))
          (else (local.set $z (select (f32.sub (local.get $bz) (local.get $w)) (f32.add (local.get $bz) (local.get $w))
                                      (f32.lt (local.get $z) (local.get $bz)))))))))
  (local.get $x)
  (local.get $z))

;; The course for the crowd: the floor, and on the lattice the blocks, the
;; panels (each running round the middle the way the heading grows) and the
;; boxes, the middle's ring of them first.
(func $kt_setup (param $n i32)
  (local $half f32) (local $m i32) (local $i i32) (local $j i32) (local $k i32) (local $a i32) (local $way i32)
  (local $s f32) (local $c f32) (local $x f32) (local $z f32) (local $cx f32)
  (local.set $half (f32.min (!madd (f32.sqrt (f32.convert_i32_u (local.get $n))) (f32.const @KT_HK) (f32.const @KT_H0)) (f32.const @KT_HMAX)))
  (!chk (local.get $half) 152 (local.get $n))
  (i32.store (i32.const @PG_KIND) (i32.const @PK_SCORE))
  (i32.store (i32.const @PG_LEN) (i32.const @KT_LEN))
  (f32.store (i32.const @PG_SIZE) (local.get $half))
  (f32.store (i32.const @PG_ACC) (f32.const 0))
  (f32.store (i32.const @PG_DRAG) (f32.const 1))
  (f32.store (i32.const @PG_IDLE) (f32.const 1))
  (f32.store (i32.const @PG_HOP) (f32.const 0))
  (f32.store (i32.const @(PG_H + KT_HALF)) (local.get $half))
  (local.set $cx (call $kt_c))
  (local.set $m (i32.trunc_sat_f32_u (f32.div (f32.sub (local.get $half) (f32.const @KT_MRIM)) (f32.const @KT_S))))
  (!for $j (i32.const 0) (i32.add (i32.shl (local.get $m) (i32.const 1)) (i32.const 1))
    (!for $i (i32.const 0) (i32.add (i32.shl (local.get $m) (i32.const 1)) (i32.const 1))
      (local.set $x (!madd (f32.convert_i32_s (i32.sub (local.get $i) (local.get $m))) (f32.const @KT_S) (local.get $cx)))
      (local.set $z (!madd (f32.convert_i32_s (i32.sub (local.get $j) (local.get $m))) (f32.const @KT_S) (local.get $cx)))
      (if (i32.or (i32.ne (local.get $i) (local.get $m)) (i32.ne (local.get $j) (local.get $m)))
        (then
          (if (i32.and (i32.add (local.get $i) (local.get $j)) (i32.const 1))
            (then
              ;; a panel, its way round the middle: off the x axis along z, off the z axis along -x
              (local.set $k (i32.load (i32.const @(PG_H + KT_NPAD))))
              (local.set $a (i32.mul (local.get $k) (i32.const 12)))
              (if (i32.gt_u (call $kt_abs (i32.sub (local.get $i) (local.get $m))) (call $kt_abs (i32.sub (local.get $j) (local.get $m))))
                (then (local.set $way (select (i32.const 1) (i32.const 3) (i32.gt_u (local.get $i) (local.get $m)))))
                (else (local.set $way (select (i32.const 2) (i32.const 0) (i32.gt_u (local.get $j) (local.get $m))))))
              (f32.store offset=@(PG_S + KT_PAD) (local.get $a) (local.get $x))
              (f32.store offset=@(PG_S + KT_PAD + 4) (local.get $a) (local.get $z))
              (i32.store offset=@(PG_S + KT_PAD + 8) (local.get $a) (local.get $way))
              (i32.store (i32.const @(PG_H + KT_NPAD)) (i32.add (local.get $k) (i32.const 1))))
            (else
              (local.set $k (i32.load (i32.const @(PG_H + KT_NBLK))))
              (local.set $a (i32.shl (local.get $k) (i32.const 3)))
              (f32.store offset=@(PG_S + KT_BLK) (local.get $a) (local.get $x))
              (f32.store offset=@(PG_S + KT_BLK + 4) (local.get $a) (local.get $z))
              (i32.store (i32.const @(PG_H + KT_NBLK)) (i32.add (local.get $k) (i32.const 1)))))))))
  ;; the boxes: the middle's ring, then a box on every lattice cell's centre
  (!for $k (i32.const 0) (i32.const @KT_NRING)
    (call $sincos (i32.div_u (i32.mul (local.get $k) (i32.const 16384)) (i32.const @KT_NRING)))
    (local.set $c) (local.set $s)
    (call $kt_box (!madd (local.get $c) (f32.const @KT_RING) (local.get $cx)) (!madd (local.get $s) (f32.const @KT_RING) (local.get $cx))))
  (!for $j (i32.const 0) (i32.shl (local.get $m) (i32.const 1))
    (!for $i (i32.const 0) (i32.shl (local.get $m) (i32.const 1))
      (call $kt_box (!madd (f32.add (f32.convert_i32_s (i32.sub (local.get $i) (local.get $m))) (f32.const 0.5)) (f32.const @KT_S) (local.get $cx))
                    (!madd (f32.add (f32.convert_i32_s (i32.sub (local.get $j) (local.get $m))) (f32.const 0.5)) (f32.const @KT_S) (local.get $cx))))))

(func $kt_abs (param $v i32) (result i32)
  (select (i32.sub (i32.const 0) (local.get $v)) (local.get $v) (i32.lt_s (local.get $v) (i32.const 0))))

;; An item box at (x, z), there from the start.
(func $kt_box (param $x f32) (param $z f32)
  (local $k i32) (local $a i32)
  (local.set $k (i32.load (i32.const @(PG_H + KT_NBOX))))
  (if (i32.ge_u (local.get $k) (i32.const @KT_NBOXMAX)) (then (return)))
  (local.set $a (i32.mul (local.get $k) (i32.const 12)))
  (f32.store offset=@(PG_S + KT_BOX) (local.get $a) (local.get $x))
  (f32.store offset=@(PG_S + KT_BOX + 4) (local.get $a) (local.get $z))
  (i32.store (i32.const @(PG_H + KT_NBOX)) (i32.add (local.get $k) (i32.const 1))))

;; Spot i of n: the i-th of a sunflower's points over the middle of the
;; floor (half as many again and 8 more) clear of the blocks by a kart and a
;; metre; past the last, the i-th point of n's moved out of them.
(func $kt_spawn (param $i i32) (param $n i32) (result f32 f32 f32)
  (local $m i32) (local $k i32) (local $j i32) (local $r f32) (local $x f32) (local $z f32)
  (local.set $r (f32.mul (f32.load (i32.const @(PG_H + KT_HALF))) (f32.const @KT_SPAWN)))
  (local.set $m (i32.add (i32.add (local.get $n) (i32.shr_u (local.get $n) (i32.const 1))) (i32.const 8)))
  (!for $k (i32.const 0) (local.get $m)
    (call $p_disc (local.get $k) (local.get $m) (local.get $r))
    (local.set $z) (local.set $x)
    (if (i32.eqz (call $kt_inblk (local.get $x) (local.get $z) (f32.const @(+B_RAD + 1))))
      (then
        (if (i32.eq (local.get $j) (local.get $i)) (then (return (local.get $x) (f32.const @PLAT_Y) (local.get $z))))
        (!inc $j))))
  (call $p_disc (local.get $i) (local.get $n) (local.get $r))
  (call $kt_clear (f32.const @(+B_RAD + 1)))
  (local.set $z) (local.set $x)
  (local.get $x) (f32.const @PLAT_Y) (local.get $z))

;; Is (x, z) inside a block grown by m?
(func $kt_inblk (param $x f32) (param $z f32) (param $m f32) (result i32)
  (local $i i32) (local $b i32) (local $w f32)
  (local.set $w (f32.add (f32.const @KT_BLOCK) (local.get $m)))
  (!for $i (i32.const 0) (i32.load (i32.const @(PG_H + KT_NBLK)))
    (local.set $b (i32.shl (local.get $i) (i32.const 3)))
    (if (i32.and (f32.lt (f32.abs (f32.sub (local.get $x) (f32.load offset=@(PG_S + KT_BLK) (local.get $b)))) (local.get $w))
                 (f32.lt (f32.abs (f32.sub (local.get $z) (f32.load offset=@(PG_S + KT_BLK + 4) (local.get $b)))) (local.get $w)))
      (then (return (i32.const 1)))))
  (i32.const 0))

;; Play starts: the coins drop in all over the course.
(func $kt_start
  (local $t i32) (local $k i32)
  (local.set $t (i32.load (i32.const @HDR_TICK)))
  (!for $k (i32.const 0) (i32.const 200)
    (if (i32.lt_u (i32.load (i32.const @(PG_H + KT_LIVE))) (call $kt_want (i32.const 0)))
      (then (call $kt_line (local.get $t))))))

;; How many coins the course keeps in: KT_C0 and KT_CN / 2 a ball in the room, at most KT_CCAP; half as many again in the fever.
(func $kt_want (param $fever i32) (result i32)
  (local $n i32)
  (local.set $n (i32.add (i32.const @KT_C0) (i32.shr_u (i32.mul (i32.load (i32.const @HDR_LIVE)) (i32.const @KT_CN)) (i32.const 1))))
  (if (i32.gt_u (local.get $n) (i32.const @KT_CCAP)) (then (local.set $n (i32.const @KT_CCAP))))
  (select (i32.add (local.get $n) (i32.shr_u (local.get $n) (i32.const 1))) (local.get $n) (local.get $fever)))

;; A line of 3 coins dropping KT_DROPH m from rest onto a random spot, along x or z, each clear of the blocks.
(func $kt_line (param $t i32)
  (local $k i32) (local $m f32) (local $x0 f32) (local $z0 f32) (local $x f32) (local $z f32) (local $ax f32) (local $az f32)
  (local.set $m (f32.sub (f32.load (i32.const @(PG_H + KT_HALF))) (f32.const @KT_IN)))
  (local.set $x0 (!madd (!madd (call $p_unit) (f32.const 2) (f32.const -1)) (local.get $m) (call $kt_c)))
  (local.set $z0 (!madd (!madd (call $p_unit) (f32.const 2) (f32.const -1)) (local.get $m) (call $kt_c)))
  (if (i32.and (call $rand) (i32.const 1))
    (then (local.set $ax (f32.const @KT_LINE)))
    (else (local.set $az (f32.const @KT_LINE))))
  (!for $k (i32.const 0) (i32.const 3)
    (call $kt_in (!madd (local.get $ax) (f32.convert_i32_s (i32.sub (local.get $k) (i32.const 1))) (local.get $x0))
                 (!madd (local.get $az) (f32.convert_i32_s (i32.sub (local.get $k) (i32.const 1))) (local.get $z0)))
    (call $kt_clear (f32.const 1.2))
    (local.set $z) (local.set $x)
    (drop (call $kt_coin (local.get $x) (f32.const @(+PLAT_Y + KT_DROPH)) (local.get $z) (local.get $x) (local.get $z)
                         (f32.const @((KT_DROPH - KT_CY) / 4)) (local.get $t) (i32.add (i32.const @KT_DROPAIR) (i32.mul (local.get $k) (i32.const 6)))
                         (i32.const 1) (i32.const @KT_KDROP)))))

;; Ball p's own start, on bank d: its kart facing where it looks.
(func $kt_begin (param $p i32) (param $d i32)
  (local $pb i32)
  (local.set $pb (i32.add (i32.shl (local.get $p) (i32.const 6)) (local.get $d)))
  (!put i32 @(PLAYERS + PG_M) (local.get $pb) (i32.and (!at i32 @(PLAYERS + P_IN) (local.get $pb)) (i32.const 16383))))

;; The floor's top under (x, z), or a block's for a ball come down on one.
(func $kt_ground (param $d i32) (param $x f32) (param $y f32) (param $z f32) (result f32)
  (local $half f32) (local $i i32) (local $b i32) (local $cx f32)
  (if (f32.lt (local.get $y) (f32.const @PLAT_Y)) (then (return (f32.const -1000))))
  (local.set $half (f32.load offset=@(PG_H + KT_HALF) (local.get $d)))
  (local.set $cx (f32.load offset=@PG_CX (local.get $d)))
  (if (i32.or (f32.gt (f32.abs (f32.sub (local.get $x) (local.get $cx))) (local.get $half))
              (f32.gt (f32.abs (f32.sub (local.get $z) (local.get $cx))) (local.get $half)))
    (then (return (f32.const -1000))))
  (if (f32.ge (local.get $y) (f32.const @(+PLAT_Y + KT_BLOCKH)))
    (then
      (!for $i (i32.const 0) (i32.load offset=@(PG_H + KT_NBLK) (local.get $d))
        (local.set $b (i32.shl (local.get $i) (i32.const 3)))
        (if (i32.and (f32.le (f32.abs (f32.sub (local.get $x) (f32.load offset=@(PG_S + KT_BLK) (local.get $b)))) (f32.const @KT_BLOCK))
                     (f32.le (f32.abs (f32.sub (local.get $z) (f32.load offset=@(PG_S + KT_BLK + 4) (local.get $b)))) (f32.const @KT_BLOCK)))
          (then (return (f32.const @(+PLAT_Y + KT_BLOCKH))))))))
  (f32.const @PLAT_Y))

;; The kart, after its roll on bank d: the heading turned (whirled, spinning
;; out), the drift begun, held or let go into a boost, the gas, the brake and
;; the grip worked along the new heading on the ground; then the walls and
;; the blocks hold it, and a panel under it tops up its boost. Its record and
;; bank d's FX ring only.
(func $kt_push (param $p i32) (param $d i32)
  (local $pb i32) (local $fl i32) (local $in i32) (local $m i32) (local $h i32) (local $dir i32) (local $chg i32) (local $spin i32)
  (local $diff i32) (local $turn i32) (local $rate i32) (local $ground i32) (local $boost i32) (local $i i32) (local $b i32) (local $n i32) (local $level i32)
  (local $s f32) (local $c f32) (local $vx f32) (local $vy f32) (local $vz f32) (local $vf f32) (local $vl f32) (local $px f32) (local $py f32) (local $pz f32)
  (local $r f32) (local $lim f32) (local $cx f32) (local $bx f32) (local $bz f32) (local $qx f32) (local $qz f32) (local $dx f32) (local $dz f32)
  (local $d2 f32) (local $dd f32) (local $nx f32) (local $nz f32) (local $vn f32) (local $ex f32) (local $ez f32)
  (local.set $pb (i32.add (i32.shl (local.get $p) (i32.const 6)) (local.get $d)))
  (local.set $fl (!at u8 @(PLAYERS + P_FL) (local.get $pb)))
  (if (i32.and (local.get $fl) (i32.const @PF_FALL)) (then (return)))
  (local.set $in (!at i32 @(PLAYERS + P_IN) (local.get $pb)))
  (local.set $m (!at i32 @(PLAYERS + PG_M) (local.get $pb)))
  (local.set $h (i32.and (local.get $m) (i32.const 16383)))
  (local.set $dir (i32.and (i32.shr_u (local.get $m) (i32.const 14)) (i32.const 3)))
  (local.set $chg (i32.and (i32.shr_u (local.get $m) (i32.const 16)) (i32.const 255)))
  (local.set $spin (i32.shr_u (local.get $m) (i32.const 24)))
  (local.set $ground (i32.ne (i32.and (local.get $fl) (i32.const @PF_GROUND)) (i32.const 0)))
  (local.set $px (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
  (local.set $py (!at f32 @(PLAYERS + P_PY) (local.get $pb)))
  (local.set $pz (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
  (local.set $vx (!at f32 @(PLAYERS + P_VX) (local.get $pb)))
  (local.set $vy (!at f32 @(PLAYERS + P_VY) (local.get $pb)))
  (local.set $vz (!at f32 @(PLAYERS + P_VZ) (local.get $pb)))
  ;; a mushroom: bumper's DASH used this tick (its glow just set, the refire with it), stretched
  (if (i32.and (i32.eq (!at u16 @(PLAYERS + B_DASH) (local.get $pb)) (i32.const @DASH_TICKS))
               (i32.eq (!at u16 @(PLAYERS + P_REFIRE) (local.get $pb)) (i32.const @USE_REFIRE)))
    (then (!put u16 @(PLAYERS + B_DASH) (local.get $pb) (i32.const @KT_SHROOM))))
  (call $sincos (local.get $h))
  (local.set $c) (local.set $s)
  (local.set $vf (!madd (local.get $vx) (local.get $c) (f32.mul (local.get $vz) (local.get $s))))
  (if (local.get $spin)
    (then
      (local.set $spin (i32.sub (local.get $spin) (i32.const 1)))
      (local.set $h (i32.and (i32.add (local.get $h) (i32.const @KT_SPINTURN)) (i32.const 16383)))
      (local.set $dir (i32.const 0))
      (local.set $chg (i32.const 0)))
    (else
      ;; how far the yaw is round from the heading, -8192 to 8191
      (local.set $diff (i32.sub (i32.and (i32.add (i32.sub (local.get $in) (local.get $h)) (i32.const 8192)) (i32.const 16383)) (i32.const 8192)))
      (if (local.get $dir)
        (then
          ;; let go, or slowed right down: the charge's boost
          (if (i32.or (i32.eqz (i32.and (local.get $in) (i32.const 0x10000000)))
                      (i32.and (local.get $ground) (f32.lt (local.get $vf) (f32.const @(KT_DRIFTV / 2)))))
            (then
              (local.set $level (select (i32.const 2) (select (i32.const 1) (i32.const 0) (i32.ge_u (local.get $chg) (i32.const @KT_MT1)))
                                        (i32.ge_u (local.get $chg) (i32.const @KT_MT2))))
              (if (local.get $level)
                (then
                  (local.set $n (select (i32.const @KT_MTB2) (i32.const @KT_MTB1) (i32.eq (local.get $level) (i32.const 2))))
                  (if (i32.lt_u (!at u16 @(PLAYERS + B_DASH) (local.get $pb)) (local.get $n))
                    (then (!put u16 @(PLAYERS + B_DASH) (local.get $pb) (local.get $n))))
                  (call $fx (local.get $d) (i32.const @KT_FX_BOOST) (local.get $p) (local.get $level) (local.get $px) (local.get $py) (local.get $pz) (f32.const 0))))
              (local.set $dir (i32.const 0))
              (local.set $chg (i32.const 0)))))
        (else
          ;; Space held on the ground, going, turning: a hop into a drift that way
          (if (i32.and (i32.and (i32.ne (i32.and (local.get $in) (i32.const 0x10000000)) (i32.const 0)) (local.get $ground))
                       (i32.and (f32.ge (local.get $vf) (f32.const @KT_DRIFTV)) (i32.ge_u (call $kt_abs (local.get $diff)) (i32.const @KT_DRIFTD))))
            (then
              (local.set $dir (select (i32.const @KT_DL) (i32.const @KT_DR) (i32.gt_s (local.get $diff) (i32.const 0))))
              (local.set $vy (f32.const @KT_HOPV))
              (local.set $fl (i32.and (local.get $fl) (i32.const @(255 ^ PF_GROUND))))))))
      ;; the turn: toward the yaw, faster going; drifting, always its way, tighter or wider
      (local.set $rate (i32.trunc_sat_f32_u (f32.mul (f32.const @KT_TURN)
                         (!clamp (f32.div (f32.abs (local.get $vf)) (f32.const @KT_TURNV)) (f32.const @KT_TURN0) (f32.const 1)))))
      (local.set $turn (call $kt_lim (local.get $diff) (i32.sub (i32.const 0) (local.get $rate)) (local.get $rate)))
      (if (i32.eq (local.get $dir) (i32.const @KT_DL))
        (then (local.set $turn (call $kt_lim (local.get $diff) (i32.const @KT_DTURN0) (i32.const @KT_DTURN1)))))
      (if (i32.eq (local.get $dir) (i32.const @KT_DR))
        (then (local.set $turn (i32.sub (i32.const 0) (call $kt_lim (i32.sub (i32.const 0) (local.get $diff)) (i32.const @KT_DTURN0) (i32.const @KT_DTURN1))))))
      (local.set $h (i32.and (i32.add (local.get $h) (local.get $turn)) (i32.const 16383)))
      (if (i32.and (i32.ne (local.get $dir) (i32.const 0)) (local.get $ground))
        (then
          (local.set $chg (i32.add (local.get $chg)
                            (select (i32.const 2) (i32.const 1) (i32.gt_u (call $kt_abs (local.get $turn)) (i32.const @((KT_DTURN0 + KT_DTURN1) / 2))))))
          (if (i32.gt_u (local.get $chg) (i32.const 255)) (then (local.set $chg (i32.const 255))))))))
  ;; the velocity along the new heading (f) and across it (l = (-s, c))
  (call $sincos (local.get $h))
  (local.set $c) (local.set $s)
  (local.set $vf (!madd (local.get $vx) (local.get $c) (f32.mul (local.get $vz) (local.get $s))))
  (local.set $vl (f32.sub (f32.mul (local.get $vz) (local.get $c)) (f32.mul (local.get $vx) (local.get $s))))
  (if (local.get $spin)
    (then
      (local.set $vf (f32.mul (local.get $vf) (f32.const @KT_SPINDRAG)))
      (local.set $vl (f32.mul (local.get $vl) (f32.const @KT_SPINDRAG))))
    (else
      (if (local.get $ground)
        (then
          (local.set $boost (i32.ne (!at u16 @(PLAYERS + B_DASH) (local.get $pb)) (i32.const 0)))
          (if (local.get $boost)
            (then
              (local.set $vf (select (f32.min (f32.add (local.get $vf) (f32.const @KT_BACC)) (f32.const @KT_VBOOST))
                                     (f32.mul (local.get $vf) (f32.const @KT_OVER))
                                     (f32.le (local.get $vf) (f32.const @KT_VBOOST)))))
            (else
              (if (i32.and (local.get $in) (i32.const 0x01000000))
                (then
                  (local.set $vf (select (f32.min (f32.add (local.get $vf) (f32.const @KT_ACC)) (f32.const @KT_VMAX))
                                         (f32.max (f32.mul (local.get $vf) (f32.const @KT_OVER)) (f32.const @KT_VMAX))
                                         (f32.lt (local.get $vf) (f32.const @KT_VMAX)))))
                (else
                  (if (i32.and (local.get $in) (i32.const 0x02000000))
                    (then
                      (local.set $vf (select (f32.max (f32.sub (local.get $vf) (f32.const @KT_BRAKE)) (f32.const 0))
                                             (f32.max (f32.sub (local.get $vf) (f32.const @KT_RACC)) (f32.const @(-KT_VREV)))
                                             (f32.gt (local.get $vf) (f32.const 0)))))
                    (else (local.set $vf (f32.mul (local.get $vf) (f32.const @KT_COAST)))))))))
          (if (local.get $dir)
            (then
              ;; drifting: the slide bled round into the way it faces, its speed kept
              (local.set $dd (!madd (local.get $vf) (local.get $vf) (f32.mul (local.get $vl) (local.get $vl))))
              (local.set $vl (f32.mul (local.get $vl) (f32.const @KT_DGRIP)))
              (local.set $vf (f32.copysign (f32.sqrt (f32.max (f32.sub (local.get $dd) (f32.mul (local.get $vl) (local.get $vl))) (f32.const 0)))
                                           (local.get $vf))))
            (else (local.set $vl (f32.mul (local.get $vl) (f32.const @KT_GRIP)))))))))
  (local.set $vx (f32.sub (f32.mul (local.get $c) (local.get $vf)) (f32.mul (local.get $s) (local.get $vl))))
  (local.set $vz (!madd (local.get $s) (local.get $vf) (f32.mul (local.get $c) (local.get $vl))))
  ;; the wall: its centre kept its radius in from each side, what it brought into it mostly lost
  (local.set $r (call $b_rad (local.get $pb)))
  (local.set $cx (f32.load offset=@PG_CX (local.get $d)))
  (local.set $lim (f32.sub (f32.load offset=@(PG_H + KT_HALF) (local.get $d)) (local.get $r)))
  (if (f32.gt (f32.sub (local.get $px) (local.get $cx)) (local.get $lim))
    (then (local.set $px (f32.add (local.get $cx) (local.get $lim)))
          (if (f32.gt (local.get $vx) (f32.const 0)) (then (local.set $vx (f32.mul (local.get $vx) (f32.const @(-KT_WALLE))))))))
  (if (f32.lt (f32.sub (local.get $px) (local.get $cx)) (f32.neg (local.get $lim)))
    (then (local.set $px (f32.sub (local.get $cx) (local.get $lim)))
          (if (f32.lt (local.get $vx) (f32.const 0)) (then (local.set $vx (f32.mul (local.get $vx) (f32.const @(-KT_WALLE))))))))
  (if (f32.gt (f32.sub (local.get $pz) (local.get $cx)) (local.get $lim))
    (then (local.set $pz (f32.add (local.get $cx) (local.get $lim)))
          (if (f32.gt (local.get $vz) (f32.const 0)) (then (local.set $vz (f32.mul (local.get $vz) (f32.const @(-KT_WALLE))))))))
  (if (f32.lt (f32.sub (local.get $pz) (local.get $cx)) (f32.neg (local.get $lim)))
    (then (local.set $pz (f32.sub (local.get $cx) (local.get $lim)))
          (if (f32.lt (local.get $vz) (f32.const 0)) (then (local.set $vz (f32.mul (local.get $vz) (f32.const @(-KT_WALLE))))))))
  ;; the blocks, for a kart lower than their tops: out of each the shortest way, its speed into it bounced off
  (if (f32.lt (local.get $py) (f32.const @(+PLAT_Y + KT_BLOCKH - +P_STEP)))
    (then
      (!for $i (i32.const 0) (i32.load offset=@(PG_H + KT_NBLK) (local.get $d))
        (local.set $b (i32.shl (local.get $i) (i32.const 3)))
        (local.set $bx (f32.load offset=@(PG_S + KT_BLK) (local.get $b)))
        (local.set $bz (f32.load offset=@(PG_S + KT_BLK + 4) (local.get $b)))
        (local.set $qx (!clamp (local.get $px) (f32.sub (local.get $bx) (f32.const @KT_BLOCK)) (f32.add (local.get $bx) (f32.const @KT_BLOCK))))
        (local.set $qz (!clamp (local.get $pz) (f32.sub (local.get $bz) (f32.const @KT_BLOCK)) (f32.add (local.get $bz) (f32.const @KT_BLOCK))))
        (local.set $dx (f32.sub (local.get $px) (local.get $qx)))
        (local.set $dz (f32.sub (local.get $pz) (local.get $qz)))
        (local.set $d2 (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))))
        (if (f32.lt (local.get $d2) (f32.mul (local.get $r) (local.get $r)))
          (then
            (if (f32.gt (local.get $d2) (f32.const 1e-8))
              (then
                (local.set $dd (f32.sqrt (local.get $d2)))
                (local.set $nx (f32.div (local.get $dx) (local.get $dd)))
                (local.set $nz (f32.div (local.get $dz) (local.get $dd))))
              (else
                ;; its centre inside: out through the nearer side
                (local.set $ex (f32.sub (f32.const @KT_BLOCK) (f32.abs (f32.sub (local.get $px) (local.get $bx)))))
                (local.set $ez (f32.sub (f32.const @KT_BLOCK) (f32.abs (f32.sub (local.get $pz) (local.get $bz)))))
                (local.set $nx (f32.const 0))
                (local.set $nz (f32.const 0))
                (if (f32.lt (local.get $ex) (local.get $ez))
                  (then
                    (local.set $nx (select (f32.const -1) (f32.const 1) (f32.lt (local.get $px) (local.get $bx))))
                    (local.set $qx (!madd (local.get $nx) (f32.const @KT_BLOCK) (local.get $bx))))
                  (else
                    (local.set $nz (select (f32.const -1) (f32.const 1) (f32.lt (local.get $pz) (local.get $bz))))
                    (local.set $qz (!madd (local.get $nz) (f32.const @KT_BLOCK) (local.get $bz)))))))
            (local.set $px (!madd (local.get $nx) (f32.add (local.get $r) (f32.const 0.01)) (local.get $qx)))
            (local.set $pz (!madd (local.get $nz) (f32.add (local.get $r) (f32.const 0.01)) (local.get $qz)))
            (local.set $vn (!madd (local.get $vx) (local.get $nx) (f32.mul (local.get $vz) (local.get $nz))))
            (if (f32.lt (local.get $vn) (f32.const 0))
              (then
                (local.set $vx (f32.sub (local.get $vx) (f32.mul (local.get $nx) (f32.mul (local.get $vn) (f32.const @(1 + KT_WALLE))))))
                (local.set $vz (f32.sub (local.get $vz) (f32.mul (local.get $nz) (f32.mul (local.get $vn) (f32.const @(1 + KT_WALLE)))))))))))))
  ;; a dash panel under it on the ground: the boost topped up
  (if (i32.and (local.get $fl) (i32.const @PF_GROUND))
    (then
      (!for $i (i32.const 0) (i32.load offset=@(PG_H + KT_NPAD) (local.get $d))
        (local.set $b (i32.mul (local.get $i) (i32.const 12)))
        (local.set $dx (f32.abs (f32.sub (local.get $px) (f32.load offset=@(PG_S + KT_PAD) (local.get $b)))))
        (local.set $dz (f32.abs (f32.sub (local.get $pz) (f32.load offset=@(PG_S + KT_PAD + 4) (local.get $b)))))
        ;; ways 0 and 2 run along x, 1 and 3 along z
        (if (i32.and (i32.load offset=@(PG_S + KT_PAD + 8) (local.get $b)) (i32.const 1))
          (then (local.set $ex (local.get $dx)) (local.set $dx (local.get $dz)) (local.set $dz (local.get $ex))))
        (if (i32.and (f32.le (local.get $dx) (f32.const @KT_PADL)) (f32.le (local.get $dz) (f32.const @KT_PADW)))
          (then
            (local.set $n (!at u16 @(PLAYERS + B_DASH) (local.get $pb)))
            (if (i32.lt_u (local.get $n) (i32.const @KT_PADB))
              (then
                (if (i32.lt_u (local.get $n) (i32.const @(KT_PADB - 30)))
                  (then (call $fx (local.get $d) (i32.const @KT_FX_BOOST) (local.get $p) (i32.const 0) (local.get $px) (local.get $py) (local.get $pz) (f32.const 0))))
                (!put u16 @(PLAYERS + B_DASH) (local.get $pb) (i32.const @KT_PADB)))))))))
  (!chk (local.get $px) 153 (local.get $p))
  (!chk (local.get $pz) 153 (local.get $p))
  (!chk (local.get $vx) 154 (local.get $p))
  (!chk (local.get $vz) 154 (local.get $p))
  (!put f32 @(PLAYERS + P_PX) (local.get $pb) (local.get $px))
  (!put f32 @(PLAYERS + P_PZ) (local.get $pb) (local.get $pz))
  (!put f32 @(PLAYERS + P_VX) (local.get $pb) (local.get $vx))
  (!put f32 @(PLAYERS + P_VY) (local.get $pb) (local.get $vy))
  (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (local.get $vz))
  (!put u8 @(PLAYERS + P_FL) (local.get $pb) (local.get $fl))
  (!put i32 @(PLAYERS + PG_M) (local.get $pb)
    (i32.or (i32.or (local.get $h) (i32.shl (local.get $dir) (i32.const 14)))
            (i32.or (i32.shl (local.get $chg) (i32.const 16)) (i32.shl (local.get $spin) (i32.const 24))))))

;; v held to [lo, hi].
(func $kt_lim (param $v i32) (param $lo i32) (param $hi i32) (result i32)
  (if (i32.lt_s (local.get $v) (local.get $lo)) (then (return (local.get $lo))))
  (if (i32.gt_s (local.get $v) (local.get $hi)) (then (return (local.get $hi))))
  (local.get $v))

;; Slot p's score less k (at least 0), or more.
(func $kt_add (param $p i32) (param $k i32)
  (local $pb i32) (local $s i32)
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (local.set $s (i32.add (!at u16 @(PLAYERS + PG_SCORE) (local.get $pb)) (local.get $k)))
  (if (i32.lt_s (local.get $s) (i32.const 0)) (then (local.set $s (i32.const 0))))
  (if (i32.gt_s (local.get $s) (i32.const 65535)) (then (local.set $s (i32.const 65535))))
  (!put u16 @(PLAYERS + PG_SCORE) (local.get $pb) (local.get $s)))

;; Kart p hit (kind 0 a blast, 1 a MEGA kart): spun out, its drift gone, its
;; coins dropped (3 and one for every KT_LOSEK it holds, at most KT_LOSEMAX)
;; flying off it to land a few metres away, as many as there are records for.
(func $kt_hit (param $p i32) (param $kind i32) (param $t i32)
  (local $pb i32) (local $i i32) (local $k i32) (local $m i32) (local $s i32)
  (local $px f32) (local $py f32) (local $pz f32) (local $x f32) (local $z f32)
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (!put i32 @(PLAYERS + PG_M) (local.get $pb)
    (i32.or (i32.and (!at i32 @(PLAYERS + PG_M) (local.get $pb)) (i32.const 16383)) (i32.const @(KT_SPIN << 24))))
  (i32.store offset=@(PG_S + KT_BALL + KT_B_SAFE) (i32.shl (local.get $p) (i32.const 3)) (i32.add (local.get $t) (i32.const @(KT_SPIN + KT_GRACE))))
  (if (local.get $kind)
    (then
      (!put f32 @(PLAYERS + P_VX) (local.get $pb) (f32.mul (!at f32 @(PLAYERS + P_VX) (local.get $pb)) (f32.const 0.3)))
      (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (f32.mul (!at f32 @(PLAYERS + P_VZ) (local.get $pb)) (f32.const 0.3)))))
  (local.set $s (!at u16 @(PLAYERS + PG_SCORE) (local.get $pb)))
  (local.set $k (i32.add (i32.const @KT_LOSE0) (i32.div_u (local.get $s) (i32.const @KT_LOSEK))))
  (if (i32.gt_u (local.get $k) (i32.const @KT_LOSEMAX)) (then (local.set $k (i32.const @KT_LOSEMAX))))
  (if (i32.gt_u (local.get $k) (local.get $s)) (then (local.set $k (local.get $s))))
  (local.set $px (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
  (local.set $py (f32.add (!at f32 @(PLAYERS + P_PY) (local.get $pb)) (f32.const 1)))
  (local.set $pz (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
  (!for $i (i32.const 0) (local.get $k)
    (call $sincos (call $rand))
    (local.set $z) (local.set $x)
    (local.set $x (!madd (local.get $x) (!madd (call $p_unit) (f32.const 3.5) (f32.const 2.5)) (local.get $px)))
    (local.set $z (!madd (local.get $z) (!madd (call $p_unit) (f32.const 3.5) (f32.const 2.5)) (local.get $pz)))
    (call $kt_clear (call $kt_in (local.get $x) (local.get $z)) (f32.const 1.2))
    (local.set $z) (local.set $x)
    (if (call $kt_coin (local.get $px) (local.get $py) (local.get $pz) (local.get $x) (local.get $z) (f32.const 2.2) (local.get $t)
                       (i32.add (i32.const 60) (i32.rem_u (call $rand) (i32.const 30))) (i32.const 1) (i32.const @KT_KLOOSE))
      (then (!inc $m))))
  (call $kt_add (local.get $p) (i32.sub (i32.const 0) (local.get $m)))
  (call $fx (i32.const 0) (i32.const @KT_FX_HIT) (local.get $p) (local.get $m) (local.get $px) (local.get $py) (local.get $pz) (f32.convert_i32_u (local.get $kind))))

;; What a box hands out, from the PRNG: mostly DASH and ROCKET; a kart behind
;; the room's average more often POW and MEGA.
(func $kt_item (param $behind i32) (result i32)
  (local $h i32)
  (local.set $h (i32.rem_u (call $rand) (i32.const 100)))
  (if (local.get $behind)
    (then
      (if (i32.lt_u (local.get $h) (i32.const 25)) (then (return (i32.const @PU_DASH))))
      (if (i32.lt_u (local.get $h) (i32.const 55)) (then (return (i32.const @PU_ROCKET))))
      (if (i32.lt_u (local.get $h) (i32.const 70)) (then (return (i32.const @PU_SPRING))))
      (if (i32.lt_u (local.get $h) (i32.const 85)) (then (return (i32.const @PU_POW))))
      (return (i32.const @PU_MEGA))))
  (if (i32.lt_u (local.get $h) (i32.const 35)) (then (return (i32.const @PU_DASH))))
  (if (i32.lt_u (local.get $h) (i32.const 70)) (then (return (i32.const @PU_ROCKET))))
  (if (i32.lt_u (local.get $h) (i32.const 90)) (then (return (i32.const @PU_SPRING))))
  (if (i32.lt_u (local.get $h) (i32.const 95)) (then (return (i32.const @PU_POW))))
  (i32.const @PU_MEGA))

;; The first ball by slot in the grid's cells round (x, y, z) whose centre is
;; within its radius and reach of it (and, if free, holding nothing); NPLAYER for none.
(func $kt_first (param $x f32) (param $y f32) (param $z f32) (param $reach f32) (param $free i32) (result i32)
  (local $o f32) (local $gx i32) (local $gz i32) (local $cx i32) (local $cz i32) (local $i i32) (local $q i32) (local $qb i32) (local $best i32)
  (local $rr f32) (local $dx f32) (local $dy f32) (local $dz f32)
  (local.set $o (f32.sub (call $kt_c) (f32.const @(KT_GN * KT_CELL / 2))))
  (local.set $gx (i32.trunc_sat_f32_s (f32.floor (f32.mul (f32.sub (local.get $x) (local.get $o)) (f32.const @(1 / KT_CELL))))))
  (local.set $gz (i32.trunc_sat_f32_s (f32.floor (f32.mul (f32.sub (local.get $z) (local.get $o)) (f32.const @(1 / KT_CELL))))))
  (local.set $best (i32.const @NPLAYER))
  (!for $i (i32.const 0) (i32.const 9)
    (local.set $cx (i32.add (local.get $gx) (i32.sub (i32.rem_u (local.get $i) (i32.const 3)) (i32.const 1))))
    (local.set $cz (i32.add (local.get $gz) (i32.sub (i32.div_u (local.get $i) (i32.const 3)) (i32.const 1))))
    (if (i32.and (i32.lt_u (local.get $cx) (i32.const @KT_GN)) (i32.lt_u (local.get $cz) (i32.const @KT_GN)))
      (then
        (local.set $q (!ld u16 @(PG_BIG + KT_GRID) (i32.add (i32.mul (local.get $cz) (i32.const @KT_GN)) (local.get $cx))))
        (block $cellDone
          (loop $balls
            (br_if $cellDone (i32.ge_u (local.get $q) (local.get $best)))
            (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
            (local.set $rr (f32.add (call $b_rad (local.get $qb)) (local.get $reach)))
            (local.set $dx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $qb)) (local.get $x)))
            (local.set $dy (f32.sub (f32.add (!at f32 @(PLAYERS + P_PY) (local.get $qb)) (call $b_rad (local.get $qb))) (local.get $y)))
            (local.set $dz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $qb)) (local.get $z)))
            (if (i32.and (f32.lt (!dot3 (local.get $dx) (local.get $dy) (local.get $dz) (local.get $dx) (local.get $dy) (local.get $dz)) (f32.mul (local.get $rr) (local.get $rr)))
                         (i32.or (i32.eqz (local.get $free)) (i32.eqz (!at u8 @(PLAYERS + B_ITEM) (local.get $qb)))))
              (then (local.set $best (local.get $q)) (br $cellDone)))
            (local.set $q (!ld u16 @(PG_BIG + KT_GNEXT) (local.get $q)))
            (br $balls))))))
  (local.get $best))

;; The round's world, a tick of it, in slot order: each kart's hits (a fresh
;; one from a blast, its hitter not touching it, or from a MEGA kart that
;; is); a line of coins on the clock while the course is short of them; then
;; every box back and every coin, each to the first ball by slot within reach
;; of it (a grid of the balls in, by cell, slots ascending), and old coins gone.
(func $kt_tick
  (local $t i32) (local $tp i32) (local $fever i32) (local $p i32) (local $pb i32) (local $q i32) (local $qb i32) (local $kind i32)
  (local $sum i32) (local $n i32) (local $i i32) (local $b i32) (local $c i32) (local $a i32) (local $v i32) (local $tau i32) (local $air i32)
  (local $gx i32) (local $gz i32) (local $cell i32) (local $best i32) (local $item i32)
  (local $rr f32) (local $dx f32) (local $dy f32) (local $dz f32) (local $x f32) (local $y f32) (local $z f32) (local $o f32)
  (local.set $t (i32.load (i32.const @HDR_TICK)))
  (local.set $tp (call $p_t (i32.const 0)))
  (local.set $fever (i32.ge_u (local.get $tp) (i32.const @KT_FEVER)))
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
    (if (call $p_in (local.get $pb))
      (then
        (local.set $sum (i32.add (local.get $sum) (!at u16 @(PLAYERS + PG_SCORE) (local.get $pb))))
        (!inc $n)
        (local.set $q (!at u8 @(PLAYERS + B_HITBY) (local.get $pb)))
        (if (i32.and (i32.and (i32.eq (!at u16 @(PLAYERS + B_HITT) (local.get $pb)) (i32.const @CREDIT_TICKS))
                              (i32.and (i32.lt_u (local.get $q) (i32.const @NPLAYER)) (i32.ne (local.get $q) (local.get $p))))
                     (i32.and (i32.eqz (i32.shr_u (!at i32 @(PLAYERS + PG_M) (local.get $pb)) (i32.const 24)))
                              (i32.ge_s (i32.sub (local.get $t) (i32.load offset=@(PG_S + KT_BALL + KT_B_SAFE) (i32.shl (local.get $p) (i32.const 3)))) (i32.const 0))))
          (then
            (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
            (local.set $rr (f32.add (f32.add (call $b_rad (local.get $pb)) (call $b_rad (local.get $qb))) (f32.const 0.6)))
            (local.set $dx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (!at f32 @(PLAYERS + P_PX) (local.get $qb))))
            (local.set $dy (f32.sub (f32.add (!at f32 @(PLAYERS + P_PY) (local.get $pb)) (call $b_rad (local.get $pb)))
                                    (f32.add (!at f32 @(PLAYERS + P_PY) (local.get $qb)) (call $b_rad (local.get $qb)))))
            (local.set $dz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $pb)) (!at f32 @(PLAYERS + P_PZ) (local.get $qb))))
            (local.set $kind (i32.const -1))
            (if (f32.ge (!dot3 (local.get $dx) (local.get $dy) (local.get $dz) (local.get $dx) (local.get $dy) (local.get $dz)) (f32.mul (local.get $rr) (local.get $rr)))
              (then (local.set $kind (i32.const 0)))
              (else
                (if (i32.and (i32.ne (!at u16 @(PLAYERS + B_MEGA) (local.get $qb)) (i32.const 0)) (i32.eqz (!at u16 @(PLAYERS + B_MEGA) (local.get $pb))))
                  (then (local.set $kind (i32.const 1))))))
            (if (i32.ge_s (local.get $kind) (i32.const 0)) (then (call $kt_hit (local.get $p) (local.get $kind) (local.get $t)))))))))
  ;; the drops
  (if (i32.and (i32.eqz (i32.rem_u (local.get $tp) (select (i32.const @KT_EVERYF) (i32.const @KT_EVERY) (local.get $fever))))
               (i32.lt_u (i32.load (i32.const @(PG_H + KT_LIVE))) (call $kt_want (local.get $fever))))
    (then (call $kt_line (local.get $t))))
  ;; the grid: slots in descending, so each cell's list ascends
  (memory.fill (i32.const @(PG_BIG + KT_GRID)) (i32.const 0xff) (i32.const @(KT_GN * KT_GN * 2)))
  (local.set $o (f32.sub (call $kt_c) (f32.const @(KT_GN * KT_CELL / 2))))
  (local.set $p (i32.const @NPLAYER))
  (block $built
    (loop $next
      (br_if $built (i32.eqz (local.get $p)))
      (local.set $p (i32.sub (local.get $p) (i32.const 1)))
      (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
      (if (call $p_in (local.get $pb))
        (then
          (local.set $gx (i32.trunc_sat_f32_s (f32.floor (f32.mul (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (local.get $o)) (f32.const @(1 / KT_CELL))))))
          (local.set $gz (i32.trunc_sat_f32_s (f32.floor (f32.mul (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $pb)) (local.get $o)) (f32.const @(1 / KT_CELL))))))
          (if (i32.and (i32.lt_u (local.get $gx) (i32.const @KT_GN)) (i32.lt_u (local.get $gz) (i32.const @KT_GN)))
            (then
              (local.set $cell (i32.add (i32.mul (local.get $gz) (i32.const @KT_GN)) (local.get $gx)))
              (!st u16 @(PG_BIG + KT_GNEXT) (local.get $p) (!ld u16 @(PG_BIG + KT_GRID) (local.get $cell)))
              (!st u16 @(PG_BIG + KT_GRID) (local.get $cell) (local.get $p))))))
      (br $next)))
  ;; the boxes back, each to the first ball by slot holding nothing that drives into it
  (!for $i (i32.const 0) (i32.load (i32.const @(PG_H + KT_NBOX)))
    (local.set $b (i32.mul (local.get $i) (i32.const 12)))
    (if (i32.ge_u (local.get $tp) (i32.load offset=@(PG_S + KT_BOX + 8) (local.get $b)))
      (then
        (local.set $x (f32.load offset=@(PG_S + KT_BOX) (local.get $b)))
        (local.set $z (f32.load offset=@(PG_S + KT_BOX + 4) (local.get $b)))
        (local.set $best (call $kt_first (local.get $x) (f32.const @(+PLAT_Y + KT_BOXY)) (local.get $z) (f32.const @KT_BOXR) (i32.const 1)))
        (if (i32.lt_u (local.get $best) (i32.const @NPLAYER))
          (then
            (local.set $item (call $kt_item (i32.lt_u (i32.mul (!at u16 @(PLAYERS + PG_SCORE) (i32.shl (local.get $best) (i32.const 6))) (local.get $n)) (local.get $sum))))
            (!put u8 @(PLAYERS + B_ITEM) (i32.shl (local.get $best) (i32.const 6)) (local.get $item))
            (i32.store offset=@(PG_S + KT_BOX + 8) (local.get $b) (i32.add (local.get $tp) (i32.const @KT_BOXBACK)))
            (call $fx (i32.const 0) (i32.const @KT_FX_BOX) (local.get $best) (local.get $i) (local.get $x) (f32.const @(+PLAT_Y + KT_BOXY)) (local.get $z)
                      (f32.convert_i32_u (local.get $item))))))))
  ;; the coins
  (!for $c (i32.const 0) (i32.const @KT_MAX)
    (local.set $a (i32.shl (local.get $c) (i32.const 5)))
    (local.set $v (i32.load8_u offset=@(PG_BIG + KT_COINS + KT_C_V) (local.get $a)))
    (if (local.get $v)
      (then (block $done
        (local.set $tau (i32.sub (local.get $t) (i32.load offset=@(PG_BIG + KT_COINS + KT_C_T0) (local.get $a))))
        (br_if $done (i32.lt_s (local.get $tau) (i32.const 0)))
        (local.set $air (i32.load16_u offset=@(PG_BIG + KT_COINS + KT_C_AIR) (local.get $a)))
        (if (i32.ge_s (local.get $tau) (i32.add (local.get $air) (i32.const @KT_LIFE)))
          (then
            (i32.store8 offset=@(PG_BIG + KT_COINS + KT_C_V) (local.get $a) (i32.const 0))
            (i32.store (i32.const @(PG_H + KT_LIVE)) (i32.sub (i32.load (i32.const @(PG_H + KT_LIVE))) (i32.const 1)))
            (br $done)))
        (br_if $done (i32.and (i32.eq (i32.load8_u offset=@(PG_BIG + KT_COINS + KT_C_KIND) (local.get $a)) (i32.const @KT_KLOOSE))
                              (i32.lt_s (local.get $tau) (i32.const @KT_LOOSE))))
        (call $kt_at (local.get $a) (local.get $t))
        (local.set $z) (local.set $y) (local.set $x)
        (br_if $done (f32.gt (local.get $y) (f32.const @(+PLAT_Y + KT_GRABH))))
        (local.set $best (call $kt_first (local.get $x) (local.get $y) (local.get $z) (f32.const @KT_REACH) (i32.const 0)))
        (br_if $done (i32.ge_u (local.get $best) (i32.const @NPLAYER)))
        (call $kt_add (local.get $best) (local.get $v))
        (i32.store8 offset=@(PG_BIG + KT_COINS + KT_C_V) (local.get $a) (i32.const 0))
        (i32.store (i32.const @(PG_H + KT_LIVE)) (i32.sub (i32.load (i32.const @(PG_H + KT_LIVE))) (i32.const 1)))
        (call $fx (i32.const 0) (i32.const @KT_FX_TAKE) (local.get $best) (local.get $c) (local.get $x) (local.get $y) (local.get $z) (f32.convert_i32_u (local.get $v))))))))

(func $kt_over (result i32) (i32.const 0))

(func $kt_out (param $p i32))
