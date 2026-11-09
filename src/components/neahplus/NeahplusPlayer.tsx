import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, RotateCcw } from 'lucide-react';
import type Hls from 'hls.js';
import { safePlay } from '@/utils/safePlay';
import { NeahplusError, resolveNeahplusStream } from './neahplusCatalog';

type PlayerStatus = 'resolving' | 'loading' | 'playing' | 'paused' | 'error';

const STATUS_LABEL: Record<Exclude<PlayerStatus, 'paused'>, string> = {
  resolving: 'Connexion à la chaîne',
  loading: 'Chargement du direct…',
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
  isActive: boolean;
  muted: boolean;
  volume: number;
  onAudioStateChange: (muted: boolean, volume: number) => void;
}

const NeahplusPlayer = ({ channelId, channelName, isActive, muted, volume, onAudioStateChange }: NeahplusPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<PlayerStatus>('resolving');
  const [message, setMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    if (!isActive) {
      video.pause();
      video.removeAttribute('src');
      video.load();
      setStatus('paused');
      return undefined;
    }
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
      video.pause();
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('pause', handlePause);
      hls?.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [channelId, attempt, isActive]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    video.muted = muted;
    video.volume = volume;
    const syncAudioState = () => onAudioStateChange(video.muted, video.volume);
    video.addEventListener('volumechange', syncAudioState);
    return () => video.removeEventListener('volumechange', syncAudioState);
  }, [muted, volume, onAudioStateChange]);

  const overlayStatus = status === 'paused' || status === 'playing' ? null : status;

  return (
    <div
      className={`relative mx-auto aspect-video w-full max-h-[42vh] overflow-hidden rounded-xl bg-black transition-shadow duration-300 lg:max-h-[46vh] ${status === 'resolving' || status === 'loading' ? 'ring-2 ring-[#20c7c7]/55 shadow-[0_0_28px_rgba(32,199,199,.16)]' : 'ring-1 ring-[#20c7c7]/20'}`}
    >
      <video
        ref={videoRef}
        className="h-full w-full bg-black object-contain"
        controls
        playsInline
        aria-label={`Lecteur ${channelName}`}
      />

      {overlayStatus && (
        <div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden bg-[linear-gradient(145deg,#061720_0%,#081c27_48%,#050e16_100%)] p-6 text-center" role="status" aria-live="polite">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_42%,rgba(32,199,199,.2),transparent_58%)]" />
          <div className="pointer-events-none absolute inset-3 rounded-xl border border-[#20c7c7]/15" />
          <div className="pointer-events-none absolute inset-x-10 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-[#20c7c7]/20 to-transparent" />
          {overlayStatus === 'error' ? (
            <AlertTriangle className="relative mb-4 h-9 w-9 text-amber-300" aria-hidden="true" />
          ) : (
            <Loader2 className="relative mb-5 h-8 w-8 animate-spin text-[#55dddd] motion-reduce:animate-none" aria-hidden="true" />
          )}
          {overlayStatus !== 'error' ? (
            <div className="relative flex flex-col items-center">
              <p className="text-xl font-black tracking-[0.2em] text-[#55dddd] drop-shadow-[0_0_18px_rgba(32,199,199,.28)]">NEAHPLUS</p>
              <span className="mt-3 h-px w-20 bg-gradient-to-r from-transparent via-[#55dddd]/80 to-transparent" />
              <p className="mt-3 text-xs font-semibold tracking-[0.12em] text-white/75">Chargement de chaîne</p>
            </div>
          ) : (
            <>
              <span className="relative rounded-full border border-[#20c7c7]/25 bg-[#0b2932]/80 px-3 py-1 text-[9px] font-black tracking-[0.22em] text-[#75e6e6]">NEAHPLUS</span>
              <p className="relative mt-3 text-sm font-semibold text-white">{STATUS_LABEL[overlayStatus]}</p>
              {message && <p className="relative mt-2 max-w-md text-sm leading-6 text-white/80">{message}</p>}
              <button
                type="button"
                onClick={() => setAttempt((value) => value + 1)}
                className="relative mt-4 inline-flex items-center gap-2 rounded-lg border border-amber-300/30 bg-amber-500 px-4 py-2 text-sm font-semibold text-[#1b1305] transition hover:bg-amber-400"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Réessayer
              </button>
            </>
          )}
        </div>
      )}


    </div>
  );
};

export default NeahplusPlayer;
