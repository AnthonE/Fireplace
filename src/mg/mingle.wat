;; MINGLE: a carousel in the middle of a hall over the sea, the hall a
;; polygon of MI_K sides with a room behind each, each room behind a door.
;; A cycle: the music (MI_M0 to MI_M1 ticks, from $p_seed), the carousel
;; turning under it and carrying whoever is on it round, the hall's floor
;; sweeping anyone off it back on; then the music stops, a number is called
;; and some of the doors open for MI_W0 ticks, MI_WK fewer each cycle; then
;; they slam, and every ball not in a room holding exactly that number is
;; out. If no room holds it, the rooms over it keep their deepest balls and
;; the rest of them are out (so the last two, called for 1, play for the back
;; of the one room); if no room was over either, nobody is out. The doors
;; stay shut MI_HOLD, then open and the rooms shove everyone out for
;; MI_EJECT, and the music plays again. The number is 2 to MI_NMAX, under
;; half the balls in (1 under five); each cycle opens rooms for at most half
;; the balls in, two at least from three balls, never a place for every
;; ball; rooms past what the crowd needs close for good. Bumps are on.
;;
;; The clock is a function of the tick into play and the round's seed alone
;; ($mi_when, from bank d's header on), so the carousel, the sweep, the doors
;; and the shove give the prediction exactly what the confirmed world will.
;; Which rooms a cycle opens is the confirmed world's, from the balls in as
;; its music starts, written then into the header: its doors open at the
;; music's end, more than PRED_MAX ticks on, and a bank whose header is a
;; cycle behind finds every door shut until then. The count at the slam is
;; the confirmed world's, as a claim is.

;; ---- the clock

;; Cycle c's music, its scramble, and the whole cycle, in ticks.
(func $mi_music (param $c i32) (result i32)
  (i32.add (i32.const @MI_M0) (i32.rem_u (call $p_seed (i32.add (i32.const @MI_KMUSIC) (local.get $c))) (i32.const @(MI_M1 - MI_M0 + 1)))))
(func $mi_win (param $c i32) (result i32)
  (local $w i32)
  (local.set $w (i32.sub (i32.const @MI_W0) (i32.mul (i32.const @MI_WK) (select (local.get $c) (i32.const 64) (i32.lt_u (local.get $c) (i32.const 64))))))
  (select (local.get $w) (i32.const @MI_W1) (i32.gt_s (local.get $w) (i32.const @MI_W1))))
(func $mi_len (param $c i32) (result i32)
  (i32.add (i32.add (call $mi_music (local.get $c)) (call $mi_win (local.get $c))) (i32.const @(MI_HOLD + MI_EJECT))))

;; Tick t into play on bank d: its phase (MI_MUSIC, MI_OPEN, MI_SHUT,
;; MI_OUT), its cycle and the tick that cycle's music started, counted on
;; from the cycle bank d's header holds.
(func $mi_when (param $d i32) (param $t i32) (result i32 i32 i32)
  (local $c i32) (local $c0 i32) (local $n i32) (local $e i32) (local $m i32) (local $ph i32)
  (local.set $c (i32.load offset=@(PG_H + MI_CYC) (local.get $d)))
  (local.set $c0 (i32.load offset=@(PG_H + MI_C0) (local.get $d)))
  (block $done
    (loop $next
      (local.set $n (call $mi_len (local.get $c)))
      (br_if $done (i32.lt_u (i32.sub (local.get $t) (local.get $c0)) (local.get $n)))
      (br_if $done (i32.lt_s (local.get $t) (local.get $c0)))
      (local.set $c0 (i32.add (local.get $c0) (local.get $n)))
      (!inc $c)
      (br $next)))
  (local.set $e (i32.sub (local.get $t) (local.get $c0)))
  (local.set $m (call $mi_music (local.get $c)))
  (local.set $ph (i32.const @MI_MUSIC))
  (if (i32.ge_s (local.get $e) (local.get $m)) (then (local.set $ph (i32.const @MI_OPEN))))
  (local.set $m (i32.add (local.get $m) (call $mi_win (local.get $c))))
  (if (i32.ge_s (local.get $e) (local.get $m)) (then (local.set $ph (i32.const @MI_SHUT))))
  (if (i32.ge_s (local.get $e) (i32.add (local.get $m) (i32.const @MI_HOLD))) (then (local.set $ph (i32.const @MI_OUT))))
  (local.get $ph) (local.get $c) (local.get $c0))

;; The carousel's turn, rad/s (anticlockwise seen from above, +x toward +z,
;; positive), e ticks into cycle c's music: winding up over MI_RAMP, flat out
;; at MI_VRIM on a rim rc out, winding down to still as the music ends.
(func $mi_omega (param $c i32) (param $e i32) (param $rc f32) (result f32)
  (local $m i32) (local $k i32) (local $w f32)
  (local.set $m (call $mi_music (local.get $c)))
  (if (i32.or (i32.lt_s (local.get $e) (i32.const 0)) (i32.ge_s (local.get $e) (local.get $m))) (then (return (f32.const 0))))
  (local.set $k (select (local.get $e) (i32.sub (local.get $m) (local.get $e)) (i32.lt_s (local.get $e) (i32.sub (local.get $m) (local.get $e)))))
  (if (i32.gt_s (local.get $k) (i32.const @MI_RAMP)) (then (local.set $k (i32.const @MI_RAMP))))
  (local.set $w (f32.mul (f32.div (f32.const @MI_VRIM) (local.get $rc)) (f32.div (f32.convert_i32_s (local.get $k)) (f32.const @MI_RAMP))))
  (select (f32.neg (local.get $w)) (local.get $w) (i32.and (call $p_seed (i32.add (i32.const @MI_KDIR) (local.get $c))) (i32.const 1))))

;; ---- the hall

;; The room whose side of the hall faces (dx, dz) from the middle: its
;; bearing to within 0.0015 rad by a polynomial atan, then the nearest
;; room's. Callers look at its neighbours too.
(func $mi_room (param $d i32) (param $dx f32) (param $dz f32) (result i32)
  (local $ax f32) (local $az f32) (local $a f32) (local $th f32) (local $k i32) (local $q i32)
  (local.set $ax (f32.abs (local.get $dx)))
  (local.set $az (f32.abs (local.get $dz)))
  (if (f32.le (f32.max (local.get $ax) (local.get $az)) (f32.const 1e-6)) (then (return (i32.const 0))))
  (local.set $a (f32.div (f32.min (local.get $ax) (local.get $az)) (f32.max (local.get $ax) (local.get $az))))
  (local.set $th (f32.sub (f32.mul (local.get $a) (f32.const 0.78539816))
                          (f32.mul (f32.mul (local.get $a) (f32.sub (local.get $a) (f32.const 1)))
                                   (!madd (local.get $a) (f32.const 0.0663) (f32.const 0.2447)))))
  (if (f32.gt (local.get $az) (local.get $ax)) (then (local.set $th (f32.sub (f32.const 1.5707964) (local.get $th)))))
  (if (f32.lt (local.get $dx) (f32.const 0)) (then (local.set $th (f32.sub (f32.const 3.1415927) (local.get $th)))))
  (if (f32.lt (local.get $dz) (f32.const 0)) (then (local.set $th (f32.neg (local.get $th)))))
  (local.set $q (i32.and (i32.sub (i32.trunc_sat_f32_s (f32.nearest (f32.mul (local.get $th) (f32.const 2607.5945))))
                                  (i32.load offset=@(PG_H + MI_OFF) (local.get $d)))
                         (i32.const 16383)))
  (local.set $k (i32.load offset=@(PG_H + MI_K) (local.get $d)))
  (local.set $q (i32.shr_u (i32.add (i32.mul (local.get $q) (local.get $k)) (i32.const 8192)) (i32.const 14)))
  (select (i32.const 0) (local.get $q) (i32.ge_u (local.get $q) (local.get $k))))

;; Is room k open on bank d (its bit in the header's MI_OPENM)?
(func $mi_isopen (param $d i32) (param $k i32) (result i32)
  (i32.wrap_i64 (i64.and (i64.shr_u (i64.load offset=@(PG_H + MI_OPENM) (local.get $d)) (i64.extend_i32_u (local.get $k))) (i64.const 1))))

;; (u, w) in a room's own frame (u out along its bearing from the middle, w
;; across) is inside it: past the door's line, short of the back, between
;; the sides.
(func $mi_inside (param $a f32) (param $u f32) (param $w f32) (result i32)
  (i32.and (i32.and (f32.gt (local.get $u) (local.get $a)) (f32.lt (local.get $u) (f32.add (local.get $a) (f32.const @(MI_DI + 2 * MI_WT)))))
           (f32.lt (f32.abs (local.get $w)) (f32.const @(MI_WI / 2 + MI_WT)))))

;; Ball (u, w) of radius r rolling (vu, vw) against the box [ua, ub] x [wa, wb]:
;; out of it the nearest way, MI_BOUNCE of its speed into it given back; how
;; fast it came in (-1 if it doesn't touch).
(func $mi_box (param $u f32) (param $w f32) (param $vu f32) (param $vw f32) (param $r f32)
              (param $ua f32) (param $ub f32) (param $wa f32) (param $wb f32) (result f32 f32 f32 f32 f32)
  (local $du f32) (local $dw f32) (local $dd f32) (local $nu f32) (local $nw f32) (local $dep f32) (local $e f32) (local $vn f32)
  (local.set $du (f32.sub (local.get $u) (!clamp (local.get $u) (local.get $ua) (local.get $ub))))
  (local.set $dw (f32.sub (local.get $w) (!clamp (local.get $w) (local.get $wa) (local.get $wb))))
  (local.set $dd (!madd (local.get $du) (local.get $du) (f32.mul (local.get $dw) (local.get $dw))))
  (if (f32.ge (local.get $dd) (f32.mul (local.get $r) (local.get $r)))
    (then (return (local.get $u) (local.get $w) (local.get $vu) (local.get $vw) (f32.const -1))))
  (if (f32.gt (local.get $dd) (f32.const 1e-8))
    (then
      (local.set $dd (f32.sqrt (local.get $dd)))
      (local.set $nu (f32.div (local.get $du) (local.get $dd)))
      (local.set $nw (f32.div (local.get $dw) (local.get $dd)))
      (local.set $dep (f32.sub (local.get $r) (local.get $dd))))
    (else
      ;; its centre in the wall (a bump, a door slamming on it): out the nearest side
      (local.set $dep (f32.sub (local.get $u) (local.get $ua)))
      (local.set $nu (f32.const -1))
      (local.set $e (f32.sub (local.get $ub) (local.get $u)))
      (if (f32.lt (local.get $e) (local.get $dep)) (then (local.set $dep (local.get $e)) (local.set $nu (f32.const 1))))
      (local.set $e (f32.sub (local.get $w) (local.get $wa)))
      (if (f32.lt (local.get $e) (local.get $dep)) (then (local.set $dep (local.get $e)) (local.set $nu (f32.const 0)) (local.set $nw (f32.const -1))))
      (local.set $e (f32.sub (local.get $wb) (local.get $w)))
      (if (f32.lt (local.get $e) (local.get $dep)) (then (local.set $dep (local.get $e)) (local.set $nu (f32.const 0)) (local.set $nw (f32.const 1))))
      (local.set $dep (f32.add (local.get $dep) (local.get $r)))))
  (local.set $u (!madd (local.get $nu) (local.get $dep) (local.get $u)))
  (local.set $w (!madd (local.get $nw) (local.get $dep) (local.get $w)))
  (local.set $vn (!madd (local.get $vu) (local.get $nu) (f32.mul (local.get $vw) (local.get $nw))))
  (if (f32.lt (local.get $vn) (f32.const 0))
    (then
      (local.set $vu (f32.sub (local.get $vu) (f32.mul (f32.mul (local.get $vn) (f32.const @(1 + MI_BOUNCE))) (local.get $nu))))
      (local.set $vw (f32.sub (local.get $vw) (f32.mul (f32.mul (local.get $vn) (f32.const @(1 + MI_BOUNCE))) (local.get $nw)))))
    (else (local.set $vn (f32.const 0))))
  (local.get $u) (local.get $w) (local.get $vu) (local.get $vw) (f32.neg (local.get $vn)))

;; ---- the layout and the cycle (the confirmed world's)

;; Balls in now (live, not out, not going out).
(func $mi_in (result i32)
  (local $p i32) (local $n i32)
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (if (call $p_in (i32.shl (local.get $p) (i32.const 6))) (then (!inc $n))))
  (local.get $n))

;; The rooms the crowd of n needs: MI_LIVE0 plus one for every MI_LIVEK.
(func $mi_need (param $n i32) (result i32)
  (i32.add (i32.const @MI_LIVE0) (i32.div_u (i32.add (local.get $n) (i32.const @(MI_LIVEK - 1))) (i32.const @MI_LIVEK))))

;; The rooms in mask, in order round the hall, into MI_LIST: how many.
(func $mi_list (param $mask i64) (result i32)
  (local $k i32) (local $n i32)
  (!for $k (i32.const 0) (i32.load (i32.const @(PG_H + MI_K)))
    (if (i32.wrap_i64 (i64.and (i64.shr_u (local.get $mask) (i64.extend_i32_u (local.get $k))) (i64.const 1)))
      (then (!st u8 @(PG_S + MI_LIST) (local.get $n) (local.get $k)) (!inc $n))))
  (local.get $n))

;; m of the n rooms in MI_LIST, evenly round from the off-th, as a mask.
(func $mi_spread (param $n i32) (param $m i32) (param $off i32) (result i64)
  (local $j i32) (local $mask i64)
  (!for $j (i32.const 0) (local.get $m)
    (local.set $mask (i64.or (local.get $mask)
      (i64.shl (i64.const 1) (i64.extend_i32_u (!ld u8 @(PG_S + MI_LIST)
        (i32.rem_u (i32.add (local.get $off) (i32.div_u (i32.mul (local.get $j) (local.get $n)) (local.get $m))) (local.get $n))))))))
  (local.get $mask))

;; Cycle c's music starts on tick t into play: the rooms the balls in no
;; longer need closed for good (the rest kept spread round the hall), its
;; number, and the live rooms it opens, spread round from one $p_seed picks.
(func $mi_cycle (param $t i32) (param $c i32)
  (local $n i32) (local $live i32) (local $want i32) (local $num i32) (local $hi i32) (local $r i32) (local $mask i64)
  (i32.store (i32.const @(PG_H + MI_CYC)) (local.get $c))
  (i32.store (i32.const @(PG_H + MI_C0)) (local.get $t))
  (local.set $n (call $mi_in))
  (i32.store (i32.const @(PG_H + MI_N)) (local.get $n))
  (local.set $live (i32.load (i32.const @(PG_H + MI_NLIVE))))
  (local.set $want (call $mi_need (local.get $n)))
  (if (i32.lt_u (local.get $want) (local.get $live))
    (then
      (local.set $live (call $mi_list (i64.load (i32.const @(PG_H + MI_LIVEM)))))
      (i64.store (i32.const @(PG_H + MI_LIVEM)) (call $mi_spread (local.get $live) (local.get $want) (i32.const 0)))
      (local.set $live (local.get $want))
      (i32.store (i32.const @(PG_H + MI_NLIVE)) (local.get $live))))
  ;; the number: 2 to MI_NMAX, under half the balls in, so two rooms never hold them all; 1 under five
  (local.set $num (i32.const 1))
  (local.set $hi (i32.shr_u (i32.sub (local.get $n) (i32.const 1)) (i32.const 1)))
  (if (i32.gt_u (local.get $hi) (i32.const @MI_NMAX)) (then (local.set $hi (i32.const @MI_NMAX))))
  (if (i32.ge_s (local.get $hi) (i32.const 2))
    (then (local.set $num (i32.add (i32.const 2) (i32.rem_u (call $p_seed (i32.add (i32.const @MI_KNUM) (local.get $c))) (i32.sub (local.get $hi) (i32.const 1)))))))
  ;; rooms for at most MI_SURV of the balls in, but two at least from three balls (the last two play for one)
  (local.set $r (i32.div_u (i32.trunc_sat_f32_u (f32.mul (f32.convert_i32_u (local.get $n)) (f32.const @MI_SURV))) (local.get $num)))
  (local.set $hi (select (i32.const 2) (i32.const 1) (i32.ge_u (local.get $n) (i32.const 3))))
  (if (i32.lt_u (local.get $r) (local.get $hi)) (then (local.set $r (local.get $hi))))
  (if (i32.gt_u (local.get $r) (local.get $live)) (then (local.set $r (local.get $live))))
  (local.set $live (call $mi_list (i64.load (i32.const @(PG_H + MI_LIVEM)))))
  (local.set $mask (call $mi_spread (local.get $live) (local.get $r)
                                    (i32.rem_u (call $p_seed (i32.add (i32.const @MI_KROOM) (local.get $c))) (local.get $live))))
  (i64.store (i32.const @(PG_H + MI_OPENM)) (local.get $mask))
  (i32.store (i32.const @(PG_H + MI_NOPEN)) (local.get $r))
  (i32.store (i32.const @(PG_H + MI_NUM)) (local.get $num))
  (memory.fill (i32.const @(PG_S + MI_ROOMOF)) (i32.const 255) (i32.const @NPLAYER))
  (call $fx (i32.const 0) (i32.const @MI_FX_MUSIC) (i32.const 255) (local.get $c)
            (f32.load (i32.const @PG_CX)) (f32.const @PLAT_Y) (f32.load (i32.const @PG_CX)) (f32.convert_i32_u (local.get $r))))

;; The music stops and the doors open: the number called, cut (to 1 at
;; least) so the rooms open hold fewer than the balls in, should balls have
;; left since it was picked.
(func $mi_call (param $t i32)
  (local $n i32) (local $num i32) (local $r i32)
  (local.set $n (call $mi_in))
  (local.set $num (i32.load (i32.const @(PG_H + MI_NUM))))
  (local.set $r (i32.load (i32.const @(PG_H + MI_NOPEN))))
  (if (i32.and (i32.gt_u (local.get $num) (i32.const 1)) (i32.ge_u (i32.mul (local.get $num) (local.get $r)) (local.get $n)))
    (then
      (local.set $num (i32.div_u (i32.sub (local.get $n) (i32.const 1)) (local.get $r)))
      (if (i32.eqz (local.get $num)) (then (local.set $num (i32.const 1))))
      (i32.store (i32.const @(PG_H + MI_NUM)) (local.get $num))))
  (call $fx (i32.const 0) (i32.const @MI_FX_CALL) (i32.const 255) (local.get $num)
            (f32.load (i32.const @PG_CX)) (f32.const @PLAT_Y) (f32.load (i32.const @PG_CX))
            (f32.convert_i32_u (call $mi_win (i32.load (i32.const @(PG_H + MI_CYC)))))))

;; The slam: each ball in counted into the open room it's inside (MI_ROOMOF,
;; MI_CNT, how deep in it is MI_U); those in a room holding exactly the
;; number are safe. If no room does, each room over the number keeps that
;; many of its balls, the deepest in, and the rest are out of it (so it can't
;; be spoiled for want of anywhere else); if no room was over either, nobody
;; is out. Otherwise every ball not safe is out, together.
(func $mi_slam
  (local $p i32) (local $q i32) (local $pb i32) (local $j i32) (local $k i32) (local $kk i32) (local $n i32) (local $num i32) (local $safe i32) (local $lost i32)
  (local $deep i32) (local $rank i32) (local $cx f32) (local $a f32) (local $dx f32) (local $dz f32) (local $c f32) (local $s f32) (local $u f32)
  (memory.fill (i32.const @(PG_S + MI_CNT)) (i32.const 0) (i32.const 64))
  (memory.fill (i32.const @(PG_S + MI_ROOMOF)) (i32.const 255) (i32.const @NPLAYER))
  (memory.fill (i32.const @(PG_S + MI_TRIM)) (i32.const 0) (i32.const @NPLAYER))
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (local.set $a (f32.load (i32.const @(PG_H + MI_A))))
  (local.set $n (i32.load (i32.const @(PG_H + MI_K))))
  (local.set $num (i32.load (i32.const @(PG_H + MI_NUM))))
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
    (if (call $p_in (local.get $pb))
      (then
        (local.set $dx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (local.get $cx)))
        (local.set $dz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $pb)) (local.get $cx)))
        (local.set $k (call $mi_room (i32.const 0) (local.get $dx) (local.get $dz)))
        (block $found
          (!for $j (i32.const 0) (i32.const 3)
            (local.set $kk (i32.rem_u (i32.sub (i32.add (i32.add (local.get $k) (local.get $n)) (local.get $j)) (i32.const 1)) (local.get $n)))
            (local.set $c (f32.load offset=@(PG_S + MI_DIRS) (i32.shl (local.get $kk) (i32.const 3))))
            (local.set $s (f32.load offset=@(PG_S + MI_DIRS + 4) (i32.shl (local.get $kk) (i32.const 3))))
            (local.set $u (!madd (local.get $dx) (local.get $c) (f32.mul (local.get $dz) (local.get $s))))
            (if (i32.and (call $mi_isopen (i32.const 0) (local.get $kk))
                         (call $mi_inside (local.get $a) (local.get $u) (f32.sub (f32.mul (local.get $dz) (local.get $c)) (f32.mul (local.get $dx) (local.get $s)))))
              (then
                (!st u8 @(PG_S + MI_ROOMOF) (local.get $p) (local.get $kk))
                (!st f32 @(PG_S + MI_U) (local.get $p) (local.get $u))
                (!st u8 @(PG_S + MI_CNT) (local.get $kk) (i32.add (!ld u8 @(PG_S + MI_CNT) (local.get $kk)) (i32.const 1)))
                (br $found))))))))
  (local.set $safe (call $mi_safe (local.get $num)))
  (if (i32.eqz (local.get $safe))
    (then
      ;; nobody exact: a ball in a room over the number with that many deeper than it (ties to the lower slot) is trimmed
      (!for $p (i32.const 0) (i32.const @NPLAYER)
        (local.set $k (!ld u8 @(PG_S + MI_ROOMOF) (local.get $p)))
        (if (i32.and (i32.ne (local.get $k) (i32.const 255)) (i32.gt_u (!ld u8 @(PG_S + MI_CNT) (local.get $k)) (local.get $num)))
          (then
            (local.set $u (!ld f32 @(PG_S + MI_U) (local.get $p)))
            (local.set $rank (i32.const 0))
            (!for $q (i32.const 0) (i32.const @NPLAYER)
              (if (i32.and (i32.eq (!ld u8 @(PG_S + MI_ROOMOF) (local.get $q)) (local.get $k))
                           (i32.or (f32.gt (!ld f32 @(PG_S + MI_U) (local.get $q)) (local.get $u))
                                   (i32.and (f32.eq (!ld f32 @(PG_S + MI_U) (local.get $q)) (local.get $u)) (i32.lt_u (local.get $q) (local.get $p)))))
                (then (!inc $rank))))
            (if (i32.ge_u (local.get $rank) (local.get $num)) (then (!st u8 @(PG_S + MI_TRIM) (local.get $p) (i32.const 1)) (local.set $deep (i32.const 1)))))))
      (!for $p (i32.const 0) (i32.const @NPLAYER)
        (if (!ld u8 @(PG_S + MI_TRIM) (local.get $p))
          (then
            (local.set $k (!ld u8 @(PG_S + MI_ROOMOF) (local.get $p)))
            (!st u8 @(PG_S + MI_CNT) (local.get $k) (i32.sub (!ld u8 @(PG_S + MI_CNT) (local.get $k)) (i32.const 1)))
            (!st u8 @(PG_S + MI_ROOMOF) (local.get $p) (i32.const 255)))))
      (local.set $safe (call $mi_safe (local.get $num)))))
  (if (local.get $safe)
    (then
      (!for $p (i32.const 0) (i32.const @NPLAYER)
        (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
        (if (i32.eq (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @(PF_LIVE | PF_DEAD))) (i32.const @PF_LIVE))
          (then
            (local.set $k (!ld u8 @(PG_S + MI_ROOMOF) (local.get $p)))
            (if (i32.and (i32.ne (local.get $k) (i32.const 255)) (i32.eq (!ld u8 @(PG_S + MI_CNT) (local.get $k)) (local.get $num)))
              (then (!st u8 @(PG_S + MI_SAVED) (local.get $p) (i32.add (!ld u8 @(PG_S + MI_SAVED) (local.get $p)) (i32.const 1))))
              (else (call $p_out (local.get $p)) (!inc $lost))))))))
  (i32.store (i32.const @(PG_H + MI_SAFE)) (local.get $safe))
  (i32.store (i32.const @(PG_H + MI_LOST)) (local.get $lost))
  (i32.store (i32.const @(PG_H + MI_DEEP)) (local.get $deep))
  (call $fx (i32.const 0) (i32.const @MI_FX_SLAM) (i32.const 255) (local.get $safe)
            (local.get $cx) (f32.const @PLAT_Y) (local.get $cx) (f32.convert_i32_u (local.get $lost))))

;; Balls counted into a room holding exactly num.
(func $mi_safe (param $num i32) (result i32)
  (local $p i32) (local $k i32) (local $safe i32)
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (local.set $k (!ld u8 @(PG_S + MI_ROOMOF) (local.get $p)))
    (if (i32.ne (local.get $k) (i32.const 255))
      (then (if (i32.eq (!ld u8 @(PG_S + MI_CNT) (local.get $k)) (local.get $num)) (then (!inc $safe))))))
  (local.get $safe))

;; The carousel and the hall for the crowd: the hall's sides at least
;; MI_PITCH long and MI_RING clear of the carousel, room 0's bearing from
;; $p_seed, every room live. Braking for stopping in a room.
(func $mi_setup (param $n i32)
  (local $k i32) (local $i i32) (local $rc f32) (local $a f32) (local $s f32) (local $c f32) (local $tn f32)
  (local.set $rc (f32.min (!madd (f32.sqrt (f32.convert_i32_u (local.get $n))) (f32.const @MI_RCK) (f32.const @MI_RC0)) (f32.const @MI_RCMAX)))
  (local.set $k (call $mi_need (local.get $n)))
  (if (i32.lt_u (local.get $k) (i32.const @MI_KMIN)) (then (local.set $k (i32.const @MI_KMIN))))
  (if (i32.gt_u (local.get $k) (i32.const @MI_KMAX)) (then (local.set $k (i32.const @MI_KMAX))))
  ;; half a side's angle, its tangent: the apothem for a side MI_PITCH long
  (call $sincos (i32.div_u (i32.add (i32.const 8192) (i32.shr_u (local.get $k) (i32.const 1))) (local.get $k)))
  (local.set $c) (local.set $s)
  (local.set $tn (f32.div (local.get $s) (local.get $c)))
  (local.set $a (f32.max (f32.add (local.get $rc) (f32.const @MI_RING)) (f32.div (f32.const @(MI_PITCH / 2)) (local.get $tn))))
  (!chk (local.get $a) 340 (local.get $n))
  (i32.store (i32.const @PG_KIND) (i32.const @PK_OUT))
  (i32.store (i32.const @PG_LEN) (i32.const @MI_LEN))
  (f32.store (i32.const @PG_IDLE) (f32.const @MI_IDLE))
  (f32.store (i32.const @PG_SIZE) (f32.add (local.get $a) (f32.const @(MI_DI / 2))))
  (f32.store (i32.const @(PG_H + MI_RC)) (local.get $rc))
  (f32.store (i32.const @(PG_H + MI_A)) (local.get $a))
  (f32.store (i32.const @(PG_H + MI_RO)) (f32.add (f32.div (local.get $a) (local.get $c)) (f32.const @(MI_DI + 2))))
  (f32.store (i32.const @(PG_H + MI_HS)) (!madd (local.get $a) (local.get $tn) (f32.const @(2 * MI_WT))))
  (i32.store (i32.const @(PG_H + MI_K)) (local.get $k))
  (i32.store (i32.const @(PG_H + MI_OFF)) (i32.and (call $p_seed (i32.const @MI_KOFF)) (i32.const 16383)))
  (i32.store (i32.const @(PG_H + MI_NLIVE)) (local.get $k))
  (i64.store (i32.const @(PG_H + MI_LIVEM)) (i64.sub (i64.shl (i64.const 1) (i64.extend_i32_u (local.get $k))) (i64.const 1)))
  (!for $i (i32.const 0) (local.get $k)
    (call $sincos (i32.add (i32.load (i32.const @(PG_H + MI_OFF)))
                           (i32.div_u (i32.add (i32.shl (local.get $i) (i32.const 14)) (i32.shr_u (local.get $k) (i32.const 1))) (local.get $k))))
    (local.set $c) (local.set $s)
    (f32.store offset=@(PG_S + MI_DIRS) (i32.shl (local.get $i) (i32.const 3)) (local.get $c))
    (f32.store offset=@(PG_S + MI_DIRS + 4) (i32.shl (local.get $i) (i32.const 3)) (local.get $s)))
  (memory.fill (i32.const @(PG_S + MI_ROOMOF)) (i32.const 255) (i32.const @NPLAYER)))

;; A sunflower spiral over the carousel.
(func $mi_spawn (param $i i32) (param $n i32) (result f32 f32 f32)
  (local $x f32) (local $z f32)
  (call $p_disc (local.get $i) (local.get $n) (f32.mul (f32.load (i32.const @(PG_H + MI_RC))) (f32.const @MI_SPAWN)))
  (local.set $z) (local.set $x)
  (local.get $x) (f32.const @PLAT_Y) (local.get $z))

;; The first music starts with play.
(func $mi_start
  (call $mi_cycle (i32.const 0) (i32.const 0)))

(func $mi_begin (param $p i32) (param $d i32))

;; The floor, the carousel flush with it, to MI_RO; past it the sea.
(func $mi_ground (param $d i32) (param $x f32) (param $y f32) (param $z f32) (result f32)
  (local $r f32) (local $dx f32) (local $dz f32)
  (if (f32.lt (local.get $y) (f32.const @PLAT_Y)) (then (return (f32.const -1000))))
  (local.set $r (f32.load offset=@(PG_H + MI_RO) (local.get $d)))
  (local.set $dx (f32.sub (local.get $x) (f32.load offset=@PG_CX (local.get $d))))
  (local.set $dz (f32.sub (local.get $z) (f32.load offset=@PG_CX (local.get $d))))
  (if (result f32) (f32.le (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))) (f32.mul (local.get $r) (local.get $r)))
    (then (f32.const @PLAT_Y))
    (else (f32.const -1000))))

;; Ball p after its roll on bank d. Through the music, on the ground: on the
;; carousel, its velocity pulled toward the carousel's there as the drag
;; pulls it toward still (so it rides along); off it, at least MI_SWEEP
;; toward the middle. Near the walls, the three rooms nearest its bearing:
;; while they shove, a ball inside an open one going out at MI_EJV at least
;; and across toward the door; then each room's walls, the door's with them
;; when it's shut, each a box in the room's own frame, in a fixed order. A
;; hard knock is an FX on this bank's ring.
(func $mi_push (param $p i32) (param $d i32)
  (local $pb i32) (local $fl i32) (local $t i32) (local $ph i32) (local $c i32) (local $c0 i32) (local $own i32) (local $k i32) (local $j i32)
  (local $kk i32) (local $n i32) (local $open i32) (local $moved i32) (local $touch i32)
  (local $cx f32) (local $dx f32) (local $dz f32) (local $vx f32) (local $vz f32) (local $r2 f32) (local $rc f32) (local $w f32) (local $q f32)
  (local $r f32) (local $vr f32) (local $a f32) (local $rad f32) (local $co f32) (local $si f32) (local $u f32) (local $ww f32) (local $vu f32) (local $vw f32)
  (local $hit f32) (local $max f32) (local $hs f32)
  (local.set $pb (i32.add (i32.shl (local.get $p) (i32.const 6)) (local.get $d)))
  (local.set $fl (!at u8 @(PLAYERS + P_FL) (local.get $pb)))
  (if (i32.and (local.get $fl) (i32.const @(PF_FALL | PF_DEAD))) (then (return)))
  (local.set $t (call $p_t (local.get $d)))
  (call $mi_when (local.get $d) (local.get $t))
  (local.set $c0) (local.set $c) (local.set $ph)
  (local.set $own (i32.eq (local.get $c) (i32.load offset=@(PG_H + MI_CYC) (local.get $d))))
  (local.set $cx (f32.load offset=@PG_CX (local.get $d)))
  (local.set $dx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (local.get $cx)))
  (local.set $dz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $pb)) (local.get $cx)))
  (local.set $vx (!at f32 @(PLAYERS + P_VX) (local.get $pb)))
  (local.set $vz (!at f32 @(PLAYERS + P_VZ) (local.get $pb)))
  (local.set $r2 (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))))
  (if (i32.and (i32.eq (local.get $ph) (i32.const @MI_MUSIC)) (i32.ne (i32.and (local.get $fl) (i32.const @PF_GROUND)) (i32.const 0)))
    (then
      (local.set $rc (f32.load offset=@(PG_H + MI_RC) (local.get $d)))
      (if (f32.lt (local.get $r2) (f32.mul (local.get $rc) (local.get $rc)))
        (then
          ;; the carousel's surface there moves at w (-dz, dx); what the drag took toward still it gives back toward that
          (local.set $w (f32.mul (call $mi_omega (local.get $c) (i32.sub (local.get $t) (local.get $c0)) (local.get $rc))
                                 (f32.sub (f32.const 1)
                                          (select (f32.load offset=@PG_DRAG (local.get $d)) (f32.load offset=@PG_IDLE (local.get $d))
                                                  (i32.and (!at i32 @(PLAYERS + P_IN) (local.get $pb)) (i32.const 0x0f000000))))))
          (local.set $vx (f32.sub (local.get $vx) (f32.mul (local.get $w) (local.get $dz))))
          (local.set $vz (!madd (local.get $w) (local.get $dx) (local.get $vz))))
        (else
          (local.set $r (f32.sqrt (local.get $r2)))
          (local.set $vr (f32.div (!madd (local.get $vx) (local.get $dx) (f32.mul (local.get $vz) (local.get $dz))) (local.get $r)))
          (if (f32.gt (local.get $vr) (f32.const @(-MI_SWEEP)))
            (then
              (local.set $q (f32.div (f32.sub (f32.const @(-MI_SWEEP)) (local.get $vr)) (local.get $r)))
              (local.set $vx (!madd (local.get $q) (local.get $dx) (local.get $vx)))
              (local.set $vz (!madd (local.get $q) (local.get $dz) (local.get $vz)))))))
      (local.set $moved (i32.const 1))))
  (local.set $a (f32.load offset=@(PG_H + MI_A) (local.get $d)))
  (local.set $rad (call $b_rad (local.get $pb)))
  (local.set $q (f32.sub (f32.sub (local.get $a) (local.get $rad)) (f32.const @(MI_WT + 0.1))))
  (if (f32.gt (local.get $r2) (f32.mul (local.get $q) (local.get $q)))
    (then
      (local.set $n (i32.load offset=@(PG_H + MI_K) (local.get $d)))
      (local.set $hs (f32.load offset=@(PG_H + MI_HS) (local.get $d)))
      (local.set $k (call $mi_room (local.get $d) (local.get $dx) (local.get $dz)))
      (!for $j (i32.const 0) (i32.const 3)
        (local.set $kk (i32.rem_u (i32.sub (i32.add (i32.add (local.get $k) (local.get $n)) (local.get $j)) (i32.const 1)) (local.get $n)))
        (local.set $co (f32.load offset=@(PG_S + MI_DIRS) (i32.shl (local.get $kk) (i32.const 3))))
        (local.set $si (f32.load offset=@(PG_S + MI_DIRS + 4) (i32.shl (local.get $kk) (i32.const 3))))
        (local.set $open (i32.and (i32.and (local.get $own) (call $mi_isopen (local.get $d) (local.get $kk)))
                                  (i32.or (i32.eq (local.get $ph) (i32.const @MI_OPEN)) (i32.eq (local.get $ph) (i32.const @MI_OUT)))))
        (local.set $u (!madd (local.get $dx) (local.get $co) (f32.mul (local.get $dz) (local.get $si))))
        (local.set $ww (f32.sub (f32.mul (local.get $dz) (local.get $co)) (f32.mul (local.get $dx) (local.get $si))))
        (local.set $vu (!madd (local.get $vx) (local.get $co) (f32.mul (local.get $vz) (local.get $si))))
        (local.set $vw (f32.sub (f32.mul (local.get $vz) (local.get $co)) (f32.mul (local.get $vx) (local.get $si))))
        (local.set $touch (i32.const 0))
        ;; the shove: out of the room, toward the door
        (if (i32.and (i32.and (local.get $open) (i32.eq (local.get $ph) (i32.const @MI_OUT)))
                     (i32.and (f32.gt (local.get $u) (f32.sub (local.get $a) (f32.const @MI_WT)))
                              (f32.lt (f32.abs (local.get $ww)) (f32.const @(MI_WI / 2 + MI_WT)))))
          (then
            (local.set $vu (f32.min (local.get $vu) (f32.const @(-MI_EJV))))
            (local.set $vw (f32.mul (local.get $ww) (f32.const @(-MI_EJW))))
            (local.set $touch (i32.const 1))))
        ;; the side of the hall: beside the door, and the door itself while it's shut
        (if (local.get $open)
          (then
            (call $mi_box (local.get $u) (local.get $ww) (local.get $vu) (local.get $vw) (local.get $rad)
                          (f32.sub (local.get $a) (f32.const @MI_WT)) (f32.add (local.get $a) (f32.const @MI_WT)) (f32.const @(MI_WD / 2)) (local.get $hs))
            (local.set $hit) (local.set $vw) (local.set $vu) (local.set $ww) (local.set $u)
            (if (f32.ge (local.get $hit) (f32.const 0)) (then (local.set $touch (i32.const 1)) (local.set $max (f32.max (local.get $max) (local.get $hit)))))
            (call $mi_box (local.get $u) (local.get $ww) (local.get $vu) (local.get $vw) (local.get $rad)
                          (f32.sub (local.get $a) (f32.const @MI_WT)) (f32.add (local.get $a) (f32.const @MI_WT)) (f32.neg (local.get $hs)) (f32.const @(-MI_WD / 2)))
            (local.set $hit) (local.set $vw) (local.set $vu) (local.set $ww) (local.set $u)
            (if (f32.ge (local.get $hit) (f32.const 0)) (then (local.set $touch (i32.const 1)) (local.set $max (f32.max (local.get $max) (local.get $hit))))))
          (else
            (call $mi_box (local.get $u) (local.get $ww) (local.get $vu) (local.get $vw) (local.get $rad)
                          (f32.sub (local.get $a) (f32.const @MI_WT)) (f32.add (local.get $a) (f32.const @MI_WT)) (f32.neg (local.get $hs)) (local.get $hs))
            (local.set $hit) (local.set $vw) (local.set $vu) (local.set $ww) (local.set $u)
            (if (f32.ge (local.get $hit) (f32.const 0)) (then (local.set $touch (i32.const 1)) (local.set $max (f32.max (local.get $max) (local.get $hit)))))))
        ;; the room's sides and back
        (if (f32.gt (local.get $u) (f32.sub (local.get $a) (local.get $rad)))
          (then
            (call $mi_box (local.get $u) (local.get $ww) (local.get $vu) (local.get $vw) (local.get $rad)
                          (f32.add (local.get $a) (f32.const @MI_WT)) (f32.add (local.get $a) (f32.const @(MI_DI + 3 * MI_WT)))
                          (f32.const @(MI_WI / 2)) (f32.const @(MI_WI / 2 + 2 * MI_WT)))
            (local.set $hit) (local.set $vw) (local.set $vu) (local.set $ww) (local.set $u)
            (if (f32.ge (local.get $hit) (f32.const 0)) (then (local.set $touch (i32.const 1)) (local.set $max (f32.max (local.get $max) (local.get $hit)))))
            (call $mi_box (local.get $u) (local.get $ww) (local.get $vu) (local.get $vw) (local.get $rad)
                          (f32.add (local.get $a) (f32.const @MI_WT)) (f32.add (local.get $a) (f32.const @(MI_DI + 3 * MI_WT)))
                          (f32.const @(-MI_WI / 2 - 2 * MI_WT)) (f32.const @(-MI_WI / 2)))
            (local.set $hit) (local.set $vw) (local.set $vu) (local.set $ww) (local.set $u)
            (if (f32.ge (local.get $hit) (f32.const 0)) (then (local.set $touch (i32.const 1)) (local.set $max (f32.max (local.get $max) (local.get $hit)))))
            (call $mi_box (local.get $u) (local.get $ww) (local.get $vu) (local.get $vw) (local.get $rad)
                          (f32.add (local.get $a) (f32.const @(MI_DI + MI_WT))) (f32.add (local.get $a) (f32.const @(MI_DI + 3 * MI_WT)))
                          (f32.const @(-MI_WI / 2 - 2 * MI_WT)) (f32.const @(MI_WI / 2 + 2 * MI_WT)))
            (local.set $hit) (local.set $vw) (local.set $vu) (local.set $ww) (local.set $u)
            (if (f32.ge (local.get $hit) (f32.const 0)) (then (local.set $touch (i32.const 1)) (local.set $max (f32.max (local.get $max) (local.get $hit)))))))
        ;; back to the world's frame only if anything moved it, so an untouched ball keeps its bits
        (if (local.get $touch)
          (then
            (local.set $dx (f32.sub (f32.mul (local.get $u) (local.get $co)) (f32.mul (local.get $ww) (local.get $si))))
            (local.set $dz (!madd (local.get $u) (local.get $si) (f32.mul (local.get $ww) (local.get $co))))
            (local.set $vx (f32.sub (f32.mul (local.get $vu) (local.get $co)) (f32.mul (local.get $vw) (local.get $si))))
            (local.set $vz (!madd (local.get $vu) (local.get $si) (f32.mul (local.get $vw) (local.get $co))))
            (local.set $moved (i32.const 2)))))))
  (if (local.get $moved)
    (then
      (!chk (local.get $dx) 341 (local.get $p))
      (!chk (local.get $dz) 342 (local.get $p))
      (!chk (local.get $vx) 343 (local.get $p))
      (!chk (local.get $vz) 344 (local.get $p))
      (if (i32.eq (local.get $moved) (i32.const 2))
        (then
          (!put f32 @(PLAYERS + P_PX) (local.get $pb) (f32.add (local.get $cx) (local.get $dx)))
          (!put f32 @(PLAYERS + P_PZ) (local.get $pb) (f32.add (local.get $cx) (local.get $dz)))))
      (!put f32 @(PLAYERS + P_VX) (local.get $pb) (local.get $vx))
      (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (local.get $vz))
      (if (f32.gt (local.get $max) (f32.const @MI_BONK))
        (then
          (call $fx (local.get $d) (i32.const @MI_FX_BONK) (local.get $p) (local.get $k)
                    (f32.add (local.get $cx) (local.get $dx)) (!at f32 @(PLAYERS + P_PY) (local.get $pb)) (f32.add (local.get $cx) (local.get $dz))
                    (local.get $max)))))))

;; The cycle's moments, on their ticks: the call as the music stops, the
;; slam, the next music as the rooms finish shoving.
(func $mi_tick
  (local $t i32) (local $c i32) (local $c0 i32) (local $m i32)
  (local.set $t (call $p_t (i32.const 0)))
  (local.set $c (i32.load (i32.const @(PG_H + MI_CYC))))
  (local.set $c0 (i32.load (i32.const @(PG_H + MI_C0))))
  (local.set $m (i32.add (local.get $c0) (call $mi_music (local.get $c))))
  (if (i32.eq (local.get $t) (local.get $m)) (then (call $mi_call (local.get $t))))
  (if (i32.eq (local.get $t) (i32.add (local.get $m) (call $mi_win (local.get $c)))) (then (call $mi_slam)))
  (if (i32.eq (local.get $t) (i32.add (local.get $c0) (call $mi_len (local.get $c))))
    (then (call $mi_cycle (local.get $t) (i32.add (local.get $c) (i32.const 1))))))

(func $mi_over (result i32) (i32.const 0))

(func $mi_out (param $p i32))
