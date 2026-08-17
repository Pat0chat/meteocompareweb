# MeteoCompare Web — port de l’application Android v1.8.0

Cette arborescence est une version web statique de MeteoCompare. Elle reprend la logique météo et l’expérience de comparaison de l’application Android fournie, sans les widgets Android Glance.

## Lancer localement

Le site utilise des modules JavaScript ES : il faut le servir en HTTP(S), et non ouvrir `index.html` en `file://`.

```bash
cd meteocompare-web-v1.8.0
python3 -m http.server 8080
```

Puis ouvrir `http://localhost:8080/`.

Aucune compilation et aucune dépendance npm ne sont nécessaires.

## Déploiement

Le dossier peut être déployé tel quel sur un hébergement statique HTTPS : GitHub Pages, Cloudflare Pages, Netlify, serveur Nginx/Apache, etc. Il ne contient aucun secret ni clé API.

Les appels météo partent directement du navigateur vers Open-Meteo :

- Forecast API
- Geocoding API
- Archive API / ERA5
- Previous Runs API

## Fonctionnalités portées

- favoris : recherche, ajout, retrait et affichage multi-ville ;
- comparaison des modèles météo (17 modèles du projet Android) et sélection des modèles ;
- résumé de la journée, conditions courantes, lever/coucher du soleil ;
- heatmap des 12 prochaines heures et scénarios multi-modèles ;
- chronologie des prochains jours et synthèse « À retenir » ;
- score d’accord inter-modèles ;
- bande horaire température / pluie / vent avec horizons 24 h, 72 h et 7 jours ;
- repères thermiques ERA5 sur 10 ans avec garde de complétude ;
- tableaux détaillés par jour et par heure ;
- conditions WMO et fallback de condition dérivée ;
- fallback AROME HD de nébulosité à partir des couches basse / moyenne / haute ;
- vent et rafales, direction du vent uniquement lorsqu’elle est pertinente ;
- évolution des prévisions par snapshots locaux ~24 / 48 / 72 h ;
- suivi du biais local J+1 avec Previous Runs + Archive ;
- bootstrap du biais uniquement sur des journées civiles complètes de 23 à 25 h ;
- minimum de 14 journées correspondantes avant d’afficher un biais ;
- thèmes système / clair / sombre ;
- langues FR / EN / ES / DE / IT pour les principaux éléments d’interface ;
- réglage de la fréquence de rafraîchissement ;
- mode hors connexion sur le dernier cache disponible ;
- PWA installable (manifest + service worker pour l’interface statique) ;
- stockage local des favoris, réglages, caches, biais et historiques ;
- liens de soutien du projet ;
- aucun widget Glance.


## Optimisations de réactivité web

Cette révision corrige les gels observés dans le premier port :

- recherche de ville déclenchée 600 ms après la dernière frappe, avec annulation de la requête précédente ;
- mise à jour locale du modal de recherche, sans reconstruction de toute l’application à chaque caractère ;
- délégation d’événements unique au niveau de l’application au lieu de rattacher des listeners à chaque rerender ;
- cache de l’objet i18n et des formateurs `Intl.NumberFormat` / `Intl.DateTimeFormat` ;
- cache mémoire des agrégations journalières, scénarios, bandes d’accord, évolution et biais tant que la prévision source ne change pas ;
- scénarios des cartes d’accueil calculés uniquement à l’ouverture de leur volet ;
- rafraîchissements automatiques des villes sérialisés et rafraîchissement global limité à deux villes simultanées ;
- `content-visibility` utilisé pour éviter le layout/paint des sections hors écran.

## Adaptations Android → Web

| Android | Web |
|---|---|
| Jetpack Compose | HTML/CSS/JavaScript ES modules |
| Navigation Compose | routes par hash `#/…` |
| DataStore / Room | stockage local du navigateur |
| WorkManager | vérification de fraîcheur au chargement + minuterie quand le site est ouvert |
| Glance App Widgets | supprimés volontairement |
| gestes de zoom du graphique | horizons 24 h / 72 h / 7 j + défilement horizontal tactile |

### Limite de plateforme importante

Un site statique ne peut pas reproduire de façon fiable WorkManager quand le navigateur est complètement fermé. MeteoCompare Web actualise selon la cadence choisie tant que la page est active et vérifie la fraîcheur du cache au prochain chargement. Le service worker rend l’interface réouvrable hors ligne, mais il ne prétend pas fournir une exécution périodique garantie en arrière-plan.

## Tests inclus

```bash
node tests/smoke.mjs
node tests/ui-performance.mjs
```

Les tests couvrent notamment :

- l’alignement des valeurs avec les timestamps valides ;
- le fallback de couverture nuageuse AROME HD ;
- les champs solaires partagés du batch ;
- le calcul de l’accord pluie en cas de modèles divisés ;
- le rejet d’une journée de seulement 18 h dans le bootstrap de biais ;
- la garde de complétude des normales ERA5 ;
- le debounce de recherche de ville (600 ms après la dernière frappe) ;
- l’absence de rerender complet pendant la saisie et l’unicité de la requête de géocodage.

## Structure

- `index.html` : shell de l’application ;
- `styles.css` : interface responsive ;
- `js/models.js` : métadonnées des modèles ;
- `js/api.js` : appels Open-Meteo et normalisation des batchs ;
- `js/domain.js` : calculs météo, confiance, scénarios, biais, ERA5, évolution ;
- `js/storage.js` : favoris, réglages et caches locaux ;
- `js/i18n.js` : interface multilingue ;
- `js/app.js` : rendu, navigation et interactions ;
- `manifest.webmanifest`, `sw.js` : PWA / shell hors ligne ;
- `tests/smoke.mjs` : tests de non-régression du portage ;
- `tests/ui-performance.mjs` : test du debounce et du chemin de saisie sans rerender global.

## Licence et confidentialité

Le port conserve la licence et la politique de confidentialité fournies avec le projet source (`LICENSE`, `PRIVACY.md`).
