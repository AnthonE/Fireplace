;; PARRY BALL: a disc over the sea with a low rim, sized for the crowd, and
;; glowing orbs, one for every PY_PER balls (kept while PY_KEEP are in for
;; each), each hunting one ball at a time. An orb waits on its spot over the
;; floor with its ball picked, launches, and homes in on it, turning harder
;; the longer it flies, straight in once within reach. The ball hunted clicks
;; (the word's use counter) while the orb is in reach, PY_REACH0 plus its
;; speed times PY_WIN, so the window is about PY_WIN s at any speed: the orb
;; leaves from the ball's front along its facing, PY_UP times faster, after
;; the nearest ball in a cone round that facing, else the nearest, of those
;; at least PY_SEND s of its flight off (with none that far, the farthest;
;; balls another orb hunts last): sent at a ball that far, it lands 0.25 s
;; on or later, so a round trip of 0.15 s still leaves 0.1 s to click. An orb
;; that gets within PY_HIT of its ball puts it out, the KO to the last to
;; parry it, and after PY_REST launches again from its spot at a new ball,
;; from the PRNG (or retires, the balls left needing one fewer). A click with
;; nothing in reach locks a ball's parry for PY_LOCK, and a click while locked
;; locks it again, so mashing never parries. Orbs fly at least PY_S0 m/s,
;; faster by the tick; from PY_SHRINK0 the rim closes in. Nobody falls: the
;; rim keeps every ball on. The last ball in wins.
;;
;; The orbs and the clicks are the confirmed world's, in PG_S, judged in tick
;; at the tick of the clicker's own word, so a ball's own parry is judged on
;; the orb as its page drew it, at any latency; only another's parry that
;; sends the orb at you arrives a round trip late, which PY_SEND allows for.
;; The prediction runs only the rim, a function of the tick and the header,
;; so it is exact; a click changes nothing in the ball's record.

;; The disc for n balls.
(func $py_size (param $n i32) (result f32)
  (f32.min (!madd (f32.sqrt (f32.convert_i32_u (local.get $n))) (f32.const @PY_RK) (f32.const @PY_R0)) (f32.const @PY_RMAX)))

;; Orbs for n balls: one for every per, rounded up, at least 1, at most PY_NMAX.
(func $py_orbs (param $n i32) (param $per i32) (result i32)
  (local $k i32)
  (local.set $k (i32.div_u (i32.add (local.get $n) (i32.sub (local.get $per) (i32.const 1))) (local.get $per)))
  (if (i32.eqz (local.get $k)) (then (local.set $k (i32.const 1))))
  (select (local.get $k) (i32.const @PY_NMAX) (i32.lt_u (local.get $k) (i32.const @PY_NMAX))))

;; The rim's radius on tick t into play on bank d: the disc's, then from
;; PY_SHRINK0 in a straight line to PY_RFINAL by PY_SHRINK1.
(func $py_rim (param $d i32) (param $t i32) (result f32)
  (local $r0 f32)
  (local.set $r0 (f32.load offset=@(PG_H + PY_RAD) (local.get $d)))
  (if (i32.le_s (local.get $t) (i32.const @PY_SHRINK0)) (then (return (local.get $r0))))
  (if (i32.ge_s (local.get $t) (i32.const @PY_SHRINK1)) (then (return (f32.load offset=@(PG_H + PY_RFINAL) (local.get $d)))))
  (!madd (f32.sub (f32.load offset=@(PG_H + PY_RFINAL) (local.get $d)) (local.get $r0))
         (f32.div (f32.convert_i32_s (i32.sub (local.get $t) (i32.const @PY_SHRINK0))) (f32.const @(PY_SHRINK1 - PY_SHRINK0)))
         (local.get $r0)))

;; The least an orb flies at on tick t into play.
(func $py_base (param $t i32) (result f32)
  (!madd (f32.convert_i32_s (local.get $t)) (f32.const @PY_SKT) (f32.const @PY_S0)))

;; An orb's reach at speed sp.
(func $py_reach (param $sp f32) (result f32)
  (!madd (local.get $sp) (f32.const @PY_WIN) (f32.const @PY_REACH0)))

;; Is slot q hunted by an orb but k?
(func $py_taken (param $q i32) (param $k i32) (result i32)
  (local $j i32) (local $ob i32)
  (!for $j (i32.const 0) (i32.const @PY_NMAX)
    (local.set $ob (i32.add (i32.const @(PG_S + PY_ORB)) (i32.mul (local.get $j) (i32.const @PY_OSIZE))))
    (if (i32.and (i32.and (i32.ne (local.get $j) (local.get $k)) (i32.ne (i32.load8_u offset=@PY_OST (local.get $ob)) (i32.const @PY_IDLE)))
                 (i32.eq (i32.load8_u offset=@PY_OTGT (local.get $ob)) (local.get $q)))
      (then (return (i32.const 1)))))
  (i32.const 0))

;; Is slot q a ball an orb may hunt: in (as $p_in has it), or as the round is
;; laid out (all), in the room?
(func $py_can (param $q i32) (param $all i32) (result i32)
  (local $qb i32)
  (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
  (if (result i32) (local.get $all)
    (then (i32.ne (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $qb)) (i32.const @PF_LIVE)) (i32.const 0)))
    (else (call $p_in (local.get $qb)))))

;; The ball orb k goes after from (x, z), not p: of those at least the root
;; of min2 off, the nearest whose bearing is within PY_CONE of the facing
;; (fx, fz) (none for a facing of 0), else the nearest; with none that far,
;; the farthest; each first among those no other orb hunts. p itself when
;; it's alone; 255 when nobody is in. A min2 of 0: the nearest.
(func $py_pick (param $p i32) (param $k i32) (param $x f32) (param $z f32) (param $fx f32) (param $fz f32) (param $min2 f32) (result i32)
  (local $pass i32) (local $q i32) (local $qb i32) (local $cone i32) (local $any i32)
  (local $dx f32) (local $dz f32) (local $d2 f32) (local $bc f32) (local $ba f32) (local $bf f32)
  (!for $pass (i32.const 0) (i32.const 4)
    (local.set $cone (i32.const 255))
    (local.set $any (i32.const 255))
    (local.set $bc (f32.const inf))
    (local.set $ba (f32.const inf))
    (local.set $bf (f32.const -1))
    (!for $q (i32.const 0) (i32.const @NPLAYER)
      (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
      (if (i32.and (i32.ne (local.get $q) (local.get $p)) (call $p_in (local.get $qb)))
        (then
          (if (i32.or (i32.and (local.get $pass) (i32.const 1)) (i32.eqz (call $py_taken (local.get $q) (local.get $k))))
            (then
              (local.set $dx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $qb)) (local.get $x)))
              (local.set $dz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $qb)) (local.get $z)))
              (local.set $d2 (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))))
              (if (i32.ge_u (local.get $pass) (i32.const 2))
                (then (if (f32.ge (local.get $d2) (local.get $bf)) (then (local.set $bf (local.get $d2)) (local.set $any (local.get $q))))))
              (if (i32.and (i32.lt_u (local.get $pass) (i32.const 2)) (f32.ge (local.get $d2) (local.get $min2)))
                (then
                  (if (f32.lt (local.get $d2) (local.get $ba)) (then (local.set $ba (local.get $d2)) (local.set $any (local.get $q))))
                  (if (i32.and (f32.lt (local.get $d2) (local.get $bc))
                               (f32.ge (!madd (local.get $dx) (local.get $fx) (f32.mul (local.get $dz) (local.get $fz)))
                                       (f32.mul (f32.const @PY_CONE) (f32.sqrt (local.get $d2)))))
                    (then
                      (if (f32.gt (local.get $d2) (f32.const 0)) (then (local.set $bc (local.get $d2)) (local.set $cone (local.get $q)))))))))))))
    (if (i32.ne (local.get $cone) (i32.const 255)) (then (return (local.get $cone))))
    (if (i32.ne (local.get $any) (i32.const 255)) (then (return (local.get $any)))))
  (if (result i32) (i32.and (i32.lt_u (local.get $p) (i32.const @NPLAYER)) (call $p_in (i32.shl (local.get $p) (i32.const 6))))
    (then (local.get $p))
    (else (i32.const 255))))

;; A ball for orb k from the PRNG: one in (all: in the room) that no other
;; orb hunts, else any in; 255 for none.
(func $py_rpick (param $k i32) (param $all i32) (result i32)
  (local $pass i32) (local $q i32) (local $m i32) (local $r i32)
  (!for $pass (i32.const 0) (i32.const 2)
    (local.set $m (i32.const 0))
    (!for $q (i32.const 0) (i32.const @NPLAYER)
      (if (i32.and (call $py_can (local.get $q) (local.get $all)) (i32.or (local.get $pass) (i32.eqz (call $py_taken (local.get $q) (local.get $k)))))
        (then (!inc $m))))
    (if (local.get $m)
      (then
        (local.set $r (i32.rem_u (call $rand) (local.get $m)))
        (!for $q (i32.const 0) (i32.const @NPLAYER)
          (if (i32.and (call $py_can (local.get $q) (local.get $all)) (i32.or (local.get $pass) (i32.eqz (call $py_taken (local.get $q) (local.get $k)))))
            (then
              (if (i32.eqz (local.get $r)) (then (return (local.get $q))))
              (local.set $r (i32.sub (local.get $r) (i32.const 1)))))))))
  (i32.const 255))

;; Orb k on its spot (k of m on a ring PY_SPOT of the disc out), still,
;; launching on tick at into play at a ball from the PRNG; idle if there's
;; none. Its FX unless it's being laid out (all).
(func $py_serve (param $k i32) (param $m i32) (param $at i32) (param $all i32)
  (local $ob i32) (local $q i32) (local $x f32) (local $z f32)
  (local.set $ob (i32.add (i32.const @(PG_S + PY_ORB)) (i32.mul (local.get $k) (i32.const @PY_OSIZE))))
  (i32.store8 offset=@PY_OLAST (local.get $ob) (select (i32.load8_u offset=@PY_OTGT (local.get $ob)) (i32.const 255)
                                                       (i32.eq (i32.load8_u offset=@PY_OST (local.get $ob)) (i32.const @PY_FLY))))
  (local.set $q (call $py_rpick (local.get $k) (local.get $all)))
  (if (i32.eq (local.get $q) (i32.const 255))
    (then (i32.store8 offset=@PY_OST (local.get $ob) (i32.const @PY_IDLE)) (return)))
  (call $p_disc (local.get $k) (local.get $m) (f32.mul (f32.load (i32.const @(PG_H + PY_RAD))) (f32.const @PY_SPOT)))
  (local.set $z) (local.set $x)
  (i32.store8 offset=@PY_OST (local.get $ob) (i32.const @PY_WAIT))
  (i32.store8 offset=@PY_OTGT (local.get $ob) (local.get $q))
  (i32.store8 offset=@PY_OBY (local.get $ob) (i32.const 255))
  (i32.store8 offset=@PY_ORALLY (local.get $ob) (i32.const 0))
  (i32.store offset=@PY_OAT (local.get $ob) (local.get $at))
  (f32.store offset=@PY_OX (local.get $ob) (local.get $x))
  (f32.store offset=@PY_OZ (local.get $ob) (local.get $z))
  (f32.store offset=@PY_ODX (local.get $ob) (f32.const 1))
  (f32.store offset=@PY_ODZ (local.get $ob) (f32.const 0))
  (f32.store offset=@PY_OSP (local.get $ob) (call $py_base (local.get $at)))
  (if (i32.eqz (local.get $all))
    (then (call $fx (i32.const 0) (i32.const @PY_FX_SERVE) (local.get $q) (local.get $k)
                    (local.get $x) (f32.const @(+PLAT_Y + PY_Y)) (local.get $z)
                    (f32.convert_i32_s (i32.sub (local.get $at) (call $p_t (i32.const 0))))))))

;; The disc for the crowd, its rim's schedule, and the first orbs on their
;; spots with their balls picked (shown through the countdown), launching
;; PY_SERVE into play.
(func $py_setup (param $n i32)
  (local $r f32) (local $m i32) (local $k i32)
  (local.set $r (call $py_size (local.get $n)))
  (!chk (local.get $r) 330 (local.get $n))
  (local.set $m (call $py_orbs (local.get $n) (i32.const @PY_PER)))
  (i32.store (i32.const @PG_KIND) (i32.const @PK_OUT))
  (i32.store (i32.const @PG_LEN) (i32.const @PY_LEN))
  (i32.store (i32.const @PG_FLAGS) (i32.const @(PGF_BUMPS | PGF_NOKICK)))
  (f32.store (i32.const @PG_SIZE) (local.get $r))
  (f32.store (i32.const @(PG_H + PY_RAD)) (local.get $r))
  (f32.store (i32.const @(PG_H + PY_RFINAL)) (f32.min (local.get $r) (f32.max (f32.mul (local.get $r) (f32.const @PY_RFIN)) (f32.const @PY_RMIN))))
  (i32.store (i32.const @(PG_H + PY_NORB)) (local.get $m))
  (!for $k (i32.const 0) (local.get $m)
    (call $py_serve (local.get $k) (local.get $m) (i32.const @PY_SERVE) (i32.const 1))))

;; A sunflower spiral over the middle of the disc.
(func $py_spawn (param $i i32) (param $n i32) (result f32 f32 f32)
  (local $x f32) (local $z f32)
  (call $p_disc (local.get $i) (local.get $n) (f32.mul (f32.load (i32.const @(PG_H + PY_RAD))) (f32.const @PY_SPAWN)))
  (local.set $z) (local.set $x)
  (local.get $x) (f32.const @PLAT_Y) (local.get $z))

;; Play starts: every ball's use counter as it stands (a click in the
;; countdown isn't one), and each orb's ball told.
(func $py_start
  (local $p i32) (local $k i32) (local $ob i32)
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (i32.store8 offset=@(PG_S + PY_SLOT + PY_SEEN) (i32.shl (local.get $p) (i32.const 3))
      (i32.and (i32.shr_u (!at i32 @(PLAYERS + P_IN) (i32.shl (local.get $p) (i32.const 6))) (i32.const 29)) (i32.const 3))))
  (!for $k (i32.const 0) (i32.const @PY_NMAX)
    (local.set $ob (i32.add (i32.const @(PG_S + PY_ORB)) (i32.mul (local.get $k) (i32.const @PY_OSIZE))))
    (if (i32.eq (i32.load8_u offset=@PY_OST (local.get $ob)) (i32.const @PY_WAIT))
      (then (call $fx (i32.const 0) (i32.const @PY_FX_SERVE) (i32.load8_u offset=@PY_OTGT (local.get $ob)) (local.get $k)
                      (f32.load offset=@PY_OX (local.get $ob)) (f32.const @(+PLAT_Y + PY_Y)) (f32.load offset=@PY_OZ (local.get $ob))
                      (f32.convert_i32_u (i32.load offset=@PY_OAT (local.get $ob))))))))

(func $py_begin (param $p i32) (param $d i32))

;; A floor without end: the rim (in push) is what keeps a ball on the disc.
(func $py_ground (param $d i32) (param $x f32) (param $y f32) (param $z f32) (result f32)
  (select (f32.const @PLAT_Y) (f32.const -1000) (f32.ge (local.get $y) (f32.const @PLAT_Y))))

;; Ball p on bank d after its roll: past the rim as it stands on the bank's
;; tick, put back on it, bouncing off softly.
(func $py_push (param $p i32) (param $d i32)
  (local $pb i32) (local $cx f32) (local $lim f32) (local $dx f32) (local $dz f32) (local $d2 f32) (local $dist f32)
  (local $nx f32) (local $nz f32) (local $vx f32) (local $vz f32) (local $vn f32) (local $j f32)
  (local.set $pb (i32.add (i32.shl (local.get $p) (i32.const 6)) (local.get $d)))
  (local.set $cx (f32.load offset=@PG_CX (local.get $d)))
  (local.set $lim (f32.sub (call $py_rim (local.get $d) (call $p_t (local.get $d))) (call $b_rad (local.get $pb))))
  (local.set $dx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (local.get $cx)))
  (local.set $dz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $pb)) (local.get $cx)))
  (local.set $d2 (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))))
  (if (f32.le (local.get $d2) (f32.mul (local.get $lim) (local.get $lim))) (then (return)))
  (local.set $dist (f32.sqrt (local.get $d2)))
  (local.set $nx (f32.div (local.get $dx) (local.get $dist)))
  (local.set $nz (f32.div (local.get $dz) (local.get $dist)))
  (local.set $vx (!at f32 @(PLAYERS + P_VX) (local.get $pb)))
  (local.set $vz (!at f32 @(PLAYERS + P_VZ) (local.get $pb)))
  (local.set $vn (!madd (local.get $vx) (local.get $nx) (f32.mul (local.get $vz) (local.get $nz))))
  (if (f32.gt (local.get $vn) (f32.const 0))
    (then
      (local.set $j (f32.mul (local.get $vn) (f32.const @(-1 - PY_WE))))
      (local.set $vx (!madd (local.get $nx) (local.get $j) (local.get $vx)))
      (local.set $vz (!madd (local.get $nz) (local.get $j) (local.get $vz)))))
  (!chk (local.get $vx) 331 (local.get $p))
  (!chk (local.get $vz) 332 (local.get $p))
  (!put f32 @(PLAYERS + P_PX) (local.get $pb) (!madd (local.get $nx) (local.get $lim) (local.get $cx)))
  (!put f32 @(PLAYERS + P_PZ) (local.get $pb) (!madd (local.get $nz) (local.get $lim) (local.get $cx)))
  (!put f32 @(PLAYERS + P_VX) (local.get $pb) (local.get $vx))
  (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (local.get $vz)))

;; Ball p parries orb k on tick t: the orb leaves from its front along its
;; facing (from past its reach, the ball alone), PY_UP times faster, after
;; the ball $py_pick finds at least PY_SEND s of flight off, so whoever it
;; goes to sees it coming a round trip and a reaction before it lands; the FX.
(func $py_parry (param $k i32) (param $p i32) (param $t i32)
  (local $ob i32) (local $pb i32) (local $q i32) (local $s f32) (local $c f32) (local $px f32) (local $pz f32) (local $sp f32) (local $out f32) (local $min f32)
  (local.set $ob (i32.add (i32.const @(PG_S + PY_ORB)) (i32.mul (local.get $k) (i32.const @PY_OSIZE))))
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (call $sincos (!at i32 @(PLAYERS + P_IN) (local.get $pb)))
  (local.set $c) (local.set $s)
  (local.set $px (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
  (local.set $pz (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
  (local.set $sp (f32.min (f32.mul (f32.max (f32.load offset=@PY_OSP (local.get $ob)) (call $py_base (local.get $t))) (f32.const @PY_UP)) (f32.const @PY_SMAX)))
  (local.set $min (!madd (local.get $sp) (f32.const @PY_SEND) (f32.const @(PY_HIT + +B_RAD))))
  (local.set $q (call $py_pick (local.get $p) (local.get $k) (local.get $px) (local.get $pz) (local.get $c) (local.get $s) (f32.mul (local.get $min) (local.get $min))))
  (local.set $out (select (f32.add (call $py_reach (local.get $sp)) (f32.const 0.5)) (f32.const @B_RAD) (i32.eq (local.get $q) (local.get $p))))
  (i32.store8 offset=@PY_OLAST (local.get $ob) (local.get $p))
  (i32.store8 offset=@PY_OTGT (local.get $ob) (local.get $q))
  (i32.store8 offset=@PY_OBY (local.get $ob) (local.get $p))
  (i32.store8 offset=@PY_ORALLY (local.get $ob)
    (select (i32.const 255) (i32.add (i32.load8_u offset=@PY_ORALLY (local.get $ob)) (i32.const 1)) (i32.eq (i32.load8_u offset=@PY_ORALLY (local.get $ob)) (i32.const 255))))
  (i32.store offset=@PY_OAT (local.get $ob) (local.get $t))
  (f32.store offset=@PY_OX (local.get $ob) (!madd (local.get $c) (local.get $out) (local.get $px)))
  (f32.store offset=@PY_OZ (local.get $ob) (!madd (local.get $s) (local.get $out) (local.get $pz)))
  (f32.store offset=@PY_ODX (local.get $ob) (local.get $c))
  (f32.store offset=@PY_ODZ (local.get $ob) (local.get $s))
  (f32.store offset=@PY_OSP (local.get $ob) (local.get $sp))
  (i32.store16 offset=@(PG_S + PY_SLOT + PY_PARRIES) (i32.shl (local.get $p) (i32.const 3))
    (i32.add (i32.load16_u offset=@(PG_S + PY_SLOT + PY_PARRIES) (i32.shl (local.get $p) (i32.const 3))) (i32.const 1)))
  (call $fx (i32.const 0) (i32.const @PY_FX_PARRY) (local.get $p) (i32.or (local.get $q) (i32.shl (local.get $k) (i32.const 8)))
            (f32.load offset=@PY_OX (local.get $ob)) (f32.const @(+PLAT_Y + PY_Y)) (f32.load offset=@PY_OZ (local.get $ob)) (local.get $sp)))

;; Orb k reaches ball q on tick t: q out, the KO to the last to parry it; the
;; orb back on its spot for its next ball PY_REST on, or idle if the balls
;; left need one orb fewer.
(func $py_hit (param $k i32) (param $q i32) (param $t i32)
  (local $ob i32) (local $qb i32) (local $by i32) (local $p i32) (local $left i32) (local $on i32) (local $j i32)
  (local.set $ob (i32.add (i32.const @(PG_S + PY_ORB)) (i32.mul (local.get $k) (i32.const @PY_OSIZE))))
  (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
  (local.set $by (i32.load8_u offset=@PY_OBY (local.get $ob)))
  (!put u8 @(PLAYERS + B_HITBY) (local.get $qb) (local.get $by))
  (!put u16 @(PLAYERS + B_HITT) (local.get $qb) (i32.ne (local.get $by) (i32.const 255)))
  (call $fx (i32.const 0) (i32.const @PY_FX_HIT) (local.get $q) (i32.or (local.get $by) (i32.shl (local.get $k) (i32.const 8)))
            (f32.load offset=@PY_OX (local.get $ob)) (f32.const @(+PLAT_Y + PY_Y)) (f32.load offset=@PY_OZ (local.get $ob))
            (f32.load offset=@PY_OSP (local.get $ob)))
  (call $p_out (local.get $q))
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (if (call $p_in (i32.shl (local.get $p) (i32.const 6))) (then (!inc $left))))
  (!for $j (i32.const 0) (i32.const @PY_NMAX)
    (if (i32.load8_u offset=@(PG_S + PY_ORB + PY_OST) (i32.mul (local.get $j) (i32.const @PY_OSIZE))) (then (!inc $on))))
  (if (i32.or (i32.eqz (local.get $left)) (i32.gt_u (local.get $on) (call $py_orbs (local.get $left) (i32.const @PY_KEEP))))
    (then
      (i32.store8 offset=@PY_OLAST (local.get $ob) (local.get $q))
      (i32.store8 offset=@PY_OST (local.get $ob) (i32.const @PY_IDLE))
      (return)))
  (call $py_serve (local.get $k) (i32.load (i32.const @(PG_H + PY_NORB))) (i32.add (local.get $t) (i32.const @PY_REST)) (i32.const 0)))

;; Orb k's tick: on its spot until its launch, then off at its ball; flying,
;; at least the round's least speed, after a new ball (the nearest to it) if
;; its own is out or gone, turning toward it (straight in within reach), on
;; a step, and a hit if it's there.
(func $py_fly (param $k i32) (param $t i32)
  (local $ob i32) (local $st i32) (local $q i32) (local $qb i32)
  (local $ox f32) (local $oz f32) (local $dirx f32) (local $dirz f32) (local $sp f32)
  (local $dx f32) (local $dz f32) (local $dist f32) (local $ux f32) (local $uz f32) (local $rate f32) (local $sg f32)
  (local $nx f32) (local $nz f32) (local $len f32)
  (local.set $ob (i32.add (i32.const @(PG_S + PY_ORB)) (i32.mul (local.get $k) (i32.const @PY_OSIZE))))
  (local.set $st (i32.load8_u offset=@PY_OST (local.get $ob)))
  (if (i32.eq (local.get $st) (i32.const @PY_IDLE)) (then (return)))
  (if (i32.and (i32.eq (local.get $st) (i32.const @PY_WAIT)) (i32.lt_s (local.get $t) (i32.load offset=@PY_OAT (local.get $ob)))) (then (return)))
  (local.set $ox (f32.load offset=@PY_OX (local.get $ob)))
  (local.set $oz (f32.load offset=@PY_OZ (local.get $ob)))
  (local.set $q (i32.load8_u offset=@PY_OTGT (local.get $ob)))
  (if (i32.eqz (call $p_in (i32.shl (local.get $q) (i32.const 6))))
    (then
      (local.set $q (call $py_pick (i32.const 255) (local.get $k) (local.get $ox) (local.get $oz) (f32.const 0) (f32.const 0) (f32.const 0)))
      (if (i32.eq (local.get $q) (i32.const 255))
        (then (i32.store8 offset=@PY_OST (local.get $ob) (i32.const @PY_IDLE)) (return)))
      (i32.store8 offset=@PY_OTGT (local.get $ob) (local.get $q))))
  (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
  (local.set $dx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $qb)) (local.get $ox)))
  (local.set $dz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $qb)) (local.get $oz)))
  (local.set $dist (f32.sqrt (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz)))))
  (local.set $dirx (f32.load offset=@PY_ODX (local.get $ob)))
  (local.set $dirz (f32.load offset=@PY_ODZ (local.get $ob)))
  (if (f32.gt (local.get $dist) (f32.const 0.001))
    (then
      (local.set $ux (f32.div (local.get $dx) (local.get $dist)))
      (local.set $uz (f32.div (local.get $dz) (local.get $dist))))
    (else (local.set $ux (local.get $dirx)) (local.set $uz (local.get $dirz))))
  (if (i32.eq (local.get $st) (i32.const @PY_WAIT))
    (then
      ;; the launch: straight at it, at the round's least speed
      (i32.store8 offset=@PY_OST (local.get $ob) (i32.const @PY_FLY))
      (i32.store offset=@PY_OAT (local.get $ob) (local.get $t))
      (local.set $dirx (local.get $ux))
      (local.set $dirz (local.get $uz))))
  (local.set $sp (f32.max (f32.load offset=@PY_OSP (local.get $ob)) (call $py_base (local.get $t))))
  (if (f32.le (local.get $dist) (call $py_reach (local.get $sp)))
    (then (local.set $dirx (local.get $ux)) (local.set $dirz (local.get $uz)))
    (else
      ;; turn toward it by up to rate (a step along the perpendicular, normalised), not past it
      (local.set $rate (f32.min (!madd (f32.convert_i32_s (i32.sub (local.get $t) (i32.load offset=@PY_OAT (local.get $ob)))) (f32.const @PY_TURNK) (f32.const @PY_TURN0))
                                (f32.const @PY_TURN1)))
      (local.set $sg (select (local.get $rate) (f32.neg (local.get $rate))
                             (f32.ge (f32.sub (f32.mul (local.get $dirx) (local.get $uz)) (f32.mul (local.get $dirz) (local.get $ux))) (f32.const 0))))
      (local.set $nx (f32.sub (local.get $dirx) (f32.mul (local.get $dirz) (local.get $sg))))
      (local.set $nz (!madd (local.get $dirx) (local.get $sg) (local.get $dirz)))
      (local.set $len (f32.sqrt (!madd (local.get $nx) (local.get $nx) (f32.mul (local.get $nz) (local.get $nz)))))
      (local.set $nx (f32.div (local.get $nx) (local.get $len)))
      (local.set $nz (f32.div (local.get $nz) (local.get $len)))
      (if (i32.and (f32.le (f32.mul (f32.sub (f32.mul (local.get $nx) (local.get $uz)) (f32.mul (local.get $nz) (local.get $ux))) (local.get $sg)) (f32.const 0))
                   (f32.gt (!madd (local.get $nx) (local.get $ux) (f32.mul (local.get $nz) (local.get $uz))) (f32.const 0)))
        (then (local.set $dirx (local.get $ux)) (local.set $dirz (local.get $uz)))
        (else (local.set $dirx (local.get $nx)) (local.set $dirz (local.get $nz))))))
  (local.set $ox (!madd (local.get $dirx) (f32.mul (local.get $sp) (f32.const @DT)) (local.get $ox)))
  (local.set $oz (!madd (local.get $dirz) (f32.mul (local.get $sp) (f32.const @DT)) (local.get $oz)))
  (!chk (local.get $ox) 333 (local.get $k))
  (!chk (local.get $oz) 334 (local.get $k))
  (!chk (local.get $dirx) 335 (local.get $k))
  (!chk (local.get $dirz) 336 (local.get $k))
  (f32.store offset=@PY_OX (local.get $ob) (local.get $ox))
  (f32.store offset=@PY_OZ (local.get $ob) (local.get $oz))
  (f32.store offset=@PY_ODX (local.get $ob) (local.get $dirx))
  (f32.store offset=@PY_ODZ (local.get $ob) (local.get $dirz))
  (f32.store offset=@PY_OSP (local.get $ob) (local.get $sp))
  (local.set $dx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $qb)) (local.get $ox)))
  (local.set $dz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $qb)) (local.get $oz)))
  (if (f32.le (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))) (f32.const @(PY_HIT * PY_HIT)))
    (then (call $py_hit (local.get $k) (local.get $q) (local.get $t)))))

;; The clicks, in slot order, each on the orbs as they stood when this tick's
;; words came in: a ball in that clicks with an orb that hunts it in reach
;; parries it (every such orb), else its parry is locked PY_LOCK (again, if
;; it was). Then the orbs, in order.
(func $py_tick
  (local $t i32) (local $p i32) (local $pb i32) (local $sb i32) (local $ctr i32) (local $k i32) (local $ob i32) (local $hit i32)
  (local $dx f32) (local $dz f32)
  (local.set $t (call $p_t (i32.const 0)))
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
    (local.set $sb (i32.shl (local.get $p) (i32.const 3)))
    (local.set $ctr (i32.and (i32.shr_u (!at i32 @(PLAYERS + P_IN) (local.get $pb)) (i32.const 29)) (i32.const 3)))
    (if (i32.ne (local.get $ctr) (i32.load8_u offset=@(PG_S + PY_SLOT + PY_SEEN) (local.get $sb)))
      (then
        (i32.store8 offset=@(PG_S + PY_SLOT + PY_SEEN) (local.get $sb) (local.get $ctr))
        (if (call $p_in (local.get $pb))
          (then
            (local.set $hit (i32.const 0))
            (if (i32.ge_s (local.get $t) (i32.load16_u offset=@(PG_S + PY_SLOT + PY_LOCKT) (local.get $sb)))
              (then
                (!for $k (i32.const 0) (i32.const @PY_NMAX)
                  (local.set $ob (i32.add (i32.const @(PG_S + PY_ORB)) (i32.mul (local.get $k) (i32.const @PY_OSIZE))))
                  (if (i32.and (i32.eq (i32.load8_u offset=@PY_OST (local.get $ob)) (i32.const @PY_FLY))
                               (i32.eq (i32.load8_u offset=@PY_OTGT (local.get $ob)) (local.get $p)))
                    (then
                      (local.set $dx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (f32.load offset=@PY_OX (local.get $ob))))
                      (local.set $dz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $pb)) (f32.load offset=@PY_OZ (local.get $ob))))
                      (if (f32.le (f32.sqrt (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))))
                                  (call $py_reach (f32.load offset=@PY_OSP (local.get $ob))))
                        (then
                          (call $py_parry (local.get $k) (local.get $p) (local.get $t))
                          (local.set $hit (i32.const 1)))))))))
            (if (i32.eqz (local.get $hit))
              (then
                (call $fx (i32.const 0) (i32.const @PY_FX_WHIFF) (local.get $p)
                          (i32.lt_s (local.get $t) (i32.load16_u offset=@(PG_S + PY_SLOT + PY_LOCKT) (local.get $sb)))
                          (!at f32 @(PLAYERS + P_PX) (local.get $pb))
                          (f32.add (!at f32 @(PLAYERS + P_PY) (local.get $pb)) (call $b_rad (local.get $pb)))
                          (!at f32 @(PLAYERS + P_PZ) (local.get $pb))
                          (f32.const @PY_LOCK))
                (i32.store16 offset=@(PG_S + PY_SLOT + PY_LOCKT) (local.get $sb) (i32.add (local.get $t) (i32.const @PY_LOCK)))
                (i32.store16 offset=@(PG_S + PY_SLOT + PY_WHIFFS) (local.get $sb)
                  (i32.add (i32.load16_u offset=@(PG_S + PY_SLOT + PY_WHIFFS) (local.get $sb)) (i32.const 1))))))))))
  (!for $k (i32.const 0) (i32.const @PY_NMAX)
    (call $py_fly (local.get $k) (local.get $t))))

(func $py_over (result i32) (i32.const 0))
(func $py_out (param $p i32))
