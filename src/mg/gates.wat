;; GATE CRASH: a straight course over the sea along +x, railed both sides,
;; from a start pad to a finish line and a pen past it, and across it GC_NW0
;; to GC_NW0 + GC_NWK - 1 walls of gates, as wide as the course is (wider for
;; a crowd). A wall is a row of slots between posts, a portcullis in each; a
;; gate rises and falls on its own clock from the round's seed: up, flashing
;; GC_WARN ticks before it slams down in GC_FALL, down, then GC_RISE rising.
;; Its period shortens down the course, and the share of it up shrinks, half
;; by how far down the course its wall is and half by how far its period's
;; start is into GC_RAMP. A gate whose bottom is under a ball's top is solid;
;; one coming down onto a ball knocks it out the near side hard and up (or,
;; past the gate's line, on through), so nobody is ever under one when it's
;; down. Between walls, belts carrying what rolls on them back toward the
;; start, and rows of bumper posts. The first over the line cuts the clock to
;; GC_LATE; placed by PG_SCORE: GC_WIN plus the ticks it had left for a ball
;; home, else GC_DM a metre down the course where it is.
;;
;; The course (walls, sections, gates' clocks, posts in PG_S) is laid out in
;; setup and fixed for the round; push reads it and its own bank's clock
;; ($p_t), so where every gate is on any tick, and what it does to the ball,
;; the prediction works out exactly. A ball's score is its own, kept by push
;; on either bank. Who came home in what place is the confirmed world's.

;; Wall w's record, section k's, gate i's, post j's.
(func $gc_wa (param $w i32) (result i32)
  (i32.add (i32.const @(PG_S + GC_WALLS)) (i32.mul (local.get $w) (i32.const @GC_WSIZE))))
(func $gc_sa (param $k i32) (result i32)
  (i32.add (i32.const @(PG_S + GC_SECS)) (i32.mul (local.get $k) (i32.const @GC_SSIZE))))
(func $gc_ga (param $i i32) (result i32)
  (i32.add (i32.const @(PG_S + GC_GATES)) (i32.mul (local.get $i) (i32.const @GC_GSIZE))))
(func $gc_pa (param $j i32) (result i32)
  (i32.add (i32.const @(PG_S + GC_POSTS)) (i32.mul (local.get $j) (i32.const @GC_PSIZE))))

;; ---- the clock

;; Ticks up of a period of per ticks starting on tick c0 into play, its wall
;; depth down the course: GC_O0 of it falling to GC_O1, half by depth and half
;; by c0 into GC_RAMP; never short of its warning and a little more.
(func $gc_open (param $per i32) (param $depth f32) (param $c0 i32) (result i32)
  (local $f f32) (local $n i32)
  (local.set $f (f32.mul (f32.add (local.get $depth)
                                  (!clamp (f32.div (f32.convert_i32_s (local.get $c0)) (f32.const @GC_RAMP)) (f32.const 0) (f32.const 1)))
                         (f32.const 0.5)))
  (local.set $n (i32.trunc_sat_f32_u (f32.mul (f32.convert_i32_u (local.get $per)) (!madd (local.get $f) (f32.const @(GC_O1 - GC_O0)) (f32.const @GC_O0)))))
  (select (local.get $n) (i32.const @(GC_WARN + 10)) (i32.gt_u (local.get $n) (i32.const @(GC_WARN + 10)))))

;; Gate i of a wall depth down the course on tick t into play: its state
;; (GC_UP ... GC_RISING) and its bottom's height over the floor. Its period
;; is up, then the slam (its bottom falling as the square of the time), down,
;; then rising evenly.
(func $gc_gate (param $i i32) (param $depth f32) (param $t i32) (result i32 f32)
  (local $a i32) (local $per i32) (local $o i32) (local $open i32) (local $s f32)
  (local.set $a (call $gc_ga (local.get $i)))
  (local.set $per (i32.load offset=@GC_G_PER (local.get $a)))
  (local.set $o (i32.rem_u (i32.add (local.get $t) (i32.load offset=@GC_G_PH (local.get $a))) (local.get $per)))
  (local.set $open (call $gc_open (local.get $per) (local.get $depth) (i32.sub (local.get $t) (local.get $o))))
  (if (i32.lt_u (local.get $o) (local.get $open))
    (then (return (select (i32.const @GC_WARNING) (i32.const @GC_UP) (i32.ge_u (local.get $o) (i32.sub (local.get $open) (i32.const @GC_WARN))))
                  (f32.const @GC_OPEN_H))))
  (if (i32.lt_u (local.get $o) (i32.add (local.get $open) (i32.const @GC_FALL)))
    (then
      (local.set $s (f32.mul (f32.convert_i32_u (i32.add (i32.sub (local.get $o) (local.get $open)) (i32.const 1))) (f32.const @(1 / GC_FALL))))
      (return (i32.const @GC_FALLING) (f32.mul (f32.const @GC_OPEN_H) (f32.sub (f32.const 1) (f32.mul (local.get $s) (local.get $s)))))))
  (if (i32.lt_u (local.get $o) (i32.sub (local.get $per) (i32.const @GC_RISE)))
    (then (return (i32.const @GC_DOWN) (f32.const 0))))
  (i32.const @GC_RISING)
  (f32.mul (f32.convert_i32_u (i32.add (i32.sub (local.get $o) (local.get $per)) (i32.const @(GC_RISE + 1)))) (f32.const @(GC_OPEN_H / GC_RISE))))

;; ---- laying the course out (setup)

;; The course's k-th random number in [0, 1).
(func $gc_rnd (param $k i32) (result f32)
  (f32.mul (f32.convert_i32_u (i32.shr_u (call $hash32 (local.get $k) (i32.const 0x6a7e) (call $p_seed (i32.const @GC_KCOURSE))) (i32.const 8)))
           (f32.const 0x1p-24)))

;; The course for n balls: its width and how many gates a wall; the start pad
;; deep enough for the grid's rows; the walls GC_X1 past the start line, a
;; spacing of the course's own between them (the inner ones jittered), the
;; line GC_XN past the last; the pen past it; all centred on the stage's centre;
;; every gate's period (shorter down the course) and phase; between walls a
;; belt, posts, both or neither (at least one belt and one row of posts in
;; every course). A scoring round, braking hard with no keys, bumps with no
;; kick.
(func $gc_setup (param $n i32)
  (local $w f32) (local $ng i32) (local $m i32) (local $rows i32) (local $pad f32) (local $len f32) (local $pen f32) (local $total f32)
  (local $xa f32) (local $x0 f32) (local $fin f32) (local $nw i32) (local $span f32) (local $x f32) (local $depth f32) (local $k i32) (local $j i32)
  (local $a i32) (local $per i32) (local $fl i32) (local $seen i32) (local $lo f32) (local $hi f32) (local $np i32) (local $sp f32) (local $q i32) (local $zl f32) (local $r f32)
  (local.set $n (select (local.get $n) (i32.const 1) (local.get $n)))
  (local.set $w (f32.min (!madd (f32.sqrt (f32.convert_i32_u (local.get $n))) (f32.const @GC_WK) (f32.const @GC_W0)) (f32.const @GC_WMAX)))
  (!chk (local.get $w) 160 (local.get $n))
  (local.set $ng (i32.trunc_sat_f32_u (f32.div (f32.mul (local.get $w) (f32.const 2)) (f32.const @GC_SLOT))))
  (if (i32.lt_u (local.get $ng) (i32.const @GC_NGMIN)) (then (local.set $ng (i32.const @GC_NGMIN))))
  (if (i32.gt_u (local.get $ng) (i32.const @GC_NGMAX)) (then (local.set $ng (i32.const @GC_NGMAX))))
  (i32.store (i32.const @PG_KIND) (i32.const @PK_SCORE))
  (i32.store (i32.const @PG_LEN) (i32.const @GC_LEN))
  (f32.store (i32.const @PG_IDLE) (f32.const @GC_IDLE))
  (i32.store (i32.const @PG_RESPAWN) (i32.const @GC_BACK))
  ;; bumps without bumper's kick: a queue at a gate is shoved by what the balls bring
  (i32.store (i32.const @PG_FLAGS) (i32.const @(PGF_BUMPS | PGF_NOKICK)))
  ;; the grid: rows GC_STEP apart, as many a row as fit
  (local.set $m (i32.trunc_sat_f32_u (f32.max (f32.const 1) (f32.div (f32.sub (f32.mul (local.get $w) (f32.const 2)) (f32.const 2)) (f32.const @GC_STEP)))))
  (local.set $rows (i32.div_u (i32.add (local.get $n) (i32.sub (local.get $m) (i32.const 1))) (local.get $m)))
  (local.set $pad (!madd (f32.convert_i32_u (local.get $rows)) (f32.const @GC_STEP) (f32.const @GC_PAD)))
  (local.set $nw (i32.add (i32.const @GC_NW0) (i32.trunc_sat_f32_u (f32.mul (call $gc_rnd (i32.const 0)) (f32.const @GC_NWK)))))
  (local.set $span (!madd (call $gc_rnd (i32.const 1)) (f32.const @GC_GAPK) (f32.const @GC_GAP0)))
  (local.set $len (!madd (f32.convert_i32_u (i32.sub (local.get $nw) (i32.const 1))) (local.get $span) (f32.const @(GC_X1 + GC_XN))))
  (local.set $pen (!madd (f32.convert_i32_u (local.get $n)) (f32.const @GC_PENK) (f32.const @GC_PEN0)))
  (local.set $total (f32.add (f32.add (local.get $pad) (local.get $len)) (local.get $pen)))
  (local.set $xa (f32.sub (f32.load (i32.const @PG_CX)) (f32.mul (local.get $total) (f32.const 0.5))))
  (local.set $x0 (f32.add (local.get $xa) (local.get $pad)))
  (local.set $fin (f32.add (local.get $x0) (local.get $len)))
  (local.set $zl (f32.sub (f32.load (i32.const @PG_CX)) (local.get $w)))
  (i32.store (i32.const @(PG_H + GC_NW)) (local.get $nw))
  (i32.store (i32.const @(PG_H + GC_NG)) (local.get $ng))
  (f32.store (i32.const @(PG_H + GC_W)) (local.get $w))
  (f32.store (i32.const @(PG_H + GC_XA)) (local.get $xa))
  (f32.store (i32.const @(PG_H + GC_X0)) (local.get $x0))
  (f32.store (i32.const @(PG_H + GC_FIN)) (local.get $fin))
  (f32.store (i32.const @(PG_H + GC_XB)) (f32.add (local.get $fin) (local.get $pen)))
  (f32.store (i32.const @(PG_H + GC_S)) (f32.div (f32.mul (local.get $w) (f32.const 2)) (f32.convert_i32_u (local.get $ng))))
  (i32.store (i32.const @(PG_H + GC_ROW)) (local.get $m))
  (f32.store (i32.const @PG_SIZE) (f32.mul (f32.max (local.get $total) (f32.mul (local.get $w) (f32.const 2))) (f32.const 0.5)))
  ;; the walls and their gates' clocks
  (!for $k (i32.const 0) (local.get $nw)
    (local.set $depth (f32.div (f32.convert_i32_u (local.get $k)) (f32.convert_i32_u (i32.sub (local.get $nw) (i32.const 1)))))
    (local.set $x (!madd (f32.convert_i32_u (local.get $k)) (local.get $span) (f32.add (local.get $x0) (f32.const @GC_X1))))
    (if (i32.and (i32.ne (local.get $k) (i32.const 0)) (i32.lt_u (i32.add (local.get $k) (i32.const 1)) (local.get $nw)))
      (then (local.set $x (!madd (f32.sub (call $gc_rnd (i32.add (i32.const 16) (local.get $k))) (f32.const 0.5)) (f32.const @(2 * GC_JIT)) (local.get $x)))))
    (local.set $a (call $gc_wa (local.get $k)))
    (f32.store offset=@GC_W_X (local.get $a) (local.get $x))
    (f32.store offset=@GC_W_DEPTH (local.get $a) (local.get $depth))
    (!for $j (i32.const 0) (local.get $ng)
      (local.set $q (i32.add (i32.const 64) (i32.shl (i32.add (i32.mul (local.get $k) (local.get $ng)) (local.get $j)) (i32.const 1))))
      (local.set $per (i32.add (i32.trunc_sat_f32_u (!madd (local.get $depth) (f32.const @(GC_P1 - GC_P0)) (f32.const @GC_P0)))
                               (i32.trunc_sat_f32_u (f32.mul (call $gc_rnd (local.get $q)) (f32.const @GC_PK)))))
      (local.set $a (call $gc_ga (i32.add (i32.mul (local.get $k) (local.get $ng)) (local.get $j))))
      (i32.store offset=@GC_G_PER (local.get $a) (local.get $per))
      (i32.store offset=@GC_G_PH (local.get $a) (i32.trunc_sat_f32_u (f32.mul (call $gc_rnd (i32.add (local.get $q) (i32.const 1))) (f32.convert_i32_u (local.get $per)))))))
  ;; the sections between walls: neither, a belt, posts or both; at least one belt and one with posts
  (!for $k (i32.const 1) (local.get $nw)
    (local.set $r (call $gc_rnd (i32.add (i32.const 40) (local.get $k))))
    (local.set $fl (select (i32.const 0) (select (i32.const @GC_S_BELT) (select (i32.const @GC_S_POSTS) (i32.const @(GC_S_BELT | GC_S_POSTS)) (f32.lt (local.get $r) (f32.const 0.85)))
                                                 (f32.lt (local.get $r) (f32.const 0.55)))
                           (f32.lt (local.get $r) (f32.const 0.2))))
    (i32.store offset=@GC_S_FL (call $gc_sa (local.get $k)) (local.get $fl))
    (local.set $seen (i32.or (local.get $seen) (local.get $fl))))
  (if (i32.eqz (i32.and (local.get $seen) (i32.const @GC_S_BELT)))
    (then (local.set $a (call $gc_sa (i32.shr_u (local.get $nw) (i32.const 1))))
          (i32.store offset=@GC_S_FL (local.get $a) (i32.or (i32.load offset=@GC_S_FL (local.get $a)) (i32.const @GC_S_BELT)))))
  (if (i32.eqz (i32.and (local.get $seen) (i32.const @GC_S_POSTS)))
    (then (local.set $a (call $gc_sa (i32.const 1)))
          (i32.store offset=@GC_S_FL (local.get $a) (i32.or (i32.load offset=@GC_S_FL (local.get $a)) (i32.const @GC_S_POSTS)))))
  ;; each section's belt and posts: two rows, one every GC_BSPAN m across, the second between the first's
  (local.set $m (i32.trunc_sat_f32_u (f32.max (f32.const 1) (f32.div (f32.mul (local.get $w) (f32.const 2)) (f32.const @GC_BSPAN)))))
  (local.set $sp (f32.div (f32.mul (local.get $w) (f32.const 2)) (f32.convert_i32_u (local.get $m))))
  (!for $k (i32.const 0) (i32.add (local.get $nw) (i32.const 1))
    (local.set $a (call $gc_sa (local.get $k)))
    (local.set $lo (select (local.get $x0) (f32.load offset=@GC_W_X (call $gc_wa (i32.sub (local.get $k) (i32.const 1)))) (i32.eqz (local.get $k))))
    (local.set $hi (select (local.get $fin) (f32.load offset=@GC_W_X (call $gc_wa (local.get $k))) (i32.eq (local.get $k) (local.get $nw))))
    (local.set $fl (i32.load offset=@GC_S_FL (local.get $a)))
    (if (i32.and (local.get $fl) (i32.const @GC_S_BELT))
      (then
        (f32.store offset=@GC_S_BX0 (local.get $a) (f32.add (local.get $lo) (f32.const @GC_BIN)))
        (f32.store offset=@GC_S_BX1 (local.get $a) (f32.sub (local.get $hi) (f32.const @GC_BOUT)))))
    (i32.store offset=@GC_S_P0 (local.get $a) (local.get $np))
    (if (i32.and (local.get $fl) (i32.const @GC_S_POSTS))
      (then
        (!for $j (i32.const 0) (i32.sub (i32.shl (local.get $m) (i32.const 1)) (i32.const 1))
          (if (i32.lt_u (local.get $np) (i32.const @GC_NPMAX))
            (then
              (local.set $q (call $gc_pa (local.get $np)))
              (if (i32.lt_u (local.get $j) (local.get $m))
                (then
                  (f32.store (local.get $q) (!madd (f32.sub (local.get $hi) (local.get $lo)) (f32.const @GC_ROW0) (local.get $lo)))
                  (f32.store offset=4 (local.get $q) (!madd (f32.add (f32.convert_i32_u (local.get $j)) (f32.const 0.5)) (local.get $sp) (local.get $zl))))
                (else
                  (f32.store (local.get $q) (!madd (f32.sub (local.get $hi) (local.get $lo)) (f32.const @GC_ROW1) (local.get $lo)))
                  (f32.store offset=4 (local.get $q) (!madd (f32.convert_i32_u (i32.sub (i32.add (local.get $j) (i32.const 1)) (local.get $m))) (local.get $sp) (local.get $zl)))))
              (!inc $np))))))
    (i32.store offset=@GC_S_PN (local.get $a) (i32.sub (local.get $np) (i32.load offset=@GC_S_P0 (local.get $a)))))
  (i32.store (i32.const @(PG_H + GC_NPOST)) (local.get $np)))

;; Ball i of n on the grid, rows across the start pad from its front back, in
;; an order the round's seed shuffles (i times a stride prime to n, plus an
;; offset); a newcomer or a respawn (n 1024) anywhere on the pad.
(func $gc_spawn (param $i i32) (param $n i32) (result f32 f32 f32)
  (local $m i32) (local $k i32) (local $row i32) (local $cnt i32) (local $stride i32) (local $seed i32)
  (local $x0 f32) (local $w f32) (local $along f32) (local $u f32)
  (local.set $x0 (f32.load (i32.const @(PG_H + GC_X0))))
  (local.set $w (f32.load (i32.const @(PG_H + GC_W))))
  (local.set $m (select (i32.load (i32.const @(PG_H + GC_ROW))) (i32.const 1) (i32.load (i32.const @(PG_H + GC_ROW)))))
  (if (i32.ge_u (local.get $n) (i32.const 1024))
    (then
      (local.set $along (!madd (f32.convert_i32_u (i32.and (local.get $i) (i32.const 15)))
                               (f32.mul (f32.sub (f32.sub (local.get $x0) (f32.load (i32.const @(PG_H + GC_XA)))) (f32.const 4)) (f32.const 0.0625))
                               (f32.const 2)))
      (local.set $u (f32.mul (f32.sub (f32.mul (f32.convert_i32_u (i32.shr_u (local.get $i) (i32.const 4))) (f32.const 0.015625)) (f32.const 0.5))
                             (f32.mul (f32.const 2) (f32.sub (local.get $w) (f32.const 2))))))
    (else
      (local.set $seed (call $p_seed (i32.const @GC_KGRID)))
      (local.set $stride (i32.add (i32.and (local.get $seed) (i32.const 127)) (i32.const 1)))
      (block $prime
        (loop $next
          (br_if $prime (i32.eq (call $gc_gcd (local.get $stride) (local.get $n)) (i32.const 1)))
          (local.set $stride (i32.add (local.get $stride) (i32.const 1)))
          (br $next)))
      (local.set $k (i32.rem_u (i32.add (i32.mul (local.get $i) (local.get $stride)) (i32.shr_u (local.get $seed) (i32.const 8))) (local.get $n)))
      (local.set $row (i32.div_u (local.get $k) (local.get $m)))
      (local.set $cnt (i32.sub (local.get $n) (i32.mul (local.get $row) (local.get $m))))
      (if (i32.gt_u (local.get $cnt) (local.get $m)) (then (local.set $cnt (local.get $m))))
      (local.set $along (!madd (f32.convert_i32_u (local.get $row)) (f32.const @GC_STEP) (f32.const 1.5)))
      (local.set $u (f32.mul (f32.sub (f32.convert_i32_u (i32.rem_u (local.get $k) (local.get $m)))
                                      (f32.mul (f32.convert_i32_u (i32.sub (local.get $cnt) (i32.const 1))) (f32.const 0.5)))
                             (f32.const @GC_STEP)))))
  (f32.sub (local.get $x0) (local.get $along))
  (f32.const @PLAT_Y)
  (f32.add (f32.load (i32.const @PG_CX)) (local.get $u)))

(func $gc_gcd (param $a i32) (param $b i32) (result i32)
  (local $t i32)
  (block $done
    (loop $next
      (br_if $done (i32.eqz (local.get $b)))
      (local.set $t (i32.rem_u (local.get $a) (local.get $b)))
      (local.set $a (local.get $b))
      (local.set $b (local.get $t))
      (br $next)))
  (local.get $a))

(func $gc_start)
(func $gc_begin (param $p i32) (param $d i32))

;; The floor over the course, from the pad's back to the pen's end, rail to
;; rail; nothing past it, on bank d.
(func $gc_ground (param $d i32) (param $x f32) (param $y f32) (param $z f32) (result f32)
  (if (f32.lt (local.get $y) (f32.const @PLAT_Y)) (then (return (f32.const -1000))))
  (if (result f32) (i32.and (i32.and (f32.ge (local.get $x) (f32.sub (f32.load offset=@(PG_H + GC_XA) (local.get $d)) (f32.const 0.5)))
                                     (f32.le (local.get $x) (f32.add (f32.load offset=@(PG_H + GC_XB) (local.get $d)) (f32.const 0.5))))
                            (f32.le (f32.abs (f32.sub (local.get $z) (f32.load offset=@PG_CX (local.get $d))))
                                    (f32.add (f32.load offset=@(PG_H + GC_W) (local.get $d)) (f32.const 0.5))))
    (then (f32.const @PLAT_Y))
    (else (f32.const -1000))))

;; Ball (u, w) of radius r rolling (vx, vz) against the box [xa, xb] x [za, zb]:
;; out of it the nearest way, GC_BOUNCE of its speed into it given back; how
;; fast it came in (-1 if it doesn't touch).
(func $gc_box (param $u f32) (param $w f32) (param $vx f32) (param $vz f32) (param $r f32)
              (param $xa f32) (param $xb f32) (param $za f32) (param $zb f32) (result f32 f32 f32 f32 f32)
  (local $dx f32) (local $dz f32) (local $dd f32) (local $nx f32) (local $nz f32) (local $dep f32) (local $e f32) (local $vn f32)
  (local.set $dx (f32.sub (local.get $u) (!clamp (local.get $u) (local.get $xa) (local.get $xb))))
  (local.set $dz (f32.sub (local.get $w) (!clamp (local.get $w) (local.get $za) (local.get $zb))))
  (local.set $dd (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))))
  (if (f32.ge (local.get $dd) (f32.mul (local.get $r) (local.get $r)))
    (then (return (local.get $u) (local.get $w) (local.get $vx) (local.get $vz) (f32.const -1))))
  (if (f32.gt (local.get $dd) (f32.const 1e-8))
    (then
      (local.set $dd (f32.sqrt (local.get $dd)))
      (local.set $nx (f32.div (local.get $dx) (local.get $dd)))
      (local.set $nz (f32.div (local.get $dz) (local.get $dd)))
      (local.set $dep (f32.sub (local.get $r) (local.get $dd))))
    (else
      ;; its centre in the box (a bump put it there): out the nearest side
      (local.set $dep (f32.sub (local.get $u) (local.get $xa)))
      (local.set $nx (f32.const -1))
      (local.set $e (f32.sub (local.get $xb) (local.get $u)))
      (if (f32.lt (local.get $e) (local.get $dep)) (then (local.set $dep (local.get $e)) (local.set $nx (f32.const 1))))
      (local.set $e (f32.sub (local.get $w) (local.get $za)))
      (if (f32.lt (local.get $e) (local.get $dep)) (then (local.set $dep (local.get $e)) (local.set $nx (f32.const 0)) (local.set $nz (f32.const -1))))
      (local.set $e (f32.sub (local.get $zb) (local.get $w)))
      (if (f32.lt (local.get $e) (local.get $dep)) (then (local.set $dep (local.get $e)) (local.set $nx (f32.const 0)) (local.set $nz (f32.const 1))))
      (local.set $dep (f32.add (local.get $dep) (local.get $r)))))
  (local.set $u (!madd (local.get $nx) (local.get $dep) (local.get $u)))
  (local.set $w (!madd (local.get $nz) (local.get $dep) (local.get $w)))
  (local.set $vn (!madd (local.get $vx) (local.get $nx) (f32.mul (local.get $vz) (local.get $nz))))
  (if (f32.lt (local.get $vn) (f32.const 0))
    (then
      (local.set $vx (f32.sub (local.get $vx) (f32.mul (f32.mul (local.get $vn) (f32.const @(1 + GC_BOUNCE))) (local.get $nx))))
      (local.set $vz (f32.sub (local.get $vz) (f32.mul (f32.mul (local.get $vn) (f32.const @(1 + GC_BOUNCE))) (local.get $nz)))))
    (else (local.set $vn (f32.const 0))))
  (local.get $u) (local.get $w) (local.get $vx) (local.get $vz) (f32.neg (local.get $vn)))

;; After a ball's move, on bank d: a belt under it carries it back; the rails,
;; the pad's back wall and the pen's end hold it, and the pen's mouth carries
;; it in; its section's bumper posts bounce it off; then each wall it's in
;; reach of, as it stands on this bank's tick: the two posts of its slot, and
;; the gates of its slot and the two beside it whose bottoms are under its
;; top. One of those slamming down knocks it out the near side, hard and up
;; (past its line, on through); a gate down or rising is a wall. Last its
;; score from where it ends up. Writes only its own record and the FX on bank d.
(func $gc_push (param $p i32) (param $d i32)
  (local $pb i32) (local $fl i32) (local $t i32) (local $nw i32) (local $ng i32) (local $k i32) (local $j i32) (local $g i32) (local $q i32) (local $a i32) (local $st i32) (local $sc i32)
  (local $px f32) (local $py f32) (local $pz f32) (local $vx f32) (local $vy f32) (local $vz f32) (local $r f32) (local $cx f32) (local $w f32)
  (local $x f32) (local $lim f32) (local $dx f32) (local $dz f32) (local $dd f32) (local $nx f32) (local $nz f32) (local $vn f32)
  (local $s f32) (local $zl f32) (local $top f32) (local $b f32) (local $depth f32) (local $za f32) (local $zb f32) (local $hit f32)
  (local.set $pb (i32.add (i32.shl (local.get $p) (i32.const 6)) (local.get $d)))
  (local.set $fl (!at u8 @(PLAYERS + P_FL) (local.get $pb)))
  (if (i32.and (local.get $fl) (i32.const @(PF_FALL | PF_DEAD))) (then (return)))
  (local.set $nw (i32.load offset=@(PG_H + GC_NW) (local.get $d)))
  (if (i32.eqz (local.get $nw)) (then (return)))
  (local.set $px (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
  (local.set $py (!at f32 @(PLAYERS + P_PY) (local.get $pb)))
  (local.set $pz (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
  (local.set $vx (!at f32 @(PLAYERS + P_VX) (local.get $pb)))
  (local.set $vy (!at f32 @(PLAYERS + P_VY) (local.get $pb)))
  (local.set $vz (!at f32 @(PLAYERS + P_VZ) (local.get $pb)))
  (local.set $r (call $b_rad (local.get $pb)))
  (local.set $t (call $p_t (local.get $d)))
  (local.set $cx (f32.load offset=@PG_CX (local.get $d)))
  (local.set $w (f32.load offset=@(PG_H + GC_W) (local.get $d)))

  ;; its section: the walls behind it
  (local.set $k (i32.const 0))
  (block $found
    (loop $next
      (br_if $found (i32.ge_u (local.get $k) (local.get $nw)))
      (br_if $found (f32.gt (f32.load offset=@GC_W_X (call $gc_wa (local.get $k))) (local.get $px)))
      (!inc $k)
      (br $next)))
  (local.set $a (call $gc_sa (local.get $k)))
  ;; on a belt, carried back with it
  (if (i32.and (i32.and (i32.ne (i32.and (i32.load offset=@GC_S_FL (local.get $a)) (i32.const @GC_S_BELT)) (i32.const 0))
                        (i32.ne (i32.and (local.get $fl) (i32.const @PF_GROUND)) (i32.const 0)))
               (i32.and (f32.ge (local.get $px) (f32.load offset=@GC_S_BX0 (local.get $a))) (f32.lt (local.get $px) (f32.load offset=@GC_S_BX1 (local.get $a)))))
    (then (local.set $px (f32.sub (local.get $px) (f32.const @(GC_BELT * DT))))))

  ;; the rails, the pad's back, the pen's end; the pen's mouth
  (local.set $lim (f32.sub (local.get $w) (local.get $r)))
  (local.set $dz (f32.sub (local.get $pz) (local.get $cx)))
  (if (f32.gt (local.get $dz) (local.get $lim))
    (then
      (local.set $pz (f32.add (local.get $cx) (local.get $lim)))
      (if (f32.gt (local.get $vz) (f32.const 0)) (then (local.set $vz (f32.mul (local.get $vz) (f32.const @(-GC_BOUNCE)))))))
    (else
      (if (f32.lt (local.get $dz) (f32.neg (local.get $lim)))
        (then
          (local.set $pz (f32.sub (local.get $cx) (local.get $lim)))
          (if (f32.lt (local.get $vz) (f32.const 0)) (then (local.set $vz (f32.mul (local.get $vz) (f32.const @(-GC_BOUNCE))))))))))
  (local.set $x (f32.add (f32.load offset=@(PG_H + GC_XA) (local.get $d)) (local.get $r)))
  (if (f32.lt (local.get $px) (local.get $x))
    (then
      (local.set $px (local.get $x))
      (if (f32.lt (local.get $vx) (f32.const 0)) (then (local.set $vx (f32.mul (local.get $vx) (f32.const @(-GC_BOUNCE))))))))
  (local.set $x (f32.sub (f32.load offset=@(PG_H + GC_XB) (local.get $d)) (local.get $r)))
  (if (f32.gt (local.get $px) (local.get $x))
    (then
      (local.set $px (local.get $x))
      (if (f32.gt (local.get $vx) (f32.const 0)) (then (local.set $vx (f32.mul (local.get $vx) (f32.const @(-GC_BOUNCE))))))))
  (local.set $x (f32.load offset=@(PG_H + GC_FIN) (local.get $d)))
  (if (i32.and (i32.and (f32.ge (local.get $px) (local.get $x)) (f32.lt (local.get $px) (f32.add (local.get $x) (f32.const @GC_MOUTH))))
               (f32.lt (local.get $vx) (f32.const @GC_THRU)))
    (then (local.set $vx (f32.const @GC_THRU))))

  ;; its section's bumper posts: off at GC_BE of its speed into one, GC_BKICK more
  (local.set $j (i32.load offset=@GC_S_P0 (local.get $a)))
  (local.set $g (i32.add (local.get $j) (i32.load offset=@GC_S_PN (local.get $a))))
  (!for $j (local.get $j) (local.get $g)
    (local.set $st (call $gc_pa (local.get $j)))
    (local.set $dx (f32.sub (local.get $px) (f32.load (local.get $st))))
    (local.set $dz (f32.sub (local.get $pz) (f32.load offset=4 (local.get $st))))
    (local.set $dd (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))))
    (local.set $lim (f32.add (local.get $r) (f32.const @GC_BR)))
    (if (f32.lt (local.get $dd) (f32.mul (local.get $lim) (local.get $lim)))
      (then
        (local.set $dd (f32.sqrt (local.get $dd)))
        (if (f32.gt (local.get $dd) (f32.const 1e-4))
          (then (local.set $nx (f32.div (local.get $dx) (local.get $dd))) (local.set $nz (f32.div (local.get $dz) (local.get $dd))))
          (else (local.set $nx (f32.const -1)) (local.set $nz (f32.const 0))))
        (local.set $px (!madd (local.get $nx) (local.get $lim) (f32.load (local.get $st))))
        (local.set $pz (!madd (local.get $nz) (local.get $lim) (f32.load offset=4 (local.get $st))))
        (local.set $vn (!madd (local.get $vx) (local.get $nx) (f32.mul (local.get $vz) (local.get $nz))))
        (if (f32.lt (local.get $vn) (f32.const @GC_BKICK))
          (then
            (local.set $hit (f32.sub (f32.const @GC_BKICK) (f32.mul (f32.min (local.get $vn) (f32.const 0)) (f32.const @(1 + GC_BE)))))
            (local.set $hit (f32.sub (local.get $hit) (f32.max (local.get $vn) (f32.const 0))))
            (local.set $vx (!madd (local.get $nx) (local.get $hit) (local.get $vx)))
            (local.set $vz (!madd (local.get $nz) (local.get $hit) (local.get $vz)))
            (if (f32.gt (f32.neg (local.get $vn)) (f32.const @GC_BONK))
              (then (call $fx (local.get $d) (i32.const @GC_FX_BONK) (local.get $p) (i32.add (i32.const 4096) (local.get $j))
                              (local.get $px) (local.get $py) (local.get $pz) (f32.neg (local.get $vn))))))))))

  ;; the walls in reach, on this bank's tick
  (local.set $ng (i32.load offset=@(PG_H + GC_NG) (local.get $d)))
  (local.set $s (f32.load offset=@(PG_H + GC_S) (local.get $d)))
  (local.set $zl (f32.sub (local.get $cx) (local.get $w)))
  (!for $k (i32.const 0) (local.get $nw)
    (local.set $a (call $gc_wa (local.get $k)))
    (local.set $x (f32.load offset=@GC_W_X (local.get $a)))
    (if (f32.lt (f32.abs (f32.sub (local.get $px) (local.get $x))) (f32.add (local.get $r) (f32.const @GC_T)))
      (then
        (local.set $depth (f32.load offset=@GC_W_DEPTH (local.get $a)))
        (local.set $j (i32.trunc_sat_f32_s (f32.floor (f32.div (f32.sub (local.get $pz) (local.get $zl)) (local.get $s)))))
        (if (i32.lt_s (local.get $j) (i32.const 0)) (then (local.set $j (i32.const 0))))
        (if (i32.ge_s (local.get $j) (local.get $ng)) (then (local.set $j (i32.sub (local.get $ng) (i32.const 1)))))
        ;; the posts at its slot's two edges
        (!for $g (local.get $j) (i32.add (local.get $j) (i32.const 2))
          (local.set $za (!madd (f32.convert_i32_u (local.get $g)) (local.get $s) (local.get $zl)))
          (call $gc_box (local.get $px) (local.get $pz) (local.get $vx) (local.get $vz) (local.get $r)
                        (f32.sub (local.get $x) (f32.const @GC_T)) (f32.add (local.get $x) (f32.const @GC_T))
                        (f32.sub (local.get $za) (f32.const @GC_PT)) (f32.add (local.get $za) (f32.const @GC_PT)))
          (local.set $hit) (local.set $vz) (local.set $vx) (local.set $pz) (local.set $px))
        ;; the gates of its slot and either side whose bottoms are under its top
        (local.set $top (!madd (local.get $r) (f32.const 2) (f32.sub (local.get $py) (f32.const @PLAT_Y))))
        (!for $q (local.get $j) (i32.add (local.get $j) (i32.const 3))
          (local.set $g (i32.sub (local.get $q) (i32.const 1)))
          (if (i32.and (i32.ge_u (local.get $q) (i32.const 1)) (i32.lt_s (local.get $g) (local.get $ng)))
            (then
              (call $gc_gate (i32.add (i32.mul (local.get $k) (local.get $ng)) (local.get $g)) (local.get $depth) (local.get $t))
              (local.set $b) (local.set $st)
              (if (f32.lt (local.get $b) (local.get $top))
                (then
                  (local.set $za (f32.add (!madd (f32.convert_i32_u (local.get $g)) (local.get $s) (local.get $zl)) (f32.const @GC_PT)))
                  (local.set $zb (f32.sub (f32.add (local.get $za) (local.get $s)) (f32.const @(2 * GC_PT))))
                  (local.set $dx (f32.sub (local.get $px) (!clamp (local.get $px) (f32.sub (local.get $x) (f32.const @GC_T)) (f32.add (local.get $x) (f32.const @GC_T)))))
                  (local.set $dz (f32.sub (local.get $pz) (!clamp (local.get $pz) (local.get $za) (local.get $zb))))
                  (if (i32.and (i32.eq (local.get $st) (i32.const @GC_FALLING))
                               (f32.lt (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))) (f32.mul (local.get $r) (local.get $r))))
                    (then
                      ;; slammed: out the near side hard and up, or on through past its line
                      (if (f32.lt (local.get $px) (local.get $x))
                        (then
                          (local.set $px (f32.sub (local.get $x) (f32.add (local.get $r) (f32.const @GC_T))))
                          (local.set $vx (f32.const @(-GC_KNOCK)))
                          (local.set $vy (f32.max (local.get $vy) (f32.const @GC_POP)))
                          (local.set $fl (i32.and (local.get $fl) (i32.const @(255 ^ PF_GROUND)))))
                        (else
                          (local.set $px (f32.add (local.get $x) (f32.add (local.get $r) (f32.const @GC_T))))
                          (local.set $vx (f32.max (local.get $vx) (f32.const @GC_THRU)))))
                      (call $fx (local.get $d) (i32.const @GC_FX_KNOCK) (local.get $p) (i32.add (i32.mul (local.get $k) (local.get $ng)) (local.get $g))
                                (local.get $px) (local.get $py) (local.get $pz) (f32.abs (local.get $vx))))
                    (else
                      (call $gc_box (local.get $px) (local.get $pz) (local.get $vx) (local.get $vz) (local.get $r)
                                    (f32.sub (local.get $x) (f32.const @GC_T)) (f32.add (local.get $x) (f32.const @GC_T)) (local.get $za) (local.get $zb))
                      (local.set $hit) (local.set $vz) (local.set $vx) (local.set $pz) (local.set $px)
                      (if (f32.gt (local.get $hit) (f32.const @GC_BONK))
                        (then (call $fx (local.get $d) (i32.const @GC_FX_BONK) (local.get $p) (i32.add (i32.mul (local.get $k) (local.get $ng)) (local.get $g))
                                        (local.get $px) (local.get $py) (local.get $pz) (local.get $hit))))))))))))))

  ;; its score: decimetres down the course, or home in the pen, GC_WIN and the ticks it had left (kept)
  (local.set $sc (!at u16 @(PLAYERS + PG_SCORE) (local.get $pb)))
  (if (i32.lt_u (local.get $sc) (i32.const @GC_WIN))
    (then
      (if (f32.ge (local.get $px) (f32.load offset=@(PG_H + GC_FIN) (local.get $d)))
        (then
          (local.set $j (i32.sub (i32.load offset=@PG_LEN (local.get $d)) (local.get $t)))
          (local.set $sc (i32.add (i32.const @GC_WIN) (select (local.get $j) (i32.const 0) (i32.gt_s (local.get $j) (i32.const 0))))))
        (else
          (local.set $sc (i32.trunc_sat_f32_u (f32.mul (f32.sub (local.get $px) (f32.load offset=@(PG_H + GC_X0) (local.get $d))) (f32.const @GC_DM))))))
      (!put u16 @(PLAYERS + PG_SCORE) (local.get $pb) (local.get $sc))))

  (!chk (local.get $px) 161 (local.get $p))
  (!chk (local.get $py) 162 (local.get $p))
  (!chk (local.get $pz) 163 (local.get $p))
  (!chk (local.get $vx) 164 (local.get $p))
  (!chk (local.get $vy) 165 (local.get $p))
  (!chk (local.get $vz) 166 (local.get $p))
  (!put f32 @(PLAYERS + P_PX) (local.get $pb) (local.get $px))
  (!put f32 @(PLAYERS + P_PZ) (local.get $pb) (local.get $pz))
  (!put f32 @(PLAYERS + P_VX) (local.get $pb) (local.get $vx))
  (!put f32 @(PLAYERS + P_VY) (local.get $pb) (local.get $vy))
  (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (local.get $vz))
  (!put u8 @(PLAYERS + P_FL) (local.get $pb) (local.get $fl)))

;; In slot order: a ball newly home takes its place (those home on one tick
;; share it, by their score), the first one cuts the clock to GC_LATE.
(func $gc_tick
  (local $p i32) (local $pb i32) (local $t i32) (local $home i32) (local $new i32) (local $sc i32) (local $place i32)
  (local.set $t (i32.load (i32.const @HDR_TICK)))
  (local.set $home (i32.load (i32.const @(PG_H + GC_HOME))))
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
    (if (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @PF_LIVE))
      (then
        (local.set $sc (!at u16 @(PLAYERS + PG_SCORE) (local.get $pb)))
        (local.set $place (!ld u8 @(PG_S + GC_PLACE) (local.get $p)))
        ;; a newcomer in a slot someone home has left
        (if (i32.and (i32.ne (local.get $place) (i32.const 0)) (i32.lt_u (local.get $sc) (i32.const @GC_WIN)))
          (then (local.set $place (i32.const 0)) (!st u8 @(PG_S + GC_PLACE) (local.get $p) (i32.const 0))))
        (if (i32.and (i32.ge_u (local.get $sc) (i32.const @GC_WIN)) (i32.eqz (local.get $place)))
          (then
            (local.set $place (select (i32.add (local.get $home) (i32.const 1)) (i32.const 255) (i32.lt_u (local.get $home) (i32.const 255))))
            (!st u8 @(PG_S + GC_PLACE) (local.get $p) (local.get $place))
            (!inc $new)
            (call $fx (i32.const 0) (i32.const @GC_FX_HOME) (local.get $p) (i32.const 0)
                      (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (!at f32 @(PLAYERS + P_PY) (local.get $pb)) (!at f32 @(PLAYERS + P_PZ) (local.get $pb))
                      (f32.convert_i32_u (local.get $place)))
            (if (i32.eqz (i32.load (i32.const @(PG_H + GC_FIRST))))
              (then
                (i32.store (i32.const @(PG_H + GC_FIRST)) (local.get $t))
                (if (i32.gt_u (i32.load (i32.const @HDR_UNTIL)) (i32.add (local.get $t) (i32.const @GC_LATE)))
                  (then (i32.store (i32.const @HDR_UNTIL) (i32.add (local.get $t) (i32.const @GC_LATE)))))
                (call $fx (i32.const 0) (i32.const @GC_FX_LATE) (local.get $p) (i32.const 0)
                          (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (!at f32 @(PLAYERS + P_PY) (local.get $pb)) (!at f32 @(PLAYERS + P_PZ) (local.get $pb))
                          (f32.convert_i32_u (i32.div_u (i32.sub (i32.load (i32.const @HDR_UNTIL)) (local.get $t)) (i32.const 125)))))))))))
  (i32.store (i32.const @(PG_H + GC_HOME)) (i32.add (local.get $home) (local.get $new))))

;; Over when every ball in the room is home.
(func $gc_over (result i32)
  (local $p i32) (local $pb i32) (local $n i32)
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
    (if (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @PF_LIVE))
      (then
        (if (i32.lt_u (!at u16 @(PLAYERS + PG_SCORE) (local.get $pb)) (i32.const @GC_WIN)) (then (return (i32.const 0))))
        (!inc $n))))
  (i32.ne (local.get $n) (i32.const 0)))

(func $gc_out (param $p i32))
