# Plausible Analytics — MeteoCompare Web

MeteoCompare envoie directement les événements à l’Events API de Plausible, sans charger le script analytics tiers.

## Production

La configuration active est dans `js/analytics-config.js` :

- site Plausible : `meteocompare.app` ;
- hôtes autorisés : `meteocompare.app`, `www.meteocompare.app` ;
- endpoint : `https://plausible.io/api/event`.

Les previews, localhost et autres forks ne sont pas comptés tant que leur hôte n’est pas explicitement ajouté.

## Pages

Les URL sont volontairement regroupées avant envoi :

- `/` → `/`
- `/meteo/<ville>` → `/city`
- route interne d’une ville → `/city`
- biais → `/bias`
- comparaison de villes → `/compare`
- données locales → `/data`
- paramètres → `/settings`
- à propos → `/about`
- route inconnue SEO → `/404`

Le slug, l’identifiant de ville et les paramètres de vue applicatifs ne sont jamais placés dans l’URL Plausible. Seuls `utm_source`, `utm_medium` et `utm_campaign`, lorsqu’ils existent sur l’URL d’entrée, sont conservés pour l’attribution de campagne.

## Propriétés de pageview

Propriétés générales :

- `page_group`
- `app_version`
- `language`
- `display_mode` : `browser` ou `standalone`
- `navigation` : `seo`, `spa` ou `direct`

Pour une page ville, seulement des choix d’interface à faible cardinalité :

- `detail_tab`
- `detail_mode`
- `agreement_metric`
- `horizon_hours`
- `timeline`
- `compared_models` (nombre, jamais les villes)

Pour le biais :

- `variable`
- `model`

Pour la comparaison de villes :

- `compared_cities` (nombre uniquement)

## Événements personnalisés

- `City Search Opened`
- `City Added`
- `SEO City Favorite Added`
- `Forecast Refreshed` (`scope=city|all`)
- `Forecast View Changed` (`control`, `value`)
- `Model Comparison Changed` (`model_count`)
- `City Comparison Started` (`city_count`)
- `Marine Activated`
- `Rain Radar Opened`
- `Rain Radar Range Changed` (`range`: `near`, `regional` ou `wide`)
- `Data Exported` (`format=json|csv`)
- `Share Link Copied`
- `Local Weighting Changed` (`enabled=true|false`)
- `PWA Install Click`
- `PWA Installed`

Chaque événement et chaque propriété est filtré par une liste blanche dans `js/analytics.js`. Ajouter arbitrairement une propriété à un appel dans `app.js` ne suffit donc pas à l’envoyer.

## Acquisition

Le referrer est explicitement envoyé à Plausible mais réduit à l’origine externe, par exemple :

`https://www.google.com/search?...` → `https://www.google.com/`

Les chemins, query strings et fragments du site référent sont supprimés. Les referrers internes ne sont pas envoyés.

## Données explicitement exclues

- nom, slug ou identifiant de ville ;
- latitude/longitude ;
- texte saisi dans la recherche de ville ;
- favoris ;
- valeurs météo et séries de prévision ;
- biais chiffrés et historiques locaux ;
- contenu des exports ;
- identifiant persistant créé par MeteoCompare.

Les événements utilisent toujours `credentials: omit` et `referrerPolicy: no-referrer`. Le referrer minimisé est ajouté uniquement dans le corps JSON.

## Tableau de bord Plausible recommandé

Après les premiers événements, ajouter les événements personnalisés comme objectifs et enregistrer les propriétés utiles dans **Site settings → Properties**. Les analyses particulièrement utiles sont :

1. trafic SEO : `/city` filtré par `navigation=seo` ;
2. conversion SEO : `/city` → `SEO City Favorite Added` ;
3. ajout de ville : `City Search Opened` → `City Added` ;
4. comparaison : `/city` → `City Comparison Started` → `/compare` ;
5. installation PWA : `PWA Install Click` → `PWA Installed` ;
6. adoption fonctionnelle : `Marine Activated`, `Rain Radar Opened`, `Rain Radar Range Changed`, `Data Exported`, `Model Comparison Changed` ;
7. acquisition : Sources + Campaigns grâce au referrer minimisé et aux UTM.

## Confidentialité

GPC et DNT désactivent automatiquement l’envoi. L’utilisateur peut aussi désactiver la mesure dans **Données locales → Confidentialité**. Voir `PRIVACY.md` pour la politique complète et les réserves liées au cadre CNIL.
