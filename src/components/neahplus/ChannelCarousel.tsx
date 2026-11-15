import { useCallback, useEffect, useRef, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight, Heart, Tv } from 'lucide-react';
import type { ChannelGroup } from './neahplusTvUtils';
import { channelColor } from './neahplusTvUtils';

interface ChannelCarouselProps {
  groups: ChannelGroup[];
  selectedKey: string | null;
  favoritedKeys: Set<string>;
  onSelectGroup: (group: ChannelGroup) => void;
  onToggleFavorite: (key: string) => void;
  onOpenMore?: () => void;
  categories?: Array<{ id: string; label: string }>;
  selectedCategoryId?: string;
  onCategoryChange?: (categoryId: string) => void;
  countLabel?: string;
}

const ChannelCarousel = ({ groups, selectedKey, favoritedKeys, onSelectGroup, onToggleFavorite, onOpenMore, categories, selectedCategoryId, onCategoryChange, countLabel }: ChannelCarouselProps) => {
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
    <div className="relative flex flex-col gap-2">
      <div className="flex min-h-7 items-center justify-between gap-2 px-1">
        <div className="flex min-w-0 items-center gap-2">
          {categories?.length && onCategoryChange ? (
            <label className="relative inline-flex min-w-0 items-center">
              <span className="sr-only">Filtrer les chaînes par catégorie</span>
              <select
                value={selectedCategoryId ?? 'all'}
                onChange={(event) => onCategoryChange(event.target.value)}
                aria-label="Catégorie des chaînes"
                className="max-w-[170px] appearance-none rounded-lg border border-[#20c7c7]/30 bg-[#20c7c7]/[0.08] py-1.5 pl-2.5 pr-7 text-[10px] font-bold text-[#a5ffff] outline-none transition focus:border-[#55dddd]/70 focus:ring-1 focus:ring-[#55dddd]/25"
              >
                {categories.map((category) => <option key={category.id} value={category.id} className="bg-[#10232b] text-white">{category.label}</option>)}
              </select>
              <span className="pointer-events-none absolute right-2 text-[9px] text-[#8af0f0]">▾</span>
            </label>
          ) : (
            <h4 className="text-xs font-bold uppercase tracking-wider text-white/40">Chaînes</h4>
          )}
          {countLabel && <span className="truncate text-[9px] tabular-nums text-white/35">{countLabel}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={() => scrollBy(-1)} aria-label="Faire défiler à gauche" className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-white/50 transition hover:bg-white/10 hover:text-white">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => scrollBy(1)} aria-label="Faire défiler à droite" className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-white/50 transition hover:bg-white/10 hover:text-white">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div ref={scrollerRef} onKeyDown={handleKey} className="flex gap-2.5 overflow-x-auto overscroll-x-contain scroll-smooth pb-1 [touch-action:pan-x_pan-y] [&::-webkit-scrollbar]:hidden [scrollbar-width:none] [-ms-overflow-style:none]" role="listbox" aria-label="Chaînes disponibles">
        {groups.map((group) => {
          const isSelected = group.key === selectedKey;
          const isFavorited = favoritedKeys.has(group.key);
          return (
            <button
              key={group.key}
              ref={(element) => { if (element) cardRefs.current.set(group.key, element); else cardRefs.current.delete(group.key); }}
              type="button"
              onClick={() => { focusKey.current = group.key; onSelectGroup(group); }}
              onFocus={() => { focusKey.current = group.key; }}
              role="option"
              aria-selected={isSelected}
              className={`group relative flex h-[96px] w-[148px] shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border p-2.5 transition-all duration-300 ${
                isSelected
                  ? 'border-violet-400/45 bg-violet-400/10 ring-1 ring-violet-400/35'
                  : 'border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-white/[0.01] hover:border-white/20 hover:from-white/[0.07]'
              }`}
            >
              {group.logo ? (
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/[0.05]">
                  <img src={group.logo} alt="" loading="lazy" decoding="async" className="h-9 w-9 rounded-md object-contain p-0.5" />
                </div>
              ) : (
                <span className="flex h-11 w-11 items-center justify-center rounded-lg text-xs font-black uppercase text-white/90" style={{ background: channelColor(group.displayName) }} aria-hidden="true">
                  {group.displayName.slice(0, 2).toUpperCase()}
                </span>
              )}
              <span className={`block w-full truncate text-center text-xs font-semibold ${isSelected ? 'text-white' : 'text-white/70'}`}>{group.displayName}</span>
              <div className="absolute right-1.5 top-1.5 flex items-center gap-1">
                {group.variants.length > 1 && (
                  <span className="rounded-full bg-violet-500/80 px-1.5 py-0.5 text-[8px] font-bold text-white">{group.variants.length}</span>
                )}
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(event) => { event.stopPropagation(); onToggleFavorite(group.key); }}
                  aria-label={isFavorited ? 'Retirer de mon espace NEAHPLUS' : 'Ajouter à mon espace NEAHPLUS'}
                  className={`rounded-md border border-[#d6ad55]/60 p-0.5 transition ${isFavorited ? 'bg-[#d6ad55]/10 text-red-500' : 'text-white/35 hover:bg-[#d6ad55]/10 hover:text-[#f0d58a]'}`}
                >
                  <Heart className="h-3 w-3" fill={isFavorited ? 'currentColor' : 'none'} />
                </span>
              </div>
            </button>
          );
        })}
        {onOpenMore && (
        <button type="button" onClick={onOpenMore} aria-label="Afficher plus de chaînes et compléter ma sélection" className="flex h-[96px] w-[112px] shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[#55dddd]/45 bg-[#20c7c7]/[0.06] text-[#8af0f0] transition hover:border-[#55dddd] hover:bg-[#20c7c7]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#55dddd]">
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[#55dddd]/40 bg-[#20c7c7]/10 text-xl font-light">+</span>
          <span className="text-[10px] font-bold uppercase tracking-wider">Plus</span>
        </button>
        )}
        {groups.length === 0 && (
          <span className="flex h-[96px] w-[150px] shrink-0 items-center justify-center px-2 text-center text-[10px] leading-4 text-white/35">Aucune chaîne sélectionnée. Utilisez « Plus » pour en ajouter.</span>
        )}
      </div>
    </div>
  );
};

export default ChannelCarousel;
