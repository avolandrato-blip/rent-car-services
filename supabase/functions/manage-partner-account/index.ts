import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGIN = "https://avolandrato-blip.github.io";
const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !datePattern.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function todayInMadagascar(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Indian/Antananarivo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function slugName(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "").slice(0, 40);
}

function randomPassword(): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";
  const bytes = crypto.getRandomValues(new Uint8Array(28));
  const random = Array.from(bytes, byte => alphabet[byte % alphabet.length]).join("");
  return `Rcs-${random}-aA7!`;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);
  if (req.headers.get("origin") !== ALLOWED_ORIGIN) return json({ error: "Origine non autorisée." }, 403);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = req.headers.get("Authorization");
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Configuration serveur incomplète." }, 503);
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Session administrateur requise." }, 401);

  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await caller.auth.getUser();
  if (authError || !authData.user) return json({ error: "Session invalide ou expirée." }, 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Corps JSON invalide." }, 400); }
  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  if (body.action === "complete_first_login") {
    const temporaryPassword = String(body.temporary_password || "");
    const newPassword = String(body.new_password || "");
    if (temporaryPassword.length < 12 || newPassword.length < 12 || newPassword.length > 128 || temporaryPassword === newPassword) {
      return json({ error: "Le mot de passe temporaire est invalide, ou le nouveau mot de passe n’est pas assez robuste." }, 400);
    }
    const { data: profile, error: profileError } = await service.from("account_profiles")
      .select("user_id,role,is_active,access_ends_on,must_change_password")
      .eq("user_id", authData.user.id).maybeSingle();
    if (profileError) return json({ error: "Impossible de vérifier le compte partenaire." }, 500);
    if (!profile || profile.role !== "partner" || profile.is_active !== true || profile.must_change_password !== true || !profile.access_ends_on || profile.access_ends_on < todayInMadagascar()) {
      return json({ error: "Aucun changement initial de mot de passe n’est requis pour ce compte." }, 403);
    }
    const { data: credential, error: credentialError } = await service.from("partner_initial_credentials")
      .select("password_hash").eq("user_id", authData.user.id).maybeSingle();
    if (credentialError) return json({ error: "Impossible de vérifier le mot de passe temporaire." }, 500);
    const submittedHash = await sha256(temporaryPassword);
    if (!credential?.password_hash || !constantTimeEqual(submittedHash, credential.password_hash)) {
      return json({ error: "Le mot de passe temporaire ne correspond pas." }, 401);
    }
    const { error: authUpdateError } = await service.auth.admin.updateUserById(authData.user.id, { password: newPassword, email_confirm: true });
    if (authUpdateError) return json({ error: "Supabase Auth n’a pas accepté le nouveau mot de passe." }, 400);
    const { data: completed, error: completeError } = await service.from("account_profiles").update({
      must_change_password: false,
      updated_at: new Date().toISOString(),
    }).eq("user_id", authData.user.id).eq("role", "partner").eq("must_change_password", true).select("user_id").maybeSingle();
    if (completeError || !completed) return json({ error: "Mot de passe mis à jour, mais l’ouverture du compte reste bloquée. Contactez le super-admin pour un nouveau mot de passe temporaire." }, 500);
    await service.from("partner_initial_credentials").delete().eq("user_id", authData.user.id);
    return json({ ok: true, action: "complete_first_login" });
  }

  const { data: isSuperAdmin, error: roleError } = await caller.rpc("is_super_admin");
  if (roleError || isSuperAdmin !== true) return json({ error: "Accès réservé au super-admin." }, 403);

  if (body.action === "create") {
    const firstName = String(body.first_name || "").trim().replace(/\s+/g, " ");
    const base = slugName(firstName);
    const accessEndsOn = body.access_ends_on;
    if (firstName.length < 2 || firstName.length > 80 || !base || !validDate(accessEndsOn) || accessEndsOn < todayInMadagascar()) {
      return json({ error: "Saisissez un prénom valide et une date de fin au moins égale à aujourd’hui (heure de Madagascar)." }, 400);
    }

    const loginBase = `P_${base}`;
    const { data: profiles, error: lookupError } = await service.from("account_profiles")
      .select("login_name").eq("role", "partner").not("login_name", "is", null).limit(1000);
    if (lookupError) return json({ error: "Impossible de vérifier les identifiants existants." }, 500);
    const used = new Set((profiles || []).map(row => String(row.login_name || "").toLowerCase()));
    let loginName = loginBase;
    let suffix = 2;
    while (used.has(loginName.toLowerCase())) loginName = `${loginBase}${suffix++}`;

    const email = `${loginName}@partner.rent-car-service.local`;
    const initialPassword = randomPassword();
    const { data: created, error: createError } = await service.auth.admin.createUser({
      email,
      password: initialPassword,
      email_confirm: true,
      user_metadata: { role: "partner", login_name: loginName, display_name: firstName },
    });
    if (createError || !created.user) return json({ error: createError?.message || "Création du compte impossible." }, 400);

    const { error: profileError } = await service.from("account_profiles").insert({
      user_id: created.user.id,
      email,
      role: "partner",
      login_name: loginName,
      display_name: firstName,
      is_active: true,
      access_ends_on: accessEndsOn,
      must_change_password: true,
      created_by: authData.user.id,
    });
    if (profileError) {
      await service.auth.admin.deleteUser(created.user.id);
      return json({ error: "Création du profil impossible; la tentative de compte a été annulée." }, 500);
    }
    const { error: credentialInsertError } = await service.from("partner_initial_credentials").insert({ user_id: created.user.id, password_hash: await sha256(initialPassword) });
    if (credentialInsertError) {
      await service.from("account_profiles").delete().eq("user_id", created.user.id);
      await service.auth.admin.deleteUser(created.user.id);
      return json({ error: "Création du secret temporaire impossible; la tentative de compte a été annulée." }, 500);
    }
    return json({ ok: true, action: "created", user_id: created.user.id, login_name: loginName, display_name: firstName, access_ends_on: accessEndsOn, initial_password: initialPassword, must_change_password: true });
  }

  if (body.action === "update") {
    const userId = String(body.user_id || "");
    const accessEndsOn = body.access_ends_on;
    const isActive = body.is_active;
    const resetPassword = body.reset_password === true;
    if (!/^[0-9a-f-]{36}$/i.test(userId) || !validDate(accessEndsOn) || typeof isActive !== "boolean" || (isActive && accessEndsOn < todayInMadagascar())) {
      return json({ error: "Données de mise à jour invalides ou date déjà expirée." }, 400);
    }

    const { data: profile, error: profileError } = await service.from("account_profiles")
      .select("user_id,role,login_name,email,is_active,access_ends_on,must_change_password")
      .eq("user_id", userId).maybeSingle();
    if (profileError || !profile || profile.role !== "partner") return json({ error: "Compte partenaire introuvable ou protégé." }, 404);

    const initialPassword = resetPassword ? randomPassword() : null;
    let previousCredentialHash: string | null = null;
    if (resetPassword) {
      const { data: previousCredential, error: readCredentialError } = await service.from("partner_initial_credentials")
        .select("password_hash").eq("user_id", userId).maybeSingle();
      if (readCredentialError) return json({ error: "Impossible de vérifier le secret temporaire précédent." }, 500);
      previousCredentialHash = previousCredential?.password_hash || null;
    }
    const updated = await service.from("account_profiles").update({
      access_ends_on: accessEndsOn,
      is_active: isActive,
      ...(resetPassword ? { must_change_password: true } : {}),
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId);
    if (updated.error) return json({ error: "Impossible d’enregistrer les changements du compte." }, 500);

    if (resetPassword) {
      const { error: credentialError } = await service.from("partner_initial_credentials").upsert({ user_id: userId, password_hash: await sha256(initialPassword!) }, { onConflict: "user_id" });
      if (credentialError) {
        await service.from("account_profiles").update({ is_active: profile.is_active, access_ends_on: profile.access_ends_on, must_change_password: profile.must_change_password }).eq("user_id", userId);
        return json({ error: "Impossible de stocker le nouveau secret temporaire; aucune mise à jour du mot de passe n’a été faite." }, 500);
      }
    }

    const { error: authUpdateError } = await service.auth.admin.updateUserById(userId, {
      ban_duration: isActive ? "none" : "876000h",
      ...(resetPassword ? { password: initialPassword!, email_confirm: true } : {}),
    });
    if (authUpdateError) {
      await service.from("account_profiles").update({ is_active: profile.is_active, access_ends_on: profile.access_ends_on, must_change_password: profile.must_change_password }).eq("user_id", userId);
      if (resetPassword) {
        if (previousCredentialHash) await service.from("partner_initial_credentials").update({ password_hash: previousCredentialHash }).eq("user_id", userId);
        else await service.from("partner_initial_credentials").delete().eq("user_id", userId);
      }
      return json({ error: "Le compte a été remis dans son état précédent : Supabase Auth a refusé la mise à jour." }, 500);
    }

    return json({ ok: true, action: "updated", user_id: userId, login_name: profile.login_name, initial_password: initialPassword, must_change_password: resetPassword });
  }

  return json({ error: "Action inconnue." }, 400);
});
