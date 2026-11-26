# Extension espace partenaire

- [ ] Le partenaire peut créer et modifier une réservation avec client, adresse, CIN, permis, trajet, options, acompte et notes.
- [ ] Les réservations des mêmes véhicules restent visibles dans les deux interfaces et tout chevauchement est refusé côté serveur.
- [ ] Le partenaire peut consulter et enregistrer les paiements autorisés, sans modifier directement un montant métier non validé.
- [ ] Le partenaire peut générer facture et contrat, et envoyer le lien sécurisé de signature client.
- [ ] Le partenaire peut enregistrer une fiche de restitution ou de dégradation signée avec état, photos et montant dû.
- [ ] Le partenaire peut affecter une livraison/récupération à un chauffeur disponible et suivre la mission.
- [ ] Les documents et données sensibles restent cloisonnés par réservation, propriétaire ou attribution.
- [ ] Les tests ciblés et les tests SQL/RLS disponibles passent.

## Édition client depuis une réservation
- [x] Depuis une réservation, l’administratrice peut modifier le nom, téléphone, WhatsApp, e-mail, adresse, CIN et ses détails de délivrance, ainsi que le permis et ses dates; les changements sont enregistrés sur les périodes actives liées et sur la fiche client associée lorsqu’elle existe.
