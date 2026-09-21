// Public Supabase client configuration. The anon key is intended for browser use;
// database access is protected by Row Level Security policies.
window.rentCarSupabase = supabase.createClient(
  'https://onbpnvhopbluttbbxwde.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9uYnBudmhvcGJsdXR0YmJ4d2RlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5ODcxMzIsImV4cCI6MjEwNTU2MzEzMn0.a_h8QYesWAPTcdGcPbpqKpbm_VrwiptTwOErRZVgTMQ'
);

window.formatMGA = (value) => `${Number(value || 0).toLocaleString('fr-FR')} Ar`;
