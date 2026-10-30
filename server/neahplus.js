import { createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import {
  allAddressesPublic,
  createPinnedLookup,
  defaultResolveHost,
  httpTransport,
  isPublicIp,
} from './neahplusNetwork.js';

export const NEAHPLUS_PREFIX = '/api/neahplus';
export const NEAHPLUS_ORIGIN = 'https://oha.to';

const GRANT_TTL_SECONDS = 6 * 60 * 60;
const MIN_SECRET_LENGTH = 32;
const MAX_REDIRECTS = 5;
const UPSTREAM_TIMEOUT_MS = 30000;

export class NeahplusRefused extends Error {
  constructor(message, status = 403) {
    super(message);
    this.name = 'NeahplusRefused';
    this.status = status;
  }
}

const hostOf = (url) => url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
const isTvfreeHost = (host) => host === 'tvfree.to' || host.endsWith('.tvfree.to');
const isTrustedHost = (host) => host === 'oha.to' || host === 'www.oha.to' || isTvfreeHost(host);
const isHttpUrl = (url) => ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;

export const isTrustedDestination = (url) => isHttpUrl(url) && isTrustedHost(hostOf(url));

const isPublicTarget = (url) => {
  const host = hostOf(url);
  if (!host || host === 'localhost' || host.endsWith('.localhost')) return false;
  return isIP(host) ? isPublicIp(host) : true;
};

const directPath = (url) => `${NEAHPLUS_PREFIX}${url.pathname}${url.search}${url.hash}`;
const relayPath = (url) => `${NEAHPLUS_PREFIX}/__relay?url=${encodeURIComponent(url.toString())}`;

export const rewriteNeahplusLogoPaths = (text) =>
  String(text).replace(/"\/live2\//g, `"${NEAHPLUS_PREFIX}/live2/`);

export const rewriteNeahplusText = (text, isHtml = false) => {
  let output = String(text);
  output = output.replace(/https?:\/\/(?:www\.)?oha\.to/gi, NEAHPLUS_PREFIX);
  output = output.replace(/https?:\/\/(?:[a-z0-9-]+\.)*tvfree\.to[^"'\s<>)]*/gi, (value) => {
    try {
      const url = new URL(value);
      return isTvfreeHost(hostOf(url)) ? relayPath(url) : value;
    } catch {
      return value;
    }
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

export const createNeahplusBridge = ({
  secret,
  now = Date.now,
  resolveHost = defaultResolveHost,
  transport = httpTransport,
} = {}) => {
  const key = typeof secret === 'string' && secret.length >= MIN_SECRET_LENGTH ? secret : null;
  const lookup = createPinnedLookup(resolveHost);
  const nowSeconds = () => Math.floor(now() / 1000);

  const requireKey = () => {
    if (!key) throw new NeahplusRefused('Flux externes NEAHPLUS désactivés (secret de signature absent)', 503);
  };

  const sign = (target, exp) => createHmac('sha256', key).update(`${exp}\n${target}`).digest('base64url');

  const streamPath = (target) => {
    requireKey();
    const exp = nowSeconds() + GRANT_TTL_SECONDS;
    return `${NEAHPLUS_PREFIX}/__stream?${new URLSearchParams({ url: target, exp: String(exp), sig: sign(target, exp) })}`;
  };

  const verifiedStreamTarget = (incoming) => {
    requireKey();
    let url;
    try {
      url = new URL(incoming.searchParams.get('url') || '');
    } catch {
      throw new NeahplusRefused('Lien NEAHPLUS invalide');
    }
    if (!isHttpUrl(url) || !isPublicTarget(url)) throw new NeahplusRefused('Destination NEAHPLUS non autorisée');

    const canonical = url.toString();
    const expRaw = incoming.searchParams.get('exp') || '';
    const exp = /^\d+$/.test(expRaw) ? Number(expRaw) : NaN;
    const expected = Buffer.from(Number.isFinite(exp) ? sign(canonical, exp) : '');
    const given = Buffer.from(incoming.searchParams.get('sig') || '');
    if (expected.length === 0 || given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new NeahplusRefused('Signature NEAHPLUS invalide');
    }
    const remaining = exp - nowSeconds();
    if (remaining <= 0 || remaining > GRANT_TTL_SECONDS) throw new NeahplusRefused('Lien NEAHPLUS expiré');
    return url;
  };

  const isPublicDestination = async (url) => {
    if (!isPublicTarget(url)) return false;
    const host = hostOf(url);
    if (isIP(host)) return true;
    try {
      return allAddressesPublic(await resolveHost(host));
    } catch {
      return false;
    }
  };

  const playlistUrl = (url, base) => {
    if (!isHttpUrl(url)) throw new NeahplusRefused('Destination NEAHPLUS non autorisée');
    if (isTrustedHost(hostOf(url))) return isTvfreeHost(hostOf(url)) ? relayPath(url) : directPath(url);
    if (url.origin !== base.origin || !isPublicTarget(url)) {
      throw new NeahplusRefused('Destination NEAHPLUS non autorisée');
    }
    return streamPath(url.toString());
  };

  const rewritePlaylist = (text, base) => {
    const bridged = (uri) => {
      try {
        return playlistUrl(new URL(uri, base), base);
      } catch {
        return null;
      }
    };
    return text.split(/\r?\n/).map((line) => {
      const value = line.trim();
      if (!value) return line;
      if (value.startsWith('#')) {
        return value.replace(/URI="([^"]+)"/g, (match, uri) => {
          const mapped = bridged(uri);
          return mapped ? `URI="${mapped}"` : match;
        });
      }
      return bridged(value) ?? line;
    }).join('\n');
  };

  const rewriteResolveJson = async (text) => {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return text;
    }
    if (!data || typeof data.url !== 'string') return text;
    let target;
    try {
      target = new URL(data.url);
    } catch {
      throw new NeahplusRefused('Flux NEAHPLUS refusé', 502);
    }
    if (!isHttpUrl(target)) throw new NeahplusRefused('Flux NEAHPLUS refusé', 502);
    if (isTrustedHost(hostOf(target))) return text;
    if (!(await isPublicDestination(target))) {
      throw new NeahplusRefused('Flux NEAHPLUS refusé : destination non publique', 502);
    }
    return JSON.stringify({ ...data, url: streamPath(target.toString()) });
  };

  const redirectAllowed = (current, next) =>
    isHttpUrl(next) && (isTrustedHost(hostOf(next)) ||
      (next.origin === current.origin && isPublicTarget(next)));

  const fetchUpstream = async ({ url, method, headers, body }) => {
    let current = url;
    let currentMethod = method;
    let currentBody = body;
    for (let hop = 0; ; hop += 1) {
      if (!isHttpUrl(current) || (!isTrustedHost(hostOf(current)) && !isPublicTarget(current))) {
        throw new NeahplusRefused('Destination NEAHPLUS non autorisée', 502);
      }
      const response = await transport({
        url: current,
        method: currentMethod,
        headers,
        body: currentBody,
        lookup,
        timeoutMs: UPSTREAM_TIMEOUT_MS,
      });
      const location = response.headers.get('location');
      if (response.status < 300 || response.status >= 400 || !location) {
        return { response, upstream: current };
      }
      await response.body?.cancel();
      if (hop >= MAX_REDIRECTS) throw new NeahplusRefused('Trop de redirections NEAHPLUS', 502);
      const next = new URL(location, current);
      if (!redirectAllowed(current, next)) throw new NeahplusRefused('Redirection NEAHPLUS non autorisée', 502);
      if (response.status === 303 || ((response.status === 301 || response.status === 302) && currentMethod === 'POST')) {
        currentMethod = 'GET';
        currentBody = undefined;
      }
      current = next;
    }
  };

  return {
    enabled: key !== null,
    verifiedStreamTarget,
    rewriteResolveJson,
    rewritePlaylist,
    fetchUpstream,
  };
};
