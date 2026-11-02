import { BlockList, isIP } from 'node:net';
import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { Readable } from 'node:stream';

const reservedV4 = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) reservedV4.addSubnet(network, prefix, 'ipv4');

const reservedV6 = new BlockList();
for (const [network, prefix] of [
  ['::', 128], ['::1', 128], ['::ffff:0:0', 96], ['64:ff9b::', 96], ['100::', 64], ['2001:db8::', 32],
  ['2002::', 16], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
]) reservedV6.addSubnet(network, prefix, 'ipv6');

export const isPublicIp = (address) => {
  const host = String(address).replace(/^\[|\]$/g, '').split('%')[0];
  const family = isIP(host);
  if (family === 4) return !reservedV4.check(host, 'ipv4');
  if (family === 6) return !reservedV6.check(host, 'ipv6');
  return false;
};

export const defaultResolveHost = (hostname) => dnsLookup(hostname, { all: true, verbatim: true });

export const allAddressesPublic = (addresses) =>
  addresses.length > 0 && addresses.every(({ address }) => isPublicIp(address));

// Node calls this lookup at connect time for every new socket. The socket is
// opened to exactly the addresses returned here, so a DNS answer that changes
// after signing cannot move the connection (rebinding).
export const createPinnedLookup = (resolveHost, isAllowedAddress = isPublicIp) => (hostname, options, callback) => {
  Promise.resolve()
    .then(() => resolveHost(hostname))
    .then(
      (addresses) => {
        if (addresses.length === 0 || !addresses.every(({ address }) => isAllowedAddress(address))) {
          callback(new Error(`Destination NEAHPLUS non publique (${hostname})`));
          return;
        }
        if (options?.all) callback(null, addresses);
        else callback(null, addresses[0].address, addresses[0].family);
      },
      (error) => callback(error),
    );
};

// agent: false gives each request its own socket, so no connection is reused
// without passing the lookup above. The URL hostname stays in the Host header
// and in the TLS SNI, and certificates are verified by default.
export const httpTransport = ({ url, method, headers, body, lookup, timeoutMs }) =>
  new Promise((resolve, reject) => {
    const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = request(url, {
      method,
      headers: Object.fromEntries(headers),
      lookup,
      timeout: timeoutMs,
      agent: false,
    }, (res) => {
      const responseHeaders = new Headers();
      for (const [name, value] of Object.entries(res.headers)) {
        if (value === undefined) continue;
        for (const item of [].concat(value)) responseHeaders.append(name, item);
      }
      const status = res.statusCode;
      const noBody = method === 'HEAD' || [204, 205, 304].includes(status);
      if (noBody) res.resume();
      resolve(new Response(noBody ? null : Readable.toWeb(res), { status, headers: responseHeaders }));
    });
    req.on('timeout', () => req.destroy(new Error('NEAHPLUS upstream timeout')));
    req.on('error', reject);
    req.end(body ? Buffer.from(body) : undefined);
  });
