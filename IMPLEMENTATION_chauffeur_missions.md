# Workflow des missions chauffeur

## Modifications préparées

- L’attribution d’une mission passe par la RPC `assign_chauffeur_mission`, qui vérifie le profil super-administrateur, le compte actif du chauffeur et la réservation confirmée. Elle conserve une fenêtre de mission de 24 heures maximum.
- Le chauffeur reçoit un message WhatsApp prérempli avec le client, son téléphone, l’adresse, les notes, la période, les montants payés/restants, son identifiant et les liens « accepter » / « refuser ». L’envoi reste manuel dans WhatsApp; le mot de passe n’est jamais placé dans le message.
- Chaque lien est confirmé sur une page dédiée. Seul le hash du jeton à usage unique est conservé en base; la mission prend le statut `accepted` ou `refused`.
- Après acceptation, le dashboard impose une checklist au départ puis au retour : rappels photo avant/arrière/côté/jante/tableau de bord, photo du client devant la voiture, carburant, argent restant et appréciation de conduite. Au départ, CIN/permis et leurs rappels photo sont également requis.
- Les photos ne sont pas téléversées ni stockées par l’application : le chauffeur les prend, les envoie séparément sur WhatsApp, puis coche les rappels correspondants. La base conserve uniquement les cases cochées.
- Pour une location longue, on conserve une seule réservation et une seule mission de livraison/récupération. L’échéancier quotidien crée une échéance par jour sur la réservation; le paiement administratif demande la date concernée et la base refuse une date non prévue ou un montant supérieur au solde de l’échéance.
- La règle historique qui permettait à tout utilisateur authentifié de gérer les fiches chauffeurs est remplacée par une règle super-administrateur. Les politiques ne sont pas ouvertes au public.

## Mise en production

Les migrations `20261110100000_chauffeur_mission_workflow.sql`, `20261110104000_restrict_due_trigger_execution.sql` et `20261110112000_checklist_photo_reminders_only.sql` ont été appliquées au projet Supabase lié. Elles ajoutent les colonnes/tables, RPC, politiques RLS, bucket privé, contrôles d’échéances, restrictions d’exécution et index.

Le dépôt est configuré pour publier depuis la branche `main` vers GitHub Pages : [site public](https://avolandrato-blip.github.io/rent-car-services/). Le cache du script d’administration est versionné dans `admin.html`.

Après publication, vérifier dans l’administration qu’un chauffeur actif avec compte et numéro WhatsApp apparaît; attribuer une réservation confirmée, ouvrir le lien WhatsApp puis envoyer le message. Tester accepter/refuser sur une mission de test, les checklists départ/retour, les cases de rappel photo sans téléversement et l’enregistrement d’un paiement avec sa date d’échéance.

## Vérifications

Les tests ciblés du workflow passent. Les 30 échecs de la suite historique ont été reproduits à l’identique sur le HEAD d’origine; les nouveaux tests ciblés sont sans échec.
