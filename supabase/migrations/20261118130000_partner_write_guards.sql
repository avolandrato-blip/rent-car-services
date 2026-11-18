-- Harden partner write paths. Local change only; apply after explicit production approval.

-- Partners must use the SECURITY DEFINER RPCs; direct PostgREST writes would let them
-- alter payment status, invoice OTPs, reservation fields, payment rows, or return forms.
DROP POLICY IF EXISTS reservations_insert_scoped ON public.reservations;
CREATE POLICY reservations_insert_superadmin_only ON public.reservations
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_super_admin()));

DROP POLICY IF EXISTS reservations_update_scoped ON public.reservations;
CREATE POLICY reservations_update_superadmin_only ON public.reservations
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_super_admin()))
  WITH CHECK ((SELECT public.is_super_admin()));

DROP POLICY IF EXISTS payments_insert_scoped ON public.payments;
CREATE POLICY payments_insert_superadmin_only ON public.payments
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_super_admin()));

DROP POLICY IF EXISTS payments_update_scoped ON public.payments;
CREATE POLICY payments_update_superadmin_only ON public.payments
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_super_admin()))
  WITH CHECK ((SELECT public.is_super_admin()));

DROP POLICY IF EXISTS return_forms_all_scoped ON public.return_forms;
CREATE POLICY return_forms_read_scoped ON public.return_forms
  FOR SELECT TO authenticated
  USING ((SELECT public.is_super_admin()) OR (SELECT public.partner_can_manage_reservation(return_forms.reservation_id)));
CREATE POLICY return_forms_admin_manage ON public.return_forms
  FOR ALL TO authenticated
  USING ((SELECT public.is_super_admin()))
  WITH CHECK ((SELECT public.is_super_admin()));

-- Server-side quote: prices and fixed fees come from the vehicle record and the
-- published rental rules, never from a caller-supplied total.
CREATE OR REPLACE FUNCTION public.partner_calculate_reservation_quote(
  p_vehicle_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_with_driver boolean,
  p_delivery boolean,
  p_recovery boolean,
  p_distance_band text DEFAULT '0_30'
)
RETURNS TABLE(
  billed_days integer,
  rate_12h numeric,
  rate_24h numeric,
  rental_amount numeric,
  delivery_fee numeric,
  recovery_fee numeric,
  chauffeur_fee numeric,
  total_amount numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v public.vehicles%rowtype;
  v_hours numeric;
  v_days integer;
  v_band_rate numeric;
  v_rental numeric;
  v_rate12 numeric;
  v_rate24 numeric;
  v_delivery numeric := 0;
  v_recovery numeric := 0;
  v_chauffeur numeric := 0;
BEGIN
  IF p_start_at IS NULL OR p_end_at IS NULL OR p_end_at <= p_start_at THEN
    RAISE EXCEPTION 'Période de location invalide.' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v FROM public.vehicles WHERE id=p_vehicle_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Véhicule introuvable.' USING ERRCODE='22023'; END IF;
  v_hours := extract(epoch FROM (p_end_at-p_start_at))/3600;
  v_days := greatest(1, ceil(v_hours/24.0)::integer);
  IF v_days > 730 THEN RAISE EXCEPTION 'La période dépasse la durée maximale autorisée.' USING ERRCODE='22023'; END IF;
  v_rate12 := coalesce(nullif(v.price_12h,0), v.price_per_day, 0);
  IF v_rate12 <= 0 THEN RAISE EXCEPTION 'Le tarif 12 h du véhicule est manquant.' USING ERRCODE='22023'; END IF;
  -- Keep the admin form's existing pricing rule: a missing 24 h price defaults to 2 × 12 h.
  v_rate24 := coalesce(nullif(v.price_24h,0),v_rate12*2);
  IF coalesce(p_distance_band,'0_30') = '0_30' THEN
    IF v_hours <= 12 THEN v_rental := v_rate12;
    ELSIF v_hours <= 24 THEN v_rental := v_rate24;
    ELSE v_rental := v_rate24 * ceil(v_hours/24.0)::integer;
    END IF;
  ELSE
    v_band_rate := CASE p_distance_band
      WHEN '30_100' THEN coalesce(v.price_30_100_per_day,0)
      WHEN '100_200' THEN coalesce(v.price_100_200_per_day,0)
      WHEN 'over_200' THEN coalesce(v.price_over_200_per_day,0)
      ELSE 0 END;
    IF v_band_rate <= 0 THEN RAISE EXCEPTION 'Le tarif du palier sélectionné n’est pas défini.' USING ERRCODE='22023'; END IF;
    v_rental := v_band_rate * v_days;
  END IF;
  IF coalesce(p_delivery,false) THEN v_delivery := 20000; END IF;
  IF coalesce(p_recovery,false) THEN v_recovery := 20000; END IF;
  IF coalesce(p_with_driver,false) THEN v_chauffeur := coalesce(v.driver_fee,30000) * v_days; END IF;
  RETURN QUERY SELECT v_days, v_rate12, v_rate24, v_rental,
    v_delivery, v_recovery, v_chauffeur, v_rental+v_delivery+v_recovery+v_chauffeur;
END;
$function$;
REVOKE ALL ON FUNCTION public.partner_calculate_reservation_quote(uuid,timestamptz,timestamptz,boolean,boolean,boolean,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.partner_create_reservation(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_id uuid;
  v_uid uuid := auth.uid();
  v_vehicle_id uuid := nullif(p_payload->>'vehicle_id','')::uuid;
  v_start timestamptz := nullif(p_payload->>'start_at','')::timestamptz;
  v_end timestamptz := nullif(p_payload->>'end_at','')::timestamptz;
  v_with_driver boolean := coalesce((p_payload->>'with_driver')::boolean,false);
  v_delivery boolean := coalesce((p_payload->>'delivery_requested')::boolean,false);
  v_recovery boolean := coalesce((p_payload->>'recovery_requested')::boolean,false);
  v_band text := coalesce(nullif(p_payload->>'distance_band',''),'0_30');
  v_days integer;
  v_rate12 numeric;
  v_rate24 numeric;
  v_daily_rate numeric;
  v_rental numeric;
  v_delivery_fee numeric;
  v_recovery_fee numeric;
  v_chauffeur_fee numeric;
  v_total numeric;
  v_deposit numeric := coalesce(nullif(p_payload->>'deposit_amount','')::numeric,0);
  v_method text := nullif(btrim(p_payload->>'payment_method'),'');
  v_status public.reservation_status := coalesce(nullif(p_payload->>'status','')::public.reservation_status,'reserved');
BEGIN
  IF v_uid IS NULL OR NOT public.has_active_partner_access() THEN
    RAISE EXCEPTION 'Session partenaire active requise.' USING ERRCODE='42501';
  END IF;
  IF coalesce(jsonb_typeof(p_payload),'') <> 'object'
     OR v_vehicle_id IS NULL OR v_start IS NULL OR v_end IS NULL OR v_end <= v_start
     OR v_status NOT IN ('pre_reserved','reserved')
     OR nullif(btrim(p_payload->>'customer_name'),'') IS NULL
     OR nullif(btrim(p_payload->>'customer_phone'),'') IS NULL THEN
    RAISE EXCEPTION 'Données de réservation invalides.' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vehicles v WHERE v.id=v_vehicle_id AND v.owner_user_id=v_uid
    AND v.status='available' AND public.reservation_vehicle_contract_covers(v_vehicle_id,v_end)) THEN
    RAISE EXCEPTION 'Cette voiture ne vous est pas attribuée, disponible ou son contrat ne couvre pas la période.' USING ERRCODE='42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.maintenance m WHERE m.vehicle_id=v_vehicle_id AND m.start_at<v_end AND m.end_at>v_start) THEN
    RAISE EXCEPTION 'Le véhicule est en maintenance sur cette période.' USING ERRCODE='23P01';
  END IF;
  SELECT q.billed_days,q.rate_12h,q.rate_24h,q.rental_amount,q.delivery_fee,q.recovery_fee,q.chauffeur_fee,q.total_amount
    INTO v_days,v_rate12,v_rate24,v_rental,v_delivery_fee,v_recovery_fee,v_chauffeur_fee,v_total
    FROM public.partner_calculate_reservation_quote(v_vehicle_id,v_start,v_end,v_with_driver,v_delivery,v_recovery,v_band) q;
  SELECT price_per_day INTO v_daily_rate FROM public.vehicles WHERE id=v_vehicle_id;
  IF nullif(p_payload->>'total_amount','') IS NOT NULL
     AND round((p_payload->>'total_amount')::numeric,2) <> round(v_total,2) THEN
    RAISE EXCEPTION 'Le devis a changé. Recalculez le montant avant de continuer.' USING ERRCODE='22023';
  END IF;
  IF v_deposit < 0 OR v_deposit > v_total OR (v_deposit > 0 AND (v_method IS NULL OR v_method NOT IN ('espece','mobile_money','virement','carte'))) THEN
    RAISE EXCEPTION 'Acompte ou mode de paiement invalide.' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.reservations (
    vehicle_id, customer_name, customer_phone, whatsapp_phone, customer_email,
    customer_address, customer_license, customer_cin, start_at, end_at,
    with_driver, rental_type, daily_rate, rate_12h, rate_24h, days,
    total_amount, deposit_amount, payment_status, payment_method, trip_from, trip_to,
    delivery_fee, recovery_fee, chauffeur_fee, extra_fees, notes, status, partner_user_id,
    distance_band, created_at, updated_at
  ) VALUES (
    v_vehicle_id, nullif(btrim(p_payload->>'customer_name'),''), nullif(btrim(p_payload->>'customer_phone'),''),
    nullif(btrim(p_payload->>'whatsapp_phone'),''), nullif(btrim(p_payload->>'customer_email'),''),
    nullif(btrim(p_payload->>'customer_address'),''), nullif(btrim(p_payload->>'customer_license'),''),
    nullif(btrim(p_payload->>'customer_cin'),''), v_start, v_end, v_with_driver,
    coalesce(nullif(p_payload->>'rental_type',''),'day'), v_daily_rate, v_rate12, v_rate24, v_days,
    v_total, v_deposit,
    CASE WHEN v_deposit >= v_total AND v_total > 0 THEN 'paid'::public.payment_status
         WHEN v_deposit > 0 THEN 'partial'::public.payment_status ELSE 'pending'::public.payment_status END,
    v_method, nullif(btrim(p_payload->>'trip_from'),''), nullif(btrim(p_payload->>'trip_to'),''),
    v_delivery_fee, v_recovery_fee, v_chauffeur_fee, v_delivery_fee+v_recovery_fee+v_chauffeur_fee,
    nullif(btrim(p_payload->>'notes'),''), v_status, v_uid, v_band, now(), now()
  ) RETURNING id INTO v_id;
  IF v_deposit > 0 THEN
    INSERT INTO public.payments(reservation_id,amount,method,note,source,paid_at)
    VALUES(v_id,v_deposit,v_method,'Acompte à la création de la réservation','partner',now());
  END IF;
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
  v_old public.reservations%rowtype;
  v_start timestamptz := nullif(p_payload->>'start_at','')::timestamptz;
  v_end timestamptz := nullif(p_payload->>'end_at','')::timestamptz;
  v_status public.reservation_status;
  v_paid numeric := 0;
  v_total numeric;
  v_days integer;
  v_rate12 numeric;
  v_rate24 numeric;
  v_rental numeric;
  v_delivery numeric;
  v_recovery numeric;
  v_chauffeur numeric;
  v_with_driver boolean;
  v_delivery_requested boolean;
  v_recovery_requested boolean;
  v_distance_band text;
  v_pricing_changed boolean;
BEGIN
  IF NOT public.partner_can_manage_reservation(p_reservation_id) THEN
    RAISE EXCEPTION 'Réservation non accessible avec ce compte.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_old FROM public.reservations WHERE id=p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Réservation introuvable.' USING ERRCODE='P0002'; END IF;
  v_with_driver := coalesce(nullif(p_payload->>'with_driver','')::boolean,v_old.with_driver);
  v_delivery_requested := CASE WHEN p_payload ? 'delivery_requested' THEN coalesce((p_payload->>'delivery_requested')::boolean,false) ELSE coalesce(v_old.delivery_fee,0)>0 END;
  v_recovery_requested := CASE WHEN p_payload ? 'recovery_requested' THEN coalesce((p_payload->>'recovery_requested')::boolean,false) ELSE coalesce(v_old.recovery_fee,0)>0 END;
  v_distance_band := coalesce(nullif(p_payload->>'distance_band',''),v_old.distance_band,'0_30');
  IF v_start IS NULL OR v_end IS NULL OR v_end <= v_start THEN
    RAISE EXCEPTION 'Période de réservation invalide.' USING ERRCODE='22023';
  END IF;
  v_status := coalesce(nullif(p_payload->>'status','')::public.reservation_status,v_old.status);
  IF v_status NOT IN ('pre_reserved','reserved','cancelled','completed')
     OR NOT ((v_status=v_old.status) OR (v_old.status='pre_reserved' AND v_status IN ('reserved','cancelled'))
       OR (v_old.status='reserved' AND v_status IN ('cancelled','completed'))) THEN
    RAISE EXCEPTION 'Transition de statut non autorisée.' USING ERRCODE='22023';
  END IF;
  IF nullif(p_payload->>'vehicle_id','')::uuid IS DISTINCT FROM v_old.vehicle_id THEN
    RAISE EXCEPTION 'Le véhicule ne peut pas être changé depuis cet écran.' USING ERRCODE='22023';
  END IF;
  IF NOT public.reservation_vehicle_contract_covers(v_old.vehicle_id,v_end) THEN
    RAISE EXCEPTION 'Le contrat du véhicule ne couvre pas cette période.' USING ERRCODE='22023';
  END IF;
  SELECT greatest(coalesce(v_old.deposit_amount,0),coalesce(sum(p.amount),0)) INTO v_paid
    FROM public.payments p WHERE p.reservation_id=p_reservation_id;
  v_pricing_changed := v_start IS DISTINCT FROM v_old.start_at OR v_end IS DISTINCT FROM v_old.end_at
    OR v_with_driver IS DISTINCT FROM v_old.with_driver
    OR v_delivery_requested IS DISTINCT FROM (coalesce(v_old.delivery_fee,0)>0)
    OR v_recovery_requested IS DISTINCT FROM (coalesce(v_old.recovery_fee,0)>0)
    OR v_distance_band IS DISTINCT FROM coalesce(v_old.distance_band,'0_30');
  IF v_pricing_changed AND v_status IN ('pre_reserved','reserved') AND EXISTS (
    SELECT 1 FROM public.maintenance m WHERE m.vehicle_id=v_old.vehicle_id AND m.start_at<v_end AND m.end_at>v_start
  ) THEN RAISE EXCEPTION 'Le véhicule est en maintenance sur cette période.' USING ERRCODE='23P01'; END IF;
  IF NOT v_pricing_changed THEN
    v_total := v_old.total_amount;
    v_days := v_old.days;
    v_rate12 := v_old.rate_12h;
    v_rate24 := v_old.rate_24h;
    v_rental := greatest(0,coalesce(v_old.total_amount,0)-coalesce(v_old.delivery_fee,0)-coalesce(v_old.recovery_fee,0)-coalesce(v_old.chauffeur_fee,0));
    v_delivery := coalesce(v_old.delivery_fee,0);
    v_recovery := coalesce(v_old.recovery_fee,0);
    v_chauffeur := coalesce(v_old.chauffeur_fee,0);
  ELSE
    SELECT q.billed_days,q.rate_12h,q.rate_24h,q.rental_amount,q.delivery_fee,q.recovery_fee,q.chauffeur_fee,q.total_amount
      INTO v_days,v_rate12,v_rate24,v_rental,v_delivery,v_recovery,v_chauffeur,v_total
      FROM public.partner_calculate_reservation_quote(
        v_old.vehicle_id,v_start,v_end,v_with_driver,v_delivery_requested,
        v_recovery_requested,v_distance_band) q;
    v_total := greatest(0,v_total-least(v_total,coalesce(v_old.promo_discount,0)));
  END IF;
  IF v_paid > v_total THEN RAISE EXCEPTION 'La nouvelle période ferait passer le total sous les montants déjà enregistrés.' USING ERRCODE='22023'; END IF;
  UPDATE public.reservations SET
    customer_name=nullif(btrim(p_payload->>'customer_name'),''),
    customer_phone=nullif(btrim(p_payload->>'customer_phone'),''),
    whatsapp_phone=nullif(btrim(p_payload->>'whatsapp_phone'),''),
    customer_email=nullif(btrim(p_payload->>'customer_email'),''),
    customer_address=nullif(btrim(p_payload->>'customer_address'),''),
    customer_license=nullif(btrim(p_payload->>'customer_license'),''),
    customer_cin=nullif(btrim(p_payload->>'customer_cin'),''),
    start_at=v_start,end_at=v_end,days=v_days,daily_rate=v_old.daily_rate,rate_12h=v_rate12,rate_24h=v_rate24,
    with_driver=v_with_driver,distance_band=v_distance_band,delivery_fee=v_delivery,recovery_fee=v_recovery,chauffeur_fee=v_chauffeur,
    extra_fees=v_delivery+v_recovery+v_chauffeur,total_amount=v_total,deposit_amount=v_paid,
    payment_status=CASE WHEN v_paid<=0 THEN 'pending'::public.payment_status
      WHEN v_paid>=v_total AND v_total>0 THEN 'paid'::public.payment_status ELSE 'partial'::public.payment_status END,
    trip_from=nullif(btrim(p_payload->>'trip_from'),''),trip_to=nullif(btrim(p_payload->>'trip_to'),''),
    notes=nullif(btrim(p_payload->>'notes'),''),status=v_status,updated_at=now()
  WHERE id=p_reservation_id;
  RETURN p_reservation_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.partner_update_reservation(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_update_reservation(uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.partner_add_payment(
  p_reservation_id uuid,p_amount numeric,p_method text,p_due_date date,p_note text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_id uuid;
  v_total numeric;
  v_deposit numeric;
  v_paid numeric;
  v_method text := lower(btrim(coalesce(p_method,'')));
BEGIN
  IF NOT public.partner_can_manage_reservation(p_reservation_id)
     OR p_amount IS NULL OR p_amount<=0
     OR v_method IS NULL OR v_method NOT IN ('espece','mobile_money','virement','carte')
     OR length(coalesce(p_note,''))>500 THEN
    RAISE EXCEPTION 'Paiement invalide ou réservation inaccessible.' USING ERRCODE='42501';
  END IF;
  SELECT total_amount,deposit_amount INTO v_total,v_deposit
    FROM public.reservations WHERE id=p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Réservation introuvable.' USING ERRCODE='P0002'; END IF;
  SELECT greatest(coalesce(v_deposit,0),coalesce(sum(amount),0)) INTO v_paid
    FROM public.payments WHERE reservation_id=p_reservation_id;
  IF v_paid+p_amount>v_total THEN
    RAISE EXCEPTION 'Le paiement dépasse le solde de la réservation.' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.payments(reservation_id,amount,method,due_date,note,source,paid_at)
    VALUES(p_reservation_id,p_amount,v_method,p_due_date,nullif(btrim(p_note),''),'partner',now()) RETURNING id INTO v_id;
  v_paid := v_paid+p_amount;
  UPDATE public.reservations SET deposit_amount=v_paid,
    payment_status=CASE WHEN v_paid>=v_total THEN 'paid'::public.payment_status ELSE 'partial'::public.payment_status END,
    updated_at=now() WHERE id=p_reservation_id;
  RETURN v_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.partner_add_payment(uuid,numeric,text,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_add_payment(uuid,numeric,text,date,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.partner_save_return_form(
  p_reservation_id uuid,p_kind text,p_payload jsonb
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_id uuid;
  v_client_signature text := coalesce(p_payload->>'client_signature_data','');
  v_photo jsonb;
BEGIN
  IF NOT public.partner_can_manage_reservation(p_reservation_id) THEN
    RAISE EXCEPTION 'Réservation non accessible avec ce compte.' USING ERRCODE='42501';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('departure','restitution','degradation') OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object'
     OR coalesce((coalesce(p_payload->>'km_recorded',p_payload->>'km_return'))::numeric,-1)<0
     OR coalesce((coalesce(p_payload->>'km_recorded',p_payload->>'km_return'))::numeric,0)>10000000
     OR coalesce((p_payload->>'keys_returned')::integer,-1)<0
     OR coalesce(p_payload->>'fuel_level',p_payload->>'fuel_return','') NOT IN ('0','1/4','1/3','1/2','3/4','1/1')
     OR coalesce(p_payload->>'fuel_status','') NOT IN ('ok','nok')
     OR coalesce((p_payload->>'amount_due')::numeric,-1)<0
     OR coalesce((p_payload->>'amount_due')::numeric,0)>100000000
     OR length(coalesce(p_payload->>'degradation',''))>4000
     OR length(v_client_signature)<100 OR length(v_client_signature)>500000
     OR v_client_signature !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$' THEN
    RAISE EXCEPTION 'Fiche de retour invalide ou signature client manquante.' USING ERRCODE='22023';
  END IF;
  IF CASE WHEN p_payload ? 'photo_paths' THEN jsonb_typeof(p_payload->'photo_paths')<>'array'
     ELSE false END OR CASE WHEN jsonb_typeof(coalesce(p_payload->'photo_paths','[]'::jsonb))='array'
     THEN jsonb_array_length(coalesce(p_payload->'photo_paths','[]'::jsonb))>8 ELSE false END THEN
    RAISE EXCEPTION 'La fiche peut contenir au maximum 8 photos.' USING ERRCODE='22023';
  END IF;
  FOR v_photo IN SELECT value FROM jsonb_array_elements(coalesce(p_payload->'photo_paths','[]'::jsonb)) LOOP
    IF jsonb_typeof(v_photo)<>'string' OR left(v_photo #>> '{}',37)<>p_reservation_id::text||'/'
       OR position('..' in v_photo #>> '{}')>0 THEN
      RAISE EXCEPTION 'Chemin de photo invalide.' USING ERRCODE='22023';
    END IF;
  END LOOP;
  INSERT INTO public.return_forms(reservation_id,kind,payload)
    VALUES(p_reservation_id,p_kind,p_payload) RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.partner_save_return_form(uuid,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_save_return_form(uuid,text,jsonb) TO authenticated;

-- The same private return-form payload is used for departure, return, and damage inspections.
ALTER TABLE public.return_forms DROP CONSTRAINT IF EXISTS return_forms_kind_check;
ALTER TABLE public.return_forms ADD CONSTRAINT return_forms_kind_check CHECK (kind = ANY (ARRAY['departure'::text,'restitution'::text,'degradation'::text]));

-- Permit assigned partners to view reservation documents and missions, not only vehicle owners.
DROP POLICY IF EXISTS contract_documents_all_scoped ON public.contract_documents;
CREATE POLICY contract_documents_all_scoped ON public.contract_documents FOR ALL TO authenticated
  USING ((SELECT public.is_super_admin()) OR (SELECT public.partner_can_manage_reservation(contract_documents.reservation_id)))
  WITH CHECK ((SELECT public.is_super_admin()) OR (SELECT public.partner_can_manage_reservation(contract_documents.reservation_id)));

CREATE POLICY contract_documents_storage_partner_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id='contract-documents'
    AND split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND ((SELECT public.is_super_admin()) OR (SELECT public.partner_can_manage_reservation(split_part(name,'/',1)::uuid))));
CREATE POLICY contract_documents_storage_partner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id='contract-documents'
    AND split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND ((SELECT public.is_super_admin()) OR (SELECT public.partner_can_manage_reservation(split_part(name,'/',1)::uuid))));
CREATE POLICY contract_documents_storage_partner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id='contract-documents'
    AND split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND ((SELECT public.is_super_admin()) OR (SELECT public.partner_can_manage_reservation(split_part(name,'/',1)::uuid))));

UPDATE storage.buckets SET file_size_limit=8388608,allowed_mime_types=ARRAY['application/pdf','image/jpeg','image/png','image/webp'] WHERE id='contract-documents';
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('return-damage-photos','return-damage-photos',false,8388608,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=8388608,allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp'];
CREATE POLICY return_damage_photo_read ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id='return-damage-photos'
    AND split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND ((SELECT public.is_super_admin()) OR (SELECT public.partner_can_manage_reservation(split_part(name,'/',1)::uuid))));
CREATE POLICY return_damage_photo_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id='return-damage-photos'
    AND split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND ((SELECT public.is_super_admin()) OR (SELECT public.partner_can_manage_reservation(split_part(name,'/',1)::uuid))));
CREATE POLICY return_damage_photo_delete ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id='return-damage-photos'
    AND split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND ((SELECT public.is_super_admin()) OR (SELECT public.partner_can_manage_reservation(split_part(name,'/',1)::uuid))));

CREATE OR REPLACE FUNCTION public.partner_owns_chauffeur_mission(p_reservation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT auth.uid() IS NOT NULL AND public.has_active_partner_access()
    AND public.partner_can_manage_reservation(p_reservation_id);
$function$;
DROP POLICY IF EXISTS chauffeur_missions_partner_read ON public.chauffeur_missions;
CREATE POLICY chauffeur_missions_partner_read ON public.chauffeur_missions
  FOR SELECT TO authenticated USING ((SELECT public.partner_owns_chauffeur_mission(chauffeur_missions.reservation_id)));

CREATE OR REPLACE FUNCTION public.assign_partner_chauffeur_mission(
  p_chauffeur_id uuid,p_reservation_id uuid,p_mission_type text,
  p_custom_delivery_cost numeric,p_custom_recovery_cost numeric,
  p_starts_at timestamptz,p_expires_at timestamptz,p_handover_address text,
  p_notes text,p_driver_instructions text,p_acceptance_token_hash text,p_acceptance_expires_at timestamptz
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_mission_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_active_partner_access() THEN
    RAISE EXCEPTION 'Session partenaire active requise.' USING ERRCODE='42501';
  END IF;
  IF p_mission_type IS NULL OR p_mission_type NOT IN ('delivery','recovery','delivery_and_recovery')
     OR p_starts_at IS NULL OR p_expires_at IS NULL OR p_expires_at<=p_starts_at
     OR p_expires_at>p_starts_at+interval '24 hours'
     OR coalesce(p_custom_delivery_cost,-1)<0 OR coalesce(p_custom_recovery_cost,-1)<0
     OR p_acceptance_token_hash IS NULL OR p_acceptance_token_hash !~ '^[0-9a-f]{64}$'
     OR p_acceptance_expires_at IS NULL OR p_acceptance_expires_at<now()
     OR p_acceptance_expires_at>p_expires_at THEN
    RAISE EXCEPTION 'Données de mission invalides (durée maximale : 24 h).' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.chauffeurs c WHERE c.id=p_chauffeur_id AND c.active=true
    AND c.auth_user_id IS NOT NULL AND nullif(btrim(c.login_name),'') IS NOT NULL
    AND c.availability<>'unavailable') THEN
    RAISE EXCEPTION 'Le chauffeur doit être actif, disponible et disposer d’un compte team.' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.reservations r WHERE r.id=p_reservation_id
    AND r.status='reserved' AND public.partner_can_manage_reservation(r.id)) THEN
    RAISE EXCEPTION 'La réservation confirmée doit appartenir à vos voitures ou vous être attribuée.' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.chauffeur_missions(chauffeur_id,reservation_id,mission_type,status,
    custom_delivery_cost,custom_recovery_cost,starts_at,expires_at,acceptance_token_hash,
    acceptance_expires_at,assigned_by,handover_address,notes,driver_instructions)
  VALUES(p_chauffeur_id,p_reservation_id,p_mission_type,'assigned',p_custom_delivery_cost,
    p_custom_recovery_cost,p_starts_at,p_expires_at,p_acceptance_token_hash,
    p_acceptance_expires_at,auth.uid(),nullif(p_handover_address,''),nullif(p_notes,''),
    nullif(p_driver_instructions,'')) RETURNING id INTO v_mission_id;
  RETURN v_mission_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.assign_partner_chauffeur_mission(uuid,uuid,text,numeric,numeric,timestamptz,timestamptz,text,text,text,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assign_partner_chauffeur_mission(uuid,uuid,text,numeric,numeric,timestamptz,timestamptz,text,text,text,text,timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.partner_release_invoice_and_create_otp(p_reservation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_ref text; v_phone text; v_whatsapp text; v_deposit numeric; v_total numeric;
  v_otp text; v_status public.reservation_status;
BEGIN
  IF NOT public.partner_can_manage_reservation(p_reservation_id) THEN
    RAISE EXCEPTION 'Réservation non accessible avec ce compte.' USING ERRCODE='42501';
  END IF;
  SELECT reference,customer_phone,whatsapp_phone,deposit_amount,total_amount,status
    INTO v_ref,v_phone,v_whatsapp,v_deposit,v_total,v_status
    FROM public.reservations WHERE id=p_reservation_id FOR UPDATE;
  IF v_ref IS NULL OR v_status NOT IN ('reserved','completed') OR coalesce(v_deposit,0)<=0
     OR coalesce(v_deposit,0)>coalesce(v_total,0) OR nullif(btrim(v_phone),'') IS NULL THEN
    RAISE EXCEPTION 'Le lien client exige une réservation confirmée et un acompte enregistré.' USING ERRCODE='22023';
  END IF;
  v_otp := upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
  UPDATE public.reservations SET invoice_released=true,otp_code=v_otp,updated_at=now() WHERE id=p_reservation_id;
  RETURN jsonb_build_object('reference',v_ref,'phone',v_phone,'whatsapp_phone',coalesce(v_whatsapp,v_phone),'otp',v_otp,'invoice_released',true);
END;
$function$;
REVOKE ALL ON FUNCTION public.partner_release_invoice_and_create_otp(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.partner_release_invoice_and_create_otp(uuid) TO authenticated;
