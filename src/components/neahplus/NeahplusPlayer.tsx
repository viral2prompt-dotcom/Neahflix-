import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Play, RotateCcw } from 'lucide-react';
import type Hls from 'hls.js';
import { safePlay } from '@/utils/safePlay';
import { NeahplusError, resolveNeahplusStream } from './neahplusCatalog';

type PlayerStatus = 'resolving' | 'loading' | 'playing' | 'paused' | 'error';

const STATUS_LABEL: Record<Exclude<PlayerStatus, 'paused'>, string> = {
  resolving: 'Connexion à la chaîne',
  loading: 'Chargement du flux',
  playing: 'En direct',
  error: 'Chaîne indisponible',
};

const errorMessage = (error: unknown): string => {
  if (error instanceof NeahplusError && error.status >= 500) {
    return 'La source ne répond pas pour cette chaîne (erreur du serveur NEAHPLUS). Essayez une autre chaîne ou réessayez plus tard.';
  }
  if (error instanceof NeahplusError) {
    return `Le flux n'est pas disponible chez la source (erreur ${error.status}). Essayez une autre chaîne.`;
  }
  return 'Le flux ne peut pas être lu pour le moment. Essayez une autre chaîne ou réessayez.';
};

interface NeahplusPlayerProps {
  channelId: string;
  channelName: string;
}

const NeahplusPlayer = ({ channelId, channelName }: NeahplusPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<PlayerStatus>('resolving');
  const [message, setMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    const controller = new AbortController();
    let hls: Hls | null = null;
    let failed = false;

    const fail = (error: unknown) => {
      if (controller.signal.aborted || failed) return;
      failed = true;
      hls?.destroy();
      hls = null;
      setMessage(errorMessage(error));
      setStatus('error');
    };

    const play = () => {
      safePlay(video).catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'NotAllowedError') {
          setStatus('paused');
          return;
        }
        fail(error);
      });
    };

    setStatus('resolving');
    setMessage(null);

    const start = async () => {
      const streamUrl = await resolveNeahplusStream(channelId, controller.signal);
      if (controller.signal.aborted) return;
      setStatus('loading');

      const { default: HlsLib } = await import('hls.js');
      if (controller.signal.aborted) return;

      if (HlsLib.isSupported()) {
        const instance = new HlsLib({ enableWorker: true });
        hls = instance;
        instance.on(HlsLib.Events.ERROR, (_event, data) => {
          if (data.fatal) fail(new Error(data.details));
        });
        instance.on(HlsLib.Events.MANIFEST_PARSED, play);
        instance.loadSource(streamUrl);
        instance.attachMedia(video);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = streamUrl;
        play();
      } else {
        throw new Error('HLS non pris en charge');
      }
    };

    start().catch((error: unknown) => {
      if (!controller.signal.aborted) fail(error);
    });

    const handlePlaying = () => setStatus('playing');
    const handlePause = () => {
      if (!failed && !video.ended) setStatus('paused');
    };
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('pause', handlePause);

    return () => {
      controller.abort();
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('pause', handlePause);
      hls?.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [channelId, attempt]);

  const resume = () => {
    const video = videoRef.current;
    if (video) void safePlay(video).catch(() => setStatus('paused'));
  };

  const overlayStatus = status === 'paused' || status === 'playing' ? null : status;

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black ring-1 ring-white/10">
      <video
        ref={videoRef}
        className="h-full w-full bg-black object-contain"
        controls
        playsInline
        aria-label={`Lecteur ${channelName}`}
      />
      {overlayStatus && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/75 p-6 text-center">
          {overlayStatus === 'error' ? (
            <AlertTriangle className="h-10 w-10 text-amber-300" aria-hidden="true" />
          ) : (
            <Loader2 className="h-10 w-10 animate-spin text-sky-300 motion-reduce:animate-none" aria-hidden="true" />
          )}
          <p className="text-sm font-semibold text-white">{STATUS_LABEL[overlayStatus]}</p>
          {overlayStatus === 'error' && message && (
            <p className="max-w-md text-sm leading-6 text-white/80">{message}</p>
          )}
          {overlayStatus === 'error' && (
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
              className="mt-1 inline-flex items-center gap-2 rounded-lg bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-300"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Réessayer
            </button>
          )}
        </div>
      )}
      {status === 'paused' && (
        <button
          type="button"
          onClick={resume}
          className="absolute inset-0 flex items-center justify-center bg-black/40 transition hover:bg-black/30"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-sky-400 text-slate-950 shadow-lg">
            <Play className="ml-1 h-7 w-7 fill-current" aria-hidden="true" />
          </span>
          <span className="sr-only">Reprendre la lecture</span>
        </button>
      )}
    </div>
  );
};

export default NeahplusPlayer;
