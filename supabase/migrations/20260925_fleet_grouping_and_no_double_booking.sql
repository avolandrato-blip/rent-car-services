CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS fleet_group text;

ALTER TABLE public.vehicles
  ADD CONSTRAINT vehicles_fleet_group_nonempty
  CHECK (fleet_group IS NULL OR length(btrim(fleet_group)) > 0);

ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_no_vehicle_time_overlap
  EXCLUDE USING gist (
    vehicle_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  )
  WHERE (
    vehicle_id IS NOT NULL
    AND status IN ('pre_reserved', 'reserved')
  );

-- Security-definer view: it deliberately exposes only catalog-safe columns.
-- Grouped units in maintenance/inactive state remain visible only so the public
-- calendar can count total fleet capacity; direct table RLS remains unchanged.
CREATE VIEW public.public_fleet_vehicles
WITH (security_invoker = false, security_barrier = true)
AS
SELECT
  id,
  name,
  slug,
  description,
  price_per_day,
  transmission,
  fuel,
  seats,
  status,
  image_urls,
  make,
  model,
  price_12h,
  price_24h,
  driver_mode,
  driver_fee,
  extra_driver_fee,
  trip_rates,
  owner_phone,
  owner_whatsapp_enabled,
  contract_start_date,
  contract_end_date,
  fleet_group
FROM public.vehicles
WHERE status = 'available'
   OR (fleet_group IS NOT NULL AND status <> 'contract_ended');

REVOKE ALL ON public.public_fleet_vehicles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.public_fleet_vehicles TO anon, authenticated;
