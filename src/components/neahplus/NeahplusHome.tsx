import { useMemo, useState } from 'react';
import { Play, Search, Radio, Clock3, Tv } from 'lucide-react';
import type { NeahplusChannel, NeahplusProgram } from './neahplusCatalog';
import { currentProgram } from './neahplusCatalog';
import { formatTime } from './neahplusTvUtils';

interface NeahplusHomeProps {
  channels: NeahplusChannel[];
  now: number;
  query: string;
  onQueryChange: (value: string) => void;
  onSelectChannel: (channel: NeahplusChannel) => void;
}

interface ProgramItem {
  channel: NeahplusChannel;
  program: NeahplusProgram;
  live: boolean;
}

const categoryLabels = ['Tout', 'En direct', 'Cinéma', 'Sport', 'Jeunesse', 'Documentaires', 'Divertissement'];
const categoryMatches = (channel: NeahplusChannel, category: string): boolean => {
  const source = [channel.name, ...channel.categories].join(' ').toLocaleLowerCase('fr');
  const patterns: Record<string, RegExp> = {
    'Cinéma': /cin[eé]ma|film|movie|action|cin[eé]\\s*\\+|paramount|ocs/,
    'Sport': /sport|eurosport|bein|football|rugby|tennis|basket/,
    'Jeunesse': /piwi|gulli|jeunesse|t[eé]l[eé]toon|cartoon|nick|disney junior/,
    'Documentaires': /documentaire|docu|national geographic|nat geo|discovery|histoire tv/,
    'Divertissement': /divertissement|com[eé]die|humour|musique|tv5|france 2|france 3|tf1|m6/,
  };
  return patterns[category]?.test(source) ?? false;
};

const NeahplusHome = ({ channels, now, query, onQueryChange, onSelectChannel }: NeahplusHomeProps) => {
  const [category, setCategory] = useState('Tout');

  const items = useMemo<ProgramItem[]>(() => channels.flatMap((channel) => {
    const live = currentProgram(channel, now);
    const upcoming = channel.programs
      .filter((program) => Date.parse(program.start) > now)
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
      .slice(0, 2);
    return [
      ...(live ? [{ channel, program: live, live: true }] : []),
      ...upcoming.map((program) => ({ channel, program, live: false })),
    ];
  }).sort((a, b) => Number(b.live) - Number(a.live) || Date.parse(a.program.start) - Date.parse(b.program.start)), [channels, now]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('fr');
    return items.filter(({ channel, program, live }) => {
      const matchesQuery = !needle || [channel.name, program.title, ...channel.categories]
        .some((value) => value.toLocaleLowerCase('fr').includes(needle));
      const matchesCategory = category === 'Tout' ||
        (category === 'En direct' ? live : categoryMatches(channel, category));
      return matchesQuery && matchesCategory;
    });
  }, [items, query, category]);

  const featured = items.find((item) => item.live) ?? items[0] ?? null;
  const liveItems = filtered.filter((item) => item.live).slice(0, 12);
  const upcomingItems = filtered.filter((item) => !item.live).slice(0, 16);
  const frenchChannels = channels.filter((channel) => channel.countries.includes('France')).slice(0, 16);

  const ProgramCard = ({ item, compact = false }: { item: ProgramItem; compact?: boolean }) => (
    <button
      type="button"
      onClick={() => onSelectChannel(item.channel)}
      className={`group min-w-0 overflow-hidden rounded-xl border border-white/[0.07] bg-[#15151b] text-left transition duration-200 hover:-translate-y-1 hover:border-white/20 hover:bg-[#1c1c24] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 ${compact ? 'w-[155px] shrink-0 sm:w-[190px]' : 'w-full'}`}
    >
      <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-gradient-to-br from-[#29232a] via-[#17171d] to-[#101014] p-4">
        {item.channel.logo ? (
          <img src={item.channel.logo} alt="" loading="lazy" className="max-h-16 max-w-[58%] object-contain drop-shadow-xl transition duration-300 group-hover:scale-105" />
        ) : (
          <Tv className="h-10 w-10 text-white/20" />
        )}
        <span className={`absolute left-2 top-2 rounded px-2 py-1 text-[9px] font-black uppercase tracking-wider ${item.live ? 'bg-red-600 text-white' : 'bg-black/60 text-white/75'}`}>
          {item.live ? 'En direct' : 'À suivre'}
        </span>
        <span className="absolute bottom-2 right-2 rounded bg-black/65 px-2 py-1 text-[10px] font-semibold tabular-nums text-white/85">
          {formatTime(item.program.start)}
        </span>
        <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition group-hover:opacity-100">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-600 text-white shadow-xl"><Play className="ml-0.5 h-4 w-4 fill-current" /></span>
        </span>
      </div>
      <div className="p-3">
        <p className="line-clamp-2 min-h-10 text-xs font-bold leading-5 text-white sm:text-sm">{item.program.title}</p>
        <p className="mt-1 truncate text-[11px] text-white/45">{item.channel.name}</p>
        <p className="mt-1 text-[10px] text-white/30">{formatTime(item.program.start)} – {formatTime(item.program.end)}</p>
      </div>
    </button>
  );

  const Section = ({ title, data, compact = false }: { title: string; data: ProgramItem[]; compact?: boolean }) => data.length > 0 ? (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold tracking-tight text-white sm:text-lg">{title}</h2>
      </div>
      <div className={compact ? 'flex gap-3 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden' : 'grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4'}>
        {data.map((item) => <ProgramCard key={`${item.channel.id}-${item.program.start}`} item={item} compact={compact} />)}
      </div>
    </section>
  ) : null;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-7 pb-10">
      {featured && (
        <section className="relative isolate flex min-h-[250px] overflow-hidden rounded-2xl border border-white/[0.07] bg-[#17131a] sm:min-h-[340px] lg:min-h-[390px]">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_75%_40%,rgba(160,30,45,.32),transparent_55%),linear-gradient(105deg,#17151b_0%,#21161d_48%,#101014_100%)]" />
          {featured.channel.logo && <img src={featured.channel.logo} alt="" className="absolute right-[8%] top-1/2 max-h-[48%] max-w-[35%] -translate-y-1/2 object-contain opacity-20 blur-[1px] sm:opacity-35" />}
          <div className="relative z-10 flex max-w-2xl flex-col items-start justify-center p-6 sm:p-10 lg:p-14">
            <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-red-600 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-white">
              <Radio className="h-3 w-3" /> Sélection NEAHPLUS
            </span>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/50">{featured.channel.name}</p>
            <h1 className="max-w-xl text-3xl font-black leading-tight text-white sm:text-4xl lg:text-5xl">{featured.program.title}</h1>
            <p className="mt-3 flex items-center gap-2 text-xs text-white/55 sm:text-sm">
              {featured.live ? 'Actuellement à l’antenne' : 'Prochain rendez-vous'}
              <span>·</span><Clock3 className="h-3.5 w-3.5" /> {formatTime(featured.program.start)} – {formatTime(featured.program.end)}
            </p>
            <button type="button" onClick={() => onSelectChannel(featured.channel)} className="mt-6 inline-flex items-center gap-2 rounded-md bg-red-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-500">
              <Play className="h-4 w-4 fill-current" /> Regarder maintenant
            </button>
          </div>
        </section>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-red-400">Votre télévision</p>
          <h2 className="mt-1 text-xl font-black text-white sm:text-2xl">Découvrez NEAHPLUS</h2>
        </div>
        <label className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
          <input value={query} onChange={(event) => onQueryChange(event.target.value)} type="search" placeholder="Rechercher un programme ou une chaîne…" className="w-full rounded-lg border border-white/10 bg-white/[0.04] py-3 pl-10 pr-4 text-sm text-white placeholder:text-white/35 outline-none transition focus:border-red-500/60" />
        </label>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {categoryLabels.map((label) => (
          <button key={label} type="button" onClick={() => setCategory(label)} className={`shrink-0 rounded-md px-4 py-2 text-xs font-bold transition ${category === label ? 'bg-white text-black' : 'bg-white/[0.06] text-white/60 hover:bg-white/10 hover:text-white'}`}>
            {label}
          </button>
        ))}
      </div>

      <Section title="En direct maintenant" data={liveItems} compact />
      <Section title="À suivre sur vos chaînes" data={upcomingItems} compact />
      <section className="space-y-3">
        <h2 className="text-base font-bold text-white sm:text-lg">Chaînes françaises</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {frenchChannels.map((channel) => (
            <button key={channel.id} type="button" onClick={() => onSelectChannel(channel)} className="flex min-w-0 items-center gap-3 rounded-xl border border-white/[0.07] bg-[#15151b] p-3 text-left transition hover:border-white/20 hover:bg-[#1c1c24]">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] p-1.5">{channel.logo ? <img src={channel.logo} alt="" loading="lazy" className="max-h-full max-w-full object-contain" /> : <Tv className="h-5 w-5 text-white/30" />}</span>
              <span className="min-w-0 truncate text-xs font-semibold text-white/85">{channel.name}</span>
            </button>
          ))}
        </div>
      </section>
      {filtered.length === 0 && <p className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-10 text-center text-sm text-white/45">Aucun programme ne correspond à votre recherche.</p>}
    </div>
  );
};

export default NeahplusHome;
