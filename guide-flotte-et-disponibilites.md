# Flotte de véhicules et disponibilités — mode opératoire

## Principe retenu

Chaque voiture physique reste une fiche distincte dans Supabase. Le champ **Groupe de flotte** sert uniquement à les présenter et à les compter ensemble. Les réservations et les périodes de maintenance restent attachées à un véhicule précis.

## Ajouter plusieurs voitures semblables dans l’admin

1. Ouvrez l’admin et choisissez **Ajouter un véhicule**.
2. Créez une fiche pour chaque voiture physique. Donnez à chaque fiche un **nom unique**, par exemple `Kia Morning Automatique 1`, `Kia Morning Automatique 2` et `Kia Morning Automatique 3`. Chaque voiture peut garder sa propre immatriculation et ses propres photos.
3. Dans **Groupe de flotte**, entrez exactement le même texte sur toutes les fiches, par exemple `Kia Morning Automatique`.
4. Renseignez les mêmes paramètres pour les unités réellement équivalentes : mode avec/sans chauffeur, carburant, transmission, places, tarif 12 h, tarif 24 h éventuel, prix journalier, frais chauffeur et tarifs d’itinéraires.
5. Enregistrez chaque fiche. Le calendrier les regroupe si leurs conditions tarifaires et caractéristiques correspondent. Si elles divergent, le groupe est automatiquement séparé pour éviter d’annoncer une capacité ou un prix trompeur.

## Résultat attendu

- **Calendrier admin :** le filtre propose la flotte avec son nombre d’unités. Chaque tranche de 12 heures affiche le nombre libre / le total, par exemple `2/3 disponibles`. Vert signifie que toutes sont libres, jaune qu’une partie seulement est libre (ou qu’une unité est en maintenance), rouge que la flotte est complète.
- **Site client :** une seule carte est présentée pour la flotte, avec son nombre d’unités et sa disponibilité actuelle. Le vérificateur de dates indique le nombre disponible pour toute la période choisie.
- **Réservation client :** la personne choisit la flotte, pas une plaque. Au moment de l’envoi, le site affecte une unité physique disponible et conserve son identifiant dans la réservation.
- **Maintenance :** elle se saisit sur une voiture précise et retire cette unité du décompte pendant les périodes concernées.
- **Réservations :** les statuts `Pré-réservée` et `Réservée` bloquent les dates; une annulation libère l’unité. La base refuse aussi deux réservations actives qui se chevauchent pour la même voiture, y compris en cas de demandes simultanées.

## Avant / après

| Avant | Après |
|---|---|
| Le site et le calendrier listaient uniquement les voitures une par une. | Les fiches associées par un même groupe sont comptées ensemble. |
| Pas de compteur du stock restant sur une période. | Le calendrier admin et le vérificateur client affichent `disponibles / total`. |
| Les réservations client choisissaient un véhicule physique fixe, ce qui pouvait afficher une unité bloquée même si une autre équivalente était libre. | Le client choisit une flotte et l’application affecte une unité libre. |
| La validation côté navigateur pouvait être dépassée si deux clients soumettaient presque simultanément. | Une contrainte PostgreSQL bloque les chevauchements sur le même véhicule. |

## À savoir

- Il faut saisir le même nom de groupe pour réunir des voitures; aucune fusion automatique par modèle seul n’est faite.
- Les caractéristiques/prix doivent être identiques pour être comptées ensemble. Sinon, le système les sépare.
- Une flotte de trois voitures doit donc être enregistrée comme **trois fiches distinctes**, avec un nom de groupe commun et des noms individuels uniques.
