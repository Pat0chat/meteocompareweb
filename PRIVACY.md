# Politique de confidentialité — MeteoCompare

*Dernière mise à jour : août 2026*

## Résumé

MeteoCompare ne contient ni publicité, ni tracker publicitaire, ni profilage utilisateur.

La **version Android native** conserve son fonctionnement sans analytics MeteoCompare.

La **version web** peut activer une mesure d’audience minimale via Plausible Analytics. Sa finalité est limitée à la mesure de la fréquentation et de la charge du site, au dimensionnement de l’hébergement et au suivi des installations PWA détectées. Ces statistiques ne servent ni à la publicité, ni au profilage, ni au suivi inter-sites. Cette mesure est livrée **désactivée tant que l’éditeur du site n’a pas configuré son propre site Plausible**.

## 1. Données locales

La version web conserve dans le navigateur :

- villes favorites ;
- réglages ;
- caches de prévisions ;
- normales ERA5 ;
- historiques de biais ;
- snapshots d’évolution ;
- préférence locale d’opposition à la mesure d’audience, le cas échéant.

Ces données ne sont pas synchronisées vers un serveur MeteoCompare.

## 2. Requêtes météo et recherche de villes

MeteoCompare interroge les API Open-Meteo pour la recherche de villes et la récupération des prévisions/historiques nécessaires aux fonctions météo.

Selon la requête, Open-Meteo reçoit notamment la chaîne recherchée ou les coordonnées de la ville, ainsi que les métadonnées réseau habituelles d’une requête HTTPS. Les favoris et historiques locaux complets ne sont pas transmis à Open-Meteo comme une base de données utilisateur.

Politique Open-Meteo : https://open-meteo.com/en/terms#privacy

## 3. Mesure d’audience minimale de la version web

Lorsqu’elle est activée par l’éditeur du site, MeteoCompare utilise directement l’Events API de Plausible Analytics. Aucun script analytics tiers supplémentaire n’est chargé.

### Finalité

La mesure est utilisée uniquement pour :

- mesurer la fréquentation et la charge globale du site ;
- estimer la capacité d’hébergement/serveur nécessaire ;
- suivre le nombre d’installations PWA détectées et les clics sur le bouton d’installation.

MeteoCompare n’utilise pas ces statistiques pour la publicité, le ciblage commercial, le profilage utilisateur, le suivi inter-sites ou l’enrichissement de profils individuels. Les résultats recherchés sont des **statistiques agrégées** et MeteoCompare ne cherche pas à identifier les visiteurs.

### Événements envoyés

- pageview sur une catégorie de route expurgée : `/`, `/city`, `/bias`, `/compare`, `/data`, `/settings`, `/about` ;
- `PWA Install Click` ;
- `PWA Installed` lorsque le navigateur signale effectivement l’installation.

### Données que MeteoCompare n’ajoute jamais à ces événements

- nom ou identifiant de ville ;
- coordonnées ;
- favoris ;
- modèle météo ;
- valeurs de prévision ;
- accord, scénario, biais ou historique ;
- propriétés personnalisées ;
- referrer ;
- identifiant persistant analytics créé par MeteoCompare.

Les appels utilisent `credentials: omit` et `referrerPolicy: no-referrer`.

Plausible reçoit néanmoins les métadonnées réseau normales de la requête HTTPS. Sa documentation indique que l’IP et le User-Agent servent au calcul des visiteurs uniques et que l’IP brute n’est pas stockée dans sa base : https://plausible.io/docs/events-api

## 4. Cookies, identifiants et signaux de confidentialité

MeteoCompare n’utilise pas de cookie analytics et ne crée pas d’identifiant persistant pour la mesure d’audience.

La mesure est désactivée automatiquement si le navigateur expose :

- Global Privacy Control (GPC) ;
- Do Not Track (DNT).

L’utilisateur peut également la désactiver dans **Données locales → Confidentialité**. Ce choix est enregistré uniquement dans le navigateur.

## 5. Installations PWA

Le compteur `PWA Installed` correspond aux installations que le navigateur expose via l’événement `appinstalled`. Ce compteur n’est pas garanti exhaustif : certaines installations réalisées via iOS ou certains menus système peuvent ne pas générer cet événement.

Le compteur `PWA Install Click` mesure uniquement le bouton interne de MeteoCompare.

## 6. Effacement

« Effacer les données locales » supprime les favoris, réglages, caches, historiques, snapshots, base IndexedDB et préférence locale d’opposition analytics. Le cache technique de la PWA peut être recréé automatiquement par le navigateur.

Les statistiques déjà agrégées chez le fournisseur de mesure d’audience ne font pas partie du stockage local du navigateur.

## 7. Version Android

La version Android native ne reçoit pas cette instrumentation web et conserve la politique de mesure d’audience du projet Android. Elle n’utilise pas le mécanisme Plausible décrit ci-dessus.

## 8. Cadre réglementaire

La minimisation technique de cette intégration ne constitue pas une certification ni une validation de conformité. Le responsable du site doit vérifier la configuration effective du fournisseur de mesure d’audience et les conditions applicables à son déploiement.

La CNIL prévoit qu’une mesure d’audience peut, dans certains cas, bénéficier d’une exemption de consentement lorsque sa finalité est strictement limitée à la mesure de l’audience et des performances nécessaires au service — ce qui peut inclure l’estimation de la puissance des serveurs — et qu’elle sert à produire uniquement des statistiques anonymes. Elle impose également, selon le dispositif, l’absence de suivi inter-sites ou de réutilisation incompatible et appelle à la vigilance sur les transferts. **L’éligibilité réelle à une exemption dépend donc de la configuration effective du fournisseur au moment du déploiement.**

Référence CNIL :
https://www.cnil.fr/fr/cookies-solutions-pour-les-outils-de-mesure-daudience

## 9. Contact

Pour toute question :
https://github.com/Pat0chat/MeteoCompare/issues
