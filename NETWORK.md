# Audit réseau — MeteoCompare Web

## Résumé

Le runtime utilise désormais une politique réseau explicite et centralisée :

- `js/network-config.js` est la source unique des destinations réseau applicatives, des chemins first-party et des timeouts transverses ;
- `js/network.js` est la couche commune de transport navigateur pour les ressources JSON/blob : timeout, propagation d'annulation, `credentials: omit`, `referrerPolicy: no-referrer`, validation HTTP et erreurs structurées ;
- `js/api-budget.js` conserve la responsabilité spécifique Open-Meteo : budget anti-emballement, déduplication, cache mémoire et erreurs déclarées par le fournisseur ;
- `worker.js` possède une couche commune pour les appels amont first-party : timeout, 502/504 maîtrisés, entêtes filtrés et réponses non contaminées par des cookies tiers ;
- `sw.js` ne met jamais en cache les endpoints dynamiques `/_mcx/*` ni les API Open-Meteo.

L'objectif n'est volontairement **pas** de proxifier tout le trafic. Les gros flux météo/radar restent directs afin de ne pas transformer le Worker MeteoCompare en concentrateur de trafic ou en proxy de bande passante.

## Inventaire des points d'entrée

| Flux | Appel navigateur | Destination réelle | Transport | Timeout / cache | Gestion |
| --- | --- | --- | --- | --- | --- |
| Prévisions multi-modèles | `js/api.js` → `js/api-budget.js` | `api.open-meteo.com/v1/forecast` | direct | 30 s ; cache métier/local + déduplication runtime | budget local, erreurs HTTP structurées, erreur Open-Meteo, récupération ciblée des modèles dégradés |
| Recherche de villes | `js/api.js` → `js/api-budget.js` | `geocoding-api.open-meteo.com/v1/search` | direct | 30 s ; cache mémoire 5 min | annulation de recherche, budget, HTTP/JSON commun |
| Archives / normales ERA5 | `js/api.js` → `js/api-budget.js` | `archive-api.open-meteo.com/v1/archive` | direct | 45 s | budget, erreurs structurées ; persistance gérée hors transport |
| Runs précédents | `js/api.js` → `js/api-budget.js` | `previous-runs-api.open-meteo.com/v1/forecast` | direct | 45 s | récupération best-effort des séries historiques tronquées |
| Marine | `js/features/marine.js` → `js/api-budget.js` | `marine-api.open-meteo.com/v1/marine` | direct | 15–30 s ; détection cache/capacité selon appel | budget commun, validation de grille côtière, fallback modèle de vagues |
| Santé des modèles | `js/features/model-health.js` | `/_mcx/model-metadata` | first-party | navigateur 10 s ; Worker edge 5 min | clé validée, timeout Worker, 502/504, CDN tiers invisible du navigateur |
| Métadonnées santé amont | `worker.js` | `openmeteo-data-spatial.b-cdn.net/<key>/latest.json` | Worker → tiers | 12 s ; cache edge 5 min | GET/HEAD seulement, clé bornée, réponse JSON durcie |
| Métadonnées radar | `js/features/radar.js` → `js/network.js` | `api.rainviewer.com/public/weather-maps.json` | direct, optionnel | 12 s ; mémoire 5 min | host RainViewer retourné validé avant usage |
| Images radar d'analyse | `js/features/radar.js` → `js/network.js` | `*.rainviewer.com/...png` | direct, optionnel | 15 s ; cache navigateur `force-cache` | abort à la fermeture, HTTP/timeout commun, échec limité au radar |
| Image radar affichée | `<img>` dynamique | `*.rainviewer.com/...png` | direct, optionnel | cache HTTP navigateur | échec visuel non bloquant pour la météo principale |
| Fond cartographique | `<img>` tuiles | `tile.openstreetmap.org/{z}/{x}/{y}.png` | direct, optionnel | cache HTTP navigateur | contenu purement visuel ; ne bloque pas les données météo |
| Script Plausible | `js/plausible-bootstrap.js` | `/_mcx/p.js` → `plausible.io` | first-party | Worker 12 s ; edge 5 min | uniquement hôtes prod autorisés, DNT/GPC/opt-out avant chargement |
| Événements Plausible | tracker → `/_mcx/e` | `plausible.io/api/event` | first-party | Worker 8 s ; `no-store` | POST seulement, corps max 64 KiB, cookies/entêtes Cloudflare sensibles non relayés |
| Assets applicatifs | navigateur / Service Worker | `meteocompare.app` | first-party | stratégie PWA selon type | navigation/code network-first ; assets immuables cache-first |

## Règles uniformisées

### Transport navigateur

`js/network.js` applique par défaut :

- `credentials: 'omit'` : aucune credential/cookie n'est envoyée aux fournisseurs de données ;
- `referrerPolicy: 'no-referrer'` : les URLs de vues MeteoCompare ne sont pas communiquées aux API tierces ;
- timeout via `AbortController` ;
- propagation d'un signal d'annulation externe ;
- erreur `HTTP_ERROR` avec `status` et `retryAfter` ;
- erreur `NETWORK_TIMEOUT` tout en conservant `name = 'AbortError'` pour la compatibilité UI ;
- validation/parsing JSON centralisés.

Open-Meteo ajoute au-dessus de cette couche : compteur local anti-boucle, cache mémoire, déduplication et reconnaissance de `json.error`.

### Worker first-party

Les routes `/_mcx/*` sont les seules routes dynamiques exécutées avant les assets Cloudflare. Les appels amont ont un timeout et renvoient une erreur de passerelle maîtrisée :

- `504` pour timeout amont ;
- `502` pour panne réseau/amont non joignable ;
- statut fournisseur conservé pour les métadonnées modèle quand une réponse HTTP réelle existe ;
- pas de `Set-Cookie` tiers renvoyé au navigateur ;
- `X-Content-Type-Options: nosniff` sur les réponses proxy ;
- cache explicitement borné pour les ressources GET légères ; analytics events en `no-store`.

### Service Worker

Le Service Worker ne doit gérer que le shell PWA. Il contourne explicitement :

- tous les chemins `/_mcx/*` ;
- tous les sous-domaines `*.open-meteo.com` ;
- toute origine externe.

Cela évite qu'une réponse dynamique first-party soit accidentellement stockée comme un asset immuable. Avant cet audit, `/_mcx/model-metadata` pouvait être placé dans le Cache Storage PWA sans expiration effective ; ce point est corrigé.

## CSP

La CSP navigateur reflète la politique de transport :

- `connect-src 'self'` pour les proxies first-party ;
- accès direct autorisé uniquement aux API Open-Meteo et à RainViewer ;
- `img-src` autorise uniquement les images locales/data, OpenStreetMap et RainViewer ;
- Plausible et `openmeteo-data-spatial.b-cdn.net` ne sont pas autorisés directement, puisqu'ils passent par le Worker.

Un test de régression vérifie désormais l'alignement entre configuration réseau, CSP et Service Worker.

## Confidentialité

L'audit a identifié une incohérence dans l'opt-out analytics : `plausible-bootstrap.js` lisait `ANALYTICS_CONFIG.optOutStorageKey`, mais cette propriété n'était pas définie. Le client analytics bloquait les événements, mais le bootstrap pouvait malgré tout télécharger le script. La clé est maintenant définie dans `js/analytics-config.js` et partagée par le bootstrap et `js/analytics.js`.

## Choix de non-proxy

### Open-Meteo

Les prévisions, géocodage, archives, runs précédents et données marines restent directes depuis le navigateur. Les proxifier ferait porter au Worker MeteoCompare tout le trafic API et concentrerait le rate limiting sur l'infrastructure MeteoCompare. La gestion est néanmoins uniforme au niveau du client réseau.

### Radar et cartographie

Les PNG RainViewer et les tuiles OpenStreetMap sont volumineux et déclenchés uniquement lorsque l'utilisateur ouvre le radar. Ils restent directs. Une panne de ces sources doit dégrader uniquement le radar, jamais la prévision principale.

## Tests de non-régression

Les tests couvrent désormais notamment :

- defaults de confidentialité du client réseau ;
- timeout et erreur HTTP structurée ;
- centralisation des destinations réseau ;
- cohérence CSP ;
- bypass `/_mcx/*` du Service Worker ;
- configuration de l'opt-out analytics ;
- Worker first-party, timeout amont et limite de payload analytics.
