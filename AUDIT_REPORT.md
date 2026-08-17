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

- shell desktop jusqu'à 1580 px ;
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
