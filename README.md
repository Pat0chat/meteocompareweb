# MeteoCompare Web

## Démarrage local

Le site utilise des modules JavaScript ES. Il doit être servi via HTTP(S), et non ouvert directement en `file://`.

Pour travailler sur le shell source sans pré-rendu :

```bash
cd meteocompare-web
python3 -m http.server 8080
```

Pour tester la sortie de production SEO avec les URL propres `/meteo/{ville}` :

```bash
npm run build
npm run preview
npm run tests
npm run audit:release
```

Le serveur de prévisualisation écoute par défaut sur `http://127.0.0.1:4173` et reproduit la résolution des fichiers HTML sans extension (`/meteo/toulouse` → `dist/meteo/toulouse.html`). Un serveur statique basique comme `python3 -m http.server` ne réalise pas cette résolution et peut donc répondre 404 sur ces URL propres, même si le build est correct.

Le build, la prévisualisation et les tests n’installent aucune dépendance tierce : ils utilisent uniquement Node.js (`tools/build-site.mjs`, `tools/preview-site.mjs` et `tools/run-tests.mjs`). `npm run tests` découvre récursivement les fichiers `tests/<fonctionnalité>/<portée>/*.test.mjs`, les exécute dans un ordre stable et retourne un code d'erreur si au moins une suite échoue. Les suites peuvent aussi être filtrées par fonctionnalité, portée ou nom de fichier via `tools/run-tests.mjs`. Avant une release, `npm run audit:release` vérifie en plus la syntaxe de toutes les sources JavaScript, les liens de documentation et les artefacts interdits, exécute toute la suite, construit `dist/` puis contrôle son contenu public. En local, `npm run preview` sert exactement le HTML de production ; le bootstrap analytics détecte que l’hôte n’est pas `meteocompare.app` et n’envoie donc aucun événement réseau. En production Worker, le navigateur n’embarque plus le script Plausible : il envoie uniquement les événements autorisés vers le chemin first-party opaque `/_mcx/e`, et seul le Worker contacte `plausible.io` côté serveur.

## Déployer sur Cloudflare Workers — configuration recommandée

MeteoCompare génère désormais une sortie `dist/` spécialement adaptée à `meteocompare.app` : page d’accueil pré-rendue, pages `/meteo/{ville}`, sitemap, robots et redirections canoniques.

Configuration Cloudflare Workers Builds :

- **Production branch** : `main`
- **Build command** : `npm run build`
- **Deploy command** : `npx wrangler deploy`
- **Root directory** : vide si le dépôt est déjà à la racine
- **Build watch paths** : laisser vide, sauf besoin spécifique

Le fichier `wrangler.jsonc` déploie `worker.js` avec le binding statique `ASSETS` vers `./dist`. Ce Worker sert aussi de proxy first-party Plausible sur `/_mcx/*`. Un ancien déploiement Pages purement statique peut encore servir l’application, mais ne fournit pas ce proxy analytics ; il n’est donc plus recommandé pour `meteocompare.app`.

### Référencement intégré

Le build génère un catalogue contrôlé de pages indexables pour les grandes villes françaises :

```text
/meteo/paris
/meteo/lyon
/meteo/toulouse
...
```

Chaque page contient dès la réponse HTML un `title`, une description, un H1, un canonical, du contenu stable propre à la ville et des liens internes vers des villes proches. JavaScript hydrate ensuite la page avec les prévisions actualisées. Les anciennes routes `#/city/...` restent acceptées pour les liens existants.

`dist/sitemap.xml` et `dist/robots.txt` sont générés automatiquement. La procédure Google Search Console est détaillée dans `SEO.md`.

### GitHub Pages

Les workflows GitHub restent utiles comme solution secondaire et exécutent également le build avant publication. Le domaine de production et les URLs canoniques SEO restent volontairement `https://meteocompare.app`.

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
- comparaison multi-modèles et sélection fine des modèles disponibles ;
- résumé journalier, conditions actuelles, lever/coucher du soleil ;
- heatmap 12 h et scénarios multi-modèles ;
- chronologie riche avec modes 24 h / 7 jours, repères réguliers, bande thermique, signal pluie, nébulosité, vent/rafales, accord et variables en désaccord ;
- accord global dans une card dédiée, avec « Pourquoi cet accord ? » et accès direct à la comparaison des moteurs ;
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

La suite est organisée par **fonctionnalité**, **portée** et **fichier ciblé**. Elle n’est plus structurée par numéro de version :

```text
tests/<fonctionnalité>/<portée>/<fichier>.<comportement>.test.mjs
```

Exécution courante :

```bash
npm run tests
npm run test:unit
npm run test:integration
npm run test:regression
npm run test:static
npm run test:performance
node tools/run-tests.mjs --feature radar
node tools/run-tests.mjs --scope integration --feature analytics
```

Les conventions détaillées et des exemples de chemins sont documentés dans [`tests/README.md`](tests/README.md).

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
- accord global et action « Pourquoi cet accord ? » dans une card dédiée ; le bouton « Comparer les moteurs » est placé juste après la convergence et avant les scénarios ;
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
- `js/analytics-config.js` : configuration de la mesure d’audience Plausible et restriction aux domaines de production ;
- `js/analytics-schema.js` : contrat partagé des routes, événements et propriétés Plausible autorisés côté navigateur/Worker ;
- `js/analytics.js` : pageviews expurgées, acquisition UTM/referrer minimisée et événements fonctionnels Plausible ;
- `js/app.js` : composition des vues, routeur et interactions, branchés sur le kernel ;
- `js/seo-cities.mjs` : catalogue contrôlé des villes indexables et helpers des URLs publiques ;
- `tools/build-site.mjs` : génération du dossier `dist/`, pré-rendu HTML, sitemap, robots et redirections ;
- `tools/preview-site.mjs` : serveur local de prévisualisation qui résout les URL propres comme Cloudflare ;
- `SEO.md` : activation Search Console et contrôle d’indexation ;
- `ARCHITECTURE.md` : responsabilités, points d’extension et règles de séparation ;
- `manifest.webmanifest`, `manifest.{fr,en,es,de,it}.webmanifest`, `sw.js` : PWA et métadonnées localisées ;
- `.github/workflows/pages.yml` : publication GitHub Pages après génération de `dist/` ;
- `.nojekyll` : compatibilité de publication statique ;
- `tests/` : suites structurées par fonctionnalité puis portée (`unit`, `integration`, `regression`, `static`, `smoke`), avec des noms de fichiers centrés sur la source/comportement testé ; voir `tests/README.md`.

## Confidentialité et mesure d’audience

Aucun secret ni clé API n'est embarqué. Les requêtes météo sont envoyées directement depuis le navigateur vers Open-Meteo. Les villes, réglages, caches, biais et snapshots MeteoCompare restent dans le stockage local du navigateur.

La version web utilise une **mesure d’audience respectueuse** avec Plausible associé à `meteocompare.app`, via un transport first-party minimal propre à MeteoCompare plutôt que le tracker navigateur Plausible. Les pageviews automatiques et les mesures automatiques optionnelles sont désactivés : MeteoCompare déclenche lui-même uniquement les événements autorisés. Les routes SEO sont regroupées avant envoi (`/meteo/toulouse` → `/city`), les paramètres applicatifs et identifiants de ville sont supprimés, et seuls `utm_source`, `utm_medium` et `utm_campaign` sont conservés pour l’attribution des campagnes. Le referrer est réduit à son origine (domaine uniquement) avant transmission. Des propriétés à faible cardinalité décrivent la version de l’application, la langue, le mode navigateur/PWA et certains choix d’affichage ; des événements fonctionnels mesurent recherche/ajout de ville, comparaisons, marine, export, partage, rafraîchissement et installation PWA.

Aucun cookie analytics ni identifiant persistant n’est créé par MeteoCompare. Aucun nom/identifiant de ville, coordonnée, requête de recherche, favori, valeur météo, prévision brute ou historique local n’est envoyé. GPC, DNT et l’opt-out local restent respectés. L’envoi est limité aux domaines de production configurés afin que localhost et les previews ne polluent pas les statistiques. Voir `ANALYTICS.md` pour la liste des événements/propriétés et la configuration recommandée du tableau de bord Plausible.

La politique complète est dans `PRIVACY.md`.
### Configuration Cloudflare détaillée

Voir [`CLOUDFLARE.md`](CLOUDFLARE.md) pour les valeurs exactes à saisir dans **Settings > Build**, aussi bien pour Workers Builds que pour l'ancien flux Pages.

### Radar pluie

La page **Détails** propose une vue radar optionnelle centrée sur la localité. Elle anime les observations RainViewer des deux dernières heures, sur fond OpenStreetMap, avec trois portées de visualisation. Le nowcast exploite les **7 dernières frames consécutives** : le navigateur détecte et suit les zones de pluie séparément, conserve leur identité entre recalculs et changements de portée, puis estime leur advection à partir du recouvrement spatial réellement observé d'une frame à la suivante, complété par le déplacement du centroïde. En mode Projection, l'utilisateur choisit une échéance unique **+15, +30, +45 ou +60 min** ; la carte affiche alors le contour projeté, l'enveloppe probable et la trajectoire depuis les positions observées. La projection combine aussi l'évolution de largeur/hauteur et la tendance de surface afin de représenter prudemment croissance, déformation ou dissipation. Chaque cellule reçoit un score de pertinence pour la localité et l'incertitude augmente avec l'horizon. Cette projection courte durée est calculée localement et reste distincte de la synthèse multi-modèles affichée en dessous.

Le module est chargé à la demande (`js/features/radar.js`) et ne contacte RainViewer/OpenStreetMap qu'après ouverture explicite de la modale. Le radar reste donc hors du chemin critique de chargement de l'application. Si l'analyse pixel des images n'est pas disponible, la projection se désactive proprement sans empêcher l'animation radar observée.

### Génération du cache PWA

La génération du cache du shell PWA est centralisée dans **`cache-version.js`**. `sw.js` importe cette valeur et tous les tests vérifient désormais cette référence au lieu de recopier une version de cache. Pour forcer une nouvelle génération de cache lors d'une évolution du shell, un seul fichier est à modifier : `cache-version.js`.

### Version applicative

La version produit est centralisée de la même manière dans **`app-version.js`**. `js/version.js`, `sw.js`, les tests, le build SEO et les workflows GitHub lisent cette source unique. Une montée de version ne nécessite donc plus de modifier des assertions de tests ou plusieurs constantes : **seul `app-version.js` porte la version courante**. Le build génère encore un fichier `dist/VERSION` pour les artefacts de déploiement, mais il est dérivé automatiquement de cette source.

## Forecast Engines

The city Details view can now use one of four forecast engines: **Multi-consensus**, **Calibration**, **Scenarios** or **Adaptive**. The engine is selected in Settings and is applied consistently to central temperature, precipitation, wind, gust and cloud forecasts. Calibration is learned separately by available lead time (D+1 to D+7), rain occurrence agreement is distinct from event probability, and ambiguous 50/50 scenarios fall back to the robust consensus. A dedicated **Compare engines** modal uses one full-width seven-day graph with a variable selector (temperature min/max, precipitation, wind, gusts and cloud cover), while highlighting the active engine. Raw model convergence remains independent from the chosen post-processing engine. See `FORECAST_ENGINES.md` for formulas, fallbacks and interpretation rules.

- La Home utilise le même moteur que les pages Détails pour les conditions actuelles, agrégats journaliers et mini-timelines.
- La page À propos documente les quatre moteurs et l’étape de sélection dans la construction de la prévision.
- Le bloc redondant « À retenir » a été retiré de Détails pour réduire le bruit visuel.

## Vigilance Météo-France

La Home et la page détails peuvent afficher la Vigilance officielle Météo-France (jaune/orange/rouge) sans l'intégrer au consensus météo. L'accès API passe exclusivement par le Worker Cloudflare et nécessite le secret `METEOFRANCE_API_KEY`. La procédure de souscription, de stockage du secret et de preview local est détaillée dans `VIGILANCE_METEOFRANCE.md`.
