;; FALL BALL: red against blue (PGF_TEAMS) on a pitch over the void, red's
;; half at low x defending the goal there and blue's at high x, FA_A0 m² and
;; FA_AK more a ball (FA_AK2 past FA_NK), FA_ASP times as long as wide. The
;; ends are walls, each with a goal mouth FA_GWK of the width wide and a net
;; box FA_GD deep behind it; the sides are open over the void, but for kerbs
;; FA_BH high just outside them by the corners and the halfway line. Giant
;; balls, FA_R round and FA_M balls heavy, drop from FA_DROPY up: one on the
;; centre spot at the kickoff, one more every FA_ADD while fewer than the cap
;; are in play, a golden one worth FA_GOLDV at FA_GOLDT; one that goes (into a
;; goal, or off a side and FA_LOSTY down) is replaced FA_REDROP later. A ball
;; meets a giant one level: they're put apart by weight and swap 1 + FA_CE of
;; the speed they close at, by weight, so one ball barely moves it and a few
;; roll it on; one coming down throws whoever it lands on out. All the way
;; past a goal line in the mouth is a goal for the side attacking it
;; (PG_TSCORE), FA_PT_GOAL times its worth to that side's last toucher and
;; FA_PT_ASSIST to its others on it in the FA_ASSISTT before. A ball off the
;; pitch is down FA_DOWN, then drops back in on its own side; a foe it bumped
;; off is FA_PT_KO to the bumper. Most goals at the clock wins, or a draw.
;;
;; The giant balls are the confirmed world's, in PG_S, in the pitch's own
;; coordinates (x and z from its centre, the height of the centre over the
;; floor). Where one is depends on every ball that shoved it, so a ball meets
;; them in tick, as it meets another ball in a bump: a round trip late in the
;; prediction, which runs only the floor, the walls, the posts, the nets and
;; the kerbs, all fixed at setup. The page flies each giant ball on to the
;; prediction's tick as $fa_fly flies it, short of the balls.

;; A giant ball's record, and a slot's.
(func $fa_b (param $k i32) (result i32)
  (i32.add (i32.const @(PG_S + FA_BALL)) (i32.mul (local.get $k) (i32.const @FA_BSIZE))))
(func $fa_s (param $p i32) (result i32)
  (i32.add (i32.const @(PG_S + FA_SLOT)) (i32.mul (local.get $p) (i32.const @FA_SSIZE))))

;; Side s's way from the halfway line to its own goal: -1 red, 1 blue.
(func $fa_dir (param $s i32) (result f32)
  (select (f32.const 1) (f32.const -1) (local.get $s)))

;; The pitch for the crowd, its goals and kerbs, and the cap.
(func $fa_setup (param $n i32)
  (local $a f32) (local $hx f32) (local $hz f32) (local $cap i32)
  (local.set $a (!madd (f32.convert_i32_u (select (local.get $n) (i32.const @FA_NK) (i32.lt_u (local.get $n) (i32.const @FA_NK))))
                       (f32.const @FA_AK) (f32.const @FA_A0)))
  (if (i32.gt_u (local.get $n) (i32.const @FA_NK))
    (then (local.set $a (!madd (f32.convert_i32_u (i32.sub (local.get $n) (i32.const @FA_NK))) (f32.const @FA_AK2) (local.get $a)))))
  (local.set $hx (f32.mul (f32.sqrt (f32.mul (local.get $a) (f32.const @FA_ASP))) (f32.const 0.5)))
  (local.set $hz (f32.div (local.get $a) (f32.mul (local.get $hx) (f32.const 4))))
  (!chk (local.get $hz) 600 (local.get $n))
  (local.set $cap (i32.add (i32.div_u (i32.add (local.get $n) (i32.const @(FA_PER - 1))) (i32.const @FA_PER)) (i32.const 1)))
  (if (i32.lt_u (local.get $cap) (i32.const @FA_NMIN)) (then (local.set $cap (i32.const @FA_NMIN))))
  (if (i32.gt_u (local.get $cap) (i32.const @FA_NMAX)) (then (local.set $cap (i32.const @FA_NMAX))))
  (i32.store (i32.const @PG_KIND) (i32.const @PK_SCORE))
  (i32.store (i32.const @PG_LEN) (i32.const @FA_LEN))
  (i32.store (i32.const @PG_FLAGS) (i32.const @(PGF_BUMPS | PGF_TEAMS)))
  (i32.store (i32.const @PG_RESPAWN) (i32.const @FA_DOWN))
  (f32.store (i32.const @PG_ACC) (f32.const @FA_ACC))
  (f32.store (i32.const @PG_IDLE) (f32.const @FA_IDLE))
  (f32.store (i32.const @PG_SIZE) (f32.add (local.get $hx) (f32.const @FA_GD)))
  (f32.store (i32.const @(PG_H + FA_HX)) (local.get $hx))
  (f32.store (i32.const @(PG_H + FA_HZ)) (local.get $hz))
  (f32.store (i32.const @(PG_H + FA_GW)) (!clamp (f32.mul (local.get $hz) (f32.const @FA_GWK)) (f32.const @FA_GWMIN) (f32.const @FA_GWMAX)))
  (f32.store (i32.const @(PG_H + FA_BX0)) (f32.mul (local.get $hx) (f32.const @FA_BC0)))
  (f32.store (i32.const @(PG_H + FA_BX1)) (f32.mul (local.get $hx) (f32.const @FA_BC1)))
  (i32.store (i32.const @(PG_H + FA_CAP)) (local.get $cap)))

;; Place k of m on side s, world x and z: a grid over its half from FA_X0
;; off the halfway line to 2 m off its goal line, its cells about square, the
;; front row first. A k past m wraps.
(func $fa_form (param $s i32) (param $k i32) (param $m i32) (result f32 f32)
  (local $hz f32) (local $cx f32) (local $deep f32) (local $cols i32) (local $rows i32)
  (local.set $hz (f32.load (i32.const @(PG_H + FA_HZ))))
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (local.set $deep (f32.sub (f32.load (i32.const @(PG_H + FA_HX))) (f32.const @(FA_X0 + 2))))
  (if (i32.eqz (local.get $m)) (then (local.set $m (i32.const 1))))
  (local.set $k (i32.rem_u (local.get $k) (local.get $m)))
  (local.set $cols (i32.trunc_sat_f32_u (f32.nearest (f32.sqrt (f32.div (f32.mul (f32.convert_i32_u (local.get $m)) (f32.mul (local.get $hz) (f32.const 2))) (local.get $deep))))))
  (if (i32.eqz (local.get $cols)) (then (local.set $cols (i32.const 1))))
  (local.set $rows (i32.div_u (i32.add (local.get $m) (i32.sub (local.get $cols) (i32.const 1))) (local.get $cols)))
  (!madd (call $fa_dir (local.get $s))
         (!madd (local.get $deep) (f32.div (f32.add (f32.convert_i32_u (i32.div_u (local.get $k) (local.get $cols))) (f32.const 0.5)) (f32.convert_i32_u (local.get $rows))) (f32.const @FA_X0))
         (local.get $cx))
  (!madd (f32.sub (f32.div (f32.mul (f32.add (f32.convert_i32_u (i32.rem_u (local.get $k) (local.get $cols))) (f32.const 0.5)) (f32.const 2)) (f32.convert_i32_u (local.get $cols)))
                  (f32.const 1))
         (f32.mul (local.get $hz) (f32.const 0.8)) (local.get $cx)))

;; As the round is laid out, ball PG_TK of its side's PG_TN in its half's
;; grid; in play (back from down, or a newcomer), FA_BACK of the way to its
;; own goal line, k of 1024 across 0.75 of the width.
(func $fa_spawn (param $i i32) (param $n i32) (result f32 f32 f32)
  (local $s i32) (local $x f32) (local $z f32)
  (local.set $s (i32.load (i32.const @PG_TSIDE)))
  (if (i32.eq (i32.load (i32.const @HDR_STATE)) (i32.const @H_PLAY))
    (then
      (return
        (!madd (call $fa_dir (local.get $s)) (f32.mul (f32.load (i32.const @(PG_H + FA_HX))) (f32.const @FA_BACK)) (f32.load (i32.const @PG_CX)))
        (f32.const @PLAT_Y)
        (!madd (f32.sub (f32.mul (f32.convert_i32_u (i32.and (local.get $i) (i32.const 1023))) (f32.const @(2 / 1023))) (f32.const 1))
               (f32.mul (f32.load (i32.const @(PG_H + FA_HZ))) (f32.const 0.75)) (f32.load (i32.const @PG_CX))))))
  (call $fa_form (local.get $s) (i32.load (i32.const @PG_TK))
    (i32.and (i32.shr_u (i32.load (i32.const @PG_TN)) (i32.shl (local.get $s) (i32.const 4))) (i32.const 0xffff)))
  (local.set $z) (local.set $x)
  (local.get $x) (f32.const @PLAT_Y) (local.get $z))

;; The kickoff ball, dropping onto the centre spot; the next drop FA_ADD on.
(func $fa_start
  (call $fa_drop (i32.const 0) (i32.const 0) (i32.const 0) (i32.const 0))
  (i32.store (i32.const @(PG_H + FA_NEXT)) (i32.const @FA_ADD)))

(func $fa_begin (param $p i32) (param $d i32))

;; The floor under (x, z) no higher than y, on bank d: the pitch and the goal
;; boxes at PLAT_Y; a kerb's top FA_BH over it (under it, the floor: push
;; puts a ball off its side); nothing else.
(func $fa_ground (param $d i32) (param $x f32) (param $y f32) (param $z f32) (result f32)
  (local $ax f32) (local $az f32) (local $hx f32) (local $hz f32)
  (if (f32.lt (local.get $y) (f32.const @PLAT_Y)) (then (return (f32.const -1000))))
  (local.set $ax (f32.abs (f32.sub (local.get $x) (f32.load offset=@PG_CX (local.get $d)))))
  (local.set $az (f32.abs (f32.sub (local.get $z) (f32.load offset=@PG_CX (local.get $d)))))
  (local.set $hx (f32.load offset=@(PG_H + FA_HX) (local.get $d)))
  (local.set $hz (f32.load offset=@(PG_H + FA_HZ) (local.get $d)))
  (if (f32.le (local.get $ax) (local.get $hx))
    (then
      (if (f32.le (local.get $az) (local.get $hz)) (then (return (f32.const @PLAT_Y))))
      (if (i32.and (f32.le (local.get $az) (f32.add (local.get $hz) (f32.const @FA_BT)))
                   (i32.or (f32.ge (local.get $ax) (f32.load offset=@(PG_H + FA_BX0) (local.get $d)))
                           (f32.le (local.get $ax) (f32.load offset=@(PG_H + FA_BX1) (local.get $d)))))
        (then (return (select (f32.const @(+PLAT_Y + FA_BH)) (f32.const @PLAT_Y) (f32.ge (local.get $y) (f32.const @(+PLAT_Y + FA_BH)))))))
      (return (f32.const -1000))))
  (if (i32.and (f32.le (local.get $ax) (f32.add (local.get $hx) (f32.const @FA_GD)))
               (f32.lt (local.get $az) (f32.load offset=@(PG_H + FA_GW) (local.get $d))))
    (then (return (f32.const @PLAT_Y))))
  (f32.const -1000))

;; Ball p on bank d after its roll: off the end walls beside the mouths, a
;; goal box's side nets and back net, and the posts, at FA_PE; off a kerb's
;; side (FA_PE) unless its bottom is over the kerb's top. Worked a quarter of
;; the pitch at a time: x and z from the centre, by size.
(func $fa_push (param $p i32) (param $d i32)
  (local $pb i32) (local $ch i32)
  (local $r f32) (local $cx f32) (local $hx f32) (local $hz f32) (local $gw f32)
  (local $lx f32) (local $lz f32) (local $sx f32) (local $sz f32) (local $ax f32) (local $az f32)
  (local $vx f32) (local $vz f32) (local $h f32) (local $q f32) (local $dx f32) (local $dz f32) (local $dd f32)
  (local.set $pb (i32.add (i32.shl (local.get $p) (i32.const 6)) (local.get $d)))
  (local.set $r (call $b_rad (local.get $pb)))
  (local.set $cx (f32.load offset=@PG_CX (local.get $d)))
  (local.set $hx (f32.load offset=@(PG_H + FA_HX) (local.get $d)))
  (local.set $hz (f32.load offset=@(PG_H + FA_HZ) (local.get $d)))
  (local.set $gw (f32.load offset=@(PG_H + FA_GW) (local.get $d)))
  (local.set $lx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (local.get $cx)))
  (local.set $lz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $pb)) (local.get $cx)))
  (local.set $sx (f32.copysign (f32.const 1) (local.get $lx)))
  (local.set $sz (f32.copysign (f32.const 1) (local.get $lz)))
  (local.set $ax (f32.abs (local.get $lx)))
  (local.set $az (f32.abs (local.get $lz)))
  ;; the velocity outward, in this quarter
  (local.set $vx (f32.mul (!at f32 @(PLAYERS + P_VX) (local.get $pb)) (local.get $sx)))
  (local.set $vz (f32.mul (!at f32 @(PLAYERS + P_VZ) (local.get $pb)) (local.get $sz)))
  (local.set $h (f32.sub (!at f32 @(PLAYERS + P_PY) (local.get $pb)) (f32.const @PLAT_Y)))
  (if (i32.and (f32.gt (local.get $ax) (local.get $hx)) (f32.lt (local.get $az) (local.get $gw)))
    (then
      ;; in a goal's box: its side nets and its back net
      (if (f32.gt (local.get $az) (f32.sub (local.get $gw) (local.get $r)))
        (then (local.set $az (f32.sub (local.get $gw) (local.get $r))) (local.set $ch (i32.const 1))
              (if (f32.gt (local.get $vz) (f32.const 0)) (then (local.set $vz (f32.mul (local.get $vz) (f32.const @(-FA_PE))))))))
      (if (f32.gt (local.get $ax) (f32.sub (f32.add (local.get $hx) (f32.const @FA_GD)) (local.get $r)))
        (then (local.set $ax (f32.sub (f32.add (local.get $hx) (f32.const @FA_GD)) (local.get $r))) (local.set $ch (i32.const 1))
              (if (f32.gt (local.get $vx) (f32.const 0)) (then (local.set $vx (f32.mul (local.get $vx) (f32.const @(-FA_PE)))))))))
    (else
      (if (i32.or (f32.gt (local.get $ax) (local.get $hx))
                  (i32.and (f32.gt (local.get $ax) (f32.sub (local.get $hx) (local.get $r))) (f32.ge (local.get $az) (local.get $gw))))
        (then
          ;; the end wall beside the mouth (or behind it: back onto the pitch)
          (local.set $ax (f32.sub (local.get $hx) (local.get $r))) (local.set $ch (i32.const 1))
          (if (f32.gt (local.get $vx) (f32.const 0)) (then (local.set $vx (f32.mul (local.get $vx) (f32.const @(-FA_PE))))))))
      ;; a kerb, its bottom under the top: back in off its inside, or out off its outside
      (if (i32.and (f32.lt (local.get $h) (f32.const @FA_BH))
                   (i32.or (f32.ge (local.get $ax) (f32.load offset=@(PG_H + FA_BX0) (local.get $d)))
                           (f32.le (local.get $ax) (f32.load offset=@(PG_H + FA_BX1) (local.get $d)))))
        (then
          (if (i32.and (f32.gt (local.get $az) (f32.sub (local.get $hz) (local.get $r))) (f32.lt (local.get $az) (f32.add (local.get $hz) (f32.const @(FA_BT / 2)))))
            (then (local.set $az (f32.sub (local.get $hz) (local.get $r))) (local.set $ch (i32.const 1))
                  (if (f32.gt (local.get $vz) (f32.const 0)) (then (local.set $vz (f32.mul (local.get $vz) (f32.const @(-FA_PE))))))))
          (if (i32.and (f32.ge (local.get $az) (f32.add (local.get $hz) (f32.const @(FA_BT / 2)))) (f32.lt (local.get $az) (f32.add (f32.add (local.get $hz) (f32.const @FA_BT)) (local.get $r))))
            (then (local.set $az (f32.add (f32.add (local.get $hz) (f32.const @FA_BT)) (local.get $r))) (local.set $ch (i32.const 1))
                  (if (f32.lt (local.get $vz) (f32.const 0)) (then (local.set $vz (f32.mul (local.get $vz) (f32.const @(-FA_PE))))))))))))
  ;; the post, a circle on the floor
  (local.set $dx (f32.sub (local.get $ax) (local.get $hx)))
  (local.set $dz (f32.sub (local.get $az) (local.get $gw)))
  (local.set $dd (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))))
  (if (i32.and (f32.lt (local.get $dd) (f32.mul (f32.add (local.get $r) (f32.const @FA_FR)) (f32.add (local.get $r) (f32.const @FA_FR))))
               (f32.gt (local.get $dd) (f32.const 0)))
    (then
      (local.set $dd (f32.sqrt (local.get $dd)))
      (local.set $dx (f32.div (local.get $dx) (local.get $dd)))
      (local.set $dz (f32.div (local.get $dz) (local.get $dd)))
      (local.set $ax (!madd (local.get $dx) (f32.add (local.get $r) (f32.const @FA_FR)) (local.get $hx)))
      (local.set $az (!madd (local.get $dz) (f32.add (local.get $r) (f32.const @FA_FR)) (local.get $gw)))
      (local.set $ch (i32.const 1))
      (local.set $q (!madd (local.get $vx) (local.get $dx) (f32.mul (local.get $vz) (local.get $dz))))
      (if (f32.lt (local.get $q) (f32.const 0))
        (then
          (local.set $q (f32.mul (local.get $q) (f32.const @(1 + FA_PE))))
          (local.set $vx (f32.sub (local.get $vx) (f32.mul (local.get $q) (local.get $dx))))
          (local.set $vz (f32.sub (local.get $vz) (f32.mul (local.get $q) (local.get $dz))))))))
  (if (local.get $ch)
    (then
      (!chk (local.get $ax) 601 (local.get $p))
      (!chk (local.get $az) 602 (local.get $p))
      (!put f32 @(PLAYERS + P_PX) (local.get $pb) (!madd (local.get $sx) (local.get $ax) (local.get $cx)))
      (!put f32 @(PLAYERS + P_PZ) (local.get $pb) (!madd (local.get $sz) (local.get $az) (local.get $cx)))))
  (!put f32 @(PLAYERS + P_VX) (local.get $pb) (f32.mul (local.get $vx) (local.get $sx)))
  (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (f32.mul (local.get $vz) (local.get $sz))))

;; Giant ball k drops on tick t into play, golden or not: where (mode 0) on
;; the centre spot, (1) within 3 m of it, (2) anywhere a drop may land: in the
;; middle FA_DROPK of the length and FA_DROPM in from the sides, the first of
;; 8 tries FA_SEP from every other giant ball in play (else the last).
(func $fa_drop (param $k i32) (param $gold i32) (param $mode i32) (param $t i32)
  (local $b i32) (local $j i32) (local $c i32) (local $try i32) (local $ok i32) (local $st i32)
  (local $xr f32) (local $zr f32) (local $x f32) (local $z f32) (local $dx f32) (local $dz f32)
  (local.set $b (call $fa_b (local.get $k)))
  (if (local.get $mode)
    (then
      (local.set $xr (f32.const 3))
      (local.set $zr (f32.const 3))
      (if (i32.eq (local.get $mode) (i32.const 2))
        (then
          (local.set $xr (f32.mul (f32.load (i32.const @(PG_H + FA_HX))) (f32.const @FA_DROPK)))
          (local.set $zr (f32.max (f32.sub (f32.load (i32.const @(PG_H + FA_HZ))) (f32.const @FA_DROPM)) (f32.const 0)))))
      (block $found
        (!for $try (i32.const 0) (i32.const 8)
          (local.set $x (f32.mul (f32.sub (f32.mul (call $p_unit) (f32.const 2)) (f32.const 1)) (local.get $xr)))
          (local.set $z (f32.mul (f32.sub (f32.mul (call $p_unit) (f32.const 2)) (f32.const 1)) (local.get $zr)))
          (local.set $ok (i32.const 1))
          (!for $j (i32.const 0) (i32.const @(FA_NMAX + 1))
            (local.set $c (call $fa_b (local.get $j)))
            (local.set $st (i32.load8_u offset=@FA_FST (local.get $c)))
            (if (i32.and (i32.ne (local.get $j) (local.get $k)) (i32.or (i32.eq (local.get $st) (i32.const @FA_FALL)) (i32.eq (local.get $st) (i32.const @FA_LIVE))))
              (then
                (local.set $dx (f32.sub (f32.load offset=@FA_FX (local.get $c)) (local.get $x)))
                (local.set $dz (f32.sub (f32.load offset=@FA_FZ (local.get $c)) (local.get $z)))
                (if (f32.lt (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))) (f32.const @(FA_SEP * FA_SEP)))
                  (then (local.set $ok (i32.const 0)))))))
          (br_if $found (local.get $ok))))))
  (i32.store (i32.const @(PG_H + FA_SER)) (i32.add (i32.load (i32.const @(PG_H + FA_SER))) (i32.const 1)))
  (i32.store8 offset=@FA_FST (local.get $b) (i32.const @FA_FALL))
  (i32.store8 offset=@FA_FGOLD (local.get $b) (local.get $gold))
  (i32.store8 offset=@FA_FBY (local.get $b) (i32.const 255))
  (i32.store16 offset=@FA_FLAST (local.get $b) (i32.const 0xffff))
  (i32.store offset=@FA_FSER (local.get $b) (i32.load (i32.const @(PG_H + FA_SER))))
  (i32.store offset=@FA_FAT (local.get $b) (local.get $t))
  (f32.store offset=@FA_FX (local.get $b) (local.get $x))
  (f32.store offset=@FA_FY (local.get $b) (f32.const @FA_DROPY))
  (f32.store offset=@FA_FZ (local.get $b) (local.get $z))
  (f32.store offset=@FA_FVX (local.get $b) (f32.const 0))
  (f32.store offset=@FA_FVY (local.get $b) (f32.const 0))
  (f32.store offset=@FA_FVZ (local.get $b) (f32.const 0))
  (i64.store offset=@FA_FSAT (local.get $b) (i64.const 0))
  (call $fx (i32.const 0) (i32.const @FA_FX_DROP) (i32.const 255) (i32.or (local.get $k) (i32.shl (local.get $gold) (i32.const 8)))
            (f32.add (local.get $x) (f32.load (i32.const @PG_CX))) (f32.const @PLAT_Y) (f32.add (local.get $z) (f32.load (i32.const @PG_CX)))
            (f32.const @(FA_VMAX * DT / FA_G + (FA_DROPY - FA_R - FA_VMAX * FA_VMAX * DT / (2 * FA_G)) / FA_VMAX))))

;; Giant ball k gone on tick t: a golden one for good, any other replaced
;; FA_REDROP on (FA_WAIT till then).
(func $fa_gone (param $k i32) (param $t i32)
  (local $b i32)
  (local.set $b (call $fa_b (local.get $k)))
  (i32.store8 offset=@FA_FST (local.get $b)
    (select (i32.const @FA_NONE) (i32.const @FA_WAIT) (i32.load8_u offset=@FA_FGOLD (local.get $b))))
  (i32.store offset=@FA_FAT (local.get $b) (i32.add (local.get $t) (i32.const @FA_REDROP)))
  (f32.store offset=@FA_FVX (local.get $b) (f32.const 0))
  (f32.store offset=@FA_FVY (local.get $b) (f32.const 0))
  (f32.store offset=@FA_FVZ (local.get $b) (f32.const 0)))

;; Giant ball k met by the balls in play, in slot order, on tick t into play:
;; each whose sphere overlaps it, judged level (its circle at the ball's
;; centre height), is put apart from it by weight and, closing, they share
;; 1 + FA_CE of the speed they close at by weight; a touch (a point once a
;; FA_RECOUNT), its side's last toucher. One coming down (sky) moves for
;; nobody: the ball is put out round it and thrown at FA_SQV and up.
(func $fa_touch (param $k i32) (param $t i32) (param $sky i32)
  (local $b i32) (local $q i32) (local $qb i32) (local $side i32) (local $sb i32)
  (local $cx f32) (local $fx f32) (local $fy f32) (local $fz f32) (local $r f32) (local $rs f32)
  (local $bx f32) (local $bz f32) (local $dx f32) (local $dy f32) (local $dz f32) (local $q2 f32) (local $d2 f32) (local $d f32)
  (local $nx f32) (local $nz f32) (local $over f32) (local $wp f32) (local $wb f32) (local $w f32) (local $vrel f32) (local $j f32)
  (local.set $b (call $fa_b (local.get $k)))
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (local.set $wb (select (f32.const 0) (f32.const @(1 / FA_M)) (local.get $sky)))
  (!for $q (i32.const 0) (i32.const @NPLAYER)
    (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
    (if (call $p_in (local.get $qb))
      (then
        (local.set $fx (f32.load offset=@FA_FX (local.get $b)))
        (local.set $fz (f32.load offset=@FA_FZ (local.get $b)))
        (local.set $r (call $b_rad (local.get $qb)))
        (local.set $rs (f32.add (local.get $r) (f32.const @FA_R)))
        (local.set $bx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $qb)) (local.get $cx)))
        (local.set $bz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $qb)) (local.get $cx)))
        (local.set $dx (f32.sub (local.get $bx) (local.get $fx)))
        (local.set $dz (f32.sub (local.get $bz) (local.get $fz)))
        (if (i32.and (f32.lt (f32.abs (local.get $dx)) (local.get $rs)) (f32.lt (f32.abs (local.get $dz)) (local.get $rs)))
          (then
            (local.set $dy (f32.sub (f32.add (f32.sub (!at f32 @(PLAYERS + P_PY) (local.get $qb)) (f32.const @PLAT_Y)) (local.get $r))
                                    (f32.load offset=@FA_FY (local.get $b))))
            (local.set $q2 (f32.sub (f32.mul (local.get $rs) (local.get $rs)) (f32.mul (local.get $dy) (local.get $dy))))
            (local.set $d2 (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))))
            (if (i32.and (f32.gt (local.get $q2) (f32.const 0)) (f32.lt (local.get $d2) (local.get $q2)))
              (then
                (local.set $d (f32.sqrt (f32.max (local.get $d2) (f32.const 1e-6))))
                (if (f32.lt (local.get $d2) (f32.const 1e-6))
                  (then (local.set $nx (f32.const 1)) (local.set $nz (f32.const 0)))
                  (else (local.set $nx (f32.div (local.get $dx) (local.get $d))) (local.set $nz (f32.div (local.get $dz) (local.get $d)))))
                (local.set $over (f32.sub (f32.sqrt (local.get $q2)) (local.get $d)))
                (local.set $wp (f32.div (f32.const 1) (call $b_mass (local.get $qb))))
                (local.set $w (f32.add (local.get $wp) (local.get $wb)))
                ;; apart, by weight
                (local.set $j (f32.div (f32.mul (local.get $over) (local.get $wp)) (local.get $w)))
                (!put f32 @(PLAYERS + P_PX) (local.get $qb) (!madd (local.get $nx) (local.get $j) (!at f32 @(PLAYERS + P_PX) (local.get $qb))))
                (!put f32 @(PLAYERS + P_PZ) (local.get $qb) (!madd (local.get $nz) (local.get $j) (!at f32 @(PLAYERS + P_PZ) (local.get $qb))))
                (local.set $j (f32.div (f32.mul (local.get $over) (local.get $wb)) (local.get $w)))
                (f32.store offset=@FA_FX (local.get $b) (f32.sub (local.get $fx) (f32.mul (local.get $nx) (local.get $j))))
                (f32.store offset=@FA_FZ (local.get $b) (f32.sub (local.get $fz) (f32.mul (local.get $nz) (local.get $j))))
                (if (local.get $sky)
                  (then
                    ;; thrown out from under it
                    (!put f32 @(PLAYERS + P_VX) (local.get $qb) (f32.mul (local.get $nx) (f32.const @FA_SQV)))
                    (!put f32 @(PLAYERS + P_VZ) (local.get $qb) (f32.mul (local.get $nz) (f32.const @FA_SQV)))
                    (!put f32 @(PLAYERS + P_VY) (local.get $qb) (f32.max (!at f32 @(PLAYERS + P_VY) (local.get $qb)) (f32.const @FA_SQUP)))
                    (!put u8 @(PLAYERS + P_FL) (local.get $qb) (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $qb)) (i32.const @(255 ^ PF_GROUND)))))
                  (else
                    ;; the speed they close at, the ball's way out from it
                    (local.set $vrel (f32.sub (!madd (!at f32 @(PLAYERS + P_VX) (local.get $qb)) (local.get $nx) (f32.mul (!at f32 @(PLAYERS + P_VZ) (local.get $qb)) (local.get $nz)))
                                              (!madd (f32.load offset=@FA_FVX (local.get $b)) (local.get $nx) (f32.mul (f32.load offset=@FA_FVZ (local.get $b)) (local.get $nz)))))
                    (if (f32.lt (local.get $vrel) (f32.const 0))
                      (then
                        (local.set $j (f32.div (f32.mul (local.get $vrel) (f32.const @(-(1 + FA_CE)))) (local.get $w)))
                        (!put f32 @(PLAYERS + P_VX) (local.get $qb) (!madd (local.get $nx) (f32.mul (local.get $j) (local.get $wp)) (!at f32 @(PLAYERS + P_VX) (local.get $qb))))
                        (!put f32 @(PLAYERS + P_VZ) (local.get $qb) (!madd (local.get $nz) (f32.mul (local.get $j) (local.get $wp)) (!at f32 @(PLAYERS + P_VZ) (local.get $qb))))
                        (f32.store offset=@FA_FVX (local.get $b) (f32.sub (f32.load offset=@FA_FVX (local.get $b)) (f32.mul (local.get $nx) (f32.mul (local.get $j) (local.get $wb)))))
                        (f32.store offset=@FA_FVZ (local.get $b) (f32.sub (f32.load offset=@FA_FVZ (local.get $b)) (f32.mul (local.get $nz) (f32.mul (local.get $j) (local.get $wb)))))))
                    ;; the touch: a point once a FA_RECOUNT; the last toucher, its side's, for a goal and an assist
                    (local.set $side (call $p_side (local.get $qb)))
                    (local.set $sb (call $fa_s (local.get $q)))
                    (if (i32.ge_s (i32.sub (local.get $t) (i32.load offset=@FA_NEXTT (local.get $sb))) (i32.const 0))
                      (then
                        (i32.store offset=@FA_NEXTT (local.get $sb) (i32.add (local.get $t) (i32.const @FA_RECOUNT)))
                        (i32.store16 offset=@FA_TOUCHES (local.get $sb) (i32.add (i32.load16_u offset=@FA_TOUCHES (local.get $sb)) (i32.const 1)))
                        (!put u16 @(PLAYERS + PG_SCORE) (local.get $qb) (i32.add (!at u16 @(PLAYERS + PG_SCORE) (local.get $qb)) (i32.const @FA_PT_TOUCH)))))
                    (i32.store offset=@FA_LASTB (local.get $sb) (i32.load offset=@FA_FSER (local.get $b)))
                    (i32.store offset=@FA_LASTT (local.get $sb) (local.get $t))
                    (i32.store8 offset=@FA_FBY (local.get $b) (local.get $q))
                    (i32.store8 offset=@FA_FLAST (i32.add (local.get $b) (local.get $side)) (local.get $q))
                    (i32.store offset=@FA_FSAT (i32.add (local.get $b) (i32.shl (local.get $side) (i32.const 2))) (local.get $t))))
                (!chk (!at f32 @(PLAYERS + P_PX) (local.get $qb)) 603 (local.get $q))
                (!chk (!at f32 @(PLAYERS + P_PZ) (local.get $qb)) 604 (local.get $q))
                (!chk (!at f32 @(PLAYERS + P_VX) (local.get $qb)) 605 (local.get $q))
                (!chk (!at f32 @(PLAYERS + P_VZ) (local.get $qb)) 606 (local.get $q))))))))))

;; Giant ball k into a goal for side s on tick t: the side's score up by its
;; worth, FA_PT_GOAL times that to the side's last toucher (if still in the
;; room), FA_PT_ASSIST to each other ball of the side whose last touch was on
;; it in the FA_ASSISTT before; then gone.
(func $fa_goal (param $k i32) (param $s i32) (param $t i32)
  (local $b i32) (local $sc i32) (local $v i32) (local $q i32) (local $qb i32) (local $sb i32) (local $ser i32) (local $none i32)
  (local.set $b (call $fa_b (local.get $k)))
  (local.set $v (select (i32.const @FA_GOLDV) (i32.const 1) (i32.load8_u offset=@FA_FGOLD (local.get $b))))
  (local.set $ser (i32.load offset=@FA_FSER (local.get $b)))
  (call $p_tadd (local.get $s) (local.get $v))
  (local.set $sc (i32.load8_u offset=@FA_FLAST (i32.add (local.get $b) (local.get $s))))
  (local.set $none (i32.eq (local.get $sc) (i32.const 255)))
  (if (i32.eqz (local.get $none))
    (then
      (local.set $qb (i32.shl (local.get $sc) (i32.const 6)))
      (if (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $qb)) (i32.const @PF_LIVE))
        (then
          (!put u16 @(PLAYERS + PG_SCORE) (local.get $qb) (i32.add (!at u16 @(PLAYERS + PG_SCORE) (local.get $qb)) (i32.mul (local.get $v) (i32.const @FA_PT_GOAL))))
          (local.set $sb (call $fa_s (local.get $sc)))
          (i32.store16 offset=@FA_GOALN (local.get $sb) (i32.add (i32.load16_u offset=@FA_GOALN (local.get $sb)) (i32.const 1))))
        (else (local.set $sc (i32.const 255))))))
  (!for $q (i32.const 0) (i32.const @NPLAYER)
    (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
    (local.set $sb (call $fa_s (local.get $q)))
    (if (i32.and (i32.and (i32.ne (local.get $q) (local.get $sc)) (i32.ne (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $qb)) (i32.const @PF_LIVE)) (i32.const 0)))
                 (i32.and (i32.eq (call $p_side (local.get $qb)) (local.get $s))
                          (i32.and (i32.eq (i32.load offset=@FA_LASTB (local.get $sb)) (local.get $ser))
                                   (i32.lt_s (i32.sub (local.get $t) (i32.load offset=@FA_LASTT (local.get $sb))) (i32.const @FA_ASSISTT)))))
      (then
        (!put u16 @(PLAYERS + PG_SCORE) (local.get $qb) (i32.add (!at u16 @(PLAYERS + PG_SCORE) (local.get $qb)) (i32.const @FA_PT_ASSIST)))
        (i32.store16 offset=@FA_ASSISTS (local.get $sb) (i32.add (i32.load16_u offset=@FA_ASSISTS (local.get $sb)) (i32.const 1))))))
  (i32.store (i32.const @(PG_H + FA_GOALS)) (i32.add (i32.load (i32.const @(PG_H + FA_GOALS))) (i32.const 1)))
  (call $fx (i32.const 0) (i32.const @FA_FX_GOAL) (local.get $sc)
            (i32.or (i32.or (local.get $k) (i32.shl (local.get $s) (i32.const 8)))
                    (i32.or (i32.shl (i32.load8_u offset=@FA_FGOLD (local.get $b)) (i32.const 9)) (i32.shl (local.get $none) (i32.const 10))))
            (f32.add (f32.load offset=@FA_FX (local.get $b)) (f32.load (i32.const @PG_CX)))
            (f32.add (f32.load offset=@FA_FY (local.get $b)) (f32.const @PLAT_Y))
            (f32.add (f32.load offset=@FA_FZ (local.get $b)) (f32.load (i32.const @PG_CX)))
            (f32.convert_i32_u (i32.load (i32.add (i32.const @PG_TSCORE) (i32.shl (local.get $s) (i32.const 2))))))
  (call $fa_gone (local.get $k) (local.get $t)))

;; Is there floor under a giant ball's centre at (ax, az) (a quarter's, from
;; the centre): the pitch, or a goal's box?
(func $fa_floor (param $ax f32) (param $az f32) (result i32)
  (local $hx f32)
  (local.set $hx (f32.load (i32.const @(PG_H + FA_HX))))
  (i32.or (i32.and (f32.le (local.get $ax) (local.get $hx)) (f32.le (local.get $az) (f32.load (i32.const @(PG_H + FA_HZ)))))
          (i32.and (f32.le (local.get $ax) (f32.add (local.get $hx) (f32.const @FA_GD))) (f32.lt (local.get $az) (f32.load (i32.const @(PG_H + FA_GW)))))))

;; Giant ball k's flight on tick t into play: rolling on the floor (FA_ROLL,
;; FA_FRIC) or in the air (FA_G, FA_AIR), at most FA_VMAX, a step; the balls
;; it meets; then the end walls, a goal's nets, the kerbs and the posts, and
;; the floor under its centre (a bounce, or settled: a drop has landed); past
;; a goal line by FA_R in its mouth, a goal; FA_LOSTY under the floor, lost.
;; In a quarter of the pitch at a time, as push.
(func $fa_fly (param $k i32) (param $t i32)
  (local $b i32) (local $st i32) (local $sup i32)
  (local $x f32) (local $y f32) (local $z f32) (local $vx f32) (local $vy f32) (local $vz f32) (local $sp f32)
  (local $hx f32) (local $hz f32) (local $gw f32) (local $sx f32) (local $sz f32) (local $ax f32) (local $az f32) (local $q f32)
  (local $dx f32) (local $dz f32) (local $dd f32)
  (local.set $b (call $fa_b (local.get $k)))
  (local.set $st (i32.load8_u offset=@FA_FST (local.get $b)))
  (local.set $x (f32.load offset=@FA_FX (local.get $b)))
  (local.set $y (f32.load offset=@FA_FY (local.get $b)))
  (local.set $z (f32.load offset=@FA_FZ (local.get $b)))
  (local.set $vx (f32.load offset=@FA_FVX (local.get $b)))
  (local.set $vy (f32.load offset=@FA_FVY (local.get $b)))
  (local.set $vz (f32.load offset=@FA_FVZ (local.get $b)))
  (if (i32.and (i32.and (f32.le (local.get $y) (f32.const @FA_R)) (f32.eq (local.get $vy) (f32.const 0)))
               (call $fa_floor (f32.abs (local.get $x)) (f32.abs (local.get $z))))
    (then
      (local.set $vx (f32.mul (local.get $vx) (f32.const @FA_ROLL)))
      (local.set $vz (f32.mul (local.get $vz) (f32.const @FA_ROLL)))
      (local.set $sp (f32.sqrt (!madd (local.get $vx) (local.get $vx) (f32.mul (local.get $vz) (local.get $vz)))))
      (if (f32.gt (local.get $sp) (f32.const @FA_FRIC))
        (then
          (local.set $sp (f32.div (f32.sub (local.get $sp) (f32.const @FA_FRIC)) (local.get $sp)))
          (local.set $vx (f32.mul (local.get $vx) (local.get $sp)))
          (local.set $vz (f32.mul (local.get $vz) (local.get $sp))))
        (else (local.set $vx (f32.const 0)) (local.set $vz (f32.const 0)))))
    (else
      (local.set $vy (f32.sub (local.get $vy) (f32.const @FA_G)))
      (local.set $vx (f32.mul (local.get $vx) (f32.const @FA_AIR)))
      (local.set $vz (f32.mul (local.get $vz) (f32.const @FA_AIR)))))
  (local.set $sp (!dot3 (local.get $vx) (local.get $vy) (local.get $vz) (local.get $vx) (local.get $vy) (local.get $vz)))
  (if (f32.gt (local.get $sp) (f32.const @(FA_VMAX * FA_VMAX)))
    (then
      (local.set $sp (f32.div (f32.const @FA_VMAX) (f32.sqrt (local.get $sp))))
      (local.set $vx (f32.mul (local.get $vx) (local.get $sp)))
      (local.set $vy (f32.mul (local.get $vy) (local.get $sp)))
      (local.set $vz (f32.mul (local.get $vz) (local.get $sp)))))
  (local.set $x (!madd (local.get $vx) (f32.const @DT) (local.get $x)))
  (local.set $y (!madd (local.get $vy) (f32.const @DT) (local.get $y)))
  (local.set $z (!madd (local.get $vz) (f32.const @DT) (local.get $z)))
  (f32.store offset=@FA_FX (local.get $b) (local.get $x))
  (f32.store offset=@FA_FY (local.get $b) (local.get $y))
  (f32.store offset=@FA_FZ (local.get $b) (local.get $z))
  (f32.store offset=@FA_FVX (local.get $b) (local.get $vx))
  (f32.store offset=@FA_FVY (local.get $b) (local.get $vy))
  (f32.store offset=@FA_FVZ (local.get $b) (local.get $vz))
  (call $fa_touch (local.get $k) (local.get $t)
    (i32.and (i32.eq (local.get $st) (i32.const @FA_FALL)) (f32.lt (local.get $vy) (f32.const @(-FA_SQ0)))))
  (local.set $x (f32.load offset=@FA_FX (local.get $b)))
  (local.set $z (f32.load offset=@FA_FZ (local.get $b)))
  (local.set $vx (f32.load offset=@FA_FVX (local.get $b)))
  (local.set $vz (f32.load offset=@FA_FVZ (local.get $b)))
  (local.set $hx (f32.load (i32.const @(PG_H + FA_HX))))
  (local.set $hz (f32.load (i32.const @(PG_H + FA_HZ))))
  (local.set $gw (f32.load (i32.const @(PG_H + FA_GW))))
  (local.set $sx (f32.copysign (f32.const 1) (local.get $x)))
  (local.set $sz (f32.copysign (f32.const 1) (local.get $z)))
  (local.set $ax (f32.abs (local.get $x)))
  (local.set $az (f32.abs (local.get $z)))
  (local.set $vx (f32.mul (local.get $vx) (local.get $sx)))
  (local.set $vz (f32.mul (local.get $vz) (local.get $sz)))
  (if (i32.and (f32.gt (local.get $ax) (local.get $hx)) (f32.lt (local.get $az) (local.get $gw)))
    (then
      ;; in a goal's box: the side nets, the back net
      (if (f32.gt (local.get $az) (f32.sub (local.get $gw) (f32.const @FA_R)))
        (then (local.set $az (f32.sub (local.get $gw) (f32.const @FA_R)))
              (if (f32.gt (local.get $vz) (f32.const 0)) (then (local.set $vz (f32.mul (local.get $vz) (f32.const @(-FA_WE))))))))
      (if (f32.gt (local.get $ax) (f32.add (local.get $hx) (f32.const @(FA_GD - FA_R))))
        (then (local.set $ax (f32.add (local.get $hx) (f32.const @(FA_GD - FA_R))))
              (if (f32.gt (local.get $vx) (f32.const 0)) (then (local.set $vx (f32.mul (local.get $vx) (f32.const @(-FA_WE)))))))))
    (else
      (if (i32.or (f32.gt (local.get $ax) (local.get $hx))
                  (i32.and (f32.gt (local.get $ax) (f32.sub (local.get $hx) (f32.const @FA_R))) (f32.ge (local.get $az) (local.get $gw))))
        (then
          (local.set $ax (f32.sub (local.get $hx) (f32.const @FA_R)))
          (if (f32.gt (local.get $vx) (f32.const 0)) (then (local.set $vx (f32.mul (local.get $vx) (f32.const @(-FA_WE))))))))
      ;; a kerb: its top edge meets the ball its circle FA_BH up in from the side line
      (if (i32.and (i32.and (f32.lt (local.get $y) (f32.const @(FA_R + FA_BH))) (f32.le (local.get $az) (local.get $hz)))
                   (i32.and (f32.gt (local.get $az) (f32.sub (local.get $hz) (f32.const @(Math.sqrt(FA_R * FA_R - (FA_R - FA_BH) * (FA_R - FA_BH))))))
                            (i32.or (f32.ge (local.get $ax) (f32.load (i32.const @(PG_H + FA_BX0))))
                                    (f32.le (local.get $ax) (f32.load (i32.const @(PG_H + FA_BX1)))))))
        (then
          (local.set $az (f32.sub (local.get $hz) (f32.const @(Math.sqrt(FA_R * FA_R - (FA_R - FA_BH) * (FA_R - FA_BH))))))
          (if (f32.gt (local.get $vz) (f32.const 0)) (then (local.set $vz (f32.mul (local.get $vz) (f32.const @(-FA_BE))))))))))
  ;; the post, a circle on the floor
  (local.set $dx (f32.sub (local.get $ax) (local.get $hx)))
  (local.set $dz (f32.sub (local.get $az) (local.get $gw)))
  (local.set $dd (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))))
  (if (i32.and (f32.lt (local.get $dd) (f32.const @((FA_R + FA_FR) * (FA_R + FA_FR)))) (f32.gt (local.get $dd) (f32.const 0)))
    (then
      (local.set $dd (f32.sqrt (local.get $dd)))
      (local.set $dx (f32.div (local.get $dx) (local.get $dd)))
      (local.set $dz (f32.div (local.get $dz) (local.get $dd)))
      (local.set $ax (!madd (local.get $dx) (f32.const @(FA_R + FA_FR)) (local.get $hx)))
      (local.set $az (!madd (local.get $dz) (f32.const @(FA_R + FA_FR)) (local.get $gw)))
      (local.set $q (!madd (local.get $vx) (local.get $dx) (f32.mul (local.get $vz) (local.get $dz))))
      (if (f32.lt (local.get $q) (f32.const 0))
        (then
          (local.set $q (f32.mul (local.get $q) (f32.const @(1 + FA_WE))))
          (local.set $vx (f32.sub (local.get $vx) (f32.mul (local.get $q) (local.get $dx))))
          (local.set $vz (f32.sub (local.get $vz) (f32.mul (local.get $q) (local.get $dz))))))))
  ;; the floor under its centre (not one it has fallen past)
  (if (i32.and (i32.and (f32.lt (local.get $y) (f32.const @FA_R)) (f32.gt (local.get $y) (f32.const @(FA_R - 1))))
               (call $fa_floor (local.get $ax) (local.get $az)))
    (then
      (if (i32.eq (local.get $st) (i32.const @FA_FALL))
        (then
          (i32.store8 offset=@FA_FST (local.get $b) (i32.const @FA_LIVE))
          (call $fx (i32.const 0) (i32.const @FA_FX_LAND) (i32.const 255) (i32.or (local.get $k) (i32.shl (i32.load8_u offset=@FA_FGOLD (local.get $b)) (i32.const 8)))
                    (f32.add (local.get $x) (f32.load (i32.const @PG_CX))) (f32.const @PLAT_Y) (f32.add (local.get $z) (f32.load (i32.const @PG_CX)))
                    (f32.neg (local.get $vy)))))
      (local.set $y (f32.const @FA_R))
      (if (f32.lt (local.get $vy) (f32.const @(-FA_SETTLE)))
        (then (local.set $vy (f32.mul (local.get $vy) (f32.const @(-FA_FE)))))
        (else (local.set $vy (f32.const 0))))))
  (local.set $x (f32.mul (local.get $ax) (local.get $sx)))
  (local.set $z (f32.mul (local.get $az) (local.get $sz)))
  (local.set $vx (f32.mul (local.get $vx) (local.get $sx)))
  (local.set $vz (f32.mul (local.get $vz) (local.get $sz)))
  (!chk (local.get $x) 607 (local.get $k))
  (!chk (local.get $y) 608 (local.get $k))
  (!chk (local.get $z) 609 (local.get $k))
  (!chk (local.get $vx) 610 (local.get $k))
  (!chk (local.get $vy) 611 (local.get $k))
  (!chk (local.get $vz) 612 (local.get $k))
  (f32.store offset=@FA_FX (local.get $b) (local.get $x))
  (f32.store offset=@FA_FY (local.get $b) (local.get $y))
  (f32.store offset=@FA_FZ (local.get $b) (local.get $z))
  (f32.store offset=@FA_FVX (local.get $b) (local.get $vx))
  (f32.store offset=@FA_FVY (local.get $b) (local.get $vy))
  (f32.store offset=@FA_FVZ (local.get $b) (local.get $vz))
  ;; all the way in: the goal at high x is red's, at low x blue's
  (if (i32.and (f32.gt (local.get $ax) (f32.add (local.get $hx) (f32.const @FA_R))) (f32.lt (local.get $az) (local.get $gw)))
    (then (call $fa_goal (local.get $k) (f32.lt (local.get $x) (f32.const 0)) (local.get $t)) (return)))
  (if (f32.lt (local.get $y) (f32.const @FA_LOSTY))
    (then
      (i32.store (i32.const @(PG_H + FA_LOST)) (i32.add (i32.load (i32.const @(PG_H + FA_LOST))) (i32.const 1)))
      (call $fx (i32.const 0) (i32.const @FA_FX_LOST) (i32.load8_u offset=@FA_FBY (local.get $b))
                (i32.or (local.get $k) (i32.shl (i32.load8_u offset=@FA_FGOLD (local.get $b)) (i32.const 9)))
                (f32.add (local.get $x) (f32.load (i32.const @PG_CX))) (f32.const @PLAT_Y) (f32.add (local.get $z) (f32.load (i32.const @PG_CX)))
                (f32.const 0))
      (call $fa_gone (local.get $k) (local.get $t)))))

;; Two giant balls in flight that meet, at records a and c: apart along the
;; line between them, half each, and an exchange of FA_BBE of the speed they
;; close at.
(func $fa_pair (param $a i32) (param $c i32)
  (local $dx f32) (local $dy f32) (local $dz f32) (local $d f32) (local $q f32)
  (local.set $dx (f32.sub (f32.load offset=@FA_FX (local.get $c)) (f32.load offset=@FA_FX (local.get $a))))
  (local.set $dy (f32.sub (f32.load offset=@FA_FY (local.get $c)) (f32.load offset=@FA_FY (local.get $a))))
  (local.set $dz (f32.sub (f32.load offset=@FA_FZ (local.get $c)) (f32.load offset=@FA_FZ (local.get $a))))
  (if (i32.or (f32.ge (f32.abs (local.get $dx)) (f32.const @(2 * FA_R))) (f32.ge (f32.abs (local.get $dz)) (f32.const @(2 * FA_R)))) (then (return)))
  (local.set $d (!dot3 (local.get $dx) (local.get $dy) (local.get $dz) (local.get $dx) (local.get $dy) (local.get $dz)))
  (if (i32.or (f32.ge (local.get $d) (f32.const @(4 * FA_R * FA_R))) (f32.eq (local.get $d) (f32.const 0))) (then (return)))
  (local.set $d (f32.sqrt (local.get $d)))
  (local.set $q (f32.mul (f32.sub (f32.const @(2 * FA_R)) (local.get $d)) (f32.const 0.5)))
  (local.set $dx (f32.div (local.get $dx) (local.get $d)))
  (local.set $dy (f32.div (local.get $dy) (local.get $d)))
  (local.set $dz (f32.div (local.get $dz) (local.get $d)))
  (f32.store offset=@FA_FX (local.get $a) (f32.sub (f32.load offset=@FA_FX (local.get $a)) (f32.mul (local.get $dx) (local.get $q))))
  (f32.store offset=@FA_FY (local.get $a) (f32.sub (f32.load offset=@FA_FY (local.get $a)) (f32.mul (local.get $dy) (local.get $q))))
  (f32.store offset=@FA_FZ (local.get $a) (f32.sub (f32.load offset=@FA_FZ (local.get $a)) (f32.mul (local.get $dz) (local.get $q))))
  (f32.store offset=@FA_FX (local.get $c) (!madd (local.get $dx) (local.get $q) (f32.load offset=@FA_FX (local.get $c))))
  (f32.store offset=@FA_FY (local.get $c) (!madd (local.get $dy) (local.get $q) (f32.load offset=@FA_FY (local.get $c))))
  (f32.store offset=@FA_FZ (local.get $c) (!madd (local.get $dz) (local.get $q) (f32.load offset=@FA_FZ (local.get $c))))
  ;; the speed they close at, along the line
  (local.set $q (f32.sub (!dot3 (f32.load offset=@FA_FVX (local.get $a)) (f32.load offset=@FA_FVY (local.get $a)) (f32.load offset=@FA_FVZ (local.get $a)) (local.get $dx) (local.get $dy) (local.get $dz))
                         (!dot3 (f32.load offset=@FA_FVX (local.get $c)) (f32.load offset=@FA_FVY (local.get $c)) (f32.load offset=@FA_FVZ (local.get $c)) (local.get $dx) (local.get $dy) (local.get $dz))))
  (if (f32.le (local.get $q) (f32.const 0)) (then (return)))
  (local.set $q (f32.mul (local.get $q) (f32.const @((1 + FA_BBE) / 2))))
  (f32.store offset=@FA_FVX (local.get $a) (f32.sub (f32.load offset=@FA_FVX (local.get $a)) (f32.mul (local.get $q) (local.get $dx))))
  (f32.store offset=@FA_FVY (local.get $a) (f32.sub (f32.load offset=@FA_FVY (local.get $a)) (f32.mul (local.get $q) (local.get $dy))))
  (f32.store offset=@FA_FVZ (local.get $a) (f32.sub (f32.load offset=@FA_FVZ (local.get $a)) (f32.mul (local.get $q) (local.get $dz))))
  (f32.store offset=@FA_FVX (local.get $c) (!madd (local.get $q) (local.get $dx) (f32.load offset=@FA_FVX (local.get $c))))
  (f32.store offset=@FA_FVY (local.get $c) (!madd (local.get $q) (local.get $dy) (f32.load offset=@FA_FVY (local.get $c))))
  (f32.store offset=@FA_FVZ (local.get $c) (!madd (local.get $q) (local.get $dz) (f32.load offset=@FA_FVZ (local.get $c)))))

;; Is giant ball record b in flight (dropping or live)?
(func $fa_on (param $b i32) (result i32)
  (local $st i32)
  (local.set $st (i32.load8_u offset=@FA_FST (local.get $b)))
  (i32.or (i32.eq (local.get $st) (i32.const @FA_FALL)) (i32.eq (local.get $st) (i32.const @FA_LIVE))))

;; The drops: the golden one at FA_GOLDT; each gone one's replacement when
;; its time comes; one more when due and fewer than the cap are in play. Then
;; each giant ball in flight flown, in order, and each pair that meets.
(func $fa_tick
  (local $t i32) (local $k i32) (local $j i32) (local $b i32) (local $n i32) (local $free i32)
  (local.set $t (call $p_t (i32.const 0)))
  (if (i32.and (i32.eqz (i32.load (i32.const @(PG_H + FA_GOLDN)))) (i32.ge_s (local.get $t) (i32.const @FA_GOLDT)))
    (then
      (i32.store (i32.const @(PG_H + FA_GOLDN)) (i32.const 1))
      (call $fa_drop (i32.const @FA_NMAX) (i32.const 1) (i32.const 1) (local.get $t))))
  (local.set $free (i32.const -1))
  (!for $k (i32.const 0) (i32.const @FA_NMAX)
    (local.set $b (call $fa_b (local.get $k)))
    (if (i32.and (i32.eq (i32.load8_u offset=@FA_FST (local.get $b)) (i32.const @FA_WAIT))
                 (i32.ge_s (i32.sub (local.get $t) (i32.load offset=@FA_FAT (local.get $b))) (i32.const 0)))
      (then (call $fa_drop (local.get $k) (i32.const 0) (i32.const 2) (local.get $t))))
    (if (i32.load8_u offset=@FA_FST (local.get $b))
      (then (!inc $n))
      (else (if (i32.lt_s (local.get $free) (i32.const 0)) (then (local.set $free (local.get $k)))))))
  (if (i32.and (i32.lt_u (local.get $n) (i32.load (i32.const @(PG_H + FA_CAP))))
               (i32.ge_s (i32.sub (local.get $t) (i32.load (i32.const @(PG_H + FA_NEXT)))) (i32.const 0)))
    (then
      (call $fa_drop (local.get $free) (i32.const 0) (i32.const 2) (local.get $t))
      (i32.store (i32.const @(PG_H + FA_NEXT)) (i32.add (local.get $t) (i32.const @FA_ADD)))))
  (!for $k (i32.const 0) (i32.const @(FA_NMAX + 1))
    (if (call $fa_on (call $fa_b (local.get $k))) (then (call $fa_fly (local.get $k) (local.get $t)))))
  (!for $k (i32.const 0) (i32.const @(FA_NMAX + 1))
    (if (call $fa_on (call $fa_b (local.get $k)))
      (then
        (!for $j (i32.add (local.get $k) (i32.const 1)) (i32.const @(FA_NMAX + 1))
          (if (call $fa_on (call $fa_b (local.get $j)))
            (then (call $fa_pair (call $fa_b (local.get $k)) (call $fa_b (local.get $j))))))))))

;; The clock ends it.
(func $fa_over (result i32) (i32.const 0))

;; Ball p down: FA_PT_KO to the foe that bumped it off in the last
;; CREDIT_TICKS (the framework's KO), if still in the room.
(func $fa_out (param $p i32)
  (local $pb i32) (local $hb i32) (local $sb i32)
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (local.set $hb (!at u8 @(PLAYERS + B_HITBY) (local.get $pb)))
  (if (i32.and (i32.and (i32.ne (!at u16 @(PLAYERS + B_HITT) (local.get $pb)) (i32.const 0)) (i32.lt_u (local.get $hb) (i32.const @NPLAYER)))
               (i32.ne (local.get $hb) (local.get $p)))
    (then
      (if (i32.and (i32.ne (i32.and (!at u8 @(PLAYERS + P_FL) (i32.shl (local.get $hb) (i32.const 6))) (i32.const @PF_LIVE)) (i32.const 0))
                   (i32.ne (call $p_side (i32.shl (local.get $hb) (i32.const 6))) (call $p_side (local.get $pb))))
        (then
          (!put u16 @(PLAYERS + PG_SCORE) (i32.shl (local.get $hb) (i32.const 6))
            (i32.add (!at u16 @(PLAYERS + PG_SCORE) (i32.shl (local.get $hb) (i32.const 6))) (i32.const @FA_PT_KO)))
          (local.set $sb (call $fa_s (local.get $hb)))
          (i32.store16 offset=@FA_KOS (local.get $sb) (i32.add (i32.load16_u offset=@FA_KOS (local.get $sb)) (i32.const 1))))))))
