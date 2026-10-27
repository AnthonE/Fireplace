// client/kit.mjs seatIn: which of the room pool's rooms a page opened with no
// address joins (the first with a seat, so friends land together).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const status = { 'https://h/r/1.json': { players: 8, max_players: 8 }, 'https://h/r/2.json': { players: 3, max_players: 8 } };
globalThis.fetch = async (u) => { const d = status[String(u)]; return d ? { ok: true, json: async () => d } : { ok: false }; };
const { seatIn } = await import('../client/kit.mjs');

test('the first room with a seat, a full one passed over', async () => {
  const rows = [{ addr: 'h:1', status_url: 'https://h/r/1.json' }, { addr: 'h:2', status_url: 'https://h/r/2.json' }, { addr: 'h:3' }];
  assert.equal(await seatIn(rows), 'https://h:2/');
});

test('a room whose status cannot be read is taken on trust; every room full, the first', async () => {
  assert.equal(await seatIn([{ addr: 'h:9', status_url: 'https://h/r/9.json' }]), 'https://h:9/');
  assert.equal(await seatIn([{ addr: 'h:1', status_url: 'https://h/r/1.json' }]), 'https://h:1/');
});

test('no list, or no row with an address, is no room', async () => {
  assert.equal(await seatIn([]), null);
  assert.equal(await seatIn([{ addr: 'not an address' }, null]), null);
});
