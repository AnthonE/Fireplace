;; SEESAWS: rows of long planks over the sea, each on a pivot at its middle,
;; tipping under the weight of the balls on it, sized for the crowd. The
;; slope pulls a ball down a plank, and a steep one rolls it off its low end
;; into the sea; from SS_CUT0 the planks are cut shorter or narrower one by
;; one, from SS_DROP0 they drop away for good, flashing SS_DROPWARN first, so
;; the crowd crams onto fewer planks and its weight tips them. Bumps stay on.
;; The last ball on wins.
;;
;; A plank's slope depends on where every ball is, but ground and push run
;; in the prediction up to 201 ticks ahead of the confirmed world, which may
;; read only what is fixed that far ahead. So the planks answer late: each
;; tick the confirmed world sums the load on each plank (the metres from the
;; pivot of each ball standing on it, times its weight) and integrates the
;; plank's slope for SS_LAG ticks on into its ring in PG_BIG. The slope of
;; every tick the prediction reaches was written at least 55 ticks before the
;; confirmed tick it starts from, and the ring keeps SS_RING - SS_LAG ticks
;; behind, so ground and push read it on either bank's own tick and give the
;; prediction exactly what the confirmed world will. The lateness is the
;; telegraph: the client draws the slope 1.6 s on as a ghost over each plank.
;; A cut or a drop is drawn from the PRNG SS_CUTWARN or SS_DROPWARN before it
;; happens (more than the prediction runs ahead), its tick in PG_S, 0 before:
;; a prediction that misses one being written reaches no tick it changes.
;; Before the first slope written (setup zeroes PG_BIG) every plank is level.

;; Plank k's record in PG_S.
(func $ss_pa (param $k i32) (result i32)
  (i32.add (i32.const @(PG_S + SS_PLANKS)) (i32.shl (local.get $k) (i32.const 5))))

;; Plank k's slope on tick t into play, from its ring.
(func $ss_g (param $k i32) (param $t i32) (result f32)
  (f32.load offset=@(PG_BIG + SS_SLOPES)
    (i32.shl (i32.or (i32.shl (local.get $k) (i32.const @(Math.log2(SS_RING)))) (i32.and (local.get $t) (i32.const @(SS_RING - 1))))
             (i32.const 2))))

;; Plank k's pivot, x and z, on bank d.
(func $ss_xz (param $d i32) (param $k i32) (result f32 f32)
  (local $cols i32)
  (local.set $cols (i32.load offset=@(PG_H + SS_COLS) (local.get $d)))
  (!madd (f32.convert_i32_u (i32.rem_u (local.get $k) (local.get $cols))) (f32.const @SS_SX) (f32.load offset=@(PG_H + SS_X0) (local.get $d)))
  (!madd (f32.convert_i32_u (i32.div_u (local.get $k) (local.get $cols))) (f32.const @SS_SZ) (f32.load offset=@(PG_H + SS_Z0) (local.get $d))))

;; The plank under (x, z) on tick t into play, on bank d's header: its index
;; and how far along it from the pivot (toward +z); -1 over a gap, off the
;; field, or where a plank has been cut back or dropped by then.
(func $ss_at (param $d i32) (param $t i32) (param $x f32) (param $z f32) (result i32 f32)
  (local $cols i32) (local $c i32) (local $r i32) (local $k i32) (local $a i32) (local $cut i32) (local $drop i32)
  (local $dx f32) (local $dz f32) (local $hl f32) (local $hw f32)
  (local.set $cols (i32.load offset=@(PG_H + SS_COLS) (local.get $d)))
  (local.set $c (i32.trunc_sat_f32_s (f32.nearest (f32.div (f32.sub (local.get $x) (f32.load offset=@(PG_H + SS_X0) (local.get $d))) (f32.const @SS_SX)))))
  (local.set $r (i32.trunc_sat_f32_s (f32.nearest (f32.div (f32.sub (local.get $z) (f32.load offset=@(PG_H + SS_Z0) (local.get $d))) (f32.const @SS_SZ)))))
  ;; unsigned: a negative column or row is past the end too
  (if (i32.or (i32.ge_u (local.get $c) (local.get $cols)) (i32.ge_u (local.get $r) (i32.load offset=@(PG_H + SS_ROWS) (local.get $d))))
    (then (return (i32.const -1) (f32.const 0))))
  (local.set $k (i32.add (i32.mul (local.get $r) (local.get $cols)) (local.get $c)))
  (local.set $a (call $ss_pa (local.get $k)))
  (local.set $drop (i32.load offset=@SS_P_DROP (local.get $a)))
  (if (i32.and (i32.ne (local.get $drop) (i32.const 0)) (i32.ge_u (local.get $t) (local.get $drop)))
    (then (return (i32.const -1) (f32.const 0))))
  (local.set $hl (f32.const @SS_PL))
  (local.set $hw (f32.const @SS_PW))
  (local.set $cut (i32.load offset=@SS_P_CUT (local.get $a)))
  (if (i32.and (i32.ne (local.get $cut) (i32.const 0)) (i32.ge_u (local.get $t) (local.get $cut)))
    (then
      (if (i32.eq (i32.load8_u offset=@SS_P_KIND (local.get $a)) (i32.const @SS_K_SHORT))
        (then (local.set $hl (f32.const @(SS_PL * SS_CUTL))))
        (else (local.set $hw (f32.const @(SS_PW * SS_CUTW)))))))
  (local.set $dx (f32.sub (local.get $x) (!madd (f32.convert_i32_u (local.get $c)) (f32.const @SS_SX) (f32.load offset=@(PG_H + SS_X0) (local.get $d)))))
  (local.set $dz (f32.sub (local.get $z) (!madd (f32.convert_i32_u (local.get $r)) (f32.const @SS_SZ) (f32.load offset=@(PG_H + SS_Z0) (local.get $d)))))
  (if (i32.or (f32.gt (f32.abs (local.get $dx)) (local.get $hw)) (f32.gt (f32.abs (local.get $dz)) (local.get $hl)))
    (then (return (i32.const -1) (f32.const 0))))
  (local.get $k) (local.get $dz))

;; The top of a plank sloping g, dz along it from its pivot.
(func $ss_top (param $g f32) (param $dz f32) (result f32)
  (f32.sub (f32.const @PLAT_Y) (f32.mul (local.get $g) (local.get $dz))))

;; The field for n balls: a plank for every SS_PER and one more, in rows of
;; about SS_ASPECT times as many across as along, the grid filled; the
;; round's knobs; the cuts' and the drops' paces, and the planks kept.
(func $ss_setup (param $n i32)
  (local $k i32) (local $rows i32) (local $cols i32) (local $keep i32) (local $cx f32)
  (local.set $k (i32.div_u (i32.add (local.get $n) (i32.const @SS_PER)) (i32.const @SS_PER)))
  (if (i32.lt_u (local.get $k) (i32.const @SS_KMIN)) (then (local.set $k (i32.const @SS_KMIN))))
  (if (i32.gt_u (local.get $k) (i32.const @SS_KMAX)) (then (local.set $k (i32.const @SS_KMAX))))
  (local.set $rows (i32.trunc_sat_f32_u (f32.nearest (f32.sqrt (f32.div (f32.convert_i32_u (local.get $k)) (f32.const @SS_ASPECT))))))
  (if (i32.eqz (local.get $rows)) (then (local.set $rows (i32.const 1))))
  (local.set $cols (i32.div_u (i32.add (local.get $k) (i32.sub (local.get $rows) (i32.const 1))) (local.get $rows)))
  (local.set $k (i32.mul (local.get $rows) (local.get $cols)))
  (local.set $keep (i32.div_u (local.get $k) (i32.const @SS_KEEPK)))
  (if (i32.eqz (local.get $keep)) (then (local.set $keep (i32.const 1))))
  (local.set $cx (f32.load (i32.const @PG_CX)))
  (i32.store (i32.const @(PG_H + SS_K)) (local.get $k))
  (i32.store (i32.const @(PG_H + SS_COLS)) (local.get $cols))
  (i32.store (i32.const @(PG_H + SS_ROWS)) (local.get $rows))
  (f32.store (i32.const @(PG_H + SS_X0)) (f32.sub (local.get $cx) (f32.mul (f32.convert_i32_u (i32.sub (local.get $cols) (i32.const 1))) (f32.const @(SS_SX / 2)))))
  (f32.store (i32.const @(PG_H + SS_Z0)) (f32.sub (local.get $cx) (f32.mul (f32.convert_i32_u (i32.sub (local.get $rows) (i32.const 1))) (f32.const @(SS_SZ / 2)))))
  (i32.store (i32.const @(PG_H + SS_KEEP)) (local.get $keep))
  (i32.store (i32.const @(PG_H + SS_CUTI)) (select (i32.div_u (i32.const @SS_CUTSPAN) (local.get $k)) (i32.const @SS_CUTMIN)
                                                   (i32.gt_u (i32.div_u (i32.const @SS_CUTSPAN) (local.get $k)) (i32.const @SS_CUTMIN))))
  (local.set $keep (i32.div_u (i32.const @SS_DROPSPAN) (select (i32.sub (local.get $k) (local.get $keep)) (i32.const 1) (i32.gt_u (local.get $k) (local.get $keep)))))
  (i32.store (i32.const @(PG_H + SS_DROPI)) (select (local.get $keep) (i32.const @SS_DROPMIN) (i32.gt_u (local.get $keep) (i32.const @SS_DROPMIN))))
  (i32.store (i32.const @PG_KIND) (i32.const @PK_OUT))
  (i32.store (i32.const @PG_LEN) (i32.const @SS_LEN))
  (f32.store (i32.const @PG_SIZE)
    (f32.max (!madd (f32.convert_i32_u (i32.sub (local.get $cols) (i32.const 1))) (f32.const @(SS_SX / 2)) (f32.const @SS_PW))
             (!madd (f32.convert_i32_u (i32.sub (local.get $rows) (i32.const 1))) (f32.const @(SS_SZ / 2)) (f32.const @SS_PL))))
  ;; the lowest floor: a plank's low end at the stop, and a metre under
  (f32.store (i32.const @PG_FLOOR) (f32.const @(+PLAT_Y - SS_PL * SS_GMAX - 1))))

;; Ball i of n: dealt round the planks, on each in pairs either side of the
;; pivot SS_SPU apart along it, alternate pairs to either side of the
;; middle, the odd one out on the pivot.
(func $ss_spawn (param $i i32) (param $n i32) (result f32 f32 f32)
  (local $k i32) (local $kk i32) (local $j i32) (local $cnt i32) (local $pair i32) (local $x f32) (local $z f32) (local $u f32) (local $ox f32)
  (local.set $kk (i32.load (i32.const @(PG_H + SS_K))))
  (local.set $k (i32.rem_u (local.get $i) (local.get $kk)))
  (local.set $j (i32.div_u (local.get $i) (local.get $kk)))
  (local.set $cnt (i32.add (i32.div_u (local.get $n) (local.get $kk)) (i32.lt_u (local.get $k) (i32.rem_u (local.get $n) (local.get $kk)))))
  (call $ss_xz (i32.const 0) (local.get $k))
  (local.set $z) (local.set $x)
  (if (i32.eqz (i32.and (i32.and (local.get $cnt) (i32.const 1)) (i32.eq (local.get $j) (i32.sub (local.get $cnt) (i32.const 1)))))
    (then
      (local.set $pair (i32.shr_u (local.get $j) (i32.const 1)))
      (local.set $u (f32.mul (f32.convert_i32_u (i32.add (local.get $pair) (i32.const 1))) (f32.const @SS_SPU)))
      (if (i32.and (local.get $j) (i32.const 1)) (then (local.set $u (f32.neg (local.get $u)))))
      (local.set $ox (select (f32.const @SS_SPX) (f32.const @(-SS_SPX)) (i32.and (local.get $pair) (i32.const 1))))))
  (f32.add (local.get $x) (local.get $ox)) (f32.const @PLAT_Y) (f32.add (local.get $z) (local.get $u)))

(func $ss_start)
(func $ss_begin (param $p i32) (param $d i32))

;; The plank's top under (x, z) on bank d's tick, if there is one and y is no
;; more than SS_GRIP under it (a plank tipping up past a ball lifts it).
(func $ss_ground (param $d i32) (param $x f32) (param $y f32) (param $z f32) (result f32)
  (local $t i32) (local $k i32) (local $dz f32) (local $top f32)
  (local.set $t (call $p_t (local.get $d)))
  (call $ss_at (local.get $d) (local.get $t) (local.get $x) (local.get $z))
  (local.set $dz) (local.set $k)
  (if (i32.lt_s (local.get $k) (i32.const 0)) (then (return (f32.const -1000))))
  (local.set $top (call $ss_top (call $ss_g (local.get $k) (local.get $t)) (local.get $dz)))
  (if (result f32) (f32.lt (local.get $y) (f32.sub (local.get $top) (f32.const @SS_GRIP)))
    (then (f32.const -1000))
    (else (local.get $top))))

;; After the ball's roll on bank d, over a plank and not under it: its grip
;; (a hair over the top, not leaving it faster than SS_SNAPV, it is on it, so
;; it rides a plank tipping away under it), and on it the slope's pull down
;; it and the plank's own motion: its vertical speed is what takes its bottom
;; to the top where it will be next tick. Writes only its own record.
(func $ss_push (param $p i32) (param $d i32)
  (local $pb i32) (local $fl i32) (local $t i32) (local $k i32)
  (local $py f32) (local $vy f32) (local $vz f32) (local $dz f32) (local $g f32) (local $ng f32) (local $top f32) (local $next f32)
  (local.set $pb (i32.add (i32.shl (local.get $p) (i32.const 6)) (local.get $d)))
  (local.set $fl (!at u8 @(PLAYERS + P_FL) (local.get $pb)))
  (if (i32.and (local.get $fl) (i32.const @(PF_FALL | PF_DEAD))) (then (return)))
  (local.set $t (call $p_t (local.get $d)))
  (call $ss_at (local.get $d) (local.get $t) (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
  (local.set $dz) (local.set $k)
  (if (i32.lt_s (local.get $k) (i32.const 0)) (then (return)))
  (local.set $g (call $ss_g (local.get $k) (local.get $t)))
  (local.set $top (call $ss_top (local.get $g) (local.get $dz)))
  (local.set $py (!at f32 @(PLAYERS + P_PY) (local.get $pb)))
  (if (f32.lt (local.get $py) (f32.sub (local.get $top) (f32.const @SS_GRIP))) (then (return)))
  (local.set $vy (!at f32 @(PLAYERS + P_VY) (local.get $pb)))
  (local.set $vz (!at f32 @(PLAYERS + P_VZ) (local.get $pb)))
  ;; next tick's slope, and the top under where the ball rolls to by then
  (local.set $ng (call $ss_g (local.get $k) (i32.add (local.get $t) (i32.const 1))))
  (local.set $next (call $ss_top (local.get $ng) (!madd (local.get $vz) (f32.const @DT) (local.get $dz))))
  (if (i32.and (i32.eqz (i32.and (local.get $fl) (i32.const @PF_GROUND)))
               (i32.and (i32.and (f32.ge (local.get $py) (local.get $top)) (f32.le (f32.sub (local.get $py) (local.get $top)) (f32.const @SS_SNAP)))
                        (f32.le (local.get $vy) (!madd (f32.sub (local.get $next) (local.get $top)) (f32.const 125) (f32.const @SS_SNAPV)))))
    (then
      (local.set $py (local.get $top))
      (local.set $fl (i32.or (local.get $fl) (i32.const @PF_GROUND)))))
  (if (i32.and (local.get $fl) (i32.const @PF_GROUND))
    (then
      (local.set $vz (!madd (local.get $g) (f32.const @(SS_PULL * DT)) (local.get $vz)))
      (local.set $next (call $ss_top (local.get $ng) (!madd (local.get $vz) (f32.const @DT) (local.get $dz))))
      (local.set $vy (f32.mul (f32.sub (local.get $next) (local.get $py)) (f32.const 125)))))
  (!chk (local.get $py) 290 (local.get $p))
  (!chk (local.get $vy) 291 (local.get $p))
  (!chk (local.get $vz) 292 (local.get $p))
  (!put f32 @(PLAYERS + P_PY) (local.get $pb) (local.get $py))
  (!put f32 @(PLAYERS + P_VY) (local.get $pb) (local.get $vy))
  (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (local.get $vz))
  (!put u8 @(PLAYERS + P_FL) (local.get $pb) (local.get $fl)))

;; Plank k as an FX of kind: owner 255, shot k | kind << 8, at its pivot.
(func $ss_fx (param $kind i32) (param $k i32) (param $sub i32) (param $size f32)
  (local $x f32) (local $z f32)
  (call $ss_xz (i32.const 0) (local.get $k))
  (local.set $z) (local.set $x)
  (call $fx (i32.const 0) (local.get $kind) (i32.const 255) (i32.or (local.get $k) (i32.shl (local.get $sub) (i32.const 8)))
            (local.get $x) (f32.const @PLAT_Y) (local.get $z) (local.get $size)))

;; Are plank k's records clear of a drop (to cut: and of a cut)?
(func $ss_free (param $k i32) (param $cut i32) (result i32)
  (local $a i32)
  (local.set $a (call $ss_pa (local.get $k)))
  (i32.and (i32.eqz (i32.load offset=@SS_P_DROP (local.get $a)))
           (i32.or (i32.eqz (local.get $cut)) (i32.eqz (i32.load offset=@SS_P_CUT (local.get $a))))))

;; One plank drawn from the PRNG among the free ones (ss_free), or -1 for none.
(func $ss_draw (param $cut i32) (result i32)
  (local $k i32) (local $m i32) (local $r i32) (local $kk i32)
  (local.set $kk (i32.load (i32.const @(PG_H + SS_K))))
  (!for $k (i32.const 0) (local.get $kk)
    (if (call $ss_free (local.get $k) (local.get $cut)) (then (!inc $m))))
  (if (i32.eqz (local.get $m)) (then (return (i32.const -1))))
  (local.set $r (i32.rem_u (call $rand) (local.get $m)))
  (!for $k (i32.const 0) (local.get $kk)
    (if (call $ss_free (local.get $k) (local.get $cut))
      (then
        (if (i32.eqz (local.get $r)) (then (return (local.get $k))))
        (local.set $r (i32.sub (local.get $r) (i32.const 1))))))
  (i32.const -1))

;; Is it tick from + a multiple of every ticks, on or after from?
(func $ss_beat (param $t i32) (param $from i32) (param $every i32) (result i32)
  (i32.and (i32.ge_s (local.get $t) (local.get $from))
           (i32.eqz (i32.rem_u (i32.sub (local.get $t) (local.get $from)) (local.get $every)))))

;; The confirmed world's tick. The load on each plank from every ball in and
;; standing on it; each plank's slope SS_LAG ticks on from it, into the ring
;; (a hard tip coming creaks); the cuts and the drops drawn, each its warning
;; ahead, and made; the tick each ball started going out (over's).
(func $ss_tick
  (local $t i32) (local $kk i32) (local $k i32) (local $a i32) (local $p i32) (local $pb i32) (local $fl i32) (local $n i32) (local $m i32)
  (local $dz f32) (local $g f32) (local $w f32) (local $hard i32)
  (local.set $t (call $p_t (i32.const 0)))
  (local.set $kk (i32.load (i32.const @(PG_H + SS_K))))
  (!for $k (i32.const 0) (local.get $kk)
    (local.set $a (call $ss_pa (local.get $k)))
    (f32.store offset=@SS_P_LOAD (local.get $a) (f32.const 0))
    (i32.store16 offset=@SS_P_N (local.get $a) (i32.const 0)))
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
    (if (i32.and (call $p_in (local.get $pb)) (i32.ne (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @PF_GROUND)) (i32.const 0)))
      (then
        (call $ss_at (i32.const 0) (local.get $t) (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
        (local.set $dz) (local.set $k)
        (if (i32.ge_s (local.get $k) (i32.const 0))
          (then
            (local.set $a (call $ss_pa (local.get $k)))
            (f32.store offset=@SS_P_LOAD (local.get $a)
              (!madd (local.get $dz) (call $b_mass (local.get $pb)) (f32.load offset=@SS_P_LOAD (local.get $a))))
            (i32.store16 offset=@SS_P_N (local.get $a) (i32.add (i32.load16_u offset=@SS_P_N (local.get $a)) (i32.const 1))))))))
  (!for $k (i32.const 0) (local.get $kk)
    (local.set $a (call $ss_pa (local.get $k)))
    (local.set $g (f32.load offset=@SS_P_G (local.get $a)))
    (local.set $w (!madd (f32.load offset=@SS_P_W (local.get $a)) (f32.const @SS_DAMP)
                         (f32.sub (f32.mul (f32.load offset=@SS_P_LOAD (local.get $a)) (f32.const @SS_TQ)) (f32.mul (local.get $g) (f32.const @SS_LVL)))))
    (local.set $w (!clamp (local.get $w) (f32.const @(-SS_WMAX)) (f32.const @SS_WMAX)))
    (local.set $g (f32.add (local.get $g) (local.get $w)))
    (if (f32.gt (f32.abs (local.get $g)) (f32.const @SS_GMAX))
      (then
        (local.set $g (f32.copysign (f32.const @SS_GMAX) (local.get $g)))
        (local.set $w (f32.const 0))))
    (!chk (local.get $g) 293 (local.get $k))
    (!chk (local.get $w) 294 (local.get $k))
    (f32.store offset=@SS_P_G (local.get $a) (local.get $g))
    (f32.store offset=@SS_P_W (local.get $a) (local.get $w))
    (f32.store offset=@(PG_BIG + SS_SLOPES)
      (i32.shl (i32.or (i32.shl (local.get $k) (i32.const @(Math.log2(SS_RING)))) (i32.and (i32.add (local.get $t) (i32.const @SS_LAG)) (i32.const @(SS_RING - 1))))
               (i32.const 2))
      (local.get $g))
    ;; a hard tip coming creaks, once until it eases under SS_GSOFT
    (local.set $hard (i32.load8_u offset=@SS_P_HARD (local.get $a)))
    (if (i32.and (i32.eqz (local.get $hard)) (f32.ge (f32.abs (local.get $g)) (f32.const @SS_GHARD)))
      (then
        (i32.store8 offset=@SS_P_HARD (local.get $a) (i32.const 1))
        (if (i32.eqz (i32.load offset=@SS_P_DROP (local.get $a)))
          (then (call $ss_fx (i32.const @SS_FX_CREAK) (local.get $k) (i32.const 0) (local.get $g))))))
    (if (i32.and (local.get $hard) (f32.lt (f32.abs (local.get $g)) (f32.const @SS_GSOFT)))
      (then (i32.store8 offset=@SS_P_HARD (local.get $a) (i32.const 0))))
    ;; a cut or a drop happening now
    (if (i32.eq (i32.load offset=@SS_P_CUT (local.get $a)) (local.get $t))
      (then (call $ss_fx (i32.const @SS_FX_GO) (local.get $k) (i32.load8_u offset=@SS_P_KIND (local.get $a)) (f32.const 0))))
    (if (i32.eq (i32.load offset=@SS_P_DROP (local.get $a)) (local.get $t))
      (then (call $ss_fx (i32.const @SS_FX_GO) (local.get $k) (i32.const @SS_K_DROP) (f32.const 0)))))
  ;; the next cut, shorter or narrower as the PRNG says
  (if (call $ss_beat (local.get $t) (i32.const @(SS_CUT0 - SS_CUTWARN)) (i32.load (i32.const @(PG_H + SS_CUTI))))
    (then
      (local.set $k (call $ss_draw (i32.const 1)))
      (if (i32.ge_s (local.get $k) (i32.const 0))
        (then
          (local.set $a (call $ss_pa (local.get $k)))
          (local.set $n (select (i32.const @SS_K_NARROW) (i32.const @SS_K_SHORT) (i32.and (call $rand) (i32.const 1))))
          (i32.store offset=@SS_P_CUT (local.get $a) (i32.add (local.get $t) (i32.const @SS_CUTWARN)))
          (i32.store8 offset=@SS_P_KIND (local.get $a) (local.get $n))
          (i32.store (i32.const @(PG_S + SS_NCUT)) (i32.add (i32.load (i32.const @(PG_S + SS_NCUT))) (i32.const 1)))
          (call $ss_fx (i32.const @SS_FX_WARN) (local.get $k) (local.get $n) (f32.const @SS_CUTWARN))))))
  ;; the next drop, while more than SS_KEEP planks stand
  (if (i32.and (call $ss_beat (local.get $t) (i32.const @(SS_DROP0 - SS_DROPWARN)) (i32.load (i32.const @(PG_H + SS_DROPI))))
               (i32.gt_u (i32.sub (local.get $kk) (i32.load (i32.const @(PG_S + SS_NDROP)))) (i32.load (i32.const @(PG_H + SS_KEEP)))))
    (then
      (local.set $k (call $ss_draw (i32.const 0)))
      (if (i32.ge_s (local.get $k) (i32.const 0))
        (then
          (i32.store offset=@SS_P_DROP (call $ss_pa (local.get $k)) (i32.add (local.get $t) (i32.const @SS_DROPWARN)))
          (i32.store (i32.const @(PG_S + SS_NDROP)) (i32.add (i32.load (i32.const @(PG_S + SS_NDROP))) (i32.const 1)))
          (call $ss_fx (i32.const @SS_FX_WARN) (local.get $k) (i32.const @SS_K_DROP) (f32.const @SS_DROPWARN))))))
  ;; going out: the tick it started, once
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (local.set $fl (!at u8 @(PLAYERS + P_FL) (i32.shl (local.get $p) (i32.const 6))))
    (if (i32.and (i32.eq (i32.and (local.get $fl) (i32.const @(PF_LIVE | PF_DEAD | PF_FALL))) (i32.const @(PF_LIVE | PF_FALL)))
                 (i32.eqz (!ld u16 @(PG_S + SS_FELL) (local.get $p))))
      (then (!st u16 @(PG_S + SS_FELL) (local.get $p) (i32.add (local.get $t) (i32.const 1)))))))

;; Two or more still in, every one of them going out, and all since within
;; SS_TIE ticks (a plank dumped them together): over now, and they share the
;; win rather than the last place. One that went before the rest goes out
;; first, in its place.
(func $ss_over (result i32)
  (local $p i32) (local $f i32) (local $lo i32) (local $hi i32)
  (if (i32.lt_u (i32.load (i32.const @BH_LEFT)) (i32.const 2)) (then (return (i32.const 0))))
  (local.set $lo (i32.const 0xffff))
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (if (i32.eq (i32.and (!at u8 @(PLAYERS + P_FL) (i32.shl (local.get $p) (i32.const 6))) (i32.const @(PF_LIVE | PF_DEAD))) (i32.const @PF_LIVE))
      (then
        (local.set $f (!ld u16 @(PG_S + SS_FELL) (local.get $p)))
        (if (i32.eqz (local.get $f)) (then (return (i32.const 0))))
        (if (i32.lt_u (local.get $f) (local.get $lo)) (then (local.set $lo (local.get $f))))
        (if (i32.gt_u (local.get $f) (local.get $hi)) (then (local.set $hi (local.get $f)))))))
  (i32.le_u (i32.sub (local.get $hi) (local.get $lo)) (i32.const @SS_TIE)))

;; A ball out: a splash on the sea under it.
(func $ss_out (param $p i32)
  (local $pb i32)
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (call $fx (i32.const 0) (i32.const @SS_FX_SPLASH) (local.get $p) (i32.const 0)
            (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (f32.const 0) (!at f32 @(PLAYERS + P_PZ) (local.get $pb)) (f32.const 0)))
