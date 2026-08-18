# Refonte des graphes — v15

Cette version modernise quatre familles de visualisations : bande d’accord horaire, comparaison ciblée de modèles, comparaison de villes et historique du biais.

## Principes

- axes et unités visibles ;
- grille légère uniquement à l’intérieur du graphe ;
- échelles arrondies et cohérentes ;
- points inspectables avec infobulle native SVG ;
- légendes enrichies par les valeurs utiles ;
- couleurs utilisées pour coder une information réelle (accord, série, sens de l’erreur) ;
- aucune interpolation/lissage artificiel des séries météo.

## Bande d’accord

La moyenne reste la ligne principale. L’enveloppe min–max conserve la coloration vert / ambre / rouge selon l’accord local, avec une limite haute et basse discrète. Le bandeau supérieur indique la valeur courante, la plage affichée et l’accord à la fin de l’horizon.

## Comparaisons

Les graphes modèles/villes utilisent maintenant les mêmes conventions graphiques. La légende indique également la dernière valeur de chaque série. Le graphe d’accord des villes ajoute les zones de référence 0–50 / 50–80 / 80–100 %.

## Biais

Chaque journée affiche la prévision et l’observation, reliées par un segment représentant l’erreur. La couleur du segment distingue surestimation et sous-estimation. Le MAE et le dernier écart sont visibles avant le tracé.

## Tests

`tests/chart-redesign.mjs` est exécuté par GitHub Actions en plus des sept suites existantes.
