import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const slug = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "").slice(0, 40) || "chauffeur";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Configuration serveur incomplète." }, 503);
  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(url, serviceKey, { global: { headers: { Authorization: authHeader } } });
  const adminClient = createClient(url, serviceKey);
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "Connexion administrateur requise." }, 401);
  const { data: profile, error: profileError } = await adminClient.from("account_profiles").select("role,is_active").eq("user_id", userData.user.id).limit(1).maybeSingle();
  if (profileError) return json({ error: `Vérification administrateur impossible : ${profileError.message}` }, 500);
  if (profile?.role !== "super_admin" || profile.is_active !== true) return json({ error: "Droits administrateur requis." }, 403);
  try {
    const input = await req.json();
    const chauffeurId = String(input?.chauffeur_id || "").trim();
    const resetPassword = Boolean(input?.reset_password);
    if (!chauffeurId) return json({ error: "Chauffeur requis." }, 400);
    const { data: driver, error: driverError } = await adminClient.from("chauffeurs").select("id,name,auth_user_id,login_name,active").eq("id", chauffeurId).limit(1).maybeSingle();
    if (driverError) return json({ error: `Lecture du chauffeur impossible : ${driverError.message}` }, 500);
    if (!driver) return json({ error: "Chauffeur introuvable." }, 404);
    const base = slug(String(driver.login_name || String(driver.name || "").split(/\s+/)[0] || "chauffeur"));
    let loginName = driver.login_name || base;
    if (!driver.login_name) {
      const { data: taken } = await adminClient.from("chauffeurs").select("login_name").ilike("login_name", `${base}%`).limit(50);
      const used = new Set((taken || []).map((row) => String(row.login_name || "").toLowerCase()));
      let i = 1;
      while (used.has(loginName.toLowerCase())) loginName = `${base}${++i}`;
    }
    const email = `${loginName}@team.rent-car-service.local`;
    const initialPassword = `${loginName.charAt(0).toUpperCase()}${loginName.slice(1)}#@!?`;
    let authUserId = driver.auth_user_id;
    let created = false;
    if (!authUserId) {
      const createdUser = await adminClient.auth.admin.createUser({ email, password: initialPassword, email_confirm: true, user_metadata: { role: "chauffeur", chauffeur_id: chauffeurId, login_name: loginName } });
      if (createdUser.error || !createdUser.data.user) return json({ error: createdUser.error?.message || "Création du compte impossible." }, 400);
      authUserId = createdUser.data.user.id;
      created = true;
    } else if (resetPassword) {
      const updated = await adminClient.auth.admin.updateUserById(authUserId, { password: initialPassword, email_confirm: true, user_metadata: { role: "chauffeur", chauffeur_id: chauffeurId, login_name: loginName } });
      if (updated.error) return json({ error: updated.error.message }, 400);
    }
    const { error: updateError } = await adminClient.from("chauffeurs").update({ auth_user_id: authUserId, login_name: loginName, must_change_password: created || resetPassword }).eq("id", chauffeurId);
    if (updateError) return json({ error: updateError.message }, 400);
    return json({ ok: true, created, login_name: loginName, email, initial_password: created || resetPassword ? initialPassword : null, message: created ? "Compte créé. Communiquez le login et le mot de passe initial au chauffeur." : resetPassword ? "Mot de passe réinitialisé." : "Compte déjà configuré." });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erreur inattendue." }, 500);
  }
});
