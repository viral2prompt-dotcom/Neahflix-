import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createTlsServer } from 'node:https';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { allAddressesPublic, createPinnedLookup, httpTransport, isPublicIp } from '../neahplusNetwork.js';

const PUBLIC = [{ address: '93.184.216.34', family: 4 }];
const PRIVATE = [{ address: '127.0.0.1', family: 4 }];
const loopbackOnly = (address) => address === '127.0.0.1';

const connect = (lookup, hostname) => new Promise((resolve, reject) => {
  lookup(hostname, { all: true }, (error, addresses) => (error ? reject(error) : resolve(addresses)));
});

const transport = (url, lookup, method = 'GET') => httpTransport({
  url: new URL(url), method, headers: new Headers(), body: undefined, lookup, timeoutMs: 5000,
});

const withServer = async (server, run) => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    return await run(server.address().port);
  } finally {
    server.close();
  }
};

test('IPv4 and IPv6 classification refuses every reserved, private and mapped range', () => {
  for (const address of [
    '0.0.0.0', '10.1.2.3', '100.64.0.1', '127.0.0.1', '169.254.169.254', '172.16.0.1', '172.31.255.255',
    '192.0.0.1', '192.168.1.1', '198.18.0.1', '203.0.113.5', '224.0.0.1', '240.0.0.1', '255.255.255.255',
    '::', '::1', 'fc00::1', 'fd12::1', 'fe80::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:93.184.216.34',
    '64:ff9b::1', '2001:db8::1', '[::1]', 'fe80::1%eth0',
  ]) {
    assert.equal(isPublicIp(address), false, address);
  }
  for (const address of ['109.205.187.150', '93.184.216.34', '172.32.0.1', '8.8.8.8', '2606:4700::1111']) {
    assert.equal(isPublicIp(address), true, address);
  }
  assert.equal(isPublicIp('not-an-ip'), false);
  assert.equal(allAddressesPublic([]), false);
  assert.equal(allAddressesPublic([...PUBLIC, PRIVATE[0]]), false);
});

test('connect-time lookup returns public addresses in the shape Node expects', async () => {
  const lookup = createPinnedLookup(async () => PUBLIC);
  assert.deepEqual(await connect(lookup, 'stream.example'), PUBLIC);
  await new Promise((resolve, reject) => {
    lookup('stream.example', {}, (error, address, family) => {
      if (error) return reject(error);
      assert.equal(address, '93.184.216.34');
      assert.equal(family, 4);
      resolve();
    });
  });
});

test('connect-time lookup refuses when any resolved address is private', async () => {
  const lookup = createPinnedLookup(async () => [...PUBLIC, { address: '10.0.0.7', family: 4 }]);
  await assert.rejects(connect(lookup, 'stream.example'), /non publique/);
});

test('connect-time lookup refuses a name that resolves to loopback or to nothing', async () => {
  await assert.rejects(connect(createPinnedLookup(async () => PRIVATE), 'loop.example'), /non publique/);
  await assert.rejects(connect(createPinnedLookup(async () => []), 'empty.example'), /non publique/);
});

test('connect-time lookup propagates resolver failures', async () => {
  const lookup = createPinnedLookup(async () => { throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }); });
  await assert.rejects(connect(lookup, 'gone.example'), { code: 'ENOTFOUND' });
});

test('DNS rebinding: a name public at first lookup but private at connect time is refused', async () => {
  let resolutions = 0;
  const lookup = createPinnedLookup(async () => {
    resolutions += 1;
    return resolutions === 1 ? PRIVATE : [{ address: '10.0.0.9', family: 4 }];
  }, loopbackOnly);
  await withServer(createHttpServer((_req, res) => res.end('ok')), async (port) => {
    const url = `http://stream.test:${port}/a.ts`;
    assert.equal(await (await transport(url, lookup)).text(), 'ok');
    await assert.rejects(transport(url, lookup), /non publique/);
  });
  assert.equal(resolutions, 2);
});

test('real socket: the connection goes to the validated address and keeps the Host header', async () => {
  const seenHosts = [];
  const lookup = createPinnedLookup(async () => PRIVATE, loopbackOnly);
  await withServer(createHttpServer((req, res) => {
    seenHosts.push(req.headers.host);
    res.end('ok');
  }), async (port) => {
    assert.equal(await (await transport(`http://stream.test:${port}/a.ts`, lookup)).text(), 'ok');
    assert.deepEqual(seenHosts, [`stream.test:${port}`]);
  });
});

test('real socket: a loopback target is refused by the default policy without any request reaching the server', async () => {
  let reached = false;
  const lookup = createPinnedLookup(async () => PRIVATE);
  await withServer(createHttpServer((_req, res) => { reached = true; res.end(); }), async (port) => {
    await assert.rejects(transport(`http://stream.test:${port}/a.ts`, lookup), /non publique/);
  });
  assert.equal(reached, false);
});

test('TLS: SNI is the URL hostname and an untrusted certificate is refused', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'neahplus-tls-'));
  let sni = null;
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'k.pem'),
      '-out', join(dir, 'c.pem'), '-days', '1', '-subj', '/CN=stream.test',
      '-addext', 'subjectAltName=DNS:stream.test'], { stdio: 'ignore' });
    await runTlsCase(join(dir, 'k.pem'), join(dir, 'c.pem'), (value) => { sni = value; });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.equal(sni, 'stream.test');
});

const runTlsCase = async (keyPath, certPath, onSni) => {
  const server = createTlsServer({
    key: readFileSync(keyPath),
    cert: readFileSync(certPath),
    SNICallback: (name, callback) => { onSni(name); callback(null, undefined); },
  }, (_req, res) => res.end('ok'));
  server.on('tlsClientError', () => {});
  const lookup = createPinnedLookup(async () => PRIVATE, loopbackOnly);
  await withServer(server, async (port) => {
    await assert.rejects(transport(`https://stream.test:${port}/a.ts`, lookup), (error) => {
      assert.match(error.code || error.message, /SELF_SIGNED|UNABLE_TO_VERIFY|CERT|certificate/i);
      return true;
    });
  });
};
