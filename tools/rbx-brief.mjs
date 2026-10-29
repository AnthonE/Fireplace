// A Roblox place's port brief, with no Node in it: what an agent needs to
// write the game on Fireplace, taken from the place in one pass, so a port is
// one prompt on everything instead of one per question. tools/roblox.mjs
// --brief writes it beside the map; the map itself is tools/rbx-map.mjs's.
//
// robloxBrief(doc, { map }) gives { files: { path: text }, summary }: the
// scripts as files (where they sat, server, client or module, as Rojo names
// them), port.md (the brief) and assets.json (every asset the place names,
// which the port may only use if they are the place owner's to give).
// Nothing here is translated: Luau runs on Roblox's API, and the brief says
// what each part of the game leans on.
import { path } from './rbx-file.mjs';

const SCRIPT_EXT = { Script: '.server.luau', LocalScript: '.client.luau', ModuleScript: '.luau' };
// the Roblox services a port has to answer for, and what each one is to it
const SERVICES = {
  DataStoreService: 'saved data between sessions: Elo Pros accounts and the locker',
  MarketplaceService: 'purchases (game passes, developer products): on Elo Pros, sold things never change who wins',
  GamePassService: 'game passes (old API): as MarketplaceService',
  BadgeService: 'badges: achievements (client/achievements.mjs)',
  TeleportService: 'moving players between places: rooms here are one game',
  MessagingService: 'messages between servers',
  HttpService: 'web requests (and JSON)',
  PathfindingService: 'NPC paths: the bots steer themselves (client/arena-bot.mjs)',
  ReplicatedStorage: 'shared modules and remotes',
  Teams: 'teams: red and blue',
  TweenService: 'animation: drawing only here',
  UserInputService: 'input: one u32 word a player a tick',
  ContextActionService: 'input bindings',
  RunService: 'the frame and step loop: the sim steps at 125 Hz',
  PhysicsService: 'collision groups',
  SoundService: 'sound',
  Debris: 'timed removal',
  CollectionService: 'tags',
  Chat: 'chat', TextChatService: 'chat', TextService: 'text filtering',
  InsertService: 'loading assets at run time',
  ContentProvider: 'preloading assets',
  StarterGui: 'the HUD', GuiService: 'the HUD',
};
// a tool's name to the arena's gun it is nearest (the arena's WEAPONS), when one is
export function weaponOf(name) {
  const n = name.toLowerCase();
  if (/sword|blade|katana|saber|knife|pitchfork/.test(n)) return 'sword';
  if (/rocket|bazooka|launcher|rpg/.test(n)) return 'rocket';
  if (/sniper/.test(n)) return 'sniper';
  if (/shotgun/.test(n)) return 'shotgun';
  if (/pistol|revolver|magnum|handgun/.test(n)) return 'magnum';
  if (/rifle|smg|assault|paintball|gun|blaster/.test(n)) return 'ar';
  if (/slingshot|superball|plasma|laser/.test(n)) return 'plasma';
  return null;
}

export function robloxBrief(doc, { map = null, name = 'the place' } = {}) {
  const files = {}, lines = [];
  const all = doc.instances;
  const of = (cls) => all.filter((x) => x.class === cls);
  const scripts = all.filter((x) => SCRIPT_EXT[x.class] && typeof x.props.Source === 'string');
  const where = (x) => path(x).split('.')[0];
  const used = new Map(); // service -> scripts that get it
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const remotes = new Map(of('RemoteEvent').concat(of('RemoteFunction'), of('UnreliableRemoteEvent'))
    .map((r) => [r.name, { path: path(r), class: r.class, users: [], word: new RegExp(`["'.]${esc(r.name)}(?![\\w])`) }]));
  const stores = new Map(), assets = new Map(), passes = new Set(), products = new Set();
  let lineCount = 0;

  // the scripts as files: a path from where each sat, the server's, the client's, the modules
  const taken = new Set();
  for (const s of scripts) {
    let p = 'scripts/' + path(s).split('.').map((part) => part.replace(/[^\w -]+/g, '_').trim() || '_').join('/');
    let f = p + SCRIPT_EXT[s.class];
    for (let k = 2; taken.has(f); k++) f = `${p} ${k}${SCRIPT_EXT[s.class]}`;
    taken.add(f);
    const src = s.props.Source;
    files[f] = src;
    lineCount += src.split('\n').length;
    for (const m of src.matchAll(/GetService\(\s*["'](\w+)["']\s*\)|\bgame\.(\w+Service|Teams|Debris|Chat)\b/g)) {
      const svc = m[1] || m[2];
      if (!used.has(svc)) used.set(svc, new Set());
      used.get(svc).add(f);
    }
    // a remote by its name as a word: "Click", .Click, :WaitForChild("Click")
    for (const [n, r] of remotes) if (r.word.test(src)) r.users.push(f);
    for (const m of src.matchAll(/GetDataStore\(\s*["']([^"']+)["']/g)) { if (!stores.has(m[1])) stores.set(m[1], []); stores.get(m[1]).push(f); }
    for (const m of src.matchAll(/(?:UserOwnsGamePassAsync|PlayerHasPass|PromptGamePassPurchase)\([^)]*?(\d{4,})/g)) passes.add(m[1]);
    for (const m of src.matchAll(/(?:PromptProductPurchase)\([^)]*?(\d{4,})/g)) products.add(m[1]);
  }
  // every asset the place names: in properties and in scripts
  const noteAsset = (id, at) => { if (!assets.has(id)) assets.set(id, []); const a = assets.get(id); if (a.length < 5) a.push(at); };
  for (const x of all) for (const [k, v] of Object.entries(x.props)) {
    if (typeof v !== 'string' || k === 'Source') continue;
    for (const m of v.matchAll(/(?:rbxassetid:\/\/|[?&]id=)(\d+)/g)) noteAsset(m[1], `${path(x)}.${k}`);
  }
  for (const [f, src] of Object.entries(files)) for (const m of src.matchAll(/rbxassetid:\/\/(\d+)/g)) noteAsset(m[1], f);

  // ---- the brief
  const players = of('Players')[0]?.props || {}, sp = of('StarterPlayer')[0]?.props || {};
  const count = (cls) => scripts.filter((s) => s.class === cls).length;
  lines.push(`# Porting ${name}`, '',
    `Made by tools/roblox.mjs --brief from the place file. The map is done (map.json beside this, \`node net/play.mjs --arena --map <it>\`); this is the rest: what the game's scripts do, so the rules can be written on Fireplace (docs/roblox.md, docs/roadmap.md "Bringing maps and games in"). Nothing below is translated: Luau runs on Roblox's API.`, '');
  lines.push('## The place', '',
    `- ${scripts.length} scripts, ${lineCount.toLocaleString('en')} lines: ${count('Script')} on the server, ${count('LocalScript')} on clients, ${count('ModuleScript')} modules, in \`scripts/\` where each sat (${[...new Set(scripts.map(where))].join(', ') || 'none'}).`);
  if (map) lines.push(...map.report.map((r) => `- the map: ${r}`));
  lines.push('');

  // what the players are: speed, jump, health, respawn, and what they carry
  lines.push('## The players', '');
  const walk = sp.CharacterWalkSpeed, jump = sp.CharacterJumpPower ?? sp.CharacterJumpHeight;
  lines.push(`- walk ${walk ?? 16} studs/s (${((walk ?? 16) * 0.28).toFixed(1)} m/s), jump ${sp.CharacterJumpPower !== undefined ? `power ${sp.CharacterJumpPower}` : `height ${jump ?? 7.2} studs`}, max health ${sp.CharacterMaxHealth ?? 100}; respawn ${players.RespawnTime ?? 5} s. The arena's fighter: 1.8 m tall, jumps 1.2 m, 100 shield and 100 health, 3 s to respawn.`);
  const pack = of('Tool').filter((t) => /^StarterPack\./.test(path(t)));
  const loose = of('Tool').filter((t) => /^Workspace\./.test(path(t)));
  const kept = of('Tool').filter((t) => !/^(StarterPack|Workspace)\./.test(path(t)));
  const tool = (t) => `${t.name}${weaponOf(t.name) ? ` (the arena's ${weaponOf(t.name)})` : ''}`;
  if (pack.length) lines.push(`- everyone spawns with: ${pack.map(tool).join(', ')}`);
  if (loose.length) lines.push(`- lying in the map to pick up: ${loose.map(tool).join(', ')} (the map's weapon pads where they lie)`);
  if (kept.length) lines.push(`- handed out by scripts: ${kept.slice(0, 20).map((t) => `${tool(t)} from ${path(t.parent)}`).join(', ')}${kept.length > 20 ? `, and ${kept.length - 20} more` : ''}`);
  const teams = of('Team');
  if (teams.length) lines.push(`- teams: ${teams.map((t) => t.name).join(', ')}${teams.length >= 2 ? ' (the map has the two with the most spawns as red and blue)' : ''}`);
  const stats = new Set();
  // the values a script that makes leaderstats names: `kills.Name = "KOs"`
  for (const src of Object.values(files)) if (/leaderstats/.test(src)) for (const m of src.matchAll(/\.Name\s*=\s*["']([\w ]{2,24})["']/g)) stats.add(m[1]);
  const board = [...stats].filter((s) => s !== 'leaderstats').slice(0, 8);
  if (board.length) lines.push(`- the leaderboard (leaderstats): ${board.join(', ')}. The arena counts kills, deaths and a mode's points.`);
  lines.push('');

  // what moves: the movers the map made, going or standing still for the port to set going
  if (map?.movers?.length) {
    lines.push('## What moves', '',
      'Each is a structure of its own in map.json. A structure\'s "move" ({ by: [dx, dy, dz] metres, seconds each way, wait at each end, phase, ease }) takes it there and back for ever; a fighter on it rides it and one in its way is pushed (docs/arena.md, "Moving boxes"). Something that moves only when a player does something (a door, a trap) is a mode\'s rule, not a "move".', '');
    const m3 = (v) => `[${v.join(', ')}]`;
    for (const mv of map.movers) {
      lines.push(mv.move
        ? `- "${mv.name}" (${mv.why}): moves by ${m3(mv.move.by)} m in ${mv.move.seconds} s, waiting ${mv.move.wait} s${mv.move.ease ? ', eased' : ''}, as in the place`
        : `- "${mv.name}" (${mv.why}): stands still in the map; give it a "move" once its script says where it goes`);
    }
    lines.push('');
  }

  // the network: remotes are the game's messages; here the only message is input
  lines.push('## Between server and clients', '');
  if (remotes.size) {
    lines.push(`${remotes.size} remotes: in Fireplace a client sends only its input word, and every machine runs the same sim, so each of these becomes either a field of the input word (something a player does) or nothing (something the server tells clients, which they now compute themselves).`, '');
    for (const [n, r] of [...remotes].slice(0, 60)) lines.push(`- \`${n}\` (${r.class}, ${r.path})${r.users.length ? `: ${r.users.slice(0, 4).map((u) => `\`${u}\``).join(', ')}${r.users.length > 4 ? ` and ${r.users.length - 4} more` : ''}` : ''}`);
    if (remotes.size > 60) lines.push(`- and ${remotes.size - 60} more`);
  } else lines.push('No remotes: the game runs on the server, or is from before RemoteEvents (2014), when clients changed the world directly.');
  lines.push('');

  // money and saved data: the two a port must decide, not translate
  if (stores.size || passes.size || products.size || used.has('MarketplaceService') || used.has('GamePassService')) {
    lines.push('## Saved data and money', '');
    for (const [n, fs] of stores) lines.push(`- data store \`${n}\`: ${fs.slice(0, 3).map((f) => `\`${f}\``).join(', ')}`);
    if (passes.size) lines.push(`- game passes: ${[...passes].join(', ')}`);
    if (products.size) lines.push(`- developer products: ${[...products].join(', ')}`);
    lines.push('', 'What a player buys on Elo Pros may be a look, a copy or an entry, never an edge: nobody can pay for a better measured number, so a pass that changes damage, speed or a score does not come over as one.', '');
  }

  // which Roblox services the scripts lean on
  lines.push('## What the scripts use', '');
  const svc = [...used.entries()].sort((a, b) => b[1].size - a[1].size);
  if (svc.length) for (const [n, fs] of svc) lines.push(`- ${n} (${fs.size} script${fs.size === 1 ? '' : 's'})${SERVICES[n] ? `: ${SERVICES[n]}` : ''}`);
  else lines.push('None by name (an old place: `game.Workspace`, `script.Parent` and the instances themselves).');
  lines.push('');

  lines.push('## Assets', '', assets.size
    ? `${assets.size} asset ids (assets.json: each with where it is named). Sounds, meshes, images and animations live on Roblox's servers, not in the file, and Roblox's licensed audio is only for use on Roblox: a port uses only what the place's owner made or may give.`
    : 'The place names no assets: everything in it is parts and scripts.', '');
  lines.push('## Writing it', '',
    'Start from the arena (src/arena.wat and its modes, docs/arena.md) or Party\'s kit (docs/party.md) for whatever the game is closest to; a mode on the arena\'s kit is src/am/<key>.wat, four hooks. The scripts above are the spec, not the code: rewrite what they do, in the sim\'s rules (CLAUDE.md).', '');
  files['port.md'] = lines.join('\n');
  files['assets.json'] = JSON.stringify(Object.fromEntries([...assets].map(([id, at]) => [id, at])), null, 1) + '\n';
  return { files, summary: { scripts: scripts.length, lines: lineCount, remotes: remotes.size, stores: stores.size, assets: assets.size, services: svc.length } };
}
