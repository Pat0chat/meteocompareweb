# Audit complet — MeteoCompare Web v1.8.0

Date de la passe : 17 août 2026

## Portée

L'audit a porté sur l'interface desktop/mobile, le rendu DOM, les interactions, la recherche, les rafraîchissements météo, le stockage navigateur, le cache PWA, le routage, l'accessibilité, la compatibilité GitHub Pages et les tests de non-régression du domaine météo déjà portés depuis Android.

## 1. Interface et ergonomie — corrigé

### Constats

- largeur et densité trop proches d'une interface mobile ;
- actions principales représentées par des boutons ronds/FAB peu adaptés au desktop ;
- cartes de villes trop verticales ;
- détail d'une ville organisé en longue colonne sans navigation locale ;
- réglages et dialogues utilisant des conventions de téléphone sur grand écran.

### Corrections

- shell desktop jusqu'à 1560 px ;
- vraie navigation horizontale et actions textuelles ;
- dashboard de synthèse ;
- grille de villes 3/2/1 colonnes responsive ;
- hiérarchie typographique, espacements, rayons et ombres revus ;
- sous-navigation persistante dans la vue ville ;
- réglages en grille ;
- dialogues centrés sur desktop, bottom-sheet seulement sur mobile ;
- tableaux mieux dimensionnés pour un grand écran.

## 2. Performance — corrigé

### Problèmes identifiés

- rerender global à chaque frappe dans la recherche ;
- reconstruction répétée d'un gros dictionnaire i18n ;
- création répétée de formateurs `Intl` ;
- recalculs d'agrégations/scénarios/bandes à chaque rendu ;
- nombreux listeners recréés ;
- recherches linéaires `indexOf()` répétées dans les cellules ;
- multiples rerenders successifs pendant « Tout actualiser » et pendant les rafraîchissements automatiques ;
- gros objets météo stockés dans `localStorage`, synchrone et à quota limité.

### Corrections

- debounce 600 ms + AbortController ;
- mise à jour locale du modal de recherche ;
- caches i18n / `Intl` / domaine ;
- délégation d'événements ;
- index Map par série ;
- calcul des scénarios uniquement à l'ouverture ;
- deux téléchargements météo maximum en parallèle lors d'un refresh global ;
- rendu groupé au début/à la fin des refreshs multi-villes ;
- données météo volumineuses dans IndexedDB avec migration du format précédent ;
- `content-visibility` pour les sections hors écran.

## 3. Stockage et intégrité locale — corrigé

- migration des prévisions de `localStorage` vers IndexedDB ;
- fallback `localStorage` si IndexedDB est indisponible ;
- écritures `localStorage` protégées contre les erreurs de quota ;
- suppression d'une ville nettoie aussi son cache IndexedDB ;
- « Effacer les données locales » ferme la base puis attend sa suppression avant rechargement ;
- la prévision est persistée avant de considérer le rafraîchissement comme terminé.

## 4. PWA et cache — corrigé

- les endpoints Open-Meteo ne sont pas interceptés par le service worker ;
- navigation et code (`script`, `style`, manifeste, worker) en network-first ;
- fallback vers le shell en cas d'absence de réseau ;
- purge des anciennes versions de cache à l'activation ;
- version de cache incrémentée après cette passe ;
- chemins du shell relatifs pour un hébergement sous-répertoire.

Cette stratégie évite qu'une réponse météo ancienne soit prise pour un nouveau run par le cache PWA.

## 5. Routage — corrigé

La première version de la navigation de sections utilisait des ancres `#section`. Cela entrait en conflit avec le routeur principal basé sur `#/…`. Les liens de section ont été remplacés par des contrôles `data-scroll-section` qui appellent `scrollIntoView()` sans modifier la route.

## 6. Accessibilité — corrigé

- suppression de `aria-live` sur le shell complet ;
- annonces réservées aux toasts et statuts de recherche ;
- dialogues correctement identifiés ;
- Échap ferme un dialogue ;
- focus piégé dans le dialogue ;
- focus restauré vers le déclencheur après fermeture et rerender ;
- cartes de ville activables avec Entrée/Espace ;
- styles `:focus-visible` ;
- mouvement réduit respecté ;
- attribut `lang` mis à jour selon la langue choisie.

## 7. Sécurité côté client — renforcé

- contenus provenant des recherches et données textuelles échappés avant injection HTML ;
- liens externes ouverts avec `rel="noopener"` ;
- Content Security Policy limitant les scripts au site et `connect-src` aux endpoints Open-Meteo nécessaires ;
- aucun secret ni token embarqué dans le frontend.

## 8. GitHub Pages — prêt

- aucun chemin absolu racine pour les assets ;
- `start_url`, `scope` et `id` du manifeste relatifs ;
- service worker enregistré via `./sw.js` ;
- `.nojekyll` inclus ;
- workflow `.github/workflows/pages.yml` inclus ;
- workflow exécute les cinq suites de tests avant publication ;
- build `_site` exclut le dépôt, les tests et les fichiers de workflow de l'artefact public ;
- permissions Pages/OIDC et environnement `github-pages` configurés.

## 9. Domaine météo — non-régression

Les tests existants continuent de couvrir les points sensibles du port Android : alignement temporel, fallback AROME HD, champs solaires, accord pluie, garde ERA5 et rejet des journées de biais incomplètes (dont une journée de 18 h).

## 10. Fidélité fonctionnelle et densité desktop — restauré

Une passe supplémentaire a comparé la vue web à l’implémentation Android fournie afin de corriger les simplifications introduites par la première refonte desktop.

### Corrections

- TodaySummaryCard enrichie et accord global de nouveau visible au premier niveau ;
- action « Pourquoi cet accord ? » déplacée de la bande horaire vers la TodaySummaryCard ;
- bande horaire conservée comme analyse temporelle de dispersion, sans dupliquer l’explication globale ;
- chronologie restaurée avec modes 24 h / 7 jours, repères réguliers, conditions, bande thermique min/max, indicateur de probabilité de pluie, nébulosité, vent/rafales, consensus et causes de divergence ;
- heatmaps restaurées dans les tableaux température, précipitations et vent avec les seuils/palettes du projet Android ;
- légendes ajoutées aux heatmaps, aux conditions météo et au graphique d’accord ;
- mise en page desktop densifiée : rail de navigation, composition en colonnes, panneaux plus structurés, hiérarchie visuelle renforcée et largeur utile augmentée ;
- cache du service worker incrémenté afin que cette refonte ne reste pas masquée par une ancienne version PWA.

### Non-régression dédiée

`tests/fidelity-regression.mjs` vérifie explicitement la présence de l’accord global, le placement de « Pourquoi cet accord ? », les deux modes de chronologie, les bandes thermiques, l’indicateur pluie, les légendes et les cellules heatmap. Ce test est également exécuté avant chaque déploiement GitHub Pages.

## Validation effectuée

- `node --check` sur les modules et tests JavaScript ;
- validation JSON du manifeste ;
- `tests/smoke.mjs` : OK ;
- `tests/ui-performance.mjs` : OK ;
- `tests/static-audit.mjs` : OK ;
- `tests/pages-compat.mjs` : OK ;
- `tests/fidelity-regression.mjs` : OK ;
- vérification des chemins statiques et de la structure du workflow Pages.

## Limites qui ne sont pas des bugs du port

- une page web statique ne peut pas reproduire WorkManager lorsque le navigateur est complètement fermé ;
- les caches IndexedDB/localStorage sont propres au navigateur/profil/appareil ;
- sans réseau, aucune nouvelle donnée Open-Meteo ne peut être téléchargée ;
- GitHub Pages héberge le frontend statique : il n'ajoute pas de backend ni de stockage serveur partagé.

## 11. Modern UI, heatmaps et fidélité du biais — corrigé

Une nouvelle passe remplace l’identité « console / instrumentation » devenue trop lourde et restaure plusieurs comportements de l’application Android qui avaient été altérés pendant les refontes précédentes.

### Identité visuelle

- suppression du quadrillage décoratif global et des grilles de fond dans les graphes ;
- abandon du chrome sombre systématique, des compteurs pseudo-techniques et du monospace omniprésent ;
- palette neutre avec accent bleu/cyan, surfaces plus sobres et hiérarchie typographique de produit data moderne ;
- topbar et panneaux allégés sans perdre la densité d’information ;
- TodaySummaryCard toujours étirée à la hauteur cumulée de « À retenir » + « Scénarios », avec matrice 2×2 des variables sur grand écran.

### Compteurs de modèles

- les nombres isolés liés aux cohortes affichent désormais explicitement « modèles » ;
- correction d’une erreur i18n où la clé `models` utilisait « scénarios/scenarios » en français et anglais ;
- traductions corrigées en FR / EN / ES / DE / IT.

### Heatmaps des tableaux

La disparition des heatmaps une ligne sur deux venait du zébrage CSS des lignes paires, déclaré après la règle heatmap et donc prioritaire sur son arrière-plan. Le rendu a été corrigé afin que la variable `--heat` reste visible sur **toutes** les lignes, paires comme impaires, y compris pour la ligne courante.

### Biais par modèle

Le comportement a été réaligné sur `ModelBiasChip` et `ModelBiasDetailSheet` de l’application Android :

- badge de biais dans l’en-tête du modèle pour température, précipitations et vent ;
- suppression du biais répété dans chaque cellule ;
- état `Calibration N/14 j` tant que le minimum d’historique n’est pas atteint ;
- badge cliquable une fois prêt ;
- route dédiée par ville / modèle / variable, compatible avec le bouton Retour du navigateur ;
- page de détail avec score local 0–100, niveau de fiabilité, MAE/RMSE, biais signé, dispersion, jours proches, tendance récente, historique prévision/observation, distribution des erreurs, comparaison multi-modèles et diagnostics pluie ;
- classement local calculé uniquement sur une cohorte réellement comparable partageant au moins 14 dates ;
- score de fiabilité transposé depuis les pondérations et échelles utilisées côté Android.

### PWA et non-régression

- cache PWA incrémenté en `v8-visual-refinement` ;
- `tests/static-audit.mjs` vérifie l’absence du décor technique précédent, la conservation des heatmaps sur les lignes alternées et la structure de la route biais ;
- `tests/fidelity-regression.mjs` construit un historique synthétique suffisant, vérifie le badge dans l’en-tête, ouvre la page de biais et contrôle ses métriques principales ainsi que le rang exprimé en modèles.

## Validation effectuée

- `node --check` sur les modules, service worker et tests JavaScript ;
- validation JSON du manifeste ;
- `tests/smoke.mjs` : OK ;
- `tests/ui-performance.mjs` : OK ;
- `tests/static-audit.mjs` : OK ;
- `tests/pages-compat.mjs` : OK ;
- `tests/fidelity-regression.mjs` : OK ;
- vérification des chemins statiques et de la structure du workflow Pages.



## Passe Visual Refinement v8

Corrections ajoutées après retour visuel :

- TodaySummaryCard densifiée avec icônes vectorielles pour température, précipitations et vent ;
- plages inter-modèles et jauges d’accord intégrées dans chaque tuile de synthèse ;
- bande d’accord horaire complétée par une timeline de confiance colorée (vert ≥ 80 %, ambre 50–79 %, rouge < 50 %) avec nombre de modèles au début et à la fin de l’horizon ;
- identité visuelle assagie : rayons, ombres et contrastes plus sobres, hero et navigation moins démonstratifs, hiérarchie plus proche d’un produit data/SaaS moderne ;
- chaque ligne de modèle dans « Fiabilité locale » devient un contrôle de navigation vers la page de biais du modèle et de la variable ;
- cache PWA incrémenté en `v8-visual-refinement` ;
- tests de fidélité renforcés pour couvrir les icônes de synthèse, la timeline colorée et la navigation depuis la fiabilité locale.

## 12. Action hierarchy, accord coloré et navigation modèle — corrigé

### Actions globales

- suppression des doublons `Actualiser / Ajouter` dans la topbar de la page d’accueil ;
- suppression du second bouton `Paramètres` sur les pages ville ;
- la topbar conserve uniquement la navigation globale `Mes villes / Paramètres`, tandis que les actions restent contextuelles à chaque page.

### Bande d’accord horaire

- l’enveloppe min–max inter-modèles est découpée par intervalle temporel ;
- chaque intervalle est coloré selon le pourcentage d’accord : vert ≥ 80 %, ambre 50–79 %, rouge < 50 % ;
- les limites min/max restent tracées afin de préserver la lecture de l’amplitude de dispersion ;
- la légende indique désormais explicitement que la couleur de la plage min–max représente le niveau d’accord.

### Navigation vers la fiabilité locale

- l’ouverture d’une route de biais force le viewport en haut de la page ;
- la position de défilement de la route précédente est mémorisée avant navigation afin de pouvoir retrouver son contexte au retour.

### En-têtes des tableaux

- séparation structurelle du nom du modèle, de sa résolution/famille et du badge de biais/calibration ;
- espace vertical réservé au badge pour supprimer tout chevauchement ;
- l’état `Calibration N/14 j` devient lui aussi cliquable et ouvre la page de fiabilité locale du modèle.

### Non-régression

- tests statiques ajoutés pour détecter la réapparition de boutons globaux dupliqués ;
- tests dédiés à la coloration de l’enveloppe min–max ;
- contrôle de la structure d’en-tête modèle et du badge de calibration cliquable ;
- contrôle de l’ouverture d’une page biais en haut ;
- cache PWA incrémenté en `v9-action-polish`.

