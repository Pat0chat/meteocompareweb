# MeteoCompare Web

Cette arborescence est le port web de MeteoCompare Android v1.8.0. Elle conserve les fonctions météo de l'application fournie, mais supprime volontairement les widgets Android Glance, qui n'ont pas d'équivalent pertinent sur un site web.

Cette révision ajoute une interface pensée pour ordinateur, un audit technique élargi, des corrections de performance/accessibilité/stockage, un déploiement GitHub Pages prêt à l'emploi et une passe de fidélité fonctionnelle qui restaure les informations détaillées de l'application Android.

## Démarrage local

Le site utilise des modules JavaScript ES. Il doit être servi via HTTP(S), et non ouvert directement en `file://`.

```bash
cd folder
python3 -m http.server 8080
```

Puis ouvrir `http://localhost:8080/`.

Aucune compilation et aucune dépendance npm ne sont nécessaires.

## Déployer sur GitHub Pages

Le projet est compatible avec une **Project Page** de la forme `https://utilisateur.github.io/nom-du-depot/` : les ressources, le manifeste, le service worker et les routes utilisent des chemins relatifs.

### Méthode recommandée — GitHub Actions

1. Créer un dépôt GitHub.
2. Copier **le contenu de ce dossier à la racine du dépôt**, y compris `.github/workflows/pages.yml` et `.nojekyll`.
3. Pousser les fichiers sur la branche `main`.
4. Dans GitHub : **Settings → Pages → Build and deployment → Source → GitHub Actions**.
5. Le workflow `Deploy MeteoCompare to GitHub Pages` exécute les tests, prépare le site statique puis le publie.
6. Une fois le workflow terminé, ouvrir l'URL Pages indiquée dans le déploiement.

Le workflow est déjà configuré avec les permissions `pages: write` et `id-token: write`, l'environnement `github-pages`, ainsi que les actions officielles de configuration, packaging et déploiement Pages.

### Domaine personnalisé

GitHub Pages peut également être utilisé derrière un domaine personnalisé. Aucun changement du code n'est nécessaire tant que le site reste servi en HTTPS et que le domaine pointe correctement vers Pages.

## Installation PWA

Le site contient `manifest.webmanifest` et `sw.js`. Sur un hébergement HTTPS tel que GitHub Pages, un navigateur compatible peut proposer l'installation de MeteoCompare comme application web.

Le service worker :

- met en cache le shell statique pour rouvrir l'interface hors connexion ;
- ne met **jamais** en cache les réponses Open-Meteo, afin de ne pas réinjecter un ancien run ;
- utilise une stratégie network-first pour la navigation et le code afin qu'un nouveau déploiement ne reste pas bloqué derrière une ancienne version du cache.

## Adaptations Android → Web

| Android | Web |
|---|---|
| Jetpack Compose | HTML / CSS / JavaScript ES modules |
| Navigation Compose | routeur hash `#/…` |
| DataStore / Room | `localStorage` + IndexedDB |
| WorkManager | contrôle de fraîcheur au chargement + minuterie tant que le site est actif |
| Glance App Widgets | supprimés volontairement |
| gestes de zoom du graphique | horizons 24 h / 72 h / 7 j + défilement horizontal |

### Limite de plateforme

Un site statique ne peut pas garantir l'équivalent de WorkManager lorsque le navigateur est totalement fermé. MeteoCompare vérifie donc la fraîcheur des caches à l'ouverture/retour au premier plan et selon la cadence choisie tant que la page est active.

## Tests inclus

```bash
node tests/smoke.mjs
node tests/ui-performance.mjs
node tests/static-audit.mjs
node tests/pages-compat.mjs
node tests/fidelity-regression.mjs
node tests/analysis-suite.mjs
node tests/stability-i18n-audit.mjs
```

Ils couvrent notamment :

- invariants de normalisation météo et fallback AROME HD ;
- accord pluie et complétude ERA5 ;
- rejet d'une journée de biais de 18 h ;
- debounce de 600 ms et absence de rerender global pendant la frappe ;
- garde-fous de performance de l'interface ;
- accessibilité statique essentielle des dialogues et cartes ;
- absence de conflit entre ancres internes et routeur hash ;
- stockage IndexedDB des gros caches ;
- stratégie de service worker ;
- chemins relatifs et manifeste compatibles GitHub Pages ;
- présence et structure du workflow de déploiement Pages ;
- présence des heatmaps et légendes ;
- chronologie riche 24 h / 7 jours ;
- accord global et action « Pourquoi cet accord ? » dans la TodaySummaryCard, et absence de cette action dans la bande horaire ;
- heatmaps présentes sur lignes paires et impaires ;
- libellé « modèles » associé aux compteurs concernés ;
- biais présent dans les en-têtes de modèles et navigation vers la page de détail du biais ;
- ouverture des routes au sommet de page et restauration Retour/Avancer ;
- conservation de la position exacte lors d’un changement de variable ou de zoom malgré une variation simulée de hauteur du DOM ;
- métriques et historique de la page de biais par modèle ;
- en-têtes/colonne figés des tableaux ;
- comparaison ciblée de modèles et comparaison multi-ville ;
- décomposition du désaccord par variable ;
- métadonnées de fraîcheur/run sans valeur inventée ;
- état de vue partageable dans l’URL ;
- exports CSV/JSON ;
- planification incrémentale de l’historique de biais ;
- mode de densité compacte ;
- exhaustivité des catalogues FR/EN/ES/DE/IT et rerendu réel de l’interface dans les cinq langues ;
- géométrie sticky calculée dynamiquement ;
- exclusion des heures passées des vues horaires ;
- cohérence du fuseau confirmé par l’API ;
- purge complète des données d’une ville ;
- protection contre les réponses réseau obsolètes ;
- cohérence entre cache météo et cohorte de modèles actifs.

Voir aussi `AUDIT_REPORT.md` pour le détail de la passe d'audit.

## Structure

- `index.html` : shell, métadonnées et politique CSP ;
- `styles.css` : design desktop/responsive ;
- `js/models.js` : métadonnées des modèles ;
- `js/api.js` : appels Open-Meteo et normalisation ;
- `js/domain.js` : calculs météo, accord, scénarios, biais, ERA5, évolution ;
- `js/storage.js` : réglages/favoris + cache IndexedDB ;
- `js/i18n.js` : interface multilingue ;
- `js/app.js` : rendu, routeur et interactions ;
- `manifest.webmanifest`, `manifest.{fr,en,es,de,it}.webmanifest`, `sw.js` : PWA et métadonnées localisées ;
- `.github/workflows/pages.yml` : publication GitHub Pages ;
- `.nojekyll` : compatibilité de publication statique ;
- `tests/` : 7 suites de non-régression, performance, audit, fidélité UI, i18n et Pages.

## Confidentialité

Aucun secret ni clé API n'est embarqué. Les requêtes météo sont envoyées directement depuis le navigateur vers Open-Meteo. Les villes, réglages et caches MeteoCompare restent dans le stockage local du navigateur.

La licence et la politique de confidentialité du projet source restent incluses (`LICENSE`, `PRIVACY.md`).
