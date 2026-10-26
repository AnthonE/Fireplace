;; GLASS BRIDGE: bridges of glass over a long drop, side by side, one for
;; about every GB_PER balls, each from the start deck to the finish deck
;; along +x: GB_NR rows of panels in pairs, GB_G between rows, so every row is
;; a hop and a commitment to one panel. Of each pair one panel is tempered and
;; holds; the other cracks as a ball lands on it, holds GB_HOLD ticks more and
;; goes for good, and a ball on cracked glass sinks in and can't hop off.
;; Which shatters is the round's seed's ($p_seed, pair by pair, at setup). A
;; ball onto the finish deck is home: out of play, parked, placed by the order
;; it got there. Placed by PG_SCORE (PK_SCORE, nobody back): the balls home,
;; then the rest by the row they reached (PG_M), the fallen by the row they
;; fell from, one still standing ahead of one fallen there.
;;
;; A panel is 1 (whole), 2 (tempered, stood on) or the tick it stops holding,
;; so whether it holds is a function of the tick: $gb_ground reads the
;; confirmed panels against bank d's own tick. A prediction running more than
;; GB_HOLD ahead would reach the drop of a crack the confirmed world hasn't
;; made yet, so it cracks its own ball's glass too, as Thin Ice does: $gb_push
;; on bank d does what $gb_tick will, the crack an FX in that bank's ring, and
;; $gb_state reads it there. A ball's furthest row is its own, kept by push on
;; either bank. Glass another ball cracks, homecomings and the end are the
;; confirmed world's, a round trip late like any bump.

;; ---- where things are

;; What holds (x, z) up on bank d's layout: panel c (0 up), -1 nothing,
;; -2 the start deck, -3 the finish deck. Panel c is (bridge * rows + row) * 2
;; + side, side 0 the one at lower z.
(func $gb_panel (param $d i32) (param $x f32) (param $z f32) (result i32)
  (local $nb i32) (local $nr i32) (local $k i32) (local $b i32) (local $s i32)
  (local $u f32) (local $w f32) (local $uf f32) (local $zl f32) (local $zr f32) (local $a f32) (local $e f32)
  (local.set $nb (i32.load offset=@(PG_H + GB_NB) (local.get $d)))
  (if (i32.eqz (local.get $nb)) (then (return (i32.const -1))))
  (local.set $nr (i32.load offset=@(PG_H + GB_NR) (local.get $d)))
  (local.set $zl (f32.load offset=@(PG_H + GB_ZL) (local.get $d)))
  (local.set $zr (f32.load offset=@(PG_H + GB_ZR) (local.get $d)))
  (local.set $u (f32.sub (local.get $x) (f32.load offset=@(PG_H + GB_X0) (local.get $d))))
  (local.set $uf (f32.sub (f32.load offset=@(PG_H + GB_FX) (local.get $d)) (f32.load offset=@(PG_H + GB_X0) (local.get $d))))
  (local.set $w (f32.sub (local.get $z) (local.get $zl)))
  ;; the decks reach GB_EDGE past the outer bridges
  (if (i32.or (f32.le (local.get $u) (f32.const 0)) (f32.ge (local.get $u) (local.get $uf)))
    (then
      (if (i32.or (i32.or (f32.lt (local.get $z) (f32.sub (local.get $zl) (f32.const @GB_EDGE)))
                          (f32.gt (local.get $z) (f32.add (local.get $zr) (f32.const @GB_EDGE))))
                  (i32.or (f32.lt (local.get $u) (f32.const @(-GB_DS)))
                          (f32.gt (local.get $u) (f32.add (local.get $uf) (f32.const @GB_DF)))))
        (then (return (i32.const -1))))
      (return (select (i32.const -2) (i32.const -3) (f32.le (local.get $u) (f32.const 0))))))
  ;; the rows: GB_G of drop, then GB_LP of panel
  (local.set $a (f32.sub (local.get $u) (f32.const @GB_G)))
  (if (i32.or (f32.lt (local.get $a) (f32.const 0)) (f32.lt (local.get $w) (f32.const 0))) (then (return (i32.const -1))))
  (local.set $k (i32.trunc_sat_f32_u (f32.div (local.get $a) (f32.const @(GB_LP + GB_G)))))
  (local.set $a (!madd (f32.convert_i32_u (local.get $k)) (f32.const @(-(GB_LP + GB_G))) (local.get $a)))
  (if (i32.or (f32.gt (local.get $a) (f32.const @GB_LP)) (i32.ge_u (local.get $k) (local.get $nr))) (then (return (i32.const -1))))
  ;; across: a pair GB_GIN apart, GB_GB to the next bridge
  (local.set $b (i32.trunc_sat_f32_u (f32.div (local.get $w) (f32.const @(2 * GB_WP + GB_GIN + GB_GB)))))
  (if (i32.ge_u (local.get $b) (local.get $nb)) (then (return (i32.const -1))))
  (local.set $e (!madd (f32.convert_i32_u (local.get $b)) (f32.const @(-(2 * GB_WP + GB_GIN + GB_GB))) (local.get $w)))
  (if (f32.le (local.get $e) (f32.const @GB_WP))
    (then (local.set $s (i32.const 0)))
    (else
      (if (i32.or (f32.lt (local.get $e) (f32.const @(GB_WP + GB_GIN))) (f32.gt (local.get $e) (f32.const @(2 * GB_WP + GB_GIN))))
        (then (return (i32.const -1))))
      (local.set $s (i32.const 1))))
  (i32.add (i32.shl (i32.add (i32.mul (local.get $b) (local.get $nr)) (local.get $k)) (i32.const 1)) (local.get $s)))

;; Panel c's top centre, x and z (the confirmed layout: the prediction's copy is the same).
(func $gb_centre (param $c i32) (result f32 f32)
  (local $nr i32) (local $q i32)
  (local.set $nr (i32.load (i32.const @(PG_H + GB_NR))))
  (local.set $q (i32.shr_u (local.get $c) (i32.const 1)))
  (!madd (f32.convert_i32_u (i32.rem_u (local.get $q) (local.get $nr))) (f32.const @(GB_LP + GB_G))
         (f32.add (f32.load (i32.const @(PG_H + GB_X0))) (f32.const @(GB_G + GB_LP / 2))))
  (!madd (f32.convert_i32_u (i32.div_u (local.get $q) (local.get $nr))) (f32.const @(2 * GB_WP + GB_GIN + GB_GB))
         (!madd (f32.convert_i32_u (i32.and (local.get $c) (i32.const 1))) (f32.const @(GB_WP + GB_GIN))
                (f32.add (f32.load (i32.const @(PG_H + GB_ZL))) (f32.const @(GB_WP / 2))))))

;; Does panel c shatter?
(func $gb_bad (param $c i32) (result i32)
  (i32.eq (i32.load8_u offset=@(PG_S + GB_BAD) (i32.shr_u (local.get $c) (i32.const 1))) (i32.and (local.get $c) (i32.const 1))))

;; The prediction's own crack of panel c, from its FX ring: the tick it stops
;; holding, or 1 if its ball hasn't cracked it.
(func $gb_mine (param $c i32) (result i32)
  (local $n i32) (local $i i32) (local $r i32)
  (local.set $n (i32.load (i32.const @PFX)))
  (!for $i (select (i32.sub (local.get $n) (i32.const @FX_MAX)) (i32.const 0) (i32.gt_u (local.get $n) (i32.const @FX_MAX))) (local.get $n)
    (local.set $r (i32.add (i32.const @(PFX + 16)) (i32.shl (i32.and (local.get $i) (i32.const @(FX_MAX - 1))) (i32.const 5))))
    (if (i32.and (i32.eq (i32.load8_u offset=4 (local.get $r)) (i32.const @GB_FX_CRACK)) (i32.eq (i32.load16_u offset=6 (local.get $r)) (local.get $c)))
      (then (return (i32.add (i32.load (local.get $r)) (i32.const @GB_HOLD))))))
  (i32.const 1))

;; Panel c as bank d has it: the confirmed panel, or on the prediction's bank
;; a whole one its own ball has cracked.
(func $gb_state (param $d i32) (param $c i32) (result i32)
  (local $v i32)
  (local.set $v (i32.load offset=@(PG_S + GB_CELLS) (i32.shl (local.get $c) (i32.const 2))))
  (if (i32.and (i32.ne (local.get $d) (i32.const 0)) (i32.eq (local.get $v) (i32.const 1)))
    (then (local.set $v (call $gb_mine (local.get $c)))))
  (local.get $v))

;; ---- the hooks

;; The bridges for the crowd and the knobs: scored by place, nobody back,
;; braking to stop on a panel, a longer hop (time in the air to cross to the
;; other side's glass), bumps without bumper's kick (a crowd waits on one
;; panel, and kicks would throw it off); every panel whole, and the side of
;; each pair that shatters from the seed.
(func $gb_setup (param $n i32)
  (local $nb i32) (local $m i32) (local $nr i32) (local $q i32) (local $len f32) (local $wid f32) (local $x0 f32) (local $zl f32)
  (local.set $n (select (local.get $n) (i32.const 1) (local.get $n)))
  (local.set $nb (i32.div_u (i32.add (local.get $n) (i32.const @(GB_PER - 1))) (i32.const @GB_PER)))
  (if (i32.gt_u (local.get $nb) (i32.const @GB_NBMAX)) (then (local.set $nb (i32.const @GB_NBMAX))))
  (local.set $m (i32.div_u (i32.add (local.get $n) (i32.sub (local.get $nb) (i32.const 1))) (local.get $nb)))
  (local.set $nr (i32.add (i32.const @GB_ROW0) (i32.shr_u (local.get $m) (i32.const 1))))
  (if (i32.gt_u (local.get $nr) (i32.const @GB_NRMAX)) (then (local.set $nr (i32.const @GB_NRMAX))))
  (local.set $len (!madd (f32.convert_i32_u (local.get $nr)) (f32.const @(GB_LP + GB_G)) (f32.const @(GB_DS + GB_G + GB_DF))))
  (local.set $wid (!madd (f32.convert_i32_u (local.get $nb)) (f32.const @(2 * GB_WP + GB_GIN + GB_GB)) (f32.const @(-GB_GB))))
  (local.set $x0 (f32.add (!madd (local.get $len) (f32.const -0.5) (f32.load (i32.const @PG_CX))) (f32.const @GB_DS)))
  (local.set $zl (!madd (local.get $wid) (f32.const -0.5) (f32.load (i32.const @PG_CX))))
  (i32.store (i32.const @PG_KIND) (i32.const @PK_SCORE))
  (i32.store (i32.const @PG_LEN) (i32.add (i32.const @GB_LEN0) (i32.mul (local.get $nr) (i32.const @GB_LENK))))
  (i32.store (i32.const @PG_RESPAWN) (i32.const 0x7fffffff))
  (f32.store (i32.const @PG_IDLE) (f32.const @GB_IDLE))
  (f32.store (i32.const @PG_HOP) (f32.const @GB_HOP))
  (i32.store (i32.const @PG_FLAGS) (i32.const @(PGF_BUMPS | PGF_NOKICK)))
  (f32.store (i32.const @PG_SIZE) (f32.mul (f32.max (local.get $len) (f32.add (local.get $wid) (f32.const @(2 * GB_EDGE)))) (f32.const 0.5)))
  (i32.store (i32.const @(PG_H + GB_NB)) (local.get $nb))
  (i32.store (i32.const @(PG_H + GB_NR)) (local.get $nr))
  (f32.store (i32.const @(PG_H + GB_X0)) (local.get $x0))
  (f32.store (i32.const @(PG_H + GB_ZL)) (local.get $zl))
  (f32.store (i32.const @(PG_H + GB_ZR)) (f32.add (local.get $zl) (local.get $wid)))
  (f32.store (i32.const @(PG_H + GB_FX)) (!madd (f32.convert_i32_u (local.get $nr)) (f32.const @(GB_LP + GB_G)) (f32.add (local.get $x0) (f32.const @GB_G))))
  (!for $q (i32.const 0) (i32.mul (local.get $nb) (local.get $nr))
    (i32.store offset=@(PG_S + GB_CELLS) (i32.shl (local.get $q) (i32.const 3)) (i32.const 1))
    (i32.store offset=@(PG_S + GB_CELLS + 4) (i32.shl (local.get $q) (i32.const 3)) (i32.const 1))
    (i32.store8 offset=@(PG_S + GB_BAD) (local.get $q) (i32.and (call $p_seed (i32.add (i32.const @GB_KSEED) (local.get $q))) (i32.const 1)))))

;; Ball i of n on the start deck before bridge i mod the bridges, up to
;; GB_PER to a bridge in two rows of four; a newcomer falling in (n 1024)
;; comes down on a spot of a bridge its i picks.
(func $gb_spawn (param $i i32) (param $n i32) (result f32 f32 f32)
  (local $nb i32) (local $b i32) (local $j i32)
  (local.set $nb (i32.load (i32.const @(PG_H + GB_NB))))
  (local.set $nb (select (local.get $nb) (i32.const 1) (local.get $nb)))
  (if (i32.ge_u (local.get $n) (i32.const 1024))
    (then
      (local.set $b (i32.rem_u (i32.shr_u (local.get $i) (i32.const 3)) (local.get $nb)))
      (local.set $j (i32.and (local.get $i) (i32.const 7))))
    (else
      (local.set $b (i32.rem_u (local.get $i) (local.get $nb)))
      (local.set $j (i32.and (i32.div_u (local.get $i) (local.get $nb)) (i32.const 7)))))
  (!madd (f32.convert_i32_u (i32.shr_u (local.get $j) (i32.const 2))) (f32.const -3) (f32.sub (f32.load (i32.const @(PG_H + GB_X0))) (f32.const 2.5)))
  (f32.const @PLAT_Y)
  (!madd (f32.convert_i32_u (local.get $b)) (f32.const @(2 * GB_WP + GB_GIN + GB_GB))
         (!madd (f32.convert_i32_s (i32.sub (i32.shl (i32.and (local.get $j) (i32.const 3)) (i32.const 1)) (i32.const 3))) (f32.const 1.25)
                (f32.add (f32.load (i32.const @(PG_H + GB_ZL))) (f32.const @(GB_WP + GB_GIN / 2))))))

(func $gb_start)
(func $gb_begin (param $p i32) (param $d i32))

;; The decks and the panels that hold on bank d's tick, all with their tops at PLAT_Y.
(func $gb_ground (param $d i32) (param $x f32) (param $y f32) (param $z f32) (result f32)
  (local $c i32) (local $v i32)
  (if (f32.lt (local.get $y) (f32.const @PLAT_Y)) (then (return (f32.const -1000))))
  (local.set $c (call $gb_panel (local.get $d) (local.get $x) (local.get $z)))
  (if (i32.eq (local.get $c) (i32.const -1)) (then (return (f32.const -1000))))
  (if (i32.lt_s (local.get $c) (i32.const 0)) (then (return (f32.const @PLAT_Y))))
  (local.set $v (call $gb_state (local.get $d) (local.get $c)))
  (if (result f32) (i32.or (i32.le_u (local.get $v) (i32.const 2)) (i32.lt_u (i32.load offset=@HDR_TICK (local.get $d)) (local.get $v)))
    (then (f32.const @PLAT_Y))
    (else (f32.const -1000))))

;; Ball p after its roll on bank d. On cracked glass that still holds, it
;; sinks in: back down on it (a hop undone), losing all but GB_GRIP of its
;; speed a tick; and it goes down with it, the hop it might make as it goes
;; undone too. On a panel, its furthest row (PG_M); in the prediction, the
;; whole glass under it that shatters cracks, as $gb_tick will crack it, an FX
;; in its bank's ring.
(func $gb_push (param $p i32) (param $d i32)
  (local $pb i32) (local $c i32) (local $v i32) (local $k i32) (local $fl i32) (local $py f32) (local $x f32) (local $z f32)
  (local.set $pb (i32.add (i32.shl (local.get $p) (i32.const 6)) (local.get $d)))
  (if (i32.eqz (call $p_in (local.get $pb))) (then (return)))
  (local.set $py (!at f32 @(PLAYERS + P_PY) (local.get $pb)))
  (if (i32.or (f32.gt (local.get $py) (f32.const @(+PLAT_Y + 0.1))) (f32.lt (local.get $py) (f32.const @(PLAT_Y - 0.05)))) (then (return)))
  (local.set $c (call $gb_panel (local.get $d) (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (!at f32 @(PLAYERS + P_PZ) (local.get $pb))))
  (if (i32.lt_s (local.get $c) (i32.const 0)) (then (return)))
  (local.set $v (call $gb_state (local.get $d) (local.get $c)))
  (local.set $fl (!at u8 @(PLAYERS + P_FL) (local.get $pb)))
  (if (i32.and (i32.gt_u (local.get $v) (i32.const 2)) (i32.lt_u (i32.load offset=@HDR_TICK (local.get $d)) (local.get $v)))
    (then
      (local.set $py (f32.const @PLAT_Y))
      (local.set $fl (i32.or (local.get $fl) (i32.const @PF_GROUND)))
      (!put f32 @(PLAYERS + P_PY) (local.get $pb) (local.get $py))
      (!put f32 @(PLAYERS + P_VY) (local.get $pb) (f32.min (!at f32 @(PLAYERS + P_VY) (local.get $pb)) (f32.const 0)))
      (!put f32 @(PLAYERS + P_VX) (local.get $pb) (f32.mul (!at f32 @(PLAYERS + P_VX) (local.get $pb)) (f32.const @GB_GRIP)))
      (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (f32.mul (!at f32 @(PLAYERS + P_VZ) (local.get $pb)) (f32.const @GB_GRIP)))
      (!put u8 @(PLAYERS + P_FL) (local.get $pb) (local.get $fl))))
  ;; glass gone this very tick under a ball that was sunk in it: a hop it made off it (on last tick's footing) undone
  (if (i32.and (i32.gt_u (local.get $v) (i32.const 2)) (i32.eq (i32.load offset=@HDR_TICK (local.get $d)) (local.get $v)))
    (then (!put f32 @(PLAYERS + P_VY) (local.get $pb) (f32.min (!at f32 @(PLAYERS + P_VY) (local.get $pb)) (f32.const 0)))))
  (if (i32.or (i32.eqz (i32.and (local.get $fl) (i32.const @PF_GROUND))) (f32.ge (f32.abs (f32.sub (local.get $py) (f32.const @PLAT_Y))) (f32.const 0.05)))
    (then (return)))
  (local.set $k (i32.add (i32.rem_u (i32.shr_u (local.get $c) (i32.const 1)) (i32.load offset=@(PG_H + GB_NR) (local.get $d))) (i32.const 1)))
  (if (i32.lt_u (!at i32 @(PLAYERS + PG_M) (local.get $pb)) (local.get $k)) (then (!put i32 @(PLAYERS + PG_M) (local.get $pb) (local.get $k))))
  (if (i32.and (i32.and (i32.ne (local.get $d) (i32.const 0)) (i32.eq (local.get $v) (i32.const 1))) (call $gb_bad (local.get $c)))
    (then
      (call $gb_centre (local.get $c))
      (local.set $z) (local.set $x)
      (call $fx (local.get $d) (i32.const @GB_FX_CRACK) (local.get $p) (local.get $c)
                (local.get $x) (f32.const @PLAT_Y) (local.get $z) (f32.convert_i32_u (i32.sub (local.get $k) (i32.const 1)))))))

;; In slot order, every ball in on the ground: on whole glass, it cracks
;; (holding GB_HOLD more) or, tempered, is marked stood on; on the finish
;; deck, home: out of play, its order (the balls home before this tick, so a
;; tick's share it) and score, parked on its bridge's stretch of the deck.
;; Then the glass that stops holding next tick goes, its FX.
(func $gb_tick
  (local $p i32) (local $pb i32) (local $c i32) (local $a i32) (local $t i32) (local $fin0 i32) (local $fin i32) (local $nb i32) (local $b i32) (local $j i32) (local $n i32)
  (local $x f32) (local $z f32) (local $px f32) (local $pz f32)
  (local.set $t (i32.load (i32.const @HDR_TICK)))
  (local.set $nb (i32.load (i32.const @(PG_H + GB_NB))))
  (local.set $fin0 (i32.load (i32.const @(PG_H + GB_FIN))))
  (local.set $fin (local.get $fin0))
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
    (if (i32.and (call $p_in (local.get $pb)) (i32.ne (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @PF_GROUND)) (i32.const 0)))
      (then
        (if (f32.lt (f32.abs (f32.sub (!at f32 @(PLAYERS + P_PY) (local.get $pb)) (f32.const @PLAT_Y))) (f32.const 0.05))
          (then
            (local.set $px (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
            (local.set $pz (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
            (local.set $c (call $gb_panel (i32.const 0) (local.get $px) (local.get $pz)))
            (if (i32.ge_s (local.get $c) (i32.const 0))
              (then
                (local.set $a (i32.add (i32.const @(PG_S + GB_CELLS)) (i32.shl (local.get $c) (i32.const 2))))
                (if (i32.eq (i32.load (local.get $a)) (i32.const 1))
                  (then
                    (call $gb_centre (local.get $c))
                    (local.set $z) (local.set $x)
                    (if (call $gb_bad (local.get $c))
                      (then
                        (i32.store (local.get $a) (i32.add (local.get $t) (i32.const @GB_HOLD)))
                        (call $fx (i32.const 0) (i32.const @GB_FX_CRACK) (local.get $p) (local.get $c) (local.get $x) (f32.const @PLAT_Y) (local.get $z)
                                  (f32.convert_i32_u (i32.rem_u (i32.shr_u (local.get $c) (i32.const 1)) (i32.load (i32.const @(PG_H + GB_NR)))))))
                      (else
                        (i32.store (local.get $a) (i32.const 2))
                        (call $fx (i32.const 0) (i32.const @GB_FX_SAFE) (local.get $p) (local.get $c) (local.get $x) (f32.const @PLAT_Y) (local.get $z)
                                  (f32.convert_i32_u (i32.rem_u (i32.shr_u (local.get $c) (i32.const 1)) (i32.load (i32.const @(PG_H + GB_NR))))))))))))
            (if (i32.eq (local.get $c) (i32.const -3))
              (then
                (call $fx (i32.const 0) (i32.const @GB_FX_HOME) (local.get $p) (i32.add (local.get $fin0) (i32.const 1))
                          (local.get $px) (f32.const @PLAT_Y) (local.get $pz) (f32.mul (f32.convert_i32_u (call $p_t (i32.const 0))) (f32.const @DT)))
                (!put u16 @(PLAYERS + PG_SCORE) (local.get $pb) (i32.sub (i32.const @GB_SFIN) (local.get $fin0)))
                (!put i32 @(PLAYERS + PG_M) (local.get $pb) (i32.or (i32.const @GB_M_HOME) (i32.add (local.get $fin0) (i32.const 1))))
                ;; parked on its own bridge's stretch, four abreast, five deep, then over again
                (local.set $b (i32.trunc_sat_f32_u (f32.div (f32.sub (local.get $pz) (f32.load (i32.const @(PG_H + GB_ZL)))) (f32.const @(2 * GB_WP + GB_GIN + GB_GB)))))
                (if (i32.ge_u (local.get $b) (local.get $nb)) (then (local.set $b (i32.sub (local.get $nb) (i32.const 1)))))
                (local.set $a (i32.add (i32.const @(PG_S + GB_HOMES)) (i32.shl (local.get $b) (i32.const 2))))
                (local.set $j (i32.load (local.get $a)))
                (i32.store (local.get $a) (i32.add (local.get $j) (i32.const 1)))
                (call $p_place (local.get $p)
                  (!madd (f32.convert_i32_u (i32.rem_u (i32.shr_u (local.get $j) (i32.const 2)) (i32.const 5))) (f32.const @GB_PARKD)
                         (f32.add (f32.load (i32.const @(PG_H + GB_FX))) (f32.const @GB_PARK)))
                  (f32.const @PLAT_Y)
                  (!madd (f32.convert_i32_s (i32.sub (i32.shl (i32.and (local.get $j) (i32.const 3)) (i32.const 1)) (i32.const 3))) (f32.const @(GB_PARKD / 2))
                         (!madd (f32.convert_i32_u (local.get $b)) (f32.const @(2 * GB_WP + GB_GIN + GB_GB))
                                (f32.add (f32.load (i32.const @(PG_H + GB_ZL))) (f32.const @(GB_WP + GB_GIN / 2))))))
                (!put u8 @(PLAYERS + P_FL) (local.get $pb) (i32.const @(PF_LIVE | PF_GROUND | PF_DEAD)))
                (!put i32 @(PLAYERS + B_OUTAT) (local.get $pb) (local.get $t))
                (!inc $fin))))))))
  (i32.store (i32.const @(PG_H + GB_FIN)) (local.get $fin))
  (local.set $n (i32.shl (i32.mul (local.get $nb) (i32.load (i32.const @(PG_H + GB_NR)))) (i32.const 1)))
  (!for $c (i32.const 0) (local.get $n)
    (if (i32.eq (i32.load offset=@(PG_S + GB_CELLS) (i32.shl (local.get $c) (i32.const 2))) (i32.add (local.get $t) (i32.const 1)))
      (then
        (call $gb_centre (local.get $c))
        (local.set $z) (local.set $x)
        (call $fx (i32.const 0) (i32.const @GB_FX_DROP) (i32.const 255) (local.get $c) (local.get $x) (f32.const @PLAT_Y) (local.get $z)
                  (f32.convert_i32_u (i32.rem_u (i32.shr_u (local.get $c) (i32.const 1)) (i32.load (i32.const @(PG_H + GB_NR))))))))))

;; Over when nobody is left on the bridges. On the round's last tick (this,
;; or the clock's), the balls still out on them are scored by the row they
;; reached, one falling as one fallen: kept out of their records till then,
;; so the prediction's copy of them stays the confirmed one's.
(func $gb_over (result i32)
  (local $p i32) (local $pb i32) (local $end i32) (local $fl i32)
  (local.set $end (i32.eqz (i32.load (i32.const @BH_LEFT))))
  (if (i32.or (local.get $end) (i32.ge_u (i32.load (i32.const @HDR_TICK)) (i32.load (i32.const @HDR_UNTIL))))
    (then
      (!for $p (i32.const 0) (i32.const @NPLAYER)
        (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
        (local.set $fl (!at u8 @(PLAYERS + P_FL) (local.get $pb)))
        (if (i32.eq (i32.and (local.get $fl) (i32.const @(PF_LIVE | PF_DEAD))) (i32.const @PF_LIVE))
          (then
            (!put u16 @(PLAYERS + PG_SCORE) (local.get $pb)
              (i32.add (i32.shl (i32.and (!at i32 @(PLAYERS + PG_M) (local.get $pb)) (i32.const 255)) (i32.const 1))
                       (i32.eqz (i32.and (local.get $fl) (i32.const @PF_FALL))))))))))
  (local.get $end))

;; Ball p fell: scored by the row it fell from.
(func $gb_out (param $p i32)
  (local $pb i32)
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (!put u16 @(PLAYERS + PG_SCORE) (local.get $pb) (i32.shl (i32.and (!at i32 @(PLAYERS + PG_M) (local.get $pb)) (i32.const 255)) (i32.const 1))))
