-- Les photos de mission sont envoyées séparément par WhatsApp.
-- L'application ne téléverse ni ne conserve de fichier photo : seules les cases sont enregistrées.

drop policy if exists chauffeur_mission_checklists_driver_write on public.chauffeur_mission_checklists;
create policy chauffeur_mission_checklists_driver_write on public.chauffeur_mission_checklists
  for all to authenticated
  using (
    submitted_by = (select auth.uid())
    and exists (
      select 1
      from public.chauffeur_missions m
      join public.chauffeurs c on c.id = m.chauffeur_id
      where m.id = chauffeur_mission_checklists.mission_id
        and c.auth_user_id = (select auth.uid())
        and ((phase = 'departure' and m.status = 'accepted')
          or (phase = 'return' and m.status = 'in_progress'))
    )
  )
  with check (
    submitted_by = (select auth.uid())
    and checklist->>'fuel_percent' ~ '^(100|[0-9]{1,2})$'
    and checklist->>'cash_remaining' ~ '^[0-9]+(\.[0-9]+)?$'
    and checklist->>'driver_behavior' in ('happy','neutral','dangerous')
    and (
      (phase = 'departure'
       and checklist->>'cin_seen' = 'true'
       and checklist->>'license_seen' = 'true'
       and (checklist->'photo_checks') ?& array['front','rear','side','wheel','dashboard','client','cin','license'])
      or
      (phase = 'return'
       and (checklist->'photo_checks') ?& array['front','rear','side','wheel','dashboard','client'])
    )
    and photos = '{}'::jsonb
    and exists (
      select 1
      from public.chauffeur_missions m
      join public.chauffeurs c on c.id = m.chauffeur_id
      where m.id = chauffeur_mission_checklists.mission_id
        and c.auth_user_id = (select auth.uid())
        and ((phase = 'departure' and m.status = 'accepted')
          or (phase = 'return' and m.status = 'in_progress'))
    )
  );

-- Les anciennes politiques de stockage ne servent plus au workflow chauffeur.
-- Le bucket existant n'est pas supprimé afin de ne pas effacer rétrospectivement des données.
drop policy if exists chauffeur_mission_evidence_driver_upload on storage.objects;
drop policy if exists chauffeur_mission_evidence_private_read on storage.objects;
drop policy if exists chauffeur_mission_evidence_driver_update on storage.objects;
