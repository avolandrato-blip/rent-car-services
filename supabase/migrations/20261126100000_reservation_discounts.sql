ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS manual_discount_type text NOT NULL DEFAULT 'amount',
  ADD COLUMN IF NOT EXISTS manual_discount_value numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_discount_amount numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.reservations
  DROP CONSTRAINT IF EXISTS reservations_manual_discount_type_check,
  ADD CONSTRAINT reservations_manual_discount_type_check
    CHECK (manual_discount_type IN ('amount', 'percent')),
  DROP CONSTRAINT IF EXISTS reservations_manual_discount_nonnegative_check,
  ADD CONSTRAINT reservations_manual_discount_nonnegative_check
    CHECK (manual_discount_value >= 0 AND manual_discount_amount >= 0);

CREATE OR REPLACE FUNCTION public.apply_reservation_discount(
  p_reservation_id uuid,
  p_discount_type text,
  p_discount_value numeric
)
RETURNS TABLE(total_amount numeric, manual_discount_amount numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_row public.reservations%rowtype;
  v_paid numeric := 0;
  v_basis numeric;
  v_discount numeric;
  v_total numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin()
     AND NOT public.partner_can_manage_reservation(p_reservation_id) THEN
    RAISE EXCEPTION 'Accès réservé au partenaire autorisé ou au super-administrateur.' USING ERRCODE='42501';
  END IF;
  IF p_discount_type IS NULL OR p_discount_type NOT IN ('amount', 'percent') OR p_discount_value IS NULL OR p_discount_value < 0
     OR (p_discount_type = 'percent' AND p_discount_value > 100) THEN
    RAISE EXCEPTION 'Remise invalide : choisissez un montant positif ou un pourcentage entre 0 et 100.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_row FROM public.reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Réservation introuvable.' USING ERRCODE='P0002'; END IF;
  SELECT greatest(coalesce(v_row.deposit_amount,0),coalesce(sum(p.amount),0))
    INTO v_paid FROM public.payments p WHERE p.reservation_id=p_reservation_id;

  -- Le montant actuel, augmenté de l’ancienne remise manuelle, constitue la base
  -- disponible après les éventuels codes promotionnels existants.
  v_basis := greatest(0, coalesce(v_row.total_amount,0) + coalesce(v_row.manual_discount_amount,0));
  v_discount := CASE WHEN p_discount_type='percent'
    THEN round(v_basis * p_discount_value / 100, 0)
    ELSE round(p_discount_value, 0) END;
  IF v_discount > v_basis THEN
    RAISE EXCEPTION 'La remise ne peut pas dépasser le montant restant avant remise.' USING ERRCODE='22023';
  END IF;
  v_total := greatest(0, v_basis-v_discount);
  IF v_paid > v_total THEN
    RAISE EXCEPTION 'La remise ferait passer le total sous les paiements déjà enregistrés.' USING ERRCODE='22023';
  END IF;

  UPDATE public.reservations
    SET total_amount=v_total,
        manual_discount_type=p_discount_type,
        manual_discount_value=p_discount_value,
        manual_discount_amount=v_discount,
        updated_at=now()
    WHERE id=p_reservation_id;
  RETURN QUERY SELECT v_total, v_discount;
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_reservation_discount(uuid,text,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_reservation_discount(uuid,text,numeric) TO authenticated;

-- Keep the manual discount when a partner changes the period or options through
-- partner_update_reservation(), which recalculates total_amount server-side.
CREATE OR REPLACE FUNCTION public.preserve_reservation_manual_discount()
RETURNS trigger
LANGUAGE plpgsql SET search_path TO ''
AS $function$
DECLARE
  v_paid numeric := 0;
  v_discount numeric := 0;
  v_base numeric;
BEGIN
  IF NEW.total_amount IS DISTINCT FROM OLD.total_amount
     AND NEW.manual_discount_type IS NOT DISTINCT FROM OLD.manual_discount_type
     AND NEW.manual_discount_value IS NOT DISTINCT FROM OLD.manual_discount_value
     AND NEW.manual_discount_amount IS NOT DISTINCT FROM OLD.manual_discount_amount
     AND coalesce(NEW.manual_discount_value,0) > 0 THEN
    v_base := greatest(0,coalesce(NEW.total_amount,0));
    v_discount := CASE WHEN NEW.manual_discount_type='percent'
      THEN round(v_base*NEW.manual_discount_value/100,0)
      ELSE least(v_base,NEW.manual_discount_value) END;
    SELECT greatest(coalesce(OLD.deposit_amount,0),coalesce(sum(p.amount),0))
      INTO v_paid FROM public.payments p WHERE p.reservation_id=OLD.id;
    IF v_paid > v_base-v_discount THEN
      RAISE EXCEPTION 'La nouvelle période ferait passer le total sous les montants déjà enregistrés.' USING ERRCODE='22023';
    END IF;
    NEW.manual_discount_amount := v_discount;
    NEW.total_amount := v_base-v_discount;
    NEW.deposit_amount := v_paid;
    NEW.payment_status := CASE WHEN v_paid<=0 THEN 'pending'::public.payment_status
      WHEN v_paid>=NEW.total_amount AND NEW.total_amount>0 THEN 'paid'::public.payment_status
      ELSE 'partial'::public.payment_status END;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS reservations_preserve_manual_discount ON public.reservations;
CREATE TRIGGER reservations_preserve_manual_discount
  BEFORE UPDATE OF total_amount ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.preserve_reservation_manual_discount();
