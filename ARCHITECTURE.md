# MeteoCompare Web — architecture 1.12

La 1.12 introduit une fondation orientée objet sans modifier les contrats de données météo.

## Composition runtime

`js/core/application-kernel.js` est le point de composition. Il possède :

- `AppState` : forme unique et documentée de l'état mutable de l'application ;
- `CacheRegistry` : caches purement runtime, supprimables sans effet sur les données métier ;
- `FeatureRegistry` : chargement paresseux et dédupliqué des modules fonctionnels ;
- `LocalAnalysisStore` : hydratation paresseuse des analyses persistées par ville ;
- `OperationRegistry` : jetons d'opérations pour ignorer les réponses réseau devenues obsolètes.

Le fichier `js/app.js` reste le point d'entrée et la couche de composition des vues. Les nouvelles responsabilités transverses doivent être ajoutées au kernel ou dans un module dédié plutôt que sous forme de nouvel état global.

## Présentation météo

`js/ui/weather-icons.js` contient le système vectoriel météo. Le domaine (`models.js`, `domain.js`) ne transporte plus d'emoji de présentation : il expose uniquement les conditions, libellés, sévérités et accents.

Les icônes SVG sont statiques par défaut. L'animation est demandée explicitement uniquement par la Home et Today Summary. `prefers-reduced-motion` reste prioritaire via la feuille de style globale.

## Règles d'extension

1. Une donnée persistée appartient à `storage.js` et est hydratée via un dépôt/store dédié.
2. Une fonctionnalité coûteuse ou secondaire est enregistrée dans `FeatureRegistry` et chargée à la demande.
3. Un état purement visuel ou runtime ne doit pas être persisté sans besoin métier explicite.
4. Une représentation graphique (icône, composant, format) ne doit pas être stockée dans le modèle métier.
5. Une opération asynchrone par entité doit utiliser un registre de jetons si une ancienne réponse peut devenir invalide.
