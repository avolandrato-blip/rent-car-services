# Comptes prestataires — fonctionnement

## Créer un prestataire

1. Dans Supabase Dashboard → **Authentication → Users**, crée le compte du prestataire et transmets-lui ses propres identifiants de manière sécurisée. Le portail ne crée ni ne connaît son mot de passe.
2. Connecte-toi à `admin.html` avec l’un des comptes super-admin autorisés.
3. Ouvre **Comptes prestataires** et associe l’adresse e-mail existante. Renseigne son nom, ses coordonnées professionnelles et la date de fin d’accès.
4. La date est inclusive et calculée selon le fuseau **Indian/Antananarivo** : l’accès reste valable jusqu’à 23 h 59 ce jour-là.
5. Le prestataire se connecte avec son propre compte. Il peut gérer les véhicules qu’il ajoute et consulter/gérer les réservations de ces véhicules, avec les coordonnées nécessaires du client. Les données des autres prestataires et les fonctions globales du super-admin restent hors de sa portée.

## Véhicules et réservations

Lorsqu’un prestataire ajoute un véhicule, son identifiant Auth est enregistré comme propriétaire. Une date de fin de contrat est requise et ne peut pas dépasser la date de fin d’accès du compte. Le rattachement est également validé par Supabase RLS; l’interface seule ne constitue pas la protection.

Les réservations publiques passent par le RPC serveur `create_public_reservation`, qui recalcule les tarifs et valide le véhicule, les dates, le contrat, les trajets et la promotion. Le calendrier public n’expose que des créneaux occupés anonymisés. L’accès aux factures utilise `get_public_invoice_by_otp` et son contrôle des tentatives.

## Désactivation

Dans **Comptes prestataires**, le super-admin peut désactiver ou réactiver un profil. Pour modifier l’échéance ou les coordonnées professionnelles, soumets à nouveau le même e-mail avec les valeurs à jour. Désactiver le profil bloque les politiques RLS; la date d’accès limite aussi la connexion et les opérations côté base.

## Limite actuelle

Le compte Auth doit d’abord être créé dans le tableau de bord Supabase. L’interface admin ne crée pas d’utilisateur, n’envoie pas d’invitation et ne gère pas les mots de passe.
