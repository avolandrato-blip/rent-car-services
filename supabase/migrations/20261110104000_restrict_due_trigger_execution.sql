-- Durcissement post-déploiement du workflow chauffeur.
-- Le trigger reste exécutable par PostgreSQL, mais n'est pas une RPC destinée aux clients.
revoke all on function public.validate_reservation_daily_due_payment() from public, anon, authenticated;

-- Index des nouvelles clés étrangères signalées par le conseiller de performance.
create index if not exists chauffeur_mission_checklists_submitted_by_idx
  on public.chauffeur_mission_checklists(submitted_by);
create index if not exists chauffeur_missions_responded_by_idx
  on public.chauffeur_missions(responded_by)
  where responded_by is not null;
