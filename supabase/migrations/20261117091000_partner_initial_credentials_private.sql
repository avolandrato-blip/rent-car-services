CREATE TABLE IF NOT EXISTS public.partner_initial_credentials (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.partner_initial_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.partner_initial_credentials FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.partner_initial_credentials TO service_role;

ALTER TABLE public.account_profiles DROP COLUMN IF EXISTS initial_password_hash;
