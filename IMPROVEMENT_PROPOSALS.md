# Propositions d’amélioration — MeteoCompare Web

Ces idées sont classées par valeur d’usage et tiennent compte du fait que l’application doit rester déployable comme site statique/PWA sur GitHub Pages.

## Priorité haute

### 1. Barre de contexte ville plus compacte
Regrouper ville, fraîcheur des données, modèles actifs, fuseau et action d’actualisation météo dans une seule barre sticky. Cela libérerait de la hauteur et donnerait un point de repère constant pendant la lecture des tableaux.

### 2. En-têtes et première colonne figés dans les grands tableaux
Conserver le nom du modèle et les dates/heures visibles pendant les scrolls horizontal et vertical. Ajouter une ombre de bord discrète quand une partie du tableau est masquée.

### 3. Mode comparaison ciblée
Permettre de sélectionner temporairement 2 à 4 modèles depuis un tableau pour afficher un graphe de comparaison directe sans modifier la liste globale des modèles actifs.

### 4. Analyse du désaccord par variable
Depuis « Pourquoi cet accord ? », ouvrir un panneau indiquant quelle variable dégrade le score à chaque échéance : température, pluie, vent ou condition. L’utilisateur verrait immédiatement la cause d’une zone rouge/ambre.

### 5. Fraîcheur des runs
Afficher pour chaque modèle l’âge du run/donnée utilisée lorsque l’API le permet, avec un signal clair si un modèle est sensiblement plus ancien que les autres. Cela évite d’interpréter un désaccord dû uniquement à des cycles différents comme un vrai désaccord physique.

## Priorité moyenne

### 6. URLs partageables avec état de vue
Encoder dans l’URL la variable, le mode horaire/journalier, l’horizon du graphe et éventuellement les modèles sélectionnés. Un lien partagé rouvrirait exactement la même analyse.

### 7. Export CSV/JSON
Ajouter un export local des données comparées, de l’accord et du biais. Très utile pour l’analyse externe sans ajouter de backend.

### 8. Comparaison de villes
Créer une vue optionnelle permettant de comparer 2 ou 3 villes sur les mêmes indicateurs : température médiane, pluie, vent et accord global.

### 9. État hors-ligne et données périmées plus visible
Quand la PWA affiche un cache, montrer l’âge exact des données dans la barre de contexte et différencier clairement « hors ligne », « cache encore récent » et « cache ancien ».

### 10. Gestion plus intelligente de l’historique de biais
Dans Paramètres, afficher avant lancement une estimation du coût : nombre de modèles, jours manquants et appels prévus. Ne récupérer que les jours réellement absents et proposer une mise à jour uniquement lorsque l’historique est suffisamment ancien.

## Finition visuelle

- réduire encore le nombre de cartes encadrées : certaines sections peuvent devenir de simples groupes séparés par l’espace et la typographie ;
- utiliser une échelle typographique plus contrastée entre titre de page, titre de section, métadonnée et valeur ;
- unifier les icônes SVG et supprimer les derniers emoji fonctionnels hors données météo ;
- harmoniser les couleurs d’accord entre TodaySummary, bande horaire, tableaux et page de fiabilité ;
- ajouter des transitions très courtes uniquement sur les changements d’état, jamais sur le scroll ou la géométrie des tableaux ;
- prévoir un mode « densité compacte » pour les utilisateurs qui veulent afficher davantage de modèles simultanément.
