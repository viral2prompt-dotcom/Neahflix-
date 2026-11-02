import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, RotateCcw, Search, Tv } from 'lucide-react';
import NeahplusPlayer from './NeahplusPlayer';
import { currentProgram, loadNeahplusCatalog, type NeahplusCatalog, type NeahplusChannel } from './neahplusCatalog';

const PAGE_SIZE = 200;

const foldText = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const ChannelLogo = ({ channel }: { channel: NeahplusChannel }) => {
  const [failed, setFailed] = useState(false);
  if (!channel.logo || failed) {
    return (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-sky-200" aria-hidden="true">
        <Tv className="h-5 w-5" />
      </span>
    );
  }
  return (
    <img
      src={channel.logo}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="h-10 w-10 shrink-0 rounded-lg bg-white/5 object-contain p-1"
    />
  );
};

const NeahplusExperience = () => {
  const [catalog, setCatalog] = useState<NeahplusCatalog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [country, setCountry] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoadError(null);
    loadNeahplusCatalog(controller.signal)
      .then((loaded) => {
        if (!controller.signal.aborted) setCatalog(loaded);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(error instanceof Error ? error.message : 'Catalogue indisponible');
      });
    return () => controller.abort();
  }, [attempt]);

  const filtered = useMemo(() => {
    if (!catalog) return [];
    const needle = foldText(query.trim());
    return catalog.channels.filter((channel) =>
      (!country || channel.countries.includes(country)) &&
      (!needle || foldText(channel.name).includes(needle)),
    );
  }, [catalog, country, query]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query, country]);

  const selected = catalog?.channels.find((channel) => channel.id === selectedId) ?? null;
  const visible = filtered.slice(0, visibleCount);

  if (loadError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <AlertTriangle className="h-10 w-10 text-amber-300" aria-hidden="true" />
        <p className="max-w-md text-sm leading-6 text-white/80">
          Le catalogue NEAHPLUS ne répond pas pour le moment. {loadError}.
        </p>
        <button
          type="button"
          onClick={() => setAttempt((value) => value + 1)}
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
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3 sm:p-5 lg:flex-row lg:overflow-hidden">
      <section className="flex min-h-0 flex-col gap-3 lg:w-[58%] lg:flex-none">
        {selected ? (
          <>
            <NeahplusPlayer key={selected.id} channelId={selected.id} channelName={selected.name} />
            <div className="flex items-center gap-3">
              <ChannelLogo channel={selected} />
              <div className="min-w-0">
                <h2 className="truncate text-base font-bold text-white">{selected.name}</h2>
                <p className="truncate text-xs text-white/60">
                  {currentProgram(selected, Date.now())?.title ?? selected.countries.join(', ')}
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className="flex aspect-video w-full items-center justify-center rounded-2xl bg-black/60 ring-1 ring-white/10">
            <p className="px-6 text-center text-sm text-white/70">Choisissez une chaîne dans la liste pour la regarder.</p>
          </div>
        )}
      </section>

      <section className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative flex-1">
            <span className="sr-only">Rechercher une chaîne</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher une chaîne"
              className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder:text-white/45 focus:border-sky-400 focus:outline-none"
            />
          </label>
          <label className="sm:w-56">
            <span className="sr-only">Filtrer par pays</span>
            <select
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white focus:border-sky-400 focus:outline-none"
            >
              <option value="">Tous les pays ({catalog.channels.length})</option>
              {catalog.countries.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name} ({item.count})
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-xs text-white/55" aria-live="polite">
          {filtered.length} chaîne{filtered.length > 1 ? 's' : ''} sur {catalog.channels.length}
        </p>

        {filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-white/65">Aucune chaîne ne correspond à cette recherche.</p>
        ) : (
          <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1">
            {visible.map((channel) => (
              <li key={channel.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(channel.id)}
                  aria-current={channel.id === selectedId ? 'true' : undefined}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
                    channel.id === selectedId ? 'bg-sky-400/15 ring-1 ring-sky-400/40' : 'hover:bg-white/5'
                  }`}
                >
                  <ChannelLogo channel={channel} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white">{channel.name}</span>
                    <span className="block truncate text-xs text-white/55">{channel.countries.join(', ')}</span>
                  </span>
                </button>
              </li>
            ))}
            {visibleCount < filtered.length && (
              <li>
                <button
                  type="button"
                  onClick={() => setVisibleCount((value) => value + PAGE_SIZE)}
                  className="w-full rounded-xl py-3 text-sm font-semibold text-sky-200 transition hover:bg-white/5"
                >
                  Afficher plus de chaînes
                </button>
              </li>
            )}
          </ul>
        )}
      </section>
    </div>
  );
};

export default NeahplusExperience;
