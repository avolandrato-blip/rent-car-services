-- MANUAL ROLLBACK for 20260926_partner_accounts_and_public_busy_slots.sql
-- Prepared at the user's request. Do NOT auto-run this file.
-- This script intentionally preserves public_fleet_busy_slots: the current
-- public catalog/calendar uses it without exposing customer/payment details.
-- Existing public booking/invoice RPCs and all unrelated RLS/storage policies
-- are also preserved.
--
-- Preconditions: no partner profile may exist. This DO block aborts the
-- transaction if any have been created, so their ownership/access is not lost.
BEGIN;

DO $rollback_guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.account_profiles WHERE role = 'partner') THEN
    RAISE EXCEPTION 'Rollback aborted: partner profiles exist; review and reassign them first';
  END IF;
END;
$rollback_guard$;

-- Remove the super-admin expiry introduced by the migration. Before it was
-- applied, the three existing super-admin profiles had no access_ends_on date.
ALTER TABLE public.account_profiles
  DROP CONSTRAINT IF EXISTS account_profiles_super_admin_expiry_required;

UPDATE public.account_profiles
SET access_ends_on = NULL,
    updated_at = now()
WHERE role = 'super_admin'
  AND access_ends_on = DATE '2100-12-31';

-- Restore the pre-migration super-admin predicate (active role only).
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.account_profiles AS p
    WHERE p.user_id = (SELECT auth.uid())
      AND p.role = 'super_admin'
      AND p.is_active
  );
$function$;

-- The account-management RPC was added by the portal migration; no partner
-- profiles are expected. The explicit role guard above prevents orphaning one.
DROP FUNCTION IF EXISTS public.superadmin_assign_partner(text, text, text, text, text, text, text, date);

-- Restore the exact pre-migration vehicle policies (including the previous
-- one-day contract buffer). The role-scoped RLS model itself is retained.
DROP POLICY IF EXISTS vehicles_insert_scoped ON public.vehicles;
CREATE POLICY vehicles_insert_scoped ON public.vehicles
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT public.is_super_admin())
  OR (
    (SELECT public.has_active_partner_access())
    AND owner_user_id = (SELECT auth.uid())
    AND contract_end_date IS NOT NULL
    AND contract_end_date <= (SELECT public.current_partner_access_end()) - 1
    AND (contract_start_date IS NULL OR contract_start_date <= contract_end_date)
  )
);

DROP POLICY IF EXISTS vehicles_update_scoped ON public.vehicles;
CREATE POLICY vehicles_update_scoped ON public.vehicles
FOR UPDATE TO authenticated
USING (
  (SELECT public.is_super_admin())
  OR (
    (SELECT public.has_active_partner_access())
    AND owner_user_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  (SELECT public.is_super_admin())
  OR (
    (SELECT public.has_active_partner_access())
    AND owner_user_id = (SELECT auth.uid())
    AND contract_end_date IS NOT NULL
    AND contract_end_date <= (SELECT public.current_partner_access_end()) - 1
    AND (contract_start_date IS NULL OR contract_start_date <= contract_end_date)
  )
);

-- Keep public_fleet_busy_slots because the published public booking calendar
-- depends on it. Its grants reveal only vehicle ID, busy times, and slot type.

COMMIT;
