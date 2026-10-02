import { ArrowLeft, RotateCcw, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

const NEAHLITE_CANDIDATES = [
  {
    id: 'ilmiv',
    label: 'ILMIV',
    source: 'https://ilmiv.com/4sfoizmv/home/ilmiv',
    fallback: 'https://ilmiv.com/',
  },
  {
    id: 'kidraz',
    label: 'KIDRAZ',
    source: 'https://www.kidraz.com/saby1jy/home/kidraz',
    fallback: 'https://www.kidraz.com/',
  },
  {
    id: 'yablom',
    label: 'YABLOM',
    source: 'https://yablom.com/euvcw7/home/yablom',
    fallback: 'https://yablom.com/',
  },
] as const;

const PLATFORMS = {
  youtube: { brand: 'YouTube', unavailable: true },
  neahlite: { brand: 'NEAHLITE', candidates: NEAHLITE_CANDIDATES },
  neahplus: { brand: 'NEAHPLUS', source: 'https://oha.to/#/channels?src=oha-live%2Fchannels' },
  'anime-zora': { brand: 'Anime Zora', source: 'https://franime.fr/' },
  tiktok: { brand: 'TikTok', unavailable: true },
  canal: { brand: 'CANAL+', officialEmbedding: 'none' },
} as const;

const PlatformExperience = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { platform } = useParams<{ platform: keyof typeof PLATFORMS }>();
  const service = platform ? PLATFORMS[platform] : undefined;
  const candidates = service && 'candidates' in service ? service.candidates : undefined;
  const [selectedCandidateId, setSelectedCandidateId] = useState(candidates?.[0]?.id);
  const selectedCandidate = candidates?.find((candidate) => candidate.id === selectedCandidateId) ?? candidates?.[0];
  const [integrationSource, setIntegrationSource] = useState(selectedCandidate?.source);

  useEffect(() => {
    setSelectedCandidateId(candidates?.[0]?.id);
    setIntegrationSource(candidates?.[0]?.source);
  }, [candidates]);

  if (!service) return null;

  const hasEmbeddedExperience = 'source' in service || Boolean(selectedCandidate);
  const source = 'source' in service ? service.source : integrationSource;
  const isFallback = Boolean(selectedCandidate && integrationSource === selectedCandidate.fallback);

  const selectCandidate = (candidate: (typeof NEAHLITE_CANDIDATES)[number]) => {
    setSelectedCandidateId(candidate.id);
    setIntegrationSource(candidate.source);
  };

  return (
    <main className="flex h-[calc(100dvh-5rem)] w-full min-h-0 flex-col bg-slate-950 p-0 text-white lg:h-dvh">
      <section className="flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-black p-0">
        <header className="relative flex h-14 shrink-0 items-center border-b border-white/10 bg-slate-950/95 px-3 backdrop-blur sm:h-16 sm:px-5">
          <button type="button" onClick={() => navigate(-1)} className="absolute left-3 inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs font-semibold text-white/75 transition hover:bg-white/10 hover:text-white sm:left-5 sm:gap-2 sm:text-sm">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">{t('platformGateway.back')}</span>
          </button>
          <h1 className="gateway-brand motion-reduce:animate-none mx-auto bg-gradient-to-r from-white via-sky-100 to-blue-300 bg-clip-text text-xl font-black tracking-[0.16em] text-transparent sm:text-2xl">
            {service.brand}
          </h1>
          <span className="absolute right-3 text-[10px] font-black tracking-wider text-white/55 sm:right-5 sm:text-xs">NEAHFLIX</span>
        </header>

        {candidates && selectedCandidate && (
          <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-white/10 bg-slate-950 px-3 py-2 sm:px-5" aria-label="Candidats NEAHLITE">
            {candidates.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                onClick={() => selectCandidate(candidate)}
                className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-bold tracking-wide transition ${selectedCandidate.id === candidate.id ? 'bg-white text-slate-950' : 'bg-white/10 text-white/70 hover:bg-white/15 hover:text-white'}`}
              >
                {candidate.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setIntegrationSource(isFallback ? selectedCandidate.source : selectedCandidate.fallback)}
              className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-white/65 transition hover:bg-white/10 hover:text-white"
              title={isFallback ? 'Réessayer l’adresse candidate' : 'Essayer l’adresse de secours'}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {isFallback ? 'Candidat' : 'Secours'}
            </button>
          </div>
        )}

        {hasEmbeddedExperience && source ? (
          <div className="m-0 flex min-h-0 w-full flex-1 bg-black p-0">
            <iframe
              key={source}
              src={source}
              title={service.brand}
              className="m-0 block h-full w-full min-h-0 min-w-0 max-h-none max-w-none flex-1 border-0 p-0"
              data-screensaver-integration="true"
              referrerPolicy="no-referrer"
              allow="autoplay; fullscreen; picture-in-picture"
            />
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center p-5 sm:p-10">
            <div className="max-w-2xl text-center">
              <ShieldCheck className="mx-auto h-12 w-12 text-emerald-300" aria-hidden="true" />
              <h1 className="mt-5 text-3xl font-black sm:text-4xl">{service.brand}</h1>
              <p className="mx-auto mt-4 text-sm leading-6 text-white/70 sm:text-base">
                {'unavailable' in service ? t('platformGateway.temporarilyUnavailable') : t('platformGateway.unavailable')}
              </p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
};

export default PlatformExperience;
