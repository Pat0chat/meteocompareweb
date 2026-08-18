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

## Fidélité du biais Android

Le comportement de l’interface de biais suit désormais la structure Android :

- le `ModelBiasChip` est transposé en badge cliquable dans l’en-tête du modèle des tableaux température, précipitations et vent ;
- avant 14 journées exploitables, l’en-tête indique la progression de calibration au lieu d’exposer un biais prématuré ;
- une fois prêt, le badge ouvre une route dédiée `#/city/<ville>/bias/<modèle>/<variable>` ;
- la page web remplace le `ModelBiasDetailSheet` Android tout en conservant ses informations : indice de fiabilité local, MAE/RMSE, biais moyen, dispersion, jours proches, tendance récente, historique prévision/observation, référence multi-modèles et diagnostics pluie ;
- le classement local est calculé sur une cohorte de modèles partageant suffisamment de dates comparables ;
- le biais sert à qualifier la fiabilité locale et n’est pas appliqué silencieusement aux valeurs de prévision affichées.

## Navigation et position de page

Le port web utilise toujours des routes hash `#/…` pour rester compatible avec un hébergement statique GitHub Pages, mais la navigation interne est pilotée par History API. Les vraies routes ouvrent en haut, Retour/Avancer restaurent leur position propre, et les changements d’état internes (variable, zoom, onglet) préservent le contrôle cliqué dans le viewport. Cette séparation évite les sauts de scroll provoqués auparavant par les rerenders complets et la restauration native du navigateur.



## Politique web de reconstruction du biais

Contrairement à une lecture de prévision ordinaire, la reconstruction manuelle de l’historique J+1 peut effectuer de nombreux appels d’archives. Dans la version web, cette opération est volontairement centralisée dans les Paramètres et déclenchée ville par ville. Les écrans de fiabilité et les pages de biais n’effectuent pas cette reconstruction lors de leur consultation.


## Stability & i18n Audit

- Offsets sticky calculés dynamiquement à partir des hauteurs réelles ; plus de recouvrement entre barre de contexte et navigation locale.
- Heure courante locale utilisée de façon cohérente par tableaux, bandes d’accord, comparaisons et exports.
- Fuseau Forecast API resynchronisé vers le favori.
- Cohorte de modèles demandée mémorisée dans le cache et vérifiée avant de déclarer une prévision fraîche.
- Réponses asynchrones invalidées par jetons lors de suppression/effacement/changement de modèles.
- Suppression d’une ville = purge complète des caches et historiques associés.
- Moteur i18n unifié FR/EN/ES/DE/IT, avec catalogue Android complet + clés web + formats positionnels/float/percent.
- Métadonnées PWA localisées.
