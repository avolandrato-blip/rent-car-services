-- ============================================================
-- PARTIE 1 : AUDIT (lecture seule, sans risque)
-- À lancer dans Supabase > SQL Editor
-- ============================================================

-- 1. Tables SANS RLS (rowsecurity = false => lisibles/modifiables avec la clé anon)
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by rowsecurity, tablename;

-- 2. Politiques existantes
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename;

-- 3. Droits donnés aux visiteurs anonymes
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
order by table_name, grantee;

-- 4. Buckets de stockage : "public = true" ne doit JAMAIS concerner CIN / permis / contrats
select id, name, public from storage.buckets;


-- ============================================================
-- PARTIE 2 : MODÈLE (COMMENTÉ, à adapter puis tester sur une COPIE)
-- Noms de tables = exemples. Activer RLS sans politique BLOQUE tout accès :
-- ajoutez les politiques en même temps, table par table.
-- ============================================================

-- Catalogue public (véhicules, chauffeurs) : lecture seule pour tous
-- alter table public.vehicles enable row level security;
-- create policy "vehicles_lecture_publique" on public.vehicles
--   for select to anon using (true);

-- Réservations / demandes : les visiteurs peuvent seulement CRÉER
-- alter table public.reservations enable row level security;
-- create policy "reservations_creation_anon" on public.reservations
--   for insert to anon with check (true);
-- Aucune politique select/update/delete pour anon => personne ne peut lire les CIN/permis.
-- Attention : côté JS, utilisez .insert(data) SANS .select() ensuite,
-- sinon la lecture du retour sera refusée.

-- Documents d'identité : bucket privé (public = false)
-- update storage.buckets set public = false where id = 'identity-docs';
-- Les téléchargements passent par une Edge Function qui vérifie
-- référence + téléphone + OTP, puis génère une URL signée de 5 minutes.

-- OTP : stockez un HASH (pas le code en clair), expiration 10 min,
-- 5 essais maximum, et une réponse identique que le numéro existe ou non.
