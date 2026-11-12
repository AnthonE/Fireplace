// The words chat masks with `*`, as data: the relay runs every line through
// them before it sends it on, and the page runs what it hears through them
// again (net/chat.mjs maskWords). Lower case, one word an entry, matched as a
// whole word whatever its case; an entry ending in `*` also takes any ending
// (`damn*` masks DAMNED). A starter list, not a moderator: add to it here and
// both ends pick it up.
export const WORDS = [
  'fuck*', 'motherfuck*', 'shit*', 'bullshit', 'bitch*', 'bastard*', 'asshole*', 'arsehole*', 'dick', 'dickhead*', 'cock',
  'cunt*', 'pussy', 'wank*', 'slut*', 'whore*', 'fag', 'fags', 'faggot*', 'nigger*', 'nigga*', 'retard*', 'kys',
];
