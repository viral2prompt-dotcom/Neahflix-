/**
 * HTTPS bridge for the NEAHPLUS/OHA gateway.
 *
 * The browser must never be asked to load an HTTP playlist from an HTTPS page.
 * This proxy is intentionally restricted to OHA and the stream CDN currently
 * used by OHA; it is not a general-purpose URL proxy.
 */
const express = require('express');
const axios = require('axios');
const { pipeline } = require('node:stream/promises');
const cheerio = require('cheerio');

const router = express.Router();
const OHA_ORIGIN = 'https://oha.to';
const BRIDGE_PREFIX = '/api/neahplus';
const MAX_REDIRECTS = 5;
const MAX_REWRITE_BYTES = 8 * 1024 * 1024;

function isAllowedUpstream(value) {
  try {
    const url = value instanceof URL ? value : new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    const host = url.hostname.toLowerCase();
    return host === 'oha.to' || host === 'www.oha.to' ||
      host === 'tvfree.to' || host.endsWith('.tvfree.to');
  } catch {
    return false;
  }
}

function bridgeUrlFor(value) {
  const url = value instanceof URL ? value : new URL(value);
  if (!isAllowedUpstream(url)) throw new TypeError('Destination NEAHPLUS non autorisée');
  if (url.hostname.toLowerCase() === 'oha.to' || url.hostname.toLowerCase() === 'www.oha.to') {
    return `${BRIDGE_PREFIX}${url.pathname}${url.search}${url.hash}`;
  }
  return `${BRIDGE_PREFIX}/__relay?url=${encodeURIComponent(url.toString())}`;
}

function rewriteHtml(html, upstreamUrl) {
  const $ = cheerio.load(html);
  const rewriteAttribute = (_index, value) => {
    if (!value || /^(?:#|data:|javascript:|mailto:|tel:|blob:)/i.test(value)) return value;
    try {
      const resolved = new URL(value, upstreamUrl);
      if (!isAllowedUpstream(resolved)) return value;
      return bridgeUrlFor(resolved);
    } catch {
      return value;
    }
  };

  $('[href]').attr('href', rewriteAttribute);
  $('[src]').attr('src', rewriteAttribute);
  $('[action]').attr('action', rewriteAttribute);
  $('[poster]').attr('poster', rewriteAttribute);
  $('base').remove();
  $('head').prepend(`<base href="${BRIDGE_PREFIX}/">`);
  return rewriteEmbeddedUrls($.html());
}

function rewriteEmbeddedUrls(text) {
  let output = String(text);
  output = output.replace(/https?:\/\/(?:www\.)?oha\.to/gi, BRIDGE_PREFIX);
  output = output.replace(/(["'`])\/(?!api\/neahplus\/)(assets|play|oha-[a-z0-9-]+|api|channels|catalog|resolve|source|subtitle|favicon|manifest|images|fonts|static|watch|live)(?=\/|\?|#|["'`])/gi,
    (_match, quote, path) => `${quote}${BRIDGE_PREFIX}/${path}`);
  output = output.replace(/url\((["']?)\/(assets|images|fonts|static)(?=\/)/gi,
    (_match, quote, path) => `url(${quote}${BRIDGE_PREFIX}/${path}`);
  return output;
}

function rewritePlaylist(playlist, upstreamUrl) {
  const rewrite = (value) => {
    if (!value || /^(?:#|data:|skd:)/i.test(value)) return value;
    try {
      const resolved = new URL(value, upstreamUrl);
      return isAllowedUpstream(resolved) ? bridgeUrlFor(resolved) : value;
    } catch {
      return value;
    }
  };

  return String(playlist)
    .split(/\r?\n/)
    .map((line) => {
      if (!line) return line;
      if (line.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/g, (_match, uri) => `URI="${rewrite(uri)}"`);
      }
      return rewrite(line.trim());
    })
    .join('\n');
}

async function readSmallStream(stream) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > MAX_REWRITE_BYTES) throw new Error('Réponse OHA trop volumineuse pour la réécriture');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function requestBody(req) {
  if (req.body === undefined || req.body === null) return undefined;
  if (Buffer.isBuffer(req.body) || typeof req.body === 'string') return req.body;
  if (req.is('application/json')) return JSON.stringify(req.body);
  return undefined;
}

async function fetchAllowedUrl(initialUrl, req) {
  let url = new URL(initialUrl);
  let method = req.method;
  let data = requestBody(req);

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    if (!isAllowedUpstream(url)) throw new TypeError('Redirection NEAHPLUS non autorisée');

    const headers = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined || /^(?:host|origin|referer|connection|content-length|accept-encoding|transfer-encoding|upgrade|proxy-.*)$/i.test(key)) continue;
      headers[key] = value;
    }
    headers.origin = OHA_ORIGIN;
    headers.referer = `${OHA_ORIGIN}/`;

    const response = await axios.request({
      url: url.toString(),
      method,
      data,
      headers,
      responseType: 'stream',
      maxRedirects: 0,
      timeout: 30000,
      validateStatus: () => true,
    });

    const location = response.headers.location;
    if (response.status >= 300 && response.status < 400 && location) {
      response.data.destroy();
      if (redirects === MAX_REDIRECTS) throw new Error('Trop de redirections NEAHPLUS');
      url = new URL(location, url);
      if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === 'POST')) {
        method = 'GET';
        data = undefined;
      }
      continue;
    }
    return { response, finalUrl: url };
  }

  throw new Error('Redirections NEAHPLUS épuisées');
}

async function handleProxy(req, res) {
  let upstreamUrl;
  try {
    if (req.path === '/__relay') {
      const rawTarget = typeof req.query.url === 'string' ? req.query.url : '';
      upstreamUrl = new URL(rawTarget);
      if (!isAllowedUpstream(upstreamUrl)) return res.status(403).send('Destination NEAHPLUS non autorisée');
    } else {
      upstreamUrl = new URL(req.path + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''), OHA_ORIGIN);
      if (!isAllowedUpstream(upstreamUrl)) return res.status(403).send('Destination NEAHPLUS non autorisée');
    }

    const { response, finalUrl } = await fetchAllowedUrl(upstreamUrl, req);
    const contentType = response.headers['content-type'] || 'application/octet-stream';
    const isPlaylist = /\.m3u8(?:$|\?)/i.test(finalUrl.pathname) || /mpegurl/i.test(contentType);
    const isText = isPlaylist || /(?:text\/html|javascript|ecmascript|text\/css|application\/json)/i.test(contentType);

    // The global API middleware defaults to DENY; this single allowlisted iframe route
    // is same-origin with the Neahflix page, so permit only same-origin framing.
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
    res.status(response.status);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store');
    for (const header of ['accept-ranges', 'content-range', 'last-modified', 'etag']) {
      if (response.headers[header]) res.setHeader(header, response.headers[header]);
    }

    if (req.method === 'HEAD' || response.status === 204 || response.status === 304) {
      response.data.destroy();
      return res.end();
    }

    if (isText) {
      const body = (await readSmallStream(response.data)).toString('utf8');
      let rewritten = body;
      if (isPlaylist) rewritten = rewritePlaylist(body, finalUrl);
      else if (/text\/html/i.test(contentType)) rewritten = rewriteHtml(body, finalUrl.toString());
      else if (/javascript|ecmascript|text\/css|application\/json/i.test(contentType)) rewritten = rewriteEmbeddedUrls(body);
      return res.send(rewritten);
    }

    return await pipeline(response.data, res);
  } catch (error) {
    if (res.headersSent) {
      res.destroy(error);
      return;
    }
    const status = error instanceof TypeError ? 403 : 502;
    console.error('[NEAHPLUS] HTTPS bridge failed:', error.message);
    return res.status(status).type('text/plain').send('Passerelle HTTPS NEAHPLUS indisponible');
  }
}

router.all('/__relay', handleProxy);
router.all('*', handleProxy);

module.exports = router;
module.exports.isAllowedUpstream = isAllowedUpstream;
module.exports.bridgeUrlFor = bridgeUrlFor;
module.exports.rewriteEmbeddedUrls = rewriteEmbeddedUrls;
module.exports.rewriteHtml = rewriteHtml;
module.exports.rewritePlaylist = rewritePlaylist;
