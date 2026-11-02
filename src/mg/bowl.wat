;; BOWLING: lanes side by side along +x over the sea, one for every BW_PER
;; balls in (BW_NLMIN to BW_NLMAX), each a wooden lane BW_LW wide with a
;; gutter either side (BW_GW across, BW_GD down, running on past the pins to
;; the pit) and a divider to the next. The balls start on the approach,
;; behind the foul line; BW_LANE on ten pins stand in a triangle on the
;; deck, BW_PS apart; past the deck, the pit. Every ball is the bowling ball:
;; rolled from behind the foul line and kept rolling down the lane (BW_VLIVE
;; at least, on its surface), it knocks every pin its edge reaches and is
;; never slowed by one. A knocked pin goes off along the line between them,
;; slides, topples over BW_TIP and knocks any standing pin its body meets,
;; credited to whoever knocked the first; off the lane's surface or past the
;; lip it drops into a gutter or the pit. A point a pin to its knocker (a
;; golden pin, in one rack in BW_GOLDP, BW_GOLD); all ten of a rack to one
;; ball is a strike, BW_STRIKE more; the last 15 s pay double. Once a lane's
;; ten are down, or BW_WAIT after its first went, the lane is called and
;; nothing there scores; BW_SWEEP on its deck drops, what's on it into the
;; pit, and BW_DOWN after that a fresh ten stand. A ball off the deck's end
;; or down a gutter drops into the pit and comes back on its lane's approach
;; BW_RESPAWN later.
;;
;; The stage (in PG_H) is fixed for the round, and a lane's deck drops
;; BW_SWEEP after its call, past anything the prediction reaches: ground and
;; push work the walls, the gutters and the deck out on their own bank, and
;; the prediction is exact. The pins (PG_BIG) are the confirmed world's: a
;; pin never moves a ball, so nothing a knock does reaches the prediction.
;; Which balls are on a live roll, the lanes' clocks and the pay are the
;; confirmed world's too, in tick.

;; Lane l's record, pin k of lane l's, slot p's.
(func $bw_la (param $l i32) (result i32)
  (i32.add (i32.const @(PG_S + BW_LANES)) (i32.mul (local.get $l) (i32.const @BW_LSIZE))))
(func $bw_pa (param $l i32) (param $k i32) (result i32)
  (i32.add (i32.const @(PG_BIG + BW_PINS)) (i32.mul (i32.add (i32.mul (local.get $l) (i32.const 10)) (local.get $k)) (i32.const @BW_PSIZE))))
(func $bw_sa (param $p i32) (result i32)
  (i32.add (i32.const @(PG_S + BW_SLOTS)) (i32.mul (local.get $p) (i32.const @BW_SSIZE))))

;; Lane l's middle, z, on bank d.
(func $bw_zc (param $d i32) (param $l i32) (result f32)
  (!madd (f32.convert_i32_s (local.get $l)) (f32.const @BW_PITCH) (f32.add (f32.load offset=@(PG_H + BW_ZL) (local.get $d)) (f32.const @(BW_PITCH / 2)))))

;; The lane under z on bank d (the nearest, off the stage) and z less its middle.
(func $bw_lane (param $d i32) (param $z f32) (result i32 f32)
  (local $l i32) (local $nl i32)
  (local.set $nl (i32.load offset=@(PG_H + BW_NL) (local.get $d)))
  (local.set $l (i32.trunc_sat_f32_s (f32.floor (f32.div (f32.sub (local.get $z) (f32.load offset=@(PG_H + BW_ZL) (local.get $d))) (f32.const @BW_PITCH)))))
  (if (i32.ge_s (local.get $l) (local.get $nl)) (then (local.set $l (i32.sub (local.get $nl) (i32.const 1)))))
  (if (i32.lt_s (local.get $l) (i32.const 0)) (then (local.set $l (i32.const 0))))
  (local.get $l)
  (f32.sub (local.get $z) (call $bw_zc (local.get $d) (local.get $l))))

;; Is lane l's deck down on tick t? From BW_SWEEP after its call, for BW_DOWN.
;; Its call is the confirmed world's (PG_S), made at least BW_SWEEP before.
(func $bw_down (param $l i32) (param $t i32) (result i32)
  (local $c i32)
  (local.set $c (i32.load offset=@BW_L_CALL (call $bw_la (local.get $l))))
  (i32.and (i32.ne (local.get $c) (i32.const 0))
           (i32.lt_u (i32.sub (i32.sub (local.get $t) (local.get $c)) (i32.const @BW_SWEEP)) (i32.const @BW_DOWN))))

;; Pin k's spot from the head pin's, along x and across z: row by row from
;; the head pin, low z first in a row.
(func $bw_spot (param $k i32) (result f32 f32)
  (local $r i32) (local $i i32)
  (local.set $r (i32.add (i32.add (i32.ge_u (local.get $k) (i32.const 1)) (i32.ge_u (local.get $k) (i32.const 3)))
                         (i32.ge_u (local.get $k) (i32.const 6))))
  (local.set $i (i32.sub (local.get $k) (i32.shr_u (i32.mul (local.get $r) (i32.add (local.get $r) (i32.const 1))) (i32.const 1))))
  (f32.mul (f32.convert_i32_u (local.get $r)) (f32.const @BW_ROW))
  (f32.mul (f32.sub (f32.convert_i32_u (local.get $i)) (f32.mul (f32.convert_i32_u (local.get $r)) (f32.const 0.5))) (f32.const @BW_PS)))

;; ---- the stage

;; The lanes for n balls, centred on PG_CX: their x marks, the knobs (a
;; scoring round, a quick return, a slick lane, no hop, bumps without the
;; kick), and a rack on each.
(func $bw_setup (param $n i32)
  (local $nl i32) (local $l i32) (local $len f32) (local $wid f32) (local $cx f32) (local $xa f32) (local $xh f32)
  (local.set $nl (i32.div_u (i32.add (local.get $n) (i32.const @(BW_PER - 1))) (i32.const @BW_PER)))
  (if (i32.lt_u (local.get $nl) (i32.const @BW_NLMIN)) (then (local.set $nl (i32.const @BW_NLMIN))))
  (if (i32.gt_u (local.get $nl) (i32.const @BW_NLMAX)) (then (local.set $nl (i32.const @BW_NLMAX))))
  (local.set $len (f32.const @(BW_APP + BW_LANE + 3 * BW_ROW + BW_DECKB + BW_PIT)))
  (local.set $wid (!madd (f32.convert_i32_u (local.get $nl)) (f32.const @BW_PITCH) (f32.const @BW_DIV)))
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (local.set $xa (!madd (local.get $len) (f32.const -0.5) (local.get $cx)))
  (local.set $xh (f32.add (local.get $xa) (f32.const @(BW_APP + BW_LANE))))
  (i32.store (i32.const @PG_KIND) (i32.const @PK_SCORE))
  (i32.store (i32.const @PG_LEN) (i32.const @BW_LEN))
  (i32.store (i32.const @PG_RESPAWN) (i32.const @BW_RESPAWN))
  (f32.store (i32.const @PG_FLOOR) (f32.const @(+PLAT_Y - BW_GD)))
  (f32.store (i32.const @PG_DRAG) (f32.const @BW_DRAG))
  (f32.store (i32.const @PG_HOP) (f32.const 0))
  (i32.store (i32.const @PG_FLAGS) (i32.const @(PGF_BUMPS | PGF_NOKICK)))
  (f32.store (i32.const @PG_SIZE) (f32.mul (f32.max (local.get $len) (local.get $wid)) (f32.const 0.5)))
  (i32.store (i32.const @(PG_H + BW_NL)) (local.get $nl))
  (f32.store (i32.const @(PG_H + BW_XA)) (local.get $xa))
  (f32.store (i32.const @(PG_H + BW_XF)) (f32.add (local.get $xa) (f32.const @BW_APP)))
  (f32.store (i32.const @(PG_H + BW_XD)) (f32.sub (local.get $xh) (f32.const @BW_DECKF)))
  (f32.store (i32.const @(PG_H + BW_XH)) (local.get $xh))
  (f32.store (i32.const @(PG_H + BW_XE)) (f32.add (local.get $xh) (f32.const @(3 * BW_ROW + BW_DECKB))))
  (f32.store (i32.const @(PG_H + BW_XB)) (f32.add (local.get $xh) (f32.const @(3 * BW_ROW + BW_DECKB + BW_PIT))))
  (f32.store (i32.const @(PG_H + BW_ZL)) (!madd (f32.convert_i32_u (local.get $nl)) (f32.const @(-BW_PITCH / 2)) (local.get $cx)))
  (!for $l (i32.const 0) (local.get $nl)
    (call $bw_rack (local.get $l) (i32.const 0))))

;; As the round is laid out, ball i of n on the approach of lane i mod the
;; lanes, two rows of three; a ball back from the pit (or a newcomer, n 1024)
;; on its own lane's (tick's queue, in slot order as the framework brings
;; them back), else on the lane with fewest on it, at one of eight spots i
;; picks in two rows at the back, BW_DROPY up (the framework puts it 6 m
;; over what spawn says).
(func $bw_spawn (param $i i32) (param $n i32) (result f32 f32 f32)
  (local $nl i32) (local $l i32) (local $j i32) (local $q i32) (local $c i32) (local $m i32) (local $best i32)
  (local $x f32) (local $y f32) (local $u f32)
  (local.set $nl (i32.load (i32.const @(PG_H + BW_NL))))
  (local.set $nl (select (local.get $nl) (i32.const 1) (local.get $nl)))
  (local.set $y (f32.const @PLAT_Y))
  (if (i32.ge_u (local.get $n) (i32.const 1024))
    (then
      (local.set $q (i32.load (i32.const @(PG_S + BW_QI))))
      (if (i32.and (i32.eq (i32.load (i32.const @(PG_S + BW_QT))) (i32.load (i32.const @HDR_TICK)))
                   (i32.lt_u (local.get $q) (i32.load (i32.const @(PG_S + BW_QN)))))
        (then
          (local.set $l (i32.load8_u offset=@(PG_S + BW_QUEUE) (local.get $q)))
          (i32.store (i32.const @(PG_S + BW_QI)) (i32.add (local.get $q) (i32.const 1))))
        (else
          (local.set $best (i32.const 256))
          (!for $j (i32.const 0) (local.get $nl)
            (local.set $c (i32.rem_u (i32.add (local.get $i) (local.get $j)) (local.get $nl)))
            (local.set $m (i32.load8_u offset=@BW_L_N (call $bw_la (local.get $c))))
            (if (i32.lt_u (local.get $m) (local.get $best)) (then (local.set $best (local.get $m)) (local.set $l (local.get $c)))))))
      (if (i32.ge_u (local.get $l) (local.get $nl)) (then (local.set $l (i32.const 0))))
      (local.set $x (f32.add (f32.load (i32.const @(PG_H + BW_XA)))
                             (!madd (f32.convert_i32_u (i32.and (i32.shr_u (local.get $i) (i32.const 2)) (i32.const 1))) (f32.const 1.7) (f32.const 1.4))))
      (local.set $u (f32.mul (f32.sub (f32.convert_i32_u (i32.and (local.get $i) (i32.const 3))) (f32.const 1.5)) (f32.const 2.2)))
      (local.set $y (f32.const @(+PLAT_Y + BW_DROPY - 6))))
    (else
      (local.set $l (i32.rem_u (local.get $i) (local.get $nl)))
      (local.set $j (i32.rem_u (i32.div_u (local.get $i) (local.get $nl)) (i32.const 6)))
      (local.set $x (f32.add (f32.load (i32.const @(PG_H + BW_XA)))
                             (!madd (f32.convert_i32_u (i32.div_u (local.get $j) (i32.const 3))) (f32.const 3) (f32.const 2.2))))
      (local.set $u (f32.mul (f32.convert_i32_s (i32.sub (i32.rem_u (local.get $j) (i32.const 3)) (i32.const 1))) (f32.const 3)))))
  (local.get $x) (local.get $y) (f32.add (call $bw_zc (i32.const 0) (local.get $l)) (local.get $u)))

(func $bw_start)
(func $bw_begin (param $p i32) (param $d i32))

;; What's under (x, z) on bank d no higher than y. On the stage two levels:
;; the surface (the approach, a lane, its deck) and under it the gutters'
;; floor, which is the floor of the gutter strips past the foul line, so a
;; ball sunk into a gutter stays at its level till push eases it into the
;; channel. A lane's deck while it's down has neither; nor has the pit.
(func $bw_ground (param $d i32) (param $x f32) (param $y f32) (param $z f32) (result f32)
  (local $l i32) (local $u f32) (local $top f32)
  (if (i32.or (f32.lt (local.get $x) (f32.load offset=@(PG_H + BW_XA) (local.get $d)))
              (f32.ge (local.get $x) (f32.load offset=@(PG_H + BW_XE) (local.get $d))))
    (then (return (f32.const -1000))))
  (call $bw_lane (local.get $d) (local.get $z))
  (local.set $u) (local.set $l)
  (local.set $top (f32.const @PLAT_Y))
  (if (f32.gt (f32.abs (local.get $u)) (f32.const @(BW_LW / 2)))
    (then
      (if (f32.ge (local.get $x) (f32.load offset=@(PG_H + BW_XF) (local.get $d)))
        (then (local.set $top (f32.const @(+PLAT_Y - BW_GD))))))
    (else
      (if (f32.ge (local.get $x) (f32.load offset=@(PG_H + BW_XD) (local.get $d)))
        (then
          (if (call $bw_down (local.get $l) (i32.load offset=@HDR_TICK (local.get $d)))
            (then (return (f32.const -1000))))))))
  (if (f32.le (local.get $top) (local.get $y)) (then (return (local.get $top))))
  (select (f32.const @(+PLAT_Y - BW_GD)) (f32.const -1000) (f32.le (f32.const @(+PLAT_Y - BW_GD)) (local.get $y))))

;; Ball p after its roll on bank d: held off the dividers either side, the
;; approach's back and the pit's back wall (BW_WE). In a gutter (its bottom
;; between the surface less BW_GIN and the gutters' floor, short of the lip,
;; not falling through a deck that's down) it's eased out from the lane's
;; side into the channel (and on from the foul line's end) BW_SOFT a tick,
;; its speed into them gone and its way across damped, marked in its PG_M
;; (an FX on its bank as it drops in). Under the gutters' floor nothing
;; holds it: it falls into the pit at BW_SINKV at least. Writes only its
;; record and bank d's FX.
(func $bw_push (param $p i32) (param $d i32)
  (local $pb i32) (local $l i32) (local $m i32) (local $in i32) (local $ch i32)
  (local $px f32) (local $py f32) (local $pz f32) (local $vx f32) (local $vy f32) (local $vz f32) (local $r f32)
  (local $u f32) (local $s f32) (local $au f32) (local $vu f32) (local $lim f32) (local $xf f32)
  (local.set $pb (i32.add (i32.shl (local.get $p) (i32.const 6)) (local.get $d)))
  (if (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @PF_DEAD)) (then (return)))
  (local.set $px (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
  (local.set $py (!at f32 @(PLAYERS + P_PY) (local.get $pb)))
  (local.set $pz (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
  (local.set $vx (!at f32 @(PLAYERS + P_VX) (local.get $pb)))
  (local.set $vy (!at f32 @(PLAYERS + P_VY) (local.get $pb)))
  (local.set $vz (!at f32 @(PLAYERS + P_VZ) (local.get $pb)))
  (local.set $r (call $b_rad (local.get $pb)))
  (local.set $xf (f32.load offset=@(PG_H + BW_XF) (local.get $d)))
  (call $bw_lane (local.get $d) (local.get $pz))
  (local.set $u) (local.set $l)
  ;; across, outward from the lane's middle
  (local.set $s (f32.copysign (f32.const 1) (local.get $u)))
  (local.set $au (f32.abs (local.get $u)))
  (local.set $vu (f32.mul (local.get $vz) (local.get $s)))
  ;; the divider's face
  (local.set $lim (f32.sub (f32.const @(BW_LW / 2 + BW_GW)) (local.get $r)))
  (if (f32.gt (local.get $au) (local.get $lim))
    (then
      (local.set $au (local.get $lim))
      (local.set $ch (i32.const 1))
      (if (f32.gt (local.get $vu) (f32.const 0)) (then (local.set $vu (f32.mul (local.get $vu) (f32.const @(-BW_WE))))))))
  ;; the approach's back, the pit's back wall
  (local.set $lim (f32.add (f32.load offset=@(PG_H + BW_XA) (local.get $d)) (local.get $r)))
  (if (f32.lt (local.get $px) (local.get $lim))
    (then
      (local.set $px (local.get $lim))
      (if (f32.lt (local.get $vx) (f32.const 0)) (then (local.set $vx (f32.mul (local.get $vx) (f32.const @(-BW_WE))))))))
  (local.set $lim (f32.sub (f32.load offset=@(PG_H + BW_XB) (local.get $d)) (local.get $r)))
  (if (f32.gt (local.get $px) (local.get $lim))
    (then
      (local.set $px (local.get $lim))
      (if (f32.gt (local.get $vx) (f32.const 0)) (then (local.set $vx (f32.mul (local.get $vx) (f32.const @(-BW_WE))))))))
  ;; a gutter
  (if (i32.and (i32.and (f32.lt (local.get $py) (f32.const @(+PLAT_Y - BW_GIN)))
                        (f32.ge (local.get $py) (f32.const @(+PLAT_Y - BW_GD - 0.1))))
               (f32.lt (local.get $px) (f32.load offset=@(PG_H + BW_XE) (local.get $d))))
    (then
      (local.set $in (i32.const 1))
      (if (i32.and (f32.le (local.get $au) (f32.const @(BW_LW / 2)))
                   (f32.ge (local.get $px) (f32.load offset=@(PG_H + BW_XD) (local.get $d))))
        (then (if (call $bw_down (local.get $l) (i32.load offset=@HDR_TICK (local.get $d))) (then (local.set $in (i32.const 0))))))))
  (if (local.get $in)
    (then
      (local.set $lim (f32.add (f32.const @(BW_LW / 2)) (local.get $r)))
      (if (f32.lt (local.get $au) (local.get $lim))
        (then
          (local.set $au (f32.min (local.get $lim) (f32.add (local.get $au) (f32.const @BW_SOFT))))
          (local.set $ch (i32.const 1))
          (if (f32.lt (local.get $vu) (f32.const 0)) (then (local.set $vu (f32.const 0))))))
      (local.set $vu (f32.mul (local.get $vu) (f32.const @BW_GDAMP)))
      (local.set $lim (f32.add (local.get $xf) (local.get $r)))
      (if (f32.lt (local.get $px) (local.get $lim))
        (then
          (local.set $px (f32.min (local.get $lim) (f32.add (local.get $px) (f32.const @BW_SOFT))))
          (if (f32.lt (local.get $vx) (f32.const 0)) (then (local.set $vx (f32.const 0))))))))
  (local.set $m (!at i32 @(PLAYERS + PG_M) (local.get $pb)))
  (if (i32.and (local.get $in) (i32.eqz (i32.and (local.get $m) (i32.const @BW_M_GUTTER))))
    (then (call $fx (local.get $d) (i32.const @BW_FX_GUTTER) (local.get $p) (local.get $l) (local.get $px) (local.get $py) (local.get $pz) (f32.const 0))))
  (!put i32 @(PLAYERS + PG_M) (local.get $pb) (i32.or (i32.and (local.get $m) (i32.const @(~BW_M_GUTTER))) (local.get $in)))
  ;; nothing under the gutters' floor: down into the pit
  (if (f32.lt (local.get $py) (f32.const @(+PLAT_Y - BW_GD - 0.1)))
    (then (local.set $vy (f32.min (local.get $vy) (f32.const @(-BW_SINKV))))))
  (if (local.get $ch)
    (then
      (local.set $pz (f32.add (f32.sub (local.get $pz) (local.get $u)) (f32.mul (local.get $s) (local.get $au))))))
  (local.set $vz (f32.mul (local.get $vu) (local.get $s)))
  (!chk (local.get $px) 450 (local.get $p))
  (!chk (local.get $pz) 451 (local.get $p))
  (!chk (local.get $vx) 452 (local.get $p))
  (!chk (local.get $vy) 453 (local.get $p))
  (!chk (local.get $vz) 454 (local.get $p))
  (!put f32 @(PLAYERS + P_PX) (local.get $pb) (local.get $px))
  (!put f32 @(PLAYERS + P_PZ) (local.get $pb) (local.get $pz))
  (!put f32 @(PLAYERS + P_VX) (local.get $pb) (local.get $vx))
  (!put f32 @(PLAYERS + P_VY) (local.get $pb) (local.get $vy))
  (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (local.get $vz)))

;; ---- the pins, the confirmed world's

;; Slot p's score plus k, at most 65535.
(func $bw_add (param $p i32) (param $k i32)
  (local $pb i32)
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (!put u16 @(PLAYERS + PG_SCORE) (local.get $pb)
    (select (i32.const 65535) (i32.add (!at u16 @(PLAYERS + PG_SCORE) (local.get $pb)) (local.get $k))
            (i32.gt_u (i32.add (!at u16 @(PLAYERS + PG_SCORE) (local.get $pb)) (local.get $k)) (i32.const 65535)))))

;; A fresh ten on lane l on tick t (0 as the round is laid out: no FX),
;; standing on their spots; in one rack in BW_GOLDP one of them, never the
;; head pin, golden, the round's seed's pick for the lane and its rack (so
;; laying the round out leaves the room's PRNG as it was). The lane's clock
;; cleared.
(func $bw_rack (param $l i32) (param $t i32)
  (local $la i32) (local $k i32) (local $pa i32) (local $gold i32) (local $h i32) (local $xh f32) (local $zc f32) (local $dx f32) (local $dz f32)
  (local.set $la (call $bw_la (local.get $l)))
  (local.set $h (call $p_seed (i32.add (i32.const @BW_KGOLD) (i32.or (i32.shl (local.get $l) (i32.const 12)) (i32.load16_u offset=@BW_L_RACKS (local.get $la))))))
  (local.set $gold (i32.const 255))
  (if (i32.eqz (i32.rem_u (local.get $h) (i32.const @BW_GOLDP)))
    (then (local.set $gold (i32.add (i32.rem_u (i32.shr_u (local.get $h) (i32.const 8)) (i32.const 9)) (i32.const 1)))))
  (i32.store offset=@BW_L_CALL (local.get $la) (i32.const 0))
  (i32.store offset=@BW_L_FIRST (local.get $la) (i32.const 0))
  (i32.store offset=@BW_L_RACK (local.get $la) (local.get $t))
  (i32.store16 offset=@BW_L_RACKS (local.get $la) (i32.add (i32.load16_u offset=@BW_L_RACKS (local.get $la)) (i32.const 1)))
  (i32.store8 offset=@BW_L_MOVE (local.get $la) (i32.const 0))
  (i32.store8 offset=@BW_L_GOLD (local.get $la) (local.get $gold))
  (local.set $xh (f32.load (i32.const @(PG_H + BW_XH))))
  (local.set $zc (call $bw_zc (i32.const 0) (local.get $l)))
  (!for $k (i32.const 0) (i32.const 10)
    (local.set $pa (call $bw_pa (local.get $l) (local.get $k)))
    (call $bw_spot (local.get $k))
    (local.set $dz) (local.set $dx)
    (i32.store8 offset=@BW_P_ST (local.get $pa) (i32.const @BW_UP))
    (i32.store8 offset=@BW_P_BY (local.get $pa) (i32.const 255))
    (i32.store8 offset=@BW_P_CR (local.get $pa) (i32.const 255))
    (i32.store8 offset=@BW_P_GOLD (local.get $pa) (i32.eq (local.get $k) (local.get $gold)))
    (i32.store offset=@BW_P_AT (local.get $pa) (i32.const 0))
    (f32.store offset=@BW_P_X (local.get $pa) (f32.add (local.get $xh) (local.get $dx)))
    (f32.store offset=@BW_P_Z (local.get $pa) (f32.add (local.get $zc) (local.get $dz)))
    (f32.store offset=@BW_P_VX (local.get $pa) (f32.const 0))
    (f32.store offset=@BW_P_VZ (local.get $pa) (f32.const 0))
    (f32.store offset=@BW_P_UX (local.get $pa) (f32.const 1))
    (f32.store offset=@BW_P_UZ (local.get $pa) (f32.const 0)))
  (if (local.get $t)
    (then (call $fx (i32.const 0) (i32.const @BW_FX_LANE) (i32.const 255) (i32.or (local.get $l) (i32.const @(BW_WRACK << 8)))
                    (local.get $xh) (f32.const @PLAT_Y) (local.get $zc) (f32.convert_i32_u (i32.load16_u offset=@BW_L_RACKS (local.get $la)))))))

;; Lane l called on tick t, or its deck dropping (what BW_W*): an FX over
;; its head pin's spot.
(func $bw_say (param $l i32) (param $what i32)
  (call $fx (i32.const 0) (i32.const @BW_FX_LANE) (i32.const 255) (i32.or (local.get $l) (i32.shl (local.get $what) (i32.const 8)))
            (f32.load (i32.const @(PG_H + BW_XH))) (f32.const @PLAT_Y) (call $bw_zc (i32.const 0) (local.get $l))
            (f32.convert_i32_u (i32.load16_u offset=@BW_L_RACKS (call $bw_la (local.get $l))))))

;; Lane l's deck drops on tick t: every pin still on the lane drops through it.
(func $bw_sweep (param $l i32) (param $t i32)
  (local $k i32) (local $pa i32) (local $st i32)
  (!for $k (i32.const 0) (i32.const 10)
    (local.set $pa (call $bw_pa (local.get $l) (local.get $k)))
    (local.set $st (i32.load8_u offset=@BW_P_ST (local.get $pa)))
    (if (i32.or (i32.eq (local.get $st) (i32.const @BW_UP)) (i32.eq (local.get $st) (i32.const @BW_HIT)))
      (then
        (i32.store8 offset=@BW_P_ST (local.get $pa) (i32.const @BW_DROP))
        (i32.store offset=@BW_P_AT (local.get $pa) (local.get $t))
        (f32.store offset=@BW_P_VX (local.get $pa) (f32.const 0))
        (f32.store offset=@BW_P_VZ (local.get $pa) (f32.const 0)))))
  (i32.store8 offset=@BW_L_MOVE (call $bw_la (local.get $l)) (i32.const 0))
  (call $bw_say (local.get $l) (i32.const @BW_WSWEEP)))

;; Pin k of lane l knocked on tick t by slot by, sent off at (vx, vz) turned
;; up to BW_SPREAD either way, at most BW_PVMAX: it falls the way it goes.
;; Unless the lane is called its point (BW_GOLD a golden one, times mult) is
;; its knocker's, and the rack's first starts the lane's clock.
(func $bw_knock (param $l i32) (param $k i32) (param $by i32) (param $vx f32) (param $vz f32) (param $t i32) (param $mult i32)
  (local $pa i32) (local $la i32) (local $sa i32) (local $pts i32)
  (local $s f32) (local $c f32) (local $wx f32) (local $wz f32) (local $sp f32)
  (local.set $pa (call $bw_pa (local.get $l) (local.get $k)))
  (local.set $la (call $bw_la (local.get $l)))
  (call $sincos (i32.and (i32.sub (i32.rem_u (call $rand) (i32.const @(2 * BW_SPREAD + 1))) (i32.const @BW_SPREAD)) (i32.const 16383)))
  (local.set $c) (local.set $s)
  (local.set $wx (f32.sub (f32.mul (local.get $vx) (local.get $c)) (f32.mul (local.get $vz) (local.get $s))))
  (local.set $wz (!madd (local.get $vx) (local.get $s) (f32.mul (local.get $vz) (local.get $c))))
  (local.set $sp (f32.sqrt (!madd (local.get $wx) (local.get $wx) (f32.mul (local.get $wz) (local.get $wz)))))
  (if (f32.gt (local.get $sp) (f32.const @BW_PVMAX))
    (then
      (local.set $wx (f32.mul (local.get $wx) (f32.div (f32.const @BW_PVMAX) (local.get $sp))))
      (local.set $wz (f32.mul (local.get $wz) (f32.div (f32.const @BW_PVMAX) (local.get $sp))))
      (local.set $sp (f32.const @BW_PVMAX))))
  (!chk (local.get $wx) 455 (local.get $k))
  (!chk (local.get $wz) 456 (local.get $k))
  (i32.store8 offset=@BW_P_ST (local.get $pa) (i32.const @BW_HIT))
  (i32.store8 offset=@BW_P_BY (local.get $pa) (local.get $by))
  (i32.store8 offset=@BW_P_CR (local.get $pa) (local.get $by))
  (i32.store offset=@BW_P_AT (local.get $pa) (local.get $t))
  (f32.store offset=@BW_P_VX (local.get $pa) (local.get $wx))
  (f32.store offset=@BW_P_VZ (local.get $pa) (local.get $wz))
  (if (f32.gt (local.get $sp) (f32.const 0.001))
    (then
      (f32.store offset=@BW_P_UX (local.get $pa) (f32.div (local.get $wx) (local.get $sp)))
      (f32.store offset=@BW_P_UZ (local.get $pa) (f32.div (local.get $wz) (local.get $sp)))))
  (i32.store8 offset=@BW_L_MOVE (local.get $la) (i32.or (i32.load8_u offset=@BW_L_MOVE (local.get $la)) (i32.const 1)))
  (if (i32.load offset=@BW_L_CALL (local.get $la))
    (then
      (call $fx (i32.const 0) (i32.const @BW_FX_KNOCK) (local.get $by) (i32.or (i32.shl (local.get $l) (i32.const 4)) (local.get $k))
                (f32.load offset=@BW_P_X (local.get $pa)) (f32.const @(+PLAT_Y + 0.8)) (f32.load offset=@BW_P_Z (local.get $pa)) (f32.const 0))
      (return)))
  (if (i32.eqz (i32.load offset=@BW_L_FIRST (local.get $la))) (then (i32.store offset=@BW_L_FIRST (local.get $la) (local.get $t))))
  (local.set $pts (i32.mul (select (i32.const @BW_GOLD) (i32.const 1) (i32.load8_u offset=@BW_P_GOLD (local.get $pa))) (local.get $mult)))
  (if (i32.lt_u (local.get $by) (i32.const @NPLAYER))
    (then
      (if (i32.and (!at u8 @(PLAYERS + P_FL) (i32.shl (local.get $by) (i32.const 6))) (i32.const @PF_LIVE))
        (then
          (call $bw_add (local.get $by) (local.get $pts))
          (local.set $sa (call $bw_sa (local.get $by)))
          (i32.store16 offset=@BW_S_PINS (local.get $sa) (i32.add (i32.load16_u offset=@BW_S_PINS (local.get $sa)) (i32.const 1)))
          (if (i32.lt_u (i32.load8_u offset=@BW_S_ROLL (local.get $sa)) (i32.const 255))
            (then (i32.store8 offset=@BW_S_ROLL (local.get $sa) (i32.add (i32.load8_u offset=@BW_S_ROLL (local.get $sa)) (i32.const 1)))))))))
  (call $fx (i32.const 0) (i32.const @BW_FX_KNOCK) (local.get $by) (i32.or (i32.shl (local.get $l) (i32.const 4)) (local.get $k))
            (f32.load offset=@BW_P_X (local.get $pa)) (f32.const @(+PLAT_Y + 0.8)) (f32.load offset=@BW_P_Z (local.get $pa)) (f32.convert_i32_u (local.get $pts))))

;; Ball p, on a live roll, among lane l's pins on tick t: each standing one
;; its edge reaches is put out to touching and knocked off along the line
;; between them at 1 + BW_E of the speed it closes at (BW_KMIN at least),
;; with BW_CARRY of the ball's speed across that line; a knocked one it
;; closes on is shoved on the same way (at most BW_PVMAX), its knocks the
;; ball's now. The ball is never moved.
(func $bw_meet (param $p i32) (param $l i32) (param $t i32) (param $mult i32)
  (local $pb i32) (local $k i32) (local $pa i32) (local $st i32) (local $la i32)
  (local $bx f32) (local $bz f32) (local $bvx f32) (local $bvz f32) (local $rr f32)
  (local $dx f32) (local $dz f32) (local $d f32) (local $nx f32) (local $nz f32) (local $bn f32) (local $vn f32) (local $q f32) (local $sp f32)
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (local.set $la (call $bw_la (local.get $l)))
  (local.set $bx (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
  (local.set $bz (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
  (local.set $bvx (!at f32 @(PLAYERS + P_VX) (local.get $pb)))
  (local.set $bvz (!at f32 @(PLAYERS + P_VZ) (local.get $pb)))
  (local.set $rr (f32.add (call $b_rad (local.get $pb)) (f32.const @BW_PR)))
  (!for $k (i32.const 0) (i32.const 10)
    (local.set $pa (call $bw_pa (local.get $l) (local.get $k)))
    (local.set $st (i32.load8_u offset=@BW_P_ST (local.get $pa)))
    (if (i32.or (i32.eq (local.get $st) (i32.const @BW_UP)) (i32.eq (local.get $st) (i32.const @BW_HIT)))
      (then
        (local.set $dx (f32.sub (f32.load offset=@BW_P_X (local.get $pa)) (local.get $bx)))
        (local.set $dz (f32.sub (f32.load offset=@BW_P_Z (local.get $pa)) (local.get $bz)))
        (local.set $d (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))))
        (if (f32.lt (local.get $d) (f32.mul (local.get $rr) (local.get $rr)))
          (then
            (local.set $d (f32.sqrt (local.get $d)))
            (if (f32.gt (local.get $d) (f32.const 0.001))
              (then (local.set $nx (f32.div (local.get $dx) (local.get $d))) (local.set $nz (f32.div (local.get $dz) (local.get $d))))
              (else (local.set $nx (f32.const 1)) (local.set $nz (f32.const 0))))
            ;; the ball's speed along the line, and how fast it closes on the pin
            (local.set $bn (!madd (local.get $bvx) (local.get $nx) (f32.mul (local.get $bvz) (local.get $nz))))
            (local.set $vn (f32.sub (local.get $bn) (!madd (f32.load offset=@BW_P_VX (local.get $pa)) (local.get $nx)
                                                           (f32.mul (f32.load offset=@BW_P_VZ (local.get $pa)) (local.get $nz)))))
            (f32.store offset=@BW_P_X (local.get $pa) (!madd (local.get $nx) (f32.add (local.get $rr) (f32.const 0.005)) (local.get $bx)))
            (f32.store offset=@BW_P_Z (local.get $pa) (!madd (local.get $nz) (f32.add (local.get $rr) (f32.const 0.005)) (local.get $bz)))
            (if (i32.or (i32.eq (local.get $st) (i32.const @BW_UP)) (f32.gt (local.get $vn) (f32.const 0)))
              (then
                (local.set $q (f32.max (f32.mul (local.get $vn) (f32.const @(1 + BW_E))) (f32.const @BW_KMIN)))
                (local.set $dx (!madd (local.get $nx) (local.get $q) (f32.mul (f32.sub (local.get $bvx) (f32.mul (local.get $nx) (local.get $bn))) (f32.const @BW_CARRY))))
                (local.set $dz (!madd (local.get $nz) (local.get $q) (f32.mul (f32.sub (local.get $bvz) (f32.mul (local.get $nz) (local.get $bn))) (f32.const @BW_CARRY))))
                (if (i32.eq (local.get $st) (i32.const @BW_UP))
                  (then (call $bw_knock (local.get $l) (local.get $k) (local.get $p) (local.get $dx) (local.get $dz) (local.get $t) (local.get $mult)))
                  (else
                    (local.set $sp (f32.sqrt (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz)))))
                    (if (f32.gt (local.get $sp) (f32.const @BW_PVMAX))
                      (then
                        (local.set $dx (f32.mul (local.get $dx) (f32.div (f32.const @BW_PVMAX) (local.get $sp))))
                        (local.set $dz (f32.mul (local.get $dz) (f32.div (f32.const @BW_PVMAX) (local.get $sp))))))
                    (f32.store offset=@BW_P_VX (local.get $pa) (local.get $dx))
                    (f32.store offset=@BW_P_VZ (local.get $pa) (local.get $dz))
                    (i32.store8 offset=@BW_P_CR (local.get $pa) (local.get $p))
                    (i32.store8 offset=@BW_L_MOVE (local.get $la) (i32.or (i32.load8_u offset=@BW_L_MOVE (local.get $la)) (i32.const 1)))))))))))))

;; Lane l's knocked pins on tick t. Each slides (BW_PROLL a tick, at rest
;; under BW_PSTOP), dropping into a gutter off the lane's surface or into
;; the pit past the lip; then each still moving or toppling knocks the
;; standing ones its body meets (a capsule from its foot along its fall,
;; BW_PH times the sine of its tilt long): off along the line at the speed it
;; closes at (BW_PKMIN at least), out to touching, its knocks the knocker's;
;; met at its foot it keeps BW_PKEEP of its own speed along that line. Then
;; the lane's count of pins moving or toppling.
(func $bw_pins (param $l i32) (param $t i32) (param $mult i32)
  (local $k i32) (local $j i32) (local $pa i32) (local $pj i32) (local $age i32) (local $n i32)
  (local $zc f32) (local $xe f32) (local $x f32) (local $z f32) (local $vx f32) (local $vz f32) (local $ux f32) (local $uz f32)
  (local $sn f32) (local $cs f32) (local $reach f32) (local $s f32) (local $dx f32) (local $dz f32) (local $d f32)
  (local $nx f32) (local $nz f32) (local $vn f32) (local $q f32)
  (local.set $zc (call $bw_zc (i32.const 0) (local.get $l)))
  (local.set $xe (f32.load (i32.const @(PG_H + BW_XE))))
  (!for $k (i32.const 0) (i32.const 10)
    (local.set $pa (call $bw_pa (local.get $l) (local.get $k)))
    (if (i32.eq (i32.load8_u offset=@BW_P_ST (local.get $pa)) (i32.const @BW_HIT))
      (then
        (local.set $vx (f32.mul (f32.load offset=@BW_P_VX (local.get $pa)) (f32.const @BW_PROLL)))
        (local.set $vz (f32.mul (f32.load offset=@BW_P_VZ (local.get $pa)) (f32.const @BW_PROLL)))
        (if (f32.lt (!madd (local.get $vx) (local.get $vx) (f32.mul (local.get $vz) (local.get $vz))) (f32.const @(BW_PSTOP * BW_PSTOP)))
          (then (local.set $vx (f32.const 0)) (local.set $vz (f32.const 0))))
        (local.set $x (!madd (local.get $vx) (f32.const @DT) (f32.load offset=@BW_P_X (local.get $pa))))
        (local.set $z (!madd (local.get $vz) (f32.const @DT) (f32.load offset=@BW_P_Z (local.get $pa))))
        (!chk (local.get $x) 457 (local.get $k))
        (!chk (local.get $z) 458 (local.get $k))
        (f32.store offset=@BW_P_X (local.get $pa) (local.get $x))
        (f32.store offset=@BW_P_Z (local.get $pa) (local.get $z))
        (f32.store offset=@BW_P_VX (local.get $pa) (local.get $vx))
        (f32.store offset=@BW_P_VZ (local.get $pa) (local.get $vz))
        (if (i32.or (f32.gt (f32.abs (f32.sub (local.get $z) (local.get $zc))) (f32.const @(BW_LW / 2))) (f32.ge (local.get $x) (local.get $xe)))
          (then
            (i32.store8 offset=@BW_P_ST (local.get $pa) (i32.const @BW_DROP))
            (i32.store offset=@BW_P_AT (local.get $pa) (local.get $t)))))))
  (!for $k (i32.const 0) (i32.const 10)
    (local.set $pa (call $bw_pa (local.get $l) (local.get $k)))
    (if (i32.eq (i32.load8_u offset=@BW_P_ST (local.get $pa)) (i32.const @BW_HIT))
      (then
        (local.set $age (i32.sub (local.get $t) (i32.load offset=@BW_P_AT (local.get $pa))))
        (local.set $vx (f32.load offset=@BW_P_VX (local.get $pa)))
        (local.set $vz (f32.load offset=@BW_P_VZ (local.get $pa)))
        (if (i32.or (i32.lt_u (local.get $age) (i32.const @BW_TIP))
                    (i32.or (f32.ne (local.get $vx) (f32.const 0)) (f32.ne (local.get $vz) (f32.const 0))))
          (then
            ;; its body: a quarter turn over BW_TIP
            (call $sincos (i32.div_u (i32.mul (select (local.get $age) (i32.const @BW_TIP) (i32.lt_u (local.get $age) (i32.const @BW_TIP))) (i32.const 4096))
                                     (i32.const @BW_TIP)))
            (local.set $cs) (local.set $sn)
            (local.set $reach (f32.mul (local.get $sn) (f32.const @BW_PH)))
            (local.set $x (f32.load offset=@BW_P_X (local.get $pa)))
            (local.set $z (f32.load offset=@BW_P_Z (local.get $pa)))
            (local.set $ux (f32.load offset=@BW_P_UX (local.get $pa)))
            (local.set $uz (f32.load offset=@BW_P_UZ (local.get $pa)))
            (!for $j (i32.const 0) (i32.const 10)
              (local.set $pj (call $bw_pa (local.get $l) (local.get $j)))
              (if (i32.eq (i32.load8_u offset=@BW_P_ST (local.get $pj)) (i32.const @BW_UP))
                (then
                  (local.set $dx (f32.sub (f32.load offset=@BW_P_X (local.get $pj)) (local.get $x)))
                  (local.set $dz (f32.sub (f32.load offset=@BW_P_Z (local.get $pj)) (local.get $z)))
                  (local.set $s (!clamp (!madd (local.get $dx) (local.get $ux) (f32.mul (local.get $dz) (local.get $uz))) (f32.const 0) (local.get $reach)))
                  (local.set $dx (f32.sub (local.get $dx) (f32.mul (local.get $ux) (local.get $s))))
                  (local.set $dz (f32.sub (local.get $dz) (f32.mul (local.get $uz) (local.get $s))))
                  (local.set $d (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))))
                  (if (f32.lt (local.get $d) (f32.const @(4 * BW_PR * BW_PR)))
                    (then
                      (local.set $d (f32.sqrt (local.get $d)))
                      (if (f32.gt (local.get $d) (f32.const 0.001))
                        (then (local.set $nx (f32.div (local.get $dx) (local.get $d))) (local.set $nz (f32.div (local.get $dz) (local.get $d))))
                        (else (local.set $nx (local.get $ux)) (local.set $nz (local.get $uz))))
                      (local.set $vn (!madd (local.get $vx) (local.get $nx) (f32.mul (local.get $vz) (local.get $nz))))
                      (if (i32.and (f32.le (local.get $s) (f32.const 0)) (f32.gt (local.get $vn) (f32.const 0)))
                        (then
                          (local.set $vx (f32.sub (local.get $vx) (f32.mul (local.get $nx) (f32.mul (local.get $vn) (f32.const @(1 - BW_PKEEP))))))
                          (local.set $vz (f32.sub (local.get $vz) (f32.mul (local.get $nz) (f32.mul (local.get $vn) (f32.const @(1 - BW_PKEEP))))))
                          (f32.store offset=@BW_P_VX (local.get $pa) (local.get $vx))
                          (f32.store offset=@BW_P_VZ (local.get $pa) (local.get $vz))))
                      (local.set $q (f32.max (local.get $vn) (f32.const @BW_PKMIN)))
                      (f32.store offset=@BW_P_X (local.get $pj) (!madd (local.get $nx) (f32.const @(2 * BW_PR + 0.005)) (!madd (local.get $ux) (local.get $s) (local.get $x))))
                      (f32.store offset=@BW_P_Z (local.get $pj) (!madd (local.get $nz) (f32.const @(2 * BW_PR + 0.005)) (!madd (local.get $uz) (local.get $s) (local.get $z))))
                      (call $bw_knock (local.get $l) (local.get $j) (i32.load8_u offset=@BW_P_CR (local.get $pa))
                                      (f32.mul (local.get $nx) (local.get $q)) (f32.mul (local.get $nz) (local.get $q)) (local.get $t) (local.get $mult))))))))))))
  (!for $k (i32.const 0) (i32.const 10)
    (local.set $pa (call $bw_pa (local.get $l) (local.get $k)))
    (if (i32.eq (i32.load8_u offset=@BW_P_ST (local.get $pa)) (i32.const @BW_HIT))
      (then
        (if (i32.or (i32.lt_u (i32.sub (local.get $t) (i32.load offset=@BW_P_AT (local.get $pa))) (i32.const @BW_TIP))
                    (i32.or (f32.ne (f32.load offset=@BW_P_VX (local.get $pa)) (f32.const 0)) (f32.ne (f32.load offset=@BW_P_VZ (local.get $pa)) (f32.const 0))))
          (then (!inc $n))))))
  (i32.store8 offset=@BW_L_MOVE (call $bw_la (local.get $l)) (local.get $n)))

;; The round's world, a tick of it: double time called; each lane's clock (a
;; call BW_WAIT after its rack's first pin went, its deck dropping BW_SWEEP
;; after a call, a fresh rack BW_DOWN after that); in slot order the balls
;; coming back from the pit this tick queued with their lanes for spawn, and
;; each ball in: its lane, its roll (armed behind the foul line, its count
;; and gutter there cleared; live past it while it rolls on down the lane on
;; its surface), its gutter balls, and the pins a live roll meets; then the pins moving on each lane; then every lane
;; in play whose ten are all down is called, a strike paid first if one ball
;; knocked all ten.
(func $bw_tick
  (local $t i32) (local $tp i32) (local $mult i32) (local $nl i32) (local $l i32) (local $la i32) (local $c i32)
  (local $p i32) (local $pb i32) (local $sa i32) (local $fl i32) (local $live i32) (local $g i32) (local $q i32)
  (local $k i32) (local $n i32) (local $by i32) (local $same i32) (local $pa i32) (local $pts i32)
  (local $px f32) (local $u f32) (local $xf f32) (local $xh f32) (local $xe f32) (local $cx f32)
  (local.set $t (i32.load (i32.const @HDR_TICK)))
  (local.set $tp (call $p_t (i32.const 0)))
  (local.set $mult (select (i32.const 2) (i32.const 1) (i32.ge_u (local.get $tp) (i32.const @(BW_LEN - BW_DOUBLE)))))
  (local.set $nl (i32.load (i32.const @(PG_H + BW_NL))))
  (local.set $xf (f32.load (i32.const @(PG_H + BW_XF))))
  (local.set $xh (f32.load (i32.const @(PG_H + BW_XH))))
  (local.set $xe (f32.load (i32.const @(PG_H + BW_XE))))
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (if (i32.eq (local.get $tp) (i32.const @(BW_LEN - BW_DOUBLE)))
    (then (call $fx (i32.const 0) (i32.const @BW_FX_LANE) (i32.const 255) (i32.const @(255 | (BW_WDOUBLE << 8)))
                    (local.get $cx) (f32.const @PLAT_Y) (local.get $cx) (f32.const 0))))
  ;; the lanes' clocks
  (!for $l (i32.const 0) (local.get $nl)
    (local.set $la (call $bw_la (local.get $l)))
    (local.set $c (i32.load offset=@BW_L_CALL (local.get $la)))
    (if (local.get $c)
      (then
        (if (i32.eq (i32.sub (local.get $t) (local.get $c)) (i32.const @BW_SWEEP)) (then (call $bw_sweep (local.get $l) (local.get $t))))
        (if (i32.ge_u (i32.sub (local.get $t) (local.get $c)) (i32.const @(BW_SWEEP + BW_DOWN))) (then (call $bw_rack (local.get $l) (local.get $t)))))
      (else
        (local.set $c (i32.load offset=@BW_L_FIRST (local.get $la)))
        (if (i32.and (i32.ne (local.get $c) (i32.const 0)) (i32.ge_u (i32.sub (local.get $t) (local.get $c)) (i32.const @BW_WAIT)))
          (then
            (i32.store offset=@BW_L_CALL (local.get $la) (local.get $t))
            (call $bw_say (local.get $l) (i32.const @BW_WCALL))))))
    (i32.store8 offset=@BW_L_N (local.get $la) (i32.const 0)))
  ;; the balls, in slot order
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
    (local.set $fl (!at u8 @(PLAYERS + P_FL) (local.get $pb)))
    (local.set $sa (call $bw_sa (local.get $p)))
    ;; back from the pit this tick ($bumper's test, after this): its lane for spawn
    (if (i32.and (i32.eq (i32.and (local.get $fl) (i32.const @(PF_LIVE | PF_DEAD))) (i32.const @(PF_LIVE | PF_DEAD)))
                 (i32.ge_u (i32.sub (local.get $t) (!at i32 @(PLAYERS + B_OUTAT) (local.get $pb))) (i32.load (i32.const @PG_RESPAWN))))
      (then
        (i32.store8 offset=@(PG_S + BW_QUEUE) (local.get $q) (i32.load8_u offset=@BW_S_LANE (local.get $sa)))
        (!inc $q)))
    (if (call $p_in (local.get $pb))
      (then
        (local.set $px (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
        (call $bw_lane (i32.const 0) (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
        (local.set $u) (local.set $l)
        (local.set $la (call $bw_la (local.get $l)))
        (i32.store8 offset=@BW_S_LANE (local.get $sa) (local.get $l))
        (i32.store8 offset=@BW_L_N (local.get $la) (i32.add (i32.load8_u offset=@BW_L_N (local.get $la)) (i32.const 1)))
        (local.set $live (i32.load8_u offset=@BW_S_LIVE (local.get $sa)))
        (if (f32.lt (local.get $px) (local.get $xf))
          (then
            (local.set $live (i32.const 1))
            (i32.store16 offset=@BW_S_ROLL (local.get $sa) (i32.const 0)))
          (else
            (if (i32.or (f32.lt (!at f32 @(PLAYERS + P_VX) (local.get $pb)) (f32.const @BW_VLIVE))
                        (f32.lt (!at f32 @(PLAYERS + P_PY) (local.get $pb)) (f32.const @(+PLAT_Y - BW_GIN))))
              (then (local.set $live (i32.const 0))))))
        (i32.store8 offset=@BW_S_LIVE (local.get $sa) (local.get $live))
        (local.set $g (i32.and (!at i32 @(PLAYERS + PG_M) (local.get $pb)) (i32.const @BW_M_GUTTER)))
        (if (i32.and (local.get $g) (i32.eqz (i32.load8_u offset=@BW_S_GUT (local.get $sa))))
          (then
            (i32.store8 offset=@BW_S_RGUT (local.get $sa) (i32.const 1))
            (i32.store8 offset=@BW_S_GUTTERS (local.get $sa)
              (select (i32.const 255) (i32.add (i32.load8_u offset=@BW_S_GUTTERS (local.get $sa)) (i32.const 1))
                      (i32.eq (i32.load8_u offset=@BW_S_GUTTERS (local.get $sa)) (i32.const 255))))))
        (i32.store8 offset=@BW_S_GUT (local.get $sa) (local.get $g))
        (if (i32.and (local.get $live)
                     (i32.and (f32.gt (local.get $px) (f32.sub (local.get $xh) (f32.const 2.5))) (f32.lt (local.get $px) (f32.add (local.get $xe) (f32.const 1)))))
          (then (call $bw_meet (local.get $p) (local.get $l) (local.get $t) (local.get $mult)))))))
  (i32.store (i32.const @(PG_S + BW_QN)) (local.get $q))
  (i32.store (i32.const @(PG_S + BW_QI)) (i32.const 0))
  (i32.store (i32.const @(PG_S + BW_QT)) (local.get $t))
  ;; the pins moving, lane by lane
  (!for $l (i32.const 0) (local.get $nl)
    (if (i32.load8_u offset=@BW_L_MOVE (call $bw_la (local.get $l)))
      (then (call $bw_pins (local.get $l) (local.get $t) (local.get $mult)))))
  ;; every lane in play with its ten down is called: all ten one ball's, a strike
  (!for $l (i32.const 0) (local.get $nl)
    (local.set $la (call $bw_la (local.get $l)))
    (if (i32.and (i32.eqz (i32.load offset=@BW_L_CALL (local.get $la))) (i32.ne (i32.load offset=@BW_L_FIRST (local.get $la)) (i32.const 0)))
      (then
        (local.set $n (i32.const 0))
        (local.set $same (i32.const 1))
        (local.set $by (i32.load8_u offset=@BW_P_BY (call $bw_pa (local.get $l) (i32.const 0))))
        (!for $k (i32.const 0) (i32.const 10)
          (local.set $pa (call $bw_pa (local.get $l) (local.get $k)))
          (if (i32.ne (i32.load8_u offset=@BW_P_ST (local.get $pa)) (i32.const @BW_UP)) (then (!inc $n)))
          (if (i32.ne (i32.load8_u offset=@BW_P_BY (local.get $pa)) (local.get $by)) (then (local.set $same (i32.const 0)))))
        (if (i32.eq (local.get $n) (i32.const 10))
          (then
            (if (i32.and (local.get $same) (i32.lt_u (local.get $by) (i32.const @NPLAYER)))
              (then
                (if (i32.and (!at u8 @(PLAYERS + P_FL) (i32.shl (local.get $by) (i32.const 6))) (i32.const @PF_LIVE))
                  (then
                    (local.set $pts (i32.mul (i32.const @BW_STRIKE) (local.get $mult)))
                    (call $bw_add (local.get $by) (local.get $pts))
                    (local.set $sa (call $bw_sa (local.get $by)))
                    (i32.store16 offset=@BW_S_STRIKES (local.get $sa) (i32.add (i32.load16_u offset=@BW_S_STRIKES (local.get $sa)) (i32.const 1)))
                    (i32.store16 offset=@BW_L_STRIKES (local.get $la) (i32.add (i32.load16_u offset=@BW_L_STRIKES (local.get $la)) (i32.const 1)))
                    (call $fx (i32.const 0) (i32.const @BW_FX_STRIKE) (local.get $by) (local.get $l)
                              (f32.add (local.get $xh) (f32.const @(1.5 * BW_ROW))) (f32.const @(+PLAT_Y + 1.5)) (call $bw_zc (i32.const 0) (local.get $l))
                              (f32.convert_i32_u (local.get $pts)))))))
            (i32.store offset=@BW_L_CALL (local.get $la) (local.get $t))
            (call $bw_say (local.get $l) (i32.const @BW_WCALL))))))))

(func $bw_over (result i32) (i32.const 0))
(func $bw_out (param $p i32))
