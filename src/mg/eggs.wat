;; EGG RAID: red against blue (PGF_TEAMS) in a walled farmyard, a rounded
;; rectangle EG_ASP times as long as wide, EG_A0 m² and EG_AK more a ball
;; (EG_AK2 past EG_NK), its corners rounded EG_RC. Red's nest is near the
;; end at low x, blue's at high x: EG_NR0 plus EG_NRK times the root of the
;; balls in, its centre that plus EG_NIN in from the end wall, and its floor
;; rolls any ball and any loose egg on it out at EG_TILT a tick, so nobody
;; sits in a nest. Eggs, one for every ball in (EG_NMIN to EG_NMAX), lie in a
;; pile in the middle; golden ones, worth EG_GOLDV, land there EG_GOLD0 into
;; play and every EG_GOLDP after. A ball in play carrying nothing that rolls
;; over a loose egg takes it (the nearest ball, ties to the lower slot) and
;; carries it, keeping EG_SLOW of its speed a tick: 15% slower flat out.
;; Rolled into its own nest it lays it there; into the other side's carrying
;; nothing, it takes their best one, a steal. A carrier bumped hard by a foe
;; faster into the bump (its velocity jolted more than EG_HARD, 5 m/s of
;; closing) or shoved by a blast (more than EG_SHOVE) drops its egg: it pops
;; out loose, sliding EG_POPK of the jolt, keeping EG_FRIC of its speed a
;; tick and coming off the fence, nobody's for EG_LOCK and not its carrier's
;; for EG_REGRAB. A side's score (PG_TSCORE) is the value of the eggs in its
;; nest, live; the bigger nest at the clock wins, or a draw. A ball's own
;; points (PG_SCORE, how the losers place): an egg laid its value, a steal
;; EG_PT_STEAL, a foe's egg knocked loose EG_PT_KNOCK.
;;
;; The fence and the nests are fixed at setup in the header, and a carrier's
;; slowdown reads its own PG_M (the egg it carries), so the prediction rolls
;; a ball through them bit for bit. The eggs are the confirmed world's, in
;; PG_S: taking, laying, stealing and knocking loose are judged in tick on
;; the records as they stand, a ball against a shared object, and come a
;; round trip late, PG_M with them. A loose egg's slide is a function of its
;; record alone ($eg_slide), so the page slides it on to its own clock.

;; An egg's record, and a slot's.
(func $eg_e (param $k i32) (result i32)
  (i32.add (i32.const @(PG_S + EG_EGG)) (i32.mul (local.get $k) (i32.const @EG_ESIZE))))
(func $eg_s (param $p i32) (result i32)
  (i32.add (i32.const @(PG_BIG + EG_SLOT)) (i32.shl (local.get $p) (i32.const 5))))

;; Side s's way from the middle to its own nest: -1 red, 1 blue.
(func $eg_dir (param $s i32) (result f32)
  (select (f32.const 1) (f32.const -1) (local.get $s)))

;; The yard for the crowd, its corners and nests, and the pile on a
;; sunflower over the middle; the golden eggs still to come.
(func $eg_setup (param $n i32)
  (local $a f32) (local $hx f32) (local $hz f32) (local $nr f32) (local $pr f32) (local $ne i32) (local $k i32) (local $e i32) (local $x f32) (local $z f32)
  (local.set $a (!madd (f32.convert_i32_u (select (local.get $n) (i32.const @EG_NK) (i32.lt_u (local.get $n) (i32.const @EG_NK))))
                       (f32.const @EG_AK) (f32.const @EG_A0)))
  (if (i32.gt_u (local.get $n) (i32.const @EG_NK))
    (then (local.set $a (!madd (f32.convert_i32_u (i32.sub (local.get $n) (i32.const @EG_NK))) (f32.const @EG_AK2) (local.get $a)))))
  (local.set $hx (f32.mul (f32.sqrt (f32.mul (local.get $a) (f32.const @EG_ASP))) (f32.const 0.5)))
  (local.set $hz (f32.div (local.get $a) (f32.mul (local.get $hx) (f32.const 4))))
  (local.set $nr (!madd (f32.sqrt (f32.convert_i32_u (local.get $n))) (f32.const @EG_NRK) (f32.const @EG_NR0)))
  (local.set $ne (local.get $n))
  (if (i32.lt_u (local.get $ne) (i32.const @EG_NMIN)) (then (local.set $ne (i32.const @EG_NMIN))))
  (if (i32.gt_u (local.get $ne) (i32.const @EG_NMAX)) (then (local.set $ne (i32.const @EG_NMAX))))
  (local.set $pr (f32.mul (f32.sqrt (f32.convert_i32_u (local.get $ne))) (f32.const @EG_PS)))
  (!chk (local.get $hz) 440 (local.get $n))
  (i32.store (i32.const @PG_KIND) (i32.const @PK_SCORE))
  (i32.store (i32.const @PG_LEN) (i32.const @EG_LEN))
  (i32.store (i32.const @PG_FLAGS) (i32.const @(PGF_BUMPS | PGF_TEAMS)))
  (f32.store (i32.const @PG_SIZE) (local.get $hx))
  (f32.store (i32.const @(PG_H + EG_HX)) (local.get $hx))
  (f32.store (i32.const @(PG_H + EG_HZ)) (local.get $hz))
  (f32.store (i32.const @(PG_H + EG_CR)) (f32.min (f32.const @EG_RC) (f32.mul (local.get $hz) (f32.const 0.5))))
  (f32.store (i32.const @(PG_H + EG_NR)) (local.get $nr))
  (f32.store (i32.const @(PG_H + EG_NX)) (f32.sub (f32.sub (local.get $hx) (f32.const @EG_NIN)) (local.get $nr)))
  (f32.store (i32.const @(PG_H + EG_PR)) (local.get $pr))
  (i32.store (i32.const @(PG_H + EG_NE)) (local.get $ne))
  (!for $k (i32.const 0) (local.get $ne)
    (call $p_disc (local.get $k) (local.get $ne) (local.get $pr))
    (local.set $z) (local.set $x)
    (local.set $e (call $eg_e (local.get $k)))
    (i32.store8 offset=@EG_EST (local.get $e) (i32.const @EG_FREE))
    (i32.store8 offset=@EG_EBY (local.get $e) (i32.const 255))
    (i32.store8 offset=@EG_EV (local.get $e) (i32.const 1))
    (f32.store offset=@EG_EX (local.get $e) (local.get $x))
    (f32.store offset=@EG_EZ (local.get $e) (local.get $z)))
  (!for $k (local.get $ne) (i32.add (local.get $ne) (i32.const @EG_NGOLD))
    (local.set $e (call $eg_e (local.get $k)))
    (i32.store8 offset=@EG_EBY (local.get $e) (i32.const 255))
    (i32.store8 offset=@EG_EV (local.get $e) (i32.const @EG_GOLDV))))

;; As the round is laid out, ball PG_TK of its side's PG_TN in rows across
;; the yard, EG_GAP apart and each row centred, the first EG_FRONT past the
;; pile's edge and the rest back toward its nest; a newcomer in play in front
;; of its own nest, k of 1024 across.
(func $eg_spawn (param $i i32) (param $n i32) (result f32 f32 f32)
  (local $s i32) (local $k i32) (local $m i32) (local $cols i32) (local $row i32) (local $cnt i32)
  (local $dir f32) (local $hz f32) (local $cx f32)
  (local.set $s (i32.load (i32.const @PG_TSIDE)))
  (local.set $dir (call $eg_dir (local.get $s)))
  (local.set $hz (f32.load (i32.const @(PG_H + EG_HZ))))
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (if (i32.eq (i32.load (i32.const @HDR_STATE)) (i32.const @H_PLAY))
    (then
      (return
        (!madd (local.get $dir) (f32.sub (f32.load (i32.const @(PG_H + EG_NX))) (f32.add (f32.load (i32.const @(PG_H + EG_NR))) (f32.const @EG_BACK))) (local.get $cx))
        (f32.const @PLAT_Y)
        (!madd (f32.sub (f32.mul (f32.convert_i32_u (i32.and (local.get $i) (i32.const 1023))) (f32.const @(2 / 1023))) (f32.const 1))
               (f32.mul (local.get $hz) (f32.const 0.6)) (local.get $cx)))))
  (local.set $k (i32.load (i32.const @PG_TK)))
  (local.set $m (i32.and (i32.shr_u (i32.load (i32.const @PG_TN)) (i32.shl (local.get $s) (i32.const 4))) (i32.const 0xffff)))
  (local.set $cols (i32.add (i32.trunc_sat_f32_u (f32.div (f32.sub (f32.mul (local.get $hz) (f32.const 2)) (f32.const 3)) (f32.const @EG_GAP))) (i32.const 1)))
  (local.set $row (i32.div_u (local.get $k) (local.get $cols)))
  (local.set $cnt (i32.sub (local.get $m) (i32.mul (local.get $row) (local.get $cols))))
  (if (i32.or (i32.gt_s (local.get $cnt) (local.get $cols)) (i32.le_s (local.get $cnt) (i32.const 0))) (then (local.set $cnt (local.get $cols))))
  (!madd (local.get $dir)
         (!madd (f32.convert_i32_u (local.get $row)) (f32.const @EG_GAP) (f32.add (f32.load (i32.const @(PG_H + EG_PR))) (f32.const @EG_FRONT)))
         (local.get $cx))
  (f32.const @PLAT_Y)
  (!madd (f32.sub (f32.convert_i32_u (i32.rem_u (local.get $k) (local.get $cols))) (f32.mul (f32.convert_i32_s (i32.sub (local.get $cnt) (i32.const 1))) (f32.const 0.5)))
         (f32.const @EG_GAP) (local.get $cx)))

;; Slot p's velocity and hard bumps kept for the next tick's knock.
(func $eg_keep (param $p i32)
  (local $pb i32) (local $sb i32)
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (local.set $sb (call $eg_s (local.get $p)))
  (f32.store offset=@EG_SVX (local.get $sb) (!at f32 @(PLAYERS + P_VX) (local.get $pb)))
  (f32.store offset=@EG_SVZ (local.get $sb) (!at f32 @(PLAYERS + P_VZ) (local.get $pb)))
  (i32.store16 offset=@EG_SBUMPS (local.get $sb) (!at u16 @(PLAYERS + B_BUMPS) (local.get $pb))))

;; Play starts: every ball's velocity and hard bumps, for the first knock.
(func $eg_start
  (local $p i32)
  (!for $p (i32.const 0) (i32.const @NPLAYER) (call $eg_keep (local.get $p))))

(func $eg_begin (param $p i32) (param $d i32))

;; A floor without end: the fence (in push) keeps a ball in the yard.
(func $eg_ground (param $d i32) (param $x f32) (param $y f32) (param $z f32) (result f32)
  (select (f32.const @PLAT_Y) (f32.const -1000) (f32.ge (local.get $y) (f32.const @PLAT_Y))))

;; Velocity (vx, vz) at (x, z) after the nest centred at (nx, cx), nr in
;; radius, if (x, z) is on its floor: EG_TILT more straight out from its
;; middle (dead on it, toward the yard's middle at x = cx).
(func $eg_tilt (param $x f32) (param $z f32) (param $vx f32) (param $vz f32) (param $nx f32) (param $cx f32) (param $nr f32) (result f32 f32)
  (local $dx f32) (local $dz f32) (local $d f32)
  (local.set $dx (f32.sub (local.get $x) (local.get $nx)))
  (local.set $dz (f32.sub (local.get $z) (local.get $cx)))
  (local.set $d (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))))
  (if (f32.lt (local.get $d) (f32.mul (local.get $nr) (local.get $nr)))
    (then
      (if (f32.gt (local.get $d) (f32.const 1e-4))
        (then
          (local.set $d (f32.div (f32.const @EG_TILT) (f32.sqrt (local.get $d))))
          (local.set $vx (!madd (local.get $dx) (local.get $d) (local.get $vx)))
          (local.set $vz (!madd (local.get $dz) (local.get $d) (local.get $vz))))
        (else (local.set $vx (f32.add (local.get $vx) (f32.copysign (f32.const @EG_TILT) (f32.sub (local.get $cx) (local.get $nx)))))))))
  (local.get $vx) (local.get $vz))

;; A circle of radius r at (x, z) in bank d's yard moving (vx, vz), kept
;; inside the fence: its straight sides, or a corner's arc, coming off at e
;; of its speed into it. Worked a quarter of the yard at a time; what
;; touches nothing comes back as it went in.
(func $eg_fence (param $d i32) (param $x f32) (param $z f32) (param $vx f32) (param $vz f32) (param $r f32) (param $e f32) (result f32 f32 f32 f32)
  (local $cx f32) (local $hx f32) (local $hz f32) (local $cr f32) (local $ix f32) (local $iz f32) (local $lim f32)
  (local $sx f32) (local $sz f32) (local $ax f32) (local $az f32) (local $qx f32) (local $qz f32) (local $q f32) (local $ch i32)
  (local.set $cx (f32.load offset=@PG_CX (local.get $d)))
  (local.set $hx (f32.load offset=@(PG_H + EG_HX) (local.get $d)))
  (local.set $hz (f32.load offset=@(PG_H + EG_HZ) (local.get $d)))
  (local.set $cr (f32.load offset=@(PG_H + EG_CR) (local.get $d)))
  (local.set $ax (f32.sub (local.get $x) (local.get $cx)))
  (local.set $az (f32.sub (local.get $z) (local.get $cx)))
  (local.set $sx (f32.copysign (f32.const 1) (local.get $ax)))
  (local.set $sz (f32.copysign (f32.const 1) (local.get $az)))
  (local.set $ax (f32.abs (local.get $ax)))
  (local.set $az (f32.abs (local.get $az)))
  ;; the velocity outward, in this quarter
  (local.set $vx (f32.mul (local.get $vx) (local.get $sx)))
  (local.set $vz (f32.mul (local.get $vz) (local.get $sz)))
  (local.set $ix (f32.sub (local.get $hx) (local.get $cr)))
  (local.set $iz (f32.sub (local.get $hz) (local.get $cr)))
  (if (i32.and (f32.gt (local.get $ax) (local.get $ix)) (f32.gt (local.get $az) (local.get $iz)))
    (then
      ;; a corner: no further from its arc's centre than its radius less r
      (local.set $qx (f32.sub (local.get $ax) (local.get $ix)))
      (local.set $qz (f32.sub (local.get $az) (local.get $iz)))
      (local.set $q (f32.sqrt (!madd (local.get $qx) (local.get $qx) (f32.mul (local.get $qz) (local.get $qz)))))
      (local.set $lim (f32.sub (local.get $cr) (local.get $r)))
      (if (f32.gt (local.get $q) (local.get $lim))
        (then
          (local.set $qx (f32.div (local.get $qx) (local.get $q)))
          (local.set $qz (f32.div (local.get $qz) (local.get $q)))
          (local.set $ax (!madd (local.get $qx) (local.get $lim) (local.get $ix)))
          (local.set $az (!madd (local.get $qz) (local.get $lim) (local.get $iz)))
          (local.set $ch (i32.const 1))
          (local.set $q (!madd (local.get $vx) (local.get $qx) (f32.mul (local.get $vz) (local.get $qz))))
          (if (f32.gt (local.get $q) (f32.const 0))
            (then
              (local.set $q (f32.mul (local.get $q) (f32.add (local.get $e) (f32.const 1))))
              (local.set $vx (f32.sub (local.get $vx) (f32.mul (local.get $q) (local.get $qx))))
              (local.set $vz (f32.sub (local.get $vz) (f32.mul (local.get $q) (local.get $qz)))))))))
    (else
      (if (f32.gt (local.get $ax) (f32.sub (local.get $hx) (local.get $r)))
        (then
          (local.set $ax (f32.sub (local.get $hx) (local.get $r)))
          (local.set $ch (i32.const 1))
          (if (f32.gt (local.get $vx) (f32.const 0)) (then (local.set $vx (f32.mul (local.get $vx) (f32.neg (local.get $e))))))))
      (if (f32.gt (local.get $az) (f32.sub (local.get $hz) (local.get $r)))
        (then
          (local.set $az (f32.sub (local.get $hz) (local.get $r)))
          (local.set $ch (i32.const 1))
          (if (f32.gt (local.get $vz) (f32.const 0)) (then (local.set $vz (f32.mul (local.get $vz) (f32.neg (local.get $e))))))))))
  (if (local.get $ch)
    (then
      (local.set $x (!madd (local.get $sx) (local.get $ax) (local.get $cx)))
      (local.set $z (!madd (local.get $sz) (local.get $az) (local.get $cx)))))
  (local.get $x) (local.get $z) (f32.mul (local.get $vx) (local.get $sx)) (f32.mul (local.get $vz) (local.get $sz)))

;; Ball p on bank d after its roll: on the ground, either nest's floor rolls
;; it out; carrying (its PG_M), EG_SLOW of its speed kept; then the fence.
(func $eg_push (param $p i32) (param $d i32)
  (local $pb i32) (local $cx f32) (local $nx f32) (local $nr f32) (local $px f32) (local $pz f32) (local $vx f32) (local $vz f32)
  (local.set $pb (i32.add (i32.shl (local.get $p) (i32.const 6)) (local.get $d)))
  (local.set $cx (f32.load offset=@PG_CX (local.get $d)))
  (local.set $nx (f32.load offset=@(PG_H + EG_NX) (local.get $d)))
  (local.set $nr (f32.load offset=@(PG_H + EG_NR) (local.get $d)))
  (local.set $px (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
  (local.set $pz (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
  (local.set $vx (!at f32 @(PLAYERS + P_VX) (local.get $pb)))
  (local.set $vz (!at f32 @(PLAYERS + P_VZ) (local.get $pb)))
  (if (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @PF_GROUND))
    (then
      (call $eg_tilt (local.get $px) (local.get $pz) (local.get $vx) (local.get $vz) (f32.sub (local.get $cx) (local.get $nx)) (local.get $cx) (local.get $nr))
      (local.set $vz) (local.set $vx)
      (call $eg_tilt (local.get $px) (local.get $pz) (local.get $vx) (local.get $vz) (f32.add (local.get $cx) (local.get $nx)) (local.get $cx) (local.get $nr))
      (local.set $vz) (local.set $vx)))
  (if (!at i32 @(PLAYERS + PG_M) (local.get $pb))
    (then
      (local.set $vx (f32.mul (local.get $vx) (f32.const @EG_SLOW)))
      (local.set $vz (f32.mul (local.get $vz) (f32.const @EG_SLOW)))))
  (call $eg_fence (local.get $d) (local.get $px) (local.get $pz) (local.get $vx) (local.get $vz) (call $b_rad (local.get $pb)) (f32.const @EG_PE))
  (local.set $vz) (local.set $vx) (local.set $pz) (local.set $px)
  (!chk (local.get $px) 441 (local.get $p))
  (!chk (local.get $pz) 442 (local.get $p))
  (!chk (local.get $vx) 443 (local.get $p))
  (!chk (local.get $vz) 444 (local.get $p))
  (!put f32 @(PLAYERS + P_PX) (local.get $pb) (local.get $px))
  (!put f32 @(PLAYERS + P_PZ) (local.get $pb) (local.get $pz))
  (!put f32 @(PLAYERS + P_VX) (local.get $pb) (local.get $vx))
  (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (local.get $vz)))

;; Egg k loose at (x, z) sliding (vx, vz), dropped by `by` (255 none), anyone's from tick at.
(func $eg_free (param $k i32) (param $x f32) (param $z f32) (param $vx f32) (param $vz f32) (param $by i32) (param $at i32)
  (local $e i32)
  (local.set $e (call $eg_e (local.get $k)))
  (i32.store8 offset=@EG_EST (local.get $e) (i32.const @EG_FREE))
  (i32.store8 offset=@EG_EBY (local.get $e) (local.get $by))
  (i32.store offset=@EG_EAT (local.get $e) (local.get $at))
  (f32.store offset=@EG_EX (local.get $e) (local.get $x))
  (f32.store offset=@EG_EZ (local.get $e) (local.get $z))
  (f32.store offset=@EG_EVX (local.get $e) (local.get $vx))
  (f32.store offset=@EG_EVZ (local.get $e) (local.get $vz)))

;; Slot p's egg k (or none) loose on tick t into play, from its centre sliding
;; (vx, vz): nobody's for EG_LOCK, not p's for EG_REGRAB.
(func $eg_drop (param $p i32) (param $k i32) (param $vx f32) (param $vz f32) (param $t i32)
  (local $pb i32)
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (call $eg_free (local.get $k) (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (!at f32 @(PLAYERS + P_PZ) (local.get $pb))
                 (local.get $vx) (local.get $vz) (local.get $p) (i32.add (local.get $t) (i32.const @EG_LOCK)))
  (!put i32 @(PLAYERS + PG_M) (local.get $pb) (i32.const 0))
  (i32.store offset=@EG_SNEXT (call $eg_s (local.get $p)) (i32.add (local.get $t) (i32.const @EG_REGRAB))))

;; Side s's nest: the value of its eggs.
(func $eg_nest (param $s i32) (result i32)
  (local $k i32) (local $e i32) (local $v i32)
  (!for $k (i32.const 0) (i32.add (i32.load (i32.const @(PG_H + EG_NE))) (i32.const @EG_NGOLD))
    (local.set $e (call $eg_e (local.get $k)))
    (if (i32.and (i32.eq (i32.load8_u offset=@EG_EST (local.get $e)) (i32.const @EG_NEST)) (i32.eq (i32.load8_u offset=@EG_ESIDE (local.get $e)) (local.get $s)))
      (then (local.set $v (i32.add (local.get $v) (i32.load8_u offset=@EG_EV (local.get $e)))))))
  (local.get $v))

;; Is (x, z) inside side s's nest?
(func $eg_in_nest (param $s i32) (param $x f32) (param $z f32) (result i32)
  (local $dx f32) (local $dz f32) (local $nr f32)
  (local.set $dx (f32.sub (local.get $x) (!madd (call $eg_dir (local.get $s)) (f32.load (i32.const @(PG_H + EG_NX))) (f32.load (i32.const @PG_CX)))))
  (local.set $dz (f32.sub (local.get $z) (f32.load (i32.const @PG_CX))))
  (local.set $nr (f32.load (i32.const @(PG_H + EG_NR))))
  (f32.lt (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))) (f32.mul (local.get $nr) (local.get $nr))))

;; Carrier p (in play, carrying egg k) hit this tick, t into play: by a foe
;; touching it that was the faster into the bump, its velocity jolted more
;; than EG_HARD; by a blast (nobody touching it), more than EG_SHOVE level.
;; Knocked, the egg pops out sliding EG_POPK of the jolt (EG_POPMAX at most),
;; a point and a tally to the foe that knocked it.
(func $eg_knock (param $p i32) (param $k i32) (param $t i32)
  (local $pb i32) (local $sb i32) (local $q i32) (local $qb i32) (local $bump i32) (local $hit i32)
  (local $dvx f32) (local $dvz f32) (local $dv f32) (local $dx f32) (local $dz f32) (local $rs f32) (local $f f32)
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (local.set $sb (call $eg_s (local.get $p)))
  (local.set $dvx (f32.sub (!at f32 @(PLAYERS + P_VX) (local.get $pb)) (f32.load offset=@EG_SVX (local.get $sb))))
  (local.set $dvz (f32.sub (!at f32 @(PLAYERS + P_VZ) (local.get $pb)) (f32.load offset=@EG_SVZ (local.get $sb))))
  (local.set $dv (f32.sqrt (!madd (local.get $dvx) (local.get $dvx) (f32.mul (local.get $dvz) (local.get $dvz)))))
  (local.set $q (!at u8 @(PLAYERS + B_HITBY) (local.get $pb)))
  (if (i32.lt_u (local.get $q) (i32.const @NPLAYER))
    (then
      (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
      (if (call $p_in (local.get $qb))
        (then
          (local.set $dx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $qb)) (!at f32 @(PLAYERS + P_PX) (local.get $pb))))
          (local.set $dz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $qb)) (!at f32 @(PLAYERS + P_PZ) (local.get $pb))))
          (local.set $rs (f32.add (f32.add (call $b_rad (local.get $pb)) (call $b_rad (local.get $qb))) (f32.const @EG_TOUCH)))
          (local.set $bump (f32.lt (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))) (f32.mul (local.get $rs) (local.get $rs))))))))
  (if (local.get $bump)
    (then (local.set $hit (i32.and (f32.gt (local.get $dv) (f32.const @EG_HARD))
                                   (i32.eq (!at u16 @(PLAYERS + B_BUMPS) (local.get $pb)) (i32.load16_u offset=@EG_SBUMPS (local.get $sb))))))
    (else (local.set $hit (f32.gt (local.get $dv) (f32.const @EG_SHOVE)))))
  (if (i32.eqz (local.get $hit)) (then (return)))
  (local.set $f (f32.min (f32.const @EG_POPK) (f32.div (f32.const @EG_POPMAX) (local.get $dv))))
  (call $fx (i32.const 0) (i32.const @EG_FX_POP) (local.get $p)
            (i32.or (i32.or (local.get $q) (select (i32.const 0) (i32.const 256) (local.get $bump)))
                    (select (i32.const 512) (i32.const 0) (i32.gt_u (i32.load8_u offset=@EG_EV (call $eg_e (local.get $k))) (i32.const 1))))
            (!at f32 @(PLAYERS + P_PX) (local.get $pb))
            (f32.add (!at f32 @(PLAYERS + P_PY) (local.get $pb)) (f32.mul (call $b_rad (local.get $pb)) (f32.const 2)))
            (!at f32 @(PLAYERS + P_PZ) (local.get $pb))
            (local.get $dv))
  (call $eg_drop (local.get $p) (local.get $k) (f32.mul (local.get $dvx) (local.get $f)) (f32.mul (local.get $dvz) (local.get $f)) (local.get $t))
  (i32.store16 offset=@EG_SLOST (local.get $sb) (i32.add (i32.load16_u offset=@EG_SLOST (local.get $sb)) (i32.const 1)))
  (if (i32.lt_u (local.get $q) (i32.const @NPLAYER))
    (then
      (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
      (if (i32.and (i32.ne (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $qb)) (i32.const @PF_LIVE)) (i32.const 0))
                   (i32.ne (call $p_side (local.get $qb)) (call $p_side (local.get $pb))))
        (then
          (!put u16 @(PLAYERS + PG_SCORE) (local.get $qb) (i32.add (!at u16 @(PLAYERS + PG_SCORE) (local.get $qb)) (i32.const @EG_PT_KNOCK)))
          (local.set $sb (call $eg_s (local.get $q)))
          (i32.store16 offset=@EG_SKNOCKS (local.get $sb) (i32.add (i32.load16_u offset=@EG_SKNOCKS (local.get $sb)) (i32.const 1))))))))

;; Loose egg e (its record) a tick on: EG_FRIC of its speed kept, out of a
;; nest it is on, still under EG_STOP, on a step, off the fence at EG_WE.
(func $eg_slide (param $e i32)
  (local $x f32) (local $z f32) (local $vx f32) (local $vz f32) (local $cx f32) (local $nx f32) (local $nr f32)
  (local.set $x (f32.load offset=@EG_EX (local.get $e)))
  (local.set $z (f32.load offset=@EG_EZ (local.get $e)))
  (local.set $vx (f32.mul (f32.load offset=@EG_EVX (local.get $e)) (f32.const @EG_FRIC)))
  (local.set $vz (f32.mul (f32.load offset=@EG_EVZ (local.get $e)) (f32.const @EG_FRIC)))
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (local.set $nx (f32.load (i32.const @(PG_H + EG_NX))))
  (local.set $nr (f32.load (i32.const @(PG_H + EG_NR))))
  (call $eg_tilt (local.get $x) (local.get $z) (local.get $vx) (local.get $vz) (f32.sub (local.get $cx) (local.get $nx)) (local.get $cx) (local.get $nr))
  (local.set $vz) (local.set $vx)
  (call $eg_tilt (local.get $x) (local.get $z) (local.get $vx) (local.get $vz) (f32.add (local.get $cx) (local.get $nx)) (local.get $cx) (local.get $nr))
  (local.set $vz) (local.set $vx)
  (if (f32.lt (!madd (local.get $vx) (local.get $vx) (f32.mul (local.get $vz) (local.get $vz))) (f32.const @(EG_STOP * EG_STOP)))
    (then (local.set $vx (f32.const 0)) (local.set $vz (f32.const 0))))
  (local.set $x (!madd (local.get $vx) (f32.const @DT) (local.get $x)))
  (local.set $z (!madd (local.get $vz) (f32.const @DT) (local.get $z)))
  (call $eg_fence (i32.const 0) (local.get $x) (local.get $z) (local.get $vx) (local.get $vz) (f32.const @EG_R) (f32.const @EG_WE))
  (local.set $vz) (local.set $vx) (local.set $z) (local.set $x)
  (!chk (local.get $x) 445 (i32.const 0))
  (!chk (local.get $z) 446 (i32.const 0))
  (!chk (local.get $vx) 447 (i32.const 0))
  (!chk (local.get $vz) 448 (i32.const 0))
  (f32.store offset=@EG_EX (local.get $e) (local.get $x))
  (f32.store offset=@EG_EZ (local.get $e) (local.get $z))
  (f32.store offset=@EG_EVX (local.get $e) (local.get $vx))
  (f32.store offset=@EG_EVZ (local.get $e) (local.get $vz)))

;; A cell of the takers' grid, either axis: (v - cx) / EG_CELL off its low corner, held to the grid.
(func $eg_cell (param $v f32) (result i32)
  (local $c i32)
  (local.set $c (i32.trunc_sat_f32_s (f32.div (f32.sub (local.get $v) (f32.sub (f32.load (i32.const @PG_CX)) (f32.const @(EG_GN * EG_CELL / 2))))
                                              (f32.const @EG_CELL))))
  (select (i32.const 0) (select (i32.const @(EG_GN - 1)) (local.get $c) (i32.gt_s (local.get $c) (i32.const @(EG_GN - 1)))) (i32.lt_s (local.get $c) (i32.const 0))))

;; The takes, on tick t into play: the balls that may take (in play, carrying
;; nothing, low, free of a recent drop) in the grid by cell; then each loose
;; egg anyone may take, in order, to the nearest of them within reach (ties
;; to the lower slot), who carries it from then.
(func $eg_takes (param $t i32)
  (local $p i32) (local $pb i32) (local $k i32) (local $e i32) (local $cell i32) (local $gx i32) (local $gz i32) (local $i i32) (local $j i32) (local $q i32) (local $best i32) (local $ne i32)
  (local $x f32) (local $z f32) (local $dx f32) (local $dz f32) (local $d2 f32) (local $bd f32) (local $rs f32)
  (memory.fill (i32.const @(PG_BIG + EG_GRID)) (i32.const 0xff) (i32.const @(EG_GN * EG_GN * 2)))
  (local.set $p (i32.const @NPLAYER))
  (block $done
    (loop $more
      (br_if $done (i32.eqz (local.get $p)))
      (local.set $p (i32.sub (local.get $p) (i32.const 1)))
      (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
      (if (i32.and (i32.and (call $p_in (local.get $pb)) (i32.eqz (!at i32 @(PLAYERS + PG_M) (local.get $pb))))
                   (i32.and (f32.lt (!at f32 @(PLAYERS + P_PY) (local.get $pb)) (f32.const @(+PLAT_Y + EG_LOW)))
                            (i32.ge_s (i32.sub (local.get $t) (i32.load offset=@EG_SNEXT (call $eg_s (local.get $p)))) (i32.const 0))))
        (then
          (local.set $cell (i32.add (call $eg_cell (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
                                    (i32.mul (call $eg_cell (!at f32 @(PLAYERS + P_PZ) (local.get $pb))) (i32.const @EG_GN))))
          (!st u16 @(PG_BIG + EG_GNEXT) (local.get $p) (!ld u16 @(PG_BIG + EG_GRID) (local.get $cell)))
          (!st u16 @(PG_BIG + EG_GRID) (local.get $cell) (local.get $p))))
      (br $more)))
  (local.set $ne (i32.add (i32.load (i32.const @(PG_H + EG_NE))) (i32.const @EG_NGOLD)))
  (!for $k (i32.const 0) (local.get $ne)
    (local.set $e (call $eg_e (local.get $k)))
    (if (i32.and (i32.eq (i32.load8_u offset=@EG_EST (local.get $e)) (i32.const @EG_FREE))
                 (i32.ge_s (i32.sub (local.get $t) (i32.load offset=@EG_EAT (local.get $e))) (i32.const 0)))
      (then
        (local.set $x (f32.load offset=@EG_EX (local.get $e)))
        (local.set $z (f32.load offset=@EG_EZ (local.get $e)))
        (local.set $gx (call $eg_cell (local.get $x)))
        (local.set $gz (call $eg_cell (local.get $z)))
        (local.set $best (i32.const 0xffff))
        (local.set $bd (f32.const inf))
        (!for $i (select (i32.const 0) (i32.sub (local.get $gx) (i32.const 1)) (i32.eqz (local.get $gx)))
                 (select (i32.const @EG_GN) (i32.add (local.get $gx) (i32.const 2)) (i32.ge_u (local.get $gx) (i32.const @(EG_GN - 1))))
          (!for $j (select (i32.const 0) (i32.sub (local.get $gz) (i32.const 1)) (i32.eqz (local.get $gz)))
                   (select (i32.const @EG_GN) (i32.add (local.get $gz) (i32.const 2)) (i32.ge_u (local.get $gz) (i32.const @(EG_GN - 1))))
            (local.set $q (!ld u16 @(PG_BIG + EG_GRID) (i32.add (local.get $i) (i32.mul (local.get $j) (i32.const @EG_GN)))))
            (block $end
              (loop $walk
                (br_if $end (i32.eq (local.get $q) (i32.const 0xffff)))
                (local.set $pb (i32.shl (local.get $q) (i32.const 6)))
                ;; one that took an egg already this tick carries it now
                (if (i32.eqz (!at i32 @(PLAYERS + PG_M) (local.get $pb)))
                  (then
                    (local.set $dx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (local.get $x)))
                    (local.set $dz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $pb)) (local.get $z)))
                    (local.set $d2 (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))))
                    (local.set $rs (f32.add (call $b_rad (local.get $pb)) (f32.const @(EG_R + EG_GRAB))))
                    (if (i32.and (f32.lt (local.get $d2) (f32.mul (local.get $rs) (local.get $rs)))
                                 (i32.or (f32.lt (local.get $d2) (local.get $bd))
                                         (i32.and (f32.eq (local.get $d2) (local.get $bd)) (i32.lt_u (local.get $q) (local.get $best)))))
                      (then (local.set $bd (local.get $d2)) (local.set $best (local.get $q))))))
                (local.set $q (!ld u16 @(PG_BIG + EG_GNEXT) (local.get $q)))
                (br $walk)))))
        (if (i32.ne (local.get $best) (i32.const 0xffff))
          (then
            (i32.store8 offset=@EG_EST (local.get $e) (i32.const @EG_HELD))
            (i32.store8 offset=@EG_EBY (local.get $e) (local.get $best))
            (i32.store offset=@EG_EAT (local.get $e) (local.get $t))
            (!put i32 @(PLAYERS + PG_M) (i32.shl (local.get $best) (i32.const 6)) (i32.add (local.get $k) (i32.const 1)))
            (call $fx (i32.const 0) (i32.const @EG_FX_GET) (local.get $best) (local.get $k)
                      (local.get $x) (f32.const @(+PLAT_Y + EG_R)) (local.get $z)
                      (f32.convert_i32_u (i32.load8_u offset=@EG_EV (local.get $e))))))))))

;; The round's world, a tick of it: eggs whose carrier is gone (or carries
;; another) dropped where it was, its PG_M let go; the carriers hit this tick, in slot order,
;; knocked; a golden egg called, or landing in the middle; each ball in play,
;; in slot order, laying in its own nest what it carries or stealing from
;; the other the best egg there; the loose eggs slid; the takes; each side's
;; nest's value, PG_TSCORE; every ball's velocity kept for the next knock.
(func $eg_tick
  (local $t i32) (local $ne i32) (local $k i32) (local $e i32) (local $p i32) (local $pb i32) (local $q i32) (local $s i32) (local $m i32)
  (local $best i32) (local $bv i32) (local $v i32) (local $sb i32) (local $at i32) (local $cx f32)
  (local.set $t (call $p_t (i32.const 0)))
  (local.set $ne (i32.load (i32.const @(PG_H + EG_NE))))
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (!for $k (i32.const 0) (i32.add (local.get $ne) (i32.const @EG_NGOLD))
    (local.set $e (call $eg_e (local.get $k)))
    (if (i32.eq (i32.load8_u offset=@EG_EST (local.get $e)) (i32.const @EG_HELD))
      (then
        (local.set $q (i32.load8_u offset=@EG_EBY (local.get $e)))
        (local.set $pb (i32.shl (local.get $q) (i32.const 6)))
        (if (i32.or (i32.eqz (call $p_in (local.get $pb))) (i32.ne (!at i32 @(PLAYERS + PG_M) (local.get $pb)) (i32.add (local.get $k) (i32.const 1))))
          (then
            (call $eg_free (local.get $k) (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (!at f32 @(PLAYERS + P_PZ) (local.get $pb)) (f32.const 0) (f32.const 0)
                           (local.get $q) (i32.add (local.get $t) (i32.const @EG_LOCK)))
            (if (i32.eq (!at i32 @(PLAYERS + PG_M) (local.get $pb)) (i32.add (local.get $k) (i32.const 1)))
              (then (!put i32 @(PLAYERS + PG_M) (local.get $pb) (i32.const 0)))))))))
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
    (local.set $m (!at i32 @(PLAYERS + PG_M) (local.get $pb)))
    (if (i32.and (i32.and (i32.ne (local.get $m) (i32.const 0)) (call $p_in (local.get $pb)))
                 (i32.eq (!at u16 @(PLAYERS + B_HITT) (local.get $pb)) (i32.const @CREDIT_TICKS)))
      (then (call $eg_knock (local.get $p) (i32.sub (local.get $m) (i32.const 1)) (local.get $t)))))
  ;; the golden eggs: called EG_GOLDW ahead, then in the middle
  (!for $k (i32.const 0) (i32.const @EG_NGOLD)
    (local.set $at (i32.add (i32.const @EG_GOLD0) (i32.mul (local.get $k) (i32.const @EG_GOLDP))))
    (if (i32.lt_u (local.get $at) (i32.load (i32.const @PG_LEN)))
      (then
        (if (i32.eq (local.get $t) (i32.sub (local.get $at) (i32.const @EG_GOLDW)))
          (then (call $fx (i32.const 0) (i32.const @EG_FX_GOLD) (i32.const 255) (local.get $k) (local.get $cx) (f32.const @PLAT_Y) (local.get $cx) (f32.const @(EG_GOLDW * +DT)))))
        (if (i32.eq (local.get $t) (local.get $at))
          (then
            (call $eg_free (i32.add (local.get $ne) (local.get $k)) (local.get $cx) (local.get $cx) (f32.const 0) (f32.const 0) (i32.const 255) (local.get $t))
            (call $fx (i32.const 0) (i32.const @EG_FX_GOLD) (i32.const 255) (i32.or (local.get $k) (i32.const 256)) (local.get $cx) (f32.const @PLAT_Y) (local.get $cx) (f32.const 0)))))))
  ;; lays and steals
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
    (if (call $p_in (local.get $pb))
      (then
        (local.set $s (call $p_side (local.get $pb)))
        (local.set $m (!at i32 @(PLAYERS + PG_M) (local.get $pb)))
        (local.set $sb (call $eg_s (local.get $p)))
        (if (local.get $m)
          (then
            (if (call $eg_in_nest (local.get $s) (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
              (then
                (local.set $k (i32.sub (local.get $m) (i32.const 1)))
                (local.set $e (call $eg_e (local.get $k)))
                (local.set $v (i32.load8_u offset=@EG_EV (local.get $e)))
                (i32.store8 offset=@EG_EST (local.get $e) (i32.const @EG_NEST))
                (i32.store8 offset=@EG_ESIDE (local.get $e) (local.get $s))
                (i32.store8 offset=@EG_EBY (local.get $e) (local.get $p))
                (i32.store offset=@EG_EAT (local.get $e) (local.get $t))
                (!put i32 @(PLAYERS + PG_M) (local.get $pb) (i32.const 0))
                (!put u16 @(PLAYERS + PG_SCORE) (local.get $pb) (i32.add (!at u16 @(PLAYERS + PG_SCORE) (local.get $pb)) (local.get $v)))
                (i32.store16 offset=@EG_SLAID (local.get $sb) (i32.add (i32.load16_u offset=@EG_SLAID (local.get $sb)) (i32.const 1)))
                (if (i32.gt_u (local.get $v) (i32.const 1))
                  (then (i32.store16 offset=@EG_SGOLD (local.get $sb) (i32.add (i32.load16_u offset=@EG_SGOLD (local.get $sb)) (i32.const 1)))))
                (call $fx (i32.const 0) (i32.const @EG_FX_LAY) (local.get $p)
                          (i32.or (i32.or (local.get $k) (i32.shl (local.get $s) (i32.const 8))) (select (i32.const 512) (i32.const 0) (i32.gt_u (local.get $v) (i32.const 1))))
                          (!madd (call $eg_dir (local.get $s)) (f32.load (i32.const @(PG_H + EG_NX))) (local.get $cx)) (f32.const @(+PLAT_Y + EG_R)) (local.get $cx)
                          (f32.convert_i32_u (call $eg_nest (local.get $s)))))))
          (else
            (if (i32.and (i32.ge_s (i32.sub (local.get $t) (i32.load offset=@EG_SNEXT (local.get $sb))) (i32.const 0))
                         (call $eg_in_nest (i32.xor (local.get $s) (i32.const 1)) (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (!at f32 @(PLAYERS + P_PZ) (local.get $pb))))
              (then
                ;; their best egg, the first of the best
                (local.set $best (i32.const -1))
                (local.set $bv (i32.const 0))
                (!for $k (i32.const 0) (i32.add (local.get $ne) (i32.const @EG_NGOLD))
                  (local.set $e (call $eg_e (local.get $k)))
                  (if (i32.and (i32.and (i32.eq (i32.load8_u offset=@EG_EST (local.get $e)) (i32.const @EG_NEST))
                                        (i32.ne (i32.load8_u offset=@EG_ESIDE (local.get $e)) (local.get $s)))
                               (i32.gt_u (i32.load8_u offset=@EG_EV (local.get $e)) (local.get $bv)))
                    (then (local.set $best (local.get $k)) (local.set $bv (i32.load8_u offset=@EG_EV (local.get $e))))))
                (if (i32.ge_s (local.get $best) (i32.const 0))
                  (then
                    (local.set $e (call $eg_e (local.get $best)))
                    (i32.store8 offset=@EG_EST (local.get $e) (i32.const @EG_HELD))
                    (i32.store8 offset=@EG_EBY (local.get $e) (local.get $p))
                    (i32.store offset=@EG_EAT (local.get $e) (local.get $t))
                    (f32.store offset=@EG_EX (local.get $e) (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
                    (f32.store offset=@EG_EZ (local.get $e) (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
                    (!put i32 @(PLAYERS + PG_M) (local.get $pb) (i32.add (local.get $best) (i32.const 1)))
                    (!put u16 @(PLAYERS + PG_SCORE) (local.get $pb) (i32.add (!at u16 @(PLAYERS + PG_SCORE) (local.get $pb)) (i32.const @EG_PT_STEAL)))
                    (i32.store16 offset=@EG_SSTEALS (local.get $sb) (i32.add (i32.load16_u offset=@EG_SSTEALS (local.get $sb)) (i32.const 1)))
                    (call $fx (i32.const 0) (i32.const @EG_FX_GET) (local.get $p) (i32.or (local.get $best) (i32.const 256))
                              (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (f32.const @(+PLAT_Y + EG_R)) (!at f32 @(PLAYERS + P_PZ) (local.get $pb))
                              (f32.convert_i32_u (local.get $bv))))))))))))
  (!for $k (i32.const 0) (i32.add (local.get $ne) (i32.const @EG_NGOLD))
    (local.set $e (call $eg_e (local.get $k)))
    (if (i32.eq (i32.load8_u offset=@EG_EST (local.get $e)) (i32.const @EG_FREE)) (then (call $eg_slide (local.get $e)))))
  (call $eg_takes (local.get $t))
  (i32.store (i32.const @PG_TSCORE) (call $eg_nest (i32.const 0)))
  (i32.store (i32.const @(PG_TSCORE + 4)) (call $eg_nest (i32.const 1)))
  (!for $p (i32.const 0) (i32.const @NPLAYER) (call $eg_keep (local.get $p))))

;; At the clock.
(func $eg_over (result i32) (i32.const 0))

;; A ball down (it can't fall out of the yard, but one that did) drops what it carries, still.
(func $eg_out (param $p i32)
  (local $m i32) (local $e i32)
  (local.set $m (!at i32 @(PLAYERS + PG_M) (i32.shl (local.get $p) (i32.const 6))))
  (if (i32.eqz (local.get $m)) (then (return)))
  (local.set $e (call $eg_e (i32.sub (local.get $m) (i32.const 1))))
  (if (i32.and (i32.eq (i32.load8_u offset=@EG_EST (local.get $e)) (i32.const @EG_HELD)) (i32.eq (i32.load8_u offset=@EG_EBY (local.get $e)) (local.get $p)))
    (then (call $eg_drop (local.get $p) (i32.sub (local.get $m) (i32.const 1)) (f32.const 0) (f32.const 0) (call $p_t (i32.const 0))))
    (else (!put i32 @(PLAYERS + PG_M) (i32.shl (local.get $p) (i32.const 6)) (i32.const 0)))))
