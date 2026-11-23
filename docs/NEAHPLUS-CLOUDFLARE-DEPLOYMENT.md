# Déploiement Neahflix : Cloudflare Pages + backend Node.js

Cette architecture concerne uniquement le nouveau dépôt Neahflix. Neahflix Legacy et son Worker Cloudflare `neahflix-shield` ne doivent jamais être modifiés ni réutilisés.

## Architecture

- Cloudflare Pages sert le frontend et exécute les Pages Functions.
- `functions/api/[[path]].js` relaie les API Movix vers `https://api.movix.college`.
- Les routes `/api/neahplus/*` sont relayées par Pages vers un service Node.js HTTPS séparé.
- Le service Node.js conserve Hono, les signatures NEAHPLUS, la validation des destinations, le transport HTTP et la réécriture des playlists.
- Un secret partagé entre Pages et Node.js protège l'accès au pont NEAHPLUS.

Le pont Node.js n'est pas porté directement dans Workers : son transport utilise `node:http` avec l'option DNS personnalisée `lookup`, que l'implémentation Workers de `node:http` ne prend pas en charge. Le module `node:dns` Workers ne prend pas non plus en charge `lookup`/ `lookupService`.

## Variables Cloudflare Pages

Configurer ces variables dans les environnements Production et Preview si les deux doivent fonctionner :

| Nom | Type | Valeur |
| --- | --- | --- |
| `NEAHPLUS_BACKEND_ORIGIN` | Variable | URL HTTPS de base du service Node.js, sans chemin |
| `NEAHPLUS_GATEWAY_TOKEN` | Secret | Jeton aléatoire d'au moins 32 caractères, identique côté backend |
| `MOVIX_API_ALLOWED_ORIGINS` | Variable facultative | Origines supplémentaires séparées par des virgules ; l'origine du site est déjà autorisée |

Ne jamais mettre le jeton dans une variable `VITE_*` : les variables Vite sont intégrées au frontend et deviennent publiques.

## Variables du service Node.js

| Nom | Type | Valeur |
| --- | --- | --- |
| `NEAHPLUS_GATEWAY_TOKEN` | Secret | Exactement le même jeton que dans Cloudflare Pages |
| `NEAHPLUS_SIGNING_SECRET` | Secret | Secret aléatoire d'au moins 32 caractères, distinct du jeton de passerelle |
| `PORT` | Variable | Le fournisseur doit injecter le port d'écoute ; le serveur utilise 3001 par défaut |

Le service doit être déployé depuis la racine du dépôt avec le `Dockerfile` existant. Le contrôle de santé est `/health`. Le statut du pont est disponible sur `/health/neahplus`.

## Configuration frontend

Laisser `VITE_MAIN_API` vide pour que le frontend appelle l'origine courante et passe par Pages Functions. Ne pas inscrire l'URL du backend Node.js dans le frontend.

## Vérifications avant mise en production

1. `npm run build`
2. `npm run test:gateway`
3. Démarrer le backend Node.js avec les deux secrets configurés.
4. Vérifier `/health` et `/health/neahplus` ; ce dernier doit indiquer `enabled: true`.
5. Vérifier qu'un appel direct à `/api/neahplus` sur le backend, sans jeton de passerelle, retourne 403.
6. Vérifier via le domaine Pages les API Movix, les playlists HLS, les segments vidéo, les redirections, les cookies et les différentes sources NEAHPLUS.

Ne pas déployer le frontend en production avant que ces tests de lecture aient réussi.

## Coût et disponibilité

Cloudflare Pages/Functions peut rester sur l'offre gratuite dans ses limites. Un service Node.js gratuit peut s'endormir après une période d'inactivité selon le fournisseur choisi : cela peut retarder la première lecture. Aucun fournisseur ne doit être activé avec une option payante sans validation explicite.
