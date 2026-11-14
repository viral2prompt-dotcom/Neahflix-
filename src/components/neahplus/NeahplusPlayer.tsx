import { useEffect, useRef, useState } from 'react';
import type { TouchEventHandler } from 'react';
import { AlertTriangle, FastForward, Loader2, Rewind, RotateCcw } from 'lucide-react';
import type Hls from 'hls.js';
import { safePlay } from '@/utils/safePlay';
import { invalidateNeahplusStream, NeahplusError, resolveNeahplusStream } from './neahplusCatalog';

import { loadHlsModule } from './neahplusPlayerLoader';

type PlayerStatus = 'resolving' | 'loading' | 'playing' | 'paused' | 'error';
type ZappingDirection = 'next' | 'previous' | null;
type ZappingMode = 'auto' | 'economy' | 'balanced' | 'performance';

interface NetworkInfoLike {
  type?: string;
  effectiveType?: string;
  saveData?: boolean;
  addEventListener?: (type: 'change', listener: () => void) => void;
  removeEventListener?: (type: 'change', listener: () => void) => void;
}

interface ZappingPolicy {
  neighborCount: number;
  bufferSeconds: number;
  maxPreloadMs: number;
}

const getZappingPolicy = (mode: ZappingMode, network?: NetworkInfoLike): ZappingPolicy => {
  if (mode === 'economy') return { neighborCount: 0, bufferSeconds: 0, maxPreloadMs: 0 };
  if (mode === 'performance') return { neighborCount: 2, bufferSeconds: 2.5, maxPreloadMs: 6500 };
  if (mode === 'balanced') return { neighborCount: 1, bufferSeconds: 1.25, maxPreloadMs: 4500 };
  if (network?.saveData || network?.effectiveType === 'slow-2g' || network?.effectiveType === '2g') {
    return { neighborCount: 0, bufferSeconds: 0, maxPreloadMs: 0 };
  }
  if (network?.type === 'wifi') return { neighborCount: 2, bufferSeconds: 2, maxPreloadMs: 6000 };
  // Sur données mobiles ou réseau non identifiable : manifeste seulement,
  // car un seul segment HLS peut représenter plusieurs secondes de vidéo.
  return { neighborCount: 1, bufferSeconds: 0, maxPreloadMs: 4500 };
};

interface PlaybackDiagnostics {
  channelName: string;
  stage: string;
  urlMs: number | null;
  manifestMs: number | null;
  segmentMs: number | null;
  firstFrameMs: number | null;
}

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
  streamUrl: string | null;
  muted: boolean;
  volume: number;
  direction: ZappingDirection;
  onStreamReady: () => void;
  onAudioStateChange: (muted: boolean, volume: number) => void;
  fullScreen?: boolean;
  previousChannelId?: string | null;
  nextChannelId?: string | null;
  zappingMode?: ZappingMode;
  onSurfaceTap?: () => void;
  onTouchStart?: TouchEventHandler<HTMLDivElement>;
  onTouchEnd?: TouchEventHandler<HTMLDivElement>;
}

const NeahplusPlayer = ({
  channelId,
  channelName,
  isActive,
  streamUrl: resolvedStreamUrl,
  muted,
  volume,
  direction,
  onStreamReady,
  onAudioStateChange,
  fullScreen = false,
  previousChannelId = null,
  nextChannelId = null,
  zappingMode = 'auto',
  onSurfaceTap,
  onTouchStart,
  onTouchEnd,
}: NeahplusPlayerProps) => {
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([null, null]);
  const hlsRefs = useRef<Array<Hls | null>>([null, null]);
  const warmupVideoRefs = useRef<Array<HTMLVideoElement | null>>([null, null]);
  const warmupHlsRefs = useRef<Array<Hls | null>>([null, null]);
  const warmupChannelIdsRef = useRef<Array<string | null>>([null, null]);
  const mainChannelIdsRef = useRef<Array<string | null>>([null, null]);
  const lastPreloadPolicyKeyRef = useRef<string | null>(null);
  const warmupSegmentReadyRef = useRef<boolean[]>([false, false]);
  const warmupTimeoutRefs = useRef<Array<number | null>>([null, null]);
  const currentChannelIdRef = useRef(channelId);
  const currentNeighborsRef = useRef({ previous: previousChannelId, next: nextChannelId });
  currentChannelIdRef.current = channelId;
  currentNeighborsRef.current = { previous: previousChannelId, next: nextChannelId };
  const activeSlotRef = useRef(0);
  const generationRef = useRef(0);
  const [activeSlot, setActiveSlot] = useState(0);
  const [flowTransition, setFlowTransition] = useState<{ enteringSlot: number; exitingSlot: number; direction: Exclude<ZappingDirection, null>; phase: 'prepare' | 'animate' } | null>(null);
  const flowTransitionRef = useRef(flowTransition);
  flowTransitionRef.current = flowTransition;
  const transitionTimerRef = useRef<number | null>(null);
  const transitionFrameRef = useRef<number | null>(null);
  const [hasActiveStream, setHasActiveStream] = useState(false);
  const [activePlayingChannelId, setActivePlayingChannelId] = useState<string | null>(null);
  const hasActiveStreamRef = useRef(false);
  hasActiveStreamRef.current = hasActiveStream;
  const [status, setStatus] = useState<PlayerStatus>('resolving');
  const [message, setMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [playbackDiagnostics, setPlaybackDiagnostics] = useState<PlaybackDiagnostics | null>(null);
  const [networkRevision, setNetworkRevision] = useState(0);
  const audioSettingsRef = useRef({ muted, volume });
  const fullScreenRef = useRef(fullScreen);
  const directionRef = useRef(direction);
  audioSettingsRef.current = { muted, volume };
  fullScreenRef.current = fullScreen;
  directionRef.current = direction;

  useEffect(() => {
    if (typeof navigator === 'undefined') return undefined;
    const connection = (navigator as Navigator & { connection?: NetworkInfoLike }).connection;
    if (!connection?.addEventListener) return undefined;
    const handleNetworkChange = () => setNetworkRevision((value) => value + 1);
    connection.addEventListener('change', handleNetworkChange);
    return () => connection.removeEventListener?.('change', handleNetworkChange);
  }, []);

  useEffect(() => {
    if (!isActive) return undefined;
    const hlsInstances = hlsRefs.current;
    if (transitionTimerRef.current !== null) window.clearTimeout(transitionTimerRef.current);
    if (transitionFrameRef.current !== null) window.cancelAnimationFrame(transitionFrameRef.current);
    transitionTimerRef.current = null;
    transitionFrameRef.current = null;
    setFlowTransition(null);
    const generation = ++generationRef.current;
    const diagnosticStartAt = performance.now();
    let segmentRecorded = false;
    let firstFrameRecorded = false;
    const updateDiagnostics = (patch: Partial<PlaybackDiagnostics>) => {
      if (!fullScreenRef.current) return;
      setPlaybackDiagnostics((current) => ({
        channelName,
        stage: current?.channelName === channelName ? current.stage : 'Préparation',
        urlMs: current?.channelName === channelName ? current.urlMs : null,
        manifestMs: current?.channelName === channelName ? current.manifestMs : null,
        segmentMs: current?.channelName === channelName ? current.segmentMs : null,
        firstFrameMs: current?.channelName === channelName ? current.firstFrameMs : null,
        ...patch,
      }));
    };
    const elapsedMs = () => Math.round(performance.now() - diagnosticStartAt);
    const recordFirstSegment = () => {
      if (segmentRecorded) return;
      segmentRecorded = true;
      updateDiagnostics({ segmentMs: elapsedMs(), stage: 'Premier segment reçu' });
    };
    const recordFirstFrame = () => {
      if (firstFrameRecorded || aborted || generation !== generationRef.current) return;
      firstFrameRecorded = true;
      activateCandidate();
      updateDiagnostics({ firstFrameMs: elapsedMs(), stage: 'Première image affichée' });
    };
    if (fullScreenRef.current) {
      setPlaybackDiagnostics({
        channelName,
        stage: 'Résolution de la source',
        urlMs: null,
        manifestMs: null,
        segmentMs: null,
        firstFrameMs: null,
      });
    }
    const targetSlot = 1 - activeSlotRef.current;
    if (fullScreenRef.current && directionRef.current && hasActiveStreamRef.current) {
      setFlowTransition({
        enteringSlot: targetSlot,
        exitingSlot: activeSlotRef.current,
        direction: directionRef.current,
        phase: 'prepare',
      });
    }
    const video = videoRefs.current[targetSlot];
    if (!video) return undefined;

    let aborted = false;
    let failed = false;
    let candidateHls: Hls | null = null;
    let detachCandidateFragmentListener: (() => void) | null = null;
    let playRequested = false;
    const reusingCachedSlot = mainChannelIdsRef.current[targetSlot] === channelId &&
      Boolean(hlsInstances[targetSlot] || video.currentSrc || video.src);
    if (!reusingCachedSlot) {
      hlsInstances[targetSlot]?.destroy();
      hlsInstances[targetSlot] = null;
      mainChannelIdsRef.current[targetSlot] = null;
      video.pause();
      video.removeAttribute('src');
      video.load();
    } else {
      video.pause();
    }

    if (!hasActiveStreamRef.current) setStatus('resolving');
    setMessage(null);

    const fail = (error: unknown) => {
      if (aborted || failed || generation !== generationRef.current) return;
      failed = true;
      detachCandidateFragmentListener?.();
      detachCandidateFragmentListener = null;
      candidateHls?.destroy();
      candidateHls = null;
      hlsInstances[targetSlot] = null;
      mainChannelIdsRef.current[targetSlot] = null;
      video.pause();
      video.removeAttribute('src');
      video.load();
      const candidateIsActive = activeSlotRef.current === targetSlot;
      if (candidateIsActive || !hasActiveStreamRef.current) {
        if (candidateIsActive) {
          hasActiveStreamRef.current = false;
          setHasActiveStream(false);
        }
        setMessage(errorMessage(error));
        setStatus('error');
      } else {
        setFlowTransition(null);
        setStatus('playing');
        onStreamReady();
      }
    };

    const activateCandidate = () => {
      if (aborted || failed || generation !== generationRef.current || activeSlotRef.current === targetSlot) return;
      const previousSlot = activeSlotRef.current;
      const previousVideo = videoRefs.current[previousSlot];
      video.muted = audioSettingsRef.current.muted;
      video.volume = audioSettingsRef.current.volume;
      if (fullScreenRef.current && directionRef.current && previousVideo) {
        previousVideo.muted = true;
        if (!flowTransitionRef.current) {
          setFlowTransition({
            enteringSlot: targetSlot,
            exitingSlot: previousSlot,
            direction: directionRef.current,
            phase: 'prepare',
          });
        }
      }
      activeSlotRef.current = targetSlot;
      setActiveSlot(targetSlot);
      hasActiveStreamRef.current = true;
      setHasActiveStream(true);
      setActivePlayingChannelId(channelId);
      setStatus('playing');
      setMessage(null);
      onStreamReady();

      if (previousVideo && !(fullScreenRef.current && directionRef.current)) {
        previousVideo.pause();
        hlsInstances[previousSlot]?.destroy();
        hlsInstances[previousSlot] = null;
        previousVideo.removeAttribute('src');
        previousVideo.load();
      }
    };

    const startPlayback = () => {
      if (aborted || failed || playRequested || generation !== generationRef.current) return;
      playRequested = true;
      video.muted = true;
      video.volume = audioSettingsRef.current.volume;
      safePlay(video).catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'NotAllowedError') {
          // La lecture muette reste généralement autorisée ; conserver l'ancien flux si le navigateur refuse.
          fail(error);
          return;
        }
        fail(error);
      });
    };

    const handlePlaying = () => {
      if (firstFrameRecorded) return;
      const videoWithFrameCallback = video as HTMLVideoElement & {
        requestVideoFrameCallback?: (callback: () => void) => number;
      };
      if (typeof videoWithFrameCallback.requestVideoFrameCallback === 'function') {
        videoWithFrameCallback.requestVideoFrameCallback(() => recordFirstFrame());
      } else {
        recordFirstFrame();
      }
    };
    const handleCandidateError = () => fail(new Error('Lecture du flux impossible'));
    const handleNativeMetadata = () => updateDiagnostics({ manifestMs: elapsedMs(), stage: 'Métadonnées du flux reçues' });
    const handleNativeData = () => recordFirstSegment();
    video.addEventListener('loadedmetadata', handleNativeMetadata);
    video.addEventListener('loadeddata', handleNativeData);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('error', handleCandidateError);
    video.addEventListener('canplay', startPlayback, { once: true });

    const start = async () => {
      if (reusingCachedSlot) {
        const { default: HlsLib } = await loadHlsModule();
        if (aborted || generation !== generationRef.current) return;
        candidateHls = hlsInstances[targetSlot];
        if (candidateHls) {
          const onCachedFragmentBuffered = () => recordFirstSegment();
          candidateHls.on(HlsLib.Events.FRAG_BUFFERED, onCachedFragmentBuffered);
          detachCandidateFragmentListener = () => candidateHls?.off(HlsLib.Events.FRAG_BUFFERED, onCachedFragmentBuffered);
          candidateHls.on(HlsLib.Events.ERROR, (_event, data) => {
            if (data.fatal) fail(new Error(data.details));
          });
        }
        updateDiagnostics({ urlMs: elapsedMs(), manifestMs: elapsedMs(), stage: 'Lecteur précédent réutilisé' });
        if (video.buffered.length > 0) recordFirstSegment();
        candidateHls?.startLoad();
        startPlayback();
        return;
      }
      const streamUrl = resolvedStreamUrl ?? await resolveNeahplusStream(channelId, controller.signal);
      if (aborted || generation !== generationRef.current) return;
      updateDiagnostics({
        urlMs: elapsedMs(),
        stage: resolvedStreamUrl ? 'URL déjà disponible' : 'URL de la chaîne obtenue',
      });
      setStatus('loading');
      const { default: HlsLib } = await loadHlsModule();
      if (aborted || generation !== generationRef.current) return;

      // Si le lecteur d'attente a déjà amorcé cette chaîne, transférer son
      // MediaSource et ses SourceBuffers au lecteur visible : aucun redémarrage
      // du manifeste ni re-téléchargement du premier segment.
      const warmedIndex = warmupChannelIdsRef.current.findIndex((id, index) =>
        id === channelId && Boolean(warmupHlsRefs.current[index]?.media)
      );
      if (warmedIndex >= 0) {
        const warmedHls = warmupHlsRefs.current[warmedIndex];
        const transferData = warmedHls?.transferMedia();
        warmupHlsRefs.current[warmedIndex] = null;
        warmupChannelIdsRef.current[warmedIndex] = null;
        if (warmedHls && transferData) {
          const hadWarmedSegment = warmupSegmentReadyRef.current[warmedIndex];
          if (warmupTimeoutRefs.current[warmedIndex] !== null) {
            window.clearTimeout(warmupTimeoutRefs.current[warmedIndex]!);
            warmupTimeoutRefs.current[warmedIndex] = null;
          }
          updateDiagnostics({ manifestMs: elapsedMs(), stage: 'Manifeste préchargé réutilisé' });
          candidateHls = warmedHls;
          hlsInstances[targetSlot] = warmedHls;
          mainChannelIdsRef.current[targetSlot] = channelId;
          const onTransferredFragment = () => recordFirstSegment();
          warmedHls.on(HlsLib.Events.FRAG_BUFFERED, onTransferredFragment);
          detachCandidateFragmentListener = () => warmedHls.off(HlsLib.Events.FRAG_BUFFERED, onTransferredFragment);
          if (hadWarmedSegment) recordFirstSegment();
          warmupSegmentReadyRef.current[warmedIndex] = false;
          const warmedVideo = warmupVideoRefs.current[warmedIndex];
          warmedVideo?.pause();
          warmedVideo?.removeAttribute('src');
          warmedVideo?.load();
          warmedHls.on(HlsLib.Events.ERROR, (_event, data) => {
            if (data.fatal) fail(new Error(data.details));
          });
          warmedHls.config.maxBufferLength = 8;
          warmedHls.config.maxMaxBufferLength = 16;
          warmedHls.config.backBufferLength = 5;
          warmedHls.attachMedia({ media: video, ...transferData });
          warmedHls.startLoad();
          if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) startPlayback();
          return;
        }
        warmedHls?.destroy();
      }

      if (HlsLib.isSupported()) {
        const instance = new HlsLib({
          enableWorker: true,
          autoStartLoad: true,
          startFragPrefetch: true,
          maxBufferLength: 8,
          maxMaxBufferLength: 16,
          backBufferLength: 5,
        });
        candidateHls = instance;
        hlsInstances[targetSlot] = instance;
        mainChannelIdsRef.current[targetSlot] = channelId;
        instance.on(HlsLib.Events.ERROR, (_event, data) => {
          if (data.fatal) fail(new Error(data.details));
        });
        instance.on(HlsLib.Events.MANIFEST_PARSED, () => {
          updateDiagnostics({ manifestMs: elapsedMs(), stage: 'Manifeste HLS analysé' });
          startPlayback();
        });
        const onMainFragmentBuffered = () => recordFirstSegment();
        instance.on(HlsLib.Events.FRAG_BUFFERED, onMainFragmentBuffered);
        detachCandidateFragmentListener = () => instance.off(HlsLib.Events.FRAG_BUFFERED, onMainFragmentBuffered);
        instance.loadSource(streamUrl);
        instance.attachMedia(video);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        mainChannelIdsRef.current[targetSlot] = channelId;
        video.src = streamUrl;
        video.load();
      } else {
        throw new Error('HLS non pris en charge');
      }
    };

    const controller = new AbortController();
    start().catch((error: unknown) => {
      if (!controller.signal.aborted) fail(error);
    });

    return () => {
      aborted = true;
      controller.abort();
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('error', handleCandidateError);
      video.removeEventListener('loadedmetadata', handleNativeMetadata);
      video.removeEventListener('loadeddata', handleNativeData);
      video.removeEventListener('canplay', startPlayback);
      detachCandidateFragmentListener?.();
      detachCandidateFragmentListener = null;
      if (activeSlotRef.current !== targetSlot) {
        candidateHls?.destroy();
        if (hlsInstances[targetSlot] === candidateHls) hlsInstances[targetSlot] = null;
        if (mainChannelIdsRef.current[targetSlot] === channelId) mainChannelIdsRef.current[targetSlot] = null;
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
    };
  }, [channelId, attempt, isActive, resolvedStreamUrl, onStreamReady]);

  // En mode Flow, la prélecture ne commence qu'après le démarrage réel
  // de la chaîne sélectionnée. Elle se suspend si le lecteur visible tamponne.
  useEffect(() => {
    if (!fullScreen || activePlayingChannelId !== channelId || (!previousChannelId && !nextChannelId)) return undefined;
    let cancelled = false;
    const activeVideo = videoRefs.current[activeSlotRef.current];
    const pauseNeighborPreloads = () => {
      warmupHlsRefs.current.forEach((instance) => instance?.stopLoad());
    };
    const resumeNeighborPreloads = () => {
      warmupHlsRefs.current.forEach((instance, slot) => {
        if (!warmupSegmentReadyRef.current[slot]) instance?.startLoad();
      });
    };
    activeVideo?.addEventListener('waiting', pauseNeighborPreloads);
    activeVideo?.addEventListener('stalled', pauseNeighborPreloads);
    activeVideo?.addEventListener('playing', resumeNeighborPreloads);
    const controllers = [new AbortController(), new AbortController()];
    const connection = typeof navigator !== 'undefined'
      ? (navigator as Navigator & { connection?: NetworkInfoLike }).connection
      : undefined;
    const policy = getZappingPolicy(zappingMode, connection);
    const policyKey = [zappingMode, connection?.type ?? 'unknown', connection?.effectiveType ?? 'unknown', connection?.saveData ? 'save-data' : 'normal'].join(':');
    const policyChanged = lastPreloadPolicyKeyRef.current !== null && lastPreloadPolicyKeyRef.current !== policyKey;
    lastPreloadPolicyKeyRef.current = policyKey;
    // Le prochain flux est prioritaire. Le nombre de chaînes et la durée
    // préchargée dépendent du mode choisi et du réseau détecté.
    const targets = [nextChannelId, previousChannelId]
      .filter((id): id is string => Boolean(id && id !== channelId))
      .slice(0, policy.neighborCount);

    // Appliquer immédiatement un changement de mode : aucune ancienne
    // prélecture ne doit continuer si elle n'est plus autorisée par la policy.
    warmupHlsRefs.current.forEach((instance, slot) => {
      const warmChannelId = warmupChannelIdsRef.current[slot];
      if (!warmChannelId || warmChannelId === channelId || (!policyChanged && targets.includes(warmChannelId))) return;
      if (warmupTimeoutRefs.current[slot] !== null) {
        window.clearTimeout(warmupTimeoutRefs.current[slot]!);
        warmupTimeoutRefs.current[slot] = null;
      }
      instance?.destroy();
      warmupHlsRefs.current[slot] = null;
      warmupChannelIdsRef.current[slot] = null;
      warmupSegmentReadyRef.current[slot] = false;
      const warmVideo = warmupVideoRefs.current[slot];
      warmVideo?.pause();
      warmVideo?.removeAttribute('src');
      warmVideo?.load();
    });

    const warmChannel = async (slot: number, targetChannelId: string, controller: AbortController) => {
      const video = warmupVideoRefs.current[slot];
      if (!video) return;
      warmupChannelIdsRef.current[slot] = targetChannelId;
      warmupSegmentReadyRef.current[slot] = false;
      try {
        const streamUrl = await resolveNeahplusStream(targetChannelId, controller.signal);
        if (cancelled || controller.signal.aborted) return;
        const { default: HlsLib } = await loadHlsModule();
        if (cancelled || controller.signal.aborted) return;

        video.muted = true;
        video.volume = 0;
        if (!HlsLib.isSupported()) {
          // Safari/iOS peut lire HLS nativement sans MediaSource.
          if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = streamUrl;
            video.load();
            void video.play().catch(() => undefined);
          }
          return;
        }
        const instance = new HlsLib({
          enableWorker: true,
          autoStartLoad: policy.bufferSeconds > 0,
          startFragPrefetch: policy.bufferSeconds > 0,
          startLevel: 0,
          maxBufferLength: Math.max(1, policy.bufferSeconds + 0.5),
          maxMaxBufferLength: Math.max(1.5, policy.bufferSeconds + 1),
          maxBufferSize: 4 * 1024 * 1024,
          backBufferLength: 0,
          lowLatencyMode: false,
        });
        warmupHlsRefs.current[slot] = instance;

        // Chaque chaîne voisine reçoit son premier vrai fragment vidéo.
        // On arrête ensuite son téléchargement jusqu'à sa sélection, afin de
        // conserver un départ rapide sans concurrencer inutilement le direct.
        const bufferedFragmentKeys = new Set<string>();
        let bufferedSeconds = 0;
        const stopAfterTargetBuffer = (_event: string, data: { frag?: { sn?: number | string; duration?: number; type?: string } }) => {
          const frag = data.frag;
          if (typeof frag?.sn !== 'number' || (frag.type && frag.type !== 'main')) return;
          const fragmentKey = `${frag.type ?? 'main'}:${frag.sn}`;
          if (bufferedFragmentKeys.has(fragmentKey)) return;
          bufferedFragmentKeys.add(fragmentKey);
          bufferedSeconds += Math.max(0, Number(frag.duration) || 0);
          if (bufferedSeconds < policy.bufferSeconds) return;
          warmupSegmentReadyRef.current[slot] = true;
          instance.off(HlsLib.Events.FRAG_BUFFERED, stopAfterTargetBuffer);
          if (warmupTimeoutRefs.current[slot] !== null) {
            window.clearTimeout(warmupTimeoutRefs.current[slot]!);
            warmupTimeoutRefs.current[slot] = null;
          }
          instance.stopLoad();
        };
        warmupTimeoutRefs.current[slot] = window.setTimeout(() => {
          warmupTimeoutRefs.current[slot] = null;
          instance.stopLoad();
        }, policy.maxPreloadMs);
        instance.on(HlsLib.Events.FRAG_BUFFERED, stopAfterTargetBuffer);
        instance.on(HlsLib.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          if (warmupTimeoutRefs.current[slot] !== null) {
            window.clearTimeout(warmupTimeoutRefs.current[slot]!);
            warmupTimeoutRefs.current[slot] = null;
          }
          if (warmupHlsRefs.current[slot] === instance) {
            warmupHlsRefs.current[slot] = null;
            warmupChannelIdsRef.current[slot] = null;
            warmupSegmentReadyRef.current[slot] = false;
            instance.destroy();
          }
        });
        instance.attachMedia(video);
        instance.loadSource(streamUrl);
      } catch {
        if (warmupChannelIdsRef.current[slot] === targetChannelId) warmupChannelIdsRef.current[slot] = null;
        // Un préchargement raté ne doit jamais bloquer la chaîne sélectionnée.
      }
    };

    const assignments: Array<{ slot: number; channelId: string; controller: AbortController }> = [];
    for (const target of targets) {
      if (warmupChannelIdsRef.current.includes(target)) continue;
      const slot = warmupChannelIdsRef.current.findIndex((id, index) =>
        id === null && warmupHlsRefs.current[index] === null
      );
      if (slot < 0) break;
      assignments.push({ slot, channelId: target, controller: controllers[slot] });
    }
    // Les deux voisines sont amorcées en parallèle, chacune jusqu'à son
    // premier fragment vidéo. Le lecteur principal reste prioritaire.
    void Promise.all(assignments.map((assignment) =>
      warmChannel(assignment.slot, assignment.channelId, assignment.controller)
    ));
    return () => {
      cancelled = true;
      activeVideo?.removeEventListener('waiting', pauseNeighborPreloads);
      activeVideo?.removeEventListener('stalled', pauseNeighborPreloads);
      activeVideo?.removeEventListener('playing', resumeNeighborPreloads);
      controllers.forEach((controller) => controller.abort());
      warmupHlsRefs.current.forEach((instance, slot) => {
        // Conserver le lecteur correspondant à la chaîne qui vient d'être choisie :
        // l'effet principal va récupérer son MediaSource juste après ce nettoyage.
        const warmChannelId = warmupChannelIdsRef.current[slot];
        const isCurrentChannel = warmChannelId === currentChannelIdRef.current;
        const candidateAlreadyActive = activeSlotRef.current !== activeSlot;
        const isStillNeighbor = warmChannelId === currentNeighborsRef.current.next ||
          warmChannelId === currentNeighborsRef.current.previous;
        if (instance && ((isCurrentChannel && !candidateAlreadyActive) || isStillNeighbor)) return;
        if (warmupTimeoutRefs.current[slot] !== null) {
          window.clearTimeout(warmupTimeoutRefs.current[slot]!);
          warmupTimeoutRefs.current[slot] = null;
        }
        instance?.destroy();
        warmupHlsRefs.current[slot] = null;
        warmupChannelIdsRef.current[slot] = null;
        warmupSegmentReadyRef.current[slot] = false;
        const video = warmupVideoRefs.current[slot];
        if (video) {
          video.pause();
          video.removeAttribute('src');
          video.load();
        }
      });
    };
  }, [channelId, fullScreen, nextChannelId, previousChannelId, activePlayingChannelId, zappingMode, networkRevision]);

  useEffect(() => {
    if (!flowTransition) return undefined;
    if (flowTransition.phase === 'prepare') {
      transitionFrameRef.current = window.requestAnimationFrame(() => {
        setFlowTransition((current) => current ? { ...current, phase: 'animate' } : null);
      });
      return () => {
        if (transitionFrameRef.current !== null) window.cancelAnimationFrame(transitionFrameRef.current);
      };
    }

    // L'ancienne vidéo reste disponible pendant que la nouvelle source se prépare.
    // On ne la libère qu'après le premier rendu de la nouvelle chaîne.
    if (activeSlot !== flowTransition.enteringSlot) return undefined;

    transitionTimerRef.current = window.setTimeout(() => {
      const { exitingSlot } = flowTransition;
      const oldVideo = videoRefs.current[exitingSlot];
      oldVideo?.pause();
      // Conserver le dernier lecteur quitté en mémoire : un retour immédiat
      // peut reprendre son MediaSource et son buffer sans reconstruire HLS.
      hlsRefs.current[exitingSlot]?.stopLoad();
      setFlowTransition(null);
      transitionTimerRef.current = null;
    }, 280);
    return () => {
      if (transitionTimerRef.current !== null) window.clearTimeout(transitionTimerRef.current);
    };
  }, [flowTransition, activeSlot]);

  useEffect(() => {
    const cleanups: Array<() => void> = [];
    videoRefs.current.forEach((video, slot) => {
      if (!video) return;
      if (slot === activeSlot) {
        video.muted = muted;
        video.volume = volume;
      }
      const syncAudioState = () => {
        if (slot === activeSlotRef.current) onAudioStateChange(video.muted, video.volume);
      };
      video.addEventListener('volumechange', syncAudioState);
      cleanups.push(() => video.removeEventListener('volumechange', syncAudioState));
    });
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [muted, volume, activeSlot, onAudioStateChange]);

  useEffect(() => () => {
    if (transitionTimerRef.current !== null) window.clearTimeout(transitionTimerRef.current);
    if (transitionFrameRef.current !== null) window.cancelAnimationFrame(transitionFrameRef.current);
    generationRef.current += 1;
    videoRefs.current.forEach((video, slot) => {
      video?.pause();
      hlsRefs.current[slot]?.destroy();
      hlsRefs.current[slot] = null;
      mainChannelIdsRef.current[slot] = null;
      if (video) {
        video.removeAttribute('src');
        video.load();
      }
    });
    warmupHlsRefs.current.forEach((instance, slot) => {
      if (warmupTimeoutRefs.current[slot] !== null) {
        window.clearTimeout(warmupTimeoutRefs.current[slot]!);
        warmupTimeoutRefs.current[slot] = null;
      }
      instance?.destroy();
      warmupHlsRefs.current[slot] = null;
      warmupChannelIdsRef.current[slot] = null;
      warmupSegmentReadyRef.current[slot] = false;
    });
  }, []);

  const overlayStatus = hasActiveStream || status === 'paused' || status === 'playing' ? null : status;
  const showFlowLoading = Boolean(flowTransition && activeSlot !== flowTransition.enteringSlot);

  return (
    <div className={fullScreen
      ? 'relative h-full w-full max-h-none aspect-auto overflow-hidden rounded-none bg-black'
      : `relative mx-auto aspect-video w-full max-h-[42vh] overflow-hidden rounded-xl bg-black transition-shadow duration-300 lg:max-h-[46vh] ${status === 'resolving' || status === 'loading' ? 'ring-2 ring-[#20c7c7]/55 shadow-[0_0_28px_rgba(32,199,199,.16)]' : 'ring-1 ring-[#20c7c7]/20'}`}
      onClick={onSurfaceTap}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={fullScreen ? { touchAction: 'none' } : undefined}>
      {fullScreen && [0, 1].map((slot) => (
        <video
          key={`flow-warmup-${slot}`}
          ref={(element) => { warmupVideoRefs.current[slot] = element; }}
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
          tabIndex={-1}
          className="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0"
        />
      ))}
      {[0, 1].map((slot) => (
        <video
          key={slot}
          ref={(element) => { videoRefs.current[slot] = element; }}
          className={`h-full w-full bg-black object-contain ${flowTransition ? 'absolute inset-0' : slot === activeSlot ? 'block' : 'hidden'}`}
          style={flowTransition && (slot === flowTransition.enteringSlot || slot === flowTransition.exitingSlot) ? {
            transform: slot === flowTransition.enteringSlot
              ? flowTransition.phase === 'prepare' ? `translate3d(0, ${flowTransition.direction === 'next' ? '100%' : '-100%'}, 0)` : 'translate3d(0, 0, 0)'
              : flowTransition.phase === 'prepare' ? 'translate3d(0, 0, 0)' : `translate3d(0, ${flowTransition.direction === 'next' ? '-100%' : '100%'}, 0)`,
            transition: flowTransition.phase === 'animate' ? 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
            zIndex: slot === flowTransition.enteringSlot ? 2 : 1,
            willChange: 'transform',
          } : undefined}
          controls={slot === activeSlot}
          playsInline
          preload={fullScreen ? 'auto' : 'none'}
          aria-label={`Lecteur ${channelName}`}
        />
      ))}

      {fullScreen && playbackDiagnostics && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-40 max-w-[min(92vw,300px)] rounded-lg border border-white/15 bg-black/80 px-3 py-2 text-[10px] leading-4 text-white/85 shadow-xl backdrop-blur-sm">
          <div className="mb-1 flex items-center justify-between gap-3">
            <span className="font-black tracking-[0.14em] text-[#70e5e5]">DIAGNOSTIC LECTEUR</span>
            <span className="text-white/45">TEMPORAIRE</span>
          </div>
          <p className="mb-1 truncate font-semibold text-white">{playbackDiagnostics.channelName}</p>
          <p className="mb-1 text-[#70e5e5]">{playbackDiagnostics.stage}</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-white/65">
            <span>1. URL : {playbackDiagnostics.urlMs === null ? '…' : `${playbackDiagnostics.urlMs} ms`}</span>
            <span>2. Manifeste : {playbackDiagnostics.manifestMs === null ? '…' : `${playbackDiagnostics.manifestMs} ms`}</span>
            <span>3. Segment : {playbackDiagnostics.segmentMs === null ? '…' : `${playbackDiagnostics.segmentMs} ms`}</span>
            <span>4. Image : {playbackDiagnostics.firstFrameMs === null ? '…' : `${playbackDiagnostics.firstFrameMs} ms`}</span>
          </div>
        </div>
      )}

      {direction && hasActiveStream && (
        <div className="pointer-events-none absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/65 text-white shadow-lg" role="status" aria-label={direction === 'next' ? 'Chaîne suivante' : 'Chaîne précédente'}>
          {direction === 'next' ? <FastForward className="h-5 w-5" /> : <Rewind className="h-5 w-5" />}
        </div>
      )}

      {showFlowLoading && flowTransition && (
        <div
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black"
          style={{
            transform: flowTransition.phase === 'prepare'
              ? `translate3d(0, ${flowTransition.direction === 'next' ? '100%' : '-100%'}, 0)`
              : 'translate3d(0, 0, 0)',
            transition: flowTransition.phase === 'animate' ? 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
          }}
        >
          <div className="flex flex-col items-center gap-3 text-white/75">
            <Loader2 className="h-7 w-7 animate-spin text-[#55dddd]" />
            <span className="text-[10px] font-semibold tracking-[0.18em]">CONNEXION À LA CHAÎNE</span>
          </div>
        </div>
      )}

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
                onClick={() => { invalidateNeahplusStream(channelId); setAttempt((value) => value + 1); }}
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
