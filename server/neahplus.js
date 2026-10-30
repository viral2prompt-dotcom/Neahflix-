export const NEAHPLUS_PREFIX = '/api/neahplus';
export const NEAHPLUS_ORIGIN = 'https://oha.to';

const STREAM_ROUTE_TTL_MS = 6 * 60 * 60 * 1000;
const STREAM_ROUTE_LIMIT = 500;
const streamRoutes = [];

export const NEAHPLUS_ALLOWED_HOST = (hostname) => {
  const host = String(hostname || '').toLowerCase();
  return host === 'oha.to' || host === 'www.oha.to' ||
    host === 'tvfree.to' || host.endsWith('.tvfree.to');
};

const isPublicHostname = (hostname) => {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost')) return false;
  if (host.includes(':')) {
    return !(host === '::' || host === '::1' || host.startsWith('::ffff:') ||
      /^f[cd]/.test(host) || /^fe[89ab]/.test(host));
  }
  const ipv4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!ipv4) return true;
  const a = Number(ipv4[1]);
  const b = Number(ipv4[2]);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127));
};

const registerStreamRoute = (url) => {
  const now = Date.now();
  for (let i = streamRoutes.length - 1; i >= 0; i -= 1) {
    if (streamRoutes[i].expires <= now) streamRoutes.splice(i, 1);
  }
  const dir = url.pathname.slice(0, url.pathname.lastIndexOf('/') + 1);
  const existing = streamRoutes.find((route) => route.origin === url.origin && route.dir === dir);
  if (existing) {
    existing.expires = now + STREAM_ROUTE_TTL_MS;
    return;
  }
  streamRoutes.push({ origin: url.origin, dir, expires: now + STREAM_ROUTE_TTL_MS });
  if (streamRoutes.length > STREAM_ROUTE_LIMIT) streamRoutes.shift();
};

const isRegisteredStreamRoute = (url) => {
  const now = Date.now();
  return streamRoutes.some((route) => route.expires > now &&
    route.origin === url.origin && url.pathname.startsWith(route.dir));
};

const isHttpUrlWithoutCredentials = (url) =>
  ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;

export const isAllowedNeahplusDestination = (url) => {
  if (!isHttpUrlWithoutCredentials(url)) return false;
  if (NEAHPLUS_ALLOWED_HOST(url.hostname)) return true;
  return isPublicHostname(url.hostname) && isRegisteredStreamRoute(url);
};

export const neahplusBridgeUrl = (url) => {
  if (!isAllowedNeahplusDestination(url)) {
    throw new Error('Destination NEAHPLUS non autorisée');
  }
  const host = url.hostname.toLowerCase();
  if (host === 'tvfree.to' || host.endsWith('.tvfree.to')) {
    return `${NEAHPLUS_PREFIX}/__relay?url=${encodeURIComponent(url.toString())}`;
  }
  if (NEAHPLUS_ALLOWED_HOST(host)) {
    return `${NEAHPLUS_PREFIX}${url.pathname}${url.search}${url.hash}`;
  }
  return `${NEAHPLUS_PREFIX}/__stream?url=${encodeURIComponent(url.toString())}`;
};

// Only the stream URL that OHA's own resolve API returns is trusted: its origin and
// directory become reachable through the bridge for a limited time.
export const rewriteNeahplusResolveJson = (text) => {
  let data;
  try { data = JSON.parse(text); } catch { return text; }
  if (!data || typeof data.url !== 'string') return text;
  let target;
  try { target = new URL(data.url); } catch { return text; }
  if (!isHttpUrlWithoutCredentials(target) || NEAHPLUS_ALLOWED_HOST(target.hostname) ||
      !isPublicHostname(target.hostname)) {
    return text;
  }
  registerStreamRoute(target);
  return JSON.stringify({ ...data, url: neahplusBridgeUrl(target) });
};

export const rewriteNeahplusText = (text, isHtml = false) => {
  let output = String(text);
  output = output.replace(/https?:\/\/(?:www\.)?oha\.to/gi, NEAHPLUS_PREFIX);
  output = output.replace(/https?:\/\/(?:[a-z0-9-]+\.)*tvfree\.to[^"'\s<>)]*/gi, (value) => {
    try { return neahplusBridgeUrl(new URL(value)); } catch { return value; }
  });
  if (isHtml) {
    output = output.replace(/(["'`])\/(?!api\/neahplus(?:\/|["'`]))(assets|vuma|favicon|manifest|images|fonts|static)(?=\/|\?|#|["'`])/gi,
      (_match, quote, route) => `${quote}${NEAHPLUS_PREFIX}/${route}`);
  }
  output = output.replace(/url\((["']?)\/(assets|images|fonts|static)(?=\/)/gi,
    (_match, quote, route) => `url(${quote}${NEAHPLUS_PREFIX}/${route}`);

  if (isHtml) {
    output = output.replace(/<head(\s[^>]*)?>/i, (tag) => `${tag}<base href="${NEAHPLUS_PREFIX}/">`);
    output = output.replace(/new URL\(\s*(["'])\/\1\s*,\s*location\.href\s*\)/g,
      `new URL("${NEAHPLUS_PREFIX}/", location.origin)`);
  }
  return output;
};
