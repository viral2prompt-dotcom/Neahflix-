import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from './[[path]].js';

const ORIGIN = 'https://neahflix.cg';
const TOKEN = 'test-gateway-token-with-at-least-32-characters';
const BACKEND = 'https://neahplus-backend.example';

const makeContext = ({ path = '/api/neahplus/live2/master.m3u8?x=1', method = 'GET', headers = {}, env = {} } = {}) => {
  const request = new Request(`${ORIGIN}${path}`, { method, headers });
  return {
    request,
    env,
  };
};

test('NEAHPLUS returns 503 until its backend and gateway secret are configured', async () => {
  const response = await onRequest(makeContext());
  assert.equal(response.status, 503);
  assert.match(await response.text(), /Backend NEAHPLUS non configuré/);
});

test('NEAHPLUS is proxied to the configured backend with a private gateway token', async () => {
  const originalFetch = globalThis.fetch;
  let receivedUrl;
  let receivedInit;

  globalThis.fetch = async (url, init) => {
    receivedUrl = String(url);
    receivedInit = init;
    return new Response('video-segment', {
      status: 206,
      headers: { 'content-type': 'video/mp2t', 'content-range': 'bytes 0-13/100' },
    });
  };

  try {
    const response = await onRequest(makeContext({
      headers: { Origin: ORIGIN, Referer: ORIGIN + '/', Range: 'bytes=0-13' },
      env: {
        NEAHPLUS_BACKEND_ORIGIN: BACKEND,
        NEAHPLUS_GATEWAY_TOKEN: TOKEN,
      },
    }));

    assert.equal(receivedUrl, BACKEND + '/api/neahplus/live2/master.m3u8?x=1');
    assert.equal(receivedInit.headers.get('x-neahplus-gateway-token'), TOKEN);
    assert.equal(receivedInit.headers.get('origin'), null);
    assert.equal(receivedInit.headers.get('referer'), null);
    assert.equal(receivedInit.headers.get('range'), 'bytes=0-13');
    assert.equal(receivedInit.redirect, 'manual');
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('access-control-allow-origin'), ORIGIN);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(await response.text(), 'video-segment');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('NEAHPLUS rejects a backend URL that is not HTTPS', async () => {
  const response = await onRequest(makeContext({
    env: {
      NEAHPLUS_BACKEND_ORIGIN: 'http://neahplus-backend.example',
      NEAHPLUS_GATEWAY_TOKEN: TOKEN,
    },
  }));
  assert.equal(response.status, 503);
});

test('cross-origin requests are rejected unless explicitly allowed', async () => {
  const response = await onRequest(makeContext({
    headers: { Origin: 'https://untrusted.example' },
    env: {
      NEAHPLUS_BACKEND_ORIGIN: BACKEND,
      NEAHPLUS_GATEWAY_TOKEN: TOKEN,
    },
  }));
  assert.equal(response.status, 403);
});

test('preflight requests are answered by Pages without contacting the backend', async () => {
  const response = await onRequest(makeContext({
    method: 'OPTIONS',
    headers: { Origin: ORIGIN },
    env: {
      NEAHPLUS_BACKEND_ORIGIN: BACKEND,
      NEAHPLUS_GATEWAY_TOKEN: TOKEN,
    },
  }));
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), ORIGIN);
});
