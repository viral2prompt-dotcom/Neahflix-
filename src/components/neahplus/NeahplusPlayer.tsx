import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  Info,
  Loader2,
  Maximize,
  Minimize,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react';
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
  onInfo?: () => void;
  onPrevChannel?: () => void;
  onGuide?: () => void;
}

const NeahplusPlayer = ({ channelId, channelName, onInfo, onPrevChannel, onGuide }: NeahplusPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<PlayerStatus>('resolving');
  const [message, setMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

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

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  }, []);

  const handleVolume = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const v = parseFloat(e.target.value);
    video.volume = v;
    video.muted = v === 0;
    setVolume(v);
    setMuted(v === 0);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      void container.requestFullscreen().catch(() => {});
    } else {
      void document.exitFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handleChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

  const overlayStatus = status === 'paused' || status === 'playing' ? null : status;

  return (
    <div
      ref={containerRef}
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
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[linear-gradient(145deg,rgba(5,20,27,.96),rgba(4,10,16,.96))] p-6 text-center" role="status" aria-live="polite">
          {overlayStatus === 'error' ? (
            <AlertTriangle className="h-10 w-10 text-amber-300" aria-hidden="true" />
          ) : (
            <Loader2 className="h-10 w-10 animate-spin text-red-400 motion-reduce:animate-none" aria-hidden="true" />
          )}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(32,199,199,.14),transparent_58%)]" />
          <span className="relative rounded-full border border-[#20c7c7]/25 bg-[#0b2932]/80 px-3 py-1 text-[9px] font-black tracking-[0.22em] text-[#75e6e6]">NEAHPLUS · TV EN DIRECT</span>
          <p className="relative text-sm font-semibold text-white">{overlayStatus === 'resolving' ? `Connexion à ${channelName}…` : STATUS_LABEL[overlayStatus]}</p>
          {overlayStatus !== 'error' && <p className="relative max-w-xs text-xs leading-5 text-white/55">Un instant, le direct arrive.</p>}
          {overlayStatus === 'error' && message && (
            <p className="max-w-md text-sm leading-6 text-white/80">{message}</p>
          )}
          {overlayStatus === 'error' && (
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
              className="mt-1 inline-flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-400"
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
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-lg">
            <Play className="ml-1 h-7 w-7 fill-current" aria-hidden="true" />
          </span>
          <span className="sr-only">Reprendre la lecture</span>
        </button>
      )}

      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 flex items-center gap-1.5 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-8 opacity-0 transition-opacity duration-200 hover:opacity-100 focus-within:opacity-100 [.group:hover_&]:opacity-100">
        {onPrevChannel && (
          <button
            type="button"
            onClick={onPrevChannel}
            aria-label="Chaîne précédente"
            className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-lg text-white/80 transition hover:bg-white/15 hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? 'Activer le son' : 'Couper le son'}
          className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-lg text-white/80 transition hover:bg-white/15 hover:text-white"
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={muted ? 0 : volume}
          onChange={handleVolume}
          aria-label="Volume"
          className="pointer-events-auto h-1 w-16 cursor-pointer appearance-none rounded-full bg-white/30 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
        />
        <div className="flex-1" />
        {onGuide && (
          <button
            type="button"
            onClick={onGuide}
            aria-label="Guide TV"
            className="pointer-events-auto rounded-lg px-2 py-1 text-[10px] font-semibold text-white/70 transition hover:bg-white/15 hover:text-white"
          >
            GUIDE
          </button>
        )}
        {onInfo && (
          <button
            type="button"
            onClick={onInfo}
            aria-label="Informations sur le programme"
            className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-lg text-white/80 transition hover:bg-white/15 hover:text-white"
          >
            <Info className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
          className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-lg text-white/80 transition hover:bg-white/15 hover:text-white"
        >
          {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
};

export default NeahplusPlayer;
