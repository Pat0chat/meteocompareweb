# MeteoCompare Web v1.8.0 — Graph Redesign

Cette arborescence est le port web de MeteoCompare Android v1.8.0. Elle conserve les fonctions météo de l'application fournie, mais supprime volontairement les widgets Android Glance, qui n'ont pas d'équivalent pertinent sur un site web.

Cette révision ajoute une interface pensée pour ordinateur, un audit technique élargi, des corrections de performance/accessibilité/stockage, un déploiement GitHub Pages prêt à l'emploi et une passe de fidélité fonctionnelle qui restaure les informations détaillées de l'application Android.

## Démarrage local

Le site utilise des modules JavaScript ES. Il doit être servi via HTTP(S), et non ouvert directement en `file://`.

```bash
cd meteocompare-web-v1.8.0-graph-redesign
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

## Refonte desktop

La révision remplace plusieurs conventions héritées de l'application téléphone par une interface web plus professionnelle :

- conteneur jusqu'à 1560 px au lieu d'une colonne étroite ;
- barre de navigation desktop avec actions explicites ;
- tableau de bord avec indicateurs de villes, modèles, caches chargés et fraîcheur ;
- grille de villes 3 colonnes sur grand écran, puis 2/1 colonnes selon la largeur ;
- cartes plus denses, typographie et hiérarchie visuelle revues ;
- détail d'une ville avec navigation de sections persistante ;
- réglages en grille desktop ;
- dialogues centrés sur ordinateur et bottom-sheet seulement sur petit écran ;
- tableaux à en-têtes fixes et hauteur adaptée aux écrans desktop ;
- état de focus visible, navigation clavier et respect de `prefers-reduced-motion`.

Le responsive mobile reste supporté : le but n'est pas de supprimer l'usage téléphone, mais de ne plus laisser celui-ci dicter l'interface desktop.

### Passe Visual Refinement

Cette révision abandonne le langage visuel « terminal / instrumentation » de la passe précédente au profit d’un produit data moderne et plus sobre :

- fond neutre et surfaces hiérarchisées, sans quadrillage décoratif omniprésent ;
- barre supérieure claire/translucide en thème clair et équivalent sombre cohérent ;
- accent bleu/cyan utilisé avec parcimonie pour les actions, états et données importantes ;
- typographie d’interface moderne, avec chiffres tabulaires seulement là où ils facilitent la comparaison ;
- cartes et panneaux moins démonstratifs, avec bordures et ombres discrètes ;
- graphes et tableaux lisibles sans décor de « console » ;
- en-têtes de tableaux plus sobres, tout en conservant les heatmaps métier ;
- TodaySummaryCard étirée à la hauteur cumulée de « À retenir » + « Scénarios » sur grand écran ;
- variables de la TodaySummaryCard présentées en matrice 2×2 sur desktop.
- variables de la TodaySummaryCard enrichies par des icônes vectorielles température/pluie/vent, la plage inter-modèles et une jauge d’accord ;
- bande d’accord horaire complétée par une timeline colorée vert/ambre/rouge, fidèle au principe Android ;
- lignes de modèles de « Fiabilité locale » entièrement cliquables vers leur page de biais dédiée.

Cette passe restaure aussi la fidélité du **biais par modèle** : le biais est affiché dans l’en-tête de la colonne du modèle, avec son état de calibration, et un clic ouvre une page dédiée au modèle et à la variable comme dans l’application Android.

### Passe Action & Agreement Polish

Cette passe corrige plusieurs détails d’ergonomie et de fidélité relevés après usage :

- navigation globale simplifiée : « Mes villes » et « Paramètres » n’existent plus en double, et les actions « Actualiser / Ajouter » restent au niveau de la page concernée ;
- enveloppe min–max de la bande d’accord colorée directement en vert / ambre / rouge selon l’accord inter-modèles local, en complément de la timeline de confiance ;
- ouverture d’une page de biais systématiquement en haut, avec mémorisation de la position de la page précédente pour le retour ;
- en-têtes de modèles restructurés en trois zones distinctes (nom, métadonnées, biais/calibration) afin que la pill de calibration ne recouvre plus la résolution ou la famille du modèle ;
- pill de calibration elle-même cliquable vers la page de fiabilité locale ;
- cache PWA incrémenté en `v9-action-polish`.


### Passe Navigation Stability

Cette passe corrige les sauts de position provoqués par les rerenders et par la concurrence entre le routeur de l’application et la restauration de scroll native du navigateur :

- les changements de variable, de zoom, de mode journalier/horaire et de chronologie conservent désormais le contrôle cliqué à la même coordonnée dans le viewport ;
- les changements de route réels (ville, paramètres, page de biais) ouvrent la nouvelle page en haut, sans animation de scroll résiduelle ;
- les positions des entrées d’historique sont enregistrées avec `history.replaceState()` et restaurées avec Retour/Avancer ;
- `history.scrollRestoration` est passé à `manual` pour éviter une double restauration contradictoire ;
- le scroll programmatique est forcé en mode instantané, même si la navigation interne conserve les animations douces ;
- le scroll anchoring automatique est désactivé sur la racine de l’application, car MeteoCompare restaure explicitement le viewport ;
- `content-visibility:auto` a été retiré des sections de détail : leurs hauteurs ne sont plus estimées puis recalculées après un clic, ce qui supprimait une source majeure de sauts tardifs ;
- cache PWA incrémenté en `v10-navigation-stability`.

### Passe Bias Top Fix

Cette passe corrige spécifiquement le cas où une page de biais pouvait encore s’ouvrir en bas malgré le reset de scroll précédent :

- le contrôle source perd explicitement le focus avant le changement de route ;
- les nouvelles routes sont rendues immédiatement au lieu d’attendre la frame suivante ;
- le titre/landmark de la nouvelle page reçoit le focus avec `preventScroll` ;
- le haut de page est imposé sur `window`, `documentElement` et `body` ;
- le reset est répété sur les frames suivantes pour neutraliser une restauration tardive du navigateur ;
- un test reproduit désormais une restauration tardive à 2400 px après le rendu et vérifie que le viewport revient à 0.

Le cache PWA est incrémenté en `v11-bias-top-fix`.


### Passe History Refresh Policy

Cette passe réduit les appels coûteux liés à la reconstruction de l’historique de biais :

- suppression du bouton d’actualisation de l’historique dans la section « Fiabilité locale » de chaque ville ;
- suppression du bouton sur chaque page de biais modèle/variable ;
- suppression de l’action globale « tout actualiser » ;
- gestion centralisée dans **Paramètres → Fiabilité locale**, ville par ville ;
- affichage de la dernière mise à jour et du volume d’historique déjà stocké ;
- avertissement explicite avant lancement, car l’opération interroge plusieurs archives météo ;
- consultation des pages de biais sans requête réseau supplémentaire : elles utilisent uniquement les données locales existantes.

Le cache PWA est incrémenté en `v12-history-refresh-policy`.

### Passe Analysis Suite

Cette passe implémente les dix améliorations d’analyse et d’ergonomie prévues :

1. **tableaux desktop** avec en-têtes et première colonne figés ;
2. **comparaison ciblée de 2 à 4 modèles** avec graphe direct, sans modifier la sélection globale ;
3. **analyse du désaccord par variable** (température, pluie, vent, conditions) depuis « Pourquoi cet accord ? » et depuis les segments de la bande horaire ;
4. **fraîcheur par modèle** avec âge du run lorsque la réponse l’expose, sinon mention explicite « run exact non exposé », plus couverture temporelle ;
5. **URLs partageables** mémorisant variable, mode journalier/horaire, métrique d’accord, horizon, chronologie et modèles comparés ;
6. **exports CSV et JSON** contenant données comparées, accords et diagnostics de biais ;
7. **comparaison de 2 à 3 villes** sur température médiane, pluie, vent et accord global ;
8. **état en ligne/cache** plus visible avec âge exact et distinction cache récent / ancien / hors ligne ;
9. **historique de biais incrémental** : estimation des jours manquants et du nombre d’appels, puis récupération des seules plages absentes ;
10. **densité compacte** optionnelle et finition du workspace desktop avec barre de contexte sticky.

Le cache PWA est incrémenté en `v13-analysis-suite`.


### Passe Stability & i18n Audit

Cette passe stabilise la barre de contexte sticky, audite la cohérence des données et remplace le système multilingue fragmenté par un moteur unique :

- offsets sticky calculés depuis la hauteur réelle de la topbar et de la barre de contexte ; la navigation « Vue d’ensemble » reste toujours sous ces deux couches, même avec une traduction qui passe sur deux lignes ;
- horizons horaires alignés sur l’heure locale courante : tableaux, bande d’accord, comparaison ciblée et exports n’incluent plus silencieusement les heures déjà écoulées ;
- fuseau horaire confirmé par Open-Meteo resynchronisé dans le favori après actualisation ;
- évolution H−24/H−48/H−72 calculée par rapport au snapshot affiché, ce qui reste cohérent avec un cache ancien/hors ligne ;
- comparaison multi-ville basée sur l’intersection réelle des dates disponibles, sans dépendre arbitrairement de l’horizon du premier modèle ;
- classement « Fiabilité locale » aligné sur le même score de fiabilité que la page modèle, avec cohorte de dates comparables ;
- suppression d’une ville = purge de sa prévision, de ses normales ERA5, snapshots d’évolution et historique de biais ;
- jetons de génération par ville pour ignorer les réponses réseau devenues obsolètes après suppression, effacement ou changement de sélection de modèles ;
- protection équivalente des normales ERA5 contre les réponses tardives et nettoyage d’un Forecast supersédé sans toucher aux historiques indépendants ;
- directions cardinales localisées et unité du biais pluie réalignée sur l’application Android (`mm`) ;
- une prévision mise en cache mémorise désormais la cohorte de modèles demandée ; une ancienne cohorte n’est plus considérée fraîche après modification des modèles actifs ;
- catalogue web FR/EN/ES/DE/IT unifié avec les 519 clés du catalogue Android par langue ;
- toasts, confirmations, erreurs réseau, recherche, comparaison, exports, états de cache/run, titres/ARIA et métadonnées PWA passent tous par le même moteur de traduction ;
- formatage Android étendu à `%d`, `%s`, `%f`, arguments positionnels, précisions comme `%1$.1f` et échappement `%%` ;
- manifeste PWA localisé par langue et métadonnées HTML synchronisées à chaque changement de langue ;
- cache PWA incrémenté en `v14-stability-i18n-audit`.


### Passe Graph Redesign

Cette passe reprend les principaux graphes afin d’en faire de vrais outils d’analyse visuelle plutôt que de simples polylignes :

- **bande d’accord horaire** : zone de tracé structurée, axes X/Y gradués, unité visible, plage affichée, valeur courante, accord de fin d’horizon, marqueurs inspectables et enveloppe min–max toujours colorée selon la convergence ;
- **comparaison ciblée de modèles** : échelle Y calculée sur des pas lisibles, repères temporels verticaux, points inspectables, plages min/max et légende enrichie avec la dernière valeur de chaque modèle ;
- **comparaison de villes** : mêmes conventions visuelles, plus zones de fond vert/ambre/rouge pour le graphe d’accord global ;
- **historique de biais** : deux séries mieux distinguées, points prévision/observation, traits verticaux représentant l’erreur quotidienne et synthèse MAE / dernier écart ;
- grilles volontairement limitées **aux zones de tracé** : pas de retour au quadrillage décoratif de l’ancienne interface ;
- courbes non lissées afin de ne pas inventer de valeurs intermédiaires ou masquer un pic météo ;
- nouveaux libellés de graphes traduits en FR / EN / ES / DE / IT ;
- test `chart-redesign.mjs` ajouté au workflow GitHub Pages.

Le cache PWA est incrémenté en `v15-graph-redesign`.

## Fonctionnalités météo conservées

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

## Corrections de performance

Les correctifs de la passe précédente sont conservés et complétés :

- recherche de ville avec debounce 600 ms et annulation de la requête précédente ;
- aucune reconstruction globale pendant la frappe ;
- délégation d'événements unique ;
- cache des traductions et des formateurs `Intl` ;
- mémoïsation des agrégations, scénarios, bandes d'accord, évolution et biais ;
- index horaires/journaliers pré-calculés pour éviter des `indexOf()` répétés dans les grands tableaux ;
- scénarios de l'accueil calculés à la demande ;
- rafraîchissement global limité à deux appels météo simultanés ;
- un seul rendu au début/à la fin d'un rafraîchissement multi-ville, au lieu de rerendre toute l'application pour chaque ville ;
- `content-visibility` uniquement sur les zones où il ne perturbe pas la stabilité du scroll ;
- gros payloads météo déplacés de `localStorage` vers **IndexedDB** afin d'éviter les quotas faibles et le coût du stockage synchrone.

Les favoris, paramètres et petits index restent dans `localStorage`. Une ancienne prévision stockée par la version précédente est migrée automatiquement vers IndexedDB lors du chargement.

## Accessibilité et robustesse

- dialogues `role="dialog"` + `aria-modal` ;
- fermeture avec Échap ;
- piège de focus dans le dialogue ;
- restauration du focus vers le contrôle qui a ouvert le dialogue ;
- cartes de ville utilisables au clavier ;
- zones `aria-live` limitées aux statuts utiles au lieu de rendre toute l'application bavarde pour un lecteur d'écran ;
- `lang` du document synchronisé avec la langue choisie ;
- `prefers-reduced-motion` pris en compte ;
- navigation de sections sans conflit avec le routeur `#/…` ;
- Content Security Policy côté document limitant scripts, connexions et ressources aux origines nécessaires ;
- suppression robuste de `localStorage` **et** IndexedDB lors de « Effacer les données locales ».

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
