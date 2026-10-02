/**
 * Reverse proxy dédié à la passerelle NEAHLITE.
 *
 * Cette route est volontairement limitée à Vrizov : contrairement au vieux
 * proxy média générique, elle peut servir une page HTML dans une iframe sans
 * exposer le serveur à une destination fournie par le client.
 */
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const router = express.Router();
const VRIZOV_ORIGIN = 'https://vrizov.com';
const VRIZOV_HOME_PATH = '/3d69b18/home/vrizov';
const BRIDGE_PREFIX = '/neahlite';

function isVrizovUrl(value) {
  try {
    return new URL(value).origin === VRIZOV_ORIGIN;
  } catch {
    return false;
  }
}

function bridgePathFor(value) {
  const url = new URL(value);
  if (!isVrizovUrl(url)) throw new TypeError('Destination NEAHLITE non autorisée');
  return `${BRIDGE_PREFIX}${url.pathname}${url.search}${url.hash}`;
}

function upstreamUrlFor(requestPath, query) {
  const path = requestPath && requestPath !== '/' ? requestPath : VRIZOV_HOME_PATH;
  return new URL(`${path}${query || ''}`, VRIZOV_ORIGIN).toString();
}

function rewriteHtml(html, upstreamUrl) {
  const $ = cheerio.load(html);
  const rewrite = (_index, value) => {
    if (!value || /^(?:#|data:|javascript:|mailto:|tel:)/i.test(value)) return value;
    try {
      const resolved = new URL(value, upstreamUrl);
      return isVrizovUrl(resolved) ? bridgePathFor(resolved) : value;
    } catch {
      return value;
    }
  };

  $('[href]').attr('href', rewrite);
  $('[src]').attr('src', rewrite);
  $('[action]').attr('action', rewrite);
  $('base').remove();
  $('head').prepend(`<base href="${bridgePathFor(upstreamUrl).replace(/[^/]*([?#].*)?$/, '')}">`);
  return $.html();
}

function rewriteSetCookie(value) {
  return value
    .replace(/;\s*domain=[^;]*/ig, '')
    .replace(/;\s*path=[^;]*/ig, `; Path=${BRIDGE_PREFIX}`);
}

router.get('/*', async (req, res) => {
  const upstreamUrl = upstreamUrlFor(req.params[0], req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');

  try {
    const response = await axios.get(upstreamUrl, {
      responseType: 'arraybuffer',
      maxRedirects: 0,
      timeout: 30_000,
      validateStatus: () => true,
      headers: {
        accept: req.get('accept') || '*/*',
        'accept-language': req.get('accept-language') || 'fr-FR,fr;q=0.9',
        'user-agent': req.get('user-agent') || 'Mozilla/5.0',
        ...(req.get('cookie') ? { cookie: req.get('cookie') } : {}),
      },
    });

    if (response.status >= 300 && response.status < 400 && response.headers.location) {
      const destination = new URL(response.headers.location, upstreamUrl);
      if (!isVrizovUrl(destination)) return res.status(502).send('Redirection NEAHLITE non autorisée');
      return res.redirect(response.status, bridgePathFor(destination));
    }

    // Les protections de framing de l'upstream doivent disparaître, et le
    // middleware global de l'API pose aussi DENY : cette réponse est la seule
    // exception, confinée à l'origine allowlistée ci-dessus.
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.setHeader('Cache-Control', 'no-store');
    const setCookie = response.headers['set-cookie'];
    if (setCookie) res.setHeader('Set-Cookie', setCookie.map(rewriteSetCookie));

    const contentType = response.headers['content-type'] || 'application/octet-stream';
    res.type(contentType);
    if (/\btext\/html\b/i.test(contentType)) {
      return res.status(response.status).send(rewriteHtml(Buffer.from(response.data).toString('utf8'), upstreamUrl));
    }
    return res.status(response.status).send(response.data);
  } catch (error) {
    console.error('[NEAHLITE] Bridge Vrizov indisponible:', error.message);
    return res.status(502).send('Passerelle NEAHLITE indisponible');
  }
});

module.exports = router;
module.exports.VRIZOV_HOME_PATH = VRIZOV_HOME_PATH;
module.exports.bridgePathFor = bridgePathFor;
module.exports.rewriteHtml = rewriteHtml;
module.exports.upstreamUrlFor = upstreamUrlFor;
