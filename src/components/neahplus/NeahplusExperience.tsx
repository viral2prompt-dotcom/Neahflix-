import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Globe,
  Heart,
  Home as HomeIcon,
  Info,
  Loader2,
  RotateCcw,
  Search,
  Star,
  Tv,
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
  { id: 'home', label: 'Accueil TV', icon: HomeIcon },
  { id: 'all', label: 'Toutes les chaînes', icon: Tv },
  { id: 'guide', label: 'Programme TV', icon: Star },
  { id: 'favorites', label: 'Mes favoris', icon: Heart },
  { id: 'world', label: 'TV mondial', icon: Globe },
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
  registerRef,
}: ChannelCardProps) => {
  const now = Date.now();
  const activeVariant = group.variants[0];
  const prog = activeVariant ? currentProgram(activeVariant, now) : null;
  const initials = group.displayName.slice(0, 2).toUpperCase();
  const bgColor = channelColor(group.displayName);

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border transition-all duration-200 ${
        selected
          ? 'border-red-500/60 bg-red-500/10 ring-1 ring-red-500/40'
          : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]'
      }`}
    >
      <button
        ref={(el) => registerRef(el, index)}
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        className="flex w-full items-center gap-3 p-3 pr-12 text-left"
      >
        {group.logo ? (
          <img
            src={group.logo}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-12 w-12 shrink-0 rounded-lg bg-white/5 object-contain p-1"
          />
        ) : (
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-sm font-black uppercase text-white/90"
            style={{ background: bgColor }}
            aria-hidden="true"
          >
            {initials}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-white">{group.displayName}</span>
          <span className="block truncate text-xs text-white/50">
            {group.isHistorical
              ? 'Chaîne historique'
              : prog?.title ?? group.countries.join(', ') ?? '—'}
          </span>
          {!group.hasStream && (
            <span className="block text-[10px] text-amber-300/80">Flux non disponible</span>
          )}
          {group.variants.length > 1 && (
            <span className="block text-[10px] text-red-300/80">{group.variants.length} variantes</span>
          )}
          {resolving && (
            <span className="block text-[10px] text-red-300/80">Vérification…</span>
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
        className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 transition-colors ${
          favorited
            ? 'text-amber-400 hover:bg-amber-400/10'
            : 'text-white/30 hover:bg-white/10 hover:text-white/60'
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
  registerRef: (el: HTMLButtonElement | null, index: number) => void;
}

const EpgRow = ({ channel, date, onPlay, index, registerRef }: EpgRowProps) => {
  const programs = useMemo(() => getProgramsForDay(channel, date), [channel, date]);
  const now = Date.now();
  const isToday = useMemo(() => {
    const today = new Date();
    return date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate();
  }, [date]);
  const current = isToday ? currentProgram(channel, now) : null;
  const next = isToday ? getNextProgram(channel, now) : null;

  return (
    <button
      ref={(el) => registerRef(el, index)}
      type="button"
      onClick={onPlay}
      className="flex w-full flex-col gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left transition hover:border-red-500/40 hover:bg-white/[0.06]"
    >
      <div className="flex items-center gap-2">
        {channel.logo ? (
          <img src={channel.logo} alt="" loading="lazy" className="h-8 w-8 rounded-md bg-white/5 object-contain p-0.5" />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-800 text-red-200">
            <Tv className="h-4 w-4" />
          </span>
        )}
        <span className="truncate text-sm font-semibold text-white">{channel.name}</span>
      </div>
      {programs.length === 0 ? (
        <p className="text-xs text-white/40">Programme non disponible pour cette date.</p>
      ) : (
        <div className="flex flex-col gap-0.5">
          {current && (
            <p className="text-xs text-red-300">
              <span className="font-semibold">En cours : </span>
              {current.title} ({formatTime(current.start)}–{formatTime(current.end)})
            </p>
          )}
          {next && (
            <p className="text-xs text-white/50">
              <span className="font-semibold">Suivant : </span>
              {next.title} ({formatTime(next.start)})
            </p>
          )}
          {!current && !next && (
            <div className="flex flex-col gap-0.5">
              {programs.slice(0, 3).map((p) => (
                <p key={p.start} className="text-xs text-white/50">
                  {formatTime(p.start)} — {p.title}
                </p>
              ))}
              {programs.length > 3 && (
                <p className="text-xs text-white/40">+{programs.length - 3} autres programmes</p>
              )}
            </div>
          )}
        </div>
      )}
    </button>
  );
};

interface HomeSectionProps {
  title: string;
  channels: NeahplusChannel[];
  groups: ChannelGroup[];
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
  groups,
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
    <div className="flex flex-col gap-2">
      <h3 className="px-1 text-sm font-bold text-white/80">{title}</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {channels.map((channel, i) => {
          const group = groups.find((g) => g.variants.some((v) => v.id === channel.id));
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
  const [prevGroupKey, setPrevGroupKey] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const gridFocusIndex = useRef(0);
  const tabButtonsRef = useRef<(HTMLButtonElement | null)[]>([]);

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

  const selectedGroup = allGroups.find((g) => g.key === selectedGroupKey) ?? null;
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
    const group = allGroups.find((g) => g.variants.some((v) => v.id === channel.id));
    if (!group) return;
    setPrevGroupKey(selectedGroupKey);
    setSelectedGroupKey(group.key);
    const vIdx = group.variants.findIndex((v) => v.id === channel.id);
    setActiveVariantIndex(vIdx >= 0 ? vIdx : 0);
  }, [allGroups, selectedGroupKey]);

  const goToPrevChannel = useCallback(() => {
    if (prevGroupKey) {
      const prev = allGroups.find((g) => g.key === prevGroupKey);
      if (prev) {
        const temp = prevGroupKey;
        setPrevGroupKey(selectedGroupKey);
        setSelectedGroupKey(temp);
        setActiveVariantIndex(0);
        if (prev.variants.length > 1) void resolveBestVariant(prev);
      }
    }
  }, [prevGroupKey, allGroups, selectedGroupKey, resolveBestVariant]);

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

  const now = Date.now();
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

  const focusGridItem = useCallback((index: number) => {
    const items = tab === 'guide' ? epgVisible : visibleGroups;
    const max = items.length - 1;
    const clamped = Math.max(0, Math.min(index, max));
    gridFocusIndex.current = clamped;
    itemRefs.current[clamped]?.focus();
  }, [tab, epgVisible, visibleGroups]);

  const focusTab = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(index, TABS.length - 1));
    tabButtonsRef.current[clamped]?.focus();
  }, []);

  const currentTabIndex = TABS.findIndex((t) => t.id === tab);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (showInfoPanel || showQuickSearch) return;

      const target = e.target as HTMLElement;
      const isInInput = target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA';
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
        if (!isInInput && activeVariant) {
          e.preventDefault();
          setShowInfoPanel(true);
          return;
        }
      }

      if (e.key === '/') {
        if (!isInInput && catalog) {
          e.preventDefault();
          setShowQuickSearch(true);
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
            focusTab(currentTabIndex);
          } else {
            focusGridItem(gridFocusIndex.current - 1);
          }
          break;
        case 'ArrowRight':
          if (selectedGroup && selectedGroup.variants.length > 1) {
            e.preventDefault();
            cycleVariant(1);
          }
          break;
        case 'ArrowLeft':
          if (selectedGroup && selectedGroup.variants.length > 1) {
            e.preventDefault();
            cycleVariant(-1);
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
  }, [tab, epgVisible, visibleGroups, focusGridItem, focusTab, currentTabIndex, cycleVariant, selectedGroup, activeVariant, catalog, showInfoPanel, showQuickSearch]);

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
        <AlertTriangle className="h-10 w-10 text-amber-300" aria-hidden="true" />
        <p className="max-w-md text-sm leading-6 text-white/80">
          Le catalogue NEAHPLUS ne répond pas pour le moment. {loadError}.
        </p>
        <button
          type="button"
          onClick={() => setAttempt((v) => v + 1)}
          className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-400"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Réessayer
        </button>
      </div>
    );
  }

  if (!catalog) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-red-400 motion-reduce:animate-none" aria-hidden="true" />
        <p className="text-sm text-white/75">Chargement du catalogue des chaînes</p>
      </div>
    );
  }

  const variantLabel = (variant: NeahplusChannel, baseName: string): string => {
    const suffix = variant.name.replace(baseName, '').trim();
    return suffix || `Source`;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-950 text-white">
      <nav className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-white/10 bg-slate-950/95 px-2 py-2 backdrop-blur sm:px-4" aria-label="Rubriques NEAHPLUS TV">
        {TABS.map(({ id, label, icon: Icon }, i) => (
          <button
            key={id}
            ref={(el) => { tabButtonsRef.current[i] = el; }}
            type="button"
            onClick={() => setTab(id)}
            aria-current={tab === id ? 'true' : undefined}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors sm:text-sm ${
              tab === id
                ? 'bg-red-500/15 text-red-200 ring-1 ring-red-500/30'
                : 'text-white/55 hover:bg-white/5 hover:text-white/80'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowQuickSearch(true)}
          aria-label="Recherche rapide"
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white/55 transition hover:bg-white/5 hover:text-white/80 sm:text-sm"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Rechercher</span>
        </button>
      </nav>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <section className="flex min-h-0 shrink-0 flex-col gap-2 p-3 lg:w-[45%] lg:p-4">
          {activeVariant && selectedGroup ? (
            <>
              <NeahplusPlayer
                key={activeVariant.id}
                channelId={activeVariant.id}
                channelName={selectedGroup.displayName}
                onInfo={() => setShowInfoPanel(true)}
                onPrevChannel={prevGroupKey ? goToPrevChannel : undefined}
                onGuide={() => setTab('guide')}
              />
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-bold text-white">{selectedGroup.displayName}</h2>
                  <p className="truncate text-xs text-white/55">
                    {currentProgram(activeVariant, Date.now())?.title ?? selectedGroup.countries.join(', ')}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setShowInfoPanel(true)}
                    aria-label="Informations programme"
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white"
                  >
                    <Info className="h-4 w-4" />
                  </button>
                  {selectedGroup.variants.length > 1 && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => cycleVariant(-1)}
                        className="rounded-lg bg-white/5 p-1.5 text-white/70 transition hover:bg-white/10"
                        aria-label="Variante précédente"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <span className="text-xs text-white/50">
                        {activeVariantIndex + 1}/{selectedGroup.variants.length}
                      </span>
                      <button
                        type="button"
                        onClick={() => cycleVariant(1)}
                        className="rounded-lg bg-white/5 p-1.5 text-white/70 transition hover:bg-white/10"
                        aria-label="Variante suivante"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {selectedGroup.variants.length > 1 && (
                <div className="flex flex-wrap gap-1">
                  {selectedGroup.variants.map((v, i) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setActiveVariantIndex(i)}
                      className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                        i === activeVariantIndex
                          ? 'bg-red-500/20 text-red-200 ring-1 ring-red-500/30'
                          : 'bg-white/5 text-white/50 hover:bg-white/10'
                      }`}
                    >
                      {variantLabel(v, shortChannelName(selectedGroup.displayName))}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="flex aspect-video w-full items-center justify-center rounded-2xl bg-black/60 ring-1 ring-white/10">
              <div className="text-center">
                <Tv className="mx-auto h-12 w-12 text-white/20" aria-hidden="true" />
                <p className="mt-3 px-6 text-sm text-white/60">
                  Sélectionnez une chaîne pour commencer à regarder.
                </p>
              </div>
            </div>
          )}

          <ChannelCarousel
            groups={carouselGroups}
            selectedKey={selectedGroupKey}
            favoritedKeys={favorites}
            onSelectGroup={handleSelectGroup}
            onToggleFavorite={toggleFavorite}
          />

          <ProgramSynopsis
            channel={activeVariant}
            channelDisplayName={selectedGroup?.displayName ?? ''}
          />
        </section>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex flex-col gap-2 border-b border-white/10 p-3 sm:flex-row sm:items-center">
            <label className="relative flex-1">
              <span className="sr-only">Rechercher une chaîne</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher une chaîne"
                className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder:text-white/40 focus:border-red-500 focus:outline-none"
              />
            </label>
            {tab !== 'world' && tab !== 'home' && catalog.countries.length > 0 && (
              <label className="sm:w-48">
                <span className="sr-only">Filtrer par pays</span>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none"
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
              <span className="text-xs text-white/50">
                {catalog.countries.length} pays • {catalog.channels.length} chaînes
              </span>
            )}
          </div>

          {tab === 'guide' && (
            <div className="flex items-center gap-2 border-b border-white/10 p-3">
              <button
                type="button"
                onClick={() => setGuideDate((d) => new Date(d.getTime() - 86400000))}
                className="rounded-lg bg-white/5 p-1.5 text-white/70 transition hover:bg-white/10"
                aria-label="Jour précédent"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold text-white">
                {guideDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </span>
              <button
                type="button"
                onClick={() => setGuideDate((d) => new Date(d.getTime() + 86400000))}
                className="rounded-lg bg-white/5 p-1.5 text-white/70 transition hover:bg-white/10"
                aria-label="Jour suivant"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setGuideDate(new Date())}
                className="ml-auto rounded-lg bg-white/5 px-2 py-1 text-xs text-white/60 transition hover:bg-white/10"
              >
                Aujourd'hui
              </button>
            </div>
          )}

          {tab !== 'guide' && tab !== 'home' && (
            <p className="px-3 py-1.5 text-xs text-white/50" aria-live="polite">
              {filteredGroups.length} chaîne{filteredGroups.length > 1 ? 's' : ''}
              {tab === 'favorites' && favorites.size === 0 && ' — Ajoutez des chaînes avec l\'étoile'}
            </p>
          )}

          <div ref={gridRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3" data-lenis-prevent>
            {tab === 'home' ? (
              <div className="flex flex-col gap-4">
                {favoriteChannels.length > 0 && (
                  <HomeSection
                    title="Mes favoris"
                    channels={favoriteChannels}
                    groups={allGroups}
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
                    groups={allGroups}
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
                    groups={allGroups}
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
                  <p className="py-10 text-center text-sm text-white/50">
                    Aucune chaîne disponible pour le moment.
                  </p>
                )}
              </div>
            ) : tab === 'guide' ? (
              epgChannels.length === 0 ? (
                <p className="py-10 text-center text-sm text-white/50">
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
                      registerRef={registerRef}
                      onPlay={() => handleSelectChannel(channel)}
                    />
                  ))}
                  {visibleCount < epgChannels.length && (
                    <button
                      type="button"
                      onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
                      className="w-full rounded-xl py-3 text-sm font-semibold text-red-200 transition hover:bg-white/5"
                    >
                      Afficher plus de chaînes
                    </button>
                  )}
                </div>
              )
            ) : filteredGroups.length === 0 ? (
              <p className="py-10 text-center text-sm text-white/50">
                {tab === 'favorites'
                  ? 'Aucune chaîne dans vos favoris. Cliquez sur l\'étoile d\'une chaîne pour l\'ajouter.'
                  : 'Aucune chaîne ne correspond à votre recherche.'}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
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
                    registerRef={registerRef}
                  />
                ))}
                {visibleCount < filteredGroups.length && (
                  <button
                    type="button"
                    onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
                    className="col-span-full w-full rounded-xl py-3 text-sm font-semibold text-red-200 transition hover:bg-white/5"
                  >
                    Afficher plus de chaînes
                  </button>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      <footer className="shrink-0 border-t border-white/10 bg-slate-950 px-3 py-2">
        <p className="text-center text-[10px] text-white/35">
          NEAHPLUS TV — Guide indépendant. Cette interface organise les chaînes et leurs sources disponibles.
          Elle n'est ni affiliée à CANAL+ ni exploitée par CANAL+.
        </p>
      </footer>

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
