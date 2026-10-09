-- Set the open >200 km band to a four-billable-day minimum.
-- Existing public RPC currently uses the billable-day count for the minimum.
DO $migration$
DECLARE
  v_definition text;
  v_old text := 'v_minimum_days := case v_band when ''30_100'' then 2 when ''100_200'' then 3 else 5 end;';
  v_new text := 'v_minimum_days := case v_band when ''30_100'' then 2 when ''100_200'' then 3 else 4 end;';
BEGIN
  SELECT pg_get_functiondef('public.create_public_distance_reservation(jsonb)'::regprocedure)
  INTO v_definition;

  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Expected distance-band minimum rule was not found; no changes applied.';
  END IF;

  EXECUTE replace(v_definition, v_old, v_new);
END;
$migration$;
