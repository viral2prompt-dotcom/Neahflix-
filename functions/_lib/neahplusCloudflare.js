import { isIP } from 'node:net';
import { Hono } from 'hono';
import { createNeahplusBridge, NeahplusRefused } from '../../server/neahplus.js';
import { mountNeahplus } from '../../server/neahplusRoutes.js';

/**
 * Cloudflare's HTTP egress proxy only permits public Internet destinations
 * (plus the Worker's own zone origin). We still resolve and validate every
 * destination before fetch; Cloudflare enforces the public-network boundary
 * again at connection time, so a DNS change to a private address is blocked
 * even though Workers' fetch API does not expose a pinned socket lookup.
 *
 * Workers fetch cannot target IP-literal URLs. NEAHPLUS stream URLs are
 * expected to use hostnames (including IP-encoded tvfree.to hostnames).
 */
export const createCloudflareFetchTransport = ({
  fetchImpl = (...args) => fetch(...args),
  blockedHost = '',
} = {}) => async ({ url, method, headers, body, lookup, timeoutMs }) => {
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (isIP(hostname)) {
    throw new NeahplusRefused('Destination IP directe non prise en charge par Cloudflare', 502);
  }

  if (blockedHost && hostname === blockedHost.toLowerCase()) {
    throw new NeahplusRefused('Destination NEAHPLUS correspondant au domaine du site refusée', 502);
  }

  // createPinnedLookup validates every DNS answer as a public IP. Workers'
  // fetch proxy independently blocks private/local network destinations.
  await new Promise((resolve, reject) => {
    lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
      if (error) reject(error);
      else if (!Array.isArray(addresses) || addresses.length === 0) {
        reject(new Error('Aucune adresse publique pour la destination NEAHPLUS'));
      } else resolve(addresses);
    });
  });

  return fetchImpl(url.toString(), {
    method,
    headers,
    body: ['GET', 'HEAD'].includes(method) ? undefined : body,
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
  });
};

export const createNeahplusCloudflareHandler = ({
  resolveHost,
  fetchImpl,
} = {}) => async (request, env) => {
  const secret = String(env.NEAHPLUS_SIGNING_SECRET || '');
  if (secret.length < 32) {
    return new Response('Secret de signature NEAHPLUS non configuré', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const requestHost = new URL(request.url).hostname;
  const bridge = createNeahplusBridge({
    secret,
    ...(resolveHost ? { resolveHost } : {}),
    transport: createCloudflareFetchTransport({ fetchImpl, blockedHost: requestHost }),
  });

  const app = new Hono();
  mountNeahplus(app, bridge);
  return app.fetch(request, env);
};

export const handleNeahplusCloudflare = createNeahplusCloudflareHandler();
