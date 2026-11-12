import { getNeahplusChannelLogo } from './neahplusBranding';
export const NEAHPLUS_API = '/api/neahplus';
const CATALOG_PATH = `${NEAHPLUS_API}/live/catalog/live/channels.json`;
const RESOLVE_PATH = `${NEAHPLUS_API}/live/resolve`;
const PLAY_ORIGIN = 'https://oha.to/live/play/';
const STREAM_PATH_PREFIX = `${NEAHPLUS_API}/__stream?`;
const MAX_PAGES = 500;
const CACHE_TTL_MS = 30 * 60 * 1000;
const CATEGORY_TAGS = new Set(['France Sport']);

export interface NeahplusProgram {
  title: string;
  start: string;
  end: string;
}

export interface NeahplusChannel {
  id: string;
  name: string;
  countries: string[];
  categories: string[];
  logo: string | null;
  programs: NeahplusProgram[];
}

export interface NeahplusCatalog {
  channels: NeahplusChannel[];
  countries: { name: string; count: number }[];
}

export class NeahplusError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'NeahplusError';
    this.status = status;
  }
}

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

export const splitChannelTags = (tags: string[]): { countries: string[]; categories: string[] } => ({
  countries: tags.filter((tag) => !CATEGORY_TAGS.has(tag)),
  categories: tags.filter((tag) => CATEGORY_TAGS.has(tag)),
});

const normalizeLogo = (value: string | null): string | null => {
  if (!value) return null;
  if (value.startsWith('/live2/')) return `${NEAHPLUS_API}${value}`;
  return value.startsWith(`${NEAHPLUS_API}/`) ? value : null;
};

const parsePrograms = (value: unknown): NeahplusProgram[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const title = text(entry.title);
    const start = text(entry.start);
    const end = text(entry.end);
    return title && start && end ? [{ title, start, end }] : [];
  });
};

const parseChannel = (raw: unknown): NeahplusChannel | null => {
  if (!isRecord(raw)) return null;
  const id = text(raw.id);
  const name = text(raw.name);
  if (!id || !name) return null;
  const images = isRecord(raw.images) ? raw.images : {};
  const tags = Array.isArray(raw.tags)
    ? raw.tags.map(text).filter((tag): tag is string => tag !== null)
    : [];
  const { countries, categories } = splitChannelTags(tags);
  return {
    id,
    name,
    countries,
    categories,
    logo: normalizeLogo(text(images.logo)) ?? getNeahplusChannelLogo(name),
    programs: parsePrograms(raw.epg),
  };
};

const fetchJson = async (url: string, signal: AbortSignal): Promise<unknown> => {
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new NeahplusError('Catalogue indisponible', response.status);
  return response.json();
};

const fetchCatalogPages = async (signal: AbortSignal, onFirstPage?: (catalog: NeahplusCatalog) => void): Promise<NeahplusChannel[]> => {
  const byId = new Map<string, NeahplusChannel>();
  const seenCursors = new Set<string>();
  let cursor: string | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = cursor ? `${CATALOG_PATH}?cursor=${encodeURIComponent(cursor)}` : CATALOG_PATH;
    const data = await fetchJson(url, signal);
    if (!isRecord(data) || !Array.isArray(data.items)) {
      throw new NeahplusError('Réponse du catalogue invalide', 502);
    }
    for (const raw of data.items) {
      const channel = parseChannel(raw);
      if (channel && !byId.has(channel.id)) byId.set(channel.id, channel);
    }
    if (page === 0 && byId.size > 0) onFirstPage?.(buildCatalog([...byId.values()]));
    const next = text(data.nextCursor);
    if (!next || seenCursors.has(next)) break;
    seenCursors.add(next);
    cursor = next;
  }

  return [...byId.values()];
};

const buildCatalog = (channels: NeahplusChannel[]): NeahplusCatalog => {
  if (channels.length === 0) throw new NeahplusError('Aucune chaîne disponible pour le moment', 503);
  const counts = new Map<string, number>();
  for (const channel of channels) {
    for (const country of new Set(channel.countries)) counts.set(country, (counts.get(country) ?? 0) + 1);
  }
  const countries = [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return { channels, countries };
};

let cache: { loadedAt: number; promise: Promise<NeahplusCatalog> } | null = null;

export const loadNeahplusCatalog = (signal?: AbortSignal, onFirstPage?: (catalog: NeahplusCatalog) => void): Promise<NeahplusCatalog> => {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return cache.promise.then((catalog) => { onFirstPage?.(catalog); return catalog; });
  }
  const controller = new AbortController();
  signal?.addEventListener('abort', () => controller.abort(), { once: true });
  const promise = fetchCatalogPages(controller.signal, onFirstPage).then(buildCatalog);
  cache = { loadedAt: Date.now(), promise };
  promise.catch(() => {
    if (cache?.promise === promise) cache = null;
  });
  return promise;
};

const RESOLVED_STREAM_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const RESOLVED_STREAM_CACHE_MAX_ENTRIES = 500;
const STREAM_CACHE_EXPIRY_SAFETY_MS = 30_000;

const resolvedStreamExpiry = (url: string, now: number): number => {
  try {
    const params = new URL(url, 'https://neahplus.local').searchParams;
    const expiresAt = Number(params.get('exp')) * 1000;
    if (Number.isFinite(expiresAt) && expiresAt > 0) {
      return Math.min(now + RESOLVED_STREAM_CACHE_TTL_MS, expiresAt - STREAM_CACHE_EXPIRY_SAFETY_MS);
    }
  } catch {
    // Les URL non signées restent soumises au cache court de secours.
  }
  return now + 30_000;
};
type ResolvedStreamEntry = {
  expiresAt: number;
  promise: Promise<string>;
  controller: AbortController;
  consumers: number;
  settled: boolean;
};
const resolvedStreamCache = new Map<string, ResolvedStreamEntry>();

const waitForStreamOrAbort = (entry: ResolvedStreamEntry, signal: AbortSignal): Promise<string> => {
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  entry.consumers += 1;
  return new Promise((resolve, reject) => {
    let finished = false;
    const release = () => {
      if (finished) return;
      finished = true;
      signal.removeEventListener('abort', onAbort);
      entry.consumers = Math.max(0, entry.consumers - 1);
      if (!entry.settled && entry.consumers === 0) {
        entry.controller.abort();
        for (const [id, current] of resolvedStreamCache) {
          if (current === entry) resolvedStreamCache.delete(id);
        }
      }
    };
    const onAbort = () => {
      release();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    entry.promise.then(
      (url) => {
        if (finished) return;
        release();
        resolve(url);
      },
      (error: unknown) => {
        if (finished) return;
        release();
        reject(error);
      },
    );
  });
};

export const invalidateNeahplusStream = (channelId: string): void => {
  const entry = resolvedStreamCache.get(channelId);
  if (entry?.settled) resolvedStreamCache.delete(channelId);
};

export const resolveNeahplusStream = async (channelId: string, signal: AbortSignal): Promise<string> => {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  const now = Date.now();
  for (const [id, entry] of resolvedStreamCache) {
    if (entry.expiresAt <= now && entry.settled) resolvedStreamCache.delete(id);
  }

  let entry = resolvedStreamCache.get(channelId);
  if (entry && entry.settled && entry.expiresAt <= now) {
    resolvedStreamCache.delete(channelId);
    entry = undefined;
  }
  if (entry) {
    // Déplacer l'entrée en fin de Map pour conserver les résultats récemment utilisés.
    resolvedStreamCache.delete(channelId);
    resolvedStreamCache.set(channelId, entry);
  }
  if (!entry) {
    const controller = new AbortController();
    const target = `${PLAY_ORIGIN}${encodeURIComponent(channelId)}`;
    const created: ResolvedStreamEntry = {
      expiresAt: Number.POSITIVE_INFINITY,
      controller,
      consumers: 0,
      settled: false,
      promise: Promise.resolve(''),
    };
    created.promise = fetchJson(`${RESOLVE_PATH}?url=${encodeURIComponent(target)}`, controller.signal)
      .then((data) => {
        if (!isRecord(data) || typeof data.url !== 'string' || !data.url.startsWith(STREAM_PATH_PREFIX)) {
          throw new NeahplusError('Flux NEAHPLUS invalide', 502);
        }
        return data.url;
      })
      .then((url) => {
        created.settled = true;
        created.expiresAt = resolvedStreamExpiry(url, Date.now());
        if (created.expiresAt <= Date.now()) throw new NeahplusError('Autorisation du flux expirée', 502);
        return url;
      })
      .catch((error: unknown) => {
        created.settled = true;
        if (resolvedStreamCache.get(channelId) === created) resolvedStreamCache.delete(channelId);
        throw error;
      });
    entry = created;
    resolvedStreamCache.set(channelId, created);
  }

  while (resolvedStreamCache.size > RESOLVED_STREAM_CACHE_MAX_ENTRIES) {
    const evictableId = [...resolvedStreamCache].find(([id, candidate]) =>
      id !== channelId && (candidate.settled || candidate.consumers === 0)
    )?.[0];
    if (!evictableId) break;
    resolvedStreamCache.delete(evictableId);
  }

  return waitForStreamOrAbort(entry, signal);
};
export const currentProgram = (channel: NeahplusChannel, now: number): NeahplusProgram | null =>
  channel.programs.find((program) => {
    const start = Date.parse(program.start);
    const end = Date.parse(program.end);
    return now >= start && now < end;
  }) ?? null;
