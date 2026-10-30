import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isAllowedNeahplusDestination,
  neahplusBridgeUrl,
  rewriteNeahplusResolveJson,
  rewriteNeahplusText,
} from '../neahplus.js';

const P = '/api/neahplus';

test('HTML shell: vuma assets and addon base are rewritten to the bridge', () => {
  const html = '<html><head><link rel="stylesheet" href="/vuma/72a110d58745dc82/style.css"></head>' +
    '<body><script type="module" src="/vuma/72a110d58745dc82/app.js"></script>' +
    '<script>const addons = [new URL("/", location.href).href];</script></body></html>';
  const out = rewriteNeahplusText(html, true);
  assert.match(out, /<head><base href="\/api\/neahplus\/">/);
  assert.ok(out.includes(`href="${P}/vuma/72a110d58745dc82/style.css"`));
  assert.ok(out.includes(`src="${P}/vuma/72a110d58745dc82/app.js"`));
  assert.ok(out.includes(`new URL("${P}/", location.origin).href`));
  assert.ok(!out.includes('location.href)'));
});

test('HTML shell: app route strings are not rewritten', () => {
  const out = rewriteNeahplusText('<head></head><script>go("/channels");</script>', true);
  assert.ok(out.includes('"/channels"'));
  assert.ok(!out.includes(`${P}/channels`));
});

test('script bundle: root-relative route strings are left untouched', () => {
  const bundle = 'const a="/channels";const b="/resolve";const c="/watch";const d="/vuma/x/app.js";';
  assert.equal(rewriteNeahplusText(bundle, false), bundle);
});

test('absolute OHA URLs in text are rewritten to the bridge prefix', () => {
  assert.equal(rewriteNeahplusText('https://www.oha.to/mhub-addon.json', false), `${P}/mhub-addon.json`);
});

test('manifest JSON stays valid after rewriting', () => {
  const manifest = JSON.stringify({
    addons: [{ url: './vod' }, { url: './live' }, { url: './subtitle' }],
    home: 'https://oha.to/',
  });
  const parsed = JSON.parse(rewriteNeahplusText(manifest, false));
  assert.deepEqual(parsed.addons, [{ url: './vod' }, { url: './live' }, { url: './subtitle' }]);
  assert.equal(parsed.home, `${P}/`);
});

test('TV catalog JSON stays valid and play links point to the bridge', () => {
  const catalog = JSON.stringify({
    items: [{ id: '885844520', name: 'SCI-FI', url: 'https://oha.to/live/play/885844520' }],
  });
  const parsed = JSON.parse(rewriteNeahplusText(catalog, false));
  assert.equal(parsed.items[0].url, `${P}/live/play/885844520`);
  assert.equal(parsed.items[0].id, '885844520');
});

test('resolve JSON: external stream URL is replaced by a bridge stream URL', () => {
  const body = '{"url":"http://109.205.187.150:8008/sunshine/tok1/hls/index.m3u8","live":true,"format":"hls","name":"SCI-FI"}';
  const parsed = JSON.parse(rewriteNeahplusResolveJson(body));
  assert.equal(parsed.format, 'hls');
  assert.equal(parsed.live, true);
  assert.equal(parsed.name, 'SCI-FI');
  assert.ok(parsed.url.startsWith(`${P}/__stream?url=`));
  assert.ok(isAllowedNeahplusDestination(new URL('http://109.205.187.150:8008/sunshine/tok1/hls/index.m3u8')));
});

test('playlist segments in the registered directory are routed through the bridge', () => {
  rewriteNeahplusResolveJson('{"url":"http://109.205.187.160:8008/sunshine/tok2/hls/index.m3u8"}');
  const segment = new URL('seg-1.ts', 'http://109.205.187.160:8008/sunshine/tok2/hls/index.m3u8');
  assert.ok(neahplusBridgeUrl(segment).startsWith(`${P}/__stream?url=`));
});

test('streams outside the registered directory are refused', () => {
  rewriteNeahplusResolveJson('{"url":"http://109.205.187.170:8008/sunshine/tok3/hls/index.m3u8"}');
  assert.equal(isAllowedNeahplusDestination(new URL('http://109.205.187.170:8008/other/file.ts')), false);
  assert.equal(isAllowedNeahplusDestination(new URL('http://109.205.187.171:8008/sunshine/tok3/hls/index.m3u8')), false);
});

test('resolve JSON: private, loopback and credentialed targets are never registered', () => {
  for (const url of ['http://127.0.0.1:8080/a.m3u8', 'http://10.0.0.5/a.m3u8', 'http://192.168.1.2/a.m3u8',
    'http://169.254.169.254/latest/meta-data', 'http://localhost/a.m3u8', 'http://[::1]/a.m3u8',
    'http://user:pw@203.0.113.9/a.m3u8', 'ftp://203.0.113.9/a.m3u8']) {
    const body = JSON.stringify({ url });
    assert.equal(rewriteNeahplusResolveJson(body), body, url);
    assert.equal(isAllowedNeahplusDestination(new URL(url)), false, url);
  }
});

test('resolve JSON: non-JSON or malformed bodies are returned unchanged', () => {
  assert.equal(rewriteNeahplusResolveJson('not json'), 'not json');
  assert.equal(rewriteNeahplusResolveJson('{"url":42}'), '{"url":42}');
});

test('destinations: arbitrary hosts and unsafe URLs are refused', () => {
  for (const url of ['https://evil.example/', 'https://oha.to.evil.example/', 'https://user:pw@oha.to/',
    'ftp://oha.to/', 'http://localhost:8008/x/', 'http://193.47.62.157:8008/x.m3u8']) {
    assert.equal(isAllowedNeahplusDestination(new URL(url)), false, url);
  }
  assert.throws(() => neahplusBridgeUrl(new URL('https://evil.example/')), /non autoris/);
});

test('destinations: OHA and TVFree hosts keep their existing routes', () => {
  assert.equal(neahplusBridgeUrl(new URL('https://oha.to/live/resolve?url=x')), `${P}/live/resolve?url=x`);
  assert.equal(isAllowedNeahplusDestination(new URL('https://www.tvfree.to/a')), true);
  assert.ok(neahplusBridgeUrl(new URL('https://a.tvfree.to/b.m3u8')).startsWith(`${P}/__relay?url=`));
});
