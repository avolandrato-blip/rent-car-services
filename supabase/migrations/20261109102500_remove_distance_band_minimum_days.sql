-- Remove minimum-duration enforcement from all distance bands above 30 km.
-- The daily rate remains authoritative; the reservation duration is billed as entered.
DO $migration$
DECLARE
  v_definition text;
  v_old text := $old$    v_minimum_days := case v_band when '30_100' then 2 when '100_200' then 3 else 4 end;
    v_band_rate := case v_band when '30_100' then coalesce(v_vehicle.price_30_100_per_day, 0) when '100_200' then coalesce(v_vehicle.price_100_200_per_day, 0) else coalesce(v_vehicle.price_over_200_per_day, 0) end;
    if v_days < v_minimum_days then v_quote_requested := true; v_quote_reason := format('Durée minimale : %s jour(s)', v_minimum_days);
    elsif v_band_rate <= 0 then$old$;
  v_new text := $new$    v_band_rate := case v_band when '30_100' then coalesce(v_vehicle.price_30_100_per_day, 0) when '100_200' then coalesce(v_vehicle.price_100_200_per_day, 0) else coalesce(v_vehicle.price_over_200_per_day, 0) end;
    if v_band_rate <= 0 then$new$;
BEGIN
  SELECT pg_get_functiondef('public.create_public_distance_reservation(jsonb)'::regprocedure)
  INTO v_definition;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Expected distance-band minimum rule was not found; no changes applied.';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);
END;
$migration$;
