import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSocialPreviewResponse } from '../functions/_lib/socialPreview.js';
import { registerGracefulShutdown } from './gracefulShutdown.js';
import {
  NEAHPLUS_ORIGIN,
  NEAHPLUS_PREFIX,
  isAllowedNeahplusDestination,
  neahplusBridgeUrl,
  rewriteNeahplusResolveJson,
  rewriteNeahplusText,
} from './neahplus.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIST = join(ROOT, 'dist');
const INDEX_HTML = join(DIST, 'index.html');

if (!existsSync(DIST)) {
  console.error(`[server] dist/ introuvable (${DIST}). Lance "npm run build" avant "npm start".`);
  process.exit(1);
}

const app = new Hono();

// Médias et polices servis depuis public/ : leur nom ne porte pas de hash, on
// ne peut donc pas les déclarer immuables — mais ils ne changent quasiment
// jamais. Le `no-cache` qui s'appliquait à eux était le pire des cas : le
// serveur statique n'émet ni ETag ni Last-Modified, donc le navigateur n'avait
// aucun moyen de revalider etretéléchargeait le fichier *en entier* à chaque
// page. Le logo seul pèse près de 800 Ko, et sert de favicon partout.
const MEDIA_ASSET_RE = /\.(?:png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|mp4|webm|m4v|mp3|wasm)$/i;

// Fichiers de pilotage : ils doivent pouvoir changer sans délai, sinon un
// déploiement met des heures à atteindre les clients.
const ALWAYS_REVALIDATE = new Set([
  '/sw.js',
  '/manifest.json',
  '/robots.txt',
  '/sitemap.xml',
  '/index.html',
  '/_redirects',
  '/_routes.json',
]);

app.use('/*', async (c, next) => {
  await next();
  if (c.res.headers.has('cache-control')) return;
  const path = new URL(c.req.url).pathname;
  const isOk = c.res.status === 200;

  if (path.startsWith('/assets/') && isOk) {
    // Nom hashé par Vite : le contenu ne changera jamais sous cette URL.
    c.header('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (isOk && MEDIA_ASSET_RE.test(path) && !ALWAYS_REVALIDATE.has(path)) {
    // Une journée de cache ferme, puis une semaine où la version en cache est
    // servie immédiatement pendant que le navigateur va chercher la nouvelle.
    c.header('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  } else {
    c.header('Cache-Control', 'no-cache, must-revalidate');
  }
});

app.get('/health', (c) => c.json({ ok: true, runtime: 'node', app: 'movix-hono' }));

const toCloudflareCtx = (c) => ({
  request: new Request(c.req.url, { method: c.req.method, headers: c.req.raw.headers }),
  env: process.env,
  next: async () => {
    const html = await readFile(INDEX_HTML, 'utf8');
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  },
});

const socialPreviewHandler = async (c) => {
  const res = await buildSocialPreviewResponse(toCloudflareCtx(c));
  return res;
};

app.get('/movie/:id', socialPreviewHandler);
app.get('/tv/:id', socialPreviewHandler);



// NEAHPLUS bridge helpers live in ./neahplus.js

const neahplusHandler = async (c) => {
  if (!['GET', 'HEAD', 'POST'].includes(c.req.method)) {
    return c.text('Méthode NEAHPLUS non autorisée', 405, { Allow: 'GET, HEAD, POST' });
  }

  let upstream;
  try {
    const incoming = new URL(c.req.url);
    if (incoming.pathname === `${NEAHPLUS_PREFIX}/__relay` || incoming.pathname === `${NEAHPLUS_PREFIX}/__stream`) {
      if (incoming.pathname.endsWith('/__stream') && c.req.method === 'POST') {
        return c.text('Méthode NEAHPLUS non autorisée', 405, { Allow: 'GET, HEAD' });
      }
      const target = incoming.searchParams.get('url') || '';
      upstream = new URL(target);
    } else {
      const suffix = incoming.pathname.slice(NEAHPLUS_PREFIX.length) || '/';
      upstream = new URL(`${suffix}${incoming.search}`, NEAHPLUS_ORIGIN);
    }
    if (!isAllowedNeahplusDestination(upstream)) {
      return c.text('Destination NEAHPLUS non autorisée', 403);
    }

    let method = c.req.method;
    let body = ['GET', 'HEAD'].includes(method) ? undefined : await c.req.arrayBuffer();
    let response;
    for (let redirects = 0; redirects <= 5; redirects += 1) {
      if (!isAllowedNeahplusDestination(upstream)) {
        return c.text('Redirection NEAHPLUS non autorisée', 502);
      }
      const headers = new Headers(c.req.raw.headers);
      for (const key of ['host', 'origin', 'referer', 'connection', 'content-length', 'accept-encoding']) headers.delete(key);
      headers.set('origin', NEAHPLUS_ORIGIN);
      headers.set('referer', `${NEAHPLUS_ORIGIN}/`);
      response = await fetch(upstream, {
        method,
        headers,
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(30000),
      });
      if (response.status < 300 || response.status >= 400 || !response.headers.get('location')) break;
      if (redirects === 5) return c.text('Trop de redirections NEAHPLUS', 502);
      const nextUrl = new URL(response.headers.get('location'), upstream);
      if (!isAllowedNeahplusDestination(nextUrl)) return c.text('Redirection NEAHPLUS non autorisée', 502);
      if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === 'POST')) {
        method = 'GET';
        body = undefined;
      }
      upstream = nextUrl;
    }

    const headers = new Headers();
    for (const name of ['content-type', 'accept-ranges', 'content-range', 'last-modified', 'etag']) {
      const value = response.headers.get(name);
      if (value) headers.set(name, value);
    }
    headers.set('cache-control', 'no-store');
    headers.set('x-content-type-options', 'nosniff');

    // Keep upstream session cookies scoped to this bridge path, never to the
    // entire Neahflix site or the upstream domain.
    const upstreamCookies = typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : []);
    for (const cookie of upstreamCookies) {
      let scopedCookie = cookie.replace(/;\s*domain=[^;]*/i, '')
        .replace(/;\s*path=[^;]*/i, '; Path=/api/neahplus');
      if (!/;\s*path=/i.test(scopedCookie)) scopedCookie += '; Path=/api/neahplus';
      headers.append('set-cookie', scopedCookie);
    }

    const location = response.headers.get('location');
    if (location) {
      try { headers.set('location', neahplusBridgeUrl(new URL(location, upstream))); }
      catch { return c.text('Redirection NEAHPLUS non autorisée', 502); }
    }

    const type = response.headers.get('content-type') || '';
    const playlist = /mpegurl/i.test(type) || /\.m3u8(?:$|\?)/i.test(upstream.pathname);
    const rewriteable = playlist || /(?:text\/html|javascript|ecmascript|text\/css|application\/json)/i.test(type);
    if (method === 'HEAD' || response.status === 204 || response.status === 304) {
      return new Response(null, { status: response.status, headers });
    }

    if (rewriteable) {
      const text = await response.text();
      if (text.length > 8 * 1024 * 1024) return c.text('Réponse NEAHPLUS trop volumineuse', 502);
      let rewritten;
      if (playlist) {
        rewritten = text.split(/\r?\n/).map((line) => {
          const value = line.trim();
          if (!value || value.startsWith('#')) {
            return value.startsWith('#') ? value.replace(/URI="([^"]+)"/g, (_m, uri) => {
              try { return `URI="${neahplusBridgeUrl(new URL(uri, upstream))}"`; } catch { return `URI="${uri}"`; }
            }) : line;
          }
          try { return neahplusBridgeUrl(new URL(value, upstream)); } catch { return line; }
        }).join('\n');
      } else {
        const body = /\/resolve$/.test(upstream.pathname) && /json/i.test(type)
          ? rewriteNeahplusResolveJson(text)
          : text;
        rewritten = rewriteNeahplusText(body, /text\/html/i.test(type));
      }
      headers.delete('content-length');
      headers.delete('content-encoding');
      return new Response(rewritten, { status: response.status, headers });
    }

    // Stream media directly; preserve byte-range support for seeking.
    return new Response(response.body, { status: response.status, headers });
  } catch (error) {
    console.error('[NEAHPLUS] Bridge failed:', error?.message || error);
    return c.text('Passerelle HTTPS NEAHPLUS indisponible', 502);
  }
};

app.all('/api/neahplus', neahplusHandler);
app.all('/api/neahplus/*', neahplusHandler);


app.all('/api/*', async (c) => {
  const incoming = new URL(c.req.url);
  const target = `https://api.movix.college${incoming.pathname}${incoming.search}`;

  const headers = new Headers(c.req.raw.headers);
  headers.delete('host');
  headers.delete('origin');
  headers.delete('referer');
  headers.delete('connection');

  const init = {
    method: c.req.method,
    headers,
  };

  if (!['GET', 'HEAD'].includes(c.req.method)) {
    init.body = await c.req.raw.arrayBuffer();
  }

  const response = await fetch(target, init);

  const responseHeaders = new Headers(response.headers);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
});

app.use('/*', serveStatic({ root: './dist' }));

app.get('*', async (c) => {
  const path = new URL(c.req.url).pathname;
  if (/\.[^/]+$/.test(path)) {
    return c.text('Not Found', 404);
  }
  const html = await readFile(INDEX_HTML, 'utf8');
  return c.html(html);
});

const port = Number(process.env.PORT) || 3001;
const server = serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log(`[server] Movix Hono → http://0.0.0.0:${info.port}`);
});

registerGracefulShutdown(server);
