import { ArrowLeft, ExternalLink } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { PrefetchLink as Link } from '@/routing/PrefetchLink';

const PLATFORMS = {
  youtube: {
    name: 'YouTube',
    url: 'https://www.youtube.com/',
    embedUrl: 'https://www.youtube.com/embed?listType=user_uploads&list=YouTube',
  },
  tiktok: {
    name: 'TikTok',
    url: 'https://www.tiktok.com/',
  },
  canal: {
    name: 'CANAL+',
    url: 'https://www.canalplus.com/',
  },
} as const;

const PlatformExperience = () => {
  const { platform } = useParams<{ platform: keyof typeof PLATFORMS }>();
  const service = platform ? PLATFORMS[platform] : undefined;

  if (!service) return null;

  return (
    <main className="min-h-screen bg-slate-950 px-4 pb-24 pt-28 text-white md:px-8">
      <div className="mx-auto max-w-6xl">
        <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-white/70 transition hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Retour à Neahflix
        </Link>
        <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/65 shadow-[0_24px_70px_rgba(2,6,23,0.55)] backdrop-blur-xl">
          <header className="border-b border-white/10 px-6 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">Expérience Neahflix</p>
            <h1 className="mt-1 text-3xl font-black">{service.name}</h1>
          </header>
          {'embedUrl' in service ? (
            <iframe
              className="aspect-video w-full bg-black"
              src={service.embedUrl}
              title={`${service.name} dans Neahflix`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <div className="px-6 py-16 text-center">
              <p className="mx-auto max-w-xl text-white/70">
                {service.name} ne permet pas l’intégration complète de son site dans une iframe. Neahflix conserve donc cette étape de navigation et votre retour à la plateforme.
              </p>
              <a href={service.url} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-3 font-semibold transition hover:bg-white/15">
                Ouvrir {service.name} <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          )}
        </section>
      </div>
    </main>
  );
};

export default PlatformExperience;
