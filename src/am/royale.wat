;; BATTLE ROYALE (M_ROYALE, prefix ry; constants and AO's fields in
;; src/am/royale.mjs): everyone for itself, one life each, the kit's mode
;; with no sides and a zone. All of it the confirmed world's, serial, in slot
;; order and crate order: the circles are drawn by $rand as play starts and
;; kept in AO, and the wall each tick is a function of them, the tick of play
;; and the match's clock alone ($ry_zone), so nothing the prediction runs
;; reads it. Outside the wall a fighter is hurt once a second; a death is out
;; for the match (A_RESPAWN past any clock). Crates in AO are opened by
;; walking into them; the map's pads are laid (MODES' pads) and hand out
;; their guns with E as in a team mode. The last standing ends it.

;; Play begins: the circles; everyone in the room put down spread over the
;; map; the crates; the wall at circle 0, and news of circle 1.
(func $ry_start
  (local $a i32)
  (call $ry_circles)
  (call $ry_spread)
  (call $ry_crates)
  (call $ry_zone)
  (call $ry_count)
  (local.set $a (i32.const @(AO + RY_C + 16)))
  (call $ry_say (i32.const @RY_MX_SHOW) (i32.const 1) (f32.load (local.get $a)) (f32.load offset=4 (local.get $a))))

;; A tick of play: the wall, its hits on the second, the crates walked into,
;; the counts. Over (1) when nobody stands, or one does in a room of two or
;; more (the winner, AH_WINNER); at the clock, news of how many stood.
(func $ry_tick (result i32)
  (local $n i32) (local $p i32)
  (call $ry_zone)
  (call $ry_burn)
  (call $ry_loot)
  (call $ry_count)
  (local.set $n (i32.load (i32.const @(AO + RY_STAND))))
  (if (i32.eqz (local.get $n))
    (then
      (i32.store (i32.const @(AO + RY_END)) (i32.const 2))
      (call $ry_say (i32.const @RY_MX_END) (i32.const 0) (f32.load (i32.const @(AO + RY_WX))) (f32.load (i32.const @(AO + RY_WZ))))
      (return (i32.const 1))))
  (if (i32.and (i32.eq (local.get $n) (i32.const 1)) (i32.ge_u (i32.load (i32.const @HDR_LIVE)) (i32.const 2)))
    (then
      (block $found
        (!for $p (i32.const 0) (i32.const @NPLAYER)
          (br_if $found (call $a_alive (local.get $p)))))
      (i32.store (i32.const @AH_WINNER) (i32.add (local.get $p) (i32.const 1)))
      (i32.store (i32.const @(AO + RY_END)) (i32.const 1))
      (call $a_news (i32.const @RY_MX_WIN) (local.get $p) (!at u16 @(PLAYERS + A_KILLS) (i32.shl (local.get $p) (i32.const 6))))
      (return (i32.const 1))))
  (if (i32.ge_u (i32.load (i32.const @HDR_TICK)) (i32.load (i32.const @HDR_UNTIL)))
    (then
      (i32.store (i32.const @(AO + RY_END)) (i32.const 3))
      (call $ry_say (i32.const @RY_MX_END) (local.get $n) (f32.load (i32.const @(AO + RY_WX))) (f32.load (i32.const @(AO + RY_WZ))))))
  (i32.const 0))

;; q died (at a's hand, or the zone's, or its own): out for the match, when
;; counted (MR_OUT), its best gun dropped as a crate where it fell (not off
;; the map), news with how many still stand.
(func $ry_kill (param $q i32) (param $a i32) (param $cause i32)
  (local $qb i32) (local $t i32) (local $p i32) (local $n i32)
  (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
  (!put u16 @(PLAYERS + A_RESPAWN) (local.get $qb) (i32.const 0xffff))
  (local.set $t (i32.add (call $a_played) (i32.const 1)))
  (i32.store16 offset=@(MODE_REC + RY_MR_OUT) (i32.shl (local.get $q) (i32.const 3))
               (select (local.get $t) (i32.const 0xffff) (i32.lt_u (local.get $t) (i32.const 0xffff))))
  (if (i32.ne (local.get $cause) (i32.const @KILL_FALL)) (then (call $ry_drop (local.get $q))))
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (if (call $a_alive (local.get $p)) (then (!inc $n))))
  (call $a_news (i32.const @RY_MX_OUT) (local.get $q) (local.get $n)))

;; No spawn point is barred.
(func $ry_bar (param $x f32) (param $y f32) (param $z f32) (result i32)
  (i32.const 0))

;; Slot p comes in with RY_GUN in both hands, a magazine and RY_RES each, no
;; frags. Before play (a new match's countdown, or a join that starts one)
;; it is put at its place in the spread, by its rank among those in the
;; room; a join in play before the first close comes in at random inside the
;; next circle; one after it is out, watching.
(func $ry_spawn (param $p i32)
  (local $pb i32) (local $q i32) (local $r i32) (local $n i32) (local $c i32) (local $s f32) (local $co f32) (local $d f32)
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (call $a_arm (local.get $p) (i32.const @RY_GUN) (i32.const @RY_GUN))
  (!put u16 @(PLAYERS + A_RES) (local.get $pb) (i32.const @RY_RES))
  (!put u16 @(PLAYERS + A_RES + 2) (local.get $pb) (i32.const @RY_RES))
  (!put u8 @(PLAYERS + A_GRENS) (local.get $pb) (i32.const 0))
  (if (i32.ne (i32.load (i32.const @HDR_STATE)) (i32.const @H_PLAY))
    (then
      (!for $q (i32.const 0) (i32.const @NPLAYER)
        (if (i32.and (!at u8 @(PLAYERS + P_FL) (i32.shl (local.get $q) (i32.const 6))) (i32.const @PF_LIVE))
          (then
            (!inc $n)
            (if (i32.lt_u (local.get $q) (local.get $p)) (then (!inc $r))))))
      (call $ry_spread_one (local.get $p) (local.get $r) (local.get $n))
      (return)))
  (if (i32.ge_u (call $a_played) (call $ry_at (i32.const 0)))
    (then
      (!put u8 @(PLAYERS + P_FL) (local.get $pb) (i32.or (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @PF_DEAD)))
      (!put u16 @(PLAYERS + A_RESPAWN) (local.get $pb) (i32.const 0xffff))
      (!put u8 @(PLAYERS + A_HP) (local.get $pb) (i32.const 0))
      (!put u8 @(PLAYERS + A_SH) (local.get $pb) (i32.const 0))
      (call $a_news (i32.const @RY_MX_LATE) (local.get $p) (local.get $p))
      (return)))
  (local.set $c (i32.add (i32.const @(AO + RY_C + 16)) (i32.shl (i32.load (i32.const @(AO + RY_STAGE))) (i32.const 4))))
  (call $sincos (i32.and (call $rand) (i32.const 16383)))
  (local.set $co) (local.set $s)
  (local.set $d (f32.mul (f32.mul (f32.load offset=8 (local.get $c)) (f32.const 0.8))
                         (f32.sqrt (f32.mul (f32.convert_i32_u (i32.and (call $rand) (i32.const 0xffff))) (f32.const 0.0000152587890625)))))
  (call $ry_put (local.get $p) (!madd (local.get $co) (local.get $d) (f32.load (local.get $c))) (!madd (local.get $s) (local.get $d) (f32.load offset=4 (local.get $c)))))

;; How slot p places, higher better (unsigned): standing above everyone, then
;; the tick it went out (later better; 0 out from the start), then kills.
(func $ry_key (param $p i32) (result i32)
  (local $k i32)
  (local.set $k (!at u16 @(PLAYERS + A_KILLS) (i32.shl (local.get $p) (i32.const 6))))
  (local.set $k (select (local.get $k) (i32.const 0x7fff) (i32.lt_u (local.get $k) (i32.const 0x7fff))))
  (if (call $a_alive (local.get $p)) (then (return (i32.or (i32.const 0x80000000) (local.get $k)))))
  (i32.or (i32.shl (i32.load16_u offset=@(MODE_REC + RY_MR_OUT) (i32.shl (local.get $p) (i32.const 3))) (i32.const 15)) (local.get $k)))

;; Standing and out, into AO.
(func $ry_count
  (local $p i32) (local $fl i32) (local $s i32) (local $o i32)
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (local.set $fl (i32.and (!at u8 @(PLAYERS + P_FL) (i32.shl (local.get $p) (i32.const 6))) (i32.const @(PF_LIVE | PF_DEAD))))
    (if (i32.eq (local.get $fl) (i32.const @PF_LIVE)) (then (!inc $s)))
    (if (i32.eq (local.get $fl) (i32.const @(PF_LIVE | PF_DEAD))) (then (!inc $o))))
  (i32.store (i32.const @(AO + RY_STAND)) (local.get $s))
  (i32.store (i32.const @(AO + RY_OUT)) (local.get $o)))

;; ---- the zone

;; The circles, as play starts: circle 0 round the bounds (their middle, half
;; their diagonal and RY_EDGE, so a corner is inside); each next RY_SIZE[k] of circle 0's radius, its middle
;; drawn by $rand (a way, and a share of how far it may be from the last's
;; and still lie wholly inside it), then pulled into the bounds by its
;; radius (no further than they are wide), which keeps it inside the last.
(func $ry_circles
  (local $x0 f32) (local $x1 f32) (local $z0 f32) (local $z1 f32) (local $hx f32) (local $hz f32) (local $r0 f32)
  (local $k i32) (local $a i32) (local $r f32) (local $d f32) (local $s f32) (local $c f32) (local $x f32) (local $z f32) (local $m f32)
  (local.set $x0 (f32.load (i32.const @MAP_BOUNDS)))
  (local.set $x1 (f32.load (i32.const @(MAP_BOUNDS + 4))))
  (local.set $z0 (f32.load (i32.const @(MAP_BOUNDS + 8))))
  (local.set $z1 (f32.load (i32.const @(MAP_BOUNDS + 12))))
  (local.set $hx (f32.mul (f32.sub (local.get $x1) (local.get $x0)) (f32.const 0.5)))
  (local.set $hz (f32.mul (f32.sub (local.get $z1) (local.get $z0)) (f32.const 0.5)))
  (local.set $r0 (f32.add (f32.sqrt (!madd (local.get $hx) (local.get $hx) (f32.mul (local.get $hz) (local.get $hz)))) (f32.const @RY_EDGE)))
  (local.set $a (i32.const @(AO + RY_C)))
  (f32.store (local.get $a) (f32.add (local.get $x0) (local.get $hx)))
  (f32.store offset=4 (local.get $a) (f32.add (local.get $z0) (local.get $hz)))
  (f32.store offset=8 (local.get $a) (local.get $r0))
  (!for $k (i32.const 1) (i32.const @(RY_STAGES + 1))
    (local.set $r (f32.mul (local.get $r0) (f32.mul (f32.convert_i32_u (!tab RY_SIZE (local.get $k))) (f32.const 0.0009765625))))
    (local.set $d (f32.mul (f32.sub (f32.load offset=8 (local.get $a)) (local.get $r))
                           (f32.mul (f32.convert_i32_u (i32.and (call $rand) (i32.const 0xffff))) (f32.const 0.0000152587890625))))
    (call $sincos (i32.and (call $rand) (i32.const 16383)))
    (local.set $c) (local.set $s)
    (local.set $x (!madd (local.get $c) (local.get $d) (f32.load (local.get $a))))
    (local.set $z (!madd (local.get $s) (local.get $d) (f32.load offset=4 (local.get $a))))
    (local.set $m (f32.min (local.get $r) (local.get $hx)))
    (local.set $x (f32.max (f32.add (local.get $x0) (local.get $m)) (f32.min (f32.sub (local.get $x1) (local.get $m)) (local.get $x))))
    (local.set $m (f32.min (local.get $r) (local.get $hz)))
    (local.set $z (f32.max (f32.add (local.get $z0) (local.get $m)) (f32.min (f32.sub (local.get $z1) (local.get $m)) (local.get $z))))
    (local.set $a (i32.add (local.get $a) (i32.const 16)))
    (f32.store (local.get $a) (local.get $x))
    (f32.store offset=4 (local.get $a) (local.get $z))
    (f32.store offset=8 (local.get $a) (local.get $r))))

;; The tick of play RY_SCHED[i] comes at, on this match's clock (no longer
;; than the mode's own: a shorter one, Fireplace's, brings each close in by as much).
(func $ry_at (param $i i32) (result i32)
  (local $len i32)
  (local.set $len (i32.sub (i32.load (i32.const @HDR_UNTIL)) (i32.load (i32.const @HDR_START))))
  (if (i32.gt_u (local.get $len) (i32.const @(MODE_TICKS[M_ROYALE]))) (then (local.set $len (i32.const @(MODE_TICKS[M_ROYALE])))))
  (i32.wrap_i64 (i64.div_u (i64.mul (i64.extend_i32_u (!tab RY_SCHED (local.get $i))) (i64.extend_i32_u (local.get $len)))
                           (i64.const @(MODE_TICKS[M_ROYALE])))))

;; The wall this tick: k the closes done; before close k starts, circle k;
;; while it runs, circle k moving to circle k + 1 by the share of it done;
;; all done, the last circle. Its damage RY_DMG[k] (RY_DMG_END all done).
;; News: a circle shown as the stage moves on, a warning RY_WARN before a
;; close, the close as it starts.
(func $ry_zone
  (local $t i32) (local $k i32) (local $s i32) (local $e i32) (local $a i32) (local $closing i32) (local $f f32)
  (local $x f32) (local $z f32) (local $r f32) (local $hit i32)
  (local.set $t (call $a_played))
  (block $done
    (loop $next
      (br_if $done (i32.ge_u (local.get $k) (i32.const @RY_STAGES)))
      (br_if $done (i32.lt_u (local.get $t) (call $ry_at (i32.add (i32.shl (local.get $k) (i32.const 1)) (i32.const 1)))))
      (!inc $k)
      (br $next)))
  (local.set $a (i32.add (i32.const @(AO + RY_C)) (i32.shl (local.get $k) (i32.const 4))))
  (local.set $x (f32.load (local.get $a)))
  (local.set $z (f32.load offset=4 (local.get $a)))
  (local.set $r (f32.load offset=8 (local.get $a)))
  (local.set $hit (i32.const @RY_DMG_END))
  (if (i32.lt_u (local.get $k) (i32.const @RY_STAGES))
    (then
      (local.set $hit (!tab RY_DMG (local.get $k)))
      (local.set $s (call $ry_at (i32.shl (local.get $k) (i32.const 1))))
      (local.set $e (call $ry_at (i32.add (i32.shl (local.get $k) (i32.const 1)) (i32.const 1))))
      (local.set $closing (i32.ge_u (local.get $t) (local.get $s)))
      (if (local.get $closing)
        (then
          (local.set $f (f32.div (f32.convert_i32_u (i32.sub (local.get $t) (local.get $s)))
                                 (f32.convert_i32_u (select (i32.sub (local.get $e) (local.get $s)) (i32.const 1) (i32.gt_u (local.get $e) (local.get $s))))))
          (local.set $x (!madd (local.get $f) (f32.sub (f32.load offset=16 (local.get $a)) (local.get $x)) (local.get $x)))
          (local.set $z (!madd (local.get $f) (f32.sub (f32.load offset=20 (local.get $a)) (local.get $z)) (local.get $z)))
          (local.set $r (!madd (local.get $f) (f32.sub (f32.load offset=24 (local.get $a)) (local.get $r)) (local.get $r)))))
      (if (i32.eq (i32.add (local.get $t) (i32.const @RY_WARN)) (local.get $s))
        (then (call $ry_say (i32.const @RY_MX_WARN) (i32.add (local.get $k) (i32.const 1)) (f32.load offset=16 (local.get $a)) (f32.load offset=20 (local.get $a)))))
      (if (i32.and (local.get $closing) (i32.eqz (i32.load (i32.const @(AO + RY_CLOSING)))))
        (then (call $ry_say (i32.const @RY_MX_CLOSE) (i32.add (local.get $k) (i32.const 1)) (f32.load offset=16 (local.get $a)) (f32.load offset=20 (local.get $a)))))
      (if (i32.gt_u (local.get $k) (i32.load (i32.const @(AO + RY_STAGE))))
        (then (call $ry_say (i32.const @RY_MX_SHOW) (i32.add (local.get $k) (i32.const 1)) (f32.load offset=16 (local.get $a)) (f32.load offset=20 (local.get $a)))))))
  (i32.store (i32.const @(AO + RY_STAGE)) (local.get $k))
  (i32.store (i32.const @(AO + RY_CLOSING)) (local.get $closing))
  (f32.store (i32.const @(AO + RY_WX)) (local.get $x))
  (f32.store (i32.const @(AO + RY_WZ)) (local.get $z))
  (f32.store (i32.const @(AO + RY_WR)) (local.get $r))
  (i32.store (i32.const @(AO + RY_HIT)) (local.get $hit)))

;; Once a second of play (RY_EVERY), everyone standing outside the wall (or
;; on it) hurt by its damage, in slot order.
(func $ry_burn
  (local $t i32) (local $p i32) (local $pb i32) (local $dx f32) (local $dz f32) (local $r f32)
  (local.set $t (call $a_played))
  (if (i32.or (i32.eqz (local.get $t)) (i32.ne (i32.rem_u (local.get $t) (i32.const @RY_EVERY)) (i32.const 0))) (then (return)))
  (local.set $r (f32.load (i32.const @(AO + RY_WR))))
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (if (call $a_alive (local.get $p))
      (then
        (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
        (local.set $dx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (f32.load (i32.const @(AO + RY_WX)))))
        (local.set $dz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $pb)) (f32.load (i32.const @(AO + RY_WZ)))))
        (if (i32.eqz (f32.lt (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))) (f32.mul (local.get $r) (local.get $r))))
          (then (call $ry_hurt (local.get $p) (i32.load (i32.const @(AO + RY_HIT))))))))))

;; The zone's hit of n on slot q: its shields first, then its health, the
;; shields' wait started over, counted (RY_MR_BURN); through the health, it is
;; out, nobody's kill (the core takes one off a death by its own hand: given
;; back first).
(func $ry_hurt (param $q i32) (param $n i32)
  (local $qb i32) (local $sh i32) (local $hp i32) (local $r i32) (local $b i32)
  (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
  (local.set $r (i32.shl (local.get $q) (i32.const 3)))
  (local.set $b (i32.add (i32.load16_u offset=@(MODE_REC + RY_MR_BURN) (local.get $r)) (local.get $n)))
  (i32.store16 offset=@(MODE_REC + RY_MR_BURN) (local.get $r) (select (local.get $b) (i32.const 0xffff) (i32.lt_u (local.get $b) (i32.const 0xffff))))
  (local.set $sh (!at u8 @(PLAYERS + A_SH) (local.get $qb)))
  (local.set $hp (!at u8 @(PLAYERS + A_HP) (local.get $qb)))
  (!put u16 @(PLAYERS + A_SHT) (local.get $qb) (i32.const @SHIELD_DELAY))
  (call $fx (i32.const 0) (i32.const @FX_HIT) (i32.const 255) (local.get $q)
            (!at f32 @(PLAYERS + P_PX) (local.get $qb)) (f32.add (!at f32 @(PLAYERS + P_PY) (local.get $qb)) (f32.const 1.2)) (!at f32 @(PLAYERS + P_PZ) (local.get $qb))
            (select (f32.const 1) (f32.const 2) (i32.le_u (local.get $n) (local.get $sh))))
  (if (i32.le_u (local.get $n) (local.get $sh))
    (then (!put u8 @(PLAYERS + A_SH) (local.get $qb) (i32.sub (local.get $sh) (local.get $n))) (return)))
  (local.set $n (i32.sub (local.get $n) (local.get $sh)))
  (!put u8 @(PLAYERS + A_SH) (local.get $qb) (i32.const 0))
  (if (i32.lt_u (local.get $n) (local.get $hp))
    (then (!put u8 @(PLAYERS + A_HP) (local.get $qb) (i32.sub (local.get $hp) (local.get $n))) (return)))
  (!put u16 @(PLAYERS + A_KILLS) (local.get $qb) (i32.add (!at u16 @(PLAYERS + A_KILLS) (local.get $qb)) (i32.const 1)))
  (i32.store (i32.const @(AO + RY_ZONED)) (i32.add (i32.load (i32.const @(AO + RY_ZONED))) (i32.const 1)))
  (call $a_kill (local.get $q) (local.get $q) (i32.const @RY_KILL_ZONE)))

;; News with nobody's name (owner 255) on the ground at (x, z).
(func $ry_say (param $what i32) (param $shot i32) (param $x f32) (param $z f32)
  (call $fx (i32.const 0) (i32.const @FX_MODE) (i32.const 255) (local.get $shot)
            (local.get $x) (call $stand (local.get $x) (local.get $z) (f32.const -1000)) (local.get $z) (f32.convert_i32_u (local.get $what))))

;; ---- where fighters and crates go

;; Everyone in the room at its place in the spread, in slot order.
(func $ry_spread
  (local $p i32) (local $r i32) (local $n i32)
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (if (i32.and (!at u8 @(PLAYERS + P_FL) (i32.shl (local.get $p) (i32.const 6))) (i32.const @PF_LIVE)) (then (!inc $n))))
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (if (i32.and (!at u8 @(PLAYERS + P_FL) (i32.shl (local.get $p) (i32.const 6))) (i32.const @PF_LIVE))
      (then
        (call $ry_spread_one (local.get $p) (local.get $r) (local.get $n))
        (!inc $r)))))

;; Slot p put down as the r-th of n over the map: a sunflower's spiral (the
;; golden angle a step, radius as the root of the share) over the ellipse
;; RY_EDGE inside the bounds, turned by a hash of the room's seed and match.
(func $ry_spread_one (param $p i32) (param $r i32) (param $n i32)
  (local $x0 f32) (local $z0 f32) (local $hx f32) (local $hz f32) (local $s f32) (local $c f32) (local $f f32)
  (local.set $x0 (f32.load (i32.const @MAP_BOUNDS)))
  (local.set $z0 (f32.load (i32.const @(MAP_BOUNDS + 8))))
  (local.set $hx (f32.mul (f32.sub (f32.load (i32.const @(MAP_BOUNDS + 4))) (local.get $x0)) (f32.const 0.5)))
  (local.set $hz (f32.mul (f32.sub (f32.load (i32.const @(MAP_BOUNDS + 12))) (local.get $z0)) (f32.const 0.5)))
  (local.set $x0 (f32.add (local.get $x0) (local.get $hx)))
  (local.set $z0 (f32.add (local.get $z0) (local.get $hz)))
  (local.set $hx (f32.max (f32.const 0) (f32.sub (local.get $hx) (f32.const @RY_EDGE))))
  (local.set $hz (f32.max (f32.const 0) (f32.sub (local.get $hz) (f32.const @RY_EDGE))))
  (call $sincos (i32.and (i32.add (call $hash32 (i32.load (i32.const @HDR_SEED)) (i32.load (i32.const @HDR_HOLE)) (i32.const 0x52ff))
                                  (i32.mul (local.get $r) (i32.const 6258)))
                         (i32.const 16383)))
  (local.set $c) (local.set $s)
  (local.set $f (f32.sqrt (f32.div (f32.add (f32.convert_i32_u (local.get $r)) (f32.const 0.5))
                                   (f32.convert_i32_u (select (local.get $n) (i32.const 1) (local.get $n))))))
  (call $ry_put (local.get $p) (!madd (f32.mul (local.get $c) (local.get $f)) (local.get $hx) (local.get $x0))
                               (!madd (f32.mul (local.get $s) (local.get $f)) (local.get $hz) (local.get $z0))))

;; Slot p put down at (x, z) or the nearest clear spot round it ($ry_find),
;; still, on the ground; where it was if none is.
(func $ry_put (param $p i32) (param $x f32) (param $z f32)
  (local $pb i32) (local $y f32) (local $ok i32)
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (call $ry_find (local.get $x) (local.get $z))
  (local.set $ok) (local.set $z) (local.set $y) (local.set $x)
  (if (i32.eqz (local.get $ok)) (then (return)))
  (!put f32 @(PLAYERS + P_PX) (local.get $pb) (local.get $x))
  (!put f32 @(PLAYERS + P_PY) (local.get $pb) (local.get $y))
  (!put f32 @(PLAYERS + P_PZ) (local.get $pb) (local.get $z))
  (!put f32 @(PLAYERS + P_VX) (local.get $pb) (f32.const 0))
  (!put f32 @(PLAYERS + P_VY) (local.get $pb) (f32.const 0))
  (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (f32.const 0))
  (!put u8 @(PLAYERS + P_FL) (local.get $pb) (i32.or (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @PF_GROUND))))

;; The clear spot nearest (x, z), kept RY_EDGE inside the bounds: the point
;; itself, else the first clear of eight round it RY_NUDGE off, then of eight
;; twice as far: x, y (its feet), z and 1, or 0 for none.
(func $ry_find (param $x f32) (param $z f32) (result f32 f32 f32 i32)
  (local $ring i32) (local $k i32) (local $s f32) (local $c f32) (local $qx f32) (local $qz f32) (local $y f32) (local $ok i32)
  (!for $ring (i32.const 0) (i32.const 3)
    (!for $k (i32.const 0) (select (i32.const 8) (i32.const 1) (local.get $ring))
      (call $sincos (i32.shl (local.get $k) (i32.const 11)))
      (local.set $c) (local.set $s)
      (local.set $qx (call $ry_inx (!madd (local.get $c) (f32.mul (f32.convert_i32_u (local.get $ring)) (f32.const @RY_NUDGE)) (local.get $x))))
      (local.set $qz (call $ry_inz (!madd (local.get $s) (f32.mul (f32.convert_i32_u (local.get $ring)) (f32.const @RY_NUDGE)) (local.get $z))))
      (call $ry_spot (local.get $qx) (local.get $qz))
      (local.set $ok) (local.set $y)
      (if (local.get $ok) (then (return (local.get $qx) (local.get $y) (local.get $qz) (i32.const 1))))))
  (local.get $x) (f32.const 0) (local.get $z) (i32.const 0))

;; x and z kept RY_EDGE inside the bounds.
(func $ry_inx (param $x f32) (result f32)
  (f32.max (f32.add (f32.load (i32.const @MAP_BOUNDS)) (f32.const @RY_EDGE))
           (f32.min (f32.sub (f32.load (i32.const @(MAP_BOUNDS + 4))) (f32.const @RY_EDGE)) (local.get $x))))
(func $ry_inz (param $z f32) (result f32)
  (f32.max (f32.add (f32.load (i32.const @(MAP_BOUNDS + 8))) (f32.const @RY_EDGE))
           (f32.min (f32.sub (f32.load (i32.const @(MAP_BOUNDS + 12))) (f32.const @RY_EDGE)) (local.get $z))))

;; Where feet at (x, z) stand on the ground or a floor or step on it (no
;; higher than RY_UP over it), and 1 if a body fits there: no box in it, and
;; not below the map's void.
(func $ry_spot (param $x f32) (param $z f32) (result f32 i32)
  (local $y f32) (local $t i32) (local $v f32)
  (call $ground (local.get $x) (local.get $z))
  (drop) (drop) (drop) (drop)
  (local.set $y)
  (local.set $y (call $stand (local.get $x) (local.get $z) (f32.add (local.get $y) (f32.const @RY_UP))))
  (local.set $v (f32.load (i32.const @MAP_VOID)))
  (if (i32.and (f32.ne (local.get $v) (f32.const 0)) (f32.lt (local.get $y) (f32.add (local.get $v) (f32.const 1))))
    (then (return (local.get $y) (i32.const 0))))
  (local.set $t (i32.load (i32.const @HDR_TICK)))
  (if (i32.or (i32.ne (call $box_in (local.get $x) (f32.add (local.get $y) (f32.const 0.55)) (local.get $z) (f32.const 0.5) (local.get $t)) (i32.const 0))
              (i32.ne (call $box_in (local.get $x) (f32.add (local.get $y) (f32.const 1.3)) (local.get $z) (f32.const 0.5) (local.get $t)) (i32.const 0)))
    (then (return (local.get $y) (i32.const 0))))
  (local.get $y) (i32.const 1))

;; ---- the crates

;; As play starts: RY_CRATE0 and one more for every RY_CRATE_PER in the room
;; (RY_MAX at most): one on each of the map's spots (the flags' stands, the
;; skull's spot, the hills, on what is under them), then at clear spots
;; drawn at random over the bounds, RY_TRIES tries a crate.
(func $ry_crates
  (local $want i32) (local $i i32) (local $a i32) (local $x f32) (local $z f32) (local $y f32) (local $ok i32)
  (local $x0 f32) (local $z0 f32) (local $w f32) (local $d f32)
  (local.set $want (i32.add (i32.const @RY_CRATE0) (i32.div_u (i32.load (i32.const @HDR_LIVE)) (i32.const @RY_CRATE_PER))))
  (if (i32.gt_u (local.get $want) (i32.const @RY_MAX)) (then (local.set $want (i32.const @RY_MAX))))
  (!for $i (i32.const 0) (i32.const 3)
    (local.set $a (i32.add (i32.const @MAP_FLAGS) (i32.shl (local.get $i) (i32.const 4))))
    (call $ry_lay (local.get $want) (f32.load (local.get $a))
                  (call $stand (f32.load (local.get $a)) (f32.load offset=4 (local.get $a)) (f32.load offset=8 (local.get $a)))
                  (f32.load offset=4 (local.get $a))))
  (local.set $i (i32.const 0))
  (block $out
    (loop $hill
      (br_if $out (i32.ge_u (local.get $i) (i32.load (i32.const @MAP_NHILL))))
      (br_if $out (i32.ge_u (local.get $i) (i32.const @NHILL)))
      (local.set $a (i32.add (i32.const @MAP_HILLS) (i32.shl (local.get $i) (i32.const 4))))
      (call $ry_lay (local.get $want) (f32.load (local.get $a))
                    (call $stand (f32.load (local.get $a)) (f32.load offset=4 (local.get $a)) (f32.load offset=8 (local.get $a)))
                    (f32.load offset=4 (local.get $a)))
      (!inc $i)
      (br $hill)))
  (local.set $x0 (f32.add (f32.load (i32.const @MAP_BOUNDS)) (f32.const @RY_EDGE)))
  (local.set $z0 (f32.add (f32.load (i32.const @(MAP_BOUNDS + 8))) (f32.const @RY_EDGE)))
  (local.set $w (f32.max (f32.const 0) (f32.sub (f32.sub (f32.load (i32.const @(MAP_BOUNDS + 4))) (f32.const @RY_EDGE)) (local.get $x0))))
  (local.set $d (f32.max (f32.const 0) (f32.sub (f32.sub (f32.load (i32.const @(MAP_BOUNDS + 12))) (f32.const @RY_EDGE)) (local.get $z0))))
  (block $full
    (!for $i (i32.const 0) (i32.mul (local.get $want) (i32.const @RY_TRIES))
      (br_if $full (i32.ge_u (i32.load (i32.const @(AO + RY_N))) (local.get $want)))
      (local.set $x (!madd (f32.convert_i32_u (i32.and (call $rand) (i32.const 0xffff))) (f32.mul (local.get $w) (f32.const 0.0000152587890625)) (local.get $x0)))
      (local.set $z (!madd (f32.convert_i32_u (i32.and (call $rand) (i32.const 0xffff))) (f32.mul (local.get $d) (f32.const 0.0000152587890625)) (local.get $z0)))
      (call $ry_spot (local.get $x) (local.get $z))
      (local.set $ok) (local.set $y)
      (if (local.get $ok) (then (call $ry_lay (local.get $want) (local.get $x) (local.get $y) (local.get $z)))))))

;; A crate at (x, y, z) holding what $rand draws (RY_LOOT by RY_ODDS), unless
;; `want` are laid, one is within RY_APART across and 2 m up or down, or it
;; is below the map's void (a spot over a pit).
(func $ry_lay (param $want i32) (param $x f32) (param $y f32) (param $z f32)
  (local $n i32) (local $j i32) (local $a i32) (local $dx f32) (local $dz f32) (local $r i32) (local $k i32) (local $v f32)
  (local.set $n (i32.load (i32.const @(AO + RY_N))))
  (if (i32.ge_u (local.get $n) (local.get $want)) (then (return)))
  (local.set $v (f32.load (i32.const @MAP_VOID)))
  (if (i32.and (f32.ne (local.get $v) (f32.const 0)) (f32.lt (local.get $y) (f32.add (local.get $v) (f32.const 1)))) (then (return)))
  (!for $j (i32.const 0) (local.get $n)
    (local.set $a (i32.add (i32.const @(AO + RY_CRATES)) (i32.shl (local.get $j) (i32.const 4))))
    (local.set $dx (f32.sub (f32.load (local.get $a)) (local.get $x)))
    (local.set $dz (f32.sub (f32.load offset=8 (local.get $a)) (local.get $z)))
    (if (i32.and (f32.lt (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))) (f32.const @(RY_APART * RY_APART)))
                 (f32.lt (f32.abs (f32.sub (f32.load offset=4 (local.get $a)) (local.get $y))) (f32.const 2)))
      (then (return))))
  (local.set $r (i32.rem_u (call $rand) (i32.const @RY_ODDS_SUM)))
  (block $found
    (loop $walk
      (local.set $r (i32.sub (local.get $r) (!tab RY_ODDS (local.get $k))))
      (br_if $found (i32.lt_s (local.get $r) (i32.const 0)))
      (!inc $k)
      (br $walk)))
  (call $ry_crate (local.get $n) (local.get $x) (local.get $y) (local.get $z) (!tab RY_LOOT (local.get $k)))
  (i32.store (i32.const @(AO + RY_N)) (i32.add (local.get $n) (i32.const 1))))

;; Crate j: at (x, y, z), holding `what`, shut.
(func $ry_crate (param $j i32) (param $x f32) (param $y f32) (param $z f32) (param $what i32)
  (local $a i32)
  (local.set $a (i32.add (i32.const @(AO + RY_CRATES)) (i32.shl (local.get $j) (i32.const 4))))
  (f32.store (local.get $a) (local.get $x))
  (f32.store offset=4 (local.get $a) (local.get $y))
  (f32.store offset=8 (local.get $a) (local.get $z))
  (i32.store (i32.add (local.get $a) (i32.const 12)) (local.get $what)))

;; Slot q out: the gun in its hands (or the other, if that is the starter)
;; dropped where it fell, in the first crate opened (or one past them).
(func $ry_drop (param $q i32)
  (local $qb i32) (local $hand i32) (local $w i32) (local $j i32) (local $n i32)
  (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
  (local.set $hand (i32.and (i32.shr_u (!at u8 @(PLAYERS + A_ACT) (local.get $qb)) (i32.const 2)) (i32.const 1)))
  (local.set $w (i32.load8_u offset=@(PLAYERS + A_GUN) (i32.add (local.get $qb) (local.get $hand))))
  (if (i32.or (i32.eq (local.get $w) (i32.const @RY_GUN)) (i32.eqz (local.get $w)))
    (then (local.set $w (i32.load8_u offset=@(PLAYERS + A_GUN) (i32.add (local.get $qb) (i32.xor (local.get $hand) (i32.const 1)))))))
  (if (i32.or (i32.or (i32.eq (local.get $w) (i32.const @RY_GUN)) (i32.eqz (local.get $w))) (i32.ge_u (local.get $w) (i32.const @(ARMS.length))))
    (then (return)))
  (local.set $n (i32.load (i32.const @(AO + RY_N))))
  (block $found
    (!for $j (i32.const 0) (local.get $n)
      (br_if $found (i32.load8_u offset=@(AO + RY_CRATES + 13) (i32.shl (local.get $j) (i32.const 4)))))
    (if (i32.ge_u (local.get $n) (i32.const @RY_MAX)) (then (return)))
    (i32.store (i32.const @(AO + RY_N)) (i32.add (local.get $n) (i32.const 1))))
  (call $ry_crate (local.get $j) (!at f32 @(PLAYERS + P_PX) (local.get $qb))
                  (call $stand (!at f32 @(PLAYERS + P_PX) (local.get $qb)) (!at f32 @(PLAYERS + P_PZ) (local.get $qb)) (f32.add (!at f32 @(PLAYERS + P_PY) (local.get $qb)) (f32.const 0.5)))
                  (!at f32 @(PLAYERS + P_PZ) (local.get $qb)) (local.get $w)))

;; Every standing fighter, in slot order, opens each shut crate its feet are
;; within RY_TAKE across and RY_TAKE_H up or down of, in crate order, if
;; what it holds is of use to it ($ry_use): counted (MR_AUX), news.
(func $ry_loot
  (local $n i32) (local $p i32) (local $pb i32) (local $j i32) (local $a i32) (local $r i32)
  (local $px f32) (local $py f32) (local $pz f32) (local $dx f32) (local $dz f32)
  (local.set $n (i32.load (i32.const @(AO + RY_N))))
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (if (call $a_alive (local.get $p))
      (then
        (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
        (local.set $px (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
        (local.set $py (!at f32 @(PLAYERS + P_PY) (local.get $pb)))
        (local.set $pz (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
        (!for $j (i32.const 0) (local.get $n)
          (local.set $a (i32.add (i32.const @(AO + RY_CRATES)) (i32.shl (local.get $j) (i32.const 4))))
          (local.set $dx (f32.sub (f32.load (local.get $a)) (local.get $px)))
          (local.set $dz (f32.sub (f32.load offset=8 (local.get $a)) (local.get $pz)))
          (if (i32.and (i32.and (i32.eqz (i32.load8_u offset=13 (local.get $a)))
                                (f32.lt (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))) (f32.const @(RY_TAKE * RY_TAKE))))
                       (f32.lt (f32.abs (f32.sub (f32.load offset=4 (local.get $a)) (local.get $py))) (f32.const @RY_TAKE_H)))
            (then
              (if (call $ry_use (local.get $p) (i32.load8_u offset=12 (local.get $a)))
                (then
                  (i32.store8 offset=13 (local.get $a) (i32.const 1))
                  (local.set $r (i32.add (i32.const @MODE_REC) (i32.shl (local.get $p) (i32.const 3))))
                  (if (i32.lt_u (i32.load16_u offset=@MR_AUX (local.get $r)) (i32.const 0xffff))
                    (then (i32.store16 offset=@MR_AUX (local.get $r) (i32.add (i32.load16_u offset=@MR_AUX (local.get $r)) (i32.const 1)))))
                  (i32.store (i32.const @(AO + RY_OPENED)) (i32.add (i32.load (i32.const @(AO + RY_OPENED))) (i32.const 1)))
                  (call $fx (i32.const 0) (i32.const @FX_MODE) (local.get $p) (i32.load8_u offset=12 (local.get $a))
                            (f32.load (local.get $a)) (f32.load offset=4 (local.get $a)) (f32.load offset=8 (local.get $a)) (f32.const @RY_MX_LOOT)))))))))))

;; What a crate holding `what` does for slot p, and 1 if it took it: a gun it
;; carries, ammo, if that hand lacks any; a gun it doesn't, in place of the
;; starter while a hand holds it ($lk_gun: in the hand held, or the other);
;; the overshield while the shields are under it; health while either is
;; under 100; frags while under 4.
(func $ry_use (param $p i32) (param $what i32) (result i32)
  (local $pb i32) (local $s i32) (local $g i32)
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (if (i32.lt_u (local.get $what) (i32.const @RY_R_OVER))
    (then
      (!for $s (i32.const 0) (i32.const 2)
        (if (i32.eq (i32.load8_u offset=@(PLAYERS + A_GUN) (i32.add (local.get $pb) (local.get $s))) (local.get $what))
          (then
            (if (i32.or (i32.lt_u (i32.load8_u offset=@(PLAYERS + A_MAG) (i32.add (local.get $pb) (local.get $s))) (!arm mag (local.get $what)))
                        (i32.lt_u (i32.load16_u offset=@(PLAYERS + A_RES) (i32.add (local.get $pb) (i32.shl (local.get $s) (i32.const 1)))) (!arm res (local.get $what))))
              (then (call $lk_gun (local.get $p) (local.get $what)) (return (i32.const 1))))
            (local.set $g (i32.const 1)))))
      (if (local.get $g) (then (return (i32.const 0))))
      (if (i32.or (i32.eq (!at u8 @(PLAYERS + A_GUN) (local.get $pb)) (i32.const @RY_GUN))
                  (i32.eq (!at u8 @(PLAYERS + A_GUN + 1) (local.get $pb)) (i32.const @RY_GUN)))
        (then (call $lk_gun (local.get $p) (local.get $what)) (return (i32.const 1))))
      (return (i32.const 0))))
  (if (i32.eq (local.get $what) (i32.const @RY_R_OVER))
    (then
      (if (i32.ge_u (!at u8 @(PLAYERS + A_SH) (local.get $pb)) (i32.const @OVERSHIELD)) (then (return (i32.const 0))))
      (!put u8 @(PLAYERS + A_SH) (local.get $pb) (i32.const @OVERSHIELD))
      (!put u8 @(PLAYERS + A_HP) (local.get $pb) (i32.const 100))
      (!put u16 @(PLAYERS + A_SHT) (local.get $pb) (i32.const 0))
      (return (i32.const 1))))
  (if (i32.eq (local.get $what) (i32.const @RY_R_HEAL))
    (then
      (if (i32.and (i32.ge_u (!at u8 @(PLAYERS + A_HP) (local.get $pb)) (i32.const 100)) (i32.ge_u (!at u8 @(PLAYERS + A_SH) (local.get $pb)) (i32.const 100)))
        (then (return (i32.const 0))))
      (!put u8 @(PLAYERS + A_HP) (local.get $pb) (i32.const 100))
      (if (i32.lt_u (!at u8 @(PLAYERS + A_SH) (local.get $pb)) (i32.const 100)) (then (!put u8 @(PLAYERS + A_SH) (local.get $pb) (i32.const 100))))
      (!put u16 @(PLAYERS + A_SHT) (local.get $pb) (i32.const 0))
      (return (i32.const 1))))
  (if (i32.eq (local.get $what) (i32.const @RY_R_FRAGS))
    (then
      (if (i32.ge_u (!at u8 @(PLAYERS + A_GRENS) (local.get $pb)) (i32.const 4)) (then (return (i32.const 0))))
      (!put u8 @(PLAYERS + A_GRENS) (local.get $pb)
        (select (i32.const 4) (i32.add (!at u8 @(PLAYERS + A_GRENS) (local.get $pb)) (i32.const @RY_FRAGS))
                (i32.gt_u (i32.add (!at u8 @(PLAYERS + A_GRENS) (local.get $pb)) (i32.const @RY_FRAGS)) (i32.const 4))))
      (return (i32.const 1))))
  (i32.const 0))
