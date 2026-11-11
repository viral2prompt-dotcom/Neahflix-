import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Globe2,
  Heart,
  Home as HomeIcon,
  Info,
  ListVideo,
  Loader2,
  Menu,
  Play,
  Pencil,
  RotateCcw,
  Search,
  Settings as SettingsIcon,
  Tv,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import NeahplusPlayer, { preloadNeahplusPlayer } from './NeahplusPlayer';
import ChannelCarousel from './ChannelCarousel';
import ProgramSynopsis from './ProgramSynopsis';
import InfoPanel from './InfoPanel';
import QuickSearch from './QuickSearch';
import NeahplusHome from './NeahplusHome';
import {
  currentProgram,
  loadNeahplusCatalog,
  resolveNeahplusStream,
  type NeahplusCatalog,
  type NeahplusChannel,
} from './neahplusCatalog';
import {
  channelColor,
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
  loadChannelDisplayNames,
  saveChannelDisplayNames,
  getNextProgram,
  saveFavorites,
  shortChannelName,
} from './neahplusTvUtils';

type Tab = 'home' | 'all' | 'guide' | 'favorites' | 'countries' | 'settings' | 'world';
type GuidePeriod = 'all' | 'morning' | 'afternoon' | 'early-evening' | 'evening' | 'night';

const TABS: { id: 'home' | 'favorites' | 'countries' | 'settings'; label: string; description: string; icon: typeof HomeIcon }[] = [
  { id: 'home', label: 'Accueil', description: 'Retrouvez les chaînes et les programmes.', icon: HomeIcon },
  { id: 'favorites', label: 'Mon espace NEAHPLUS', description: 'Vos chaînes sélectionnées.', icon: Heart },
  { id: 'countries', label: 'Liste', description: 'Explorez les chaînes par pays.', icon: Globe2 },
  { id: 'settings', label: 'Paramètres', description: 'Préférences et guide d’utilisation.', icon: SettingsIcon },
];

const PAGE_SIZE = 60;

const CHANNEL_PRIORITY = ['canal+ premiere', 'canal+ pop', 'canal+ sport 1', 'canal+ cinema', 'canal+ action', 'canal+ kids', 'canal+ family', 'gulli africa', 'piwi+', 'teletoon+', 'boomerang', 'tiji', 'a+', 'novelas tv', 'tv5monde', 'tf1', 'france 2', 'france 3', 'm6', 'france 24', 'tmc'];
const channelPriority = (name: string): number => {
  const normalized = foldText(name);
  const index = CHANNEL_PRIORITY.findIndex((preferred) => normalized === foldText(preferred) || normalized.startsWith(foldText(preferred) + ' '));
  return index < 0 ? CHANNEL_PRIORITY.length : index;
};

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
  const prog = useMemo(
    () => (activeVariant ? currentProgram(activeVariant, now) : null),
    [activeVariant, now],
  );
  const initials = group.displayName.slice(0, 2).toUpperCase();
  const bgColor = channelColor(group.displayName);

  return (
    <div
      className={`group relative touch-pan-y overflow-hidden rounded-2xl border transition-all duration-300 ${
        selected
          ? 'border-violet-400/45 bg-violet-400/10 ring-1 ring-violet-400/35 shadow-lg shadow-violet-500/10'
          : 'border-white/[0.08] bg-gradient-to-b from-white/[0.04] to-white/[0.01] hover:border-white/20 hover:from-white/[0.07] hover:to-white/[0.02]'
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
            <span className="absolute -bottom-1 -right-1 rounded-full bg-violet-500 px-1.5 py-0.5 text-[8px] font-bold text-white shadow-sm">
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
        </span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        aria-label={favorited ? 'Retirer de mon espace NEAHPLUS' : 'Ajouter à mon espace NEAHPLUS'}
        title={favorited ? 'Dans mon espace NEAHPLUS' : 'Ajouter à mon espace NEAHPLUS'}
        aria-pressed={favorited}
        className={`absolute right-3 top-1/2 -translate-y-1/2 rounded-xl p-2.5 transition-all duration-200 ${
          favorited
            ? 'border border-[#d6ad55]/80 bg-[#d6ad55]/10 text-red-500 shadow-[0_0_12px_rgba(214,173,85,.12)] hover:bg-[#d6ad55]/15'
            : 'border border-[#d6ad55]/45 text-white/35 hover:bg-[#d6ad55]/10 hover:text-[#f0d58a]'
        }`}
      >
        <Heart className="h-4 w-4" fill={favorited ? 'currentColor' : 'none'} aria-hidden="true" />
      </button>
      {resolving && <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md bg-[#06252b]/95 px-2 py-1 text-[9px] font-bold text-[#8af0f0]"><Loader2 className="h-3 w-3 animate-spin" /> Connexion…</span>}
    </div>
  );
};

interface EpgRowProps {
  channel: NeahplusChannel;
  date: Date;
  period: GuidePeriod;
  onPlay: () => void;
  index: number;
  now: number;
  registerRef: (el: HTMLButtonElement | null, index: number) => void;
  channelDisplayName: string;
}

const EpgRow = ({ channel, date, period, onPlay, index, now, registerRef, channelDisplayName }: EpgRowProps) => {
  const programs = useMemo(() => getProgramsForDay(channel, date).filter((program) => {
    const hour = new Date(program.start).getHours();
    if (period === 'morning') return hour >= 5 && hour < 12;
    if (period === 'afternoon') return hour >= 12 && hour < 17;
    if (period === 'early-evening') return hour >= 17 && hour < 19;
    if (period === 'evening') return hour >= 19 && hour < 22;
    if (period === 'night') return hour >= 22 || hour < 5;
    return true;
  }), [channel, date, period]);
  const today = new Date(now);
  const isToday = date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  const current = useMemo(
    () => (isToday ? currentProgram(channel, now) : null),
    [channel, isToday, now],
  );

  return (
    <article className="flex w-full min-w-0 flex-col overflow-hidden rounded-xl border border-white/[0.07] bg-[#121218]">
      <button
        ref={(el) => registerRef(el, index)}
        type="button"
        onClick={onPlay}
        className="flex min-h-[82px] items-center gap-3 border-b border-white/[0.08] bg-white/[0.025] p-3 text-left transition hover:bg-white/[0.06]"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] p-1.5">
          {channel.logo ? (
            <img src={channel.logo} alt="" loading="lazy" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-xs font-black text-white/75">{channel.name.slice(0, 2).toUpperCase()}</span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-bold text-white">{channelDisplayName}</span>
          <span className="mt-1 block text-[10px] text-white/35">{programs.length} programme{programs.length > 1 ? 's' : ''}</span>
          <span className="mt-1 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-amber-300"><Play className="h-2.5 w-2.5 fill-current" /> Regarder</span>
        </span>
      </button>
      <div className="flex min-h-[210px] flex-col gap-1.5 p-2.5">
        {programs.length === 0 ? (
          <p className="py-8 text-center text-xs text-white/35">Programme non disponible.</p>
        ) : programs.slice(0, 12).map((program) => {
          const isCurrent = Boolean(current && program.start === current.start && program.end === current.end);
          const isPast = isToday && Date.parse(program.end) <= now && !isCurrent;
          return (
            <button
              key={`${program.start}-${program.title}`}
              type="button"
              onClick={onPlay}
              className={`rounded-lg border px-2.5 py-2 text-left transition ${isCurrent ? 'border-amber-400/30 bg-amber-400/10' : 'border-transparent bg-white/[0.025] hover:border-white/10 hover:bg-white/[0.06]'} ${isPast ? 'opacity-40' : ''}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className={`text-[10px] font-bold tabular-nums ${isCurrent ? 'text-amber-300' : 'text-white/45'}`}>{formatTime(program.start)}</span>
                {isCurrent && <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[8px] font-black uppercase text-white">En direct</span>}
              </span>
              <span className="mt-1 block line-clamp-2 text-[11px] font-medium leading-4 text-white/85">{program.title}</span>
              <span className="mt-1 block text-[9px] text-white/30">{formatTime(program.start)} – {formatTime(program.end)}</span>
            </button>
          );
        })}
      </div>
    </article>
  );
};

const NeahplusEntryTransition = ({ visible }: { visible: boolean }) => visible ? (
  <div className="pointer-events-auto fixed inset-0 z-[120] grid place-items-center overflow-hidden bg-[#061219] text-center motion-safe:animate-[neahplus-entry_1100ms_ease-in-out_both]" role="status" aria-live="polite" aria-label="Ouverture de NEAHPLUS">
    <style>{'@keyframes neahplus-entry { 0% { opacity: 0; } 14% { opacity: 1; } 78% { opacity: 1; } 100% { opacity: 0; } } @keyframes neahplus-entry-brand { 0% { opacity: 0; transform: translateY(14px) scale(.94); filter: blur(8px); } 32% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); } 76% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); } 100% { opacity: 0; transform: translateY(-8px) scale(1.035); filter: blur(3px); } } @keyframes neahplus-entry-line { 0% { transform: scaleX(0); opacity: .2; } 45% { transform: scaleX(1); opacity: 1; } 100% { transform: scaleX(1); opacity: 0; } }'}</style>
    <div className="pointer-events-none absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 50% 42%, rgba(32,199,199,.26), transparent 38%), linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px)', backgroundSize: 'auto, 42px 42px, 42px 42px' }} />
    <div className="relative px-6 motion-safe:animate-[neahplus-entry-brand_1000ms_cubic-bezier(0.16,1,0.3,1)_both]">
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-[1.6rem] border border-[#55dddd]/30 bg-[#0b2932] shadow-[0_0_65px_rgba(32,199,199,.22)]">
        <Tv className="h-9 w-9 text-[#55dddd]" aria-hidden="true" />
      </div>
      <p className="text-3xl font-black tracking-[0.2em] text-white">NEAH<span className="text-[#55dddd]">PLUS</span></p>
      <p className="mt-3 text-xs font-semibold tracking-[0.18em] text-white/65">VOTRE TÉLÉVISION, VOTRE UNIVERS</p>
      <div className="mx-auto mt-7 h-px w-44 origin-left bg-gradient-to-r from-transparent via-[#55dddd] to-transparent motion-safe:animate-[neahplus-entry-line_850ms_ease-out_both]" />
    </div>
  </div>
) : null;

const NeahplusExperience = () => {
  const location = useLocation();
  const [catalog, setCatalog] = useState<NeahplusCatalog | null>(null);
  const [entryTransitionVisible, setEntryTransitionVisible] = useState(true);
  const [catalogComplete, setCatalogComplete] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resolvingKey, setResolvingKey] = useState<string | null>(null);
  const [zappingDirection, setZappingDirection] = useState<'next' | 'previous' | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<Tab>('home');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMounted, setDrawerMounted] = useState(false);
  const [homeNavigationPhase, setHomeNavigationPhase] = useState<'idle' | 'entering'>('idle');
  const [homePlayerStartDeferred, setHomePlayerStartDeferred] = useState(false);
  const [suppressPlayerEntranceAnimation, setSuppressPlayerEntranceAnimation] = useState(false);
  const [streamReadyGroupKey, setStreamReadyGroupKey] = useState<string | null>(null);
  const [spaceName, setSpaceName] = useState(() => {
    try { return localStorage.getItem('neahplus:space-name') || 'Mon espace NEAHPLUS'; } catch { return 'Mon espace NEAHPLUS'; }
  });
  const [showSpaceRenameDialog, setShowSpaceRenameDialog] = useState(false);
  const [spaceRenameValue, setSpaceRenameValue] = useState('');
  const navigationHistory = useRef<Tab[]>([]);
  const pendingNavigationTimer = useRef<number | null>(null);
  const pendingNavigationFrame = useRef<number | null>(null);
  const homeSelectionLock = useRef(false);
  const pendingViewerScroll = useRef(false);
  const [query, setQuery] = useState('');
  const [country, setCountry] = useState(() => {
    try { return localStorage.getItem('neahplus:country') ?? 'France'; } catch { return 'France'; }
  });
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [activeVariantIndex, setActiveVariantIndex] = useState(0);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [customNames, setCustomNames] = useState<Record<string, string>>({});
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [guideDate, setGuideDate] = useState(() => new Date());
  const [guidePeriod, setGuidePeriod] = useState<GuidePeriod>('all');
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [playerMuted, setPlayerMuted] = useState(false);
  const [playerVolume, setPlayerVolume] = useState(1);
  const handlePlayerAudioStateChange = useCallback((muted: boolean, volume: number) => {
    setPlayerMuted(muted);
    setPlayerVolume(volume);
  }, []);
  const handlePlayerStreamReady = useCallback(() => {
    setZappingDirection(null);
    setStreamReadyGroupKey(selectedGroupKey);
  }, [selectedGroupKey]);
  const [showQuickSearch, setShowQuickSearch] = useState(false);
  const [showChannelList, setShowChannelList] = useState(false);
  const [quickListVisibleCount, setQuickListVisibleCount] = useState(80);
  const [quickListQuery, setQuickListQuery] = useState('');
  const [selectingChannelKey, setSelectingChannelKey] = useState<string | null>(null);
  const channelListRef = useRef<HTMLDivElement>(null);
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const mainContentRef = useRef<HTMLDivElement>(null);
  const playerSectionRef = useRef<HTMLElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const gridFocusIndex = useRef(0);
  const tabButtonsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const navigateTo = useCallback((next: Tab) => {
    setDrawerOpen(false);
    setHomePlayerStartDeferred(false);
    setSuppressPlayerEntranceAnimation(false);
    if (['home', 'favorites', 'countries', 'settings'].includes(next)) {
      setSelectedGroupKey(null);
    }
    if (pendingNavigationFrame.current !== null) {
      window.cancelAnimationFrame(pendingNavigationFrame.current);
      pendingNavigationFrame.current = null;
    }
    if (pendingNavigationTimer.current !== null) {
      window.clearTimeout(pendingNavigationTimer.current);
      pendingNavigationTimer.current = null;
      setHomeNavigationPhase('idle');
    }
    homeSelectionLock.current = false;
    if (next === tab) return;
    navigationHistory.current.push(tab);
    setTab(next);
  }, [tab]);

  const goBack = useCallback(() => {
    setDrawerOpen(false);
    setHomePlayerStartDeferred(false);
    setSuppressPlayerEntranceAnimation(false);
    if (pendingNavigationFrame.current !== null) {
      window.cancelAnimationFrame(pendingNavigationFrame.current);
      pendingNavigationFrame.current = null;
    }
    if (pendingNavigationTimer.current !== null) {
      window.clearTimeout(pendingNavigationTimer.current);
      pendingNavigationTimer.current = null;
      setHomeNavigationPhase('idle');
    }
    homeSelectionLock.current = false;
    const previous = navigationHistory.current.pop();
    setSelectedGroupKey(null);
    setTab(previous ?? 'home');
  }, []);

  useEffect(() => {
    return () => {
      if (pendingNavigationFrame.current !== null) window.cancelAnimationFrame(pendingNavigationFrame.current);
      if (pendingNavigationTimer.current !== null) window.clearTimeout(pendingNavigationTimer.current);
    };
  }, []);

  // Après une sélection depuis l'accueil, positionner le lecteur tout en haut
  // une fois que React a réellement affiché l'écran de visualisation.
  useLayoutEffect(() => {
    if (!pendingViewerScroll.current || tab !== 'all' || !selectedGroupKey) return;
    const main = mainContentRef.current;
    const player = playerSectionRef.current;
    if (main) main.scrollTop = 0;
    if (player) player.scrollTop = 0;
    pendingViewerScroll.current = false;
  }, [tab, selectedGroupKey]);

  useEffect(() => {
    try { localStorage.setItem('neahplus:country', country); } catch { /* stockage local indisponible */ }
  }, [country]);

  useEffect(() => {
    try { localStorage.setItem('neahplus:space-name', spaceName); } catch { /* stockage local indisponible */ }
  }, [spaceName]);

  useEffect(() => {
    if (drawerOpen) {
      setDrawerMounted(true);
      return;
    }
    if (!drawerMounted) return;
    const timer = window.setTimeout(() => setDrawerMounted(false), 220);
    return () => window.clearTimeout(timer);
  }, [drawerOpen, drawerMounted]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!location.pathname.endsWith('/neahplus')) {
      setEntryTransitionVisible(false);
      return;
    }
    setEntryTransitionVisible(true);
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const timer = window.setTimeout(() => setEntryTransitionVisible(false), reducedMotion ? 80 : 1100);
    return () => window.clearTimeout(timer);
  }, [location.key, location.pathname]);

  useEffect(() => {
    const controller = new AbortController();
    setLoadError(null);
    setCatalog(null);
    setCatalogComplete(false);
    loadNeahplusCatalog(controller.signal, (partial) => {
      if (!controller.signal.aborted) setCatalog(partial);
    })
      .then((data) => {
        if (!controller.signal.aborted) {
          setCatalog(data);
          setCatalogComplete(true);
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(err instanceof Error ? err.message : 'Catalogue indisponible');
      });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    setFavorites(loadFavorites());
    setCustomNames(loadChannelDisplayNames());
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

  const channelsForCountry = useMemo(() => {
    const channels = catalog?.channels ?? [];
    if (!country) return channels;
    return channels.filter((channel) =>
      channel.countries.includes(country) || (country === 'France' && channel.countries.length === 0)
    );
  }, [catalog, country]);

  const baseRealGroups = useMemo(() => groupChannelVariants(catalog?.channels ?? []), [catalog]);
  const realGroups = useMemo(
    () => baseRealGroups.map((group) => ({ ...group, displayName: customNames[group.key] || group.displayName })),
    [baseRealGroups, customNames],
  );
  const allGroups = useMemo(
    () => [...realGroups, ...historicalChannelsWithoutDuplicates(baseRealGroups)],
    [realGroups, baseRealGroups],
  );
  const groupByKey = useMemo(
    () => new Map(allGroups.map((group) => [group.key, group])),
    [allGroups],
  );
  const groupByChannelId = useMemo(
    () => indexChannelGroupsByChannelId(allGroups),
    [allGroups],
  );
  const displayNamesByChannelId = useMemo(
    () => new Map<string, string>([...groupByChannelId].map(([id, group]) => [id, group.displayName] as const)),
    [groupByChannelId],
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
    if (catalog && country && !catalog.countries.some((item) => item.name === country)) {
      setCountry(catalog.countries.some((item) => item.name === 'France') ? 'France' : '');
    }
  }, [catalog, country]);

  const filteredGroups = useMemo(() => {
    const needle = foldText(query.trim());
    const base = tab === 'favorites'
      ? allGroups.filter((g) => favorites.has(g.key))
      : allGroups;

    return base.filter((g) => {
      if (country && tab !== 'world' && !groupMatchesCountry(g, country)) return false;
      if (needle && !foldText(g.displayName).includes(needle) && !g.variants.some((variant) => foldText(variant.name).includes(needle))) return false;
      return true;
    }).sort((a, b) => Number(b.countries.includes('France')) - Number(a.countries.includes('France')) || channelPriority(a.displayName) - channelPriority(b.displayName) || a.displayName.localeCompare(b.displayName, 'fr'));
  }, [allGroups, country, query, tab, favorites]);

  const visibleGroups = useMemo(
    () => filteredGroups.slice(0, visibleCount),
    [filteredGroups, visibleCount],
  );

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query, country, tab]);

  const selectedGroup = selectedGroupKey ? groupByKey.get(selectedGroupKey) ?? null : null;
  const activeVariant = selectedGroup?.variants[activeVariantIndex] ?? null;

  const activeProgram = useMemo(
    () => (activeVariant ? currentProgram(activeVariant, now) : null),
    [activeVariant, now],
  );


  const carouselGroups = useMemo(() => {
    return allGroups
      .filter((g) => g.hasStream && g.variants.length > 0)
      .sort((a, b) => Number(b.countries.includes('France')) - Number(a.countries.includes('France')) || channelPriority(a.displayName) - channelPriority(b.displayName) || a.displayName.localeCompare(b.displayName, 'fr'));
  }, [allGroups]);

  const quickListFilteredGroups = useMemo(() => {
    const needle = foldText(quickListQuery.trim());
    if (!needle) return carouselGroups;
    return carouselGroups.filter((group) => foldText(group.displayName).includes(needle) || group.variants.some((variant) => foldText(variant.name).includes(needle)));
  }, [carouselGroups, quickListQuery]);

  // Précharger progressivement les trois chaînes voisines de chaque côté.
  // Le cache du résolveur déduplique les demandes déjà lancées par le lecteur.
  useEffect(() => {
    // Prioriser le flux choisi depuis l'accueil avant les préchargements voisins.
    // Ne pas concurrencer la première résolution du flux sélectionné.
    if (homeNavigationPhase === 'entering' || !selectedGroupKey || resolvingKey === selectedGroupKey || streamReadyGroupKey !== selectedGroupKey || carouselGroups.length < 2) return undefined;
    const controller = new AbortController();
    const currentIndex = carouselGroups.findIndex((group) => group.key === selectedGroupKey);
    if (currentIndex < 0) return undefined;

    const neighbors = [1, -1, 2, -2, 3, -3]
      .map((offset) => carouselGroups[(currentIndex + offset + carouselGroups.length) % carouselGroups.length])
      .filter((group, index, groups) => Boolean(group?.variants[0]) && groups.findIndex((item) => item.key === group.key) === index);

    const prefetchNeighbors = async () => {
      const queue = [...neighbors];
      const worker = async () => {
        while (queue.length > 0 && !controller.signal.aborted) {
          const group = queue.shift();
          const variant = group?.variants[0];
          if (!variant) continue;
          try {
            await resolveNeahplusStream(variant.id, controller.signal);
          } catch {
            if (controller.signal.aborted) return;
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, queue.length) }, () => worker()));
    };

    void prefetchNeighbors();
    return () => controller.abort();
  }, [selectedGroupKey, carouselGroups, homeNavigationPhase, resolvingKey, streamReadyGroupKey]);

  useEffect(() => { setQuickListVisibleCount(80); }, [quickListQuery]);

  const resolvingRef = useRef<AbortController | null>(null);

  const resolveBestVariant = useCallback(async (group: ChannelGroup, preferredIndex = 0) => {
    resolvingRef.current?.abort();
    if (group.variants.length === 0) {
      setResolvingKey(null);
      return;
    }
    const controller = new AbortController();
    resolvingRef.current = controller;
    setResolvingKey(group.key);

    for (let offset = 0; offset < group.variants.length; offset += 1) {
      const index = (preferredIndex + offset) % group.variants.length;
      if (controller.signal.aborted) return;
      try {
        await resolveNeahplusStream(group.variants[index].id, controller.signal);
        if (controller.signal.aborted) return;
        setActiveVariantIndex(index);
        setResolvingKey(null);
        return;
      } catch {
      }
    }

    if (!controller.signal.aborted) {
      setActiveVariantIndex(preferredIndex);
      setResolvingKey(null);
    }
  }, []);

  const handleSelectGroup = useCallback((group: ChannelGroup, directionOverride?: 'next' | 'previous' | null) => {
    setSuppressPlayerEntranceAnimation(false);
    const currentIndex = carouselGroups.findIndex((item) => item.key === selectedGroupKey);
    const targetIndex = carouselGroups.findIndex((item) => item.key === group.key);
    setZappingDirection(directionOverride ?? (currentIndex >= 0 && targetIndex >= 0 && currentIndex !== targetIndex ? (targetIndex > currentIndex ? 'next' : 'previous') : null));
    setSelectedGroupKey(group.key);
    setActiveVariantIndex(0);
    window.requestAnimationFrame(() => {
      mainContentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      playerSectionRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    });
    // Déclencher la détection dès le toucher, même si la chaîne n'a qu'une seule source.
    if (group.variants.length > 0) void resolveBestVariant(group);
  }, [resolveBestVariant, selectedGroupKey, carouselGroups]);

  // À l'ouverture de « Mon espace », sélectionner une chaîne favorite par défaut.
  // Une chaîne choisie depuis « Plus » reste toutefois sélectionnée même si elle
  // n'est pas favorite : elle est temporairement lisible sans être enregistrée.
  useEffect(() => {
    if (tab !== 'favorites' || selectedGroupKey !== null) return;
    const firstFavorite = carouselGroups.find((group) => favorites.has(group.key));
    if (firstFavorite) handleSelectGroup(firstFavorite);
  }, [tab, carouselGroups, favorites, selectedGroupKey, handleSelectGroup]);

  // Navigation matérielle PageUp/PageDown entre les chaînes disponibles.
  const cycleChannel = useCallback((direction: 1 | -1) => {
    if (carouselGroups.length === 0) return;
    const currentIndex = carouselGroups.findIndex((group) => group.key === selectedGroupKey);
    const startIndex = currentIndex < 0 ? (direction > 0 ? -1 : 0) : currentIndex;
    const nextIndex = (startIndex + direction + carouselGroups.length) % carouselGroups.length;
    handleSelectGroup(carouselGroups[nextIndex], direction > 0 ? 'next' : 'previous');
  }, [carouselGroups, selectedGroupKey, handleSelectGroup]);

  const handleSelectChannel = useCallback((channel: NeahplusChannel, scrollToTop = true, resolveStream = true) => {
    setSuppressPlayerEntranceAnimation(false);
    const group = groupByChannelId.get(channel.id);
    if (!group) return;
    const vIdx = group.variants.findIndex((v) => v.id === channel.id);
    const currentIndex = carouselGroups.findIndex((item) => item.key === selectedGroupKey);
    const targetIndex = carouselGroups.findIndex((item) => item.key === group.key);
    setZappingDirection(currentIndex >= 0 && targetIndex >= 0 && currentIndex !== targetIndex ? (targetIndex > currentIndex ? 'next' : 'previous') : null);
    setSelectedGroupKey(group.key);
    setActiveVariantIndex(vIdx >= 0 ? vIdx : 0);
    if (resolveStream) {
      void resolveBestVariant(group, vIdx >= 0 ? vIdx : 0);
    } else {
      resolvingRef.current?.abort();
      resolvingRef.current = null;
      setResolvingKey(null);
    }
    if (scrollToTop) {
      window.requestAnimationFrame(() => {
        mainContentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        playerSectionRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  }, [groupByChannelId, resolveBestVariant, carouselGroups, selectedGroupKey]);

  const openChannelFromHome = useCallback((channel: NeahplusChannel) => {
    if (homeSelectionLock.current) return;
    const group = groupByChannelId.get(channel.id);
    if (!group) return;
    homeSelectionLock.current = true;
    preloadNeahplusPlayer();
    if (pendingNavigationTimer.current !== null) window.clearTimeout(pendingNavigationTimer.current);
    if (pendingNavigationFrame.current !== null) window.cancelAnimationFrame(pendingNavigationFrame.current);
    setHomeNavigationPhase('entering');
    if (tab !== 'all') navigationHistory.current.push(tab);

    // Sélectionner et afficher le lecteur immédiatement, sans lancer le réseau.
    handleSelectChannel(channel, false, false);
    setSuppressPlayerEntranceAnimation(true);
    setHomePlayerStartDeferred(true);
    pendingViewerScroll.current = true;
    setTab('all');

    // Laisser une image complète à l'écran avant de démarrer la résolution du flux.
    pendingNavigationFrame.current = window.requestAnimationFrame(() => {
      pendingNavigationFrame.current = window.requestAnimationFrame(() => {
        pendingNavigationFrame.current = null;
        setHomePlayerStartDeferred(false);
        const preferredIndex = group.variants.findIndex((variant) => variant.id === channel.id);
        void resolveBestVariant(group, preferredIndex >= 0 ? preferredIndex : 0);
      });
    });

    pendingNavigationTimer.current = window.setTimeout(() => {
      setHomeNavigationPhase('idle');
      pendingNavigationTimer.current = null;
      homeSelectionLock.current = false;
    }, 360);
  }, [groupByChannelId, handleSelectChannel, resolveBestVariant, tab]);

  const isFavoriteChannel = useCallback((channel: NeahplusChannel) => {
    const group = groupByChannelId.get(channel.id);
    return Boolean(group && favorites.has(group.key));
  }, [groupByChannelId, favorites]);

  const toggleFavoriteChannel = useCallback((channel: NeahplusChannel) => {
    const group = groupByChannelId.get(channel.id);
    if (group) toggleFavorite(group.key);
  }, [groupByChannelId, toggleFavorite]);

  const homeChannels = useMemo(() => {
    if (tab !== 'favorites') return channelsForCountry;
    return allGroups
      .filter((group) => favorites.has(group.key) && group.variants.length > 0)
      .flatMap((group) => group.variants[0] ? [group.variants[0]] : []);
  }, [tab, channelsForCountry, allGroups, favorites]);

  const saveSpaceName = useCallback(() => {
    const nextName = spaceRenameValue.trim().slice(0, 32);
    setSpaceName(nextName || 'Mon espace NEAHPLUS');
    setShowSpaceRenameDialog(false);
  }, [spaceRenameValue]);

  const saveSelectedChannelName = useCallback(() => {
    if (!selectedGroup) return;
    const nextName = renameValue.trim().slice(0, 48);
    setCustomNames((previous) => {
      const next = { ...previous };
      const originalName = baseRealGroups.find((group) => group.key === selectedGroup.key)?.displayName ?? selectedGroup.displayName;
      if (!nextName || foldText(nextName) === foldText(originalName)) delete next[selectedGroup.key];
      else next[selectedGroup.key] = nextName;
      saveChannelDisplayNames(next);
      return next;
    });
    setShowRenameDialog(false);
  }, [selectedGroup, renameValue, baseRealGroups]);

  const scrollChannelList = useCallback((direction: 1 | -1) => {
    channelListRef.current?.scrollBy({ top: direction * 220, behavior: 'smooth' });
  }, []);

  const openChannelList = useCallback(() => {
    setQuickListQuery('');
    const selectedIndex = carouselGroups.findIndex((group) => group.key === selectedGroupKey);
    setQuickListVisibleCount((count) => Math.max(count, selectedIndex + 1, 80));
    setShowChannelList(true);
    window.requestAnimationFrame(() => {
      channelListRef.current?.querySelector<HTMLButtonElement>('[aria-current="true"]')?.focus();
    });
  }, [carouselGroups, selectedGroupKey]);

  const cycleVariant = useCallback((direction: 1 | -1) => {
    if (!selectedGroup || selectedGroup.variants.length <= 1) return;
    setActiveVariantIndex((prev) => {
      const len = selectedGroup.variants.length;
      return (prev + direction + len) % len;
    });
  }, [selectedGroup]);

  const epgChannels = useMemo(() => {
    if (!catalog) return [];
    const needle = foldText(query.trim());
    return channelsWithEpg(catalog.channels)
      .filter((channel) => !country || channel.countries.includes(country) || (country === 'France' && channel.countries.length === 0))
      .filter((channel) => !needle || foldText(displayNamesByChannelId.get(channel.id) ?? channel.name).includes(needle) || foldText(channel.name).includes(needle))
      .sort((a, b) => Number(b.countries.includes('France')) - Number(a.countries.includes('France')) || channelPriority(a.name) - channelPriority(b.name) || a.name.localeCompare(b.name, 'fr'))
      .slice(0, 200);
  }, [catalog, query, country, displayNamesByChannelId]);

  const epgVisible = useMemo(
    () => epgChannels.slice(0, visibleCount),
    [epgChannels, visibleCount],
  );

  const registerRef = useCallback((el: HTMLButtonElement | null, index: number) => {
    itemRefs.current[index] = el;
  }, []);

  type KeyboardContext = {
    drawerOpen: boolean;
    showInfoPanel: boolean;
    showQuickSearch: boolean;
    tab: Tab;
    epgVisible: NeahplusChannel[];
    visibleGroups: ChannelGroup[];
    activeVariant: NeahplusChannel | null;
    catalog: NeahplusCatalog | null;
    selectedGroup: ChannelGroup | null;
    cycleVariant: (direction: 1 | -1) => void;
    cycleChannel: (direction: 1 | -1) => void;
  };

  const keyboardContextRef = useRef<KeyboardContext>({
    drawerOpen: false,
    showInfoPanel: false,
    showQuickSearch: false,
    tab: 'home',
    epgVisible: [],
    visibleGroups: [],
    activeVariant: null,
    catalog: null,
    selectedGroup: null,
    cycleVariant: () => undefined,
    cycleChannel: () => undefined,
  });

  keyboardContextRef.current = {
    drawerOpen,
    showInfoPanel,
    showQuickSearch,
    tab,
    epgVisible,
    visibleGroups,
    activeVariant,
    catalog,
    selectedGroup,
    cycleVariant,
    cycleChannel,
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
        setDrawerOpen(true);
        window.setTimeout(() => tabButtonsRef.current[clamped]?.focus(), 0);
      };

      if (isInInput && e.key !== 'Escape') return;

      if (e.key === 'Escape') {
        if (context.drawerOpen) {
          e.preventDefault();
          setDrawerOpen(false);
          return;
        }
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
          if (context.selectedGroup) context.cycleChannel(-1);
          else focusGridItem(gridFocusIndex.current - 10);
          break;
        case 'PageDown':
        case 'ChannelDown':
          e.preventDefault();
          if (context.selectedGroup) context.cycleChannel(1);
          else focusGridItem(gridFocusIndex.current + 10);
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
      // Garder le focus clavier sans déplacer la page vers la grille sous le lecteur.
      itemRefs.current[0]?.focus({ preventScroll: true });
    }, 50);
    return () => clearTimeout(timer);
  }, [tab]);

  if (entryTransitionVisible) {
    return (
      <div className="relative flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-[#061219]">
        <NeahplusEntryTransition visible />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="relative flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
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
        <NeahplusEntryTransition visible={entryTransitionVisible} />
      </div>
    );
  }

  if (!catalog) {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-hidden bg-[radial-gradient(ellipse_at_50%_42%,#123943_0%,#091d25_42%,#061219_100%)] p-6 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#55dddd] motion-reduce:animate-none" aria-hidden="true" />
        <p className="text-sm text-white/65">Préparation de votre univers NEAHPLUS…</p>
        <NeahplusEntryTransition visible={entryTransitionVisible} />
      </div>
    );
  }

  const variantLabel = (variant: NeahplusChannel, baseName: string): string => {
    const suffix = variant.name.replace(baseName, '').trim();
    return suffix || `Source`;
  };

  return (
    <div className="relative flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-[#07171d] text-white">
      <style>{'@keyframes neahplus-overlay-in { from { opacity: 0; } to { opacity: 1; } } @keyframes neahplus-overlay-out { from { opacity: 1; } to { opacity: 0; } } @keyframes neahplus-drawer-in { from { opacity: 0; transform: translate3d(12px,-6px,0) scale(.98); } to { opacity: 1; transform: translate3d(0,0,0) scale(1); } } @keyframes neahplus-drawer-out { from { opacity: 1; transform: translate3d(0,0,0) scale(1); } to { opacity: 0; transform: translate3d(10px,-4px,0) scale(.985); } } @keyframes neahplus-page-in { from { opacity: 0.88; transform: translate3d(0,4px,0); } to { opacity: 1; transform: translate3d(0,0,0); } } @keyframes neahplus-player-in { from { opacity: 0; transform: translate3d(0,16px,0) scale(.992); filter: blur(5px); } 65% { opacity: .85; filter: blur(1px); } to { opacity: 1; transform: translate3d(0,0,0) scale(1); filter: blur(0); } } @keyframes neahplus-viewer-enter { from { opacity: .94; transform: translate3d(0,7px,0); } to { opacity: 1; transform: translate3d(0,0,0); } }'}</style>
      {/* Top navigation bar */}
      <nav className="relative z-50 flex shrink-0 items-center gap-3 border-b border-white/[0.06] bg-[#0b2028]/95 px-3 py-2.5 backdrop-blur-xl sm:px-5" aria-label="Navigation NEAHPLUS TV">
        {((tab !== 'home') || navigationHistory.current.length > 0) && (
          <button type="button" onClick={goBack} aria-label="Retour" title="Revenir à la page précédente" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/70 transition hover:border-[#20c7c7]/40 hover:bg-white/10 hover:text-white">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#20c7c7] to-[#087b83] shadow-lg shadow-[#20c7c7]/15">
            <Tv className="h-4 w-4 text-[#061519]" aria-hidden="true" />
          </div>
          <span className="text-sm font-black tracking-tight text-white">NEAH<span className="text-[#55dddd]">PLUS</span></span>
        </div>
        <div className="ml-auto">
          <button type="button" onClick={() => setDrawerOpen((open) => !open)} aria-expanded={drawerOpen} aria-controls="neahplus-navigation-drawer" aria-label={drawerOpen ? 'Fermer le menu NEAHPLUS' : 'Ouvrir le menu NEAHPLUS'} className="relative inline-flex items-center gap-2 rounded-xl border border-[#20c7c7]/25 bg-[#20c7c7]/[0.08] px-3.5 py-2 text-xs font-bold text-[#8af0f0] shadow-[0_0_22px_rgba(32,199,199,.06)] transition hover:border-[#20c7c7]/50 hover:bg-[#20c7c7]/15">
            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-[#0b2028] bg-[#55dddd] shadow-[0_0_10px_rgba(85,221,221,.7)]" />
            <Menu className="h-4 w-4" aria-hidden="true" />
            <span>Menu</span>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${drawerOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </nav>
      {drawerMounted && (
        <>
          <button type="button" aria-label="Fermer le menu" onClick={() => setDrawerOpen(false)} className={`fixed inset-0 z-[80] bg-black/25 backdrop-blur-[1px] motion-safe:${drawerOpen ? 'animate-[neahplus-overlay-in_220ms_ease-out_both]' : 'animate-[neahplus-overlay-out_220ms_ease-in_both]'}`} />
          <aside id="neahplus-navigation-drawer" className={`fixed right-3 top-[4.25rem] z-[90] w-[min(17rem,48vw)] max-h-[70vh] overflow-y-auto rounded-2xl border border-[#20c7c7]/20 bg-[#0b2028]/[0.98] p-3 shadow-[0_18px_55px_rgba(0,0,0,.55)] backdrop-blur-2xl motion-safe:${drawerOpen ? 'animate-[neahplus-drawer-in_300ms_cubic-bezier(0.22,1,0.36,1)_both]' : 'animate-[neahplus-drawer-out_220ms_ease-in_both]'}`} aria-label="Menu principal NEAHPLUS">
            <div className="mb-2 flex items-center justify-between px-1.5 py-1">
              <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#55dddd]">Navigation</p><p className="mt-0.5 text-xs text-white/45">Votre univers NEAHPLUS</p></div>
              <button type="button" onClick={() => setDrawerOpen(false)} aria-label="Fermer" className="rounded-lg p-1.5 text-white/45 transition hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex flex-col gap-1.5">
              {TABS.map(({ id, label, description, icon: Icon }, i) => (
                <button key={id} ref={(el) => { tabButtonsRef.current[i] = el; }} type="button" onClick={() => navigateTo(id)} aria-current={tab === id ? 'page' : undefined} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${tab === id ? 'border-[#20c7c7]/35 bg-[#20c7c7]/10 text-white' : 'border-transparent text-white/75 hover:border-white/10 hover:bg-white/[0.05]'}`}>
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tab === id ? 'bg-[#20c7c7]/15 text-[#70e5e5]' : 'bg-white/[0.06] text-white/55'}`}><Icon className="h-4 w-4" aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{label}</span><span className="mt-0.5 block text-[10px] text-white/40">{description}</span></span>
                  {tab === id && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#55dddd]" />}
                </button>
              ))}
            </div>
            <p className="mt-2 border-t border-white/[0.06] px-1.5 pt-2 text-[10px] text-white/30">Choisissez une rubrique pour continuer.</p>
          </aside>
        </>
      )}
      {!catalogComplete && (
        <div className="flex shrink-0 items-center justify-center gap-2 border-b border-[#20c7c7]/10 bg-[#0b2028] px-3 py-1.5 text-[10px] font-medium text-[#8bdede]/70" role="status">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#55dddd]" />
          NEAHPLUS prépare la suite de votre sélection…
        </div>
      )}

      {/* Main content area */}
      <div ref={mainContentRef} data-lenis-prevent className="relative flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain touch-pan-y lg:flex-row lg:overflow-hidden" style={{ WebkitOverflowScrolling: "touch" }}>
        {/* Compact text-only channel list */}
        {showChannelList && (
          <aside id="neahplus-quick-channel-list" className="absolute inset-y-0 left-0 z-40 flex w-[min(17rem,72vw)] flex-col border-r border-[#20c7c7]/20 bg-[#081c25] shadow-[0_18px_55px_rgba(0,0,0,.55)] animate-in fade-in slide-in-from-left-2 duration-150 lg:relative lg:z-0 lg:w-56 lg:shrink-0 lg:shadow-none" aria-label="Liste rapide des chaînes">
            <div className="flex items-center justify-between border-b border-[#20c7c7]/20 bg-[#0b2932]/75 px-3 py-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-white/90">Liste des chaînes</h2>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => scrollChannelList(-1)} aria-label="Monter dans la liste des chaînes" title="Monter dans la liste" className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#20c7c7]/35 text-[#8af0f0] transition duration-150 hover:border-[#55dddd] hover:bg-[#20c7c7]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#55dddd]"><ChevronUp className="h-4 w-4" /></button>
                <button type="button" onClick={() => scrollChannelList(1)} aria-label="Descendre dans la liste des chaînes" title="Descendre dans la liste" className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#20c7c7]/35 text-[#8af0f0] transition duration-150 hover:border-[#55dddd] hover:bg-[#20c7c7]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#55dddd]"><ChevronDown className="h-4 w-4" /></button>
                <button type="button" onClick={() => setShowChannelList(false)} aria-label="Fermer la liste" className="rounded-lg border border-transparent p-1.5 text-white/55 transition duration-150 hover:border-[#20c7c7]/35 hover:bg-[#20c7c7]/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#55dddd]"><X className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="shrink-0 border-b border-[#20c7c7]/10 px-3 py-2">
              <label className="relative block">
                <span className="sr-only">Rechercher dans la liste des chaînes</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8af0f0]/55" aria-hidden="true" />
                <input type="search" value={quickListQuery} onChange={(event) => setQuickListQuery(event.target.value)} placeholder="Rechercher une chaîne…" aria-label="Rechercher dans la liste des chaînes" className="w-full rounded-xl border border-[#20c7c7]/20 bg-[#061820] py-2.5 pl-9 pr-3 text-xs text-white placeholder:text-white/35 outline-none transition focus:border-[#55dddd]/70 focus:ring-2 focus:ring-[#20c7c7]/15" />
              </label>
            </div>
            <div ref={channelListRef} className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-2 [scrollbar-width:thin]" data-lenis-prevent onKeyDown={(event) => {
              if (event.key === 'ArrowDown') { event.preventDefault(); const next = (event.target as HTMLElement).closest('li')?.nextElementSibling?.querySelector('button') as HTMLButtonElement | null; next?.focus(); next?.scrollIntoView({ block: 'nearest' }); }
              if (event.key === 'ArrowUp') { event.preventDefault(); const previous = (event.target as HTMLElement).closest('li')?.previousElementSibling?.querySelector('button') as HTMLButtonElement | null; previous?.focus(); previous?.scrollIntoView({ block: 'nearest' }); }
            }}>
              <ul className="space-y-0.5">
                {quickListFilteredGroups.slice(0, quickListVisibleCount).map((group) => {
                  const isSelected = group.key === selectedGroupKey;
                  const isSelecting = group.key === selectingChannelKey;
                  return (
                    <li key={group.key}>
                      <button type="button" onClick={() => {
                        setSelectingChannelKey(group.key);
                        handleSelectGroup(group);
                        window.setTimeout(() => { setShowChannelList(false); setSelectingChannelKey(null); }, 360);
                      }} aria-current={isSelected ? 'true' : undefined} aria-busy={isSelecting} className={"flex w-full items-center gap-2 rounded-lg border px-2 py-2 text-left text-xs transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#55dddd] " + (isSelecting ? 'border-[#55dddd]/55 bg-[#20c7c7]/15 text-[#a5ffff]' : isSelected ? 'border-[#20c7c7]/30 bg-[#20c7c7]/10 font-bold text-[#8af0f0]' : 'border-transparent font-medium text-white/65 hover:border-[#20c7c7]/35 hover:bg-[#20c7c7]/10 hover:text-white active:border-[#55dddd] active:bg-[#20c7c7]/20')}>
                        <span className="flex w-4 shrink-0 items-center justify-center text-[#8af0f0]">{isSelecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isSelected ? '✓' : ''}</span>
                        <span className="min-w-0 flex-1 truncate">{group.displayName}</span>
                        {isSelecting && <span className="shrink-0 text-[9px] font-semibold text-[#8af0f0]">Chargement…</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {quickListFilteredGroups.length === 0 ? <p className="px-2 py-5 text-center text-[11px] text-white/40">Aucune chaîne trouvée.</p> : null}
              {quickListVisibleCount < quickListFilteredGroups.length && (
                <button type="button" onClick={() => setQuickListVisibleCount((count) => Math.min(count + 80, quickListFilteredGroups.length))} className="mt-2 w-full rounded-lg border border-[#20c7c7]/25 bg-[#20c7c7]/[0.06] px-3 py-2.5 text-[10px] font-bold text-[#8af0f0] transition hover:border-[#55dddd]/60 hover:bg-[#20c7c7]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#55dddd]">Afficher 80 chaînes supplémentaires</button>
              )}
            </div>
          </aside>
        )}
        {/* Overlay for mobile channel list */}
        {showChannelList && <button type="button" aria-label="Fermer la liste des chaînes" onClick={() => setShowChannelList(false)} className="absolute inset-0 z-30 bg-black/55 lg:hidden" />}
        
                {/* Left: Player + info */}
        <section ref={playerSectionRef} className={`${homeNavigationPhase === 'entering' || suppressPlayerEntranceAnimation ? '' : 'motion-safe:animate-[neahplus-player-in_420ms_cubic-bezier(0.22,1,0.36,1)_both]'} flex min-h-max w-full flex-none touch-pan-y flex-col gap-3 overflow-visible p-3 lg:min-h-0 lg:max-h-full lg:w-[42%] lg:max-w-[720px] lg:overflow-y-auto lg:overscroll-y-contain lg:p-4 ${['home', 'countries', 'settings'].includes(tab) ? 'hidden' : ''}`} style={{ WebkitOverflowScrolling: 'touch' }}>
          {activeVariant && selectedGroup ? (
            <>
              <div className="group relative mx-auto w-full max-w-[720px]">
                <div className="mb-2 flex items-center justify-end gap-1.5">
                  <button type="button" onClick={() => showChannelList ? setShowChannelList(false) : openChannelList()} aria-expanded={showChannelList} aria-controls="neahplus-quick-channel-list" className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#55dddd] ${showChannelList ? 'border-[#55dddd] bg-[#20c7c7]/20 text-[#a5ffff] shadow-[0_0_16px_rgba(32,199,199,.18)]' : 'border-[#20c7c7]/35 text-white/80 hover:border-[#55dddd] hover:bg-[#20c7c7]/15 hover:text-white active:border-[#55dddd] active:bg-[#20c7c7]/25'}`}><ListVideo className="h-3.5 w-3.5" /> Liste des chaînes</button>
                </div>
                <NeahplusPlayer
                  isActive={Boolean(selectedGroupKey) && !homePlayerStartDeferred}
                  streamUrl={null}
                  direction={zappingDirection}
                  onStreamReady={handlePlayerStreamReady}
                  channelId={activeVariant.id}
                  channelName={selectedGroup.displayName}
                  muted={playerMuted}
                  volume={playerVolume}
                  onAudioStateChange={handlePlayerAudioStateChange}
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
                    <p className="mt-0.5 text-[10px] text-amber-300/70 tabular-nums">
                      {formatTime(activeProgram.start)} – {formatTime(activeProgram.end)}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPlayerMuted((current) => !current)}
                    aria-label={playerMuted ? 'Activer le son' : 'Couper le son'}
                    title={playerMuted ? 'Activer le son' : 'Couper le son'}
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-white/65 transition hover:bg-white/10 hover:text-white"
                  >
                    {playerMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={playerMuted ? 0 : playerVolume}
                    onChange={(event) => {
                      const nextVolume = Number(event.target.value);
                      setPlayerVolume(nextVolume);
                      setPlayerMuted(nextVolume === 0);
                    }}
                    aria-label="Volume"
                    title="Volume"
                    className="h-1 w-16 cursor-pointer appearance-none rounded-full bg-white/25 accent-[#55dddd]"
                  />
                  <button
                    type="button"
                    onClick={() => navigateTo('guide')}
                    aria-label="Ouvrir le guide TV"
                    title="Guide TV"
                    className="flex h-9 items-center justify-center rounded-xl bg-white/5 px-2.5 text-[10px] font-bold tracking-wide text-white/65 transition hover:bg-white/10 hover:text-white"
                  >
                    GUIDE
                  </button>
                  <button
                    type="button"
                    onClick={() => { setRenameValue(selectedGroup.displayName); setShowRenameDialog(true); }}
                    aria-label="Personnaliser le nom de la chaîne"
                    title="Personnaliser le nom"
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowInfoPanel(true)}
                    aria-label="Informations programme"
                    title="Informations programme"
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white"
                  >
                    <Info className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleFavorite(selectedGroup.key)}
                    aria-label={favorites.has(selectedGroup.key) ? 'Retirer de mon espace NEAHPLUS' : 'Ajouter à mon espace NEAHPLUS'}
                    aria-pressed={favorites.has(selectedGroup.key)}
                    className={`flex h-9 w-9 items-center justify-center rounded-xl transition ${
                      favorites.has(selectedGroup.key)
                        ? 'border border-[#d6ad55]/80 bg-[#d6ad55]/10 text-red-500 hover:bg-[#d6ad55]/15'
                        : 'border border-[#d6ad55]/45 bg-white/[0.03] text-white/45 hover:bg-[#d6ad55]/10 hover:text-[#f0d58a]'
                    }`}
                  >
                    <Heart className="h-4 w-4" fill={favorites.has(selectedGroup.key) ? 'currentColor' : 'none'} />
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
                <ListVideo className="h-4 w-4" />
                Ouvrir la liste des chaînes
              </button>
            </div>
          )}

          {/* Channel carousel: favorites only in Mon espace, full catalog elsewhere */}
          <ChannelCarousel
            groups={tab === 'favorites'
              ? carouselGroups.filter((group) => favorites.has(group.key))
              : carouselGroups}
            selectedKey={selectedGroupKey}
            favoritedKeys={favorites}
            onSelectGroup={handleSelectGroup}
            onToggleFavorite={toggleFavorite}
            onOpenMore={tab === 'favorites' ? () => setShowChannelList(true) : undefined}
          />
        </section>

        {/* Right: Browse / Guide / Home */}
        <section key={tab} data-lenis-prevent className={`flex min-h-max w-full min-w-0 flex-none flex-col overflow-x-clip overflow-y-visible overscroll-y-contain touch-pan-y motion-safe:animate-[neahplus-page-in_160ms_ease-out_both] lg:min-h-0 lg:flex-1 lg:overflow-x-hidden lg:overflow-y-auto ${['home', 'favorites', 'countries', 'settings'].includes(tab) ? 'w-full' : 'lg:border-l lg:border-white/[0.06]'} ${tab === 'favorites' ? 'hidden' : ''}`} style={{ WebkitOverflowScrolling: 'touch' }}>
          {/* Search + filters bar */}
          {(tab === 'all' || tab === 'guide' || tab === 'world') && <div className="flex flex-col gap-2 border-b border-white/[0.06] p-3 sm:flex-row sm:items-center sm:gap-3">
            <div className="relative z-30 min-w-0 flex-1">
              <label className="relative block">
                <span className="sr-only">Rechercher une chaîne</span>
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  onFocus={() => setShowSearchSuggestions(true)}
                  onBlur={() => setShowSearchSuggestions(false)}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Rechercher une chaîne…"
                  aria-label="Rechercher une chaîne"
                  aria-expanded={Boolean(query.trim() && showSearchSuggestions)}
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-white/30 focus:border-[#20c7c7]/60 focus:bg-white/[0.05] focus:outline-none focus:ring-1 focus:ring-[#20c7c7]/15"
                />
              </label>
              {query.trim() && showSearchSuggestions && (
                <div className="absolute left-0 right-0 top-full mt-2 max-h-72 overflow-y-auto rounded-xl border border-white/25 bg-[#0b2028] py-1 shadow-2xl shadow-black/50" role="listbox" aria-label="Résultats de recherche">
                  {filteredGroups.length ? filteredGroups.slice(0, 8).map((group) => (
                    <button key={group.key} type="button" role="option" aria-selected={false} onMouseDown={(event) => event.preventDefault()} onClick={() => { handleSelectGroup(group); setQuery(''); setShowSearchSuggestions(false); }} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-white/85 transition hover:bg-white/10 hover:text-white">
                      <span className="min-w-0 flex-1 truncate font-semibold">{group.displayName}</span>
                      <span className="shrink-0 text-[10px] text-white/35">Regarder</span>
                    </button>
                  )) : <p className="px-3 py-3 text-xs text-white/45">Aucune chaîne trouvée.</p>}
                </div>
              )}
            </div>

            {tab === 'world' && <span className="text-xs font-medium text-white/40">{catalog.countries.length} pays · {catalog.channels.length} chaînes</span>}
          </div>}

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

          {tab === 'guide' && (
            <div className="flex gap-2 overflow-x-auto border-b border-white/[0.06] px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {([['all', 'Toute la journée'], ['morning', 'Matin'], ['afternoon', 'Après-midi'], ['early-evening', 'Début de soirée'], ['evening', 'Soirée'], ['night', 'Nuit']] as [GuidePeriod, string][]).map(([value, label]) => (
                <button key={value} type="button" onClick={() => setGuidePeriod(value)} className={`shrink-0 rounded-md px-3 py-1.5 text-[11px] font-semibold transition ${guidePeriod === value ? 'bg-white text-black' : 'bg-white/[0.05] text-white/55 hover:bg-white/10 hover:text-white'}`}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Result count */}
          {(tab === 'all' || tab === 'world') && <p className="px-3 py-2 text-xs font-medium text-white/40" aria-live="polite">{filteredGroups.length} chaîne{filteredGroups.length > 1 ? 's' : ''}</p>}

          {/* Content grid */}
          <div ref={gridRef} className={`flex-col overscroll-y-contain touch-pan-y ${['home', 'favorites', 'countries', 'settings'].includes(tab) ? 'min-h-max flex-none overflow-visible p-3 sm:p-5 lg:p-7' : 'min-h-max flex-none overflow-visible p-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto'}`} style={{ WebkitOverflowScrolling: 'touch' }}>
            {tab === 'home' || tab === 'favorites' ? (
              <NeahplusHome
                channels={homeChannels}
                now={now}
                query={query}
                onQueryChange={setQuery}
                onSelectChannel={openChannelFromHome}
                onPreparePlayback={preloadNeahplusPlayer}
                displayNamesByChannelId={displayNamesByChannelId}
                isFavorite={isFavoriteChannel}
                onToggleFavorite={toggleFavoriteChannel}
                mode={tab === 'favorites' ? 'favorites' : 'home'}
                spaceName={spaceName}
                countryLabel={country || 'Tous les pays'}
                onRenameSpace={() => { setSpaceRenameValue(spaceName); setShowSpaceRenameDialog(true); }}
              />
            ) : tab === 'countries' ? (
              <div className="mx-auto w-full max-w-5xl space-y-5 pb-6">
                <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#d6ad55]">Catalogue international</p><h1 className="mt-1 text-2xl font-black text-white">Choisir un pays</h1><p className="mt-1 text-sm text-white/45">Affichez les chaînes disponibles dans le pays sélectionné.</p></div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {catalog.countries.slice().sort((a, b) => a.name.localeCompare(b.name, 'fr')).map((item) => (
                    <button key={item.name} type="button" onClick={() => { setCountry(item.name); setQuery(''); navigateTo('home'); }} aria-pressed={country === item.name} className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition ${country === item.name ? 'border-[#20c7c7]/45 bg-[#20c7c7]/10 ring-1 ring-[#20c7c7]/20' : 'border-white/10 bg-white/[0.03] hover:border-[#20c7c7]/30 hover:bg-white/[0.05]'}`}>
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-[#70e5e5]"><Globe2 className="h-5 w-5" /></span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-white">{item.name}</span><span className="mt-0.5 block text-xs text-white/40">{item.count} chaîne{item.count > 1 ? 's' : ''}</span></span>
                      {country === item.name && <span className="rounded-full bg-[#20c7c7]/15 px-2 py-1 text-[9px] font-bold uppercase text-[#70e5e5]">Actif</span>}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => { setCountry(''); setQuery(''); navigateTo('home'); }} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-white/65 transition hover:bg-white/10 hover:text-white">Afficher tous les pays</button>
              </div>
            ) : tab === 'settings' ? (
              <div className="mx-auto w-full max-w-3xl space-y-5 pb-6">
                <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#d6ad55]">Votre expérience</p><h1 className="mt-1 text-2xl font-black text-white">Paramètres</h1><p className="mt-1 text-sm text-white/45">Quelques réglages simples pour organiser votre télévision.</p></div>
                <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-5"><div className="flex items-center gap-2"><Globe2 className="h-4 w-4 text-[#55dddd]"/><h2 className="text-sm font-bold text-white">Pays affiché</h2></div><p className="mt-1 text-xs text-white/45">Définissez le catalogue utilisé par défaut dans l’accueil.</p><div className="mt-3 flex flex-wrap items-center gap-2"><select value={country} onChange={(event) => setCountry(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#0b2028] px-3 py-3 text-sm text-white outline-none focus:border-[#20c7c7]/60"><option value="">Tous les pays</option>{catalog.countries.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select><button type="button" onClick={() => setCountry(catalog.countries.some((item) => item.name === 'France') ? 'France' : '')} className="rounded-xl border border-[#20c7c7]/25 bg-[#20c7c7]/10 px-3 py-3 text-xs font-bold text-[#75e6e6] transition hover:bg-[#20c7c7]/20">France par défaut</button></div></section>
                <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-5"><div className="flex items-center gap-2"><Info className="h-4 w-4 text-[#55dddd]"/><h2 className="text-sm font-bold text-white">Comment utiliser NEAHPLUS</h2></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-black/15 p-3"><p className="text-xs font-bold text-white">Accueil</p><p className="mt-1 text-xs leading-5 text-white/45">Parcourez les chaînes par catégorie et lancez un direct.</p></div><div className="rounded-xl bg-black/15 p-3"><p className="text-xs font-bold text-white">Mon espace</p><p className="mt-1 text-xs leading-5 text-white/45">Ajoutez vos chaînes avec le cœur pour les retrouver rapidement.</p></div><div className="rounded-xl bg-black/15 p-3"><p className="text-xs font-bold text-white">Liste des pays</p><p className="mt-1 text-xs leading-5 text-white/45">Choisissez un pays pour afficher son catalogue de chaînes.</p></div><div className="rounded-xl bg-black/15 p-3"><p className="text-xs font-bold text-white">Paramètres</p><p className="mt-1 text-xs leading-5 text-white/45">Modifiez le pays affiché et retrouvez ces conseils.</p></div></div></section>
                <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#0c3037] to-[#101a22] p-4 sm:p-5"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#70e5e5]">À propos</p><h2 className="mt-1 text-sm font-bold text-white">NEAHPLUS TV</h2><p className="mt-1 text-xs leading-5 text-white/50">Guide TV indépendant qui organise les chaînes et leurs sources disponibles. Sans affiliation à CANAL+.</p></section>
              </div>
            ) : tab === 'guide' ? (
              epgChannels.length === 0 ? (
                <p className="py-16 text-center text-sm text-white/40">
                  Aucune chaîne avec programme TV (EPG) disponible.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3 pb-3 sm:grid-cols-2 xl:grid-cols-3">
                  {epgVisible.map((channel, i) => (
                    <EpgRow
                      key={channel.id}
                      channel={channel}
                      channelDisplayName={displayNamesByChannelId.get(channel.id) ?? channel.name}
                      date={guideDate}
                      period={guidePeriod}
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
                  ? 'Aucune chaîne dans votre espace. Ajoutez-en avec le bouton cœur depuis l’accueil.'
                  : 'Aucune chaîne ne correspond à votre recherche.'}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
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
      <footer className="shrink-0 border-t border-[#20c7c7]/15 bg-[#07151d] px-3 py-2.5">
        <div className="relative mx-auto flex max-w-3xl items-center justify-center overflow-hidden rounded-xl border border-[#20c7c7]/25 bg-gradient-to-r from-[#0b2028] via-[#102a35] to-[#0b2028] px-4 py-2.5 text-center shadow-[inset_0_1px_0_rgba(85,221,221,.08),0_4px_18px_rgba(0,0,0,.18)]">
          <span className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#55dddd]/60 to-transparent" />
          <p className="relative text-[10px] leading-4 tracking-wide text-white/75 sm:text-xs"><span className="font-black tracking-[0.12em] text-[#55dddd]">NEAHFLIX</span><span className="mx-2 text-[#55dddd]/55">·</span>Le plaisir du cinéma à un prix juste.</p>
        </div>
      </footer>

      {/* Overlays */}
      {showSpaceRenameDialog && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onClick={() => setShowSpaceRenameDialog(false)}>
          <form className="w-full max-w-sm rounded-2xl border border-[#20c7c7]/20 bg-[#0b2028] p-5 shadow-2xl" onClick={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); saveSpaceName(); }}>
            <h2 className="text-base font-bold text-white">Nommer votre espace</h2>
            <p className="mt-1 text-xs text-white/45">Choisissez un nom pour retrouver facilement votre sélection personnelle.</p>
            <label className="mt-4 block text-xs font-semibold text-white/65" htmlFor="neahplus-space-name">Nom de l’espace</label>
            <input id="neahplus-space-name" autoFocus maxLength={32} value={spaceRenameValue} onChange={(event) => setSpaceRenameValue(event.target.value)} placeholder="Mon espace NEAHPLUS" className="mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-white outline-none focus:border-[#20c7c7]" />
            <p className="mt-1 text-right text-[10px] text-white/30">{spaceRenameValue.length}/32</p>
            <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setShowSpaceRenameDialog(false)} className="rounded-lg px-3 py-2 text-xs font-semibold text-white/55 hover:bg-white/5">Annuler</button><button type="submit" className="rounded-lg bg-[#20c7c7] px-4 py-2 text-xs font-bold text-[#061519] hover:bg-[#55dddd]">Enregistrer</button></div>
          </form>
        </div>
      )}
      {showRenameDialog && selectedGroup && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={() => setShowRenameDialog(false)}>
          <form className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0b2028] p-5 shadow-2xl" onClick={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); saveSelectedChannelName(); }}>
            <h2 className="text-base font-bold text-white">Personnaliser le nom</h2>
            <p className="mt-1 text-xs text-white/45">Ce nom sera utilisé dans NEAHPLUS, y compris dans les recherches. Il ne modifie pas le nom officiel de la source. Laissez le champ vide pour rétablir le nom d'origine.</p>
            <label className="mt-4 block text-xs font-semibold text-white/65" htmlFor="neahplus-custom-channel-name">Nom de la chaîne</label>
            <input id="neahplus-custom-channel-name" autoFocus maxLength={48} value={renameValue} onChange={(event) => setRenameValue(event.target.value)} placeholder={selectedGroup.variants[0]?.name ?? selectedGroup.displayName} className="mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-white outline-none focus:border-[#20c7c7]" />
            <p className="mt-1 text-right text-[10px] text-white/30">{renameValue.length}/48</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShowRenameDialog(false)} className="rounded-lg px-3 py-2 text-xs font-semibold text-white/55 hover:bg-white/5">Annuler</button>
              <button type="submit" className="rounded-lg bg-[#20c7c7] px-4 py-2 text-xs font-bold text-[#061519] hover:bg-[#55dddd]">Enregistrer</button>
            </div>
          </form>
        </div>
      )}
      {showInfoPanel && activeVariant && (
        <InfoPanel
          channel={activeVariant}
          channelDisplayName={selectedGroup?.displayName ?? activeVariant.name}
          onClose={() => setShowInfoPanel(false)}
        />
      )}

      {showQuickSearch && catalog && (
        <QuickSearch
          channels={channelsForCountry}
          currentChannelId={activeVariant?.id ?? null}
          onSelect={handleSelectChannel}
          onClose={() => setShowQuickSearch(false)}
          displayNamesByChannelId={displayNamesByChannelId}
        />
      )}
      <NeahplusEntryTransition visible={entryTransitionVisible} />
    </div>
  );
};

export default NeahplusExperience;
