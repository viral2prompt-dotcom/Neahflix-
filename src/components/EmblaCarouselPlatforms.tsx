import React, { useCallback, useEffect, useRef, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PrefetchLink as Link } from '@/routing/PrefetchLink';
import { useTranslation } from 'react-i18next';

interface PlatformItem {
  id: number;
  src?: string;
  alt: string;
  video?: string;
  route?: string;
  href?: string;
  internalRoute?: string;
  label?: string;
  brandClass?: string;
}

interface EmblaCarouselPlatformsProps {
  title?: string | React.ReactNode;
  items: PlatformItem[];
}

const EmblaCarouselPlatforms: React.FC<EmblaCarouselPlatformsProps> = ({ title, items }) => {
  const { t } = useTranslation();
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: 'start',
    dragFree: true,
    containScroll: 'keepSnaps',
    slidesToScroll: 1,
    skipSnaps: false,
    duration: 25,
    loop: false
  });
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const [focalId, setFocalId] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!emblaApi) return;
    const updateArrows = () => {
      try {
        setCanScrollPrev(emblaApi.canScrollPrev());
        setCanScrollNext(emblaApi.canScrollNext());
      } catch (_) {
        // noop
      }
    };
    updateArrows();
    emblaApi.on('select', updateArrows);
    emblaApi.on('reInit', updateArrows);
    return () => {
      emblaApi.off('select', updateArrows);
      emblaApi.off('reInit', updateArrows);
    };
  }, [emblaApi]);

  // Le contenu le plus proche du point focal est le seul autorisé à lire sa
  // bande-annonce. Le recalcul suit le scroll Embla dans les deux directions.
  useEffect(() => {
    if (!emblaApi) return;
    const root = emblaApi.rootNode();
    const updateFocal = () => {
      const center = root.getBoundingClientRect().left + root.getBoundingClientRect().width / 2;
      let closest: { id: number; distance: number } | null = null;
      root.querySelectorAll<HTMLElement>('[data-platform-id]').forEach((node) => {
        const rect = node.getBoundingClientRect();
        if (rect.right < 0 || rect.left > window.innerWidth) return;
        const candidate = { id: Number(node.dataset.platformId), distance: Math.abs((rect.left + rect.right) / 2 - center) };
        if (!closest || candidate.distance < closest.distance) closest = candidate;
      });
      setFocalId(closest?.id ?? null);
    };
    updateFocal();
    emblaApi.on('scroll', updateFocal);
    emblaApi.on('settle', updateFocal);
    window.addEventListener('resize', updateFocal);
    return () => { emblaApi.off('scroll', updateFocal); emblaApi.off('settle', updateFocal); window.removeEventListener('resize', updateFocal); };
  }, [emblaApi]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.querySelectorAll<HTMLVideoElement>('video[data-platform-video]').forEach((video) => {
      const active = Number(video.dataset.platformVideo) === focalId;
      if (active) {
        if (!video.dataset.loaded) { video.dataset.loaded = 'true'; video.load(); }
        void video.play().catch(() => undefined);
      } else { video.pause(); video.currentTime = 0; }
    });
  }, [focalId]);

  const getStep = useCallback(() => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1024;
    if (w >= 1536) return 4; // Larger items, fewer per step
    if (w >= 1280) return 3;
    if (w >= 1024) return 3;
    if (w >= 768) return 2;
    return 1;
  }, []);

  const handlePrev = useCallback((e?: React.MouseEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!emblaApi) return;
    try {
      const current = emblaApi.selectedScrollSnap();
      const target = Math.max(0, current - getStep());
      emblaApi.scrollTo(target);
    } catch (_) {
      emblaApi.scrollPrev();
    }
  }, [emblaApi, getStep]);

  const handleNext = useCallback((e?: React.MouseEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!emblaApi) return;
    try {
      const current = emblaApi.selectedScrollSnap();
      const snaps = emblaApi.scrollSnapList().length;
      const target = Math.min(snaps - 1, current + getStep());
      emblaApi.scrollTo(target);
    } catch (_) {
      emblaApi.scrollNext();
    }
  }, [emblaApi, getStep]);

  return (
    <div ref={rootRef} className="w-full relative group/carousel -mx-3 md:-mx-4">
      {title && (
        <div className="flex justify-between items-center mb-2 px-4 md:px-6 relative z-10">
          <h2 className="section-title">{title}</h2>
        </div>
      )}
      <div className="relative w-full">
        <div className="overflow-visible" ref={emblaRef}>
          <div className="flex gap-6 pr-8 md:pr-16 py-8 pl-4 md:pl-6">
            {items.map((platform) => (
              <div key={platform.id} data-platform-id={platform.id} className={`flex-none platform-slide ${focalId === platform.id ? 'is-focal' : ''}`}>
                {platform.internalRoute ? (
                  <Link to={platform.internalRoute} className="platform-link block w-[250px] h-[150px] group select-none">
                    <div className={`w-full h-full relative rounded-xl ${platform.brandClass || 'bg-white'}`}>
                      {platform.src ? <img src={platform.src} alt={platform.alt} className={`w-full h-full object-contain p-8 transition-opacity duration-300 ${focalId === platform.id ? 'opacity-0' : 'opacity-100'}`} draggable="false" loading="lazy" decoding="async" /> : <span className="absolute inset-0 grid place-items-center px-6 text-center text-2xl font-black tracking-tight">{platform.alt}</span>}
                      {platform.label && <p className="absolute bottom-2 left-0 right-0 text-center text-white text-xs font-bold bg-black/60 py-1 px-2 mx-4 rounded-lg">{platform.label}</p>}
                    </div>
                  </Link>
                ) : platform.href ? (
                  <a href={platform.href} target="_blank" rel="noreferrer" className="platform-link block w-[250px] h-[150px] group select-none">
                    <div className={`w-full h-full relative rounded-xl ${platform.brandClass || 'bg-white'}`}>
                      {platform.src ? <img src={platform.src} alt={platform.alt} className={`w-full h-full object-contain p-8 transition-opacity duration-300 ${focalId === platform.id ? 'opacity-0' : 'opacity-100'}`} draggable="false" loading="lazy" decoding="async" /> : <span className="absolute inset-0 grid place-items-center px-6 text-center text-2xl font-black tracking-tight">{platform.alt}</span>}
                    </div>
                  </a>
                ) : platform.route ? (
                <Link to={platform.route || '/'} className="platform-link block w-[250px] h-[150px] group select-none">
                  <div
                    className={`w-full h-full relative rounded-xl ${platform.brandClass || 'bg-white'}`}
                  >
                    <img
                      src={platform.src}
                      alt={platform.alt}
                      className={`w-full h-full object-contain p-8 transition-opacity duration-300 ${focalId === platform.id ? 'opacity-0' : 'opacity-100'}`}
                      draggable="false"
                      loading="lazy"
                      decoding="async"
                    />
                    {platform.label && (
                      <p className="absolute bottom-2 left-0 right-0 text-center text-white text-xs font-bold bg-black/60 py-1 px-2 mx-4 rounded-lg">
                        {platform.label}
                      </p>
                    )}
                    {platform.video && (
                      platform.video.endsWith('.gif') ? (
                        <img
                          id={`video-${platform.id}`}
                          src={platform.video}
                          alt={platform.alt}
                          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 rounded-xl ${focalId === platform.id ? 'opacity-100' : 'opacity-0'}`}
                        />
                      ) : (
                        <video
                          id={`video-${platform.id}`}
                          data-platform-video={platform.id}
                          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 rounded-xl ${focalId === platform.id ? 'opacity-100' : 'opacity-0'}`}
                          loop
                          muted
                          playsInline
                          preload="none"
                        >
                          <source src={platform.video} type="video/mp4" />
                        </video>
                      )
                    )}
                  </div>
                </Link>
                ) : (
                  <button type="button" className="platform-link block w-[250px] h-[150px] group select-none text-left" aria-label={platform.alt}>
                    <div className={`w-full h-full relative rounded-xl ${platform.brandClass || 'bg-white'}`}>
                      <span className="absolute inset-0 grid place-items-center px-6 text-center text-2xl font-black tracking-tight">{platform.alt}</span>
                      {platform.label && <p className="absolute bottom-2 left-0 right-0 text-center text-white text-xs font-bold bg-black/60 py-1 px-2 mx-4 rounded-lg">{platform.label}</p>}
                    </div>
                  </button>
                )}
              </div>
            ))}
            <div className="flex-none w-8 md:w-24" aria-hidden="true" />
          </div>
        </div>
        <button
          type="button"
          aria-label={t('common.previous')}
          onClick={handlePrev}
          onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          className={`hidden md:flex absolute left-6 md:left-8 top-1/2 z-20
                     w-12 h-32 rounded-2xl items-center justify-center text-white/90 hover:text-white
                     bg-gradient-to-b from-neutral-900/70 via-black/80 to-neutral-900/70 backdrop-blur-md
                     ring-1 ring-white/10 hover:ring-red-500/40
                     shadow-2xl shadow-black/70
                     transition-all duration-300 ease-out
                     -translate-y-1/2
                     opacity-0 -translate-x-2
                     group-hover/carousel:opacity-100 group-hover/carousel:translate-x-0
                     ${!canScrollPrev ? 'pointer-events-none !opacity-0' : 'pointer-events-auto'}`}
        >
          <ChevronLeft className="w-7 h-7" strokeWidth={2.25} />
        </button>
        <button
          type="button"
          aria-label={t('common.next')}
          onClick={handleNext}
          onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          className={`hidden md:flex absolute right-6 md:right-8 top-1/2 z-20
                     w-12 h-32 rounded-2xl items-center justify-center text-white/90 hover:text-white
                     bg-gradient-to-b from-neutral-900/70 via-black/80 to-neutral-900/70 backdrop-blur-md
                     ring-1 ring-white/10 hover:ring-red-500/40
                     shadow-2xl shadow-black/70
                     transition-all duration-300 ease-out
                     -translate-y-1/2
                     opacity-0 translate-x-2
                     group-hover/carousel:opacity-100 group-hover/carousel:translate-x-0
                     ${!canScrollNext ? 'pointer-events-none !opacity-0' : 'pointer-events-auto'}`}
        >
          <ChevronRight className="w-7 h-7" strokeWidth={2.25} />
        </button>
      </div>
    </div>
  );
};

export default React.memo(EmblaCarouselPlatforms);

