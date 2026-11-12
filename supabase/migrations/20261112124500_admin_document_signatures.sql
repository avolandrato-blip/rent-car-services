create or replace function public.get_admin_reservation_document_signatures(
  p_reservation_id uuid
)
returns table (
  client_signature_data text,
  lessor_signature_data text
)
language sql
stable
security definer
set search_path to ''
as $function$
  select client_signature.signature_data, lessor_signature.signature_data
  from (select 1) as request
  left join public.reservation_client_signatures client_signature
    on client_signature.reservation_id = p_reservation_id
  left join public.admin_signature_settings lessor_signature
    on lessor_signature.id = 'lessor'
  where auth.uid() is not null
    and public.is_super_admin()
  limit 1;
$function$;

revoke all on function public.get_admin_reservation_document_signatures(uuid) from public, anon;
grant execute on function public.get_admin_reservation_document_signatures(uuid) to authenticated;
