# Déploiement sur GitHub Pages

MeteoCompare Web est prêt pour GitHub Pages, y compris quand le dépôt est publié dans un sous-chemin comme :

`https://VOTRE-COMPTE.github.io/VOTRE-DEPOT/`

## Installation recommandée

1. Créez un dépôt GitHub, par exemple `meteocompare-web`.
2. Décompressez l'archive et placez **le contenu du dossier** à la racine du dépôt.
3. Vérifiez que le fichier caché `.github/workflows/pages.yml` est bien présent.
4. Committez et poussez sur la branche `main`.
5. Ouvrez **Settings → Pages** dans le dépôt.
6. Dans **Build and deployment**, choisissez **GitHub Actions** comme source.
7. Ouvrez l'onglet **Actions** et attendez la fin du workflow `Deploy MeteoCompare to GitHub Pages`.
8. L'URL du site est affichée dans le job `deploy` et dans les réglages Pages.

## Ce que fait le workflow

Avant toute publication, il exécute :

```bash
node tests/smoke.mjs
node tests/ui-performance.mjs
node tests/static-audit.mjs
node tests/pages-compat.mjs
node tests/fidelity-regression.mjs
node tests/analysis-suite.mjs
node tests/stability-i18n-audit.mjs
```

Puis il prépare `_site`, en excluant les tests et les fichiers propres au dépôt, charge l'artefact Pages et le publie dans l'environnement `github-pages`.

## Mise à jour du site

Après la configuration initiale, un simple push sur `main` suffit. Le nouveau code est testé puis publié automatiquement.

## PWA

GitHub Pages sert le site en HTTPS. Le manifeste et le service worker sont déjà configurés avec des chemins relatifs. Sur un navigateur compatible, MeteoCompare peut donc être proposé à l'installation comme PWA.

## Domaine personnalisé

Vous pouvez ensuite définir un domaine personnalisé dans **Settings → Pages**. Le code MeteoCompare n'a pas besoin d'être recompilé : aucun chemin n'est lié au nom du dépôt.

## Points à ne pas modifier

- conservez `manifest.webmanifest` avec `start_url`, `scope` et `id` relatifs ;
- conservez l'enregistrement `./sw.js` ;
- n'ajoutez pas de slash initial aux chemins `src` / `href` des assets ;
- ne mettez pas les appels Open-Meteo dans le cache du service worker.
