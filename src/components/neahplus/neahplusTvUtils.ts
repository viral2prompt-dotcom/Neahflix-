import { isSameDay } from 'date-fns';
import type { NeahplusChannel, NeahplusProgram } from './neahplusCatalog';

export interface ChannelGroup {
  key: string;
  displayName: string;
  variants: NeahplusChannel[];
  hasStream: boolean;
  isHistorical: boolean;
  logo: string | null;
  countries: string[];
}

export const foldText = (value: string): string =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const SUFFIX_RE = /\s*(hd|full\s*hd|fhd|sd|fr|eu|us|uk|int|international|\+\d+|-\d+)\s*$/i;

export const normalizeChannelName = (name: string): string => {
  const folded = foldText(name);
  const stripped = folded.replace(SUFFIX_RE, '').replace(/[^a-z0-9]+$/g, '');
  return stripped || folded;
};

export const groupChannelVariants = (channels: NeahplusChannel[]): ChannelGroup[] => {
  const byKey = new Map<string, ChannelGroup>();

  for (const channel of channels) {
    const key = normalizeChannelName(channel.name);
    const existing = byKey.get(key);
    if (existing) {
      existing.variants.push(channel);
      if (channel.name.length < existing.displayName.length) {
        existing.displayName = channel.name;
      }
      if (!existing.logo && channel.logo) {
        existing.logo = channel.logo;
      }
      for (const c of channel.countries) {
        if (!existing.countries.includes(c)) existing.countries.push(c);
      }
    } else {
      byKey.set(key, {
        key,
        displayName: channel.name,
        variants: [channel],
        hasStream: true,
        isHistorical: false,
        logo: channel.logo,
        countries: [...channel.countries],
      });
    }
  }

  return [...byKey.values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, 'fr'),
  );
};

export const HISTORICAL_CHANNELS: ChannelGroup[] = [
  { key: 'historical:disney-channel', displayName: 'Disney Channel', variants: [], hasStream: false, isHistorical: true, logo: null, countries: ['France'] },
  { key: 'historical:disney-junior', displayName: 'Disney Junior', variants: [], hasStream: false, isHistorical: true, logo: null, countries: ['France'] },
  { key: 'historical:disney-xd', displayName: 'Disney XD', variants: [], hasStream: false, isHistorical: true, logo: null, countries: ['France'] },
  { key: 'historical:national-geographic', displayName: 'National Geographic', variants: [], hasStream: false, isHistorical: true, logo: null, countries: ['France'] },
  { key: 'historical:national-geographic-wild', displayName: 'National Geographic Wild', variants: [], hasStream: false, isHistorical: true, logo: null, countries: ['France'] },
];

const FAVORITES_KEY = 'neahplus:favorites';

export const loadFavorites = (): Set<string> => {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch {
    return new Set();
  }
};

export const saveFavorites = (favorites: Set<string>): void => {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
  } catch {
    // localStorage indisponible
  }
};

export const getProgramsForDay = (channel: NeahplusChannel, date: Date): NeahplusProgram[] =>
  channel.programs
    .filter((p) => isSameDay(new Date(p.start), date))
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

export const getNextProgram = (channel: NeahplusChannel, now: number): NeahplusProgram | null =>
  channel.programs
    .filter((p) => Date.parse(p.start) > now)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0] ?? null;

export const channelsWithEpg = (channels: NeahplusChannel[]): NeahplusChannel[] =>
  channels.filter((c) => c.programs.length > 0);

export const channelColor = (name: string): string => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash) % 360}, 45%, 35%)`;
};
