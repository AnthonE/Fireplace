# Hosting rooms

`net/rooms.mjs` runs a game's rooms: one relay per room, as many as players
need. It keeps `min_free` rooms with nobody in them, so a newcomer always has
one to join, opens another when those fill (up to `max_rooms`), and stops an
extra empty room once it has sat idle for `idle_s`. Each room is capped at
`max_players`; a joiner past that is refused, never squeezed in.

```sh
node net/rooms.mjs net/rooms.example.json   # Fireplace's rooms on game.elopros.com, ports 61290-61297
```

Each room writes its status to `status_dir/<port>.json` every 2 s
(`relay.ts --status`): `players`, `max_players`, `spectators`, the sim `tick`
and `tick_hz`, written whole so a reader never sees half a file. The pool
writes the game's server list to `list`, one row per room (`id`, `name`,
`addr`, `max_players`, `status_url`), the shape the Elo Pros launcher and store
read. A page host serves both over https, the status at `status_base`:

```nginx
location /fireplace/rooms/ { alias /srv/fireplace/traces/rooms/; add_header Cache-Control no-store; }
```

The relays' certificate is the 13-day one `tools/cert.sh` makes, its hash in
`certs/hash.txt` for the page. Run `tools/cert.sh` from cron every 12 days:
the pool stops each room still on the old certificate once it is empty, and a
fresh room takes its place.

**Someone else's game.** The referee runs the room's wasm, so a pool can host
a game we did not write. The relay gives that wasm its shared memory and
nothing else, so it cannot open a file or a socket. It refuses at start
(exit 2) a module that imports anything more, or that lacks an export the
referee calls (`init`, `step`, `snapshot`, `regrid`; `step_mt` and
`worker_run` with referee threads). It ends a room (exit 3) whose referee falls
`--referee-lag` seconds behind, which a sim that never returns would do. After
three such endings in a row (or rooms that die within 10 s of starting, a port
in use say) the pool stops starting rooms and says why in the list's `why`. A
room that ends for any reason has its status file removed, so it never reads
as up. A game whose input word differs from golf's passes its own
`--tap-mask` (bits cleared on every tick a player's input is missing) and
`--hold-mask` (cleared after 30) through `relay_args`.

**A room that never empties.** A room with bots always in it (or a busy
pool's) runs for days, so nothing the relay keeps may grow with the room's
age. A relay that saves no replay and feeds no edge keeps only the last
`--referee-lag` + 20 s of the record, all a joiner's fill or a repair asks
for; the timing samples and hash lists keep their newest entries. Before
that, 128 bots grew a relay by about 1.1 GB an hour, and the slack samples
passed V8's array limit and killed it after 2 h 20 min. With replays on, the
record is kept whole, as the replay needs it.

What a room costs, measured on this repo's 4-core dev container with
Fireplace's wasm: an empty room 5% of one core (12% before an empty room
stopped using the precise clock), a room of 4 guests 16%, about 115 MB
resident either way. `node net/run-rooms.mjs` is the gate: the refusals, the
stopped referee, and a pool opening, capping, listing and closing rooms with
bots at its doors.
