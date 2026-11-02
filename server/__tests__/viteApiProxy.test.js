import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApiProxy } from '../../scripts/viteApiProxy.mjs';

const MAIN_API = 'http://127.0.0.1:25565';
const route = (table, path) => Object.keys(table).find((prefix) => path.startsWith(prefix));

test('NEAHPLUS routes go to the Hono port, not the Main API', () => {
  const table = createApiProxy(3001);
  const key = route(table, '/api/neahplus/live/resolve?url=x');
  assert.equal(key, '/api/neahplus/');
  assert.equal(table[key].target, 'http://127.0.0.1:3001');
});

test('the NEAHPLUS port follows the configured backend port', () => {
  assert.equal(createApiProxy(4100)['/api/neahplus/'].target, 'http://127.0.0.1:4100');
});

test('other /api routes keep the Main API destination', () => {
  const table = createApiProxy(3001);
  for (const path of ['/api/movies/1', '/api/neahplusfake', '/api', '/backend-api/x', '/neahlite/y']) {
    const key = route(table, path);
    assert.ok(key, path);
    assert.equal(table[key].target, MAIN_API, path);
  }
});
