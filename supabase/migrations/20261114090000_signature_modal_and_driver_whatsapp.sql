create or replace function public.save_admin_reservation_signature(
  p_reservation_id uuid,
  p_signature_data text,
  p_signer_name text,
  p_signer_phone text
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not exists (select 1 from public.account_profiles p where p.user_id = auth.uid() and p.role = 'super_admin' and p.is_active = true) then return false; end if;
  if p_signature_data is null or length(p_signature_data) > 500000 or p_signature_data !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$' then return false; end if;
  if not exists (select 1 from public.reservations r where r.id = p_reservation_id) then return false; end if;
  insert into public.reservation_client_signatures as saved (reservation_id, signature_data)
  values (p_reservation_id, p_signature_data)
  on conflict (reservation_id) do update set signature_data = excluded.signature_data, updated_at = now();
  return true;
end;
$function$;
revoke all on function public.save_admin_reservation_signature(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.save_admin_reservation_signature(uuid,text,text,text) to authenticated;

create or replace function public.create_chauffeur_customer_signature_link(p_mission_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare v jsonb; v_otp text;
begin
  select jsonb_build_object('reference', r.reference, 'phone', r.customer_phone, 'whatsapp_phone', coalesce(r.whatsapp_phone, r.customer_phone), 'invoice_released', r.invoice_released, 'deposit_amount', r.deposit_amount)
    into v
    from public.chauffeur_missions m join public.chauffeurs c on c.id=m.chauffeur_id join public.reservations r on r.id=m.reservation_id
   where m.id=p_mission_id and c.auth_user_id=auth.uid() and m.status in ('assigned','accepted','in_progress') limit 1;
  if v is null or coalesce((v->>'invoice_released')::boolean,false) is not true or coalesce((v->>'deposit_amount')::numeric,0) <= 0 then return jsonb_build_object('ok',false,'error','Le lien client sera disponible après validation de l’acompte.'); end if;
  v_otp := lpad((floor(random()*900000)+100000)::int::text, 6, '0');
  update public.reservations r set otp_code=v_otp where r.reference=v->>'reference';
  return v || jsonb_build_object('ok',true,'otp',v_otp);
end;
$function$;
revoke all on function public.create_chauffeur_customer_signature_link(uuid) from public, anon;
grant execute on function public.create_chauffeur_customer_signature_link(uuid) to authenticated;
