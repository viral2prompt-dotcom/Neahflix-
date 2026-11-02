import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { createNeahplusBridge } from '../neahplus.js';
import { mountNeahplus, mountNeahplusHealth } from '../neahplusRoutes.js';

const SECRET = 'test-secret-with-at-least-32-characters!!';
const STREAM = '/api/neahplus/__stream?url=' + encodeURIComponent('http://109.205.187.150:8008/a.m3u8') + '&exp=9999999999&sig=AAAA';

const appWith = (secret) => {
  const bridge = createNeahplusBridge({ secret, resolveHost: async () => [{ address: '93.184.216.34', family: 4 }] });
  const app = new Hono();
  mountNeahplusHealth(app, bridge);
  mountNeahplus(app, bridge);
  return app;
};

test('health reports NEAHPLUS disabled without a secret and exposes no secret value', async () => {
  const res = await appWith(undefined).request('/health/neahplus');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, enabled: false });
});

test('health reports NEAHPLUS enabled with a valid secret', async () => {
  const res = await appWith(SECRET).request('/health/neahplus');
  assert.deepEqual(await res.json(), { ok: true, enabled: true });
});

test('without a secret, signed stream requests are refused with 503 before any upstream call', async () => {
  const res = await appWith(undefined).request(STREAM);
  assert.equal(res.status, 503);
  assert.ok(!(await res.text()).includes(SECRET));
});

test('with a secret, an unsigned stream request is refused with 403 instead of 503', async () => {
  const res = await appWith(SECRET).request(STREAM);
  assert.equal(res.status, 403);
});
