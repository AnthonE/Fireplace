;; SOCCER: red against blue (PGF_TEAMS) on a walled pitch, red's half at low
;; x defending the goal there and blue's at high x, SO_A0 m² and SO_AK more a
;; ball (SO_AK2 past SO_NK), SO_ASP times as long as wide, its corners cut
;; at 45 degrees. At each end a goal: a mouth SO_GWK of the width, a crossbar
;; SO_GH up, posts and bar SO_FR round, a net box SO_GD deep that a ball may
;; roll into. Footballs, one for every SO_PER balls, SO_R in radius, start on
;; spots along the halfway line. A ball in play whose centre comes within its
;; radius plus SO_R of one touches it: the football is put back out round the
;; ball (which it never moves) and, if they were closing, takes 1 + SO_E of
;; the closing speed along the line between them turned SO_AIM toward where
;; the ball rolls, leaving at least SO_KMIN faster than the ball comes on;
;; from the air (a hop, SO_HOP here) it goes up too, a chip; from a ball in
;; its own penalty box on its goal's side of it, a keeper's, harder and up.
;; A football whose centre is past the goal line by its radius is a goal for
;; the other side (PG_TSCORE), SO_PT_GOAL of its own to that side's last
;; toucher, or an own goal, nobody's. It is gone SO_GONE ticks, then on its
;; spot, held SO_HOLD more; with one football everyone is back on their own
;; half for those SO_HOLD too, held still. A counted touch is a point of the
;; ball's own, a save SO_PT_SAVE more (how a side places). First to SO_GOAL
;; wins; at the clock the side with more, or a draw.
;;
;; The footballs are the confirmed world's, in PG_S, in the pitch's own
;; coordinates (x and z from its centre, the height of the centre over the
;; floor), so a mirror of either end is exact: a touch is ball against a sim
;; object, judged in tick on the records as they stand, so it comes a round
;; trip late, and it never moves the ball. The prediction runs only the
;; walls, the posts and the nets, and the kickoff: called SO_GONE ticks
;; ahead in the header with each ball's rank in its PG_M, so a ball's own
;; kickoff is in its prediction whenever the prediction reaches it. The page
;; flies each football on to the prediction's tick as $so_fly flies it.

;; A football's record, and a slot's.
(func $so_b (param $k i32) (result i32)
  (i32.add (i32.const @(PG_S + SO_BALL)) (i32.mul (local.get $k) (i32.const @SO_FSIZE))))
(func $so_s (param $p i32) (result i32)
  (i32.add (i32.const @(PG_S + SO_SLOT)) (i32.mul (local.get $p) (i32.const @SO_SSIZE))))

;; Side s's way from the halfway line to its own goal: -1 red, 1 blue.
(func $so_dir (param $s i32) (result f32)
  (select (f32.const 1) (f32.const -1) (local.get $s)))

;; The pitch for the crowd, its goals and boxes, the footballs and the target;
;; every football on its spot, let go as play starts.
(func $so_setup (param $n i32)
  (local $a f32) (local $hx f32) (local $hz f32) (local $gw f32) (local $bd f32) (local $nb i32) (local $k i32)
  (local.set $a (!madd (f32.convert_i32_u (select (local.get $n) (i32.const @SO_NK) (i32.lt_u (local.get $n) (i32.const @SO_NK))))
                       (f32.const @SO_AK) (f32.const @SO_A0)))
  (if (i32.gt_u (local.get $n) (i32.const @SO_NK))
    (then (local.set $a (!madd (f32.convert_i32_u (i32.sub (local.get $n) (i32.const @SO_NK))) (f32.const @SO_AK2) (local.get $a)))))
  (local.set $hx (f32.mul (f32.sqrt (f32.mul (local.get $a) (f32.const @SO_ASP))) (f32.const 0.5)))
  (local.set $hz (f32.div (local.get $a) (f32.mul (local.get $hx) (f32.const 4))))
  (local.set $gw (!clamp (f32.mul (local.get $hz) (f32.const @(2 * SO_GWK))) (f32.const @SO_GWMIN) (f32.const @SO_GWMAX)))
  (local.set $bd (!clamp (f32.mul (local.get $hx) (f32.const @(2 * SO_BOXK))) (f32.const @SO_BOXMIN) (f32.const @SO_BOXMAX)))
  (!chk (local.get $hz) 381 (local.get $n))
  (local.set $nb (i32.div_u (i32.add (local.get $n) (i32.const @(SO_PER - 1))) (i32.const @SO_PER)))
  (if (i32.lt_u (local.get $nb) (i32.const @SO_NMIN)) (then (local.set $nb (i32.const @SO_NMIN))))
  (if (i32.gt_u (local.get $nb) (i32.const @SO_NMAX)) (then (local.set $nb (i32.const @SO_NMAX))))
  (i32.store (i32.const @PG_KIND) (i32.const @PK_SCORE))
  (i32.store (i32.const @PG_LEN) (i32.const @SO_LEN))
  (i32.store (i32.const @PG_FLAGS) (i32.const @(PGF_BUMPS | PGF_TEAMS)))
  (f32.store (i32.const @PG_ACC) (f32.const @SO_ACC))
  (f32.store (i32.const @PG_IDLE) (f32.const @SO_IDLE))
  (f32.store (i32.const @PG_HOP) (f32.const @SO_HOP))
  (f32.store (i32.const @PG_SIZE) (f32.add (local.get $hx) (f32.const @SO_GD)))
  (f32.store (i32.const @(PG_H + SO_HX)) (local.get $hx))
  (f32.store (i32.const @(PG_H + SO_HZ)) (local.get $hz))
  (i32.store (i32.const @(PG_H + SO_NB)) (local.get $nb))
  (i32.store (i32.const @(PG_H + SO_GOAL)) (i32.add (i32.const @SO_GOAL0) (i32.mul (i32.sub (local.get $nb) (i32.const 1)) (i32.const @SO_GOALK))))
  (f32.store (i32.const @(PG_H + SO_GW)) (local.get $gw))
  (f32.store (i32.const @(PG_H + SO_BOXD)) (local.get $bd))
  (f32.store (i32.const @(PG_H + SO_BOXHW)) (f32.min (!madd (local.get $bd) (f32.const @SO_BOXW) (local.get $gw)) (f32.sub (local.get $hz) (f32.const 0.5))))
  (f32.store (i32.const @(PG_H + SO_CN)) (f32.min (f32.const @SO_CORN) (f32.sub (f32.sub (local.get $hz) (local.get $gw)) (f32.const 2))))
  (!for $k (i32.const 0) (local.get $nb)
    (call $so_spot (local.get $k) (i32.const 0))))

;; Football k on its spot on the halfway line (the middle of its share of the
;; width's 0.8), still, held and untouchable till tick next into play.
(func $so_spot (param $k i32) (param $next i32)
  (local $b i32) (local $nb i32)
  (local.set $b (call $so_b (local.get $k)))
  (local.set $nb (i32.load (i32.const @(PG_H + SO_NB))))
  (i32.store8 offset=@SO_FST (local.get $b) (i32.const @SO_HELD))
  (i32.store8 offset=@SO_FBY (local.get $b) (i32.const 255))
  (i32.store16 offset=@SO_FLAST (local.get $b) (i32.const 0xffff))
  (i32.store offset=@SO_FNEXT (local.get $b) (local.get $next))
  (f32.store offset=@SO_FX (local.get $b) (f32.const 0))
  (f32.store offset=@SO_FY (local.get $b) (f32.const @SO_R))
  (f32.store offset=@SO_FZ (local.get $b)
    (f32.mul (f32.sub (f32.div (f32.mul (f32.add (f32.convert_i32_u (local.get $k)) (f32.const 0.5)) (f32.const 2)) (f32.convert_i32_u (local.get $nb)))
                      (f32.const 1))
             (f32.mul (f32.load (i32.const @(PG_H + SO_HZ))) (f32.const 0.8))))
  (f32.store offset=@SO_FVX (local.get $b) (f32.const 0))
  (f32.store offset=@SO_FVY (local.get $b) (f32.const 0))
  (f32.store offset=@SO_FVZ (local.get $b) (f32.const 0)))

;; Place k of m on side s on bank d's pitch, world x and z: a grid over its
;; half from SO_X0 off the halfway line to 2 m off its goal line, its cells
;; about square, the front row first. A k past m wraps.
(func $so_form (param $d i32) (param $s i32) (param $k i32) (param $m i32) (result f32 f32)
  (local $hx f32) (local $hz f32) (local $cx f32) (local $deep f32) (local $cols i32) (local $rows i32)
  (local.set $hx (f32.load offset=@(PG_H + SO_HX) (local.get $d)))
  (local.set $hz (f32.load offset=@(PG_H + SO_HZ) (local.get $d)))
  (local.set $cx (f32.load offset=@PG_CX (local.get $d)))
  (local.set $deep (f32.sub (local.get $hx) (f32.const @(SO_X0 + 2))))
  (if (i32.eqz (local.get $m)) (then (local.set $m (i32.const 1))))
  (local.set $k (i32.rem_u (local.get $k) (local.get $m)))
  (local.set $cols (i32.trunc_sat_f32_u (f32.nearest (f32.sqrt (f32.div (f32.mul (f32.convert_i32_u (local.get $m)) (f32.mul (local.get $hz) (f32.const 2))) (local.get $deep))))))
  (if (i32.eqz (local.get $cols)) (then (local.set $cols (i32.const 1))))
  (local.set $rows (i32.div_u (i32.add (local.get $m) (i32.sub (local.get $cols) (i32.const 1))) (local.get $cols)))
  (!madd (call $so_dir (local.get $s))
         (!madd (local.get $deep) (f32.div (f32.add (f32.convert_i32_u (i32.div_u (local.get $k) (local.get $cols))) (f32.const 0.5)) (f32.convert_i32_u (local.get $rows))) (f32.const @SO_X0))
         (local.get $cx))
  (!madd (f32.sub (f32.div (f32.mul (f32.add (f32.convert_i32_u (i32.rem_u (local.get $k) (local.get $cols))) (f32.const 0.5)) (f32.const 2)) (f32.convert_i32_u (local.get $cols)))
                  (f32.const 1))
         (f32.mul (local.get $hz) (f32.const 0.85)) (local.get $cx)))

;; As the round is laid out, ball PG_TK of its side's PG_TN in its half's
;; grid; a newcomer in front of its own goal, k of 1024 across the mouth.
(func $so_spawn (param $i i32) (param $n i32) (result f32 f32 f32)
  (local $s i32) (local $x f32) (local $z f32)
  (local.set $s (i32.load (i32.const @PG_TSIDE)))
  (if (i32.eq (i32.load (i32.const @HDR_STATE)) (i32.const @H_PLAY))
    (then
      (return
        (!madd (call $so_dir (local.get $s)) (f32.sub (f32.load (i32.const @(PG_H + SO_HX))) (f32.const 2.5)) (f32.load (i32.const @PG_CX)))
        (f32.const @PLAT_Y)
        (!madd (f32.sub (f32.mul (f32.convert_i32_u (i32.and (local.get $i) (i32.const 1023))) (f32.const @(2 / 1023))) (f32.const 1))
               (f32.mul (f32.load (i32.const @(PG_H + SO_GW))) (f32.const 0.8)) (f32.load (i32.const @PG_CX))))))
  (call $so_form (i32.const 0) (local.get $s) (i32.load (i32.const @PG_TK))
    (i32.and (i32.shr_u (i32.load (i32.const @PG_TN)) (i32.shl (local.get $s) (i32.const 4))) (i32.const 0xffff)))
  (local.set $z) (local.set $x)
  (local.get $x) (f32.const @PLAT_Y) (local.get $z))

(func $so_start)
(func $so_begin (param $p i32) (param $d i32))

;; A floor without end: the walls (in push) keep a ball on the pitch.
(func $so_ground (param $d i32) (param $x f32) (param $y f32) (param $z f32) (result f32)
  (select (f32.const @PLAT_Y) (f32.const -1000) (f32.ge (local.get $y) (f32.const @PLAT_Y))))

;; Ball p on bank d after its roll. Through a kickoff (one football, SO_KO to
;; SO_KOGO on bank d's clock) it is held still on its place, its rank in its
;; PG_M of its side's count in SO_TN. Else kept on the pitch, bouncing softly
;; off the walls, the chamfers, the posts and the nets: into a goal's box
;; through its mouth (under the bar), and no higher than its roof in there.
;; Worked a quarter of the pitch at a time: x and z from the centre, by size.
(func $so_push (param $p i32) (param $d i32)
  (local $pb i32) (local $t i32) (local $s i32) (local $m i32) (local $ch i32)
  (local $r f32) (local $cx f32) (local $hx f32) (local $hz f32) (local $gw f32) (local $cn f32)
  (local $lx f32) (local $lz f32) (local $sx f32) (local $sz f32) (local $ax f32) (local $az f32)
  (local $vx f32) (local $vz f32) (local $h f32) (local $q f32) (local $dx f32) (local $dz f32) (local $dd f32) (local $x f32) (local $z f32)
  (local.set $pb (i32.add (i32.shl (local.get $p) (i32.const 6)) (local.get $d)))
  (local.set $t (call $p_t (local.get $d)))
  (if (i32.and (i32.eq (i32.load offset=@(PG_H + SO_NB) (local.get $d)) (i32.const 1))
               (i32.and (i32.ge_s (i32.sub (local.get $t) (i32.load offset=@(PG_H + SO_KO) (local.get $d))) (i32.const 0))
                        (i32.lt_s (i32.sub (local.get $t) (i32.load offset=@(PG_H + SO_KOGO) (local.get $d))) (i32.const 0))))
    (then
      (local.set $s (call $p_side (local.get $pb)))
      (call $so_form (local.get $d) (local.get $s) (i32.and (!at i32 @(PLAYERS + PG_M) (local.get $pb)) (i32.const 0xffff))
        (i32.and (i32.shr_u (i32.load offset=@(PG_H + SO_TN) (local.get $d)) (i32.shl (local.get $s) (i32.const 4))) (i32.const 0xffff)))
      (local.set $z) (local.set $x)
      (!put f32 @(PLAYERS + P_PX) (local.get $pb) (local.get $x))
      (!put f32 @(PLAYERS + P_PY) (local.get $pb) (f32.const @PLAT_Y))
      (!put f32 @(PLAYERS + P_PZ) (local.get $pb) (local.get $z))
      (!put f32 @(PLAYERS + P_VX) (local.get $pb) (f32.const 0))
      (!put f32 @(PLAYERS + P_VY) (local.get $pb) (f32.const 0))
      (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (f32.const 0))
      (!put u8 @(PLAYERS + P_FL) (local.get $pb) (i32.or (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @PF_GROUND)))
      (return)))
  (local.set $r (call $b_rad (local.get $pb)))
  (local.set $cx (f32.load offset=@PG_CX (local.get $d)))
  (local.set $hx (f32.load offset=@(PG_H + SO_HX) (local.get $d)))
  (local.set $hz (f32.load offset=@(PG_H + SO_HZ) (local.get $d)))
  (local.set $gw (f32.load offset=@(PG_H + SO_GW) (local.get $d)))
  (local.set $cn (f32.load offset=@(PG_H + SO_CN) (local.get $d)))
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
      ;; in a goal's box: its sides, its back, its roof
      (if (f32.gt (local.get $az) (f32.sub (local.get $gw) (local.get $r)))
        (then (local.set $az (f32.sub (local.get $gw) (local.get $r))) (local.set $ch (i32.const 1))
              (if (f32.gt (local.get $vz) (f32.const 0)) (then (local.set $vz (f32.mul (local.get $vz) (f32.const @(-SO_PE))))))))
      (if (f32.gt (local.get $ax) (f32.sub (f32.add (local.get $hx) (f32.const @SO_GD)) (local.get $r)))
        (then (local.set $ax (f32.sub (f32.add (local.get $hx) (f32.const @SO_GD)) (local.get $r))) (local.set $ch (i32.const 1))
              (if (f32.gt (local.get $vx) (f32.const 0)) (then (local.set $vx (f32.mul (local.get $vx) (f32.const @(-SO_PE))))))))
      (if (f32.gt (!madd (local.get $r) (f32.const 2) (local.get $h)) (f32.const @SO_GH))
        (then
          (!put f32 @(PLAYERS + P_PY) (local.get $pb) (f32.sub (f32.const @(+PLAT_Y + SO_GH)) (f32.mul (local.get $r) (f32.const 2))))
          (if (f32.gt (!at f32 @(PLAYERS + P_VY) (local.get $pb)) (f32.const 0)) (then (!put f32 @(PLAYERS + P_VY) (local.get $pb) (f32.const 0)))))))
    (else
      (if (f32.gt (local.get $ax) (local.get $hx))
        (then
          ;; behind an end wall outside the mouth: back onto the pitch
          (local.set $ax (f32.sub (local.get $hx) (local.get $r))) (local.set $ch (i32.const 1))
          (if (f32.gt (local.get $vx) (f32.const 0)) (then (local.set $vx (f32.mul (local.get $vx) (f32.const @(-SO_PE)))))))
        (else
          ;; the corner's chamfer, the side wall, the end wall beside the mouth or over the bar
          (local.set $q (f32.add (f32.sub (f32.add (local.get $ax) (local.get $az)) (f32.sub (f32.add (local.get $hx) (local.get $hz)) (local.get $cn)))
                                 (f32.mul (local.get $r) (f32.const @(Math.SQRT2)))))
          (if (f32.gt (local.get $q) (f32.const 0))
            (then
              (local.set $ax (f32.sub (local.get $ax) (f32.mul (local.get $q) (f32.const 0.5))))
              (local.set $az (f32.sub (local.get $az) (f32.mul (local.get $q) (f32.const 0.5))))
              (local.set $ch (i32.const 1))
              (local.set $q (f32.mul (f32.add (local.get $vx) (local.get $vz)) (f32.const 0.5)))
              (if (f32.gt (local.get $q) (f32.const 0))
                (then
                  (local.set $vx (f32.sub (local.get $vx) (f32.mul (local.get $q) (f32.const @(1 + SO_PE)))))
                  (local.set $vz (f32.sub (local.get $vz) (f32.mul (local.get $q) (f32.const @(1 + SO_PE)))))))))
          (if (f32.gt (local.get $az) (f32.sub (local.get $hz) (local.get $r)))
            (then (local.set $az (f32.sub (local.get $hz) (local.get $r))) (local.set $ch (i32.const 1))
                  (if (f32.gt (local.get $vz) (f32.const 0)) (then (local.set $vz (f32.mul (local.get $vz) (f32.const @(-SO_PE))))))))
          (if (i32.and (f32.gt (local.get $ax) (f32.sub (local.get $hx) (local.get $r)))
                       (i32.or (f32.ge (local.get $az) (local.get $gw)) (f32.gt (!madd (local.get $r) (f32.const 2) (local.get $h)) (f32.const @SO_GH))))
            (then (local.set $ax (f32.sub (local.get $hx) (local.get $r))) (local.set $ch (i32.const 1))
                  (if (f32.gt (local.get $vx) (f32.const 0)) (then (local.set $vx (f32.mul (local.get $vx) (f32.const @(-SO_PE))))))))))))
  ;; the post, a circle on the floor
  (local.set $dx (f32.sub (local.get $ax) (local.get $hx)))
  (local.set $dz (f32.sub (local.get $az) (local.get $gw)))
  (local.set $dd (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))))
  (if (i32.and (f32.lt (local.get $dd) (f32.mul (f32.add (local.get $r) (f32.const @SO_FR)) (f32.add (local.get $r) (f32.const @SO_FR))))
               (f32.gt (local.get $dd) (f32.const 0)))
    (then
      (local.set $dd (f32.sqrt (local.get $dd)))
      (local.set $dx (f32.div (local.get $dx) (local.get $dd)))
      (local.set $dz (f32.div (local.get $dz) (local.get $dd)))
      (local.set $ax (!madd (local.get $dx) (f32.add (local.get $r) (f32.const @SO_FR)) (local.get $hx)))
      (local.set $az (!madd (local.get $dz) (f32.add (local.get $r) (f32.const @SO_FR)) (local.get $gw)))
      (local.set $ch (i32.const 1))
      (local.set $q (!madd (local.get $vx) (local.get $dx) (f32.mul (local.get $vz) (local.get $dz))))
      (if (f32.lt (local.get $q) (f32.const 0))
        (then
          (local.set $q (f32.mul (local.get $q) (f32.const @(1 + SO_PE))))
          (local.set $vx (f32.sub (local.get $vx) (f32.mul (local.get $q) (local.get $dx))))
          (local.set $vz (f32.sub (local.get $vz) (f32.mul (local.get $q) (local.get $dz))))))))
  (if (local.get $ch)
    (then
      (!chk (local.get $ax) 382 (local.get $p))
      (!chk (local.get $az) 383 (local.get $p))
      (!put f32 @(PLAYERS + P_PX) (local.get $pb) (!madd (local.get $sx) (local.get $ax) (local.get $cx)))
      (!put f32 @(PLAYERS + P_PZ) (local.get $pb) (!madd (local.get $sz) (local.get $az) (local.get $cx)))))
  (!put f32 @(PLAYERS + P_VX) (local.get $pb) (f32.mul (local.get $vx) (local.get $sx)))
  (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (f32.mul (local.get $vz) (local.get $sz))))

;; Football k touched by the balls in play, in slot order, on tick t into
;; play: each whose centre is within its radius plus SO_R of the football's
;; puts it back out to touching, round the ball and level with it, and if
;; closing kicks it (the header's comment says how); a counted touch (one
;; a ball every SO_RECOUNT at most), a save, the side's last toucher.
(func $so_touch (param $k i32) (param $t i32)
  (local $b i32) (local $q i32) (local $qb i32) (local $side i32) (local $air i32) (local $keep i32) (local $save i32) (local $cnt i32) (local $sb i32)
  (local $cx f32) (local $hx f32) (local $gw f32) (local $dir f32)
  (local $fx f32) (local $fy f32) (local $fz f32) (local $vx f32) (local $vy f32) (local $vz f32)
  (local $r f32) (local $rs f32) (local $bx f32) (local $bh f32) (local $bz f32) (local $bvx f32) (local $bvz f32) (local $bsp f32)
  (local $dx f32) (local $dy f32) (local $dz f32) (local $hd f32) (local $nx f32) (local $nz f32) (local $kx f32) (local $kz f32)
  (local $vrel f32) (local $bn f32) (local $e f32) (local $kmin f32) (local $sep f32) (local $tl f32)
  (local.set $b (call $so_b (local.get $k)))
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (local.set $hx (f32.load (i32.const @(PG_H + SO_HX))))
  (local.set $gw (f32.load (i32.const @(PG_H + SO_GW))))
  (!for $q (i32.const 0) (i32.const @NPLAYER)
    (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
    (if (call $p_in (local.get $qb))
      (then
        (local.set $fx (f32.load offset=@SO_FX (local.get $b)))
        (local.set $fy (f32.load offset=@SO_FY (local.get $b)))
        (local.set $fz (f32.load offset=@SO_FZ (local.get $b)))
        (local.set $r (call $b_rad (local.get $qb)))
        (local.set $rs (f32.add (local.get $r) (f32.const @SO_R)))
        (local.set $bx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $qb)) (local.get $cx)))
        (local.set $bz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $qb)) (local.get $cx)))
        (local.set $dx (f32.sub (local.get $fx) (local.get $bx)))
        (local.set $dz (f32.sub (local.get $fz) (local.get $bz)))
        (if (i32.and (f32.lt (f32.abs (local.get $dx)) (local.get $rs)) (f32.lt (f32.abs (local.get $dz)) (local.get $rs)))
          (then
            (local.set $bh (f32.add (f32.sub (!at f32 @(PLAYERS + P_PY) (local.get $qb)) (f32.const @PLAT_Y)) (local.get $r)))
            (local.set $dy (f32.sub (local.get $fy) (local.get $bh)))
            (if (f32.lt (!dot3 (local.get $dx) (local.get $dy) (local.get $dz) (local.get $dx) (local.get $dy) (local.get $dz)) (f32.mul (local.get $rs) (local.get $rs)))
              (then
                (local.set $side (call $p_side (local.get $qb)))
                (local.set $dir (call $so_dir (local.get $side)))
                (local.set $vx (f32.load offset=@SO_FVX (local.get $b)))
                (local.set $vy (f32.load offset=@SO_FVY (local.get $b)))
                (local.set $vz (f32.load offset=@SO_FVZ (local.get $b)))
                (local.set $bvx (!at f32 @(PLAYERS + P_VX) (local.get $qb)))
                (local.set $bvz (!at f32 @(PLAYERS + P_VZ) (local.get $qb)))
                (local.set $bsp (f32.sqrt (!madd (local.get $bvx) (local.get $bvx) (f32.mul (local.get $bvz) (local.get $bvz)))))
                ;; the line between them, level: on top of it, the way the ball rolls, or standing, toward the other goal
                (local.set $hd (f32.sqrt (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz)))))
                (if (f32.gt (local.get $hd) (f32.const 0.01))
                  (then (local.set $nx (f32.div (local.get $dx) (local.get $hd))) (local.set $nz (f32.div (local.get $dz) (local.get $hd))))
                  (else
                    (if (f32.gt (local.get $bsp) (f32.const 0.1))
                      (then (local.set $nx (f32.div (local.get $bvx) (local.get $bsp))) (local.set $nz (f32.div (local.get $bvz) (local.get $bsp))))
                      (else (local.set $nx (f32.neg (local.get $dir))) (local.set $nz (f32.const 0))))))
                ;; out to touching, round the ball
                (local.set $hd (f32.sqrt (f32.sub (f32.mul (local.get $rs) (local.get $rs)) (f32.mul (local.get $dy) (local.get $dy)))))
                (local.set $fx (!madd (local.get $nx) (local.get $hd) (local.get $bx)))
                (local.set $fz (!madd (local.get $nz) (local.get $hd) (local.get $bz)))
                ;; a keeper: in its own box (or its own net), touching it on the side toward its goal
                (local.set $keep (i32.and (i32.and (f32.gt (f32.mul (local.get $bx) (local.get $dir)) (f32.sub (local.get $hx) (f32.load (i32.const @(PG_H + SO_BOXD)))))
                                                   (f32.lt (f32.abs (local.get $bz)) (f32.load (i32.const @(PG_H + SO_BOXHW)))))
                                          (f32.lt (f32.mul (local.get $nx) (local.get $dir)) (f32.const 0))))
                ;; a save: a keeper's touch on one coming at its goal's mouth
                (local.set $save (i32.const 0))
                (if (i32.and (local.get $keep) (f32.gt (f32.mul (local.get $vx) (local.get $dir)) (f32.const @SO_SAVEV)))
                  (then
                    (local.set $tl (f32.div (f32.sub (f32.mul (local.get $hx) (local.get $dir)) (local.get $fx)) (local.get $vx)))
                    (local.set $save (f32.lt (f32.abs (!madd (local.get $vz) (local.get $tl) (local.get $fz))) (f32.add (local.get $gw) (f32.const @SO_R))))))
                (local.set $air (i32.eqz (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $qb)) (i32.const @PF_GROUND))))
                (local.set $bn (!madd (local.get $bvx) (local.get $nx) (f32.mul (local.get $bvz) (local.get $nz))))
                (local.set $vrel (f32.sub (local.get $bn) (!madd (local.get $vx) (local.get $nx) (f32.mul (local.get $vz) (local.get $nz)))))
                (if (f32.gt (local.get $vrel) (f32.const 0))
                  (then
                    (local.set $e (select (f32.const @SO_KEEPE) (select (f32.const @SO_AIRE) (f32.const @SO_E) (local.get $air)) (local.get $keep)))
                    ;; the kick's way: the line between them, turned toward where the ball rolls if it rolls into it
                    (local.set $kx (local.get $nx))
                    (local.set $kz (local.get $nz))
                    (if (i32.and (f32.gt (local.get $bsp) (f32.const 0.5)) (f32.gt (local.get $bn) (f32.const 0)))
                      (then
                        (local.set $kx (!madd (f32.div (local.get $bvx) (local.get $bsp)) (f32.const @SO_AIM) (local.get $nx)))
                        (local.set $kz (!madd (f32.div (local.get $bvz) (local.get $bsp)) (f32.const @SO_AIM) (local.get $nz)))
                        (local.set $tl (f32.sqrt (!madd (local.get $kx) (local.get $kx) (f32.mul (local.get $kz) (local.get $kz)))))
                        (local.set $kx (f32.div (local.get $kx) (local.get $tl)))
                        (local.set $kz (f32.div (local.get $kz) (local.get $tl)))))
                    (local.set $vrel (f32.mul (local.get $vrel) (f32.add (local.get $e) (f32.const 1))))
                    (local.set $vx (!madd (local.get $vrel) (local.get $kx) (local.get $vx)))
                    (local.set $vz (!madd (local.get $vrel) (local.get $kz) (local.get $vz)))
                    (if (local.get $air)
                      (then (local.set $vy (f32.max (local.get $vy) (f32.min (!madd (local.get $bsp) (f32.const @SO_CHIPK) (f32.const @SO_CHIP0)) (f32.const @SO_CHIPMAX))))))
                    (if (local.get $keep) (then (local.set $vy (f32.max (local.get $vy) (f32.const @SO_KEEPUP)))))))
                ;; off it at least kmin faster than the ball comes on
                (local.set $kmin (select (f32.const @SO_KEEPMIN) (f32.const @SO_KMIN) (local.get $keep)))
                (local.set $sep (f32.sub (!madd (local.get $vx) (local.get $nx) (f32.mul (local.get $vz) (local.get $nz))) (f32.max (local.get $bn) (f32.const 0))))
                (if (f32.lt (local.get $sep) (local.get $kmin))
                  (then
                    (local.set $sep (f32.sub (local.get $kmin) (local.get $sep)))
                    (local.set $vx (!madd (local.get $sep) (local.get $nx) (local.get $vx)))
                    (local.set $vz (!madd (local.get $sep) (local.get $nz) (local.get $vz)))))
                (!chk (local.get $vx) 384 (local.get $k))
                (!chk (local.get $vz) 385 (local.get $k))
                (f32.store offset=@SO_FX (local.get $b) (local.get $fx))
                (f32.store offset=@SO_FZ (local.get $b) (local.get $fz))
                (f32.store offset=@SO_FVX (local.get $b) (local.get $vx))
                (f32.store offset=@SO_FVY (local.get $b) (local.get $vy))
                (f32.store offset=@SO_FVZ (local.get $b) (local.get $vz))
                ;; the score: a touch counts unless its own last counted one on it is too fresh
                (local.set $sb (call $so_s (local.get $q)))
                (local.set $cnt (i32.ge_s (i32.sub (local.get $t) (i32.load offset=@SO_NEXT (local.get $sb))) (i32.const 0)))
                (if (local.get $cnt)
                  (then
                    (i32.store offset=@SO_NEXT (local.get $sb) (i32.add (local.get $t) (i32.const @SO_RECOUNT)))
                    (i32.store16 offset=@SO_TOUCHES (local.get $sb) (i32.add (i32.load16_u offset=@SO_TOUCHES (local.get $sb)) (i32.const 1)))
                    (!put u16 @(PLAYERS + PG_SCORE) (local.get $qb) (i32.add (!at u16 @(PLAYERS + PG_SCORE) (local.get $qb)) (i32.const @SO_PT_TOUCH)))))
                ;; a save counts as a touch does, once a SO_RECOUNT
                (local.set $save (i32.and (local.get $save) (local.get $cnt)))
                (if (local.get $save)
                  (then
                    (i32.store16 offset=@SO_SAVES (local.get $sb) (i32.add (i32.load16_u offset=@SO_SAVES (local.get $sb)) (i32.const 1)))
                    (!put u16 @(PLAYERS + PG_SCORE) (local.get $qb) (i32.add (!at u16 @(PLAYERS + PG_SCORE) (local.get $qb)) (i32.const @SO_PT_SAVE)))))
                (i32.store8 offset=@SO_FBY (local.get $b) (local.get $q))
                (i32.store8 offset=@SO_FLAST (i32.add (local.get $b) (local.get $side)) (local.get $q))
                (i32.store offset=@SO_FSAT (i32.add (local.get $b) (i32.shl (local.get $side) (i32.const 2))) (local.get $t))
                (i32.store offset=@SO_FAT (local.get $b) (local.get $t))
                (if (i32.or (i32.or (local.get $cnt) (local.get $save)) (f32.gt (local.get $vrel) (f32.const 4)))
                  (then
                    (call $fx (i32.const 0) (i32.const @SO_FX_TOUCH) (local.get $q)
                              (i32.or (i32.or (local.get $k) (i32.shl (local.get $air) (i32.const 8))) (i32.or (i32.shl (local.get $keep) (i32.const 9)) (i32.shl (local.get $save) (i32.const 10))))
                              (f32.add (local.get $fx) (local.get $cx)) (f32.add (local.get $fy) (f32.const @PLAT_Y)) (f32.add (local.get $fz) (local.get $cx))
                              (f32.sqrt (!dot3 (local.get $vx) (local.get $vy) (local.get $vz) (local.get $vx) (local.get $vy) (local.get $vz))))))))))))))

;; Football k a goal for side s on tick t into play: SO_PT_GOAL of its own to
;; s's last toucher (if still in the room); an own goal, nobody's, if the
;; other side's ball touched it last and s hasn't in SO_OWNT. It is gone
;; SO_GONE, and with one football everyone's kickoff is called for then,
;; each ball's rank among its side in its PG_M.
(func $so_goal (param $k i32) (param $s i32) (param $t i32)
  (local $b i32) (local $by i32) (local $sc i32) (local $own i32) (local $p i32) (local $pb i32) (local $fl i32) (local $n0 i32) (local $n1 i32)
  (local.set $b (call $so_b (local.get $k)))
  (local.set $by (i32.load8_u offset=@SO_FBY (local.get $b)))
  (local.set $sc (i32.load8_u offset=@SO_FLAST (i32.add (local.get $b) (local.get $s))))
  (if (i32.lt_u (local.get $by) (i32.const @NPLAYER))
    (then
      (local.set $own (i32.and (i32.ne (call $p_side (i32.shl (local.get $by) (i32.const 6))) (local.get $s))
                               (i32.or (i32.ge_u (local.get $sc) (i32.const @NPLAYER))
                                       (i32.ge_s (i32.sub (local.get $t) (i32.load offset=@SO_FSAT (i32.add (local.get $b) (i32.shl (local.get $s) (i32.const 2)))))
                                                 (i32.const @SO_OWNT)))))))
  (call $p_tadd (local.get $s) (i32.const 1))
  (if (local.get $own)
    (then
      (local.set $sc (local.get $by))
      (i32.store16 offset=@SO_OWN (call $so_s (local.get $by)) (i32.add (i32.load16_u offset=@SO_OWN (call $so_s (local.get $by))) (i32.const 1))))
    (else
      (if (i32.lt_u (local.get $sc) (i32.const @NPLAYER))
        (then
          (if (i32.and (!at u8 @(PLAYERS + P_FL) (i32.shl (local.get $sc) (i32.const 6))) (i32.const @PF_LIVE))
            (then
              (!put u16 @(PLAYERS + PG_SCORE) (i32.shl (local.get $sc) (i32.const 6)) (i32.add (!at u16 @(PLAYERS + PG_SCORE) (i32.shl (local.get $sc) (i32.const 6))) (i32.const @SO_PT_GOAL)))
              (i32.store16 offset=@SO_GOALS (call $so_s (local.get $sc)) (i32.add (i32.load16_u offset=@SO_GOALS (call $so_s (local.get $sc))) (i32.const 1))))
            (else (local.set $sc (i32.const 255))))))))
  (call $fx (i32.const 0) (i32.const @SO_FX_GOAL) (local.get $sc)
            (i32.or (i32.or (local.get $k) (i32.shl (local.get $s) (i32.const 8))) (i32.shl (local.get $own) (i32.const 9)))
            (f32.add (f32.load offset=@SO_FX (local.get $b)) (f32.load (i32.const @PG_CX)))
            (f32.add (f32.load offset=@SO_FY (local.get $b)) (f32.const @PLAT_Y))
            (f32.add (f32.load offset=@SO_FZ (local.get $b)) (f32.load (i32.const @PG_CX)))
            (f32.convert_i32_u (i32.load (i32.add (i32.const @PG_TSCORE) (i32.shl (local.get $s) (i32.const 2))))))
  (i32.store8 offset=@SO_FST (local.get $b) (i32.const @SO_GONE_ST))
  (i32.store offset=@SO_FNEXT (local.get $b) (i32.add (local.get $t) (i32.const @SO_GONE)))
  (f32.store offset=@SO_FVX (local.get $b) (f32.const 0))
  (f32.store offset=@SO_FVY (local.get $b) (f32.const 0))
  (f32.store offset=@SO_FVZ (local.get $b) (f32.const 0))
  (if (i32.eq (i32.load (i32.const @(PG_H + SO_NB))) (i32.const 1))
    (then
      (i32.store (i32.const @(PG_H + SO_KO)) (i32.add (local.get $t) (i32.const @SO_GONE)))
      (i32.store (i32.const @(PG_H + SO_KOGO)) (i32.add (local.get $t) (i32.const @(SO_GONE + SO_HOLD))))
      (!for $p (i32.const 0) (i32.const @NPLAYER)
        (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
        (local.set $fl (!at u8 @(PLAYERS + P_FL) (local.get $pb)))
        (if (i32.eq (i32.and (local.get $fl) (i32.const @(PF_LIVE | PF_DEAD))) (i32.const @PF_LIVE))
          (then
            (if (i32.and (local.get $fl) (i32.const @PF_BLUE))
              (then (!put i32 @(PLAYERS + PG_M) (local.get $pb) (local.get $n1)) (!inc $n1))
              (else (!put i32 @(PLAYERS + PG_M) (local.get $pb) (local.get $n0)) (!inc $n0))))))
      (i32.store (i32.const @(PG_H + SO_TN)) (i32.or (local.get $n0) (i32.shl (local.get $n1) (i32.const 16)))))))

;; Football k's flight on tick t into play: rolling on the floor (SO_ROLL)
;; or falling (SO_G, SO_AIR), at most SO_VMAX, a step; the touches; then the
;; walls, the chamfers, a goal's box through its mouth, the posts and the
;; bar, and the floor (a bounce, or settled); in a goal past its line by
;; SO_R, the other side's goal. In a quarter of the pitch at a time, as push.
(func $so_fly (param $k i32) (param $t i32)
  (local $b i32) (local $in i32)
  (local $x f32) (local $y f32) (local $z f32) (local $vx f32) (local $vy f32) (local $vz f32) (local $sp f32)
  (local $hx f32) (local $hz f32) (local $gw f32) (local $cn f32) (local $sx f32) (local $sz f32) (local $ax f32) (local $az f32) (local $q f32)
  (local $dx f32) (local $dy f32) (local $dz f32) (local $dd f32) (local $j i32)
  (local.set $b (call $so_b (local.get $k)))
  (local.set $x (f32.load offset=@SO_FX (local.get $b)))
  (local.set $y (f32.load offset=@SO_FY (local.get $b)))
  (local.set $z (f32.load offset=@SO_FZ (local.get $b)))
  (local.set $vx (f32.load offset=@SO_FVX (local.get $b)))
  (local.set $vy (f32.load offset=@SO_FVY (local.get $b)))
  (local.set $vz (f32.load offset=@SO_FVZ (local.get $b)))
  (if (i32.and (f32.le (local.get $y) (f32.const @SO_R)) (f32.eq (local.get $vy) (f32.const 0)))
    (then
      (local.set $vx (f32.mul (local.get $vx) (f32.const @SO_ROLL)))
      (local.set $vz (f32.mul (local.get $vz) (f32.const @SO_ROLL))))
    (else
      (local.set $vy (f32.sub (local.get $vy) (f32.const @SO_G)))
      (local.set $vx (f32.mul (local.get $vx) (f32.const @SO_AIR)))
      (local.set $vz (f32.mul (local.get $vz) (f32.const @SO_AIR)))))
  (local.set $sp (!dot3 (local.get $vx) (local.get $vy) (local.get $vz) (local.get $vx) (local.get $vy) (local.get $vz)))
  (if (f32.gt (local.get $sp) (f32.const @(SO_VMAX * SO_VMAX)))
    (then
      (local.set $sp (f32.div (f32.const @SO_VMAX) (f32.sqrt (local.get $sp))))
      (local.set $vx (f32.mul (local.get $vx) (local.get $sp)))
      (local.set $vy (f32.mul (local.get $vy) (local.get $sp)))
      (local.set $vz (f32.mul (local.get $vz) (local.get $sp)))))
  (local.set $x (!madd (local.get $vx) (f32.const @DT) (local.get $x)))
  (local.set $y (!madd (local.get $vy) (f32.const @DT) (local.get $y)))
  (local.set $z (!madd (local.get $vz) (f32.const @DT) (local.get $z)))
  (f32.store offset=@SO_FX (local.get $b) (local.get $x))
  (f32.store offset=@SO_FY (local.get $b) (local.get $y))
  (f32.store offset=@SO_FZ (local.get $b) (local.get $z))
  (f32.store offset=@SO_FVX (local.get $b) (local.get $vx))
  (f32.store offset=@SO_FVY (local.get $b) (local.get $vy))
  (f32.store offset=@SO_FVZ (local.get $b) (local.get $vz))
  (call $so_touch (local.get $k) (local.get $t))
  (local.set $x (f32.load offset=@SO_FX (local.get $b)))
  (local.set $z (f32.load offset=@SO_FZ (local.get $b)))
  (local.set $vx (f32.load offset=@SO_FVX (local.get $b)))
  (local.set $vy (f32.load offset=@SO_FVY (local.get $b)))
  (local.set $vz (f32.load offset=@SO_FVZ (local.get $b)))
  (local.set $hx (f32.load (i32.const @(PG_H + SO_HX))))
  (local.set $hz (f32.load (i32.const @(PG_H + SO_HZ))))
  (local.set $gw (f32.load (i32.const @(PG_H + SO_GW))))
  (local.set $cn (f32.load (i32.const @(PG_H + SO_CN))))
  (local.set $sx (f32.copysign (f32.const 1) (local.get $x)))
  (local.set $sz (f32.copysign (f32.const 1) (local.get $z)))
  (local.set $ax (f32.abs (local.get $x)))
  (local.set $az (f32.abs (local.get $z)))
  (local.set $vx (f32.mul (local.get $vx) (local.get $sx)))
  (local.set $vz (f32.mul (local.get $vz) (local.get $sz)))
  (local.set $in (i32.and (f32.gt (local.get $ax) (local.get $hx)) (f32.lt (local.get $az) (local.get $gw))))
  (if (local.get $in)
    (then
      ;; in a goal's box: the side nets, the back net, the roof
      (if (f32.gt (local.get $az) (f32.sub (local.get $gw) (f32.const @SO_R)))
        (then (local.set $az (f32.sub (local.get $gw) (f32.const @SO_R)))
              (if (f32.gt (local.get $vz) (f32.const 0)) (then (local.set $vz (f32.mul (local.get $vz) (f32.const @(-SO_NE))))))))
      (if (f32.gt (local.get $ax) (f32.add (local.get $hx) (f32.const @(SO_GD - SO_R))))
        (then (local.set $ax (f32.add (local.get $hx) (f32.const @(SO_GD - SO_R))))
              (if (f32.gt (local.get $vx) (f32.const 0)) (then (local.set $vx (f32.mul (local.get $vx) (f32.const @(-SO_NE))))))))
      (if (f32.gt (local.get $y) (f32.const @(SO_GH - SO_R)))
        (then (local.set $y (f32.const @(SO_GH - SO_R)))
              (if (f32.gt (local.get $vy) (f32.const 0)) (then (local.set $vy (f32.mul (local.get $vy) (f32.const @(-SO_NE)))))))))
    (else
      (if (f32.gt (local.get $ax) (local.get $hx))
        (then
          (local.set $ax (f32.sub (local.get $hx) (f32.const @SO_R)))
          (if (f32.gt (local.get $vx) (f32.const 0)) (then (local.set $vx (f32.mul (local.get $vx) (f32.const @(-SO_WE)))))))
        (else
          (local.set $q (f32.add (f32.sub (f32.add (local.get $ax) (local.get $az)) (f32.sub (f32.add (local.get $hx) (local.get $hz)) (local.get $cn)))
                                 (f32.const @(SO_R * Math.SQRT2))))
          (if (f32.gt (local.get $q) (f32.const 0))
            (then
              (local.set $ax (f32.sub (local.get $ax) (f32.mul (local.get $q) (f32.const 0.5))))
              (local.set $az (f32.sub (local.get $az) (f32.mul (local.get $q) (f32.const 0.5))))
              (local.set $q (f32.mul (f32.add (local.get $vx) (local.get $vz)) (f32.const 0.5)))
              (if (f32.gt (local.get $q) (f32.const 0))
                (then
                  (call $so_hit (local.get $k) (i32.const 0) (local.get $x) (local.get $y) (local.get $z) (f32.mul (local.get $q) (f32.const @(Math.SQRT2))))
                  (local.set $vx (f32.sub (local.get $vx) (f32.mul (local.get $q) (f32.const @(1 + SO_WE)))))
                  (local.set $vz (f32.sub (local.get $vz) (f32.mul (local.get $q) (f32.const @(1 + SO_WE)))))))))
          (if (f32.gt (local.get $az) (f32.sub (local.get $hz) (f32.const @SO_R)))
            (then (local.set $az (f32.sub (local.get $hz) (f32.const @SO_R)))
                  (if (f32.gt (local.get $vz) (f32.const 0))
                    (then (call $so_hit (local.get $k) (i32.const 0) (local.get $x) (local.get $y) (local.get $z) (local.get $vz))
                          (local.set $vz (f32.mul (local.get $vz) (f32.const @(-SO_WE))))))))
          (if (i32.and (f32.gt (local.get $ax) (f32.sub (local.get $hx) (f32.const @SO_R)))
                       (i32.or (f32.ge (local.get $az) (local.get $gw)) (f32.ge (local.get $y) (f32.const @SO_GH))))
            (then (local.set $ax (f32.sub (local.get $hx) (f32.const @SO_R)))
                  (if (f32.gt (local.get $vx) (f32.const 0))
                    (then (call $so_hit (local.get $k) (i32.const 0) (local.get $x) (local.get $y) (local.get $z) (local.get $vx))
                          (local.set $vx (f32.mul (local.get $vx) (f32.const @(-SO_WE))))))))))))
  ;; the frame: the post (j 0) and the bar (j 1), each the nearest point of it
  (!for $j (i32.const 0) (i32.const 2)
    (local.set $dx (f32.sub (local.get $ax) (local.get $hx)))
    (if (local.get $j)
      (then (local.set $dy (f32.sub (local.get $y) (f32.const @SO_GH)))
            (local.set $dz (f32.sub (local.get $az) (f32.min (local.get $az) (local.get $gw)))))
      (else (local.set $dy (f32.sub (local.get $y) (!clamp (local.get $y) (f32.const 0) (f32.const @SO_GH))))
            (local.set $dz (f32.sub (local.get $az) (local.get $gw)))))
    (local.set $dd (!dot3 (local.get $dx) (local.get $dy) (local.get $dz) (local.get $dx) (local.get $dy) (local.get $dz)))
    (if (i32.and (f32.lt (local.get $dd) (f32.const @((SO_R + SO_FR) * (SO_R + SO_FR)))) (f32.gt (local.get $dd) (f32.const 0)))
      (then
        (local.set $dd (f32.sqrt (local.get $dd)))
        (local.set $q (f32.sub (f32.const @(SO_R + SO_FR)) (local.get $dd)))
        (local.set $dx (f32.div (local.get $dx) (local.get $dd)))
        (local.set $dy (f32.div (local.get $dy) (local.get $dd)))
        (local.set $dz (f32.div (local.get $dz) (local.get $dd)))
        (local.set $ax (!madd (local.get $dx) (local.get $q) (local.get $ax)))
        (local.set $y (!madd (local.get $dy) (local.get $q) (local.get $y)))
        (local.set $az (!madd (local.get $dz) (local.get $q) (local.get $az)))
        (local.set $q (!dot3 (local.get $vx) (local.get $vy) (local.get $vz) (local.get $dx) (local.get $dy) (local.get $dz)))
        (if (f32.lt (local.get $q) (f32.const 0))
          (then
            (call $so_hit (local.get $k) (i32.const 1) (local.get $x) (local.get $y) (local.get $z) (f32.neg (local.get $q)))
            (local.set $q (f32.mul (local.get $q) (f32.const @(1 + SO_FRE))))
            (local.set $vx (f32.sub (local.get $vx) (f32.mul (local.get $q) (local.get $dx))))
            (local.set $vy (f32.sub (local.get $vy) (f32.mul (local.get $q) (local.get $dy))))
            (local.set $vz (f32.sub (local.get $vz) (f32.mul (local.get $q) (local.get $dz)))))))))
  ;; the floor
  (if (f32.lt (local.get $y) (f32.const @SO_R))
    (then
      (local.set $y (f32.const @SO_R))
      (if (f32.lt (local.get $vy) (f32.const @(-SO_SETTLE)))
        (then
          (local.set $vy (f32.mul (local.get $vy) (f32.const @(-SO_FE))))
          (local.set $vx (f32.mul (local.get $vx) (f32.const @SO_FH)))
          (local.set $vz (f32.mul (local.get $vz) (f32.const @SO_FH))))
        (else (local.set $vy (f32.const 0))))))
  (local.set $x (f32.mul (local.get $ax) (local.get $sx)))
  (local.set $z (f32.mul (local.get $az) (local.get $sz)))
  (local.set $vx (f32.mul (local.get $vx) (local.get $sx)))
  (local.set $vz (f32.mul (local.get $vz) (local.get $sz)))
  (!chk (local.get $x) 386 (local.get $k))
  (!chk (local.get $y) 387 (local.get $k))
  (!chk (local.get $z) 388 (local.get $k))
  (!chk (local.get $vx) 389 (local.get $k))
  (!chk (local.get $vy) 390 (local.get $k))
  (!chk (local.get $vz) 391 (local.get $k))
  (f32.store offset=@SO_FX (local.get $b) (local.get $x))
  (f32.store offset=@SO_FY (local.get $b) (local.get $y))
  (f32.store offset=@SO_FZ (local.get $b) (local.get $z))
  (f32.store offset=@SO_FVX (local.get $b) (local.get $vx))
  (f32.store offset=@SO_FVY (local.get $b) (local.get $vy))
  (f32.store offset=@SO_FVZ (local.get $b) (local.get $vz))
  ;; all the way in: the goal at high x is red's, at low x blue's
  (if (i32.and (f32.gt (local.get $ax) (f32.add (local.get $hx) (f32.const @SO_R))) (f32.lt (local.get $az) (local.get $gw)))
    (then (call $so_goal (local.get $k) (f32.lt (local.get $x) (f32.const 0)) (local.get $t)))))

;; FX_HIT for football k off a wall or a net (frame 0) or the frame (1) at
;; (x, y, z) in the pitch's coordinates, coming into it at v: only a knock
;; worth hearing.
(func $so_hit (param $k i32) (param $frame i32) (param $x f32) (param $y f32) (param $z f32) (param $v f32)
  (if (f32.gt (local.get $v) (f32.const 4))
    (then
      (call $fx (i32.const 0) (i32.const @SO_FX_HIT) (i32.const 255) (i32.or (local.get $k) (i32.shl (local.get $frame) (i32.const 8)))
                (f32.add (local.get $x) (f32.load (i32.const @PG_CX))) (f32.add (local.get $y) (f32.const @PLAT_Y)) (f32.add (local.get $z) (f32.load (i32.const @PG_CX)))
                (local.get $v)))))

;; Two live footballs that meet, a and b: apart along the line between them,
;; half each, and an exchange of SO_BBE of the speed they close at.
(func $so_pair (param $a i32) (param $c i32)
  (local $dx f32) (local $dy f32) (local $dz f32) (local $d f32) (local $q f32)
  (local.set $dx (f32.sub (f32.load offset=@SO_FX (local.get $c)) (f32.load offset=@SO_FX (local.get $a))))
  (local.set $dy (f32.sub (f32.load offset=@SO_FY (local.get $c)) (f32.load offset=@SO_FY (local.get $a))))
  (local.set $dz (f32.sub (f32.load offset=@SO_FZ (local.get $c)) (f32.load offset=@SO_FZ (local.get $a))))
  (if (i32.or (f32.ge (f32.abs (local.get $dx)) (f32.const @(2 * SO_R))) (f32.ge (f32.abs (local.get $dz)) (f32.const @(2 * SO_R)))) (then (return)))
  (local.set $d (!dot3 (local.get $dx) (local.get $dy) (local.get $dz) (local.get $dx) (local.get $dy) (local.get $dz)))
  (if (i32.or (f32.ge (local.get $d) (f32.const @(4 * SO_R * SO_R))) (f32.eq (local.get $d) (f32.const 0))) (then (return)))
  (local.set $d (f32.sqrt (local.get $d)))
  (local.set $q (f32.mul (f32.sub (f32.const @(2 * SO_R)) (local.get $d)) (f32.const 0.5)))
  (local.set $dx (f32.div (local.get $dx) (local.get $d)))
  (local.set $dy (f32.div (local.get $dy) (local.get $d)))
  (local.set $dz (f32.div (local.get $dz) (local.get $d)))
  (f32.store offset=@SO_FX (local.get $a) (f32.sub (f32.load offset=@SO_FX (local.get $a)) (f32.mul (local.get $dx) (local.get $q))))
  (f32.store offset=@SO_FY (local.get $a) (f32.max (f32.sub (f32.load offset=@SO_FY (local.get $a)) (f32.mul (local.get $dy) (local.get $q))) (f32.const @SO_R)))
  (f32.store offset=@SO_FZ (local.get $a) (f32.sub (f32.load offset=@SO_FZ (local.get $a)) (f32.mul (local.get $dz) (local.get $q))))
  (f32.store offset=@SO_FX (local.get $c) (!madd (local.get $dx) (local.get $q) (f32.load offset=@SO_FX (local.get $c))))
  (f32.store offset=@SO_FY (local.get $c) (f32.max (!madd (local.get $dy) (local.get $q) (f32.load offset=@SO_FY (local.get $c))) (f32.const @SO_R)))
  (f32.store offset=@SO_FZ (local.get $c) (!madd (local.get $dz) (local.get $q) (f32.load offset=@SO_FZ (local.get $c))))
  ;; the speed they close at, along the line
  (local.set $q (f32.sub (!dot3 (f32.load offset=@SO_FVX (local.get $a)) (f32.load offset=@SO_FVY (local.get $a)) (f32.load offset=@SO_FVZ (local.get $a)) (local.get $dx) (local.get $dy) (local.get $dz))
                         (!dot3 (f32.load offset=@SO_FVX (local.get $c)) (f32.load offset=@SO_FVY (local.get $c)) (f32.load offset=@SO_FVZ (local.get $c)) (local.get $dx) (local.get $dy) (local.get $dz))))
  (if (f32.le (local.get $q) (f32.const 0)) (then (return)))
  (local.set $q (f32.mul (local.get $q) (f32.const @((1 + SO_BBE) / 2))))
  (f32.store offset=@SO_FVX (local.get $a) (f32.sub (f32.load offset=@SO_FVX (local.get $a)) (f32.mul (local.get $q) (local.get $dx))))
  (f32.store offset=@SO_FVY (local.get $a) (f32.sub (f32.load offset=@SO_FVY (local.get $a)) (f32.mul (local.get $q) (local.get $dy))))
  (f32.store offset=@SO_FVZ (local.get $a) (f32.sub (f32.load offset=@SO_FVZ (local.get $a)) (f32.mul (local.get $q) (local.get $dz))))
  (f32.store offset=@SO_FVX (local.get $c) (!madd (local.get $q) (local.get $dx) (f32.load offset=@SO_FVX (local.get $c))))
  (f32.store offset=@SO_FVY (local.get $c) (!madd (local.get $q) (local.get $dy) (f32.load offset=@SO_FVY (local.get $c))))
  (f32.store offset=@SO_FVZ (local.get $c) (!madd (local.get $q) (local.get $dz) (f32.load offset=@SO_FVZ (local.get $c)))))

;; The footballs in order: one gone back on its spot when its time comes,
;; held let go, live flown; then each pair of live ones that meet.
(func $so_tick
  (local $t i32) (local $k i32) (local $j i32) (local $b i32) (local $st i32) (local $nb i32)
  (local.set $t (call $p_t (i32.const 0)))
  (local.set $nb (i32.load (i32.const @(PG_H + SO_NB))))
  (!for $k (i32.const 0) (local.get $nb)
    (local.set $b (call $so_b (local.get $k)))
    (local.set $st (i32.load8_u offset=@SO_FST (local.get $b)))
    (if (i32.and (i32.eq (local.get $st) (i32.const @SO_GONE_ST))
                 (i32.ge_s (i32.sub (local.get $t) (i32.load offset=@SO_FNEXT (local.get $b))) (i32.const 0)))
      (then
        (call $so_spot (local.get $k) (i32.add (local.get $t) (i32.const @SO_HOLD)))
        (call $fx (i32.const 0) (i32.const @SO_FX_SPOT) (i32.const 255) (i32.or (local.get $k) (i32.shl (i32.eq (local.get $nb) (i32.const 1)) (i32.const 8)))
                  (f32.load (i32.const @PG_CX)) (f32.const @(+PLAT_Y + SO_R)) (f32.add (f32.load offset=@SO_FZ (local.get $b)) (f32.load (i32.const @PG_CX)))
                  (f32.const @(SO_HOLD * +DT)))))
    (if (i32.and (i32.eq (local.get $st) (i32.const @SO_HELD))
                 (i32.ge_s (i32.sub (local.get $t) (i32.load offset=@SO_FNEXT (local.get $b))) (i32.const 0)))
      (then (i32.store8 offset=@SO_FST (local.get $b) (i32.const @SO_LIVE)) (local.set $st (i32.const @SO_LIVE))))
    (if (i32.eq (local.get $st) (i32.const @SO_LIVE)) (then (call $so_fly (local.get $k) (local.get $t)))))
  (!for $k (i32.const 0) (local.get $nb)
    (if (i32.eq (i32.load8_u offset=@SO_FST (call $so_b (local.get $k))) (i32.const @SO_LIVE))
      (then
        (!for $j (i32.add (local.get $k) (i32.const 1)) (local.get $nb)
          (if (i32.eq (i32.load8_u offset=@SO_FST (call $so_b (local.get $j))) (i32.const @SO_LIVE))
            (then (call $so_pair (call $so_b (local.get $k)) (call $so_b (local.get $j))))))))))

;; Over when a side has the target.
(func $so_over (result i32)
  (local $g i32)
  (local.set $g (i32.load (i32.const @(PG_H + SO_GOAL))))
  (i32.or (i32.ge_u (i32.load (i32.const @PG_TSCORE)) (local.get $g)) (i32.ge_u (i32.load (i32.const @(PG_TSCORE + 4))) (local.get $g))))

(func $so_out (param $p i32))
