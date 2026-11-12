;; ROUND UP: sheepdog trials, red against blue (PGF_TEAMS), in a fenced
;; meadow, a rounded rectangle HD_ASP times as long as wide, HD_A0 m² and
;; HD_AK more a ball (HD_AK2 past HD_NK), its corners rounded HD_RC. A pen
;; stands behind each end fence, red's at low x, blue's at high x, and the
;; end fence is open in the middle, the pen's mouth: a sheep driven along
;; the end runs in. A flock, a sheep for every ball in (HD_NMIN to
;; HD_NMAX), grazes in the middle. A sheep runs from every ball in within
;; HD_SCARE of it, straight away from each, HD_FLEE m/s at no distance and
;; nothing at HD_SCARE, the pushes summed: a ball herds by getting behind it,
;; and two sides on one sheep pull it both ways. It takes HD_ALIGN of its
;; neighbours' mean velocity, wanders to their middle when no ball is near,
;; parts from a sheep it overlaps and leans in off the fence. A sheep HD_INM
;; past an end's line is that pen's for good: its value to the side's score
;; (PG_TSCORE, live) and to each ball of that side scaring it as it went in
;; (PG_SCORE, how the losers place). A golden ram, quicker and worth HD_RAMV
;; (HD_NRAM of them from HD_RAMN balls: an odd number either way, so an even
;; flock all penned is never a draw), comes on in the middle HD_RAM0 into
;; play and every HD_RAMP after, called HD_RAMW ahead; at once if the meadow
;; is empty. A click barks, HD_BARKCD apart: for HD_BARKT ticks the barker
;; scares HD_BARKK times as far and as hard. The other side's mouth is shut
;; to a ball, and the ground about it rolls the ball away at HD_TILT a tick.
;; The round is over when nothing is left to pen, or at the clock; the fuller
;; pen wins, or a draw.
;;
;; The fence and the pens are fixed at setup in the header, a ball's side is
;; in its own record and its bark in its own PG_M, so the prediction rolls a
;; ball along the fence and through a mouth bit for bit. The sheep are the
;; confirmed world's, in PG_S, stepped in tick in their order, each against
;; the balls in a grid rebuilt that tick (a cell's balls in slot order) and
;; the sheep as they stand; they never move a ball.

;; A sheep's record.
(func $hd_s (param $k i32) (result i32)
  (i32.add (i32.const @PG_S) (i32.shl (local.get $k) (i32.const 5))))

;; Side s's way from the middle to its own pen: -1 red, 1 blue.
(func $hd_dir (param $s i32) (result f32)
  (select (f32.const 1) (f32.const -1) (local.get $s)))

;; The meadow for the crowd, its pens, and the flock over the middle, half of
;; it on a sunflower and half opposite, so neither side has the nearer
;; sheep; the rams still to come.
(func $hd_setup (param $n i32)
  (local $a f32) (local $hx f32) (local $hz f32) (local $rt f32) (local $pw f32) (local $gw f32) (local $fr f32)
  (local $ns i32) (local $nr i32) (local $k i32) (local $e i32) (local $x f32) (local $z f32)
  (local.set $a (!madd (f32.convert_i32_u (select (local.get $n) (i32.const @HD_NK) (i32.lt_u (local.get $n) (i32.const @HD_NK))))
                       (f32.const @HD_AK) (f32.const @HD_A0)))
  (if (i32.gt_u (local.get $n) (i32.const @HD_NK))
    (then (local.set $a (!madd (f32.convert_i32_u (i32.sub (local.get $n) (i32.const @HD_NK))) (f32.const @HD_AK2) (local.get $a)))))
  (local.set $hx (f32.mul (f32.sqrt (f32.mul (local.get $a) (f32.const @HD_ASP))) (f32.const 0.5)))
  (local.set $hz (f32.div (local.get $a) (f32.mul (local.get $hx) (f32.const 4))))
  (local.set $rt (f32.sqrt (f32.convert_i32_u (local.get $n))))
  (local.set $pw (!madd (local.get $rt) (f32.const @HD_PWK) (f32.const @HD_PW0)))
  (local.set $gw (f32.mul (local.get $pw) (f32.const @HD_GK)))
  (local.set $ns (local.get $n))
  (if (i32.lt_u (local.get $ns) (i32.const @HD_NMIN)) (then (local.set $ns (i32.const @HD_NMIN))))
  (if (i32.gt_u (local.get $ns) (i32.const @HD_NMAX)) (then (local.set $ns (i32.const @HD_NMAX))))
  (local.set $fr (f32.mul (f32.sqrt (f32.convert_i32_u (local.get $ns))) (f32.const @HD_PS)))
  (!chk (local.get $hz) 520 (local.get $n))
  (i32.store (i32.const @PG_KIND) (i32.const @PK_SCORE))
  (i32.store (i32.const @PG_LEN) (i32.const @HD_LEN))
  (i32.store (i32.const @PG_FLAGS) (i32.const @(PGF_BUMPS | PGF_TEAMS)))
  (f32.store (i32.const @PG_SIZE) (local.get $hx))
  (f32.store (i32.const @(PG_H + HD_HX)) (local.get $hx))
  (f32.store (i32.const @(PG_H + HD_HZ)) (local.get $hz))
  (f32.store (i32.const @(PG_H + HD_CR)) (f32.min (f32.const @HD_RC) (f32.mul (local.get $hz) (f32.const 0.5))))
  (f32.store (i32.const @(PG_H + HD_PW)) (local.get $pw))
  (f32.store (i32.const @(PG_H + HD_PD)) (!madd (local.get $rt) (f32.const @HD_PDK) (f32.const @HD_PD0)))
  (f32.store (i32.const @(PG_H + HD_GW)) (local.get $gw))
  (f32.store (i32.const @(PG_H + HD_AR)) (f32.add (local.get $gw) (f32.const @HD_APR)))
  (f32.store (i32.const @(PG_H + HD_FR)) (local.get $fr))
  (i32.store (i32.const @(PG_H + HD_NS)) (local.get $ns))
  (local.set $nr (select (i32.const @HD_NRAM) (i32.const 1) (i32.ge_u (local.get $n) (i32.const @HD_RAMN))))
  (i32.store (i32.const @(PG_H + HD_NR)) (local.get $nr))
  (i32.store (i32.const @(PG_H + HD_LEFT)) (i32.add (local.get $ns) (local.get $nr)))
  (!for $k (i32.const 0) (local.get $ns)
    ;; an even sheep on the sunflower, the odd one after it opposite it through the middle; a last one alone, in the middle
    (if (i32.and (local.get $k) (i32.const 1))
      (then
        (local.set $x (f32.sub (f32.mul (f32.load (i32.const @PG_CX)) (f32.const 2)) (local.get $x)))
        (local.set $z (f32.sub (f32.mul (f32.load (i32.const @PG_CX)) (f32.const 2)) (local.get $z))))
      (else
        (call $p_disc (i32.shr_u (local.get $k) (i32.const 1)) (i32.shr_u (local.get $ns) (i32.const 1)) (local.get $fr))
        (local.set $z) (local.set $x)
        (if (i32.eq (i32.add (local.get $k) (i32.const 1)) (local.get $ns))
          (then (local.set $x (f32.load (i32.const @PG_CX))) (local.set $z (local.get $x))))))
    (local.set $e (call $hd_s (local.get $k)))
    (i32.store8 offset=@HD_ST (local.get $e) (i32.const @HD_LOOSE))
    (i32.store8 offset=@HD_SBY (local.get $e) (i32.const 255))
    (i32.store8 offset=@HD_SV (local.get $e) (i32.const 1))
    (f32.store offset=@HD_SX (local.get $e) (local.get $x))
    (f32.store offset=@HD_SZ (local.get $e) (local.get $z)))
  (!for $k (i32.const 0) (local.get $nr)
    (local.set $e (call $hd_s (i32.add (local.get $ns) (local.get $k))))
    (i32.store8 offset=@HD_SBY (local.get $e) (i32.const 255))
    (i32.store8 offset=@HD_SV (local.get $e) (i32.const @HD_RAMV))
    (i32.store offset=@HD_SAT (local.get $e) (i32.add (i32.const @HD_RAM0) (i32.mul (local.get $k) (i32.const @HD_RAMP))))))

;; As the round is laid out, ball PG_TK of its side's PG_TN in rows across
;; the meadow, HD_GAP apart and each row centred, the first HD_FRONT past the
;; flock's edge and the rest back toward its pen; a newcomer in play in front
;; of its own pen's mouth, k of 1024 across.
(func $hd_spawn (param $i i32) (param $n i32) (result f32 f32 f32)
  (local $s i32) (local $k i32) (local $m i32) (local $cols i32) (local $row i32) (local $cnt i32)
  (local $dir f32) (local $hz f32) (local $cx f32)
  (local.set $s (i32.load (i32.const @PG_TSIDE)))
  (local.set $dir (call $hd_dir (local.get $s)))
  (local.set $hz (f32.load (i32.const @(PG_H + HD_HZ))))
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (if (i32.eq (i32.load (i32.const @HDR_STATE)) (i32.const @H_PLAY))
    (then
      (return
        (!madd (local.get $dir) (f32.sub (f32.load (i32.const @(PG_H + HD_HX))) (f32.const @HD_BACK)) (local.get $cx))
        (f32.const @PLAT_Y)
        (!madd (f32.sub (f32.mul (f32.convert_i32_u (i32.and (local.get $i) (i32.const 1023))) (f32.const @(2 / 1023))) (f32.const 1))
               (f32.mul (local.get $hz) (f32.const 0.6)) (local.get $cx)))))
  (local.set $k (i32.load (i32.const @PG_TK)))
  (local.set $m (i32.and (i32.shr_u (i32.load (i32.const @PG_TN)) (i32.shl (local.get $s) (i32.const 4))) (i32.const 0xffff)))
  (local.set $cols (i32.add (i32.trunc_sat_f32_u (f32.div (f32.sub (f32.mul (local.get $hz) (f32.const 2)) (f32.const 3)) (f32.const @HD_GAP))) (i32.const 1)))
  (local.set $row (i32.div_u (local.get $k) (local.get $cols)))
  (local.set $cnt (i32.sub (local.get $m) (i32.mul (local.get $row) (local.get $cols))))
  (if (i32.or (i32.gt_s (local.get $cnt) (local.get $cols)) (i32.le_s (local.get $cnt) (i32.const 0))) (then (local.set $cnt (local.get $cols))))
  (!madd (local.get $dir)
         (!madd (f32.convert_i32_u (local.get $row)) (f32.const @HD_GAP) (f32.add (f32.load (i32.const @(PG_H + HD_FR))) (f32.const @HD_FRONT)))
         (local.get $cx))
  (f32.const @PLAT_Y)
  (!madd (f32.sub (f32.convert_i32_u (i32.rem_u (local.get $k) (local.get $cols))) (f32.mul (f32.convert_i32_s (i32.sub (local.get $cnt) (i32.const 1))) (f32.const 0.5)))
         (f32.const @HD_GAP) (local.get $cx)))

(func $hd_start)

;; Play starts for ball p on bank d: in the round, the press it has made already taken.
(func $hd_begin (param $p i32) (param $d i32)
  (local $pb i32)
  (local.set $pb (i32.add (i32.shl (local.get $p) (i32.const 6)) (local.get $d)))
  (!put i32 @(PLAYERS + PG_M) (local.get $pb)
    (i32.or (i32.const @HD_M_IN) (i32.and (i32.shr_u (!at i32 @(PLAYERS + P_IN) (local.get $pb)) (i32.const 29)) (i32.const 3)))))

;; A floor without end: the fence (in push) keeps a ball in the meadow.
(func $hd_ground (param $d i32) (param $x f32) (param $y f32) (param $z f32) (result f32)
  (select (f32.const @PLAT_Y) (f32.const -1000) (f32.ge (local.get $y) (f32.const @PLAT_Y))))

;; A circle of radius r at (ax, az), a quarter's own coordinates, moving (vx,
;; vz), off a post or a run of fence whose nearest point to it is (bx, bz):
;; out to r from that point, the way it lies from it (dead on it, back
;; toward the middle along x), its speed into it turned to e of it out. The
;; last result is 1 if it touched.
(func $hd_off (param $ax f32) (param $az f32) (param $vx f32) (param $vz f32) (param $bx f32) (param $bz f32) (param $r f32) (param $e f32) (result f32 f32 f32 f32 i32)
  (local $qx f32) (local $qz f32) (local $q f32)
  (local.set $qx (f32.sub (local.get $ax) (local.get $bx)))
  (local.set $qz (f32.sub (local.get $az) (local.get $bz)))
  (local.set $q (!madd (local.get $qx) (local.get $qx) (f32.mul (local.get $qz) (local.get $qz))))
  (if (f32.ge (local.get $q) (f32.mul (local.get $r) (local.get $r)))
    (then (return (local.get $ax) (local.get $az) (local.get $vx) (local.get $vz) (i32.const 0))))
  (if (f32.gt (local.get $q) (f32.const 1e-8))
    (then
      (local.set $q (f32.sqrt (local.get $q)))
      (local.set $qx (f32.div (local.get $qx) (local.get $q)))
      (local.set $qz (f32.div (local.get $qz) (local.get $q))))
    (else (local.set $qx (f32.const -1)) (local.set $qz (f32.const 0))))
  (local.set $q (!madd (local.get $vx) (local.get $qx) (f32.mul (local.get $vz) (local.get $qz))))
  (if (f32.lt (local.get $q) (f32.const 0))
    (then
      (local.set $q (f32.mul (local.get $q) (f32.add (local.get $e) (f32.const 1))))
      (local.set $vx (f32.sub (local.get $vx) (f32.mul (local.get $q) (local.get $qx))))
      (local.set $vz (f32.sub (local.get $vz) (f32.mul (local.get $q) (local.get $qz))))))
  (!madd (local.get $qx) (local.get $r) (local.get $bx))
  (!madd (local.get $qz) (local.get $r) (local.get $bz))
  (local.get $vx) (local.get $vz) (i32.const 1))

;; A circle of radius r at (x, z) in bank d's meadow moving (vx, vz), kept
;; inside the fence and the pens, coming off them at e of its speed in. In
;; the meadow: its straight sides, or a corner's arc; its ends too, but for
;; a mouth's opening (HD_GW either side of the middle), where it comes off
;; the mouth's post instead. The mouth of side shut's pen (0 red's, 1 blue's,
;; 2 neither) is fence like the rest. Past an end's line it is in that pen:
;; inside its back and its sides, and off the end fence's inside beside the
;; mouth. Worked a quarter of the meadow at a time; what touches nothing
;; comes back as it went in.
(func $hd_fence (param $d i32) (param $x f32) (param $z f32) (param $vx f32) (param $vz f32) (param $r f32) (param $e f32) (param $shut i32) (result f32 f32 f32 f32)
  (local $cx f32) (local $hx f32) (local $hz f32) (local $cr f32) (local $ix f32) (local $iz f32) (local $lim f32) (local $lo f32) (local $pw f32)
  (local $sx f32) (local $sz f32) (local $ax f32) (local $az f32) (local $qx f32) (local $qz f32) (local $q f32) (local $ch i32) (local $hit i32)
  (local.set $cx (f32.load offset=@PG_CX (local.get $d)))
  (local.set $hx (f32.load offset=@(PG_H + HD_HX) (local.get $d)))
  (local.set $hz (f32.load offset=@(PG_H + HD_HZ) (local.get $d)))
  (local.set $cr (f32.load offset=@(PG_H + HD_CR) (local.get $d)))
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
  ;; this end's mouth: open from the middle out to lo
  (local.set $lo (f32.load offset=@(PG_H + HD_GW) (local.get $d)))
  (if (i32.eq (local.get $shut) (f32.gt (local.get $sx) (f32.const 0))) (then (local.set $lo (f32.const 0))))
  (if (f32.gt (local.get $ax) (local.get $hx))
    (then
      ;; in the pen
      (local.set $pw (f32.load offset=@(PG_H + HD_PW) (local.get $d)))
      (local.set $lim (f32.sub (f32.add (local.get $hx) (f32.load offset=@(PG_H + HD_PD) (local.get $d))) (local.get $r)))
      (if (f32.gt (local.get $ax) (local.get $lim))
        (then
          (local.set $ax (local.get $lim))
          (local.set $ch (i32.const 1))
          (if (f32.gt (local.get $vx) (f32.const 0)) (then (local.set $vx (f32.mul (local.get $vx) (f32.neg (local.get $e))))))))
      (if (f32.gt (local.get $az) (f32.sub (local.get $pw) (local.get $r)))
        (then
          (local.set $az (f32.sub (local.get $pw) (local.get $r)))
          (local.set $ch (i32.const 1))
          (if (f32.gt (local.get $vz) (f32.const 0)) (then (local.set $vz (f32.mul (local.get $vz) (f32.neg (local.get $e))))))))
      (call $hd_off (local.get $ax) (local.get $az) (local.get $vx) (local.get $vz)
                    (local.get $hx) (f32.min (f32.max (local.get $az) (local.get $lo)) (local.get $pw)) (local.get $r) (local.get $e))
      (local.set $hit) (local.set $vz) (local.set $vx) (local.set $az) (local.set $ax)
      (local.set $ch (i32.or (local.get $ch) (local.get $hit))))
    (else
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
          (if (f32.lt (local.get $az) (local.get $lo))
            (then
              ;; in the mouth's opening: only its post
              (call $hd_off (local.get $ax) (local.get $az) (local.get $vx) (local.get $vz) (local.get $hx) (local.get $lo) (local.get $r) (local.get $e))
              (local.set $ch) (local.set $vz) (local.set $vx) (local.set $az) (local.set $ax))
            (else
              (if (f32.gt (local.get $ax) (f32.sub (local.get $hx) (local.get $r)))
                (then
                  (local.set $ax (f32.sub (local.get $hx) (local.get $r)))
                  (local.set $ch (i32.const 1))
                  (if (f32.gt (local.get $vx) (f32.const 0)) (then (local.set $vx (f32.mul (local.get $vx) (f32.neg (local.get $e))))))))))
          (if (f32.gt (local.get $az) (f32.sub (local.get $hz) (local.get $r)))
            (then
              (local.set $az (f32.sub (local.get $hz) (local.get $r)))
              (local.set $ch (i32.const 1))
              (if (f32.gt (local.get $vz) (f32.const 0)) (then (local.set $vz (f32.mul (local.get $vz) (f32.neg (local.get $e))))))))))))
  (if (local.get $ch)
    (then
      (local.set $x (!madd (local.get $sx) (local.get $ax) (local.get $cx)))
      (local.set $z (!madd (local.get $sz) (local.get $az) (local.get $cx)))))
  (local.get $x) (local.get $z) (f32.mul (local.get $vx) (local.get $sx)) (f32.mul (local.get $vz) (local.get $sz)))

;; Ball p on bank d after its roll. A press of use (new to the round, only
;; its counter) HD_BARKCD or more after its last bark is a bark from this
;; tick. On the ground about the other side's mouth, rolled straight away
;; from the mouth's middle; then the fence and the pens, that mouth shut.
(func $hd_push (param $p i32) (param $d i32)
  (local $pb i32) (local $m i32) (local $ctr i32) (local $t i32) (local $last i32) (local $s i32)
  (local $cx f32) (local $mx f32) (local $ar f32) (local $dx f32) (local $dz f32) (local $q f32)
  (local $px f32) (local $pz f32) (local $vx f32) (local $vz f32) (local $r f32)
  (local.set $pb (i32.add (i32.shl (local.get $p) (i32.const 6)) (local.get $d)))
  (local.set $m (!at i32 @(PLAYERS + PG_M) (local.get $pb)))
  (local.set $ctr (i32.and (i32.shr_u (!at i32 @(PLAYERS + P_IN) (local.get $pb)) (i32.const 29)) (i32.const 3)))
  (if (i32.eqz (i32.and (local.get $m) (i32.const @HD_M_IN)))
    (then (local.set $m (i32.or (i32.const @HD_M_IN) (local.get $ctr))))
    (else
      (if (i32.ne (local.get $ctr) (i32.and (local.get $m) (i32.const 3)))
        (then
          (local.set $m (i32.or (i32.and (local.get $m) (i32.const -4)) (local.get $ctr)))
          (local.set $t (i32.add (call $p_t (local.get $d)) (i32.const 1)))
          (local.set $last (i32.shr_u (local.get $m) (i32.const 16)))
          (if (i32.or (i32.eqz (local.get $last)) (i32.ge_s (i32.sub (local.get $t) (local.get $last)) (i32.const @HD_BARKCD)))
            (then (local.set $m (i32.or (i32.and (local.get $m) (i32.const 0xffff)) (i32.shl (local.get $t) (i32.const 16))))))))))
  (!put i32 @(PLAYERS + PG_M) (local.get $pb) (local.get $m))
  (local.set $s (call $p_side (local.get $pb)))
  (local.set $cx (f32.load offset=@PG_CX (local.get $d)))
  (local.set $px (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
  (local.set $pz (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
  (local.set $vx (!at f32 @(PLAYERS + P_VX) (local.get $pb)))
  (local.set $vz (!at f32 @(PLAYERS + P_VZ) (local.get $pb)))
  (if (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @PF_GROUND))
    (then
      ;; the other side's mouth, its middle
      (local.set $mx (!madd (call $hd_dir (i32.xor (local.get $s) (i32.const 1))) (f32.load offset=@(PG_H + HD_HX) (local.get $d)) (local.get $cx)))
      (local.set $ar (f32.load offset=@(PG_H + HD_AR) (local.get $d)))
      (local.set $dx (f32.sub (local.get $px) (local.get $mx)))
      (local.set $dz (f32.sub (local.get $pz) (local.get $cx)))
      (local.set $q (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))))
      (if (f32.lt (local.get $q) (f32.mul (local.get $ar) (local.get $ar)))
        (then
          (if (f32.gt (local.get $q) (f32.const 1e-4))
            (then
              (local.set $q (f32.div (f32.const @HD_TILT) (f32.sqrt (local.get $q))))
              (local.set $vx (!madd (local.get $dx) (local.get $q) (local.get $vx)))
              (local.set $vz (!madd (local.get $dz) (local.get $q) (local.get $vz))))
            (else (local.set $vx (f32.add (local.get $vx) (f32.copysign (f32.const @HD_TILT) (f32.sub (local.get $cx) (local.get $mx)))))))))))
  (local.set $r (call $b_rad (local.get $pb)))
  (call $hd_fence (local.get $d) (local.get $px) (local.get $pz) (local.get $vx) (local.get $vz) (local.get $r) (f32.const @HD_PE) (i32.xor (local.get $s) (i32.const 1)))
  (local.set $vz) (local.set $vx) (local.set $pz) (local.set $px)
  (!chk (local.get $px) 521 (local.get $p))
  (!chk (local.get $pz) 522 (local.get $p))
  (!chk (local.get $vx) 523 (local.get $p))
  (!chk (local.get $vz) 524 (local.get $p))
  (!put f32 @(PLAYERS + P_PX) (local.get $pb) (local.get $px))
  (!put f32 @(PLAYERS + P_PZ) (local.get $pb) (local.get $pz))
  (!put f32 @(PLAYERS + P_VX) (local.get $pb) (local.get $vx))
  (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (local.get $vz)))

;; A cell of the balls' grid, either axis: (v - cx) / HD_CELL off its low corner, held to the grid.
(func $hd_cell (param $v f32) (result i32)
  (local $c i32)
  (local.set $c (i32.trunc_sat_f32_s (f32.div (f32.sub (local.get $v) (f32.sub (f32.load (i32.const @PG_CX)) (f32.const @(HD_GN * HD_CELL / 2))))
                                              (f32.const @HD_CELL))))
  (select (i32.const 0) (select (i32.const @(HD_GN - 1)) (local.get $c) (i32.gt_s (local.get $c) (i32.const @(HD_GN - 1)))) (i32.lt_s (local.get $c) (i32.const 0))))

;; HD_BARKK if the ball at record pb is barking on tick t into play, else 1.
(func $hd_bark (param $pb i32) (param $t i32) (result f32)
  (local $last i32)
  (local.set $last (i32.shr_u (!at i32 @(PLAYERS + PG_M) (local.get $pb)) (i32.const 16)))
  (select (f32.const @HD_BARKK) (f32.const 1)
          (i32.and (i32.ne (local.get $last) (i32.const 0))
                   (i32.lt_s (i32.sub (i32.add (local.get $t) (i32.const 1)) (local.get $last)) (i32.const @HD_BARKT)))))

;; Sheep k (its record e) through side s's mouth on tick t into play: that
;; pen's for good, its value to the side and to each ball of the side in that
;; was scaring it, the nearest of them (ties to the lower slot) its driver.
(func $hd_pen (param $k i32) (param $e i32) (param $s i32) (param $t i32)
  (local $v i32) (local $j i32) (local $n i32) (local $e2 i32) (local $gx i32) (local $gz i32) (local $i i32) (local $q i32) (local $qb i32) (local $best i32)
  (local $x f32) (local $z f32) (local $dx f32) (local $dz f32) (local $d2 f32) (local $bd f32) (local $r f32) (local $cx f32)
  (local.set $v (i32.load8_u offset=@HD_SV (local.get $e)))
  (local.set $x (f32.load offset=@HD_SX (local.get $e)))
  (local.set $z (f32.load offset=@HD_SZ (local.get $e)))
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (!for $j (i32.const 0) (i32.add (i32.load (i32.const @(PG_H + HD_NS))) (i32.load (i32.const @(PG_H + HD_NR))))
    (local.set $e2 (call $hd_s (local.get $j)))
    (if (i32.and (i32.eq (i32.load8_u offset=@HD_ST (local.get $e2)) (i32.const @HD_PENNED)) (i32.eq (i32.load8_u offset=@HD_SSIDE (local.get $e2)) (local.get $s)))
      (then (!inc $n))))
  (local.set $best (i32.const 255))
  (local.set $bd (f32.const inf))
  (local.set $gx (call $hd_cell (local.get $x)))
  (local.set $gz (call $hd_cell (local.get $z)))
  (!for $i (select (i32.const 0) (i32.sub (local.get $gx) (i32.const 1)) (i32.eqz (local.get $gx)))
           (select (i32.const @HD_GN) (i32.add (local.get $gx) (i32.const 2)) (i32.ge_u (local.get $gx) (i32.const @(HD_GN - 1))))
    (!for $j (select (i32.const 0) (i32.sub (local.get $gz) (i32.const 1)) (i32.eqz (local.get $gz)))
             (select (i32.const @HD_GN) (i32.add (local.get $gz) (i32.const 2)) (i32.ge_u (local.get $gz) (i32.const @(HD_GN - 1))))
      (local.set $q (!ld u16 @(PG_BIG + HD_GRID) (i32.add (local.get $i) (i32.mul (local.get $j) (i32.const @HD_GN)))))
      (block $end
        (loop $walk
          (br_if $end (i32.eq (local.get $q) (i32.const 0xffff)))
          (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
          (if (i32.eq (call $p_side (local.get $qb)) (local.get $s))
            (then
              (local.set $r (f32.mul (select (f32.const @HD_RSCARE) (f32.const @HD_SCARE) (i32.gt_u (local.get $v) (i32.const 1))) (call $hd_bark (local.get $qb) (local.get $t))))
              (local.set $dx (f32.sub (local.get $x) (!at f32 @(PLAYERS + P_PX) (local.get $qb))))
              (local.set $dz (f32.sub (local.get $z) (!at f32 @(PLAYERS + P_PZ) (local.get $qb))))
              (local.set $d2 (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))))
              (if (f32.lt (local.get $d2) (f32.mul (local.get $r) (local.get $r)))
                (then
                  (!put u16 @(PLAYERS + PG_SCORE) (local.get $qb) (i32.add (!at u16 @(PLAYERS + PG_SCORE) (local.get $qb)) (local.get $v)))
                  (if (i32.or (f32.lt (local.get $d2) (local.get $bd))
                              (i32.and (f32.eq (local.get $d2) (local.get $bd)) (i32.lt_u (local.get $q) (local.get $best))))
                    (then (local.set $bd (local.get $d2)) (local.set $best (local.get $q))))))))
          (local.set $q (!ld u16 @(PG_BIG + HD_GNEXT) (local.get $q)))
          (br $walk)))))
  (i32.store8 offset=@HD_ST (local.get $e) (i32.const @HD_PENNED))
  (i32.store8 offset=@HD_SSIDE (local.get $e) (local.get $s))
  (i32.store8 offset=@HD_SBY (local.get $e) (local.get $best))
  (i32.store offset=@HD_SAT (local.get $e) (local.get $t))
  (i32.store16 offset=@HD_SJ (local.get $e) (local.get $n))
  (f32.store offset=@HD_SVX (local.get $e) (f32.const 0))
  (f32.store offset=@HD_SVZ (local.get $e) (f32.const 0))
  (call $p_tadd (local.get $s) (local.get $v))
  (call $fx (i32.const 0) (i32.const @HD_FX_PEN) (local.get $best)
            (i32.or (i32.or (local.get $k) (i32.shl (local.get $s) (i32.const 8))) (select (i32.const 512) (i32.const 0) (i32.gt_u (local.get $v) (i32.const 1))))
            (!madd (call $hd_dir (local.get $s)) (f32.load (i32.const @(PG_H + HD_HX))) (local.get $cx)) (f32.const @PLAT_Y) (local.get $cx)
            (f32.convert_i32_u (i32.load (i32.add (i32.const @PG_TSCORE) (i32.shl (local.get $s) (i32.const 2)))))))

;; Loose sheep k (its record e) a tick on, t into play, among total: what it
;; wants (away from the balls near, with its neighbours, apart from them, in
;; off the fence) held to its top speed, its velocity HD_EASE of the way
;; there, a step, off the fence HD_KEEP out; past an end's line, penned.
(func $hd_step (param $k i32) (param $e i32) (param $t i32) (param $total i32)
  (local $gx i32) (local $gz i32) (local $i i32) (local $j i32) (local $q i32) (local $qb i32) (local $e2 i32) (local $m i32) (local $ram i32)
  (local $x f32) (local $z f32) (local $vx f32) (local $vz f32) (local $r f32) (local $bk f32) (local $dx f32) (local $dz f32) (local $d2 f32) (local $w f32)
  (local $fx f32) (local $fz f32) (local $wx f32) (local $wz f32) (local $ax f32) (local $az f32) (local $mx f32) (local $mz f32) (local $cx f32) (local $g f32) (local $vm f32)
  (local.set $x (f32.load offset=@HD_SX (local.get $e)))
  (local.set $z (f32.load offset=@HD_SZ (local.get $e)))
  (local.set $vx (f32.load offset=@HD_SVX (local.get $e)))
  (local.set $vz (f32.load offset=@HD_SVZ (local.get $e)))
  (local.set $ram (i32.gt_u (i32.load8_u offset=@HD_SV (local.get $e)) (i32.const 1)))
  (local.set $cx (f32.load (i32.const @PG_CX)))
  ;; the balls near: each pushes straight away, harder the closer
  (local.set $gx (call $hd_cell (local.get $x)))
  (local.set $gz (call $hd_cell (local.get $z)))
  (!for $i (select (i32.const 0) (i32.sub (local.get $gx) (i32.const 1)) (i32.eqz (local.get $gx)))
           (select (i32.const @HD_GN) (i32.add (local.get $gx) (i32.const 2)) (i32.ge_u (local.get $gx) (i32.const @(HD_GN - 1))))
    (!for $j (select (i32.const 0) (i32.sub (local.get $gz) (i32.const 1)) (i32.eqz (local.get $gz)))
             (select (i32.const @HD_GN) (i32.add (local.get $gz) (i32.const 2)) (i32.ge_u (local.get $gz) (i32.const @(HD_GN - 1))))
      (local.set $q (!ld u16 @(PG_BIG + HD_GRID) (i32.add (local.get $i) (i32.mul (local.get $j) (i32.const @HD_GN)))))
      (block $end
        (loop $walk
          (br_if $end (i32.eq (local.get $q) (i32.const 0xffff)))
          (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
          (local.set $bk (call $hd_bark (local.get $qb) (local.get $t)))
          (local.set $r (f32.mul (select (f32.const @HD_RSCARE) (f32.const @HD_SCARE) (local.get $ram)) (local.get $bk)))
          (local.set $dx (f32.sub (local.get $x) (!at f32 @(PLAYERS + P_PX) (local.get $qb))))
          (local.set $dz (f32.sub (local.get $z) (!at f32 @(PLAYERS + P_PZ) (local.get $qb))))
          (local.set $d2 (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))))
          (if (i32.and (f32.lt (local.get $d2) (f32.mul (local.get $r) (local.get $r))) (f32.gt (local.get $d2) (f32.const 1e-6)))
            (then
              (local.set $w (f32.sqrt (local.get $d2)))
              (local.set $w (f32.div (f32.mul (f32.mul (select (f32.const @HD_RFLEE) (f32.const @HD_FLEE) (local.get $ram)) (local.get $bk)) (f32.sub (local.get $r) (local.get $w)))
                                     (f32.mul (local.get $r) (local.get $w))))
              (local.set $fx (!madd (local.get $dx) (local.get $w) (local.get $fx)))
              (local.set $fz (!madd (local.get $dz) (local.get $w) (local.get $fz)))))
          (local.set $q (!ld u16 @(PG_BIG + HD_GNEXT) (local.get $q)))
          (br $walk)))))
  (local.set $wx (local.get $fx))
  (local.set $wz (local.get $fz))
  ;; its neighbours: their mean velocity and middle; apart from any it overlaps
  (!for $j (i32.const 0) (local.get $total)
    (local.set $e2 (call $hd_s (local.get $j)))
    (if (i32.and (i32.ne (local.get $j) (local.get $k)) (i32.eq (i32.load8_u offset=@HD_ST (local.get $e2)) (i32.const @HD_LOOSE)))
      (then
        (local.set $dx (f32.sub (local.get $x) (f32.load offset=@HD_SX (local.get $e2))))
        (local.set $dz (f32.sub (local.get $z) (f32.load offset=@HD_SZ (local.get $e2))))
        (local.set $d2 (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))))
        (if (f32.lt (local.get $d2) (f32.const @(HD_NEAR * HD_NEAR)))
          (then
            (!inc $m)
            (local.set $ax (f32.add (local.get $ax) (f32.load offset=@HD_SVX (local.get $e2))))
            (local.set $az (f32.add (local.get $az) (f32.load offset=@HD_SVZ (local.get $e2))))
            (local.set $mx (f32.sub (local.get $mx) (local.get $dx)))
            (local.set $mz (f32.sub (local.get $mz) (local.get $dz)))
            (if (i32.and (f32.lt (local.get $d2) (f32.const @(4 * HD_SR * HD_SR))) (f32.gt (local.get $d2) (f32.const 1e-6)))
              (then
                (local.set $w (f32.sqrt (local.get $d2)))
                (local.set $w (f32.div (f32.mul (f32.const @HD_SEPK) (f32.sub (f32.const @(2 * HD_SR)) (local.get $w))) (local.get $w)))
                (local.set $wx (!madd (local.get $dx) (local.get $w) (local.get $wx)))
                (local.set $wz (!madd (local.get $dz) (local.get $w) (local.get $wz))))))))))
  (if (local.get $m)
    (then
      (local.set $w (f32.div (f32.const 1) (f32.convert_i32_u (local.get $m))))
      (local.set $wx (!madd (f32.mul (local.get $ax) (local.get $w)) (f32.const @HD_ALIGN) (local.get $wx)))
      (local.set $wz (!madd (f32.mul (local.get $az) (local.get $w)) (f32.const @HD_ALIGN) (local.get $wz)))
      ;; no ball near: a wander to their middle, (mx, mz) / m from here
      (if (i32.and (f32.eq (local.get $fx) (f32.const 0)) (f32.eq (local.get $fz) (f32.const 0)))
        (then
          (local.set $mx (f32.mul (local.get $mx) (local.get $w)))
          (local.set $mz (f32.mul (local.get $mz) (local.get $w)))
          (local.set $g (f32.sqrt (!madd (local.get $mx) (local.get $mx) (f32.mul (local.get $mz) (local.get $mz)))))
          (if (f32.gt (local.get $g) (f32.const 1e-3))
            (then
              (local.set $g (f32.div (f32.min (f32.mul (local.get $g) (f32.const @HD_COH)) (f32.const @HD_GRAZE)) (local.get $g)))
              (local.set $wx (!madd (local.get $mx) (local.get $g) (local.get $wx)))
              (local.set $wz (!madd (local.get $mz) (local.get $g) (local.get $wz)))))))))
  ;; in off the fence, either way (an end's only beside its mouth)
  (local.set $g (f32.sub (f32.load (i32.const @(PG_H + HD_HX))) (f32.abs (f32.sub (local.get $x) (local.get $cx)))))
  (if (i32.and (f32.lt (local.get $g) (f32.const @HD_SHY)) (f32.ge (f32.abs (f32.sub (local.get $z) (local.get $cx))) (f32.load (i32.const @(PG_H + HD_GW)))))
    (then (local.set $wx (f32.sub (local.get $wx) (f32.copysign (f32.mul (f32.sub (f32.const @HD_SHY) (local.get $g)) (f32.const @(HD_SHYV / HD_SHY))) (f32.sub (local.get $x) (local.get $cx)))))))
  (local.set $g (f32.sub (f32.load (i32.const @(PG_H + HD_HZ))) (f32.abs (f32.sub (local.get $z) (local.get $cx)))))
  (if (f32.lt (local.get $g) (f32.const @HD_SHY))
    (then (local.set $wz (f32.sub (local.get $wz) (f32.copysign (f32.mul (f32.sub (f32.const @HD_SHY) (local.get $g)) (f32.const @(HD_SHYV / HD_SHY))) (f32.sub (local.get $z) (local.get $cx)))))))
  (local.set $vm (select (f32.const @HD_RVMAX) (f32.const @HD_VMAX) (local.get $ram)))
  (local.set $g (!madd (local.get $wx) (local.get $wx) (f32.mul (local.get $wz) (local.get $wz))))
  (if (f32.gt (local.get $g) (f32.mul (local.get $vm) (local.get $vm)))
    (then
      (local.set $g (f32.div (local.get $vm) (f32.sqrt (local.get $g))))
      (local.set $wx (f32.mul (local.get $wx) (local.get $g)))
      (local.set $wz (f32.mul (local.get $wz) (local.get $g)))))
  (local.set $vx (!madd (f32.sub (local.get $wx) (local.get $vx)) (f32.const @HD_EASE) (local.get $vx)))
  (local.set $vz (!madd (f32.sub (local.get $wz) (local.get $vz)) (f32.const @HD_EASE) (local.get $vz)))
  (local.set $x (!madd (local.get $vx) (f32.const @DT) (local.get $x)))
  (local.set $z (!madd (local.get $vz) (f32.const @DT) (local.get $z)))
  (call $hd_fence (i32.const 0) (local.get $x) (local.get $z) (local.get $vx) (local.get $vz) (f32.const @HD_KEEP) (f32.const 0) (i32.const 2))
  (local.set $vz) (local.set $vx) (local.set $z) (local.set $x)
  (!chk (local.get $x) 525 (local.get $k))
  (!chk (local.get $z) 526 (local.get $k))
  (!chk (local.get $vx) 527 (local.get $k))
  (!chk (local.get $vz) 528 (local.get $k))
  (f32.store offset=@HD_SX (local.get $e) (local.get $x))
  (f32.store offset=@HD_SZ (local.get $e) (local.get $z))
  (f32.store offset=@HD_SVX (local.get $e) (local.get $vx))
  (f32.store offset=@HD_SVZ (local.get $e) (local.get $vz))
  (if (f32.gt (f32.abs (f32.sub (local.get $x) (local.get $cx))) (f32.add (f32.load (i32.const @(PG_H + HD_HX))) (f32.const @HD_INM)))
    (then (call $hd_pen (local.get $k) (local.get $e) (f32.gt (local.get $x) (local.get $cx)) (local.get $t)))))

;; The round's world, a tick of it: the balls in into the grid, a cell's in
;; slot order; a bark begun this tick heard; the rams, called HD_RAMW before
;; they come on in the middle, the next one at once while no sheep is loose;
;; the loose sheep stepped, in their order; what is left to pen counted.
(func $hd_tick
  (local $t i32) (local $ns i32) (local $nr i32) (local $total i32) (local $k i32) (local $e i32) (local $p i32) (local $pb i32) (local $cell i32)
  (local $st i32) (local $at i32) (local $loose i32) (local $wait i32) (local $left i32) (local $cx f32)
  (local.set $t (call $p_t (i32.const 0)))
  (local.set $ns (i32.load (i32.const @(PG_H + HD_NS))))
  (local.set $nr (i32.load (i32.const @(PG_H + HD_NR))))
  (local.set $total (i32.add (local.get $ns) (local.get $nr)))
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (memory.fill (i32.const @(PG_BIG + HD_GRID)) (i32.const 0xff) (i32.const @(HD_GN * HD_GN * 2)))
  (local.set $p (i32.const @NPLAYER))
  (block $done
    (loop $more
      (br_if $done (i32.eqz (local.get $p)))
      (local.set $p (i32.sub (local.get $p) (i32.const 1)))
      (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
      (if (call $p_in (local.get $pb))
        (then
          (local.set $cell (i32.add (call $hd_cell (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
                                    (i32.mul (call $hd_cell (!at f32 @(PLAYERS + P_PZ) (local.get $pb))) (i32.const @HD_GN))))
          (!st u16 @(PG_BIG + HD_GNEXT) (local.get $p) (!ld u16 @(PG_BIG + HD_GRID) (local.get $cell)))
          (!st u16 @(PG_BIG + HD_GRID) (local.get $cell) (local.get $p))
          (if (i32.eq (i32.shr_u (!at i32 @(PLAYERS + PG_M) (local.get $pb)) (i32.const 16)) (i32.add (local.get $t) (i32.const 1)))
            (then (call $fx (i32.const 0) (i32.const @HD_FX_BARK) (local.get $p) (i32.const 0)
                            (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (!at f32 @(PLAYERS + P_PY) (local.get $pb)) (!at f32 @(PLAYERS + P_PZ) (local.get $pb))
                            (f32.const @(HD_SCARE * HD_BARKK)))))))
      (br $more)))
  (!for $k (i32.const 0) (local.get $ns)
    (if (i32.eq (i32.load8_u offset=@HD_ST (call $hd_s (local.get $k))) (i32.const @HD_LOOSE)) (then (!inc $loose))))
  (!for $k (i32.const 0) (local.get $nr)
    (local.set $e (call $hd_s (i32.add (local.get $ns) (local.get $k))))
    (local.set $st (i32.load8_u offset=@HD_ST (local.get $e)))
    (local.set $at (i32.load offset=@HD_SAT (local.get $e)))
    (if (i32.eq (local.get $st) (i32.const @HD_LOOSE)) (then (!inc $loose)))
    (if (i32.eqz (local.get $st))
      (then
        (if (i32.and (i32.eqz (i32.or (local.get $loose) (local.get $wait))) (i32.gt_s (local.get $at) (i32.add (local.get $t) (i32.const @HD_RAMW))))
          (then
            (local.set $at (i32.add (local.get $t) (i32.const @HD_RAMW)))
            (i32.store offset=@HD_SAT (local.get $e) (local.get $at))))
        (local.set $wait (i32.const 1))
        (if (i32.ge_s (local.get $t) (i32.sub (local.get $at) (i32.const @HD_RAMW)))
          (then
            (local.set $st (i32.const @HD_CALLED))
            (i32.store8 offset=@HD_ST (local.get $e) (local.get $st))
            (call $fx (i32.const 0) (i32.const @HD_FX_RAM) (i32.const 255) (local.get $k) (local.get $cx) (f32.const @PLAT_Y) (local.get $cx)
                      (f32.mul (f32.convert_i32_s (i32.sub (local.get $at) (local.get $t))) (f32.const @DT)))))))
    (if (i32.eq (local.get $st) (i32.const @HD_CALLED))
      (then
        (local.set $wait (i32.const 1))
        (if (i32.ge_s (local.get $t) (local.get $at))
          (then
            (i32.store8 offset=@HD_ST (local.get $e) (i32.const @HD_LOOSE))
            (f32.store offset=@HD_SX (local.get $e) (local.get $cx))
            (f32.store offset=@HD_SZ (local.get $e) (local.get $cx))
            (!inc $loose)
            (call $fx (i32.const 0) (i32.const @HD_FX_RAM) (i32.const 255) (i32.or (local.get $k) (i32.const 256)) (local.get $cx) (f32.const @PLAT_Y) (local.get $cx) (f32.const 0)))))))
  (!for $k (i32.const 0) (local.get $total)
    (local.set $e (call $hd_s (local.get $k)))
    (if (i32.eq (i32.load8_u offset=@HD_ST (local.get $e)) (i32.const @HD_LOOSE))
      (then (call $hd_step (local.get $k) (local.get $e) (local.get $t) (local.get $total))))
    (if (i32.ne (i32.load8_u offset=@HD_ST (local.get $e)) (i32.const @HD_PENNED)) (then (!inc $left))))
  (i32.store (i32.const @(PG_H + HD_LEFT)) (local.get $left)))

;; Nothing left to pen, or at the clock.
(func $hd_over (result i32) (i32.eqz (i32.load (i32.const @(PG_H + HD_LEFT)))))

(func $hd_out (param $p i32))
