import { useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import { Heart, Search, X } from 'lucide-react';
import type { ChannelGroup } from './neahplusTvUtils';
import { foldText, groupMatchesCountry } from './neahplusTvUtils';

export const NEAHPLUS_FLOW_CATEGORIES = [
  { id: 'all', label: 'Tout' },
  { id: 'cinema', label: 'Cinéma' },
  { id: 'sport', label: 'Sport' },
  { id: 'youth', label: 'Jeunesse' },
  { id: 'documentary', label: 'Documentaires' },
  { id: 'entertainment', label: 'Divertissement' },
] as const;

const FLOW_CATEGORY_MATCHERS: Record<string, RegExp> = {
  cinema: /cinema|film|movie|action|paramount|ocs|cine\s*\+|hollywood/,
  sport: /sport|eurosport|bein|football|rugby|tennis|basket|combat|golf|racing/,
  youth: /kids|family|piwi|gulli|jeunesse|teletoon|cartoon|boomerang|nick|disney|boing|tiji|ludikids/,
  documentary: /documentaire|docu|canal\+ docs|national geographic|nat geo|discovery|histoire|planete|voyage|wild/,
  entertainment: /divertissement|comedie|humour|musique|tv5|france 2|france 3|tf1|m6|tfx|w9|pop|novelas|nollywood|trace|a\+/,
};

export const filterNeahplusFlowGroups = (
  groups: ChannelGroup[],
  categoryId: string,
  country: string,
): ChannelGroup[] => groups.filter((group) => {
  if (country && !groupMatchesCountry(group, country)) return false;
  if (categoryId === 'all') return true;
  const matcher = FLOW_CATEGORY_MATCHERS[categoryId];
  if (!matcher) return true;
  return group.variants.some((variant) =>
    matcher.test(foldText([group.displayName, variant.name, ...variant.categories].join(' ')))
  );
});

interface NeahplusFlowProps {
  groups: ChannelGroup[];
  selectedGroup: ChannelGroup;
  categoryId: string;
  channelName: string;
  programTitle: string | null;
  programTime: string | null;
  logo: string | null;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onCategoryChange: (categoryId: string) => void;
  onSelectGroup: (group: ChannelGroup) => void;
  onSwipe: (direction: 1 | -1) => void;
  onClose: () => void;
}

const NeahplusFlow = ({
  groups,
  selectedGroup,
  categoryId,
  channelName,
  programTitle,
  programTime,
  logo,
  isFavorite,
  onToggleFavorite,
  onCategoryChange,
  onSelectGroup,
  onSwipe,
  onClose,
}: NeahplusFlowProps) => {
  const [controlsVisible, setControlsVisible] = useState(true);
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  const matchingGroups = groups.filter((group) => {
    const needle = foldText(search.trim());
    return !needle || foldText(group.displayName).includes(needle) ||
      group.variants.some((variant) => foldText(variant.name).includes(needle));
  });

  useEffect(() => {
    if (!controlsVisible || searchFocused) return undefined;
    const timer = window.setTimeout(() => setControlsVisible(false), 4200);
    return () => window.clearTimeout(timer);
  }, [controlsVisible, searchFocused, selectedGroup.key, categoryId]);

  const stopSurfaceClick = (event: MouseEvent) => event.stopPropagation();

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[1001] h-dvh w-full overflow-hidden text-white"
      role="region"
      aria-label="NEAHPLUS Flow, navigation verticale des chaînes"
    >
      <div className={`pointer-events-none absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/90 via-black/55 to-transparent px-3 pb-12 pt-[max(env(safe-area-inset-top),12px)] transition-opacity duration-300 ${controlsVisible ? 'opacity-100' : 'opacity-0'}`}>
        <div className="pointer-events-auto flex items-center justify-between gap-2" onClick={stopSurfaceClick}>
          <div className="flex min-w-0 items-center gap-2">
            {logo ? <img src={logo} alt="" className="h-8 w-8 rounded-lg bg-white/10 object-contain p-1" /> : <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#20c7c7]/15 text-[10px] font-black text-[#70e5e5]">{channelName.slice(0, 2).toUpperCase()}</span>}
            <span className="truncate text-sm font-black tracking-wide">NEAHPLUS <span className="text-[#55dddd]">FLOW</span></span>
          </div>
          <button type="button" onClick={onClose} aria-label="Quitter NEAHPLUS Flow" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white/90 backdrop-blur-md"><X className="h-5 w-5" /></button>
        </div>

        <div className="pointer-events-auto mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" onClick={stopSurfaceClick}>
          {NEAHPLUS_FLOW_CATEGORIES.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => { setSearch(''); onCategoryChange(category.id); setControlsVisible(true); }}
              aria-pressed={categoryId === category.id}
              className={`shrink-0 rounded-full border px-3.5 py-2 text-[11px] font-bold transition ${categoryId === category.id ? 'border-[#55dddd]/70 bg-[#20c7c7]/25 text-white shadow-[0_0_18px_rgba(32,199,199,.18)]' : 'border-white/15 bg-black/35 text-white/70'}`}
            >
              {category.label}
            </button>
          ))}
        </div>

        <div className="pointer-events-auto relative mt-3" onClick={stopSurfaceClick}>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
          <input
            type="search"
            value={search}
            onFocus={() => { setSearchFocused(true); setControlsVisible(true); }}
            onBlur={() => setSearchFocused(false)}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher une chaîne…"
            aria-label="Rechercher une chaîne dans NEAHPLUS Flow"
            className="w-full rounded-xl border border-white/15 bg-black/55 py-2.5 pl-9 pr-3 text-xs text-white placeholder:text-white/45 outline-none backdrop-blur-xl focus:border-[#55dddd]/60"
          />
          {search.trim() && (
            <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-[34vh] overflow-y-auto rounded-xl border border-white/15 bg-[#07171d]/95 p-1 shadow-2xl backdrop-blur-xl">
              {matchingGroups.length ? matchingGroups.slice(0, 30).map((group) => (
                <button
                  key={group.key}
                  type="button"
                  onClick={() => { onSelectGroup(group); setSearch(''); setSearchFocused(false); setControlsVisible(true); }}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs transition ${group.key === selectedGroup.key ? 'bg-[#20c7c7]/15 text-[#9af5f5]' : 'text-white/80 hover:bg-white/10'}`}
                >
                  <span className="min-w-0 flex-1 truncate font-semibold">{group.displayName}</span>
                  {group.key === selectedGroup.key && <span className="text-[9px] font-bold text-[#70e5e5]">EN COURS</span>}
                </button>
              )) : <p className="px-3 py-4 text-center text-xs text-white/50">Aucune chaîne trouvée.</p>}
            </div>
          )}
        </div>
      </div>

      <div className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/95 via-black/70 to-transparent px-4 pb-[max(env(safe-area-inset-bottom),20px)] pt-16 transition-opacity duration-300 ${controlsVisible ? 'opacity-100' : 'opacity-0'}`}>
        <div className="pointer-events-auto flex items-end justify-between gap-3" onClick={stopSurfaceClick}>
          <div className="min-w-0 flex-1">
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[#55dddd]/30 bg-[#20c7c7]/15 px-2.5 py-1 text-[9px] font-black tracking-[0.12em] text-[#8af0f0]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#55dddd]" /> EN DIRECT
            </div>
            <h2 className="truncate text-xl font-black tracking-tight">{channelName}</h2>
            <p className="mt-1 line-clamp-2 text-xs text-white/75">{programTitle || 'Programme en cours non renseigné'}</p>
            {programTime && <p className="mt-1 text-[10px] tabular-nums text-white/45">{programTime}</p>}
            <p className="mt-2 text-[9px] font-medium text-white/45">{groups.length} chaîne{groups.length > 1 ? 's' : ''} dans cette catégorie · Glisser pour changer</p>
          </div>
          <button
            type="button"
            onClick={onToggleFavorite}
            aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            aria-pressed={isFavorite}
            className={`mb-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border backdrop-blur-md ${isFavorite ? 'border-[#d6ad55]/80 bg-[#d6ad55]/20 text-red-400' : 'border-white/20 bg-black/45 text-white/80'}`}
          >
            <Heart className="h-5 w-5" fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default NeahplusFlow;
