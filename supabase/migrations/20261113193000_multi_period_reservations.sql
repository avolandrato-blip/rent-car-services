-- Réservations client composées de plusieurs périodes indépendantes.
-- Toutes les lignes d'un même envoi partagent un groupe et sont créées
-- dans une seule transaction via la RPC ci-dessous.
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS booking_group_id uuid,
  ADD COLUMN IF NOT EXISTS booking_group_reference text;

CREATE INDEX IF NOT EXISTS reservations_booking_group_id_idx
  ON public.reservations (booking_group_id);

CREATE INDEX IF NOT EXISTS reservations_booking_group_reference_idx
  ON public.reservations (booking_group_reference);

CREATE OR REPLACE FUNCTION public.create_public_multi_period_reservation(p_payload jsonb)
RETURNS TABLE(group_id uuid, group_reference text, reservation_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_group_id uuid := gen_random_uuid();
  v_group_reference text;
  v_segment jsonb;
  v_index integer := 0;
  v_result record;
  v_ids uuid[] := '{}';
  v_segments jsonb := p_payload->'segments';
  v_segment_payload jsonb;
begin
  if jsonb_typeof(v_segments) <> 'array' or jsonb_array_length(v_segments) < 2 then
    raise exception 'At least two reservation periods are required';
  end if;
  if jsonb_array_length(v_segments) > 20 then
    raise exception 'Too many reservation periods';
  end if;

  -- La RPC historique recalcule chaque prix côté serveur. Les périodes sont
  -- appelées dans la même transaction : un conflit annule tout l'envoi.
  for v_segment in select value from jsonb_array_elements(v_segments)
  loop
    v_index := v_index + 1;
    v_segment_payload := (p_payload - 'segments')
      || jsonb_build_object(
        'start_at', v_segment->>'start_at',
        'end_at', v_segment->>'end_at',
        -- Les frais d'entrée/sortie et l'acompte sont affectés au premier
        -- segment pour éviter de les compter plusieurs fois.
        'delivery_requested', case when v_index = 1 then coalesce((p_payload->>'delivery_requested')::boolean, false) else false end,
        'recovery_requested', case when v_index = 1 then coalesce((p_payload->>'recovery_requested')::boolean, false) else false end,
        'deposit_amount', case when v_index = 1 then coalesce((p_payload->>'deposit_amount')::numeric, 0) else 0 end,
        'promo_code', case when v_index = 1 then nullif(p_payload->>'promo_code','') else null end,
        'promo_discount', case when v_index = 1 then coalesce((p_payload->>'promo_discount')::numeric, 0) else 0 end
      );
    -- Le client fournit un total par période ; la RPC vérifie le montant réel.
    v_segment_payload := v_segment_payload || jsonb_build_object(
      'total_amount', coalesce((v_segment->>'total_amount')::numeric, (v_segment_payload->>'total_amount')::numeric)
    );
    select * into v_result
      from public.create_public_distance_reservation(v_segment_payload);
    if v_group_reference is null then
      -- La première référence reste compatible avec le parcours facture/OTP
      -- existant ; les autres périodes sont rattachées à cette référence.
      v_group_reference := v_result.reference;
    end if;
    v_ids := array_append(v_ids, v_result.id);
    update public.reservations
      set booking_group_id = v_group_id,
          booking_group_reference = v_group_reference,
          notes = concat_ws(E'\n', nullif(notes, ''), 'Groupe de réservation : ' || v_group_reference)
      where id = v_result.id;
  end loop;

  return query select v_group_id, v_group_reference, v_ids;
end;
$function$;

REVOKE ALL ON FUNCTION public.create_public_multi_period_reservation(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_multi_period_reservation(jsonb) TO anon, authenticated;
