;; DODGEBALL: red against blue (PGF_TEAMS) on a court in two halves, red's
;; at low x and blue's at high x, split by a centre line no ball crosses;
;; behind each back line, a jail for the other side's. Each half is DB_HX
;; deep and twice that wide, DB_AREA m² for every ball of the bigger side.
;; Dodgeballs, one for every DB_PER balls, lie along the centre line as play
;; starts. A ball in play that rolls over a loose one holds it (one at most);
;; a click throws it the way the ball faces, DB_V m/s and DB_LOFT up, falling
;; DB_G a tick. A throw that meets a ball of the other side in play before it
;; touches the floor or a wall sends that ball to jail, the KO and a point to
;; the thrower; from then, or once it has touched anything, it is loose.
;; Teammates pass through each other and each other's throws. A click with
;; nothing held while an enemy throw is coming in within reach (DB_REACH0
;; plus its speed times DB_WIN, so about DB_WIN s at any speed) catches it:
;; the catcher holds it and scores two, the thrower goes to jail, and the
;; catcher's side's longest jailed comes back in at its back line. A click
;; with nothing in reach locks the catch for DB_LOCK (again, if it was). The
;; side with balls in play when the other has none wins; at the clock the
;; side with more (PG_TSCORE, the balls each has in play), the losers placed
;; by their own score. A newcomer in play falls in at its side's back line.
;;
;; The dodgeballs and the clicks are the confirmed world's, in PG_S, judged
;; in tick at the tick of the clicker's own word (the clicks before the
;; flight, so a catch on the tick a throw would land saves), like Parry
;; Ball's: a ball's own catch is judged on the throw as its page drew it. Only
;; a hit or a catch, ball against ball, comes a round trip late. The
;; prediction runs only the walls and the line, by the ball's own side and
;; whether it's jailed (PG_M), both in its record, so it is exact.

;; A dodgeball's record, and a slot's.
(func $db_b (param $k i32) (result i32)
  (i32.add (i32.const @(PG_S + DB_BALL)) (i32.mul (local.get $k) (i32.const @DB_BSIZE))))
(func $db_s (param $p i32) (result i32)
  (i32.add (i32.const @(PG_S + DB_SLOT)) (i32.shl (local.get $p) (i32.const 4))))

;; Side s's way from the centre line to its back line: -1 red, 1 blue.
(func $db_dir (param $s i32) (result f32)
  (select (f32.const 1) (f32.const -1) (local.get $s)))

;; Is the ball at record pb in play: in ($p_in), and not jailed?
(func $db_in (param $pb i32) (result i32)
  (i32.and (call $p_in (local.get $pb)) (i32.ne (!at i32 @(PLAYERS + PG_M) (local.get $pb)) (i32.const @DB_JAIL))))

;; The court for the crowd, and the dodgeballs on the centre line, spread
;; over nine tenths of its width.
(func $db_setup (param $n i32)
  (local $m f32) (local $hx f32) (local $jd f32) (local $nb i32) (local $k i32) (local $b i32) (local $cx f32)
  (local.set $m (f32.convert_i32_u (i32.shr_u (i32.add (local.get $n) (i32.const 1)) (i32.const 1))))
  (local.set $hx (f32.sqrt (f32.mul (f32.max (f32.mul (local.get $m) (f32.const @DB_AREA)) (f32.const @DB_AMIN)) (f32.const 0.5))))
  (local.set $jd (f32.max (f32.div (f32.mul (local.get $m) (f32.const @DB_JAREA)) (f32.mul (local.get $hx) (f32.const 2))) (f32.const @DB_JMIN)))
  (!chk (local.get $hx) 360 (local.get $n))
  (local.set $nb (i32.div_u (i32.add (local.get $n) (i32.const @(DB_PER - 1))) (i32.const @DB_PER)))
  (if (i32.lt_u (local.get $nb) (i32.const @DB_NMIN)) (then (local.set $nb (i32.const @DB_NMIN))))
  (if (i32.gt_u (local.get $nb) (i32.const @DB_NMAX)) (then (local.set $nb (i32.const @DB_NMAX))))
  (i32.store (i32.const @PG_KIND) (i32.const @PK_SCORE))
  (i32.store (i32.const @PG_LEN) (i32.const @DB_LEN))
  (i32.store (i32.const @PG_FLAGS) (i32.const @(PGF_BUMPS | PGF_TEAMS)))
  (f32.store (i32.const @PG_SIZE) (f32.add (local.get $hx) (local.get $jd)))
  (f32.store (i32.const @(PG_H + DB_HX)) (local.get $hx))
  (f32.store (i32.const @(PG_H + DB_HZ)) (local.get $hx))
  (f32.store (i32.const @(PG_H + DB_JD)) (local.get $jd))
  (i32.store (i32.const @(PG_H + DB_NB)) (local.get $nb))
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (!for $k (i32.const 0) (local.get $nb)
    (local.set $b (call $db_b (local.get $k)))
    (i32.store8 offset=@DB_BST (local.get $b) (i32.const @DB_LOOSE))
    (i32.store8 offset=@DB_BBY (local.get $b) (i32.const 255))
    (f32.store offset=@DB_BX (local.get $b) (local.get $cx))
    (f32.store offset=@DB_BY (local.get $b) (f32.const @(+PLAT_Y + DB_R)))
    (f32.store offset=@DB_BZ (local.get $b)
      (!madd (f32.sub (f32.div (f32.mul (f32.add (f32.convert_i32_u (local.get $k)) (f32.const 0.5)) (f32.const 2)) (f32.convert_i32_u (local.get $nb))) (f32.const 1))
             (f32.mul (local.get $hx) (f32.const 0.9)) (local.get $cx)))))

;; As the round is laid out, ball PG_TK of its side's PG_TN in rows from its
;; back line, DB_GAP apart, each row centred; a newcomer or a ball back in
;; play at its back line, k of 1024 across.
(func $db_spawn (param $i i32) (param $n i32) (result f32 f32 f32)
  (local $s i32) (local $k i32) (local $m i32) (local $per i32) (local $row i32) (local $cnt i32)
  (local $dir f32) (local $hx f32) (local $hz f32) (local $cx f32) (local $x f32) (local $z f32)
  (local.set $s (i32.load (i32.const @PG_TSIDE)))
  (local.set $dir (call $db_dir (local.get $s)))
  (local.set $hx (f32.load (i32.const @(PG_H + DB_HX))))
  (local.set $hz (f32.load (i32.const @(PG_H + DB_HZ))))
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (if (i32.eq (i32.load (i32.const @HDR_STATE)) (i32.const @H_PLAY))
    (then
      (return
        (!madd (local.get $dir) (f32.sub (local.get $hx) (f32.const @DB_BACK)) (local.get $cx))
        (f32.const @PLAT_Y)
        (!madd (f32.sub (f32.mul (f32.convert_i32_u (i32.and (local.get $i) (i32.const 1023))) (f32.const @(2 / 1023))) (f32.const 1))
               (f32.sub (local.get $hz) (f32.const @DB_BACK)) (local.get $cx)))))
  (local.set $k (i32.load (i32.const @PG_TK)))
  (local.set $m (i32.and (i32.shr_u (i32.load (i32.const @PG_TN)) (i32.shl (local.get $s) (i32.const 4))) (i32.const 0xffff)))
  (local.set $per (i32.trunc_sat_f32_u (f32.div (f32.sub (f32.mul (local.get $hz) (f32.const 2)) (f32.const 1)) (f32.const @DB_GAP))))
  (if (i32.eqz (local.get $per)) (then (local.set $per (i32.const 1))))
  (local.set $row (i32.div_u (local.get $k) (local.get $per)))
  (local.set $cnt (i32.sub (local.get $m) (i32.mul (local.get $row) (local.get $per))))
  (if (i32.or (i32.gt_s (local.get $cnt) (local.get $per)) (i32.le_s (local.get $cnt) (i32.const 0))) (then (local.set $cnt (local.get $per))))
  (local.set $z (!madd (f32.sub (f32.convert_i32_u (i32.rem_u (local.get $k) (local.get $per))) (f32.mul (f32.convert_i32_s (i32.sub (local.get $cnt) (i32.const 1))) (f32.const 0.5)))
                       (f32.const @DB_GAP) (local.get $cx)))
  (local.set $x (!madd (local.get $dir) (f32.sub (f32.sub (local.get $hx) (f32.const @DB_BACK)) (f32.mul (f32.convert_i32_u (local.get $row)) (f32.const @DB_GAP))) (local.get $cx)))
  (local.get $x) (f32.const @PLAT_Y) (local.get $z))

;; Play starts: every ball's use counter as it stands (a click in the
;; countdown isn't one).
(func $db_start
  (local $p i32)
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (i32.store8 offset=@DB_SEEN (call $db_s (local.get $p))
      (i32.and (i32.shr_u (!at i32 @(PLAYERS + P_IN) (i32.shl (local.get $p) (i32.const 6))) (i32.const 29)) (i32.const 3)))))

;; Every ball starts in play.
(func $db_begin (param $p i32) (param $d i32)
  (!put i32 @(PLAYERS + PG_M) (i32.add (i32.shl (local.get $p) (i32.const 6)) (local.get $d)) (i32.const @DB_PLAY)))

;; A floor without end: the walls and the line (in push) keep a ball on the court.
(func $db_ground (param $d i32) (param $x f32) (param $y f32) (param $z f32) (result f32)
  (select (f32.const @PLAT_Y) (f32.const -1000) (f32.ge (local.get $y) (f32.const @PLAT_Y))))

;; Ball p on bank d after its roll: kept on its own half (in play) or in its
;; jail behind the other side's back line, bouncing softly off the line, the
;; back line and the walls. Its side and its jail are in its record.
(func $db_push (param $p i32) (param $d i32)
  (local $pb i32) (local $s i32) (local $r f32) (local $cx f32) (local $hx f32) (local $hz f32) (local $jd f32)
  (local $lo f32) (local $hi f32) (local $px f32) (local $pz f32) (local $vx f32) (local $vz f32)
  (local.set $pb (i32.add (i32.shl (local.get $p) (i32.const 6)) (local.get $d)))
  (local.set $s (call $p_side (local.get $pb)))
  (local.set $r (call $b_rad (local.get $pb)))
  (local.set $cx (f32.load offset=@PG_CX (local.get $d)))
  (local.set $hx (f32.load offset=@(PG_H + DB_HX) (local.get $d)))
  (local.set $hz (f32.load offset=@(PG_H + DB_HZ) (local.get $d)))
  (local.set $jd (f32.load offset=@(PG_H + DB_JD) (local.get $d)))
  (if (i32.eq (!at i32 @(PLAYERS + PG_M) (local.get $pb)) (i32.const @DB_JAIL))
    (then
      ;; red's jail is past blue's back line, blue's past red's
      (if (local.get $s)
        (then (local.set $lo (f32.add (f32.sub (f32.sub (local.get $cx) (local.get $hx)) (local.get $jd)) (local.get $r)))
              (local.set $hi (f32.sub (f32.sub (local.get $cx) (local.get $hx)) (local.get $r))))
        (else (local.set $lo (f32.add (f32.add (local.get $cx) (local.get $hx)) (local.get $r)))
              (local.set $hi (f32.sub (f32.add (f32.add (local.get $cx) (local.get $hx)) (local.get $jd)) (local.get $r))))))
    (else
      (if (local.get $s)
        (then (local.set $lo (f32.add (local.get $cx) (local.get $r)))
              (local.set $hi (f32.sub (f32.add (local.get $cx) (local.get $hx)) (local.get $r))))
        (else (local.set $lo (f32.add (f32.sub (local.get $cx) (local.get $hx)) (local.get $r)))
              (local.set $hi (f32.sub (local.get $cx) (local.get $r)))))))
  (local.set $px (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
  (local.set $pz (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
  (local.set $vx (!at f32 @(PLAYERS + P_VX) (local.get $pb)))
  (local.set $vz (!at f32 @(PLAYERS + P_VZ) (local.get $pb)))
  (if (f32.lt (local.get $px) (local.get $lo))
    (then (local.set $px (local.get $lo)) (if (f32.lt (local.get $vx) (f32.const 0)) (then (local.set $vx (f32.mul (local.get $vx) (f32.const @(-DB_PE))))))))
  (if (f32.gt (local.get $px) (local.get $hi))
    (then (local.set $px (local.get $hi)) (if (f32.gt (local.get $vx) (f32.const 0)) (then (local.set $vx (f32.mul (local.get $vx) (f32.const @(-DB_PE))))))))
  (local.set $lo (f32.add (f32.sub (local.get $cx) (local.get $hz)) (local.get $r)))
  (local.set $hi (f32.sub (f32.add (local.get $cx) (local.get $hz)) (local.get $r)))
  (if (f32.lt (local.get $pz) (local.get $lo))
    (then (local.set $pz (local.get $lo)) (if (f32.lt (local.get $vz) (f32.const 0)) (then (local.set $vz (f32.mul (local.get $vz) (f32.const @(-DB_PE))))))))
  (if (f32.gt (local.get $pz) (local.get $hi))
    (then (local.set $pz (local.get $hi)) (if (f32.gt (local.get $vz) (f32.const 0)) (then (local.set $vz (f32.mul (local.get $vz) (f32.const @(-DB_PE))))))))
  (!chk (local.get $px) 361 (local.get $p))
  (!chk (local.get $pz) 362 (local.get $p))
  (!put f32 @(PLAYERS + P_PX) (local.get $pb) (local.get $px))
  (!put f32 @(PLAYERS + P_PZ) (local.get $pb) (local.get $pz))
  (!put f32 @(PLAYERS + P_VX) (local.get $pb) (local.get $vx))
  (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (local.get $vz)))

;; Dodgeball k loose where it is (or at a ball dropping it), still.
(func $db_drop (param $k i32)
  (local $b i32)
  (local.set $b (call $db_b (local.get $k)))
  (i32.store8 offset=@DB_BST (local.get $b) (i32.const @DB_LOOSE))
  (f32.store offset=@DB_BVX (local.get $b) (f32.const 0))
  (f32.store offset=@DB_BVY (local.get $b) (f32.const 0))
  (f32.store offset=@DB_BVZ (local.get $b) (f32.const 0)))

;; Whatever slot p holds, dropped; and any dodgeball held by p that its slot
;; doesn't know of (a slot taken over by a newcomer).
(func $db_unhold (param $p i32)
  (local $k i32) (local $b i32)
  (!for $k (i32.const 0) (i32.load (i32.const @(PG_H + DB_NB)))
    (local.set $b (call $db_b (local.get $k)))
    (if (i32.and (i32.eq (i32.load8_u offset=@DB_BST (local.get $b)) (i32.const @DB_HELD)) (i32.eq (i32.load8_u offset=@DB_BBY (local.get $b)) (local.get $p)))
      (then (call $db_drop (local.get $k)))))
  (i32.store8 offset=@DB_HOLD (call $db_s (local.get $p)) (i32.const 0)))

;; Ball q to its jail behind the other side's back line, still, dropping
;; what it holds, on tick t into play.
(func $db_jail (param $q i32) (param $t i32)
  (local $qb i32) (local $cx f32) (local $hz f32)
  (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
  (call $db_unhold (local.get $q))
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (local.set $hz (f32.load (i32.const @(PG_H + DB_HZ))))
  (!put i32 @(PLAYERS + PG_M) (local.get $qb) (i32.const @DB_JAIL))
  (i32.store offset=@DB_JAILT (call $db_s (local.get $q)) (local.get $t))
  (!put f32 @(PLAYERS + P_PX) (local.get $qb)
    (!madd (f32.neg (call $db_dir (call $p_side (local.get $qb))))
           (!madd (f32.load (i32.const @(PG_H + DB_JD))) (f32.const 0.5) (f32.load (i32.const @(PG_H + DB_HX)))) (local.get $cx)))
  (!put f32 @(PLAYERS + P_PY) (local.get $qb) (f32.const @PLAT_Y))
  (!put f32 @(PLAYERS + P_PZ) (local.get $qb)
    (f32.min (f32.max (!at f32 @(PLAYERS + P_PZ) (local.get $qb)) (f32.add (f32.sub (local.get $cx) (local.get $hz)) (f32.const 1.2)))
             (f32.sub (f32.add (local.get $cx) (local.get $hz)) (f32.const 1.2))))
  (!put f32 @(PLAYERS + P_VX) (local.get $qb) (f32.const 0))
  (!put f32 @(PLAYERS + P_VY) (local.get $qb) (f32.const 0))
  (!put f32 @(PLAYERS + P_VZ) (local.get $qb) (f32.const 0))
  (!put u8 @(PLAYERS + P_FL) (local.get $qb) (i32.or (!at u8 @(PLAYERS + P_FL) (local.get $qb)) (i32.const @PF_GROUND))))

;; Ball q back in play from jail, at its own back line, still.
(func $db_back (param $q i32)
  (local $qb i32)
  (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
  (!put i32 @(PLAYERS + PG_M) (local.get $qb) (i32.const @DB_PLAY))
  (!put f32 @(PLAYERS + P_PX) (local.get $qb)
    (!madd (call $db_dir (call $p_side (local.get $qb))) (f32.sub (f32.load (i32.const @(PG_H + DB_HX))) (f32.const @DB_BACK)) (f32.load (i32.const @PG_CX))))
  (!put f32 @(PLAYERS + P_VX) (local.get $qb) (f32.const 0))
  (!put f32 @(PLAYERS + P_VY) (local.get $qb) (f32.const 0))
  (!put f32 @(PLAYERS + P_VZ) (local.get $qb) (f32.const 0)))

;; Side s's ball longest in jail (the lowest slot of a tie) back in play: its
;; slot, or 255 for none.
(func $db_free (param $s i32) (result i32)
  (local $q i32) (local $qb i32) (local $best i32) (local $bt i32) (local $jt i32)
  (local.set $best (i32.const 255))
  (local.set $bt (i32.const -1))
  (!for $q (i32.const 0) (i32.const @NPLAYER)
    (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
    (if (i32.and (i32.and (call $p_in (local.get $qb)) (i32.eq (!at i32 @(PLAYERS + PG_M) (local.get $qb)) (i32.const @DB_JAIL)))
                 (i32.eq (call $p_side (local.get $qb)) (local.get $s)))
      (then
        (local.set $jt (i32.load offset=@DB_JAILT (call $db_s (local.get $q))))
        (if (i32.lt_u (local.get $jt) (local.get $bt)) (then (local.set $bt (local.get $jt)) (local.set $best (local.get $q)))))))
  (if (i32.ne (local.get $best) (i32.const 255)) (then (call $db_back (local.get $best))))
  (local.get $best))

;; Slot p's throw of the dodgeball it holds, on tick t into play: from DB_UP
;; over its centre and DB_OUT past its skin, the way it faces, DB_V and DB_LOFT up.
(func $db_throw (param $p i32) (param $t i32)
  (local $pb i32) (local $sb i32) (local $k i32) (local $b i32) (local $s f32) (local $c f32) (local $r f32) (local $out f32)
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (local.set $sb (call $db_s (local.get $p)))
  (local.set $k (i32.sub (i32.load8_u offset=@DB_HOLD (local.get $sb)) (i32.const 1)))
  (local.set $b (call $db_b (local.get $k)))
  (call $sincos (!at i32 @(PLAYERS + P_IN) (local.get $pb)))
  (local.set $c) (local.set $s)
  (local.set $r (call $b_rad (local.get $pb)))
  (local.set $out (f32.add (local.get $r) (f32.const @(DB_R + DB_OUT))))
  (i32.store8 offset=@DB_BST (local.get $b) (i32.const @DB_FLY))
  (i32.store8 offset=@DB_BBY (local.get $b) (local.get $p))
  (i32.store8 offset=@DB_BSIDE (local.get $b) (call $p_side (local.get $pb)))
  (i32.store offset=@DB_BAT (local.get $b) (local.get $t))
  (f32.store offset=@DB_BX (local.get $b) (!madd (local.get $c) (local.get $out) (!at f32 @(PLAYERS + P_PX) (local.get $pb))))
  (f32.store offset=@DB_BY (local.get $b) (f32.add (!at f32 @(PLAYERS + P_PY) (local.get $pb)) (f32.add (local.get $r) (f32.const @DB_UP))))
  (f32.store offset=@DB_BZ (local.get $b) (!madd (local.get $s) (local.get $out) (!at f32 @(PLAYERS + P_PZ) (local.get $pb))))
  (f32.store offset=@DB_BVX (local.get $b) (f32.mul (local.get $c) (f32.const @DB_V)))
  (f32.store offset=@DB_BVY (local.get $b) (f32.const @DB_LOFT))
  (f32.store offset=@DB_BVZ (local.get $b) (f32.mul (local.get $s) (f32.const @DB_V)))
  (i32.store8 offset=@DB_HOLD (local.get $sb) (i32.const 0))
  (i32.store16 offset=@DB_THROWS (local.get $sb) (i32.add (i32.load16_u offset=@DB_THROWS (local.get $sb)) (i32.const 1)))
  (call $fx (i32.const 0) (i32.const @DB_FX_THROW) (local.get $p) (local.get $k)
            (f32.load offset=@DB_BX (local.get $b)) (f32.load offset=@DB_BY (local.get $b)) (f32.load offset=@DB_BZ (local.get $b)) (f32.const @DB_V)))

;; Slot p clicks with nothing held on tick t into play: the nearest enemy
;; throw coming in within reach of its centre is caught (the thrower to jail,
;; p's side's longest jailed back); none, or the catch locked, a miss that
;; locks it DB_LOCK.
(func $db_catch (param $p i32) (param $t i32)
  (local $pb i32) (local $sb i32) (local $side i32) (local $k i32) (local $b i32) (local $best i32) (local $q i32) (local $fr i32)
  (local $x f32) (local $y f32) (local $z f32) (local $dx f32) (local $dy f32) (local $dz f32) (local $d2 f32) (local $bd f32) (local $sp f32) (local $reach f32)
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (local.set $sb (call $db_s (local.get $p)))
  (local.set $side (call $p_side (local.get $pb)))
  (local.set $x (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
  (local.set $y (f32.add (!at f32 @(PLAYERS + P_PY) (local.get $pb)) (call $b_rad (local.get $pb))))
  (local.set $z (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
  (local.set $best (i32.const -1))
  (local.set $bd (f32.const inf))
  (if (i32.ge_s (local.get $t) (i32.load16_u offset=@DB_LOCKT (local.get $sb)))
    (then
      (!for $k (i32.const 0) (i32.load (i32.const @(PG_H + DB_NB)))
        (local.set $b (call $db_b (local.get $k)))
        (if (i32.and (i32.eq (i32.load8_u offset=@DB_BST (local.get $b)) (i32.const @DB_FLY))
                     (i32.ne (i32.load8_u offset=@DB_BSIDE (local.get $b)) (local.get $side)))
          (then
            (local.set $dx (f32.sub (f32.load offset=@DB_BX (local.get $b)) (local.get $x)))
            (local.set $dy (f32.sub (f32.load offset=@DB_BY (local.get $b)) (local.get $y)))
            (local.set $dz (f32.sub (f32.load offset=@DB_BZ (local.get $b)) (local.get $z)))
            (local.set $d2 (!dot3 (local.get $dx) (local.get $dy) (local.get $dz) (local.get $dx) (local.get $dy) (local.get $dz)))
            (local.set $sp (f32.sqrt (!dot3 (f32.load offset=@DB_BVX (local.get $b)) (f32.load offset=@DB_BVY (local.get $b)) (f32.load offset=@DB_BVZ (local.get $b))
                                            (f32.load offset=@DB_BVX (local.get $b)) (f32.load offset=@DB_BVY (local.get $b)) (f32.load offset=@DB_BVZ (local.get $b)))))
            (local.set $reach (!madd (local.get $sp) (f32.const @DB_WIN) (f32.const @DB_REACH0)))
            (if (i32.and (i32.and (f32.le (local.get $d2) (f32.mul (local.get $reach) (local.get $reach))) (f32.lt (local.get $d2) (local.get $bd)))
                         (f32.lt (!dot3 (local.get $dx) (local.get $dy) (local.get $dz)
                                        (f32.load offset=@DB_BVX (local.get $b)) (f32.load offset=@DB_BVY (local.get $b)) (f32.load offset=@DB_BVZ (local.get $b)))
                                 (f32.const 0)))
              (then (local.set $bd (local.get $d2)) (local.set $best (local.get $k)))))))))
  (if (i32.lt_s (local.get $best) (i32.const 0))
    (then
      (call $fx (i32.const 0) (i32.const @DB_FX_WHIFF) (local.get $p) (i32.lt_s (local.get $t) (i32.load16_u offset=@DB_LOCKT (local.get $sb)))
                (local.get $x) (local.get $y) (local.get $z) (f32.const @DB_LOCK))
      (i32.store16 offset=@DB_LOCKT (local.get $sb) (i32.add (local.get $t) (i32.const @DB_LOCK)))
      (return)))
  (local.set $b (call $db_b (local.get $best)))
  (local.set $q (i32.load8_u offset=@DB_BBY (local.get $b)))
  (local.set $sp (f32.sqrt (!dot3 (f32.load offset=@DB_BVX (local.get $b)) (f32.load offset=@DB_BVY (local.get $b)) (f32.load offset=@DB_BVZ (local.get $b))
                                  (f32.load offset=@DB_BVX (local.get $b)) (f32.load offset=@DB_BVY (local.get $b)) (f32.load offset=@DB_BVZ (local.get $b)))))
  (i32.store8 offset=@DB_BST (local.get $b) (i32.const @DB_HELD))
  (i32.store8 offset=@DB_BBY (local.get $b) (local.get $p))
  (i32.store offset=@DB_BAT (local.get $b) (local.get $t))
  (i32.store8 offset=@DB_HOLD (local.get $sb) (i32.add (local.get $best) (i32.const 1)))
  (i32.store16 offset=@DB_CATCHES (local.get $sb) (i32.add (i32.load16_u offset=@DB_CATCHES (local.get $sb)) (i32.const 1)))
  (!put u16 @(PLAYERS + PG_SCORE) (local.get $pb) (i32.add (!at u16 @(PLAYERS + PG_SCORE) (local.get $pb)) (i32.const 2)))
  (if (i32.lt_u (local.get $q) (i32.const @NPLAYER))
    (then
      (if (call $db_in (i32.shl (local.get $q) (i32.const 6)))
        (then
          (!put u16 @(PLAYERS + B_KOS) (local.get $pb) (i32.add (!at u16 @(PLAYERS + B_KOS) (local.get $pb)) (i32.const 1)))
          (!put u8 @(PLAYERS + B_HITBY) (i32.shl (local.get $q) (i32.const 6)) (local.get $p))
          (call $db_jail (local.get $q) (local.get $t))))))
  (local.set $fr (call $db_free (local.get $side)))
  (call $fx (i32.const 0) (i32.const @DB_FX_CATCH) (local.get $p) (i32.or (local.get $q) (i32.shl (local.get $fr) (i32.const 8)))
            (f32.load offset=@DB_BX (local.get $b)) (f32.load offset=@DB_BY (local.get $b)) (f32.load offset=@DB_BZ (local.get $b)) (local.get $sp)))

;; Dodgeball k's tick, loose or flying: down DB_G (unless it lies still on
;; the floor, rolling), on a step; flying, onto the first ball of the other
;; side in play it meets (in slot order): that ball to jail, and it bounces
;; back off it, loose; then the walls (the court's, the back lines included)
;; and the floor, either of which leaves a throw loose.
(func $db_fly (param $k i32) (param $t i32)
  (local $b i32) (local $st i32) (local $q i32) (local $qb i32) (local $by i32) (local $side i32) (local $dead i32)
  (local $x f32) (local $y f32) (local $z f32) (local $vx f32) (local $vy f32) (local $vz f32) (local $r f32) (local $rs f32)
  (local $dx f32) (local $dy f32) (local $dz f32) (local $cx f32) (local $lo f32) (local $hi f32)
  (local.set $b (call $db_b (local.get $k)))
  (local.set $st (i32.load8_u offset=@DB_BST (local.get $b)))
  (if (i32.and (i32.ne (local.get $st) (i32.const @DB_LOOSE)) (i32.ne (local.get $st) (i32.const @DB_FLY))) (then (return)))
  (local.set $x (f32.load offset=@DB_BX (local.get $b)))
  (local.set $y (f32.load offset=@DB_BY (local.get $b)))
  (local.set $z (f32.load offset=@DB_BZ (local.get $b)))
  (local.set $vx (f32.load offset=@DB_BVX (local.get $b)))
  (local.set $vy (f32.load offset=@DB_BVY (local.get $b)))
  (local.set $vz (f32.load offset=@DB_BVZ (local.get $b)))
  (if (i32.and (i32.and (i32.eq (local.get $st) (i32.const @DB_LOOSE)) (f32.le (local.get $y) (f32.const @(+PLAT_Y + DB_R))))
               (f32.eq (local.get $vy) (f32.const 0)))
    (then
      (local.set $vx (f32.mul (local.get $vx) (f32.const @DB_ROLL)))
      (local.set $vz (f32.mul (local.get $vz) (f32.const @DB_ROLL)))
      ;; in a jail, down its slope toward the court
      (local.set $cx (f32.sub (local.get $x) (f32.load (i32.const @PG_CX))))
      (if (f32.gt (f32.abs (local.get $cx)) (f32.load (i32.const @(PG_H + DB_HX))))
        (then (local.set $vx (f32.sub (local.get $vx) (f32.copysign (f32.const @DB_TILT) (local.get $cx)))))))
    (else (local.set $vy (f32.sub (local.get $vy) (f32.const @DB_G)))))
  (local.set $x (!madd (local.get $vx) (f32.const @DT) (local.get $x)))
  (local.set $y (!madd (local.get $vy) (f32.const @DT) (local.get $y)))
  (local.set $z (!madd (local.get $vz) (f32.const @DT) (local.get $z)))
  (if (i32.eq (local.get $st) (i32.const @DB_FLY))
    (then
      (local.set $by (i32.load8_u offset=@DB_BBY (local.get $b)))
      (local.set $side (i32.load8_u offset=@DB_BSIDE (local.get $b)))
      (block $hit
        (!for $q (i32.const 0) (i32.const @NPLAYER)
          (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
          (if (i32.and (call $db_in (local.get $qb)) (i32.ne (call $p_side (local.get $qb)) (local.get $side)))
            (then
              (local.set $r (call $b_rad (local.get $qb)))
              (local.set $rs (f32.add (local.get $r) (f32.const @DB_R)))
              (local.set $dx (f32.sub (local.get $x) (!at f32 @(PLAYERS + P_PX) (local.get $qb))))
              (local.set $dz (f32.sub (local.get $z) (!at f32 @(PLAYERS + P_PZ) (local.get $qb))))
              (if (i32.and (f32.lt (f32.abs (local.get $dx)) (local.get $rs)) (f32.lt (f32.abs (local.get $dz)) (local.get $rs)))
                (then
                  (local.set $dy (f32.sub (local.get $y) (f32.add (!at f32 @(PLAYERS + P_PY) (local.get $qb)) (local.get $r))))
                  (if (f32.lt (!dot3 (local.get $dx) (local.get $dy) (local.get $dz) (local.get $dx) (local.get $dy) (local.get $dz)) (f32.mul (local.get $rs) (local.get $rs)))
                    (then
                      (call $fx (i32.const 0) (i32.const @DB_FX_HIT) (local.get $q) (i32.or (local.get $by) (i32.shl (local.get $k) (i32.const 8)))
                                (local.get $x) (local.get $y) (local.get $z)
                                (f32.sqrt (!dot3 (local.get $vx) (local.get $vy) (local.get $vz) (local.get $vx) (local.get $vy) (local.get $vz))))
                      (if (i32.lt_u (local.get $by) (i32.const @NPLAYER))
                        (then
                          (!put u16 @(PLAYERS + PG_SCORE) (i32.shl (local.get $by) (i32.const 6)) (i32.add (!at u16 @(PLAYERS + PG_SCORE) (i32.shl (local.get $by) (i32.const 6))) (i32.const 1)))
                          (!put u16 @(PLAYERS + B_KOS) (i32.shl (local.get $by) (i32.const 6)) (i32.add (!at u16 @(PLAYERS + B_KOS) (i32.shl (local.get $by) (i32.const 6))) (i32.const 1)))
                          (i32.store16 offset=@DB_HITS (call $db_s (local.get $by)) (i32.add (i32.load16_u offset=@DB_HITS (call $db_s (local.get $by))) (i32.const 1)))))
                      (!put u8 @(PLAYERS + B_HITBY) (local.get $qb) (local.get $by))
                      (call $db_jail (local.get $q) (local.get $t))
                      ;; a throw from jail that hits brings its thrower back
                      (if (i32.lt_u (local.get $by) (i32.const @NPLAYER))
                        (then
                          (if (i32.and (call $p_in (i32.shl (local.get $by) (i32.const 6)))
                                       (i32.eq (!at i32 @(PLAYERS + PG_M) (i32.shl (local.get $by) (i32.const 6))) (i32.const @DB_JAIL)))
                            (then (call $db_back (local.get $by))))))
                      (local.set $vx (f32.mul (local.get $vx) (f32.const @(-DB_BE))))
                      (local.set $vz (f32.mul (local.get $vz) (f32.const @(-DB_BE))))
                      (local.set $vy (f32.const 1.5))
                      (local.set $st (i32.const @DB_LOOSE))
                      (br $hit)))))))))))
  ;; the hall's walls, past the jails
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (local.set $hi (f32.sub (f32.add (f32.load (i32.const @(PG_H + DB_HX))) (f32.load (i32.const @(PG_H + DB_JD)))) (f32.const @DB_R)))
  (local.set $lo (f32.sub (local.get $cx) (local.get $hi)))
  (local.set $hi (f32.add (local.get $cx) (local.get $hi)))
  (if (f32.lt (local.get $x) (local.get $lo))
    (then (local.set $x (local.get $lo)) (local.set $dead (i32.const 1))
          (if (f32.lt (local.get $vx) (f32.const 0)) (then (local.set $vx (f32.mul (local.get $vx) (f32.const @(-DB_WE))))))))
  (if (f32.gt (local.get $x) (local.get $hi))
    (then (local.set $x (local.get $hi)) (local.set $dead (i32.const 1))
          (if (f32.gt (local.get $vx) (f32.const 0)) (then (local.set $vx (f32.mul (local.get $vx) (f32.const @(-DB_WE))))))))
  (local.set $hi (f32.sub (f32.load (i32.const @(PG_H + DB_HZ))) (f32.const @DB_R)))
  (local.set $lo (f32.sub (local.get $cx) (local.get $hi)))
  (local.set $hi (f32.add (local.get $cx) (local.get $hi)))
  (if (f32.lt (local.get $z) (local.get $lo))
    (then (local.set $z (local.get $lo)) (local.set $dead (i32.const 1))
          (if (f32.lt (local.get $vz) (f32.const 0)) (then (local.set $vz (f32.mul (local.get $vz) (f32.const @(-DB_WE))))))))
  (if (f32.gt (local.get $z) (local.get $hi))
    (then (local.set $z (local.get $hi)) (local.set $dead (i32.const 1))
          (if (f32.gt (local.get $vz) (f32.const 0)) (then (local.set $vz (f32.mul (local.get $vz) (f32.const @(-DB_WE))))))))
  ;; the floor: a bounce, or settled
  (if (f32.lt (local.get $y) (f32.const @(+PLAT_Y + DB_R)))
    (then
      (local.set $y (f32.const @(+PLAT_Y + DB_R)))
      (local.set $dead (i32.const 1))
      (local.set $vy (select (f32.mul (local.get $vy) (f32.const @(-DB_FE))) (f32.const 0) (f32.lt (local.get $vy) (f32.const @(-DB_SETTLE)))))))
  (if (local.get $dead) (then (local.set $st (i32.const @DB_LOOSE))))
  (!chk (local.get $x) 363 (local.get $k))
  (!chk (local.get $y) 364 (local.get $k))
  (!chk (local.get $z) 365 (local.get $k))
  (!chk (local.get $vx) 366 (local.get $k))
  (!chk (local.get $vy) 367 (local.get $k))
  (!chk (local.get $vz) 368 (local.get $k))
  (i32.store8 offset=@DB_BST (local.get $b) (local.get $st))
  (f32.store offset=@DB_BX (local.get $b) (local.get $x))
  (f32.store offset=@DB_BY (local.get $b) (local.get $y))
  (f32.store offset=@DB_BZ (local.get $b) (local.get $z))
  (f32.store offset=@DB_BVX (local.get $b) (local.get $vx))
  (f32.store offset=@DB_BVY (local.get $b) (local.get $vy))
  (f32.store offset=@DB_BVZ (local.get $b) (local.get $vz)))

;; Dodgeball k after the flights: held, with its holder (at its centre, as it
;; rolls), or dropped if its holder is gone or down; loose and low, to the
;; nearest ball in (in play or in jail) holding nothing within DB_GRAB of its
;; skin, flat.
(func $db_carry (param $k i32) (param $t i32)
  (local $b i32) (local $q i32) (local $qb i32) (local $best i32) (local $st i32)
  (local $x f32) (local $z f32) (local $dx f32) (local $dz f32) (local $d2 f32) (local $bd f32) (local $rs f32)
  (local.set $b (call $db_b (local.get $k)))
  (local.set $st (i32.load8_u offset=@DB_BST (local.get $b)))
  (if (i32.eq (local.get $st) (i32.const @DB_HELD))
    (then
      (local.set $q (i32.load8_u offset=@DB_BBY (local.get $b)))
      (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
      (if (i32.or (i32.eqz (call $p_in (local.get $qb)))
                  (i32.ne (i32.load8_u offset=@DB_HOLD (call $db_s (local.get $q))) (i32.add (local.get $k) (i32.const 1))))
        (then (call $db_drop (local.get $k)) (return)))
      (f32.store offset=@DB_BX (local.get $b) (!at f32 @(PLAYERS + P_PX) (local.get $qb)))
      (f32.store offset=@DB_BY (local.get $b) (f32.add (!at f32 @(PLAYERS + P_PY) (local.get $qb)) (call $b_rad (local.get $qb))))
      (f32.store offset=@DB_BZ (local.get $b) (!at f32 @(PLAYERS + P_PZ) (local.get $qb)))
      (return)))
  (if (i32.or (i32.ne (local.get $st) (i32.const @DB_LOOSE)) (f32.ge (f32.load offset=@DB_BY (local.get $b)) (f32.const @(+PLAT_Y + DB_LOW))))
    (then (return)))
  (local.set $x (f32.load offset=@DB_BX (local.get $b)))
  (local.set $z (f32.load offset=@DB_BZ (local.get $b)))
  (local.set $best (i32.const -1))
  (local.set $bd (f32.const inf))
  (!for $q (i32.const 0) (i32.const @NPLAYER)
    (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
    (if (call $p_in (local.get $qb))
      (then
        (local.set $dx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $qb)) (local.get $x)))
        (local.set $dz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $qb)) (local.get $z)))
        (local.set $rs (f32.add (call $b_rad (local.get $qb)) (f32.const @(DB_R + DB_GRAB))))
        (if (i32.and (f32.lt (f32.abs (local.get $dx)) (local.get $rs)) (f32.lt (f32.abs (local.get $dz)) (local.get $rs)))
          (then
            (local.set $d2 (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))))
            (if (i32.and (i32.and (f32.lt (local.get $d2) (f32.mul (local.get $rs) (local.get $rs))) (f32.lt (local.get $d2) (local.get $bd)))
                         (i32.eqz (i32.load8_u offset=@DB_HOLD (call $db_s (local.get $q)))))
              (then (local.set $bd (local.get $d2)) (local.set $best (local.get $q)))))))))
  (if (i32.lt_s (local.get $best) (i32.const 0)) (then (return)))
  (i32.store8 offset=@DB_BST (local.get $b) (i32.const @DB_HELD))
  (i32.store8 offset=@DB_BBY (local.get $b) (local.get $best))
  (i32.store offset=@DB_BAT (local.get $b) (local.get $t))
  (i32.store8 offset=@DB_HOLD (call $db_s (local.get $best)) (i32.add (local.get $k) (i32.const 1))))

;; The clicks, in slot order, on the dodgeballs as they stood when this
;; tick's words came in: a ball holding one throws it (from jail too), one in
;; play holding none tries a catch. A newcomer (PG_M still 0) starts its slot afresh,
;; in play. Then the dodgeballs fly and roll, are carried and picked up, in
;; order; then each side's balls in play, PG_TSCORE.
(func $db_tick
  (local $t i32) (local $p i32) (local $pb i32) (local $sb i32) (local $ctr i32) (local $k i32) (local $nb i32) (local $red i32) (local $blue i32)
  (local.set $t (call $p_t (i32.const 0)))
  (local.set $nb (i32.load (i32.const @(PG_H + DB_NB))))
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
    (if (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @PF_LIVE))
      (then
        (local.set $sb (call $db_s (local.get $p)))
        (local.set $ctr (i32.and (i32.shr_u (!at i32 @(PLAYERS + P_IN) (local.get $pb)) (i32.const 29)) (i32.const 3)))
        (if (i32.eqz (!at i32 @(PLAYERS + PG_M) (local.get $pb)))
          (then
            (call $db_unhold (local.get $p))
            (memory.fill (local.get $sb) (i32.const 0) (i32.const @DB_SSIZE))
            (i32.store8 offset=@DB_SEEN (local.get $sb) (local.get $ctr))
            (!put i32 @(PLAYERS + PG_M) (local.get $pb) (i32.const @DB_PLAY))))
        (if (i32.ne (local.get $ctr) (i32.load8_u offset=@DB_SEEN (local.get $sb)))
          (then
            (i32.store8 offset=@DB_SEEN (local.get $sb) (local.get $ctr))
            (if (call $p_in (local.get $pb))
              (then
                (if (i32.load8_u offset=@DB_HOLD (local.get $sb))
                  (then (call $db_throw (local.get $p) (local.get $t)))
                  (else (if (call $db_in (local.get $pb)) (then (call $db_catch (local.get $p) (local.get $t)))))))))))))
  (!for $k (i32.const 0) (local.get $nb) (call $db_fly (local.get $k) (local.get $t)))
  (!for $k (i32.const 0) (local.get $nb) (call $db_carry (local.get $k) (local.get $t)))
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
    (if (call $db_in (local.get $pb))
      (then (if (call $p_side (local.get $pb)) (then (!inc $blue)) (else (!inc $red))))))
  (i32.store (i32.const @PG_TSCORE) (local.get $red))
  (i32.store (i32.const @(PG_TSCORE + 4)) (local.get $blue)))

;; Over when a side that began with balls has none in play.
(func $db_over (result i32)
  (local $tn i32)
  (local.set $tn (i32.load (i32.const @PG_TN)))
  (i32.and (i32.and (i32.ne (i32.and (local.get $tn) (i32.const 0xffff)) (i32.const 0)) (i32.gt_u (local.get $tn) (i32.const 0xffff)))
           (i32.or (i32.eqz (i32.load (i32.const @PG_TSCORE))) (i32.eqz (i32.load (i32.const @(PG_TSCORE + 4)))))))

;; A ball down (it can't fall off, but one that did) drops what it holds.
(func $db_out (param $p i32)
  (call $db_unhold (local.get $p)))
