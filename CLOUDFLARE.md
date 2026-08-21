# Configuration Cloudflare — MeteoCompare v1.13.1

Le projet est préparé pour Cloudflare Workers Builds avec assets statiques et pré-rendu SEO.

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
  "assets": {
    "directory": "./dist",
    "not_found_handling": "single-page-application"
  }
}
```

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

Dans ce mode Pages, Cloudflare publie directement le contenu de `dist/` et il ne faut pas ajouter `npx wrangler deploy` comme étape de build.

## Vérifications après déploiement

Contrôler au minimum :

- `https://meteocompare.app/`
- `https://meteocompare.app/meteo/toulouse`
- `https://meteocompare.app/meteo/paris`
- `https://meteocompare.app/sitemap.xml`
- `https://meteocompare.app/robots.txt`

La source HTML de `/meteo/toulouse` doit contenir directement un title, une description, un canonical et un H1 propres à Toulouse avant exécution de JavaScript.
