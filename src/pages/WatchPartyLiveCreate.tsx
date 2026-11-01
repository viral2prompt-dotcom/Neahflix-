import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Loader2, RotateCcw, Search, Tv, Users, AlertTriangle, Play, Lock } from 'lucide-react';
import { PrefetchLink as Link } from '@/routing/PrefetchLink';
import { useTranslation } from 'react-i18next';
import { currentProgram, loadNeahplusCatalog, type NeahplusCatalog, type NeahplusChannel } from '@/components/neahplus/neahplusCatalog';
import { createLiveWatchParty } from '@/utils/watchpartyLive';
import { storeRoomToken } from '@/utils/watchparty';
import { WATCHPARTY_API } from '@/config/runtime';

const PAGE_SIZE = 60;

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

const WatchPartyLiveCreate = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [catalog, setCatalog] = useState<NeahplusCatalog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [country, setCountry] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedChannel, setSelectedChannel] = useState<NeahplusChannel | null>(null);
  const [nickname, setNickname] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoadError(null);
    loadNeahplusCatalog(controller.signal)
      .then((loaded) => {
        if (!controller.signal.aborted) setCatalog(loaded);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(err instanceof Error ? err.message : 'Catalogue indisponible');
      });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    const savedNickname = localStorage.getItem('watchPartyNickname');
    if (savedNickname) setNickname(savedNickname);
  }, []);

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

  const visible = filtered.slice(0, visibleCount);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim() || !selectedChannel) return;

    setIsCreating(true);
    setError('');

    try {
      localStorage.setItem('watchPartyNickname', nickname);
      const result = await createLiveWatchParty(nickname, {
        id: selectedChannel.id,
        name: selectedChannel.name,
        logo: selectedChannel.logo,
      });
      storeRoomToken(result.roomId, result.hostToken);
      navigate(`/watchparty/room/${result.roomId}`, {
        state: {
          isHost: true,
          nickname,
          roomCode: result.roomCode,
          token: result.hostToken,
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la création du salon';
      setError(message);
    } finally {
      setIsCreating(false);
    }
  };

  if (loadError) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 p-6 text-center">
          <AlertTriangle className="h-10 w-10 text-amber-300" aria-hidden="true" />
          <p className="max-w-md text-sm leading-6 text-white/80">
            Le catalogue NEAHPLUS ne répond pas pour le moment. {loadError}
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
      </div>
    );
  }

  if (!catalog) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 p-6 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-sky-300 motion-reduce:animate-none" aria-hidden="true" />
          <p className="text-sm text-white/75">Chargement du catalogue des chaînes</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="fixed inset-0 h-52 z-0 bg-gradient-to-t from-transparent to-black/50 pointer-events-none" />

      <div className="w-full absolute top-8 z-20">
        <div className="container px-6 md:px-10">
          <Link
            to="/watchparty/create"
            className="inline-flex items-center gap-2 text-sm text-white/70 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('watchParty.backToHome')}
          </Link>
        </div>
      </div>

      <div className="container px-4 py-20 mx-auto max-w-6xl relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/5 border border-white/10 rounded-xl overflow-hidden backdrop-blur-sm"
        >
          <div className="p-6 md:p-8">
            <h1 className="text-2xl md:text-3xl font-bold mb-2 text-center flex items-center justify-center gap-3">
              <Tv className="h-8 w-8 text-sky-400" />
              NEAHPLUS Live Watch Party
            </h1>
            <p className="text-center text-white/50 text-sm mb-8">
              Choisissez une chaîne, invitez vos amis (6 max) et regardez le direct ensemble.
            </p>

            <div className="flex flex-col lg:flex-row gap-6">
              {/* Channel picker */}
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
                  <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1 max-h-[50vh]">
                    {visible.map((channel) => (
                      <li key={channel.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedChannel(channel)}
                          aria-current={channel.id === selectedChannel?.id ? 'true' : undefined}
                          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
                            channel.id === selectedChannel?.id
                              ? 'bg-sky-400/15 ring-1 ring-sky-400/40'
                              : 'hover:bg-white/5'
                          }`}
                        >
                          <ChannelLogo channel={channel} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-white">{channel.name}</span>
                            <span className="block truncate text-xs text-white/55">
                              {currentProgram(channel, Date.now())?.title ?? channel.countries.join(', ')}
                            </span>
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

              {/* Selected channel + create form */}
              <section className="lg:w-[38%] lg:flex-none flex flex-col gap-4">
                {selectedChannel ? (
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/10">
                    <ChannelLogo channel={selectedChannel} />
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-bold text-white">{selectedChannel.name}</h2>
                      <p className="truncate text-xs text-white/60">
                        {currentProgram(selectedChannel, Date.now())?.title ?? selectedChannel.countries.join(', ')}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex aspect-video w-full items-center justify-center rounded-2xl bg-black/60 ring-1 ring-white/10">
                    <p className="px-6 text-center text-sm text-white/70">Sélectionnez une chaîne dans la liste.</p>
                  </div>
                )}

                <form onSubmit={handleCreate} className="space-y-4">
                  <div>
                    <label htmlFor="nickname" className="block text-sm font-medium mb-2 text-white/80">
                      {t('watchParty.yourNickname')}
                    </label>
                    <input
                      type="text"
                      id="nickname"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 text-white placeholder-white/30 transition-all font-medium"
                      placeholder={t('watchParty.nicknamePlaceholder')}
                      maxLength={32}
                      required
                    />
                  </div>

                  <div className="flex items-center gap-2 text-sm text-white/50">
                    <Users className="h-4 w-4" /> 6 participants maximum
                    <Lock className="h-4 w-4 ml-2" /> Salon privé
                  </div>

                  {error && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-center">
                      <p className="text-red-400 text-sm">{error}</p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isCreating || !nickname.trim() || !selectedChannel}
                    className={`w-full h-12 text-base rounded-lg transition-all shadow-lg hover:shadow-sky-600/20 hover:scale-[1.02] flex items-center justify-center gap-2 font-semibold ${
                      isCreating || !nickname.trim() || !selectedChannel
                        ? 'bg-white/10 text-white/50 cursor-not-allowed'
                        : 'bg-sky-500 hover:bg-sky-400 text-slate-950 border-0'
                    }`}
                  >
                    {isCreating ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Création...</>
                    ) : (
                      <><Play className="h-4 w-4" /> Créer le salon Live</>
                    )}
                  </button>
                </form>
              </section>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default WatchPartyLiveCreate;
