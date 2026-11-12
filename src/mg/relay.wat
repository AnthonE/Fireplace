;; RELAY RACE: red against blue (PGF_TEAMS) on a walled track, RY_L0 m plus
;; RY_LK times the root of the balls in long and RY_W0 plus RY_WK times it
;; wide, a zone RY_ZD deep across each end: zone 0 at low x, red's own, zone 1
;; at high x, blue's. Each side has a baton for every 4 of its balls (the
;; balls in plus RY_BN over RY_BD, 1 to RY_BMAX), lying across its own zone as
;; the round is laid out, half of each side there with them and half in the
;; other zone. A ball in play of a baton's side, carrying nothing and rested,
;; that comes within reach of it lying takes it (the nearest, ties to the
;; lower slot) and carries it, keeping RY_SLOW of its speed a tick: 15% slower
;; flat out. A carrier whose centre crosses the line of the zone its baton is
;; going to has run a leg: a point for its side (PG_TSCORE), RY_PT_LEG of its
;; own, and the baton is set down RY_SET past the line, going back the other
;; way, any teammate's at once; the carrier takes none for RY_REST, unless it
;; is its side's only ball in. A carrier bumped hard by a foe faster into the
;; bump (its velocity jolted more than RY_HARD, 5 m/s of closing) drops its
;; baton where it is: nobody's for RY_LOCK, not its carrier's for RY_REGRAB,
;; and only ever its own side's; RY_PT_KNOCK to the foe. Between the zones
;; rows of posts RY_ROWGAP apart slide across the track, each row a triangle
;; wave of the tick with a phase and a pace from the round's seed, and a ball
;; one meets is put outside it and sent off at RY_KNOCK and RY_LIFT up. The
;; first side to its target (RY_TGT legs, RY_TGTK more for each baton past
;; the first) wins, or the one with more at the clock; level, a draw.
;;
;; The walls, the zones and the rows are fixed at setup in the header, a
;; post's place is a function of the tick, and a carrier's slowdown reads its
;; own PG_M (the baton it carries), so the prediction rolls a ball through all
;; of it bit for bit. The batons are the confirmed world's, in PG_S: taking,
;; a leg, the handoff and a knock are judged in tick on the records as they
;; stand, a ball against a shared thing, and come a round trip late, PG_M
;; with them.

;; A baton's record, and a slot's.
(func $ry_b (param $k i32) (result i32)
  (i32.add (i32.const @(PG_S + RY_BAT)) (i32.shl (local.get $k) (i32.const 4))))
(func $ry_s (param $p i32) (result i32)
  (i32.add (i32.const @(PG_BIG + RY_SLOT)) (i32.shl (local.get $p) (i32.const 5))))

;; Zone e's way from the middle: -1 for 0, 1 for 1.
(func $ry_dir (param $e i32) (result f32)
  (select (f32.const 1) (f32.const -1) (local.get $e)))

;; Baton k lying at (x, z), set down or dropped by `by` (255 none), its side's from tick at.
(func $ry_lay (param $k i32) (param $x f32) (param $z f32) (param $by i32) (param $at i32)
  (local $b i32)
  (local.set $b (call $ry_b (local.get $k)))
  (i32.store8 offset=@RY_BST (local.get $b) (i32.const @RY_LIES))
  (i32.store8 offset=@RY_BBY (local.get $b) (local.get $by))
  (i32.store offset=@RY_BAT_AT (local.get $b) (local.get $at))
  (f32.store offset=@RY_BX (local.get $b) (local.get $x))
  (f32.store offset=@RY_BZ (local.get $b) (local.get $z)))

;; The track for the crowd, its zones, the rows of posts with a phase and a
;; pace each from the round's seed (the room's PRNG untouched), and each
;; side's batons across its own zone.
(func $ry_setup (param $n i32)
  (local $s f32) (local $hx f32) (local $hz f32) (local $zx f32) (local $nb i32) (local $nr i32) (local $r i32) (local $h i32)
  (local $e i32) (local $i i32) (local $k i32) (local $b i32) (local $cx f32)
  (local.set $s (f32.sqrt (f32.convert_i32_u (local.get $n))))
  (local.set $hx (f32.mul (!madd (local.get $s) (f32.const @RY_LK) (f32.const @RY_L0)) (f32.const 0.5)))
  (local.set $hz (f32.mul (!madd (local.get $s) (f32.const @RY_WK) (f32.const @RY_W0)) (f32.const 0.5)))
  (local.set $zx (f32.sub (local.get $hx) (f32.const @RY_ZD)))
  (local.set $nb (i32.div_u (i32.add (local.get $n) (i32.const @RY_BN)) (i32.const @RY_BD)))
  (if (i32.lt_u (local.get $nb) (i32.const 1)) (then (local.set $nb (i32.const 1))))
  (if (i32.gt_u (local.get $nb) (i32.const @RY_BMAX)) (then (local.set $nb (i32.const @RY_BMAX))))
  (local.set $nr (i32.add (i32.trunc_sat_f32_u (f32.div (f32.mul (f32.sub (local.get $zx) (f32.const @RY_CLEAR)) (f32.const 2)) (f32.const @RY_ROWGAP))) (i32.const 1)))
  (if (i32.gt_u (local.get $nr) (i32.const @RY_ROWMAX)) (then (local.set $nr (i32.const @RY_ROWMAX))))
  (!chk (local.get $hz) 490 (local.get $n))
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (i32.store (i32.const @PG_KIND) (i32.const @PK_SCORE))
  (i32.store (i32.const @PG_LEN) (i32.const @RY_LEN))
  (i32.store (i32.const @PG_FLAGS) (i32.const @(PGF_BUMPS | PGF_TEAMS)))
  (f32.store (i32.const @PG_SIZE) (local.get $hx))
  (f32.store (i32.const @(PG_H + RY_HX)) (local.get $hx))
  (f32.store (i32.const @(PG_H + RY_HZ)) (local.get $hz))
  (f32.store (i32.const @(PG_H + RY_ZX)) (local.get $zx))
  (i32.store (i32.const @(PG_H + RY_NB)) (local.get $nb))
  (i32.store (i32.const @(PG_H + RY_GOAL)) (i32.add (i32.const @RY_TGT) (i32.mul (i32.sub (local.get $nb) (i32.const 1)) (i32.const @RY_TGTK))))
  (i32.store (i32.const @(PG_H + RY_NR)) (local.get $nr))
  (!for $r (i32.const 0) (local.get $nr)
    (local.set $h (call $p_seed (i32.add (i32.const 0x52590000) (local.get $r))))
    (i32.store offset=@(PG_H + RY_ROWS) (i32.shl (local.get $r) (i32.const 2))
      (i32.or (i32.shl (i32.add (i32.const @RY_STEP0) (i32.rem_u (i32.shr_u (local.get $h) (i32.const 16)) (i32.const @RY_STEPN))) (i32.const 16))
              (i32.and (local.get $h) (i32.const 0xffff)))))
  (!for $e (i32.const 0) (i32.const 2)
    (!for $i (i32.const 0) (local.get $nb)
      (local.set $k (i32.add (i32.mul (local.get $e) (i32.const @RY_BMAX)) (local.get $i)))
      (local.set $b (call $ry_b (local.get $k)))
      (i32.store8 offset=@RY_BTO (local.get $b) (i32.xor (local.get $e) (i32.const 1)))
      (i32.store8 offset=@RY_BSIDE (local.get $b) (local.get $e))
      (call $ry_lay (local.get $k)
        (!madd (call $ry_dir (local.get $e)) (f32.add (local.get $zx) (f32.const @RY_SET)) (local.get $cx))
        (!madd (f32.sub (f32.div (f32.add (f32.convert_i32_u (local.get $i)) (f32.const 0.5)) (f32.convert_i32_u (local.get $nb))) (f32.const 0.5))
               (f32.mul (f32.sub (local.get $hz) (f32.const 2)) (f32.const 2)) (local.get $cx))
        (i32.const 255) (i32.const 0)))))

;; As the round is laid out, ball PG_TK of its side: the even ones in its own
;; end's zone and the odd ones in the other, where the two sides stand in
;; turn across the track RY_GAP apart, each column centred, the columns back
;; from RY_IN off the end wall. A newcomer in play RY_BACK off its own end
;; wall, k of 1024 across.
(func $ry_spawn (param $i i32) (param $n i32) (result f32 f32 f32)
  (local $s i32) (local $k i32) (local $e i32) (local $q i32) (local $tn i32) (local $home i32) (local $away i32) (local $tot i32)
  (local $per i32) (local $col i32) (local $cnt i32)
  (local $hx f32) (local $hz f32) (local $cx f32)
  (local.set $s (i32.load (i32.const @PG_TSIDE)))
  (local.set $hx (f32.load (i32.const @(PG_H + RY_HX))))
  (local.set $hz (f32.load (i32.const @(PG_H + RY_HZ))))
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (if (i32.eq (i32.load (i32.const @HDR_STATE)) (i32.const @H_PLAY))
    (then
      (return
        (!madd (call $ry_dir (local.get $s)) (f32.sub (local.get $hx) (f32.const @RY_BACK)) (local.get $cx))
        (f32.const @PLAT_Y)
        (!madd (f32.sub (f32.mul (f32.convert_i32_u (i32.and (local.get $i) (i32.const 1023))) (f32.const @(2 / 1023))) (f32.const 1))
               (f32.mul (local.get $hz) (f32.const 0.7)) (local.get $cx)))))
  (local.set $k (i32.load (i32.const @PG_TK)))
  (local.set $tn (i32.load (i32.const @PG_TN)))
  ;; the end it stands at, and its place there: its own side's on the even places, the other's on the odd
  (local.set $e (i32.xor (local.get $s) (i32.and (local.get $k) (i32.const 1))))
  (local.set $q (local.get $k))
  (local.set $home (i32.shr_u (i32.add (i32.and (i32.shr_u (local.get $tn) (i32.shl (local.get $e) (i32.const 4))) (i32.const 0xffff)) (i32.const 1)) (i32.const 1)))
  (local.set $away (i32.shr_u (i32.and (i32.shr_u (local.get $tn) (i32.shl (i32.xor (local.get $e) (i32.const 1)) (i32.const 4))) (i32.const 0xffff)) (i32.const 1)))
  (local.set $tot (i32.sub (i32.shl (local.get $home) (i32.const 1)) (i32.const 1)))
  (if (i32.lt_s (local.get $tot) (i32.shl (local.get $away) (i32.const 1))) (then (local.set $tot (i32.shl (local.get $away) (i32.const 1)))))
  (local.set $per (i32.add (i32.trunc_sat_f32_u (f32.div (f32.sub (f32.mul (local.get $hz) (f32.const 2)) (f32.const 3)) (f32.const @RY_GAP))) (i32.const 1)))
  (local.set $col (i32.div_u (local.get $q) (local.get $per)))
  (local.set $cnt (i32.sub (local.get $tot) (i32.mul (local.get $col) (local.get $per))))
  (if (i32.or (i32.gt_s (local.get $cnt) (local.get $per)) (i32.le_s (local.get $cnt) (i32.const 0))) (then (local.set $cnt (local.get $per))))
  (!madd (call $ry_dir (local.get $e))
         (f32.sub (f32.sub (local.get $hx) (f32.const @RY_IN)) (f32.mul (f32.convert_i32_u (local.get $col)) (f32.const @RY_GAP)))
         (local.get $cx))
  (f32.const @PLAT_Y)
  (!madd (f32.sub (f32.convert_i32_u (i32.rem_u (local.get $q) (local.get $per))) (f32.mul (f32.convert_i32_s (i32.sub (local.get $cnt) (i32.const 1))) (f32.const 0.5)))
         (f32.const @RY_GAP) (local.get $cx)))

;; Slot p's velocity and hard bumps kept for the next tick's knock.
(func $ry_keep (param $p i32)
  (local $pb i32) (local $sb i32)
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (local.set $sb (call $ry_s (local.get $p)))
  (f32.store offset=@RY_SVX (local.get $sb) (!at f32 @(PLAYERS + P_VX) (local.get $pb)))
  (f32.store offset=@RY_SVZ (local.get $sb) (!at f32 @(PLAYERS + P_VZ) (local.get $pb)))
  (i32.store16 offset=@RY_SBUMPS (local.get $sb) (!at u16 @(PLAYERS + B_BUMPS) (local.get $pb))))

;; Play starts: every ball's kept, for the first knock.
(func $ry_start
  (local $p i32)
  (!for $p (i32.const 0) (i32.const @NPLAYER) (call $ry_keep (local.get $p))))

(func $ry_begin (param $p i32) (param $d i32))

;; A floor without end: the walls (in push) keep a ball on the track.
(func $ry_ground (param $d i32) (param $x f32) (param $y f32) (param $z f32) (result f32)
  (select (f32.const @PLAT_Y) (f32.const -1000) (f32.ge (local.get $y) (f32.const @PLAT_Y))))

;; Where row r's posts stand along z, from the track's middle line, on tick t
;; into play on bank d: every other row's half a spacing across, and all of
;; them RY_PA either way on the row's triangle wave (its phase carried on by
;; its step a tick, 16 bits round).
(func $ry_off (param $d i32) (param $r i32) (param $t i32) (result f32)
  (local $w i32) (local $u i32)
  (local.set $w (i32.load offset=@(PG_H + RY_ROWS) (i32.add (local.get $d) (i32.shl (local.get $r) (i32.const 2)))))
  (local.set $u (i32.sub (i32.and (i32.add (local.get $w) (i32.mul (local.get $t) (i32.shr_u (local.get $w) (i32.const 16)))) (i32.const 0xffff)) (i32.const 32768)))
  (if (i32.lt_s (local.get $u) (i32.const 0)) (then (local.set $u (i32.sub (i32.const 0) (local.get $u)))))
  (!madd (f32.convert_i32_s (i32.sub (local.get $u) (i32.const 16384))) (f32.const @(RY_PA / 16384))
         (select (f32.const @(RY_PS / 2)) (f32.const 0) (i32.and (local.get $r) (i32.const 1)))))

;; Ball p on bank d after its roll: carrying (its PG_M), RY_SLOW of its speed
;; kept; meeting a post of the nearest row (its bottom under the post's top),
;; put outside it, sent straight off it at RY_KNOCK at least and RY_LIFT up, off
;; the ground; then the walls, off each at RY_PE of its speed into it.
(func $ry_push (param $p i32) (param $d i32)
  (local $pb i32) (local $cx f32) (local $hx f32) (local $hz f32) (local $px f32) (local $py f32) (local $pz f32) (local $vx f32) (local $vz f32) (local $rad f32)
  (local $nr i32) (local $r i32) (local $fr f32) (local $half f32) (local $rx f32) (local $rz f32) (local $off f32) (local $dx f32) (local $dz f32) (local $d2 f32) (local $lim f32) (local $q f32)
  (local.set $pb (i32.add (i32.shl (local.get $p) (i32.const 6)) (local.get $d)))
  (local.set $cx (f32.load offset=@PG_CX (local.get $d)))
  (local.set $hx (f32.load offset=@(PG_H + RY_HX) (local.get $d)))
  (local.set $hz (f32.load offset=@(PG_H + RY_HZ) (local.get $d)))
  (local.set $px (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
  (local.set $py (!at f32 @(PLAYERS + P_PY) (local.get $pb)))
  (local.set $pz (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
  (local.set $vx (!at f32 @(PLAYERS + P_VX) (local.get $pb)))
  (local.set $vz (!at f32 @(PLAYERS + P_VZ) (local.get $pb)))
  (local.set $rad (call $b_rad (local.get $pb)))
  (if (!at i32 @(PLAYERS + PG_M) (local.get $pb))
    (then
      (local.set $vx (f32.mul (local.get $vx) (f32.const @RY_SLOW)))
      (local.set $vz (f32.mul (local.get $vz) (f32.const @RY_SLOW)))))
  (local.set $nr (i32.load offset=@(PG_H + RY_NR) (local.get $d)))
  (if (f32.lt (local.get $py) (f32.const @(+PLAT_Y + RY_PH)))
    (then
      (local.set $half (f32.mul (f32.convert_i32_s (i32.sub (local.get $nr) (i32.const 1))) (f32.const 0.5)))
      (local.set $fr (f32.nearest (f32.add (f32.div (f32.sub (local.get $px) (local.get $cx)) (f32.const @RY_ROWGAP)) (local.get $half))))
      (local.set $r (i32.trunc_sat_f32_s (local.get $fr)))
      (local.set $rx (!madd (f32.sub (local.get $fr) (local.get $half)) (f32.const @RY_ROWGAP) (local.get $cx)))
      (local.set $dx (f32.sub (local.get $px) (local.get $rx)))
      (local.set $lim (f32.add (local.get $rad) (f32.const @RY_PR)))
      (if (i32.and (i32.lt_u (local.get $r) (local.get $nr)) (f32.lt (f32.abs (local.get $dx)) (local.get $lim)))
        (then
          (local.set $off (f32.add (call $ry_off (local.get $d) (local.get $r) (call $p_t (local.get $d))) (local.get $cx)))
          (local.set $rz (!madd (f32.nearest (f32.div (f32.sub (local.get $pz) (local.get $off)) (f32.const @RY_PS))) (f32.const @RY_PS) (local.get $off)))
          (local.set $dz (f32.sub (local.get $pz) (local.get $rz)))
          (local.set $d2 (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))))
          (if (f32.lt (local.get $d2) (f32.mul (local.get $lim) (local.get $lim)))
            (then
              ;; dead on its middle: off along x
              (if (f32.lt (local.get $d2) (f32.const 1e-6))
                (then (local.set $dx (f32.const 1)) (local.set $dz (f32.const 0)))
                (else
                  (local.set $q (f32.sqrt (local.get $d2)))
                  (local.set $dx (f32.div (local.get $dx) (local.get $q)))
                  (local.set $dz (f32.div (local.get $dz) (local.get $q)))))
              (local.set $px (!madd (local.get $dx) (local.get $lim) (local.get $rx)))
              (local.set $pz (!madd (local.get $dz) (local.get $lim) (local.get $rz)))
              (local.set $q (f32.sub (f32.const @RY_KNOCK) (!madd (local.get $vx) (local.get $dx) (f32.mul (local.get $vz) (local.get $dz)))))
              (if (f32.gt (local.get $q) (f32.const 0))
                (then
                  (local.set $vx (!madd (local.get $q) (local.get $dx) (local.get $vx)))
                  (local.set $vz (!madd (local.get $q) (local.get $dz) (local.get $vz)))))
              (!put f32 @(PLAYERS + P_VY) (local.get $pb) (f32.max (!at f32 @(PLAYERS + P_VY) (local.get $pb)) (f32.const @RY_LIFT)))
              (!put u8 @(PLAYERS + P_FL) (local.get $pb) (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @(255 ^ PF_GROUND))))
              (call $fx (local.get $d) (i32.const @RY_FX_BONK) (local.get $p) (local.get $r) (local.get $px) (f32.add (local.get $py) (local.get $rad)) (local.get $pz) (f32.const 0))))))))
  ;; the walls
  (local.set $lim (f32.sub (local.get $hx) (local.get $rad)))
  (local.set $q (f32.sub (local.get $px) (local.get $cx)))
  (if (f32.gt (f32.abs (local.get $q)) (local.get $lim))
    (then
      (local.set $px (f32.add (local.get $cx) (f32.copysign (local.get $lim) (local.get $q))))
      (if (f32.gt (f32.mul (local.get $vx) (local.get $q)) (f32.const 0)) (then (local.set $vx (f32.mul (local.get $vx) (f32.const @(-RY_PE))))))))
  (local.set $lim (f32.sub (local.get $hz) (local.get $rad)))
  (local.set $q (f32.sub (local.get $pz) (local.get $cx)))
  (if (f32.gt (f32.abs (local.get $q)) (local.get $lim))
    (then
      (local.set $pz (f32.add (local.get $cx) (f32.copysign (local.get $lim) (local.get $q))))
      (if (f32.gt (f32.mul (local.get $vz) (local.get $q)) (f32.const 0)) (then (local.set $vz (f32.mul (local.get $vz) (f32.const @(-RY_PE))))))))
  (!chk (local.get $px) 491 (local.get $p))
  (!chk (local.get $pz) 492 (local.get $p))
  (!chk (local.get $vx) 493 (local.get $p))
  (!chk (local.get $vz) 494 (local.get $p))
  (!put f32 @(PLAYERS + P_PX) (local.get $pb) (local.get $px))
  (!put f32 @(PLAYERS + P_PZ) (local.get $pb) (local.get $pz))
  (!put f32 @(PLAYERS + P_VX) (local.get $pb) (local.get $vx))
  (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (local.get $vz)))

;; Slot p's baton k dropped where p is on tick t into play: nobody's for
;; RY_LOCK, not p's for RY_REGRAB.
(func $ry_drop (param $p i32) (param $k i32) (param $t i32)
  (local $pb i32)
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (call $ry_lay (local.get $k) (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (!at f32 @(PLAYERS + P_PZ) (local.get $pb))
                (local.get $p) (i32.add (local.get $t) (i32.const @RY_LOCK)))
  (!put i32 @(PLAYERS + PG_M) (local.get $pb) (i32.const 0))
  (i32.store offset=@RY_SNEXT (call $ry_s (local.get $p)) (i32.add (local.get $t) (i32.const @RY_REGRAB))))

;; Carrier p (in play, carrying baton k) hit this tick, t into play: by a foe
;; in play touching it that was the faster into the bump (p's own B_BUMPS as
;; it was), its velocity jolted more than RY_HARD. Knocked, the baton lies
;; where p is, a point and a tally to the foe.
(func $ry_knock (param $p i32) (param $k i32) (param $t i32)
  (local $pb i32) (local $sb i32) (local $q i32) (local $qb i32)
  (local $dvx f32) (local $dvz f32) (local $dv f32) (local $dx f32) (local $dz f32) (local $rs f32)
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (local.set $sb (call $ry_s (local.get $p)))
  (local.set $q (!at u8 @(PLAYERS + B_HITBY) (local.get $pb)))
  (if (i32.ge_u (local.get $q) (i32.const @NPLAYER)) (then (return)))
  (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
  (if (i32.or (i32.eqz (call $p_in (local.get $qb))) (i32.eq (call $p_side (local.get $qb)) (call $p_side (local.get $pb)))) (then (return)))
  (if (i32.ne (!at u16 @(PLAYERS + B_BUMPS) (local.get $pb)) (i32.load16_u offset=@RY_SBUMPS (local.get $sb))) (then (return)))
  (local.set $dx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $qb)) (!at f32 @(PLAYERS + P_PX) (local.get $pb))))
  (local.set $dz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $qb)) (!at f32 @(PLAYERS + P_PZ) (local.get $pb))))
  (local.set $rs (f32.add (f32.add (call $b_rad (local.get $pb)) (call $b_rad (local.get $qb))) (f32.const @RY_TOUCH)))
  (if (f32.ge (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))) (f32.mul (local.get $rs) (local.get $rs))) (then (return)))
  (local.set $dvx (f32.sub (!at f32 @(PLAYERS + P_VX) (local.get $pb)) (f32.load offset=@RY_SVX (local.get $sb))))
  (local.set $dvz (f32.sub (!at f32 @(PLAYERS + P_VZ) (local.get $pb)) (f32.load offset=@RY_SVZ (local.get $sb))))
  (local.set $dv (f32.sqrt (!madd (local.get $dvx) (local.get $dvx) (f32.mul (local.get $dvz) (local.get $dvz)))))
  (if (i32.eqz (f32.gt (local.get $dv) (f32.const @RY_HARD))) (then (return)))
  (call $fx (i32.const 0) (i32.const @RY_FX_DROP) (local.get $p) (local.get $q)
            (!at f32 @(PLAYERS + P_PX) (local.get $pb))
            (f32.add (!at f32 @(PLAYERS + P_PY) (local.get $pb)) (f32.mul (call $b_rad (local.get $pb)) (f32.const 2)))
            (!at f32 @(PLAYERS + P_PZ) (local.get $pb))
            (local.get $dv))
  (call $ry_drop (local.get $p) (local.get $k) (local.get $t))
  (i32.store16 offset=@RY_SLOST (local.get $sb) (i32.add (i32.load16_u offset=@RY_SLOST (local.get $sb)) (i32.const 1)))
  (!put u16 @(PLAYERS + PG_SCORE) (local.get $qb) (i32.add (!at u16 @(PLAYERS + PG_SCORE) (local.get $qb)) (i32.const @RY_PT_KNOCK)))
  (local.set $sb (call $ry_s (local.get $q)))
  (i32.store16 offset=@RY_SKNOCKS (local.get $sb) (i32.add (i32.load16_u offset=@RY_SKNOCKS (local.get $sb)) (i32.const 1))))

;; The takes, on tick t into play: each lying baton its side may take, in
;; order, to the nearest ball of that side within reach that is in play,
;; carrying nothing (one that took a baton already this tick carries it now),
;; low and rested (ties to the lower slot), who carries it from then.
(func $ry_takes (param $t i32)
  (local $k i32) (local $b i32) (local $p i32) (local $pb i32) (local $best i32) (local $side i32)
  (local $x f32) (local $z f32) (local $dx f32) (local $dz f32) (local $d2 f32) (local $bd f32) (local $rs f32) (local $cx f32)
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (!for $k (i32.const 0) (i32.const @(2 * RY_BMAX))
    (local.set $b (call $ry_b (local.get $k)))
    (if (i32.and (i32.eq (i32.load8_u offset=@RY_BST (local.get $b)) (i32.const @RY_LIES))
                 (i32.ge_s (i32.sub (local.get $t) (i32.load offset=@RY_BAT_AT (local.get $b))) (i32.const 0)))
      (then
        (local.set $x (f32.load offset=@RY_BX (local.get $b)))
        (local.set $z (f32.load offset=@RY_BZ (local.get $b)))
        (local.set $side (i32.load8_u offset=@RY_BSIDE (local.get $b)))
        (local.set $best (i32.const -1))
        (local.set $bd (f32.const inf))
        (!for $p (i32.const 0) (i32.const @NPLAYER)
          (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
          (if (i32.and (i32.and (call $p_in (local.get $pb)) (i32.eq (call $p_side (local.get $pb)) (local.get $side)))
                       (i32.eqz (!at i32 @(PLAYERS + PG_M) (local.get $pb))))
            (then
              (local.set $dx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (local.get $x)))
              (local.set $dz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $pb)) (local.get $z)))
              (local.set $d2 (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))))
              (local.set $rs (f32.add (call $b_rad (local.get $pb)) (f32.const @RY_GRAB)))
              (if (i32.and (i32.and (f32.lt (local.get $d2) (f32.mul (local.get $rs) (local.get $rs))) (f32.lt (local.get $d2) (local.get $bd)))
                           (i32.and (f32.lt (!at f32 @(PLAYERS + P_PY) (local.get $pb)) (f32.const @(+PLAT_Y + RY_LOW)))
                                    (i32.ge_s (i32.sub (local.get $t) (i32.load offset=@RY_SNEXT (call $ry_s (local.get $p)))) (i32.const 0))))
                (then (local.set $bd (local.get $d2)) (local.set $best (local.get $p)))))))
        (if (i32.ge_s (local.get $best) (i32.const 0))
          (then
            (i32.store8 offset=@RY_BST (local.get $b) (i32.const @RY_HELD))
            (i32.store8 offset=@RY_BBY (local.get $b) (local.get $best))
            (i32.store offset=@RY_BAT_AT (local.get $b) (local.get $t))
            (!put i32 @(PLAYERS + PG_M) (i32.shl (local.get $best) (i32.const 6)) (i32.add (local.get $k) (i32.const 1)))
            ;; loose: not in the zone it is leaving
            (call $fx (i32.const 0) (i32.const @RY_FX_TAKE) (local.get $best)
                      (i32.or (local.get $k)
                              (select (i32.const 256) (i32.const 0)
                                      (f32.gt (f32.mul (call $ry_dir (i32.load8_u offset=@RY_BTO (local.get $b))) (f32.sub (local.get $x) (local.get $cx)))
                                              (f32.neg (f32.load (i32.const @(PG_H + RY_ZX)))))))
                      (local.get $x) (f32.const @(+PLAT_Y + RY_R)) (local.get $z) (f32.const 0))))))))

;; The round's world, a tick of it: batons whose carrier is gone (or carries
;; another) dropped where it was, its PG_M let go; the carriers hit this tick,
;; in slot order, knocked; each carrier in play, in slot order, past the line
;; of the zone its baton is going to: a leg, the baton set down there and
;; turned round, its carrier resting if its side has another ball in; the
;; takes; every ball's velocity and bumps kept for the next knock.
(func $ry_tick
  (local $t i32) (local $k i32) (local $b i32) (local $p i32) (local $pb i32) (local $q i32) (local $s i32) (local $m i32) (local $e i32) (local $n0 i32) (local $n1 i32)
  (local $cx f32) (local $zx f32) (local $hz f32) (local $x f32) (local $z f32)
  (local.set $t (call $p_t (i32.const 0)))
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (local.set $zx (f32.load (i32.const @(PG_H + RY_ZX))))
  (local.set $hz (f32.sub (f32.load (i32.const @(PG_H + RY_HZ))) (f32.const 1)))
  (!for $k (i32.const 0) (i32.const @(2 * RY_BMAX))
    (local.set $b (call $ry_b (local.get $k)))
    (if (i32.eq (i32.load8_u offset=@RY_BST (local.get $b)) (i32.const @RY_HELD))
      (then
        (local.set $q (i32.load8_u offset=@RY_BBY (local.get $b)))
        (local.set $pb (i32.shl (local.get $q) (i32.const 6)))
        (if (i32.or (i32.eqz (call $p_in (local.get $pb))) (i32.ne (!at i32 @(PLAYERS + PG_M) (local.get $pb)) (i32.add (local.get $k) (i32.const 1))))
          (then
            (call $ry_lay (local.get $k) (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (!at f32 @(PLAYERS + P_PZ) (local.get $pb))
                          (local.get $q) (i32.add (local.get $t) (i32.const @RY_LOCK)))
            (if (i32.eq (!at i32 @(PLAYERS + PG_M) (local.get $pb)) (i32.add (local.get $k) (i32.const 1)))
              (then (!put i32 @(PLAYERS + PG_M) (local.get $pb) (i32.const 0)))))))))
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
    (if (call $p_in (local.get $pb))
      (then
        (if (call $p_side (local.get $pb)) (then (!inc $n1)) (else (!inc $n0)))
        (local.set $m (!at i32 @(PLAYERS + PG_M) (local.get $pb)))
        (if (i32.and (i32.ne (local.get $m) (i32.const 0)) (i32.eq (!at u16 @(PLAYERS + B_HITT) (local.get $pb)) (i32.const @CREDIT_TICKS)))
          (then (call $ry_knock (local.get $p) (i32.sub (local.get $m) (i32.const 1)) (local.get $t)))))))
  ;; the legs
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
    (local.set $m (!at i32 @(PLAYERS + PG_M) (local.get $pb)))
    (if (i32.and (i32.ne (local.get $m) (i32.const 0)) (call $p_in (local.get $pb)))
      (then
        (local.set $k (i32.sub (local.get $m) (i32.const 1)))
        (local.set $b (call $ry_b (local.get $k)))
        (local.set $e (i32.load8_u offset=@RY_BTO (local.get $b)))
        (if (f32.ge (f32.mul (call $ry_dir (local.get $e)) (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (local.get $cx))) (local.get $zx))
          (then
            (local.set $s (call $p_side (local.get $pb)))
            (local.set $x (!madd (call $ry_dir (local.get $e)) (f32.add (local.get $zx) (f32.const @RY_SET)) (local.get $cx)))
            (local.set $z (f32.add (local.get $cx) (f32.max (f32.neg (local.get $hz)) (f32.min (local.get $hz) (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $pb)) (local.get $cx))))))
            (call $ry_lay (local.get $k) (local.get $x) (local.get $z) (local.get $p) (local.get $t))
            (i32.store8 offset=@RY_BTO (local.get $b) (i32.xor (local.get $e) (i32.const 1)))
            (!put i32 @(PLAYERS + PG_M) (local.get $pb) (i32.const 0))
            (if (i32.gt_u (select (local.get $n1) (local.get $n0) (local.get $s)) (i32.const 1))
              (then (i32.store offset=@RY_SNEXT (call $ry_s (local.get $p)) (i32.add (local.get $t) (i32.const @RY_REST)))))
            (call $p_tadd (local.get $s) (i32.const 1))
            (!put u16 @(PLAYERS + PG_SCORE) (local.get $pb) (i32.add (!at u16 @(PLAYERS + PG_SCORE) (local.get $pb)) (i32.const @RY_PT_LEG)))
            (local.set $q (call $ry_s (local.get $p)))
            (i32.store16 offset=@RY_SLEGS (local.get $q) (i32.add (i32.load16_u offset=@RY_SLEGS (local.get $q)) (i32.const 1)))
            (call $fx (i32.const 0) (i32.const @RY_FX_LEG) (local.get $p) (i32.or (local.get $k) (i32.shl (local.get $s) (i32.const 8)))
                      (local.get $x) (f32.const @(+PLAT_Y + RY_R)) (local.get $z)
                      (f32.convert_i32_u (i32.load (i32.add (i32.const @PG_TSCORE) (i32.shl (local.get $s) (i32.const 2)))))))))))
  (call $ry_takes (local.get $t))
  (!for $p (i32.const 0) (i32.const @NPLAYER) (call $ry_keep (local.get $p))))

;; A side at its target.
(func $ry_over (result i32)
  (local $g i32)
  (local.set $g (i32.load (i32.const @(PG_H + RY_GOAL))))
  (i32.or (i32.ge_u (i32.load (i32.const @PG_TSCORE)) (local.get $g)) (i32.ge_u (i32.load (i32.const @(PG_TSCORE + 4))) (local.get $g))))

;; A ball down (it can't fall off the track, but one that did) drops what it carries.
(func $ry_out (param $p i32)
  (local $m i32) (local $b i32)
  (local.set $m (!at i32 @(PLAYERS + PG_M) (i32.shl (local.get $p) (i32.const 6))))
  (if (i32.eqz (local.get $m)) (then (return)))
  (local.set $b (call $ry_b (i32.sub (local.get $m) (i32.const 1))))
  (if (i32.and (i32.eq (i32.load8_u offset=@RY_BST (local.get $b)) (i32.const @RY_HELD)) (i32.eq (i32.load8_u offset=@RY_BBY (local.get $b)) (local.get $p)))
    (then (call $ry_drop (local.get $p) (i32.sub (local.get $m) (i32.const 1)) (call $p_t (i32.const 0))))
    (else (!put i32 @(PLAYERS + PG_M) (i32.shl (local.get $p) (i32.const 6)) (i32.const 0)))))
