-- Retain reusable client signature images only until 24 hours after rental end.
-- Formal signed-contract records (public.contract_signatures) are intentionally untouched.

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.purge_expired_reservation_client_signatures()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_deleted bigint;
BEGIN
  DELETE FROM public.reservation_client_signatures AS signature
  USING public.reservations AS reservation
  WHERE reservation.id = signature.reservation_id
    AND reservation.end_at <= now() - interval '24 hours';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$;

REVOKE ALL ON FUNCTION public.purge_expired_reservation_client_signatures() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_reservation_client_signatures() TO service_role;

-- Re-save the public RPC with a strict retention-window check.
CREATE OR REPLACE FUNCTION public.save_public_reservation_signature(
  p_reservation_id uuid,
  p_reference text,
  p_phone text,
  p_signature_data text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_reservation_id uuid;
BEGIN
  IF p_signature_data IS NULL
     OR length(p_signature_data) > 500000
     OR p_signature_data !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$' THEN
    RETURN false;
  END IF;

  SELECT reservation.id INTO v_reservation_id
  FROM public.reservations AS reservation
  WHERE reservation.id = p_reservation_id
    AND reservation.reference = left(trim(coalesce(p_reference, '')), 100)
    AND regexp_replace(coalesce(reservation.customer_phone, ''), '[^0-9]', '', 'g') = regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')
    AND coalesce(reservation.invoice_released, false) = false
    AND now() < reservation.end_at + interval '24 hours'
  LIMIT 1;

  IF v_reservation_id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.reservation_client_signatures AS saved (reservation_id, signature_data)
  VALUES (v_reservation_id, p_signature_data)
  ON CONFLICT (reservation_id) DO UPDATE
    SET signature_data = EXCLUDED.signature_data,
        updated_at = now();

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_public_reservation_signature(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_public_reservation_signature(uuid, text, text, text) TO anon, authenticated;

-- Make deployment repeatable: replace only this named job.
DO $schedule$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'purge-expired-reservation-client-signatures'
  LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'purge-expired-reservation-client-signatures',
    '*/10 * * * *',
    'SELECT public.purge_expired_reservation_client_signatures();'
  );
END;
$schedule$;
