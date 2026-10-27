;; LUCKY BLOCKS (M_LUCKY, prefix lk; constants and the blocks' fields in AO in
;; src/am/lucky.mjs): everyone for itself, the kit's first mode without
;; sides. Everyone spawns with LK_GUN in both hands and no frags (the spawn
;; hook). As play starts a block is laid over each of the map's spots (its
;; pads, the flags' stands, the skull's spot, the hills), one to a spot. The
;; strike hook (a hitscan round's line, a swing's reach, a blast, a bolt or
;; needle where it is, all on the confirmed world) marks each standing block
;; it takes in as broken by whoever did it; the tick hook, at the end
;; of the tick and in block order, draws by $rand what each one broken pays
;; (LK_ROLLS by LK_ODDS) and pays it if its breaker is still alive. A kill
;; counts as anywhere (A_KILLS); LK_TARGET wins the match on its tick, the
;; most at the clock (the core's places by $a_key: kills). What it does to a
;; body the prediction reads is PF_FAST (a zombie's legs) alone: the rest
;; (guns, shields, frags, blasts) the prediction takes from the confirmed
;; world a round trip later, as a shot's. News (FX_MODE at the block): what
;; each block paid.

;; Play begins: a block over each spot, in the map's order (pads, red's then
;; blue's stand, the skull's spot, which follows them in MAP_OBJ, the hills),
;; but one within LK_APART of one laid before it.
(func $lk_start
  (local $i i32) (local $a i32)
  (!for $i (i32.const 0) (i32.load (i32.const @MAP_NPAD))
    (local.set $a (i32.add (i32.const @MAP_PADS) (i32.shl (local.get $i) (i32.const 4))))
    (call $lk_add (f32.load (local.get $a)) (f32.load offset=4 (local.get $a)) (f32.load offset=8 (local.get $a))))
  (!for $i (i32.const 0) (i32.const 3)
    (local.set $a (i32.add (i32.const @MAP_FLAGS) (i32.shl (local.get $i) (i32.const 4))))
    (call $lk_add (f32.load (local.get $a)) (f32.load offset=4 (local.get $a)) (f32.load offset=8 (local.get $a))))
  (local.set $i (i32.const 0))
  (block $out
    (loop $hill
      (br_if $out (i32.ge_u (local.get $i) (i32.load (i32.const @MAP_NHILL))))
      (br_if $out (i32.ge_u (local.get $i) (i32.const @NHILL)))
      (local.set $a (i32.add (i32.const @MAP_HILLS) (i32.shl (local.get $i) (i32.const 4))))
      (call $lk_add (f32.load (local.get $a)) (f32.load offset=4 (local.get $a)) (f32.load offset=8 (local.get $a)))
      (!inc $i)
      (br $hill))))

;; A block over the spot (x, z), on what is under it up to `top`, unless one
;; laid already is within LK_APART across and 2 m up or down, or LK_MAX are.
(func $lk_add (param $x f32) (param $z f32) (param $top f32)
  (local $y f32) (local $n i32) (local $j i32) (local $a i32) (local $dx f32) (local $dz f32)
  (local.set $y (f32.add (call $stand (local.get $x) (local.get $z) (local.get $top)) (f32.const @LK_LIFT)))
  (local.set $n (i32.load (i32.const @(AO + LK_N))))
  (if (i32.ge_u (local.get $n) (i32.const @LK_MAX)) (then (return)))
  (!for $j (i32.const 0) (local.get $n)
    (local.set $a (i32.add (i32.const @(AO + LK_BLOCKS)) (i32.shl (local.get $j) (i32.const 4))))
    (local.set $dx (f32.sub (f32.load (local.get $a)) (local.get $x)))
    (local.set $dz (f32.sub (f32.load offset=8 (local.get $a)) (local.get $z)))
    (if (i32.and (f32.lt (f32.add (f32.mul (local.get $dx) (local.get $dx)) (f32.mul (local.get $dz) (local.get $dz))) (f32.const @(LK_APART * LK_APART)))
                 (f32.lt (f32.abs (f32.sub (f32.load offset=4 (local.get $a)) (local.get $y))) (f32.const 2)))
      (then (return))))
  (local.set $a (i32.add (i32.const @(AO + LK_BLOCKS)) (i32.shl (local.get $n) (i32.const 4))))
  (f32.store (local.get $a) (local.get $x))
  (f32.store offset=4 (local.get $a) (local.get $y))
  (f32.store offset=8 (local.get $a) (local.get $z))
  (i32.store (i32.const @(AO + LK_N)) (i32.add (local.get $n) (i32.const 1))))

;; Every tick of play: each fighter's legs running out (PF_FAST cleared the
;; tick its count reaches 0); each block broken this tick paid out and gone
;; LK_BACK, each gone counted down; the leader by $a_key (kills, the lowest
;; slot on a tie); and 1, with the winner, once it has LK_TARGET kills.
(func $lk_tick (result i32)
  (local $p i32) (local $r i32) (local $n i32) (local $j i32) (local $a i32) (local $by i32)
  (local $key i32) (local $best i32) (local $lead i32)
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (local.set $r (i32.add (i32.const @MODE_REC) (i32.shl (local.get $p) (i32.const 3))))
    (local.set $n (i32.load16_u offset=@LK_MR_FAST (local.get $r)))
    (if (local.get $n)
      (then
        (local.set $n (i32.sub (local.get $n) (i32.const 1)))
        (i32.store16 offset=@LK_MR_FAST (local.get $r) (local.get $n))
        (if (i32.eqz (local.get $n))
          (then (!put u8 @(PLAYERS + P_FL) (i32.shl (local.get $p) (i32.const 6))
                  (i32.and (!at u8 @(PLAYERS + P_FL) (i32.shl (local.get $p) (i32.const 6))) (i32.const @(255 ^ PF_FAST)))))))))
  (!for $j (i32.const 0) (i32.load (i32.const @(AO + LK_N)))
    (local.set $a (i32.add (i32.const @(AO + LK_BLOCKS)) (i32.shl (local.get $j) (i32.const 4))))
    (local.set $by (i32.load16_u offset=14 (local.get $a)))
    (if (local.get $by)
      (then
        (i32.store16 offset=12 (local.get $a) (i32.const @LK_BACK))
        (i32.store16 offset=14 (local.get $a) (i32.const 0))
        (local.set $by (i32.sub (local.get $by) (i32.const 1)))
        (if (call $a_alive (local.get $by))
          (then
            (local.set $r (i32.add (i32.const @MODE_REC) (i32.shl (local.get $by) (i32.const 3))))
            (i32.store16 offset=@MR_AUX (local.get $r) (i32.add (i32.load16_u offset=@MR_AUX (local.get $r)) (i32.const 1)))
            (call $lk_roll (local.get $by) (f32.load (local.get $a)) (f32.load offset=4 (local.get $a)) (f32.load offset=8 (local.get $a))))))
      (else
        (local.set $n (i32.load16_u offset=12 (local.get $a)))
        (if (local.get $n) (then (i32.store16 offset=12 (local.get $a) (i32.sub (local.get $n) (i32.const 1))))))))
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (if (i32.and (!at u8 @(PLAYERS + P_FL) (i32.shl (local.get $p) (i32.const 6))) (i32.const @PF_LIVE))
      (then
        (local.set $key (call $a_key (local.get $p)))
        (if (i32.or (i32.eqz (local.get $lead)) (i32.gt_u (local.get $key) (local.get $best)))
          (then (local.set $best (local.get $key)) (local.set $lead (i32.add (local.get $p) (i32.const 1))))))))
  (i32.store (i32.const @AH_LEADER) (local.get $lead))
  (if (i32.eqz (local.get $lead)) (then (return (i32.const 0))))
  (local.set $p (i32.sub (local.get $lead) (i32.const 1)))
  (if (i32.lt_u (!at u16 @(PLAYERS + A_KILLS) (i32.shl (local.get $p) (i32.const 6))) (i32.const @LK_TARGET)) (then (return (i32.const 0))))
  (i32.store (i32.const @AH_WINNER) (local.get $lead))
  (call $a_news (i32.const @MX_WIN) (local.get $p) (local.get $p))
  (i32.const 1))

;; q died (at a's hand: the core counts the kill): its legs go with it.
(func $lk_kill (param $q i32) (param $a i32) (param $cause i32)
  (i32.store16 offset=@(MODE_REC + LK_MR_FAST) (i32.shl (local.get $q) (i32.const 3)) (i32.const 0))
  (!put u8 @(PLAYERS + P_FL) (i32.shl (local.get $q) (i32.const 6))
    (i32.and (!at u8 @(PLAYERS + P_FL) (i32.shl (local.get $q) (i32.const 6))) (i32.const @(255 ^ PF_FAST)))))

;; No spawn point is barred (and with no sides, none is asked).
(func $lk_bar (param $x f32) (param $y f32) (param $z f32) (result i32)
  (i32.const 0))

;; Slot p comes into the fight with LK_GUN alone, no frags, no legs.
(func $lk_spawn (param $p i32)
  (call $a_arm (local.get $p) (i32.const @LK_GUN) (i32.const @LK_GUN))
  (!put u8 @(PLAYERS + A_GRENS) (i32.shl (local.get $p) (i32.const 6)) (i32.const 0))
  (i32.store16 offset=@(MODE_REC + LK_MR_FAST) (i32.shl (local.get $p) (i32.const 3)) (i32.const 0)))

;; Slot p's shot, swing or blast takes in the line o + s d, s in [0, t] (d a
;; unit vector, or 0 for a point), grown by r: every standing block it
;; touches not yet broken this tick is p's, in block order. Only in play.
(func $lk_strike (param $p i32) (param $ox f32) (param $oy f32) (param $oz f32) (param $dx f32) (param $dy f32) (param $dz f32) (param $t f32) (param $r f32)
  (local $j i32) (local $a i32) (local $h f32) (local $t0 f32) (local $t1 f32)
  (if (i32.ne (i32.load (i32.const @HDR_STATE)) (i32.const @H_PLAY)) (then (return)))
  (local.set $h (f32.add (f32.const @LK_HALF) (local.get $r)))
  (!for $j (i32.const 0) (i32.load (i32.const @(AO + LK_N)))
    (local.set $a (i32.add (i32.const @(AO + LK_BLOCKS)) (i32.shl (local.get $j) (i32.const 4))))
    (if (i32.eqz (i32.load (i32.add (local.get $a) (i32.const 12))))
      (then
        (call $slab1 (f32.sub (f32.load (local.get $a)) (local.get $h)) (f32.add (f32.load (local.get $a)) (local.get $h))
                     (local.get $ox) (local.get $dx) (f32.const 0) (local.get $t))
        (local.set $t1) (local.set $t0)
        (call $slab1 (f32.sub (f32.load offset=4 (local.get $a)) (local.get $h)) (f32.add (f32.load offset=4 (local.get $a)) (local.get $h))
                     (local.get $oy) (local.get $dy) (local.get $t0) (local.get $t1))
        (local.set $t1) (local.set $t0)
        (call $slab1 (f32.sub (f32.load offset=8 (local.get $a)) (local.get $h)) (f32.add (f32.load offset=8 (local.get $a)) (local.get $h))
                     (local.get $oz) (local.get $dz) (local.get $t0) (local.get $t1))
        (local.set $t1) (local.set $t0)
        (if (f32.le (local.get $t0) (local.get $t1))
          (then (i32.store16 offset=14 (local.get $a) (i32.add (local.get $p) (i32.const 1)))))))))

;; What a block at (x, y, z) pays slot p, drawn by $rand: LK_ROLLS[k] with
;; LK_ODDS[k] chances in LK_ODDS_SUM. The news first, then the payout.
(func $lk_roll (param $p i32) (param $x f32) (param $y f32) (param $z f32)
  (local $r i32) (local $k i32) (local $what i32) (local $pb i32) (local $px f32) (local $py f32) (local $pz f32) (local $s f32) (local $c f32)
  (local.set $r (i32.rem_u (call $rand) (i32.const @LK_ODDS_SUM)))
  (block $found
    (loop $walk
      (local.set $r (i32.sub (local.get $r) (!tab LK_ODDS (local.get $k))))
      (br_if $found (i32.lt_s (local.get $r) (i32.const 0)))
      (!inc $k)
      (br $walk)))
  (local.set $what (!tab LK_ROLLS (local.get $k)))
  (call $fx (i32.const 0) (i32.const @FX_MODE) (local.get $p) (local.get $what) (local.get $x) (local.get $y) (local.get $z) (f32.const @LK_MX_ROLL))
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (local.set $px (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
  (local.set $py (!at f32 @(PLAYERS + P_PY) (local.get $pb)))
  (local.set $pz (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
  (if (i32.lt_u (local.get $what) (i32.const @LK_R_OVER)) (then (call $lk_gun (local.get $p) (local.get $what)) (return)))
  (if (i32.eq (local.get $what) (i32.const @LK_R_OVER))
    (then
      (!put u8 @(PLAYERS + A_SH) (local.get $pb) (i32.const @OVERSHIELD))
      (!put u8 @(PLAYERS + A_HP) (local.get $pb) (i32.const 100))
      (!put u16 @(PLAYERS + A_SHT) (local.get $pb) (i32.const 0))
      (return)))
  (if (i32.eq (local.get $what) (i32.const @LK_R_FAST))
    (then
      (!put u8 @(PLAYERS + P_FL) (local.get $pb) (i32.or (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @PF_FAST)))
      (i32.store16 offset=@(MODE_REC + LK_MR_FAST) (i32.shl (local.get $p) (i32.const 3)) (i32.const @LK_FAST_TICKS))
      (return)))
  (if (i32.eq (local.get $what) (i32.const @LK_R_FRAGS))
    (then
      (!put u8 @(PLAYERS + A_GRENS) (local.get $pb)
        (select (i32.const 4) (i32.add (!at u8 @(PLAYERS + A_GRENS) (local.get $pb)) (i32.const @LK_FRAGS))
                (i32.gt_u (i32.add (!at u8 @(PLAYERS + A_GRENS) (local.get $pb)) (i32.const @LK_FRAGS)) (i32.const 4))))
      (return)))
  (if (i32.eq (local.get $what) (i32.const @LK_R_BOOM))
    (then
      (call $fx (i32.const 0) (i32.const @FX_BLAST) (local.get $p) (i32.const 0) (local.get $px) (f32.add (local.get $py) (f32.const 0.9)) (local.get $pz) (f32.const 5))
      (call $a_splash (local.get $px) (f32.add (local.get $py) (f32.const 0.9)) (local.get $pz) (f32.const @LK_BOOM_DMG) (f32.const 5) (local.get $p) (i32.const @KILL_GREN))
      (return)))
  ;; LK_R_RAIN: frags round it in the air, going off one after another
  (!for $k (i32.const 0) (i32.const @LK_RAIN)
    (call $sincos (i32.mul (local.get $k) (i32.const @(16384 / LK_RAIN))))
    (local.set $c) (local.set $s)
    (call $lk_frag (local.get $p) (!madd (local.get $c) (f32.const @LK_RAIN_R) (local.get $px)) (f32.add (local.get $py) (f32.const @LK_RAIN_UP))
                   (!madd (local.get $s) (f32.const @LK_RAIN_R) (local.get $pz)) (i32.sub (i32.const @LK_RAIN_AGE) (i32.mul (local.get $k) (i32.const @LK_RAIN_FUSE))))))

;; Gun w for slot p, full: ammo if it carries it; else in place of the one in
;; its hands, or of LK_GUN in the other hand if the hands hold something better.
(func $lk_gun (param $p i32) (param $w i32)
  (local $pb i32) (local $hand i32) (local $slot i32)
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (local.set $hand (i32.and (i32.shr_u (!at u8 @(PLAYERS + A_ACT) (local.get $pb)) (i32.const 2)) (i32.const 1)))
  (local.set $slot (local.get $hand))
  (if (i32.eq (i32.load8_u offset=@(PLAYERS + A_GUN) (i32.add (local.get $pb) (i32.xor (local.get $hand) (i32.const 1)))) (local.get $w))
    (then (local.set $slot (i32.xor (local.get $hand) (i32.const 1)))))
  (if (i32.and (i32.ne (i32.load8_u offset=@(PLAYERS + A_GUN) (i32.add (local.get $pb) (local.get $slot))) (local.get $w))
               (i32.and (i32.ne (i32.load8_u offset=@(PLAYERS + A_GUN) (i32.add (local.get $pb) (local.get $hand))) (i32.const @LK_GUN))
                        (i32.eq (i32.load8_u offset=@(PLAYERS + A_GUN) (i32.add (local.get $pb) (i32.xor (local.get $hand) (i32.const 1)))) (i32.const @LK_GUN))))
    (then (local.set $slot (i32.xor (local.get $hand) (i32.const 1)))))
  (i32.store8 offset=@(PLAYERS + A_GUN) (i32.add (local.get $pb) (local.get $slot)) (local.get $w))
  (i32.store8 offset=@(PLAYERS + A_MAG) (i32.add (local.get $pb) (local.get $slot)) (!arm mag (local.get $w)))
  (i32.store16 offset=@(PLAYERS + A_RES) (i32.add (local.get $pb) (i32.shl (local.get $slot) (i32.const 1))) (!arm res (local.get $w)))
  (if (i32.eq (local.get $slot) (local.get $hand))
    (then
      (!put u8 @(PLAYERS + A_RELOAD) (local.get $pb) (i32.const 0))
      (!put u8 @(PLAYERS + A_BURST) (local.get $pb) (i32.const 0))
      (!put u16 @(PLAYERS + P_REFIRE) (local.get $pb) (i32.const @SWAP_TICKS)))))

;; A frag of slot p's at rest at (x, y, z), `age` ticks into its fuse, in the
;; first free projectile slot of the confirmed world (none free: none). Its
;; shot number 0, so the page draws its blast from the confirmed ring.
(func $lk_frag (param $p i32) (param $x f32) (param $y f32) (param $z f32) (param $age i32)
  (local $j i32) (local $jb i32)
  (block $found
    (loop $find
      (br_if $found (i32.eqz (!at u8 @(PROJ + J_KIND) (i32.shl (local.get $j) (i32.const 5)))))
      (!inc $j)
      (br_if $find (i32.lt_u (local.get $j) (i32.const @NPROJ)))
      (return)))
  (local.set $jb (i32.shl (local.get $j) (i32.const 5)))
  (memory.fill (i32.add (i32.const @PROJ) (local.get $jb)) (i32.const 0) (i32.const @JSIZE))
  (!put f32 @(PROJ + J_PX) (local.get $jb) (local.get $x))
  (!put f32 @(PROJ + J_PY) (local.get $jb) (local.get $y))
  (!put f32 @(PROJ + J_PZ) (local.get $jb) (local.get $z))
  (!put u16 @(PROJ + J_AGE) (local.get $jb) (local.get $age))
  (!put u8 @(PROJ + J_KIND) (local.get $jb) (i32.const @K_GRENADE))
  (!put u8 @(PROJ + J_OWNER) (local.get $jb) (local.get $p)))
