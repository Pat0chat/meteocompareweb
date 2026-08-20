# Changelog

## 1.10.17 — Detail interactions + home polish

- TodaySummary reste toujours visible : suppression du pliage de la card de synthèse.
- Prévisions détaillées : suppression du pliage externe de la card afin de laisser le sélecteur « Comparer 2 à 4 modèles » comme unique accordéon interne.
- Santé des modèles : suppression du pliage générique redondant ; le bouton Ouvrir/Fermer le diagnostic devient l’unique contrôle de détail.
- Home : hero retravaillé comme zone de pilotage (description, recherche et actions Ajouter / Comparer / Actualiser), sans raccourcis de villes redondants.
- Home : mini-chronologie en heatmap absolue commune à toutes les villes, avec échelle moderne froid → chaud et conservation de l’heure, température, pluie et mm.
- Home : min/max restent regroupés avec pluie et vent ; la frise explique désormais explicitement les points modèles et la prévision centrale MeteoCompare.
- Home : cards légèrement compactées et Signaux utiles promus en colonne latérale sticky sur desktop.
- Cache PWA technique mis à jour vers `v50-home-layout` sans changement de version produit.
- Aucun changement du moteur météo, du Consensus v2 ou du schéma de données.

## 1.10.16 — Modern home

- Refonte complète de la page d’accueil autour de la météo et de la convergence utile.
- Hero compact avec recherche directe et raccourcis vers les villes favorites.
- Nouvelles cards de ville : météo dominante, min/max, pluie, vent, signal modèles et fraîcheur.
- Mini-chronologie à 5 échéances dans chaque ville.
- Nouvelle Consensus Strip : dispersion brute des modèles et position de la synthèse centrale.
- Nouvelle section « À surveiller aujourd’hui » : divergence, pluie probable, vent marqué ou variation thermique.
- Le cas mono-famille conserve toutes les valeurs météo et affiche explicitement une convergence non calculable.
- Grille desktop 2 colonnes et composition mobile dédiée.
- Cache PWA : `v47-home-redesign`.

## 1.10.15 — Version visibility & comparison persistence
- Affiche discrètement la version Web dans la marque de la topbar, avec le schéma de données dans l’infobulle et dans À propos.
- Conserve l’état ouvert de la comparaison ciblée de modèles pendant les sélections/désélections.
- Le nombre de modèles sélectionnés ne pilote plus à lui seul l’ouverture du panneau de comparaison.
- Cache PWA : `v46-version-compare`.

## [1.10.14] - 2026-08-20

### Aesthetic system & navigation
- Keep the existing **My cities** click behavior while adding a hover/focus quick-navigation popover for favorite cities on pointer devices.
- Introduce formal spacing, radius and elevation token scales and apply them to the main interactive/surface components.
- Unify success/warning/danger/info colors behind one semantic palette while keeping temperature/rain/wind data colors independent.
- Activate the existing `collapsedSections` setting: primary cards can now be folded/unfolded with persistent state across city detail, Settings, Local data and About.
- Sidebar navigation automatically expands a folded city section before scrolling to it.
- Add regression coverage for the aesthetic system and keep all weather/Consensus v2 calculations unchanged.
- `APP_VERSION` is `1.10.14`; PWA shell cache is `v45-aesthetic-system`.


## [1.10.13] - 2026-08-20

### Reliability & navigation polish
- Preserve central weather values when only one independent model family is available; convergence remains intentionally unavailable instead of suppressing the data.
- Keep hourly temperature, wind and precipitation bands renderable with one family, using `null` convergence rather than dropping points.
- Preserve rain probability/details in daily confidence metadata without fabricating a multi-family agreement score.
- Render unavailable convergence as neutral/unknown rather than accidentally treating it as 0%/low.
- Replace the in-flow topbar back icon with a visible floating back control attached to the topbar edge, so navigation no longer shifts the brand or main actions.
- Add dedicated regression coverage for one-family fallbacks and back-navigation layout.
- `APP_VERSION` is `1.10.13`; PWA shell cache is `v44-one-family-nav`.

## [1.10.12] - 2026-08-19

### Release clean
- Removed unused runtime imports/exports and stale helpers with no consumers.
- Removed the remaining JS/CSS machinery for the already-merged `city-context-bar` and simplified sticky offsets to the measured topbar only.
- Rebuilt Settings controls around intrinsic content flow: no forced card height, no paragraph spacer tracks and no `margin-top:auto` action placement.
- Rebuilt Settings control layout so controls on the same row share the full grid width while actions stay close to their labels.
- Removed contradictory/duplicate CSS rules accumulated by previous UI passes and added `.gitignore` entries for generated output.
- Converted legacy version-frozen regression checks into feature guards and added a dedicated release-clean audit.
- Final same-version marine polish: removed duplicated chart captions/range/extremum information, enriched wave and tide axes with denser metric/time/date ticks, and clarified the upcoming-tides block.
- Settings controls now use equal fractional columns and fully occupy each grid row.
- No weather-data pipeline or Consensus v2 calculation changed.
- `APP_VERSION` remains `1.10.12`; final PWA shell cache is `v43-marine-polish`.

## [1.10.11] - 2026-08-19

### Changed
- Harmonized visible copy across the complete web UI in French, English, Spanish, German and Italian.
- Standardized terminology around model convergence and local historical reliability.
- Shortened help, diagnostics, privacy, API, PWA, marine and reliability copy without removing material information.
- Removed redundant internal section eyebrows and localized the remaining hard-coded API limit label.
- Added shared typography/alignment rules so cards, controls, actions and tables keep stable text axes across languages.
- Follow-up typography audit on the same `1.10.11` version: compact UI text now uses a canonical scale with a 0.70rem readability floor; chart labels are normalized to 10/10.5px.
- Removed legacy micro-sizes down to 0.52rem and consolidated more than 70 historical font-size values into a short role-based scale without changing weather logic.
- No weather-data pipeline or Consensus v2 calculation changed.
- `APP_VERSION` is now `1.10.11`; PWA shell cache is `v41-copy-polish`.

## [1.10.10] - 2026-08-19

### Clarity
- Regroupe Paramètres en quatre blocs logiques et raccourcit les explications dans les cinq langues.
- Simplifie Données locales : trois KPI principaux, trois groupes de données et une zone avancée repliable pour les diagnostics techniques.
- Réduit la section confidentialité visible tout en conservant les informations analytics/CNIL sous un détail repliable.
- Recompose À propos autour de la méthode, de la convergence, de la fiabilité historique, des valeurs brutes, des sources/limites et de l’installation.
- Ajoute un test de régression dédié à la clarté et à la complétude i18n.
- Aucun changement du moteur météo Consensus v2.
- `APP_VERSION` passe à `1.10.10` et le cache PWA à `v40-clarity-pages`.

## [1.10.9] - 2026-08-19

### Consensus v2
- Remplace les moyennes de synthèse par une médiane pondérée robuste pour température, vent et rafales.
- Introduit un équilibrage par lignée/famille de modèles afin que plusieurs variantes corrélées ne multiplient pas leur influence.
- Sépare les précipitations en probabilité d’occurrence et quantité conditionnelle si pluie.
- Applique la pondération locale bornée à la prévision centrale lorsque la calibration est suffisante.
- Sépare la convergence instantanée des modèles de la confiance historique locale.
- Uniformise ce moteur sur l’accueil, les résumés, timelines, bandes horaires, comparaisons et scénarios.
- Corrige la rupture des courbes de comparaison sur les journées partielles/manquantes.
- Ajoute `js/consensus.js` au shell PWA et passe le cache à `v39-consensus-v2`.

## [1.10.8] - 2026-08-18

### Fixed
- “Delete all local data” now also removes MeteoCompare CacheStorage entries and unregisters the service worker for the current app scope.
- The first reload after a full clear skips PWA registration so the storage screen can accurately show a clean state.
- Local storage diagnostics count only MeteoCompare-namespaced CacheStorage entries instead of every cache on the browser origin.
- Service-worker activation only removes obsolete MeteoCompare caches and no longer risks deleting unrelated caches that share the same origin.

## [1.10.7] - 2026-08-18

### Changed
- Graphe des marées en pleine largeur, avec hauteur utile accrue et rail de synthèse déplacé sous le tracé.
- En-têtes des tableaux détaillés normalisés sur des rangées fixes pour aligner noms de modèles, description/résolution, horizon/couverture, avertissement et biais.
- `APP_VERSION` passe à `1.10.7` et le cache PWA à `v37-tides-table-alignment`.

## [1.10.6] - 2026-08-18

### Added
- Bouton Google Play dans la top bar, juste avant Soutien, vers l’application Android officielle MeteoCompare.

### Changed
- `APP_VERSION` passe à `1.10.6` et le cache PWA à `v36-play-store-nav`.
- Aucun changement des chaînes météo auditées en 1.10.5.

# Changelog

## [1.10.5] - 2026-08-18

### Fixed
- Conversion systématique des timestamps locaux Open-Meteo en instants absolus pour les calculs météo et Marine, y compris les heures dupliquées/supprimées lors des bascules DST.
- Les journées terminales `PARTIAL` restent visibles comme données brutes mais sont exclues de toutes les comparaisons, évolutions et composantes d’accord nécessitant une journée civile comparable.
- L’accord pluie exige désormais au moins deux modèles, comme les autres métriques ; un modèle isolé ne peut plus produire artificiellement 90–100 % d’accord.
- La référence de fiabilité locale est explicitement ERA5, avec une fenêtre commune de 30 jours terminant 6 jours avant aujourd’hui et invalidation des anciennes références non identifiées.
- Le moniteur de santé propage l’absence réelle d’un modèle actif comme état dégradé même si ses métadonnées sont fraîches, et son historique audité est versionné.
- Les graphiques de comparaison coupent les lignes sur les données manquantes au lieu de relier artificiellement les trous.
- Correction de la métadonnée `ICON_D2.nativeStepMinutes` à 60 min pour le produit horaire `icon_d2`.
- Optimisation des conversions de fuseau : les instants normalisés sont mis en cache au niveau des séries, évitant une régression de performance détectée pendant l’audit.

### Changed
- Ajout d’une suite adversariale `release-data-audit-1105.mjs` couvrant multi-fuseaux, DST automne/printemps, horizons courts, ERA5, santé modèles, comparaisons et marées.
- Cache PWA : `v35-release-audit`.
- Rapport complet : `RELEASE_AUDIT_1.10.5.md`.

## [1.10.4] - 2026-08-18

### Changed
- Refonte complète de la section **Mer / côte** autour de deux surfaces cohérentes au lieu d’une succession de panneaux indépendants.
- Conservation des 5 indicateurs marins instantanés sur une seule ligne desktop, avec une hiérarchie visuelle plus proche du reste de MeteoCompare.
- Fusion de l’évolution des vagues et de l’aperçu 7 jours dans un même bloc, avec remplacement du tableau quotidien par une bande compacte de journées.
- Recomposition des marées : graphique principal à gauche, niveau courant / tendance / prochain extremum / marnage et prochaines marées dans un rail synthétique à droite.
- Notes MSL, avertissement nautique et source déplacés hors du flux principal afin d’alléger la lecture.
- Cache PWA : `v34-marine-dashboard`.

All notable changes to MeteoCompare Web are documented here. Releases follow Semantic Versioning.

## [1.10.3] - 2026-08-18

### Fixed
- Settings no longer uses `content-visibility: auto`, preventing estimated off-screen section heights from turning into real heights on click/focus and moving the viewport.
- Native scroll anchoring is disabled inside the Settings grid so it cannot fight MeteoCompare's explicit viewport preservation.
- Theme, density, refresh interval and local weighting controls now re-pin the clicked control after layout-affecting updates.
- Model toggles, model sorting and language changes retain the existing selector-based scroll stabilization without the previous CSS virtualization conflict.

## [1.10.2] - 2026-08-18

### Fixed
- Marine/coast summary now contains exactly five KPI cards on one desktop row; sea level remains in the richer tide summary instead of being duplicated.
- Hourly agreement SVG now uses its intrinsic aspect ratio instead of a fixed 330 px height, so the plot itself consumes the full available width without visual side gutters.

### Changed
- Removed redundant section eyebrows when they repeated the exact same title in Marine, Backup and Privacy sections.
- Marine KPI wrapping now starts only on narrower layouts, with two columns below 760 px and one column below 560 px.

## [1.10.1] - 2026-08-18

### Fixed
- Marine wave chart now has an explicit visible stroke even when no city-card accent variable is in scope.
- Hourly agreement chart consumes the full available desktop width while retaining horizontal scrolling on small screens.

### Changed
- Removed the inactive “Scenarios · 12 h” disclosure from home city cards.
- Tide view now includes a 72-hour filled curve, axes, time grid, mean level, high/low markers, trend and next-extremum summary.
- About page now explains the multi-model method, agreement semantics, local-first storage, marine limits, installation and release information in one coherent flow.

## [1.10.0] - 2026-08-18

### Added
- Approximate tide/high-low-water view in optional Marine mode using forecast sea-level height.
- 17-model health monitor with completed-run metadata, expected cadence, coverage, missing variables, fallback state and local 24h/7d incident history.
- Optional locally weighted consensus in TodaySummary, derived from bounded local J+1 reliability weights while keeping raw consensus and original forecasts unchanged.
- Health history storage, backup support and local-data accounting.

### Changed
- Marine request now includes sea-level height while remaining below ten hourly variables.
- Model metadata failures are separated from actual model incidents in the local health history.

## [1.9.0] - 2026-08-18

### Added
- Versioned release workflow with tagged ZIP and SHA-256 assets.
- Manual GitHub Pages rollback workflow able to redeploy a stable tag.
- Complete local backup/restore with selectable historical/cache data.
- Optional Marine/Coast mode backed by Open-Meteo Marine API.
- Client-side API request coordination, deduplication, usage counters and runaway guards.

### Changed
- Application version and service-worker cache version are now independent.

### 1.10.11 — final interaction/layout polish (version inchangée)
- Uniformisation stricte des hauteurs `timeline-metric`.
- Stabilisation du scroll de la page Données locales pendant les recalculs et diagnostics.
- Alignement des actions dans les `setting-control`.
- Sélection des modèles présentée en grille compacte avec switch proche du modèle.
- Harmonisation des `about-mini-badge` et des marges/paddings des `about-callout`.
