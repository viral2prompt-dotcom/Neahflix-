import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { Hono } from 'hono';
import { createNeahplusBridge } from '../neahplus.js';
import { mountNeahplus } from '../neahplusRoutes.js';

const P = '/api/neahplus';
const SECRET = 'http-test-secret-with-at-least-32-chars';
const OTHER_SECRET = 'another-secret-with-at-least-32-characters';
const PUBLIC_RESOLVER = async () => [{ address: '93.184.216.34', family: 4 }];
const STREAM_HOST = '109.205.187.150:8008';
const STREAM_URL = `http://${STREAM_HOST}/sunshine/t/hls/index.m3u8`;
const SEGMENT_URL = `http://${STREAM_HOST}/sunshine/t/hls/seg-1.ts`;
const PLAYLIST = '#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:10,\nseg-1.ts\n#EXTINF:10,\nseg-2.ts\n#EXT-X-ENDLIST\n';

const json = (data) => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
const notFound = () => new Response('<html>Not Found</html>', { status: 404, headers: { 'content-type': 'text/html' } });

const UPSTREAM_ROUTES = {
  'oha.to/mhub-addon.json': () => json({ id: 'oha-addons', icon: 'https://oha.to/icon.png', resources: ['catalog'] }),
  'oha.to/sub/addon.json': () => json({ id: 'oha-sub', name: 'TV' }),
  'oha.to/live/catalog': () => json({ items: [{ name: 'SCI-FI', url: 'https://oha.to/live/play/1' }] }),
  'oha.to/live/resolve': () => json({ url: STREAM_URL, live: true, format: 'hls' }),
  [`${STREAM_HOST}/sunshine/t/hls/index.m3u8`]: () => new Response(PLAYLIST, { status: 200, headers: { 'content-type': 'application/vnd.apple.mpegurl' } }),
  [`${STREAM_HOST}/sunshine/t/hls/seg-1.ts`]: () => new Response(new Uint8Array([0x47, 0x40, 0x00]), { status: 200, headers: { 'content-type': 'video/mp2t' } }),
};

const fakeUpstream = (routes, seen = []) => async ({ url, method }) => {
  seen.push({ url: url.toString(), method });
  const route = routes[`${url.host}${url.pathname}`];
  return route ? route(url) : notFound();
};

const appWith = (secret, routes = UPSTREAM_ROUTES, seen) => {
  const bridge = createNeahplusBridge({ secret, resolveHost: PUBLIC_RESOLVER, transport: fakeUpstream(routes, seen) });
  const app = new Hono();
  mountNeahplus(app, bridge);
  return app;
};

const signedPath = (target, { exp = Math.floor(Date.now() / 1000) + 600, secret = SECRET } = {}) => {
  const sig = createHmac('sha256', secret).update(`${exp}\n${target}`).digest('base64url');
  return `${P}/__stream?${new URLSearchParams({ url: target, exp: String(exp), sig })}`;
};

const resolvePlayback = async (app) => {
  const res = await app.request(`${P}/live/resolve?url=${encodeURIComponent('https://oha.to/live/play/1')}`);
  assert.equal(res.status, 200);
  return (await res.json()).url;
};

test('manifest root is served through the bridge with its icon rewritten', async () => {
  const res = await appWith(SECRET).request(`${P}/mhub-addon.json`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /application\/json/);
  const body = await res.json();
  assert.equal(body.icon, `${P}/icon.png`);
  assert.deepEqual(body.resources, ['catalog']);
});

test('sub-addon manifest is served through the bridge', async () => {
  const res = await appWith(SECRET).request(`${P}/sub/addon.json`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).id, 'oha-sub');
});

test('TV catalog is served and play links point to the bridge', async () => {
  const res = await appWith(SECRET).request(`${P}/live/catalog`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).items[0].url, `${P}/live/play/1`);
});

test('resolve returns a signed stream URL, and the playlist segments are signed too', async () => {
  const app = appWith(SECRET);
  const streamUrl = await resolvePlayback(app);
  assert.ok(streamUrl.startsWith(`${P}/__stream?`));

  const playlist = await app.request(streamUrl);
  assert.equal(playlist.status, 200);
  const lines = (await playlist.text()).split('\n');
  const segment = lines.find((line) => line.startsWith(`${P}/__stream?`));
  assert.ok(segment, 'segment line rewritten');
  assert.equal(new URL(segment, 'https://x').searchParams.get('url'), SEGMENT_URL);
});

test('segment bytes are streamed with the upstream media type', async () => {
  const app = appWith(SECRET);
  const streamUrl = await resolvePlayback(app);
  const playlist = await (await app.request(streamUrl)).text();
  const segment = playlist.split('\n').find((line) => line.includes('seg-1'));
  const res = await app.request(segment);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'video/mp2t');
  assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [0x47, 0x40, 0x00]);
});

test('two instances sharing the secret: a grant issued by one plays on the other', async () => {
  const issuer = appWith(SECRET);
  const player = appWith(SECRET);
  const streamUrl = await resolvePlayback(issuer);
  const res = await player.request(streamUrl);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /#EXTM3U/);
});

test('two instances with different secrets: the grant is refused by the other instance', async () => {
  const streamUrl = await resolvePlayback(appWith(SECRET));
  const res = await appWith(OTHER_SECRET).request(streamUrl);
  assert.equal(res.status, 403);
  assert.equal(await res.text(), 'Signature NEAHPLUS invalide');
});

test('forged stream requests are refused', async () => {
  const app = appWith(SECRET);
  const valid = await resolvePlayback(app);
  const withSig = (sig) => valid.replace(/sig=[^&]+/, `sig=${sig}`);
  const cases = {
    'missing signature': valid.replace(/&sig=[^&]+/, ''),
    'altered signature': withSig('A'.repeat(43)),
    'altered target': valid.replace(encodeURIComponent(STREAM_URL), encodeURIComponent(`http://${STREAM_HOST}/other.m3u8`)),
    'private target signed with the real secret': signedPath('http://127.0.0.1:8080/admin'),
    'ftp target signed with the real secret': signedPath('ftp://109.205.187.150/a.ts'),
    'expired grant': signedPath(STREAM_URL, { exp: Math.floor(Date.now() / 1000) - 60 }),
    'grant beyond six hours': signedPath(STREAM_URL, { exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600 }),
  };
  for (const [name, path] of Object.entries(cases)) {
    const res = await app.request(path);
    assert.ok(res.status === 403, `${name}: got ${res.status}`);
  }
});

test('unauthorized relay, direct and POST requests are refused', async () => {
  const app = appWith(SECRET);
  assert.equal((await app.request(`${P}/__relay?url=${encodeURIComponent('https://evil.example/x.ts')}`)).status, 403);
  assert.equal((await app.request(`${P}//evil.example/x.ts`)).status, 403);
  assert.equal((await app.request(`${P}/__stream`, { method: 'POST' })).status, 405);
});

test('upstream redirect to a private address is refused with a bridge error', async () => {
  const routes = {
    ...UPSTREAM_ROUTES,
    'oha.to/live/resolve': () => new Response(null, { status: 302, headers: { location: 'http://10.0.0.1/x.m3u8' } }),
  };
  const res = await appWith(SECRET, routes).request(`${P}/live/resolve`);
  assert.equal(res.status, 502);
  assert.equal(await res.text(), 'Redirection NEAHPLUS non autoris\u00e9e');
});

test('upstream errors are passed through with their status, not replaced by a bridge page', async () => {
  const res = await appWith(SECRET).request(`${P}/missing/path.json`);
  assert.equal(res.status, 404);
  assert.match(await res.text(), /Not Found/);
});

test('without a signing secret, external streams are not issued', async () => {
  const res = await appWith(undefined).request(`${P}/live/resolve?url=${encodeURIComponent('https://oha.to/live/play/1')}`);
  assert.equal(res.status, 503);
});
