// The relay: one isolate owns the QUIC endpoint, the 8 ms clock and the
// bundles. Deadlines run from a fixed epoch; an input counts only if it was
// read before its tick's deadline, so a late timer adds latency, never unfairness.
// Each closed tick is coded once, as the words that changed (net/wire.mjs);
// bundles go out first, every second tick, the newest four ticks in as many
// datagrams as they need, with a per-recipient trailer. Every closed tick is
// also recorded from the room's start and handed to the referee (net/referee-worker.mjs), a Worker stepping
// the same game.wasm: it is the truth for interval hashes and keyframes. A
// joiner gets the newest keyframe and the record since; a tick a client's
// acks lack comes back in a repair datagram; a hash a client reports that
// differs from the referee's, a hole too old to repair, or a client far
// behind gets a resync from a keyframe. A room that empties starts over on a new seed.
// Spectators (a hello with the watch flag) hold no slot: they get the bundles,
// repairs and keyframes and report hashes, and send no words.
//
// With --upstream, the relay is an edge: it watches a room on another relay
// (its native door) as a spectator and serves it to spectators of its own,
// closing ticks as they come down rather than on its own clock. Its referee
// starts from the keyframe it began watching at and reports its hashes
// upstream, so each relay in a tree is checked by the one above it. Given
// several upstreams, it watches the next when one goes away.
//
// With --standby as well, an edge whose upstreams are all gone takes the room
// over: it holds the record and a referee already, so it closes the ticks
// from the newest it has on, on the old clock's timeline, and each player in
// the world keeps their slot for GRACE_MS, held by a ghost that repeats
// their last word (as for a player whose inputs are late) until they come
// back here with a resume (net/wire.mjs) and take it over, with no join.
//
//   .tools/deno run --unstable-net -A net/relay.ts [--port 4433] [--native-port 4434] [--duration 70] [--cc low-latency|default] [--seed N] [--host 127.0.0.1]
//                  [--upstream host:native-port[,host:native-port...]] [--standby] [--watchers 4096] [--replays dir]
//                  [--max-players 256] [--status file] [--online file] [--game name] [--tap-mask 0x10000000] [--hold-mask 0x0f000000] [--referee-lag 10]
// With --status, the room's state goes to a JSON file every STATUS_MS, for a
// page host to serve as the room's status_url: players, max_players,
// spectators, the sim tick and its rate. The file is written whole (a temp
// file renamed over it), so a reader never sees half of one. --online writes
// who is signed in the same way, for the row's online_url: {at, online:
// [{wallet, since}]}, the roster Elo Pros counts as play.
// A wasm from someone else is run here too, by the referee: it is refused at
// start unless its only import is the shared memory and it exports what the
// referee calls, and the relay ends (exit 3) if the referee falls more than
// --referee-lag seconds behind, which a sim that never returns would do.
// With --replays, each room's record goes to a replay file (net/replay.mjs)
// when it ends, with the referee's interval hashes.
// Elo Pros (net/elo.mjs): with --signin-domains, a player whose hello asks
// (W.HELLO_SIGNIN) gets a nonce, signs it with their wallet on a page of one
// of those domains, and the relay asks --elo (https://elopros.com) whether the
// signature is good; the slot is then that wallet's. With --elo-key (the
// private half of the game's server key, PEM) and --elo-key-id (<slug>/<key
// id>), Fireplace's build reports each game's result to --elo's ratings, the
// signed-in players at the places the referee read: a rated match per game.
//                  [--elo https://elopros.com] [--signin-domains host[,host...]] [--elo-key file --elo-key-id fireplace/<id>]
// Clients are Chrome (net/run-m0.mjs hosts the bots there): Deno's WebTransport
// client always binds an IPv6 socket, which hosts without IPv6 refuse. Native
// clients (the bot host, tiny-client) come in on --native-port instead: the same session over a
// TCP connection for the stream and UDP for the datagrams (net/wire.mjs).
import * as W from './wire.mjs';
import * as L from '../src/layout.mjs';
import { recordLog } from './inbox.mjs';
import { encodeReplay } from './replay.mjs';
import { simRefusal } from './sim-check.mjs';
import * as Elo from './elo.mjs';

const argv = Deno.args;
const opt = (k: string, d: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const port = Number(opt('port', '4433'));
const durationS = Number(opt('duration', '0'));
const cc = opt('cc', 'low-latency') as 'low-latency' | 'default' | 'throughput';
// Deno timers overshoot by a millisecond or two. Precise mode arms the timer
// early, then yields through a MessageChannel until the deadline, so datagram
// reads keep flowing while it waits.
const precise = opt('precise', '1') !== '0';
// how long before a deadline the timer hands over to the yield loop; --early 8 never sleeps
const EARLY_MS = Number(opt('early', '1.5'));
const quiet = argv.includes('--quiet');
const verbose = argv.includes('--verbose');
const log = (...a: unknown[]) => { if (verbose) console.error(`[relay ${((performance.now() - E) / 1000).toFixed(2)}]`, ...a); };
// a fixed course for every room, else a random one each time a room starts
const seedArg = opt('seed', '');
const hostname = opt('host', '127.0.0.1');
const nativePort = Number(opt('native-port', '4434')); // 0: no native door
const newSeed = () => (seedArg ? Number(seedArg) >>> 0 : crypto.getRandomValues(new Uint32Array(1))[0]);
// where the run summary goes; stdout by default (V8 traces share stdout, so runners pass a file)
const summaryPath = opt('summary', '');
// an edge: the relays (host:native port) whose room it serves, in order of preference
const upstreams = opt('upstream', '') ? opt('upstream', '').split(',') : [];
const standby = argv.includes('--standby');
let edge = upstreams.length > 0; // until a standby takes the room over
const MAX_WATCHERS = Number(opt('watchers', '4096'));
const replaysDir = opt('replays', '');
// the referee's threads: a tick with many balls awake is split across them (net/team.mjs)
const refereeThreads = Number(opt('referee-threads', '2'));
// the most players a room holds (spectators aside); a joiner past it is refused FULL
const maxPlayers = Math.max(1, Math.min(W.NP, Number(opt('max-players', String(W.NP)))));
const statusPath = opt('status', '');
const onlinePath = opt('online', '');
// A missing player's word: the tap bits clear on every tick it's missing (so
// a jump or a press fires once), the held bits after HOLD_TICKS of them (so a
// player who drops stops walking). Golf's layout, which arena and bumper keep;
// a game whose input word differs passes its own.
const TAP_MASK = Number(opt('tap-mask', String(W.JUMP_BIT))) >>> 0;
const HOLD_MASK = Number(opt('hold-mask', String(W.MOVE_BITS))) >>> 0;
const HOLD_TICKS = 30;
const REFEREE_LAG_S = Number(opt('referee-lag', '10'));

const cert = await Deno.readTextFile('certs/cert.pem');
const key = await Deno.readTextFile('certs/key.pem');
// the sim the room runs, golf's game.wasm unless named; a hello names its sim's
// hash, so a client of another sim never meets the room
const wasmPath = opt('wasm', 'build/game.wasm');
const wasm = await Deno.readFile(wasmPath);
const prefix = await W.wasmPrefix(wasm);
// the name the status gives: build/<game>/game.wasm's directory, and golf's own is build/game.wasm
const game = opt('game', ((d) => (d && d !== 'build' ? d : 'golf'))(wasmPath.split('/').slice(-2, -1)[0]));
// The sim may be someone else's: the referee gives it the shared memory and
// nothing else, so it can't reach a file or a socket, and a module that asks
// for more is refused here, by name, rather than failing in the Worker
// (net/sim-check.mjs, which the kit's room pool checks with too).
{
  const why = await simRefusal(wasm, refereeThreads);
  if (why) { console.error(`relay: ${wasmPath}: ${why}`); Deno.exit(2); }
}

// Elo Pros: sign-in and rated results (net/elo.mjs).
const eloOrigin = opt('elo', 'https://elopros.com').replace(/\/+$/, '');
const signinDomains = opt('signin-domains', '') ? opt('signin-domains', '').split(',') : [];
const eloWho = opt('elo-key-id', '');
const eloKey = opt('elo-key', '') ? await Elo.loadKey(await Deno.readTextFile(opt('elo-key', ''))) : null;
if (eloKey && !/^[a-z0-9-]+\/[a-z0-9-]+$/.test(eloWho)) { console.error('relay: --elo-key needs --elo-key-id <slug>/<key id>'); Deno.exit(2); }
// only Fireplace's world says where each player came in a game (FP_LAST)
const rated = !!eloKey && game === 'fireplace';
if (eloKey && !rated) console.error(`relay: --elo-key: only Fireplace's build reports results, not ${game}'s`);

type Slot = {
  slot: number; joinTick: number; leaveTick: number; writer: WritableStreamDefaultWriter<Uint8Array>; ctl: WritableStreamDefaultWriter<Uint8Array>;
  maxDatagram: number; last: number; missing: number; late: number; lastSlack: number; periodSlack: number; contig: number; lastRecv: number; pendingLate: number; close: () => void;
  words: Uint32Array; wordTick: Int32Array; arrival: Float64Array;
  // ticks from fromTick on reach this client by bundle or repair (before it, by its last fill)
  fromTick: number; repairTick: Int32Array; repairAt: Float64Array;
  keys: number; syncing: boolean; lastSync: number; lastDesync: number; lastReport: number; reports: Map<number, bigint>;
  token: number; // a native session's, 0 for WebTransport
  watch: boolean; // a spectator: no slot (slot -1), no words
  looks?: boolean; // its hello asked for the room's looks (W.HELLO_LOOKS)
  avatars?: boolean; // and for its avatars (W.HELLO_AVATARS)
  nonce?: string; // the sign-in nonce it was handed, once its hello asked (W.HELLO_SIGNIN)
  wallet?: string; // the wallet signed in on this slot
  since?: number; // when it signed in, unix seconds
  signing?: boolean; // a sign-in is being checked
  ghost?: boolean; // a slot held for its player after a takeover, with no session
  leave?: (why: string) => void;
};
// How a session reaches its client: its stream (read and write) and its datagrams.
type Door = {
  sr: ReturnType<typeof W.bufferedReader>; sw: WritableStreamDefaultWriter<Uint8Array>;
  datagrams: { write(b: Uint8Array): Promise<unknown> }; close: () => void;
  maxDatagram: number; // 0: whatever the client's hello says, up to W.MAX_DATAGRAM
  token: number;
};

const E = performance.now();
// tick t closes at E0 + (t + 1) ticks; a standby that takes a room over moves E0 onto the old clock's timeline
let E0 = E;
const deadline = (t: number) => E0 + W.TICK_MS * (t + 1);
let closed = -1;
const slots: (Slot | null)[] = new Array(W.NP).fill(null);
const watchers = new Set<Slot>();
function* everyone() { for (const s of slots) if (s) yield s; yield* watchers; }
// a session that has left (or a slot since taken by someone else)
const gone = (s: Slot) => (s.watch ? !watchers.has(s) : slots[s.slot] !== s);
// Each slot's look (client/looks.mjs): drawing only, beside the sim and never
// in the record, the replay or a hash. A session that asked for looks gets the
// table after its welcome and then what changed, at most every LOOKS_MS; a
// slot that empties goes back to 0, the house look.
const looks = new Uint32Array(W.NP);
const lookDirty = new Set<number>();
const LOOKS_MS = 250;
const lookTable = () => [...looks.keys()].filter((p) => looks[p]).map((p) => [p, looks[p]] as [number, number]);
const sendLooks = (s: Slot, pairs: [number, number][]) => { if (s.looks && pairs.length) s.ctl.write(W.encodeLooks(pairs)).catch(() => {}); };
const setLook = (p: number, look: number) => { if (looks[p] !== look >>> 0) { looks[p] = look >>> 0; lookDirty.add(p); } };
// Each signed-in slot's avatar, read off its Elo Pros face (/api/face/{wallet}
// `avatar`, client/avatar.mjs) when it signs in: drawing only, as a look is,
// sent to the sessions that asked (W.HELLO_AVATARS) the same way.
const avatars = new Uint32Array(W.NP);
const avatarDirty = new Set<number>();
const avatarTable = () => [...avatars.keys()].filter((p) => avatars[p]).map((p) => [p, avatars[p]] as [number, number]);
const sendAvatars = (s: Slot, pairs: [number, number][]) => { if (s.avatars && pairs.length) s.ctl.write(W.encodeLooks(pairs, W.T_AVATAR)).catch(() => {}); };
const setAvatar = (p: number, w: number) => { if (avatars[p] !== w >>> 0) { avatars[p] = w >>> 0; avatarDirty.add(p); } };
async function readAvatar(s: Slot, wallet: string) {
  try {
    const r = await fetch(`${eloOrigin}/api/face/${wallet}`);
    const j = r.ok ? await r.json() : null;
    const w = j && Number.isInteger(j.avatar) && j.avatar >= 2 ** 31 && j.avatar < 2 ** 32 ? j.avatar : 0;
    if (!gone(s) && s.wallet === wallet) setAvatar(s.slot, w);
  } catch { /* no face, no avatar: the look's own body */ }
}
// Who was signed in on each slot, and over which ticks (to is the leave's
// tick): a result reads it at the tick its game ended, which the referee
// reports a moment later. The newest SEATS are kept.
const seats: { slot: number; wallet: string; from: number; to: number }[] = [];
const SEATS = 4096;
const walletAt = (slot: number, t: number) => seats.findLast((x) => x.slot === slot && x.from <= t && t < x.to)?.wallet ?? null;
// every slot's word on the newest closed tick (0 for a slot nobody holds): what the next tick is coded against
let prevWords = new Uint32Array(W.NP);
let events: { slot: number; kind: number; tick: number }[] = [];
// The room: its sim began at roomStart (-1 while nobody is in it) on roomSeed,
// and record[T - recordStart] is closed tick T, its parts as encodeTick gives
// them. recordStart is roomStart, or on an edge the keyframe it began from.
let roomStart = -1;
let recordStart = -1;
let roomSeed = newSeed();
let record: Uint8Array[][] = [];
// The record's oldest tick still held. A root relay that saves no replay lets
// go of ticks older than RECORD_KEEP, which nothing asks for again (a fill
// starts at the referee's keyframe, no more than --referee-lag behind; a
// repair is for a recent hole): otherwise a room that never empties holds
// every tick it ever closed, about 240 MB an hour with 128 in.
let recordKept = -1;
const trimRecord = !replaysDir && !upstreams.length;
const RECORD_KEEP = Math.ceil((REFEREE_LAG_S + 20) * 1000 / W.TICK_MS);
// for the replay: the region the record starts from (an edge's keyframe; null
// from the room's start) and the referee's interval hashes over it
let recordRegion: Uint8Array | null = null;
let recordHashes: [number, bigint][] = [];
// on an edge, the newest recorded tick's words and the players in the world: what a takeover starts from
const recBase = new W.TickBase();
const recLive = new Set<number>();
// The room's tick now, fractional, as pongs tell it: the clock's, or on an edge the upstream's.
let serverNow = () => (performance.now() - E0) / W.TICK_MS;
// The per-tick samples (closeLate, slack) keep the newest SAMPLES, the oldest
// overwritten in turn: a room that never empties (a pool's, its guests always
// in) would otherwise grow them without end, 16,000 slack samples a second
// with 128 in, until the array passes V8's length limit and the relay dies in
// about 2 h 20 min. A gate's run fits whole (240 s of 128 guests is 3.8 M).
// The interval hashes (the referee's, each player's reports) keep the newest
// HASHES and PLAYER_HASHES the same way, n the interval's number.
const SAMPLES = 1 << 22, HASHES = 1 << 17, PLAYER_HASHES = 1 << 10;
const sample = <T>(a: T[], n: number, v: T, cap = SAMPLES) => { if (a.length < cap) a.push(v); else a[n % cap] = v; };
const stats = {
  ticks: 0, closeLate: [] as number[], stallEvents: [] as number[][], sent: 0, sentBytes: 0, maxBundle: 0, bundles: 0, bundleBytes: 0, tickBytes: 0, maxTick: 0, lateArrivals: 0,
  recv: 0, recvBytes: 0, onTime: 0, substituted: 0, sessions: 0, rejected: 0, slack: [] as number[], activeTicks: 0, activeSlotTicks: 0, silent: 0, warmup: 0,
  leaves: {} as Record<string, number>, leaveAt: [] as number[],
  serverMaxDatagram: [] as number[], clientMaxDatagram: [] as number[], cc, fills: 0, fillTicks: 0,
  repairs: 0, repairTicks: 0, pongs: 0, keys: [] as Record<string, number>[], compared: 0, agreed: 0,
  mismatches: [] as Record<string, unknown>[], dumps: [] as string[], refLagMax: 0, refErrors: [] as string[],
  refHashes: [] as [number, string][], reports: {} as Record<number, [number, string][]>,
  replays: [] as string[], watchSessions: 0, watchMax: 0, watchBytes: 0, watchSeconds: 0, watchCompared: 0, watchAgreed: 0,
  resumed: 0, takeover: null as null | Record<string, number>,
  elo: { signins: 0, signed: 0, refused: 0, unchecked: 0, results: 0, unrated: 0, reported: 0, failed: 0, matches: [] as string[] },
};

// The referee: closed ticks go to it in batches; interval hashes and packed keyframes come back.
const referee = new Worker(new URL('./referee-worker.mjs', import.meta.url).href, { type: 'module' });
referee.postMessage({ wasm, threads: refereeThreads, results: rated });
let toReferee: Uint8Array[][] = [];
let refRoom = 0; // the referee's generation: a room's start, or an edge's restart from a keyframe
const refIntervals = new Map<number, { hash: bigint; digests: Uint8Array }>(); // sim tick -> the referee's
let keyId = 0;
const keyWaiters = new Map<number, (k: { tick: number; raw: number; packed: Uint8Array }) => void>();
// where the referee had got to (sim tick), and when it said so: the watchdog's reading
let refAt = 0;
referee.onmessage = (e: MessageEvent) => {
  const m = e.data;
  if (m.error) { stats.refErrors.push(m.error); console.error('referee: ' + m.error); return; }
  if (m.room !== refRoom) return;
  if (m.at !== undefined) refAt = m.at;
  if (m.key) { keyWaiters.get(m.key.id)?.(m.key); keyWaiters.delete(m.key.id); }
  if (m.intervals) {
    for (const iv of m.intervals) {
      refIntervals.set(iv.tick, iv);
      if (!trimRecord) recordHashes.push([iv.tick, iv.hash]);
      sample(stats.refHashes, iv.tick >> 7, [iv.tick, iv.hash.toString(16)], HASHES);
      for (const s of everyone()) check(s, iv.tick);
      if (edge) up.report = { interval: iv.tick, hash: iv.hash, left: 8 };
    }
    for (const t of refIntervals.keys()) if (t < m.at - 16 * 128) refIntervals.delete(t);
    stats.refLagMax = Math.max(stats.refLagMax, closed - roomStart - m.at);
  }
  // an edge's referee sees the same ends; the room's own relay reports them
  if (m.results && rated && !edge) for (const r of m.results) reportResult(r);
};

// A game's end, as the referee read it, to Elo Pros's ratings: the players
// signed in on its slots at the tick it ended, at the places it gave them.
function reportResult(result: { tick: number; game: number; count: number; places: [number, number][] }) {
  stats.elo.results++;
  const at = roomStart + result.tick;
  const match = Elo.matchOf({ seed: roomSeed, roomStart, result, wallet: (slot: number) => walletAt(slot, at) });
  if (!match) { stats.elo.unrated++; log(`game ${result.count} ended with fewer than two signed in: not rated`); return; }
  stats.elo.matches.push(match.id);
  postReport(match);
}
async function postReport(match: object) {
  const path = `/api/ratings/${eloWho.split('/')[0]}/report`;
  const body = new TextEncoder().encode(JSON.stringify({ matches: [match] }));
  for (let k = 0; k < 4; k++) {
    try {
      const headers = await Elo.serverHeaders(eloKey!, eloWho, 'POST', path, body);
      const r = await fetch(eloOrigin + path, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body });
      const text = await r.text();
      if (r.ok) { stats.elo.reported++; log(`rated: ${text.slice(0, 200)}`); return; }
      // a refusal says why, and sending it again would get the same answer
      if (r.status < 500 && r.status !== 429) { stats.elo.failed++; console.error(`relay: ratings refused the match (${r.status}): ${text.slice(0, 300)}`); return; }
    } catch (e) { log(`ratings: ${e}`); }
    await new Promise((ok) => setTimeout(ok, 2000 * 2 ** k));
  }
  stats.elo.failed++;
  console.error('relay: ratings could not be reached; the match went unreported');
}

// A player's sign-in: the message their wallet signed, made on one of our
// domains with the nonce this slot was handed, checked by Elo Pros. Every
// answer comes with a fresh nonce, so a nonce is used once.
async function signIn(s: Slot, message: string, signature: string) {
  if (!signinDomains.length || s.watch) { s.ctl.write(W.encodeSigned(Elo.SIGNIN.OFF)).catch(() => {}); return; }
  if (s.signing) return;
  stats.elo.signins++;
  const f = Elo.parseSignIn(message);
  let status: number = Elo.SIGNIN.REFUSED, wallet = '';
  if (f && signinDomains.includes(f.domain) && f.nonce === s.nonce && signature.length <= Elo.SIGNATURE_MAX) {
    s.signing = true;
    try {
      const r = await fetch(`${eloOrigin}/api/signin/check`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, signature, domain: f.domain, nonce: f.nonce }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok && typeof j.address === 'string') { status = Elo.SIGNIN.SIGNED; wallet = Elo.normWallet(j.address); }
      else if (r.status >= 500 || r.status === 429) status = Elo.SIGNIN.UNCHECKED;
    } catch { status = Elo.SIGNIN.UNCHECKED; }
    s.signing = false;
  }
  if (gone(s)) return;
  // one seat a wallet, so a room never ranks a wallet against itself
  if (status === Elo.SIGNIN.SIGNED && slots.some((o) => o && o !== s && !o.ghost && o.wallet === wallet)) status = Elo.SIGNIN.ELSEWHERE;
  if (status === Elo.SIGNIN.SIGNED) {
    for (const x of seats) if (x.slot === s.slot && x.to === Infinity) x.to = closed + 1;
    s.wallet = wallet;
    s.since = Math.floor(Date.now() / 1000);
    seats.push({ slot: s.slot, wallet, from: closed + 1, to: Infinity });
    if (seats.length > SEATS) seats.splice(0, seats.length - SEATS);
    stats.elo.signed++;
    readAvatar(s, wallet);
  } else if (status === Elo.SIGNIN.UNCHECKED) stats.elo.unchecked++;
  else stats.elo.refused++;
  log(`slot ${s.slot} sign-in: ${status}${wallet ? ' ' + wallet : ''}`);
  s.nonce = Elo.newNonce();
  s.ctl.write(W.encodeSigned(status, wallet)).catch(() => {});
  s.ctl.write(W.encodeSigninNonce(s.nonce)).catch(() => {});
}
// The record and the referee from tick `start`: a room's first tick, or the
// keyframe an edge begins from (its region; null at the room's start).
function startRecord(start: number, region: Uint8Array | null = null) {
  recordStart = recordKept = start;
  record = [];
  recordRegion = region;
  recordHashes = [];
  recBase.reset();
  recLive.clear();
  if (region) {
    recBase.seed(region);
    for (let p = 0; p < W.NP; p++) if (region[L.PLAYERS - L.REGION + p * L.PSIZE + L.P_FL] & L.PF_LIVE) recLive.add(p);
  }
  toReferee = [];
  refIntervals.clear();
  refAt = region ? start - roomStart : 0;
  referee.postMessage({ reset: { room: ++refRoom, seed: roomSeed, region } });
}
// The record so far as a replay file, the room's seed and the time in its name.
function saveReplay() {
  if (!replaysDir || recordStart < 0 || !record.length) return Promise.resolve();
  const file = `${replaysDir}/${roomSeed.toString(16).padStart(8, '0')}-${new Date().toISOString().replace(/[:.]/g, '-')}.qgr`;
  const r = { prefix, seed: roomSeed, roomStart, from: recordStart, ticks: record, hashes: recordHashes, region: recordRegion };
  stats.replays.push(file);
  return Deno.mkdir(replaysDir, { recursive: true }).then(async () => Deno.writeFile(file, await encodeReplay(r))).catch((e) => console.error('relay: replay: ' + e));
}
function startRoom(start: number) {
  roomStart = start;
  startRecord(start);
}
// The referee's newest keyframe; if it doesn't answer in 5 s, the room's start
// (raw 0: the client inits from the seed), if the record holds it.
function keyframe(): Promise<{ tick: number; raw: number; packed: Uint8Array }> {
  const id = ++keyId;
  return new Promise((ok) => {
    keyWaiters.set(id, ok);
    referee.postMessage({ room: refRoom, want: id });
    if (recordStart === roomStart && recordKept === recordStart) setTimeout(() => { if (keyWaiters.delete(id)) ok({ tick: 0, raw: 0, packed: new Uint8Array(0) }); }, 5000);
  });
}

// A keyframe and the record since it, on the client's stream. Ticks after the
// fill reach it by bundle or repair. Its reports from before it restores this
// one carry the old epoch and are dropped.
async function sendKey(s: Slot, reason: number, desync?: { interval: number; digests: Uint8Array }) {
  if (s.syncing) return;
  s.syncing = true;
  s.lastSync = performance.now();
  const room = roomStart;
  const gen = refRoom;
  log(`key for slot ${s.slot} asked: reason ${reason}`);
  const k = await keyframe();
  if (room !== roomStart || gen !== refRoom || gone(s)) { log(`key for slot ${s.slot} dropped: room ${room} now ${roomStart}`); s.syncing = false; return; }
  const tick = room + k.tick;
  const to = closed + 1;
  if (tick < recordKept) { log(`key for slot ${s.slot} dropped: sim tick ${k.tick} is older than the record held`); s.syncing = false; return; }
  const ticks = record.slice(tick - recordStart, Math.max(tick - recordStart, to - recordStart));
  const fill = W.encodeFill(tick, ticks);
  s.fromTick = to;
  s.keys++;
  s.reports.clear();
  s.lastReport = k.tick;
  stats.fills++;
  stats.fillTicks += ticks.length;
  log(`key to slot ${s.slot}: reason ${reason}, sim tick ${k.tick}, ${k.packed.length} B, fill ${ticks.length}`);
  stats.keys.push({ slot: s.slot, reason, at: Number(((performance.now() - E) / 1000).toFixed(2)), simTick: k.tick, packed: k.packed.length, fillTicks: ticks.length });
  // three writes queued back to back, so nothing lands between them
  s.ctl.write(W.encodeKeyHead({ reason, tick, raw: k.raw, packed: k.packed.length, interval: desync?.interval, digests: desync?.digests })).catch(() => {});
  s.ctl.write(k.packed).catch(() => {});
  await s.ctl.write(fill).catch(() => {});
  s.syncing = false;
}

// A client's interval hash against the referee's, once both are in.
const RESYNC_MS = 5000;
function check(s: Slot, interval: number) {
  const ref = refIntervals.get(interval);
  const h = s.reports.get(interval);
  if (!ref || h === undefined) return;
  s.reports.delete(interval);
  stats.compared++;
  if (s.watch) stats.watchCompared++;
  if (ref.hash === h) { stats.agreed++; if (s.watch) stats.watchAgreed++; return; }
  const now = performance.now();
  stats.mismatches.push({ slot: s.slot, watch: s.watch, interval, at: Number(((now - E) / 1000).toFixed(2)), client: h.toString(16), referee: ref.hash.toString(16) });
  // (an edge's record starts at a keyframe, not the room's start: no log to replay)
  if (stats.dumps.length < 4 && recordStart === roomStart && recordKept === recordStart) {
    // the room's record as a log the harness replays: the desync's repro case
    const file = `traces/desync-${roomStart}-${interval}.qgl`;
    stats.dumps.push(file);
    Deno.mkdir('traces', { recursive: true }).then(() => Deno.writeFile(file, recordLog(record, roomSeed))).catch(() => {});
  }
  if (now - s.lastDesync < RESYNC_MS) return;
  s.lastDesync = now;
  sendKey(s, W.SYNC.DESYNC, { interval, digests: ref.digests });
}

// Every tick an ack shows missing, resent from the record, each at most every
// REPAIR_MS: a run of consecutive ticks per datagram, a few datagrams per ack.
const REPAIR_MS = 100;
function repair(s: Slot, ackTick: number, ackBits: bigint, now: number) {
  if (recordStart < 0 || s.fromTick > closed) return;
  const due = W.holes(ackTick, ackBits, Math.max(s.fromTick, recordKept)).filter((t: number) => {
    if (t > closed) return false;
    const i = t & (W.RING - 1);
    return s.repairTick[i] !== t || now - s.repairAt[i] >= REPAIR_MS;
  });
  if (!due.length) return;
  const list = due.map((t: number) => ({ tick: t, parts: record[t - recordStart] }));
  for (const buf of W.encodeTicks(W.T_REPAIR, list, Math.min(W.MAX_DATAGRAM, s.maxDatagram)).slice(0, 4)) {
    const ticks = new Set(W.decodeTicks(buf)!.entries.map((e: { tick: number }) => e.tick));
    for (const t of ticks) { s.repairTick[t & (W.RING - 1)] = t; s.repairAt[t & (W.RING - 1)] = now; }
    s.writer.write(buf).catch(() => {});
    stats.repairs++;
    stats.repairTicks += ticks.size;
  }
}

function freeSlot() {
  if (slots.reduce((n, s) => n + (s ? 1 : 0), 0) >= maxPlayers) return -1;
  return slots.findIndex((s) => s === null);
}

// At most 8 join/leave events per tick, so a room that fills at once fills
// over 32 ticks, and the keyframes its joiners ask for come in turn.
const EVENTS_PER_TICK = 8;
const eventsAt = new Map<number, number>();
function scheduleEvent(slot: number, kind: number, earliest: number) {
  let t = earliest;
  while ((eventsAt.get(t) || 0) >= EVENTS_PER_TICK) t++;
  eventsAt.set(t, (eventsAt.get(t) || 0) + 1);
  events.push({ slot, kind, tick: t });
  return t;
}

// No input for this long and the player has left, whatever QUIC says: this
// long of the relay running smoothly, so its own stall never looks like silence.
const SILENT_MS = 2000;
let stallEnd = -Infinity;
// The first half second after a join, while the client's lead converges (F10's cold start).
const WARMUP = 64;

function onInput(s: Slot, buf: Uint8Array, now: number) {
  s.lastRecv = now;
  stats.recv++;
  stats.recvBytes += buf.length;
  const m = W.decodeInput(buf);
  if (!m) return;
  repair(s, m.ackTick, m.ackBits, now);
  const r = m.report;
  // each interval once (a client repeats its report), and only from the current keyframe on
  if (r && r.interval > s.lastReport && r.epoch === (s.keys & 255)) {
    s.lastReport = r.interval;
    s.reports.set(r.interval, r.hash);
    if (!s.watch) sample(stats.reports[s.slot] ||= [], r.interval >> 7, [r.interval, r.hash.toString(16)], PLAYER_HASHES);
    for (const t of s.reports.keys()) if (t < r.interval - 16 * 128) s.reports.delete(t);
    check(s, r.interval);
  }
  for (let k = 0; k < m.words.length; k++) {
    const t = m.firstTick + k;
    if (t < s.joinTick || t > closed + W.RING - 8) continue;
    const i = t & (W.RING - 1);
    if (t <= closed) {
      // Too late for its tick. Still feed it back, as negative slack, so the
      // client's lead controller sees the lateness and grows its lead.
      // Count each late tick once. A slot only moves forward: tick t shares it
      // with t + 256, which may already be in, and must not be overwritten.
      if (s.wordTick[i] < t) {
        s.periodSlack = Math.min(s.periodSlack, deadline(t) - now);
        stats.lateArrivals++;
        s.wordTick[i] = t;
        s.arrival[i] = now;
      }
      continue;
    }
    if (s.wordTick[i] !== t) { s.wordTick[i] = t; s.words[i] = m.words[k]; s.arrival[i] = now; }
  }
  // A player still sending after missed deadlines was late, not gone.
  stats.substituted += s.pendingLate;
  s.pendingLate = 0;
  // in_ack: closed ticks are settled either way; then whatever has arrived beyond them
  s.contig = Math.max(s.contig, closed);
  while (s.wordTick[(s.contig + 1) & (W.RING - 1)] === s.contig + 1) s.contig++;
}

function closeTick(T: number, now: number) {
  stats.ticks++;
  sample(stats.closeLate, stats.ticks, now - deadline(T));
  const row = new Uint32Array(W.NP);
  const dl = deadline(T);
  let active = 0;
  for (let p = 0; p < W.NP; p++) {
    const s = slots[p];
    if (!s || T < s.joinTick) continue;
    if (T >= s.leaveTick) { stats.silent += s.pendingLate; slots[p] = null; setLook(p, 0); setAvatar(p, 0); continue; }
    if (s.leaveTick === Infinity && now - Math.max(s.lastRecv, stallEnd) > SILENT_MS) {
      stats.leaves.silent = (stats.leaves.silent || 0) + 1;
      stats.leaveAt.push(Number(((now - E) / 1000).toFixed(2)));
      s.leaveTick = scheduleEvent(p, W.EV_LEAVE, Math.max(T + 1, s.joinTick));
      try { s.close(); } catch { /* already gone */ }
    }
    active++;
    const i = T & (W.RING - 1);
    if (s.wordTick[i] === T && s.arrival[i] <= dl) {
      row[p] = s.words[i];
      s.last = row[p];
      s.missing = 0;
      s.lastSlack = dl - s.arrival[i];
      s.periodSlack = Math.min(s.periodSlack, s.lastSlack);
      if (T >= s.joinTick + WARMUP) { sample(stats.slack, stats.onTime, s.lastSlack); stats.onTime++; }
    } else {
      // repeat the last real input, jump cleared, shot counter unchanged (so no
      // shot fires); after ~30 missing ticks the keys decay to idle
      s.missing++;
      s.late++;
      // booked as late once any later datagram arrives from this player (onInput);
      // the ticks after a player's last packet are a departure, not lateness
      if (T < s.joinTick + WARMUP) stats.warmup++;
      else s.pendingLate++;
      row[p] = s.missing > HOLD_TICKS ? (s.last & ~(HOLD_MASK | TAP_MASK)) >>> 0 : (s.last & ~TAP_MASK) >>> 0;
      // read after its deadline but before this (delayed) close: late too
      if (s.wordTick[i] === T) { s.periodSlack = Math.min(s.periodSlack, dl - s.arrival[i]); stats.lateArrivals++; }
    }
  }
  if (active) { stats.activeTicks++; stats.activeSlotTicks += active; }
  const parts = W.encodeTick(events.filter((e) => e.tick === T).map(({ slot, kind }) => ({ slot, kind })), prevWords, row);
  prevWords = row;
  if (roomStart >= 0 && T >= roomStart) {
    const bytes = parts.reduce((a: number, p: Uint8Array) => a + p.length, 0);
    stats.tickBytes += bytes;
    stats.maxTick = Math.max(stats.maxTick, bytes);
    record.push(parts);
    if (trimRecord) for (; recordKept < T - RECORD_KEEP; recordKept++) record[recordKept - recordStart] = undefined!;
    toReferee.push(parts);
    // the last one out: the next joiner starts a new room, and its spectators go
    if (!slots.some((x) => x)) {
      saveReplay();
      roomStart = recordStart = recordKept = -1; record = []; toReferee = []; roomSeed = newSeed();
      for (const w of [...watchers]) w.leave?.('room-ended');
    }
  }
  closed = T;
  if (T % W.SEND_EVERY === W.SEND_EVERY - 1) broadcast(T);
}

function broadcast(T: number) {
  if (toReferee.length) { referee.postMessage({ room: refRoom, ticks: toReferee }); toReferee = []; }
  events = events.filter((e) => e.tick > T - W.NB - 4);
  for (const t of eventsAt.keys()) if (t <= T - W.NB) eventsAt.delete(t);
  if (recordStart < 0) return;
  const ticks = [];
  for (let t = Math.max(recordStart, T - W.NB + 1); t <= T; t++) ticks.push({ tick: t, parts: record[t - recordStart] });
  const now = performance.now();
  stats.watchSeconds += watchers.size * W.SEND_EVERY * W.TICK_MS / 1000;
  // the datagrams are the same for everyone with the same size limit: encode
  // them once per limit, then copy and stamp each recipient's trailer
  const byMax = new Map<number, Uint8Array[]>();
  for (const s of everyone()) {
    if (s.ghost) continue;
    // a spectator that has stopped acking has gone, whatever its connection says
    if (s.watch && now - Math.max(s.lastRecv, stallEnd) > SILENT_MS) { s.leave?.('silent'); continue; }
    const max = Math.min(W.MAX_DATAGRAM, s.maxDatagram);
    let dgs = byMax.get(max);
    if (!dgs) byMax.set(max, dgs = W.encodeTicks(W.T_BUNDLE, ticks, max));
    // the worst slack since the last bundle, late arrivals included, so the
    // client's lead controller reacts to lateness it would otherwise never see
    const slack = s.watch ? 0 : Number.isFinite(s.periodSlack) ? s.periodSlack : s.lastSlack;
    s.periodSlack = Infinity;
    stats.bundles++;
    for (const d of dgs) {
      const buf = W.stampTrailer(d.slice(), { inAck: s.watch ? closed : s.contig, slack, late: s.late });
      stats.maxBundle = Math.max(stats.maxBundle, buf.length);
      stats.sent++;
      if (s.watch) stats.watchBytes += buf.length;
      else stats.sentBytes += buf.length;
      stats.bundleBytes += buf.length;
      s.writer.write(buf).catch(() => { /* Deno resolves datagram writes; failures show up as closes */ });
    }
  }
}

const channel = new MessageChannel();
channel.port1.onmessage = () => pump();
function pump() {
  const now = performance.now();
  // a wakeup more than a tick late: [ms since start, ms behind], for lining up with --trace-gc
  const behind = now - deadline(closed + 1);
  if (behind > W.TICK_MS && stats.stallEvents.length < 1000) stats.stallEvents.push([Number(now.toFixed(1)), Number(behind.toFixed(1))]);
  // datagrams that came in during a stall are still unread
  if (behind > 4 * W.TICK_MS) stallEnd = now;
  while (deadline(closed + 1) <= now) closeTick(closed + 1, now);
  const wait = deadline(closed + 1) - performance.now();
  // an empty room has nobody to be on time for: a plain timer, not the yield loop
  // (a waiting room costs about a third as much, which a pool's free rooms add up to)
  if (!precise || (roomStart < 0 && !watchers.size)) setTimeout(pump, Math.max(0, wait));
  else if (wait > EARLY_MS) setTimeout(pump, wait - EARLY_MS);
  else channel.port2.postMessage(0);
}

// A session from its hello on: the slot, the welcome, the join's keyframe,
// then the stream's requests (pings, and resyncs for a hole too old to repair
// or a client far behind, at most one a second) until it ends. Returns the
// slot, with a leave(why) that schedules the leave, or null if it was refused.
async function admit(d: Door) {
  const hello = W.decodeHello(await d.sr.read(24));
  const watch = !!hello?.watch;
  // a player back for the slot a ghost holds (else a resume is a join)
  const held = !watch && hello && hello.resume >= 0 && hello.room === roomStart >>> 0 ? slots[hello.resume] : null;
  const claim = held?.ghost && held.leaveTick === Infinity ? held : null;
  const p = watch ? -1 : claim ? claim.slot : freeSlot();
  let reason = 0;
  if (!hello || hello.proto !== W.PROTO) reason = W.REJECT.PROTO;
  else if (hello.wasmPrefix.some((b: number, i: number) => b !== prefix[i])) reason = W.REJECT.WASM;
  else if (edge && !watch) reason = W.REJECT.WATCH_ONLY;
  else if (watch && recordStart < 0) reason = W.REJECT.EMPTY;
  else if (watch ? watchers.size >= MAX_WATCHERS : p < 0) reason = W.REJECT.FULL;
  if (reason) {
    stats.rejected++;
    await d.sw.write(W.encodeReject(reason)).catch(() => {});
    await d.sw.close().catch(() => {});
    return null;
  }
  const maxDatagram = d.maxDatagram || Math.min(W.MAX_DATAGRAM, hello!.maxDatagram);
  stats.serverMaxDatagram.push(maxDatagram);
  stats.clientMaxDatagram.push(hello!.maxDatagram);
  const joinTick = watch || claim ? closed + 1 : scheduleEvent(p, W.EV_JOIN, closed + 1 + 4);
  if (roomStart < 0) startRoom(joinTick);
  const s = newSlot(p, joinTick, { writer: d.datagrams as WritableStreamDefaultWriter<Uint8Array>, ctl: d.sw, maxDatagram, close: d.close, token: d.token, watch, looks: hello!.looks, avatars: hello!.avatars });
  // the ghost's word goes on until this player's first one lands
  if (claim) { s.last = claim.last; s.missing = claim.missing; stats.resumed++; }
  if (watch) {
    watchers.add(s);
    stats.watchSessions++;
    stats.watchMax = Math.max(stats.watchMax, watchers.size);
  } else {
    slots[p] = s;
    stats.sessions++;
  }
  await d.sw.write(W.encodeWelcome({ slot: p, maxDatagram, joinTick, seed: roomSeed, serverTick: Math.floor(serverNow()) + 1, roomStart, token: d.token, watch }));
  log(`${watch ? 'a spectator' : `slot ${p}`} joins at ${joinTick}, room ${roomStart}${d.token ? ' (native)' : ''}`);
  sendLooks(s, lookTable());
  sendAvatars(s, avatarTable());
  if (hello!.signin && !watch) {
    if (signinDomains.length) { s.nonce = Elo.newNonce(); d.sw.write(W.encodeSigninNonce(s.nonce)).catch(() => {}); }
    else d.sw.write(W.encodeSigned(Elo.SIGNIN.OFF)).catch(() => {});
  }
  sendKey(s, W.SYNC.JOIN);
  const leave = (why: string) => {
    if (watch) {
      if (!watchers.delete(s)) return;
      if (s.token) natives.delete(s.token);
      try { s.close(); } catch { /* already closed */ }
      return;
    }
    if (s.leaveTick !== Infinity) return;
    stats.leaves[why] = (stats.leaves[why] || 0) + 1;
    stats.leaveAt.push(Number(((performance.now() - E) / 1000).toFixed(2)));
    s.leaveTick = scheduleEvent(p, W.EV_LEAVE, Math.max(closed + 1, s.joinTick));
    if (s.wallet) for (const x of seats) if (x.slot === p && x.to === Infinity) x.to = s.leaveTick;
    if (s.token) natives.delete(s.token);
    // the slot is gone at leaveTick, so end the session too rather than leave it open and silent
    try { s.close(); } catch { /* already closed */ }
  };
  (async () => {
    for (;;) {
      const buf = await d.sr.read(16);
      if (buf.length < 16) break;
      const m = W.decodeClient(buf);
      if (m?.type === W.T_SIGNIN) {
        const n = m.bytes ?? 0;
        if (n > Elo.MESSAGE_MAX + Elo.SIGNATURE_MAX) break;
        const body = await d.sr.read(n);
        if (body.length < n) break;
        const { message, signature } = W.decodeSigninBody(buf, body);
        signIn(s, message, signature);
      }
      if (m?.type === W.T_PING) { stats.pongs++; s.ctl.write(W.encodePong(m.nonce, serverNow())).catch(() => {}); }
      if (m?.type === W.T_SYNC && performance.now() - s.lastSync > 1000) sendKey(s, m.reason);
      if (m?.type === W.T_LOOK && !watch && !gone(s)) setLook(p, m.look ?? 0);
    }
  })().then(() => leave('stream-end'), () => leave('stream-error'));
  s.leave = leave;
  return { s, leave };
}

function newSlot(slot: number, joinTick: number, o: Partial<Slot>): Slot {
  return {
    slot, joinTick, leaveTick: Infinity, writer: nowhere, ctl: nowhere, maxDatagram: W.MAX_DATAGRAM,
    last: 0, missing: 0, late: 0, lastSlack: 0, periodSlack: Infinity, contig: joinTick - 1, lastRecv: performance.now(), pendingLate: 0, close: () => {},
    words: new Uint32Array(W.RING), wordTick: new Int32Array(W.RING).fill(-1), arrival: new Float64Array(W.RING),
    fromTick: Infinity, repairTick: new Int32Array(W.RING).fill(-1), repairAt: new Float64Array(W.RING),
    keys: 0, syncing: false, lastSync: -1e9, lastDesync: -1e9, lastReport: -1, reports: new Map(), token: 0, watch: false, ...o,
  };
}
const nowhere = { write: () => Promise.resolve() } as unknown as WritableStreamDefaultWriter<Uint8Array>;

async function session(incoming: Deno.QuicIncoming) {
  const conn = await incoming.accept();
  const wt = await Deno.upgradeWebTransport(conn);
  await wt.ready;
  const { value: stream } = await wt.incomingBidirectionalStreams.getReader().read();
  if (!stream) return;
  // A bundle stale by a few ticks still carries ticks its client needs (after a
  // stall here, the catch-up burst is paced out): drop only what a repair would beat.
  try { (wt.datagrams as unknown as { outgoingMaxAge: number }).outgoingMaxAge = 8 * W.TICK_MS; } catch { /* optional */ }
  try { (wt.datagrams as unknown as { incomingHighWaterMark: number }).incomingHighWaterMark = 256; } catch { /* optional */ }
  const joined = await admit({
    sr: W.bufferedReader(stream.readable.getReader()), sw: stream.writable.getWriter(), datagrams: wt.datagrams.writable.getWriter(),
    close: () => wt.close(), maxDatagram: wt.datagrams.maxDatagramSize, token: 0,
  });
  if (!joined) return;
  const { s, leave } = joined;
  // Deno doesn't settle wt.closed when Chrome closes the session, but the
  // stream ends: the client closes it on the way out.
  wt.closed.then((i) => leave('closed:' + JSON.stringify(i)), (e) => leave('closed-error:' + String(e)));
  const dr = wt.datagrams.readable.getReader();
  try {
    for (;;) {
      const { value, done } = await dr.read();
      if (done) break;
      onInput(s, value, performance.now());
    }
  } catch (e) { leave('read-error:' + String(e)); }
  leave('read-end');
}

// The native door: a TCP connection per session for the stream, one UDP socket
// for every session's datagrams. A client's datagram carries its token; the
// address it came from is where that session's bundles go.
const natives = new Map<number, { s: Slot | null; addr: Deno.NetAddr | null }>();
let udp: Deno.DatagramConn | null = null;
async function nativeSession(conn: Deno.TcpConn) {
  conn.setNoDelay(true);
  let token = 0;
  while (!token || natives.has(token)) token = crypto.getRandomValues(new Uint32Array(1))[0];
  const route: { s: Slot | null; addr: Deno.NetAddr | null } = { s: null, addr: null };
  natives.set(token, route);
  const joined = await admit({
    sr: W.bufferedReader(conn.readable.getReader()), sw: conn.writable.getWriter(),
    datagrams: { write: (b: Uint8Array) => (route.addr && udp ? udp.send(b, route.addr) : Promise.resolve(0)) },
    close: () => { try { conn.close(); } catch { /* gone */ } }, maxDatagram: 0, token,
  }).catch(() => null);
  if (!joined) { natives.delete(token); try { conn.close(); } catch { /* gone */ } return; }
  route.s = joined.s;
}
async function nativeDatagrams(sock: Deno.DatagramConn) {
  for (;;) {
    let got: [Uint8Array, Deno.Addr];
    try { got = await sock.receive(); } catch { return; }
    const [buf, addr] = got;
    if (buf.length < 4) continue;
    const n = natives.get(new DataView(buf.buffer, buf.byteOffset, 4).getUint32(0, true));
    if (!n?.s || gone(n.s)) continue;
    n.addr = addr as Deno.NetAddr;
    onInput(n.s, buf.subarray(4), performance.now());
  }
}

function summary() {
  const sorted = (a: number[]) => [...a].sort((x, y) => x - y);
  const cl = sorted(stats.closeLate);
  const sl = sorted(stats.slack);
  const pct = (a: number[], p: number) => { const v = W.percentile(a, p); return v === null ? null : Number(v.toFixed(3)); };
  const slotSecs = stats.activeSlotTicks * W.TICK_MS / 1000;
  return {
    cc: stats.cc, precise, ticks: stats.ticks, activeTicks: stats.activeTicks, sessions: stats.sessions, rejected: stats.rejected,
    leaves: stats.leaves, leaveAtS: { first: Math.min(...stats.leaveAt), last: Math.max(...stats.leaveAt) },
    closeLateMs: { p50: pct(cl, 0.5), p95: pct(cl, 0.95), p99: pct(cl, 0.99), max: pct(cl, 1) },
    // closes more than a whole tick late: the event loop stalled
    stalls: cl.filter((v) => v > W.TICK_MS).length,
    stallEvents: stats.stallEvents,
    inputSlackMs: { p5: pct(sl, 0.05), p50: pct(sl, 0.5) },
    onTime: stats.onTime, substituted: stats.substituted, warmupSubstituted: stats.warmup, silentTicks: stats.silent,
    substitutedPct: stats.onTime + stats.substituted ? Number((100 * stats.substituted / (stats.onTime + stats.substituted)).toFixed(3)) : 0,
    bundlesSent: stats.bundles, bundleDatagrams: stats.sent, maxDatagramSent: stats.maxBundle, lateArrivals: stats.lateArrivals,
    bytesPerBundle: stats.bundles ? Math.round(stats.bundleBytes / stats.bundles) : 0,
    tickBytes: { mean: stats.activeTicks ? Number((stats.tickBytes / stats.activeTicks).toFixed(1)) : 0, max: stats.maxTick },
    fills: stats.fills, fillTicks: stats.fillTicks, repairs: stats.repairs, repairTicks: stats.repairTicks, pongs: stats.pongs,
    keys: stats.keys, compared: stats.compared, agreed: stats.agreed, mismatches: stats.mismatches, dumps: stats.dumps,
    replays: stats.replays, refLagMax: stats.refLagMax, refErrors: stats.refErrors, refHashes: stats.refHashes, reports: stats.reports,
    downKBpsPerSession: slotSecs ? Number((stats.sentBytes / slotSecs / 1000).toFixed(2)) : 0,
    watchers: { sessions: stats.watchSessions, max: stats.watchMax, compared: stats.watchCompared, agreed: stats.watchAgreed,
      downKBpsEach: stats.watchSeconds ? Number((stats.watchBytes / stats.watchSeconds / 1000).toFixed(2)) : 0 },
    upstream: upstreams.length ? { ...upStats, recordStart, rttMs: Number(up.bestRtt.toFixed(2)) } : null,
    resumed: stats.resumed, takeover: stats.takeover, elo: stats.elo,
    upKBpsPerSession: slotSecs ? Number((stats.recvBytes / slotSecs / 1000).toFixed(2)) : 0,
    serverMaxDatagram: { min: Math.min(...stats.serverMaxDatagram), max: Math.max(...stats.serverMaxDatagram) },
    clientMaxDatagram: { min: Math.min(...stats.clientMaxDatagram), max: Math.max(...stats.clientMaxDatagram) },
  };
}

// An edge's way in: it watches the room on an upstream relay (its native door)
// as a spectator would, a lockstep client with no sim of its own beyond the
// referee. Ticks join the record in order as they come down, and every second
// tick a bundle goes out; acks and the referee's hashes go up every 16 ms; a
// hole repairs can't fill asks upstream for a keyframe, and any keyframe after
// the first starts the record and the referee again and resyncs our spectators.
const HOLE_TICKS = 56;
// the stream's messages as readControl gives them, and the welcome
type Ctl = { type: number; reason: number; tick: number; raw: number; packed: Uint8Array; from: number; n: number; body: Uint8Array; nonce: number; serverTick: number };
type Welcome = { roomStart: number; seed: number; token: number; serverTick: number };
const newUp = (from = '') => ({
  from, token: 0, keys: 0, seq: 0, recv: new W.Received(), parts: new W.Parts(), pending: new Map<number, Uint8Array[]>(),
  sBase: 0, sEpoch: 0, bestRtt: Infinity, pingAt: [] as number[], filling: false, syncAt: -1e9, heardAt: performance.now(),
  report: null as null | { interval: number; hash: bigint; left: number },
});
let up = newUp();
const upStats = { links: [] as string[], keys: [] as Record<string, number | string>[], bundles: 0, repairs: 0, ticks: 0, syncs: 0, bytes: 0 };
function offerUp(t: number, parts: Uint8Array[]) {
  if (recordStart < 0 || t < recordStart + record.length) return;
  up.pending.set(t, parts);
  for (let next = recordStart + record.length; up.pending.has(next); next++) {
    const tick = up.pending.get(next)!;
    record.push(tick);
    toReferee.push(tick);
    for (const e of recBase.apply(tick).events) {
      if (e.kind === W.EV_JOIN) recLive.add(e.slot);
      if (e.kind === W.EV_LEAVE) recLive.delete(e.slot);
    }
    up.pending.delete(next);
    upStats.ticks++;
    closed = next;
    if (next % W.SEND_EVERY === W.SEND_EVERY - 1) broadcast(next);
  }
}
// One upstream, until its connection ends (it throws if it can't be reached or refuses us).
async function watchUpstream(from: string) {
  const [host, port] = from.split(':');
  const conn = await Deno.connect({ hostname: host, port: Number(port), transport: 'tcp' });
  conn.setNoDelay(true);
  const sock = Deno.listenDatagram({ hostname: '0.0.0.0', port: 0, transport: 'udp' });
  const to: Deno.NetAddr = { transport: 'udp', hostname: host, port: Number(port) };
  const sw = conn.writable.getWriter();
  const sr = W.bufferedReader(conn.readable.getReader());
  await sw.write(W.encodeHello({ maxDatagram: 1400, wasmPrefix: prefix, watch: true }));
  const head = await sr.read(4);
  if (head.length < 4 || head[0] === W.T_REJECT) { try { conn.close(); } catch { /* gone */ } sock.close(); throw Object.assign(new Error(`refused us: reason ${head[1]}`), { reason: head[1] }); }
  const wb = new Uint8Array(32);
  wb.set(head, 0);
  wb.set(await sr.read(28), 4);
  const w = W.decodeWelcome(wb) as Welcome;
  up = newUp(from);
  upStats.links.push(from);
  roomStart = w.roomStart;
  roomSeed = w.seed;
  up.token = w.token;
  up.sBase = w.serverTick + 0.5;
  up.sEpoch = performance.now();
  serverNow = () => up.sBase + (performance.now() - up.sEpoch) / W.TICK_MS;
  const send = (m: Uint8Array) => {
    const d = new Uint8Array(4 + m.length);
    new DataView(d.buffer).setUint32(0, up.token >>> 0, true);
    d.set(m, 4);
    sock.send(d, to).catch(() => {});
  };
  send(W.encodeInput({ seq: up.seq++, firstTick: 0, ackTick: 0, ackBits: 0n, words: [] }));
  for (let k = 0; k < 5; k++) setTimeout(() => { up.pingAt[k] = performance.now(); sw.write(W.encodePing(k)).catch(() => {}); }, 50 * k);
  const timer = setInterval(() => {
    const r = up.report && up.report.left > 0 ? up.report : null;
    if (r) r.left--;
    send(W.encodeInput({ seq: up.seq++, firstTick: 0, ...up.recv.ack(), words: [], report: r ? { interval: r.interval, epoch: up.keys, hash: r.hash } : null }));
    const next = recordStart + record.length, now = performance.now();
    // an upstream this quiet is gone, whatever TCP says
    if (now - up.heardAt > 1500) { try { conn.close(); } catch { /* gone */ } }
    if (recordStart >= 0 && !up.filling && !up.pending.has(next) && up.recv.newest - next >= HOLE_TICKS && now - up.syncAt > 1500) {
      up.syncAt = now;
      upStats.syncs++;
      sw.write(W.encodeSync(W.SYNC.HOLE, next)).catch(() => {});
    }
  }, 16);
  (async () => {
    for (;;) {
      let buf: Uint8Array;
      try { [buf] = await sock.receive(); } catch { return; }
      const d = W.decodeTicks(buf);
      if (!d) continue;
      up.heardAt = performance.now();
      upStats.bytes += buf.length;
      if (d.type === W.T_BUNDLE) upStats.bundles++; else upStats.repairs++;
      for (const e of d.entries) {
        const whole = up.parts.add(e);
        if (!whole || !up.recv.add(e.tick)) continue;
        offerUp(e.tick, whole);
      }
      up.parts.forget(up.recv.newest - 512);
    }
  })();
  try {
    for (;;) {
      const m = (await W.readControl(sr).catch(() => null)) as Ctl | null;
      if (!m) break;
      if (m.type === W.T_PONG) {
        const rtt = performance.now() - up.pingAt[m.nonce];
        if (rtt < up.bestRtt) { up.bestRtt = rtt; up.sBase = m.serverTick + rtt / 2 / W.TICK_MS; up.sEpoch = performance.now(); }
      }
      if (m.type === W.T_KEY) {
        up.keys++;
        const region = m.raw ? await W.unpackKey(m.packed) : null;
        upStats.keys.push({ from, reason: m.reason, simTick: m.tick - roomStart, raw: m.raw ? 1 : 0 });
        log(`upstream keyframe: reason ${m.reason}, tick ${m.tick}`);
        const again = recordStart >= 0;
        up.pending.clear();
        closed = m.tick - 1;
        startRecord(m.tick, region);
        up.filling = true;
        // our spectators' ticks start over too
        if (again) for (const s of watchers) { s.syncing = false; s.fromTick = Infinity; sendKey(s, W.SYNC.HOLE); }
      }
      if (m.type === W.T_FILL) {
        for (const t of W.decodeFillBody(m.from, m.n, m.body)) { up.recv.add(t.tick); offerUp(t.tick, t.parts); }
        up.filling = false;
      }
    }
  } finally {
    clearInterval(timer);
    // the datagrams already here, or on their way, are ticks the room's players have too
    await new Promise((ok) => setTimeout(ok, 100));
    try { sock.close(); } catch { /* gone */ }
    try { conn.close(); } catch { /* gone */ }
  }
}

// The upstreams in turn: when one goes away, each of the others once; when
// none will have us, a standby takes the room over, and any other edge stops.
async function followUpstream() {
  let k = 0, failed = 0;
  while (failed < upstreams.length) {
    const from = upstreams[k];
    k = (k + 1) % upstreams.length;
    try {
      await watchUpstream(from);
      console.error(`relay: upstream ${from} went away`);
      failed = 1;
    } catch (e) {
      // nobody in the room yet: wait for one
      if ((e as { reason?: number }).reason === W.REJECT.EMPTY) { k = upstreams.indexOf(from); await new Promise((ok) => setTimeout(ok, 500)); continue; }
      failed++;
      console.error(`relay: upstream ${from}: ${(e as Error)?.message || e}`);
    }
  }
  if (standby && recordStart >= 0) takeOver();
  else { console.error('relay: no upstream left'); await finish(); }
}

// A standby's takeover: the room goes on from the newest tick in the record,
// on the old clock's timeline (the upstream's tick, as the pings put it), so
// every tick number and every client's clock stay as they were. The ticks
// between the record's end and now close at once, the ghosts' words repeated.
const GRACE_MS = 8000;
function takeOver() {
  const now = performance.now();
  E0 = now - serverNow() * W.TICK_MS;
  serverNow = () => (performance.now() - E0) / W.TICK_MS;
  edge = false;
  prevWords = recBase.w.slice();
  events = [];
  eventsAt.clear();
  for (const p of recLive) slots[p] = newSlot(p, closed + 1, { ghost: true, last: prevWords[p], lastRecv: now + GRACE_MS - SILENT_MS });
  stats.takeover = { tick: closed + 1, simTick: closed + 1 - roomStart, behindTicks: Math.round(serverNow() - closed - 1), ghosts: recLive.size, at: Number(((now - E) / 1000).toFixed(2)) };
  console.error(`relay: taking the room over from sim tick ${closed + 1 - roomStart}, ${recLive.size} slots held for their players`);
  pump();
}

// The room's status, for a page host to serve as its status_url, and the
// referee watchdog: a referee that has not kept up for REFEREE_LAG_S ends the
// relay, since every joiner after that would wait on a keyframe that never comes.
const STATUS_MS = 2000;
function writeStatus() {
  const live = slots.filter((s) => s && !s.ghost).length;
  const st = {
    game, players: live, max_players: maxPlayers, spectators: watchers.size,
    tick: roomStart >= 0 ? Math.max(0, closed - roomStart) : 0, tick_hz: Math.round(1000 / W.TICK_MS),
    proto: W.PROTO, room: roomStart >= 0, edge, referee_errors: stats.refErrors.length,
    // players' interval hashes checked against the referee's since the relay began, and how many differed
    hashes_checked: stats.compared, hashes_differed: stats.compared - stats.agreed,
    up_s: Math.round((performance.now() - E) / 1000),
  };
  return writeWhole(statusPath, st, 'status');
}
function writeOnline() {
  const online = slots.filter((s) => s && !s.ghost && s.wallet).map((s) => ({ wallet: s!.wallet, since: s!.since }));
  return writeWhole(onlinePath, { at: Math.floor(Date.now() / 1000), online }, 'online');
}
function writeWhole(path: string, doc: unknown, what: string) {
  const tmp = `${path}.tmp`;
  return Deno.writeTextFile(tmp, JSON.stringify(doc) + '\n').then(() => Deno.rename(tmp, path)).catch((e) => console.error(`relay: ${what}: ${e}`));
}
if (statusPath) { writeStatus(); setInterval(writeStatus, STATUS_MS); }
if (onlinePath) { writeOnline(); setInterval(writeOnline, STATUS_MS); }
setInterval(() => {
  if (lookDirty.size) {
    const pairs = [...lookDirty].map((p) => [p, looks[p]] as [number, number]);
    lookDirty.clear();
    for (const s of everyone()) sendLooks(s, pairs);
  }
  if (avatarDirty.size) {
    const pairs = [...avatarDirty].map((p) => [p, avatars[p]] as [number, number]);
    avatarDirty.clear();
    for (const s of everyone()) sendAvatars(s, pairs);
  }
}, LOOKS_MS);
setInterval(() => {
  if (edge || roomStart < 0) return;
  const behind = (closed - roomStart - refAt) * W.TICK_MS / 1000;
  if (behind > REFEREE_LAG_S) {
    console.error(`relay: the referee is ${behind.toFixed(1)} s behind the room; ending it`);
    finish(3);
  }
}, 1000);

const endpoint = new Deno.QuicEndpoint({ hostname, port });
const listener = endpoint.listen({ cert, key, alpnProtocols: ['h3'], congestionControl: cc });
(async () => { for await (const incoming of listener) session(incoming).catch(() => {}); })();
if (nativePort) {
  udp = Deno.listenDatagram({ hostname, port: nativePort, transport: 'udp' });
  nativeDatagrams(udp);
  const tcp = Deno.listen({ hostname, port: nativePort, transport: 'tcp' });
  (async () => { for await (const conn of tcp) nativeSession(conn).catch(() => {}); })();
}
if (edge) followUpstream();
else pump();
if (!quiet) console.error(`relay listening on https://${hostname}:${port}/ (${cc})${nativePort ? `, native clients on ${hostname}:${nativePort} (TCP and UDP)` : ''}, tick ${W.TICK_MS} ms`);

async function finish(code = 0) {
  await saveReplay();
  const text = JSON.stringify(summary());
  if (summaryPath) await Deno.writeTextFile(summaryPath, text + '\n');
  else console.log(text);
  if (statusPath) await Deno.remove(statusPath).catch(() => {});
  if (onlinePath) await Deno.remove(onlinePath).catch(() => {});
  Deno.exit(code);
}
// a runner that stops the relay early still gets the summary (and a pool's
// room its status file removed, so a stopped room never reads as up)
if (summaryPath || statusPath || onlinePath) Deno.addSignalListener('SIGTERM', () => finish());
if (durationS > 0) {
  await new Promise((ok) => setTimeout(ok, durationS * 1000));
  await finish();
}
