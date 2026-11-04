import { useCallback, useEffect, useRef, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight, Star, Tv } from 'lucide-react';
import type { ChannelGroup } from './neahplusTvUtils';
import { channelColor } from './neahplusTvUtils';

interface ChannelCarouselProps {
  groups: ChannelGroup[];
  selectedKey: string | null;
  favoritedKeys: Set<string>;
  onSelectGroup: (group: ChannelGroup) => void;
  onToggleFavorite: (key: string) => void;
}

const ChannelCarousel = ({ groups, selectedKey, favoritedKeys, onSelectGroup, onToggleFavorite }: ChannelCarouselProps) => {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const focusKey = useRef<string | null>(null);

  const scrollBy = useCallback((direction: 1 | -1) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollBy({ left: Math.floor(scroller.clientWidth * 0.7) * direction, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (!selectedKey) return;
    cardRefs.current.get(selectedKey)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [selectedKey]);

  const handleKey = useCallback((event: KeyboardEvent) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const currentIndex = groups.findIndex((group) => group.key === focusKey.current);
    const nextIndex = event.key === 'ArrowRight'
      ? Math.min(currentIndex < 0 ? 0 : currentIndex + 1, groups.length - 1)
      : Math.max(currentIndex - 1, 0);
    const next = groups[nextIndex];
    if (next) {
      focusKey.current = next.key;
      cardRefs.current.get(next.key)?.focus();
    }
  }, [groups]);

  return (
    <div className="relative flex items-center gap-1 py-2">
      <button type="button" onClick={() => scrollBy(-1)} aria-label="Faire défiler à gauche" className="absolute left-0 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white/80 ring-1 ring-white/10 transition hover:bg-black/90 hover:text-white">
        <ChevronLeft className="h-5 w-5" />
      </button>
      <div ref={scrollerRef} onKeyDown={handleKey} className="flex gap-2.5 overflow-x-auto scroll-smooth px-6 pb-1 [&::-webkit-scrollbar]:hidden [scrollbar-width:none] [-ms-overflow-style:none]" role="listbox" aria-label="Chaînes disponibles">
        {groups.map((group) => {
          const isSelected = group.key === selectedKey;
          const isFavorited = favoritedKeys.has(group.key);
          return (
            <button key={group.key} ref={(element) => { if (element) cardRefs.current.set(group.key, element); else cardRefs.current.delete(group.key); }} type="button" onClick={() => { focusKey.current = group.key; onSelectGroup(group); }} onFocus={() => { focusKey.current = group.key; }} role="option" aria-selected={isSelected} className={`group relative flex h-[88px] w-[140px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border p-2 transition-all duration-200 ${isSelected ? 'border-red-500 bg-red-500/10 ring-2 ring-red-500/60' : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.07]'}`}>
              {group.logo ? <img src={group.logo} alt="" loading="lazy" decoding="async" className="h-10 w-10 rounded-lg bg-white/5 object-contain p-0.5" /> : <span className="flex h-10 w-10 items-center justify-center rounded-lg text-xs font-black uppercase text-white/90" style={{ background: channelColor(group.displayName) }} aria-hidden="true">{group.displayName.slice(0, 2).toUpperCase()}</span>}
              <span className={`block w-full truncate text-center text-xs font-semibold ${isSelected ? 'text-red-200' : 'text-white/80'}`}>{group.displayName}</span>
              <span className="flex items-center gap-1">
                {group.variants.length > 1 && <span className="text-[9px] text-white/40">{group.variants.length} src</span>}
                <span role="button" tabIndex={-1} onClick={(event) => { event.stopPropagation(); onToggleFavorite(group.key); }} aria-label={isFavorited ? 'Retirer des favoris' : 'Ajouter aux favoris'} className={`rounded p-0.5 ${isFavorited ? 'text-amber-400' : 'text-white/20 hover:text-white/50'}`}><Star className="h-3 w-3" fill={isFavorited ? 'currentColor' : 'none'} /></span>
              </span>
            </button>
          );
        })}
        {groups.length === 0 && <div className="flex h-[88px] w-full items-center justify-center gap-2 text-sm text-white/40"><Tv className="h-4 w-4" />Aucune chaîne dans cette catégorie.</div>}
      </div>
      <button type="button" onClick={() => scrollBy(1)} aria-label="Faire défiler à droite" className="absolute right-0 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white/80 ring-1 ring-white/10 transition hover:bg-black/90 hover:text-white">
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
};

export default ChannelCarousel;
