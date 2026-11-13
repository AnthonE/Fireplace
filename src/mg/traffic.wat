;; RUSH HOUR: a street along z, as long as the crowd wants, a pavement either
;; side, and the balls crossing it along x, there and back and there again.
;; Reaching the far pavement is a point, and then the near one is the far
;; one. The road is RH_NS strips side by side: lanes of cars, vans and
;; lorries, a bike lane, a tram line, each with its own way, speed and
;; spacing; medians, where nothing drives; a belt, which carries a ball along.
;; A vehicle that meets a ball knocks it on down the lane and up, and RH_DOWN
;; later the ball is back behind the kerb it last scored from. A zebra crosses
;; the road, and every RH_LT its lights hold the traffic back up the street
;; for RH_LW: a gap comes down every lane and they all meet on the zebra.
;; Gold coins drop onto the lanes, RH_COIN each; from RH_DOUBLE every point
;; is two. No bumps: balls pass through each other, so a crowd at the kerb
;; shoves nobody under a lorry. Most points at 90 s wins.
;;
;; Every strip (PG_S) and every lane's traffic (PG_BIG: a vehicle or none in
;; each cell of a train that moves as one) is laid by setup from the round's
;; seed, the gaps the lights make cut out of it there, so where a vehicle is
;; is a function of the tick, and push on either bank knocks a ball, brings
;; it back and counts its crossing exactly as the confirmed world will. Only
;; the coins are the confirmed world's, a round trip late, as a bump is.

;; The traffic's clock t ticks into play: it runs RH_QK faster by the end.
(func $rh_run (param $t i32) (result f32)
  (local $f f32)
  (local.set $f (f32.convert_i32_s (local.get $t)))
  (!madd (f32.mul (local.get $f) (local.get $f)) (f32.const @(RH_QA / 2)) (local.get $f)))

;; The tick into play its clock reads r.
(func $rh_when (param $r f32) (result f32)
  (f32.div (f32.sub (f32.sqrt (!madd (local.get $r) (f32.const @(2 * RH_QA)) (f32.const 1))) (f32.const 1)) (f32.const @RH_QA)))

;; A byte of a hash as [0, 1).
(func $rh_unit (param $h i32) (result f32)
  (f32.mul (f32.convert_i32_u (i32.and (local.get $h) (i32.const 255))) (f32.const 0.00390625)))

;; Strip k's kind, by the seed's draw: lanes outside, a median or a belt
;; after the second and before the eighth (never two belts), and of the three
;; between, one a lane and the others a lane, a bike lane or a tram line.
(func $rh_type (param $k i32) (param $lay i32) (result i32)
  (local $mid i32) (local $med i32)
  (local.set $mid (i32.rem_u (i32.and (local.get $lay) (i32.const 255)) (i32.const 6)))
  (local.set $med (i32.rem_u (i32.and (i32.shr_u (local.get $lay) (i32.const 8)) (i32.const 255)) (i32.const 3)))
  (if (i32.eq (local.get $k) (i32.const 2))
    (then (return (select (i32.const @RH_TBELT) (i32.const @RH_TMEDIAN) (i32.eq (local.get $med) (i32.const 1))))))
  (if (i32.eq (local.get $k) (i32.const 6))
    (then (return (select (i32.const @RH_TBELT) (i32.const @RH_TMEDIAN) (i32.eq (local.get $med) (i32.const 2))))))
  (if (i32.eq (local.get $k) (i32.const 3)) (then (return (!tab RH_MID3 (local.get $mid)))))
  (if (i32.eq (local.get $k) (i32.const 5)) (then (return (!tab RH_MID5 (local.get $mid)))))
  (i32.const @RH_TLANE))

;; Strip k's traffic for the round: each cell full or not by the seed, fuller
;; the later it comes by; a lane's a car, a van or (cells long enough) a
;; lorry; where in its cell it rides. Then the lights: a vehicle that would
;; be within RH_ZM of the zebra at any tick of a green is left out.
(func $rh_fill (param $k i32)
  (local $a i32) (local $ty i32) (local $i i32) (local $h i32) (local $sd i32) (local $kind i32) (local $r i32) (local $cell i32) (local $off8 i32)
  (local $vdt f32) (local $pl f32) (local $span f32) (local $yc f32) (local $zb f32) (local $u f32) (local $len f32) (local $off f32)
  (local $at f32) (local $s1 f32) (local $s2 f32) (local $t1 f32) (local $t2 f32) (local $j f32)
  (local.set $a (i32.add (i32.const @PG_S) (i32.mul (local.get $k) (i32.const @RH_SREC))))
  (local.set $ty (i32.load8_u offset=@RH_STYPE (local.get $a)))
  (local.set $vdt (f32.mul (f32.load offset=@RH_SV (local.get $a)) (f32.const @DT)))
  (local.set $pl (f32.load offset=@RH_SPITCH (local.get $a)))
  (local.set $span (f32.div (f32.mul (call $rh_run (i32.const @RH_LEN)) (local.get $vdt)) (local.get $pl)))
  ;; the zebra's middle, in metres along the lane's way from where it comes in
  (local.set $yc (f32.sub (f32.load (i32.const @(PG_H + RH_ZC))) (f32.sub (f32.load (i32.const @PG_CX)) (f32.load (i32.const @(PG_H + RH_HW))))))
  (if (i32.load8_u offset=@RH_SDIR (local.get $a))
    (then (local.set $yc (f32.sub (f32.mul (f32.load (i32.const @(PG_H + RH_HW))) (f32.const 2)) (local.get $yc)))))
  (local.set $zb (f32.add (f32.load (i32.const @(PG_H + RH_ZH))) (f32.const @RH_ZM)))
  (local.set $sd (call $p_seed (i32.const @RH_SEEDCELL)))
  (local.set $cell (i32.add (i32.const @(PG_BIG + RH_CELLS)) (i32.mul (local.get $k) (i32.const @(RH_NCELL * 2)))))
  (!for $i (i32.const 0) (i32.const @RH_NCELL)
    (local.set $h (call $hash32 (local.get $i) (local.get $k) (local.get $sd)))
    (local.set $u (!clamp (f32.div (f32.convert_i32_s (i32.sub (local.get $i) (i32.const @RH_C0))) (local.get $span)) (f32.const 0) (f32.const 1)))
    (local.set $kind (i32.const 0))
    (if (f32.lt (f32.convert_i32_u (i32.and (local.get $h) (i32.const 255)))
                (!madd (local.get $u) (f32.convert_i32_s (i32.sub (!tab RH_D1 (local.get $ty)) (!tab RH_D0 (local.get $ty))))
                       (f32.convert_i32_u (!tab RH_D0 (local.get $ty)))))
      (then
        (local.set $kind (select (i32.const @RH_KBIKE) (i32.const @RH_KTRAM) (i32.eq (local.get $ty) (i32.const @RH_TBIKE))))
        (if (i32.eq (local.get $ty) (i32.const @RH_TLANE))
          (then
            (local.set $r (i32.and (i32.shr_u (local.get $h) (i32.const 8)) (i32.const 255)))
            (local.set $kind (select (i32.const @RH_KLORRY) (i32.const @RH_KVAN) (f32.ge (local.get $pl) (f32.const @RH_PLORRY))))
            (if (i32.lt_u (local.get $r) (i32.const @RH_VANS)) (then (local.set $kind (i32.const @RH_KVAN))))
            (if (i32.lt_u (local.get $r) (i32.const @RH_CARS)) (then (local.set $kind (i32.const @RH_KCAR))))))
        (local.set $len (f32.mul (f32.convert_i32_u (!tab RH_KLEN (local.get $kind))) (f32.const 0.01)))
        (local.set $off8 (i32.trunc_sat_f32_u (f32.mul (f32.mul (f32.sub (f32.sub (local.get $pl) (local.get $len)) (f32.const @RH_GAP))
                                                                 (call $rh_unit (i32.shr_u (local.get $h) (i32.const 20))))
                                                        (f32.const 8))))
        (if (i32.gt_u (local.get $off8) (i32.const 255)) (then (local.set $off8 (i32.const 255))))
        (local.set $off (f32.mul (f32.convert_i32_u (local.get $off8)) (f32.const 0.125)))
        ;; its nose is at the zebra's near margin once the lane has run s1, its tail past the far one at s2
        (local.set $at (f32.add (!madd (f32.convert_i32_s (i32.sub (local.get $i) (i32.const @RH_C0))) (local.get $pl) (local.get $off)) (local.get $yc)))
        (local.set $s1 (f32.sub (local.get $at) (local.get $zb)))
        (local.set $s2 (f32.add (f32.add (local.get $at) (local.get $zb)) (local.get $len)))
        (if (f32.gt (local.get $s2) (f32.const 0))
          (then
            (local.set $t1 (call $rh_when (f32.div (f32.max (local.get $s1) (f32.const 0)) (local.get $vdt))))
            (local.set $t2 (call $rh_when (f32.div (local.get $s2) (local.get $vdt))))
            ;; the last green to start before it has left
            (local.set $j (f32.floor (f32.div (f32.sub (local.get $t2) (f32.const @(RH_LA - RH_LM))) (f32.const @RH_LT))))
            (if (i32.and (f32.ge (local.get $j) (f32.const 0))
                         (f32.le (local.get $t1) (!madd (local.get $j) (f32.const @RH_LT) (f32.const @(RH_LA + RH_LW + RH_LM)))))
              (then (local.set $kind (i32.const 0))))))
        (if (local.get $kind)
          (then
            (i32.store8 (i32.add (local.get $cell) (i32.shl (local.get $i) (i32.const 1)))
              (i32.or (local.get $kind) (i32.and (i32.shr_u (local.get $h) (i32.const 8)) (i32.const 0xf0))))
            (i32.store8 offset=1 (i32.add (local.get $cell) (i32.shl (local.get $i) (i32.const 1))) (local.get $off8))))))))

;; The street for n balls: its length and the zebra's width for the crowd,
;; the strips across it and each lane's way, speed and cells from the seed,
;; then its traffic.
(func $rh_setup (param $n i32)
  (local $k i32) (local $a i32) (local $ty i32) (local $h i32) (local $lay i32)
  (local $root f32) (local $hw f32) (local $cx f32) (local $x f32) (local $d f32) (local $v f32) (local $pl f32)
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (local.set $root (f32.sqrt (f32.convert_i32_u (local.get $n))))
  (local.set $hw (f32.mul (!madd (local.get $root) (f32.const @RH_WK) (f32.const @RH_W0)) (f32.const 0.5)))
  (!chk (local.get $hw) 500 (local.get $n))
  (local.set $lay (call $p_seed (i32.const @RH_SEEDLAY)))
  (i32.store (i32.const @PG_KIND) (i32.const @PK_SCORE))
  (i32.store (i32.const @PG_LEN) (i32.const @RH_LEN))
  (i32.store (i32.const @PG_FLAGS) (i32.const 0))
  (f32.store (i32.const @PG_IDLE) (f32.const @RH_IDLE))
  (f32.store (i32.const @(PG_H + RH_HW)) (local.get $hw))
  (f32.store (i32.const @(PG_H + RH_ZH)) (!madd (local.get $root) (f32.const @RH_ZHK) (f32.const @RH_ZH0)))
  (f32.store (i32.const @(PG_H + RH_ZC))
    (!madd (f32.sub (call $rh_unit (i32.shr_u (local.get $lay) (i32.const 16))) (f32.const 0.5)) (f32.mul (local.get $hw) (f32.const @(2 * RH_ZOFF))) (local.get $cx)))
  (i32.store (i32.const @(PG_H + RH_COLS))
    (i32.add (i32.trunc_sat_f32_u (f32.div (f32.sub (f32.mul (local.get $hw) (f32.const 2)) (f32.const @(2 * RH_EDGE))) (f32.const @RH_SP))) (i32.const 1)))
  ;; the road's depth, then the strips across it from the near kerb
  (!for $k (i32.const 0) (i32.const @RH_NS)
    (local.set $d (f32.add (local.get $d) (f32.mul (f32.convert_i32_u (!tab RH_TW (call $rh_type (local.get $k) (local.get $lay)))) (f32.const 0.01)))))
  (local.set $x (f32.sub (local.get $cx) (f32.mul (local.get $d) (f32.const 0.5))))
  (f32.store (i32.const @(PG_H + RH_XA)) (local.get $x))
  (!for $k (i32.const 0) (i32.const @RH_NS)
    (local.set $a (i32.add (i32.const @PG_S) (i32.mul (local.get $k) (i32.const @RH_SREC))))
    (local.set $ty (call $rh_type (local.get $k) (local.get $lay)))
    (local.set $h (call $p_seed (i32.add (i32.const @RH_SEEDSTRIP) (local.get $k))))
    (f32.store offset=@RH_SX0 (local.get $a) (local.get $x))
    (local.set $x (f32.add (local.get $x) (f32.mul (f32.convert_i32_u (!tab RH_TW (local.get $ty))) (f32.const 0.01))))
    (f32.store offset=@RH_SX1 (local.get $a) (local.get $x))
    (i32.store8 offset=@RH_STYPE (local.get $a) (local.get $ty))
    (i32.store8 offset=@RH_SDIR (local.get $a) (i32.and (local.get $h) (i32.const 1)))
    (local.set $v (f32.const 0))
    (local.set $pl (f32.const 0))
    (if (i32.eq (local.get $ty) (i32.const @RH_TLANE))
      (then
        (local.set $v (!madd (call $rh_unit (i32.shr_u (local.get $h) (i32.const 8))) (f32.const @RH_VLANEK) (f32.const @RH_VLANE0)))
        (local.set $pl (!madd (call $rh_unit (i32.shr_u (local.get $h) (i32.const 16))) (f32.const @RH_PLANEK) (f32.const @RH_PLANE0)))))
    (if (i32.eq (local.get $ty) (i32.const @RH_TBIKE))
      (then
        (local.set $v (!madd (call $rh_unit (i32.shr_u (local.get $h) (i32.const 8))) (f32.const @RH_VBIKEK) (f32.const @RH_VBIKE0)))
        (local.set $pl (f32.const @RH_PBIKE))))
    (if (i32.eq (local.get $ty) (i32.const @RH_TTRAM))
      (then (local.set $v (f32.const @RH_VTRAM)) (local.set $pl (f32.const @RH_PTRAM))))
    (if (i32.eq (local.get $ty) (i32.const @RH_TBELT)) (then (local.set $v (f32.const @RH_BELT))))
    (f32.store offset=@RH_SV (local.get $a) (local.get $v))
    (f32.store offset=@RH_SPITCH (local.get $a) (local.get $pl))
    (if (i32.le_u (local.get $ty) (i32.const @RH_TTRAM)) (then (call $rh_fill (local.get $k)))))
  (f32.store (i32.const @(PG_H + RH_XB)) (local.get $x))
  (f32.store (i32.const @PG_SIZE) (f32.max (local.get $hw) (!madd (local.get $d) (f32.const 0.5) (f32.const @RH_PAVE)))))

;; Ball i of n on the near pavement, rows of RH_COLS back from the kerb, a
;; short last row centred; a newcomer in play (n 1024) anywhere along it.
(func $rh_spawn (param $i i32) (param $n i32) (result f32 f32 f32)
  (local $cols i32) (local $row i32) (local $m i32) (local $x0 f32) (local $cx f32)
  (local.set $x0 (f32.sub (f32.load (i32.const @(PG_H + RH_XA))) (f32.const @RH_GRID0)))
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (if (i32.ge_u (local.get $n) (i32.const 1024))
    (then
      (return
        (f32.sub (local.get $x0) (f32.mul (f32.convert_i32_u (i32.and (i32.shr_u (local.get $i) (i32.const 5)) (i32.const 3))) (f32.const @RH_SP)))
        (f32.const @PLAT_Y)
        (!madd (f32.sub (f32.div (f32.convert_i32_u (i32.and (local.get $i) (i32.const 31))) (f32.const 15.5)) (f32.const 1))
               (f32.sub (f32.load (i32.const @(PG_H + RH_HW))) (f32.const @RH_EDGE)) (local.get $cx)))))
  (local.set $cols (i32.load (i32.const @(PG_H + RH_COLS))))
  (local.set $row (i32.div_u (local.get $i) (local.get $cols)))
  (local.set $m (i32.sub (local.get $n) (i32.mul (local.get $row) (local.get $cols))))
  (if (i32.gt_u (local.get $m) (local.get $cols)) (then (local.set $m (local.get $cols))))
  (f32.sub (local.get $x0) (f32.mul (f32.convert_i32_u (local.get $row)) (f32.const @RH_SP)))
  (f32.const @PLAT_Y)
  (!madd (f32.convert_i32_s (i32.sub (i32.shl (i32.rem_u (local.get $i) (local.get $cols)) (i32.const 1)) (i32.sub (local.get $m) (i32.const 1))))
         (f32.const @(RH_SP / 2)) (local.get $cx)))

(func $rh_start)
(func $rh_begin (param $p i32) (param $d i32))

;; The street is one flat floor, and push keeps every ball inside its walls.
(func $rh_ground (param $d i32) (param $x f32) (param $y f32) (param $z f32) (result f32)
  (f32.const @PLAT_Y))

;; Ball p after its roll, on bank d's tick. Down (hit RH_DOWN ago or less):
;; nothing meets it, and at RH_DOWN it is put back behind the kerb it last
;; scored from, where down the street it got to, RH_DROP up. Else: a belt
;; under it carries it along; a vehicle whose box (its lane's cells on the
;; traffic's clock) its edge reaches knocks it down the lane, faster than the
;; vehicle, and up, and it is down; on the ground RH_IN past the kerb across
;; from the one it last scored from, a crossing: its point (two from
;; RH_DOUBLE), and that kerb is its own now. Then the walls, down or not.
(func $rh_push (param $p i32) (param $d i32)
  (local $pb i32) (local $fl i32) (local $m i32) (local $t i32) (local $k i32) (local $a i32) (local $ty i32) (local $i i32) (local $i1 i32) (local $c i32)
  (local $kind i32) (local $n i32) (local $cell i32)
  (local $px f32) (local $py f32) (local $pz f32) (local $vx f32) (local $vy f32) (local $vz f32) (local $r f32)
  (local $cz f32) (local $hw f32) (local $xa f32) (local $xb f32) (local $lo f32) (local $hi f32)
  (local $run f32) (local $y f32) (local $s f32) (local $pl f32) (local $dxc f32) (local $dx f32) (local $dy f32) (local $front f32) (local $len f32) (local $v f32)
  (local.set $pb (i32.add (i32.shl (local.get $p) (i32.const 6)) (local.get $d)))
  (local.set $fl (!at u8 @(PLAYERS + P_FL) (local.get $pb)))
  (local.set $m (!at i32 @(PLAYERS + PG_M) (local.get $pb)))
  (local.set $px (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
  (local.set $py (!at f32 @(PLAYERS + P_PY) (local.get $pb)))
  (local.set $pz (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
  (local.set $vx (!at f32 @(PLAYERS + P_VX) (local.get $pb)))
  (local.set $vy (!at f32 @(PLAYERS + P_VY) (local.get $pb)))
  (local.set $vz (!at f32 @(PLAYERS + P_VZ) (local.get $pb)))
  (local.set $r (call $b_rad (local.get $pb)))
  (local.set $t (call $p_t (local.get $d)))
  (local.set $cz (f32.load offset=@PG_CX (local.get $d)))
  (local.set $hw (f32.load offset=@(PG_H + RH_HW) (local.get $d)))
  (local.set $xa (f32.load offset=@(PG_H + RH_XA) (local.get $d)))
  (local.set $xb (f32.load offset=@(PG_H + RH_XB) (local.get $d)))
  (if (i32.and (local.get $m) (i32.const @RH_MDOWN))
    (then
      (if (i32.ge_s (i32.sub (i32.add (local.get $t) (i32.const 1)) (i32.and (i32.shr_u (local.get $m) (i32.const 8)) (i32.const 0xffff))) (i32.const @RH_DOWN))
        (then
          ;; back: slots side by side come back a little apart
          (local.set $dx (!madd (f32.convert_i32_u (i32.and (local.get $p) (i32.const 7))) (f32.const 0.5) (f32.const @RH_BACK)))
          (local.set $px (select (f32.add (local.get $xb) (local.get $dx)) (f32.sub (local.get $xa) (local.get $dx)) (i32.and (local.get $m) (i32.const @RH_MSIDE))))
          (local.set $py (f32.const @(+PLAT_Y + RH_DROP)))
          (local.set $vx (f32.const 0))
          (local.set $vy (f32.const 0))
          (local.set $vz (f32.const 0))
          (local.set $fl (i32.and (local.get $fl) (i32.const @(255 ^ PF_GROUND))))
          (local.set $m (i32.and (local.get $m) (i32.const @(~RH_MDOWN)))))))
    (else
      (local.set $run (call $rh_run (local.get $t)))
      (block $hit
        (!for $k (i32.const 0) (i32.const @RH_NS)
          (local.set $a (i32.add (i32.const @PG_S) (i32.mul (local.get $k) (i32.const @RH_SREC))))
          (local.set $ty (i32.load8_u offset=@RH_STYPE (local.get $a)))
          (if (i32.eq (local.get $ty) (i32.const @RH_TBELT))
            (then
              (if (i32.and (i32.ne (i32.and (local.get $fl) (i32.const @PF_GROUND)) (i32.const 0))
                           (i32.and (f32.ge (local.get $px) (f32.load offset=@RH_SX0 (local.get $a))) (f32.le (local.get $px) (f32.load offset=@RH_SX1 (local.get $a)))))
                (then (local.set $pz (f32.add (local.get $pz) (select (f32.const @(-RH_BELT_DT)) (f32.const @RH_BELT_DT) (i32.load8_u offset=@RH_SDIR (local.get $a))))))))
            (else
              (local.set $dxc (f32.abs (f32.sub (local.get $px) (f32.mul (f32.add (f32.load offset=@RH_SX0 (local.get $a)) (f32.load offset=@RH_SX1 (local.get $a))) (f32.const 0.5)))))
              (if (i32.and (i32.le_u (local.get $ty) (i32.const @RH_TTRAM)) (f32.lt (local.get $dxc) (f32.add (local.get $r) (f32.const @RH_VHWMAX))))
                (then
                  (local.set $v (f32.load offset=@RH_SV (local.get $a)))
                  (local.set $pl (f32.load offset=@RH_SPITCH (local.get $a)))
                  ;; y: the ball along the lane's way from where the lane comes in; s: how far the lane has run
                  (local.set $y (select (f32.sub (f32.add (local.get $cz) (local.get $hw)) (local.get $pz)) (f32.sub (local.get $pz) (f32.sub (local.get $cz) (local.get $hw)))
                                        (i32.load8_u offset=@RH_SDIR (local.get $a))))
                  (local.set $s (f32.mul (f32.mul (local.get $run) (local.get $v)) (f32.const @DT)))
                  (local.set $cell (i32.add (i32.const @(PG_BIG + RH_CELLS)) (i32.mul (local.get $k) (i32.const @(RH_NCELL * 2)))))
                  ;; the cell over it and the ones either side
                  (local.set $i1 (i32.add (i32.trunc_sat_f32_s (f32.floor (f32.div (f32.sub (local.get $s) (local.get $y)) (local.get $pl)))) (i32.const @(RH_C0 + 2))))
                  (local.set $i (i32.sub (local.get $i1) (i32.const 3)))
                  (block $none
                    (loop $next
                      (br_if $none (i32.ge_s (local.get $i) (local.get $i1)))
                      (if (i32.lt_u (local.get $i) (i32.const @RH_NCELL))
                        (then
                          (local.set $c (i32.load8_u (i32.add (local.get $cell) (i32.shl (local.get $i) (i32.const 1)))))
                          (local.set $kind (i32.and (local.get $c) (i32.const 7)))
                          (if (local.get $kind)
                            (then
                              (local.set $len (f32.mul (f32.convert_i32_u (!tab RH_KLEN (local.get $kind))) (f32.const 0.01)))
                              (local.set $front (f32.sub (f32.sub (local.get $s) (f32.mul (f32.convert_i32_s (i32.sub (local.get $i) (i32.const @RH_C0))) (local.get $pl)))
                                                         (f32.mul (f32.convert_i32_u (i32.load8_u offset=1 (i32.add (local.get $cell) (i32.shl (local.get $i) (i32.const 1))))) (f32.const 0.125))))
                              (local.set $dy (f32.max (f32.max (f32.sub (f32.sub (local.get $front) (local.get $len)) (local.get $y)) (f32.sub (local.get $y) (local.get $front))) (f32.const 0)))
                              (local.set $dx (f32.max (f32.sub (local.get $dxc) (f32.mul (f32.convert_i32_u (!tab RH_KHW (local.get $kind))) (f32.const 0.01))) (f32.const 0)))
                              (if (f32.lt (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dy) (local.get $dy))) (f32.mul (local.get $r) (local.get $r)))
                                (then
                                  ;; the lane's speed now, and RH_KICK
                                  (local.set $vz (f32.add (f32.mul (local.get $v) (!madd (f32.convert_i32_s (local.get $t)) (f32.const @RH_QA) (f32.const 1))) (f32.const @RH_KICK)))
                                  (if (i32.load8_u offset=@RH_SDIR (local.get $a)) (then (local.set $vz (f32.neg (local.get $vz)))))
                                  (local.set $vy (f32.mul (f32.convert_i32_u (!tab RH_KUP (local.get $kind))) (f32.const 0.01)))
                                  (local.set $vx (f32.mul (local.get $vx) (f32.const @RH_KEEP)))
                                  (local.set $fl (i32.and (local.get $fl) (i32.const @(255 ^ PF_GROUND))))
                                  (local.set $m (i32.or (local.get $m) (i32.shl (i32.add (local.get $t) (i32.const 1)) (i32.const 8))))
                                  (call $fx (local.get $d) (i32.const @RH_FX_HIT) (local.get $p) (i32.or (local.get $kind) (i32.shl (local.get $k) (i32.const 4)))
                                            (local.get $px) (f32.add (local.get $py) (local.get $r)) (local.get $pz) (f32.abs (local.get $vz)))
                                  (br $hit)))))))
                      (!inc $i)
                      (br $next))))))))
        ;; over the far kerb
        (if (i32.and (i32.ne (i32.and (local.get $fl) (i32.const @PF_GROUND)) (i32.const 0))
                     (select (f32.le (local.get $px) (f32.sub (local.get $xa) (f32.const @RH_IN))) (f32.ge (local.get $px) (f32.add (local.get $xb) (f32.const @RH_IN)))
                             (i32.and (local.get $m) (i32.const @RH_MSIDE))))
          (then
            (local.set $n (i32.add (i32.shr_u (local.get $m) (i32.const 24)) (i32.const 1)))
            (if (i32.gt_u (local.get $n) (i32.const 255)) (then (local.set $n (i32.const 255))))
            (local.set $m (i32.or (i32.xor (i32.and (local.get $m) (i32.const 0xffffff)) (i32.const @RH_MSIDE)) (i32.shl (local.get $n) (i32.const 24))))
            (local.set $c (select (i32.const 2) (i32.const 1) (i32.ge_s (local.get $t) (i32.const @RH_DOUBLE))))
            (local.set $i (i32.add (!at u16 @(PLAYERS + PG_SCORE) (local.get $pb)) (local.get $c)))
            (!put u16 @(PLAYERS + PG_SCORE) (local.get $pb) (select (local.get $i) (i32.const 65535) (i32.lt_u (local.get $i) (i32.const 65535))))
            (call $fx (local.get $d) (i32.const @RH_FX_CROSS) (local.get $p) (local.get $n)
                      (local.get $px) (local.get $py) (local.get $pz) (f32.convert_i32_u (local.get $c))))))))
  ;; the walls: behind both pavements, across both ends
  (local.set $lo (f32.add (f32.sub (local.get $xa) (f32.const @RH_PAVE)) (local.get $r)))
  (local.set $hi (f32.sub (f32.add (local.get $xb) (f32.const @RH_PAVE)) (local.get $r)))
  (if (f32.lt (local.get $px) (local.get $lo))
    (then (local.set $px (local.get $lo)) (if (f32.lt (local.get $vx) (f32.const 0)) (then (local.set $vx (f32.mul (local.get $vx) (f32.const @(-RH_BOUNCE))))))))
  (if (f32.gt (local.get $px) (local.get $hi))
    (then (local.set $px (local.get $hi)) (if (f32.gt (local.get $vx) (f32.const 0)) (then (local.set $vx (f32.mul (local.get $vx) (f32.const @(-RH_BOUNCE))))))))
  (local.set $lo (f32.add (f32.sub (local.get $cz) (local.get $hw)) (local.get $r)))
  (local.set $hi (f32.sub (f32.add (local.get $cz) (local.get $hw)) (local.get $r)))
  (if (f32.lt (local.get $pz) (local.get $lo))
    (then (local.set $pz (local.get $lo)) (if (f32.lt (local.get $vz) (f32.const 0)) (then (local.set $vz (f32.mul (local.get $vz) (f32.const @(-RH_BOUNCE))))))))
  (if (f32.gt (local.get $pz) (local.get $hi))
    (then (local.set $pz (local.get $hi)) (if (f32.gt (local.get $vz) (f32.const 0)) (then (local.set $vz (f32.mul (local.get $vz) (f32.const @(-RH_BOUNCE))))))))
  (!chk (local.get $px) 501 (local.get $p))
  (!chk (local.get $py) 502 (local.get $p))
  (!chk (local.get $pz) 503 (local.get $p))
  (!chk (local.get $vx) 504 (local.get $p))
  (!chk (local.get $vy) 505 (local.get $p))
  (!chk (local.get $vz) 506 (local.get $p))
  (!put f32 @(PLAYERS + P_PX) (local.get $pb) (local.get $px))
  (!put f32 @(PLAYERS + P_PY) (local.get $pb) (local.get $py))
  (!put f32 @(PLAYERS + P_PZ) (local.get $pb) (local.get $pz))
  (!put f32 @(PLAYERS + P_VX) (local.get $pb) (local.get $vx))
  (!put f32 @(PLAYERS + P_VY) (local.get $pb) (local.get $vy))
  (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (local.get $vz))
  (!put u8 @(PLAYERS + P_FL) (local.get $pb) (local.get $fl))
  (!put i32 @(PLAYERS + PG_M) (local.get $pb) (local.get $m)))

;; One coin onto a lane, anywhere along it, if a slot and a lane turn up.
(func $rh_drop (param $t i32)
  (local $q i32) (local $a i32) (local $k i32) (local $n i32) (local $s i32) (local $x f32) (local $z f32)
  (block $found
    (!for $q (i32.const 0) (i32.const @RH_NCOIN)
      (local.set $a (i32.add (i32.const @(PG_S + RH_COINS)) (i32.shl (local.get $q) (i32.const 4))))
      (br_if $found (i32.eqz (i32.load offset=8 (local.get $a)))))
    (return))
  (block $lane
    (!for $n (i32.const 0) (i32.const 8)
      (local.set $k (i32.rem_u (call $rand) (i32.const @RH_NS)))
      (local.set $s (i32.add (i32.const @PG_S) (i32.mul (local.get $k) (i32.const @RH_SREC))))
      (br_if $lane (i32.le_u (i32.load8_u offset=@RH_STYPE (local.get $s)) (i32.const @RH_TTRAM))))
    (return))
  (local.set $x (f32.mul (f32.add (f32.load offset=@RH_SX0 (local.get $s)) (f32.load offset=@RH_SX1 (local.get $s))) (f32.const 0.5)))
  (local.set $z (!madd (f32.sub (f32.mul (call $p_unit) (f32.const 2)) (f32.const 1))
                       (f32.sub (f32.load (i32.const @(PG_H + RH_HW))) (f32.const @RH_EDGE)) (f32.load (i32.const @PG_CX))))
  (f32.store (local.get $a) (local.get $x))
  (f32.store offset=4 (local.get $a) (local.get $z))
  (i32.store offset=8 (local.get $a) (i32.add (local.get $t) (i32.const 1)))
  (call $fx (i32.const 0) (i32.const @RH_FX_COIN) (i32.const 255) (local.get $q) (local.get $x) (f32.const @PLAT_Y) (local.get $z) (f32.const 0)))

;; Once a tick in play: the calls (the lights, the last 15 s); each coin gone
;; at RH_CLIFE, or taken by the first ball by slot, in and not down, within
;; RH_CR of it and near the floor; new coins every RH_CEVERY.
(func $rh_tick
  (local $t i32) (local $c i32) (local $q i32) (local $a i32) (local $p i32) (local $pb i32) (local $n i32) (local $pts i32) (local $call i32)
  (local $x f32) (local $z f32) (local $dx f32) (local $dz f32)
  (local.set $t (call $p_t (i32.const 0)))
  (local.set $c (i32.rem_u (i32.add (local.get $t) (i32.const @(RH_LT - RH_LA))) (i32.const @RH_LT)))
  (if (i32.eq (local.get $c) (i32.const @(RH_LT - RH_LWARN))) (then (local.set $call (i32.const @RH_CAMBER))))
  (if (i32.ge_u (local.get $t) (i32.const @RH_LA))
    (then
      (if (i32.eqz (local.get $c)) (then (local.set $call (i32.const @RH_CWALK))))
      (if (i32.eq (local.get $c) (i32.const @(RH_LW - RH_LEND))) (then (local.set $call (i32.const @RH_CEND))))
      (if (i32.eq (local.get $c) (i32.const @RH_LW)) (then (local.set $call (i32.const @RH_CSTOP))))))
  (if (local.get $call)
    (then (call $fx (i32.const 0) (i32.const @RH_FX_CALL) (i32.const 255) (local.get $call)
                    (f32.load (i32.const @PG_CX)) (f32.const @PLAT_Y) (f32.load (i32.const @(PG_H + RH_ZC))) (f32.const 0))))
  (if (i32.eq (local.get $t) (i32.const @RH_DOUBLE))
    (then (call $fx (i32.const 0) (i32.const @RH_FX_CALL) (i32.const 255) (i32.const @RH_CDOUBLE)
                    (f32.load (i32.const @PG_CX)) (f32.const @PLAT_Y) (f32.load (i32.const @PG_CX)) (f32.const 2))))
  (local.set $pts (select (i32.const @(2 * RH_COIN)) (i32.const @RH_COIN) (i32.ge_u (local.get $t) (i32.const @RH_DOUBLE))))
  (!for $q (i32.const 0) (i32.const @RH_NCOIN)
    (local.set $a (i32.add (i32.const @(PG_S + RH_COINS)) (i32.shl (local.get $q) (i32.const 4))))
    (local.set $n (i32.load offset=8 (local.get $a)))
    (if (local.get $n)
      (then
        (if (i32.ge_s (i32.sub (i32.add (local.get $t) (i32.const 1)) (local.get $n)) (i32.const @RH_CLIFE))
          (then (i32.store offset=8 (local.get $a) (i32.const 0)))
          (else
            (local.set $x (f32.load (local.get $a)))
            (local.set $z (f32.load offset=4 (local.get $a)))
            (block $taken
              (!for $p (i32.const 0) (i32.const @NPLAYER)
                (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
                (local.set $dx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (local.get $x)))
                (local.set $dz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $pb)) (local.get $z)))
                (if (f32.lt (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))) (f32.const @(RH_CR * RH_CR)))
                  (then
                    (if (i32.and (i32.and (call $p_in (local.get $pb)) (i32.eqz (i32.and (!at i32 @(PLAYERS + PG_M) (local.get $pb)) (i32.const @RH_MDOWN))))
                                 (f32.lt (!at f32 @(PLAYERS + P_PY) (local.get $pb)) (f32.const @(+PLAT_Y + 1.5))))
                      (then
                        (local.set $n (i32.add (!at u16 @(PLAYERS + PG_SCORE) (local.get $pb)) (local.get $pts)))
                        (!put u16 @(PLAYERS + PG_SCORE) (local.get $pb) (select (local.get $n) (i32.const 65535) (i32.lt_u (local.get $n) (i32.const 65535))))
                        (i32.store offset=8 (local.get $a) (i32.const 0))
                        (call $fx (i32.const 0) (i32.const @RH_FX_COIN) (local.get $p) (local.get $q) (local.get $x) (f32.const @(+PLAT_Y + 1)) (local.get $z)
                                  (f32.convert_i32_u (local.get $pts)))
                        (br $taken))))))))))))
  (if (i32.eq (i32.rem_u (local.get $t) (i32.const @RH_CEVERY)) (i32.const @(RH_CEVERY / 2)))
    (then
      (!for $q (i32.const 0) (i32.add (i32.div_u (i32.load (i32.const @BH_N0)) (i32.const @RH_CPER)) (i32.const 1))
        (call $rh_drop (local.get $t))))))

(func $rh_over (result i32) (i32.const 0))
(func $rh_out (param $p i32))
