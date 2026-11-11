-- Permettre la signature après acceptation de la mission et conserver son indicateur
-- dans les notes déjà visibles par le chauffeur (la signature PNG reste privée).
create or replace function public.save_chauffeur_reservation_signature(
  p_mission_id uuid,
  p_signature_data text,
  p_signer_name text,
  p_signer_phone text
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_reservation_id uuid;
begin
  if auth.uid() is null
     or p_signature_data is null
     or length(p_signature_data) > 500000
     or p_signature_data !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$' then
    return false;
  end if;

  select m.reservation_id into v_reservation_id
  from public.chauffeur_missions m
  join public.chauffeurs c on c.id = m.chauffeur_id
  where m.id = p_mission_id
    and c.auth_user_id = auth.uid()
    and m.status in ('assigned', 'accepted', 'in_progress')
    and m.expires_at >= now()
  limit 1;

  if v_reservation_id is null then
    return false;
  end if;

  insert into public.reservation_client_signatures as saved (reservation_id, signature_data)
  values (v_reservation_id, p_signature_data)
  on conflict (reservation_id) do update
    set signature_data = excluded.signature_data,
        updated_at = now();

  update public.chauffeur_missions
  set notes = left(
        coalesce(notes, '')
        || case when coalesce(notes, '') = '' then '' else E'\n' end
        || 'Signature client : '
        || left(trim(coalesce(p_signer_name, '')), 120)
        || ' — '
        || left(trim(coalesce(p_signer_phone, '')), 40),
        2000
      ),
      updated_at = now()
  where id = p_mission_id;

  return true;
end;
$function$;

revoke all on function public.save_chauffeur_reservation_signature(uuid,text,text,text) from public, anon;
grant execute on function public.save_chauffeur_reservation_signature(uuid,text,text,text) to authenticated;
