import { useEffect, useState } from 'react';
import { ChevronRight, Film, Loader2, Star, Tv } from 'lucide-react';

interface DiscoveryItem {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  overview: string;
  posterPath: string | null;
  releaseDate: string;
  voteAverage: number | null;
}

const IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

const NeahplusDiscoveryShelf = () => {
  const [items, setItems] = useState<DiscoveryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      try {
        const response = await fetch('/api/neahplus/discover?type=all&period=week', {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) throw new Error('Découverte indisponible');
        const data: unknown = await response.json();
        if (!data || typeof data !== 'object' || !('results' in data) || !Array.isArray(data.results)) {
          throw new Error('Réponse de découverte invalide');
        }
        setItems(data.results.filter((item: unknown): item is DiscoveryItem => {
          if (!item || typeof item !== 'object') return false;
          const value = item as Partial<DiscoveryItem>;
          return Number.isInteger(value.id) &&
            (value.mediaType === 'movie' || value.mediaType === 'tv') &&
            typeof value.title === 'string' && value.title.length > 0;
        }).slice(0, 12));
      } catch {
        if (!controller.signal.aborted) setItems([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void load();
    return () => controller.abort();
  }, []);

  if (!loading && items.length === 0) return null;

  return (
    <section className="space-y-3" aria-label="Films et séries à découvrir">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#d6ad55]">Sélection éditoriale</p>
          <h2 className="mt-1 text-lg font-black text-white sm:text-xl">À découvrir cette semaine</h2>
          <p className="mt-1 text-xs text-white/45">Films et séries tendance, en dehors du programme TV en direct.</p>
        </div>
        <span className="shrink-0 text-[10px] font-semibold text-white/35">TMDB</span>
      </div>

      {loading ? (
        <div className="flex min-h-36 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.025]">
          <Loader2 className="h-5 w-5 animate-spin text-[#d6ad55]" />
          <span className="ml-2 text-xs text-white/45">Chargement des découvertes…</span>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto overscroll-x-contain pb-2 [scrollbar-width:thin] [scrollbar-color:rgba(214,173,85,.35)_transparent] snap-x snap-mandatory touch-pan-x">
          {items.map((item) => {
            const year = item.releaseDate ? item.releaseDate.slice(0, 4) : '';
            const url = `https://www.themoviedb.org/${item.mediaType}/${item.id}`;
            return (
              <article key={`${item.mediaType}-${item.id}`} className="w-32 shrink-0 snap-start sm:w-40">
                <a href={url} target="_blank" rel="noopener noreferrer" className="group block">
                  <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-white/10 bg-[#17232a] shadow-lg transition group-hover:-translate-y-1 group-hover:border-[#d6ad55]/60">
                    {item.posterPath ? (
                      <img src={`${IMAGE_BASE}${item.posterPath}`} alt={`Affiche de ${item.title}`} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-white/35">
                        {item.mediaType === 'movie' ? <Film className="h-8 w-8" /> : <Tv className="h-8 w-8" />}
                        <span className="text-center text-xs font-semibold">{item.title}</span>
                      </div>
                    )}
                    <span className="absolute left-2 top-2 rounded-md border border-[#d6ad55]/40 bg-black/75 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-[#f0d58a]">
                      {item.mediaType === 'movie' ? 'Film' : 'Série'}
                    </span>
                    {item.voteAverage !== null && item.voteAverage > 0 && (
                      <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-black/80 px-1.5 py-1 text-[10px] font-bold text-[#f0d58a]">
                        <Star className="h-3 w-3 fill-current" /> {item.voteAverage.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-2 line-clamp-2 text-xs font-bold text-white transition group-hover:text-[#f0d58a]">{item.title}</h3>
                  <p className="mt-1 text-[10px] text-white/40">{year || (item.mediaType === 'movie' ? 'Film' : 'Série')}</p>
                </a>
              </article>
            );
          })}
        </div>
      )}
      <p className="text-[9px] text-white/25">Affiches et informations fournies par TMDB. Cette sélection ne constitue pas un guide des horaires de diffusion.</p>
    </section>
  );
};

export default NeahplusDiscoveryShelf;
