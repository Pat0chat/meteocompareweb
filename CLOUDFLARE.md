# Configuration Cloudflare — MeteoCompare

Le projet est préparé pour Cloudflare Workers Builds avec assets statiques, pré-rendu SEO, mesure d’audience first-party, administration privée et proxy Vigilance officielle Météo-France. La politique réseau complète et les flux volontairement laissés directs sont documentés dans `NETWORK.md`.

## Configuration recommandée — Settings > Build

Si l'interface affiche `Build command` ET `Deploy command`, utiliser :

- Git repository : le dépôt GitHub/GitLab contenant ce projet (`package.json` et `wrangler.jsonc` à la racine)
- Build command : `npm run build`
- Deploy command : `npx wrangler deploy`
- Root directory : laisser vide (le projet est à la racine du dépôt)
- Production branch : `main`
- Builds for non-production branches : activé si les previews sont souhaitées
- Non-production branch deploy command : laisser la valeur Cloudflare par défaut `npx wrangler versions upload`
- Build watch paths — Include : `*`
- Build watch paths — Exclude : laisser vide
- Build cache : activé
- API token : token automatique Cloudflare, sauf politique spécifique du compte

Le Worker du dashboard doit porter le même nom que la propriété `name` de `wrangler.jsonc`, actuellement :

```text
meteocompare
```

Le build génère `dist/`. Les routes applicatives principales utilisent le hash (`#/…`) et les pages SEO `/meteo/{ville}` sont pré-rendues ; les URL propres inconnues doivent donc recevoir une vraie réponse 404, pas un fallback SPA en statut 200. Le fichier `wrangler.jsonc` déclare déjà :

```json
{
  "name": "meteocompare",
  "compatibility_date": "2026-08-19",
  "main": "./worker.js",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "run_worker_first": ["/_mcx/*", "/admin", "/admin/*", "/admin.html", "/admin.js", "/admin.css"],
    "not_found_handling": "404-page"
  }
}
```

## Analytics first-party et administration

`worker.js` stocke les événements de `/_mcx/e` dans le Durable Object SQLite. Le navigateur ne charge aucun tracker tiers : `js/analytics-transport.js` construit localement les payloads minimaux et les envoie uniquement au endpoint first-party. Les destinations et timeouts sont centralisés dans `js/network-config.js` et les appels amont du Worker sont bornés. Les autres requêtes sont servies par le binding `ASSETS`. Le Service Worker navigateur contourne explicitement `/_mcx/*` afin que ces réponses dynamiques ne soient jamais figées dans le cache du shell PWA.

Le Durable Object `AnalyticsStore` utilise SQLite et est déclaré dans `wrangler.jsonc`. `ANALYTICS_HASH_SECRET` est obligatoire pour l’ingestion analytics et n’est jamais remplacé par le secret de session admin : les deux secrets restent strictement séparés. `/admin` est protégé par une session signée côté Worker. La route canonique `/admin` est transmise telle quelle au binding `ASSETS` : il ne faut pas la réécrire en `/admin.html`, car le `html_handling` automatique de Cloudflare redirige précisément `/admin.html` vers `/admin`, ce qui créerait une boucle. Les assets admin sont servis avec `Cache-Control: no-store` et le Service Worker les contourne explicitement. Ne pas renommer ces chemins sans mettre à jour `js/analytics-config.js`, `admin.js` et les tests associés.

### Environnement Cloudflare local complet

Pour lancer l'application avec le même Worker et les mêmes bindings que la production :

```bash
npm run cloudflare
```

`tools/cloudflare-dev.mjs` prépare les secrets locaux et effectue le build, puis le script npm lance `wrangler dev --local --port 8787 --persist-to .wrangler/state` via le shell natif du système, avec persistance locale dans `.wrangler/state`. Si `.dev.vars` n'existe pas ou s'il manque un secret admin/analytics, la commande génère automatiquement `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET` et `ANALYTICS_HASH_SECRET`; le mot de passe local nouvellement créé est affiché dans le terminal. `.dev.vars*` et `.wrangler/` sont ignorés par Git. L’audit de release ignore ces fichiers locaux, mais vérifie qu’ils sont bien exclus par `.gitignore` et qu’aucun secret local n’est présent dans `dist/`.

- application : `http://localhost:8787/`
- administration : `http://localhost:8787/admin`
- analytics local : actif uniquement sur `localhost:8787` et `127.0.0.1:8787`
- preview statique `npm run preview` : analytics désactivé sur le port `4173`
- `METEOFRANCE_API_KEY` : facultatif en local, à ajouter manuellement dans `.dev.vars`

Sous Windows, Wrangler est volontairement lancé par le script npm lui-même (et non via `child_process.spawn()` sur `npx.cmd`) afin d'éviter l'erreur `spawn EINVAL` observée avec certaines versions récentes de Node.js, notamment Node 24.

Le Worker conserve les règles de production strictes : les payloads analytics HTTP ne sont acceptés que lorsque la requête elle-même provient du runtime local sur le port 8787. Sur `meteocompare.app`, les URLs analytics restent obligatoirement en HTTPS et la session admin garde le cookie `Secure`.

## Google Search Console

Méthode recommandée : propriété Domaine `meteocompare.app` validée par TXT DNS Cloudflare.
Dans ce cas, aucune variable de build Google n'est nécessaire.

Alternative uniquement pour une propriété Préfixe d'URL :

```text
GOOGLE_SITE_VERIFICATION=<jeton Google uniquement>
```

Le script de build injectera alors la meta de validation dans le HTML.

## Si le projet est encore un ancien projet Cloudflare Pages

Si l'interface affiche `Build output directory` mais PAS `Deploy command`, utiliser :

- Framework preset : None
- Build command : `npm run build`
- Build output directory : `dist`
- Root directory : laisser vide
- Production branch : `main`
- Build watch paths — Include : `*`
- Build watch paths — Exclude : laisser vide

Dans ce mode Pages, Cloudflare publie directement le contenu de `dist/` et il ne faut pas ajouter `npx wrangler deploy` comme étape de build. **Limitation :** le stockage analytics et l’administration définis dans `worker.js` ne seront pas présents dans un déploiement purement statique. Pour la production `meteocompare.app`, privilégier le mode Workers Builds ci-dessus.

## Vérifications après déploiement

Contrôler au minimum :

- `https://meteocompare.app/`
- `https://meteocompare.app/meteo/toulouse`
- `https://meteocompare.app/meteo/paris`
- `https://meteocompare.app/sitemap.xml`
- `https://meteocompare.app/robots.txt`

La source HTML de `/meteo/toulouse` doit contenir directement un title, une description, un canonical et un H1 propres à Toulouse avant exécution de JavaScript.

## Vigilance Météo-France — secret Worker

La Vigilance officielle utilise `/_mcx/vigilance` côté navigateur et l'API Bulletin Vigilance uniquement côté Worker. **Aucun identifiant Météo-France ne doit être ajouté dans `wrangler.jsonc` ou dans le JavaScript.**

Configurer le secret :

```bash
npx wrangler secret put METEOFRANCE_API_KEY
```

Coller uniquement le token **API Key** généré depuis le portail Météo-France. Ne pas ajouter de préfixe. Si `Bearer ` ou `apikey:` est collé par erreur, le Worker le normalise, puis déployer avec `npx wrangler deploy`. Pour le preview local, utiliser `.dev.vars` comme décrit dans `VIGILANCE_METEOFRANCE.md`.

Le Worker envoie cette clé uniquement côté serveur dans l'en-tête `apikey: <API_KEY>` (avec `Accept: */*`, comme le curl généré par l'explorateur DPVigilance) et met le produit national `cartevigilance/encours` en cache 5 minutes. Le navigateur et l'application Android ne reçoivent jamais la clé.

Lors d'une migration depuis 1.16.38, ajouter d'abord `METEOFRANCE_API_KEY`, déployer et tester le endpoint. L'ancien secret peut ensuite être supprimé avec `npx wrangler secret delete METEOFRANCE_APPLICATION_ID`.


### Monitoring endpoint

`GET /_mcx/health` is handled directly by `worker.js`. It is intentionally cheap and uncached, reports whether the Vigilance secret is configured, and never exposes its value or calls Météo-France/Open-Meteo/MeteoCompare Analytics.
