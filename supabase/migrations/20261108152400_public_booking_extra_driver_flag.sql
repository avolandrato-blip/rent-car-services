DO $migration$
DECLARE
  v_definition text;
  v_updated text;
  v_old_declaration text := 'v_with_driver boolean;';
  v_new_declaration text := 'v_with_driver boolean;' || E'\n  v_extra_driver_requested boolean;';
  v_old_assignment text := 'v_with_driver := coalesce((p_payload->>''with_driver'')::boolean, false);';
  v_new_assignment text := 'v_with_driver := coalesce((p_payload->>''with_driver'')::boolean, false);' || E'\n  v_extra_driver_requested := coalesce((p_payload->>''extra_driver_requested'')::boolean, v_with_driver);';
  v_old_vehicle_driver text := 'v_vehicle.driver_mode = ''with_driver'' and v_with_driver';
  v_new_vehicle_driver text := 'v_vehicle.driver_mode = ''with_driver'' and v_extra_driver_requested';
  v_old_optional_driver text := 'v_vehicle.driver_mode <> ''with_driver'' and v_with_driver';
  v_new_optional_driver text := 'v_vehicle.driver_mode <> ''with_driver'' and v_extra_driver_requested';
BEGIN
  SELECT pg_get_functiondef('public.create_public_distance_reservation(jsonb)'::regprocedure)
  INTO v_definition;

  IF position(v_old_declaration IN v_definition) = 0
     OR position(v_old_assignment IN v_definition) = 0
     OR position(v_old_vehicle_driver IN v_definition) = 0
     OR position(v_old_optional_driver IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Expected public booking chauffeur rules were not found; no changes applied.';
  END IF;

  v_updated := replace(v_definition, v_old_declaration, v_new_declaration);
  v_updated := replace(v_updated, v_old_assignment, v_new_assignment);
  v_updated := replace(v_updated, v_old_vehicle_driver, v_new_vehicle_driver);
  v_updated := replace(v_updated, v_old_optional_driver, v_new_optional_driver);
  EXECUTE v_updated;
END;
$migration$;
