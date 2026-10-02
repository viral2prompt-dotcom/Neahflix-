const test = require('node:test');
const assert = require('node:assert/strict');

const {
  VRIZOV_HOME_PATH,
  bridgePathFor,
  rewriteHtml,
  upstreamUrlFor,
} = require('../neahliteBridge');

test('NEAHLITE starts on the fixed Vrizov homepage', () => {
  assert.equal(upstreamUrlFor('', ''), `https://vrizov.com${VRIZOV_HOME_PATH}`);
  assert.equal(bridgePathFor(`https://vrizov.com${VRIZOV_HOME_PATH}`), `/neahlite${VRIZOV_HOME_PATH}`);
});

test('NEAHLITE keeps same-origin Vrizov navigation inside the bridge', () => {
  const html = rewriteHtml(
    '<html><head></head><body><a href="/catalogue">Catalogue</a><img src="assets/logo.svg"><a href="https://example.com">Outside</a></body></html>',
    'https://vrizov.com/3d69b18/home/vrizov',
  );

  assert.match(html, /href="\/neahlite\/catalogue"/);
  assert.match(html, /src="\/neahlite\/3d69b18\/home\/assets\/logo\.svg"/);
  assert.match(html, /href="https:\/\/example\.com"/);
});

test('NEAHLITE rejects an upstream host outside Vrizov', () => {
  assert.throws(() => bridgePathFor('https://example.com/'), /non autorisée/);
});
