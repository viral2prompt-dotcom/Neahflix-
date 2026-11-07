import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { NeahplusChannel } from './neahplusCatalog';
import { channelColor, foldText } from './neahplusTvUtils';

interface QuickSearchProps {
  channels: NeahplusChannel[];
  currentChannelId: string | null;
  onSelect: (channel: NeahplusChannel) => void;
  onClose: () => void;
  displayNamesByChannelId: ReadonlyMap<string, string>;
}

const QuickSearch = ({ channels, currentChannelId, onSelect, onClose, displayNamesByChannelId }: QuickSearchProps) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    const needle = foldText(query.trim());
    const preferred = ['piwi+', 'a+', 'canal+ cinéma', 'canal+ action', 'canal+', 'gulli', 'tf1', 'france 2', 'france 3', 'm6', 'tv5monde', 'france 24', 'tmc'];
    return (needle ? channels.filter((channel) => foldText(displayNamesByChannelId.get(channel.id) ?? channel.name).includes(needle) || foldText(channel.name).includes(needle)) : channels)
      .slice()
      .sort((a, b) => {
        const french = Number(b.countries.includes('France')) - Number(a.countries.includes('France'));
        const priority = (name: string) => {
          const value = foldText(name);
          const index = preferred.findIndex((item) => value === foldText(item) || value.startsWith(foldText(item) + ' '));
          return index < 0 ? preferred.length : index;
        };
        return french || priority(a.name) - priority(b.name) || a.name.localeCompare(b.name, 'fr');
      })
      .slice(0, 30);
  }, [channels, query, displayNamesByChannelId]);

  return (
    <div
      className="fixed inset-0 z-[9990] flex items-start justify-center bg-black/85 p-4 pt-[10vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Recherche rapide de chaînes"
        className="flex max-h-[75vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0d0d14] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3.5">
          <Search className="h-5 w-5 shrink-0 text-red-400" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher une chaîne…"
            className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-xl p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-[8rem] flex-1 overflow-y-auto px-2 py-2" data-lenis-prevent>
          {filtered.length === 0 ? (
            <p className="p-8 text-center text-sm text-white/40">Aucune chaîne ne correspond à votre recherche.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {filtered.map((channel) => {
                const isCurrent = channel.id === currentChannelId;
                return (
                  <li key={channel.id}>
                    <button
                      type="button"
                      onClick={() => { onSelect(channel); onClose(); }}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-200 ${
                        isCurrent
                          ? 'bg-red-500/10 ring-1 ring-red-500/30'
                          : 'hover:bg-white/5'
                      }`}
                    >
                      {channel.logo ? (
                        <img src={channel.logo} alt="" loading="lazy" className="h-9 w-9 shrink-0 rounded-lg bg-white/5 object-contain p-0.5" />
                      ) : (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[10px] font-black uppercase text-white/90" style={{ background: channelColor(channel.name) }}>
                          {(displayNamesByChannelId.get(channel.id) ?? channel.name).slice(0, 2).toUpperCase()}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white/90">{displayNamesByChannelId.get(channel.id) ?? channel.name}</span>
                      {isCurrent && (
                        <span className="shrink-0 rounded-md bg-red-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-red-300">En cours</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-white/[0.06] px-4 py-2.5 text-center text-[10px] text-white/30">
          Recherche sur {channels.length} chaînes du catalogue
        </div>
      </div>
    </div>
  );
};

export default QuickSearch;
