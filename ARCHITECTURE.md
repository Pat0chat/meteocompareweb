# MeteoCompare Web — architecture 1.13

La 1.13 conserve la fondation orientée objet de la 1.12 et formalise une chaîne de données stricte. La priorité est la stabilité : les vues ne doivent jamais avoir à deviner si un payload externe ou persisté est sain.

## Chaîne de données

`transport réseau → normalisation → contrats → persistance → domaine → vues`

- `js/api.js` orchestre les appels Open-Meteo, les budgets réseau et les récupérations ciblées. Un lot rejeté pour sélection de modèle est subdivisé jusqu'à isoler les modèles fautifs ; 408/429/5xx et erreurs réseau restent des erreurs globales afin d'éviter une multiplication des requêtes. Il ne porte plus le décodage détaillé des séries.
- `js/network-config.js` centralise les destinations, chemins first-party et politiques de transport. `js/network.js` applique les invariants communs navigateur (timeout/abort, `credentials: omit`, `no-referrer`, erreurs HTTP/JSON). Les flux Open-Meteo volumineux restent directs ; les métadonnées modèles et Plausible passent par `/_mcx/*`. Voir `NETWORK_AUDIT.md`.
- `js/data/forecast-normalizer.js` aligne les axes horaires/journaliers, filtre les valeurs impossibles, conserve les métadonnées de run, qualifie la couverture et marque les journées civiles partielles.
- `js/data/contracts.js` est la frontière de confiance pour les réglages, villes et prévisions. Les IDs de modèles inconnus, coordonnées invalides, séries désalignées ou caches incohérents sont rejetés ou assainis avant le domaine.
- `js/storage.js` applique les contrats aux lectures, migrations, imports et caches. Les réparations d'intégrité privilégient l'assainissement d'un record récupérable avant sa suppression.
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

Les primitives de rendu graphique génériques (`chartScale`, sélection de ticks, unités/décimales et construction de chemins SVG) vivent dans `js/ui/chart-utils.js`. Les vues et features doivent les réutiliser plutôt que recopier ces algorithmes.

## Présentation météo

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
