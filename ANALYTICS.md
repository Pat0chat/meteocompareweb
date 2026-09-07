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

`/admin` affiche les visiteurs journaliers agrégés, pages vues, interactions, pages/visiteur, moyennes quotidiennes et comparaison avec la période précédente. Le tableau de bord comprend des graphiques d’audience quotidienne et des dernières 24 h, les pages, sources, pays, appareils, navigateurs, systèmes d’exploitation, langues, modes d’affichage, navigation, thèmes, densité, versions de l’application ainsi que les dimensions UTM source/médium/campagne. Il affiche aussi l’état du Worker, du stockage analytics et des principaux services météo avec leur latence instantanée.

## Secrets de production

Configurer avec Wrangler :

```sh
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put ADMIN_SESSION_SECRET
npx wrangler secret put ANALYTICS_HASH_SECRET
```

Utiliser des secrets longs et indépendants pour les deux derniers. La session admin est un cookie `HttpOnly`, `Secure`, `SameSite=Strict`, signé côté Worker et valable 12 heures.

## Test local complet

`npm run cloudflare` lance le Worker avec le Durable Object SQLite local et active le tracking uniquement sur `http://localhost:8787` (ou `127.0.0.1:8787`). Cela permet de générer des pages vues et événements de test puis de les consulter immédiatement dans `/admin`, sans toucher aux statistiques de production. `npm run preview` reste volontairement exclu du tracking.

Les données analytics sont conservées 180 jours au maximum.
