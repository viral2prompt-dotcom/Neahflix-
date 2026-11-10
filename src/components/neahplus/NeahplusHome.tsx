import { getNeahplusChannelLogo, getNeahplusChannelPriority } from './neahplusBranding';
import NeahplusDiscoveryShelf from './NeahplusDiscoveryShelf';
import NeahplusHero from './NeahplusHero';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { ChevronLeft, ChevronRight, Heart, Loader2, Pencil, Play, Search } from 'lucide-react';
import type { NeahplusChannel } from './neahplusCatalog';
import { currentProgram } from './neahplusCatalog';
import { foldText } from './neahplusTvUtils';

interface NeahplusHomeProps {
  channels: NeahplusChannel[];
  now: number;
  query: string;
  onQueryChange: (value: string) => void;
  onSelectChannel: (channel: NeahplusChannel) => void;
  onPrefetchChannel: (channel: NeahplusChannel, signal: AbortSignal) => Promise<unknown>;
  displayNamesByChannelId: ReadonlyMap<string, string>;
  isFavorite: (channel: NeahplusChannel) => boolean;
  onToggleFavorite: (channel: NeahplusChannel) => void;
  pendingChannelId: string | null;
  mode: 'home' | 'favorites';
  spaceName: string;
  countryLabel: string;
  onRenameSpace: () => void;
}

const categories = [
  { id: 'all', title: 'Tout', kicker: 'TOUT LE DIRECT, AU MÊME ENDROIT', subtitle: 'Toute votre sélection de chaînes, réunie dans un seul espace.', match: (_source: string) => true },
  { id: 'cinema', title: 'Cinéma', kicker: 'LE GRAND ÉCRAN À LA TÉLÉVISION', subtitle: 'Les chaînes dédiées aux films, aux grandes histoires et au septième art.', match: (source: string) => /cinema|film|movie|action|paramount|ocs|cine\s*\+|hollywood/.test(source) },
  { id: 'sport', title: 'Sport', kicker: 'AU CŒUR DES COMPÉTITIONS', subtitle: 'Les rendez-vous sportifs, les compétitions et les grandes rencontres.', match: (source: string) => /sport|eurosport|bein|football|rugby|tennis|basket|combat|golf|racing/.test(source) },
  { id: 'youth', title: 'Jeunesse', kicker: 'LES RENDEZ-VOUS DES PLUS JEUNES', subtitle: 'Des programmes pour les enfants et toute la famille.', match: (source: string) => /kids|family|piwi|gulli|jeunesse|teletoon|cartoon|boomerang|nick|disney|boing|tiji|ludikids/.test(source) },
  { id: 'documentary', title: 'Documentaires', kicker: 'SAVOIR, EXPLORER ET DÉCOUVRIR', subtitle: 'Explorez le monde, la science, l’histoire et la découverte.', match: (source: string) => /documentaire|docu|canal\+ docs|national geographic|nat geo|discovery|histoire|planete|voyage|wild/.test(source) },
  { id: 'entertainment', title: 'Divertissement', kicker: 'SÉRIES, MUSIQUE ET CULTURE', subtitle: 'Séries, musique, humour et rendez-vous populaires.', match: (source: string) => /divertissement|comedie|humour|musique|tv5|france 2|france 3|tf1|m6|tfx|w9|pop|novelas|nollywood|trace|a\+/.test(source) },
];

const NeahplusHome = ({ channels, now, query, onQueryChange, onSelectChannel, onPrefetchChannel, displayNamesByChannelId, isFavorite, onToggleFavorite, pendingChannelId, mode, spaceName, countryLabel, onRenameSpace }: NeahplusHomeProps) => {
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const homeRootRef = useRef<HTMLDivElement>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [pressedChannelId, setPressedChannelId] = useState<string | null>(null);
  const needle = foldText(query.trim());
  useEffect(() => {
    const root = homeRootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return undefined;
    const controllers = new Map<string, AbortController>();
    const visibleCards = new Map<string, Set<Element>>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const channelId = (entry.target as HTMLElement).dataset.neahplusChannelId;
        const channel = channels.find((item) => item.id === channelId);
        if (!channelId || !channel) continue;
        const cards = visibleCards.get(channelId) ?? new Set<Element>();
        if (entry.isIntersecting) {
          cards.add(entry.target);
          visibleCards.set(channelId, cards);
          if (!controllers.has(channelId)) {
            const controller = new AbortController();
            controllers.set(channelId, controller);
            void onPrefetchChannel(channel, controller.signal).catch(() => undefined);
          }
        } else {
          cards.delete(entry.target);
          if (cards.size === 0) {
            visibleCards.delete(channelId);
            controllers.get(channelId)?.abort();
            controllers.delete(channelId);
          } else {
            visibleCards.set(channelId, cards);
          }
        }
      }
    }, { root: null, rootMargin: '260px 320px', threshold: 0.01 });
    root.querySelectorAll<HTMLElement>('[data-neahplus-channel-id]').forEach((node) => observer.observe(node));
    return () => {
      observer.disconnect();
      controllers.forEach((controller) => controller.abort());
    };
  }, [channels, onPrefetchChannel, mode, needle]);
  const searchableChannels = useMemo(() => channels.filter((channel) => {
    if (!needle) return true;
    const displayName = displayNamesByChannelId.get(channel.id) ?? channel.name;
    const program = currentProgram(channel, now);
    return [displayName, channel.name, ...channel.categories, program?.title ?? ''].some((value) => foldText(value).includes(needle));
  }).sort((a, b) =>
    Number(b.countries.includes('France')) - Number(a.countries.includes('France')) ||
    getNeahplusChannelPriority(a.name, 'Tout') - getNeahplusChannelPriority(b.name, 'Tout') ||
    a.name.localeCompare(b.name, 'fr')
  ), [channels, needle, now, displayNamesByChannelId]);

  const scrollRow = (id: string, direction: 1 | -1) => {
    const row = rowRefs.current[id];
    if (row) row.scrollBy({ left: row.clientWidth * direction * 0.85, behavior: 'smooth' });
  };

  const renderChannelCard = (channel: NeahplusChannel) => {
    const program = currentProgram(channel, now);
    const displayName = displayNamesByChannelId.get(channel.id) ?? channel.name;
    const favorited = isFavorite(channel);
    const pending = pendingChannelId === channel.id;
    const loading = pending || pressedChannelId === channel.id;
    const logo = channel.logo ?? getNeahplusChannelLogo(channel.name);
    const touchProps = {
      onPointerDown: () => setPressedChannelId(channel.id),
      onPointerUp: () => setPressedChannelId(null),
      onPointerCancel: () => setPressedChannelId(null),
      onLostPointerCapture: () => setPressedChannelId(null),
      onPointerLeave: (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (event.pointerType === 'mouse' && !pending) setPressedChannelId(null);
      },
    };
    return (
      <article key={channel.id} data-neahplus-channel-id={channel.id} className={`group w-[calc(50vw-2.25rem)] max-w-[230px] shrink-0 snap-start overflow-visible rounded-xl border bg-[#102027] transition-[border-color,box-shadow,transform,outline] duration-75 sm:w-[190px] ${loading ? '!duration-0 border-[#173b5e] bg-[#173b5e]/10 ring-2 ring-[#173b5e]/80 outline outline-2 outline-[#173b5e] shadow-lg shadow-[#173b5e]/35' : 'border-white/10 hover:border-[#20c7c7]/50'}`}>
        <button type="button" onClick={() => onSelectChannel(channel)} disabled={pending} aria-label={loading ? `Connexion à ${displayName}` : `Regarder ${displayName}`} {...touchProps} className="block w-full text-left transition-transform duration-75 active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#20c7c7]">
          <div className="relative flex aspect-[16/10] items-center justify-center overflow-hidden bg-gradient-to-br from-[#153b43] via-[#10252e] to-[#09151c] p-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#20c7c7]/30 bg-[#20c7c7]/10 text-lg font-black text-[#67e5e5]">{displayName.slice(0, 2).toUpperCase()}</span>
            {logo && <img src={logo} alt={`Logo ${displayName}`} loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none'; }} className="absolute inset-0 m-auto max-h-[75%] max-w-[78%] object-contain drop-shadow-xl transition group-hover:scale-105" />}
            <span className={`absolute left-2 top-2 rounded-md px-2 py-1 text-[9px] font-black uppercase ${program ? 'bg-emerald-500 text-[#041a16]' : 'bg-black/50 text-white/70'}`}>{program ? 'En direct' : 'TV'}</span>
            {loading && <span className="absolute inset-0 flex items-center justify-center gap-2 bg-[#061519]/75 text-xs font-bold text-[#8af0f0]"><Loader2 className="h-4 w-4 animate-spin" /> Connexion…</span>}
          </div>
          <div className="px-3 pb-2 pt-3">
            <p className="truncate text-xs font-bold text-white sm:text-sm">{displayName}</p>
            <p className="mt-1 line-clamp-2 min-h-8 text-[10px] leading-4 text-white/45">{program?.title ?? channel.categories.slice(0, 2).join(' · ') ?? 'Chaîne TV'}</p>
          </div>
        </button>
        <div className="flex items-center gap-1.5 px-3 pb-3">
          <button type="button" onClick={() => onSelectChannel(channel)} disabled={pending} {...touchProps} className="inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#20c7c7] px-2 py-2 text-[10px] font-bold text-[#061519] transition hover:bg-[#55dddd] active:scale-[0.97] active:ring-2 active:ring-[#55dddd] disabled:opacity-70"><Play className="h-3 w-3 fill-current" /> {loading ? 'Connexion…' : 'Regarder'}</button>
          <button type="button" onClick={() => onToggleFavorite(channel)} aria-label={favorited ? `Retirer ${displayName} de mon espace NEAHPLUS` : `Ajouter ${displayName} à mon espace NEAHPLUS`} aria-pressed={favorited} title={favorited ? 'Dans mon espace NEAHPLUS' : 'Ajouter à mon espace NEAHPLUS'} className={`inline-flex shrink-0 items-center justify-center gap-1 rounded-lg border px-2 py-2 text-[10px] font-semibold transition ${favorited ? 'border-[#d6ad55]/85 bg-[#d6ad55]/10 text-red-500 shadow-[0_0_10px_rgba(214,173,85,.12)]' : 'border-[#d6ad55]/55 bg-[#d6ad55]/[0.04] text-white/65 hover:border-[#e7c878] hover:bg-[#d6ad55]/10 hover:text-[#f0d58a]'}`}><Heart className="h-3.5 w-3.5" fill={favorited ? 'currentColor' : 'none'} /><span>{favorited ? 'Ajoutée' : 'Ajouter'}</span></button>
        </div>
      </article>
    );
  };

  return (
    <div ref={homeRootRef} className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 pb-10 sm:gap-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#20c7c7]">{mode === 'favorites' ? 'VOTRE SÉLECTION' : `TÉLÉVISION EN DIRECT · ${countryLabel.toUpperCase()}`}</p>
          <div className="mt-1 flex items-center gap-2"><h1 className="min-w-0 truncate text-xl font-black text-white sm:text-2xl">{mode === 'favorites' ? spaceName : 'Découvrez NEAHPLUS'}</h1>{mode === 'favorites' && <button type="button" onClick={onRenameSpace} aria-label="Renommer mon espace NEAHPLUS" title="Renommer mon espace" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/40 transition hover:bg-white/10 hover:text-[#75e6e6]"><Pencil className="h-3.5 w-3.5" /></button>}</div>
          {mode === 'favorites' && <p className="mt-1 text-xs text-white/45">Toutes vos chaînes réunies au même endroit.</p>}
        </div>
        <div className="relative z-30 w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input value={query} onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)} onChange={(event) => onQueryChange(event.target.value)} type="search" placeholder="Rechercher une chaîne…" aria-label="Rechercher une chaîne" aria-expanded={Boolean(query.trim() && searchFocused && searchableChannels.length)} className="w-full rounded-xl border border-white/10 bg-white/[0.06] py-3 pl-10 pr-4 text-sm text-white placeholder:text-white/40 outline-none transition focus:border-[#20c7c7]" />
          {query.trim() && searchFocused && (
            <div className="absolute left-0 right-0 top-full z-[100] mt-2 max-h-72 overflow-y-auto rounded-xl border border-white/25 bg-[#0b2028] py-1 shadow-2xl shadow-black/50" role="listbox" aria-label="Résultats de recherche">
              {searchableChannels.length ? searchableChannels.slice(0, 8).map((channel) => {
                const name = displayNamesByChannelId.get(channel.id) ?? channel.name;
                return <button key={channel.id} type="button" role="option" aria-selected="false" onMouseDown={(event) => event.preventDefault()} onClick={() => { onSelectChannel(channel); onQueryChange(""); setSearchFocused(false); }} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-white/85 transition hover:bg-white/10 hover:text-white"><span className="min-w-0 flex-1 truncate font-semibold">{name}</span><span className="shrink-0 text-[10px] text-white/35">Regarder</span></button>;
              }) : <p className="px-3 py-3 text-xs text-white/45">Aucune chaîne trouvée.</p>}
            </div>
          )}
        </div>
      </div>

      {mode === 'home' ? (
        <>
          <NeahplusHero />
          <NeahplusDiscoveryShelf />
          <div id="neahplus-categories" className="scroll-mt-6 space-y-10 sm:space-y-12">
          {categories.map((category) => {
            const rowChannels = category.id === 'all'
              ? searchableChannels
              : searchableChannels.filter((channel) => category.match(foldText([channel.name, ...channel.categories].join(' '))));
            if (rowChannels.length === 0) return null;
            return (
              <section key={category.id} className="space-y-4" aria-label={`Catégorie ${category.title}`}>
                <div className="flex items-end justify-between gap-3 border-b border-white/[0.08] pb-3">
                  <div className="min-w-0">
                    <p className="inline-flex max-w-full rounded-full border border-white/35 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-white/80">{category.kicker}</p>
                    <h2 className="mt-1 text-xl font-black text-white sm:text-2xl">{category.title}</h2>
                    <p className="mt-1 max-w-2xl text-xs leading-5 text-white/45 sm:text-sm">{category.subtitle}</p>
                    <p className="mt-1 text-[10px] text-white/30">{rowChannels.length} chaîne{rowChannels.length > 1 ? 's' : ''}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button type="button" onClick={() => scrollRow(category.id, -1)} aria-label={`Chaînes précédentes : ${category.title}`} className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-white/65 transition hover:border-[#20c7c7]/50 hover:text-white"><ChevronLeft className="h-4 w-4" /></button>
                    <button type="button" onClick={() => scrollRow(category.id, 1)} aria-label={`Chaînes suivantes : ${category.title}`} className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-white/65 transition hover:border-[#20c7c7]/50 hover:text-white"><ChevronRight className="h-4 w-4" /></button>
                  </div>
                </div>
                <div ref={(element) => { rowRefs.current[category.id] = element; }} className="flex gap-3 overflow-x-auto overscroll-x-contain pb-3 [scrollbar-width:thin] [scrollbar-color:rgba(32,199,199,.35)_transparent] snap-x snap-mandatory [touch-action:pan-x_pan-y] sm:gap-4" aria-label={`Chaînes de la catégorie ${category.title}, défilement horizontal`}>
                  {rowChannels.map(renderChannelCard)}
                </div>
              </section>
            );
          })}
          </div>
        </>
      ) : (
        <section className="space-y-4">
          <div className="border-b border-white/[0.08] pb-3">
            <h2 className="text-xl font-black text-white sm:text-2xl">Mes chaînes</h2>
            <p className="mt-1 text-xs text-white/45">{searchableChannels.length} chaîne{searchableChannels.length > 1 ? 's' : ''} · faites défiler horizontalement</p>
          </div>
          {searchableChannels.length === 0 ? (
            <p className="rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center text-sm text-white/50">{channels.length === 0 ? 'Votre espace est encore vide. Ajoutez une chaîne avec le bouton « Ajouter » pour la retrouver ici.' : 'Aucune de vos chaînes ne correspond à cette recherche.'}</p>
          ) : (
            <div className="flex gap-3 overflow-x-auto overscroll-x-contain pb-3 [scrollbar-width:thin] [scrollbar-color:rgba(32,199,199,.35)_transparent] snap-x snap-mandatory [touch-action:pan-x_pan-y] sm:gap-4">{searchableChannels.map(renderChannelCard)}</div>
          )}
        </section>
      )}
    </div>
  );
};

export default NeahplusHome;
