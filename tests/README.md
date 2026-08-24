# Organisation des tests

Les tests ne sont pas liés aux numéros de version de MeteoCompare. Leur emplacement décrit ce qu'ils protègent :

```text
tests/<fonctionnalité>/<portée>/<fichier>.<comportement>.test.mjs
```

- **fonctionnalité** : domaine produit ou technique (`forecast`, `marine`, `radar`, `seo`, `pwa`, `analytics`, `architecture`, etc.) ;
- **portée** : niveau du test (`unit`, `integration`, `regression`, `static`, `smoke`) ;
- **fichier** : fichier source principal ciblé (`app`, `styles`, `radar`, `forecast-engines`, `build-site`, `cross-module`, etc.), suivi si utile du comportement protégé.

Exemples :

```text
tests/radar/unit/radar.nowcast-graceful.test.mjs
tests/forecast/unit/forecast-engines.audit.test.mjs
tests/marine/regression/styles.tide-table-alignment.test.mjs
tests/seo/integration/build-site.foundation.test.mjs
```

## Exécution

```bash
npm run tests
npm run test:unit
npm run test:integration
npm run test:regression
npm run test:static
npm run test:performance
node tools/run-tests.mjs --feature radar
node tools/run-tests.mjs --scope integration --feature analytics
node tools/run-tests.mjs --file forecast-engines
node tools/run-tests.mjs --list
```

Le runner découvre récursivement uniquement les fichiers `*.test.mjs`. `fixtures/` et `helpers/` sont volontairement exclus de l'exécution.

## Règles de contribution

1. Ne jamais créer un test nommé d'après une release ou une version (`release-xxxx`, `1.x.y`, etc.).
2. Placer le test dans la fonctionnalité réellement concernée, pas dans un dossier chronologique.
3. Choisir la portée la plus étroite qui couvre le comportement : `unit` avant `integration`, `integration` avant `regression` lorsque c'est possible.
4. Nommer le fichier d'après la source principale ou `cross-module`/`cross-file` si l'invariant traverse plusieurs modules.
5. Les assertions de version applicative restent centralisées dans `architecture/integration/app-version.centralization.test.mjs`.
6. Préférer des assertions structurelles tolérantes au formatage (regex ciblée, valeur exportée, comportement) aux comparaisons de chaînes CSS/JS sensibles aux espaces.

## Socle fonctionnel minimal

Les modules qui définissent les contrats et la résilience du runtime doivent disposer d'un test unitaire ciblé, en plus des tests d'intégration :

- contrats de données (`data/contracts.js`) et normalisation des prévisions (`data/forecast-normalizer.js`) ;
- budget/déduplication/cache des requêtes Open-Meteo (`api-budget.js`) ;
- erreurs structurées et centre d'erreurs (`errors.js`) ;
- cycle de vie du noyau (`core/application-kernel.js`, registres d'opérations, lazy features, analyses locales) ;
- formatage i18n, routes SEO et rendu des icônes météo.

Les comportements transverses visibles sur plusieurs pages, comme le disclaimer d'interprétation multi-modèles, restent testés en intégration afin de vérifier à la fois le composant partagé, ses points d'injection, son accessibilité et toutes ses traductions.
