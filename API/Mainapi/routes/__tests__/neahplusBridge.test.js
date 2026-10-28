const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isAllowedUpstream,
  bridgeUrlFor,
  rewriteEmbeddedUrls,
  rewriteHtml,
  rewritePlaylist,
} = require('../neahplusBridge');

test('NEAHPLUS bridge only accepts OHA and its known TVFree stream CDN', () => {
  assert.equal(isAllowedUpstream('https://oha.to/play/123/index.m3u8'), true);
  assert.equal(isAllowedUpstream('https://www.oha.to/assets/app.js'), true);
  assert.equal(isAllowedUpstream('https://edge.tvfree.to/live/index.m3u8'), true);
  assert.equal(isAllowedUpstream('http://127.0.0.1/admin'), false);
  assert.equal(isAllowedUpstream('https://example.com/video.m3u8'), false);
});

test('OHA URLs stay on the same HTTPS bridge origin', () => {
  assert.equal(
    bridgeUrlFor('http://oha.to/play/123/index.m3u8'),
    '/api/neahplus/play/123/index.m3u8',
  );
});

test('external TVFree media is relayed through the restricted bridge', () => {
  assert.match(
    bridgeUrlFor('https://edge.tvfree.to/signed/path/index.m3u8'),
    /^\/api\/neahplus\/__relay\?url=/,
  );
});

test('embedded OHA URLs are rewritten to the HTTPS bridge', () => {
  const output = rewriteEmbeddedUrls('const stream = "http://oha.to/play/123/index.m3u8";');
  assert.equal(output, 'const stream = "/api/neahplus/play/123/index.m3u8";');
  assert.equal(rewriteEmbeddedUrls('const asset = "/assets/app.js";'), 'const asset = "/api/neahplus/assets/app.js";');
  assert.equal(rewriteEmbeddedUrls('x{background:url(/assets/a.png)}'), 'x{background:url(/api/neahplus/assets/a.png)}');
});

test('HTML root assets and links are kept inside the bridge', () => {
  const output = rewriteHtml(
    '<html><head></head><body><a href="/channels">Channels</a><script src="/assets/app.js"></script></body></html>',
    'https://oha.to/',
  );
  assert.match(output, /href="\/api\/neahplus\/channels"/);
  assert.match(output, /src="\/api\/neahplus\/assets\/app\.js"/);
  assert.match(output, /<base href="\/api\/neahplus\/">/);
});

test('HLS playlists relay both segment paths and URI attributes', () => {
  const output = rewritePlaylist(
    '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\nsegment001.ts\n',
    'https://edge.tvfree.to/live/abc/index.m3u8',
  );
  assert.match(output, /\/api\/neahplus\/__relay\?url=/);
  assert.match(output, /URI="\/api\/neahplus\/__relay\?url=/);
});
