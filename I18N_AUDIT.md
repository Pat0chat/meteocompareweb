# Audit multilingue — MeteoCompare Web v1.8.0

## Couverture

Langues prises en charge : **français, anglais, espagnol, allemand et italien**.

Le moteur web utilise une seule façade de traduction pour :

- les **519 clés héritées de l’application Android** dans chacune des cinq langues ;
- toutes les chaînes spécifiques au port web ;
- les textes générés dynamiquement (toasts, confirmations, erreurs, recherche, statut cache/run, comparaison, export, diagnostics) ;
- les titres/ARIA, le titre du document, la description et le manifeste PWA.
- les directions cardinales affichées dans les tableaux de vent et les erreurs réseau structurées.

## Formatage

Le formateur comprend les jetons Android `%d`, `%s`, `%f`, les positions (`%1$d`, `%2$s`), les précisions (`%1$.1f`) et `%%`. Les nombres/dates utilisent le locale actif.

## Changement de langue

Le changement de langue rerend l’interface et synchronise `document.documentElement.lang`, le titre, la meta description et le lien vers le manifeste localisé. Les tests cliquent réellement sur EN/ES/DE/IT et contrôlent plusieurs sections majeures.

## Données qui ne sont pas des traductions d’interface

Les noms propres renvoyés par les fournisseurs (nom d’une ville, région administrative, certains libellés géographiques) sont conservés tels qu’ils ont été fournis/enregistrés. Ils ne sont pas considérés comme des clés d’interface et peuvent donc rester dans la langue de la réponse de géocodage d’origine.

## Garde-fous

`tests/stability-i18n-audit.mjs` vérifie :

- aucune clé spécifique web manquante dans une des cinq langues ;
- aucune des 519 clés Android manquante ;
- résolution des formats positionnels/flottants/pourcentages ;
- résolution des clés utilisées par les branches dynamiques ;
- absence de plusieurs anciens textes français codés en dur ;
- existence des cinq manifestes PWA localisés.
