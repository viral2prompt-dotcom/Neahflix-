import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  createNeahplusBridge,
  isTrustedDestination,
  rewriteNeahplusLogoPaths,
  rewriteNeahplusText,
} from '../neahplus.js';

const P = '/api/neahplus';
const SECRET = 'test-secret-with-at-least-32-characters!!';
const PUBLIC_RESOLVER = async () => [{ address: '93.184.216.34', family: 4 }];
const PRIVATE_RESOLVER = async () => [{ address: '10.0.0.5', family: 4 }];
const PUBLIC_TARGET = 'http://109.205.187.150:8008/sunshine/t/hls/index.m3u8';

const bridgeAt = (overrides = {}) => createNeahplusBridge({ secret: SECRET, resolveHost: PUBLIC_RESOLVER, ...overrides });
const resolveBody = (url) => JSON.stringify({ url, live: true, format: 'hls', name: 'SCI-FI' });
const sign = (exp, target, secret = SECRET) =>
  createHmac('sha256', secret).update(`${exp}\n${target}`).digest('base64url');

const grantFor = async (bridge, url) => {
  const body = JSON.parse(await bridge.rewriteResolveJson(resolveBody(url)));
  return new URL(body.url, 'https://neahflix.test');
};

const scripted = (responses) => {
  const calls = [];
  const transport = async ({ url, method }) => {
    calls.push({ url: url.toString(), method });
    return responses.shift();
  };
  return { transport, calls };
};
const redirect = (status, location) => new Response(null, { status, headers: { location } });
const ok = () => new Response('#EXTM3U', { status: 200, headers: { 'content-type': 'application/vnd.apple.mpegurl' } });
const fetchOptions = (url, method = 'GET') => ({ url: new URL(url), method, headers: new Headers(), body: undefined });

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
  const out = rewriteNeahplusText('const r = "/channels"; fetch("/vuma/x.js"); url(/assets/a.png)', false);
  assert.ok(out.includes('"/channels"'));
  assert.ok(out.includes('"/vuma/x.js"'));
  assert.ok(out.includes('url(' + P + '/assets/a.png'));
});

test('absolute OHA URLs in text are rewritten to the bridge prefix', () => {
  const out = rewriteNeahplusText('see https://oha.to/live/play/1 and http://www.oha.to/x', false);
  assert.equal(out, `see ${P}/live/play/1 and ${P}/x`);
});

test('manifest JSON stays valid after rewriting', () => {
  const manifest = JSON.stringify({ id: 'oha-addons', icon: 'https://oha.to/icon.png', resources: ['catalog'] });
  const out = rewriteNeahplusText(manifest, false);
  assert.deepEqual(JSON.parse(out).resources, ['catalog']);
  assert.equal(JSON.parse(out).icon, `${P}/icon.png`);
});

test('TV catalog JSON stays valid and play links point to the bridge', () => {
  const catalog = JSON.stringify({ items: [{ name: 'SCI-FI', url: 'https://oha.to/live/play/885844520' }] });
  const out = JSON.parse(rewriteNeahplusText(catalog, false));
  assert.equal(out.items[0].url, `${P}/live/play/885844520`);
});

test('logos: catalog logo paths are routed through the bridge and stay valid JSON', () => {
  const catalog = JSON.stringify({ items: [{ images: { logo: '/live2/logo/885844520.png' } }] });
  const out = JSON.parse(rewriteNeahplusLogoPaths(catalog));
  assert.equal(out.items[0].images.logo, `${P}/live2/logo/885844520.png`);
});

test('logos: only quoted /live2/ paths are rewritten, not other strings', () => {
  const text = '"/live2/logo/1.png" and the word /live2/ inside text';
  const out = rewriteNeahplusLogoPaths(text);
  assert.ok(out.startsWith(`"${P}/live2/logo/1.png"`));
  assert.ok(out.includes(' the word /live2/ inside text'));
});

test('resolve JSON: external stream URL is replaced by a signed bridge stream URL', async () => {
  const bridge = bridgeAt();
  const body = JSON.parse(await bridge.rewriteResolveJson(resolveBody(PUBLIC_TARGET)));
  const url = new URL(body.url, 'https://neahflix.test');
  assert.equal(url.pathname, `${P}/__stream`);
  assert.equal(url.searchParams.get('url'), PUBLIC_TARGET);
  assert.match(url.searchParams.get('sig'), /^[A-Za-z0-9_-]{43}$/);
  assert.equal(bridge.verifiedStreamTarget(url).toString(), PUBLIC_TARGET);
});

test('resolve JSON: non-JSON or malformed bodies are returned unchanged', async () => {
  const bridge = bridgeAt();
  assert.equal(await bridge.rewriteResolveJson('<html>oops</html>'), '<html>oops</html>');
  assert.equal(await bridge.rewriteResolveJson('{"url": 42}'), '{"url": 42}');
});

test('resolve JSON: private, loopback, credentialed and non-HTTP targets are refused', async () => {
  const bridge = bridgeAt();
  for (const url of ['http://127.0.0.1/a.m3u8', 'http://169.254.169.254/x', 'http://user:pw@109.205.187.150/a.m3u8', 'ftp://109.205.187.150/a.ts']) {
    await assert.rejects(bridge.rewriteResolveJson(resolveBody(url)), { name: 'NeahplusRefused' }, url);
  }
});

test('resolve JSON: a name resolving to a private address is refused', async () => {
  const bridge = bridgeAt({ resolveHost: PRIVATE_RESOLVER });
  await assert.rejects(bridge.rewriteResolveJson(resolveBody('http://stream.example/a.m3u8')), /non publique/);
});

test('destinations: arbitrary hosts and unsafe URLs are not trusted', () => {
  for (const url of ['https://evil.example/', 'http://127.0.0.1/', 'https://oha.to.evil.example/', 'ftp://oha.to/x', 'https://u:p@oha.to/']) {
    assert.equal(isTrustedDestination(new URL(url)), false, url);
  }
  assert.equal(isTrustedDestination(new URL('https://oha.to/live/play/1')), true);
});

test('destinations: OHA and TVFree hosts keep their existing routes', async () => {
  const bridge = bridgeAt();
  const trusted = resolveBody('https://oha.to/live/play/1');
  assert.equal(await bridge.rewriteResolveJson(trusted), trusted);
  const playlist = bridge.rewritePlaylist('#EXTM3U\nhttps://tvfree.to/seg/1.ts', new URL('https://tvfree.to/p.m3u8'));
  assert.ok(playlist.includes(`${P}/__relay?url=`));
});

test('playlist: segments on the playlist origin are signed, cross-origin segments are refused', () => {
  const bridge = bridgeAt();
  const base = new URL(PUBLIC_TARGET);
  const out = bridge.rewritePlaylist('#EXTM3U\n#EXTINF:10,\nseg1.ts\nhttp://other.example/seg2.ts', base);
  const [, , same, other] = out.split('\n');
  assert.ok(same.startsWith(`${P}/__stream?`));
  assert.equal(other, '#NEAHPLUS-REFUSED');
});

test('signed streams: a valid grant is accepted and returns the same target', async () => {
  const bridge = bridgeAt();
  const url = await grantFor(bridge, PUBLIC_TARGET);
  assert.equal(bridge.verifiedStreamTarget(url).toString(), PUBLIC_TARGET);
});

test('signed streams: a tampered url, exp or signature is refused', async () => {
  const bridge = bridgeAt();
  const grant = await grantFor(bridge, PUBLIC_TARGET);
  const tamperedUrl = new URL(grant);
  tamperedUrl.searchParams.set('url', 'http://109.205.187.150:8008/other.m3u8');
  const tamperedExp = new URL(grant);
  tamperedExp.searchParams.set('exp', String(Number(grant.searchParams.get('exp')) + 60));
  const tamperedSig = new URL(grant);
  tamperedSig.searchParams.set('sig', 'A'.repeat(43));
  for (const forged of [tamperedUrl, tamperedExp, tamperedSig]) {
    assert.throws(() => bridge.verifiedStreamTarget(forged), /Signature NEAHPLUS invalide/);
  }
});

test('signed streams: private literal and ftp targets are refused even with a valid signature', () => {
  const bridge = bridgeAt();
  const exp = Math.floor(Date.now() / 1000) + 600;
  for (const target of ['http://127.0.0.1:8080/admin', 'http://169.254.169.254/x', 'ftp://109.205.187.150/a.ts', 'http://109.205.187.150:9000/a.ts']) {
    const url = new URL(`${P}/__stream`, 'https://neahflix.test');
    url.searchParams.set('url', target);
    url.searchParams.set('exp', String(exp));
    url.searchParams.set('sig', sign(exp, target));
    assert.throws(() => bridge.verifiedStreamTarget(url), /Destination NEAHPLUS non autoris\u00e9e/, target);
  }
});

test('signed streams: grants expire on the server clock', async () => {
  let clock = 1_000_000_000_000;
  const bridge = bridgeAt({ now: () => clock });
  const grant = await grantFor(bridge, PUBLIC_TARGET);
  clock += 6 * 60 * 60 * 1000 + 1000;
  assert.throws(() => bridge.verifiedStreamTarget(grant), /Lien NEAHPLUS expir\u00e9/);
});

test('signed streams: a grant whose lifetime exceeds the TTL is refused', () => {
  const bridge = bridgeAt();
  const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
  const url = new URL(`${P}/__stream`, 'https://neahflix.test');
  url.searchParams.set('url', PUBLIC_TARGET);
  url.searchParams.set('exp', String(exp));
  url.searchParams.set('sig', sign(exp, PUBLIC_TARGET));
  assert.throws(() => bridge.verifiedStreamTarget(url), /Lien NEAHPLUS expir\u00e9/);
});

test('signed streams: two bridges sharing the secret accept each other grants', async () => {
  const issuer = bridgeAt();
  const verifier = bridgeAt();
  const grant = await grantFor(issuer, PUBLIC_TARGET);
  assert.equal(verifier.verifiedStreamTarget(grant).toString(), PUBLIC_TARGET);
});

test('signed streams: a bridge with another secret refuses the grant', async () => {
  const grant = await grantFor(bridgeAt(), PUBLIC_TARGET);
  const other = bridgeAt({ secret: 'attacker-secret-of-sufficient-length-xx' });
  assert.throws(() => other.verifiedStreamTarget(grant), /Signature NEAHPLUS invalide/);
});

test('signed streams: no grant is issued when the secret is missing or too short', async () => {
  for (const secret of [undefined, 'short']) {
    const bridge = createNeahplusBridge({ secret, resolveHost: PUBLIC_RESOLVER });
    assert.equal(bridge.enabled, false);
    await assert.rejects(bridge.rewriteResolveJson(resolveBody(PUBLIC_TARGET)), { status: 503 });
  }
});

test('redirect to a private literal address is refused', async () => {
  const { transport } = scripted([redirect(302, 'http://10.0.0.1/x.ts')]);
  const bridge = bridgeAt({ transport });
  await assert.rejects(bridge.fetchUpstream(fetchOptions(PUBLIC_TARGET)), /Redirection NEAHPLUS non autoris\u00e9e/);
});

test('redirect to a different host is refused', async () => {
  const { transport } = scripted([redirect(302, 'http://other.example/x.ts')]);
  const bridge = bridgeAt({ transport });
  await assert.rejects(bridge.fetchUpstream(fetchOptions(PUBLIC_TARGET)), /Redirection NEAHPLUS non autoris\u00e9e/);
});

test('redirect to a public path on the same origin is followed and checked', async () => {
  const { transport, calls } = scripted([redirect(301, '/sunshine/t/hls/real.m3u8'), ok()]);
  const bridge = bridgeAt({ transport });
  const { response, upstream } = await bridge.fetchUpstream(fetchOptions(PUBLIC_TARGET));
  assert.equal(response.status, 200);
  assert.equal(upstream.pathname, '/sunshine/t/hls/real.m3u8');
  assert.equal(calls.length, 2);
});

test('redirect loops stop after the hop limit', async () => {
  const loop = Array.from({ length: 10 }, () => redirect(302, PUBLIC_TARGET));
  const { transport, calls } = scripted(loop);
  const bridge = bridgeAt({ transport });
  await assert.rejects(bridge.fetchUpstream(fetchOptions(PUBLIC_TARGET)), /Trop de redirections/);
  assert.equal(calls.length, 6);
});

test('303 redirects switch the request to GET, 307 keeps the method', async () => {
  const first = scripted([redirect(303, '/a.m3u8'), ok()]);
  await bridgeAt({ transport: first.transport }).fetchUpstream(fetchOptions(PUBLIC_TARGET, 'POST'));
  assert.equal(first.calls[1].method, 'GET');

  const second = scripted([redirect(307, '/a.m3u8'), ok()]);
  await bridgeAt({ transport: second.transport }).fetchUpstream(fetchOptions(PUBLIC_TARGET, 'POST'));
  assert.equal(second.calls[1].method, 'POST');
});

test('playlists: refused segment lines and URI attributes are neutralised, not left raw', () => {
  const bridge = bridgeAt();
  const base = new URL(PUBLIC_TARGET);
  const playlist = [
    '#EXTM3U',
    '#EXT-X-KEY:METHOD=AES-128,URI="http://10.0.0.5/key.bin"',
    '#EXTINF:4,',
    'http://10.0.0.5/seg-private.ts',
    '#EXTINF:4,',
    'seg-ok.ts',
  ].join('\n');
  const rewritten = bridge.rewritePlaylist(playlist, base);
  assert.ok(!rewritten.includes('10.0.0.5'));
  assert.match(rewritten, /URI=""/);
  assert.match(rewritten, /#NEAHPLUS-REFUSED/);
  assert.match(rewritten, /\/api\/neahplus\/__stream\?url=/);
});

test('catalog text: logo paths declared as /live2/ go through the bridge', () => {
  const json = '{"images":{"logo":"/live2/logo/123.png","poster":"/live2/logo/123.png"}}';
  assert.equal(
    rewriteNeahplusText(json),
    '{"images":{"logo":"/api/neahplus/live2/logo/123.png","poster":"/api/neahplus/live2/logo/123.png"}}',
  );
});
