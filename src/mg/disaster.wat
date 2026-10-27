;; DISASTER ISLAND: a round island of grass over the sea, sized for the crowd,
;; a terraced hill or two on it, stone houses (a crate against each to hop up
;; from onto its roof) and rocks; and disasters, one after another, each the
;; seed's pick and never one of the last two, called ND_WARN before it hits:
;; a flood (the water rises over the low ground, its current drags outward,
;; and a ball under it too long drowns), a meteor shower onto marked rings, a
;; tornado wandering a seeded path (it pulls in, lifts and flings out), an
;; earthquake (the ground shoves on a rhythm, fissures open along glowing
;; lines), a tsunami (waves cross from one side; the lee of a house or a rock
;; is shelter, a roof over the water too) and lightning onto marked spots,
;; roofs and rocks first and some at the balls. Each is harder than the last
;; and the calm between them shorter; in the calm the rim crumbles in toward
;; ND_RMIN. Bumps on.
;; The last ball on wins; the balls one disaster takes off together share it.
;;
;; Everything a ball meets is laid by setup before the countdown, from the
;; round's random numbers: each cell's height and the tick into play the rim
;; takes it, the houses and rocks, the disasters (their ticks and their own
;; numbers) and every meteor and bolt, in PG_BIG. The bolts aimed at the
;; balls are moved onto them by the confirmed world's tick ND_LAHEAD before
;; they land, PRED_MAX, as far ahead as the prediction ever runs. Ground and
;; push read only that, against their own bank's tick, so the prediction
;; rolls a ball through every disaster exactly as the confirmed world will.
;; A ball's breath is its own record's (PG_M), kept by push on either bank.

;; Cell (q, r)'s index, -1 off the grid.
(func $nd_cell (param $q i32) (param $r i32) (result i32)
  (if (i32.or (i32.ge_u (i32.add (local.get $q) (i32.const @ND_N)) (i32.const @ND_W))
              (i32.ge_u (i32.add (local.get $r) (i32.const @ND_N)) (i32.const @ND_W)))
    (then (return (i32.const -1))))
  (i32.add (i32.mul (i32.add (local.get $r) (i32.const @ND_N)) (i32.const @ND_W)) (i32.add (local.get $q) (i32.const @ND_N))))

;; The cell under (x, z), -1 off the grid.
(func $nd_at (param $x f32) (param $z f32) (result i32)
  (local $cx f32)
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (call $nd_cell (i32.trunc_sat_f32_s (f32.floor (f32.div (f32.sub (local.get $x) (local.get $cx)) (f32.const @ND_S))))
                 (i32.trunc_sat_f32_s (f32.floor (f32.div (f32.sub (local.get $z) (local.get $cx)) (f32.const @ND_S))))))

;; Cell c's top, y.
(func $nd_top (param $c i32) (result f32)
  (!madd (f32.convert_i32_u (i32.load8_u offset=@(PG_BIG + ND_HGT) (local.get $c))) (f32.const @ND_STEP) (f32.const @PLAT_Y)))

;; The records: house or rock k, disaster j, strike e.
(func $nd_ob (param $k i32) (result i32)
  (i32.add (i32.const @(PG_BIG + ND_OBS)) (i32.mul (local.get $k) (i32.const @ND_OBSZ))))
(func $nd_dr (param $j i32) (result i32)
  (i32.add (i32.const @(PG_BIG + ND_DIS)) (i32.mul (local.get $j) (i32.const @ND_DSZ))))
(func $nd_ev (param $e i32) (result i32)
  (i32.add (i32.const @(PG_BIG + ND_EVS)) (i32.mul (local.get $e) (i32.const @ND_ESZ))))

;; The round's random number for k, as a unit in [0, 1), and as a bearing.
(func $nd_unit (param $k i32) (result f32)
  (f32.mul (f32.convert_i32_u (i32.shr_u (call $p_seed (local.get $k)) (i32.const 8))) (f32.const 0x1p-24)))
(func $nd_brg (param $k i32) (result i32)
  (i32.and (call $p_seed (local.get $k)) (i32.const 16383)))

;; Is (x, z) on house or rock record a's footprint, grown by g?
(func $nd_on (param $a i32) (param $x f32) (param $z f32) (param $g f32) (result i32)
  (local $dx f32) (local $dz f32) (local $hz f32) (local $hx f32)
  (local.set $dx (f32.sub (local.get $x) (f32.load (local.get $a))))
  (local.set $dz (f32.sub (local.get $z) (f32.load offset=4 (local.get $a))))
  (local.set $hx (f32.add (f32.load offset=8 (local.get $a)) (local.get $g)))
  (local.set $hz (f32.load offset=12 (local.get $a)))
  (if (result i32) (f32.eq (local.get $hz) (f32.const 0))
    (then (f32.le (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))) (f32.mul (local.get $hx) (local.get $hx))))
    (else (i32.and (f32.le (f32.abs (local.get $dx)) (local.get $hx))
                   (f32.le (f32.abs (local.get $dz)) (f32.add (local.get $hz) (local.get $g)))))))

;; ---- laying the island out (setup)

;; The island's radius at the start.
(func $nd_rad (result f32) (f32.load (i32.const @(PG_H + ND_RAD))))

;; Hill k's top's centre, x and z in the world, from the radius.
(func $nd_hill (param $k i32) (result f32 f32)
  (local $s f32) (local $c f32) (local $rr f32) (local $cx f32)
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (call $sincos (call $nd_brg (i32.add (i32.const 0x50000) (local.get $k))))
  (local.set $c) (local.set $s)
  (local.set $rr (f32.mul (f32.mul (call $nd_rad) (f32.const @ND_HAIM)) (f32.sqrt (call $nd_unit (i32.add (i32.const 0x50008) (local.get $k))))))
  (!madd (local.get $c) (local.get $rr) (local.get $cx))
  (!madd (local.get $s) (local.get $rr) (local.get $cx)))

;; Every cell whose centre is on the island, ND_NEVER for now, each with its
;; height: the highest of the hills over it (ND_HK steps on its top, a step
;; down every ND_HS m from there), never more than a step every ND_HS in from
;; the rim.
(func $nd_cells (param $rad f32)
  (local $q i32) (local $r i32) (local $c i32) (local $k i32) (local $nh i32) (local $h i32) (local $hk i32) (local $count i32)
  (local $x f32) (local $z f32) (local $rho f32) (local $s f32) (local $co f32) (local $rr f32) (local $top f32)
  (local $x1 f32) (local $z1 f32) (local $x2 f32) (local $z2 f32)
  (local.set $nh (select (i32.const 2) (i32.const 1) (f32.ge (local.get $rad) (f32.const 30))))
  (local.set $top (f32.mul (local.get $rad) (f32.const @ND_HTOP)))
  (!for $k (i32.const 0) (local.get $nh)
    (call $nd_hill (local.get $k))
    (local.set $z) (local.set $x)
    (if (local.get $k)
      (then (local.set $x2 (f32.sub (local.get $x) (f32.load (i32.const @PG_CX)))) (local.set $z2 (f32.sub (local.get $z) (f32.load (i32.const @PG_CX)))))
      (else (local.set $x1 (f32.sub (local.get $x) (f32.load (i32.const @PG_CX)))) (local.set $z1 (f32.sub (local.get $z) (f32.load (i32.const @PG_CX)))))))
  (!for $r (i32.const 0) (i32.const @ND_W)
    (!for $q (i32.const 0) (i32.const @ND_W)
      (local.set $c (i32.add (i32.mul (local.get $r) (i32.const @ND_W)) (local.get $q)))
      (local.set $x (f32.mul (f32.add (f32.convert_i32_s (i32.sub (local.get $q) (i32.const @ND_N))) (f32.const 0.5)) (f32.const @ND_S)))
      (local.set $z (f32.mul (f32.add (f32.convert_i32_s (i32.sub (local.get $r) (i32.const @ND_N))) (f32.const 0.5)) (f32.const @ND_S)))
      (local.set $rho (f32.sqrt (!madd (local.get $x) (local.get $x) (f32.mul (local.get $z) (local.get $z)))))
      (if (f32.le (local.get $rho) (local.get $rad))
        (then
          (!inc $count)
          (!st u16 @(PG_BIG + ND_DROP) (local.get $c) (i32.const @ND_NEVER))
          (local.set $h (i32.const 0))
          (!for $k (i32.const 0) (local.get $nh)
            (local.set $s (f32.sub (local.get $x) (select (local.get $x2) (local.get $x1) (local.get $k))))
            (local.set $co (f32.sub (local.get $z) (select (local.get $z2) (local.get $z1) (local.get $k))))
            (local.set $rr (f32.sqrt (!madd (local.get $s) (local.get $s) (f32.mul (local.get $co) (local.get $co)))))
            (local.set $hk (i32.sub (i32.const @ND_HK)
                                    (i32.trunc_sat_f32_s (f32.floor (f32.div (f32.max (f32.sub (local.get $rr) (local.get $top)) (f32.const 0)) (f32.const @ND_HS))))))
            (if (i32.gt_s (local.get $hk) (local.get $h)) (then (local.set $h (local.get $hk)))))
          (local.set $hk (i32.trunc_sat_f32_s (f32.floor (f32.div (f32.sub (local.get $rad) (local.get $rho)) (f32.const @ND_HS)))))
          (if (i32.lt_s (local.get $hk) (local.get $h)) (then (local.set $h (local.get $hk))))
          (i32.store8 offset=@(PG_BIG + ND_HGT) (local.get $c) (select (local.get $h) (i32.const 0) (i32.gt_s (local.get $h) (i32.const 0))))))))
  (i32.store (i32.const @(PG_H + ND_COUNT)) (local.get $count)))

;; Does a footprint round (x, z) reaching br keep ND_GAP from every house,
;; crate and rock laid so far (each by its own reach), and ND_GAP in from the rim?
(func $nd_room (param $x f32) (param $z f32) (param $br f32) (param $rad f32) (result i32)
  (local $k i32) (local $a i32) (local $n i32) (local $dx f32) (local $dz f32) (local $rk f32) (local $hz f32) (local $cx f32)
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (local.set $dx (f32.sub (local.get $x) (local.get $cx)))
  (local.set $dz (f32.sub (local.get $z) (local.get $cx)))
  (if (f32.gt (f32.add (f32.sqrt (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz)))) (local.get $br))
              (f32.sub (local.get $rad) (f32.const @ND_GAP)))
    (then (return (i32.const 0))))
  (local.set $n (i32.load (i32.const @(PG_H + ND_NOB))))
  (!for $k (i32.const 0) (local.get $n)
    (local.set $a (call $nd_ob (local.get $k)))
    (local.set $hz (f32.load offset=12 (local.get $a)))
    (local.set $rk (f32.load offset=8 (local.get $a)))
    (if (f32.gt (local.get $hz) (f32.const 0))
      (then (local.set $rk (f32.sqrt (!madd (local.get $rk) (local.get $rk) (f32.mul (local.get $hz) (local.get $hz)))))))
    (local.set $dx (f32.sub (local.get $x) (f32.load (local.get $a))))
    (local.set $dz (f32.sub (local.get $z) (f32.load offset=4 (local.get $a))))
    (local.set $rk (f32.add (f32.add (local.get $rk) (local.get $br)) (f32.const @ND_GAP)))
    (if (f32.lt (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))) (f32.mul (local.get $rk) (local.get $rk)))
      (then (return (i32.const 0)))))
  (i32.const 1))

;; Record k: (x, z), half extents hx, hz (hz 0: round, hx its radius), so
;; high over the cell under its centre, of kind.
(func $nd_put (param $k i32) (param $x f32) (param $z f32) (param $hx f32) (param $hz f32) (param $high f32) (param $kind i32)
  (local $a i32)
  (local.set $a (call $nd_ob (local.get $k)))
  (f32.store (local.get $a) (local.get $x))
  (f32.store offset=4 (local.get $a) (local.get $z))
  (f32.store offset=8 (local.get $a) (local.get $hx))
  (f32.store offset=12 (local.get $a) (local.get $hz))
  (f32.store offset=16 (local.get $a) (f32.add (call $nd_top (call $nd_at (local.get $x) (local.get $z))) (local.get $high)))
  (i32.store offset=20 (local.get $a) (i32.const @ND_NEVER))
  (i32.store offset=24 (local.get $a) (local.get $kind))
  (i32.store (i32.const @(PG_H + ND_NOB)) (i32.add (local.get $k) (i32.const 1))))

;; 1 + radius / ND_PERH houses, then 1 + radius / ND_PERR rocks, each on a
;; spot up to ND_OAIM of the radius out with room round it (30 tries, else
;; none). A house's crate stands against one of its walls, part way along.
(func $nd_obstacles (param $rad f32)
  (local $nh i32) (local $nr i32) (local $i i32) (local $try i32) (local $k i32) (local $key i32) (local $side i32)
  (local $x f32) (local $z f32) (local $s f32) (local $c f32) (local $rr f32) (local $hx f32) (local $hz f32) (local $cx f32)
  (local $ux f32) (local $uz f32) (local $off f32)
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (local.set $nh (i32.add (i32.const 1) (i32.trunc_sat_f32_u (f32.div (local.get $rad) (f32.const @ND_PERH)))))
  (local.set $nr (i32.add (i32.const 1) (i32.trunc_sat_f32_u (f32.div (local.get $rad) (f32.const @ND_PERR)))))
  (!for $i (i32.const 0) (i32.add (local.get $nh) (local.get $nr))
    (block $placed
      (!for $try (i32.const 0) (i32.const 30)
        (local.set $k (i32.load (i32.const @(PG_H + ND_NOB))))
        (br_if $placed (i32.gt_u (i32.add (local.get $k) (i32.const 2)) (i32.const @ND_NOBMAX)))
        (local.set $key (i32.add (i32.const 0x20000) (i32.add (i32.shl (local.get $i) (i32.const 8)) (i32.shl (local.get $try) (i32.const 3)))))
        (call $sincos (call $nd_brg (local.get $key)))
        (local.set $c) (local.set $s)
        (local.set $rr (f32.mul (f32.mul (local.get $rad) (f32.const @ND_OAIM)) (f32.sqrt (call $nd_unit (i32.add (local.get $key) (i32.const 1))))))
        (local.set $x (!madd (local.get $c) (local.get $rr) (local.get $cx)))
        (local.set $z (!madd (local.get $s) (local.get $rr) (local.get $cx)))
        (if (i32.lt_u (local.get $i) (local.get $nh))
          (then
            (local.set $hx (!madd (call $nd_unit (i32.add (local.get $key) (i32.const 2))) (f32.const @ND_HXK) (f32.const @ND_HX0)))
            (local.set $hz (!madd (call $nd_unit (i32.add (local.get $key) (i32.const 3))) (f32.const @ND_HXK) (f32.const @ND_HX0)))
            ;; the crate: against the wall on side 0 +x, 1 -x, 2 +z, 3 -z, part way along it
            (local.set $side (i32.and (call $p_seed (i32.add (local.get $key) (i32.const 4))) (i32.const 3)))
            (local.set $off (f32.sub (f32.mul (call $nd_unit (i32.add (local.get $key) (i32.const 5))) (f32.const 2)) (f32.const 1)))
            (local.set $ux (f32.const 0)) (local.set $uz (f32.const 0))
            (if (i32.lt_u (local.get $side) (i32.const 2))
              (then
                (local.set $ux (f32.mul (select (f32.const 1) (f32.const -1) (i32.eqz (local.get $side))) (f32.add (local.get $hx) (f32.const @ND_CX))))
                (local.set $uz (f32.mul (local.get $off) (f32.mul (f32.sub (local.get $hz) (f32.const @ND_CX)) (f32.const 0.8)))))
              (else
                (local.set $uz (f32.mul (select (f32.const 1) (f32.const -1) (i32.eq (local.get $side) (i32.const 2))) (f32.add (local.get $hz) (f32.const @ND_CX))))
                (local.set $ux (f32.mul (local.get $off) (f32.mul (f32.sub (local.get $hx) (f32.const @ND_CX)) (f32.const 0.8))))))
            (if (i32.and (call $nd_room (local.get $x) (local.get $z) (f32.sqrt (!madd (local.get $hx) (local.get $hx) (f32.mul (local.get $hz) (local.get $hz)))) (local.get $rad))
                         (call $nd_room (f32.add (local.get $x) (local.get $ux)) (f32.add (local.get $z) (local.get $uz)) (f32.const @(ND_CX * 1.4143)) (local.get $rad)))
              (then
                (call $nd_put (local.get $k) (local.get $x) (local.get $z) (local.get $hx) (local.get $hz)
                              (!madd (call $nd_unit (i32.add (local.get $key) (i32.const 6))) (f32.const @ND_HTK) (f32.const @ND_HT0)) (i32.const @ND_HOUSE))
                (call $nd_put (i32.add (local.get $k) (i32.const 1)) (f32.add (local.get $x) (local.get $ux)) (f32.add (local.get $z) (local.get $uz))
                              (f32.const @ND_CX) (f32.const @ND_CX) (f32.const @ND_CH) (i32.const @ND_CRATE))
                (br $placed))))
          (else
            (local.set $hx (!madd (call $nd_unit (i32.add (local.get $key) (i32.const 2))) (f32.const @ND_RRK) (f32.const @ND_RR0)))
            (if (call $nd_room (local.get $x) (local.get $z) (local.get $hx) (local.get $rad))
              (then
                (call $nd_put (local.get $k) (local.get $x) (local.get $z) (local.get $hx) (f32.const 0)
                              (!madd (call $nd_unit (i32.add (local.get $key) (i32.const 6))) (f32.const @ND_RTK) (f32.const @ND_RT0)) (i32.const @ND_ROCK))
                (br $placed)))))))))

;; The disasters' kinds and ticks: the first hits ND_FIRST in, each called
;; ND_WARN before, lasts ND_DUR0 plus up to ND_DURK, the calm after it
;; ND_CALM0 less ND_CALMK each one down to ND_CALM1; none starts past ND_LAST
;; or ends past ND_LMAX less ND_TAIL. A kind is never one of the last two.
;; The round's length: ND_TAIL past the last one's end.
(func $nd_timeline
  (local $t i32) (local $j i32) (local $a i32) (local $k i32) (local $m i32) (local $r i32) (local $p1 i32) (local $p2 i32) (local $t1 i32) (local $g i32)
  (local.set $t (i32.const @ND_FIRST))
  (local.set $p1 (i32.const -1))
  (local.set $p2 (i32.const -1))
  (block $done
    (loop $more
      (br_if $done (i32.ge_u (local.get $j) (i32.const @ND_NDMAX)))
      (br_if $done (i32.gt_u (local.get $t) (i32.const @ND_LAST)))
      ;; the kind: the r-th of those that aren't the last two
      (local.set $m (i32.const 0))
      (!for $k (i32.const 0) (i32.const @ND_KINDS)
        (if (i32.and (i32.ne (local.get $k) (local.get $p1)) (i32.ne (local.get $k) (local.get $p2))) (then (!inc $m))))
      (local.set $r (i32.rem_u (call $p_seed (i32.add (i32.const 0x30000) (i32.shl (local.get $j) (i32.const 4)))) (local.get $m)))
      (block $found
        (!for $k (i32.const 0) (i32.const @ND_KINDS)
          (if (i32.and (i32.ne (local.get $k) (local.get $p1)) (i32.ne (local.get $k) (local.get $p2)))
            (then
              (br_if $found (i32.eqz (local.get $r)))
              (local.set $r (i32.sub (local.get $r) (i32.const 1)))))))
      (local.set $t1 (i32.add (local.get $t)
        (i32.add (i32.const @ND_DUR0) (i32.rem_u (call $p_seed (i32.add (i32.const 0x30001) (i32.shl (local.get $j) (i32.const 4)))) (i32.const @(ND_DURK + 1))))))
      (if (i32.gt_u (local.get $t1) (i32.const @(ND_LMAX - ND_TAIL))) (then (local.set $t1 (i32.const @(ND_LMAX - ND_TAIL)))))
      (local.set $a (call $nd_dr (local.get $j)))
      (i32.store (local.get $a) (local.get $k))
      (i32.store offset=4 (local.get $a) (i32.sub (local.get $t) (i32.const @ND_WARN)))
      (i32.store offset=8 (local.get $a) (local.get $t))
      (i32.store offset=12 (local.get $a) (local.get $t1))
      (i32.store offset=16 (local.get $a) (local.get $j))
      (local.set $p2 (local.get $p1))
      (local.set $p1 (local.get $k))
      (local.set $g (i32.sub (i32.const @ND_CALM0) (i32.mul (local.get $j) (i32.const @ND_CALMK))))
      (if (i32.lt_s (local.get $g) (i32.const @ND_CALM1)) (then (local.set $g (i32.const @ND_CALM1))))
      (local.set $t (i32.add (local.get $t1) (local.get $g)))
      (!inc $j)
      (br $more)))
  (i32.store (i32.const @(PG_H + ND_ND)) (local.get $j))
  (i32.store (i32.const @PG_LEN) (i32.add (i32.load offset=12 (call $nd_dr (i32.sub (local.get $j) (i32.const 1)))) (i32.const @ND_TAIL))))

;; The calm between disaster j and the next, in ticks (0 after the last).
(func $nd_calm (param $j i32) (result i32)
  (if (i32.ge_u (i32.add (local.get $j) (i32.const 1)) (i32.load (i32.const @(PG_H + ND_ND)))) (then (return (i32.const 0))))
  (i32.sub (i32.load offset=8 (call $nd_dr (i32.add (local.get $j) (i32.const 1)))) (i32.load offset=12 (call $nd_dr (local.get $j)))))

;; The erosion. Every cell past the rim's last line goes in the calms, after
;; its share e of all the calm (by how far in from the rim it is, and its own
;; jitter): the e-th tick of calm, the calms laid end to end. A house, crate
;; or rock goes with the cell under its centre. Each disaster keeps the
;; island's radius as it hits: the rim, less the jitter, after the calm before.
(func $nd_erode (param $rad f32)
  (local $q i32) (local $r i32) (local $c i32) (local $j i32) (local $nd i32) (local $all i32) (local $e i32) (local $g i32) (local $jit i32)
  (local $before i32) (local $k i32) (local $n i32) (local $a i32)
  (local $x f32) (local $z f32) (local $rho f32) (local $rmin f32) (local $span f32)
  (local.set $nd (i32.load (i32.const @(PG_H + ND_ND))))
  (local.set $rmin (f32.load (i32.const @(PG_H + ND_RMIN))))
  (!for $j (i32.const 0) (local.get $nd)
    (local.set $all (i32.add (local.get $all) (call $nd_calm (local.get $j)))))
  (local.set $span (f32.mul (f32.convert_i32_u (local.get $all)) (f32.const @ND_EK)))
  (local.set $jit (i32.trunc_sat_f32_u (f32.mul (f32.convert_i32_u (local.get $all)) (f32.const @ND_EJ))))
  (if (i32.eqz (local.get $jit)) (then (local.set $jit (i32.const 1))))
  (if (local.get $all)
    (then
      (!for $r (i32.const 0) (i32.const @ND_W)
        (!for $q (i32.const 0) (i32.const @ND_W)
          (local.set $c (i32.add (i32.mul (local.get $r) (i32.const @ND_W)) (local.get $q)))
          (local.set $x (f32.mul (f32.add (f32.convert_i32_s (i32.sub (local.get $q) (i32.const @ND_N))) (f32.const 0.5)) (f32.const @ND_S)))
          (local.set $z (f32.mul (f32.add (f32.convert_i32_s (i32.sub (local.get $r) (i32.const @ND_N))) (f32.const 0.5)) (f32.const @ND_S)))
          (local.set $rho (f32.sqrt (!madd (local.get $x) (local.get $x) (f32.mul (local.get $z) (local.get $z)))))
          (if (i32.and (i32.ne (!ld u16 @(PG_BIG + ND_DROP) (local.get $c)) (i32.const 0)) (f32.gt (local.get $rho) (local.get $rmin)))
            (then
              (local.set $e (i32.add (i32.trunc_sat_f32_u (f32.mul (f32.div (f32.sub (local.get $rad) (local.get $rho)) (f32.sub (local.get $rad) (local.get $rmin)))
                                                                   (local.get $span)))
                                     (i32.rem_u (call $p_seed (i32.add (i32.const 0x10000) (local.get $c))) (local.get $jit))))
              (if (i32.ge_u (local.get $e) (local.get $all)) (then (local.set $e (i32.sub (local.get $all) (i32.const 1)))))
              (block $laid
                (!for $j (i32.const 0) (local.get $nd)
                  (local.set $g (call $nd_calm (local.get $j)))
                  (if (i32.lt_u (local.get $e) (local.get $g))
                    (then
                      (!st u16 @(PG_BIG + ND_DROP) (local.get $c)
                        (i32.add (i32.add (i32.load offset=12 (call $nd_dr (local.get $j))) (local.get $e)) (i32.const 1)))
                      (br $laid)))
                  (local.set $e (i32.sub (local.get $e) (local.get $g)))))))))))
  ;; the radius each disaster hits with
  (!for $j (i32.const 0) (local.get $nd)
    (f32.store offset=20 (call $nd_dr (local.get $j))
      (if (result f32) (local.get $all)
        (then (f32.sub (local.get $rad) (f32.mul (f32.sub (local.get $rad) (local.get $rmin))
                                                 (f32.min (f32.div (f32.convert_i32_u (local.get $before)) (local.get $span)) (f32.const 1)))))
        (else (local.get $rad))))
    (local.set $before (i32.add (local.get $before) (call $nd_calm (local.get $j)))))
  (local.set $n (i32.load (i32.const @(PG_H + ND_NOB))))
  (!for $k (i32.const 0) (local.get $n)
    (local.set $a (call $nd_ob (local.get $k)))
    (local.set $c (call $nd_at (f32.load (local.get $a)) (f32.load offset=4 (local.get $a))))
    (i32.store offset=20 (local.get $a) (select (!ld u16 @(PG_BIG + ND_DROP) (local.get $c)) (i32.const 0) (i32.ge_s (local.get $c) (i32.const 0))))))

;; What stands highest at (x, z) on tick tp into play: its top and the house,
;; crate or rock it is plus 1 (0 the ground; -1000 and 0 the sea).
(func $nd_surface (param $x f32) (param $z f32) (param $tp i32) (result f32 i32)
  (local $c i32) (local $k i32) (local $n i32) (local $a i32) (local $o i32) (local $top f32) (local $t f32)
  (local.set $top (f32.const -1000))
  (local.set $c (call $nd_at (local.get $x) (local.get $z)))
  (if (i32.ge_s (local.get $c) (i32.const 0))
    (then (if (i32.lt_u (local.get $tp) (!ld u16 @(PG_BIG + ND_DROP) (local.get $c))) (then (local.set $top (call $nd_top (local.get $c)))))))
  (local.set $n (i32.load (i32.const @(PG_H + ND_NOB))))
  (!for $k (i32.const 0) (local.get $n)
    (local.set $a (call $nd_ob (local.get $k)))
    (if (i32.and (i32.lt_u (local.get $tp) (i32.load offset=20 (local.get $a))) (call $nd_on (local.get $a) (local.get $x) (local.get $z) (f32.const 0)))
      (then
        (local.set $t (f32.load offset=16 (local.get $a)))
        (if (f32.gt (local.get $t) (local.get $top)) (then (local.set $top (local.get $t)) (local.set $o (i32.add (local.get $k) (i32.const 1))))))))
  (local.get $top) (local.get $o))

;; Strike e (of kind, disaster j) landing tp into play at (x, z), reaching rr.
(func $nd_strike (param $e i32) (param $tp i32) (param $x f32) (param $z f32) (param $rr f32) (param $kind i32) (param $j i32)
  (local $a i32) (local $o i32) (local $top f32)
  (local.set $a (call $nd_ev (local.get $e)))
  (call $nd_surface (local.get $x) (local.get $z) (local.get $tp))
  (local.set $o) (local.set $top)
  (i32.store (local.get $a) (local.get $tp))
  (f32.store offset=4 (local.get $a) (local.get $x))
  (f32.store offset=8 (local.get $a) (local.get $z))
  (f32.store offset=12 (local.get $a) (f32.max (local.get $top) (f32.const @PLAT_Y)))
  (f32.store offset=16 (local.get $a) (local.get $rr))
  (i32.store offset=20 (local.get $a) (i32.or (local.get $kind) (select (i32.const @ND_EV_ROOF) (i32.const 0) (local.get $o))))
  (i32.store offset=24 (local.get $a) (local.get $j))
  (i32.store offset=28 (local.get $a) (local.get $o)))

;; Disaster j's meteors or bolts (bolt): one every ND_MPER (ND_LPER) m^2 of
;; the island it hits a second, ND_MMIN (ND_LMIN) at least, more each level;
;; from 60 ticks after it hits to 30 before its end, each in its turn of
;; the rate plus up to 0.8 of it, anywhere on the island but its last 4%.
;; The bolts have ND_LAIMR a second more for each of the nb balls in at the
;; start (more each level), and as many of them in all are aimed
;; (ND_EV_AIM): laid anywhere for now, $nd_aim moves them onto the balls
;; ND_LAHEAD before they land. Of the rest, ND_LROOF on a house, crate or
;; rock still standing, ND_LHILL on a hill's top or its first step down.
(func $nd_strikes (param $j i32) (param $bolt i32) (param $nb i32)
  (local $a i32) (local $t0 i32) (local $t1 i32) (local $e i32) (local $k i32) (local $t i32) (local $key i32) (local $o i32) (local $n i32) (local $oa i32)
  (local $rad f32) (local $rate f32) (local $gap f32) (local $lv f32) (local $rr f32) (local $s f32) (local $c f32) (local $x f32) (local $z f32) (local $cx f32)
  (local $hx f32) (local $hz f32) (local $u f32) (local $dd f32) (local $hill i32) (local $aim i32) (local $pa f32)
  (local.set $a (call $nd_dr (local.get $j)))
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (local.set $t0 (i32.load offset=8 (local.get $a)))
  (local.set $t1 (i32.load offset=12 (local.get $a)))
  (local.set $rad (f32.load offset=20 (local.get $a)))
  (local.set $lv (f32.convert_i32_u (i32.load offset=16 (local.get $a))))
  (if (f32.gt (local.get $lv) (f32.const @ND_LVMAX)) (then (local.set $lv (f32.const @ND_LVMAX))))
  (local.set $rate (f32.mul (f32.mul (local.get $rad) (local.get $rad)) (f32.const 3.1415927)))
  (if (local.get $bolt)
    (then
      (local.set $rate (f32.max (f32.div (local.get $rate) (f32.const @ND_LPER)) (f32.const @ND_LMIN)))
      (local.set $pa (f32.mul (f32.convert_i32_u (local.get $nb)) (f32.const @ND_LAIMR)))
      (local.set $rate (f32.add (local.get $rate) (local.get $pa)))
      (local.set $pa (f32.div (local.get $pa) (local.get $rate)))
      (local.set $rate (f32.mul (local.get $rate) (!madd (local.get $lv) (f32.const @ND_LUP) (f32.const 1)))))
    (else (local.set $rate (f32.mul (f32.max (f32.div (local.get $rate) (f32.const @ND_MPER)) (f32.const @ND_MMIN)) (!madd (local.get $lv) (f32.const @ND_MUP) (f32.const 1))))))
  (local.set $gap (f32.div (f32.const 125) (local.get $rate)))
  (local.set $e (i32.load (i32.const @(PG_H + ND_NE))))
  (i32.store offset=24 (local.get $a) (local.get $e))
  (local.set $n (i32.load (i32.const @(PG_H + ND_NOB))))
  (block $done
    (loop $more
      (br_if $done (i32.ge_u (local.get $e) (i32.const @ND_NEMAX)))
      (local.set $key (i32.add (i32.const 0x1000000) (i32.add (i32.shl (local.get $j) (i32.const 16)) (i32.shl (local.get $k) (i32.const 2)))))
      (local.set $t (i32.add (i32.add (local.get $t0) (i32.const 60))
                             (i32.trunc_sat_f32_u (f32.mul (!madd (call $nd_unit (local.get $key)) (f32.const 0.8) (f32.convert_i32_u (local.get $k))) (local.get $gap)))))
      (br_if $done (i32.ge_u (local.get $t) (i32.sub (local.get $t1) (i32.const 30))))
      (local.set $o (i32.const -1))
      (local.set $u (call $nd_unit (i32.add (local.get $key) (i32.const 1))))
      (local.set $aim (i32.and (i32.ne (local.get $bolt) (i32.const 0)) (f32.lt (call $nd_unit (i32.add (local.get $key) (i32.const 5))) (local.get $pa))))
      (if (local.get $aim) (then (local.set $u (f32.const 1))))
      (local.set $hill (i32.and (i32.ne (local.get $bolt) (i32.const 0))
                                (i32.and (f32.ge (local.get $u) (f32.const @ND_LROOF)) (f32.lt (local.get $u) (f32.const @(ND_LROOF + ND_LHILL))))))
      (if (i32.and (i32.ne (local.get $bolt) (i32.const 0)) (i32.ne (local.get $n) (i32.const 0)))
        (then
          (if (f32.lt (local.get $u) (f32.const @ND_LROOF))
            (then
              (local.set $o (i32.rem_u (call $p_seed (i32.add (local.get $key) (i32.const 2))) (local.get $n)))
              (if (i32.ge_u (local.get $t) (i32.load offset=20 (call $nd_ob (local.get $o)))) (then (local.set $o (i32.const -1))))))))
      (if (i32.ge_s (local.get $o) (i32.const 0))
        (then
          ;; somewhere on its top, off its edge
          (local.set $oa (call $nd_ob (local.get $o)))
          (local.set $hx (f32.load offset=8 (local.get $oa)))
          (local.set $hz (f32.load offset=12 (local.get $oa)))
          (local.set $s (f32.sub (f32.mul (call $nd_unit (i32.add (local.get $key) (i32.const 3))) (f32.const 2)) (f32.const 1)))
          (local.set $c (f32.sub (f32.mul (call $nd_unit (i32.add (local.get $key) (i32.const 2))) (f32.const 2)) (f32.const 1)))
          (if (f32.eq (local.get $hz) (f32.const 0)) (then (local.set $hz (f32.mul (local.get $hx) (f32.const 0.7))) (local.set $hx (local.get $hz))))
          (local.set $x (!madd (local.get $s) (f32.max (f32.sub (local.get $hx) (f32.const 0.4)) (f32.const 0)) (f32.load (local.get $oa))))
          (local.set $z (!madd (local.get $c) (f32.max (f32.sub (local.get $hz) (f32.const 0.4)) (f32.const 0)) (f32.load offset=4 (local.get $oa)))))
        (else
          (if (local.get $hill)
            (then
              ;; round a hill's top, as $nd_cells lays it: on the top and a step down
              (call $nd_hill (i32.and (call $p_seed (i32.add (local.get $key) (i32.const 2))) (select (i32.const 1) (i32.const 0) (f32.ge (call $nd_rad) (f32.const 30)))))
              (local.set $z) (local.set $x)
              (local.set $rr (f32.mul (!madd (f32.load (i32.const @(PG_H + ND_RAD))) (f32.const @ND_HTOP) (f32.const @ND_HS))
                                      (f32.sqrt (call $nd_unit (i32.add (local.get $key) (i32.const 3))))))
              (call $sincos (call $nd_brg (i32.add (local.get $key) (i32.const 4))))
              (local.set $c) (local.set $s)
              (local.set $x (!madd (local.get $c) (local.get $rr) (local.get $x)))
              (local.set $z (!madd (local.get $s) (local.get $rr) (local.get $z)))
              ;; drawn in onto the island as it stands, if the rim has taken the hill's foot
              (local.set $hx (f32.sub (local.get $x) (local.get $cx)))
              (local.set $hz (f32.sub (local.get $z) (local.get $cx)))
              (local.set $dd (f32.sqrt (!madd (local.get $hx) (local.get $hx) (f32.mul (local.get $hz) (local.get $hz)))))
              (if (f32.gt (local.get $dd) (f32.mul (local.get $rad) (f32.const 0.96)))
                (then
                  (local.set $dd (f32.div (f32.mul (local.get $rad) (f32.const 0.96)) (local.get $dd)))
                  (local.set $x (!madd (local.get $hx) (local.get $dd) (local.get $cx)))
                  (local.set $z (!madd (local.get $hz) (local.get $dd) (local.get $cx))))))
            (else
              (call $sincos (call $nd_brg (i32.add (local.get $key) (i32.const 3))))
              (local.set $c) (local.set $s)
              (local.set $rr (f32.mul (f32.mul (local.get $rad) (f32.const 0.96)) (f32.sqrt (call $nd_unit (i32.add (local.get $key) (i32.const 2))))))
              (local.set $x (!madd (local.get $c) (local.get $rr) (local.get $cx)))
              (local.set $z (!madd (local.get $s) (local.get $rr) (local.get $cx)))))))
      (call $nd_strike (local.get $e) (local.get $t) (local.get $x) (local.get $z)
                       (if (result f32) (local.get $bolt) (then (f32.const @ND_LR))
                         (else (!madd (call $nd_unit (i32.add (local.get $key) (i32.const 1))) (f32.const @ND_MRK) (f32.const @ND_MR0))))
                       (select (select (i32.const @(ND_EV_BOLT | ND_EV_AIM)) (i32.const @ND_EV_BOLT) (local.get $aim)) (i32.const @ND_EV_METEOR) (local.get $bolt))
                       (local.get $j))
      (!inc $e)
      (!inc $k)
      (br $more)))
  (i32.store offset=28 (local.get $a) (local.get $e))
  (i32.store (i32.const @(PG_H + ND_NE)) (local.get $e)))

;; Each disaster's own numbers, by its kind and level (and the nb balls in), then the strikes' buckets.
(func $nd_params (param $nb i32)
  (local $j i32) (local $nd i32) (local $a i32) (local $kind i32) (local $key i32) (local $f i32) (local $fa i32) (local $nf i32) (local $nw i32)
  (local $b i32) (local $e i32) (local $ne i32) (local $lo i32) (local $hi i32) (local $w i32) (local $span i32) (local $gap i32)
  (local $lv f32) (local $rad f32) (local $s f32) (local $c f32) (local $rr f32) (local $cx f32) (local $u f32) (local $wc f32)
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (local.set $nd (i32.load (i32.const @(PG_H + ND_ND))))
  (!for $j (i32.const 0) (local.get $nd)
    (local.set $a (call $nd_dr (local.get $j)))
    (local.set $kind (i32.load (local.get $a)))
    (local.set $rad (f32.load offset=20 (local.get $a)))
    (local.set $lv (f32.min (f32.convert_i32_u (local.get $j)) (f32.const @ND_LVMAX)))
    (local.set $key (i32.add (i32.const 0x38000) (i32.shl (local.get $j) (i32.const 6))))
    (if (i32.eq (local.get $kind) (i32.const @ND_FLOOD))
      (then (f32.store offset=24 (local.get $a) (!madd (local.get $lv) (f32.const @ND_FDK) (f32.const @ND_FD0)))))
    (if (i32.eq (local.get $kind) (i32.const @ND_METEOR)) (then (call $nd_strikes (local.get $j) (i32.const 0) (local.get $nb))))
    (if (i32.eq (local.get $kind) (i32.const @ND_LIGHTNING)) (then (call $nd_strikes (local.get $j) (i32.const 1) (local.get $nb))))
    (if (i32.eq (local.get $kind) (i32.const @ND_TORNADO))
      (then
        (call $sincos (call $nd_brg (local.get $key)))
        (local.set $c) (local.set $s)
        (local.set $rr (f32.mul (f32.mul (local.get $rad) (f32.const @ND_TAIM)) (f32.sqrt (call $nd_unit (i32.add (local.get $key) (i32.const 1))))))
        (f32.store offset=24 (local.get $a) (!madd (local.get $c) (local.get $rr) (local.get $cx)))
        (f32.store offset=28 (local.get $a) (!madd (local.get $s) (local.get $rr) (local.get $cx)))
        (f32.store offset=32 (local.get $a) (f32.mul (local.get $rad) (!madd (call $nd_unit (i32.add (local.get $key) (i32.const 2))) (f32.const @ND_TA1K) (f32.const @ND_TA1))))
        (f32.store offset=36 (local.get $a) (f32.mul (local.get $rad) (!madd (call $nd_unit (i32.add (local.get $key) (i32.const 3))) (f32.const @ND_TA2K) (f32.const @ND_TA2))))
        (i32.store offset=40 (local.get $a) (call $nd_brg (i32.add (local.get $key) (i32.const 4))))
        (local.set $w (i32.trunc_sat_f32_s (f32.mul (!madd (call $nd_unit (i32.add (local.get $key) (i32.const 5))) (f32.const @ND_TW1K) (f32.const @ND_TW1))
                                                    (!madd (local.get $lv) (f32.const @ND_TWUP) (f32.const 1)))))
        (i32.store offset=44 (local.get $a) (select (local.get $w) (i32.sub (i32.const 0) (local.get $w)) (i32.and (call $p_seed (i32.add (local.get $key) (i32.const 6))) (i32.const 1))))
        (i32.store offset=48 (local.get $a) (call $nd_brg (i32.add (local.get $key) (i32.const 7))))
        (local.set $w (i32.trunc_sat_f32_s (f32.mul (!madd (call $nd_unit (i32.add (local.get $key) (i32.const 8))) (f32.const @ND_TW2K) (f32.const @ND_TW2))
                                                    (!madd (local.get $lv) (f32.const @ND_TWUP) (f32.const 1)))))
        (i32.store offset=52 (local.get $a) (select (local.get $w) (i32.sub (i32.const 0) (local.get $w)) (i32.and (call $p_seed (i32.add (local.get $key) (i32.const 9))) (i32.const 1))))
        (f32.store offset=56 (local.get $a) (!madd (local.get $lv) (f32.const @ND_TRUP) (!madd (local.get $rad) (f32.const @ND_TRR) (f32.const @ND_TR0))))
        (f32.store offset=60 (local.get $a) (!madd (local.get $lv) (f32.const @ND_TPUP) (f32.const @ND_TP0)))))
    (if (i32.eq (local.get $kind) (i32.const @ND_QUAKE))
      (then
        (i32.store offset=24 (local.get $a) (i32.trunc_sat_f32_u (f32.sub (f32.const @ND_QP0) (f32.mul (local.get $lv) (f32.const @ND_QPK)))))
        (f32.store offset=28 (local.get $a) (!madd (local.get $lv) (f32.const @ND_QAK) (f32.const @ND_QA0)))
        (local.set $nf (select (i32.const @(ND_NF0 + 1)) (i32.const @ND_NF0) (f32.ge (local.get $lv) (f32.const @ND_NFLV))))
        (if (i32.gt_u (local.get $nf) (i32.const @ND_NFMAX)) (then (local.set $nf (i32.const @ND_NFMAX))))
        (i32.store offset=32 (local.get $a) (local.get $nf))
        (f32.store offset=36 (local.get $a) (!madd (local.get $lv) (f32.const @ND_QWK) (f32.const @ND_QW0)))
        (!for $f (i32.const 0) (local.get $nf)
          (local.set $fa (i32.add (i32.add (local.get $a) (i32.const 40)) (i32.mul (local.get $f) (i32.const @ND_FSZ))))
          (call $sincos (call $nd_brg (i32.add (local.get $key) (i32.shl (local.get $f) (i32.const 2)))))
          (local.set $c) (local.set $s)
          (local.set $rr (f32.mul (f32.mul (local.get $rad) (f32.const @ND_QAIM)) (f32.sqrt (call $nd_unit (i32.add (local.get $key) (i32.add (i32.shl (local.get $f) (i32.const 2)) (i32.const 1)))))))
          (f32.store (local.get $fa) (!madd (local.get $c) (local.get $rr) (local.get $cx)))
          (f32.store offset=4 (local.get $fa) (!madd (local.get $s) (local.get $rr) (local.get $cx)))
          (call $sincos (call $nd_brg (i32.add (local.get $key) (i32.add (i32.shl (local.get $f) (i32.const 2)) (i32.const 2)))))
          (local.set $c) (local.set $s)
          (f32.store offset=8 (local.get $fa) (local.get $c))
          (f32.store offset=12 (local.get $fa) (local.get $s))
          (f32.store offset=16 (local.get $fa)
            (f32.mul (f32.mul (local.get $rad) (f32.const 0.5))
                     (!madd (call $nd_unit (i32.add (local.get $key) (i32.add (i32.shl (local.get $f) (i32.const 2)) (i32.const 3)))) (f32.const @ND_QLK) (f32.const @ND_QL0))))
          (i32.store offset=20 (local.get $fa) (i32.add (i32.load offset=8 (local.get $a)) (i32.add (i32.const @ND_QFIRST) (i32.mul (local.get $f) (i32.const @ND_QSTAG))))))))
    (if (i32.eq (local.get $kind) (i32.const @ND_TSUNAMI))
      (then
        (call $sincos (call $nd_brg (local.get $key)))
        (local.set $c) (local.set $s)
        (f32.store offset=24 (local.get $a) (local.get $c))
        (f32.store offset=28 (local.get $a) (local.get $s))
        (local.set $wc (!madd (local.get $lv) (f32.const @ND_WCK) (f32.const @ND_WC0)))
        (f32.store offset=32 (local.get $a) (local.get $wc))
        (f32.store offset=36 (local.get $a) (!madd (local.get $lv) (f32.const @ND_WHK) (f32.const @ND_WH0)))
        ;; a wave's crossing, front from start to past the far side with its depth, in ticks; as many as fit, the last done by the end
        (f32.store offset=48 (local.get $a) (f32.neg (f32.add (local.get $rad) (f32.const @ND_WOFF))))
        (f32.store offset=52 (local.get $a) (f32.add (local.get $rad) (f32.const @(ND_WOFF + ND_WD))))
        (local.set $span (i32.trunc_sat_f32_u (f32.ceil (f32.div (f32.add (f32.mul (local.get $rad) (f32.const 2)) (f32.const @(2 * ND_WOFF + ND_WD)))
                                                                (f32.mul (local.get $wc) (f32.const @DT))))))
        (local.set $nw (i32.add (i32.const @ND_NW0) (i32.div_u (i32.trunc_sat_f32_u (local.get $lv)) (i32.const @ND_NWLV))))
        (if (i32.gt_u (local.get $nw) (i32.const @ND_NWMAX)) (then (local.set $nw (i32.const @ND_NWMAX))))
        (local.set $gap (i32.sub (i32.sub (i32.load offset=12 (local.get $a)) (i32.load offset=8 (local.get $a))) (local.get $span)))
        (if (i32.lt_s (local.get $gap) (i32.const 0)) (then (local.set $gap (i32.const 0)) (local.set $nw (i32.const 1))))
        (i32.store offset=40 (local.get $a) (local.get $nw))
        (i32.store offset=44 (local.get $a) (i32.div_u (local.get $gap) (select (i32.sub (local.get $nw) (i32.const 1)) (i32.const 1) (i32.gt_u (local.get $nw) (i32.const 1))))))))
  ;; per bucket: the first strike landing in it, and past the last
  (local.set $ne (i32.load (i32.const @(PG_H + ND_NE))))
  (!for $b (i32.const 0) (i32.const @ND_NB)
    (block $l
      (loop $lp
        (br_if $l (i32.ge_u (local.get $lo) (local.get $ne)))
        (br_if $l (i32.ge_u (i32.load (call $nd_ev (local.get $lo))) (i32.mul (local.get $b) (i32.const @ND_BUCKET))))
        (!inc $lo)
        (br $lp)))
    (local.set $hi (local.get $lo))
    (block $h
      (loop $hp
        (br_if $h (i32.ge_u (local.get $hi) (local.get $ne)))
        (br_if $h (i32.ge_u (i32.load (call $nd_ev (local.get $hi))) (i32.mul (i32.add (local.get $b) (i32.const 1)) (i32.const @ND_BUCKET))))
        (!inc $hi)
        (br $hp)))
    (!st u16 @(PG_BIG + ND_LO) (local.get $b) (local.get $lo))
    (!st u16 @(PG_BIG + ND_HI) (local.get $b) (local.get $hi))))

;; The balls' spots: a sunflower spiral spaced for n over ND_SPAWN of the
;; island, its points taken in turn, but none within ND_CLEAR of a house,
;; crate or rock or near the rim, till there's one for each ball.
(func $nd_spawns (param $n i32) (param $rad f32)
  (local $i i32) (local $k i32) (local $j i32) (local $nob i32) (local $ok i32)
  (local $c f32) (local $rr f32) (local $s f32) (local $co f32) (local $x f32) (local $z f32) (local $cx f32)
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (local.set $nob (i32.load (i32.const @(PG_H + ND_NOB))))
  (local.set $c (f32.div (f32.mul (local.get $rad) (f32.const @ND_SPAWN)) (f32.sqrt (f32.convert_i32_u (select (local.get $n) (i32.const 1) (local.get $n))))))
  (block $done
    (loop $more
      (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
      (br_if $done (i32.ge_u (local.get $k) (i32.add (i32.shl (local.get $n) (i32.const 2)) (i32.const 64))))
      (local.set $rr (f32.mul (local.get $c) (f32.sqrt (f32.add (f32.convert_i32_u (local.get $k)) (f32.const 0.5)))))
      (call $sincos (i32.mul (local.get $k) (i32.const 6258)))
      (local.set $co) (local.set $s)
      (local.set $x (!madd (local.get $co) (local.get $rr) (local.get $cx)))
      (local.set $z (!madd (local.get $s) (local.get $rr) (local.get $cx)))
      (local.set $ok (f32.le (local.get $rr) (f32.sub (local.get $rad) (f32.const 2.5))))
      (!for $j (i32.const 0) (local.get $nob)
        (if (call $nd_on (call $nd_ob (local.get $j)) (local.get $x) (local.get $z) (f32.const @(ND_CLEAR + 1))) (then (local.set $ok (i32.const 0)))))
      (if (local.get $ok)
        (then
          (!st f32 @(PG_BIG + ND_SPN) (i32.shl (local.get $i) (i32.const 1)) (local.get $x))
          (!st f32 @(PG_BIG + ND_SPN + 4) (i32.shl (local.get $i) (i32.const 1)) (local.get $z))
          (!inc $i)))
      (!inc $k)
      (br $more))))

;; The island for n balls: its cells, houses and rocks, the disasters and the
;; erosion between them, each disaster's own numbers and strikes, the spots.
(func $nd_setup (param $n i32)
  (local $rad f32)
  (local.set $rad (f32.min (!madd (f32.sqrt (f32.convert_i32_u (local.get $n))) (f32.const @ND_RK) (f32.const @ND_R0)) (f32.const @ND_RMAX)))
  (!chk (local.get $rad) 251 (local.get $n))
  (i32.store (i32.const @PG_KIND) (i32.const @PK_OUT))
  (f32.store (i32.const @PG_SIZE) (local.get $rad))
  (f32.store (i32.const @PG_IDLE) (f32.const @ND_IDLE))
  (f32.store (i32.const @PG_HOP) (f32.const @ND_HOP))
  (f32.store (i32.const @(PG_H + ND_RAD)) (local.get $rad))
  (f32.store (i32.const @(PG_H + ND_RMIN)) (!madd (local.get $rad) (f32.const @ND_RMINK) (f32.const @ND_RMIN0)))
  (call $nd_cells (local.get $rad))
  (call $nd_obstacles (local.get $rad))
  (call $nd_timeline)
  (call $nd_erode (local.get $rad))
  (call $nd_params (local.get $n))
  (call $nd_spawns (local.get $n) (local.get $rad)))

;; Ball i of n on its spot (past the spots laid, a spiral's), on the ground there.
(func $nd_spawn (param $i i32) (param $n i32) (result f32 f32 f32)
  (local $x f32) (local $z f32) (local $c i32)
  (if (i32.lt_u (local.get $i) (i32.const @NPLAYER))
    (then
      (local.set $x (!ld f32 @(PG_BIG + ND_SPN) (i32.shl (local.get $i) (i32.const 1))))
      (local.set $z (!ld f32 @(PG_BIG + ND_SPN + 4) (i32.shl (local.get $i) (i32.const 1))))))
  (if (f32.eq (local.get $x) (f32.const 0))
    (then
      (call $p_disc (local.get $i) (local.get $n) (f32.mul (f32.load (i32.const @(PG_H + ND_RAD))) (f32.const @ND_SPAWN)))
      (local.set $z) (local.set $x)))
  (local.set $c (call $nd_at (local.get $x) (local.get $z)))
  (local.get $x)
  (if (result f32) (i32.ge_s (local.get $c) (i32.const 0)) (then (call $nd_top (local.get $c))) (else (f32.const @PLAT_Y)))
  (local.get $z))

(func $nd_start)
(func $nd_begin (param $p i32) (param $d i32))

;; Aimed bolt e (record ea), landing on tick tp into play: at a ball in, the
;; seed's pick, and the crowd round it, every ball in within ND_LCROWD of it
;; where they'd be ND_LLEAD s on, give or take ND_LSCAT; in off the rim of
;; its disaster's island. Confirmed and serial, ND_LAHEAD before it lands
;; (the round's tick), so the record is fixed as far as the prediction runs.
(func $nd_aim (param $e i32) (param $ea i32) (param $tp i32)
  (local $p i32) (local $pb i32) (local $q i32) (local $qb i32) (local $n i32) (local $k i32) (local $m i32) (local $key i32)
  (local $px f32) (local $pz f32) (local $dx f32) (local $dz f32) (local $sx f32) (local $sz f32) (local $x f32) (local $z f32) (local $rim f32) (local $dd f32) (local $cx f32)
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (if (call $p_in (i32.shl (local.get $p) (i32.const 6))) (then (!inc $n))))
  (if (i32.eqz (local.get $n)) (then (return)))
  (local.set $key (i32.add (i32.const 0x2000000) (i32.shl (local.get $e) (i32.const 2))))
  (local.set $k (i32.rem_u (call $p_seed (local.get $key)) (local.get $n)))
  (block $picked
    (!for $p (i32.const 0) (i32.const @NPLAYER)
      (if (call $p_in (i32.shl (local.get $p) (i32.const 6)))
        (then
          (br_if $picked (i32.eqz (local.get $k)))
          (local.set $k (i32.sub (local.get $k) (i32.const 1)))))))
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (local.set $px (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
  (local.set $pz (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
  (!for $q (i32.const 0) (i32.const @NPLAYER)
    (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
    (if (call $p_in (local.get $qb))
      (then
        (local.set $dx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $qb)) (local.get $px)))
        (local.set $dz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $qb)) (local.get $pz)))
        (if (f32.le (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))) (f32.const @(ND_LCROWD * ND_LCROWD)))
          (then
            (local.set $sx (f32.add (local.get $sx) (!madd (!at f32 @(PLAYERS + P_VX) (local.get $qb)) (f32.const @ND_LLEAD) (!at f32 @(PLAYERS + P_PX) (local.get $qb)))))
            (local.set $sz (f32.add (local.get $sz) (!madd (!at f32 @(PLAYERS + P_VZ) (local.get $qb)) (f32.const @ND_LLEAD) (!at f32 @(PLAYERS + P_PZ) (local.get $qb)))))
            (!inc $m))))))
  (local.set $x (!madd (f32.sub (call $nd_unit (i32.add (local.get $key) (i32.const 1))) (f32.const 0.5)) (f32.const @(2 * ND_LSCAT))
                       (f32.div (local.get $sx) (f32.convert_i32_u (local.get $m)))))
  (local.set $z (!madd (f32.sub (call $nd_unit (i32.add (local.get $key) (i32.const 2))) (f32.const 0.5)) (f32.const @(2 * ND_LSCAT))
                       (f32.div (local.get $sz) (f32.convert_i32_u (local.get $m)))))
  ;; in off the rim, as the bolts laid anywhere are
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (local.set $rim (f32.mul (f32.load offset=20 (call $nd_dr (i32.load offset=24 (local.get $ea)))) (f32.const 0.96)))
  (local.set $dx (f32.sub (local.get $x) (local.get $cx)))
  (local.set $dz (f32.sub (local.get $z) (local.get $cx)))
  (local.set $dd (f32.sqrt (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz)))))
  (if (f32.gt (local.get $dd) (local.get $rim))
    (then
      (local.set $x (!madd (local.get $dx) (f32.div (local.get $rim) (local.get $dd)) (local.get $cx)))
      (local.set $z (!madd (local.get $dz) (f32.div (local.get $rim) (local.get $dd)) (local.get $cx)))))
  (!chk (local.get $x) 253 (local.get $e))
  (!chk (local.get $z) 253 (local.get $e))
  (call $nd_strike (local.get $e) (local.get $tp) (local.get $x) (local.get $z) (f32.const @ND_LR) (i32.const @(ND_EV_BOLT | ND_EV_AIM)) (i32.load offset=24 (local.get $ea))))

;; ---- the disasters, on either bank

;; The disaster on tick tp into play (from its hit to its end): its record, or -1.
(func $nd_now (param $tp i32) (result i32)
  (local $j i32) (local $n i32) (local $a i32)
  (local.set $n (i32.load (i32.const @(PG_H + ND_ND))))
  (!for $j (i32.const 0) (local.get $n)
    (local.set $a (call $nd_dr (local.get $j)))
    (if (i32.lt_s (local.get $tp) (i32.load offset=8 (local.get $a))) (then (return (i32.const -1))))
    (if (i32.lt_s (local.get $tp) (i32.load offset=12 (local.get $a))) (then (return (local.get $a)))))
  (i32.const -1))

;; A flood's water on tick tp (its record a): from under the rim, up over
;; ND_FRISE, held, down over ND_FRISE to the end. Its top, y.
(func $nd_water (param $a i32) (param $tp i32) (result f32)
  (local $el i32) (local $left i32) (local $k f32) (local $lo f32)
  (local.set $el (i32.sub (local.get $tp) (i32.load offset=8 (local.get $a))))
  (local.set $left (i32.sub (i32.load offset=12 (local.get $a)) (local.get $tp)))
  (local.set $k (f32.const 1))
  (if (i32.lt_s (local.get $el) (i32.const @ND_FRISE))
    (then (local.set $k (f32.div (f32.convert_i32_s (local.get $el)) (f32.const @ND_FRISE)))))
  (if (i32.lt_s (local.get $left) (i32.const @ND_FRISE))
    (then (local.set $k (f32.min (local.get $k) (f32.div (f32.convert_i32_s (local.get $left)) (f32.const @ND_FRISE))))))
  (local.set $lo (f32.const @(+PLAT_Y - 0.5)))
  (!madd (f32.add (f32.load offset=24 (local.get $a)) (f32.const 0.5)) (f32.max (local.get $k) (f32.const 0)) (local.get $lo)))

;; A tornado's funnel on tick tp (its record a): x, z, and how hard it blows
;; (touching down and lifting over ND_TRAMP).
(func $nd_funnel (param $a i32) (param $tp i32) (result f32 f32 f32)
  (local $el i32) (local $s1 f32) (local $c1 f32) (local $s2 f32) (local $c2 f32) (local $k f32)
  (local.set $el (i32.sub (local.get $tp) (i32.load offset=8 (local.get $a))))
  (call $sincos (i32.add (i32.load offset=40 (local.get $a)) (i32.shr_s (i32.mul (i32.load offset=44 (local.get $a)) (local.get $el)) (i32.const 4))))
  (local.set $c1) (local.set $s1)
  (call $sincos (i32.add (i32.load offset=48 (local.get $a)) (i32.shr_s (i32.mul (i32.load offset=52 (local.get $a)) (local.get $el)) (i32.const 4))))
  (local.set $c2) (local.set $s2)
  (local.set $k (f32.min (f32.div (f32.convert_i32_s (local.get $el)) (f32.const @ND_TRAMP))
                         (f32.div (f32.convert_i32_s (i32.sub (i32.load offset=12 (local.get $a)) (local.get $tp))) (f32.const @ND_TRAMP))))
  (!madd (local.get $c2) (f32.load offset=36 (local.get $a)) (!madd (local.get $c1) (f32.load offset=32 (local.get $a)) (f32.load offset=24 (local.get $a))))
  (!madd (local.get $s2) (f32.load offset=36 (local.get $a)) (!madd (local.get $s1) (f32.load offset=32 (local.get $a)) (f32.load offset=28 (local.get $a))))
  (!clamp (local.get $k) (f32.const 0) (f32.const 1)))

;; Is (x, z) over an open fissure of the quake a on tick tp? Each opens on
;; its tick to its half width over ND_QOPEN.
(func $nd_fissure (param $a i32) (param $tp i32) (param $x f32) (param $z f32) (result i32)
  (local $f i32) (local $nf i32) (local $fa i32) (local $el i32) (local $w f32) (local $dx f32) (local $dz f32) (local $lx f32) (local $lz f32)
  (local.set $nf (i32.load offset=32 (local.get $a)))
  (!for $f (i32.const 0) (local.get $nf)
    (local.set $fa (i32.add (i32.add (local.get $a) (i32.const 40)) (i32.mul (local.get $f) (i32.const @ND_FSZ))))
    (local.set $el (i32.sub (local.get $tp) (i32.load offset=20 (local.get $fa))))
    (if (i32.ge_s (local.get $el) (i32.const 0))
      (then
        (local.set $w (f32.mul (f32.load offset=36 (local.get $a))
                               (f32.min (f32.div (f32.convert_i32_s (i32.add (local.get $el) (i32.const 1))) (f32.const @ND_QOPEN)) (f32.const 1))))
        (local.set $dx (f32.sub (local.get $x) (f32.load (local.get $fa))))
        (local.set $dz (f32.sub (local.get $z) (f32.load offset=4 (local.get $fa))))
        (local.set $lx (f32.load offset=8 (local.get $fa)))
        (local.set $lz (f32.load offset=12 (local.get $fa)))
        (if (i32.and (f32.le (f32.abs (!madd (local.get $dx) (local.get $lx) (f32.mul (local.get $dz) (local.get $lz)))) (f32.load offset=16 (local.get $fa)))
                     (f32.lt (f32.abs (f32.sub (f32.mul (local.get $dz) (local.get $lx)) (f32.mul (local.get $dx) (local.get $lz)))) (local.get $w)))
          (then (return (i32.const 1)))))))
  (i32.const 0))

;; The ground's top under (x, z) no higher than y on bank d's tick: the
;; highest of a house's, crate's or rock's top whose footprint it's on and
;; the cell's, if the rim hasn't taken it and no fissure is open there.
(func $nd_ground (param $d i32) (param $x f32) (param $y f32) (param $z f32) (result f32)
  (local $tp i32) (local $c i32) (local $k i32) (local $n i32) (local $a i32) (local $best f32) (local $top f32)
  (if (f32.lt (local.get $y) (f32.const @PLAT_Y)) (then (return (f32.const -1000))))
  (local.set $tp (call $p_t (local.get $d)))
  (local.set $best (f32.const -1000))
  (local.set $c (call $nd_at (local.get $x) (local.get $z)))
  (if (i32.ge_s (local.get $c) (i32.const 0))
    (then
      (if (i32.lt_u (local.get $tp) (!ld u16 @(PG_BIG + ND_DROP) (local.get $c)))
        (then
          (local.set $top (call $nd_top (local.get $c)))
          (if (f32.le (local.get $top) (local.get $y))
            (then
              (local.set $best (local.get $top))
              (local.set $a (call $nd_now (local.get $tp)))
              (if (i32.ge_s (local.get $a) (i32.const 0))
                (then
                  (if (i32.eq (i32.load (local.get $a)) (i32.const @ND_QUAKE))
                    (then
                      (if (call $nd_fissure (local.get $a) (local.get $tp) (local.get $x) (local.get $z))
                        (then (local.set $best (f32.const -1000))))))))))))))
  (local.set $n (i32.load (i32.const @(PG_H + ND_NOB))))
  (!for $k (i32.const 0) (local.get $n)
    (local.set $a (call $nd_ob (local.get $k)))
    (local.set $top (f32.load offset=16 (local.get $a)))
    (if (i32.and (i32.and (f32.le (local.get $top) (local.get $y)) (f32.gt (local.get $top) (local.get $best)))
                 (i32.lt_u (local.get $tp) (i32.load offset=20 (local.get $a))))
      (then
        (if (call $nd_on (local.get $a) (local.get $x) (local.get $z) (f32.const 0))
          (then (local.set $best (local.get $top)))))))
  (local.get $best))

;; Ball p (record pb) hit by kind on tick tp: in its PG_M (its breath kept),
;; and an FX on bank d at it, size how hard.
(func $nd_hit (param $p i32) (param $pb i32) (param $d i32) (param $kind i32) (param $tp i32) (param $size f32)
  (!put i32 @(PLAYERS + PG_M) (local.get $pb)
    (i32.or (i32.and (!at i32 @(PLAYERS + PG_M) (local.get $pb)) (i32.const 0xfff))
            (i32.or (i32.shl (local.get $kind) (i32.const 12)) (i32.shl (local.get $tp) (i32.const 16)))))
  (call $fx (local.get $d) (i32.const @ND_FX_HIT) (local.get $p) (local.get $kind)
            (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (f32.add (!at f32 @(PLAYERS + P_PY) (local.get $pb)) (f32.const 1))
            (!at f32 @(PLAYERS + P_PZ) (local.get $pb)) (local.get $size)))

;; Out of every standing house's, crate's and rock's sides that are over the
;; ball's bottom: put out the nearest way, ND_BOUNCE of its speed into it given back.
(func $nd_walls (param $pb i32) (param $tp i32)
  (local $k i32) (local $n i32) (local $a i32)
  (local $px f32) (local $py f32) (local $pz f32) (local $vx f32) (local $vz f32) (local $r f32)
  (local $dx f32) (local $dz f32) (local $hx f32) (local $hz f32) (local $dd f32) (local $nx f32) (local $nz f32) (local $dep f32) (local $e f32) (local $vn f32)
  (local.set $n (i32.load (i32.const @(PG_H + ND_NOB))))
  (local.set $px (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
  (local.set $py (!at f32 @(PLAYERS + P_PY) (local.get $pb)))
  (local.set $pz (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
  (local.set $vx (!at f32 @(PLAYERS + P_VX) (local.get $pb)))
  (local.set $vz (!at f32 @(PLAYERS + P_VZ) (local.get $pb)))
  (local.set $r (call $b_rad (local.get $pb)))
  (!for $k (i32.const 0) (local.get $n)
    (local.set $a (call $nd_ob (local.get $k)))
    (if (i32.and (f32.lt (local.get $py) (f32.sub (f32.load offset=16 (local.get $a)) (f32.const 0.01)))
                 (i32.lt_u (local.get $tp) (i32.load offset=20 (local.get $a))))
      (then
        (local.set $hx (f32.load offset=8 (local.get $a)))
        (local.set $hz (f32.load offset=12 (local.get $a)))
        (local.set $dx (f32.sub (local.get $px) (f32.load (local.get $a))))
        (local.set $dz (f32.sub (local.get $pz) (f32.load offset=4 (local.get $a))))
        (local.set $dep (f32.const 0))
        (if (f32.eq (local.get $hz) (f32.const 0))
          (then
            ;; round
            (local.set $dd (f32.sqrt (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz)))))
            (if (f32.lt (local.get $dd) (f32.add (local.get $hx) (local.get $r)))
              (then
                (local.set $dep (f32.sub (f32.add (local.get $hx) (local.get $r)) (local.get $dd)))
                (if (f32.gt (local.get $dd) (f32.const 0.001))
                  (then (local.set $nx (f32.div (local.get $dx) (local.get $dd))) (local.set $nz (f32.div (local.get $dz) (local.get $dd))))
                  (else (local.set $nx (f32.const 1)) (local.set $nz (f32.const 0)))))))
          (else
            ;; a box: from its nearest point, or out its nearest side if the centre is in it
            (local.set $nx (f32.sub (local.get $dx) (!clamp (local.get $dx) (f32.neg (local.get $hx)) (local.get $hx))))
            (local.set $nz (f32.sub (local.get $dz) (!clamp (local.get $dz) (f32.neg (local.get $hz)) (local.get $hz))))
            (local.set $dd (!madd (local.get $nx) (local.get $nx) (f32.mul (local.get $nz) (local.get $nz))))
            (if (f32.lt (local.get $dd) (f32.mul (local.get $r) (local.get $r)))
              (then
                (if (f32.gt (local.get $dd) (f32.const 1e-8))
                  (then
                    (local.set $dd (f32.sqrt (local.get $dd)))
                    (local.set $nx (f32.div (local.get $nx) (local.get $dd)))
                    (local.set $nz (f32.div (local.get $nz) (local.get $dd)))
                    (local.set $dep (f32.sub (local.get $r) (local.get $dd))))
                  (else
                    (local.set $dep (f32.add (local.get $dx) (local.get $hx)))
                    (local.set $nx (f32.const -1)) (local.set $nz (f32.const 0))
                    (local.set $e (f32.sub (local.get $hx) (local.get $dx)))
                    (if (f32.lt (local.get $e) (local.get $dep)) (then (local.set $dep (local.get $e)) (local.set $nx (f32.const 1))))
                    (local.set $e (f32.add (local.get $dz) (local.get $hz)))
                    (if (f32.lt (local.get $e) (local.get $dep)) (then (local.set $dep (local.get $e)) (local.set $nx (f32.const 0)) (local.set $nz (f32.const -1))))
                    (local.set $e (f32.sub (local.get $hz) (local.get $dz)))
                    (if (f32.lt (local.get $e) (local.get $dep)) (then (local.set $dep (local.get $e)) (local.set $nx (f32.const 0)) (local.set $nz (f32.const 1))))
                    (local.set $dep (f32.add (local.get $dep) (local.get $r)))))))))
        (if (f32.gt (local.get $dep) (f32.const 0))
          (then
            (local.set $px (!madd (local.get $nx) (local.get $dep) (local.get $px)))
            (local.set $pz (!madd (local.get $nz) (local.get $dep) (local.get $pz)))
            (local.set $vn (!madd (local.get $vx) (local.get $nx) (f32.mul (local.get $vz) (local.get $nz))))
            (if (f32.lt (local.get $vn) (f32.const 0))
              (then
                (local.set $vn (f32.mul (local.get $vn) (f32.const @(1 + ND_BOUNCE))))
                (local.set $vx (f32.sub (local.get $vx) (f32.mul (local.get $vn) (local.get $nx))))
                (local.set $vz (f32.sub (local.get $vz) (f32.mul (local.get $vn) (local.get $nz)))))))))))
  (!chk (local.get $px) 252 (local.get $pb))
  (!chk (local.get $pz) 252 (local.get $pb))
  (!put f32 @(PLAYERS + P_PX) (local.get $pb) (local.get $px))
  (!put f32 @(PLAYERS + P_PZ) (local.get $pb) (local.get $pz))
  (!put f32 @(PLAYERS + P_VX) (local.get $pb) (local.get $vx))
  (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (local.get $vz)))

;; Is a point al along a tsunami's way (its record a) and ac across it in the
;; lee of a standing house, crate or rock: behind it, ND_WLEE deep, inside its
;; width less ND_WIN?
(func $nd_lee (param $a i32) (param $tp i32) (param $al f32) (param $ac f32) (result i32)
  (local $k i32) (local $n i32) (local $o i32) (local $wx f32) (local $wz f32) (local $cx f32) (local $ox f32) (local $oz f32)
  (local $hx f32) (local $hz f32) (local $ea f32) (local $eb f32) (local $oa f32) (local $ob f32)
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (local.set $wx (f32.load offset=24 (local.get $a)))
  (local.set $wz (f32.load offset=28 (local.get $a)))
  (local.set $n (i32.load (i32.const @(PG_H + ND_NOB))))
  (!for $k (i32.const 0) (local.get $n)
    (local.set $o (call $nd_ob (local.get $k)))
    (if (i32.lt_u (local.get $tp) (i32.load offset=20 (local.get $o)))
      (then
        (local.set $ox (f32.sub (f32.load (local.get $o)) (local.get $cx)))
        (local.set $oz (f32.sub (f32.load offset=4 (local.get $o)) (local.get $cx)))
        (local.set $hx (f32.load offset=8 (local.get $o)))
        (local.set $hz (f32.load offset=12 (local.get $o)))
        (local.set $ea (local.get $hx))
        (local.set $eb (local.get $hx))
        (if (f32.gt (local.get $hz) (f32.const 0))
          (then
            (local.set $ea (!madd (local.get $hx) (f32.abs (local.get $wx)) (f32.mul (local.get $hz) (f32.abs (local.get $wz)))))
            (local.set $eb (!madd (local.get $hx) (f32.abs (local.get $wz)) (f32.mul (local.get $hz) (f32.abs (local.get $wx)))))))
        (local.set $oa (!madd (local.get $ox) (local.get $wx) (f32.mul (local.get $oz) (local.get $wz))))
        (local.set $ob (f32.sub (f32.mul (local.get $oz) (local.get $wx)) (f32.mul (local.get $ox) (local.get $wz))))
        (if (i32.and (i32.and (f32.ge (local.get $al) (f32.sub (local.get $oa) (local.get $ea)))
                              (f32.le (local.get $al) (f32.add (f32.add (local.get $oa) (local.get $ea)) (f32.const @ND_WLEE))))
                     (f32.lt (f32.abs (f32.sub (local.get $ac) (local.get $ob))) (f32.sub (local.get $eb) (f32.const @ND_WIN))))
          (then (return (i32.const 1)))))))
  (i32.const 0))

;; The strikes landing on bank d's tick tp against ball p (record pb): a
;; meteor knocks a ball under it off its spot, harder nearer the middle, and
;; up; a bolt throws one at the spot (from just under its top to well over it)
;; off, harder nearer the middle, and up.
(func $nd_strike_on (param $p i32) (param $pb i32) (param $d i32) (param $tp i32)
  (local $b i32) (local $e i32) (local $e1 i32) (local $ea i32) (local $fl i32) (local $kind i32)
  (local $px f32) (local $py f32) (local $pz f32) (local $vx f32) (local $vy f32) (local $vz f32)
  (local $dx f32) (local $dz f32) (local $h f32) (local $nx f32) (local $nz f32) (local $rr f32) (local $ey f32) (local $k f32) (local $vn f32)
  (local.set $b (i32.div_u (local.get $tp) (i32.const @ND_BUCKET)))
  (if (i32.ge_u (local.get $b) (i32.const @ND_NB)) (then (return)))
  (local.set $e (!ld u16 @(PG_BIG + ND_LO) (local.get $b)))
  (local.set $e1 (!ld u16 @(PG_BIG + ND_HI) (local.get $b)))
  (block $done
    (loop $next
      (br_if $done (i32.ge_u (local.get $e) (local.get $e1)))
      (local.set $ea (call $nd_ev (local.get $e)))
      (if (i32.eq (i32.load (local.get $ea)) (local.get $tp))
        (then
          (local.set $px (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
          (local.set $py (!at f32 @(PLAYERS + P_PY) (local.get $pb)))
          (local.set $pz (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
          (local.set $dx (f32.sub (local.get $px) (f32.load offset=4 (local.get $ea))))
          (local.set $dz (f32.sub (local.get $pz) (f32.load offset=8 (local.get $ea))))
          (local.set $ey (f32.load offset=12 (local.get $ea)))
          (local.set $rr (f32.load offset=16 (local.get $ea)))
          (local.set $kind (i32.and (i32.load offset=20 (local.get $ea)) (i32.const 3)))
          (local.set $h (f32.sqrt (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz)))))
          (if (i32.and (f32.lt (local.get $h) (local.get $rr))
                       (if (result i32) (i32.eq (local.get $kind) (i32.const @ND_EV_BOLT))
                         (then (i32.and (f32.ge (local.get $py) (f32.sub (local.get $ey) (f32.const @ND_LBELOW))) (f32.lt (local.get $py) (f32.add (local.get $ey) (f32.const @ND_LOVER)))))
                         (else (f32.lt (local.get $py) (f32.add (local.get $ey) (local.get $rr))))))
            (then
              (if (f32.gt (local.get $h) (f32.const 0.001))
                (then (local.set $nx (f32.div (local.get $dx) (local.get $h))) (local.set $nz (f32.div (local.get $dz) (local.get $h))))
                (else (local.set $nx (f32.const 1)) (local.set $nz (f32.const 0))))
              (local.set $vx (!at f32 @(PLAYERS + P_VX) (local.get $pb)))
              (local.set $vy (!at f32 @(PLAYERS + P_VY) (local.get $pb)))
              (local.set $vz (!at f32 @(PLAYERS + P_VZ) (local.get $pb)))
              (if (i32.eq (local.get $kind) (i32.const @ND_EV_BOLT))
                (then
                  (local.set $k (f32.mul (f32.const @ND_LKICK) (f32.sub (f32.const 1) (f32.mul (f32.const @ND_LFALL) (f32.div (local.get $h) (local.get $rr))))))
                  (local.set $vy (f32.max (local.get $vy) (f32.const @ND_LUPV))))
                (else
                  (local.set $k (f32.mul (f32.const @ND_MKICK) (f32.sub (f32.const 1) (f32.mul (f32.const @ND_MFALL) (f32.div (local.get $h) (local.get $rr))))))
                  (local.set $vy (f32.max (local.get $vy) (f32.const @ND_MUPV)))))
              (local.set $vn (!madd (local.get $vx) (local.get $nx) (f32.mul (local.get $vz) (local.get $nz))))
              (if (f32.lt (local.get $vn) (local.get $k))
                (then
                  (local.set $vx (!madd (f32.sub (local.get $k) (local.get $vn)) (local.get $nx) (local.get $vx)))
                  (local.set $vz (!madd (f32.sub (local.get $k) (local.get $vn)) (local.get $nz) (local.get $vz)))))
              (!put f32 @(PLAYERS + P_VX) (local.get $pb) (local.get $vx))
              (!put f32 @(PLAYERS + P_VY) (local.get $pb) (local.get $vy))
              (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (local.get $vz))
              (local.set $fl (!at u8 @(PLAYERS + P_FL) (local.get $pb)))
              (!put u8 @(PLAYERS + P_FL) (local.get $pb) (i32.and (local.get $fl) (i32.const @(255 ^ PF_GROUND))))
              (call $nd_hit (local.get $p) (local.get $pb) (local.get $d)
                            (select (i32.const @ND_HIT_BOLT) (i32.const @ND_HIT_METEOR) (i32.eq (local.get $kind) (i32.const @ND_EV_BOLT)))
                            (local.get $tp) (local.get $k))))))
      (!inc $e)
      (br $next))))

;; A flood (record a) on ball p: under its water, the water slows it, and
;; past ND_FCUR the current drags it outward (harder the deeper, full a metre on);
;; ND_FSUB under, it holds its breath, and out of breath it drowns, going
;; down through the floor. Its breath was `was` ticks under: returns it now,
;; a tick more under, two back out.
(func $nd_flood (param $p i32) (param $pb i32) (param $d i32) (param $a i32) (param $tp i32) (param $was i32) (result i32)
  (local $fl i32) (local $breath i32) (local $w f32) (local $py f32) (local $dx f32) (local $dz f32) (local $dd f32) (local $k f32) (local $vx f32) (local $vz f32) (local $cx f32)
  (local.set $breath (select (i32.sub (local.get $was) (i32.const 2)) (i32.const 0) (i32.gt_u (local.get $was) (i32.const 2))))
  (local.set $py (!at f32 @(PLAYERS + P_PY) (local.get $pb)))
  (local.set $w (f32.sub (call $nd_water (local.get $a) (local.get $tp)) (local.get $py)))
  (if (f32.le (local.get $w) (f32.const 0)) (then (return (local.get $breath))))
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (local.set $dx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (local.get $cx)))
  (local.set $dz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $pb)) (local.get $cx)))
  (local.set $dd (f32.sqrt (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz)))))
  (local.set $vx (f32.mul (!at f32 @(PLAYERS + P_VX) (local.get $pb)) (f32.const @ND_FDRAG)))
  (local.set $vz (f32.mul (!at f32 @(PLAYERS + P_VZ) (local.get $pb)) (f32.const @ND_FDRAG)))
  (if (i32.and (f32.gt (local.get $dd) (f32.const 0.01)) (f32.gt (local.get $w) (f32.const @ND_FCUR)))
    (then
      (local.set $k (f32.div (f32.mul (f32.mul (f32.min (f32.sub (local.get $w) (f32.const @ND_FCUR)) (f32.const 1))
                                               (!madd (f32.min (f32.convert_i32_u (i32.load offset=16 (local.get $a))) (f32.const @ND_LVMAX)) (f32.const @ND_FAK) (f32.const @ND_FA0)))
                                      (f32.const @DT))
                             (local.get $dd)))
      (local.set $vx (!madd (local.get $dx) (local.get $k) (local.get $vx)))
      (local.set $vz (!madd (local.get $dz) (local.get $k) (local.get $vz)))))
  (!put f32 @(PLAYERS + P_VX) (local.get $pb) (local.get $vx))
  (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (local.get $vz))
  (if (f32.le (local.get $w) (f32.const @ND_FSUB)) (then (return (local.get $breath))))
  (local.set $breath (i32.add (local.get $was) (i32.const 1)))
  (if (i32.ge_u (local.get $breath) (i32.const @ND_BREATH))
    (then
      (local.set $fl (!at u8 @(PLAYERS + P_FL) (local.get $pb)))
      (!put u8 @(PLAYERS + P_FL) (local.get $pb) (i32.and (i32.or (local.get $fl) (i32.const @PF_FALL)) (i32.const @(255 ^ PF_GROUND))))
      (!put f32 @(PLAYERS + P_VY) (local.get $pb) (f32.min (!at f32 @(PLAYERS + P_VY) (local.get $pb)) (f32.const -1)))
      (call $nd_hit (local.get $p) (local.get $pb) (local.get $d) (i32.const @ND_HIT_DROWN) (local.get $tp) (f32.const 0))))
  (local.get $breath))

;; A tornado (record a) on ball p: within its reach pulled in, less by the
;; edge, and swung round anticlockwise; in its core held, lifted, and once
;; ND_TFLY up flung out, round and up.
(func $nd_tornado (param $p i32) (param $pb i32) (param $d i32) (param $a i32) (param $tp i32)
  (local $fl i32) (local $fx f32) (local $fz f32) (local $s f32) (local $dx f32) (local $dz f32) (local $dd f32) (local $rp f32) (local $k f32)
  (local $nx f32) (local $nz f32) (local $vx f32) (local $vy f32) (local $vz f32) (local $py f32)
  (call $nd_funnel (local.get $a) (local.get $tp))
  (local.set $s) (local.set $fz) (local.set $fx)
  (local.set $dx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (local.get $fx)))
  (local.set $dz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $pb)) (local.get $fz)))
  (local.set $dd (f32.sqrt (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz)))))
  (local.set $rp (f32.load offset=56 (local.get $a)))
  (if (i32.or (f32.ge (local.get $dd) (local.get $rp)) (f32.le (local.get $s) (f32.const 0))) (then (return)))
  (if (f32.gt (local.get $dd) (f32.const 0.01))
    (then (local.set $nx (f32.div (local.get $dx) (local.get $dd))) (local.set $nz (f32.div (local.get $dz) (local.get $dd))))
    (else (local.set $nx (f32.const 1)) (local.set $nz (f32.const 0))))
  (local.set $vx (!at f32 @(PLAYERS + P_VX) (local.get $pb)))
  (local.set $vy (!at f32 @(PLAYERS + P_VY) (local.get $pb)))
  (local.set $vz (!at f32 @(PLAYERS + P_VZ) (local.get $pb)))
  (local.set $py (!at f32 @(PLAYERS + P_PY) (local.get $pb)))
  (local.set $fl (!at u8 @(PLAYERS + P_FL) (local.get $pb)))
  (if (f32.gt (local.get $dd) (f32.const @ND_TCORE))
    (then
      (local.set $k (f32.mul (f32.mul (f32.mul (f32.load offset=60 (local.get $a)) (f32.sub (f32.const 1) (f32.div (local.get $dd) (local.get $rp))))
                                      (local.get $s))
                             (f32.const @DT)))
      (local.set $vx (f32.sub (local.get $vx) (f32.mul (!madd (local.get $nz) (f32.const @ND_TSWIRL) (local.get $nx)) (local.get $k))))
      (local.set $vz (!madd (f32.sub (f32.mul (local.get $nx) (f32.const @ND_TSWIRL)) (local.get $nz)) (local.get $k) (local.get $vz))))
    (else
      (if (i32.and (f32.gt (local.get $py) (f32.const @(+PLAT_Y + ND_TFLY))) (f32.gt (local.get $vy) (f32.const 0)))
        (then
          ;; flung out
          (local.set $vx (f32.sub (f32.mul (local.get $nx) (f32.const @ND_TFLING)) (f32.mul (local.get $nz) (f32.const @ND_TROUND))))
          (local.set $vz (!madd (local.get $nx) (f32.const @ND_TROUND) (f32.mul (local.get $nz) (f32.const @ND_TFLING))))
          (local.set $vy (f32.const @ND_TUPV))
          (!put f32 @(PLAYERS + P_VX) (local.get $pb) (local.get $vx))
          (!put f32 @(PLAYERS + P_VY) (local.get $pb) (local.get $vy))
          (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (local.get $vz))
          (call $nd_hit (local.get $p) (local.get $pb) (local.get $d) (i32.const @ND_HIT_TORNADO) (local.get $tp) (f32.const @ND_TFLING))
          (return)))
      ;; lifted, held in (its own way bled off, ND_TGRIP kept a tick), swung round
      (local.set $vx (f32.mul (local.get $vx) (f32.const @ND_TGRIP)))
      (local.set $vz (f32.mul (local.get $vz) (f32.const @ND_TGRIP)))
      (local.set $k (f32.mul (f32.mul (f32.load offset=60 (local.get $a)) (local.get $s)) (f32.const @(DT * 0.5))))
      (local.set $vx (f32.sub (local.get $vx) (f32.mul (!madd (local.get $nz) (f32.const @ND_TSWIRL) (local.get $nx)) (local.get $k))))
      (local.set $vz (!madd (f32.sub (f32.mul (local.get $nx) (f32.const @ND_TSWIRL)) (local.get $nz)) (local.get $k) (local.get $vz)))
      (local.set $vy (!madd (local.get $s) (f32.const @(ND_TLIFT * DT)) (local.get $vy)))
      (!put u8 @(PLAYERS + P_FL) (local.get $pb) (i32.and (local.get $fl) (i32.const @(255 ^ PF_GROUND))))))
  (!put f32 @(PLAYERS + P_VX) (local.get $pb) (local.get $vx))
  (!put f32 @(PLAYERS + P_VY) (local.get $pb) (local.get $vy))
  (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (local.get $vz)))

;; A quake (record a) on ball pb: from ND_Q0 in, a shove every period for
;; ND_QLEN ticks the way $p_seed says, on a ball on the ground, and a jolt up
;; as it ends. (Its fissures are the ground's.)
(func $nd_quake (param $pb i32) (param $a i32) (param $tp i32)
  (local $el i32) (local $per i32) (local $o i32) (local $fl i32) (local $s f32) (local $c f32) (local $k f32)
  (local.set $fl (!at u8 @(PLAYERS + P_FL) (local.get $pb)))
  (if (i32.eqz (i32.and (local.get $fl) (i32.const @PF_GROUND))) (then (return)))
  (local.set $el (i32.sub (i32.sub (local.get $tp) (i32.load offset=8 (local.get $a))) (i32.const @ND_Q0)))
  (if (i32.lt_s (local.get $el) (i32.const 0)) (then (return)))
  (local.set $per (i32.load offset=24 (local.get $a)))
  (local.set $o (i32.rem_u (local.get $el) (local.get $per)))
  (if (i32.ge_u (local.get $o) (i32.const @ND_QLEN)) (then (return)))
  (call $sincos (call $nd_brg (i32.add (i32.const 0x60000) (i32.add (i32.shl (i32.load offset=16 (local.get $a)) (i32.const 8))
                                                                     (i32.div_u (local.get $el) (local.get $per))))))
  (local.set $c) (local.set $s)
  (local.set $k (f32.mul (f32.load offset=28 (local.get $a)) (f32.const @DT)))
  (!put f32 @(PLAYERS + P_VX) (local.get $pb) (!madd (local.get $c) (local.get $k) (!at f32 @(PLAYERS + P_VX) (local.get $pb))))
  (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (!madd (local.get $s) (local.get $k) (!at f32 @(PLAYERS + P_VZ) (local.get $pb))))
  (if (i32.eq (local.get $o) (i32.const @(ND_QLEN - 1)))
    (then
      (!put f32 @(PLAYERS + P_VY) (local.get $pb) (f32.const @ND_QJOLT))
      (!put u8 @(PLAYERS + P_FL) (local.get $pb) (i32.and (local.get $fl) (i32.const @(255 ^ PF_GROUND)))))))

;; A tsunami (record a) on ball p: every wave whose water is over it (front
;; past it, ND_WD deep, the ball's bottom under its top less ND_WFREE), out
;; of any lee, carries it the wave's way at ND_WA up to ND_WU of its speed;
;; the front reaching it is a hit.
(func $nd_wave (param $p i32) (param $pb i32) (param $d i32) (param $a i32) (param $tp i32)
  (local $k i32) (local $nw i32) (local $el i32) (local $gap i32)
  (local $cx f32) (local $wx f32) (local $wz f32) (local $c f32) (local $al f32) (local $ac f32) (local $front f32) (local $dx f32) (local $dz f32)
  (local $vx f32) (local $vz f32) (local $vn f32) (local $u f32) (local $dv f32)
  (if (f32.ge (!at f32 @(PLAYERS + P_PY) (local.get $pb))
              (f32.sub (f32.add (f32.load offset=36 (local.get $a)) (f32.const @PLAT_Y)) (f32.const @ND_WFREE)))
    (then (return)))
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (local.set $wx (f32.load offset=24 (local.get $a)))
  (local.set $wz (f32.load offset=28 (local.get $a)))
  (local.set $c (f32.load offset=32 (local.get $a)))
  (local.set $dx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (local.get $cx)))
  (local.set $dz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $pb)) (local.get $cx)))
  (local.set $al (!madd (local.get $dx) (local.get $wx) (f32.mul (local.get $dz) (local.get $wz))))
  (local.set $ac (f32.sub (f32.mul (local.get $dz) (local.get $wx)) (f32.mul (local.get $dx) (local.get $wz))))
  (local.set $nw (i32.load offset=40 (local.get $a)))
  (local.set $gap (i32.load offset=44 (local.get $a)))
  (!for $k (i32.const 0) (local.get $nw)
    (local.set $el (i32.sub (i32.sub (local.get $tp) (i32.load offset=8 (local.get $a))) (i32.mul (local.get $k) (local.get $gap))))
    (if (i32.ge_s (local.get $el) (i32.const 0))
      (then
        (local.set $front (!madd (f32.convert_i32_s (local.get $el)) (f32.mul (local.get $c) (f32.const @DT)) (f32.load offset=48 (local.get $a))))
        (if (i32.and (f32.le (local.get $al) (local.get $front)) (f32.ge (local.get $al) (f32.sub (local.get $front) (f32.const @ND_WD))))
          (then
            (if (i32.eqz (call $nd_lee (local.get $a) (local.get $tp) (local.get $al) (local.get $ac)))
              (then
                (local.set $vx (!at f32 @(PLAYERS + P_VX) (local.get $pb)))
                (local.set $vz (!at f32 @(PLAYERS + P_VZ) (local.get $pb)))
                (local.set $vn (!madd (local.get $vx) (local.get $wx) (f32.mul (local.get $vz) (local.get $wz))))
                (local.set $u (f32.mul (local.get $c) (f32.const @ND_WU)))
                (if (f32.lt (local.get $vn) (local.get $u))
                  (then
                    (local.set $dv (f32.min (f32.sub (local.get $u) (local.get $vn)) (f32.const @(ND_WA * DT))))
                    (!put f32 @(PLAYERS + P_VX) (local.get $pb) (!madd (local.get $wx) (local.get $dv) (local.get $vx)))
                    (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (!madd (local.get $wz) (local.get $dv) (local.get $vz)))))
                (if (f32.gt (local.get $al) (f32.sub (local.get $front) (f32.mul (local.get $c) (f32.const @DT))))
                  (then (call $nd_hit (local.get $p) (local.get $pb) (local.get $d) (i32.const @ND_HIT_WAVE) (local.get $tp) (local.get $u))))))))))))

;; After a ball's move on bank d: out of the houses', crates' and rocks'
;; sides; then the disaster on now; its breath back two a tick out of a
;; flood's water. Writes only its own record and bank d's FX.
(func $nd_push (param $p i32) (param $d i32)
  (local $pb i32) (local $tp i32) (local $a i32) (local $kind i32) (local $breath i32) (local $was i32)
  (local.set $pb (i32.add (i32.shl (local.get $p) (i32.const 6)) (local.get $d)))
  (if (i32.ne (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @(PF_LIVE | PF_DEAD | PF_FALL))) (i32.const @PF_LIVE)) (then (return)))
  (local.set $tp (call $p_t (local.get $d)))
  (call $nd_walls (local.get $pb) (local.get $tp))
  (local.set $was (i32.and (!at i32 @(PLAYERS + PG_M) (local.get $pb)) (i32.const 0xfff)))
  (local.set $breath (select (i32.sub (local.get $was) (i32.const 2)) (i32.const 0) (i32.gt_u (local.get $was) (i32.const 2))))
  (local.set $a (call $nd_now (local.get $tp)))
  (if (i32.ge_s (local.get $a) (i32.const 0))
    (then
      (local.set $kind (i32.load (local.get $a)))
      (if (i32.eq (local.get $kind) (i32.const @ND_FLOOD))
        (then (local.set $breath (call $nd_flood (local.get $p) (local.get $pb) (local.get $d) (local.get $a) (local.get $tp) (local.get $was)))))
      (if (i32.or (i32.eq (local.get $kind) (i32.const @ND_METEOR)) (i32.eq (local.get $kind) (i32.const @ND_LIGHTNING)))
        (then (call $nd_strike_on (local.get $p) (local.get $pb) (local.get $d) (local.get $tp))))
      (if (i32.eq (local.get $kind) (i32.const @ND_TORNADO)) (then (call $nd_tornado (local.get $p) (local.get $pb) (local.get $d) (local.get $a) (local.get $tp))))
      (if (i32.eq (local.get $kind) (i32.const @ND_QUAKE)) (then (call $nd_quake (local.get $pb) (local.get $a) (local.get $tp))))
      (if (i32.eq (local.get $kind) (i32.const @ND_TSUNAMI)) (then (call $nd_wave (local.get $p) (local.get $pb) (local.get $d) (local.get $a) (local.get $tp))))))
  (if (i32.gt_u (local.get $breath) (i32.const 0xfff)) (then (local.set $breath (i32.const 0xfff))))
  (if (i32.ne (local.get $breath) (local.get $was))
    (then (!put i32 @(PLAYERS + PG_M) (local.get $pb)
            (i32.or (i32.and (!at i32 @(PLAYERS + PG_M) (local.get $pb)) (i32.const 0xfffff000)) (local.get $breath))))))

;; The confirmed world's calls, as FX: each disaster called, hitting and over;
;; every strike landing; a quake's shoves and fissures opening. And the bolts
;; landing ND_LAHEAD on aimed at the balls as they are now.
(func $nd_tick
  (local $tp i32) (local $j i32) (local $nd i32) (local $a i32) (local $t i32) (local $b i32) (local $e i32) (local $e1 i32) (local $ea i32)
  (local $el i32) (local $per i32) (local $f i32) (local $fa i32) (local $cx f32)
  (local.set $tp (call $p_t (i32.const 0)))
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (local.set $nd (i32.load (i32.const @(PG_H + ND_ND))))
  (!for $j (i32.const 0) (local.get $nd)
    (local.set $a (call $nd_dr (local.get $j)))
    (!for $t (i32.const 0) (i32.const 3)
      (if (i32.eq (local.get $tp) (i32.load offset=4 (i32.add (local.get $a) (i32.shl (local.get $t) (i32.const 2)))))
        (then (call $fx (i32.const 0) (i32.const @ND_FX_CALL) (i32.const 255) (i32.or (i32.load (local.get $a)) (i32.shl (local.get $t) (i32.const 8)))
                        (local.get $cx) (f32.const @PLAT_Y) (local.get $cx) (f32.convert_i32_u (local.get $j)))))))
  (local.set $b (i32.div_u (local.get $tp) (i32.const @ND_BUCKET)))
  (if (i32.lt_u (local.get $b) (i32.const @ND_NB))
    (then
      (local.set $e1 (!ld u16 @(PG_BIG + ND_HI) (local.get $b)))
      (!for $e (!ld u16 @(PG_BIG + ND_LO) (local.get $b)) (local.get $e1)
        (local.set $ea (call $nd_ev (local.get $e)))
        (if (i32.eq (i32.load (local.get $ea)) (local.get $tp))
          (then (call $fx (i32.const 0) (i32.const @ND_FX_STRIKE) (i32.const 255) (local.get $e)
                          (f32.load offset=4 (local.get $ea)) (f32.load offset=12 (local.get $ea)) (f32.load offset=8 (local.get $ea)) (f32.load offset=16 (local.get $ea))))))))
  (local.set $t (i32.add (local.get $tp) (i32.const @ND_LAHEAD)))
  (local.set $b (i32.div_u (local.get $t) (i32.const @ND_BUCKET)))
  (if (i32.lt_u (local.get $b) (i32.const @ND_NB))
    (then
      (local.set $e1 (!ld u16 @(PG_BIG + ND_HI) (local.get $b)))
      (!for $e (!ld u16 @(PG_BIG + ND_LO) (local.get $b)) (local.get $e1)
        (local.set $ea (call $nd_ev (local.get $e)))
        (if (i32.and (i32.eq (i32.load (local.get $ea)) (local.get $t)) (i32.ne (i32.and (i32.load offset=20 (local.get $ea)) (i32.const @ND_EV_AIM)) (i32.const 0)))
          (then (call $nd_aim (local.get $e) (local.get $ea) (local.get $t)))))))
  (local.set $a (call $nd_now (local.get $tp)))
  (if (i32.ge_s (local.get $a) (i32.const 0))
    (then
      (if (i32.eq (i32.load (local.get $a)) (i32.const @ND_QUAKE))
        (then
          (local.set $el (i32.sub (i32.sub (local.get $tp) (i32.load offset=8 (local.get $a))) (i32.const @ND_Q0)))
          (local.set $per (i32.load offset=24 (local.get $a)))
          (if (i32.and (i32.ge_s (local.get $el) (i32.const 0)) (i32.eqz (i32.rem_u (local.get $el) (local.get $per))))
            (then (call $fx (i32.const 0) (i32.const @ND_FX_QUAKE) (i32.const 255) (i32.div_u (local.get $el) (local.get $per))
                            (local.get $cx) (f32.const @PLAT_Y) (local.get $cx) (f32.load offset=28 (local.get $a)))))
          (!for $f (i32.const 0) (i32.load offset=32 (local.get $a))
            (local.set $fa (i32.add (i32.add (local.get $a) (i32.const 40)) (i32.mul (local.get $f) (i32.const @ND_FSZ))))
            (if (i32.eq (local.get $tp) (i32.load offset=20 (local.get $fa)))
              (then (call $fx (i32.const 0) (i32.const @ND_FX_QUAKE) (i32.const 255) (i32.add (i32.const 0x100) (local.get $f))
                              (f32.load (local.get $fa)) (f32.const @PLAT_Y) (f32.load offset=4 (local.get $fa)) (f32.load offset=36 (local.get $a)))))))))))

;; The disaster number whose call came last by tick tp into play (0 before the first's).
(func $nd_epoch (param $tp i32) (result i32)
  (local $j i32) (local $n i32) (local $e i32)
  (local.set $n (i32.load (i32.const @(PG_H + ND_ND))))
  (!for $j (i32.const 0) (local.get $n)
    (if (i32.ge_s (local.get $tp) (i32.load offset=4 (call $nd_dr (local.get $j)))) (then (local.set $e (local.get $j)))))
  (local.get $e))

;; Two or more still on and every one of them going out, all of them since
;; one disaster's call (from its call to the next's): over now, and they share
;; the win, rather than the last of them to drop taking it alone. Each ball's
;; first tick going out is noted here (ND_FELL).
(func $nd_over (result i32)
  (local $p i32) (local $fl i32) (local $t i32) (local $ep i32) (local $e i32)
  (local.set $t (i32.add (call $p_t (i32.const 0)) (i32.const 1)))
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (local.set $fl (i32.and (!at u8 @(PLAYERS + P_FL) (i32.shl (local.get $p) (i32.const 6))) (i32.const @(PF_LIVE | PF_DEAD | PF_FALL))))
    (if (i32.and (i32.eq (local.get $fl) (i32.const @(PF_LIVE | PF_FALL))) (i32.eqz (!ld u16 @(PG_S + ND_FELL) (local.get $p))))
      (then (!st u16 @(PG_S + ND_FELL) (local.get $p) (local.get $t)))))
  (if (i32.lt_u (i32.load (i32.const @BH_LEFT)) (i32.const 2)) (then (return (i32.const 0))))
  (local.set $ep (i32.const -1))
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (local.set $fl (i32.and (!at u8 @(PLAYERS + P_FL) (i32.shl (local.get $p) (i32.const 6))) (i32.const @(PF_LIVE | PF_DEAD | PF_FALL))))
    (if (i32.eq (local.get $fl) (i32.const @PF_LIVE)) (then (return (i32.const 0))))
    (if (i32.eq (local.get $fl) (i32.const @(PF_LIVE | PF_FALL)))
      (then
        (local.set $e (call $nd_epoch (i32.sub (!ld u16 @(PG_S + ND_FELL) (local.get $p)) (i32.const 1))))
        (if (i32.lt_s (local.get $ep) (i32.const 0)) (then (local.set $ep (local.get $e))))
        (if (i32.ne (local.get $e) (local.get $ep)) (then (return (i32.const 0)))))))
  (i32.const 1))

(func $nd_out (param $p i32))
