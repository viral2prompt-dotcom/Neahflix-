import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import {
  computeAudioLevel,
  describeMicrophoneError,
  isSpeakingLevel,
  microphoneUnsupportedInfo,
  VOICE_LIMIT_MESSAGE,
} from '@/utils/watchpartyVoice';

export type VoiceStatus = 'idle' | 'joining' | 'active' | 'error';
export type VoiceLink = 'connecting' | 'connected' | 'failed';

export interface VoicePeer {
  id: string;
  nickname: string;
  muted: boolean;
  speaking: boolean;
  volume: number;
  link: VoiceLink;
}

interface VoiceReadyPayload {
  iceServers: RTCIceServer[];
  maxParticipants: number;
  peers: Array<{ id: string; nickname: string; muted: boolean }>;
}

interface VoiceSignalPayload {
  from: string;
  data?: { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
}

interface PeerRecord {
  pc: RTCPeerConnection;
  pendingCandidates: RTCIceCandidateInit[];
  audio: HTMLAudioElement | null;
}

interface AnalyserRecord {
  analyser: AnalyserNode;
  source: MediaStreamAudioSourceNode;
  samples: Uint8Array<ArrayBuffer>;
  speaking: boolean;
}

const SELF_KEY = 'self';
const SPEAKING_POLL_MS = 200;
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302'] }];

export interface WatchPartyVoiceState {
  status: VoiceStatus;
  error: string | null;
  notice: string | null;
  micOn: boolean;
  hasMicrophone: boolean;
  selfSpeaking: boolean;
  peers: VoicePeer[];
  join: () => Promise<void>;
  leave: () => void;
  toggleMic: () => void;
  setPeerVolume: (peerId: string, volume: number) => void;
}

export function useWatchPartyVoice(socket: Socket | null): WatchPartyVoiceState {
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(false);
  const [hasMicrophone, setHasMicrophone] = useState(false);
  const [selfSpeaking, setSelfSpeaking] = useState(false);
  const [peers, setPeers] = useState<VoicePeer[]>([]);

  const socketRef = useRef<Socket | null>(socket);
  const joinedRef = useRef(false);
  const iceServersRef = useRef<RTCIceServer[]>(DEFAULT_ICE_SERVERS);
  const peerRecordsRef = useRef(new Map<string, PeerRecord>());
  const peerInfoRef = useRef(new Map<string, VoicePeer>());
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analysersRef = useRef(new Map<string, AnalyserRecord>());
  const pollTimerRef = useRef<number | null>(null);

  const publishPeers = useCallback(() => {
    setPeers(Array.from(peerInfoRef.current.values()));
  }, []);

  const updatePeer = useCallback((id: string, patch: Partial<VoicePeer>) => {
    const info = peerInfoRef.current.get(id);
    if (!info) return;
    peerInfoRef.current.set(id, { ...info, ...patch });
    publishPeers();
  }, [publishPeers]);

  const sendSignal = useCallback((to: string, data: { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }) => {
    socketRef.current?.emit('voice:signal', { to, data });
  }, []);

  const detachAnalyser = useCallback((key: string) => {
    const record = analysersRef.current.get(key);
    if (!record) return;
    record.source.disconnect();
    analysersRef.current.delete(key);
  }, []);

  const attachAnalyser = useCallback((key: string, stream: MediaStream) => {
    if (!audioContextRef.current) audioContextRef.current = new AudioContext();
    const context = audioContextRef.current;
    detachAnalyser(key);
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    analysersRef.current.set(key, { analyser, source, samples: new Uint8Array(analyser.fftSize), speaking: false });
  }, [detachAnalyser]);

  const stopSpeakingPoll = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const startSpeakingPoll = useCallback(() => {
    if (pollTimerRef.current !== null) return;
    pollTimerRef.current = window.setInterval(() => {
      let peersChanged = false;
      for (const [key, record] of analysersRef.current) {
        record.analyser.getByteTimeDomainData(record.samples);
        const speaking = isSpeakingLevel(computeAudioLevel(record.samples));
        if (speaking === record.speaking) continue;
        record.speaking = speaking;
        if (key === SELF_KEY) {
          setSelfSpeaking(speaking);
          continue;
        }
        const info = peerInfoRef.current.get(key);
        if (info) {
          peerInfoRef.current.set(key, { ...info, speaking });
          peersChanged = true;
        }
      }
      if (peersChanged) publishPeers();
    }, SPEAKING_POLL_MS);
  }, [publishPeers]);

  const closePeer = useCallback((id: string) => {
    const record = peerRecordsRef.current.get(id);
    if (record) {
      record.pc.onicecandidate = null;
      record.pc.ontrack = null;
      record.pc.onconnectionstatechange = null;
      record.pc.close();
      if (record.audio) {
        record.audio.pause();
        record.audio.srcObject = null;
      }
      peerRecordsRef.current.delete(id);
    }
    detachAnalyser(id);
    peerInfoRef.current.delete(id);
    publishPeers();
  }, [detachAnalyser, publishPeers]);

  const attachRemoteStream = useCallback((id: string, stream: MediaStream) => {
    const record = peerRecordsRef.current.get(id);
    if (!record) return;
    const audio = new Audio();
    audio.autoplay = true;
    audio.setAttribute('playsinline', '');
    audio.srcObject = stream;
    audio.volume = peerInfoRef.current.get(id)?.volume ?? 1;
    if (record.audio) {
      record.audio.pause();
      record.audio.srcObject = null;
    }
    record.audio = audio;
    audio.play().catch(() => {
      setNotice('Le son d\'un participant est bloqué. Touchez l\'écran pour l\'activer.');
    });
    attachAnalyser(id, stream);
  }, [attachAnalyser]);

  const createPeerConnection = useCallback((id: string): RTCPeerConnection => {
    const existing = peerRecordsRef.current.get(id);
    if (existing) return existing.pc;

    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
    peerRecordsRef.current.set(id, { pc, pendingCandidates: [], audio: null });

    const local = localStreamRef.current;
    if (local) {
      local.getAudioTracks().forEach((track) => pc.addTrack(track, local));
    } else {
      pc.addTransceiver('audio', { direction: 'recvonly' });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) sendSignal(id, { candidate: event.candidate.toJSON() });
    };
    pc.ontrack = (event) => {
      attachRemoteStream(id, event.streams[0] ?? new MediaStream([event.track]));
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') updatePeer(id, { link: 'connected' });
      if (pc.connectionState === 'failed') {
        updatePeer(id, { link: 'failed' });
        setNotice('Une connexion vocale a échoué (réseau restrictif). Un serveur TURN peut être nécessaire.');
      }
    };
    return pc;
  }, [attachRemoteStream, sendSignal, updatePeer]);

  const flushPendingCandidates = useCallback(async (id: string) => {
    const record = peerRecordsRef.current.get(id);
    if (!record) return;
    const pending = record.pendingCandidates.splice(0);
    for (const candidate of pending) {
      await record.pc.addIceCandidate(candidate).catch(() => undefined);
    }
  }, []);

  const offerToPeer = useCallback(async (id: string) => {
    try {
      const pc = createPeerConnection(id);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const local = pc.localDescription;
      if (local) sendSignal(id, { description: { type: local.type, sdp: local.sdp } });
    } catch {
      updatePeer(id, { link: 'failed' });
    }
  }, [createPeerConnection, sendSignal, updatePeer]);

  const handleSignal = useCallback(async ({ from, data }: VoiceSignalPayload) => {
    if (!joinedRef.current || !data) return;
    try {
      if (data.description?.type === 'offer') {
        if (!peerInfoRef.current.has(from)) {
          peerInfoRef.current.set(from, { id: from, nickname: 'Participant', muted: false, speaking: false, volume: 1, link: 'connecting' });
          publishPeers();
        }
        const pc = createPeerConnection(from);
        await pc.setRemoteDescription(data.description);
        await flushPendingCandidates(from);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        const local = pc.localDescription;
        if (local) sendSignal(from, { description: { type: local.type, sdp: local.sdp } });
        return;
      }
      const record = peerRecordsRef.current.get(from);
      if (!record) return;
      if (data.description?.type === 'answer') {
        await record.pc.setRemoteDescription(data.description);
        await flushPendingCandidates(from);
      } else if (data.candidate) {
        if (record.pc.remoteDescription) {
          await record.pc.addIceCandidate(data.candidate).catch(() => undefined);
        } else {
          record.pendingCandidates.push(data.candidate);
        }
      }
    } catch {
      updatePeer(from, { link: 'failed' });
    }
  }, [createPeerConnection, flushPendingCandidates, publishPeers, sendSignal, updatePeer]);

  const teardown = useCallback(() => {
    joinedRef.current = false;
    stopSpeakingPoll();
    for (const id of Array.from(peerRecordsRef.current.keys())) closePeer(id);
    for (const key of Array.from(analysersRef.current.keys())) detachAnalyser(key);
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
    peerInfoRef.current.clear();
    publishPeers();
    setSelfSpeaking(false);
    setMicOn(false);
    setHasMicrophone(false);
  }, [closePeer, detachAnalyser, publishPeers, stopSpeakingPoll]);

  const join = useCallback(async () => {
    const current = socketRef.current;
    if (joinedRef.current || status === 'joining') return;
    if (!current?.connected) {
      setError('La connexion au salon n\'est pas encore établie. Réessayez dans un instant.');
      setStatus('error');
      return;
    }
    setStatus('joining');
    setError(null);
    setNotice(null);

    let stream: MediaStream | null = null;
    let failure = null as ReturnType<typeof describeMicrophoneError> | null;
    if (!navigator.mediaDevices?.getUserMedia) {
      failure = microphoneUnsupportedInfo;
    } else {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: false,
        });
      } catch (err) {
        failure = describeMicrophoneError(err);
      }
    }

    if (failure && failure.code === 'denied') {
      setError(failure.message);
      setStatus('error');
      return;
    }
    if (failure) setNotice(failure.message);

    localStreamRef.current = stream;
    setHasMicrophone(Boolean(stream));
    setMicOn(Boolean(stream));
    joinedRef.current = true;
    if (stream) attachAnalyser(SELF_KEY, stream);
    startSpeakingPoll();
    current.emit('voice:join');
  }, [attachAnalyser, startSpeakingPoll, status]);

  const leave = useCallback(() => {
    if (joinedRef.current) socketRef.current?.emit('voice:leave');
    teardown();
    setStatus('idle');
    setError(null);
    setNotice(null);
  }, [teardown]);

  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !micOn;
    stream.getAudioTracks().forEach((track) => { track.enabled = next; });
    setMicOn(next);
    socketRef.current?.emit('voice:state', { muted: !next });
  }, [micOn]);

  const setPeerVolume = useCallback((peerId: string, volume: number) => {
    const clamped = Math.min(1, Math.max(0, volume));
    const record = peerRecordsRef.current.get(peerId);
    if (record?.audio) record.audio.volume = clamped;
    updatePeer(peerId, { volume: clamped });
  }, [updatePeer]);

  useEffect(() => {
    socketRef.current = socket;
    if (!socket) return undefined;

    const onReady = (payload: VoiceReadyPayload) => {
      if (!joinedRef.current) return;
      if (Array.isArray(payload.iceServers) && payload.iceServers.length > 0) iceServersRef.current = payload.iceServers;
      for (const peer of payload.peers) {
        peerInfoRef.current.set(peer.id, { id: peer.id, nickname: peer.nickname, muted: peer.muted, speaking: false, volume: 1, link: 'connecting' });
      }
      publishPeers();
      setStatus('active');
      for (const peer of payload.peers) void offerToPeer(peer.id);
    };
    const onVoiceError = (payload: { message?: string }) => {
      if (!joinedRef.current && status !== 'joining') return;
      teardown();
      setError(payload?.message || VOICE_LIMIT_MESSAGE);
      setStatus('error');
    };
    const onPeerJoined = (peer: { id: string; nickname: string; muted: boolean }) => {
      if (!joinedRef.current) return;
      peerInfoRef.current.set(peer.id, { id: peer.id, nickname: peer.nickname, muted: peer.muted, speaking: false, volume: 1, link: 'connecting' });
      publishPeers();
    };
    const onPeerLeft = ({ id }: { id: string }) => closePeer(id);
    const onVoiceState = ({ id, muted }: { id: string; muted: boolean }) => updatePeer(id, { muted });
    const onDisconnect = () => {
      if (!joinedRef.current) return;
      teardown();
      setStatus('idle');
      setNotice('La connexion au salon a été coupée. Rejoignez le vocal pour reprendre.');
    };

    socket.on('voice:ready', onReady);
    socket.on('voice:error', onVoiceError);
    socket.on('voice:peer-joined', onPeerJoined);
    socket.on('voice:peer-left', onPeerLeft);
    socket.on('voice:state', onVoiceState);
    socket.on('voice:signal', handleSignal);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('voice:ready', onReady);
      socket.off('voice:error', onVoiceError);
      socket.off('voice:peer-joined', onPeerJoined);
      socket.off('voice:peer-left', onPeerLeft);
      socket.off('voice:state', onVoiceState);
      socket.off('voice:signal', handleSignal);
      socket.off('disconnect', onDisconnect);
    };
  }, [socket, status, handleSignal, closePeer, offerToPeer, publishPeers, teardown, updatePeer]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible' || !joinedRef.current) return;
      void audioContextRef.current?.resume().catch(() => undefined);
      for (const record of peerRecordsRef.current.values()) {
        if (record.audio?.paused) void record.audio.play().catch(() => undefined);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => teardown, [teardown]);

  return {
    status,
    error,
    notice,
    micOn,
    hasMicrophone,
    selfSpeaking,
    peers,
    join,
    leave,
    toggleMic,
    setPeerVolume,
  };
}
