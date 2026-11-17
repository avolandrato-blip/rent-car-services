-- Évite qu’une réservation partenaire active chevauche une autre réservation
-- ou une période de maintenance du même véhicule, y compris en cas d’écritures simultanées.
CREATE OR REPLACE FUNCTION public.prevent_partner_vehicle_schedule_overlap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $function$
BEGIN
  IF NEW.vehicle_id IS NULL OR NEW.status = 'cancelled' OR NEW.end_at <= now() THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(NEW.vehicle_id::text), 0);

  IF EXISTS (
    SELECT 1 FROM public.reservations r
    WHERE r.vehicle_id = NEW.vehicle_id
      AND r.id IS DISTINCT FROM NEW.id
      AND r.status <> 'cancelled'
      AND tstzrange(r.start_at, r.end_at, '[)') && tstzrange(NEW.start_at, NEW.end_at, '[)')
  ) THEN
    RAISE EXCEPTION 'La période chevauche une autre réservation active.' USING ERRCODE = '23P01';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.maintenance m
    WHERE m.vehicle_id = NEW.vehicle_id
      AND tstzrange(m.start_at, m.end_at, '[)') && tstzrange(NEW.start_at, NEW.end_at, '[)')
  ) THEN
    RAISE EXCEPTION 'La période chevauche une indisponibilité du véhicule.' USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS reservations_prevent_schedule_overlap ON public.reservations;
CREATE TRIGGER reservations_prevent_schedule_overlap
BEFORE INSERT OR UPDATE OF vehicle_id, start_at, end_at, status
ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.prevent_partner_vehicle_schedule_overlap();

CREATE OR REPLACE FUNCTION public.prevent_maintenance_vehicle_schedule_overlap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $function$
BEGIN
  IF NEW.vehicle_id IS NULL OR NEW.end_at <= now() THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(NEW.vehicle_id::text), 0);
  IF EXISTS (
    SELECT 1 FROM public.reservations r
    WHERE r.vehicle_id = NEW.vehicle_id AND r.status <> 'cancelled'
      AND tstzrange(r.start_at, r.end_at, '[)') && tstzrange(NEW.start_at, NEW.end_at, '[)')
  ) THEN
    RAISE EXCEPTION 'La période chevauche une réservation active.' USING ERRCODE = '23P01';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.maintenance m
    WHERE m.vehicle_id = NEW.vehicle_id AND m.id IS DISTINCT FROM NEW.id
      AND tstzrange(m.start_at, m.end_at, '[)') && tstzrange(NEW.start_at, NEW.end_at, '[)')
  ) THEN
    RAISE EXCEPTION 'La période chevauche une autre indisponibilité.' USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS maintenance_prevent_schedule_overlap ON public.maintenance;
CREATE TRIGGER maintenance_prevent_schedule_overlap
BEFORE INSERT OR UPDATE OF vehicle_id, start_at, end_at
ON public.maintenance
FOR EACH ROW EXECUTE FUNCTION public.prevent_maintenance_vehicle_schedule_overlap();
