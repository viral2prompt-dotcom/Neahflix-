let hlsModulePromise: Promise<typeof import('hls.js')> | null = null;

export const loadHlsModule = (): Promise<typeof import('hls.js')> => {
  if (!hlsModulePromise) {
    hlsModulePromise = import('hls.js').catch((error: unknown) => {
      hlsModulePromise = null;
      throw error;
    });
  }
  return hlsModulePromise;
};

// Charge uniquement le code du lecteur pendant le toucher, sans demander de flux vidéo.
export const preloadNeahplusPlayer = (): void => {
  void loadHlsModule().catch(() => undefined);
};
