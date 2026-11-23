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

function getNeahplusBackend(env) {
  const rawOrigin = String(env.NEAHPLUS_BACKEND_ORIGIN || '').trim();
  const token = String(env.NEAHPLUS_GATEWAY_TOKEN || '');

  if (!rawOrigin || token.length < 32) return null;

  try {
    const url = new URL(rawOrigin);
    if (url.protocol !== 'https:' || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash) return null;
    return { origin: url.origin, token };
  } catch {
    return null;
  }
}

async function proxyNeahplus(context, incomingUrl, origin) {
  const { request, env } = context;
  if (!['GET', 'HEAD', 'POST'].includes(request.method)) {
    return jsonError('Méthode NEAHPLUS non autorisée', 405, origin);
  }

  const backend = getNeahplusBackend(env);
  if (!backend) {
    return jsonError('Backend NEAHPLUS non configuré', 503, origin);
  }

  const target = new URL(incomingUrl.pathname + incomingUrl.search, backend.origin);
  const headers = new Headers(request.headers);
  for (const name of HOP_BY_HOP_HEADERS) headers.delete(name);
  headers.delete('origin');
  headers.delete('referer');
  headers.delete('accept-encoding');
  headers.set('x-neahplus-gateway-token', backend.token);

  const init = {
    method: request.method,
    headers,
    redirect: 'manual',
  };
  if (!['GET', 'HEAD'].includes(request.method)) init.body = request.body;

  try {
    const upstream = await fetch(target.toString(), init);
    if (upstream.status >= 300 && upstream.status < 400 && upstream.headers.has('location')) {
      return jsonError('Redirection inattendue du backend NEAHPLUS', 502, origin);
    }

    const responseHeaders = new Headers(upstream.headers);
    for (const name of HOP_BY_HOP_HEADERS) responseHeaders.delete(name);
    applyCorsHeaders(responseHeaders, origin);
    responseHeaders.set('Cache-Control', 'no-store');

    const body = request.method === 'HEAD' || [204, 304].includes(upstream.status)
      ? null
      : upstream.body;

    return new Response(body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('[NEAHPLUS Gateway] Backend request failed:', error?.message || error);
    return jsonError('Backend NEAHPLUS temporairement indisponible', 502, origin);
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const incomingUrl = new URL(request.url);
  const origin = request.headers.get('Origin') || '';
  const isNeahplus = incomingUrl.pathname === '/api/neahplus' ||
    incomingUrl.pathname.startsWith('/api/neahplus/');

  if (origin && !getAllowedOrigins(env, incomingUrl).has(origin)) {
    return jsonError('Origin non autorisée', 403);
  }

  if (request.method === 'OPTIONS') {
    const headers = new Headers();
    applyCorsHeaders(headers, origin || incomingUrl.origin);
    return new Response(null, { status: 204, headers });
  }

  if (isNeahplus) {
    return proxyNeahplus(context, incomingUrl, origin);
  }

  if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    return jsonError('Méthode non autorisée', 405, origin);
  }

  const targetUrl = new URL(incomingUrl.pathname + incomingUrl.search, UPSTREAM_ORIGIN);
  const requestHeaders = new Headers(request.headers);
  for (const name of HOP_BY_HOP_HEADERS) requestHeaders.delete(name);
  requestHeaders.delete('origin');
  requestHeaders.delete('referer');
  requestHeaders.delete('accept-encoding');

  const init = {
    method: request.method,
    headers: requestHeaders,
    redirect: 'follow',
  };
  if (!['GET', 'HEAD'].includes(request.method)) init.body = request.body;

  try {
    const upstream = await fetch(targetUrl.toString(), init);
    const responseHeaders = new Headers(upstream.headers);
    for (const name of HOP_BY_HOP_HEADERS) responseHeaders.delete(name);
    applyCorsHeaders(responseHeaders, origin);

    if (!responseHeaders.has('Cache-Control')) {
      responseHeaders.set('Cache-Control', 'no-store');
    }

    const body = request.method === 'HEAD' || [204, 304].includes(upstream.status)
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
