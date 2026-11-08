import { useEffect, useState } from 'react';
import { ArrowDown, Film, Loader2, Sparkles } from 'lucide-react';

interface HeroItem {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string;
}

const IMAGE_BASE = 'https://image.tmdb.org/t/p/original';

const NeahplusHero = () => {
  const [item, setItem] = useState<HeroItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/neahplus/discover?type=all&period=week', {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    }).then((response) => {
      if (!response.ok) throw new Error('Découverte indisponible');
      return response.json();
    }).then((data: { results?: HeroItem[] }) => {
      if (!controller.signal.aborted && Array.isArray(data.results)) {
        const selected = data.results.find((entry) => entry.backdropPath || entry.posterPath);
        if (selected) setItem(selected);
      }
    }).catch(() => {
      // Le bandeau de marque reste disponible même sans réponse TMDB.
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, []);

  const image = item?.backdropPath || item?.posterPath;
  const scrollToChannels = () => document.getElementById('neahplus-categories')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <section className="relative isolate flex min-h-[300px] items-end overflow-hidden rounded-[1.6rem] border border-[#20c7c7]/20 bg-[#0b2028] shadow-2xl shadow-black/20 sm:min-h-[390px]" aria-label="À la une NEAHPLUS">
      {image && <img src={`${IMAGE_BASE}${image}`} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover object-center" onError={(event) => { event.currentTarget.style.display = 'none'; }} />}
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#061519] via-[#061519]/85 to-[#061519]/25" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#061519] via-transparent to-black/10" />
      <div className="max-w-3xl p-6 sm:p-10 lg:p-12">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#d6ad55]/35 bg-black/25 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-[#f0d58a]">
          <Sparkles className="h-3 w-3" /> NEAHPLUS · À LA UNE
        </div>
        <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.24em] text-[#55dddd]">Votre télévision, votre univers</p>
        <h2 className="mt-2 max-w-2xl text-3xl font-black leading-tight text-white drop-shadow-lg sm:text-5xl">{item?.title || 'Toute la télévision, au même endroit.'}</h2>
        <p className="mt-3 line-clamp-3 max-w-xl text-xs leading-6 text-white/75 sm:text-sm">{item?.overview || 'Retrouvez vos chaînes, explorez vos univers préférés et découvrez de nouveaux programmes dans une expérience pensée pour vous.'}</p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button type="button" onClick={scrollToChannels} className="inline-flex items-center gap-2 rounded-xl bg-[#20c7c7] px-5 py-3 text-xs font-extrabold text-[#061519] shadow-lg shadow-[#20c7c7]/15 transition hover:bg-[#55dddd]">
            <ArrowDown className="h-4 w-4" /> Explorer les chaînes
          </button>
          {item && <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-white/55"><Film className="h-3.5 w-3.5" /> {item.mediaType === 'movie' ? 'Film à la une' : 'Série à la une'}</span>}
          {loading && !item && <Loader2 className="h-4 w-4 animate-spin text-[#55dddd]" aria-label="Chargement de la sélection" />}
        </div>
        {item && <p className="mt-5 text-[9px] text-white/35">Sélection découverte · Métadonnées TMDB</p>}
      </div>
    </section>
  );
};

export default NeahplusHero;
