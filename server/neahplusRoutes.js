import {
  NEAHPLUS_ORIGIN,
  NEAHPLUS_PREFIX,
  NeahplusRefused,
  isTrustedDestination,
  rewriteNeahplusText,
} from './neahplus.js';

const MAX_REWRITE_BYTES = 8 * 1024 * 1024;
const STRIPPED_REQUEST_HEADERS = ['host', 'origin', 'referer', 'connection', 'content-length', 'accept-encoding'];
const PASSED_RESPONSE_HEADERS = ['content-type', 'accept-ranges', 'content-range', 'last-modified', 'etag'];

const parseTarget = (value, base) => {
  try {
    return new URL(value, base);
  } catch {
    throw new NeahplusRefused('Destination NEAHPLUS non autorisée');
  }
};

const resolveUpstream = (bridge, incoming) => {
  const { pathname } = incoming;
  if (pathname.endsWith('/__stream')) return bridge.verifiedStreamTarget(incoming);
  if (pathname.endsWith('/__relay')) {
    const target = parseTarget(incoming.searchParams.get('url') || '');
    if (!isTrustedDestination(target)) throw new NeahplusRefused('Destination NEAHPLUS non autorisée');
    return target;
  }
  const suffix = pathname.slice(NEAHPLUS_PREFIX.length) || '/';
  const target = parseTarget(`${suffix}${incoming.search}`, NEAHPLUS_ORIGIN);
  if (!isTrustedDestination(target)) throw new NeahplusRefused('Destination NEAHPLUS non autorisée');
  return target;
};

const upstreamCookies = (response) => {
  if (typeof response.headers.getSetCookie === 'function') return response.headers.getSetCookie();
  const single = response.headers.get('set-cookie');
  return single ? [single] : [];
};

const scopeCookie = (cookie) => {
  let scoped = cookie.replace(/;\s*domain=[^;]*/i, '').replace(/;\s*path=[^;]*/i, `; Path=${NEAHPLUS_PREFIX}`);
  if (!/;\s*path=/i.test(scoped)) scoped += `; Path=${NEAHPLUS_PREFIX}`;
  return scoped;
};

export const mountNeahplusHealth = (app, bridge) => {
  app.get('/health/neahplus', (c) => c.json({ ok: true, enabled: bridge.enabled }));
};

export const mountNeahplus = (app, bridge) => {
  const handler = async (c) => {
    if (!['GET', 'HEAD', 'POST'].includes(c.req.method)) {
      return c.text('Méthode NEAHPLUS non autorisée', 405, { Allow: 'GET, HEAD, POST' });
    }
    const incoming = new URL(c.req.url);
    if (incoming.pathname.endsWith('/__stream') && c.req.method === 'POST') {
      return c.text('Méthode NEAHPLUS non autorisée', 405, { Allow: 'GET, HEAD' });
    }

    try {
      const method = c.req.method;
      const requestBody = ['GET', 'HEAD'].includes(method) ? undefined : await c.req.arrayBuffer();
      const headers = new Headers(c.req.raw.headers);
      for (const key of STRIPPED_REQUEST_HEADERS) headers.delete(key);
      headers.set('origin', NEAHPLUS_ORIGIN);
      headers.set('referer', `${NEAHPLUS_ORIGIN}/`);

      const { response, upstream } = await bridge.fetchUpstream({
        url: resolveUpstream(bridge, incoming),
        method,
        headers,
        body: requestBody,
      });

      const outHeaders = new Headers();
      for (const name of PASSED_RESPONSE_HEADERS) {
        const value = response.headers.get(name);
        if (value) outHeaders.set(name, value);
      }
      outHeaders.set('cache-control', 'no-store');
      outHeaders.set('x-content-type-options', 'nosniff');
      for (const cookie of upstreamCookies(response)) outHeaders.append('set-cookie', scopeCookie(cookie));

      const type = response.headers.get('content-type') || '';
      if (method === 'HEAD' || response.status === 204 || response.status === 304) {
        return new Response(null, { status: response.status, headers: outHeaders });
      }

      const playlist = response.ok && (/mpegurl/i.test(type) || /\.m3u8(?:$|\?)/i.test(upstream.pathname));
      const rewriteable = response.ok && (playlist || /(?:text\/html|javascript|ecmascript|text\/css|application\/json)/i.test(type));
      if (!rewriteable) return new Response(response.body, { status: response.status, headers: outHeaders });

      const text = await response.text();
      if (text.length > MAX_REWRITE_BYTES) return c.text('Réponse NEAHPLUS trop volumineuse', 502);
      const rewritten = playlist
        ? bridge.rewritePlaylist(text, upstream)
        : rewriteNeahplusText(
          /\/resolve$/.test(upstream.pathname) && /json/i.test(type) ? await bridge.rewriteResolveJson(text) : text,
          /text\/html/i.test(type),
        );
      return new Response(rewritten, { status: response.status, headers: outHeaders });
    } catch (error) {
      if (error instanceof NeahplusRefused) return c.text(error.message, error.status);
      console.error('[NEAHPLUS] Bridge failed:', error?.message || error);
      return c.text('Passerelle HTTPS NEAHPLUS indisponible', 502);
    }
  };

  app.all(NEAHPLUS_PREFIX, handler);
  app.all(`${NEAHPLUS_PREFIX}/*`, handler);
};
