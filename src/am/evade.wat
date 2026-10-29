;; EVADE (M_EVADE, prefix ed; constants and AO's fields in src/am/evade.mjs):
;; no sides, everyone against the chasers. A chaser is a record in AO, moved
;; here, serially, in index order, after every fighter's own tick: it goes for
;; its nearest standing fighter, steers round what its look ahead finds in the
;; way (a turn off the way that relaxes back as the way clears, a wall
;; followed until it ends), climbs a ledge it can't step onto at ED_CLIMB,
;; glides up and down what it can, slowed by any rise, and wanders a while
;; when it hasn't got nearer for ED_STUCK. Its body is a fighter's to the
;; boxes ($hull_axis, $hull_y); it passes through fighters and other chasers
;; but keeps apart from the latter. Reaching a standing fighter downs it:
;; PF_DOWN in P_FL, which the prediction reads (a crawl, no jump, no guns:
;; src/players.wat, $a_shoot). The downed bleed, the still beside them
;; revive them, and nobody standing ends the match. All of it is the
;; confirmed world's; the prediction moves only its own body.

;; Play begins: the first chasers, as far from everyone as the spawn points go.
(func $ed_start
  (call $ed_count)
  (call $ed_more))

;; A tick of play: each fighter's own count (standing, bleeding, being
;; revived), in slot order; a chaser more when the clock and the crowd call
;; for one; every chaser's move and catches, in index order; the counts. Over
;; (1) when nobody is standing; at the clock, news of who stood.
(func $ed_tick (result i32)
  (local $k i32) (local $was i32) (local $n i32) (local $p i32)
  (call $ed_fighters)
  (call $ed_more)
  (!for $k (i32.const 0) (i32.load (i32.const @(AO + ED_N)))
    (call $ed_chase (local.get $k)))
  (local.set $was (i32.load (i32.const @(AO + ED_STAND))))
  (call $ed_count)
  (local.set $n (i32.load (i32.const @(AO + ED_STAND))))
  (if (i32.and (i32.eq (local.get $n) (i32.const 1)) (i32.gt_u (local.get $was) (i32.const 1)))
    (then
      (block $found
        (!for $p (i32.const 0) (i32.const @NPLAYER)
          (br_if $found (call $ed_up (local.get $p)))))
      (call $ed_news (i32.const @ED_MX_LAST) (local.get $p) (local.get $p) (local.get $p))))
  (if (i32.and (i32.eqz (local.get $n)) (i32.ne (i32.load (i32.const @HDR_LIVE)) (i32.const 0)))
    (then
      (i32.store (i32.const @(AO + ED_END)) (i32.const 2))
      (call $ed_say (i32.const @ED_MX_END) (i32.const 0) (f32.const 512) (f32.const 0) (f32.const 512))
      (return (i32.const 1))))
  (if (i32.ge_u (i32.load (i32.const @HDR_TICK)) (i32.load (i32.const @HDR_UNTIL)))
    (then
      (i32.store (i32.const @(AO + ED_END)) (i32.const 1))
      (call $ed_say (i32.const @ED_MX_END) (local.get $n) (f32.const 512) (f32.const 0) (f32.const 512))))
  (i32.const 0))

;; No kill changes anything: nobody hurts anybody, and a fighter out is
;; never respawned (A_RESPAWN past any match's end).
(func $ed_kill (param $q i32) (param $a i32) (param $cause i32))

;; Everyone comes in with an assault rifle and a magnum, and no frags (nobody to throw them at).
(func $ed_spawn (param $p i32)
  (call $a_arm (local.get $p) (i32.const @W_AR) (i32.const @W_MAGNUM))
  (!put u8 @(PLAYERS + A_GRENS) (i32.shl (local.get $p) (i32.const 6)) (i32.const 0)))

;; A fighter mustn't come in at a spawn point a chaser is within ED_BAR of.
(func $ed_bar (param $x f32) (param $y f32) (param $z f32) (result i32)
  (local $k i32) (local $c i32) (local $dx f32) (local $dz f32)
  (!for $k (i32.const 0) (i32.load (i32.const @(AO + ED_N)))
    (local.set $c (i32.add (i32.const @(AO + ED_CH)) (i32.mul (local.get $k) (i32.const @ED_CSIZE))))
    (local.set $dx (f32.sub (f32.load offset=@ED_C_X (local.get $c)) (local.get $x)))
    (local.set $dz (f32.sub (f32.load offset=@ED_C_Z (local.get $c)) (local.get $z)))
    (if (f32.lt (f32.add (f32.mul (local.get $dx) (local.get $dx)) (f32.mul (local.get $dz) (local.get $dz))) (f32.const @(ED_BAR * ED_BAR)))
      (then (return (i32.const 1)))))
  (i32.const 0))

;; How slot p places: standing at the end above everyone, then its ticks
;; standing, then its revives (higher is better, unsigned).
(func $ed_key (param $p i32) (result i32)
  (local $r i32) (local $n i32) (local $m i32)
  (local.set $r (i32.shl (local.get $p) (i32.const 3)))
  (local.set $n (i32.load16_u offset=@(MODE_REC + MR_AUX) (local.get $r)))
  (local.set $m (i32.load16_u offset=@(MODE_REC + MR_POINTS) (local.get $r)))
  (i32.or (i32.or (select (i32.const 0x80000000) (i32.const 0) (call $ed_up (local.get $p)))
                  (i32.shl (select (local.get $n) (i32.const 0x7fff) (i32.lt_u (local.get $n) (i32.const 0x7fff))) (i32.const 16)))
          (local.get $m)))

;; 1 if slot p is standing: in the room, not out, not down.
(func $ed_up (param $p i32) (result i32)
  (i32.eq (i32.and (!at u8 @(PLAYERS + P_FL) (i32.shl (local.get $p) (i32.const 6))) (i32.const @(PF_LIVE | PF_DEAD | PF_DOWN))) (i32.const @PF_LIVE)))

;; Fighters standing, downed and out, into AO.
(func $ed_count
  (local $p i32) (local $fl i32) (local $s i32) (local $d i32) (local $o i32)
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (local.set $fl (!at u8 @(PLAYERS + P_FL) (i32.shl (local.get $p) (i32.const 6))))
    (if (i32.and (local.get $fl) (i32.const @PF_LIVE))
      (then
        (if (i32.and (local.get $fl) (i32.const @PF_DEAD))
          (then (!inc $o))
          (else
            (if (i32.and (local.get $fl) (i32.const @PF_DOWN))
              (then (!inc $d))
              (else (!inc $s))))))))
  (i32.store (i32.const @(AO + ED_STAND)) (local.get $s))
  (i32.store (i32.const @(AO + ED_DOWNED)) (local.get $d))
  (i32.store (i32.const @(AO + ED_OUT)) (local.get $o)))

;; Each fighter's tick, in slot order. Standing: a tick more of it, and the
;; ticks it can't be caught run down; one with none yet (play just began, or
;; it just came in) can't be caught for ED_SAFE. Downed: $ed_downed.
(func $ed_fighters
  (local $p i32) (local $r i32) (local $fl i32) (local $n i32)
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (local.set $r (i32.shl (local.get $p) (i32.const 3)))
    (local.set $fl (i32.and (!at u8 @(PLAYERS + P_FL) (i32.shl (local.get $p) (i32.const 6))) (i32.const @(PF_LIVE | PF_DEAD | PF_DOWN))))
    (if (i32.eq (local.get $fl) (i32.const @PF_LIVE))
      (then
        (local.set $n (i32.load16_u offset=@(MODE_REC + MR_AUX) (local.get $r)))
        (if (i32.eqz (local.get $n)) (then (i32.store8 offset=@(MODE_REC + ED_MR_SAFE) (local.get $r) (i32.const @ED_SAFE))))
        (if (i32.lt_u (local.get $n) (i32.const 0xffff))
          (then (i32.store16 offset=@(MODE_REC + MR_AUX) (local.get $r) (i32.add (local.get $n) (i32.const 1)))))
        (local.set $n (i32.load8_u offset=@(MODE_REC + ED_MR_SAFE) (local.get $r)))
        (if (local.get $n) (then (i32.store8 offset=@(MODE_REC + ED_MR_SAFE) (local.get $r) (i32.sub (local.get $n) (i32.const 1)))))))
    (if (i32.eq (local.get $fl) (i32.const @(PF_LIVE | PF_DOWN)))
      (then (call $ed_downed (local.get $p))))))

;; 1 if slot q revives slot p this tick: standing, someone else, its feet
;; within ED_REACH across and ED_REACH_H up or down of p's, and still (under
;; ED_STILL across).
(func $ed_helps (param $q i32) (param $p i32) (result i32)
  (local $qb i32) (local $pb i32) (local $vx f32) (local $vz f32)
  (if (i32.or (i32.eq (local.get $q) (local.get $p)) (i32.eqz (call $ed_up (local.get $q)))) (then (return (i32.const 0))))
  (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (local.set $vx (!at f32 @(PLAYERS + P_VX) (local.get $qb)))
  (local.set $vz (!at f32 @(PLAYERS + P_VZ) (local.get $qb)))
  (i32.and (f32.lt (f32.add (f32.mul (local.get $vx) (local.get $vx)) (f32.mul (local.get $vz) (local.get $vz))) (f32.const @(ED_STILL * ED_STILL)))
           (call $a_near (local.get $q) (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (!at f32 @(PLAYERS + P_PY) (local.get $pb)) (!at f32 @(PLAYERS + P_PZ) (local.get $pb))
                         (f32.const @ED_REACH) (f32.const @ED_REACH_H))))

;; Downed slot p's tick: with someone reviving it (the lowest slot that is),
;; a tick more of that and none of its bleeding, up again at ED_REVIVE (the
;; reviver's revive counted, ED_SAFE for p, news); with nobody, the revive's
;; count starts over and it bleeds, out on the tick that runs out (PF_DEAD, a
;; respawn past any match's end, a death counted, news).
(func $ed_downed (param $p i32)
  (local $q i32) (local $by i32) (local $a i32) (local $n i32) (local $r i32) (local $pb i32)
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (local.set $r (i32.shl (local.get $p) (i32.const 3)))
  (local.set $a (i32.add (i32.const @(AO + ED_HELP)) (i32.shl (local.get $p) (i32.const 1))))
  (local.set $by (i32.const -1))
  (block $found
    (!for $q (i32.const 0) (i32.const @NPLAYER)
      (if (call $ed_helps (local.get $q) (local.get $p)) (then (local.set $by (local.get $q)) (br $found)))))
  (if (i32.ge_s (local.get $by) (i32.const 0))
    (then
      (local.set $n (i32.add (i32.load16_u (local.get $a)) (i32.const 1)))
      (if (i32.lt_u (local.get $n) (i32.const @ED_REVIVE)) (then (i32.store16 (local.get $a) (local.get $n)) (return)))
      (i32.store16 (local.get $a) (i32.const 0))
      (!put u8 @(PLAYERS + P_FL) (local.get $pb) (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @(255 ^ PF_DOWN))))
      (i32.store16 offset=@(MODE_REC + ED_MR_BLEED) (local.get $r) (i32.const 0))
      (i32.store8 offset=@(MODE_REC + ED_MR_SAFE) (local.get $r) (i32.const @ED_SAFE))
      (local.set $r (i32.shl (local.get $by) (i32.const 3)))
      (local.set $n (i32.load16_u offset=@(MODE_REC + MR_POINTS) (local.get $r)))
      (if (i32.lt_u (local.get $n) (i32.const 0xffff))
        (then (i32.store16 offset=@(MODE_REC + MR_POINTS) (local.get $r) (i32.add (local.get $n) (i32.const 1)))))
      (i32.store (i32.const @(AO + ED_UPS)) (i32.add (i32.load (i32.const @(AO + ED_UPS))) (i32.const 1)))
      (call $ed_news (i32.const @ED_MX_UP) (local.get $by) (local.get $p) (local.get $p))
      (return)))
  (i32.store16 (local.get $a) (i32.const 0))
  (local.set $n (i32.load16_u offset=@(MODE_REC + ED_MR_BLEED) (local.get $r)))
  (if (i32.gt_u (local.get $n) (i32.const 1))
    (then (i32.store16 offset=@(MODE_REC + ED_MR_BLEED) (local.get $r) (i32.sub (local.get $n) (i32.const 1))) (return)))
  (i32.store16 offset=@(MODE_REC + ED_MR_BLEED) (local.get $r) (i32.const 0))
  (!put u8 @(PLAYERS + P_FL) (local.get $pb) (i32.or (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @(255 ^ PF_DOWN))) (i32.const @PF_DEAD)))
  (!put u16 @(PLAYERS + A_RESPAWN) (local.get $pb) (i32.const 0xffff))
  (!put u16 @(PLAYERS + A_DEATHS) (local.get $pb) (i32.add (!at u16 @(PLAYERS + A_DEATHS) (local.get $pb)) (i32.const 1)))
  (!put f32 @(PLAYERS + P_VX) (local.get $pb) (f32.const 0))
  (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (f32.const 0))
  (call $ed_news (i32.const @ED_MX_OUT) (local.get $p) (local.get $p) (local.get $p)))

;; Chaser k catches slot q: q down (PF_DOWN; a reload or burst under way
;; stops), ED_BLEED to bleed, nobody reviving it yet; the catch counted, news.
(func $ed_down (param $q i32) (param $k i32)
  (local $qb i32)
  (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
  (!put u8 @(PLAYERS + P_FL) (local.get $qb) (i32.or (!at u8 @(PLAYERS + P_FL) (local.get $qb)) (i32.const @PF_DOWN)))
  (!put u8 @(PLAYERS + A_RELOAD) (local.get $qb) (i32.const 0))
  (!put u8 @(PLAYERS + A_BURST) (local.get $qb) (i32.const 0))
  (i32.store16 offset=@(MODE_REC + ED_MR_BLEED) (i32.shl (local.get $q) (i32.const 3)) (i32.const @ED_BLEED))
  (i32.store16 offset=@(AO + ED_HELP) (i32.shl (local.get $q) (i32.const 1)) (i32.const 0))
  (i32.store (i32.const @(AO + ED_CAUGHT)) (i32.add (i32.load (i32.const @(AO + ED_CAUGHT))) (i32.const 1)))
  (call $ed_news (i32.const @ED_MX_DOWN) (local.get $q) (local.get $k) (local.get $q)))

;; As many chasers as the match calls for now: ED_MIN, one more for every
;; ED_PER fighters in the room and for every ED_WAVE of play, at most one
;; for every ED_SHARE fighters and one more (ED_MIN with fewer), and ED_MAX.
;; They only come.
(func $ed_more
  (local $live i32) (local $want i32) (local $cap i32) (local $n i32)
  (local.set $live (i32.load (i32.const @HDR_LIVE)))
  (local.set $want (i32.add (i32.add (i32.const @ED_MIN) (i32.div_u (local.get $live) (i32.const @ED_PER)))
                            (i32.div_u (call $a_played) (i32.const @ED_WAVE))))
  (local.set $cap (i32.add (i32.div_u (local.get $live) (i32.const @ED_SHARE)) (i32.const 1)))
  (if (i32.lt_u (local.get $cap) (i32.const @ED_MIN)) (then (local.set $cap (i32.const @ED_MIN))))
  (if (i32.gt_u (local.get $cap) (i32.const @ED_MAX)) (then (local.set $cap (i32.const @ED_MAX))))
  (if (i32.gt_u (local.get $want) (local.get $cap)) (then (local.set $want (local.get $cap))))
  (local.set $n (i32.load (i32.const @(AO + ED_N))))
  (block $done
    (loop $more
      (br_if $done (i32.ge_u (local.get $n) (local.get $want)))
      (call $ed_come (local.get $n))
      (!inc $n)
      (i32.store (i32.const @(AO + ED_N)) (local.get $n))
      (br $more))))

;; Chaser k comes onto the field at the spawn point farthest from everyone
;; in the fight and every chaser already on it (the lowest such), still, at
;; full speed's share; news there.
(func $ed_come (param $k i32)
  (local $i i32) (local $a i32) (local $q i32) (local $qb i32) (local $j i32) (local $c i32) (local $best i32)
  (local $sx f32) (local $sz f32) (local $md f32) (local $bestd f32) (local $dx f32) (local $dz f32)
  (local.set $bestd (f32.const -1))
  (!for $i (i32.const 0) (i32.load (i32.const @MAP_NSPAWN))
    (local.set $a (i32.add (i32.const @SPAWNS) (i32.shl (local.get $i) (i32.const 4))))
    (local.set $sx (f32.load (local.get $a)))
    (local.set $sz (f32.load offset=8 (local.get $a)))
    (local.set $md (f32.const 1e9))
    (!for $q (i32.const 0) (i32.const @NPLAYER)
      (if (call $a_alive (local.get $q))
        (then
          (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
          (local.set $dx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $qb)) (local.get $sx)))
          (local.set $dz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $qb)) (local.get $sz)))
          (local.set $md (f32.min (local.get $md) (f32.add (f32.mul (local.get $dx) (local.get $dx)) (f32.mul (local.get $dz) (local.get $dz))))))))
    (!for $j (i32.const 0) (local.get $k)
      (local.set $c (i32.add (i32.const @(AO + ED_CH)) (i32.mul (local.get $j) (i32.const @ED_CSIZE))))
      (local.set $dx (f32.sub (f32.load offset=@ED_C_X (local.get $c)) (local.get $sx)))
      (local.set $dz (f32.sub (f32.load offset=@ED_C_Z (local.get $c)) (local.get $sz)))
      (local.set $md (f32.min (local.get $md) (f32.add (f32.mul (local.get $dx) (local.get $dx)) (f32.mul (local.get $dz) (local.get $dz))))))
    (if (f32.gt (local.get $md) (local.get $bestd)) (then (local.set $bestd (local.get $md)) (local.set $best (local.get $i)))))
  (local.set $a (i32.add (i32.const @SPAWNS) (i32.shl (local.get $best) (i32.const 4))))
  (local.set $c (i32.add (i32.const @(AO + ED_CH)) (i32.mul (local.get $k) (i32.const @ED_CSIZE))))
  (memory.fill (local.get $c) (i32.const 0) (i32.const @ED_CSIZE))
  (f32.store offset=@ED_C_X (local.get $c) (f32.load (local.get $a)))
  (f32.store offset=@ED_C_Y (local.get $c) (f32.load offset=4 (local.get $a)))
  (f32.store offset=@ED_C_Z (local.get $c) (f32.load offset=8 (local.get $a)))
  (f32.store offset=@ED_C_EASE (local.get $c) (f32.const 1))
  (f32.store offset=@ED_C_BEST (local.get $c) (f32.const 1e9))
  (i32.store8 offset=@ED_C_GROUND (local.get $c) (i32.const 1))
  (call $ed_say (i32.const @ED_MX_COME) (local.get $k) (f32.load (local.get $a)) (f32.load offset=4 (local.get $a)) (f32.load offset=8 (local.get $a))))

;; The nearest standing fighter to feet at (x, y, z), a metre up or down
;; counting as two across: its slot (-1: nobody standing) and how far.
(func $ed_prey (param $x f32) (param $y f32) (param $z f32) (result i32 f32)
  (local $q i32) (local $qb i32) (local $dx f32) (local $dy f32) (local $dz f32) (local $d f32) (local $best f32) (local $who i32)
  (local.set $who (i32.const -1))
  (local.set $best (f32.const 1e18))
  (!for $q (i32.const 0) (i32.const @NPLAYER)
    (if (call $ed_up (local.get $q))
      (then
        (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
        (local.set $dx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $qb)) (local.get $x)))
        (local.set $dy (f32.mul (f32.sub (!at f32 @(PLAYERS + P_PY) (local.get $qb)) (local.get $y)) (f32.const 2)))
        (local.set $dz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $qb)) (local.get $z)))
        (local.set $d (!dot3 (local.get $dx) (local.get $dy) (local.get $dz) (local.get $dx) (local.get $dy) (local.get $dz)))
        (if (f32.lt (local.get $d) (local.get $best)) (then (local.set $best (local.get $d)) (local.set $who (local.get $q)))))))
  (local.get $who)
  (f32.sqrt (local.get $best)))

;; 1 if a body with its feet at (x, y, z) has a box over its head lower than q.
(func $ed_roofed (param $x f32) (param $y f32) (param $z f32) (param $q f32) (result i32)
  (local $c f32)
  (call $hull_y (local.get $x) (local.get $z) (f32.const -1e9) (f32.add (local.get $y) (f32.const @P_TOP)) (i32.load (i32.const @HDR_TICK)))
  (local.set $c)
  (drop)
  (f32.lt (local.get $c) (local.get $q)))

;; If feet at (x, z) and (qx, qz) are both within one building's bounds (a
;; box group's, grown by a body's radius): 1 and the nearest way out of it,
;; ED_EXIT past its nearest side; else 0.
(func $ed_out (param $x f32) (param $z f32) (param $qx f32) (param $qz f32) (result i32 f32 f32)
  (local $g i32) (local $ga i32) (local $x0 f32) (local $x1 f32) (local $z0 f32) (local $z1 f32) (local $m f32)
  (!for $g (i32.const 0) (i32.load (i32.const @MAP_NGROUP))
    (local.set $ga (i32.add (i32.const @MAP_GROUPS) (i32.shl (local.get $g) (i32.const 5))))
    (local.set $x0 (f32.sub (f32.load (local.get $ga)) (f32.const @P_R)))
    (local.set $z0 (f32.sub (f32.load offset=8 (local.get $ga)) (f32.const @P_R)))
    (local.set $x1 (f32.add (f32.load offset=12 (local.get $ga)) (f32.const @P_R)))
    (local.set $z1 (f32.add (f32.load offset=20 (local.get $ga)) (f32.const @P_R)))
    (if (i32.and (i32.and (i32.and (f32.gt (local.get $x) (local.get $x0)) (f32.lt (local.get $x) (local.get $x1)))
                          (i32.and (f32.gt (local.get $z) (local.get $z0)) (f32.lt (local.get $z) (local.get $z1))))
                 (i32.and (i32.and (f32.gt (local.get $qx) (local.get $x0)) (f32.lt (local.get $qx) (local.get $x1)))
                          (i32.and (f32.gt (local.get $qz) (local.get $z0)) (f32.lt (local.get $qz) (local.get $z1)))))
      (then
        (local.set $m (f32.min (f32.min (f32.sub (local.get $x) (local.get $x0)) (f32.sub (local.get $x1) (local.get $x)))
                               (f32.min (f32.sub (local.get $z) (local.get $z0)) (f32.sub (local.get $z1) (local.get $z)))))
        (if (f32.eq (local.get $m) (f32.sub (local.get $x) (local.get $x0))) (then (return (i32.const 1) (f32.sub (local.get $x0) (f32.const @ED_EXIT)) (local.get $z))))
        (if (f32.eq (local.get $m) (f32.sub (local.get $x1) (local.get $x))) (then (return (i32.const 1) (f32.add (local.get $x1) (f32.const @ED_EXIT)) (local.get $z))))
        (if (f32.eq (local.get $m) (f32.sub (local.get $z) (local.get $z0))) (then (return (i32.const 1) (local.get $x) (f32.sub (local.get $z0) (f32.const @ED_EXIT)))))
        (return (i32.const 1) (local.get $x) (f32.add (local.get $z1) (f32.const @ED_EXIT))))))
  (i32.const 0) (f32.const 0) (f32.const 0))

;; The unit (wx, wz) turned by a (1/16384 turns, growing turns right as a fighter's yaw).
(func $ed_rot (param $wx f32) (param $wz f32) (param $a i32) (result f32 f32)
  (local $s f32) (local $c f32)
  (call $sincos (local.get $a))
  (local.set $c) (local.set $s)
  (f32.sub (f32.mul (local.get $wx) (local.get $c)) (f32.mul (local.get $wz) (local.get $s)))
  (f32.add (f32.mul (local.get $wx) (local.get $s)) (f32.mul (local.get $wz) (local.get $c))))

;; 1 if there is a ledge a body at feet y can climb onto at (x, z): a box top
;; higher than a step over the feet and no more than ED_LEDGE, with a body's
;; height clear over it.
(func $ed_ledge (param $x f32) (param $y f32) (param $z f32) (result i32)
  (local $f f32) (local $c f32)
  (call $hull_y (local.get $x) (local.get $z) (f32.add (local.get $y) (f32.const @ED_LEDGE)) (f32.const 1e9) (i32.load (i32.const @HDR_TICK)))
  (drop)
  (local.set $f)
  (if (i32.eqz (f32.gt (local.get $f) (f32.add (local.get $y) (f32.const @STEP)))) (then (return (i32.const 0))))
  (call $hull_y (local.get $x) (local.get $z) (f32.const -1e9) (f32.add (local.get $f) (f32.const 0.01)) (i32.load (i32.const @HDR_TICK)))
  (local.set $c)
  (drop)
  (f32.ge (f32.sub (local.get $c) (local.get $f)) (f32.const @P_TOP)))

;; A body at feet (x, y, z), on the ground or not, looking ED_PROBE along the
;; unit (wx, wz), a step of ED_PROBE / 3 at a time, up or down onto what is
;; under each as it walks (stairs are no wall): 1 if nothing stops it, 2 if a
;; ledge it can climb does and it wants to go up (`up`), 0 if a wall does.
(func $ed_probe (param $x f32) (param $y f32) (param $z f32) (param $wx f32) (param $wz f32) (param $on i32) (param $up i32) (result i32)
  (local $lo f32) (local $tx f32) (local $tz f32) (local $nx f32) (local $nz f32) (local $k i32) (local $h f32)
  (local.set $lo (f32.add (local.get $y) (select (f32.const @STEP) (f32.const 0) (local.get $on))))
  (!for $k (i32.const 0) (i32.const 3)
    (local.set $tx (!madd (local.get $wx) (f32.const @(ED_PROBE / 3)) (local.get $x)))
    (local.set $tz (!madd (local.get $wz) (f32.const @(ED_PROBE / 3)) (local.get $z)))
    (local.set $nx (call $hull_axis (i32.const 0) (local.get $x) (local.get $tx) (local.get $z) (local.get $lo) (f32.add (local.get $lo) (f32.const @P_TOP)) (i32.load (i32.const @HDR_TICK))))
    (local.set $nz (call $hull_axis (i32.const 8) (local.get $z) (local.get $tz) (local.get $nx) (local.get $lo) (f32.add (local.get $lo) (f32.const @P_TOP)) (i32.load (i32.const @HDR_TICK))))
    (if (i32.or (f32.ne (local.get $nx) (local.get $tx)) (f32.ne (local.get $nz) (local.get $tz)))
      (then
        (if (i32.eqz (local.get $up)) (then (return (i32.const 0))))
        (return (select (i32.const 2) (i32.const 0)
                        (call $ed_ledge (!madd (local.get $wx) (f32.const @(Number(P_R) + 0.4)) (local.get $x)) (local.get $y)
                                        (!madd (local.get $wz) (f32.const @(Number(P_R) + 0.4)) (local.get $z)))))))
    (local.set $x (local.get $tx))
    (local.set $z (local.get $tz))
    ;; onto what is under it there: a step up, or anything down
    (call $hull_y (local.get $x) (local.get $z) (f32.add (local.get $y) (f32.const @STEP)) (f32.const 1e9) (i32.load (i32.const @HDR_TICK)))
    (drop)
    (local.set $h)
    (local.set $y (f32.max (local.get $h) (call $ed_ground (local.get $x) (local.get $z))))
    (local.set $lo (f32.add (local.get $y) (f32.const @STEP))))
  (i32.const 1))

;; The ground's height under (x, z).
(func $ed_ground (param $x f32) (param $z f32) (result f32)
  (call $ground (local.get $x) (local.get $z))
  (drop) (drop) (drop) (drop))

;; Chaser k's tick. Stunned (or stopped after a catch), it slides to a stop.
;; Else after its prey, the nearest standing fighter: the way there, or the
;; way it wanders; turned off it by C_TURN round a wall (a new turn ED_TURN
;; to the side that's clear, wider by ED_SWING while that's blocked too,
;; back by ED_RELAX each tick the way nearer it is clear, gone once it's
;; back on the way); pushed off other chasers inside ED_SEP; up to ED_RUN
;; times its speed's share at ED_ACC. Through the boxes an axis at a time as
;; a body; up a ledge it is pressed against at ED_CLIMB; then down onto what
;; is under it, gliding down to ED_SNAP and falling past it. A rise slows it
;; at once (ED_UP times the slope, to ED_SLOW), and it gets its speed back by
;; ED_EASE a tick. ED_STUCK ticks without getting a metre nearer its prey,
;; it wanders ED_WANDER. Then every standing fighter it reaches that isn't
;; safe is down, in slot order, and it stops ED_PAUSE.
(func $ed_chase (param $k i32)
  (local $c i32) (local $x f32) (local $y f32) (local $z f32) (local $vx f32) (local $vy f32) (local $vz f32) (local $ease f32)
  (local $stun i32) (local $calm i32) (local $prey i32) (local $turn i32) (local $stuck i32) (local $wander i32) (local $on i32) (local $climb i32)
  (local $q i32) (local $d f32) (local $best f32) (local $wx f32) (local $wz f32) (local $len f32) (local $sign i32) (local $go i32) (local $a i32)
  (local $ux f32) (local $uz f32) (local $j i32) (local $cj i32) (local $dx f32) (local $dz f32) (local $sp f32)
  (local $nx f32) (local $nz f32) (local $t f32) (local $lo f32) (local $blocked i32) (local $floor f32) (local $ceil f32) (local $h f32) (local $y0 f32)
  (local $caught i32) (local $want f32) (local $qb i32) (local $up i32) (local $qy f32) (local $out i32) (local $bx f32) (local $bz f32)
  (local.set $c (i32.add (i32.const @(AO + ED_CH)) (i32.mul (local.get $k) (i32.const @ED_CSIZE))))
  (local.set $x (f32.load offset=@ED_C_X (local.get $c)))
  (local.set $y (f32.load offset=@ED_C_Y (local.get $c)))
  (local.set $z (f32.load offset=@ED_C_Z (local.get $c)))
  (local.set $vx (f32.load offset=@ED_C_VX (local.get $c)))
  (local.set $vy (f32.load offset=@ED_C_VY (local.get $c)))
  (local.set $vz (f32.load offset=@ED_C_VZ (local.get $c)))
  (local.set $ease (f32.load offset=@ED_C_EASE (local.get $c)))
  (local.set $best (f32.load offset=@ED_C_BEST (local.get $c)))
  (local.set $stun (i32.load16_u offset=@ED_C_STUN (local.get $c)))
  (local.set $calm (i32.load16_u offset=@ED_C_CALM (local.get $c)))
  (local.set $prey (i32.sub (i32.load16_u offset=@ED_C_PREY (local.get $c)) (i32.const 1)))
  (local.set $turn (i32.load16_s offset=@ED_C_TURN (local.get $c)))
  (local.set $stuck (i32.load16_u offset=@ED_C_STUCK (local.get $c)))
  (local.set $wander (i32.load16_u offset=@ED_C_WANDER (local.get $c)))
  (local.set $on (i32.load8_u offset=@ED_C_GROUND (local.get $c)))
  (if (local.get $calm) (then (local.set $calm (i32.sub (local.get $calm) (i32.const 1)))))
  ;; its prey, and how far; a new one starts the count of getting nearer over
  (call $ed_prey (local.get $x) (local.get $y) (local.get $z))
  (local.set $d) (local.set $q)
  (if (i32.ne (local.get $q) (local.get $prey))
    (then (local.set $prey (local.get $q)) (local.set $best (local.get $d)) (local.set $stuck (i32.const 0))))
  (local.set $want (f32.const 0))
  (if (local.get $stun)
    (then (local.set $stun (i32.sub (local.get $stun) (i32.const 1))))
    (else
      (if (local.get $wander)
        (then
          (local.set $wander (i32.sub (local.get $wander) (i32.const 1)))
          (call $sincos (i32.load16_u offset=@ED_C_WDIR (local.get $c)))
          (local.set $wx) (local.set $wz)
          (local.set $want (f32.const @ED_RUN))
          (if (i32.eqz (local.get $wander)) (then (local.set $best (local.get $d)) (local.set $stuck (i32.const 0)))))
        (else
          (if (i32.ge_s (local.get $prey) (i32.const 0))
            (then
              (local.set $qb (i32.shl (local.get $prey) (i32.const 6)))
              (local.set $wx (!at f32 @(PLAYERS + P_PX) (local.get $qb)))
              (local.set $wz (!at f32 @(PLAYERS + P_PZ) (local.get $qb)))
              ;; higher than a step over its feet, it climbs to it; on another floor of the
              ;; building it's in (a roof over it under its prey's feet, or it on a box
              ;; over the ground and its prey below), it goes out first
              (local.set $qy (!at f32 @(PLAYERS + P_PY) (local.get $qb)))
              ;; (and a climb under way goes on over the top: a parapet higher than the roof it's after)
              (local.set $up (i32.or (f32.gt (local.get $qy) (f32.add (local.get $y) (f32.const @STEP))) (i32.load8_u offset=@ED_C_CLIMB (local.get $c))))
              (if (i32.and (f32.ge (f32.abs (f32.sub (local.get $qy) (local.get $y))) (f32.const @ED_FLOOR))
                           (select (call $ed_roofed (local.get $x) (local.get $y) (local.get $z) (local.get $qy))
                                   (f32.gt (local.get $y) (f32.add (call $ed_ground (local.get $x) (local.get $z)) (f32.const 1)))
                                   (local.get $up)))
                (then
                  (call $ed_out (local.get $x) (local.get $z) (local.get $wx) (local.get $wz))
                  (local.set $len) (local.set $t) (local.set $out)
                  (if (local.get $out) (then (local.set $wx (local.get $t)) (local.set $wz (local.get $len)) (local.set $up (i32.const 0))))))
              (local.set $wx (f32.sub (local.get $wx) (local.get $x)))
              (local.set $wz (f32.sub (local.get $wz) (local.get $z)))
              (local.set $len (f32.sqrt (f32.add (f32.mul (local.get $wx) (local.get $wx)) (f32.mul (local.get $wz) (local.get $wz)))))
              (if (f32.gt (local.get $len) (f32.const 0.01))
                (then (local.set $wx (f32.div (local.get $wx) (local.get $len))) (local.set $wz (f32.div (local.get $wz) (local.get $len))))
                (else (local.set $wx (f32.const 1)) (local.set $wz (f32.const 0))))
              (local.set $want (f32.const @ED_RUN))
              ;; getting nowhere: off a while on a way of the PRNG's
              (if (f32.lt (local.get $d) (f32.sub (local.get $best) (f32.const 1)))
                (then (local.set $best (local.get $d)) (local.set $stuck (i32.const 0)))
                (else (!inc $stuck)))
              (if (i32.gt_u (local.get $stuck) (i32.const @ED_STUCK))
                (then
                  (local.set $stuck (i32.const 0))
                  (local.set $turn (i32.const 0))
                  (local.set $wander (i32.const @ED_WANDER))
                  (i32.store16 offset=@ED_C_WDIR (local.get $c) (i32.and (call $rand) (i32.const 0x3fff)))))))))
      ;; round what's in the way
      (if (f32.gt (local.get $want) (f32.const 0))
        (then
          (if (local.get $turn)
            (then
              (local.set $sign (select (i32.const 1) (i32.const -1) (i32.gt_s (local.get $turn) (i32.const 0))))
              (local.set $a (i32.sub (local.get $turn) (i32.mul (local.get $sign) (i32.const @ED_RELAX))))
              (if (i32.ne (i32.gt_s (local.get $a) (i32.const 0)) (i32.gt_s (local.get $turn) (i32.const 0))) (then (local.set $a (i32.const 0))))
              (call $ed_rot (local.get $wx) (local.get $wz) (local.get $a))
              (local.set $uz) (local.set $ux)
              (if (call $ed_probe (local.get $x) (local.get $y) (local.get $z) (local.get $ux) (local.get $uz) (local.get $on) (local.get $up))
                (then (local.set $turn (local.get $a)))
                (else
                  (call $ed_rot (local.get $wx) (local.get $wz) (local.get $turn))
                  (local.set $uz) (local.set $ux)
                  (if (i32.eqz (call $ed_probe (local.get $x) (local.get $y) (local.get $z) (local.get $ux) (local.get $uz) (local.get $on) (local.get $up)))
                    (then
                      (local.set $turn (i32.add (local.get $turn) (i32.mul (local.get $sign) (i32.const @ED_SWING))))
                      ;; turned right round: start again the other way
                      (if (i32.gt_s (select (local.get $turn) (i32.sub (i32.const 0) (local.get $turn)) (i32.gt_s (local.get $turn) (i32.const 0))) (i32.const 12288))
                        (then (local.set $turn (i32.mul (local.get $sign) (i32.const @(-ED_TURN)))))))))))
            (else
              (if (i32.eqz (call $ed_probe (local.get $x) (local.get $y) (local.get $z) (local.get $wx) (local.get $wz) (local.get $on) (local.get $up)))
                (then
                  ;; a new turn, to the side that's clear (both or neither: by its index)
                  (local.set $sign (select (i32.const -1) (i32.const 1) (i32.and (local.get $k) (i32.const 1))))
                  (call $ed_rot (local.get $wx) (local.get $wz) (i32.mul (local.get $sign) (i32.const @ED_TURN)))
                  (local.set $uz) (local.set $ux)
                  (local.set $go (call $ed_probe (local.get $x) (local.get $y) (local.get $z) (local.get $ux) (local.get $uz) (local.get $on) (local.get $up)))
                  (call $ed_rot (local.get $wx) (local.get $wz) (i32.mul (local.get $sign) (i32.const @(-ED_TURN))))
                  (local.set $uz) (local.set $ux)
                  (if (i32.and (i32.eqz (local.get $go))
                               (i32.ne (call $ed_probe (local.get $x) (local.get $y) (local.get $z) (local.get $ux) (local.get $uz) (local.get $on) (local.get $up)) (i32.const 0)))
                    (then (local.set $sign (i32.sub (i32.const 0) (local.get $sign)))))
                  (local.set $turn (i32.mul (local.get $sign) (i32.const @ED_TURN)))))))
          (if (local.get $turn)
            (then
              (call $ed_rot (local.get $wx) (local.get $wz) (local.get $turn))
              (local.set $wz) (local.set $wx)))))))
  ;; the velocity it wants: the way at its speed, pushed off the other chasers
  (local.set $want (f32.mul (local.get $want) (local.get $ease)))
  (local.set $ux (f32.mul (local.get $wx) (local.get $want)))
  (local.set $uz (f32.mul (local.get $wz) (local.get $want)))
  (!for $j (i32.const 0) (i32.load (i32.const @(AO + ED_N)))
    (if (i32.ne (local.get $j) (local.get $k))
      (then
        (local.set $cj (i32.add (i32.const @(AO + ED_CH)) (i32.mul (local.get $j) (i32.const @ED_CSIZE))))
        (local.set $dx (f32.sub (local.get $x) (f32.load offset=@ED_C_X (local.get $cj))))
        (local.set $dz (f32.sub (local.get $z) (f32.load offset=@ED_C_Z (local.get $cj))))
        (local.set $len (f32.sqrt (f32.add (f32.mul (local.get $dx) (local.get $dx)) (f32.mul (local.get $dz) (local.get $dz)))))
        (if (i32.and (f32.lt (local.get $len) (f32.const @ED_SEP)) (f32.gt (local.get $len) (f32.const 0.01)))
          (then
            (local.set $sp (f32.div (f32.mul (f32.sub (f32.const @ED_SEP) (local.get $len)) (f32.const 2)) (local.get $len)))
            (local.set $ux (!madd (local.get $dx) (local.get $sp) (local.get $ux)))
            (local.set $uz (!madd (local.get $dz) (local.get $sp) (local.get $uz))))))))
  (local.set $dx (f32.sub (local.get $ux) (local.get $vx)))
  (local.set $dz (f32.sub (local.get $uz) (local.get $vz)))
  (local.set $len (f32.sqrt (f32.add (f32.mul (local.get $dx) (local.get $dx)) (f32.mul (local.get $dz) (local.get $dz)))))
  (if (f32.gt (local.get $len) (f32.const @(ED_ACC * DT)))
    (then
      (local.set $sp (f32.div (f32.const @(ED_ACC * DT)) (local.get $len)))
      (local.set $dx (f32.mul (local.get $dx) (local.get $sp)))
      (local.set $dz (f32.mul (local.get $dz) (local.get $sp)))))
  (local.set $vx (f32.add (local.get $vx) (local.get $dx)))
  (local.set $vz (f32.add (local.get $vz) (local.get $dz)))
  ;; through the boxes, an axis at a time, as a fighter's body
  (local.set $lo (f32.add (local.get $y) (select (f32.const @STEP) (f32.const 0) (local.get $on))))
  (local.set $t (!madd (local.get $vx) (f32.const @DT) (local.get $x)))
  (local.set $nx (call $hull_axis (i32.const 0) (local.get $x) (local.get $t) (local.get $z) (local.get $lo) (f32.add (local.get $lo) (f32.const @P_TOP)) (i32.load (i32.const @HDR_TICK))))
  (if (f32.ne (local.get $nx) (local.get $t))
    (then (local.set $bx (f32.copysign (f32.const @(Number(P_R) + 0.4)) (local.get $vx))) (local.set $vx (f32.const 0)) (local.set $blocked (i32.const 1))))
  (local.set $nx (!clamp (local.get $nx) (f32.load (i32.const @MAP_BOUNDS)) (f32.load (i32.const @(MAP_BOUNDS + 4)))))
  (local.set $t (!madd (local.get $vz) (f32.const @DT) (local.get $z)))
  (local.set $nz (call $hull_axis (i32.const 8) (local.get $z) (local.get $t) (local.get $nx) (local.get $lo) (f32.add (local.get $lo) (f32.const @P_TOP)) (i32.load (i32.const @HDR_TICK))))
  (if (f32.ne (local.get $nz) (local.get $t))
    (then (local.set $bz (f32.copysign (f32.const @(Number(P_R) + 0.4)) (local.get $vz))) (local.set $vz (f32.const 0)) (local.set $blocked (i32.const 1))))
  (local.set $nz (!clamp (local.get $nz) (f32.load (i32.const @(MAP_BOUNDS + 8))) (f32.load (i32.const @(MAP_BOUNDS + 12)))))
  ;; pressed against a ledge it can climb (what stopped it, past its face the way it was going), its prey up there: up it
  (local.set $climb (i32.const 0))
  (if (i32.and (i32.and (local.get $blocked) (local.get $up)) (f32.gt (local.get $want) (f32.const 0)))
    (then (local.set $climb (call $ed_ledge (f32.add (local.get $nx) (local.get $bx)) (local.get $y) (f32.add (local.get $nz) (local.get $bz))))))
  (local.set $y0 (local.get $y))
  (call $hull_y (local.get $nx) (local.get $nz)
                (f32.add (local.get $y) (select (f32.const @STEP) (f32.const 0.01) (local.get $on)))
                (f32.sub (f32.add (local.get $y) (f32.const @P_TOP)) (f32.const 0.01)) (i32.load (i32.const @HDR_TICK)))
  (local.set $ceil) (local.set $floor)
  (call $ground (local.get $nx) (local.get $nz))
  (drop) (drop) (drop) (drop)
  (local.set $h)
  (local.set $h (f32.max (local.get $h) (local.get $floor)))
  (if (local.get $climb)
    (then
      (local.set $y (!madd (f32.const @ED_CLIMB) (f32.const @DT) (local.get $y)))
      (local.set $vy (f32.const 0))
      (local.set $on (i32.const 1))
      (local.set $ease (f32.const @ED_SLOW)))
    (else
      (if (i32.and (local.get $on) (i32.and (f32.le (local.get $vy) (f32.const 0)) (f32.lt (f32.sub (local.get $y) (local.get $h)) (f32.const @ED_SNAP))))
        (then (local.set $y (local.get $h)) (local.set $vy (f32.const 0)))
        (else
          (local.set $vy (f32.sub (local.get $vy) (f32.const @GP_DT)))
          (local.set $y (!madd (local.get $vy) (f32.const @DT) (local.get $y)))
          (local.set $on (f32.le (local.get $y) (local.get $h)))
          (if (local.get $on) (then (local.set $y (local.get $h)) (local.set $vy (f32.const 0))))))
      ;; a rise slows it at once
      (if (i32.and (local.get $on) (f32.gt (local.get $y) (local.get $y0)))
        (then
          (local.set $dx (f32.sub (local.get $nx) (local.get $x)))
          (local.set $dz (f32.sub (local.get $nz) (local.get $z)))
          (local.set $len (f32.max (f32.sqrt (f32.add (f32.mul (local.get $dx) (local.get $dx)) (f32.mul (local.get $dz) (local.get $dz)))) (f32.const 0.02)))
          (local.set $ease (f32.min (local.get $ease)
            (f32.max (f32.sub (f32.const 1) (f32.mul (f32.sub (f32.div (f32.sub (local.get $y) (local.get $y0)) (local.get $len)) (f32.const @ED_FLAT)) (f32.const @ED_UP)))
                     (f32.const @ED_SLOW))))))))
  (if (f32.gt (f32.add (local.get $y) (f32.const @P_TOP)) (local.get $ceil))
    (then (local.set $y (f32.sub (local.get $ceil) (f32.const @P_TOP))) (local.set $vy (f32.min (local.get $vy) (f32.const 0)))))
  (local.set $ease (!madd (f32.sub (f32.const 1) (local.get $ease)) (f32.const @ED_EASE) (local.get $ease)))
  (!chk (local.get $nx) 61 (local.get $k))
  (!chk (local.get $y) 62 (local.get $k))
  (!chk (local.get $nz) 63 (local.get $k))
  (!chk (local.get $vx) 64 (local.get $k))
  (!chk (local.get $vy) 65 (local.get $k))
  (!chk (local.get $vz) 66 (local.get $k))
  ;; whoever it reaches, standing and not safe, is down
  (if (i32.eqz (local.get $stun))
    (then
      (!for $q (i32.const 0) (i32.const @NPLAYER)
        (if (i32.and (call $ed_up (local.get $q))
                     (i32.eqz (i32.load8_u offset=@(MODE_REC + ED_MR_SAFE) (i32.shl (local.get $q) (i32.const 3)))))
          (then
            (if (call $a_near (local.get $q) (local.get $nx) (local.get $y) (local.get $nz) (f32.const @ED_CATCH) (f32.const @ED_CATCH_H))
              (then (call $ed_down (local.get $q) (local.get $k)) (local.set $caught (i32.const 1)))))))
      (if (local.get $caught) (then (local.set $stun (i32.const @ED_PAUSE))))))
  (f32.store offset=@ED_C_X (local.get $c) (local.get $nx))
  (f32.store offset=@ED_C_Y (local.get $c) (local.get $y))
  (f32.store offset=@ED_C_Z (local.get $c) (local.get $nz))
  (f32.store offset=@ED_C_VX (local.get $c) (local.get $vx))
  (f32.store offset=@ED_C_VY (local.get $c) (local.get $vy))
  (f32.store offset=@ED_C_VZ (local.get $c) (local.get $vz))
  (f32.store offset=@ED_C_EASE (local.get $c) (local.get $ease))
  (f32.store offset=@ED_C_BEST (local.get $c) (local.get $best))
  (i32.store16 offset=@ED_C_STUN (local.get $c) (local.get $stun))
  (i32.store16 offset=@ED_C_CALM (local.get $c) (local.get $calm))
  (i32.store16 offset=@ED_C_PREY (local.get $c) (i32.add (local.get $prey) (i32.const 1)))
  (i32.store16 offset=@ED_C_TURN (local.get $c) (local.get $turn))
  (i32.store16 offset=@ED_C_STUCK (local.get $c) (local.get $stuck))
  (i32.store16 offset=@ED_C_WANDER (local.get $c) (local.get $wander))
  (i32.store8 offset=@ED_C_CLIMB (local.get $c) (local.get $climb))
  (i32.store8 offset=@ED_C_GROUND (local.get $c) (local.get $on)))

;; Slot p's shot, swing, blast or bolt took in the line o + s d, s in [0, t]
;; (d a unit vector, or 0 for a point), grown by r (the confirmed world
;; only, in play): the chaser whose face it meets first, where p saw it (its
;; position less its velocity over p's view lag), is stunned ED_STUN, unless
;; it is stunned or calm already; news at it.
(func $ed_strike (param $p i32) (param $ox f32) (param $oy f32) (param $oz f32) (param $dx f32) (param $dy f32) (param $dz f32) (param $t f32) (param $r f32)
  (local $k i32) (local $c i32) (local $lag f32) (local $fx f32) (local $fy f32) (local $fz f32) (local $b f32) (local $cc f32) (local $disc f32)
  (local $t1 f32) (local $who i32) (local $best f32) (local $rr f32)
  (if (i32.ne (i32.load (i32.const @HDR_STATE)) (i32.const @H_PLAY)) (then (return)))
  (local.set $rr (f32.add (f32.const @ED_HIT_R) (local.get $r)))
  (local.set $lag (f32.mul (f32.convert_i32_u (!at u8 @(PLAYERS + A_LAG) (i32.shl (local.get $p) (i32.const 6)))) (f32.const @DT)))
  (local.set $who (i32.const -1))
  (local.set $best (local.get $t))
  (!for $k (i32.const 0) (i32.load (i32.const @(AO + ED_N)))
    (local.set $c (i32.add (i32.const @(AO + ED_CH)) (i32.mul (local.get $k) (i32.const @ED_CSIZE))))
    (local.set $fx (f32.sub (local.get $ox) (f32.sub (f32.load offset=@ED_C_X (local.get $c)) (f32.mul (f32.load offset=@ED_C_VX (local.get $c)) (local.get $lag)))))
    (local.set $fy (f32.sub (local.get $oy) (f32.add (f32.sub (f32.load offset=@ED_C_Y (local.get $c)) (f32.mul (f32.load offset=@ED_C_VY (local.get $c)) (local.get $lag)))
                                                     (f32.const @ED_HIT_Y))))
    (local.set $fz (f32.sub (local.get $oz) (f32.sub (f32.load offset=@ED_C_Z (local.get $c)) (f32.mul (f32.load offset=@ED_C_VZ (local.get $c)) (local.get $lag)))))
    (local.set $b (!dot3 (local.get $fx) (local.get $fy) (local.get $fz) (local.get $dx) (local.get $dy) (local.get $dz)))
    (local.set $cc (f32.sub (!dot3 (local.get $fx) (local.get $fy) (local.get $fz) (local.get $fx) (local.get $fy) (local.get $fz)) (f32.mul (local.get $rr) (local.get $rr))))
    (local.set $disc (f32.sub (f32.mul (local.get $b) (local.get $b)) (local.get $cc)))
    (if (f32.ge (local.get $disc) (f32.const 0))
      (then
        (local.set $t1 (f32.max (f32.sub (f32.neg (local.get $b)) (f32.sqrt (local.get $disc))) (f32.const 0)))
        (if (i32.and (f32.le (local.get $t1) (local.get $best)) (f32.ge (f32.add (f32.neg (local.get $b)) (f32.sqrt (local.get $disc))) (f32.const 0)))
          (then (local.set $best (local.get $t1)) (local.set $who (local.get $k)))))))
  (if (i32.lt_s (local.get $who) (i32.const 0)) (then (return)))
  (local.set $c (i32.add (i32.const @(AO + ED_CH)) (i32.mul (local.get $who) (i32.const @ED_CSIZE))))
  (if (i32.or (i32.load16_u offset=@ED_C_STUN (local.get $c)) (i32.load16_u offset=@ED_C_CALM (local.get $c))) (then (return)))
  (i32.store16 offset=@ED_C_STUN (local.get $c) (i32.const @ED_STUN))
  (i32.store16 offset=@ED_C_CALM (local.get $c) (i32.const @(ED_STUN + ED_CALM)))
  (i32.store (i32.const @(AO + ED_STUNS)) (i32.add (i32.load (i32.const @(AO + ED_STUNS))) (i32.const 1)))
  (call $fx (i32.const 0) (i32.const @FX_MODE) (local.get $p) (local.get $who)
            (!madd (local.get $dx) (local.get $best) (local.get $ox)) (!madd (local.get $dy) (local.get $best) (local.get $oy)) (!madd (local.get $dz) (local.get $best) (local.get $oz))
            (f32.const @ED_MX_STUN)))

;; News for the feed (FX_MODE: what as its size), at slot at's feet.
(func $ed_news (param $what i32) (param $owner i32) (param $shot i32) (param $at i32)
  (local $b i32)
  (local.set $b (i32.shl (local.get $at) (i32.const 6)))
  (call $fx (i32.const 0) (i32.const @FX_MODE) (local.get $owner) (local.get $shot)
            (!at f32 @(PLAYERS + P_PX) (local.get $b)) (!at f32 @(PLAYERS + P_PY) (local.get $b)) (!at f32 @(PLAYERS + P_PZ) (local.get $b))
            (f32.convert_i32_u (local.get $what))))

;; News with nobody's name (owner 255) at a point.
(func $ed_say (param $what i32) (param $shot i32) (param $x f32) (param $y f32) (param $z f32)
  (call $fx (i32.const 0) (i32.const @FX_MODE) (i32.const 255) (local.get $shot) (local.get $x) (local.get $y) (local.get $z) (f32.convert_i32_u (local.get $what))))
