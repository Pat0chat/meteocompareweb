# Politique de confidentialité — MeteoCompare

*Dernière mise à jour : août 2026*

## Résumé

MeteoCompare ne contient ni publicité, ni tracker publicitaire, ni profilage utilisateur.

La **version Android native** conserve son fonctionnement sans analytics MeteoCompare.

La **version web** peut activer une mesure d’audience minimale via Plausible Analytics. Sa finalité est limitée à la mesure de la fréquentation et de la charge du site, au dimensionnement de l’hébergement et au suivi des installations PWA détectées. Ces statistiques ne servent ni à la publicité, ni au profilage, ni au suivi inter-sites. Sur le déploiement public `meteocompare.app`, cette mesure est activée et limitée aux hôtes de production explicitement autorisés ; localhost et les previews ne sont pas comptés.

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

Lorsqu’elle est activée par l’éditeur du site, MeteoCompare utilise le tracker officiel Plausible Analytics associé à `meteocompare.app`, servi au navigateur via un proxy first-party Cloudflare sous le domaine MeteoCompare. Les pageviews automatiques ainsi que le suivi automatique des liens sortants, téléchargements et formulaires sont désactivés : seuls les pageviews et événements explicitement autorisés par MeteoCompare sont envoyés.

### Finalité

La mesure est utilisée uniquement pour :

- mesurer la fréquentation et la charge globale du site ;
- comprendre quelles fonctions de l’application sont réellement utilisées ;
- mesurer l’origine agrégée du trafic et l’efficacité de campagnes balisées ;
- estimer la capacité d’hébergement/serveur nécessaire ;
- suivre le nombre d’installations PWA détectées et les clics sur le bouton d’installation.

MeteoCompare n’utilise pas ces statistiques pour la publicité, le ciblage commercial, le profilage utilisateur, le suivi inter-sites ou l’enrichissement de profils individuels. Les résultats recherchés sont des **statistiques agrégées** et MeteoCompare ne cherche pas à identifier les visiteurs.

### Événements et informations envoyés

Les pages sont regroupées avant envoi afin d’éviter de transmettre la ville consultée :

- `/` ;
- `/city` pour toutes les pages ville, y compris les nouvelles routes SEO `/meteo/<ville>` ;
- `/bias` ;
- `/compare` ;
- `/data` ;
- `/settings` ;
- `/about` ;
- `/404` pour une route SEO inconnue.

Des propriétés à faible cardinalité peuvent être jointes aux pageviews : version de MeteoCompare, langue de l’interface, mode navigateur/PWA, type de navigation (`seo`, `spa` ou `direct`), thème effectif, densité d’interface, onglet/mode/métrique/horizon de la vue ville, nombre de modèles comparés, ainsi que la variable et le modèle consultés sur la page de biais. Pour une comparaison de villes, seul le **nombre** de villes est envoyé.

Des événements fonctionnels explicitement listés peuvent également être envoyés : recherche/ajout/suppression de ville, rafraîchissement manuel, changements de vues, comparaisons et sélection de modèles, moteur de prévision, explications de confiance et diagnostics, santé des modèles et Vigilance, fonctions marine/radar, exports et sauvegardes locales, partage, monitoring, ouverture du support et parcours d’installation PWA. Les liens sortants ne sont pas suivis automatiquement : seuls quelques boutons explicitement balisés transmettent une destination générique (`bluesky`, `meteofrance_vigilance`, `liberapay` ou `kofi`), jamais l’URL complète cliquée.

Pour l’attribution d’acquisition :

- seuls `utm_source`, `utm_medium` et `utm_campaign` sont conservés parmi les paramètres de l’URL ;
- le referrer externe peut être envoyé mais il est réduit à son **origine** (`https://www.google.com/`, par exemple) : son chemin, ses paramètres et son fragment sont supprimés ;
- les referrers internes ne sont pas envoyés.

### Données que MeteoCompare n’ajoute jamais à ces événements

- nom, slug ou identifiant de ville ;
- coordonnées ;
- texte saisi dans la recherche de ville ;
- favoris ;
- valeurs météo ou séries de prévision ;
- valeurs d’accord, scénarios, biais chiffrés ou historiques locaux ;
- contenu et nom de fichier des exports ;
- niveau/couleur de Vigilance ;
- identifiant persistant analytics créé par MeteoCompare.

Les propriétés et événements acceptés sont filtrés par une liste blanche partagée entre le navigateur et le Worker Cloudflare afin qu’un identifiant, une chaîne arbitraire ou un événement forgé ne puisse pas être relayé par `/_mcx/e`. MeteoCompare fournit au tracker Plausible une URL déjà anonymisée et un `transformRequest` réduit le referrer externe à son origine ; un referrer interne est supprimé. Aucun suivi automatique du scroll, de la visibilité des sections, des impressions ou du temps passé n’est activé.

Les événements analytics sont relayés par le Worker Cloudflare de MeteoCompare vers Plausible. Pour préserver le fonctionnement prévu du service derrière ce proxy, le Worker transmet explicitement le User-Agent du navigateur et l’adresse client fournie par Cloudflare comme `X-Forwarded-For`, plutôt que de faire confiance à un header arbitraire fourni par le client. Plausible reçoit donc les métadonnées réseau nécessaires au traitement de la requête relayée. Sa documentation indique que l’IP et le User-Agent servent notamment au calcul des visiteurs uniques, au type d’appareil/navigateur et à la localisation agrégée du visiteur, et que l’IP brute n’est pas stockée dans sa base : https://plausible.io/docs/events-api

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

## Radar pluie optionnel

La vue **Radar pluie** de la page Détails est entièrement optionnelle et ne déclenche aucune requête tant que l'utilisateur ne l'ouvre pas.

À l'ouverture, MeteoCompare contacte :

- **RainViewer** pour récupérer les images radar des deux dernières heures. Les coordonnées de la localité affichée sont incluses dans la requête d'image afin de centrer le radar. RainViewer reçoit donc ces coordonnées ainsi que les métadonnées réseau habituelles d'une requête HTTPS.
- **OpenStreetMap** pour afficher le fond cartographique. Les requêtes concernent uniquement les tuiles nécessaires à la zone visible et respectent le cache HTTP du navigateur.

Ces données ne sont pas ajoutées aux événements Plausible. Plausible reçoit uniquement des interactions fonctionnelles à faible cardinalité : ouverture du radar, classe de portée (`near`, `regional` ou `wide`), mode observation/projection, horizon sélectionné, passage plein écran et succès/échec technique d’un recalcul local. Aucun nom de ville, coordonnée ou contenu radar n’est transmis à Plausible.

Le radar public RainViewer fournit des observations passées. MeteoCompare peut calculer **localement dans le navigateur** une extrapolation courte durée à partir du déplacement observé sur plusieurs images radar. Ce calcul ne transmet aucune donnée supplémentaire : il estime un mouvement dominant, affiche des zones probabilistes jusqu'à +60 minutes et augmente volontairement l'incertitude avec l'horizon. Il s'agit d'un nowcast d'extrapolation, pas d'une nouvelle donnée future fournie par RainViewer. La synthèse multi-modèles reste affichée séparément pour compléter cette lecture.
