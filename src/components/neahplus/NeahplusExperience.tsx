import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Globe,
  Heart,
  Home as HomeIcon,
  Info,
  List,
  Loader2,
  RotateCcw,
  Search,
  Star,
  Tv,
  X,
} from 'lucide-react';
import NeahplusPlayer from './NeahplusPlayer';
import ChannelCarousel from './ChannelCarousel';
import ProgramSynopsis from './ProgramSynopsis';
import InfoPanel from './InfoPanel';
import QuickSearch from './QuickSearch';
import {
  currentProgram,
  loadNeahplusCatalog,
  resolveNeahplusStream,
  type NeahplusCatalog,
  type NeahplusChannel,
} from './neahplusCatalog';
import {
  channelColor,
  channelsCurrentlyPlaying,
  channelsWithEpg,
  ChannelGroup,
  foldText,
  formatTime,
  getProgramsForDay,
  groupChannelVariants,
  groupMatchesCountry,
  indexChannelGroupsByChannelId,
  historicalChannelsWithoutDuplicates,
  loadFavorites,
  migrateLegacyFavorites,
  getNextProgram,
  recommendedChannels,
  saveFavorites,
  shortChannelName,
} from './neahplusTvUtils';

type Tab = 'home' | 'all' | 'guide' | 'favorites' | 'world';

const TABS: { id: Tab; label: string; icon: typeof HomeIcon }[] = [
  { id: 'home', label: 'Accueil', icon: HomeIcon },
  { id: 'all', label: 'Chaînes', icon: Tv },
  { id: 'guide', label: 'Guide TV', icon: List },
  { id: 'favorites', label: 'Favoris', icon: Heart },
  { id: 'world', label: 'Monde', icon: Globe },
];

const PAGE_SIZE = 60;
const HOME_SECTION_COUNT = 12;

interface ChannelCardProps {
  group: ChannelGroup;
  selected: boolean;
  favorited: boolean;
  resolving: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
  index: number;
  now: number;
  registerRef: (el: HTMLButtonElement | null, index: number) => void;
}

const ChannelCard = ({
  group,
  selected,
  favorited,
  resolving,
  onSelect,
  onToggleFavorite,
  index,
  now,
  registerRef,
}: ChannelCardProps) => {
  const activeVariant = group.variants[0];
  const prog = activeVariant ? currentProgram(activeVariant, now) : null;
  const initials = group.displayName.slice(0, 2).toUpperCase();
  const bgColor = channelColor(group.displayName);

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border transition-all duration-300 ${
        selected
          ? 'border-red-500/50 bg-red-500/10 ring-1 ring-red-500/40 shadow-lg shadow-red-500/10'
          : 'border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-white/[0.01] hover:border-white/20 hover:from-white/[0.07] hover:to-white/[0.02]'
      }`}
    >
      <button
        ref={(el) => registerRef(el, index)}
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        className="flex w-full items-center gap-3.5 p-3.5 pr-12 text-left"
      >
        <div className="relative shrink-0">
          {group.logo ? (
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/[0.06] ring-1 ring-white/5">
              <img
                src={group.logo}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-11 w-11 rounded-lg object-contain p-1"
              />
            </div>
          ) : (
            <div
              className="flex h-14 w-14 items-center justify-center rounded-xl text-sm font-black uppercase text-white/90 ring-1 ring-white/5"
              style={{ background: bgColor }}
              aria-hidden="true"
            >
              {initials}
            </div>
          )}
          {group.variants.length > 1 && (
            <span className="absolute -bottom-1 -right-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[8px] font-bold text-white shadow-sm">
              {group.variants.length}
            </span>
          )}
        </div>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold tracking-tight text-white">{group.displayName}</span>
          <span className="mt-0.5 block truncate text-xs text-white/45">
            {group.isHistorical
              ? 'Chaîne historique'
              : prog?.title ?? group.countries.join(', ') ?? '—'}
          </span>
          {!group.hasStream && (
            <span className="mt-0.5 block text-[10px] text-amber-300/70">Flux non disponible</span>
          )}
          {resolving && (
            <span className="mt-0.5 block text-[10px] text-red-300/80">Vérification…</span>
          )}
        </span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        aria-label={favorited ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        aria-pressed={favorited}
        className={`absolute right-3 top-1/2 -translate-y-1/2 rounded-xl p-2.5 transition-all duration-200 ${
          favorited
            ? 'bg-amber-400/15 text-amber-400 hover:bg-amber-400/25'
            : 'text-white/20 hover:bg-white/10 hover:text-white/50'
        }`}
      >
        <Star className="h-4 w-4" fill={favorited ? 'currentColor' : 'none'} aria-hidden="true" />
      </button>
    </div>
  );
};

interface EpgRowProps {
  channel: NeahplusChannel;
  date: Date;
  onPlay: () => void;
  index: number;
  now: number;
  registerRef: (el: HTMLButtonElement | null, index: number) => void;
}

const EpgRow = ({ channel, date, onPlay, index, now, registerRef }: EpgRowProps) => {
  const programs = useMemo(() => getProgramsForDay(channel, date), [channel, date]);
  const today = new Date(now);
  const isToday = date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  const current = isToday ? currentProgram(channel, now) : null;
  const next = isToday ? getNextProgram(channel, now) : null;

  return (
    <button
      ref={(el) => registerRef(el, index)}
      type="button"
      onClick={onPlay}
      className="group flex w-full items-stretch gap-0 overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent text-left transition-all duration-200 hover:border-white/15 hover:from-white/[0.06]"
    >
      <div className="flex w-32 shrink-0 flex-col items-center justify-center gap-1.5 border-r border-white/[0.06] bg-white/[0.02] p-3">
        {channel.logo ? (
          <img src={channel.logo} alt="" loading="lazy" className="h-9 w-9 rounded-lg bg-white/5 object-contain p-0.5" />
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-lg text-xs font-black uppercase text-white/90" style={{ background: channelColor(channel.name) }}>
            {channel.name.slice(0, 2).toUpperCase()}
          </span>
        )}
        <span className="block w-full truncate text-center text-[11px] font-semibold text-white/75">{channel.name}</span>
      </div>
      <div className="min-w-0 flex-1 p-3">
        {programs.length === 0 ? (
          <p className="py-3 text-xs text-white/35">Programme non disponible.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {current && (
              <div className="flex items-center gap-2">
                <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-300">Live</span>
                <p className="truncate text-sm font-bold text-white">{current.title}</p>
                <span className="ml-auto shrink-0 text-[10px] text-white/40 tabular-nums">{formatTime(current.start)}–{formatTime(current.end)}</span>
              </div>
            )}
            {next && (
              <div className="flex items-center gap-2 pl-1">
                <span className="text-[9px] font-semibold uppercase tracking-wide text-white/35">Suivant</span>
                <p className="truncate text-xs text-white/55">{next.title}</p>
                <span className="ml-auto shrink-0 text-[10px] text-white/35 tabular-nums">{formatTime(next.start)}</span>
              </div>
            )}
            {!current && !next && (
              <div className="flex flex-col gap-0.5">
                {programs.slice(0, 3).map((p) => (
                  <p key={p.start} className="truncate text-xs text-white/50">
                    <span className="tabular-nums text-white/35">{formatTime(p.start)}</span> — {p.title}
                  </p>
                ))}
                {programs.length > 3 && (
                  <p className="text-[10px] text-white/30">+{programs.length - 3} autres</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </button>
  );
};

interface HomeSectionProps {
  title: string;
  channels: NeahplusChannel[];
  groupByChannelId: ReadonlyMap<string, ChannelGroup>;
  now: number;
  favorites: Set<string>;
  selectedGroupKey: string | null;
  resolvingKey: string | null;
  onSelectChannel: (channel: NeahplusChannel) => void;
  onToggleFavorite: (key: string) => void;
  registerRef: (el: HTMLButtonElement | null, index: number) => void;
  startIndex: number;
}

const HomeSection = ({
  title,
  channels,
  groupByChannelId,
  now,
  favorites,
  selectedGroupKey,
  resolvingKey,
  onSelectChannel,
  onToggleFavorite,
  registerRef,
  startIndex,
}: HomeSectionProps) => {
  if (channels.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <h3 className="px-1 text-sm font-bold tracking-tight text-white/85">{title}</h3>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {channels.map((channel, i) => {
          const group = groupByChannelId.get(channel.id);
          if (!group) return null;
          return (
            <ChannelCard
              key={channel.id}
              group={group}
              selected={group.key === selectedGroupKey}
              favorited={favorites.has(group.key)}
              resolving={group.key === resolvingKey}
              onSelect={() => onSelectChannel(channel)}
              onToggleFavorite={() => onToggleFavorite(group.key)}
              index={startIndex + i}
              now={now}
              registerRef={registerRef}
            />
          );
        })}
      </div>
    </div>
  );
};

const NeahplusExperience = () => {
  const [catalog, setCatalog] = useState<NeahplusCatalog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<Tab>('home');
  const [query, setQuery] = useState('');
  const [country, setCountry] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [activeVariantIndex, setActiveVariantIndex] = useState(0);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [guideDate, setGuideDate] = useState(() => new Date());
  const [resolvingKey, setResolvingKey] = useState<string | null>(null);
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [showQuickSearch, setShowQuickSearch] = useState(false);
  const [showChannelList, setShowChannelList] = useState(false);
  const [prevGroupKey, setPrevGroupKey] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const gridFocusIndex = useRef(0);
  const tabButtonsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoadError(null);
    loadNeahplusCatalog(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setCatalog(data);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(err instanceof Error ? err.message : 'Catalogue indisponible');
      });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    setFavorites(loadFavorites());
  }, []);

  const toggleFavorite = useCallback((key: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveFavorites(next);
      return next;
    });
  }, []);

  const realGroups = useMemo(() => groupChannelVariants(catalog?.channels ?? []), [catalog]);
  const allGroups = useMemo(
    () => [...realGroups, ...historicalChannelsWithoutDuplicates(realGroups)],
    [realGroups],
  );
  const groupByKey = useMemo(
    () => new Map(allGroups.map((group) => [group.key, group])),
    [allGroups],
  );
  const groupByChannelId = useMemo(
    () => indexChannelGroupsByChannelId(allGroups),
    [allGroups],
  );

  useEffect(() => {
    if (realGroups.length === 0) return;
    setFavorites((prev) => {
      const { favorites: migrated, changed } = migrateLegacyFavorites(prev, realGroups);
      if (changed) saveFavorites(migrated);
      return changed ? migrated : prev;
    });
  }, [realGroups]);

  useEffect(() => {
    if (catalog && !country) {
      const hasFrance = catalog.countries.some((c) => c.name === 'France');
      if (hasFrance) setCountry('France');
    }
  }, [catalog, country]);

  const filteredGroups = useMemo(() => {
    const needle = foldText(query.trim());
    const base = tab === 'favorites'
      ? allGroups.filter((g) => favorites.has(g.key))
      : allGroups;

    return base.filter((g) => {
      if (country && tab !== 'world' && !groupMatchesCountry(g, country)) return false;
      if (needle && !foldText(g.displayName).includes(needle)) return false;
      return true;
    });
  }, [allGroups, country, query, tab, favorites]);

  const visibleGroups = filteredGroups.slice(0, visibleCount);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query, country, tab]);

  const selectedGroup = selectedGroupKey ? groupByKey.get(selectedGroupKey) ?? null : null;
  const activeVariant = selectedGroup?.variants[activeVariantIndex] ?? null;

  const carouselGroups = useMemo(() => {
    return allGroups.filter((g) => g.hasStream && g.variants.length > 0);
  }, [allGroups]);

  const resolvingRef = useRef<AbortController | null>(null);

  const resolveBestVariant = useCallback(async (group: ChannelGroup) => {
    if (group.variants.length === 0) return;
    resolvingRef.current?.abort();
    const controller = new AbortController();
    resolvingRef.current = controller;
    setResolvingKey(group.key);

    for (let i = 0; i < group.variants.length; i++) {
      if (controller.signal.aborted) return;
      try {
        await resolveNeahplusStream(group.variants[i].id, controller.signal);
        if (controller.signal.aborted) return;
        setActiveVariantIndex(i);
        setResolvingKey(null);
        return;
      } catch {
      }
    }

    if (!controller.signal.aborted) {
      setActiveVariantIndex(0);
      setResolvingKey(null);
    }
  }, []);

  const handleSelectGroup = useCallback((group: ChannelGroup) => {
    setPrevGroupKey(selectedGroupKey);
    setSelectedGroupKey(group.key);
    setActiveVariantIndex(0);
    if (group.variants.length > 1) {
      void resolveBestVariant(group);
    }
  }, [resolveBestVariant, selectedGroupKey]);

  const handleSelectChannel = useCallback((channel: NeahplusChannel) => {
    const group = groupByChannelId.get(channel.id);
    if (!group) return;
    setPrevGroupKey(selectedGroupKey);
    setSelectedGroupKey(group.key);
    const vIdx = group.variants.findIndex((v) => v.id === channel.id);
    setActiveVariantIndex(vIdx >= 0 ? vIdx : 0);
  }, [groupByChannelId, selectedGroupKey]);

  const goToPrevChannel = useCallback(() => {
    if (prevGroupKey) {
      const prev = groupByKey.get(prevGroupKey);
      if (prev) {
        const temp = prevGroupKey;
        setPrevGroupKey(selectedGroupKey);
        setSelectedGroupKey(temp);
        setActiveVariantIndex(0);
        if (prev.variants.length > 1) void resolveBestVariant(prev);
      }
    }
  }, [prevGroupKey, groupByKey, selectedGroupKey, resolveBestVariant]);

  const cycleVariant = useCallback((direction: 1 | -1) => {
    if (!selectedGroup || selectedGroup.variants.length <= 1) return;
    setActiveVariantIndex((prev) => {
      const len = selectedGroup.variants.length;
      return (prev + direction + len) % len;
    });
  }, [selectedGroup]);

  const epgChannels = useMemo(() => {
    if (!catalog) return [];
    return channelsWithEpg(catalog.channels)
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
      .slice(0, 200);
  }, [catalog]);

  const epgVisible = epgChannels.slice(0, visibleCount);

  const favoriteChannels = useMemo(() => {
    return realGroups
      .filter((g) => favorites.has(g.key))
      .map((g) => g.variants[0])
      .slice(0, HOME_SECTION_COUNT);
  }, [realGroups, favorites]);

  const playingChannels = useMemo(() => {
    if (!catalog) return [];
    return channelsCurrentlyPlaying(catalog.channels, now).slice(0, HOME_SECTION_COUNT);
  }, [catalog, now]);

  const recommendedChannelList = useMemo(() => {
    if (!catalog) return [];
    return recommendedChannels(catalog.channels, now, HOME_SECTION_COUNT);
  }, [catalog, now]);

  const registerRef = useCallback((el: HTMLButtonElement | null, index: number) => {
    itemRefs.current[index] = el;
  }, []);

  type KeyboardContext = {
    showInfoPanel: boolean;
    showQuickSearch: boolean;
    tab: Tab;
    epgVisible: NeahplusChannel[];
    visibleGroups: ChannelGroup[];
    activeVariant: NeahplusChannel | null;
    catalog: NeahplusCatalog | null;
    selectedGroup: ChannelGroup | null;
    cycleVariant: (direction: 1 | -1) => void;
  };

  const keyboardContextRef = useRef<KeyboardContext>({
    showInfoPanel: false,
    showQuickSearch: false,
    tab: 'home',
    epgVisible: [],
    visibleGroups: [],
    activeVariant: null,
    catalog: null,
    selectedGroup: null,
    cycleVariant: () => undefined,
  });

  keyboardContextRef.current = {
    showInfoPanel,
    showQuickSearch,
    tab,
    epgVisible,
    visibleGroups,
    activeVariant,
    catalog,
    selectedGroup,
    cycleVariant,
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const context = keyboardContextRef.current;
      if (context.showInfoPanel || context.showQuickSearch) return;

      const target = e.target as HTMLElement;
      const isInInput = target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA';
      const focusGridItem = (index: number) => {
        const items = context.tab === 'guide' ? context.epgVisible : context.visibleGroups;
        const clamped = Math.max(0, Math.min(index, items.length - 1));
        gridFocusIndex.current = clamped;
        itemRefs.current[clamped]?.focus();
      };
      const focusTab = (index: number) => {
        const clamped = Math.max(0, Math.min(index, TABS.length - 1));
        tabButtonsRef.current[clamped]?.focus();
      };

      if (isInInput && e.key !== 'Escape') return;

      if (e.key === 'Escape') {
        if (isInInput) {
          (target as HTMLInputElement).blur();
          focusGridItem(0);
        }
        e.preventDefault();
        return;
      }

      if (e.key === 'i' || e.key === 'I') {
        if (!isInInput && context.activeVariant) {
          e.preventDefault();
          setShowInfoPanel(true);
          return;
        }
      }

      if (e.key === '/') {
        if (!isInInput && context.catalog) {
          e.preventDefault();
          setShowQuickSearch(true);
          return;
        }
      }

      if (e.key === 'l' || e.key === 'L') {
        if (!isInInput) {
          e.preventDefault();
          setShowChannelList((v) => !v);
          return;
        }
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          focusGridItem(gridFocusIndex.current + 1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (gridFocusIndex.current === 0) {
            focusTab(TABS.findIndex((item) => item.id === context.tab));
          } else {
            focusGridItem(gridFocusIndex.current - 1);
          }
          break;
        case 'ArrowRight':
          if (context.selectedGroup && context.selectedGroup.variants.length > 1) {
            e.preventDefault();
            context.cycleVariant(1);
          }
          break;
        case 'ArrowLeft':
          if (context.selectedGroup && context.selectedGroup.variants.length > 1) {
            e.preventDefault();
            context.cycleVariant(-1);
          }
          break;
        case 'PageUp':
        case 'ChannelUp':
          e.preventDefault();
          focusGridItem(gridFocusIndex.current - 10);
          break;
        case 'PageDown':
        case 'ChannelDown':
          e.preventDefault();
          focusGridItem(gridFocusIndex.current + 10);
          break;
        case 'Enter':
          break;
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => {
    gridFocusIndex.current = 0;
    itemRefs.current = [];
    const timer = setTimeout(() => {
      itemRefs.current[0]?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [tab]);

  if (loadError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-red-500/10 ring-1 ring-red-500/20">
          <AlertTriangle className="h-10 w-10 text-amber-300" aria-hidden="true" />
        </div>
        <p className="max-w-md text-sm leading-6 text-white/70">
          Le catalogue NEAHPLUS ne répond pas pour le moment. {loadError}.
        </p>
        <button
          type="button"
          onClick={() => setAttempt((v) => v + 1)}
          className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-400 active:scale-[0.98]"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Réessayer
        </button>
      </div>
    );
  }

  if (!catalog) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="relative">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-red-500/10 ring-1 ring-red-500/20">
            <Loader2 className="h-8 w-8 animate-spin text-red-400 motion-reduce:animate-none" aria-hidden="true" />
          </div>
        </div>
        <p className="text-sm font-medium text-white/60">Chargement du catalogue</p>
        <p className="text-xs text-white/30">Récupération des chaînes et programmes en cours…</p>
      </div>
    );
  }

  const variantLabel = (variant: NeahplusChannel, baseName: string): string => {
    const suffix = variant.name.replace(baseName, '').trim();
    return suffix || `Source`;
  };

  const activeProgram = activeVariant ? currentProgram(activeVariant, now) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#0a0a0f] text-white">
      {/* Top navigation bar */}
      <nav className="flex shrink-0 items-center gap-1 border-b border-white/[0.06] bg-[#0d0d14]/95 px-3 py-2.5 backdrop-blur-xl sm:px-5" aria-label="Navigation NEAHPLUS TV">
        <div className="mr-2 flex items-center gap-2 sm:mr-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-red-500 to-red-700 shadow-lg shadow-red-500/20">
            <Tv className="h-4 w-4 text-white" aria-hidden="true" />
          </div>
          <span className="hidden text-sm font-black tracking-tight text-white sm:inline">NEAH<span className="text-red-400">PLUS</span></span>
        </div>
        <div className="flex items-center gap-0.5 overflow-x-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
          {TABS.map(({ id, label, icon: Icon }, i) => (
            <button
              key={id}
              ref={(el) => { tabButtonsRef.current[i] = el; }}
              type="button"
              onClick={() => setTab(id)}
              aria-current={tab === id ? 'true' : undefined}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-200 sm:text-sm ${
                tab === id
                  ? 'bg-white/10 text-white'
                  : 'text-white/45 hover:bg-white/5 hover:text-white/80'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowChannelList((v) => !v)}
            aria-label="Liste des chaînes"
            aria-pressed={showChannelList}
            className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-semibold transition-all duration-200 sm:text-sm ${
              showChannelList
                ? 'bg-red-500/15 text-red-200 ring-1 ring-red-500/30'
                : 'text-white/45 hover:bg-white/5 hover:text-white/80'
            }`}
          >
            <List className="h-4 w-4" aria-hidden="true" />
            <span className="hidden lg:inline">Liste</span>
          </button>
          <button
            type="button"
            onClick={() => setShowQuickSearch(true)}
            aria-label="Recherche rapide"
            className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-semibold text-white/45 transition-all duration-200 hover:bg-white/5 hover:text-white/80 sm:text-sm"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Rechercher</span>
          </button>
        </div>
      </nav>

      {/* Main content area */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Channel list sidebar */}
        {showChannelList && (
          <aside className="absolute inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-white/[0.06] bg-[#0d0d14] shadow-2xl lg:relative lg:z-0 lg:shadow-none" aria-label="Liste latérale des chaînes">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
              <h2 className="flex items-center gap-2 text-sm font-bold text-white">
                <List className="h-4 w-4 text-red-400" />
                Chaînes
              </h2>
              <button
                type="button"
                onClick={() => setShowChannelList(false)}
                aria-label="Fermer la liste"
                className="rounded-lg p-1 text-white/50 transition hover:bg-white/10 hover:text-white lg:hidden"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2" data-lenis-prevent>
              <div className="flex flex-col gap-1">
                {carouselGroups.map((group) => {
                  const isSelected = group.key === selectedGroupKey;
                  const isFavorited = favorites.has(group.key);
                  return (
                    <button
                      key={group.key}
                      type="button"
                      onClick={() => { handleSelectGroup(group); }}
                      className={`group flex items-center gap-3 rounded-xl p-2.5 text-left transition-all duration-200 ${
                        isSelected
                          ? 'bg-red-500/15 ring-1 ring-red-500/30'
                          : 'hover:bg-white/5'
                      }`}
                    >
                      {group.logo ? (
                        <img src={group.logo} alt="" loading="lazy" className="h-9 w-9 shrink-0 rounded-lg bg-white/5 object-contain p-0.5" />
                      ) : (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[10px] font-black uppercase text-white/90" style={{ background: channelColor(group.displayName) }}>
                          {group.displayName.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-xs font-semibold ${isSelected ? 'text-white' : 'text-white/75'}`}>{group.displayName}</span>
                        <span className="block truncate text-[10px] text-white/35">{group.countries.join(', ') || 'France'}</span>
                      </span>
                      {isFavorited && (
                        <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" aria-hidden="true" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>
        )}

        {/* Overlay for mobile sidebar */}
        {showChannelList && (
          <div
            className="absolute inset-0 z-30 bg-black/60 lg:hidden"
            onClick={() => setShowChannelList(false)}
            aria-hidden="true"
          />
        )}

        {/* Left: Player + info */}
        <section className="flex min-h-0 shrink-0 flex-col gap-3 p-3 lg:w-[42%] lg:p-4 xl:w-[40%]">
          {activeVariant && selectedGroup ? (
            <>
              <div className="group relative">
                <NeahplusPlayer
                  key={activeVariant.id}
                  channelId={activeVariant.id}
                  channelName={selectedGroup.displayName}
                  onInfo={() => setShowInfoPanel(true)}
                  onPrevChannel={prevGroupKey ? goToPrevChannel : undefined}
                  onGuide={() => setTab('guide')}
                />
              </div>

              {/* Channel info bar */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-lg font-bold tracking-tight text-white">{selectedGroup.displayName}</h2>
                  <p className="mt-0.5 truncate text-xs text-white/50">
                    {activeProgram?.title ?? selectedGroup.countries.join(', ') ?? '—'}
                  </p>
                  {activeProgram && (
                    <p className="mt-0.5 text-[10px] text-red-300/70 tabular-nums">
                      {formatTime(activeProgram.start)} – {formatTime(activeProgram.end)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowInfoPanel(true)}
                    aria-label="Informations programme"
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white"
                  >
                    <Info className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleFavorite(selectedGroup.key)}
                    aria-label={favorites.has(selectedGroup.key) ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                    aria-pressed={favorites.has(selectedGroup.key)}
                    className={`flex h-9 w-9 items-center justify-center rounded-xl transition ${
                      favorites.has(selectedGroup.key)
                        ? 'bg-amber-400/15 text-amber-400 hover:bg-amber-400/25'
                        : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/70'
                    }`}
                  >
                    <Star className="h-4 w-4" fill={favorites.has(selectedGroup.key) ? 'currentColor' : 'none'} />
                  </button>
                </div>
              </div>

              {/* Variant selector */}
              {selectedGroup.variants.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedGroup.variants.map((v, i) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setActiveVariantIndex(i)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all duration-200 ${
                        i === activeVariantIndex
                          ? 'bg-red-500/20 text-red-200 ring-1 ring-red-500/30'
                          : 'bg-white/5 text-white/45 hover:bg-white/10 hover:text-white/70'
                      }`}
                    >
                      {variantLabel(v, shortChannelName(selectedGroup.displayName))}
                    </button>
                  ))}
                </div>
              )}

              {/* Channel carousel */}
              <ChannelCarousel
                groups={carouselGroups}
                selectedKey={selectedGroupKey}
                favoritedKeys={favorites}
                onSelectGroup={handleSelectGroup}
                onToggleFavorite={toggleFavorite}
              />

              {/* Program synopsis */}
              <ProgramSynopsis
                channel={activeVariant}
                channelDisplayName={selectedGroup?.displayName ?? ''}
                now={now}
              />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent p-8 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/[0.04] ring-1 ring-white/5">
                <Tv className="h-10 w-10 text-white/15" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-medium text-white/50">Sélectionnez une chaîne</p>
                <p className="mt-1 text-xs text-white/30">Choisissez une chaîne dans la liste ou le carrousel pour commencer à regarder.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowChannelList(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2 text-xs font-semibold text-white/60 transition hover:bg-white/10 hover:text-white"
              >
                <List className="h-4 w-4" />
                Ouvrir la liste des chaînes
              </button>
            </div>
          )}
        </section>

        {/* Right: Browse / Guide / Home */}
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden border-l border-white/[0.04]">
          {/* Search + filters bar */}
          <div className="flex flex-col gap-2 border-b border-white/[0.06] p-3 sm:flex-row sm:items-center sm:gap-3">
            <label className="relative flex-1">
              <span className="sr-only">Rechercher une chaîne</span>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher une chaîne…"
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-white/30 focus:border-red-500/50 focus:bg-white/[0.05] focus:outline-none focus:ring-1 focus:ring-red-500/20"
              />
            </label>
            {tab !== 'world' && tab !== 'home' && catalog.countries.length > 0 && (
              <label className="sm:w-52">
                <span className="sr-only">Filtrer par pays</span>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-sm text-white focus:border-red-500/50 focus:outline-none focus:ring-1 focus:ring-red-500/20"
                >
                  <option value="">Tous les pays</option>
                  {catalog.countries.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} ({c.count})
                    </option>
                  ))}
                </select>
              </label>
            )}
            {tab === 'world' && (
              <span className="text-xs font-medium text-white/40">
                {catalog.countries.length} pays · {catalog.channels.length} chaînes
              </span>
            )}
          </div>

          {/* Guide date navigator */}
          {tab === 'guide' && (
            <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2.5">
              <button
                type="button"
                onClick={() => setGuideDate((d) => new Date(d.getTime() - 86400000))}
                className="rounded-xl bg-white/5 p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
                aria-label="Jour précédent"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-bold tracking-tight text-white">
                {guideDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </span>
              <button
                type="button"
                onClick={() => setGuideDate((d) => new Date(d.getTime() + 86400000))}
                className="rounded-xl bg-white/5 p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
                aria-label="Jour suivant"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setGuideDate(new Date())}
                className="ml-auto rounded-xl bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/50 transition hover:bg-white/10 hover:text-white/80"
              >
                Aujourd'hui
              </button>
            </div>
          )}

          {/* Result count */}
          {tab !== 'guide' && tab !== 'home' && (
            <p className="px-3 py-2 text-xs font-medium text-white/40" aria-live="polite">
              {filteredGroups.length} chaîne{filteredGroups.length > 1 ? 's' : ''}
              {tab === 'favorites' && favorites.size === 0 && ' — Ajoutez des chaînes avec l\'étoile'}
            </p>
          )}

          {/* Content grid */}
          <div ref={gridRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3" data-lenis-prevent>
            {tab === 'home' ? (
              <div className="flex flex-col gap-6">
                {favoriteChannels.length > 0 && (
                  <HomeSection
                    title="Mes favoris"
                    channels={favoriteChannels}
                    groupByChannelId={groupByChannelId}
                    now={now}
                    favorites={favorites}
                    selectedGroupKey={selectedGroupKey}
                    resolvingKey={resolvingKey}
                    onSelectChannel={handleSelectChannel}
                    onToggleFavorite={toggleFavorite}
                    registerRef={registerRef}
                    startIndex={0}
                  />
                )}
                {playingChannels.length > 0 && (
                  <HomeSection
                    title="En cours maintenant"
                    channels={playingChannels}
                    groupByChannelId={groupByChannelId}
                    now={now}
                    favorites={favorites}
                    selectedGroupKey={selectedGroupKey}
                    resolvingKey={resolvingKey}
                    onSelectChannel={handleSelectChannel}
                    onToggleFavorite={toggleFavorite}
                    registerRef={registerRef}
                    startIndex={favoriteChannels.length}
                  />
                )}
                {recommendedChannelList.length > 0 && (
                  <HomeSection
                    title="À découvrir"
                    channels={recommendedChannelList}
                    groupByChannelId={groupByChannelId}
                    now={now}
                    favorites={favorites}
                    selectedGroupKey={selectedGroupKey}
                    resolvingKey={resolvingKey}
                    onSelectChannel={handleSelectChannel}
                    onToggleFavorite={toggleFavorite}
                    registerRef={registerRef}
                    startIndex={favoriteChannels.length + playingChannels.length}
                  />
                )}
                {favoriteChannels.length === 0 && playingChannels.length === 0 && recommendedChannelList.length === 0 && (
                  <p className="py-16 text-center text-sm text-white/40">
                    Aucune chaîne disponible pour le moment.
                  </p>
                )}
              </div>
            ) : tab === 'guide' ? (
              epgChannels.length === 0 ? (
                <p className="py-16 text-center text-sm text-white/40">
                  Aucune chaîne avec programme TV (EPG) disponible.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {epgVisible.map((channel, i) => (
                    <EpgRow
                      key={channel.id}
                      channel={channel}
                      date={guideDate}
                      index={i}
                      now={now}
                      registerRef={registerRef}
                      onPlay={() => handleSelectChannel(channel)}
                    />
                  ))}
                  {visibleCount < epgChannels.length && (
                    <button
                      type="button"
                      onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
                      className="mt-2 w-full rounded-xl border border-white/[0.06] bg-white/[0.02] py-3.5 text-sm font-semibold text-white/50 transition hover:bg-white/[0.05] hover:text-white/80"
                    >
                      Afficher plus de chaînes
                    </button>
                  )}
                </div>
              )
            ) : filteredGroups.length === 0 ? (
              <p className="py-16 text-center text-sm text-white/40">
                {tab === 'favorites'
                  ? 'Aucune chaîne dans vos favoris. Cliquez sur l\'étoile d\'une chaîne pour l\'ajouter.'
                  : 'Aucune chaîne ne correspond à votre recherche.'}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {visibleGroups.map((group, i) => (
                  <ChannelCard
                    key={group.key}
                    group={group}
                    selected={group.key === selectedGroupKey}
                    favorited={favorites.has(group.key)}
                    resolving={group.key === resolvingKey}
                    onSelect={() => handleSelectGroup(group)}
                    onToggleFavorite={() => toggleFavorite(group.key)}
                    index={i}
                    now={now}
                    registerRef={registerRef}
                  />
                ))}
                {visibleCount < filteredGroups.length && (
                  <button
                    type="button"
                    onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
                    className="col-span-full mt-2 w-full rounded-xl border border-white/[0.06] bg-white/[0.02] py-3.5 text-sm font-semibold text-white/50 transition hover:bg-white/[0.05] hover:text-white/80"
                  >
                    Afficher plus de chaînes
                  </button>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="shrink-0 border-t border-white/[0.06] bg-[#0d0d14] px-3 py-2">
        <p className="text-center text-[10px] text-white/25">
          NEAHPLUS TV — Guide indépendant. Cette interface organise les chaînes et leurs sources disponibles.
          Elle n'est ni affiliée à CANAL+ ni exploitée par CANAL+.
        </p>
      </footer>

      {/* Overlays */}
      {showInfoPanel && activeVariant && (
        <InfoPanel
          channel={activeVariant}
          channelDisplayName={selectedGroup?.displayName ?? activeVariant.name}
          onClose={() => setShowInfoPanel(false)}
        />
      )}

      {showQuickSearch && catalog && (
        <QuickSearch
          channels={catalog.channels}
          currentChannelId={activeVariant?.id ?? null}
          onSelect={handleSelectChannel}
          onClose={() => setShowQuickSearch(false)}
        />
      )}
    </div>
  );
};

export default NeahplusExperience;
