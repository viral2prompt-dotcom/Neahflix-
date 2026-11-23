import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeahplusCloudflareHandler, createCloudflareFetchTransport, createCloudflareResolveHost } from '../_lib/neahplusCloudflare.js';
import { onRequest } from './[[path]].js';

const ORIGIN = 'https://neahflix.cg';
const SECRET = 'test-neahplus-signing-secret-at-least-32-characters';

const makeContext = ({ path = '/api/neahplus/live2/master.m3u8?x=1', method = 'GET', headers = {}, env = {} } = {}) => ({
  request: new Request(`${ORIGIN}${path}`, { method, headers }),
  env,
});

const publicResolver = async () => [{ address: '1.1.1.1', family: 4 }];

test('NEAHPLUS returns 503 until its signing secret is configured', async () => {
  const handler = createNeahplusCloudflareHandler({ resolveHost: publicResolver });
  const response = await handler(new Request(`${ORIGIN}/api/neahplus/live2/master.m3u8`), {});
  assert.equal(response.status, 503);
  assert.match(await response.text(), /Secret de signature NEAHPLUS non configuré/);
});

test('NEAHPLUS runs inside Pages and streams upstream responses without a separate backend', async () => {
  let receivedUrl;
  let receivedInit;
  const handler = createNeahplusCloudflareHandler({
    resolveHost: publicResolver,
    fetchImpl: async (url, init) => {
      receivedUrl = String(url);
      receivedInit = init;
      return new Response('video-segment', {
        status: 206,
        headers: { 'content-type': 'video/mp2t', 'content-range': 'bytes 0-13/100' },
      });
    },
  });

  const response = await handler(new Request(`${ORIGIN}/api/neahplus/live2/segment.ts`, {
    headers: { Range: 'bytes=0-13' },
  }), { NEAHPLUS_SIGNING_SECRET: SECRET });

  assert.equal(receivedUrl, 'https://oha.to/live2/segment.ts');
  assert.equal(receivedInit.redirect, 'manual');
  assert.equal(receivedInit.headers.get('origin'), 'https://oha.to');
  assert.equal(receivedInit.headers.get('referer'), 'https://oha.to/');
  assert.equal(receivedInit.headers.get('range'), 'bytes=0-13');
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 0-13/100');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(await response.text(), 'video-segment');
});

test('NEAHPLUS refuses DNS answers that include a private address before fetching', async () => {
  let fetchCalls = 0;
  const handler = createNeahplusCloudflareHandler({
    resolveHost: async () => [{ address: '127.0.0.1', family: 4 }],
    fetchImpl: async () => {
      fetchCalls += 1;
      return new Response('should not be reached');
    },
  });

  const response = await handler(new Request(`${ORIGIN}/api/neahplus/live2/segment.ts`), {
    NEAHPLUS_SIGNING_SECRET: SECRET,
  });

  assert.equal(response.status, 502);
  assert.equal(fetchCalls, 0);
});

test('NEAHPLUS refuses requests that would call back into the same site host', async () => {
  let fetchCalls = 0;
  const handler = createNeahplusCloudflareHandler({
    resolveHost: publicResolver,
    fetchImpl: async () => {
      fetchCalls += 1;
      return new Response('should not be reached');
    },
  });

  const response = await handler(new Request('https://oha.to/api/neahplus/live2/segment.ts'), {
    NEAHPLUS_SIGNING_SECRET: SECRET,
  });

  assert.equal(response.status, 502);
  assert.equal(fetchCalls, 0);
});

test('Cloudflare transport refuses IP-literal stream URLs', async () => {
  const transport = createCloudflareFetchTransport({
    fetchImpl: async () => new Response('should not be reached'),
  });

  await assert.rejects(
    transport({
      url: new URL('https://1.1.1.1/segment.ts'),
      method: 'GET',
      headers: new Headers(),
      lookup: () => {},
      timeoutMs: 1000,
    }),
    /IP directe non prise en charge/,
  );
});


test('Cloudflare DNS resolver uses supported A and AAAA resolution methods', async () => {
  const resolveHost = createCloudflareResolveHost({
    resolve4Impl: async (hostname) => {
      assert.equal(hostname, 'oha.to');
      return ['93.184.216.34'];
    },
    resolve6Impl: async (hostname) => {
      assert.equal(hostname, 'oha.to');
      return ['2606:4700:4700::1111'];
    },
  });

  assert.deepEqual(await resolveHost('oha.to'), [
    { address: '93.184.216.34', family: 4 },
    { address: '2606:4700:4700::1111', family: 6 },
  ]);
});

test('Cloudflare DNS resolver tolerates a hostname without an AAAA record', async () => {
  const resolveHost = createCloudflareResolveHost({
    resolve4Impl: async () => ['93.184.216.34'],
    resolve6Impl: async () => {
      const error = new Error('No AAAA record');
      error.code = 'ENODATA';
      throw error;
    },
  });

  assert.deepEqual(await resolveHost('oha.to'), [
    { address: '93.184.216.34', family: 4 },
  ]);
});

test('cross-origin requests are rejected unless explicitly allowed', async () => {
  const response = await onRequest(makeContext({
    headers: { Origin: 'https://untrusted.example' },
    env: {
      NEAHPLUS_SIGNING_SECRET: SECRET,
    },
  }));
  assert.equal(response.status, 403);
});

test('preflight requests are answered by Pages without contacting NEAHPLUS', async () => {
  const response = await onRequest(makeContext({
    method: 'OPTIONS',
    headers: { Origin: ORIGIN },
    env: {},
  }));
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), ORIGIN);
});
