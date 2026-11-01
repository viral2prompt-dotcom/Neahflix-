export const SPEAKING_THRESHOLD = 0.02;

export const VOICE_LIMIT_MESSAGE = 'Le salon vocal est complet (6 personnes maximum).';

export const computeAudioLevel = (samples: Uint8Array): number => {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const value = (samples[i] - 128) / 128;
    sum += value * value;
  }
  return Math.sqrt(sum / samples.length);
};

export const isSpeakingLevel = (level: number): boolean => level > SPEAKING_THRESHOLD;

export type MicrophoneFailure = 'denied' | 'missing' | 'busy' | 'unsupported' | 'unknown';

export interface MicrophoneFailureInfo {
  code: MicrophoneFailure;
  message: string;
}

export const describeMicrophoneError = (error: unknown): MicrophoneFailureInfo => {
  const name = error instanceof DOMException || error instanceof Error ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return {
        code: 'denied',
        message: 'Le micro est bloqué. Autorisez l\'accès au micro pour ce site dans les réglages du navigateur, puis réessayez.',
      };
    case 'NotFoundError':
    case 'OverconstrainedError':
      return {
        code: 'missing',
        message: 'Aucun microphone détecté sur cet appareil. Vous entendez le salon sans pouvoir parler.',
      };
    case 'NotReadableError':
    case 'AbortError':
      return {
        code: 'busy',
        message: 'Le micro est utilisé par une autre application. Fermez-la puis réessayez.',
      };
    default:
      return {
        code: 'unknown',
        message: 'Le micro n\'a pas pu être activé. Réessayez.',
      };
  }
};

export const microphoneUnsupportedInfo: MicrophoneFailureInfo = {
  code: 'unsupported',
  message: 'Le micro n\'est pas disponible dans ce navigateur (connexion HTTPS requise). Vous entendez le salon sans pouvoir parler.',
};
