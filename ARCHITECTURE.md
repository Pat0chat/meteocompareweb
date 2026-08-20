# MeteoCompare Web — architecture 1.13

La 1.13 conserve la fondation orientée objet de la 1.12 et formalise une chaîne de données stricte. La priorité est la stabilité : les vues ne doivent jamais avoir à deviner si un payload externe ou persisté est sain.

## Chaîne de données

`transport réseau → normalisation → contrats → persistance → domaine → vues`

- `js/api.js` orchestre les appels Open-Meteo, les budgets réseau et les récupérations ciblées. Un lot rejeté pour sélection de modèle est subdivisé jusqu'à isoler les modèles fautifs ; 408/429/5xx et erreurs réseau restent des erreurs globales afin d'éviter une multiplication des requêtes. Il ne porte plus le décodage détaillé des séries.
- `js/data/forecast-normalizer.js` aligne les axes horaires/journaliers, filtre les valeurs impossibles, conserve les métadonnées de run, qualifie la couverture et marque les journées civiles partielles.
- `js/data/contracts.js` est la frontière de confiance pour les réglages, villes et prévisions. Les IDs de modèles inconnus, coordonnées invalides, séries désalignées ou caches incohérents sont rejetés ou assainis avant le domaine.
- `js/storage.js` applique les contrats aux lectures, migrations, imports et caches. Les réparations d'intégrité privilégient l'assainissement d'un record récupérable avant sa suppression.
- `js/domain.js` ne traite que des données normalisées et contient les calculs de consensus, agrégations, chronologies et scénarios.

## Composition runtime

`js/core/application-kernel.js` reste le point de composition. Il possède :

- `AppState` : forme unique et documentée de l'état mutable ;
- `CacheRegistry` : caches purement runtime, supprimables sans effet sur les données métier ;
- `FeatureRegistry` : chargement paresseux et dédupliqué des modules fonctionnels ;
- `LocalAnalysisStore` : hydratation paresseuse des analyses persistées par ville ;
- `OperationRegistry` : jetons d'opérations pour ignorer les réponses réseau devenues obsolètes.

`js/app.js` reste le point d'entrée et la couche de composition des vues. Une nouvelle responsabilité transverse doit être ajoutée au kernel ou à un module dédié, pas sous forme d'un nouvel état global implicite.

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


## Couche SEO / Cloudflare Pages (1.14)

La navigation interactive reste une SPA, mais les pages publiques de ville ont désormais une frontière serveur dédiée :

`/meteo/{slug}` → Pages Function → géocodage → aperçu Open-Meteo → HTML pré-rendu → hydratation par `js/app.js`.

- `js/seo.js` porte les invariants partagés de slug, URL canonique et textes SEO.
- `functions/meteo/[ville].js` est la route dynamique Cloudflare Pages.
- `functions/_lib/seo-render.js` génère le snapshot HTML et les métadonnées sans script inline.
- `functions/sitemap.xml.js` et `functions/robots.txt.js` génèrent des réponses adaptées au domaine courant.
- `_routes.json` évite d’invoquer les Functions pour les assets statiques.
- une ville ouverte directement depuis le SEO est injectée comme ville transitoire : elle peut utiliser les mêmes chaînes de prévision que les favoris, sans être enregistrée comme favori tant que l’utilisateur ne l’ajoute pas explicitement.

Les vues doivent continuer à produire leurs liens de ville via `citySeoPath()` ; les anciens hashes restent uniquement une couche de compatibilité.
