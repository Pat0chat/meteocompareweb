# Audit MeteoCompare Web 1.16.0

## Périmètre

Audit effectué sur le moteur de prévision/consensus, la chaîne Forecast API → normalisation → domaine → affichage, le stockage local, la PWA, le routage/SEO, Plausible/Cloudflare, les traductions et les sources HTML/CSS/JavaScript.

## 1. Moteur de prévision

### Corrections appliquées

- **Convergence découplée du moteur choisi.** Certains calculs horaires/timeline utilisaient encore `convergencePercent` produit par Calibration ou Scénarios. Ils utilisent désormais exclusivement le consensus brut des modèles comparables. Le moteur ne modifie plus artificiellement l'indicateur d'accord.
- **Calibration moins agressive.** Le biais mesuré n'est plus corrigé à 100% dès 14 échantillons. La correction est réduite avec un historique court et atteint sa pleine force à 30 observations.
- **Couverture par familles indépendantes.** Deux variantes d'une même lignée numérique ne suffisent plus à débloquer la calibration. Il faut au moins deux familles indépendantes et une couverture familiale suffisante.
- **Pluie cohérente avec les mêmes garde-fous.** L'ajustement de fréquence des jours humides est pondéré par familles et n'est activé que si la couverture est suffisante.
- **Fallback Scénarios explicite.** Une distribution unimodale retourne désormais clairement vers Multi-consensus avec la raison `SINGLE_SCENARIO`.
- **Nettoyage interne.** Suppression d'état intermédiaire inutilisé et clarification des fonctions de quantiles, dispersion et calibration.

### Invariants vérifiés

- invariance à l'ordre des modèles ;
- absence de mutation des données d'entrée ;
- bornage des probabilités de pluie ;
- calibration progressive avec la taille d'échantillon ;
- impossibilité pour des modèles frères de simuler plusieurs familles indépendantes ;
- invariance des indicateurs de convergence au changement de moteur.

### Limites restantes — documentées, pas masquées

- les intervalles actuels sont des intervalles descriptifs de dispersion, pas des intervalles probabilistes calibrés ;
- Calibration s'appuie sur un historique local limité et ne constitue pas un EMOS entraîné ;
- Scénarios effectue un clustering scalaire à deux groupes pour une variable, pas un clustering synoptique multivarié ;
- l'application ne possède pas encore de benchmark out-of-sample complet des quatre moteurs par horizon ;
- température minimale, rafales, nébulosité et valeurs horaires n'ont pas encore de vérité terrain dédiée pour une calibration locale valide.

## 2. Application complète

### Architecture JavaScript

- 34 modules JavaScript runtime contrôlés ;
- tous sont atteignables depuis les points d'entrée de l'application/analytics ;
- graphe d'import runtime acyclique ;
- aucun module orphelin détecté ;
- aucune référence runtime `TODO`, `FIXME`, `HACK`, `debugger`, `console.log` ou `console.debug` ;
- version produit centralisée dans `app-version.js` et génération de cache centralisée dans `cache-version.js`.

`js/app.js` reste volontairement le principal orchestrateur UI. Le découper artificiellement pendant un audit de stabilité apporterait davantage de risque que de gain. Les domaines complexes (consensus, forecast engines, radar, marine, stockage, comparaison, santé modèles, analytics, normalisation) sont déjà séparés en modules dédiés.

### HTML / sécurité / analytics

- le bootstrap Plausible a été extrait du JavaScript inline de `index.html` vers `js/plausible-bootstrap.js` ;
- la CSP scripts revient à une politique same-origin sans hash inline à synchroniser ;
- le proxy first-party `/_mcx/*` et les protections GPC/DNT/opt-out sont conservés ;
- aucune URI `file://` n'est générée dans les sources navigateur ;
- IDs statiques HTML uniques ;
- le script analytics n'effectue aucun chargement réseau hors hôtes de production autorisés.

### PWA / cache

- tous les modules runtime font partie du shell PWA ;
- les réponses Open-Meteo restent exclues du cache du service worker ;
- navigation et code restent network-first ;
- la nouvelle génération de cache est définie uniquement dans `cache-version.js`.

### Traductions

Les cinq catalogues avaient accumulé de nombreuses couches `Object.assign(catalog, ...)` correspondant aux releases successives. Ils sont désormais aplatis :

- 1 catalogue final par langue ;
- 1 632 clés par langue ;
- mêmes ensembles de clés FR / EN / ES / DE / IT ;
- aucune chaîne d'override historique au chargement.

### CSS

- suppression des règles strictement dupliquées détectées dans un même contexte de cascade ;
- conservation des overrides responsive ou sémantiques qui modifient réellement le rendu ;
- retrait des commentaires de versions historiques au profit de noms de sections fonctionnels ;
- nettoyage des espaces/traces laissés par les anciennes couches ;
- aucune règle CSS exactement dupliquée dans le même contexte après nettoyage.

Le fichier reste volumineux car MeteoCompare possède de nombreuses vues et plusieurs systèmes graphiques. L'audit privilégie la stabilité de cascade : les overrides non identiques ne sont pas fusionnés automatiquement sans validation visuelle navigateur.

### Radar

Le libellé « projection probabiliste » était trop fort au regard du mécanisme utilisé. Il devient « projection estimée » dans les cinq langues : la couche future reste une extrapolation de mouvement à court terme avec incertitude, pas une probabilité météorologique calibrée.

## 3. Points à surveiller après 1.16.0

1. Construire une validation **hors échantillon** des moteurs avant d'afficher un classement de performance.
2. Accumuler des vérités terrain adaptées aux variables actuellement non calibrables.
3. Introduire CRPS/Brier/reliability diagrams uniquement lorsqu'une distribution/probabilité calibrée correspondante existe.
4. Si `app.js` continue de croître, extraire les renderers de pages par domaine lors d'une release dédiée, avec tests DOM/snapshots avant et après.
5. Continuer à réduire les overrides CSS au fil des écrans, mais seulement avec comparaison visuelle automatisée ou navigateur de référence.

## 4. Validation de release

- `npm run tests` : **88/88 fichiers de tests passent** ;
- `npm run build` : **accueil + 80 pages villes** générés ;
- vérification syntaxique Node de tous les fichiers `.js` / `.mjs` runtime, outils et tests : OK ;
- `dist/VERSION` : généré automatiquement depuis la version centrale ;
- JavaScript inline dans le HTML de production : **0** ;
- chargement navigateur direct depuis `plausible.io` : **0** ;
- règles CSS strictement dupliquées au niveau top-level : **0** ;
- marqueurs de dette/debug runtime (`TODO`, `FIXME`, `HACK`, `debugger`, `console.log`, `console.debug`) : **0**.
