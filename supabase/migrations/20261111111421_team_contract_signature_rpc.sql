-- Le chauffeur doit pouvoir générer le contrat de sa mission sans accès direct
-- aux tables privées contenant les signatures du client et du loueur.
create or replace function public.get_chauffeur_mission_contract_signatures(
  p_mission_id uuid
)
returns table (
  client_signature_data text,
  lessor_signature_data text
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if auth.uid() is null then
    return;
  end if;

  return query
  select client_signature.signature_data, lessor_signature.signature_data
  from public.chauffeur_missions mission
  join public.chauffeurs chauffeur on chauffeur.id = mission.chauffeur_id
  left join public.reservation_client_signatures client_signature
    on client_signature.reservation_id = mission.reservation_id
  left join public.admin_signature_settings lessor_signature
    on lessor_signature.id = 'lessor'
  where mission.id = p_mission_id
    and chauffeur.auth_user_id = auth.uid()
    and mission.status in ('assigned', 'accepted', 'in_progress')
    and mission.expires_at >= now()
  limit 1;
end;
$function$;

revoke all on function public.get_chauffeur_mission_contract_signatures(uuid) from public, anon;
grant execute on function public.get_chauffeur_mission_contract_signatures(uuid) to authenticated;
