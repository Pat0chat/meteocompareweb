# Mesure d’audience interne

MeteoCompare n’utilise plus de fournisseur analytics tiers. Le navigateur envoie uniquement des pageviews et événements explicitement autorisés vers `/_mcx/e` sur le même domaine. Le Worker valide et minimise les données avant de les stocker dans un Durable Object SQLite.

## Données collectées

- route fonctionnelle agrégée (`/`, `/city`, `/compare`, etc.) ;
- source externe réduite au nom d’hôte ;
- paramètres `utm_source`, `utm_medium`, `utm_campaign` ;
- pays fourni par Cloudflare, classe d’appareil, navigateur et système d’exploitation dérivés du User-Agent sans conserver ce dernier ;
- langue, mode navigateur/PWA et version de l’application ;
- événements fonctionnels appartenant à la liste blanche de `js/analytics-schema.js`.

Aucun nom de ville, coordonnée, recherche, favori ou donnée météo n’est enregistré. Aucun cookie de tracking n’est créé. GPC, DNT et l’opt-out local désactivent l’envoi.

## Visiteurs uniques

Le Worker calcule un pseudonyme journalier par HMAC à partir de l’IP, du User-Agent, de la date et de `ANALYTICS_HASH_SECRET`. L’IP et le User-Agent bruts ne sont jamais stockés. Le pseudonyme change chaque jour et ne permet pas de suivre une personne sur la durée.

## Tableau de bord

`/admin` est organisé en cinq vues internes : **Vue d’ensemble**, **Audience**, **Usage**, **Vigilance** et **Services**. La vue d’ensemble expose les KPI opérationnels et un bloc « À surveiller ». Les séries Audience, 24 h, Vigilance et disponibilité peuvent être comparées à leur période précédente ; les graphiques affichent moyenne, pics et informations détaillées au survol. Les interactions sont regroupées par familles fonctionnelles et les dimensions d’environnement sont réunies dans une seule carte à onglets. L’actualisation automatique peut être réglée sur 1, 5 ou 15 minutes.

## Secrets de production

Configurer avec Wrangler :

```sh
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put ADMIN_SESSION_SECRET
npx wrangler secret put ANALYTICS_HASH_SECRET
```

Utiliser des secrets longs et indépendants pour les deux derniers. `ANALYTICS_HASH_SECRET` est requis pour accepter de nouveaux événements et n’est jamais remplacé par `ADMIN_SESSION_SECRET`. La session admin est un cookie `HttpOnly`, `Secure`, `SameSite=Strict`, signé côté Worker et valable 12 heures.

## Test local complet

`npm run cloudflare` lance le Worker avec le Durable Object SQLite local et active le tracking uniquement sur `http://localhost:8787` (ou `127.0.0.1:8787`). Cela permet de générer des pages vues et événements de test puis de les consulter immédiatement dans `/admin`, sans toucher aux statistiques de production. `npm run preview` reste volontairement exclu du tracking.

Les données analytics sont conservées 180 jours au maximum. Le nettoyage de rétention est vérifié au plus une fois par jour par le Durable Object, sans dépendre d’un tirage aléatoire ou du volume de trafic.

## Export et attribution UTM dans l’administration

L’administration permet d’exporter la vue agrégée de la période sélectionnée en **CSV** ou **JSON**. L’export ne donne pas accès aux événements bruts : il reprend uniquement les agrégats déjà exposés par `/_mcx/admin/analytics` ainsi que l’état instantané des services pour le JSON.

Les dimensions UTM restent collectées et exportables mais ne sont plus affichées dans l’interface administrateur. Elles ne sont renseignées que lorsqu’une page vue d’entrée contient respectivement `utm_source`, `utm_medium` ou `utm_campaign`. Un referrer Google, un accès direct ou un lien externe non balisé ne crée volontairement aucune valeur UTM. Des blocs UTM vides sont donc normaux lorsqu’aucune campagne balisée n’a généré de visite pendant la période sélectionnée.

## Métriques opérationnelles du Worker Vigilance

Les appels à `/_mcx/vigilance` alimentent une table opérationnelle distincte des événements d’audience. Elle conserve pendant 180 jours uniquement : date/heure, service (`vigilance`), type de client (`web`, `android`, `unknown`), résultat succès/erreur, statut HTTP, résolution du cache (`hit`, `miss`, `error` ou `none`), latence de l’appel Météo-France lorsqu’un appel amont a réellement lieu et âge du cache lorsqu’il peut être déterminé. Aucun département, ville, coordonnée, IP, User-Agent brut, niveau de vigilance ou identifiant visiteur n’est stocké dans cette table.

Le client Web transmet `X-MeteoCompare-Client: web`. Pour une attribution Android exacte, l’application Android doit transmettre `X-MeteoCompare-Client: android` sur ses appels au Worker. Le Worker conserve un fallback limité pour quelques signatures natives reconnaissables ; les appels non attribuables restent classés `unknown` plutôt que d’être devinés.

## Historique des services

Le Worker enregistre les sondes de disponibilité/latence des principaux services dans une table `service_checks` conservée 180 jours. Un Cron Trigger Cloudflare exécute une sonde toutes les 30 minutes ; une consultation de l’administration réutilise le dernier snapshot central pendant 15 minutes et ne relance une sonde que si celui-ci est trop ancien, avec déduplication côté Durable Object. La section **Services** affiche disponibilité sur la période, latence moyenne, dernier incident et historique journalier. Ces données commencent au déploiement de cette version et ne sont pas rétroactives.
