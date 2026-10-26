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

## Rooms for the kit's copies

A copy of this repo made from the template ("Use this template") has a page
on GitHub Pages and no relay, so it plays a local room with AI players.
`net/kit-rooms.mjs` gives it rooms: **play online with friends**, at the
foot of the screen while the living room is in view, asks the pool
(`relay.pool` in `client/kit.json`, `https://game.elopros.com/kit/` by
default) for a room for its own site, and the pool fetches that copy's
wasm from the site at the path `tools/site.mjs` publishes
(`build/fireplace/game.wasm`, or another game's), checks it as the relay does
(`net/sim-check.mjs`), and starts a relay on it, one room per sha256, as
`net/rooms.mjs` starts them. The page then moves to the site's address with
`?room=<id>`, which is the invite: a page opened with it asks the pool for
that room, `{room, url, hash, hash_url}`, and joins (**copy invite link**
copies it). A pool that can't be reached or refuses (every refusal has a
`why`), or a room the page can't reach (UDP blocked, say), leaves the page in
its local room, the reason on that line. Nobody lands in an empty online room
without asking for one. A page on the pool's own host never offers, so
Fireplace's own page keeps its relay; nor does a page off https (a dev
server) unless its pool is set (`?pool=`, or a `relay.pool` other than the
default), and `?pool=0` turns the offer off.

```sh
node net/kit-rooms.mjs net/kit-rooms.example.json   # on the game box, from the repo, beside rooms.mjs
```

```nginx
location /kit/ {
  proxy_pass http://127.0.0.1:61280;
  proxy_set_header X-Real-IP $remote_addr;
  client_max_body_size 4k;
  proxy_read_timeout 40s;
}
```

The relays are the same Deno relays on the same 13-day certificate
(`tools/cert.sh` from cron): a room answers with the hash of the certificate
it started on, `cert-hash?room=<id>` serves it, and an empty room on an old
certificate is stopped. The relays listen on `ports` (61300-61315 in the
example, UDP, open in the firewall); the API listens on `listen`, behind nginx.

The wasm is someone else's. It is fetched with no redirects, at most
`max_wasm_bytes` (2 MiB; Fireplace's is 291 KiB), within `fetch_timeout_s`,
only from `fetch_from` (`https://*.github.io`), and written only to
`wasm_dir/<sha256>.wasm` for the relay to read; it runs only in the referee,
which gives it its shared memory and nothing else. No JavaScript from a copy
runs on the box, so a pool room has no AI players; that is why a page
starts in its local room, with bots, and goes online only when asked. The caps:
`max_rooms` rooms in all (8), `per_site_rooms` for one copy (2),
`max_players` a room (8), `per_ip_per_min` asks (30). A copy whose wasm
matches an open room's joins that room whatever its site. A wasm whose rooms
end `refuse_after` times (3) with a refusal or a referee behind (exit 2 or 3)
within `refuse_s` (an hour) is refused by its sha256 until an hour after the
last. A room with nobody in it and no seat held (`hold_s`, a seat for each
answer until its player comes) stops after `idle_s` (120 s).

What it costs, from the numbers above (Fireplace's wasm on a 4-core box): a
room 115 MB resident, 5% of a core empty and 16% with 4 in, so the example's
8 rooms full of 4 come to about 0.9 GB and 1.3 cores. A copy's own wasm may
step slower; the referee watchdog ends a room whose sim falls 10 s behind.
`node net/run-kit-rooms.mjs` is the gate: a fake Pages host, the pool, a
page going online at the button, a second meeting it by invite, bots at the
door, the refusals and the caps.
