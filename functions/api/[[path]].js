const UPSTREAM_ORIGIN = 'https://api.movix.college';

const ALLOWED_METHODS = 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS';
const ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Requested-With',
  'Accept',
  'X-No-Compression',
  'baggage',
  'sentry-trace',
  'x-profile-id',
  'x-access-key',
  'x-movix-client-id',
  'x-turnstile-token',
].join(',');

const HOP_BY_HOP_HEADERS = [
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
];

function getAllowedOrigins(env, requestUrl) {
  const configured = String(env.MOVIX_API_ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  // Same-origin requests are always valid. Cross-origin clients must be
  // explicitly listed in the Cloudflare Pages environment variable.
  return new Set([requestUrl.origin, ...configured]);
}

function applyCorsHeaders(headers, origin) {
  if (!origin) return headers;

  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS);
  headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS);
  headers.set('Access-Control-Max-Age', '600');
  headers.append('Vary', 'Origin');
  return headers;
}

function jsonError(message, status, origin = '') {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  applyCorsHeaders(headers, origin);
  return new Response(JSON.stringify({ error: message }), { status, headers });
}

export async function onRequest(context) {
  const { request, env } = context;
  const incomingUrl = new URL(request.url);
  const origin = request.headers.get('Origin') || '';

  if (incomingUrl.pathname === '/api/neahplus' || incomingUrl.pathname.startsWith('/api/neahplus/')) {
    // NEAHPLUS uses its own signed Hono bridge, not the public Movix API.
    // Leave that route untouched rather than forwarding it to the wrong backend.
    return context.next();
  }

  if (origin && !getAllowedOrigins(env, incomingUrl).has(origin)) {
    return jsonError('Origin non autorisée', 403);
  }

  if (request.method === 'OPTIONS') {
    const headers = new Headers();
    applyCorsHeaders(headers, origin || incomingUrl.origin);
    return new Response(null, { status: 204, headers });
  }

  if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    return jsonError('Méthode non autorisée', 405, origin);
  }

  const targetUrl = new URL(incomingUrl.pathname + incomingUrl.search, UPSTREAM_ORIGIN);
  const requestHeaders = new Headers(request.headers);

  // Movix currently rejects browser Origin headers. The Pages Function makes
  // the server-to-server request and adds the browser CORS response headers.
  for (const name of HOP_BY_HOP_HEADERS) requestHeaders.delete(name);
  requestHeaders.delete('origin');
  requestHeaders.delete('referer');
  requestHeaders.delete('accept-encoding');

  const init = {
    method: request.method,
    headers: requestHeaders,
    redirect: 'follow',
  };

  if (!['GET', 'HEAD'].includes(request.method)) {
    init.body = request.body;
  }

  try {
    const upstream = await fetch(targetUrl.toString(), init);
    const responseHeaders = new Headers(upstream.headers);
    for (const name of HOP_BY_HOP_HEADERS) responseHeaders.delete(name);
    applyCorsHeaders(responseHeaders, origin);

    if (!responseHeaders.has('Cache-Control')) {
      responseHeaders.set('Cache-Control', 'no-store');
    }

    const body = ['HEAD'].includes(request.method) || [204, 304].includes(upstream.status)
      ? null
      : upstream.body;

    return new Response(body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('[Movix API Gateway] Upstream request failed:', error?.message || error);
    return jsonError('API Movix temporairement indisponible', 502, origin);
  }
}
