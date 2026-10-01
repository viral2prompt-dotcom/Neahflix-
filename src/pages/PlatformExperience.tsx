import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

const PLATFORMS = {
  // The YouTube homepage cannot be framed. Its official embed API needs a
  // concrete video or playlist, which this gateway intentionally does not invent.
  youtube: { brand: 'YouTube', officialEmbedding: 'player' },
  // These services are loaded directly, without a proxy or a security-policy bypass.
  // If their framing policy changes, the browser keeps the Neahflix shell intact.
  neahlite: { brand: 'NEAHLITE', source: 'https://vrizov.com/3d69b18/home/vrizov' },
  neahplus: { brand: 'neahplus', source: 'https://oha.to/#/channels?src=oha-live%2Fchannels' },
  'anime-zora': { brand: 'Anime Zora', source: 'https://franime.fr/' },
  // Existing cards also remain internal: they are not silently redirected.
  tiktok: { brand: 'TikTok', officialEmbedding: 'none' },
  canal: { brand: 'CANAL+', officialEmbedding: 'none' },
} as const;

const PlatformExperience = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { platform } = useParams<{ platform: keyof typeof PLATFORMS }>();
  const service = platform ? PLATFORMS[platform] : undefined;

  if (!service) return null;

  const hasEmbeddedExperience = 'source' in service;

  return (
    <main className="min-h-[calc(100vh-5rem)] bg-slate-950 px-3 pb-3 pt-3 text-white sm:px-5 sm:pb-5">
      <section className="mx-auto flex min-h-[calc(100vh-6.5rem)] w-full max-w-[1920px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-[0_24px_70px_rgba(2,6,23,0.55)]">
        <header className="relative flex min-h-16 shrink-0 items-center justify-between border-b border-white/10 bg-slate-950/95 px-4 backdrop-blur sm:px-6">
          <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-semibold text-white/75 transition hover:bg-white/10 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">{t('platformGateway.back')}</span>
          </button>
          <div className="absolute left-1/2 -translate-x-1/2 text-lg font-black tracking-tight sm:text-xl">NEAHFLIX</div>
          <div className="min-w-16 text-right text-sm font-black sm:min-w-28 sm:text-base">{service.brand}</div>
        </header>

        {hasEmbeddedExperience ? (
          <div className="flex min-h-0 flex-1 flex-col bg-black">
            <iframe
              src={service.source}
              title={service.brand}
              className="min-h-[calc(100vh-10.5rem)] w-full flex-1 border-0"
              referrerPolicy="no-referrer"
              allow="autoplay; fullscreen; picture-in-picture"
            />
            <p className="shrink-0 border-t border-white/10 bg-slate-950 px-4 py-2 text-center text-xs text-white/45">
              {t('platformGateway.embedPolicy')}
            </p>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center p-5 sm:p-10">
            <div className="max-w-2xl text-center">
              <ShieldCheck className="mx-auto h-12 w-12 text-emerald-300" aria-hidden="true" />
              <h1 className="mt-5 text-3xl font-black sm:text-4xl">{service.brand}</h1>
              <p className="mx-auto mt-4 text-sm leading-6 text-white/70 sm:text-base">
                {service.officialEmbedding === 'player'
                  ? t('platformGateway.youtubeUnavailable')
                  : t('platformGateway.unavailable')}
              </p>
              <p className="mx-auto mt-3 text-xs leading-5 text-white/45 sm:text-sm">{t('platformGateway.noRedirect')}</p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
};

export default PlatformExperience;
