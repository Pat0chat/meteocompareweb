# MeteoCompare Web

## Démarrage local

Le site utilise des modules JavaScript ES. Il doit être servi via HTTP(S), et non ouvert directement en `file://`.

```bash
cd meteocompare-web-v1.12.1
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

Le site contient `manifest.webmanifest` et `sw.js`. Sur un hébergement HTTPS tel que GitHub Pages, les navigateurs compatibles peuvent installer MeteoCompare comme application web.

La page **À propos → Installer la version web** fournit désormais une expérience d'installation adaptative :

- lorsque le navigateur expose `beforeinstallprompt`, un bouton **Installer MeteoCompare** déclenche le dialogue natif ;
- sinon, MeteoCompare affiche la procédure à suivre dans le navigateur (menu d'installation, ajout à l'écran d'accueil, ou bouton d'application web de Firefox Windows récent) ;
- si l'application est déjà lancée en mode standalone, l'état « déjà installé » est affiché.

Le navigateur reste l'autorité qui réalise réellement l'installation ; le bouton MeteoCompare ne contourne jamais les capacités du navigateur.

Le service worker :

- met en cache le shell statique pour rouvrir l'interface hors connexion ;
- ne met **jamais** en cache les réponses Open-Meteo, afin de ne pas réinjecter un ancien run ;
- utilise une stratégie network-first pour la navigation et le code afin qu'un nouveau déploiement ne reste pas bloqué derrière une ancienne version du cache.

## Fonctionnalités météo conservées

- système d’icônes météo SVG détaillé et homogène dans toute l’interface, avec animations multi-couches plus naturelles sur la Home et Today Summary ;
- favoris : recherche, ajout, retrait et affichage multi-ville ;
- comparaison des 17 modèles du projet Android et sélection des modèles ;
- résumé journalier, conditions actuelles, lever/coucher du soleil ;
- heatmap 12 h et scénarios multi-modèles ;
- chronologie riche avec modes 24 h / 7 jours, repères réguliers, bande thermique, signal pluie, nébulosité, vent/rafales, accord et variables en désaccord ;
- synthèse « À retenir » ;
- accord global remis dans la TodaySummaryCard, avec « Pourquoi cet accord ? » au même endroit ;
- score d'accord inter-modèles et bande horaire séparée ;
- bandes d'incertitude température / pluie / vent, horizons 24 h / 72 h / 7 jours ;
- repères thermiques ERA5 sur 10 ans avec garde de complétude ;
- tableaux détaillés journaliers et horaires avec heatmaps et légendes par variable ;
- heatmaps appliquées à toutes les lignes du tableau, y compris les lignes alternées ;
- compteurs explicitement libellés en « modèles » dans les cartes, accords, scénarios et diagnostics ;
- biais affiché dans l’en-tête de chaque modèle concerné, et non répété dans les cellules ;
- page de biais dédiée par modèle/variable : indice local de fiabilité, MAE/RMSE, biais signé, variabilité, jours proches, tendance récente, historique prévision/observation, comparaison multi-modèles et diagnostics pluie ;
- conditions WMO et fallback de condition dérivée ;
- fallback AROME HD de nébulosité basse / moyenne / haute ;
- évolution des prévisions via snapshots locaux ~24 / 48 / 72 h ;
- biais local J+1 avec Previous Runs + Archive ;
- bootstrap du biais uniquement sur des journées civiles complètes de 23 à 25 h ;
- minimum de 14 journées correspondantes avant exposition du biais ;
- thèmes système / clair / sombre ;
- langues FR / EN / ES / DE / IT pour les éléments traduits ;
- cadence de rafraîchissement ;
- cache local et PWA ;
- aucun widget Glance.

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
node tests/chart-redesign.mjs
node tests/pwa-about-legends.mjs
node tests/interactive-legends.mjs
node tests/evolution-reliability-icon.mjs
node tests/model-data-audit.mjs
node tests/settings-short-models.mjs
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

## Structure

- `index.html` : shell, métadonnées et politique CSP ;
- `styles.css` : design desktop/responsive ;
- `js/core/` : kernel applicatif, état, caches, opérations et chargement paresseux ;
- `js/ui/weather-icons.js` : système vectoriel centralisé des icônes météo ;
- `js/models.js` : métadonnées métier des modèles et conditions, sans dépendance de présentation ;
- `js/api.js` : appels Open-Meteo et normalisation ;
- `js/domain.js` : calculs météo, accord, scénarios, biais, ERA5, évolution ;
- `js/storage.js` : réglages/favoris + cache IndexedDB ;
- `js/i18n.js` : interface multilingue ;
- `js/analytics-config.js` : activation explicite de la mesure d’audience ;
- `js/analytics.js` : pageviews expurgées + événements PWA minimaux ;
- `js/app.js` : composition des vues, routeur et interactions, branchés sur le kernel ;
- `ARCHITECTURE.md` : responsabilités, points d’extension et règles de séparation ;
- `manifest.webmanifest`, `manifest.{fr,en,es,de,it}.webmanifest`, `sw.js` : PWA et métadonnées localisées ;
- `.github/workflows/pages.yml` : publication GitHub Pages ;
- `.nojekyll` : compatibilité de publication statique ;
- `tests/` : suites de non-régression, performance, architecture, audit, fidélité UI/données, graphes, PWA, i18n, analytics et Pages.

## Confidentialité et mesure d’audience

Aucun secret ni clé API n'est embarqué. Les requêtes météo sont envoyées directement depuis le navigateur vers Open-Meteo. Les villes, réglages, caches, biais et snapshots MeteoCompare restent dans le stockage local du navigateur.

La version web intègre une **mesure d’audience minimale facultative** basée sur l’Events API de Plausible : pageviews sur des routes expurgées (`/city`, `/bias`, etc.), clic sur le bouton d’installation PWA et installation PWA détectée. Sa finalité est limitée à la mesure de la fréquentation/charge, au dimensionnement de l’hébergement et au suivi des installations PWA détectées. Aucun nom de ville, coordonnée, modèle, prévision, biais ou historique n’est ajouté aux événements. Aucun cookie analytics ni identifiant persistant n’est créé par MeteoCompare, et ces statistiques ne sont pas réutilisées pour la publicité ou le profilage.

Par sécurité, `js/analytics-config.js` est livré avec `enabled: false`. Après création de ton site Plausible, renseigne son `domain` exact puis passe `enabled` à `true`. Voir `ANALYTICS.md` pour la procédure, les limites du comptage PWA, GPC/DNT et le rappel CNIL : l’éventuelle exemption de consentement dépend de conditions strictes et de la configuration réelle du fournisseur au déploiement.

La politique complète est dans `PRIVACY.md`.