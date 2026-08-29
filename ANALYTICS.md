# Plausible Analytics — MeteoCompare Web

MeteoCompare utilise le tracker officiel Plausible associé à `meteocompare.app`, derrière le Worker first-party MeteoCompare. L'intégration est volontairement **manuelle et à faible cardinalité** : pageviews automatiques, outbound links automatiques, téléchargements automatiques et formulaires automatiques sont désactivés. Seuls les pageviews et événements définis dans le schéma partagé `js/analytics-schema.js` peuvent être envoyés.

## Architecture

Flux navigateur :

```text
MeteoCompare Web
  ├─ GET  /_mcx/p.js  → Worker → script Plausible
  └─ POST /_mcx/e     → Worker → https://plausible.io/api/event
```

Configuration : `js/analytics-config.js`.

- domaine Plausible : `meteocompare.app` ;
- hôtes navigateur autorisés : `meteocompare.app`, `www.meteocompare.app` ;
- script navigateur : `/_mcx/p.js` ;
- endpoint événement navigateur : `/_mcx/e` ;
- localhost, preview et forks : aucune mesure tant que leur hôte n'est pas autorisé.

Le navigateur ne contacte pas directement `plausible.io`. Le Worker valide à nouveau le payload avant de le relayer. Cette double validation protège à la fois contre une régression du client et contre l'envoi direct d'événements arbitraires sur `/_mcx/e`.

Le proxy événement transmet explicitement le `User-Agent` du navigateur et l'adresse client fournie par Cloudflare comme `X-Forwarded-For`. Ces métadonnées sont nécessaires au traitement Plausible côté serveur ; le Worker ignore un `X-Forwarded-For` fourni arbitrairement par le client lorsqu'un `CF-Connecting-IP` fiable est disponible.

## Cycle de vie du tracker

Le script Plausible n'est chargé que si :

- l'hôte est autorisé ;
- aucun signal GPC/DNT n'est actif ;
- l'utilisateur n'a pas désactivé la mesure dans **Données locales → Confidentialité**.

Le contrôleur `__METEOCOMPARE_ANALYTICS_CONTROL__` permet désormais de :

- charger le tracker après réactivation de la mesure sans recharger toute l'application ;
- retenter un chargement de script en erreur ;
- mémoriser le résultat du dernier envoi pour le centre de monitoring de la topbar.

## Pageviews

Les routes sont regroupées avant envoi :

- `/` ;
- `/city` pour toutes les villes, y compris `/meteo/<ville>` ;
- `/bias` ;
- `/compare` ;
- `/data` ;
- `/settings` ;
- `/about` ;
- `/pwa` ;
- `/404` ;
- `/other` comme garde-fou.

Le slug/ID d'une ville et les paramètres privés de la route ne sont jamais inclus dans l'URL Plausible. Seuls `utm_source`, `utm_medium` et `utm_campaign` sont conservés lorsqu'ils existent.

### Propriétés communes des pageviews

- `page_group` ;
- `app_version` ;
- `language` ;
- `display_mode` : `browser|standalone` ;
- `navigation` : `seo|spa|direct` ;
- `effective_theme` : `light|dark` ;
- `density` : `comfortable|compact`.

Page ville :

- `detail_tab` ;
- `detail_mode` ;
- `agreement_metric` ;
- `horizon_hours` ;
- `timeline` ;
- `compared_models` : nombre uniquement.

La pageview d'une ville est construite depuis l'état UI effectif de l'application, même lorsque les valeurs par défaut ne figurent pas explicitement dans l'URL partagée.

Page biais : `variable`, `model`.

Comparaison de villes : `compared_cities`, nombre uniquement.

## Événements personnalisés

Tous les événements personnalisés reçoivent automatiquement les propriétés communes suivantes : `app_version`, `language`, `display_mode`, `navigation`.

### Villes et navigation météo

- `City Search Opened`
- `City Added` (`source=search`)
- `SEO City Favorite Added`
- `City Removed`
- `Forecast Refreshed` (`scope=city|all`)
- `Forecast View Changed` (`control`, `value`)
- `City Comparison Started` (`city_count`)

### Modèles, consensus et diagnostic

- `Model Comparison Changed` (`model_count`)
- `Model Selection Changed` (`model_count`, `family_count`)
- `Forecast Engine Changed` (`engine`)
- `Forecast Engine Comparison Opened`
- `Confidence Explanation Opened`
- `Diagnostics Opened`
- `Model Health Refreshed`
- `Vigilance Refreshed`
- `Local Weighting Changed` (`enabled`)

### Marine et radar

- `Marine Activated`
- `Rain Radar Opened`
- `Rain Radar Range Changed` (`range`)
- `Rain Radar Mode Changed` (`mode`)
- `Rain Radar Horizon Changed` (`horizon`)
- `Rain Radar Fullscreen Changed` (`fullscreen`)
- `Rain Radar Projection Recalculated` (`success`)

Les quatre derniers événements radar étaient auparavant appelés par l'interface mais absents de l'ancienne liste blanche ; ils sont maintenant effectivement acceptés et relayés.

### Données locales et partage

- `Data Exported` (`format=json|csv`) — envoyé uniquement après préparation réussie du téléchargement ;
- `Local Backup Exported`
- `Local Backup Imported`
- `Share Link Copied` (`method=clipboard`)
- `Share Link Fallback Opened` (`reason`)

### Installation, monitoring et support

- `Install Option Selected` (`source=play_store|pwa`)
- `PWA Install Click`
- `PWA Install Prompt Result` (`outcome=accepted|dismissed`)
- `PWA Installed` — événement non interactif car déclenché par le navigateur ;
- `System Monitor Opened`
- `System Monitor Refreshed`
- `Support Opened`
- `External Link Opened` avec uniquement une destination enumérée : `bluesky`, `meteofrance_vigilance`, `liberapay`, `kofi`.

## Validation et protection du endpoint `/_mcx/e`

La liste blanche est définie une seule fois dans `js/analytics-schema.js` et utilisée par le client **et** par `worker.js`.

Le Worker refuse notamment :

- un nom d'événement inconnu ;
- un domaine Plausible différent de `meteocompare.app` ;
- une URL hors route agrégée autorisée ;
- une propriété non déclarée ;
- un payload trop volumineux ;
- un contenu JSON invalide.

Le Worker supprime aussi toute donnée de revenu ou champ arbitraire non utilisé par MeteoCompare. Le header `x-meteocompare-analytics-reject` permet de diagnostiquer localement la raison d'un rejet sans exposer de donnée privée.

Le header upstream `x-plausible-dropped`, lorsqu'il existe, est conservé dans la réponse du proxy pour faciliter le diagnostic réseau.

## Acquisition

Le referrer externe est réduit à son **origine** :

```text
https://www.google.com/search?q=meteo+paris → https://www.google.com/
```

Les referrers internes sont supprimés. Les chemins, requêtes et fragments du site référent ne sont pas relayés par MeteoCompare.

## Données explicitement exclues

- nom, slug ou ID de ville ;
- latitude/longitude ;
- texte de recherche ;
- liste des favoris ;
- valeurs météo, codes météo et séries de prévision ;
- couleur/niveau de Vigilance ;
- valeurs d'accord, scénarios et biais chiffrés ;
- contenu ou nom de fichier d'un export ;
- identifiant persistant créé par MeteoCompare.

MeteoCompare n'active volontairement **aucun suivi automatique de scroll, visibilité de section, temps passé ou impression de composant**. Cela limite le bruit, la cardinalité et le volume d'événements.

## Monitoring

La ligne Plausible du centre de monitoring distingue :

- non configuré ;
- hôte non suivi ;
- GPC/DNT ;
- opt-out local ;
- chargement du script ;
- erreur de chargement du script ;
- erreur du dernier envoi ;
- script chargé et âge du dernier envoi accepté.

Le monitoring ne génère pas de ping Plausible artificiel.

## Tableau de bord Plausible recommandé

Les analyses les plus utiles sont :

1. **Acquisition SEO** : `/city` + `navigation=seo`, puis `SEO City Favorite Added` ;
2. **Activation** : `City Search Opened` → `City Added` ;
3. **Engagement prévision** : `Forecast View Changed`, `Confidence Explanation Opened`, `Forecast Engine Comparison Opened`, `Diagnostics Opened` ;
4. **Modèles** : `Model Comparison Changed`, `Model Selection Changed`, `Forecast Engine Changed` ;
5. **Radar** : ouverture → mode → horizon → recalcul ;
6. **Vigilance / santé** : `Vigilance Refreshed`, `Model Health Refreshed` ;
7. **Installation** : `Install Option Selected` → `PWA Install Click` → `PWA Install Prompt Result` → `PWA Installed` ;
8. **Portabilité** : exports et sauvegardes locales ;
9. **Support** : `Support Opened` puis destination externe agrégée.

Éviter de créer des événements supplémentaires pour chaque petit clic : les événements personnalisés augmentent le volume de mesure et doivent rester liés à une question produit utile.

## Confidentialité

GPC et DNT désactivent automatiquement la mesure. L'utilisateur peut aussi la désactiver dans **Données locales → Confidentialité**. Voir `PRIVACY.md` pour la politique complète.
