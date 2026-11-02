const MAIN_API_TARGET = 'http://127.0.0.1:25565';

// Le proxy applique la première clé qui correspond au préfixe de l'URL : la
// route NEAHPLUS doit donc rester avant '/api', sinon elle part vers le Main API.
export const createApiProxy = (neahplusPort) => ({
  '/backend-api': {
    target: MAIN_API_TARGET,
    changeOrigin: true,
    secure: false,
    rewrite: (path) => path.replace(/^\/backend-api/, ''),
  },
  '/api/neahplus/': {
    target: `http://127.0.0.1:${neahplusPort}`,
    changeOrigin: true,
    secure: false,
  },
  '/api': {
    target: MAIN_API_TARGET,
    changeOrigin: true,
    secure: false,
  },
  '/neahlite': {
    target: MAIN_API_TARGET,
    changeOrigin: true,
    secure: false,
  },
});
