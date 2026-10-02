// Public Supabase client configuration. The anon key is intended for browser use;
// database access is protected by Row Level Security policies.
window.rentCarSupabase = supabase.createClient(
  'https://onbpnvhopbluttbbxwde.supabase.co',
  'sb_publishable_bE8Bk5fOEtrXKw248cNmQw_dW82j5tl'
);

window.formatMGA = (value) => `${Number(value || 0).toLocaleString('fr-FR')} Ar`;
