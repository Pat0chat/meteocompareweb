# Notes de portage Android → Web

## Éléments volontairement supprimés

Tout le code Glance / AppWidget / previews de widgets / configuration de widgets est absent de cette version web. Le site n’en a pas besoin.

## Invariants métier conservés

- cohorte multi-modèles distincte de la provenance des valeurs brutes ;
- distinction entre accord inter-modèles et probabilité de justesse ;
- plages min/max non masquées ;
- agrégation pluie journalière par cumul, vent par maximum ;
- fallback nébulosité AROME HD si la couverture totale manque ;
- fuseau de la ville utilisé pour les dates civiles et le jour courant ;
- Previous Runs `_previous_day1` pour le biais J+1 ;
- jours de biais acceptés uniquement quand la timeline de la journée contient 23, 24 ou 25 heures et que la variable est complète ;
- au moins 14 paires prévision/référence avant qualification d’un biais ;
- écart-type échantillonnal (Bessel) pour le biais ;
- ERA5 sur les 10 années civiles précédentes avec seuil de complétude de 95 % ;
- cache des normales valable 180 jours ;
- snapshots d’évolution espacés d’au moins 3 h, rétention 5 jours ;
- comparaisons d’évolution sur cohorte commune d’au moins 2 modèles.

## Stockage et isolation

Les clés du port web sont préfixées `meteocompare.web.` pour ne pas entrer en collision avec d’autres données locales. Chaque ville possède ses propres prévisions, normales, biais et snapshots d’évolution.

## Réseau

Le service worker ne met pas en cache les réponses Open-Meteo. La couche applicative contrôle elle-même la fraîcheur et la persistance des données météo. Cela évite qu’un cache HTTP du service worker réinjecte silencieusement une réponse d’un ancien run.

## Réactivité de l’interface

Le port web n’effectue plus de rerender global pendant la saisie de recherche. Le géocodage est debouncé de 600 ms et la requête précédente est annulée lorsque la saisie change. Les objets i18n/Intl et les principaux calculs dérivés d’une prévision sont mis en cache. Les actualisations automatiques des villes sont sérialisées pour éviter plusieurs gros traitements réseau/JSON simultanés sur le thread principal.
