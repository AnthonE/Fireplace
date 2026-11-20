// The Safari banner (client/browser-note.mjs) picks out Safari and nothing else.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safariKind } from '../client/browser-note.mjs';

const UA = {
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  chromeMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
  firefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:127.0) Gecko/20100101 Firefox/127.0',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1',
};

test('desktop Safari is told to use Chrome', () => assert.equal(safariKind(UA.mac, 0), 'mac'));
test('an iPad asking for the desktop site is still an iPad', () => assert.equal(safariKind(UA.mac, 5), 'ios'));
test('every browser on an iPhone is Safari underneath', () => assert.equal(safariKind(UA.iphoneChrome, 5), 'ios'));
test('Chrome, Edge, Firefox and Android see no banner', () => {
  for (const k of ['chromeMac', 'edge', 'firefox', 'android']) assert.equal(safariKind(UA[k], 0), null, k);
});
