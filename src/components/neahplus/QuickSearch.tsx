import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { NeahplusChannel } from './neahplusCatalog';
import { channelColor, foldText } from './neahplusTvUtils';

interface QuickSearchProps {
  channels: NeahplusChannel[];
  currentChannelId: string | null;
  onSelect: (channel: NeahplusChannel) => void;
  onClose: () => void;
}

const QuickSearch = ({ channels, currentChannelId, onSelect, onClose }: QuickSearchProps) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } }; window.addEventListener('keydown', handleKey); return () => window.removeEventListener('keydown', handleKey); }, [onClose]);
  const filtered = useMemo(() => { const needle = foldText(query.trim()); return (needle ? channels.filter((channel) => foldText(channel.name).includes(needle)) : channels).slice(0, 30); }, [channels, query]);
  return <div className="fixed inset-0 z-[9990] flex items-start justify-center bg-black/80 p-4 pt-[10vh]" onClick={onClose}><div role="dialog" aria-modal="true" aria-label="Recherche rapide de chaînes" className="flex max-h-[75vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-red-500/20 bg-slate-950 shadow-2xl" onClick={(event) => event.stopPropagation()}>
    <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3"><Search className="h-5 w-5 shrink-0 text-red-400" /><input ref={inputRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une chaîne…" className="flex-1 bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none" /><button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg p-1 text-white/70 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button></div>
    <div className="min-h-[8rem] flex-1 overflow-y-auto px-2 py-2">{filtered.length === 0 ? <p className="p-6 text-center text-sm text-white/45">Aucune chaîne ne correspond à votre recherche.</p> : <ul className="flex flex-col gap-1">{filtered.map((channel) => { const isCurrent = channel.id === currentChannelId; return <li key={channel.id}><button type="button" onClick={() => { onSelect(channel); onClose(); }} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${isCurrent ? 'bg-red-500/10 ring-1 ring-red-500/30' : 'hover:bg-white/8'}`}>{channel.logo ? <img src={channel.logo} alt="" loading="lazy" className="h-8 w-8 shrink-0 rounded-md bg-white/5 object-contain p-0.5" /> : <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[10px] font-black uppercase text-white/90" style={{ background: channelColor(channel.name) }}>{channel.name.slice(0, 2).toUpperCase()}</span>}<span className="min-w-0 flex-1 truncate text-sm font-medium text-white/90">{channel.name}</span>{isCurrent && <span className="shrink-0 text-[10px] font-semibold text-red-300">En cours</span>}</button></li>; })}</ul>}</div>
    <div className="border-t border-white/10 px-4 py-2 text-center text-[10px] text-white/35">Recherche sur {channels.length} chaînes du catalogue</div>
  </div></div>;
};

export default QuickSearch;
