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
  categories: string[];
}

export const foldText = (value: string): string =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const QUALITY_SUFFIX_RE = /\s*(hd|full\s*hd|fhd|sd)\s*$/i;
const ALL_SUFFIX_RE = /\s*(hd|full\s*hd|fhd|sd|fr|eu|us|uk|int|international|\+\d+|-\d+)\s*$/i;
const FRANCE = 'france';
const DEFAULT_COUNTRY = 'France';

export const normalizeChannelName = (name: string): string => {
  const folded = foldText(name);
  return folded.replace(QUALITY_SUFFIX_RE, '').replace(/[^a-z0-9]+$/g, '') || folded;
};

export const shortChannelName = (name: string): string => {
  const folded = foldText(name);
  return folded.replace(ALL_SUFFIX_RE, '').replace(/[^a-z0-9]+$/g, '') || folded;
};

// Indépendant de l'ordre des tags : France si présente, sinon le premier pays par ordre alphabétique.
const primaryCountryKey = (channel: NeahplusChannel): string => {
  const countries = channel.countries.map(foldText).filter(Boolean);
  if (countries.includes(FRANCE)) return FRANCE;
  return [...countries].sort((a, b) => a.localeCompare(b, 'fr'))[0] ?? '';
};

const buildGroup = (key: string, channels: NeahplusChannel[]): ChannelGroup => {
  const displayName = channels.reduce(
    (shortest, channel) => (channel.name.length < shortest.length ? channel.name : shortest),
    channels[0].name,
  );
  const logo = channels.find((channel) => channel.logo)?.logo ?? null;
  return {
    key,
    displayName,
    variants: channels,
    hasStream: true,
    isHistorical: false,
    logo,
    countries: [...new Set(channels.flatMap((channel) => channel.countries))],
    categories: [...new Set(channels.flatMap((channel) => channel.categories))],
  };
};

// La clé du pays principal reste le nom normalisé : les favoris enregistrés avant
// ce changement continuent de correspondre. Les homonymes d'autres pays reçoivent
// une clé suffixée par leur pays, sans jamais supprimer une clé stockée.
export const groupChannelVariants = (channels: NeahplusChannel[]): ChannelGroup[] => {
  const byName = new Map<string, Map<string, NeahplusChannel[]>>();
  for (const channel of channels) {
    const name = normalizeChannelName(channel.name);
    const byCountry = byName.get(name) ?? new Map<string, NeahplusChannel[]>();
    const country = primaryCountryKey(channel);
    byCountry.set(country, [...(byCountry.get(country) ?? []), channel]);
    byName.set(name, byCountry);
  }

  const groups: ChannelGroup[] = [];
  for (const [name, byCountry] of byName) {
    const countries = [...byCountry.keys()].sort((a, b) => a.localeCompare(b, 'fr'));
    const primary = countries.includes(FRANCE) ? FRANCE : countries[0];
    for (const country of countries) {
      const key = country === primary ? name : `${name}@${country}`;
      groups.push(buildGroup(key, byCountry.get(country) ?? []));
    }
  }
  return groups.sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr') || a.key.localeCompare(b.key));
};

export const groupMatchesCountry = (group: ChannelGroup, country: string): boolean =>
  group.countries.length > 0 ? group.countries.includes(country) : country === DEFAULT_COUNTRY;

export const HISTORICAL_CHANNELS: ChannelGroup[] = [
  { key: 'historical:disney-channel', displayName: 'Disney Channel', variants: [], hasStream: false, isHistorical: true, logo: null, countries: ['France'], categories: [] },
  { key: 'historical:disney-junior', displayName: 'Disney Junior', variants: [], hasStream: false, isHistorical: true, logo: null, countries: ['France'], categories: [] },
  { key: 'historical:disney-xd', displayName: 'Disney XD', variants: [], hasStream: false, isHistorical: true, logo: null, countries: ['France'], categories: [] },
  { key: 'historical:national-geographic', displayName: 'National Geographic', variants: [], hasStream: false, isHistorical: true, logo: null, countries: ['France'], categories: [] },
  { key: 'historical:national-geographic-wild', displayName: 'National Geographic Wild', variants: [], hasStream: false, isHistorical: true, logo: null, countries: ['France'], categories: [] },
];

export const historicalChannelsWithoutDuplicates = (realGroups: ChannelGroup[]): ChannelGroup[] =>
  HISTORICAL_CHANNELS.filter((historical) => {
    const name = normalizeChannelName(historical.displayName);
    const country = foldText(historical.countries[0] ?? '');
    return !realGroups.some(
      (group) =>
        normalizeChannelName(group.displayName) === name &&
        group.countries.some((c) => foldText(c) === country),
    );
  });

const FAVORITES_KEY = 'neahplus:favorites';

export const loadFavorites = (): Set<string> => {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return new Set();
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? new Set(value.filter((item): item is string => typeof item === 'string')) : new Set();
  } catch {
    return new Set();
  }
};

export const saveFavorites = (favorites: Set<string>): void => {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
  } catch {
    /* localStorage indisponible */
  }
};

export const getProgramsForDay = (channel: NeahplusChannel, date: Date): NeahplusProgram[] =>
  channel.programs.filter((program) => isSameDay(new Date(program.start), date)).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

export const getNextProgram = (channel: NeahplusChannel, now: number): NeahplusProgram | null =>
  channel.programs.filter((program) => Date.parse(program.start) > now).sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0] ?? null;

export const channelsWithEpg = (channels: NeahplusChannel[]): NeahplusChannel[] =>
  channels.filter((channel) => channel.programs.length > 0);

export const channelColor = (name: string): string => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360}, 45%, 35%)`;
};

export const formatTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

export const channelsCurrentlyPlaying = (channels: NeahplusChannel[], now: number): NeahplusChannel[] =>
  channels
    .filter((channel) => channel.programs.some((program) => now >= Date.parse(program.start) && now < Date.parse(program.end)))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

export const recommendedChannels = (channels: NeahplusChannel[], now: number, count: number): NeahplusChannel[] => {
  const playing = channelsCurrentlyPlaying(channels, now);
  const withEpg = channelsWithEpg(channels).filter((channel) => !playing.includes(channel));
  const rest = channels.filter((channel) => !playing.includes(channel) && !withEpg.includes(channel));
  return [
    ...playing.slice(0, Math.ceil(count / 2)),
    ...withEpg.slice(0, Math.floor(count / 2)),
    ...rest.slice(0, Math.max(0, count - playing.length - withEpg.length)),
  ].slice(0, count);
};

export const formatDuration = (startIso: string, endIso: string): string => {
  const diff = Date.parse(endIso) - Date.parse(startIso);
  if (diff <= 0) return '0 min';
  const minutes = Math.round(diff / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours} h ${remaining} min` : `${hours} h`;
};

export const formatRemaining = (endIso: string, now: number): string => {
  const diff = Date.parse(endIso) - now;
  if (diff <= 0) return 'Terminé';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Moins d'une minute";
  if (minutes < 60) return `${minutes} min restantes`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours} h ${remaining} min restantes` : `${hours} h restante${hours > 1 ? 's' : ''}`;
};

export const getEpgDates = (channel: NeahplusChannel): Date[] => {
  const dates = new Map<string, Date>();
  for (const program of channel.programs) {
    const date = new Date(program.start);
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    if (!dates.has(key)) dates.set(key, new Date(date.getFullYear(), date.getMonth(), date.getDate()));
  }
  return [...dates.values()].sort((a, b) => a.getTime() - b.getTime());
};

export const getUpcomingPrograms = (channel: NeahplusChannel, date: Date, now: number): NeahplusProgram[] => {
  const programs = getProgramsForDay(channel, date);
  const today = new Date();
  const isToday = date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
  return isToday ? programs.filter((program) => Date.parse(program.start) >= now) : programs;
};
