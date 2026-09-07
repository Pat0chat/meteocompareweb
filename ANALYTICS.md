# Mesure d’audience interne

MeteoCompare n’utilise plus de fournisseur analytics tiers. Le navigateur envoie uniquement des pageviews et événements explicitement autorisés vers `/_mcx/e` sur le même domaine. Le Worker valide et minimise les données avant de les stocker dans un Durable Object SQLite.

## Données collectées

- route fonctionnelle agrégée (`/`, `/city`, `/compare`, etc.) ;
- source externe réduite au nom d’hôte ;
- paramètres `utm_source`, `utm_medium`, `utm_campaign` ;
- pays fourni par Cloudflare, classe d’appareil et navigateur dérivés du User-Agent sans conserver ce dernier ;
- langue, mode navigateur/PWA et version de l’application ;
- événements fonctionnels appartenant à la liste blanche de `js/analytics-schema.js`.

Aucun nom de ville, coordonnée, recherche, favori ou donnée météo n’est enregistré. Aucun cookie de tracking n’est créé. GPC, DNT et l’opt-out local désactivent l’envoi.

## Visiteurs uniques

Le Worker calcule un pseudonyme journalier par HMAC à partir de l’IP, du User-Agent, de la date et de `ANALYTICS_HASH_SECRET`. L’IP et le User-Agent bruts ne sont jamais stockés. Le pseudonyme change chaque jour et ne permet pas de suivre une personne sur la durée.

## Tableau de bord

`/admin` affiche les visiteurs journaliers agrégés, pages vues, événements, pages, sources, pays, appareils, navigateurs, campagnes UTM et une courbe journalière. Il affiche aussi l’état du Worker, du stockage analytics et des principaux services météo.

## Secrets de production

Configurer avec Wrangler :

```sh
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put ADMIN_SESSION_SECRET
npx wrangler secret put ANALYTICS_HASH_SECRET
```

Utiliser des secrets longs et indépendants pour les deux derniers. La session admin est un cookie `HttpOnly`, `Secure`, `SameSite=Strict`, signé côté Worker et valable 12 heures.

Les données analytics sont conservées 180 jours au maximum.
