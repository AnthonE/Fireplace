;; The ball: every player a ball, built when BUMPER is set, which party
;; (build/party/game.wasm) always sets with PARTY. Its power-ups, bumps,
;; blasts and rockets are here; the round, the roll and the stages are
;; party.wat's and its minigames'. (Bumper balls' own game, the wheel of
;; Swiss cheese, is party's SWISS ROLL now, src/mg/cheese.wat.) Everything
;; here runs serially, by slot, in the same order on every machine.
;;
;; $b_use runs on either bank d (0 the confirmed world, PRED_D the
;; prediction) and touches only the ball's own record and its bank's FX ring;
;; bumps, blasts and rockets are the confirmed world's.

;; A ball's radius and weight, MEGA or not. A round that sizes its
;; balls (PGF_SIZE) keeps each one's radius in its PG_M, an f32 (B_RAD while
;; that is less), and a ball weighs its radius cubed. The flags are read from
;; the confirmed header on either bank: the prediction never lays a round
;; out, so its copy's are the same.
(func $b_rad (param $pb i32) (result f32)
  (if (i32.and (i32.load (i32.const @PG_FLAGS)) (i32.const @PGF_SIZE))
    (then (return (f32.max (!at f32 @(PLAYERS + PG_M) (local.get $pb)) (f32.const @B_RAD)))))
  (select (f32.const @MEGA_RAD) (f32.const @B_RAD) (!at u16 @(PLAYERS + B_MEGA) (local.get $pb))))
(func $b_mass (param $pb i32) (result f32)
  (local $r f32)
  (if (i32.and (i32.load (i32.const @PG_FLAGS)) (i32.const @PGF_SIZE))
    (then
      (local.set $r (call $b_rad (local.get $pb)))
      (return (f32.mul (f32.mul (local.get $r) (local.get $r)) (local.get $r)))))
  (select (f32.const @MEGA_M) (f32.const 1) (!at u16 @(PLAYERS + B_MEGA) (local.get $pb))))

;; Uniform in [0, 1).
(func $b_unit (result f32)
  (f32.mul (f32.convert_i32_u (i32.shr_u (call $rand) (i32.const 8))) (f32.const 0x1p-24)))


;; Slot p uses the power-up it holds, facing (c, s). What it does to itself
;; runs on either bank; what it does to others only on the confirmed world.
(func $b_use (param $p i32) (param $d i32) (param $item i32) (param $s f32) (param $c f32)
  (local $pb i32) (local $fl i32) (local $shots i32) (local $rad f32) (local $j i32) (local $jb i32)
  (local $px f32) (local $py f32) (local $pz f32)
  (local.set $pb (i32.add (i32.shl (local.get $p) (i32.const 6)) (local.get $d)))
  (local.set $fl (!at u8 @(PLAYERS + P_FL) (local.get $pb)))
  (local.set $rad (call $b_rad (local.get $pb)))
  (local.set $px (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
  (local.set $py (!at f32 @(PLAYERS + P_PY) (local.get $pb)))
  (local.set $pz (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
  (!put u8 @(PLAYERS + B_ITEM) (local.get $pb) (i32.const 0))
  (local.set $shots (i32.and (i32.add (!at u16 @(PLAYERS + P_SHOTS) (local.get $pb)) (i32.const 1)) (i32.const 0xffff)))
  (!put u16 @(PLAYERS + P_SHOTS) (local.get $pb) (local.get $shots))
  (call $fx (local.get $d) (i32.const @FX_USE) (local.get $p) (local.get $shots) (local.get $px) (local.get $py) (local.get $pz) (f32.convert_i32_u (local.get $item)))
  (if (i32.eq (local.get $item) (i32.const @PU_MEGA))
    (then (!put u16 @(PLAYERS + B_MEGA) (local.get $pb) (i32.const @MEGA_TICKS))))
  (if (i32.eq (local.get $item) (i32.const @PU_DASH))
    (then
      (!put f32 @(PLAYERS + P_VX) (local.get $pb) (f32.mul (local.get $c) (f32.const @DASH_V)))
      (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (f32.mul (local.get $s) (f32.const @DASH_V)))
      (!put u16 @(PLAYERS + B_DASH) (local.get $pb) (i32.const @DASH_TICKS))))
  ;; a spring works while you're still above the cheese: it can save a ball tipping in
  (if (i32.and (i32.eq (local.get $item) (i32.const @PU_SPRING)) (i32.eqz (i32.and (local.get $fl) (i32.const @PF_FALL))))
    (then
      (!put f32 @(PLAYERS + P_VY) (local.get $pb) (f32.const @SPRING_V))
      (!put u8 @(PLAYERS + P_FL) (local.get $pb) (i32.and (i32.or (local.get $fl) (i32.const @PF_STOMP)) (i32.const @(255 ^ PF_GROUND))))))
  (if (local.get $d) (then (return)))
  (if (i32.eq (local.get $item) (i32.const @PU_POW))
    (then (call $b_blast (local.get $px) (f32.add (local.get $py) (local.get $rad)) (local.get $pz) (f32.const @POW_R) (f32.const @POW_S) (local.get $p))))
  (if (i32.eq (local.get $item) (i32.const @PU_ROCKET))
    (then
      (block $found
        (!for $j (i32.const 0) (i32.const @NPROJ)
          (local.set $jb (i32.shl (local.get $j) (i32.const 5)))
          (br_if $found (i32.eqz (!at u8 @(PROJ + J_KIND) (local.get $jb)))))
        (return))
      (!put f32 @(PROJ + J_PX) (local.get $jb) (!madd (local.get $c) (f32.add (local.get $rad) (f32.const 0.8)) (local.get $px)))
      (!put f32 @(PROJ + J_PY) (local.get $jb) (f32.add (local.get $py) (local.get $rad)))
      (!put f32 @(PROJ + J_PZ) (local.get $jb) (!madd (local.get $s) (f32.add (local.get $rad) (f32.const 0.8)) (local.get $pz)))
      (!put f32 @(PROJ + J_VX) (local.get $jb) (f32.mul (local.get $c) (f32.const @ROCKET_BV)))
      (!put f32 @(PROJ + J_VY) (local.get $jb) (f32.const 0))
      (!put f32 @(PROJ + J_VZ) (local.get $jb) (f32.mul (local.get $s) (f32.const @ROCKET_BV)))
      (!put u16 @(PROJ + J_AGE) (local.get $jb) (i32.const 0))
      (!put u8 @(PROJ + J_KIND) (local.get $jb) (i32.const @K_ROCKET))
      (!put u8 @(PROJ + J_OWNER) (local.get $jb) (local.get $p))
      (!put u16 @(PROJ + J_SHOT) (local.get $jb) (local.get $shots)))))

;; ---- the confirmed world: blasts, rockets, bumps

;; Is slot q a ball on the cheese (in, and not going through)?
(func $b_in (param $qb i32) (result i32)
  (i32.eq (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $qb)) (i32.const @(PF_LIVE | PF_DEAD | PF_FALL))) (i32.const @PF_LIVE)))

;; Golf's blast, on balls: everyone but the owner within r of (x, y, z) shoved
;; away and up, s m/s at the centre falling to nothing at r, less for heavy balls.
;; A team round without PGF_MATES spares the owner's side.
(func $b_blast (param $x f32) (param $y f32) (param $z f32) (param $r f32) (param $s f32) (param $owner i32)
  (local $q i32) (local $qb i32) (local $rq f32) (local $dx f32) (local $dy f32) (local $dz f32) (local $d2 f32) (local $hd f32) (local $f f32)
  (local $mates i32)
  (local.set $mates (i32.and (i32.eq (i32.and (i32.load (i32.const @PG_FLAGS)) (i32.const @(PGF_TEAMS | PGF_MATES))) (i32.const @PGF_TEAMS))
                             (i32.lt_u (local.get $owner) (i32.const @NPLAYER))))
  (!for $q (i32.const 0) (i32.const @NPLAYER)
    (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
    (if (i32.and (i32.and (call $b_in (local.get $qb)) (i32.ne (local.get $q) (local.get $owner)))
                 (i32.eqz (i32.and (local.get $mates) (call $p_mates (local.get $q) (local.get $owner)))))
      (then
        (local.set $rq (call $b_rad (local.get $qb)))
        (local.set $dx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $qb)) (local.get $x)))
        (local.set $dy (f32.sub (f32.add (!at f32 @(PLAYERS + P_PY) (local.get $qb)) (local.get $rq)) (local.get $y)))
        (local.set $dz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $qb)) (local.get $z)))
        (local.set $hd (f32.add (f32.mul (local.get $dx) (local.get $dx)) (f32.mul (local.get $dz) (local.get $dz))))
        (local.set $d2 (!madd (local.get $dy) (local.get $dy) (local.get $hd)))
        (if (f32.lt (local.get $d2) (f32.mul (local.get $r) (local.get $r)))
          (then
            (local.set $hd (f32.sqrt (f32.max (local.get $hd) (f32.const 1e-6))))
            (local.set $f (f32.div (f32.mul (local.get $s) (f32.sub (f32.const 1) (f32.div (f32.sqrt (local.get $d2)) (local.get $r))))
                                   (call $b_mass (local.get $qb))))
            (!put f32 @(PLAYERS + P_VX) (local.get $qb) (!madd (f32.div (local.get $dx) (local.get $hd)) (local.get $f) (!at f32 @(PLAYERS + P_VX) (local.get $qb))))
            (!put f32 @(PLAYERS + P_VZ) (local.get $qb) (!madd (f32.div (local.get $dz) (local.get $hd)) (local.get $f) (!at f32 @(PLAYERS + P_VZ) (local.get $qb))))
            (!put f32 @(PLAYERS + P_VY) (local.get $qb) (!madd (local.get $f) (f32.const @BLAST_UP) (!at f32 @(PLAYERS + P_VY) (local.get $qb))))
            (!put u8 @(PLAYERS + P_FL) (local.get $qb) (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $qb)) (i32.const @(255 ^ PF_GROUND))))
            (if (i32.ge_s (local.get $owner) (i32.const 0))
              (then
                (!put u8 @(PLAYERS + B_HITBY) (local.get $qb) (local.get $owner))
                (!put u16 @(PLAYERS + B_HITT) (local.get $qb) (i32.const @CREDIT_TICKS)))))))))
  (call $fx (i32.const 0) (i32.const @FX_BLAST) (local.get $owner) (i32.const 0) (local.get $x) (local.get $y) (local.get $z) (local.get $r)))

;; Rockets fly level in two half steps a tick and go off on the first ball they
;; meet, never their owner's; one that meets nobody in 3 s fizzles.
(func $b_rockets
  (local $j i32) (local $jb i32) (local $k i32) (local $q i32) (local $qb i32) (local $owner i32)
  (local $x f32) (local $y f32) (local $z f32) (local $rq f32) (local $dx f32) (local $dy f32) (local $dz f32)
  (!for $j (i32.const 0) (i32.const @NPROJ)
    (local.set $jb (i32.shl (local.get $j) (i32.const 5)))
    (if (i32.eq (!at u8 @(PROJ + J_KIND) (local.get $jb)) (i32.const @K_ROCKET))
      (then (block $gone
        (!put u16 @(PROJ + J_AGE) (local.get $jb) (i32.add (!at u16 @(PROJ + J_AGE) (local.get $jb)) (i32.const 1)))
        (if (i32.gt_u (!at u16 @(PROJ + J_AGE) (local.get $jb)) (i32.const 375))
          (then (memory.fill (i32.add (i32.const @PROJ) (local.get $jb)) (i32.const 0) (i32.const @JSIZE)) (br $gone)))
        (local.set $owner (!at u8 @(PROJ + J_OWNER) (local.get $jb)))
        (!for $k (i32.const 0) (i32.const 2)
          (local.set $x (!madd (!at f32 @(PROJ + J_VX) (local.get $jb)) (f32.const @(DT / 2)) (!at f32 @(PROJ + J_PX) (local.get $jb))))
          (local.set $y (!at f32 @(PROJ + J_PY) (local.get $jb)))
          (local.set $z (!madd (!at f32 @(PROJ + J_VZ) (local.get $jb)) (f32.const @(DT / 2)) (!at f32 @(PROJ + J_PZ) (local.get $jb))))
          (!put f32 @(PROJ + J_PX) (local.get $jb) (local.get $x))
          (!put f32 @(PROJ + J_PZ) (local.get $jb) (local.get $z))
          (!for $q (i32.const 0) (i32.const @NPLAYER)
            (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
            (if (i32.and (call $b_in (local.get $qb)) (i32.ne (local.get $q) (local.get $owner)))
              (then
                (local.set $rq (call $b_rad (local.get $qb)))
                (local.set $dx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $qb)) (local.get $x)))
                (local.set $dy (f32.sub (f32.add (!at f32 @(PLAYERS + P_PY) (local.get $qb)) (local.get $rq)) (local.get $y)))
                (local.set $dz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $qb)) (local.get $z)))
                (local.set $rq (f32.add (local.get $rq) (f32.const 0.35)))
                (if (f32.lt (!dot3 (local.get $dx) (local.get $dy) (local.get $dz) (local.get $dx) (local.get $dy) (local.get $dz)) (f32.mul (local.get $rq) (local.get $rq)))
                  (then
                    (memory.fill (i32.add (i32.const @PROJ) (local.get $jb)) (i32.const 0) (i32.const @JSIZE))
                    (call $b_blast (local.get $x) (local.get $y) (local.get $z) (f32.const @BROCKET_R) (f32.const @BROCKET_S) (local.get $owner))
                    (br $gone))))))))))))

;; Every pair of balls in, in slot order: out of each other's way
;; (the lighter one more) and, if they were closing, an elastic bump with a
;; kick on top (none while the round says PGF_NOKICK; and in a team
;; round without PGF_MATES, teammates pass through each other). Each
;; remembers who hit it, for the KO.
(func $b_bumps
  (local $n i32) (local $a i32) (local $b i32) (local $i i32) (local $j i32) (local $ib i32) (local $jb i32) (local $p i32)
  (local $ri f32) (local $rj f32) (local $rs f32) (local $dx f32) (local $dy f32) (local $dz f32) (local $d2 f32) (local $d f32)
  (local $nx f32) (local $ny f32) (local $nz f32) (local $mi f32) (local $mj f32) (local $w f32) (local $vrel f32) (local $over f32) (local $jj f32)
  (local $ui f32) (local $uj f32) (local $si f32) (local $sj f32)
  (local $mates i32) (local $fi i32)
  (local.set $mates (i32.eq (i32.and (i32.load (i32.const @PG_FLAGS)) (i32.const @(PGF_TEAMS | PGF_MATES))) (i32.const @PGF_TEAMS)))
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (if (call $b_in (i32.shl (local.get $p) (i32.const 6)))
      (then (!st u8 @B_SCR (local.get $n) (local.get $p)) (!inc $n))))
  (!for $a (i32.const 0) (local.get $n)
    (local.set $i (!ld u8 @B_SCR (local.get $a)))
    (local.set $ib (i32.shl (local.get $i) (i32.const 6)))
    (local.set $ri (call $b_rad (local.get $ib)))
    (local.set $fi (!at u8 @(PLAYERS + P_FL) (local.get $ib)))
    (!for $b (i32.add (local.get $a) (i32.const 1)) (local.get $n)
      (local.set $j (!ld u8 @B_SCR (local.get $b)))
      (local.set $jb (i32.shl (local.get $j) (i32.const 6)))
      (local.set $rj (call $b_rad (local.get $jb)))
      (local.set $rs (f32.add (local.get $ri) (local.get $rj)))
      (local.set $dx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $jb)) (!at f32 @(PLAYERS + P_PX) (local.get $ib))))
      (local.set $dz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $jb)) (!at f32 @(PLAYERS + P_PZ) (local.get $ib))))
      (if (i32.and (i32.and (f32.lt (f32.abs (local.get $dx)) (local.get $rs)) (f32.lt (f32.abs (local.get $dz)) (local.get $rs)))
                   (i32.or (i32.eqz (local.get $mates)) (i32.ne (i32.and (i32.xor (local.get $fi) (!at u8 @(PLAYERS + P_FL) (local.get $jb))) (i32.const @PF_BLUE)) (i32.const 0))))
        (then
          (local.set $dy (f32.sub (f32.add (!at f32 @(PLAYERS + P_PY) (local.get $jb)) (local.get $rj))
                                  (f32.add (!at f32 @(PLAYERS + P_PY) (local.get $ib)) (local.get $ri))))
          (local.set $d2 (!dot3 (local.get $dx) (local.get $dy) (local.get $dz) (local.get $dx) (local.get $dy) (local.get $dz)))
          (if (f32.lt (local.get $d2) (f32.mul (local.get $rs) (local.get $rs)))
            (then
              (local.set $d (f32.sqrt (f32.max (local.get $d2) (f32.const 1e-6))))
              ;; dead on top of each other: apart along x
              (if (f32.lt (local.get $d2) (f32.const 1e-6)) (then (local.set $dx (local.get $d)) (local.set $dy (f32.const 0)) (local.set $dz (f32.const 0))))
              (local.set $nx (f32.div (local.get $dx) (local.get $d)))
              (local.set $ny (f32.div (local.get $dy) (local.get $d)))
              (local.set $nz (f32.div (local.get $dz) (local.get $d)))
              (local.set $mi (call $b_mass (local.get $ib)))
              (local.set $mj (call $b_mass (local.get $jb)))
              (local.set $ui (f32.div (f32.const 1) (local.get $mi)))
              (local.set $uj (f32.div (f32.const 1) (local.get $mj)))
              (local.set $w (f32.add (local.get $ui) (local.get $uj)))
              (local.set $over (f32.div (f32.sub (local.get $rs) (local.get $d)) (local.get $w)))
              (!put f32 @(PLAYERS + P_PX) (local.get $ib) (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $ib)) (f32.mul (local.get $nx) (f32.mul (local.get $over) (local.get $ui)))))
              (!put f32 @(PLAYERS + P_PZ) (local.get $ib) (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $ib)) (f32.mul (local.get $nz) (f32.mul (local.get $over) (local.get $ui)))))
              (!put f32 @(PLAYERS + P_PX) (local.get $jb) (!madd (local.get $nx) (f32.mul (local.get $over) (local.get $uj)) (!at f32 @(PLAYERS + P_PX) (local.get $jb))))
              (!put f32 @(PLAYERS + P_PZ) (local.get $jb) (!madd (local.get $nz) (f32.mul (local.get $over) (local.get $uj)) (!at f32 @(PLAYERS + P_PZ) (local.get $jb))))
              (local.set $vrel (!dot3 (f32.sub (!at f32 @(PLAYERS + P_VX) (local.get $jb)) (!at f32 @(PLAYERS + P_VX) (local.get $ib)))
                                      (f32.sub (!at f32 @(PLAYERS + P_VY) (local.get $jb)) (!at f32 @(PLAYERS + P_VY) (local.get $ib)))
                                      (f32.sub (!at f32 @(PLAYERS + P_VZ) (local.get $jb)) (!at f32 @(PLAYERS + P_VZ) (local.get $ib)))
                                      (local.get $nx) (local.get $ny) (local.get $nz)))
              (if (f32.lt (local.get $vrel) (f32.const 0))
                (then
                  ;; how fast each was going into the other, before the bump
                  (local.set $si (f32.add (f32.mul (!at f32 @(PLAYERS + P_VX) (local.get $ib)) (local.get $nx)) (f32.mul (!at f32 @(PLAYERS + P_VZ) (local.get $ib)) (local.get $nz))))
                  (local.set $sj (f32.neg (f32.add (f32.mul (!at f32 @(PLAYERS + P_VX) (local.get $jb)) (local.get $nx)) (f32.mul (!at f32 @(PLAYERS + P_VZ) (local.get $jb)) (local.get $nz)))))
                  (local.set $jj (f32.div (f32.sub (select (f32.const 0) (f32.const @B_KICK) (i32.and (i32.load (i32.const @PG_FLAGS)) (i32.const @PGF_NOKICK)))
                                                   (f32.mul (local.get $vrel) (f32.const @(1 + +B_E)))) (local.get $w)))
                  (!put f32 @(PLAYERS + P_VX) (local.get $ib) (f32.sub (!at f32 @(PLAYERS + P_VX) (local.get $ib)) (f32.mul (local.get $nx) (f32.mul (local.get $jj) (local.get $ui)))))
                  (!put f32 @(PLAYERS + P_VY) (local.get $ib) (f32.sub (!at f32 @(PLAYERS + P_VY) (local.get $ib)) (f32.mul (local.get $ny) (f32.mul (local.get $jj) (local.get $ui)))))
                  (!put f32 @(PLAYERS + P_VZ) (local.get $ib) (f32.sub (!at f32 @(PLAYERS + P_VZ) (local.get $ib)) (f32.mul (local.get $nz) (f32.mul (local.get $jj) (local.get $ui)))))
                  (!put f32 @(PLAYERS + P_VX) (local.get $jb) (!madd (local.get $nx) (f32.mul (local.get $jj) (local.get $uj)) (!at f32 @(PLAYERS + P_VX) (local.get $jb))))
                  (!put f32 @(PLAYERS + P_VY) (local.get $jb) (!madd (local.get $ny) (f32.mul (local.get $jj) (local.get $uj)) (!at f32 @(PLAYERS + P_VY) (local.get $jb))))
                  (!put f32 @(PLAYERS + P_VZ) (local.get $jb) (!madd (local.get $nz) (f32.mul (local.get $jj) (local.get $uj)) (!at f32 @(PLAYERS + P_VZ) (local.get $jb))))
                  (!put u8 @(PLAYERS + B_HITBY) (local.get $ib) (local.get $j))
                  (!put u16 @(PLAYERS + B_HITT) (local.get $ib) (i32.const @CREDIT_TICKS))
                  (!put u8 @(PLAYERS + B_HITBY) (local.get $jb) (local.get $i))
                  (!put u16 @(PLAYERS + B_HITT) (local.get $jb) (i32.const @CREDIT_TICKS))
                  ;; a hard one: the faster into it gets the bump
                  (if (f32.le (local.get $vrel) (f32.const -4)) (then
                  (if (f32.ge (local.get $si) (local.get $sj))
                    (then (!put u16 @(PLAYERS + B_BUMPS) (local.get $ib) (i32.add (!at u16 @(PLAYERS + B_BUMPS) (local.get $ib)) (i32.const 1))))
                    (else (!put u16 @(PLAYERS + B_BUMPS) (local.get $jb) (i32.add (!at u16 @(PLAYERS + B_BUMPS) (local.get $jb)) (i32.const 1)))))
                  (call $fx (i32.const 0) (i32.const @FX_BUMP) (local.get $i) (local.get $j)
                            (!madd (local.get $nx) (local.get $ri) (!at f32 @(PLAYERS + P_PX) (local.get $ib)))
                            (!madd (local.get $ny) (local.get $ri) (f32.add (!at f32 @(PLAYERS + P_PY) (local.get $ib)) (local.get $ri)))
                            (!madd (local.get $nz) (local.get $ri) (!at f32 @(PLAYERS + P_PZ) (local.get $ib)))
                            (f32.neg (local.get $vrel))))))))))))))

