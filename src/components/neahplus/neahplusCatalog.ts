export const NEAHPLUS_API = '/api/neahplus';
const CATALOG_PATH = `${NEAHPLUS_API}/live/catalog/live/channels.json`;
const RESOLVE_PATH = `${NEAHPLUS_API}/live/resolve`;
const PLAY_ORIGIN = 'https://oha.to/live/play/';
const STREAM_PATH_PREFIX = `${NEAHPLUS_API}/__stream?`;
const MAX_PAGES = 500;
const CACHE_TTL_MS = 30 * 60 * 1000;

export interface NeahplusProgram {
  title: string;
  start: string;
  end: string;
}

export interface NeahplusChannel {
  id: string;
  name: string;
  countries: string[];
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
  const countries = Array.isArray(raw.tags)
    ? raw.tags.map(text).filter((tag): tag is string => tag !== null)
    : [];
  return {
    id,
    name,
    countries,
    logo: normalizeLogo(text(images.logo)),
    programs: parsePrograms(raw.epg),
  };
};

const fetchJson = async (url: string, signal: AbortSignal): Promise<unknown> => {
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new NeahplusError('Catalogue indisponible', response.status);
  return response.json();
};

const fetchCatalogPages = async (signal: AbortSignal): Promise<NeahplusChannel[]> => {
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

export const loadNeahplusCatalog = (signal?: AbortSignal): Promise<NeahplusCatalog> => {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.promise;
  const controller = new AbortController();
  signal?.addEventListener('abort', () => controller.abort(), { once: true });
  const promise = fetchCatalogPages(controller.signal).then(buildCatalog);
  cache = { loadedAt: Date.now(), promise };
  promise.catch(() => {
    if (cache?.promise === promise) cache = null;
  });
  return promise;
};

export const resolveNeahplusStream = async (channelId: string, signal: AbortSignal): Promise<string> => {
  const target = `${PLAY_ORIGIN}${encodeURIComponent(channelId)}`;
  const data = await fetchJson(`${RESOLVE_PATH}?url=${encodeURIComponent(target)}`, signal);
  if (!isRecord(data) || typeof data.url !== 'string' || !data.url.startsWith(STREAM_PATH_PREFIX)) {
    throw new NeahplusError('Flux NEAHPLUS invalide', 502);
  }
  return data.url;
};

export const currentProgram = (channel: NeahplusChannel, now: number): NeahplusProgram | null =>
  channel.programs.find((program) => {
    const start = Date.parse(program.start);
    const end = Date.parse(program.end);
    return now >= start && now < end;
  }) ?? null;
