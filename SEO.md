# Référencement de meteocompare.app

Cette version met en place les fondations SEO P0 à P6 sans changer la version applicative `1.13.1`.

## P0 — Google Search Console

La validation Search Console nécessite une action dans le compte Google propriétaire du domaine et ne peut donc pas être finalisée dans le code du projet.

### Méthode recommandée : propriété Domaine

1. Ouvrir Google Search Console et ajouter la propriété **Domaine** `meteocompare.app`.
2. Copier l’enregistrement TXT fourni par Google.
3. Dans Cloudflare DNS, ajouter ce TXT à la zone `meteocompare.app`.
4. Revenir dans Search Console et lancer la validation.
5. Envoyer ensuite le sitemap : `https://meteocompare.app/sitemap.xml`.
6. Utiliser l’inspection d’URL sur `/`, `/meteo/paris`, `/meteo/toulouse` et quelques autres villes pour demander l’indexation initiale et contrôler le canonical choisi.

La propriété Domaine est recommandée car elle couvre le domaine et ses variantes de protocole/sous-domaines avec une seule validation DNS.

### Alternative : propriété Préfixe d’URL

Le build accepte une variable d’environnement facultative :

```text
GOOGLE_SITE_VERIFICATION=<jeton fourni par Google>
```

Si elle est définie dans les variables de build Cloudflare Pages, `tools/build-site.mjs` injecte automatiquement la balise `google-site-verification` dans le HTML généré. Ne renseigner que le jeton, jamais une balise HTML complète.

## P1 — URLs publiques par ville

Le catalogue SEO est dans `js/seo-cities.mjs`. Les villes cataloguées utilisent des URLs stables :

```text
https://meteocompare.app/meteo/toulouse
https://meteocompare.app/meteo/paris
```

Les routes historiques `#/city/{id}` restent prises en charge. Lorsqu’une ville cataloguée est ouverte directement, elle est chargée sans être ajoutée automatiquement aux favoris ; l’utilisateur peut l’ajouter explicitement.

## P2 — Métadonnées dynamiques

Chaque page ville pré-rendue possède :

- un `title` spécifique ;
- une `meta description` spécifique ;
- un H1 spécifique ;
- un `rel=canonical` vers son URL `/meteo/{ville}` ;
- `robots=index,follow,max-image-preview:large`.

Le runtime synchronise aussi ces métadonnées pendant la navigation côté client.

## P3 — HTML pré-rendu

`npm run build` génère `dist/` et un fichier HTML par ville. Le HTML initial contient du contenu utile même avant l’exécution de JavaScript. Les valeurs météo volatiles ne sont volontairement pas figées dans le pré-rendu : elles sont chargées ensuite par l’application afin d’éviter l’indexation de prévisions périmées.

## P4 — sitemap.xml et robots.txt

Le build génère :

- `dist/sitemap.xml` avec l’accueil et toutes les villes du catalogue ;
- `dist/robots.txt` autorisant l’exploration et déclarant le sitemap ;
- `dist/_redirects` pour normaliser notamment les variantes avec slash final.

## P5 — contenu des pages ville

Chaque page contient une présentation géographique stable, une explication de la comparaison multi-modèles, de la convergence/dispersion, une méthode de lecture de MeteoCompare et des liens vers des villes proches. Le catalogue initial est volontairement limité à 80 villes pour éviter de créer massivement des pages faibles ou quasi dupliquées.

## P6 — maillage interne

La page d’accueil expose des liens HTML vers les principales pages ville. Chaque page ville lie également plusieurs villes proches. Ces liens sont de vrais `<a href>` et restent donc explorables indépendamment du routeur JavaScript.

## Vérification avant déploiement

```bash
npm run build
```

Contrôler ensuite au minimum :

```text
dist/index.html
dist/meteo/toulouse.html
dist/sitemap.xml
dist/robots.txt
dist/_redirects
```

Après déploiement, vérifier que `https://meteocompare.app/meteo/toulouse` renvoie directement le HTML de Toulouse et non uniquement le shell générique.
