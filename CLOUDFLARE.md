# Configuration Cloudflare — MeteoCompare

Le projet est préparé pour Cloudflare Workers Builds avec assets statiques, pré-rendu SEO et proxies first-party pour Plausible, les métadonnées de santé des modèles et la Vigilance officielle Météo-France. La politique réseau complète et les flux volontairement laissés directs sont documentés dans `NETWORK.md`.

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

Le build génère `dist/`. Le fichier `wrangler.jsonc` déclare déjà :

```json
{
  "name": "meteocompare",
  "compatibility_date": "2026-08-19",
  "main": "./worker.js",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "run_worker_first": ["/_mcx/*"],
    "not_found_handling": "single-page-application"
  }
}
```

## Proxy Plausible first-party

`worker.js` relaie `/_mcx/e` vers l’Events API Plausible et `/_mcx/model-metadata?key=…` vers les fichiers `latest.json` de métadonnées Open-Meteo utilisés par la santé des modèles. Le navigateur ne charge plus de script Plausible externe ou proxifié : `js/mcx-events.js` construit localement les payloads minimaux et les envoie uniquement au endpoint first-party. Les destinations et timeouts sont centralisés dans `js/network-config.js` ; les appels amont du Worker sont bornés ; pour la santé des modèles, une indisponibilité amont est convertie en fallback JSON 200 vers le timestamp du run de prévision afin de ne pas exposer les statuts tiers au navigateur. Le navigateur reste sur `meteocompare.app`; la requête de santé ne dépend donc plus d’un accès direct du poste client au service de métadonnées `map-tiles.open-meteo.com`. Les autres requêtes sont servies par le binding `ASSETS`. Le Service Worker navigateur contourne explicitement `/_mcx/*` afin que ces réponses dynamiques ne soient jamais figées dans le cache du shell PWA.

Ce mécanisme suit le modèle de proxy Cloudflare recommandé par Plausible. Ne pas renommer ces chemins sans mettre à jour `js/analytics-config.js`, `index.html` et les tests associés.

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

Dans ce mode Pages, Cloudflare publie directement le contenu de `dist/` et il ne faut pas ajouter `npx wrangler deploy` comme étape de build. **Limitation :** le proxy first-party Plausible défini dans `worker.js` ne sera pas présent dans un déploiement purement statique. Pour la production `meteocompare.app`, privilégier le mode Workers Builds ci-dessus.

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

`GET /_mcx/health` is handled directly by `worker.js`. It is intentionally cheap and uncached, reports whether the Vigilance secret is configured, and never exposes its value or calls Météo-France/Open-Meteo/Plausible.
