-- Secure partner workflow: one server-side boundary for reservation and payment writes.
CREATE OR REPLACE FUNCTION public.partner_can_manage_reservation(p_reservation_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND public.has_active_partner_access()
    AND EXISTS (
      SELECT 1
      FROM public.reservations r
      JOIN public.vehicles v ON v.id = r.vehicle_id
      WHERE r.id = p_reservation_id
        AND (v.owner_user_id = auth.uid() OR r.partner_user_id = auth.uid())
    );
$function$;
REVOKE ALL ON FUNCTION public.partner_can_manage_reservation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_can_manage_reservation(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.partner_create_reservation(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_id uuid;
  v_vehicle_id uuid := nullif(p_payload->>'vehicle_id','')::uuid;
  v_start timestamptz := nullif(p_payload->>'start_at','')::timestamptz;
  v_end timestamptz := nullif(p_payload->>'end_at','')::timestamptz;
  v_total numeric := coalesce(nullif(p_payload->>'total_amount','')::numeric,0);
  v_deposit numeric := coalesce(nullif(p_payload->>'deposit_amount','')::numeric,0);
  v_status public.reservation_status := coalesce(nullif(p_payload->>'status','')::public.reservation_status,'reserved');
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_active_partner_access() THEN
    RAISE EXCEPTION 'Session partenaire active requise.' USING ERRCODE='42501';
  END IF;
  IF v_vehicle_id IS NULL OR v_start IS NULL OR v_end IS NULL OR v_end <= v_start
     OR v_total < 0 OR v_deposit < 0 OR v_deposit > v_total
     OR v_status NOT IN ('pre_reserved','reserved') THEN
    RAISE EXCEPTION 'Données de réservation invalides.' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id=v_vehicle_id AND v.owner_user_id=auth.uid()
      AND public.reservation_vehicle_contract_covers(v_vehicle_id,v_end)
  ) THEN
    RAISE EXCEPTION 'Cette voiture ne vous est pas attribuée ou son contrat ne couvre pas la période.' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.reservations (
    reference, vehicle_id, customer_id, customer_name, customer_phone, whatsapp_phone,
    customer_email, customer_address, customer_license, customer_cin,
    start_at, end_at, with_driver, rental_type, daily_rate, rate_12h, rate_24h,
    days, total_amount, deposit_amount, payment_status, payment_method,
    trip_from, trip_to, delivery_fee, recovery_fee, chauffeur_fee, extra_fees,
    notes, status, partner_user_id, created_at, updated_at
  ) VALUES (
    coalesce(nullif(p_payload->>'reference',''), 'RCS-P-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
    v_vehicle_id, nullif(p_payload->>'customer_id','')::uuid,
    nullif(btrim(p_payload->>'customer_name'),''), nullif(btrim(p_payload->>'customer_phone'),''),
    nullif(btrim(p_payload->>'whatsapp_phone'),''), nullif(btrim(p_payload->>'customer_email'),''),
    nullif(btrim(p_payload->>'customer_address'),''), nullif(btrim(p_payload->>'customer_license'),''),
    nullif(btrim(p_payload->>'customer_cin'),''), v_start, v_end,
    coalesce((p_payload->>'with_driver')::boolean,false), nullif(p_payload->>'rental_type',''),
    coalesce(nullif(p_payload->>'daily_rate','')::numeric,0), nullif(p_payload->>'rate_12h','')::numeric,
    nullif(p_payload->>'rate_24h','')::numeric, greatest(1,coalesce(nullif(p_payload->>'days','')::integer,ceil(extract(epoch from (v_end-v_start))/86400)::integer)),
    v_total, v_deposit, CASE WHEN v_deposit >= v_total AND v_total > 0 THEN 'paid'::public.payment_status WHEN v_deposit > 0 THEN 'partial'::public.payment_status ELSE 'pending'::public.payment_status END,
    nullif(p_payload->>'payment_method',''), nullif(p_payload->>'trip_from',''), nullif(p_payload->>'trip_to',''),
    coalesce(nullif(p_payload->>'delivery_fee','')::numeric,0), coalesce(nullif(p_payload->>'recovery_fee','')::numeric,0),
    coalesce(nullif(p_payload->>'chauffeur_fee','')::numeric,0), coalesce(nullif(p_payload->>'extra_fees','')::numeric,0),
    nullif(p_payload->>'notes',''), v_status, auth.uid(), now(), now()
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.partner_create_reservation(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_create_reservation(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.partner_update_reservation(p_reservation_id uuid, p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_old public.reservations;
  v_start timestamptz := nullif(p_payload->>'start_at','')::timestamptz;
  v_end timestamptz := nullif(p_payload->>'end_at','')::timestamptz;
  v_total numeric := coalesce(nullif(p_payload->>'total_amount','')::numeric,0);
  v_deposit numeric := coalesce(nullif(p_payload->>'deposit_amount','')::numeric,0);
  v_status public.reservation_status;
BEGIN
  IF NOT public.partner_can_manage_reservation(p_reservation_id) THEN RAISE EXCEPTION 'Réservation non accessible avec ce compte.' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_old FROM public.reservations WHERE id=p_reservation_id FOR UPDATE;
  IF v_start IS NULL OR v_end IS NULL OR v_end <= v_start OR v_total < 0 OR v_deposit < 0 OR v_deposit > v_total THEN RAISE EXCEPTION 'Données de réservation invalides.' USING ERRCODE='22023'; END IF;
  v_status := coalesce(nullif(p_payload->>'status','')::public.reservation_status,v_old.status);
  IF v_status NOT IN ('pre_reserved','reserved','cancelled','completed') THEN RAISE EXCEPTION 'Transition de statut non autorisée.' USING ERRCODE='22023'; END IF;
  IF (v_status <> v_old.status) AND NOT ((v_old.status='pre_reserved' AND v_status IN ('reserved','cancelled')) OR (v_old.status='reserved' AND v_status IN ('cancelled','completed')) OR (v_status=v_old.status)) THEN RAISE EXCEPTION 'Transition de statut non autorisée.' USING ERRCODE='22023'; END IF;
  IF nullif(p_payload->>'vehicle_id','')::uuid IS DISTINCT FROM v_old.vehicle_id THEN RAISE EXCEPTION 'Le véhicule ne peut pas être changé depuis cet écran.' USING ERRCODE='22023'; END IF;
  IF NOT public.reservation_vehicle_contract_covers(v_old.vehicle_id,v_end) THEN RAISE EXCEPTION 'Le contrat de la voiture ne couvre pas la nouvelle période.' USING ERRCODE='22023'; END IF;
  UPDATE public.reservations SET
    customer_name=nullif(btrim(p_payload->>'customer_name'),''), customer_phone=nullif(btrim(p_payload->>'customer_phone'),''), whatsapp_phone=nullif(btrim(p_payload->>'whatsapp_phone'),''), customer_email=nullif(btrim(p_payload->>'customer_email'),''), customer_address=nullif(btrim(p_payload->>'customer_address'),''), customer_license=nullif(btrim(p_payload->>'customer_license'),''), customer_cin=nullif(btrim(p_payload->>'customer_cin'),''), start_at=v_start, end_at=v_end, with_driver=coalesce((p_payload->>'with_driver')::boolean,v_old.with_driver), rental_type=coalesce(nullif(p_payload->>'rental_type',''),v_old.rental_type), daily_rate=coalesce(nullif(p_payload->>'daily_rate','')::numeric,v_old.daily_rate), rate_12h=nullif(p_payload->>'rate_12h','')::numeric, rate_24h=nullif(p_payload->>'rate_24h','')::numeric, days=greatest(1,coalesce(nullif(p_payload->>'days','')::integer,v_old.days)), total_amount=v_total, deposit_amount=v_deposit, payment_status=CASE WHEN v_deposit >= v_total AND v_total > 0 THEN 'paid'::public.payment_status WHEN v_deposit > 0 THEN 'partial'::public.payment_status ELSE 'pending'::public.payment_status END, payment_method=nullif(p_payload->>'payment_method',''), trip_from=nullif(p_payload->>'trip_from',''), trip_to=nullif(p_payload->>'trip_to',''), delivery_fee=coalesce(nullif(p_payload->>'delivery_fee','')::numeric,0), recovery_fee=coalesce(nullif(p_payload->>'recovery_fee','')::numeric,0), chauffeur_fee=coalesce(nullif(p_payload->>'chauffeur_fee','')::numeric,0), extra_fees=coalesce(nullif(p_payload->>'extra_fees','')::numeric,0), notes=nullif(p_payload->>'notes',''), status=v_status, updated_at=now()
  WHERE id=p_reservation_id;
  RETURN p_reservation_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.partner_update_reservation(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_update_reservation(uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.partner_add_payment(p_reservation_id uuid, p_amount numeric, p_method text, p_due_date date, p_note text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_id uuid; v_total numeric; v_paid numeric;
BEGIN
  IF NOT public.partner_can_manage_reservation(p_reservation_id) OR p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Paiement invalide ou réservation inaccessible.' USING ERRCODE='42501'; END IF;
  SELECT total_amount INTO v_total FROM public.reservations WHERE id=p_reservation_id FOR UPDATE;
  SELECT coalesce(sum(amount),0) INTO v_paid FROM public.payments WHERE reservation_id=p_reservation_id;
  IF v_paid + p_amount > v_total THEN RAISE EXCEPTION 'Le paiement dépasse le solde de la réservation.' USING ERRCODE='22023'; END IF;
  INSERT INTO public.payments(reservation_id,amount,method,due_date,note,source,paid_at) VALUES(p_reservation_id,p_amount,nullif(btrim(p_method),''),p_due_date,nullif(btrim(p_note),''),'partner',now()) RETURNING id INTO v_id;
  UPDATE public.reservations SET deposit_amount=least(v_total,v_paid+p_amount), payment_status=CASE WHEN v_paid+p_amount >= v_total THEN 'paid'::public.payment_status ELSE 'partial'::public.payment_status END, updated_at=now() WHERE id=p_reservation_id;
  RETURN v_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.partner_add_payment(uuid,numeric,text,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_add_payment(uuid,numeric,text,date,text) TO authenticated;

DROP POLICY IF EXISTS contract_documents_all_scoped ON public.contract_documents;
CREATE POLICY contract_documents_all_scoped ON public.contract_documents FOR ALL TO authenticated
USING ((SELECT public.is_super_admin()) OR ((SELECT public.partner_can_manage_reservation(contract_documents.reservation_id))))
WITH CHECK ((SELECT public.is_super_admin()) OR ((SELECT public.partner_can_manage_reservation(contract_documents.reservation_id))));

DROP POLICY IF EXISTS return_forms_all_scoped ON public.return_forms;
CREATE POLICY return_forms_all_scoped ON public.return_forms FOR ALL TO authenticated
USING ((SELECT public.is_super_admin()) OR ((SELECT public.partner_can_manage_reservation(return_forms.reservation_id))))
WITH CHECK ((SELECT public.is_super_admin()) OR ((SELECT public.partner_can_manage_reservation(return_forms.reservation_id))));

DROP POLICY IF EXISTS payments_insert_scoped ON public.payments;
CREATE POLICY payments_insert_scoped ON public.payments FOR INSERT TO authenticated
WITH CHECK ((SELECT public.is_super_admin()) OR ((SELECT public.partner_can_manage_reservation(payments.reservation_id)) AND source IN ('partner','admin')));
DROP POLICY IF EXISTS payments_read_scoped ON public.payments;
CREATE POLICY payments_read_scoped ON public.payments FOR SELECT TO authenticated
USING ((SELECT public.is_super_admin()) OR ((SELECT public.partner_can_manage_reservation(payments.reservation_id))));
DROP POLICY IF EXISTS payments_update_scoped ON public.payments;
CREATE POLICY payments_update_scoped ON public.payments FOR UPDATE TO authenticated
USING ((SELECT public.is_super_admin()) OR ((SELECT public.partner_can_manage_reservation(payments.reservation_id))))
WITH CHECK ((SELECT public.is_super_admin()) OR ((SELECT public.partner_can_manage_reservation(payments.reservation_id)) AND source IN ('partner','admin')));

DROP POLICY IF EXISTS vehicle_damage_prices_authenticated_manage ON public.vehicle_damage_prices;
CREATE POLICY vehicle_damage_prices_admin_manage ON public.vehicle_damage_prices FOR ALL TO authenticated
USING ((SELECT public.is_super_admin())) WITH CHECK ((SELECT public.is_super_admin()));
CREATE POLICY vehicle_damage_prices_partner_read ON public.vehicle_damage_prices FOR SELECT TO authenticated
USING ((SELECT public.has_active_partner_access()) AND EXISTS (SELECT 1 FROM public.vehicles v WHERE v.id=vehicle_damage_prices.vehicle_id AND v.owner_user_id=(SELECT auth.uid())));

ALTER TABLE public.reservations DROP CONSTRAINT IF EXISTS reservations_valid_period;
ALTER TABLE public.reservations ADD CONSTRAINT reservations_valid_period CHECK (start_at < end_at);
