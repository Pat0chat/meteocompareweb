# Vigilance Météo-France — configuration API Key

MeteoCompare consomme le produit officiel `cartevigilance/encours` via le Worker Cloudflare. Le navigateur et l'application Android n'appellent jamais directement l'API Météo-France et ne reçoivent jamais la clé d'accès.

## 1. Préparer l'accès Météo-France

1. Se connecter au portail des API Météo-France.
2. Souscrire à **API Bulletin Vigilance**.
3. Dans la zone de génération des accès, choisir **API Key** puis générer le token avec la durée souhaitée.
4. Copier le token API Key dans un gestionnaire de mots de passe.

Pour l'API Key DPVigilance, MeteoCompare reproduit l'appel généré par l'explorateur Météo-France :

```text
apikey: <API_KEY>
```

Pour DPVigilance, MeteoCompare reproduit le contrat réellement fourni par l'explorateur du portail Météo-France : en-tête `apikey: <API_KEY>` avec `Accept: */*`. Le Worker n'effectue aucun échange OAuth lorsque `METEOFRANCE_API_KEY` est configuré.

Ne jamais mettre la clé dans le JavaScript, `wrangler.jsonc`, le dépôt Git, l'application Android ou une archive distribuée.

## 2. Production Cloudflare

Depuis le dossier du projet :

```bash
npx wrangler secret put METEOFRANCE_API_KEY
```

Wrangler demande la valeur de manière interactive. Coller **uniquement la clé API**. Si `Bearer ` ou `apikey:` a été copié avec la valeur, le Worker le retire par tolérance, mais le secret doit idéalement contenir la clé seule.

Puis déployer :

```bash
npm run build
npx wrangler deploy
```

### Migration depuis MeteoCompare 1.16.38

Pour éviter toute coupure, créer d'abord le nouveau secret `METEOFRANCE_API_KEY`, déployer la version 1.16.42, puis vérifier `/_mcx/vigilance?department=91`. **Seulement après un test réussi**, l'ancien secret devenu inutile peut être supprimé :

```bash
npx wrangler secret delete METEOFRANCE_APPLICATION_ID
```

La suppression de l'ancien secret n'est pas nécessaire au fonctionnement de 1.16.42, mais elle réduit les credentials inutiles conservés dans Cloudflare.

Alternative dans le dashboard Cloudflare : Worker **meteocompare** → **Settings** → **Variables and Secrets** → ajouter un **Secret** nommé exactement `METEOFRANCE_API_KEY`, puis redéployer.

## 3. Preview local

Copier `.dev.vars.example` vers `.dev.vars` :

```text
METEOFRANCE_API_KEY=COLLER_ICI_L_API_KEY
```

`.dev.vars` est ignoré par Git. Ne jamais modifier `.dev.vars.example` avec une vraie clé.

Puis :

```bash
npm run build
npm run preview
```

## 4. Vérification

Tester par exemple :

```text
/_mcx/vigilance?department=91
```

Une configuration valide renvoie notamment :

```json
{
  "configured": true,
  "unavailable": false,
  "department": "91",
  "periods": []
}
```

La réponse ne doit jamais contenir `METEOFRANCE_API_KEY`, la valeur de l'API Key, votre mot de passe ou votre adresse e-mail.

- `configured: false` : le secret n'est pas présent dans l'environnement Worker/preview.
- `configured: true`, `upstreamStatus: 401`, `diagnostic: INVALID_CREDENTIAL` : Météo-France rejette la clé présentée ; vérifier la valeur générée sur le portail et la tester dans l'explorateur officiel.
- `configured: true`, `upstreamStatus: 403`, `diagnostic: FORBIDDEN` : la clé est présentée mais l'accès à Bulletin Vigilance est refusé ; vérifier la souscription/droits du compte.
- Les diagnostics ne contiennent jamais la clé ni le corps brut de la réponse Météo-France.

## 5. Rotation / perte / exposition

Si la clé est exposée :

1. la révoquer depuis le portail Météo-France ;
2. générer une nouvelle API Key ;
3. remplacer immédiatement le secret Cloudflare avec `npx wrangler secret put METEOFRANCE_API_KEY` ;
4. redéployer le Worker ;
5. remplacer aussi la valeur locale dans `.dev.vars` si nécessaire.

Il n'est pas nécessaire de modifier l'application Web ou Android lors d'une rotation : les clients continuent d'appeler uniquement `/_mcx/vigilance`.

## 6. Architecture et cache

```text
Navigateur / Android → /_mcx/vigilance → Worker Cloudflare → API Bulletin Vigilance Météo-France
```

Le Worker :

- garde `METEOFRANCE_API_KEY` uniquement dans l'environnement serveur ;
- envoie `apikey: <API_KEY>` à Météo-France ;
- met la carte nationale en cache edge 5 minutes ;
- extrait le département et éventuellement le littoral ;
- renvoie un JSON assaini J/J+1 au client.

Aucun secret Météo-France n'est nécessaire côté Android : seule l'URL publique du Worker MeteoCompare est utilisée.
