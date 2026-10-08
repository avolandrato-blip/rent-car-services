-- Tarification par paliers kilométriques, applicable avec ou sans chauffeur.
alter table public.vehicles
  add column if not exists price_30_100_per_day numeric,
  add column if not exists price_100_200_per_day numeric,
  add column if not exists price_over_200_per_day numeric;

alter table public.reservations
  add column if not exists distance_band text,
  add column if not exists distance_km numeric,
  add column if not exists minimum_days integer,
  add column if not exists quote_requested boolean not null default false,
  add column if not exists quote_reason text;

alter table public.reservations
  drop constraint if exists reservations_distance_band_check;
alter table public.reservations
  add constraint reservations_distance_band_check check (
    distance_band is null or distance_band in ('0_30','30_100','100_200','over_200')
  );

create or replace function public.create_public_distance_reservation(p_payload jsonb)
returns table (id uuid, reference text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_vehicle public.vehicles%rowtype;
  v_id uuid;
  v_reference text;
  v_start timestamptz;
  v_end timestamptz;
  v_hours numeric;
  v_billed_hours integer;
  v_days integer;
  v_rate12 numeric;
  v_rate24 numeric;
  v_rental numeric := 0;
  v_delivery numeric := 0;
  v_recovery numeric := 0;
  v_chauffeur numeric := 0;
  v_base_total numeric := 0;
  v_discount numeric := 0;
  v_total numeric := 0;
  v_deposit numeric := 0;
  v_with_driver boolean;
  v_owner_confirmation text;
  v_band text;
  v_band_rate numeric := 0;
  v_minimum_days integer := 1;
  v_quote_requested boolean := false;
  v_quote_reason text := null;
begin
  if coalesce(jsonb_typeof(p_payload),'') <> 'object' then
    raise exception 'Invalid reservation payload';
  end if;

  v_start := (p_payload->>'start_at')::timestamptz;
  v_end := (p_payload->>'end_at')::timestamptz;
  if v_start is null or v_end is null or v_end <= v_start or v_start < now() then
    raise exception 'Invalid booking dates';
  end if;
  if nullif(trim(coalesce(p_payload->>'customer_name','')),'') is null
     or nullif(regexp_replace(coalesce(p_payload->>'customer_phone',''),'[^0-9]','','g'),'') is null then
    raise exception 'Customer name and phone are required';
  end if;
  if nullif(p_payload->>'terms_accepted_at','') is null then
    raise exception 'Terms acceptance required';
  end if;

  select * into v_vehicle
  from public.vehicles v
  where v.id = (p_payload->>'vehicle_id')::uuid and v.status = 'available';
  if not found then raise exception 'Vehicle unavailable'; end if;

  if v_vehicle.contract_start_date is not null
     and (v_start at time zone 'Indian/Antananarivo')::date < v_vehicle.contract_start_date then
    raise exception 'Vehicle contract has not started';
  end if;
  if v_vehicle.contract_end_date is not null
     and (v_end at time zone 'Indian/Antananarivo')::date > v_vehicle.contract_end_date then
    raise exception 'Vehicle contract does not cover these dates';
  end if;
  if exists (
    select 1 from public.maintenance m
    where m.vehicle_id = v_vehicle.id and m.start_at < v_end and m.end_at > v_start
  ) then
    raise exception 'Vehicle is in maintenance for these dates' using errcode = '23P01';
  end if;

  v_hours := extract(epoch from (v_end - v_start)) / 3600;
  v_billed_hours := greatest(1, ceil(v_hours)::integer);
  v_days := greatest(1, ceil(v_hours / 24)::integer);
  v_rate12 := coalesce(v_vehicle.price_12h, v_vehicle.price_per_day, 0);
  v_rate24 := case when coalesce(v_vehicle.price_24h, 0) > 0 then v_vehicle.price_24h else null end;
  v_with_driver := coalesce((p_payload->>'with_driver')::boolean, false);
  v_band := nullif(p_payload->>'distance_band','');

  if v_band is null then raise exception 'Distance band required'; end if;
  if v_band not in ('0_30','30_100','100_200','over_200') then raise exception 'Invalid distance band'; end if;

  if v_band = '0_30' then
    if v_rate12 <= 0 then raise exception 'Vehicle has no valid 12-hour price'; end if;
    if v_billed_hours <= 12 then
      v_rental := v_rate12;
    elsif v_rate24 is null then
      v_quote_requested := true;
      v_quote_reason := 'Tarif 24 heures non renseigné';
    elsif v_billed_hours <= 24 then
      v_rental := v_rate24;
    elsif v_billed_hours <= 36 then
      v_rental := v_rate24 + v_rate12;
    elsif v_billed_hours <= 48 then
      v_rental := v_rate24 * 2;
    else
      v_rental := v_rate12 * v_days;
      if v_billed_hours > 48 then
        v_rental := round(v_rental * case when v_days >= 10 then 0.90 when v_days >= 5 then 0.97 else 1 end);
      end if;
    end if;
  else
    v_minimum_days := case v_band when '30_100' then 2 when '100_200' then 3 else 5 end;
    v_band_rate := case v_band
      when '30_100' then coalesce(v_vehicle.price_30_100_per_day, 0)
      when '100_200' then coalesce(v_vehicle.price_100_200_per_day, 0)
      else coalesce(v_vehicle.price_over_200_per_day, 0)
    end;
    if v_hours < (v_minimum_days * 24) then
      v_quote_requested := true;
      v_quote_reason := format('Durée minimale : %s jour(s)', v_minimum_days);
    elsif v_band_rate <= 0 then
      v_quote_requested := true;
      v_quote_reason := 'Tarif du palier non renseigné';
    else
      v_rental := v_band_rate * v_days;
    end if;
  end if;

  if coalesce((p_payload->>'quote_requested')::boolean, false) then
    v_quote_requested := true;
    v_quote_reason := coalesce(nullif(p_payload->>'quote_reason',''), v_quote_reason, 'Demande de devis client');
  end if;

  if v_quote_requested then
    v_rental := 0;
    v_delivery := 0;
    v_recovery := 0;
    v_chauffeur := 0;
    v_total := 0;
    v_deposit := 0;
  else
    v_delivery := case when coalesce((p_payload->>'delivery_requested')::boolean,false) then 20000 else 0 end;
    v_recovery := case when coalesce((p_payload->>'recovery_requested')::boolean,false) then 20000 else 0 end;
    v_chauffeur := case when v_vehicle.driver_mode = 'with_driver' and v_with_driver
      then coalesce(v_vehicle.extra_driver_fee,0) * v_days
      when v_vehicle.driver_mode <> 'with_driver' and v_with_driver
      then coalesce(v_vehicle.driver_fee,30000) * v_days
      else 0 end;
    v_base_total := v_rental + v_delivery + v_recovery + v_chauffeur;
    if nullif(p_payload->>'promo_code','') is not null then
      select case when pc.discount_type = 'percent' then v_base_total * pc.discount_value / 100 else pc.discount_value end
      into v_discount
      from public.promo_codes pc
      where upper(pc.code) = upper(trim(p_payload->>'promo_code')) and pc.active = true limit 1;
      if v_discount is null then raise exception 'Promotion code is invalid or inactive'; end if;
      v_discount := round(least(v_base_total, greatest(0, v_discount)));
    end if;
    v_total := greatest(0, v_base_total - v_discount);
    v_deposit := greatest(0, coalesce((p_payload->>'deposit_amount')::numeric,0));
    if v_deposit > v_total then raise exception 'Invalid deposit amount'; end if;
    if v_deposit > 0 and nullif(p_payload->>'payment_method','') is null then raise exception 'Payment method required'; end if;
    if coalesce(p_payload->>'payment_method','') not in ('','espece','mobile_money','virement','carte') then raise exception 'Invalid payment method'; end if;
    if coalesce(p_payload->>'payment_method','') <> 'mobile_money'
       and (nullif(p_payload->>'mobile_reference','') is not null or nullif(p_payload->>'mobile_number','') is not null) then
      raise exception 'Invalid mobile payment details';
    end if;
    if coalesce((p_payload->>'total_amount')::numeric,-1) <> v_total then raise exception 'Price changed; refresh the quote'; end if;
  end if;

  v_owner_confirmation := case when v_vehicle.owner_user_id is not null and v_vehicle.owner_whatsapp_enabled then 'pending' else 'not_required' end;
  insert into public.reservations(
    vehicle_id, customer_name, customer_phone, whatsapp_phone, customer_email, customer_address,
    customer_license, customer_cin, cin_is_duplicate, license_acquired_at, license_acquired_place,
    cin_acquired_at, cin_acquired_place, start_at, end_at, with_driver, rental_type,
    rate_12h, rate_24h, daily_rate, days, extra_fees, total_amount, deposit_amount, payment_method,
    mobile_reference, mobile_number, notes, status, trip_from, trip_to, delivery_fee, recovery_fee,
    chauffeur_fee, promo_code, promo_discount, terms_accepted_at, owner_confirmation_status,
    distance_band, distance_km, minimum_days, quote_requested, quote_reason
  ) values (
    v_vehicle.id, trim(p_payload->>'customer_name'), trim(p_payload->>'customer_phone'),
    nullif(p_payload->>'whatsapp_phone',''), nullif(p_payload->>'customer_email',''),
    nullif(p_payload->>'customer_address',''), nullif(p_payload->>'customer_license',''),
    nullif(p_payload->>'customer_cin',''), coalesce((p_payload->>'cin_is_duplicate')::boolean,false),
    nullif(p_payload->>'license_acquired_at','')::date, nullif(p_payload->>'license_acquired_place',''),
    nullif(p_payload->>'cin_acquired_at','')::date, nullif(p_payload->>'cin_acquired_place',''),
    v_start, v_end, coalesce((p_payload->>'with_driver')::boolean,false),
    coalesce(nullif(p_payload->>'rental_type',''),'day'), v_rate12, coalesce(v_rate24,0), v_rate12,
    v_days, v_delivery + v_recovery, v_total, v_deposit, nullif(p_payload->>'payment_method',''),
    nullif(p_payload->>'mobile_reference',''), nullif(p_payload->>'mobile_number',''),
    nullif(p_payload->>'notes',''), 'pre_reserved', nullif(p_payload->>'trip_from',''),
    nullif(p_payload->>'trip_to',''), v_delivery, v_recovery, v_chauffeur,
    nullif(p_payload->>'promo_code',''), v_discount, now(), v_owner_confirmation,
    v_band, nullif(p_payload->>'distance_km','')::numeric, v_minimum_days, v_quote_requested, v_quote_reason
  ) returning reservations.id, reservations.reference into v_id, v_reference;

  return query select v_id, v_reference;
end;
$$;

grant execute on function public.create_public_distance_reservation(jsonb) to anon, authenticated;
