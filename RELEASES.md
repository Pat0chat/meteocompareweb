# Releases and rollback

`main` is the deployment branch. Stable releases are tags named `vMAJOR.MINOR.PATCH` and must match the single application version declared in `app-version.js`.

## 1.16.32

- Clean global non fonctionnel : suppression de code mort dans le shell, le domaine, le consensus, le stockage, le radar et les modules de comparaison.
- Suppression de l'ancienne heatmap accueil inutilisée et de sa clé i18n/CSS associée, ainsi que de l'ancien vote catégoriel plat devenu obsolète depuis le consensus météo hiérarchique.
- Extraction des primitives SVG/graphiques communes dans `js/ui/chart-utils.js` afin d'éliminer les implémentations dupliquées entre `app.js` et `features/comparison.js`.
- Nettoyage des helpers diagnostics/formatage non appelés, alias radar inutilisé, politique réseau déclarative non consommée et helper de sauvegarde mort.
- Commentaires CSS historiques remplacés par des intitulés fonctionnels ; tests de régression renforcés pour empêcher le retour de ces symboles morts et des duplications de primitives graphiques.
- Cache PWA incrémenté vers `v125-global-code-clean` et nouveau module partagé ajouté au shell hors ligne.

## 1.16.31

- Uniformisation des contrôles afficher/masquer autour du chevron introduit pour les listes de villes : pastille ronde, fond bleu doux, tracé CSS cohérent et rotation animée.
- Les cartes repliables de la page détail, la comparaison ciblée et les sections avancées utilisent désormais exactement le même langage visuel.
- Les petits `<details>` natifs (méthode, cache PWA, confidentialité) abandonnent aussi le marqueur navigateur au profit du chevron MeteoCompare.
- Le chevron est dessiné en CSS plutôt qu'avec un glyphe Unicode afin d'éviter les différences de rendu entre Firefox, Chromium et les polices système.
- Cache PWA incrémenté vers `v124-unified-chevrons`.

## 1.16.30

- Accueil : la liste SEO des villes de référence est repliée par défaut derrière un contrôle natif afficher/masquer, avec compteur de villes.
- Détail : la liste des prévisions à proximité est elle aussi repliée par défaut afin de préserver la hiérarchie de lecture de la prévision.
- L’état ouvert/replié des deux listes est mémorisé dans les préférences locales et partagé entre les visites, sans masquer les cartes météo favorites qui restent le contenu principal de l’accueil.
- Les contenus pré-rendus SEO utilisent le même mécanisme pour éviter un flash initial avec toutes les villes visibles.
- Cache PWA incrémenté vers `v123-city-list-disclosure`.

## 1.16.29

- Firefox: horizontal data strips no longer force `scrollbar-width: thin`; they use the platform's normal interactive thickness while retaining the MeteoCompare thumb colour.
- Horizontal scrollers receive a small bottom gutter and rounded lower corners so the native Firefox scrollbar sits inside the visual component instead of cutting across its radius.
- Chromium/Safari horizontal scrollbars use a 10 px gutter with an inset 6 px coloured thumb for a more tactile, rounded treatment.
- PWA shell cache bumped to `v122-firefox-horizontal-scrollbars`.

## Publish a release

1. Update `app-version.js` for the application version. If runtime shell assets changed, also increment the generation in `cache-version.js` so existing PWA installations fetch the new shell. Runtime modules and the service worker consume these centralized values.
2. Merge the tested changes into `main`.
3. Create and push an annotated tag, for example `git tag -a v1.9.0 -m "MeteoCompare 1.9.0" && git push origin v1.9.0`.
4. `.github/workflows/release.yml` reruns every regression test, creates a versioned ZIP and SHA-256 file, calls GitHub's generated-release-notes API to produce `CHANGELOG-vX.Y.Z.md`, uploads the build as a workflow artifact, and publishes a GitHub Release using that generated changelog.

## Roll back production

Run **Actions → Roll back GitHub Pages → Run workflow**, enter a known stable tag such as `v1.9.0`, and the workflow checks out that exact tag, reruns its tests and redeploys its static files. No history rewriting is required.

GitHub Releases are tag-based deployable iterations and generated release notes can include merged pull requests, contributors and a changelog link. Workflow artifacts remain useful for CI output but the GitHub Release is the durable versioned distribution point.

## Durcir les releases

Pour un dépôt public de production, activer les **immutable releases** dans GitHub empêche la modification du tag et des assets après publication. C'est recommandé une fois le workflow validé.

Après un rollback, éviter de pousser immédiatement une nouvelle version non corrigée sur `main`, car le workflow Pages continu redéploierait alors `main`. Le correctif normal est : rollback du tag stable → correction sur branche → tests → nouvelle release patch.

## 1.16.28
- Scrollbars : suppression du garde `@supports selector(::-webkit-scrollbar)` qui pouvait réinitialiser Firefox en scrollbar native épaisse ; Firefox conserve désormais `scrollbar-width: thin` avec un curseur bleu MeteoCompare.
- Scrollbars Chromium/Safari : branche Blink/WebKit séparée par détection de propriétés, largeur/hauteur explicites à 6 px, piste transparente et thumb bleu du thème.
- Conditions agrégées : priorité au consensus multi-familles des codes WMO natifs ; les fallbacks heuristiques d'un modèle incomplet ne peuvent plus renverser ce consensus.
- Conditions sans couverture WMO native suffisante : dérivation unique depuis les variables centrales déjà agrégées (pluie, température, nébulosité), avec provenance explicite dans l'infobulle.
- Le marqueur « condition inférée du même modèle » reste réservé aux cellules détaillées d'un modèle individuel et n'est plus utilisé pour les conditions de consensus de l'accueil/résumé/chronologie.
- Tests de régression ajoutés pour les scrollbars multi-moteurs et la provenance/calcul des conditions.
- Cache PWA incrémenté afin de forcer le renouvellement CSS/JS.

## 1.16.27
- Scrollbars réellement multi-moteur : propriétés standard pour Firefox et pseudo-éléments WebKit gardés par `@supports` pour Chromium/Safari.
- Largeur Chromium/Safari fixée à 8 px, palette MeteoCompare claire/sombre et état de survol.
- Correction des erreurs CSS Firefox : valeurs `r` SVG avec unité et suppression des déclarations `text-wrap` incompatibles.
- Cache PWA incrémenté pour forcer la mise à jour de la feuille de style.
