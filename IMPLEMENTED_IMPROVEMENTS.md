# MeteoCompare Web — 10 améliorations implémentées

## 1. Tableaux desktop
- en-têtes figés pendant le scroll vertical ;
- première colonne figée pendant le scroll horizontal ;
- ombre de séparation discrète ;
- compatible heatmaps et ligne courante.

## 2. Comparaison ciblée de modèles
- sélection temporaire de 2 à 4 modèles dans la comparaison détaillée ;
- graphe direct pour température, précipitations ou vent ;
- ne modifie pas la sélection globale de modèles ;
- sélection mémorisée dans l’URL partageable.

## 3. Analyse du désaccord
- « Pourquoi cet accord ? » décompose les prochaines 24 h ;
- température, pluie, vent et conditions sont séparés ;
- chaque échéance indique les causes détectées ;
- un segment de la bande d’accord peut être cliqué pour ouvrir l’analyse sur l’échéance la plus proche.

## 4. Fraîcheur des runs
- conservation de l’heure du run lorsqu’une métadonnée exploitable est fournie ;
- détection d’un modèle sensiblement plus ancien que les autres ;
- couverture temporelle par modèle conservée ;
- si Open-Meteo n’expose pas le run exact, l’interface affiche explicitement « run exact non exposé ».

## 5. URLs partageables
La route ville encode :
- variable du tableau ;
- mode journalier/horaire ;
- métrique de la bande d’accord ;
- horizon 24 h / 72 h / 7 j ;
- mode de chronologie ;
- modèles de la comparaison ciblée.

Le bouton « Partager la vue » copie l’URL correspondante.

## 6. Export CSV / JSON
- export local sans backend ;
- données brutes des modèles ;
- accords température/pluie/vent ;
- biais température/pluie/vent ;
- JSON avec prévision complète, métadonnées et état de vue.

## 7. Comparaison de villes
- sélection de 2 à 3 villes ;
- route partageable dédiée ;
- température médiane multi-modèles ;
- précipitations médianes ;
- vent médian ;
- accord global ;
- chronologie commune sur 7 jours.

## 8. État hors ligne / cache
- barre de contexte sticky dans la page ville ;
- distinction données en ligne / cache récent / cache ancien / hors ligne ;
- âge exact du cache ;
- état résumé également dans la barre supérieure et les cartes de villes.

## 9. Historique de biais intelligent
Avant une mise à jour, MeteoCompare calcule :
- les jours manquants sur 30 jours ;
- les modèles concernés ;
- les plages contiguës à récupérer ;
- le nombre approximatif d’appels d’archive.

La mise à jour ne demande que les plages absentes. Si l’historique est complet, le bouton est désactivé.

## 10. Finition visuelle et mode compact
- barre de contexte ville plus compacte ;
- actions de partage/export mieux intégrées ;
- mode Confortable / Compact dans Paramètres ;
- espacements et densité réduits en mode compact sans masquer d’information.

## Tests
La passe ajoute `tests/analysis-suite.mjs`. Le workflow GitHub Pages exécute maintenant six suites avant publication.
