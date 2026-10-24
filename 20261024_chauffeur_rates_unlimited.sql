ALTER TABLE public.chauffeurs
  DROP CONSTRAINT IF EXISTS chauffeurs_city_daily_rate_check,
  DROP CONSTRAINT IF EXISTS chauffeurs_city_24h_rate_check,
  DROP CONSTRAINT IF EXISTS chauffeurs_province_daily_rate_check,
  DROP CONSTRAINT IF EXISTS chauffeurs_delivery_rate_check,
  DROP CONSTRAINT IF EXISTS chauffeurs_recovery_rate_check;

ALTER TABLE public.chauffeurs
  ADD CONSTRAINT chauffeurs_city_daily_rate_min_check CHECK (city_daily_rate >= 20000),
  ADD CONSTRAINT chauffeurs_city_24h_rate_min_check CHECK (city_24h_rate >= 20000),
  ADD CONSTRAINT chauffeurs_province_daily_rate_min_check CHECK (province_daily_rate >= 20000),
  ADD CONSTRAINT chauffeurs_delivery_rate_min_check CHECK (delivery_rate >= 20000),
  ADD CONSTRAINT chauffeurs_recovery_rate_min_check CHECK (recovery_rate >= 20000);
