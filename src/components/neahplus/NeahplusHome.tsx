import { getNeahplusChannelLogo, getNeahplusChannelPriority } from './neahplusBranding';
import { useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Heart, Loader2, Pencil, Play, Search, Radio } from 'lucide-react';
import type { NeahplusChannel } from './neahplusCatalog';
import { currentProgram } from './neahplusCatalog';
import { foldText, formatTime } from './neahplusTvUtils';

interface NeahplusHomeProps {
  channels: NeahplusChannel[];
  now: number;
  query: string;
  onQueryChange: (value: string) => void;
  onSelectChannel: (channel: NeahplusChannel) => void;
  displayNamesByChannelId: ReadonlyMap<string, string>;
  isFavorite: (channel: NeahplusChannel) => boolean;
  onToggleFavorite: (channel: NeahplusChannel) => void;
  pendingChannelId: string | null;
  mode: 'home' | 'favorites';
  spaceName: string;
  countryLabel: string;
  onRenameSpace: () => void;
}

const categoryLabels = ['Tout', 'En direct', 'Cinéma', 'Sport', 'Jeunesse', 'Documentaires', 'Divertissement'];
const categoryMatches = (channel: NeahplusChannel, category: string, live: boolean): boolean => {
  if (category === 'Tout') return true;
  if (category === 'En direct') return live;
  const source = foldText([channel.name, ...channel.categories].join(' '));
  const patterns: Record<string, RegExp> = {
    'Cinéma': /cinema|film|movie|action|paramount|ocs|cine\s*\+/,
    'Sport': /sport|eurosport|bein|football|rugby|tennis|basket|combat/,
    'Jeunesse': /kids|family|piwi|gulli|jeunesse|teletoon|cartoon|boomerang|nick|disney|boing|tiji|ludikids/,
    'Documentaires': /documentaire|docu|canal\+ docs|national geographic|nat geo|discovery|histoire|planete|voyage/,
    'Divertissement': /divertissement|comedie|humour|musique|tv5|france 2|france 3|tf1|m6|tfx|w9|pop|novelas|nollywood|trace|a\+/,
  };
  return patterns[category]?.test(source) ?? false;
};

const NeahplusHome = ({ channels, now, query, onQueryChange, onSelectChannel, displayNamesByChannelId, isFavorite, onToggleFavorite, pendingChannelId, mode, spaceName, countryLabel, onRenameSpace }: NeahplusHomeProps) => {
  const [category, setCategory] = useState('Tout');
  const scrollerRef = useRef<HTMLDivElement>(null);
  const filteredChannels = useMemo(() => {
    const needle = foldText(query.trim());
    return channels.filter((channel) => {
      const live = Boolean(currentProgram(channel, now));
      const displayName = displayNamesByChannelId.get(channel.id) ?? channel.name;
      const matchesQuery = !needle || [displayName, channel.name, ...channel.categories, currentProgram(channel, now)?.title ?? '']
        .some((value) => foldText(value).includes(needle));
      return matchesQuery && categoryMatches(channel, category, live);
    }).sort((a, b) =>
      Number(b.countries.includes('France')) - Number(a.countries.includes('France')) ||
      getNeahplusChannelPriority(a.name, category) - getNeahplusChannelPriority(b.name, category) || a.name.localeCompare(b.name, 'fr')
    );
  }, [channels, now, query, category, displayNamesByChannelId]);

  const featured = useMemo(() => {
    const candidates = filteredChannels.map((channel) => ({ channel, program: currentProgram(channel, now) }))
      .filter((item) => item.program)
      .sort((a, b) => Date.parse(a.program!.start) - Date.parse(b.program!.start));
    return candidates[0] ?? null;
  }, [filteredChannels, now]);

  const scrollChannels = (direction: 1 | -1) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollBy({ left: scroller.clientWidth * direction, behavior: 'smooth' });
  };

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 pb-6 sm:gap-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#20c7c7]">{mode === 'favorites' ? 'VOTRE SÉLECTION' : `TÉLÉVISION EN DIRECT · ${countryLabel.toUpperCase()}`}</p>
          <div className="mt-1 flex items-center gap-2"><h1 className="min-w-0 truncate text-xl font-black text-white sm:text-2xl">{mode === 'favorites' ? spaceName : 'Découvrez NEAHPLUS'}</h1>{mode === 'favorites' && <button type="button" onClick={onRenameSpace} aria-label="Renommer mon espace NEAHPLUS" title="Renommer mon espace" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/40 transition hover:bg-white/10 hover:text-[#75e6e6]"><Pencil className="h-3.5 w-3.5" /></button>}</div>
          {mode === 'favorites' && <p className="mt-1 text-xs text-white/45">Toutes vos chaînes réunies au même endroit.</p>}
        </div>
        <label className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input value={query} onChange={(event) => onQueryChange(event.target.value)} type="search" placeholder="Rechercher une chaîne…" className="w-full rounded-xl border border-white/10 bg-white/[0.06] py-3 pl-10 pr-4 text-sm text-white placeholder:text-white/40 outline-none transition focus:border-[#20c7c7]" />
        </label>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filtrer les chaînes par catégorie">
        {categoryLabels.map((label) => (
          <button key={label} type="button" onClick={() => { setCategory(label); scrollerRef.current?.scrollTo({ left: 0, behavior: 'smooth' }); }} aria-pressed={category === label} className={`shrink-0 rounded-full border px-4 py-2 text-xs font-bold transition ${category === label ? 'border-[#20c7c7] bg-[#20c7c7] text-[#061519]' : 'border-white/10 bg-white/[0.04] text-white/65 hover:border-[#20c7c7]/50 hover:text-white'}`}>
            {label}
          </button>
        ))}
      </div>

      {featured && category !== 'Tout' && category !== 'En direct' && (
        <section className="relative flex min-h-[130px] items-center overflow-hidden rounded-2xl border border-[#20c7c7]/20 bg-gradient-to-r from-[#0c3037] via-[#10252d] to-[#101a22] p-5 sm:min-h-[165px] sm:p-7">
          <div className="relative z-10 min-w-0">
            <span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#51dddd]"><Radio className="h-3 w-3" /> À l’antenne</span>
            <h2 className="mt-2 line-clamp-2 text-xl font-black text-white sm:text-2xl">{featured.program!.title}</h2>
            <p className="mt-1 text-xs text-white/60">{displayNamesByChannelId.get(featured.channel.id) ?? featured.channel.name} · {formatTime(featured.program!.start)}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => onSelectChannel(featured.channel)} className="inline-flex items-center gap-2 rounded-lg bg-[#20c7c7] px-4 py-2 text-xs font-bold text-[#061519] hover:bg-[#55dddd]"><Play className="h-3.5 w-3.5 fill-current" /> Regarder</button>
              <button type="button" onClick={() => onToggleFavorite(featured.channel)} aria-label={isFavorite(featured.channel) ? 'Retirer de mon espace NEAHPLUS' : 'Ajouter à mon espace NEAHPLUS'} aria-pressed={isFavorite(featured.channel)} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition ${isFavorite(featured.channel) ? 'border-[#20c7c7]/40 bg-[#20c7c7]/10 text-[#75e6e6]' : 'border-white/10 bg-white/5 text-white/70 hover:border-[#20c7c7]/40 hover:text-white'}`}><Heart className="h-3.5 w-3.5" fill={isFavorite(featured.channel) ? 'currentColor' : 'none'} /> {isFavorite(featured.channel) ? 'Dans mon espace' : 'Ajouter à mon espace'}</button>
            </div>
          </div>
          {(featured.channel.logo ?? getNeahplusChannelLogo(featured.channel.name)) && <img src={featured.channel.logo ?? getNeahplusChannelLogo(featured.channel.name) ?? undefined} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} className="absolute right-5 max-h-[75%] max-w-[28%] object-contain opacity-25" />}
        </section>
      )}

      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white sm:text-lg">{mode === 'favorites' ? 'Mes chaînes' : category === 'Tout' ? 'Toutes les chaînes' : category === 'En direct' ? 'Chaînes en direct' : `Chaînes · ${category}`}</h2>
          <span className="text-xs text-white/40">{filteredChannels.length} chaîne{filteredChannels.length > 1 ? 's' : ''} · balayez horizontalement</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" onClick={() => scrollChannels(-1)} aria-label="Bloc précédent de chaînes" className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-white/65 transition hover:border-[#20c7c7]/50 hover:text-white"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" onClick={() => scrollChannels(1)} aria-label="Bloc suivant de chaînes" className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-white/65 transition hover:border-[#20c7c7]/50 hover:text-white"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      {filteredChannels.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center text-sm text-white/50">{mode === 'favorites' ? (channels.length === 0 ? 'Votre espace est encore vide. Ajoutez une chaîne avec le bouton « Ajouter » pour la retrouver ici.' : 'Aucune de vos chaînes ne correspond à cette recherche ou catégorie.') : 'Aucune chaîne dans cette catégorie pour le moment.'}</p>
      ) : (
        <div ref={scrollerRef} className="grid auto-cols-[calc(50%_-_0.375rem)] grid-flow-col grid-rows-1 gap-3 overflow-x-auto overscroll-x-contain pb-3 [scrollbar-width:thin] [scrollbar-color:rgba(32,199,199,.35)_transparent] snap-x snap-mandatory touch-pan-x sm:auto-cols-[calc(25%_-_0.65625rem)] sm:gap-3.5" aria-label="Chaînes de la catégorie, défilement horizontal">
          {filteredChannels.map((channel) => {
            const program = currentProgram(channel, now);
            const displayName = displayNamesByChannelId.get(channel.id) ?? channel.name;
            const favorited = isFavorite(channel);
            const pending = pendingChannelId === channel.id;
            return (
              <article key={channel.id} className={`group min-w-0 snap-start overflow-hidden rounded-xl border bg-[#102027] transition ${pending ? 'border-[#55dddd] ring-2 ring-[#20c7c7]/40 shadow-lg shadow-[#20c7c7]/10' : 'border-white/10 hover:border-[#20c7c7]/50'}`}>
                <button type="button" onClick={() => onSelectChannel(channel)} disabled={pending} aria-label={pending ? `Connexion à ${displayName}` : `Regarder ${displayName}`} className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#20c7c7]">
                  <div className="relative flex aspect-[16/10] items-center justify-center overflow-hidden bg-gradient-to-br from-[#153b43] via-[#10252e] to-[#09151c] p-4">
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#20c7c7]/30 bg-[#20c7c7]/10 text-lg font-black text-[#67e5e5]">{displayName.slice(0, 2).toUpperCase()}</span>
                    {(channel.logo ?? getNeahplusChannelLogo(channel.name)) && <img src={channel.logo ?? getNeahplusChannelLogo(channel.name) ?? undefined} alt={`Logo ${displayName}`} loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none'; }} className="absolute inset-0 m-auto max-h-[75%] max-w-[78%] object-contain drop-shadow-xl transition group-hover:scale-105" />}
                    <span className={`absolute left-2 top-2 rounded-md px-2 py-1 text-[9px] font-black uppercase ${program ? 'bg-emerald-500 text-[#041a16]' : 'bg-black/50 text-white/70'}`}>{program ? 'En direct' : 'TV'}</span>
                    {pending && <span className="absolute inset-0 flex items-center justify-center gap-2 bg-[#061519]/75 text-xs font-bold text-[#8af0f0]"><Loader2 className="h-4 w-4 animate-spin" /> Connexion…</span>}
                    <span className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/50 to-transparent" />
                  </div>
                  <div className="px-3 pb-2 pt-3">
                    <p className="truncate text-xs font-bold text-white sm:text-sm">{displayName}</p>
                    <p className="mt-1 line-clamp-2 min-h-8 text-[10px] leading-4 text-white/45">{program?.title ?? channel.categories.slice(0, 2).join(' · ') ?? 'Chaîne TV'}</p>
                  </div>
                </button>
                <div className="flex items-center gap-1.5 px-3 pb-3">
                  <button type="button" onClick={() => onSelectChannel(channel)} disabled={pending} className="inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#20c7c7] px-2 py-2 text-[10px] font-bold text-[#061519] transition hover:bg-[#55dddd] disabled:opacity-70"><Play className="h-3 w-3 fill-current" /> {pending ? 'Connexion…' : 'Regarder'}</button>
                  <button type="button" onClick={() => onToggleFavorite(channel)} aria-label={favorited ? `Retirer ${displayName} de mon espace NEAHPLUS` : `Ajouter ${displayName} à mon espace NEAHPLUS`} aria-pressed={favorited} title={favorited ? 'Dans mon espace NEAHPLUS' : 'Ajouter à mon espace NEAHPLUS'} className={`inline-flex shrink-0 items-center justify-center gap-1 rounded-lg border px-2 py-2 text-[10px] font-semibold transition ${favorited ? 'border-[#d6ad55]/85 bg-[#d6ad55]/10 text-red-500 shadow-[0_0_10px_rgba(214,173,85,.12)]' : 'border-[#d6ad55]/55 bg-[#d6ad55]/[0.04] text-white/65 hover:border-[#e7c878] hover:bg-[#d6ad55]/10 hover:text-[#f0d58a]'}`}><Heart className="h-3.5 w-3.5" fill={favorited ? 'currentColor' : 'none'} /><span>{favorited ? 'Ajoutée' : 'Ajouter'}</span></button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default NeahplusHome;
