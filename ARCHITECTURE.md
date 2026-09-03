# MeteoCompare Web — architecture

## Chaîne de données

`transport réseau → normalisation → contrats → persistance → domaine → vues`

- `js/api.js` orchestre les appels Open-Meteo, les budgets réseau et les récupérations ciblées. Un lot rejeté pour sélection de modèle est subdivisé jusqu'à isoler les modèles fautifs ; 408/429/5xx et erreurs réseau restent des erreurs globales afin d'éviter une multiplication des requêtes. Il ne porte plus le décodage détaillé des séries.
- `js/network-config.js` centralise les destinations, chemins first-party et politiques de transport. `js/network.js` applique les invariants communs navigateur (timeout/abort, `credentials: omit`, `no-referrer`, erreurs HTTP/JSON). Les flux Open-Meteo volumineux restent directs ; les métadonnées modèles et Plausible passent par `/_mcx/*`. Voir [`NETWORK.md`](NETWORK.md).
- `js/data/forecast-normalizer.js` aligne les axes horaires/journaliers, filtre les valeurs impossibles, conserve les métadonnées de run, qualifie la couverture et marque les journées civiles partielles.
- `js/data/contracts.js` est la frontière de confiance pour les réglages, villes et prévisions. Les IDs de modèles inconnus, coordonnées invalides, séries désalignées ou caches incohérents sont rejetés ou assainis avant le domaine.
- `js/storage.js` applique les contrats aux lectures, migrations, imports et caches. Les réparations d'intégrité privilégient l'assainissement d'un record récupérable avant sa suppression.
  Les changements de source incompatibles gardant un même ID UI doivent incrémenter le schéma de données et isoler les historiques de l'ancienne source sous un ID legacy ; la migration ECMWF IFS 25 km → HRES 9 km constitue le cas de référence.
- `js/domain.js` ne traite que des données normalisées et orchestre agrégations, chronologies et scénarios ; 
- `js/consensus.js` centralise les consensus numériques, précipitations et conditions météo hiérarchiques.

## Composition runtime

`js/core/application-kernel.js` reste le point de composition. Il possède :

- `AppState` : forme unique et documentée de l'état mutable ;
- `CacheRegistry` : caches purement runtime, supprimables sans effet sur les données métier ;
- `FeatureRegistry` : chargement paresseux et dédupliqué des modules fonctionnels ;
- `LocalAnalysisStore` : hydratation paresseuse des analyses persistées par ville ;
- `OperationRegistry` : jetons d'opérations pour ignorer les réponses réseau devenues obsolètes.

`js/app.js` reste le point d'entrée et la couche de composition des vues. Une nouvelle responsabilité transverse doit être ajoutée au kernel ou à un module dédié, pas sous forme d'un nouvel état global implicite.

Les primitives de rendu graphique génériques (`chartScale`, sélection de ticks, unités/décimales et construction de chemins SVG) vivent dans `js/ui/chart-utils.js`. `js/ui/html.js` centralise l’échappement HTML/attributs. Les vues et features doivent réutiliser ces utilitaires plutôt que recopier ces algorithmes.

## Présentation météo

## Mesure d'audience web

`js/analytics-schema.js` est la source unique du contrat Plausible : routes agrégées, événements autorisés, propriétés de faible cardinalité et caractère interactif. `js/analytics.js` construit les pageviews/événements à partir de ce contrat ; `js/mcx-events.js` fournit un transport navigateur minimal vers le seul endpoint first-party `/_mcx/e`, gère l'opt-out/réactivation et le dernier état de livraison ; `worker.js` réapplique le même contrat avant de relayer côté serveur vers Plausible. Aucun script Plausible tiers n'est chargé dans le navigateur. Une nouvelle mesure doit donc être déclarée dans ce schéma partagé plutôt que directement dans une vue.

Le proxy analytics transmet explicitement le User-Agent et l'IP client fournie par Cloudflare à Plausible, sans accepter un `X-Forwarded-For` client non fiable. Aucune valeur météo, ville, coordonnée ou recherche n'entre dans le contrat.

`js/ui/weather-icons.js` contient le système vectoriel météo. Le domaine (`models.js`, `domain.js`) expose uniquement des conditions et métadonnées métier. Les icônes sont statiques par défaut ; l'animation est explicitement demandée par la Home et Today Summary et respecte `prefers-reduced-motion`.

## Règles d'extension

1. Toute donnée venant du réseau ou du stockage franchit un contrat avant d'être consommée par le domaine.
2. Une donnée persistée appartient à `storage.js` et est hydratée via un store dédié.
3. Une fonctionnalité coûteuse ou secondaire est enregistrée dans `FeatureRegistry` et chargée à la demande.
4. Un état purement visuel/runtime ne doit pas être persisté sans besoin métier explicite.
5. Une représentation graphique ne doit pas être stockée dans le modèle métier.
6. Une opération asynchrone par entité utilise un registre de jetons dès qu'une réponse plus ancienne peut devenir obsolète.
7. Une récupération réseau ne remplace une série existante que si sa qualité mesurée est supérieure.
8. Le shell PWA doit contenir chaque import statique nécessaire au démarrage hors connexion.
9. La génération du cache PWA a une source unique : `cache-version.js`. `sw.js` l'importe via `importScripts()` ; aucun autre fichier ne doit recopier la valeur courante du cache.
10. La version applicative a une source unique : `app-version.js`. Le runtime, le service worker, le build, les workflows et les tests doivent la consommer au lieu de recopier un numéro de version.

## Forecast Engine boundary

`js/forecast-engines.js` is the single post-processing module used by `js/domain.js`. It receives normalized model values plus optional local skill/calibration profiles and returns a common result contract (`central`, `interval`, `effectiveEngine`, `fallback`, calibration coverage and scenario metadata). UI code never reimplements an engine formula. `js/data/contracts.js` owns persistence/normalization of the selected engine. The Details view builds one `forecastEngineContext()` and passes it through daily/hourly aggregation and radar short-term forecast rendering.

Raw model-agreement metrics deliberately stay outside this boundary: `dayConfidence()` and disagreement diagnostics continue to describe source-model convergence rather than the output of a chosen post-processor.

## Frontière Vigilance officielle

`js/features/vigilance.js` est la frontière navigateur de la Vigilance Météo-France. Cette donnée de sécurité est volontairement indépendante du moteur de prévision et de `consensus.js` : elle ne modifie aucun poids de modèle, aucune condition consensus ni aucun scénario 12 h.

Le flux est : `ville normalisée → résolution département → /_mcx/vigilance → Worker → API Bulletin Vigilance Météo-France`. Le Worker conserve uniquement l'API Key comme secret `METEOFRANCE_API_KEY`, l'envoie dans l'en-tête `apikey: <API_KEY>` à Météo-France et extrait seulement les périodes J/J+1 utiles. `js/server/vigilance-shared.js` porte la normalisation de la clé, les erreurs amont, l'extraction des périodes et le contrat de réponse commun au Worker et au preview local. `app.js` ne reçoit donc qu'un contrat assaini destiné à l'affichage Home/Details.


## Topbar service monitoring

The Web topbar exposes a passive system monitoring center. `/_mcx/health` checks only the first-party Worker and configuration flags; upstream providers are not synthetically probed. Forecast, Vigilance, model-metadata and Plausible rows reflect the latest real application requests.

## Utilitaires de shell HTML

`js/server/html-shell.js` centralise l’injection sûre de `<base>` utilisée par le build SEO, le serveur de preview et le Worker pour les routes imbriquées. Une modification de la résolution des assets ne doit pas recopier de regex dans plusieurs runtimes.
