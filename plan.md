# Extension complète de l’espace partenaire

## Objectif
Aligner l’espace partenaire sur le dossier de réservation admin, avec des droits limités aux véhicules possédés ou aux réservations attribuées, et garantir l’absence de chevauchement côté base.

## Approche
1. Ajouter des RPC transactionnelles pour créer/modifier une réservation, enregistrer un paiement, gérer les documents et affecter un chauffeur.
2. Durcir les policies RLS des documents et limiter les actions partenaires aux réservations autorisées.
3. Ajouter dans l’espace partenaire les champs client/CIN/permis, paiements, facture/contrat, signature, restitution/dégradation et chauffeur.
4. Conserver les contrôles d’overlap serveur et les transitions de statut existantes.
5. Tester les flux partenaires, les fonctions SQL et les scénarios de concurrence sans écrire de données de test métier.

## Structure concernée
- `partner.html`, `partner-dashboard.js`, `partner-actions.js`: interface et appels sécurisés.
- `supabase/migrations/`: RPC, RLS et contraintes métier.
- `admin-identity-documents.js`, `admin-invoice-otp.js`, `admin-enhancements.js`, `team-admin.js`: comportements de référence.
