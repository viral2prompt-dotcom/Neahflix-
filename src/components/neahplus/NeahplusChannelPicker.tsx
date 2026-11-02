import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Search, X, Radio } from 'lucide-react';
import { loadNeahplusCatalog, type NeahplusChannel } from './neahplusCatalog';
import type { LiveChannelSource } from '../../utils/watchpartyLiveModel';

interface NeahplusChannelPickerProps {
  onSelect: (channel: LiveChannelSource) => void;
  onClose: () => void;
  currentChannelId?: string;
}

const PAGE_SIZE = 48;

const NeahplusChannelPicker: React.FC<NeahplusChannelPickerProps> = ({
  onSelect,
  onClose,
  currentChannelId,
}) => {
  const [channels, setChannels] = useState<NeahplusChannel[]>([]);
  const [countries, setCountries] = useState<Array<{ name: string; count: number }>>([]);
  const [query, setQuery] = useState('');
  const [country, setCountry] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    loadNeahplusCatalog(controller.signal)
      .then((catalog) => {
        setChannels(catalog.channels);
        setCountries(catalog.countries);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Impossible de charger les chaînes NEAHPLUS.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return channels.filter((channel) => {
      const matchesQuery = !normalized || channel.name.toLocaleLowerCase().includes(normalized)
        || channel.id.toLocaleLowerCase().includes(normalized);
      const matchesCountry = !country || channel.countries.includes(country);
      return matchesQuery && matchesCountry;
    });
  }, [channels, query, country]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => setPage(1), [query, country]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-3 sm:p-6" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Choisir une chaîne NEAHPLUS"
        className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#111] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-white/10 p-4">
          <div className="flex items-center gap-3">
            <Radio className="text-red-400" size={22} />
            <div>
              <h2 className="font-semibold text-white">Chaînes NEAHPLUS Live</h2>
              <p className="text-xs text-white/50">{channels.length.toLocaleString('fr-FR')} chaînes du catalogue</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white">
            <X size={20} />
          </button>
        </header>

        <div className="grid gap-3 border-b border-white/10 p-4 sm:grid-cols-[1fr_220px]">
          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3">
            <Search size={17} className="text-white/40" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une chaîne…" className="w-full bg-transparent py-3 text-sm text-white outline-none placeholder:text-white/35" />
          </label>
          <select value={country} onChange={(event) => setCountry(event.target.value)} className="rounded-xl border border-white/10 bg-[#1c1c1c] px-3 py-3 text-sm text-white outline-none">
            <option value="">Tous les pays</option>
            {countries.map((item) => <option key={item.name} value={item.name}>{item.name} ({item.count})</option>)}
          </select>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex min-h-48 items-center justify-center gap-3 text-sm text-white/60"><Loader2 className="animate-spin" /> Chargement du catalogue réel…</div>
          ) : error ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center text-sm text-red-300">
              <p>{error}</p>
              <button type="button" onClick={() => { setLoading(true); setError(null); loadNeahplusCatalog().then((catalog) => { setChannels(catalog.channels); setCountries(catalog.countries); }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Catalogue indisponible')).finally(() => setLoading(false)); }} className="rounded-lg bg-white/10 px-4 py-2 text-white">Réessayer</button>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex min-h-48 items-center justify-center text-sm text-white/50">Aucune chaîne ne correspond à cette recherche.</div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {visible.map((channel) => (
                <button
                  type="button"
                  key={channel.id}
                  disabled={channel.id === currentChannelId}
                  onClick={() => onSelect({ id: channel.id, name: channel.name, logo: channel.logo })}
                  className="flex min-w-0 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-left transition hover:border-red-500/50 hover:bg-white/[0.08] disabled:cursor-default disabled:opacity-50"
                >
                  <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/40">
                    {channel.logo ? <img src={channel.logo} alt="" loading="lazy" className="max-h-full max-w-full object-contain" /> : <Radio size={22} className="text-white/30" />}
                  </div>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-white">{channel.name}</span>
                    <span className="block truncate text-xs text-white/40">{channel.countries.slice(0, 2).join(' · ') || 'Pays non renseigné'}</span>
                  </span>
                  {channel.id === currentChannelId && <span className="text-[10px] text-green-400">En cours</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {!loading && !error && filtered.length > 0 && (
          <footer className="flex items-center justify-between border-t border-white/10 p-3 text-xs text-white/50">
            <span>{filtered.length.toLocaleString('fr-FR')} résultat(s) · Page {page}/{pageCount}</span>
            <div className="flex gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg bg-white/10 px-3 py-2 text-white disabled:opacity-30">Précédent</button>
              <button type="button" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)} className="rounded-lg bg-white/10 px-3 py-2 text-white disabled:opacity-30">Suivant</button>
            </div>
          </footer>
        )}
      </section>
    </div>
  );
};

export default NeahplusChannelPicker;
