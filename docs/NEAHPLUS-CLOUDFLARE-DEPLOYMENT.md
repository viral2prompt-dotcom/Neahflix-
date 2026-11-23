# Déploiement Neahflix : Cloudflare Pages + NEAHPLUS natif

Cette architecture concerne uniquement le nouveau dépôt Neahflix. Neahflix Legacy et son Worker Cloudflare `neahflix-shield` ne doivent jamais être modifiés ni réutilisés.

## Architecture retenue

- Cloudflare Pages sert le frontend.
- Pages Functions relaie les API Movix vers `https://api.movix.college`.
- Les routes `/api/neahplus/*` sont maintenant traitées directement par Pages Functions.
- Le pont réutilise la logique NEAHPLUS existante : signatures HMAC, validation des destinations, réécriture des playlists, cookies et réponses Range.
- Aucun service Node.js externe n'est requis pour le déploiement Cloudflare natif. Le serveur Hono/Docker reste dans le dépôt pour le développement local et une éventuelle solution de repli.

## Transport et sécurité réseau

Le transport Node.js d'origine utilise `node:http` avec un DNS lookup personnalisé afin de pinner l'adresse IP de la connexion. Cloudflare indique que son implémentation de `node:http` ignore l'option `lookup`. Le runtime Workers permet toutefois la résolution DNS via `node:dns`.

Le transport Cloudflare effectue donc une résolution préalable et vérifie que toutes les adresses retournées sont publiques avant chaque requête. Ensuite, `fetch()` passe par le proxy réseau Cloudflare, qui n'autorise que les destinations Internet publiques ou l'origine de la zone du Worker et bloque l'accès aux services internes/locaux. Le code refuse aussi de rappeler le même hôte que celui du site.

Cette approche conserve une défense SSRF en profondeur, mais ce n'est pas un pinning de socket identique à celui du serveur Node.js : la connexion HTTP est établie par le réseau Cloudflare après la vérification DNS. Les URL de flux contenant une IP littérale sont refusées par ce transport, car Workers `fetch()` ne prend pas en charge les URL IP directes. Les flux utilisant des noms d'hôte, y compris les sous-domaines `*.tvfree.to`, restent pris en charge.

Références techniques :
- https://developers.cloudflare.com/workers/runtime-apis/nodejs/dns/
- https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/
- https://developers.cloudflare.com/workers/reference/security-model/
- https://developers.cloudflare.com/workers/platform/known-issues/

## Variables Cloudflare Pages

Configurer dans les environnements Production et Preview :

| Nom | Type | Valeur |
| --- | --- | --- |
| `NEAHPLUS_SIGNING_SECRET` | Secret | Secret aléatoire d'au moins 32 caractères |
| `MOVIX_API_ALLOWED_ORIGINS` | Variable facultative | Origines supplémentaires séparées par des virgules ; l'origine du site est déjà autorisée |

Le secret de signature ne doit jamais être placé dans une variable `VITE_*` : ces variables sont intégrées au frontend et deviennent publiques.

Le secret `NEAHPLUS_SIGNING_SECRET` peut être distinct de celui du serveur local. Ne pas le communiquer dans le chat ni le committer dans Git.

## Compatibilité Cloudflare

Dans les paramètres du projet Pages, définir une Compatibility date égale ou postérieure au `2026-08-04`. Cette date active la compatibilité Node.js requise par les imports `node:crypto`, `node:net`, `node:dns`, `node:http` et `node:stream`.

## Configuration frontend

Laisser `VITE_MAIN_API` vide pour que le frontend appelle l'origine courante et passe par Pages Functions. Ne jamais inscrire de secret dans le frontend.

## Vérifications avant mise en production

1. `npm run build`
2. `npm run test:gateway`
3. Tester le runtime Pages avec Wrangler et la Compatibility date configurée.
4. Tester les API Movix.
5. Tester une chaîne NEAHPLUS réelle : résolution, playlist HLS, segments, redirections, cookies, requêtes Range et changement de source.
6. Vérifier les flux provenant de domaines et confirmer qu'aucune URL de flux en IP littérale n'est nécessaire.

Les tests Node automatisés ne remplacent pas un test sur le runtime Workers hébergé. Ne pas basculer le domaine de production avant validation réelle de la lecture vidéo.

## Limites de l'offre gratuite

Les requêtes Pages Functions sont comptabilisées dans le quota Workers Free : 100 000 requêtes par jour, avec une limite CPU de 10 ms par invocation. Chaque appel de segment HLS qui passe par `/api/neahplus/*` déclenche une invocation. Le quota peut donc devenir le premier frein si beaucoup d'utilisateurs regardent longtemps.

À titre indicatif, avec des segments de 10 secondes, un utilisateur qui regarde 2 heures génère environ 720 requêtes de segments, sans compter les playlists et autres appels. Le quota de 100 000 requêtes correspondrait alors à environ 138 journées-utilisateur de 2 heures, avant les autres appels. La durée réelle des segments et le trafic réel devront être mesurés.

Source des limites : https://developers.cloudflare.com/workers/platform/limits/

## Coût et disponibilité

Cette architecture évite Render et son endormissement après inactivité. Elle reste sur Cloudflare Free tant que l'usage respecte les quotas gratuits. Si le trafic dépasse ces limites, les requêtes dynamiques peuvent être refusées jusqu'à la remise à zéro quotidienne du quota. Les ressources statiques du frontend restent servies indépendamment des invocations Pages Functions.
