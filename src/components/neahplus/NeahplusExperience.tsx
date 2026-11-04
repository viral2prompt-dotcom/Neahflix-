import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Globe,
  Heart,
  Home as HomeIcon,
  Loader2,
  RotateCcw,
  Search,
  Star,
  Tv,
} from 'lucide-react';
import NeahplusPlayer from './NeahplusPlayer';
import {
  currentProgram,
  loadNeahplusCatalog,
  type NeahplusCatalog,
  type NeahplusChannel,
} from './neahplusCatalog';
import {
  channelColor,
  channelsWithEpg,
  ChannelGroup,
  foldText,
  getProgramsForDay,
  groupChannelVariants,
  HISTORICAL_CHANNELS,
  loadFavorites,
  getNextProgram,
  saveFavorites,
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

/* ===================== Channel card ===================== */

interface ChannelCardProps {
  group: ChannelGroup;
  selected: boolean;
  favorited: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
  index: number;
  registerRef: (el: HTMLButtonElement | null, index: number) => void;
}

const ChannelCard = ({
  group,
  selected,
  favorited,
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
    <button
      ref={(el) => registerRef(el, index)}
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      className={`group relative flex w-full flex-col gap-2 rounded-2xl border p-3 text-left transition-all duration-200 ${
        selected
          ? 'border-sky-400/60 bg-sky-400/10 ring-1 ring-sky-400/40'
          : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]'
      }`}
    >
      <div className="flex items-center gap-3">
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
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">{group.displayName}</p>
          <p className="truncate text-xs text-white/50">
            {group.isHistorical
              ? 'Chaîne historique'
              : prog?.title ?? group.countries.join(', ') ?? '—'}
          </p>
          {!group.hasStream && (
            <span className="text-[10px] text-amber-300/80">Flux non disponible</span>
          )}
          {group.variants.length > 1 && (
            <span className="text-[10px] text-sky-300/80">{group.variants.length} variantes</span>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          aria-label={favorited ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          className={`shrink-0 rounded-lg p-1.5 transition-colors ${
            favorited
              ? 'text-amber-400 hover:bg-amber-400/10'
              : 'text-white/30 hover:bg-white/10 hover:text-white/60'
          }`}
        >
          <Star className="h-4 w-4" fill={favorited ? 'currentColor' : 'none'} aria-hidden="true" />
        </button>
      </div>
    </button>
  );
};

/* ===================== EPG row ===================== */

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
  const current = currentProgram(channel, now);
  const next = getNextProgram(channel, now);

  return (
    <button
      ref={(el) => registerRef(el, index)}
      type="button"
      onClick={onPlay}
      className="flex w-full flex-col gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left transition hover:border-sky-400/40 hover:bg-white/[0.06]"
    >
      <div className="flex items-center gap-2">
        {channel.logo ? (
          <img src={channel.logo} alt="" loading="lazy" className="h-8 w-8 rounded-md bg-white/5 object-contain p-0.5" />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-800 text-sky-200">
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
            <p className="text-xs text-sky-300">
              <span className="font-semibold">En cours : </span>
              {current.title}
            </p>
          )}
          {next && (
            <p className="text-xs text-white/50">
              <span className="font-semibold">Suivant : </span>
              {next.title}
            </p>
          )}
          {!current && !next && programs.length > 0 && (
            <p className="text-xs text-white/50">{programs.length} programmes disponibles</p>
          )}
        </div>
      )}
    </button>
  );
};

/* ===================== Main component ===================== */

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
  const gridRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const gridFocusIndex = useRef(0);

  /* ---- Load catalog ---- */
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

  /* ---- Favorites ---- */
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

  /* ---- Groups with variants ---- */
  const realGroups = useMemo(() => groupChannelVariants(catalog?.channels ?? []), [catalog]);
  const allGroups = useMemo(() => [...realGroups, ...HISTORICAL_CHANNELS], [realGroups]);

  /* ---- Default country = France ---- */
  useEffect(() => {
    if (catalog && !country) {
      const hasFrance = catalog.countries.some((c) => c.name === 'France');
      if (hasFrance) setCountry('France');
    }
  }, [catalog, country]);

  /* ---- Filtering ---- */
  const filteredGroups = useMemo(() => {
    const needle = foldText(query.trim());
    const base = tab === 'favorites'
      ? allGroups.filter((g) => favorites.has(g.key))
      : tab === 'world'
        ? allGroups
        : allGroups;

    return base.filter((g) => {
      if (country && tab !== 'world' && !g.countries.includes(country)) {
        if (tab !== 'world') return false;
      }
      if (needle && !foldText(g.displayName).includes(needle)) return false;
      return true;
    });
  }, [allGroups, country, query, tab, favorites]);

  const visibleGroups = filteredGroups.slice(0, visibleCount);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query, country, tab]);

  /* ---- Selected group & active variant ---- */
  const selectedGroup = allGroups.find((g) => g.key === selectedGroupKey) ?? null;
  const activeVariant = selectedGroup?.variants[activeVariantIndex] ?? null;

  const handleSelectGroup = useCallback((group: ChannelGroup) => {
    setSelectedGroupKey(group.key);
    setActiveVariantIndex(0);
  }, []);

  const cycleVariant = useCallback((direction: 1 | -1) => {
    if (!selectedGroup || selectedGroup.variants.length <= 1) return;
    setActiveVariantIndex((prev) => {
      const len = selectedGroup.variants.length;
      return (prev + direction + len) % len;
    });
  }, [selectedGroup]);

  /* ---- EPG channels ---- */
  const epgChannels = useMemo(() => {
    if (!catalog) return [];
    return channelsWithEpg(catalog.channels)
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
      .slice(0, 200);
  }, [catalog]);

  const epgVisible = epgChannels.slice(0, visibleCount);

  /* ---- Grid focus management ---- */
  const registerRef = useCallback((el: HTMLButtonElement | null, index: number) => {
    itemRefs.current[index] = el;
  }, []);

  const focusGridItem = useCallback((index: number) => {
    const max = (tab === 'guide' ? epgVisible : visibleGroups).length - 1;
    const clamped = Math.max(0, Math.min(index, max));
    gridFocusIndex.current = clamped;
    itemRefs.current[clamped]?.focus();
  }, [tab, epgVisible.length, visibleGroups.length]);

  /* ---- Keyboard navigation (remote control) ---- */
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInInput = target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA';
      if (isInInput && e.key !== 'Escape') return;

      const items = tab === 'guide' ? epgVisible : visibleGroups;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          focusGridItem(gridFocusIndex.current + 1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          focusGridItem(gridFocusIndex.current - 1);
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
          // Le bouton focusé gère lui-même le Enter
          break;
        case 'Escape':
          break;
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [tab, epgVisible, visibleGroups, focusGridItem, cycleVariant]);

  /* ---- Reset focus on tab change ---- */
  useEffect(() => {
    gridFocusIndex.current = 0;
    itemRefs.current = [];
  }, [tab]);

  /* ---- Loading / Error states ---- */
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
          className="inline-flex items-center gap-2 rounded-lg bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-300"
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
        <Loader2 className="h-8 w-8 animate-spin text-sky-300 motion-reduce:animate-none" aria-hidden="true" />
        <p className="text-sm text-white/75">Chargement du catalogue des chaînes</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-950 text-white">
      {/* ---- Tab bar ---- */}
      <nav className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-white/10 bg-slate-950/95 px-2 py-2 backdrop-blur sm:px-4" aria-label="Rubriques NEAHPLUS TV">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-current={tab === id ? 'true' : undefined}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors sm:text-sm ${
              tab === id
                ? 'bg-sky-400/15 text-sky-200 ring-1 ring-sky-400/30'
                : 'text-white/55 hover:bg-white/5 hover:text-white/80'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </nav>

      {/* ---- Main layout ---- */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        {/* ---- Player column ---- */}
        <section className="flex min-h-0 shrink-0 flex-col gap-2 p-3 lg:w-[45%] lg:p-4">
          {activeVariant && selectedGroup ? (
            <>
              <NeahplusPlayer
                key={activeVariant.id}
                channelId={activeVariant.id}
                channelName={selectedGroup.displayName}
              />
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-bold text-white">{selectedGroup.displayName}</h2>
                  <p className="truncate text-xs text-white/55">
                    {currentProgram(activeVariant, Date.now())?.title ?? selectedGroup.countries.join(', ')}
                  </p>
                </div>
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
              {selectedGroup.variants.length > 1 && (
                <div className="flex flex-wrap gap-1">
                  {selectedGroup.variants.map((v, i) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setActiveVariantIndex(i)}
                      className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                        i === activeVariantIndex
                          ? 'bg-sky-400/20 text-sky-200 ring-1 ring-sky-400/30'
                          : 'bg-white/5 text-white/50 hover:bg-white/10'
                      }`}
                    >
                      {v.name.replace(selectedGroup.displayName, '').trim() || `Source ${i + 1}`}
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
        </section>

        {/* ---- Content column ---- */}
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* ---- Search + filters ---- */}
          <div className="flex flex-col gap-2 border-b border-white/10 p-3 sm:flex-row sm:items-center">
            <label className="relative flex-1">
              <span className="sr-only">Rechercher une chaîne</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher une chaîne"
                className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder:text-white/40 focus:border-sky-400 focus:outline-none"
              />
            </label>
            {tab !== 'world' && catalog.countries.length > 0 && (
              <label className="sm:w-48">
                <span className="sr-only">Filtrer par pays</span>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white focus:border-sky-400 focus:outline-none"
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

          {/* ---- Guide date navigation ---- */}
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

          {/* ---- Count ---- */}
          {tab !== 'guide' && (
            <p className="px-3 py-1.5 text-xs text-white/50" aria-live="polite">
              {filteredGroups.length} chaîne{filteredGroups.length > 1 ? 's' : ''}
              {tab === 'favorites' && favorites.size === 0 && ' — Ajoutez des chaînes avec l\'étoile'}
            </p>
          )}

          {/* ---- Grid / EPG list ---- */}
          <div ref={gridRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3" data-lenis-prevent>
            {tab === 'guide' ? (
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
                      onPlay={() => {
                        const group = allGroups.find((g) => g.variants.some((v) => v.id === channel.id));
                        if (group) {
                          setSelectedGroupKey(group.key);
                          const vIdx = group.variants.findIndex((v) => v.id === channel.id);
                          setActiveVariantIndex(vIdx >= 0 ? vIdx : 0);
                        }
                      }}
                    />
                  ))}
                  {visibleCount < epgChannels.length && (
                    <button
                      type="button"
                      onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
                      className="w-full rounded-xl py-3 text-sm font-semibold text-sky-200 transition hover:bg-white/5"
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
                    className="col-span-full w-full rounded-xl py-3 text-sm font-semibold text-sky-200 transition hover:bg-white/5"
                  >
                    Afficher plus de chaînes
                  </button>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ---- Footer disclaimer ---- */}
      <footer className="shrink-0 border-t border-white/10 bg-slate-950 px-3 py-2">
        <p className="text-center text-[10px] text-white/35">
          NEAHPLUS TV — Guide indépendant. Cette interface organise les chaînes et leurs sources disponibles.
          Elle n'est ni affiliée à CANAL+ ni exploitée par CANAL+.
        </p>
      </footer>
    </div>
  );
};

export default NeahplusExperience;
