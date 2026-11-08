CREATE TABLE IF NOT EXISTS public.reservation_client_signatures (
  reservation_id uuid PRIMARY KEY REFERENCES public.reservations(id) ON DELETE CASCADE,
  signature_data text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reservation_client_signatures_valid_png CHECK (
    length(signature_data) <= 500000
    AND signature_data ~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$'
  )
);

ALTER TABLE public.reservation_client_signatures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.reservation_client_signatures FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.reservation_client_signatures TO service_role;

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

  SELECT r.id INTO v_reservation_id
  FROM public.reservations r
  WHERE r.id = p_reservation_id
    AND r.reference = left(trim(coalesce(p_reference, '')), 100)
    AND regexp_replace(coalesce(r.customer_phone, ''), '[^0-9]', '', 'g') = regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')
    AND coalesce(r.invoice_released, false) = false
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
