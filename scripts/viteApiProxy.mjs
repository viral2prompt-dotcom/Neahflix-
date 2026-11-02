const MAIN_API_TARGET = 'http://127.0.0.1:25565';

// Les routes /api sont servies par le serveur Hono (server/index.js), qui
// relaie ensuite le Main API distant. En développement comme en production,
// elles doivent donc passer par le port Hono, et non par le port 25565 qui
// n'est pas démarré par les scripts de lancement actuels.
export const createApiProxy = (neahplusPort) => {
  const honoTarget = `http://127.0.0.1:${neahplusPort}`;

  return {
    '/backend-api': {
      target: MAIN_API_TARGET,
      changeOrigin: true,
      secure: false,
      rewrite: (path) => path.replace(/^\\/backend-api/, ''),
    },
    // Cette route spécifique reste avant /api pour conserver le routage
    // explicite NEAHPLUS vers le même serveur Hono.
    '/api/neahplus/': {
      target: honoTarget,
      changeOrigin: true,
      secure: false,
    },
    // Le serveur Hono transmet /api/* à https://api.movix.college.
    '/api': {
      target: honoTarget,
      changeOrigin: true,
      secure: false,
    },
    '/neahlite': {
      target: MAIN_API_TARGET,
      changeOrigin: true,
      secure: false,
    },
  };
};
