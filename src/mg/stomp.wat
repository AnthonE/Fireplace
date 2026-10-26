;; STOMPIN GROUND: a raised disc of square flagstones over the sea, sized for
;; the crowd, and stompers, great boulders on two stubby legs, dropping out of
;; the sky onto it in waves. A charge runs a circular arc from just inside the
;; rim to off the far side, its path glowing on the floor SG_TELE ticks before
;; it sets off: a ball it meets is put out of it and sent flying the way it
;; goes and up, a glancing one shoved aside. From SG_LEAPFROM some leap in
;; instead onto a marked ring: whoever is under one as it lands is thrown
;; clear, and its shockwave runs out along the floor at ball height, knocking
;; outward a ball on the floor as it passes; one in the air clears it. Waves
;; grow, close up and run faster, more of them leaping; from SG_CRUMBLE the
;; rim crumbles in to SG_RMIN. Balls bump each other too. Last ball on wins.
;;
;; Everything a ball meets is laid by setup, before the countdown: each
;; flagstone with the tick into play the rim takes it, and the whole round's
;; stompers (arc, size, speed, leap or charge, from the round's random
;; numbers), in PG_BIG, in the order they start, with a bucket index over the
;; round's clock. A charge is where the tick puts it on its arc, a leap's
;; shockwave as far out as the tick has run it, so ground and push on either
;; bank read only what was fixed long before against the bank's own tick, and
;; the prediction rolls your ball through every stomper exactly as the
;; confirmed world will.

;; Cell (q, r)'s byte offset in the flagstones, -1 off the grid.
(func $sg_cell (param $q i32) (param $r i32) (result i32)
  (if (i32.or (i32.ge_u (i32.add (local.get $q) (i32.const @SG_N)) (i32.const @SG_W))
              (i32.ge_u (i32.add (local.get $r) (i32.const @SG_N)) (i32.const @SG_W)))
    (then (return (i32.const -1))))
  (i32.shl (i32.add (i32.mul (i32.add (local.get $r) (i32.const @SG_N)) (i32.const @SG_W)) (i32.add (local.get $q) (i32.const @SG_N)))
           (i32.const 1)))

;; The rim on tick tp into play: the disc's own until SG_CRUMBLE, then in to
;; SG_RMIN over SG_SHRINK. (A flagstone goes by its cell; this is where the
;; stompers set off and land.) Setup's.
(func $sg_rim (param $tp i32) (result f32)
  (local $r0 f32) (local $k i32)
  (local.set $r0 (f32.load (i32.const @(PG_H + SG_RAD))))
  (local.set $k (i32.sub (local.get $tp) (i32.const @SG_CRUMBLE)))
  (if (i32.le_s (local.get $k) (i32.const 0)) (then (return (local.get $r0))))
  (if (i32.ge_s (local.get $k) (i32.const @SG_SHRINK)) (then (return (f32.const @SG_RMIN))))
  (f32.sub (local.get $r0) (f32.mul (f32.sub (local.get $r0) (f32.const @SG_RMIN))
                                    (f32.div (f32.convert_i32_s (local.get $k)) (f32.const @SG_SHRINK)))))

;; The round's random number for k, as a unit in [0, 1).
(func $sg_unit (param $k i32) (result f32)
  (f32.mul (f32.convert_i32_u (i32.shr_u (call $p_seed (local.get $k)) (i32.const 8))) (f32.const 0x1p-24)))

;; Every flagstone whose centre is on the disc, each with the tick into play
;; the rim takes it: the first past SG_CRUMBLE plus its share of SG_SHRINK
;; (its distance in from the rim over the rim's way to SG_RMIN) plus up to
;; SG_JIT; never inside SG_RMIN.
(func $sg_tiles (param $rad f32)
  (local $q i32) (local $r i32) (local $count i32) (local $drop i32) (local $x f32) (local $z f32) (local $rho f32)
  (!for $r (i32.const 0) (i32.const @SG_W)
    (!for $q (i32.const 0) (i32.const @SG_W)
      (local.set $x (f32.mul (f32.add (f32.convert_i32_s (i32.sub (local.get $q) (i32.const @SG_N))) (f32.const 0.5)) (f32.const @SG_S)))
      (local.set $z (f32.mul (f32.add (f32.convert_i32_s (i32.sub (local.get $r) (i32.const @SG_N))) (f32.const 0.5)) (f32.const @SG_S)))
      (local.set $rho (f32.sqrt (!madd (local.get $x) (local.get $x) (f32.mul (local.get $z) (local.get $z)))))
      (if (f32.le (local.get $rho) (local.get $rad))
        (then
          (!inc $count)
          (local.set $drop (i32.const @SG_NEVER))
          (if (f32.gt (local.get $rho) (f32.const @SG_RMIN))
            (then
              (local.set $drop
                (i32.add (i32.add (i32.const @(SG_CRUMBLE + 1))
                                  (i32.trunc_sat_f32_s (f32.mul (f32.div (f32.sub (local.get $rad) (local.get $rho)) (f32.sub (local.get $rad) (f32.const @SG_RMIN)))
                                                                (f32.const @SG_SHRINK))))
                         (i32.rem_u (call $p_seed (i32.add (i32.const 0x10000) (i32.add (i32.mul (local.get $r) (i32.const @SG_W)) (local.get $q))))
                                    (i32.const @SG_JIT))))))
          (i32.store16 offset=@(PG_BIG + SG_TILES)
            (i32.shl (i32.add (i32.mul (local.get $r) (i32.const @SG_W)) (local.get $q)) (i32.const 1)) (local.get $drop))))))
  (i32.store (i32.const @(PG_H + SG_COUNT)) (local.get $count)))

;; How far round its arc from the apex (1/16384 turn, 0 to 8191) a stomper
;; gets while its centre is within r of the stage's centre: the most d with
;; e^2 + k (1 - cos d) <= r^2, k = 2 ra (ra + s e), by halves.
(func $sg_reach (param $e2 f32) (param $k f32) (param $r2 f32) (result i32)
  (local $lo i32) (local $hi i32) (local $mid i32) (local $c f32)
  (local.set $hi (i32.const 8192))
  (block $done
    (loop $half
      (br_if $done (i32.le_u (i32.sub (local.get $hi) (local.get $lo)) (i32.const 1)))
      (local.set $mid (i32.shr_u (i32.add (local.get $lo) (local.get $hi)) (i32.const 1)))
      (call $sincos (local.get $mid))
      (local.set $c) (drop)
      (if (f32.le (!madd (local.get $k) (f32.sub (f32.const 1) (local.get $c)) (local.get $e2)) (local.get $r2))
        (then (local.set $lo (local.get $mid)))
        (else (local.set $hi (local.get $mid))))
      (br $half)))
  (local.get $lo))

;; Stomper k's random numbers: unit j of its own, and a bearing.
(func $sg_ku (param $k i32) (param $j i32) (result f32)
  (call $sg_unit (i32.add (i32.const 0x20000) (i32.add (i32.shl (local.get $k) (i32.const 3)) (local.get $j)))))
(func $sg_kb (param $k i32) (param $j i32) (result i32)
  (i32.and (call $p_seed (i32.add (i32.const 0x20000) (i32.add (i32.shl (local.get $k) (i32.const 3)) (local.get $j)))) (i32.const 16383)))

;; What every stomper's record has: when it starts and is gone, its body, its wave.
(func $sg_rec (param $a i32) (param $tf i32) (param $te i32) (param $rs f32) (param $fl i32) (param $vi i32) (param $n i32)
  (i32.store offset=@(PG_BIG + SG_RECS) (local.get $a) (local.get $tf))
  (i32.store offset=@(PG_BIG + SG_RECS + 4) (local.get $a) (local.get $te))
  (f32.store offset=@(PG_BIG + SG_RECS + 20) (local.get $a) (local.get $rs))
  (i32.store offset=@(PG_BIG + SG_RECS + 44) (local.get $a) (local.get $n))
  (i32.store8 offset=@(PG_BIG + SG_RECS + 48) (local.get $a) (local.get $fl))
  (i32.store16 offset=@(PG_BIG + SG_RECS + 50) (local.get $a) (local.get $vi)))

;; Stomper k a charge setting off tf ticks into play (wave vi of n, the first
;; of it if first). Its apex: heading a random bearing, up to SG_AIM of the
;; rim (as it stands then) off the centre across it; it curves either way
;; round a circle of radius ra through the apex, its centre ra across from it.
;; It sets off where its arc comes SG_IN inside the rim, less its body, and
;; is gone once SG_OUT past it, plus its body, on the far side.
(func $sg_charge (param $k i32) (param $tf i32) (param $first i32) (param $vi i32) (param $n i32)
  (local $a i32) (local $psi i32) (local $sg i32) (local $din i32) (local $dout i32) (local $w i32) (local $dur i32)
  (local $cx f32) (local $rim f32) (local $rs f32) (local $e f32) (local $sf f32) (local $ra f32) (local $v f32)
  (local $s f32) (local $c f32) (local $off f32) (local $k2 f32) (local $e2 f32) (local $r f32)
  (local.set $a (i32.mul (local.get $k) (i32.const @SG_REC)))
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (local.set $rim (call $sg_rim (local.get $tf)))
  (local.set $rs (!madd (call $sg_ku (local.get $k) (i32.const 0)) (f32.const @(SG_RS1 - SG_RS0)) (f32.const @SG_RS0)))
  (local.set $psi (call $sg_kb (local.get $k) (i32.const 1)))
  (local.set $e (f32.mul (f32.sub (f32.mul (call $sg_ku (local.get $k) (i32.const 2)) (f32.const 2)) (f32.const 1))
                         (f32.mul (local.get $rim) (f32.const @SG_AIM))))
  (local.set $sg (select (i32.const 1) (i32.const -1) (i32.and (call $p_seed (i32.add (i32.const 0x20003) (i32.shl (local.get $k) (i32.const 3)))) (i32.const 1))))
  (local.set $sf (f32.convert_i32_s (local.get $sg)))
  (local.set $ra (f32.max (f32.mul (local.get $rim) (!madd (call $sg_ku (local.get $k) (i32.const 4)) (f32.const @SG_RA1) (f32.const @SG_RA0)))
                          (!madd (local.get $rs) (f32.const 2) (local.get $rim))))
  (local.set $v (!madd (f32.sub (f32.mul (call $sg_ku (local.get $k) (i32.const 5)) (f32.const 2)) (f32.const 1)) (f32.const @SG_VJ)
                       (!madd (f32.div (f32.convert_i32_u (local.get $tf)) (f32.const @SG_LEN)) (f32.const @SG_VUP) (f32.const @SG_V0))))
  ;; the arc's centre: across the apex's heading (-sin, cos), e + s ra from the stage's centre
  (call $sincos (local.get $psi))
  (local.set $c) (local.set $s)
  (local.set $off (!madd (local.get $sf) (local.get $ra) (local.get $e)))
  (f32.store offset=@(PG_BIG + SG_RECS + 8) (local.get $a) (f32.sub (local.get $cx) (f32.mul (local.get $s) (local.get $off))))
  (f32.store offset=@(PG_BIG + SG_RECS + 12) (local.get $a) (!madd (local.get $c) (local.get $off) (local.get $cx)))
  ;; where it comes within the rim and leaves it, either side of the apex alike
  (local.set $k2 (f32.mul (f32.mul (local.get $ra) (f32.const 2)) (!madd (local.get $sf) (local.get $e) (local.get $ra))))
  (local.set $e2 (f32.mul (local.get $e) (local.get $e)))
  (local.set $r (f32.sub (f32.sub (local.get $rim) (local.get $rs)) (f32.const @SG_IN)))
  (local.set $din (call $sg_reach (local.get $e2) (local.get $k2) (f32.mul (local.get $r) (local.get $r))))
  (local.set $r (f32.add (f32.add (local.get $rim) (local.get $rs)) (f32.const @SG_OUT)))
  (local.set $dout (i32.add (call $sg_reach (local.get $e2) (local.get $k2) (f32.mul (local.get $r) (local.get $r))) (i32.const 1)))
  ;; round its circle from the apex's angle (a quarter turn back from its heading, the way it turns) less din, at v
  (local.set $w (i32.trunc_sat_f32_s (f32.nearest (f32.mul (f32.div (f32.mul (local.get $v) (f32.const @DT)) (local.get $ra)) (f32.const @SG_TURN)))))
  (if (i32.lt_s (local.get $w) (i32.const 1)) (then (local.set $w (i32.const 1))))
  (local.set $dur (i32.add (i32.div_u (i32.shl (i32.add (local.get $din) (local.get $dout)) (i32.const 10)) (local.get $w)) (i32.const 1)))
  (i32.store offset=@(PG_BIG + SG_RECS + 24) (local.get $a)
    (i32.shl (i32.sub (local.get $psi) (i32.mul (local.get $sg) (i32.add (i32.const 4096) (local.get $din)))) (i32.const 10)))
  (i32.store offset=@(PG_BIG + SG_RECS + 28) (local.get $a) (i32.mul (local.get $w) (local.get $sg)))
  (f32.store offset=@(PG_BIG + SG_RECS + 16) (local.get $a) (local.get $ra))
  (f32.store offset=@(PG_BIG + SG_RECS + 32) (local.get $a) (local.get $v))
  (!chk (local.get $ra) 250 (local.get $k))
  (!chk (local.get $v) 250 (local.get $k))
  (!chk (local.get $off) 250 (local.get $k))
  (call $sg_rec (local.get $a) (local.get $tf) (i32.add (local.get $tf) (local.get $dur)) (local.get $rs)
                (select (i32.const 2) (i32.const 0) (local.get $first)) (local.get $vi) (local.get $n)))

;; Stomper k a leap landing tf ticks into play: on a spot up to SG_TAIM of the
;; rim out (as it stands then), spread evenly over the disc, from SG_LAUNCH
;; past the rim on a random bearing; it stands SG_STAY and its shockwave runs
;; out to SG_RW, then it's gone.
(func $sg_leap (param $k i32) (param $tf i32) (param $first i32) (param $vi i32) (param $n i32)
  (local $a i32) (local $dur i32) (local $cx f32) (local $rim f32) (local $rs f32) (local $r f32) (local $s f32) (local $c f32)
  (local.set $a (i32.mul (local.get $k) (i32.const @SG_REC)))
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (local.set $rim (call $sg_rim (local.get $tf)))
  (local.set $rs (!madd (call $sg_ku (local.get $k) (i32.const 0)) (f32.const @(SG_RS1 - SG_RS0)) (f32.const @SG_RS0)))
  (local.set $r (f32.mul (f32.mul (local.get $rim) (f32.const @SG_TAIM)) (f32.sqrt (call $sg_ku (local.get $k) (i32.const 2)))))
  (call $sincos (call $sg_kb (local.get $k) (i32.const 1)))
  (local.set $c) (local.set $s)
  (f32.store offset=@(PG_BIG + SG_RECS + 8) (local.get $a) (!madd (local.get $c) (local.get $r) (local.get $cx)))
  (f32.store offset=@(PG_BIG + SG_RECS + 12) (local.get $a) (!madd (local.get $s) (local.get $r) (local.get $cx)))
  (local.set $r (f32.add (local.get $rim) (f32.const @SG_LAUNCH)))
  (call $sincos (call $sg_kb (local.get $k) (i32.const 3)))
  (local.set $c) (local.set $s)
  (f32.store offset=@(PG_BIG + SG_RECS + 36) (local.get $a) (!madd (local.get $c) (local.get $r) (local.get $cx)))
  (f32.store offset=@(PG_BIG + SG_RECS + 40) (local.get $a) (!madd (local.get $s) (local.get $r) (local.get $cx)))
  (f32.store offset=@(PG_BIG + SG_RECS + 52) (local.get $a) (f32.const @SG_RW))
  (local.set $dur (i32.add (i32.trunc_sat_f32_u (f32.ceil (f32.div (f32.sub (f32.const @SG_RW) (local.get $rs)) (f32.const @(SG_VW * 0.008))))) (i32.const 1)))
  (if (i32.lt_u (local.get $dur) (i32.const @SG_STAY)) (then (local.set $dur (i32.const @SG_STAY))))
  (call $sg_rec (local.get $a) (local.get $tf) (i32.add (local.get $tf) (local.get $dur)) (local.get $rs)
                (select (i32.const 3) (i32.const 1) (local.get $first)) (local.get $vi) (local.get $n)))

;; The round's stompers, in the order they start: a wave SG_FIRST in, then
;; every gap, closing from SG_GAP0 to SG_GAP1 over SG_RAMP; each of 1 + radius
;; / SG_PER and one more every SG_MORE, at most SG_WMAX, SG_STAG ticks apart;
;; from SG_LEAPFROM a share leaping, SG_LEAP0 growing by SG_LEAPK to the end.
;; Then the buckets.
(func $sg_schedule (param $rad f32)
  (local $tp i32) (local $t i32) (local $k i32) (local $vi i32) (local $n i32) (local $j i32) (local $b i32) (local $lo i32) (local $hi i32)
  (local.set $tp (i32.const @SG_FIRST))
  (block $done
    (loop $more
      (br_if $done (i32.ge_u (local.get $tp) (i32.const @SG_LEN)))
      (local.set $n (i32.add (i32.add (i32.const 1) (i32.trunc_sat_f32_u (f32.div (local.get $rad) (f32.const @SG_PER))))
                             (i32.div_u (local.get $tp) (i32.const @SG_MORE))))
      (if (i32.gt_u (local.get $n) (i32.const @SG_WMAX)) (then (local.set $n (i32.const @SG_WMAX))))
      (br_if $done (i32.gt_u (i32.add (local.get $k) (local.get $n)) (i32.const @SG_NMAX)))
      (br_if $done (i32.ge_u (i32.add (local.get $tp) (i32.mul (local.get $n) (i32.const @SG_STAG))) (i32.const @SG_LEN)))
      (!for $j (i32.const 0) (local.get $n)
        (local.set $t (i32.add (local.get $tp) (i32.mul (local.get $j) (i32.const @SG_STAG))))
        (if (i32.and (i32.ge_u (local.get $t) (i32.const @SG_LEAPFROM))
                     (f32.lt (call $sg_unit (i32.add (i32.const 0x40000) (local.get $k)))
                             (!madd (f32.div (f32.convert_i32_u (local.get $t)) (f32.const @SG_LEN)) (f32.const @SG_LEAPK) (f32.const @SG_LEAP0))))
          (then (call $sg_leap (local.get $k) (local.get $t) (i32.eqz (local.get $j)) (local.get $vi) (local.get $n)))
          (else (call $sg_charge (local.get $k) (local.get $t) (i32.eqz (local.get $j)) (local.get $vi) (local.get $n))))
        (!inc $k))
      (!inc $vi)
      (local.set $tp (i32.add (local.get $tp)
        (i32.sub (i32.const @SG_GAP0)
                 (i32.div_u (i32.mul (i32.const @(SG_GAP0 - SG_GAP1)) (select (local.get $tp) (i32.const @SG_RAMP) (i32.lt_u (local.get $tp) (i32.const @SG_RAMP))))
                            (i32.const @SG_RAMP)))))
      (br $more)))
  (i32.store (i32.const @(PG_H + SG_NS)) (local.get $k))
  (i32.store (i32.const @(PG_H + SG_NV)) (local.get $vi))
  ;; per bucket: every stomper before lo gone by its start, every one from hi not started by its end
  (!for $b (i32.const 0) (i32.const @SG_NB)
    (block $l
      (loop $lp
        (br_if $l (i32.ge_u (local.get $lo) (local.get $k)))
        (br_if $l (i32.gt_u (i32.load offset=@(PG_BIG + SG_RECS + 4) (i32.mul (local.get $lo) (i32.const @SG_REC)))
                            (i32.mul (local.get $b) (i32.const @SG_BUCKET))))
        (!inc $lo)
        (br $lp)))
    (block $h
      (loop $hp
        (br_if $h (i32.ge_u (local.get $hi) (local.get $k)))
        (br_if $h (i32.ge_u (i32.load offset=@(PG_BIG + SG_RECS) (i32.mul (local.get $hi) (i32.const @SG_REC)))
                            (i32.mul (i32.add (local.get $b) (i32.const 1)) (i32.const @SG_BUCKET))))
        (!inc $hi)
        (br $hp)))
    (!st u16 @(PG_BIG + SG_LO) (local.get $b) (local.get $lo))
    (!st u16 @(PG_BIG + SG_HI) (local.get $b) (local.get $hi))))

;; The disc for n balls, its flagstones and the round's stompers.
(func $sg_setup (param $n i32)
  (local $rad f32)
  (local.set $rad (f32.min (!madd (f32.sqrt (f32.convert_i32_u (local.get $n))) (f32.const @SG_RK) (f32.const @SG_R0)) (f32.const @SG_RMAX)))
  (!chk (local.get $rad) 251 (local.get $n))
  (i32.store (i32.const @PG_KIND) (i32.const @PK_OUT))
  (i32.store (i32.const @PG_LEN) (i32.const @SG_LEN))
  (f32.store (i32.const @PG_SIZE) (local.get $rad))
  (f32.store (i32.const @PG_IDLE) (f32.const @SG_IDLE))
  (f32.store (i32.const @PG_HOP) (f32.const @SG_HOP))
  (f32.store (i32.const @(PG_H + SG_RAD)) (local.get $rad))
  (call $sg_tiles (local.get $rad))
  (call $sg_schedule (local.get $rad)))

;; A sunflower spiral over the middle of the disc.
(func $sg_spawn (param $i i32) (param $n i32) (result f32 f32 f32)
  (local $x f32) (local $z f32)
  (call $p_disc (local.get $i) (local.get $n) (f32.mul (f32.load (i32.const @(PG_H + SG_RAD))) (f32.const @SG_SPAWN)))
  (local.set $z) (local.set $x)
  (local.get $x) (f32.const @PLAT_Y) (local.get $z))

(func $sg_start)
(func $sg_begin (param $p i32) (param $d i32))

;; The floor's top if the flagstone under (x, z) holds on bank d's tick:
;; there is one, and the rim hasn't taken it.
(func $sg_ground (param $d i32) (param $x f32) (param $y f32) (param $z f32) (result f32)
  (local $a i32) (local $cx f32)
  (if (f32.lt (local.get $y) (f32.const @PLAT_Y)) (then (return (f32.const -1000))))
  (local.set $cx (f32.load offset=@PG_CX (local.get $d)))
  (local.set $a (call $sg_cell (i32.trunc_sat_f32_s (f32.floor (f32.div (f32.sub (local.get $x) (local.get $cx)) (f32.const @SG_S))))
                               (i32.trunc_sat_f32_s (f32.floor (f32.div (f32.sub (local.get $z) (local.get $cx)) (f32.const @SG_S))))))
  (if (i32.lt_s (local.get $a) (i32.const 0)) (then (return (f32.const -1000))))
  (if (i32.ge_u (call $p_t (local.get $d)) (i32.load16_u offset=@(PG_BIG + SG_TILES) (local.get $a))) (then (return (f32.const -1000))))
  (f32.const @PLAT_Y))

;; Charge record a (byte offset) on tick tp into play: its centre x, z and its
;; heading x, z. Its angle round the arc's centre is its first plus its turn
;; a tick times the ticks since: $sincos on the top 14 bits, turned on by the
;; low 10 (under 0.022 degrees, so to first order).
(func $sg_at (param $a i32) (param $tp i32) (result f32 f32 f32 f32)
  (local $th i32) (local $w i32) (local $s f32) (local $c f32) (local $f f32) (local $s2 f32) (local $c2 f32) (local $ra f32) (local $sg f32)
  (local.set $w (i32.load offset=@(PG_BIG + SG_RECS + 28) (local.get $a)))
  (local.set $th (i32.add (i32.load offset=@(PG_BIG + SG_RECS + 24) (local.get $a))
                          (i32.mul (local.get $w) (i32.sub (local.get $tp) (i32.load offset=@(PG_BIG + SG_RECS) (local.get $a))))))
  (call $sincos (i32.shr_u (local.get $th) (i32.const 10)))
  (local.set $c) (local.set $s)
  (local.set $f (f32.mul (f32.convert_i32_u (i32.and (local.get $th) (i32.const 1023))) (f32.const @SG_FRAC)))
  (local.set $s2 (!madd (local.get $c) (local.get $f) (local.get $s)))
  (local.set $c2 (f32.sub (local.get $c) (f32.mul (local.get $s) (local.get $f))))
  (local.set $ra (f32.load offset=@(PG_BIG + SG_RECS + 16) (local.get $a)))
  (local.set $sg (select (f32.const 1) (f32.const -1) (i32.gt_s (local.get $w) (i32.const 0))))
  (!madd (local.get $c2) (local.get $ra) (f32.load offset=@(PG_BIG + SG_RECS + 8) (local.get $a)))
  (!madd (local.get $s2) (local.get $ra) (f32.load offset=@(PG_BIG + SG_RECS + 12) (local.get $a)))
  (f32.mul (f32.neg (local.get $sg)) (local.get $s2))
  (f32.mul (local.get $sg) (local.get $c2)))

;; Every stomper out on bank d's tick against ball p (a ball going out is past
;; them all). A charge, a body standing rs round a centre moving on its arc,
;; 2 rs tall: the ball put out of it across the floor, sent off it at SG_KICK
;; past the stomper's own speed that way, SG_FLING along its heading and up
;; at SG_POP0 plus SG_POP1, those two times how head on. A leap: on its
;; landing tick a ball under it thrown clear outward at SG_SLAMV and up at
;; SG_SLAMUP; then a body balls are put out of for SG_STAY; and its shockwave,
;; a ball on the floor whose centre the front sweeps knocked outward. A hit
;; puts the stomper and the tick in the ball's PG_M (over's).
(func $sg_push (param $p i32) (param $d i32)
  (local $pb i32) (local $fl i32) (local $tp i32) (local $b i32) (local $k i32) (local $k1 i32) (local $a i32) (local $hit i32) (local $el i32)
  (local $px f32) (local $py f32) (local $pz f32) (local $vx f32) (local $vy f32) (local $vz f32) (local $r f32) (local $rs f32) (local $reach f32)
  (local $ra f32) (local $dx f32) (local $dz f32) (local $q f32) (local $sx f32) (local $sz f32) (local $hx f32) (local $hz f32)
  (local $h f32) (local $nx f32) (local $nz f32) (local $v f32) (local $al f32) (local $rel f32) (local $dv f32) (local $r1 f32) (local $rw f32)
  (local.set $pb (i32.add (i32.shl (local.get $p) (i32.const 6)) (local.get $d)))
  (local.set $fl (!at u8 @(PLAYERS + P_FL) (local.get $pb)))
  (if (i32.ne (i32.and (local.get $fl) (i32.const @(PF_LIVE | PF_DEAD | PF_FALL))) (i32.const @PF_LIVE)) (then (return)))
  (local.set $tp (call $p_t (local.get $d)))
  (local.set $b (i32.div_u (local.get $tp) (i32.const @SG_BUCKET)))
  (if (i32.ge_u (local.get $b) (i32.const @SG_NB)) (then (return)))
  (local.set $k (!ld u16 @(PG_BIG + SG_LO) (local.get $b)))
  (local.set $k1 (!ld u16 @(PG_BIG + SG_HI) (local.get $b)))
  (if (i32.ge_u (local.get $k) (local.get $k1)) (then (return)))
  (local.set $px (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
  (local.set $py (!at f32 @(PLAYERS + P_PY) (local.get $pb)))
  (local.set $pz (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
  (local.set $vx (!at f32 @(PLAYERS + P_VX) (local.get $pb)))
  (local.set $vy (!at f32 @(PLAYERS + P_VY) (local.get $pb)))
  (local.set $vz (!at f32 @(PLAYERS + P_VZ) (local.get $pb)))
  (local.set $r (call $b_rad (local.get $pb)))
  (block $done
    (loop $next
      (br_if $done (i32.ge_u (local.get $k) (local.get $k1)))
      (local.set $a (i32.mul (local.get $k) (i32.const @SG_REC)))
      (local.set $el (i32.sub (local.get $tp) (i32.load offset=@(PG_BIG + SG_RECS) (local.get $a))))
      (if (i32.and (i32.ge_s (local.get $el) (i32.const 0))
                   (i32.lt_s (i32.sub (local.get $tp) (i32.load offset=@(PG_BIG + SG_RECS + 4) (local.get $a))) (i32.const 0)))
        (then
          (local.set $rs (f32.load offset=@(PG_BIG + SG_RECS + 20) (local.get $a)))
          (local.set $reach (f32.add (local.get $rs) (local.get $r)))
          (if (i32.eqz (i32.and (i32.load8_u offset=@(PG_BIG + SG_RECS + 48) (local.get $a)) (i32.const 1)))
            (then
              ;; a charge: first, is the ball within reach of its arc at all
              (local.set $ra (f32.load offset=@(PG_BIG + SG_RECS + 16) (local.get $a)))
              (local.set $dx (f32.sub (local.get $px) (f32.load offset=@(PG_BIG + SG_RECS + 8) (local.get $a))))
              (local.set $dz (f32.sub (local.get $pz) (f32.load offset=@(PG_BIG + SG_RECS + 12) (local.get $a))))
              (local.set $q (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))))
              (local.set $h (f32.sub (local.get $ra) (local.get $reach)))
              (local.set $v (f32.add (local.get $ra) (local.get $reach)))
              (if (i32.and (i32.and (f32.gt (local.get $q) (f32.mul (local.get $h) (local.get $h))) (f32.lt (local.get $q) (f32.mul (local.get $v) (local.get $v))))
                           (f32.lt (local.get $py) (!madd (local.get $rs) (f32.const 2) (f32.const @PLAT_Y))))
                (then
                  (call $sg_at (local.get $a) (local.get $tp))
                  (local.set $hz) (local.set $hx) (local.set $sz) (local.set $sx)
                  (local.set $dx (f32.sub (local.get $px) (local.get $sx)))
                  (local.set $dz (f32.sub (local.get $pz) (local.get $sz)))
                  (local.set $q (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))))
                  (if (f32.lt (local.get $q) (f32.mul (local.get $reach) (local.get $reach)))
                    (then
                      (local.set $h (f32.sqrt (local.get $q)))
                      (if (f32.gt (local.get $h) (f32.const 0.001))
                        (then
                          (local.set $nx (f32.div (local.get $dx) (local.get $h)))
                          (local.set $nz (f32.div (local.get $dz) (local.get $h))))
                        (else
                          ;; dead under it: out to its right
                          (local.set $nx (f32.neg (local.get $hz)))
                          (local.set $nz (local.get $hx))))
                      (local.set $px (!madd (local.get $nx) (local.get $reach) (local.get $sx)))
                      (local.set $pz (!madd (local.get $nz) (local.get $reach) (local.get $sz)))
                      (local.set $v (f32.load offset=@(PG_BIG + SG_RECS + 32) (local.get $a)))
                      (local.set $al (f32.max (!madd (local.get $nx) (local.get $hx) (f32.mul (local.get $nz) (local.get $hz))) (f32.const 0)))
                      (local.set $rel (!madd (f32.sub (local.get $vx) (f32.mul (local.get $hx) (local.get $v))) (local.get $nx)
                                             (f32.mul (f32.sub (local.get $vz) (f32.mul (local.get $hz) (local.get $v))) (local.get $nz))))
                      (if (f32.lt (local.get $rel) (f32.const @SG_KICK))
                        (then
                          (local.set $dv (f32.sub (f32.const @SG_KICK) (local.get $rel)))
                          (local.set $vx (!madd (local.get $dv) (local.get $nx) (!madd (f32.mul (local.get $al) (f32.const @SG_FLING)) (local.get $hx) (local.get $vx))))
                          (local.set $vz (!madd (local.get $dv) (local.get $nz) (!madd (f32.mul (local.get $al) (f32.const @SG_FLING)) (local.get $hz) (local.get $vz))))
                          (local.set $vy (f32.max (local.get $vy) (!madd (local.get $al) (f32.const @SG_POP1) (f32.const @SG_POP0))))
                          (local.set $fl (i32.and (local.get $fl) (i32.const @(255 ^ PF_GROUND))))
                          (local.set $hit (i32.or (i32.add (local.get $k) (i32.const 1)) (i32.shl (local.get $tp) (i32.const 16))))
                          (if (f32.ge (local.get $dv) (f32.const 2))
                            (then (call $fx (local.get $d) (i32.const @SG_FX_HIT) (local.get $p) (local.get $k)
                                            (!madd (local.get $nx) (local.get $rs) (local.get $sx)) (f32.add (local.get $py) (local.get $r))
                                            (!madd (local.get $nz) (local.get $rs) (local.get $sz))
                                            (!madd (local.get $al) (f32.const @SG_FLING) (local.get $dv))))))))))))
            (else
              ;; a leap: the way out from where it lands
              (local.set $sx (f32.load offset=@(PG_BIG + SG_RECS + 8) (local.get $a)))
              (local.set $sz (f32.load offset=@(PG_BIG + SG_RECS + 12) (local.get $a)))
              (local.set $dx (f32.sub (local.get $px) (local.get $sx)))
              (local.set $dz (f32.sub (local.get $pz) (local.get $sz)))
              (local.set $h (f32.sqrt (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz)))))
              (if (f32.gt (local.get $h) (f32.const 0.001))
                (then
                  (local.set $nx (f32.div (local.get $dx) (local.get $h)))
                  (local.set $nz (f32.div (local.get $dz) (local.get $h))))
                (else (local.set $nx (f32.const 1)) (local.set $nz (f32.const 0))))
              (if (i32.eqz (local.get $el))
                (then
                  ;; the slam: under it, thrown clear
                  (if (i32.and (f32.lt (local.get $h) (f32.add (local.get $reach) (f32.const @SG_SLAMR)))
                               (f32.lt (local.get $py) (!madd (local.get $rs) (f32.const 2) (f32.const @PLAT_Y))))
                    (then
                      (if (f32.lt (local.get $h) (local.get $reach))
                        (then
                          (local.set $px (!madd (local.get $nx) (local.get $reach) (local.get $sx)))
                          (local.set $pz (!madd (local.get $nz) (local.get $reach) (local.get $sz)))))
                      (local.set $vx (f32.mul (local.get $nx) (f32.const @SG_SLAMV)))
                      (local.set $vz (f32.mul (local.get $nz) (f32.const @SG_SLAMV)))
                      (local.set $vy (f32.max (local.get $vy) (f32.const @SG_SLAMUP)))
                      (local.set $fl (i32.and (local.get $fl) (i32.const @(255 ^ PF_GROUND))))
                      (local.set $hit (i32.or (i32.add (local.get $k) (i32.const 1)) (i32.shl (local.get $tp) (i32.const 16))))
                      (call $fx (local.get $d) (i32.const @SG_FX_HIT) (local.get $p) (local.get $k)
                                (local.get $px) (f32.add (local.get $py) (local.get $r)) (local.get $pz) (f32.const @SG_SLAMV)))))
                (else
                  ;; standing: a body to be put out of, gently
                  (if (i32.and (i32.and (i32.lt_s (local.get $el) (i32.const @SG_STAY)) (f32.lt (local.get $h) (local.get $reach)))
                               (f32.lt (local.get $py) (!madd (local.get $rs) (f32.const 2) (f32.const @PLAT_Y))))
                    (then
                      (local.set $px (!madd (local.get $nx) (local.get $reach) (local.get $sx)))
                      (local.set $pz (!madd (local.get $nz) (local.get $reach) (local.get $sz)))
                      (local.set $rel (!madd (local.get $vx) (local.get $nx) (f32.mul (local.get $vz) (local.get $nz))))
                      (if (f32.lt (local.get $rel) (f32.const 1))
                        (then
                          (local.set $dv (f32.sub (f32.const 1) (local.get $rel)))
                          (local.set $vx (!madd (local.get $dv) (local.get $nx) (local.get $vx)))
                          (local.set $vz (!madd (local.get $dv) (local.get $nz) (local.get $vz)))))))
                  ;; the shockwave: its front swept past the ball's centre this tick, the ball's bottom under it
                  (local.set $r1 (!madd (f32.convert_i32_u (local.get $el)) (f32.const @(SG_VW * 0.008)) (local.get $rs)))
                  (local.set $rw (f32.load offset=@(PG_BIG + SG_RECS + 52) (local.get $a)))
                  (if (i32.and (i32.and (f32.le (local.get $r1) (local.get $rw)) (f32.lt (local.get $py) (f32.const @(+PLAT_Y + SG_HW))))
                               (i32.and (f32.le (local.get $h) (local.get $r1))
                                        (f32.gt (local.get $h) (f32.sub (local.get $r1) (f32.const @(SG_VW * 0.008 + SG_BAND))))))
                    (then
                      (local.set $v (f32.mul (f32.const @SG_KW) (f32.sub (f32.const 1) (f32.mul (f32.const @SG_KWF) (f32.div (local.get $r1) (local.get $rw))))))
                      (local.set $rel (!madd (local.get $vx) (local.get $nx) (f32.mul (local.get $vz) (local.get $nz))))
                      (if (f32.lt (local.get $rel) (local.get $v))
                        (then
                          (local.set $dv (f32.sub (local.get $v) (local.get $rel)))
                          (local.set $vx (!madd (local.get $dv) (local.get $nx) (local.get $vx)))
                          (local.set $vz (!madd (local.get $dv) (local.get $nz) (local.get $vz)))
                          (local.set $vy (f32.max (local.get $vy) (f32.const @SG_WPOP)))
                          (local.set $fl (i32.and (local.get $fl) (i32.const @(255 ^ PF_GROUND))))
                          (local.set $hit (i32.or (i32.add (local.get $k) (i32.const 1)) (i32.shl (local.get $tp) (i32.const 16))))
                          (if (f32.ge (local.get $dv) (f32.const 2))
                            (then (call $fx (local.get $d) (i32.const @SG_FX_HIT) (local.get $p) (i32.or (local.get $k) (i32.const 0x8000))
                                            (local.get $px) (local.get $py) (local.get $pz) (local.get $dv))))))))))))))
      (!inc $k)
      (br $next)))
  (!chk (local.get $px) 252 (local.get $p))
  (!chk (local.get $pz) 252 (local.get $p))
  (!chk (local.get $vx) 253 (local.get $p))
  (!chk (local.get $vy) 253 (local.get $p))
  (!chk (local.get $vz) 253 (local.get $p))
  (!put f32 @(PLAYERS + P_PX) (local.get $pb) (local.get $px))
  (!put f32 @(PLAYERS + P_PZ) (local.get $pb) (local.get $pz))
  (!put f32 @(PLAYERS + P_VX) (local.get $pb) (local.get $vx))
  (!put f32 @(PLAYERS + P_VY) (local.get $pb) (local.get $vy))
  (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (local.get $vz))
  (!put u8 @(PLAYERS + P_FL) (local.get $pb) (local.get $fl))
  (if (local.get $hit) (then (!put i32 @(PLAYERS + PG_M) (local.get $pb) (local.get $hit)))))

;; The confirmed world's calls, as FX: every stomper landing this tick (a
;; charge where it sets off, a leap where it slams), every leap taking off
;; SG_LEAPT before, a wave's paths showing (its first SG_TELE out), and
;; SG_WARN before the leaps and the crumbling, a call.
(func $sg_tick
  (local $tp i32) (local $t i32) (local $b i32) (local $k i32) (local $k1 i32) (local $a i32) (local $j i32) (local $fl i32)
  (local $x f32) (local $z f32)
  (local.set $tp (call $p_t (i32.const 0)))
  (!for $j (i32.const 0) (i32.const 3)
    ;; 0: landing now; 1: leaping now, to land SG_LEAPT on; 2: showing now, SG_TELE on
    (local.set $t (i32.add (local.get $tp) (select (i32.const 0) (select (i32.const @SG_LEAPT) (i32.const @SG_TELE) (i32.eq (local.get $j) (i32.const 1)))
                                                   (i32.eqz (local.get $j)))))
    (local.set $b (i32.div_u (local.get $t) (i32.const @SG_BUCKET)))
    (if (i32.lt_u (local.get $b) (i32.const @SG_NB))
      (then
        (local.set $k1 (!ld u16 @(PG_BIG + SG_HI) (local.get $b)))
        (!for $k (!ld u16 @(PG_BIG + SG_LO) (local.get $b)) (local.get $k1)
          (local.set $a (i32.mul (local.get $k) (i32.const @SG_REC)))
          (local.set $fl (i32.load8_u offset=@(PG_BIG + SG_RECS + 48) (local.get $a)))
          (if (i32.eq (i32.load offset=@(PG_BIG + SG_RECS) (local.get $a)) (local.get $t))
            (then
              (if (i32.eqz (local.get $j))
                (then
                  (if (i32.and (local.get $fl) (i32.const 1))
                    (then
                      (local.set $x (f32.load offset=@(PG_BIG + SG_RECS + 8) (local.get $a)))
                      (local.set $z (f32.load offset=@(PG_BIG + SG_RECS + 12) (local.get $a))))
                    (else
                      (call $sg_at (local.get $a) (local.get $tp))
                      (drop) (drop)
                      (local.set $z) (local.set $x)))
                  (call $fx (i32.const 0) (i32.const @SG_FX_LAND) (i32.const 255) (local.get $k)
                            (local.get $x) (f32.const @PLAT_Y) (local.get $z) (f32.load offset=@(PG_BIG + SG_RECS + 20) (local.get $a)))))
              (if (i32.and (i32.eq (local.get $j) (i32.const 1)) (i32.and (local.get $fl) (i32.const 1)))
                (then (call $fx (i32.const 0) (i32.const @SG_FX_LEAP) (i32.const 255) (local.get $k)
                                (f32.load offset=@(PG_BIG + SG_RECS + 36) (local.get $a)) (f32.const @PLAT_Y)
                                (f32.load offset=@(PG_BIG + SG_RECS + 40) (local.get $a)) (f32.load offset=@(PG_BIG + SG_RECS + 20) (local.get $a)))))
              (if (i32.and (i32.eq (local.get $j) (i32.const 2)) (i32.ne (i32.and (local.get $fl) (i32.const 2)) (i32.const 0)))
                (then (call $fx (i32.const 0) (i32.const @SG_FX_CALL) (i32.const 255) (i32.load16_u offset=@(PG_BIG + SG_RECS + 50) (local.get $a))
                                (f32.load (i32.const @PG_CX)) (f32.const @PLAT_Y) (f32.load (i32.const @PG_CX))
                                (f32.convert_i32_u (i32.load offset=@(PG_BIG + SG_RECS + 44) (local.get $a))))))))))))
  (if (i32.eq (local.get $tp) (i32.const @(SG_LEAPFROM - SG_WARN)))
    (then (call $fx (i32.const 0) (i32.const @SG_FX_CALL) (i32.const 255) (i32.const 0x8001)
                    (f32.load (i32.const @PG_CX)) (f32.const @PLAT_Y) (f32.load (i32.const @PG_CX)) (f32.const 0))))
  (if (i32.eq (local.get $tp) (i32.const @(SG_CRUMBLE - SG_WARN)))
    (then (call $fx (i32.const 0) (i32.const @SG_FX_CALL) (i32.const 255) (i32.const 0x8002)
                    (f32.load (i32.const @PG_CX)) (f32.const @PLAT_Y) (f32.load (i32.const @PG_CX)) (f32.const 0)))))

;; Two or more still on and every one of them falling, all at once: over now,
;; and they share the win, rather than the last of them to drop taking it
;; alone. All at once is all since one tick (flagstones taken from under them
;; together), or each last hit by one stomper (its PG_M) no more than SG_SHARE
;; ticks before it began to fall: one charge or one slam that took them all.
;; One that went off before the rest goes out first, in its place. Each
;; ball's first tick falling is noted here (SG_FELL).
(func $sg_over (result i32)
  (local $p i32) (local $pb i32) (local $fl i32) (local $t i32) (local $at i32) (local $by i32) (local $m i32) (local $fell i32)
  (local $same i32)
  (local.set $t (i32.add (call $p_t (i32.const 0)) (i32.const 1)))
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (local.set $fl (i32.and (!at u8 @(PLAYERS + P_FL) (i32.shl (local.get $p) (i32.const 6))) (i32.const @(PF_LIVE | PF_DEAD | PF_FALL))))
    (if (i32.and (i32.eq (local.get $fl) (i32.const @(PF_LIVE | PF_FALL))) (i32.eqz (!ld u16 @(PG_S + SG_FELL) (local.get $p))))
      (then (!st u16 @(PG_S + SG_FELL) (local.get $p) (local.get $t)))))
  (if (i32.lt_u (i32.load (i32.const @BH_LEFT)) (i32.const 2)) (then (return (i32.const 0))))
  ;; 1: all since one tick so far; 2: all off one stomper so far
  (local.set $same (i32.const 3))
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
    (local.set $fl (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @(PF_LIVE | PF_DEAD | PF_FALL))))
    (if (i32.eq (local.get $fl) (i32.const @PF_LIVE)) (then (return (i32.const 0))))
    (if (i32.eq (local.get $fl) (i32.const @(PF_LIVE | PF_FALL)))
      (then
        (local.set $fell (!ld u16 @(PG_S + SG_FELL) (local.get $p)))
        (local.set $m (!at i32 @(PLAYERS + PG_M) (local.get $pb)))
        (if (i32.eqz (local.get $at))
          (then
            (local.set $at (local.get $fell))
            (local.set $by (i32.and (local.get $m) (i32.const 0xffff)))))
        (if (i32.ne (local.get $fell) (local.get $at)) (then (local.set $same (i32.and (local.get $same) (i32.const 2)))))
        (if (i32.or (i32.or (i32.eqz (local.get $by)) (i32.ne (i32.and (local.get $m) (i32.const 0xffff)) (local.get $by)))
                    (i32.gt_s (i32.sub (i32.sub (local.get $fell) (i32.const 1)) (i32.shr_u (local.get $m) (i32.const 16))) (i32.const @SG_SHARE)))
          (then (local.set $same (i32.and (local.get $same) (i32.const 1))))))))
  (i32.ne (local.get $same) (i32.const 0)))

(func $sg_out (param $p i32))
